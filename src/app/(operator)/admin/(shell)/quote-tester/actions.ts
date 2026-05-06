"use server";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import {
  computeQuote,
  PricingError,
  type AddonInput,
  type ChargeUnit,
  type ModifierApplies,
  type ModifierInput,
  type ModifierType,
  type Quote,
  type RatePlanInput,
  type TaxAppliesTo,
  type TaxRateInput,
} from "@/lib/pricing";

export type QuoteRequestInput = {
  siteTypeId: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  addonQuantities: Record<string, number>;
};

export type QuoteActionResult =
  | { ok: true; quote: Quote }
  | { ok: false; error: string };

function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export async function runQuote(
  input: QuoteRequestInput,
): Promise<QuoteActionResult> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.checkIn) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.checkOut)
  ) {
    return { ok: false, error: "Pick valid check-in and check-out dates." };
  }
  if (!input.siteTypeId) {
    return { ok: false, error: "Pick a site type." };
  }

  const ctx = await requireOperatorPropertyOrSetup();
  const checkIn = parseDateOnly(input.checkIn);
  const checkOut = parseDateOnly(input.checkOut);

  const [ratePlans, modifiers, taxRates, addons] = await Promise.all([
    ctx.prisma.ratePlan.findMany({}),
    ctx.prisma.rateModifier.findMany({}),
    ctx.prisma.taxRate.findMany({}),
    ctx.prisma.addon.findMany({}),
  ]);

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

  const addonInputs: AddonInput[] = addons
    .map((a) => ({
      id: a.id,
      name: a.name,
      priceCents: a.priceCents,
      quantity: input.addonQuantities[a.id] ?? 0,
    }))
    .filter((a) => a.quantity > 0);

  try {
    const quote = computeQuote({
      checkIn,
      checkOut,
      siteTypeId: input.siteTypeId,
      ratePlans: ratePlanInputs,
      modifiers: modifierInputs,
      taxRates: taxRateInputs,
      addons: addonInputs,
    });
    return { ok: true, quote };
  } catch (e) {
    if (e instanceof PricingError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}
