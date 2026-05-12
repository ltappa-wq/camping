// Pure pricing logic. No DB calls, no React, no I/O.
//
// Inputs are PoJOs the caller has already loaded (and active-filtered if
// needed); see `QuoteRequest`. Output is a structured Quote: cent-accurate
// totals plus line items the caller can snapshot onto a Reservation.
//
// Rounding: banker's rounding (half-to-even) for tax + percent modifiers.
// Per-night PERCENT modifier amounts are rounded to the cent each night
// before summing — avoids fractional drift that would otherwise creep into
// the displayed total.
//
// Decision: no backfill of historical reservations to the new rounding —
// the per-reservation delta is at most a fractional cent, and existing
// reservations carry their snapshotted line items unchanged.

import { nightsBetween } from "./availability";
import { bankersRound } from "./money";

const ONE_DAY_MS = 86_400_000;

export type ChargeUnit = "NIGHT" | "WEEK" | "MONTH" | "SEASON";
export type ModifierType = "PERCENT" | "FIXED_AMOUNT";
export type ModifierApplies = "DAY_OF_WEEK" | "DATE_RANGE";
export type TaxAppliesTo = "STAY" | "ADDON" | "ALL";

export type RatePlanInput = {
  id: string;
  name: string;
  /** null = applies to all site types. */
  siteTypeId: string | null;
  chargeUnit: ChargeUnit;
  pricePerUnitCents: number;
  minStayDays: number;
  /** null = no upper bound. */
  maxStayDays: number | null;
  effectiveFrom: Date | null;
  /** Inclusive: a stay ending the day after effectiveTo still qualifies. */
  effectiveTo: Date | null;
  priority: number;
  active: boolean;
};

export type ModifierInput = {
  id: string;
  name: string;
  siteTypeId: string | null;
  modifierType: ModifierType;
  /** Signed: bps if PERCENT (negative = discount), cents if FIXED_AMOUNT. */
  modifierValue: number;
  appliesTo: ModifierApplies;
  /** 0=Sun..6=Sat. Used when appliesTo === "DAY_OF_WEEK". */
  daysOfWeek: number[];
  /** Inclusive on both ends. Used when appliesTo === "DATE_RANGE". */
  startDate: Date | null;
  endDate: Date | null;
  priority: number;
  active: boolean;
};

export type TaxRateInput = {
  id: string;
  name: string;
  basisPoints: number;
  appliesTo: TaxAppliesTo;
  active: boolean;
};

export type AddonInput = {
  id: string;
  name: string;
  priceCents: number;
  quantity: number;
};

export type QuoteRequest = {
  checkIn: Date;
  checkOut: Date;
  siteTypeId: string;
  ratePlans: ReadonlyArray<RatePlanInput>;
  modifiers: ReadonlyArray<ModifierInput>;
  taxRates: ReadonlyArray<TaxRateInput>;
  addons: ReadonlyArray<AddonInput>;
};

export type LineItemKind = "BASE" | "MODIFIER" | "ADDON" | "TAX";

export type LineItem = {
  kind: LineItemKind;
  description: string;
  amountCents: number;
  ratePlanId?: string;
  modifierId?: string;
  addonId?: string;
  taxRateId?: string;
};

/** One slice of the greedy pack: which plan, how many of its units, total cost. */
export type StayLine = {
  ratePlanId: string;
  ratePlanName: string;
  chargeUnit: ChargeUnit;
  daysPerUnit: number;
  units: number;
  unitPriceCents: number;
  amountCents: number;
};

export type Quote = {
  nights: number;
  /** Greedy decomposition of the stay into rate-plan units. One entry per plan. */
  stayLines: StayLine[];
  baseCents: number;
  modifierTotalCents: number;
  addonsCents: number;
  taxCents: number;
  totalCents: number;
  lineItems: LineItem[];
};

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

function daysPerUnitFor(plan: RatePlanInput): number {
  switch (plan.chargeUnit) {
    case "NIGHT":
      return 1;
    case "WEEK":
      return 7;
    // Stay-aligned, NOT calendar-aligned. Deliberate MVP choice.
    case "MONTH":
      return 30;
    // SEASON's "unit" is the plan's own minStayDays — i.e. one season worth.
    case "SEASON":
      return plan.minStayDays;
  }
}

