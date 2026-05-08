// Pure logic for manual reservation creation. The server action wraps this
// with availability checks, guest find-or-create, and DB writes. Keeping
// the math + line-item shaping pure means the action is thin, the tests
// are fast, and the comp / override cases are covered without mocking
// Prisma.

import type { StayType } from "@prisma/client";

import {
  type AddonInput,
  type LineItem,
  type ModifierInput,
  type Quote,
  type RatePlanInput,
  type StayLine,
  type TaxRateInput,
  computeQuote,
  PricingError,
} from "./pricing";

export type LineItemType = "STAY" | "ADDON" | "DISCOUNT" | "TAX" | "FEE";

export type ManualOverride =
  | { kind: "none" }
  | {
      kind: "discount";
      /** Positive cents — sign-flipped to negative when stored. */
      amountCents: number;
      description: string;
    }
  | {
      kind: "total";
      /** Final grand total in cents (>= 0). 0 = comp. */
      amountCents: number;
      description: string;
    };

export type ManualPayment =
  | { kind: "unpaid" }
  | {
      kind: "paid";
      method: "CARD_MANUAL" | "CASH" | "CHECK" | "COMP" | "OTHER";
      amountCents: number;
      notes?: string;
    };

export type BuildPayloadInput = {
  checkIn: Date;
  checkOut: Date;
  siteTypeId: string;
  ratePlans: ReadonlyArray<RatePlanInput>;
  modifiers: ReadonlyArray<ModifierInput>;
  taxRates: ReadonlyArray<TaxRateInput>;
  addons: ReadonlyArray<AddonInput>;
  override: ManualOverride;
  payment: ManualPayment;
};

export type BuiltLineItem = {
  type: LineItemType;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  ratePlanId: string | null;
  addonId: string | null;
  taxRateId: string | null;
};

export type BuiltPayload = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  stayType: StayType;
  lineItems: BuiltLineItem[];
  /** True when a Payment row should be created. False for unpaid + comp. */
  shouldCreatePayment: boolean;
  /** Convenience flag for email rendering ("Complimentary" vs price). */
  isComp: boolean;
};

const ONE_DAY_MS = 86_400_000;

function deriveStayType(stayLines: ReadonlyArray<StayLine>): StayType {
  const units = new Set(stayLines.map((l) => l.chargeUnit));
  if (units.has("SEASON")) return "SEASONAL";
  if (units.has("MONTH")) return "MONTHLY";
  if (units.has("WEEK")) return "WEEKLY";
  return "NIGHTLY";
}

function lineItemTypeFor(kind: LineItem["kind"]): LineItemType {
  if (kind === "ADDON") return "ADDON";
  if (kind === "TAX") return "TAX";
  return "STAY"; // BASE and MODIFIER both roll up into STAY
}

function quoteToLineItems(quote: Quote): BuiltLineItem[] {
  return quote.lineItems.map((li) => ({
    type: lineItemTypeFor(li.kind),
    description: li.description,
    quantity: 1,
    unitPriceCents: li.amountCents,
    amountCents: li.amountCents,
    ratePlanId: li.ratePlanId ?? null,
    addonId: li.addonId ?? null,
    taxRateId: li.taxRateId ?? null,
  }));
}

/**
 * Build the full reservation payload from a manual-creation form's input.
 * Pure — throws PricingError if the engine can't quote (operator must
 * resolve before calling). The server action catches PricingError and
 * surfaces the message verbatim.
 *
 * Override cases:
 *   - "discount" appends a negative DISCOUNT line on top of the regular
 *     quote. Total = quote total - discount, floored at 0.
 *   - "total" replaces the line items entirely with one synthetic STAY
 *     line at the override amount. Tax = 0, no quote engine call. Used
 *     for comps ($0) and bespoke pricing.
 *
 * Payment cases:
 *   - "unpaid" → paidCents = 0, no Payment row
 *   - "paid" + comp ($0 total) → paidCents = 0, no Payment row
 *   - "paid" + amount → paidCents = amount, Payment row created
 */
