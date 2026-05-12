"use server";

import { revalidatePath } from "next/cache";

import { logIfImpersonating } from "@/lib/audit";
import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { prisma } from "@/lib/prisma";
import {
  buildGuestPortalSection,
  formatTotalForEmail,
  renderCancellationEmail,
  renderEmail,
} from "@/lib/email";
import { dispatchEmail } from "@/lib/email-dispatch";
import { loadEmailTemplateOverride } from "@/lib/email-templates/load";
import { issueGuestProfileClaimLink } from "@/lib/guest-magic-link";
import { getStripe } from "@/lib/stripe";
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
import type { StayType } from "@prisma/client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type GuestInfoInput = {
  reservationId: string;
  name: string;
  email: string;
  phone: string;
  rvMake: string;
  rvModel: string;
  rvYear: string; // empty | digits
  rvLengthFt: string;
  licensePlate: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Update the Guest row that this reservation points to. Property-scoped:
 * we never let an operator edit a guest belonging to another property.
 *
 * Email is the unique key together with propertyId, so changing it can
 * collide with another guest at the same property — surface that cleanly
 * rather than letting the DB constraint bubble up as a 500.
 */
export async function updateGuestInfoAction(
  input: GuestInfoInput,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (!name) return { ok: false, error: "Name is required." };
  if (!EMAIL_RE.test(email))
    return { ok: false, error: "Enter a valid email." };

  const reservation = await prisma.reservation.findFirst({
    where: { id: input.reservationId, propertyId: ctx.propertyId },
    select: { guestId: true, guest: { select: { email: true } } },
  });
  if (!reservation)
    return { ok: false, error: "Reservation not found." };

  // Email collision check — only matters if the operator actually changed it.
  if (email !== reservation.guest.email) {
    const conflict = await prisma.guest.findUnique({
      where: {
        propertyId_email: { propertyId: ctx.propertyId, email },
      },
      select: { id: true },
    });
    if (conflict && conflict.id !== reservation.guestId) {
      return {
        ok: false,
        error:
          "Another guest at this property already has that email. Pick a different email.",
      };
    }
  }

  const rvYear = input.rvYear.trim();
  const rvLengthFt = input.rvLengthFt.trim();

  await prisma.guest.update({
    where: { id: reservation.guestId },
    data: {
      name,
      email,
      phone: phone || null,
      rvMake: input.rvMake.trim() || null,
      rvModel: input.rvModel.trim() || null,
      rvYear: rvYear ? Number.parseInt(rvYear, 10) || null : null,
      rvLengthFt: rvLengthFt ? Number.parseInt(rvLengthFt, 10) || null : null,
      licensePlate: input.licensePlate.trim() || null,
    },
  });

  await logIfImpersonating({
    action: "reservation.update",
    description: `Updated guest info on reservation ${input.reservationId}`,
    propertyId: ctx.propertyId,
    payload: { reservationId: input.reservationId, kind: "guest_info" },
  });

  revalidatePath(`/admin/reservations/${input.reservationId}`);
  return { ok: true };
}

/**
 * Operator-only Guest.notes — distinct from Reservation.guestNotes (which is
 * what the guest typed at booking time and is read-only on this page).
 */
export async function updateOperatorNotesAction(
  reservationId: string,
  notes: string,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const reservation = await prisma.reservation.findFirst({
    where: { id: reservationId, propertyId: ctx.propertyId },
    select: { guestId: true },
  });
  if (!reservation)
    return { ok: false, error: "Reservation not found." };

  await prisma.guest.update({
    where: { id: reservation.guestId },
    data: { notes: notes.trim() || null },
  });

  await logIfImpersonating({
    action: "reservation.update",
    description: `Updated operator notes on reservation ${reservationId}`,
    propertyId: ctx.propertyId,
    payload: { reservationId, kind: "operator_notes" },
  });

  revalidatePath(`/admin/reservations/${reservationId}`);
  return { ok: true };
}

/**
 * Re-send the guest's RESERVATION_CONFIRMATION email. Useful when guest
 * claims they didn't receive it. Always logs to EmailLog so the operator
 * can see what fired.
 *
 * Only allowed for reservations that have actually confirmed; resending
 * for a HELD or CANCELLED reservation makes no sense.
 */