function chargeUnitLabel(unit: ChargeUnit): string {
  switch (unit) {
    case "NIGHT":
      return "night";
    case "WEEK":
      return "week";
    case "MONTH":
      return "month";
    case "SEASON":
      return "season";
  }
}

/** Filter the plans the caller passed in down to those eligible for this stay. */
function eligiblePlans(
  plans: ReadonlyArray<RatePlanInput>,
  request: { checkIn: Date; checkOut: Date; siteTypeId: string },
): RatePlanInput[] {
  const nights = nightsBetween(request.checkIn, request.checkOut);
  return plans.filter((p) => {
    if (!p.active) return false;
    if (p.siteTypeId !== null && p.siteTypeId !== request.siteTypeId) return false;
    if (nights < p.minStayDays) return false;
    if (p.maxStayDays !== null && nights > p.maxStayDays) return false;
    if (p.effectiveFrom !== null && request.checkIn < p.effectiveFrom) return false;
    if (p.effectiveTo !== null) {
      const exclusive = new Date(p.effectiveTo.getTime() + ONE_DAY_MS);
      if (request.checkOut > exclusive) return false;
    }
    return true;
  });
}

/**
 * Greedy unit-packer: decompose the stay into the largest rate-plan units
 * that fit, then fill the remainder with smaller units.
 *
 * Pack order: daysPerUnit DESC, then priority DESC, then plan id ASC for
 * deterministic ties. SEASON plans are clamped to at most one unit per
 * stay (booking two seasons in one reservation is meaningless).
 *
 * Throws PricingError if any nights are left unaccounted for after walking
 * all plans — the message names the gap so the operator knows what to add.
 */
export function packRatePlans(
  plans: ReadonlyArray<RatePlanInput>,
  request: { checkIn: Date; checkOut: Date; siteTypeId: string },
): StayLine[] {
  const nights = nightsBetween(request.checkIn, request.checkOut);
  if (nights <= 0) {
    throw new PricingError("Stay must be at least one night");
  }

  const eligible = eligiblePlans(plans, request).slice();

  eligible.sort((a, b) => {
    const da = daysPerUnitFor(a);
    const db = daysPerUnitFor(b);
    if (db !== da) return db - da;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });

  const lines: StayLine[] = [];
  let remaining = nights;
  for (const plan of eligible) {
    if (remaining === 0) break;
    const dpu = daysPerUnitFor(plan);
    if (dpu <= 0) continue;
    let units = Math.floor(remaining / dpu);
    if (plan.chargeUnit === "SEASON" && units > 1) units = 1;
    if (units === 0) continue;
    const amount = plan.pricePerUnitCents * units;
    lines.push({
      ratePlanId: plan.id,
      ratePlanName: plan.name,
      chargeUnit: plan.chargeUnit,
      daysPerUnit: dpu,
      units,
      unitPriceCents: plan.pricePerUnitCents,
      amountCents: amount,
    });
    remaining -= units * dpu;
  }

  if (remaining > 0) {
    throw new PricingError(
      `${remaining} night${remaining === 1 ? "" : "s"} of the stay could not be priced — no applicable plan covers this remainder.`,
    );
  }

  return lines;
}

/** All UTC midnight Dates in the half-open range [checkIn, checkOut). */
function eachNight(checkIn: Date, checkOut: Date): Date[] {
  const out: Date[] = [];
  for (let t = checkIn.getTime(); t < checkOut.getTime(); t += ONE_DAY_MS) {
    out.push(new Date(t));
  }
  return out;
}

function modifierMatchesNight(m: ModifierInput, night: Date): boolean {
  if (m.appliesTo === "DAY_OF_WEEK") {
    return m.daysOfWeek.includes(night.getUTCDay());
  }
  if (!m.startDate || !m.endDate) return false;
  return night >= m.startDate && night <= m.endDate;
}

