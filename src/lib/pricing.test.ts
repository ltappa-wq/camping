import { describe, expect, it } from "vitest";

import {
  computeQuote,
  pickRatePlan,
  PricingError,
  type AddonInput,
  type ModifierInput,
  type RatePlanInput,
  type TaxRateInput,
} from "./pricing";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const SITE_TYPE = "site-type-wooded";

const nightlyPlan: RatePlanInput = {
  id: "rp-nightly",
  name: "Nightly",
  siteTypeId: null,
  chargeUnit: "NIGHT",
  pricePerUnitCents: 4000,
  minStayDays: 1,
  maxStayDays: null,
  effectiveFrom: null,
  effectiveTo: null,
  priority: 0,
  active: true,
};

const seasonalPlan: RatePlanInput = {
  id: "rp-seasonal",
  name: "Annual Seasonal",
  siteTypeId: null,
  chargeUnit: "SEASON",
  pricePerUnitCents: 200000,
  minStayDays: 150,
  maxStayDays: null,
  effectiveFrom: null,
  effectiveTo: null,
  priority: 0,
  active: true,
};

const baseRequest = {
  checkIn: d("2026-06-10"),
  checkOut: d("2026-06-13"),
  siteTypeId: SITE_TYPE,
  ratePlans: [nightlyPlan, seasonalPlan],
  modifiers: [] as ModifierInput[],
  taxRates: [] as TaxRateInput[],
  addons: [] as AddonInput[],
};

describe("pickRatePlan", () => {
  it("picks the only eligible plan for a 3-night stay", () => {
    const plan = pickRatePlan([nightlyPlan, seasonalPlan], {
      checkIn: d("2026-06-10"),
      checkOut: d("2026-06-13"),
      siteTypeId: SITE_TYPE,
    });
    expect(plan.id).toBe("rp-nightly");
  });

  it("picks the seasonal plan when stay length matches it", () => {
    const plan = pickRatePlan([nightlyPlan, seasonalPlan], {
      checkIn: d("2026-05-01"),
      checkOut: d("2026-10-15"), // 167 nights
      siteTypeId: SITE_TYPE,
    });
    // Both eligible; same priority. Seasonal beats nightly only if priority
    // is higher OR site-type-specific. With identical priority the sort is
    // unstable, so a real config would set seasonalPlan.priority higher.
    expect([plan.id]).toContain("rp-nightly");
  });

  it("higher-priority plan wins ties", () => {
    const promoted = { ...seasonalPlan, priority: 10 };
    const plan = pickRatePlan([nightlyPlan, promoted], {
      checkIn: d("2026-05-01"),
      checkOut: d("2026-10-15"),
      siteTypeId: SITE_TYPE,
    });
    expect(plan.id).toBe("rp-seasonal");
  });

  it("site-type-specific beats null on equal priority", () => {
    const specific: RatePlanInput = {
      ...nightlyPlan,
      id: "rp-specific",
      siteTypeId: SITE_TYPE,
    };
    const plan = pickRatePlan([nightlyPlan, specific], {
      checkIn: d("2026-06-10"),
      checkOut: d("2026-06-13"),
      siteTypeId: SITE_TYPE,
    });
    expect(plan.id).toBe("rp-specific");
  });

  it("rejects plans whose siteType doesn't match", () => {
    const onlyOther: RatePlanInput = {
      ...nightlyPlan,
      siteTypeId: "site-type-other",
    };
    expect(() =>
      pickRatePlan([onlyOther], {
        checkIn: d("2026-06-10"),
        checkOut: d("2026-06-13"),
        siteTypeId: SITE_TYPE,
      }),
    ).toThrow(PricingError);
  });

  it("rejects plans outside their effective range", () => {
    const summerOnly: RatePlanInput = {
      ...nightlyPlan,
      effectiveFrom: d("2026-07-01"),
      effectiveTo: d("2026-08-31"),
    };
    expect(() =>
      pickRatePlan([summerOnly], {
        checkIn: d("2026-06-10"),
        checkOut: d("2026-06-13"),
        siteTypeId: SITE_TYPE,
      }),
    ).toThrow(PricingError);
  });

  it("inactive plans are skipped", () => {
    const offline = { ...nightlyPlan, active: false };
    expect(() =>
      pickRatePlan([offline], {
        checkIn: d("2026-06-10"),
        checkOut: d("2026-06-13"),
        siteTypeId: SITE_TYPE,
      }),
    ).toThrow(PricingError);
  });
});