export async function resendConfirmationAction(
  reservationId: string,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();

  const reservation = await prisma.reservation.findFirst({
    where: { id: reservationId, propertyId: ctx.propertyId },
    include: {
      property: true,
      site: { include: { siteType: true } },
      guest: {
        select: { email: true, name: true, profileClaimedAt: true },
      },
    },
  });
  if (!reservation) return { ok: false, error: "Reservation not found." };
  if (
    reservation.status !== "CONFIRMED" &&
    reservation.status !== "CHECKED_IN" &&
    reservation.status !== "CHECKED_OUT"
  ) {
    return {
      ok: false,
      error: `Can only resend confirmations for confirmed reservations (current status: ${reservation.status}).`,
    };
  }

  const checkInDate = reservation.checkIn.toISOString().slice(0, 10);
  const checkOutDate = reservation.checkOut.toISOString().slice(0, 10);
  const nights = Math.round(
    (reservation.checkOut.getTime() - reservation.checkIn.getTime()) /
      86_400_000,
  );

  const override = await loadEmailTemplateOverride(
    reservation.propertyId,
    "RESERVATION_CONFIRMATION",
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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

  const content = renderEmail(
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

  const send = await dispatchEmail({
    propertyId: reservation.propertyId,
    reservationId: reservation.id,
    type: "RESERVATION_CONFIRMATION",
    to: reservation.guest.email,
    content,
  });

  await logIfImpersonating({
    action: "reservation.resend_confirmation",
    description: `Resent confirmation for ${reservation.confirmationCode}`,
    propertyId: ctx.propertyId,
    payload: { reservationId, sendOk: send.ok },
  });

  revalidatePath(`/admin/reservations/${reservationId}`);

  if (!send.ok) {
    return {
      ok: false,
      error: `Email send failed: ${send.error}. The attempt is logged.`,
    };
  }
  return { ok: true };
}

export type CancelReservationInput = {
  reservationId: string;
  /** Refund amount in cents. 0 means cancel without refunding. */
  refundCents: number;
  /** Required free-text reason; goes to Reservation.cancellationReason. */
  reason: string;
  /** When true, send a cancellation email to the guest. */
  notifyGuest: boolean;
};

/**
 * Cancel a reservation, optionally refunding via Stripe. The Stripe call
 * happens outside the DB transaction (it's a network call to a third
 * party; can't be rolled back). Order is:
 *   1. Pre-flight validation
 *   2. Stripe refund (if any) — if this fails, the reservation is NOT
 *      cancelled. Operator sees the Stripe error and can retry.
 *   3. DB transaction: flip status, update Payment, update refundedCents
 *   4. Email dispatch (best-effort, logged to EmailLog)
 *
 * The Stripe refund uses reverse_transfer:true to pull funds back from
 * the operator's connected account, and refund_application_fee:false
 * to keep the platform's already-collected fee on the Stripe side.
 * That's independent of whether the GUEST'S refund is reduced by the
 * fee (computeRefund's retainPlatformFee parameter, which the modal
 * preview sets based on Organization.customerPaysPlatformFee).
 */
export async function cancelReservationAction(
  input: CancelReservationInput,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();

  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Reason is required." };

  const refundCents = Math.max(0, Math.floor(input.refundCents));

  const reservation = await prisma.reservation.findFirst({
    where: { id: input.reservationId, propertyId: ctx.propertyId },
    include: {
      property: true,
      site: { include: { siteType: true } },
      guest: true,
      payments: true,
    },
  });
  if (!reservation) return { ok: false, error: "Reservation not found." };

  if (
    reservation.status === "CANCELLED" ||
    reservation.status === "DRAFT"
  ) {
    return {
      ok: false,
      error: `Reservation is already ${reservation.status.toLowerCase()}; nothing to cancel.`,
    };
  }

  const remainingRefundable =
    reservation.paidCents - reservation.refundedCents;
  if (refundCents > remainingRefundable) {
    return {
      ok: false,
      error: `Refund amount exceeds remaining refundable (${remainingRefundable} cents).`,
    };
  }

  const stripePayment = reservation.payments.find(
    (p) =>
      p.paymentMethod === "STRIPE" &&
      p.stripePaymentIntentId &&
      p.status === "SUCCEEDED",
  );

  if (refundCents > 0 && !stripePayment) {
    return {
      ok: false,
      error:
        "No successful Stripe payment to refund. Cancel without a refund and return any cash/check payments directly.",
    };
  }

  // Fire the Stripe refund first; if it errors we don't want to mark the
  // reservation cancelled with a phantom refund.
  let stripeRefundId: string | null = null;
  if (refundCents > 0 && stripePayment?.stripePaymentIntentId) {
    try {
      const refund = await getStripe().refunds.create({
        payment_intent: stripePayment.stripePaymentIntentId,
        amount: refundCents,
        reverse_transfer: true,
        refund_application_fee: false,
        metadata: {
          reservationId: reservation.id,
          // Empty string when a platform admin is impersonating — the
          // PlatformAdminAction audit row carries that identity.
          operatorId: ctx.operator?.id ?? "",
        },
      });
      stripeRefundId = refund.id;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown Stripe error";
      return {
        ok: false,
        error: `Stripe refund failed: ${message}. Reservation was NOT cancelled.`,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: reason,
        refundedCents: { increment: refundCents },
        heldUntil: null,
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
          notes: stripeRefundId
            ? appendNote(stripePayment.notes, `Refund ${stripeRefundId}`)
            : stripePayment.notes,
        },
      });
    }
  });

  if (input.notifyGuest) {
    const propertyContact = [
      reservation.property.email
        ? `Email: ${reservation.property.email}`
        : null,
      reservation.property.phone
        ? `Phone: ${reservation.property.phone}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const cancelOverride = await loadEmailTemplateOverride(
      reservation.propertyId,
      "CANCELLATION",
    );
    const content = renderCancellationEmail(
      {
        guestName: reservation.guest.name,
        confirmationCode: reservation.confirmationCode,
        propertyName: reservation.property.name,
        siteLabel: reservation.site.label,
        siteTypeName: reservation.site.siteType.name,
        checkInDate: reservation.checkIn.toISOString().slice(0, 10),
        checkOutDate: reservation.checkOut.toISOString().slice(0, 10),
        refundCents,
        propertyContact,
        reason,
      },
      cancelOverride,
    );

    await dispatchEmail({
      propertyId: reservation.propertyId,
      reservationId: reservation.id,
      type: "CANCELLATION",
      to: reservation.guest.email,
      content,
    });
  }

  await logIfImpersonating({
    action:
      refundCents > 0 ? "reservation.refund" : "reservation.cancel",
    description:
      refundCents > 0
        ? `Cancelled ${reservation.confirmationCode} with ${formatCentsBare(refundCents)} refund`
        : `Cancelled ${reservation.confirmationCode}`,
    propertyId: ctx.propertyId,
    payload: {
      reservationId: reservation.id,
      confirmationCode: reservation.confirmationCode,
      refundCents,
      reason,
      stripeRefundId,
    },
  });

  revalidatePath(`/admin/reservations/${reservation.id}`);
  revalidatePath("/admin/reservations");

  return { ok: true };
}

function appendNote(prev: string | null, addition: string): string {
  if (!prev) return addition;
  return `${prev}\n${addition}`;
}

/** Tiny inline cents-to-USD formatter for audit descriptions; avoids
 *  pulling formatCents through the action layer just for display. */
function formatCentsBare(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type EditReservationInput = {
  reservationId: string;
  siteId: string;
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
};

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
  return "STAY"; // BASE and MODIFIER both roll up into STAY
}

/**
 * Move a reservation to a different site, different dates, or both. Re-quotes
 * with the engine and replaces the line items atomically in a transaction.
 *
 * Decision: cancelPolicySnapshot is intentionally NOT updated. Per the
 * spec, the policy in effect at booking time applies for the life of the
 * reservation — even if the operator's current Property cancellation
 * settings have changed since.
 *
 * Add-on quantities are preserved as-is (re-priced if their priceCents
 * changed, but the count operator selected at booking sticks). Manual
 * overrides (DISCOUNT lines, MANUAL_OVERRIDE STAY lines) from the
 * original booking are NOT preserved — the recompute starts from a clean
 * engine quote. If an operator wants to re-apply a discount after moving
 * dates, they cancel + create a new booking instead. We document this
 * behavior; an explicit "preserve manual adjustments" UX is a future
 * phase.
 *
 * Status guard: CONFIRMED, CHECKED_IN, CHECKED_OUT only. HELD bookings
 * shouldn't be edited because they're mid-payment-flow, and CANCELLED is
 * read-only.
 */
export async function editReservationAction(
  input: EditReservationInput,
): Promise<ActionResult & { newTotalCents?: number }> {
  const ctx = await requireOperatorPropertyOrSetup();

  if (!DATE_RE.test(input.from) || !DATE_RE.test(input.to)) {
    return { ok: false, error: "Invalid dates." };
  }
  const checkIn = new Date(`${input.from}T00:00:00.000Z`);
  const checkOut = new Date(`${input.to}T00:00:00.000Z`);
  if (checkIn >= checkOut) {
    return { ok: false, error: "Check-out must be after check-in." };
  }

  const reservation = await prisma.reservation.findFirst({
    where: { id: input.reservationId, propertyId: ctx.propertyId },
    include: { lineItems: true },
  });
  if (!reservation) return { ok: false, error: "Reservation not found." };

  if (
    reservation.status !== "CONFIRMED" &&
    reservation.status !== "CHECKED_IN" &&
    reservation.status !== "CHECKED_OUT"
  ) {
    return {
      ok: false,
      error: `Cannot edit a ${reservation.status.toLowerCase().replace("_", "-")} reservation.`,
    };
  }

  // Resolve the new site (must belong to property, active, not soft-deleted).
  const site = await ctx.prisma.site.findFirst({
    where: { id: input.siteId, deletedAt: null, active: true },
    include: { siteType: true },
  });
  if (!site || site.siteType.deletedAt != null) {
    return { ok: false, error: "Site not found or inactive." };
  }

  const sameSite = site.id === reservation.siteId;
  const sameDates =
    reservation.checkIn.getTime() === checkIn.getTime() &&
    reservation.checkOut.getTime() === checkOut.getTime();
  if (sameSite && sameDates) {
    return { ok: false, error: "Nothing changed." };
  }

  // Preserve add-on selections from the original booking. Quantity is per
  // line item (we wrote them as quantity:1 always; aggregate by addonId).
  const existingAddonQty = new Map<string, number>();
  for (const li of reservation.lineItems) {
    if (li.type === "ADDON" && li.addonId) {
      existingAddonQty.set(
        li.addonId,
        (existingAddonQty.get(li.addonId) ?? 0) + li.quantity,
      );
    }
  }

  const property = ctx.property;
  const now = new Date();

  const [ratePlans, modifiers, taxRates, addons, blockingReservations, closedRanges] =
    await Promise.all([
      ctx.prisma.ratePlan.findMany({}),
      ctx.prisma.rateModifier.findMany({}),
      ctx.prisma.taxRate.findMany({}),
      ctx.prisma.addon.findMany({ where: { active: true } }),
      // Exclude the current reservation from the blocking-list — it's the
      // one we're about to modify, so its old [checkIn, checkOut) shouldn't
      // count as a self-conflict.
      ctx.prisma.reservation.findMany({
        where: {
          id: { not: reservation.id },
          siteId: site.id,
          checkIn: { lt: checkOut },
          checkOut: { gt: checkIn },
          OR: [
            { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } },
            { AND: [{ status: "HELD" }, { heldUntil: { gt: now } }] },
          ],
        },
        select: { checkIn: true, checkOut: true },
      }),
      ctx.prisma.closedDateRange.findMany({
        where: {
          startDate: { lte: checkOut },
          endDate: { gte: checkIn },
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
    checkIn,
    checkOut,
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

  // Re-quote.
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
    quantity: existingAddonQty.get(a.id) ?? 0,
  }));

  let quote;
  try {
    quote = computeQuote({
      checkIn,
      checkOut,
      siteTypeId: site.siteTypeId,
      ratePlans: ratePlanInputs,
      modifiers: modifierInputs,
      taxRates: taxRateInputs,
      addons: addonInputs,
    });
  } catch (e) {
    if (e instanceof PricingError) return { ok: false, error: e.message };
    throw e;
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
          siteId: site.id,
          checkIn,
          checkOut,
          stayType,
          subtotalCents,
          taxCents: quote.taxCents,
          totalCents: quote.totalCents,
          // Decision: cancelPolicySnapshot intentionally preserved. The
          // policy in effect at booking time applies for the life of the
          // reservation per Phase 4 spec.
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
    });
  } catch (err) {
    // The Postgres exclusion constraint catches races: another booking on
    // the same site overlapping these dates was created between our
    // availability check and this update. Surface a clean message rather
    // than the raw constraint name.
    const message = err instanceof Error ? err.message : "Update failed.";
    if (
      message.includes("exclusion") ||
      message.includes("conflicting") ||
      message.includes("constraint")
    ) {
      return {
        ok: false,
        error:
          "Site was booked by another reservation between your search and your save. Pick a different site or dates.",
      };
    }
    throw err;
  }

  await logIfImpersonating({
    action: "reservation.update",
    description: `Edited reservation ${reservation.confirmationCode}`,
    propertyId: ctx.propertyId,
    payload: {
      reservationId: reservation.id,
      newSiteId: input.siteId,
      newCheckIn: input.from,
      newCheckOut: input.to,
      newTotalCents: quote.totalCents,
      kind: "edit",
    },
  });

  revalidatePath(`/admin/reservations/${reservation.id}`);
  revalidatePath("/admin/reservations");

  return { ok: true, newTotalCents: quote.totalCents };
}
