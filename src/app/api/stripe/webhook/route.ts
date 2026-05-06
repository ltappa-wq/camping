import { headers } from "next/headers";
import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  formatTotalForEmail,
  renderEmail,
  sendEmail,
} from "@/lib/email";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET not set; cannot verify webhook");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error(`Stripe webhook signature verification failed: ${message}`);
    return new Response(`Webhook signature verification failed: ${message}`, {
      status: 400,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckoutCompleted(event.data.object);
        break;
      }
      case "checkout.session.expired": {
        await handleCheckoutExpired(event.data.object);
        break;
      }
      default:
        // Other events are acked but not acted on for now.
        break;
    }
  } catch (e) {
    console.error(`Stripe webhook handler error for ${event.type}:`, e);
    // Return 500 so Stripe retries.
    return new Response("Handler error", { status: 500 });
  }

  return Response.json({ received: true });
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const reservationId = session.metadata?.reservationId;
  if (!reservationId) {
    console.warn(
      `checkout.session.completed (${session.id}) missing metadata.reservationId`,
    );
    return;
  }

  if (session.payment_status !== "paid") {
    // Some Checkout sessions complete without payment (e.g. setup mode).
    // For Camping v1 we only care about paid sessions.
    return;
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      property: true,
      site: { include: { siteType: true } },
      guest: true,
    },
  });
  if (!reservation) {
    console.warn(
      `checkout.session.completed: reservation ${reservationId} not found`,
    );
    return;
  }

  // Idempotency — re-deliveries shouldn't double-confirm or double-email.
  const alreadyConfirmed = reservation.status === "CONFIRMED";

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  await prisma.$transaction(async (tx) => {
    if (!alreadyConfirmed) {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          paidCents: session.amount_total ?? reservation.totalCents,
          heldUntil: null,
        },
      });
    }

    if (paymentIntentId) {
      // Upsert keyed on the unique stripePaymentIntentId — no duplicate Payment row.
      await tx.payment.upsert({
        where: { stripePaymentIntentId: paymentIntentId },
        update: {
          status: "SUCCEEDED",
          amountCents: session.amount_total ?? 0,
        },
        create: {
          reservationId: reservation.id,
          stripePaymentIntentId: paymentIntentId,
          stripeConnectedAccountId:
            (session.metadata?.stripeAccountId as string | undefined) ??
            reservation.property.organizationId,
          amountCents: session.amount_total ?? 0,
          applicationFeeCents:
            Number(session.metadata?.applicationFeeCents ?? 0) || 0,
          currency: (session.currency ?? "usd").toUpperCase(),
          status: "SUCCEEDED",
        },
      });
    }
  });

  if (alreadyConfirmed) return;

  // Confirmation email — operator override beats system default.
  const override = await prisma.emailTemplate.findUnique({
    where: {
      propertyId_type: {
        propertyId: reservation.propertyId,
        type: "RESERVATION_CONFIRMATION",
      },
    },
  });

  const content = renderEmail(
    "RESERVATION_CONFIRMATION",
    {
      guestName: reservation.guest.name,
      confirmationCode: reservation.confirmationCode,
      propertyName: reservation.property.name,
      siteLabel: reservation.site.label,
      siteTypeName: reservation.site.siteType.name,
      checkInDate: reservation.checkIn.toISOString().slice(0, 10),
      checkOutDate: reservation.checkOut.toISOString().slice(0, 10),
      checkInTime: reservation.property.checkInTime,
      checkOutTime: reservation.property.checkOutTime,
      nights: Math.round(
        (reservation.checkOut.getTime() - reservation.checkIn.getTime()) /
          86_400_000,
      ),
      totalCents: reservation.totalCents,
      totalFormatted: formatTotalForEmail(reservation.totalCents),
    },
    override && override.active ? override : null,
  );

  const log = await prisma.emailLog.create({
    data: {
      propertyId: reservation.propertyId,
      reservationId: reservation.id,
      type: "RESERVATION_CONFIRMATION",
      toEmail: reservation.guest.email,
      subject: content.subject,
      status: "QUEUED",
    },
  });

  const send = await sendEmail({
    to: reservation.guest.email,
    subject: content.subject,
    bodyHtml: content.bodyHtml,
    bodyText: content.bodyText,
  });

  await prisma.emailLog.update({
    where: { id: log.id },
    data: send.ok
      ? {
          status: "SENT",
          providerMessageId: send.messageId,
          sentAt: new Date(),
        }
      : {
          status: "FAILED",
          errorMessage: send.error,
        },
  });
}

async function handleCheckoutExpired(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const reservationId = session.metadata?.reservationId;
  if (!reservationId) return;

  // Free up the site if the HELD lock is still active.
  await prisma.reservation.updateMany({
    where: { id: reservationId, status: "HELD" },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: "Checkout session expired",
      heldUntil: null,
    },
  });
}
