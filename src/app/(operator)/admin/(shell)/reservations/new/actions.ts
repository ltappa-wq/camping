"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { prisma } from "@/lib/prisma";
import { formatTotalForEmail, renderEmail } from "@/lib/email";
import { dispatchEmail } from "@/lib/email-dispatch";
import {
  type ManualOverride,
  type ManualPayment,
  buildManualReservationPayload,
} from "@/lib/manual-reservation";
import {
  checkAvailability,
  type SeasonWindow,
} from "@/lib/availability";
import {
  PricingError,
  type AddonInput,
  type ChargeUnit,
  type ModifierApplies,
  type ModifierInput,
  type ModifierType,
  type RatePlanInput,
  type TaxAppliesTo,
  type TaxRateInput,
} from "@/lib/pricing";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CreateManualReservationInput = {
  from: string;
  to: string;
  siteId: string;
  guest: {
    name: string;
    email: string;
    phone: string;
    rvMake: string;
    rvModel: string;
    rvYear: string;
    rvLengthFt: string;
    licensePlate: string;
    notes: string;
  };
  addonQuantities: Record<string, number>;
  override: ManualOverride;
  payment: ManualPayment;
  notifyGuest: boolean;
};

export type CreateManualReservationResult =
  | { ok: true; reservationId: string }
  | { ok: false; error: string };

function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function generateConfirmationCode(slug: string): string {
  const code = randomBytes(6)
    .toString("base64")
    .replace(/[+/=]/g, "")
    .toUpperCase();
  const prefix = slug.slice(0, 2).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  return `${prefix}-${code.slice(0, 6)}`;
}