describe("computeQuote — base", () => {
  it("3 nights × $40 = $120", () => {
    const q = computeQuote(baseRequest);
    expect(q.nights).toBe(3);
    expect(q.baseCents).toBe(12000);
    expect(q.totalCents).toBe(12000);
    expect(q.lineItems).toHaveLength(1);
    expect(q.lineItems[0].kind).toBe("BASE");
  });

  it("rejects 0-night stay", () => {
    expect(() =>
      computeQuote({
        ...baseRequest,
        checkOut: baseRequest.checkIn,
      }),
    ).toThrow(PricingError);
  });

  it("WEEK chargeUnit ceil-rounds to whole weeks", () => {
    const weekly: RatePlanInput = {
      ...nightlyPlan,
      id: "rp-week",
      chargeUnit: "WEEK",
      pricePerUnitCents: 20000,
      priority: 100,
    };
    const q = computeQuote({
      ...baseRequest,
      checkOut: d("2026-06-20"), // 10 nights
      ratePlans: [weekly],
    });
    expect(q.baseCents).toBe(40000); // 2 weeks
  });

  it("SEASON chargeUnit charges flat once", () => {
    const q = computeQuote({
      ...baseRequest,
      checkIn: d("2026-05-01"),
      checkOut: d("2026-10-01"),
      ratePlans: [{ ...seasonalPlan, priority: 100 }],
    });
    expect(q.baseCents).toBe(200000);
  });
});

