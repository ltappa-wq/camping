import { prisma } from "@/lib/prisma";

/**
 * Vercel Cron sweeper. Cancels Reservations whose HELD lock has expired so
 * the underlying Site frees up for other guests. Vercel Cron sends
 * `Authorization: Bearer ${CRON_SECRET}` — anything else is rejected.
 *
 * Idempotent by design: a sweep that finds nothing returns { swept: 0 }.
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

  const result = await prisma.reservation.updateMany({
    where: {
      status: "HELD",
      heldUntil: { lt: new Date() },
    },
    data: {
      status: "CANCELLED",
      cancellationReason: "Hold expired",
      cancelledAt: new Date(),
      heldUntil: null,
    },
  });

  return Response.json({ swept: result.count });
}
