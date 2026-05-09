"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
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
import { dispatchEmail } from "@/lib/email-dispatch";
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
  | { ok: true; refundCents: number }
  | { ok: false; error: string }
  | { ok: false; needsUpcharge: true; upchargeCents: number };

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
    // Step 6 wires up Stripe Checkout for this branch. For now signal
    // the UI cleanly so it can show "Coming soon" and the operator can
    // handle upcharges manually if the guest contacts them.
    return {
      ok: false,
      needsUpcharge: true,
      upchargeCents: diff.upchargeCents,
    };
  }

  let refundCents = 0;
  if (diff.kind === "refund") {
    const policy =
      parsePolicy(reservation.cancelPolicySnapshot) ?? {
        cancelFullRefundDays: property.cancelFullRefundDays,
        cancelPartialRefundDays: property.cancelPartialRefundDays,
        cancelPartialRefundPct: property.cancelPartialRefundPct,
      };
    const result = computeModificationRefund({
      oldCheckIn: reservation.checkIn,
      oldCheckOut: reservation.checkOut,
      oldTotalCents: reservation.totalCents,
      newCheckIn,
      newCheckOut,
      newTotalCents: quote.totalCents,
      cancellationDate: todayMidnightUtc(),
      policy,
      retainPlatformFee: true,
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
  const guestContent = renderModificationGuest({
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
    propertyContact,
  });
  const operatorRecipient =
    property.email ?? property.organization.operatorUsers[0]?.email ?? null;
  const operatorContent = renderModificationOperator({
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
  return { ok: true, refundCents };
}

// ---- Modification email rendering ----

function fmtCents(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderModificationGuest(v: {
  guestName: string;
  propertyName: string;
  confirmationCode: string;
  oldSiteLabel: string;
  oldCheckIn: string;
  oldCheckOut: string;
  oldNights: number;
  oldTotalCents: number;
  newSiteLabel: string;
  newCheckIn: string;
  newCheckOut: string;
  newNights: number;
  newTotalCents: number;
  refundCents: number;
  propertyContact: string;
}): { subject: string; bodyText: string; bodyHtml: string } {
  const refundLine =
    v.refundCents > 0
      ? `A refund of ${fmtCents(v.refundCents)} is on its way back to your card. Refunds typically take 5–10 business days.`
      : "No refund applies for this change.";

  const bodyText = `Hi ${v.guestName},

Your booking at ${v.propertyName} has been updated.

  Confirmation: ${v.confirmationCode}

  Was:  Site ${v.oldSiteLabel} · ${v.oldCheckIn} → ${v.oldCheckOut} · ${v.oldNights} night${v.oldNights === 1 ? "" : "s"} · ${fmtCents(v.oldTotalCents)}
  Now:  Site ${v.newSiteLabel} · ${v.newCheckIn} → ${v.newCheckOut} · ${v.newNights} night${v.newNights === 1 ? "" : "s"} · ${fmtCents(v.newTotalCents)}

${refundLine}

If you didn't make this change or have questions, reply to this email${
    v.propertyContact ? ` or reach the property:\n\n${v.propertyContact}` : "."
  }

— ${v.propertyName}`;

  const bodyHtml = `<p>Hi ${escapeHtml(v.guestName)},</p>
<p>Your booking at <strong>${escapeHtml(v.propertyName)}</strong> has been updated.</p>
<p><strong>Confirmation:</strong> ${escapeHtml(v.confirmationCode)}</p>
<table cellpadding="4" style="border-collapse:collapse">
<tr><td style="color:#666">Was</td><td>Site ${escapeHtml(v.oldSiteLabel)} · ${escapeHtml(v.oldCheckIn)} → ${escapeHtml(v.oldCheckOut)} · ${v.oldNights}n · ${fmtCents(v.oldTotalCents)}</td></tr>
<tr><td style="color:#666">Now</td><td>Site ${escapeHtml(v.newSiteLabel)} · ${escapeHtml(v.newCheckIn)} → ${escapeHtml(v.newCheckOut)} · ${v.newNights}n · ${fmtCents(v.newTotalCents)}</td></tr>
</table>
<p>${escapeHtml(refundLine)}</p>
<p>— ${escapeHtml(v.propertyName)}</p>`;

  return {
    subject: `Booking updated: ${v.propertyName} — ${v.confirmationCode}`,
    bodyHtml,
    bodyText,
  };
}

function renderModificationOperator(v: {
  propertyName: string;
  confirmationCode: string;
  guestName: string;
  guestEmail: string;
  oldSiteLabel: string;
  oldCheckIn: string;
  oldCheckOut: string;
  oldTotalCents: number;
  newSiteLabel: string;
  newCheckIn: string;
  newCheckOut: string;
  newTotalCents: number;
  refundCents: number;
  upchargeCents: number;
  appUrl: string;
  reservationId: string;
}): { subject: string; bodyText: string; bodyHtml: string } {
  const moneyLine =
    v.refundCents > 0
      ? `Refund issued: ${fmtCents(v.refundCents)} (per cancellation policy applied per removed night)`
      : v.upchargeCents > 0
        ? `Upcharge collected: ${fmtCents(v.upchargeCents)}`
        : "No money changed hands.";

  const bodyText = `Guest modification at ${v.propertyName}.

  Confirmation: ${v.confirmationCode}
  Guest: ${v.guestName} (${v.guestEmail})

  Was:  Site ${v.oldSiteLabel} · ${v.oldCheckIn} → ${v.oldCheckOut} · ${fmtCents(v.oldTotalCents)}
  Now:  Site ${v.newSiteLabel} · ${v.newCheckIn} → ${v.newCheckOut} · ${fmtCents(v.newTotalCents)}

${moneyLine}

View: ${v.appUrl}/admin/reservations/${v.reservationId}`;

  const bodyHtml = `<pre style="font-family: ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; margin: 0;">${escapeHtml(bodyText)}</pre>`;

  return {
    subject: `Guest modified: ${v.guestName} — ${v.confirmationCode}`,
    bodyHtml,
    bodyText,
  };
}