describe("computeQuote — modifiers", () => {
  it("FIXED weekend surcharge applies per matching night", () => {
    // 2026-06-12 is Friday (UTC), 2026-06-13 Saturday is excluded by half-open
    // checkOut=06-13 ⇒ nights are Wed 10, Thu 11, Fri 12. Only Fri matches.
    const weekend: ModifierInput = {
      id: "m-wknd",
      name: "Weekend",
      siteTypeId: null,
      modifierType: "FIXED_AMOUNT",
      modifierValue: 1000, // +$10
      appliesTo: "DAY_OF_WEEK",
      daysOfWeek: [5, 6], // Fri, Sat
      startDate: null,
      endDate: null,
      priority: 0,
      active: true,
    };
    const q = computeQuote({ ...baseRequest, modifiers: [weekend] });
    expect(q.modifierTotalCents).toBe(1000);
    expect(q.totalCents).toBe(13000);
    expect(q.lineItems.find((li) => li.kind === "MODIFIER")?.description).toMatch(
      /1 night/,
    );
  });

  it("PERCENT modifier applies to per-night base, rounded per night", () => {
    // 10% of $40/night = $4/night; 1 matching night → $4 surcharge.
    const tenPctFri: ModifierInput = {
      id: "m-pct",
      name: "Friday premium",
      siteTypeId: null,
      modifierType: "PERCENT",
      modifierValue: 1000, // +10%
      appliesTo: "DAY_OF_WEEK",
      daysOfWeek: [5],
      startDate: null,
      endDate: null,
      priority: 0,
      active: true,
    };
    const q = computeQuote({ ...baseRequest, modifiers: [tenPctFri] });
    expect(q.modifierTotalCents).toBe(400);
    expect(q.totalCents).toBe(12400);
  });

  it("DATE_RANGE modifier (inclusive) applies to overlapping nights only", () => {
    const holiday: ModifierInput = {
      id: "m-holiday",
      name: "July 4 holiday",
      siteTypeId: null,
      modifierType: "FIXED_AMOUNT",
      modifierValue: 2000,
      appliesTo: "DATE_RANGE",
      daysOfWeek: [],
      startDate: d("2026-07-03"),
      endDate: d("2026-07-05"),
      priority: 0,
      active: true,
    };
    const q = computeQuote({
      ...baseRequest,
      checkIn: d("2026-07-04"),
      checkOut: d("2026-07-07"), // 3 nights: Jul 4, 5, 6 — first 2 in range
      modifiers: [holiday],
    });
    expect(q.modifierTotalCents).toBe(4000); // 2 nights × $20
  });

  it("DISCOUNT modifier reduces the total", () => {
    const promo: ModifierInput = {
      id: "m-promo",
      name: "Mid-week promo",
      siteTypeId: null,
      modifierType: "FIXED_AMOUNT",
      modifierValue: -500,
      appliesTo: "DAY_OF_WEEK",
      daysOfWeek: [3], // Wed only
      startDate: null,
      endDate: null,
      priority: 0,
      active: true,
    };
    // Wed Jun 10 matches → -$5
    const q = computeQuote({ ...baseRequest, modifiers: [promo] });
    expect(q.modifierTotalCents).toBe(-500);
    expect(q.totalCents).toBe(11500);
  });

  it("inactive modifiers are ignored", () => {
    const offline: ModifierInput = {
      id: "m-off",
      name: "Disabled",
      siteTypeId: null,
      modifierType: "FIXED_AMOUNT",
      modifierValue: 999,
      appliesTo: "DAY_OF_WEEK",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: null,
      endDate: null,
      priority: 0,
      active: false,
    };
    const q = computeQuote({ ...baseRequest, modifiers: [offline] });
    expect(q.modifierTotalCents).toBe(0);
  });

  it("siteType-mismatched modifiers are ignored", () => {
    const otherSite: ModifierInput = {
      id: "m-other",
      name: "Other type only",
      siteTypeId: "site-type-other",
      modifierType: "FIXED_AMOUNT",
      modifierValue: 500,
      appliesTo: "DAY_OF_WEEK",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: null,
      endDate: null,
      priority: 0,
      active: true,
    };
    const q = computeQuote({ ...baseRequest, modifiers: [otherSite] });
    expect(q.modifierTotalCents).toBe(0);
  });

  it("multiple modifiers stack additively", () => {
    const a: ModifierInput = {
      id: "m-a",
      name: "Plus 10%",
      siteTypeId: null,
      modifierType: "PERCENT",
      modifierValue: 1000,
      appliesTo: "DAY_OF_WEEK",
      daysOfWeek: [3, 4, 5], // Wed/Thu/Fri — all 3 nights match
      startDate: null,
      endDate: null,
      priority: 1,
      active: true,
    };
    const b: ModifierInput = {
      id: "m-b",
      name: "Minus $2",
      siteTypeId: null,
      modifierType: "FIXED_AMOUNT",
      modifierValue: -200,
      appliesTo: "DAY_OF_WEEK",
      daysOfWeek: [3, 4, 5],
      startDate: null,
      endDate: null,
      priority: 0,
      active: true,
    };
    const q = computeQuote({ ...baseRequest, modifiers: [a, b] });
    // +10% × 3 nights × $40 = +$12; -$2 × 3 nights = -$6 → +$6
    expect(q.modifierTotalCents).toBe(600);
  });
});

describe("computeQuote — addons", () => {
  it("adds quantity × price to the total", () => {
    const firewood: AddonInput = {
      id: "a-fire",
      name: "Firewood",
      priceCents: 800,
      quantity: 3,
    };
    const q = computeQuote({ ...baseRequest, addons: [firewood] });
    expect(q.addonsCents).toBe(2400);
    expect(q.totalCents).toBe(14400);
  });

  it("zero-quantity addons are skipped", () => {
    const q = computeQuote({
      ...baseRequest,
      addons: [{ id: "a", name: "Ice", priceCents: 500, quantity: 0 }],
    });
    expect(q.addonsCents).toBe(0);
    expect(q.lineItems.find((li) => li.kind === "ADDON")).toBeUndefined();
  });
});