function applyModifier(
  m: ModifierInput,
  nights: Date[],
  perNightBaseCents: number,
): { amountCents: number; matchingNights: number } {
  let matching = 0;
  let amount = 0;
  for (const night of nights) {
    if (!modifierMatchesNight(m, night)) continue;
    matching++;
    if (m.modifierType === "FIXED_AMOUNT") {
      amount += m.modifierValue;
    } else {
      // PERCENT: signed bps applied to the night's base, rounded to the cent.
      amount += bankersRound((perNightBaseCents * m.modifierValue) / 10000);
    }
  }
  return { amountCents: amount, matchingNights: matching };
}

function describeModifier(m: ModifierInput, matchingNights: number): string {
  const sign = m.modifierValue < 0 ? "−" : "+";
  const magnitude = Math.abs(m.modifierValue);
  const unit =
    m.modifierType === "PERCENT"
      ? `${magnitude / 100}%`
      : `$${(magnitude / 100).toFixed(2)}`;
  return `${m.name}: ${sign}${unit} × ${matchingNights} night${matchingNights === 1 ? "" : "s"}`;
}

export function computeQuote(request: QuoteRequest): Quote {
  const nights = nightsBetween(request.checkIn, request.checkOut);
  if (nights <= 0) {
    throw new PricingError("Stay must be at least one night");
  }

  const stayLines = packRatePlans(request.ratePlans, request);
  const baseCents = stayLines.reduce((sum, sl) => sum + sl.amountCents, 0);

  // Decision: per-night base used for PERCENT modifiers is a FLAT AVERAGE
  // (baseCents / nights), regardless of which packing unit covers each
  // night. Modifier math stays predictable for operators — a 10% Friday
  // surcharge on a stay packed as 1×Weekly+2×Nightly applies the same
  // amount on every Friday night, not different amounts based on which
  // unit "owns" that night.
  const perNightBaseCents = bankersRound(baseCents / nights);

  const lineItems: LineItem[] = stayLines.map((sl) => ({
    kind: "BASE",
    description: `${sl.ratePlanName} — ${chargeUnitLabel(sl.chargeUnit)} rate × ${sl.units}`,
    amountCents: sl.amountCents,
    ratePlanId: sl.ratePlanId,
  }));

  const stayNights = eachNight(request.checkIn, request.checkOut);

  // Apply modifiers in deterministic order: priority desc, then id for stability.
  const applicableModifiers = request.modifiers
    .filter(
      (m) =>
        m.active &&
        (m.siteTypeId === null || m.siteTypeId === request.siteTypeId),
    )
    .slice()
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  let modifierTotalCents = 0;
  for (const m of applicableModifiers) {
    const { amountCents, matchingNights } = applyModifier(
      m,
      stayNights,
      perNightBaseCents,
    );
    if (matchingNights === 0 || amountCents === 0) continue;
    modifierTotalCents += amountCents;
    lineItems.push({
      kind: "MODIFIER",
      description: describeModifier(m, matchingNights),
      amountCents,
      modifierId: m.id,
    });
  }

  // Add-ons.
  let addonsCents = 0;
  for (const a of request.addons) {
    if (a.quantity <= 0) continue;
    const sub = a.priceCents * a.quantity;
    addonsCents += sub;
    lineItems.push({
      kind: "ADDON",
      description: `${a.name}${a.quantity > 1 ? ` × ${a.quantity}` : ""}`,
      amountCents: sub,
      addonId: a.id,
    });
  }

  // Taxes. Each active rate becomes its own line item against the relevant base.
  const stayTaxable = baseCents + modifierTotalCents;
  let taxCents = 0;
  for (const t of request.taxRates) {
    if (!t.active) continue;
    let subject = 0;
    if (t.appliesTo === "STAY" || t.appliesTo === "ALL") subject += stayTaxable;
    if (t.appliesTo === "ADDON" || t.appliesTo === "ALL") subject += addonsCents;
    if (subject <= 0) continue;
    const amount = bankersRound((subject * t.basisPoints) / 10000);
    if (amount === 0) continue;
    taxCents += amount;
    lineItems.push({
      kind: "TAX",
      description: `${t.name} (${(t.basisPoints / 100).toFixed(2)}%)`,
      amountCents: amount,
      taxRateId: t.id,
    });
  }

  const totalCents = stayTaxable + addonsCents + taxCents;

  return {
    nights,
    stayLines,
    baseCents,
    modifierTotalCents,
    addonsCents,
    taxCents,
    totalCents,
    lineItems,
  };
}
