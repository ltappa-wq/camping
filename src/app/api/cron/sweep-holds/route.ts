import { prisma } from "@/lib/prisma";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

/**
 * Vercel Cron sweeper. Two duties:
 *   1. Cancel Reservations whose HELD lock has expired so the underlying
 *      Site frees up for other guests.
 *   2. Mark stale ReservationModifications (PENDING_PAYMENT for > 30 min)
 *      as ABANDONED. The original Reservation is unchanged — guest just
 *      walked away from the upcharge Checkout. The modification's Stripe
 *      Checkout session has its own 30-minute expiry, but the
 *      checkout.session.expired webhook isn't strictly guaranteed; this
 *      sweeper is the floor.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`. Anything else rejected.
 *
 * Idempotent by design: a sweep that finds nothing returns
 * { swept: { holds: 0, modifications: 0 } }.
 *
 * Configured in vercel.json with `*\/5 * * * *` (every 5 minutes). Vercel
 * Cron only runs on the Production environment, not preview deploys.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET not set; refusing to run sweeper");
    return new Response("Cron secret not configured", { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const modificationCutoff = new Date(now.getTime() - THIRTY_MINUTES_MS);

  const [holds, modifications] = await Promise.all([
    prisma.reservation.updateMany({
      where: {
        status: "HELD",
        heldUntil: { lt: now },
      },
      data: {
        status: "CANCELLED",
        cancellationReason: "Hold expired",
        cancelledAt: now,
        heldUntil: null,
      },
    }),
    prisma.reservationModification.updateMany({
      where: {
        status: "PENDING_PAYMENT",
        createdAt: { lt: modificationCutoff },
      },
      data: {
        status: "ABANDONED",
        abandonedAt: now,
      },
    }),
  ]);

  return Response.json({
    swept: {
      holds: holds.count,
      modifications: modifications.count,
    },
  });
}
