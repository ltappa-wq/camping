import { headers } from "next/headers";
import type Stripe from "stripe";
import type { Guest } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  buildGuestPortalSection,
  formatTotalForEmail,
  renderEmail,
  renderOperatorBookingNotification,
} from "@/lib/email";
import { dispatchEmail } from "@/lib/email-dispatch";
import { issueGuestProfileClaimLink } from "@/lib/guest-magic-link";

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
      case "account.updated": {
        await handleAccountUpdated(event.data.object);
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

  const checkInDate = reservation.checkIn.toISOString().slice(0, 10);
  const checkOutDate = reservation.checkOut.toISOString().slice(0, 10);
  const nights = Math.round(
    (reservation.checkOut.getTime() - reservation.checkIn.getTime()) /
      86_400_000,
  );

  // Guest confirmation — operator template override beats system default.
  const override = await prisma.emailTemplate.findUnique({
    where: {
      propertyId_type: {
        propertyId: reservation.propertyId,
        type: "RESERVATION_CONFIRMATION",
      },
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Phase 5: portal section. If the guest hasn't claimed their profile
  // yet, mint a fresh 30-day claim token and link them straight to the
  // claim flow. If they have, link to the bare detail page; the portal
  // sign-in flow handles re-auth if their browser session expired.
  const claimLink = reservation.guest.profileClaimedAt
    ? null
    : await issueGuestProfileClaimLink({
        propertyId: reservation.propertyId,
        email: reservation.guest.email,
      });
  const portalSection = buildGuestPortalSection({
    appUrl,
    slug: reservation.property.slug,
    code: reservation.confirmationCode,
    alreadyClaimed: reservation.guest.profileClaimedAt !== null,
    claimToken: claimLink?.token,
  });

  const guestContent = renderEmail(
    "RESERVATION_CONFIRMATION",
    {
      guestName: reservation.guest.name,
      confirmationCode: reservation.confirmationCode,
      propertyName: reservation.property.name,
      siteLabel: reservation.site.label,
      siteTypeName: reservation.site.siteType.name,
      checkInDate,
      checkOutDate,
      checkInTime: reservation.property.checkInTime,
      checkOutTime: reservation.property.checkOutTime,
      nights,
      totalCents: reservation.totalCents,
      totalFormatted: formatTotalForEmail(reservation.totalCents),
      manageUrl: `${appUrl}/p/${reservation.property.slug}/booking/${reservation.confirmationCode}`,
      portalSectionText: portalSection.text,
      portalSectionHtml: portalSection.html,
    },
    override && override.active ? override : null,
  );

  // Operator notification — internal alert; no template override hook.
  const operatorRecipient = await resolveOperatorEmail(
    reservation.property.email,
    reservation.property.organizationId,
  );

  const applicationFeeCents =
    Number(session.metadata?.applicationFeeCents ?? 0) || 0;
  const operatorContent = renderOperatorBookingNotification({
    propertyName: reservation.property.name,
    confirmationCode: reservation.confirmationCode,
    guestName: reservation.guest.name,
    guestEmail: reservation.guest.email,
    guestPhone: reservation.guest.phone,
    rvInfo: formatRvInfo(reservation.guest),
    guestNotes: reservation.guestNotes,
    siteLabel: reservation.site.label,
    siteTypeName: reservation.site.siteType.name,
    checkInDate,
    checkOutDate,
    nights,
    totalCents: reservation.totalCents,
    payoutCents: Math.max(0, reservation.totalCents - applicationFeeCents),
    adminUrl: `${appUrl}/admin/reservations/${reservation.id}`,
  });

  // Both sends are best-effort; we log per-email and never block webhook ack
  // on Resend availability. allSettled keeps one failure from suppressing
  // the other.
  const dispatches: Promise<unknown>[] = [
    dispatchEmail({
      propertyId: reservation.propertyId,
      reservationId: reservation.id,
      type: "RESERVATION_CONFIRMATION",
      to: reservation.guest.email,
      content: guestContent,
    }),
  ];
  if (operatorRecipient) {
    dispatches.push(
      dispatchEmail({
        propertyId: reservation.propertyId,
        reservationId: reservation.id,
        type: "OPERATOR_BOOKING_NOTIFICATION",
        to: operatorRecipient,
        content: operatorContent,
      }),
    );
  } else {
    console.warn(
      `No operator recipient for property ${reservation.propertyId}; skipping operator notification`,
    );
  }
  await Promise.allSettled(dispatches);
}

async function resolveOperatorEmail(
  propertyEmail: string | null,
  organizationId: string,
): Promise<string | null> {
  if (propertyEmail) return propertyEmail;
  const owner = await prisma.operatorUser.findFirst({
    where: { organizationId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return owner?.email ?? null;
}

function formatRvInfo(g: Guest): string | null {
  const head = [g.rvYear ? String(g.rvYear) : null, g.rvMake, g.rvModel]
    .filter((s): s is string => Boolean(s))
    .join(" ");
  const tail: string[] = [];
  if (g.rvLengthFt) tail.push(`${g.rvLengthFt} ft`);
  if (g.licensePlate) tail.push(`plate ${g.licensePlate}`);
  const result = [head, tail.join(", ")].filter((s) => s.length > 0).join(", ");
  return result.length > 0 ? result : null;
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

async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  // Look up by Connect account id; the same Stripe webhook endpoint receives
  // events for all connected accounts on the platform.
  const org = await prisma.organization.findUnique({
    where: { stripeAccountId: account.id },
    select: { id: true },
  });
  if (!org) {
    // Account wasn't created by us, or row was deleted. Ack and move on.
    return;
  }

  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      stripeChargesEnabled: chargesEnabled,
      stripePayoutsEnabled: payoutsEnabled,
      stripeOnboardingComplete:
        chargesEnabled && payoutsEnabled && detailsSubmitted,
    },
  });
}
