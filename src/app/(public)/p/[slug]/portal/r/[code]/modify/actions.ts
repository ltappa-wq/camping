"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { customerArgsForCheckout } from "@/lib/stripe-customer";
import { requireGuestSession } from "@/lib/guest-auth";
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
import {
  checkModificationCutoff,
  classifyModificationDiff,
  computeModificationRefund,
  type ModificationPolicy,
} from "@/lib/booking-modification";
import {
  renderModificationGuestEmail,
  renderModificationOperatorEmail,
} from "@/lib/email";
import { dispatchEmail } from "@/lib/email-dispatch";
import { loadEmailTemplateOverride } from "@/lib/email-templates/load";
import type { StayType } from "@prisma/client";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ONE_DAY_MS = 86_400_000;

export type ApplyModificationInput = {
  slug: string;
  code: string;
  /** YYYY-MM-DD. */
  newCheckIn: string;
  newCheckOut: string;
  /** New site id. */
  newSiteId: string;
};

export type ApplyModificationResult =
  | { ok: true; kind: "applied"; refundCents: number }
  | { ok: true; kind: "checkout"; redirectUrl: string; upchargeCents: number }
  | { ok: false; error: string };

function parsePolicy(json: unknown): ModificationPolicy | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (
    typeof o.cancelFullRefundDays !== "number" ||
    typeof o.cancelPartialRefundDays !== "number" ||
    typeof o.cancelPartialRefundPct !== "number"
  ) {
    return null;
  }
  return o as ModificationPolicy;
}

function todayMidnightUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
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

/**
 * Apply a guest-initiated modification when the price either equals
 * or decreases. Upcharge path returns a structured "needsUpcharge"
 * marker so the UI can route to Stripe Checkout (built in step 6).
 *
 * Decision: refund proration follows computeModificationRefund's per-
 * night policy application — see booking-modification.ts. This stays
 * consistent with cancellations: each removed night gets the policy
 * tier that matches its days-from-today, not the booking's checkIn.
 *
 * Decision: cancelPolicySnapshot stays untouched. The original
 * booking's policy applies for the life of the reservation, even
 * after a modification. Same rule as Phase 4's operator edit.
 *
 * Decision: manual line items (DISCOUNT, override-style STAY) do
 * NOT survive the recompute — same as Phase 4 step 6's operator edit.
 * Documented inline.
 */