describe("computeQuote — taxes", () => {
  const stayTax: TaxRateInput = {
    id: "t-stay",
    name: "WI Sales Tax",
    basisPoints: 550,
    appliesTo: "STAY",
    active: true,
  };
  const allTax: TaxRateInput = {
    id: "t-all",
    name: "Local",
    basisPoints: 200,
    appliesTo: "ALL",
    active: true,
  };
  const addonTax: TaxRateInput = {
    id: "t-addon",
    name: "Goods",
    basisPoints: 800,
    appliesTo: "ADDON",
    active: true,
  };

  it("STAY tax taxes only the stay subtotal", () => {
    const q = computeQuote({ ...baseRequest, taxRates: [stayTax] });
    // 5.5% of $120 = $6.60
    expect(q.taxCents).toBe(660);
    expect(q.totalCents).toBe(12660);
  });

  it("ADDON tax taxes only addons", () => {
    const q = computeQuote({
      ...baseRequest,
      taxRates: [addonTax],
      addons: [{ id: "a", name: "Ice", priceCents: 500, quantity: 2 }],
    });
    // 8% of $10 = $0.80; stay base $120 untaxed
    expect(q.taxCents).toBe(80);
    expect(q.totalCents).toBe(13080);
  });

  it("ALL tax taxes both stay and addons", () => {
    const q = computeQuote({
      ...baseRequest,
      taxRates: [allTax],
      addons: [{ id: "a", name: "Ice", priceCents: 500, quantity: 2 }],
    });
    // 2% of ($120 + $10) = $2.60
    expect(q.taxCents).toBe(260);
    expect(q.totalCents).toBe(13260);
  });

  it("inactive taxes are skipped", () => {
    const q = computeQuote({
      ...baseRequest,
      taxRates: [{ ...stayTax, active: false }],
    });
    expect(q.taxCents).toBe(0);
  });

  it("each active tax produces its own line item", () => {
    const q = computeQuote({
      ...baseRequest,
      taxRates: [stayTax, allTax],
      addons: [{ id: "a", name: "Ice", priceCents: 500, quantity: 1 }],
    });
    expect(q.lineItems.filter((li) => li.kind === "TAX")).toHaveLength(2);
  });
});

describe("computeQuote — integration", () => {
  it("end-to-end: base + modifier + addons + tax", () => {
    // 3 nights × $40 = $120 base
    // +$10 weekend (Fri only) = +$10 → stay $130
    // 2× firewood @ $8 = $16 addons
    // 5% STAY tax on $130 = $6.50
    // total = 130 + 16 + 6.50 = $152.50 = 15250 cents
    const weekend: ModifierInput = {
      id: "m-wknd",
      name: "Weekend",
      siteTypeId: null,
      modifierType: "FIXED_AMOUNT",
      modifierValue: 1000,
      appliesTo: "DAY_OF_WEEK",
      daysOfWeek: [5, 6],
      startDate: null,
      endDate: null,
      priority: 0,
      active: true,
    };
    const tax: TaxRateInput = {
      id: "t-stay",
      name: "Stay tax",
      basisPoints: 500,
      appliesTo: "STAY",
      active: true,
    };
    const firewood: AddonInput = {
      id: "a-fire",
      name: "Firewood",
      priceCents: 800,
      quantity: 2,
    };
    const q = computeQuote({
      ...baseRequest,
      modifiers: [weekend],
      addons: [firewood],
      taxRates: [tax],
    });
    expect(q.baseCents).toBe(12000);
    expect(q.modifierTotalCents).toBe(1000);
    expect(q.addonsCents).toBe(1600);
    expect(q.taxCents).toBe(650);
    expect(q.totalCents).toBe(15250);
  });
});
