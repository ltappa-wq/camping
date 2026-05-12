import { headers } from "next/headers";
import type Stripe from "stripe";
import type { Guest, StayType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  buildGuestPortalSection,
  formatTotalForEmail,
  renderEmail,
  renderModificationGuestEmail,
  renderModificationOperatorEmail,
  renderOperatorBookingNotification,
} from "@/lib/email";
import { dispatchEmail } from "@/lib/email-dispatch";
import { loadEmailTemplateOverride } from "@/lib/email-templates/load";
import { extractStripeCustomerId } from "@/lib/stripe-customer";
import { issueGuestProfileClaimLink } from "@/lib/guest-magic-link";
import {
  checkAvailability,
  type SeasonWindow,
} from "@/lib/availability";
import {
  computeQuote,
  PricingError,
  type AddonInput,
  type ChargeUnit,
  type LineItem,
  type ModifierApplies,
  type ModifierInput,
  type ModifierType,
  type RatePlanInput,
  type StayLine,
  type TaxAppliesTo,
  type TaxRateInput,
} from "@/lib/pricing";

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
  // Modification upcharges go through the same Checkout webhook as
  // initial bookings; the metadata.type tag tells them apart.
  if (session.metadata?.type === "modification") {
    await handleModificationCompleted(session);
    return;
  }

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

  // Pluck the Stripe Customer Stripe created for this session (set when
  // we passed customer_creation: "always" or customer:). Capture it onto
  // Guest.stripeCustomerId so future checkouts can pre-attach saved
  // cards via the Customer Portal flow.
  const stripeCustomerId = extractStripeCustomerId({
    customer: session.customer,
  });

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

    // Only set on the first capture — leave existing values alone so we
    // don't churn the ID if Stripe ever returns a different value on
    // re-delivery.
    if (stripeCustomerId && !reservation.guest.stripeCustomerId) {
      await tx.guest.update({
        where: { id: reservation.guestId },
        data: { stripeCustomerId },
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
  const override = await loadEmailTemplateOverride(
    reservation.propertyId,
    "RESERVATION_CONFIRMATION",
  );

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
    override,
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

  // Modification checkouts that expire: flip the ReservationModification
  // to ABANDONED so the sweeper isn't double-handling. The original
  // reservation is unchanged.
  if (session.metadata?.type === "modification") {
    const modificationId = session.metadata.modificationId;
    if (!modificationId) return;
    await prisma.reservationModification.updateMany({
      where: { id: modificationId, status: "PENDING_PAYMENT" },
      data: { status: "ABANDONED", abandonedAt: new Date() },
    });
    return;
  }

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

/**
 * Apply a modification once the guest has paid the upcharge. Looks up
 * the persisted ReservationModification row, re-checks availability
 * (since time may have passed and another booking could have grabbed
 * the new site), recomputes the quote with current fixtures, and
 * commits the changes atomically.
 *
 * Idempotent: COMPLETED → no-op. ABANDONED → no-op (sweeper already
 * cleaned up). Anything else proceeds.
 *
 * Race handling: if the new site is no longer available between
 * modification creation and webhook arrival, we automatically refund
 * the upcharge (reverse_transfer + refund_application_fee:false), mark
 * the modification ABANDONED, and email the guest. The original
 * reservation stays put.
 */
async function handleModificationCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const modificationId = session.metadata?.modificationId;
  if (!modificationId) {
    console.warn(
      `modification webhook (${session.id}) missing metadata.modificationId`,
    );
    return;
  }

  if (session.payment_status !== "paid") return;

  const modification = await prisma.reservationModification.findUnique({
    where: { id: modificationId },
    include: {
      reservation: {
        include: {
          property: {
            include: {
              organization: {
                select: {
                  stripeAccountId: true,
                  platformFeeFlatCents: true,
                  operatorUsers: {
                    where: { role: "OWNER" },
                    orderBy: { createdAt: "asc" },
                    take: 1,
                    select: { email: true },
                  },
                },
              },
            },
          },
          site: { select: { label: true } },
          guest: true,
        },
      },
    },
  });
  if (!modification) {
    console.warn(`Modification ${modificationId} not found in DB`);
    return;
  }

  // Idempotency.
  if (
    modification.status === "COMPLETED" ||
    modification.status === "ABANDONED"
  ) {
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Resolve the new site (defensive — was validated at creation but the
  // operator could have soft-deleted it since).
  const newSite = await prisma.site.findFirst({
    where: { id: modification.nextSiteId, deletedAt: null, active: true },
    include: { siteType: true },
  });

  const reservation = modification.reservation;
  const property = reservation.property;

  if (!newSite || newSite.siteType.deletedAt != null) {
    await refundAndAbandon({
      modification,
      paymentIntentId,
      reservation,
      property,
      reason: "site no longer available",
    });
    return;
  }

  // Re-check availability for the new dates on the new site, excluding
  // the reservation we're modifying (it's currently sitting on its old
  // slot, not the new one — but we exclude defensively).
  const now = new Date();
  const [ratePlans, modifiers, taxRates, addons, blockingReservations, closedRanges] =
    await Promise.all([
      prisma.ratePlan.findMany({ where: { propertyId: property.id } }),
      prisma.rateModifier.findMany({ where: { propertyId: property.id } }),
      prisma.taxRate.findMany({ where: { propertyId: property.id } }),
      prisma.addon.findMany({ where: { propertyId: property.id, active: true } }),
      prisma.reservation.findMany({
        where: {
          id: { not: reservation.id },
          siteId: newSite.id,
          checkIn: { lt: modification.nextCheckOut },
          checkOut: { gt: modification.nextCheckIn },
          OR: [
            { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } },
            { AND: [{ status: "HELD" }, { heldUntil: { gt: now } }] },
          ],
        },
        select: { checkIn: true, checkOut: true },
      }),
      prisma.closedDateRange.findMany({
        where: {
          propertyId: property.id,
          startDate: { lte: modification.nextCheckOut },
          endDate: { gte: modification.nextCheckIn },
        },
        select: { startDate: true, endDate: true },
      }),
    ]);

  const season: SeasonWindow | null =
    property.seasonStartMonth != null &&
    property.seasonStartDay != null &&
    property.seasonEndMonth != null &&
    property.seasonEndDay != null
      ? {
          startMonth: property.seasonStartMonth,
          startDay: property.seasonStartDay,
          endMonth: property.seasonEndMonth,
          endDay: property.seasonEndDay,
        }
      : null;

  const avail = checkAvailability({
    checkIn: modification.nextCheckIn,
    checkOut: modification.nextCheckOut,
    reservations: blockingReservations,
    closedRanges,
    season,
  });
  if (!avail.available) {
    await refundAndAbandon({
      modification,
      paymentIntentId,
      reservation,
      property,
      reason:
        avail.reasons[0] ??
        "Site is no longer available for those dates.",
    });
    return;
  }

  // Aggregate existing add-on quantities so the recompute prices what
  // the guest already had.
  const addonQty = new Map<string, number>();
  const oldLineItems = await prisma.reservationLineItem.findMany({
    where: { reservationId: reservation.id },
  });
  for (const li of oldLineItems) {
    if (li.type === "ADDON" && li.addonId) {
      addonQty.set(li.addonId, (addonQty.get(li.addonId) ?? 0) + li.quantity);
    }
  }

  let quote;
  try {
    quote = computeQuote({
      checkIn: modification.nextCheckIn,
      checkOut: modification.nextCheckOut,
      siteTypeId: newSite.siteTypeId,
      ratePlans: ratePlans.map((p) => ({
        id: p.id,
        name: p.name,
        siteTypeId: p.siteTypeId,
        chargeUnit: p.chargeUnit as ChargeUnit,
        pricePerUnitCents: p.pricePerUnitCents,
        minStayDays: p.minStayDays,
        maxStayDays: p.maxStayDays,
        effectiveFrom: p.effectiveFrom,
        effectiveTo: p.effectiveTo,
        priority: p.priority,
        active: p.active,
      })) as RatePlanInput[],
      modifiers: modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        siteTypeId: m.siteTypeId,
        modifierType: m.modifierType as ModifierType,
        modifierValue: m.modifierValue,
        appliesTo: m.appliesTo as ModifierApplies,
        daysOfWeek: m.daysOfWeek,
        startDate: m.startDate,
        endDate: m.endDate,
        priority: m.priority,
        active: m.active,
      })) as ModifierInput[],
      taxRates: taxRates.map((t) => ({
        id: t.id,
        name: t.name,
        basisPoints: t.basisPoints,
        appliesTo: t.appliesTo as TaxAppliesTo,
        active: t.active,
      })) as TaxRateInput[],
      addons: addons.map((a) => ({
        id: a.id,
        name: a.name,
        priceCents: a.priceCents,
        quantity: addonQty.get(a.id) ?? 0,
      })) as AddonInput[],
    });
  } catch (err) {
    if (err instanceof PricingError) {
      await refundAndAbandon({
        modification,
        paymentIntentId,
        reservation,
        property,
        reason: `cannot price the new dates: ${err.message}`,
      });
      return;
    }
    throw err;
  }

  const subtotalCents =
    quote.baseCents + quote.modifierTotalCents + quote.addonsCents;
  const stayType = deriveStayType(quote.stayLines);

  // Apply the modification atomically. Stripe Connect amounts: the
  // upcharge already cleared on the platform account; we record it as
  // a fresh Payment row tied to this reservation.
  const upchargeAmount = session.amount_total ?? modification.upchargeCents;
  const applicationFeeCents =
    Number(session.metadata?.applicationFeeCents ?? 0) || 0;
  const stripeAccountId =
    (session.metadata?.stripeAccountId as string | undefined) ??
    property.organization.stripeAccountId ??
    null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.reservationLineItem.deleteMany({
        where: { reservationId: reservation.id },
      });
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          siteId: newSite.id,
          checkIn: modification.nextCheckIn,
          checkOut: modification.nextCheckOut,
          stayType,
          subtotalCents,
          taxCents: quote.taxCents,
          totalCents: quote.totalCents,
          paidCents: { increment: upchargeAmount },
          modificationCount: { increment: 1 },
          // cancelPolicySnapshot intentionally preserved.
          lineItems: {
            create: quote.lineItems.map((li) => ({
              type: lineItemTypeFor(li.kind),
              description: li.description,
              quantity: 1,
              unitPriceCents: li.amountCents,
              amountCents: li.amountCents,
              ratePlanId: li.ratePlanId ?? null,
              addonId: li.addonId ?? null,
              taxRateId: li.taxRateId ?? null,
            })),
          },
        },
      });

      if (paymentIntentId) {
        await tx.payment.upsert({
          where: { stripePaymentIntentId: paymentIntentId },
          update: {
            status: "SUCCEEDED",
            amountCents: upchargeAmount,
          },
          create: {
            reservationId: reservation.id,
            paymentMethod: "STRIPE",
            stripePaymentIntentId: paymentIntentId,
            stripeConnectedAccountId: stripeAccountId,
            amountCents: upchargeAmount,
            applicationFeeCents,
            currency: (session.currency ?? "usd").toUpperCase(),
            status: "SUCCEEDED",
            notes: `Modification upcharge for ${reservation.confirmationCode}`,
          },
        });
      }

      await tx.reservationModification.update({
        where: { id: modification.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          stripePaymentIntentId: paymentIntentId,
        },
      });
    });
  } catch (err) {
    // Exclusion-constraint race despite our pre-check (extremely
    // unlikely, but possible). Refund and abandon.
    const message = err instanceof Error ? err.message : "Update failed";
    if (
      message.includes("exclusion") ||
      message.includes("conflicting") ||
      message.includes("constraint")
    ) {
      await refundAndAbandon({
        modification,
        paymentIntentId,
        reservation,
        property,
        reason: "site grabbed by another booking concurrently",
      });
      return;
    }
    throw err;
  }

  // ---- Success emails ----
  const oldNights = Math.round(
    (reservation.checkOut.getTime() - reservation.checkIn.getTime()) /
      86_400_000,
  );
  const newNights = Math.round(
    (modification.nextCheckOut.getTime() -
      modification.nextCheckIn.getTime()) /
      86_400_000,
  );
  const propertyContact = [
    property.email ? `Email: ${property.email}` : null,
    property.phone ? `Phone: ${property.phone}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const modGuestOverride = await loadEmailTemplateOverride(
    reservation.propertyId,
    "MODIFICATION_GUEST",
  );
  const guestContent = renderModificationGuestEmail(
    {
      guestName: reservation.guest.name,
      propertyName: property.name,
      confirmationCode: reservation.confirmationCode,
      oldSiteLabel: reservation.site.label,
      oldCheckIn: reservation.checkIn.toISOString().slice(0, 10),
      oldCheckOut: reservation.checkOut.toISOString().slice(0, 10),
      oldNights,
      oldTotalCents: modification.prevTotalCents,
      newSiteLabel: newSite.label,
      newCheckIn: modification.nextCheckIn.toISOString().slice(0, 10),
      newCheckOut: modification.nextCheckOut.toISOString().slice(0, 10),
      newNights,
      newTotalCents: quote.totalCents,
      refundCents: 0,
      upchargeCents: upchargeAmount,
      propertyContact,
    },
    modGuestOverride,
  );
  const operatorRecipient =
    property.email ?? property.organization.operatorUsers[0]?.email ?? null;
  const operatorContent = renderModificationOperatorEmail({
    propertyName: property.name,
    confirmationCode: reservation.confirmationCode,
    guestName: reservation.guest.name,
    guestEmail: reservation.guest.email,
    oldSiteLabel: reservation.site.label,
    oldCheckIn: reservation.checkIn.toISOString().slice(0, 10),
    oldCheckOut: reservation.checkOut.toISOString().slice(0, 10),
    oldTotalCents: modification.prevTotalCents,
    newSiteLabel: newSite.label,
    newCheckIn: modification.nextCheckIn.toISOString().slice(0, 10),
    newCheckOut: modification.nextCheckOut.toISOString().slice(0, 10),
    newTotalCents: quote.totalCents,
    refundCents: 0,
    upchargeCents: upchargeAmount,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    reservationId: reservation.id,
  });

  const dispatches: Promise<unknown>[] = [
    dispatchEmail({
      propertyId: reservation.propertyId,
      reservationId: reservation.id,
      type: "MODIFICATION_GUEST",
      to: reservation.guest.email,
      content: guestContent,
    }),
  ];
  if (operatorRecipient) {
    dispatches.push(
      dispatchEmail({
        propertyId: reservation.propertyId,
        reservationId: reservation.id,
        type: "MODIFICATION_OPERATOR",
        to: operatorRecipient,
        content: operatorContent,
      }),
    );
  }
  await Promise.allSettled(dispatches);
}

/** Issue a Stripe refund for the upcharge, mark the modification
 *  ABANDONED, and email the guest with an explanation. */
async function refundAndAbandon(args: {
  modification: { id: string; upchargeCents: number };
  paymentIntentId: string | null;
  reservation: {
    id: string;
    confirmationCode: string;
    propertyId: string;
    guest: { name: string; email: string };
  };
  property: {
    name: string;
    email: string | null;
    phone: string | null;
    organization: { operatorUsers: { email: string }[] };
  };
  reason: string;
}): Promise<void> {
  console.warn(
    `Modification ${args.modification.id} can't be applied: ${args.reason}`,
  );

  let refundOk = false;
  if (args.paymentIntentId) {
    try {
      await getStripe().refunds.create({
        payment_intent: args.paymentIntentId,
        reverse_transfer: true,
        refund_application_fee: false,
        metadata: {
          reservationId: args.reservation.id,
          source: "modification-rollback",
        },
      });
      refundOk = true;
    } catch (err) {
      console.error(
        `Refund failed for modification ${args.modification.id}; operator must resolve manually:`,
        err,
      );
    }
  }

  await prisma.reservationModification.update({
    where: { id: args.modification.id },
    data: {
      status: "ABANDONED",
      abandonedAt: new Date(),
    },
  });

  // Guest email — what happened, refund status if applicable.
  const refundLine = refundOk
    ? "Your payment for this change has been refunded. Refunds typically take 5–10 business days to appear on your statement."
    : "We were unable to automatically refund your payment. The property will reach out to you directly to resolve.";
  const guestContent = {
    subject: `Booking change couldn't be completed — ${args.reservation.confirmationCode}`,
    bodyText: `Hi ${args.reservation.guest.name},

We weren't able to apply the change you requested for booking ${args.reservation.confirmationCode} at ${args.property.name}.

Reason: ${args.reason}

${refundLine} Your original booking is unchanged.

If you'd still like to make a change, please reply to this email or contact the property directly${
      args.property.email ? ` at ${args.property.email}` : ""
    }${args.property.phone ? ` or ${args.property.phone}` : ""}.

— ${args.property.name}`,
    bodyHtml: `<p>Hi ${args.reservation.guest.name},</p>
<p>We weren't able to apply the change you requested for booking <strong>${args.reservation.confirmationCode}</strong> at ${args.property.name}.</p>
<p><em>Reason:</em> ${args.reason}</p>
<p>${refundLine} Your original booking is unchanged.</p>
<p>If you'd still like to make a change, please reply to this email or contact the property directly.</p>
<p>— ${args.property.name}</p>`,
  };

  // Operator email — they need to know a guest tried to upgrade and
  // the system couldn't accommodate it. Especially important when the
  // refund failed — manual intervention required.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const operatorRecipient =
    args.property.email ??
    args.property.organization.operatorUsers[0]?.email ??
    null;
  const operatorBody = `Heads up: a guest's self-service modification couldn't be applied.

  Reservation: ${args.reservation.confirmationCode}
  Guest: ${args.reservation.guest.name} (${args.reservation.guest.email})
  Reason: ${args.reason}

${
  refundOk
    ? "The upcharge has been refunded automatically (reverse_transfer; the platform fee on the upcharge stays with the platform). No further action needed unless the guest reaches out."
    : "The automatic refund FAILED. The guest's upcharge needs to be refunded manually via the Stripe dashboard or by contacting Stripe support. The guest has been informed that the property will reach out."
}

The original booking is unchanged.

View: ${appUrl}/admin/reservations/${args.reservation.id}`;
  const operatorContent = {
    subject: `Guest modification rolled back: ${args.reservation.guest.name} — ${args.reservation.confirmationCode}${refundOk ? "" : " (REFUND FAILED)"}`,
    bodyText: operatorBody,
    bodyHtml: `<pre style="font-family: ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; margin: 0;">${operatorBody.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`,
  };

  const dispatches: Promise<unknown>[] = [
    dispatchEmail({
      propertyId: args.reservation.propertyId,
      reservationId: args.reservation.id,
      type: "MODIFICATION_GUEST",
      to: args.reservation.guest.email,
      content: guestContent,
    }),
  ];
  if (operatorRecipient) {
    dispatches.push(
      dispatchEmail({
        propertyId: args.reservation.propertyId,
        reservationId: args.reservation.id,
        type: "MODIFICATION_OPERATOR",
        to: operatorRecipient,
        content: operatorContent,
      }),
    );
  }
  await Promise.allSettled(dispatches);
}

function deriveStayType(stayLines: ReadonlyArray<StayLine>): StayType {
  const units = new Set(stayLines.map((l) => l.chargeUnit));
  if (units.has("SEASON")) return "SEASONAL";
  if (units.has("MONTH")) return "MONTHLY";
  if (units.has("WEEK")) return "WEEKLY";
  return "NIGHTLY";
}

function lineItemTypeFor(
  kind: LineItem["kind"],
): "STAY" | "ADDON" | "TAX" {
  if (kind === "ADDON") return "ADDON";
  if (kind === "TAX") return "TAX";
  return "STAY"; // BASE + MODIFIER roll into STAY
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