export async function applyModificationAction(
  input: ApplyModificationInput,
): Promise<ApplyModificationResult> {
  const session = await requireGuestSession(input.slug);

  if (!DATE_RE.test(input.newCheckIn) || !DATE_RE.test(input.newCheckOut)) {
    return { ok: false, error: "Invalid dates." };
  }
  const newCheckIn = new Date(`${input.newCheckIn}T00:00:00.000Z`);
  const newCheckOut = new Date(`${input.newCheckOut}T00:00:00.000Z`);
  if (newCheckIn >= newCheckOut) {
    return { ok: false, error: "Check-out must be after check-in." };
  }

  const reservation = await prisma.reservation.findFirst({
    where: {
      confirmationCode: input.code,
      guestId: session.guestId,
      propertyId: session.propertyId,
    },
    include: {
      lineItems: true,
      payments: true,
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
      site: { include: { siteType: true } },
      guest: true,
    },
  });
  if (!reservation) return { ok: false, error: "Reservation not found." };
  const { property, payments, guest } = reservation;

  if (reservation.status !== "CONFIRMED") {
    return {
      ok: false,
      error: `This reservation is ${reservation.status.toLowerCase().replace("_", "-")}; modifications aren't available.`,
    };
  }

  const cutoff = checkModificationCutoff({
    guestModificationCutoffHours: property.guestModificationCutoffHours,
    checkInAt: reservation.checkIn,
  });
  if (!cutoff.allowed) {
    return { ok: false, error: cutoff.reason };
  }

  // Resolve the new site (must exist on this property, active).
  const newSite = await prisma.site.findFirst({
    where: {
      id: input.newSiteId,
      propertyId: property.id,
      deletedAt: null,
      active: true,
    },
    include: { siteType: true },
  });
  if (!newSite || newSite.siteType.deletedAt != null) {
    return { ok: false, error: "Site not found or inactive." };
  }

  const sameSite = newSite.id === reservation.siteId;
  const sameDates =
    newCheckIn.getTime() === reservation.checkIn.getTime() &&
    newCheckOut.getTime() === reservation.checkOut.getTime();
  if (sameSite && sameDates) {
    return { ok: false, error: "Nothing changed." };
  }

  // Existing add-on quantities preserved across the recompute.
  const addonQty = new Map<string, number>();
  for (const li of reservation.lineItems) {
    if (li.type === "ADDON" && li.addonId) {
      addonQty.set(li.addonId, (addonQty.get(li.addonId) ?? 0) + li.quantity);
    }
  }

  const now = new Date();

  const [ratePlans, modifiers, taxRates, addons, blockingReservations, closedRanges] =
    await Promise.all([
      prisma.ratePlan.findMany({ where: { propertyId: property.id } }),
      prisma.rateModifier.findMany({ where: { propertyId: property.id } }),
      prisma.taxRate.findMany({ where: { propertyId: property.id } }),
      prisma.addon.findMany({
        where: { propertyId: property.id, active: true },
      }),
      // Exclude this reservation from conflict detection — a stay can't
      // self-conflict with its old slot.
      prisma.reservation.findMany({
        where: {
          id: { not: reservation.id },
          siteId: newSite.id,
          checkIn: { lt: newCheckOut },
          checkOut: { gt: newCheckIn },
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
          startDate: { lte: newCheckOut },
          endDate: { gte: newCheckIn },
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
    checkIn: newCheckIn,
    checkOut: newCheckOut,
    reservations: blockingReservations,
    closedRanges,
    season,
  });
  if (!avail.available) {
    return {
      ok: false,
      error: avail.reasons[0] ?? "Site is not available for those dates.",
    };
  }

  const ratePlanInputs: RatePlanInput[] = ratePlans.map((p) => ({
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
  }));
  const modifierInputs: ModifierInput[] = modifiers.map((m) => ({
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
  }));
  const taxRateInputs: TaxRateInput[] = taxRates.map((t) => ({
    id: t.id,
    name: t.name,
    basisPoints: t.basisPoints,
    appliesTo: t.appliesTo as TaxAppliesTo,
    active: t.active,
  }));
  const addonInputs: AddonInput[] = addons.map((a) => ({
    id: a.id,
    name: a.name,
    priceCents: a.priceCents,
    quantity: addonQty.get(a.id) ?? 0,
  }));

  let quote;
  try {
    quote = computeQuote({
      checkIn: newCheckIn,
      checkOut: newCheckOut,
      siteTypeId: newSite.siteTypeId,
      ratePlans: ratePlanInputs,
      modifiers: modifierInputs,
      taxRates: taxRateInputs,
      addons: addonInputs,
    });
  } catch (e) {
    if (e instanceof PricingError) {
      return {
        ok: false,
        error: `${e.message} Please contact the property if you'd like help.`,
      };
    }
    throw e;
  }

  const currentRemainingPaid = reservation.paidCents - reservation.refundedCents;
  const diff = classifyModificationDiff({
    currentPaidCents: currentRemainingPaid,
    newTotalCents: quote.totalCents,
  });

  if (diff.kind === "upcharge") {
    return upchargePathway({
      reservation,
      property,
      newSite,
      newCheckIn,
      newCheckOut,
      newCheckInIso: input.newCheckIn,
      newCheckOutIso: input.newCheckOut,
      upchargeCents: diff.upchargeCents,
      newQuoteTotalCents: quote.totalCents,
      slug: input.slug,
      code: input.code,
      guestEmail: guest.email,
      guestStripeCustomerId: guest.stripeCustomerId,
      siteLabel: newSite.label,
      reservationCheckIn: reservation.checkIn,
      reservationCheckOut: reservation.checkOut,
      reservationTotalCents: reservation.totalCents,
    });
  }

  let refundCents = 0;
  if (diff.kind === "refund") {
    const policy =
      parsePolicy(reservation.cancelPolicySnapshot) ?? {
        cancelFullRefundDays: property.cancelFullRefundDays,
        cancelPartialRefundDays: property.cancelPartialRefundDays,
        cancelPartialRefundPct: property.cancelPartialRefundPct,
      };
    // Decision: retainPlatformFee is FALSE for modifications. The
    // platform already collected its flat fee from the original
    // booking transaction; charging another $3 to shorten a stay
    // would effectively make guests pay a second platform fee for
    // one booking. The operator keeps the remaining nights' revenue;
    // no second transaction to fee. Cancellations still retain
    // because the booking is fully gone — different semantics.
    const result = computeModificationRefund({
      oldCheckIn: reservation.checkIn,
      oldCheckOut: reservation.checkOut,
      oldTotalCents: reservation.totalCents,
      newCheckIn,
      newCheckOut,
      newTotalCents: quote.totalCents,
      cancellationDate: todayMidnightUtc(),
      policy,
      retainPlatformFee: false,
      platformFeeCents: property.organization.platformFeeFlatCents,
      paidCents: reservation.paidCents,
      alreadyRefundedCents: reservation.refundedCents,
    });
    refundCents = result.refundCents;
  }

  const stripePayment = payments.find(
    (p) =>
      p.paymentMethod === "STRIPE" &&
      p.stripePaymentIntentId &&
      p.status === "SUCCEEDED",
  );

  // Refund > 0 with no Stripe payment → punt to operator. Same rule as
  // guest cancel from step 4.
  if (refundCents > 0 && !stripePayment) {
    return {
      ok: false,
      error:
        "A refund would be owed but the booking wasn't paid via card. Please contact the property to make this change.",
    };
  }

  // Fire Stripe refund first if needed; if it fails, the reservation
  // stays unchanged.
  if (refundCents > 0 && stripePayment?.stripePaymentIntentId) {
    try {
      await getStripe().refunds.create({
        payment_intent: stripePayment.stripePaymentIntentId,
        amount: refundCents,
        reverse_transfer: true,
        refund_application_fee: false,
        metadata: {
          reservationId: reservation.id,
          source: "guest-portal-modification",
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown Stripe error";
      return {
        ok: false,
        error: `Refund failed: ${message}. Please try again or contact the property.`,
      };
    }
  }

  const subtotalCents =
    quote.baseCents + quote.modifierTotalCents + quote.addonsCents;
  const stayType = deriveStayType(quote.stayLines);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.reservationLineItem.deleteMany({
        where: { reservationId: reservation.id },
      });
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          siteId: newSite.id,
          checkIn: newCheckIn,
          checkOut: newCheckOut,
          stayType,
          subtotalCents,
          taxCents: quote.taxCents,
          totalCents: quote.totalCents,
          modificationCount: { increment: 1 },
          refundedCents: { increment: refundCents },
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

      if (refundCents > 0 && stripePayment) {
        const newRefunded = stripePayment.refundedAmountCents + refundCents;
        const fullyRefunded = newRefunded >= stripePayment.amountCents;
        await tx.payment.update({
          where: { id: stripePayment.id },
          data: {
            refundedAmountCents: newRefunded,
            status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
          },
        });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    if (
      message.includes("exclusion") ||
      message.includes("conflicting") ||
      message.includes("constraint")
    ) {
      return {
        ok: false,
        error:
          "Site was booked by another reservation between your search and your save. Pick different dates or another site.",
      };
    }
    throw err;
  }

  // ---- Emails (best-effort) ----
  const propertyContact = [
    property.email ? `Email: ${property.email}` : null,
    property.phone ? `Phone: ${property.phone}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const oldNights = Math.round(
    (reservation.checkOut.getTime() - reservation.checkIn.getTime()) /
      ONE_DAY_MS,
  );
  const newNights = Math.round(
    (newCheckOut.getTime() - newCheckIn.getTime()) / ONE_DAY_MS,
  );
  const modGuestOverride = await loadEmailTemplateOverride(
    reservation.propertyId,
    "MODIFICATION_GUEST",
  );
  const guestContent = renderModificationGuestEmail(
    {
      guestName: guest.name,
      propertyName: property.name,
      confirmationCode: reservation.confirmationCode,
      oldSiteLabel: reservation.site.label,
      oldCheckIn: reservation.checkIn.toISOString().slice(0, 10),
      oldCheckOut: reservation.checkOut.toISOString().slice(0, 10),
      oldNights,
      oldTotalCents: reservation.totalCents,
      newSiteLabel: newSite.label,
      newCheckIn: input.newCheckIn,
      newCheckOut: input.newCheckOut,
      newNights,
      newTotalCents: quote.totalCents,
      refundCents,
      upchargeCents: 0,
      propertyContact,
    },
    modGuestOverride,
  );
  const operatorRecipient =
    property.email ?? property.organization.operatorUsers[0]?.email ?? null;
  const operatorContent = renderModificationOperatorEmail({
    propertyName: property.name,
    confirmationCode: reservation.confirmationCode,
    guestName: guest.name,
    guestEmail: guest.email,
    oldSiteLabel: reservation.site.label,
    oldCheckIn: reservation.checkIn.toISOString().slice(0, 10),
    oldCheckOut: reservation.checkOut.toISOString().slice(0, 10),
    oldTotalCents: reservation.totalCents,
    newSiteLabel: newSite.label,
    newCheckIn: input.newCheckIn,
    newCheckOut: input.newCheckOut,
    newTotalCents: quote.totalCents,
    refundCents,
    upchargeCents: 0,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    reservationId: reservation.id,
  });

  const dispatches: Promise<unknown>[] = [
    dispatchEmail({
      propertyId: reservation.propertyId,
      reservationId: reservation.id,
      type: "MODIFICATION_GUEST",
      to: guest.email,
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

  revalidatePath(`/p/${input.slug}/portal`);
  revalidatePath(`/p/${input.slug}/portal/r/${input.code}`);
  return { ok: true, kind: "applied", refundCents };
}

/**
 * Upcharge branch — guest needs to pay the difference. We:
 *   1. Persist a ReservationModification row in PENDING_PAYMENT state
 *      with a snapshot of prev + next.
 *   2. Create a Stripe Checkout session for just the upcharge amount,
 *      tagged with metadata.type='modification' so the webhook routes
 *      it correctly.
 *   3. Return the Checkout URL; the form redirects the browser.
 *
 * The original Reservation is NOT modified yet — the webhook flips
 * everything on payment success. If the guest abandons, the sweeper
 * cron marks the modification ABANDONED after 30 minutes.
 *
 * Race window: between modification creation and webhook, another
 * booking could grab the new site. The webhook re-checks availability
 * and refunds gracefully if so. Documented edge case for v1.
 *
 * Decision: platform fee on the upcharge mirrors initial bookings —
 * platformFeeFlatCents capped at the upcharge amount. No customer-
 * pays-fee gross-up on the upcharge for v1; the operator absorbs
 * the modification fee. The customer-pays-fee logic on the booking
 * itself is preserved (the original total already includes it).
 */
async function upchargePathway(args: {
  reservation: { id: string; siteId: string };
  property: {
    id: string;
    slug: string;
    name: string;
    currency: string;
    organization: {
      stripeAccountId: string | null;
      platformFeeFlatCents: number;
    };
  };
  newSite: { id: string; label: string };
  newCheckIn: Date;
  newCheckOut: Date;
  newCheckInIso: string;
  newCheckOutIso: string;
  upchargeCents: number;
  newQuoteTotalCents: number;
  slug: string;
  code: string;
  guestEmail: string;
  guestStripeCustomerId: string | null;
  siteLabel: string;
  reservationCheckIn: Date;
  reservationCheckOut: Date;
  reservationTotalCents: number;
}): Promise<ApplyModificationResult> {
  const orgStripeAccount = args.property.organization.stripeAccountId;
  if (!orgStripeAccount) {
    return {
      ok: false,
      error:
        "This property isn't set up to accept online payments for upgrades. Please contact the property to make this change.",
    };
  }

  const platformFeeCents = Math.min(
    Math.max(0, args.property.organization.platformFeeFlatCents),
    args.upchargeCents,
  );

  const modification = await prisma.reservationModification.create({
    data: {
      reservationId: args.reservation.id,
      prevSiteId: args.reservation.siteId,
      prevCheckIn: args.reservationCheckIn,
      prevCheckOut: args.reservationCheckOut,
      prevTotalCents: args.reservationTotalCents,
      nextSiteId: args.newSite.id,
      nextCheckIn: args.newCheckIn,
      nextCheckOut: args.newCheckOut,
      nextTotalCents: args.newQuoteTotalCents,
      upchargeCents: args.upchargeCents,
      refundCents: 0,
      status: "PENDING_PAYMENT",
    },
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const currency = (args.property.currency ?? "USD").toLowerCase();

  let session;
  try {
    session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `Booking change — ${args.property.name}`,
              description: `${args.code}: Site ${args.siteLabel} · ${args.newCheckInIso} → ${args.newCheckOutIso}`,
            },
            unit_amount: args.upchargeCents,
          },
          quantity: 1,
        },
      ],
      // Phase 6b: pre-attach saved card for returning guests, mirroring
      // the booking checkout. By Phase 5 the guest is signed in via the
      // portal, so they generally already have a stripeCustomerId from
      // their original booking.
      ...customerArgsForCheckout({
        email: args.guestEmail,
        stripeCustomerId: args.guestStripeCustomerId,
      }),
      payment_intent_data: {
        application_fee_amount:
          platformFeeCents > 0 ? platformFeeCents : undefined,
        transfer_data: { destination: orgStripeAccount },
        metadata: {
          type: "modification",
          modificationId: modification.id,
          reservationId: args.reservation.id,
        },
      },
      metadata: {
        type: "modification",
        modificationId: modification.id,
        reservationId: args.reservation.id,
        propertyId: args.property.id,
        slug: args.slug,
        stripeAccountId: orgStripeAccount,
        applicationFeeCents: String(platformFeeCents),
      },
      success_url: `${baseUrl}/p/${args.slug}/portal/r/${args.code}?modified=1`,
      cancel_url: `${baseUrl}/p/${args.slug}/portal/r/${args.code}/modify`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min
    });
  } catch (err) {
    // If Stripe rejects (e.g., connected account in trouble), don't leave
    // a phantom PENDING_PAYMENT row — flip it ABANDONED so the sweeper
    // doesn't double-handle it.
    await prisma.reservationModification.update({
      where: { id: modification.id },
      data: { status: "ABANDONED", abandonedAt: new Date() },
    });
    const message = err instanceof Error ? err.message : "Stripe error";
    return {
      ok: false,
      error: `Could not start checkout: ${message}. Please try again or contact the property.`,
    };
  }

  if (!session.url) {
    await prisma.reservationModification.update({
      where: { id: modification.id },
      data: { status: "ABANDONED", abandonedAt: new Date() },
    });
    return {
      ok: false,
      error: "Stripe did not return a checkout URL. Please try again.",
    };
  }

  await prisma.reservationModification.update({
    where: { id: modification.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  return {
    ok: true,
    kind: "checkout",
    redirectUrl: session.url,
    upchargeCents: args.upchargeCents,
  };
}

