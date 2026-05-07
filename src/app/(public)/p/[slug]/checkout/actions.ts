"use server";

import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
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
  type TaxAppliesTo,
  type TaxRateInput,
} from "@/lib/pricing";

const HOLD_MINUTES = 15;

export type CheckoutInput = {
  slug: string;
  siteId: string;
  from: string; // YYYY-MM-DD
  to: string;
  adults: number;
  children: number;
  guest: {
    name: string;
    email: string;
    phone: string;
  };
  addonQuantities: Record<string, number>;
  guestNotes?: string;
};

export type CheckoutResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function generateConfirmationCode(slug: string): string {
  // 8 base32 chars from 6 random bytes (~48 bits of entropy).
  const code = randomBytes(6).toString("base64").replace(/[+/=]/g, "").toUpperCase();
  const prefix = slug.slice(0, 2).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  return `${prefix}-${code.slice(0, 6)}`;
}

function deriveStayType(
  stayLines: ReadonlyArray<{ chargeUnit: string }>,
): "NIGHTLY" | "WEEKLY" | "MONTHLY" | "SEASONAL" {
  const units = new Set(stayLines.map((s) => s.chargeUnit));
  if (units.has("SEASON")) return "SEASONAL";
  if (units.has("MONTH")) return "MONTHLY";
  if (units.has("WEEK")) return "WEEKLY";
  return "NIGHTLY";
}

function lineItemTypeFor(kind: LineItem["kind"]): "STAY" | "ADDON" | "TAX" {
  if (kind === "ADDON") return "ADDON";
  if (kind === "TAX") return "TAX";
  // BASE and MODIFIER both roll up into STAY for ReservationLineItem.
  return "STAY";
}

export async function startCheckout(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  // Basic shape validation.
  const name = input.guest.name.trim();
  const email = input.guest.email.trim().toLowerCase();
  const phone = input.guest.phone.trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.to)
  ) {
    return { ok: false, error: "Invalid dates." };
  }

  const property = await prisma.property.findUnique({
    where: { slug: input.slug },
    include: { organization: true },
  });
  if (!property) return { ok: false, error: "Property not found." };

  if (
    !property.organization.stripeAccountId ||
    !property.organization.stripeOnboardingComplete ||
    !property.organization.stripeChargesEnabled
  ) {
    return {
      ok: false,
      error:
        "This property isn't accepting online bookings yet. Please try again later.",
    };
  }

  const checkIn = parseDateOnly(input.from);
  const checkOut = parseDateOnly(input.to);
  if (checkIn >= checkOut) {
    return { ok: false, error: "Check-out must be after check-in." };
  }

  const site = await prisma.site.findFirst({
    where: {
      id: input.siteId,
      propertyId: property.id,
      deletedAt: null,
      active: true,
    },
    include: { siteType: true },
  });
  if (!site || site.siteType.deletedAt != null) {
    return { ok: false, error: "Site no longer available." };
  }

  const adults = Math.max(1, Math.floor(input.adults));
  const children = Math.max(0, Math.floor(input.children));
  if (
    (site.siteType.maxAdults != null && adults > site.siteType.maxAdults) ||
    (site.siteType.maxChildren != null && children > site.siteType.maxChildren)
  ) {
    return { ok: false, error: "Site doesn't accommodate your party size." };
  }

  const now = new Date();

  const [ratePlans, modifiers, taxRates, addons, reservations, closedRanges] =
    await Promise.all([
      prisma.ratePlan.findMany({ where: { propertyId: property.id } }),
      prisma.rateModifier.findMany({ where: { propertyId: property.id } }),
      prisma.taxRate.findMany({ where: { propertyId: property.id } }),
      prisma.addon.findMany({
        where: { propertyId: property.id, active: true },
      }),
      prisma.reservation.findMany({
        where: {
          propertyId: property.id,
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
      prisma.closedDateRange.findMany({
        where: {
          propertyId: property.id,
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
      error: avail.reasons[0] ?? "Site is no longer available.",
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
    quantity: Math.max(0, Math.floor(input.addonQuantities[a.id] ?? 0)),
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

  // Find or create Guest (property-scoped: same email at two properties = two rows).
  const guest = await prisma.guest.upsert({
    where: {
      // Composite unique on (propertyId, email) is needed; if not present in
      // schema, fall back to a find-then-create.
      propertyId_email: { propertyId: property.id, email },
    },
    update: { name, phone: phone || null },
    create: {
      propertyId: property.id,
      email,
      name,
      phone: phone || null,
    },
  });

  const subtotalCents =
    quote.baseCents + quote.modifierTotalCents + quote.addonsCents;
  const heldUntil = new Date(now.getTime() + HOLD_MINUTES * 60_000);

  const trimmedNotes = input.guestNotes?.trim();

  const reservation = await prisma.reservation.create({
    data: {
      propertyId: property.id,
      siteId: site.id,
      guestId: guest.id,
      confirmationCode: generateConfirmationCode(input.slug),
      checkIn,
      checkOut,
      stayType: deriveStayType(quote.stayLines),
      status: "HELD",
      subtotalCents,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      heldUntil,
      guestNotes: trimmedNotes ? trimmedNotes : null,
      cancelPolicySnapshot: {
        cancelFullRefundDays: property.cancelFullRefundDays,
        cancelPartialRefundDays: property.cancelPartialRefundDays,
        cancelPartialRefundPct: property.cancelPartialRefundPct,
      },
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

  // Create the Stripe Checkout session as a destination charge.
  // Platform fee is a flat per-booking amount (org.platformFeeFlatCents).
  // Cap at total in case the operator misconfigured a fee that would exceed
  // a particularly cheap stay; Stripe rejects fees > total.
  const fee = Math.min(
    Math.max(0, property.organization.platformFeeFlatCents),
    quote.totalCents,
  );
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: (property.currency ?? "USD").toLowerCase(),
          product_data: {
            name: `${property.name} — Site ${site.label}`,
            description: `${input.from} → ${input.to} · ${quote.nights} night${quote.nights === 1 ? "" : "s"}`,
          },
          unit_amount: quote.totalCents,
        },
        quantity: 1,
      },
    ],
    customer_email: email,
    payment_intent_data: {
      application_fee_amount: fee > 0 ? fee : undefined,
      transfer_data: {
        destination: property.organization.stripeAccountId,
      },
      metadata: {
        reservationId: reservation.id,
        propertyId: property.id,
        slug: input.slug,
      },
    },
    metadata: {
      reservationId: reservation.id,
      propertyId: property.id,
      slug: input.slug,
      stripeAccountId: property.organization.stripeAccountId,
      applicationFeeCents: String(fee > 0 ? fee : 0),
    },
    success_url: `${baseUrl}/p/${input.slug}/confirmation/${reservation.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/p/${input.slug}/checkout?siteId=${input.siteId}&from=${input.from}&to=${input.to}&adults=${adults}&children=${children}`,
    expires_at: Math.floor(heldUntil.getTime() / 1000),
  });

  if (!session.url) {
    return { ok: false, error: "Stripe did not return a checkout URL." };
  }

  // Persist the session id so checkout.session.expired and any operator
  // tooling can locate the reservation without round-tripping metadata.
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  return { ok: true, redirectUrl: session.url };
}