export function buildManualReservationPayload(
  input: BuildPayloadInput,
): BuiltPayload {
  const { checkIn, checkOut, override } = input;
  const nights = Math.round(
    (checkOut.getTime() - checkIn.getTime()) / ONE_DAY_MS,
  );

  if (override.kind === "total") {
    const totalCents = Math.max(0, Math.floor(override.amountCents));
    const description =
      override.description.trim() ||
      (totalCents === 0
        ? "Complimentary stay"
        : `Manual price override (${nights} night${nights === 1 ? "" : "s"})`);

    const lineItems: BuiltLineItem[] = [
      {
        type: "STAY",
        description,
        quantity: 1,
        unitPriceCents: totalCents,
        amountCents: totalCents,
        ratePlanId: null,
        addonId: null,
        taxRateId: null,
      },
    ];

    const paidCents = computePaidCents(input.payment, totalCents);

    return {
      subtotalCents: totalCents,
      taxCents: 0,
      totalCents,
      paidCents,
      stayType: nights >= 150
        ? "SEASONAL"
        : nights >= 30
          ? "MONTHLY"
          : nights >= 7
            ? "WEEKLY"
            : "NIGHTLY",
      lineItems,
      shouldCreatePayment:
        input.payment.kind === "paid" && totalCents > 0 && paidCents > 0,
      isComp: totalCents === 0,
    };
  }

  // Run the regular pricing engine.
  let quote: Quote;
  try {
    quote = computeQuote({
      checkIn,
      checkOut,
      siteTypeId: input.siteTypeId,
      ratePlans: input.ratePlans,
      modifiers: input.modifiers,
      taxRates: input.taxRates,
      addons: input.addons,
    });
  } catch (e) {
    if (e instanceof PricingError) throw e;
    throw e;
  }

  const baseLineItems = quoteToLineItems(quote);
  const stayType = deriveStayType(quote.stayLines);

  if (override.kind === "discount") {
    const discountAmount = Math.max(0, Math.floor(override.amountCents));
    const description = override.description.trim() || "Operator discount";
    const lineItems: BuiltLineItem[] = [
      ...baseLineItems,
      {
        type: "DISCOUNT",
        description,
        quantity: 1,
        unitPriceCents: -discountAmount,
        amountCents: -discountAmount,
        ratePlanId: null,
        addonId: null,
        taxRateId: null,
      },
    ];
    const totalCents = Math.max(0, quote.totalCents - discountAmount);
    const subtotalCents = Math.max(
      0,
      quote.baseCents + quote.modifierTotalCents + quote.addonsCents - discountAmount,
    );
    const paidCents = computePaidCents(input.payment, totalCents);
    return {
      subtotalCents,
      taxCents: quote.taxCents,
      totalCents,
      paidCents,
      stayType,
      lineItems,
      shouldCreatePayment:
        input.payment.kind === "paid" && totalCents > 0 && paidCents > 0,
      isComp: totalCents === 0,
    };
  }

  // override.kind === "none" — straight quote
  const totalCents = quote.totalCents;
  const subtotalCents =
    quote.baseCents + quote.modifierTotalCents + quote.addonsCents;
  const paidCents = computePaidCents(input.payment, totalCents);
  return {
    subtotalCents,
    taxCents: quote.taxCents,
    totalCents,
    paidCents,
    stayType,
    lineItems: baseLineItems,
    shouldCreatePayment:
      input.payment.kind === "paid" && totalCents > 0 && paidCents > 0,
    isComp: false,
  };
}

function computePaidCents(payment: ManualPayment, totalCents: number): number {
  if (payment.kind === "unpaid") return 0;
  if (totalCents === 0) return 0; // Comp — no payment recorded
  return Math.max(0, Math.floor(payment.amountCents));
}