export async function createManualReservationAction(
  input: CreateManualReservationInput,
): Promise<CreateManualReservationResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const property = ctx.property;

  // ---- Shape validation ----
  const name = input.guest.name.trim();
  const email = input.guest.email.trim().toLowerCase();
  if (!name) return { ok: false, error: "Guest name is required." };
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid guest email." };
  }
  if (!DATE_RE.test(input.from) || !DATE_RE.test(input.to)) {
    return { ok: false, error: "Invalid dates." };
  }
  const checkIn = parseDateOnly(input.from);
  const checkOut = parseDateOnly(input.to);
  if (checkIn >= checkOut) {
    return { ok: false, error: "Check-out must be after check-in." };
  }

  // ---- Site + availability ----
  const site = await ctx.prisma.site.findFirst({
    where: { id: input.siteId, deletedAt: null, active: true },
    include: { siteType: true },
  });
  if (!site || site.siteType.deletedAt != null) {
    return { ok: false, error: "Site not found or inactive." };
  }

  const now = new Date();
  const [ratePlans, modifiers, taxRates, addons, reservations, closedRanges] =
    await Promise.all([
      ctx.prisma.ratePlan.findMany({}),
      ctx.prisma.rateModifier.findMany({}),
      ctx.prisma.taxRate.findMany({}),
      ctx.prisma.addon.findMany({ where: { active: true } }),
      ctx.prisma.reservation.findMany({
        where: {
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
    reservations,
    closedRanges,
    season,
  });
  if (!avail.available) {
    return {
      ok: false,
      error: avail.reasons[0] ?? "Site is not available for those dates.",
    };
  }

  // ---- Quote / payload build ----
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
    quantity: Math.max(0, Math.floor(input.addonQuantities[a.id] ?? 0)),
  }));

  let payload;
  try {
    payload = buildManualReservationPayload({
      checkIn,
      checkOut,
      siteTypeId: site.siteTypeId,
      ratePlans: ratePlanInputs,
      modifiers: modifierInputs,
      taxRates: taxRateInputs,
      addons: addonInputs,
      override: input.override,
      payment: input.payment,
    });
  } catch (e) {
    if (e instanceof PricingError) return { ok: false, error: e.message };
    throw e;
  }

  // ---- Find or create Guest (property-scoped) ----
  const phone = input.guest.phone.trim();
  const rvYear = input.guest.rvYear.trim();
  const rvLengthFt = input.guest.rvLengthFt.trim();
  const guestData = {
    name,
    phone: phone || null,
    rvMake: input.guest.rvMake.trim() || null,
    rvModel: input.guest.rvModel.trim() || null,
    rvYear: rvYear ? Number.parseInt(rvYear, 10) || null : null,
    rvLengthFt: rvLengthFt ? Number.parseInt(rvLengthFt, 10) || null : null,
    licensePlate: input.guest.licensePlate.trim() || null,
    notes: input.guest.notes.trim() || null,
  };

  const guest = await ctx.prisma.guest.upsert({
    where: { propertyId_email: { propertyId: property.id, email } },
    update: guestData,
    create: { ...guestData, email, propertyId: property.id },
  });

  // ---- Create reservation + line items + optional payment ----
  const confirmationCode = generateConfirmationCode(property.slug);

  const reservation = await prisma.$transaction(async (tx) => {
    const r = await tx.reservation.create({
      data: {
        propertyId: property.id,
        siteId: site.id,
        guestId: guest.id,
        confirmationCode,
        checkIn,
        checkOut,
        stayType: payload.stayType,
        status: "CONFIRMED",
        confirmedAt: new Date(),
        createdByOperatorId: ctx.operator.id,
        subtotalCents: payload.subtotalCents,
        taxCents: payload.taxCents,
        totalCents: payload.totalCents,
        paidCents: payload.paidCents,
        cancelPolicySnapshot: {
          cancelFullRefundDays: property.cancelFullRefundDays,
          cancelPartialRefundDays: property.cancelPartialRefundDays,
          cancelPartialRefundPct: property.cancelPartialRefundPct,
        },
        lineItems: {
          create: payload.lineItems.map((li) => ({
            type: li.type,
            description: li.description,
            quantity: li.quantity,
            unitPriceCents: li.unitPriceCents,
            amountCents: li.amountCents,
            ratePlanId: li.ratePlanId,
            addonId: li.addonId,
            taxRateId: li.taxRateId,
          })),
        },
      },
    });

    if (payload.shouldCreatePayment && input.payment.kind === "paid") {
      await tx.payment.create({
        data: {
          reservationId: r.id,
          paymentMethod: input.payment.method,
          amountCents: payload.paidCents,
          applicationFeeCents: 0, // manual payments — no platform fee
          stripeConnectedAccountId: null,
          currency: "USD",
          status: "SUCCEEDED",
          notes: input.payment.notes?.trim() || null,
        },
      });
    }

    return r;
  });

  // ---- Confirmation email (best-effort) ----
  if (input.notifyGuest) {
    const checkInDate = checkIn.toISOString().slice(0, 10);
    const checkOutDate = checkOut.toISOString().slice(0, 10);
    const nights = Math.round(
      (checkOut.getTime() - checkIn.getTime()) / 86_400_000,
    );

    const override = await ctx.prisma.emailTemplate.findUnique({
      where: {
        propertyId_type: {
          propertyId: property.id,
          type: "RESERVATION_CONFIRMATION",
        },
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const content = renderEmail(
      "RESERVATION_CONFIRMATION",
      {
        guestName: guest.name,
        confirmationCode,
        propertyName: property.name,
        siteLabel: site.label,
        siteTypeName: site.siteType.name,
        checkInDate,
        checkOutDate,
        checkInTime: property.checkInTime,
        checkOutTime: property.checkOutTime,
        nights,
        totalCents: payload.totalCents,
        totalFormatted: payload.isComp
          ? "Complimentary"
          : formatTotalForEmail(payload.totalCents),
        manageUrl: `${appUrl}/p/${property.slug}/booking/${confirmationCode}`,
      },
      override && override.active ? override : null,
    );

    await dispatchEmail({
      propertyId: property.id,
      reservationId: reservation.id,
      type: "RESERVATION_CONFIRMATION",
      to: email,
      content,
    });
  }

  revalidatePath("/admin/reservations");
  return { ok: true, reservationId: reservation.id };
}

/**
 * Look up an existing Guest on this property by email so the create form
 * can pre-fill name/phone/RV info if the guest has booked before.
 */
export type GuestPrefill = {
  name: string;
  phone: string;
  rvMake: string;
  rvModel: string;
  rvYear: string;
  rvLengthFt: string;
  licensePlate: string;
  notes: string;
};

export async function lookupGuestByEmailAction(
  email: string,
): Promise<GuestPrefill | null> {
  const ctx = await requireOperatorPropertyOrSetup();
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) return null;
  const guest = await ctx.prisma.guest.findUnique({
    where: { propertyId_email: { propertyId: ctx.propertyId, email: trimmed } },
  });
  if (!guest) return null;
  return {
    name: guest.name,
    phone: guest.phone ?? "",
    rvMake: guest.rvMake ?? "",
    rvModel: guest.rvModel ?? "",
    rvYear: guest.rvYear?.toString() ?? "",
    rvLengthFt: guest.rvLengthFt?.toString() ?? "",
    licensePlate: guest.licensePlate ?? "",
    notes: guest.notes ?? "",
  };
}
