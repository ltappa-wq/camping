import { describe, expect, it } from "vitest";

import {
  computeQuote,
  packRatePlans,
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

const weeklyPlan: RatePlanInput = {
  id: "rp-weekly",
  name: "Weekly",
  siteTypeId: null,
  chargeUnit: "WEEK",
  pricePerUnitCents: 24000,
  minStayDays: 7,
  maxStayDays: null,
  effectiveFrom: null,
  effectiveTo: null,
  priority: 0,
  active: true,
};

const monthlyPlan: RatePlanInput = {
  id: "rp-monthly",
  name: "Monthly",
  siteTypeId: null,
  chargeUnit: "MONTH",
  pricePerUnitCents: 70000,
  minStayDays: 30,
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

const fullPlanSet = [nightlyPlan, weeklyPlan, monthlyPlan, seasonalPlan];

function stayOf(nights: number) {
  const checkIn = d("2026-05-01");
  const checkOut = new Date(checkIn.getTime() + nights * 86_400_000);
  return { checkIn, checkOut, siteTypeId: SITE_TYPE };
}

const baseRequest = {
  checkIn: d("2026-06-10"),
  checkOut: d("2026-06-13"),
  siteTypeId: SITE_TYPE,
  ratePlans: [nightlyPlan],
  modifiers: [] as ModifierInput[],
  taxRates: [] as TaxRateInput[],
  addons: [] as AddonInput[],
};

describe("packRatePlans — eligibility", () => {
  it("throws when no plan covers any of the stay", () => {
    expect(() => packRatePlans([], stayOf(3))).toThrow(PricingError);
  });

  it("excludes plans whose siteType doesn't match", () => {
    const onlyOther: RatePlanInput = {
      ...nightlyPlan,
      siteTypeId: "site-type-other",
    };
    expect(() => packRatePlans([onlyOther], stayOf(3))).toThrow(PricingError);
  });

  it("excludes plans outside their effective range", () => {
    const summerOnly: RatePlanInput = {
      ...nightlyPlan,
      effectiveFrom: d("2026-07-01"),
      effectiveTo: d("2026-08-31"),
    };
    expect(() => packRatePlans([summerOnly], stayOf(3))).toThrow(PricingError);
  });

  it("inactive plans are skipped", () => {
    const offline = { ...nightlyPlan, active: false };
    expect(() => packRatePlans([offline], stayOf(3))).toThrow(PricingError);
  });

  it("respects minStayDays — a 6-night stay can't use Weekly alone", () => {
    expect(() => packRatePlans([weeklyPlan], stayOf(6))).toThrow(PricingError);
  });

  it("respects maxStayDays", () => {
    const shortNightly = { ...nightlyPlan, maxStayDays: 2 };
    expect(() => packRatePlans([shortNightly], stayOf(3))).toThrow(PricingError);
  });
});

describe("packRatePlans — greedy", () => {
  it("7 nights with Nightly+Weekly → 1 weekly, single line", () => {
    const lines = packRatePlans([nightlyPlan, weeklyPlan], stayOf(7));
    expect(lines).toHaveLength(1);
    expect(lines[0].ratePlanId).toBe("rp-weekly");
    expect(lines[0].units).toBe(1);
    expect(lines[0].amountCents).toBe(24000);
  });

  it("9 nights with Nightly+Weekly → 1 weekly + 2 nightly, total $320", () => {
    const lines = packRatePlans([nightlyPlan, weeklyPlan], stayOf(9));
    expect(lines).toHaveLength(2);
    expect(lines[0].ratePlanId).toBe("rp-weekly");
    expect(lines[0].units).toBe(1);
    expect(lines[1].ratePlanId).toBe("rp-nightly");
    expect(lines[1].units).toBe(2);
    const total = lines.reduce((s, l) => s + l.amountCents, 0);
    expect(total).toBe(32000);
  });

  it("10 nights with Nightly+Weekly → 1 weekly + 3 nightly = $360", () => {
    const lines = packRatePlans([nightlyPlan, weeklyPlan], stayOf(10));
    expect(lines.find((l) => l.ratePlanId === "rp-weekly")?.units).toBe(1);
    expect(lines.find((l) => l.ratePlanId === "rp-nightly")?.units).toBe(3);
    const total = lines.reduce((s, l) => s + l.amountCents, 0);
    expect(total).toBe(36000);
  });

  it("14 nights with Nightly+Weekly → 2 weekly = $480", () => {
    const lines = packRatePlans([nightlyPlan, weeklyPlan], stayOf(14));
    expect(lines).toHaveLength(1);
    expect(lines[0].ratePlanId).toBe("rp-weekly");
    expect(lines[0].units).toBe(2);
    expect(lines[0].amountCents).toBe(48000);
  });

  it("21 nights with Nightly+Weekly → 3 weekly", () => {
    const lines = packRatePlans([nightlyPlan, weeklyPlan], stayOf(21));
    expect(lines).toHaveLength(1);
    expect(lines[0].units).toBe(3);
    expect(lines[0].amountCents).toBe(72000);
  });

  it("30 nights with full plan set → 1 monthly only", () => {
    const lines = packRatePlans(fullPlanSet, stayOf(30));
    expect(lines).toHaveLength(1);
    expect(lines[0].ratePlanId).toBe("rp-monthly");
    expect(lines[0].units).toBe(1);
    expect(lines[0].amountCents).toBe(70000);
  });

  it("31 nights with full plan set → 1 monthly + 1 nightly = $740", () => {
    const lines = packRatePlans(fullPlanSet, stayOf(31));
    expect(lines.find((l) => l.ratePlanId === "rp-monthly")?.units).toBe(1);
    expect(lines.find((l) => l.ratePlanId === "rp-nightly")?.units).toBe(1);
    const total = lines.reduce((s, l) => s + l.amountCents, 0);
    expect(total).toBe(74000);
  });

  it("35 nights with full plan set → 1 monthly + 5 nightly = $900", () => {
    const lines = packRatePlans(fullPlanSet, stayOf(35));
    expect(lines.find((l) => l.ratePlanId === "rp-monthly")?.units).toBe(1);
    expect(lines.find((l) => l.ratePlanId === "rp-nightly")?.units).toBe(5);
    // Greedy should NOT bill weeklies here because 5 nights < 7. Confirm.
    expect(lines.find((l) => l.ratePlanId === "rp-weekly")).toBeUndefined();
    const total = lines.reduce((s, l) => s + l.amountCents, 0);
    expect(total).toBe(90000);
  });

  it("60 nights with full plan set → 2 monthly (NOT 1 monthly + 30 nightly)", () => {
    const lines = packRatePlans(fullPlanSet, stayOf(60));
    expect(lines).toHaveLength(1);
    expect(lines[0].ratePlanId).toBe("rp-monthly");
    expect(lines[0].units).toBe(2);
    expect(lines[0].amountCents).toBe(140000);
  });

  it("150 nights with Seasonal in the set → 1 seasonal only", () => {
    const lines = packRatePlans(fullPlanSet, stayOf(150));
    expect(lines).toHaveLength(1);
    expect(lines[0].ratePlanId).toBe("rp-seasonal");
    expect(lines[0].units).toBe(1);
    expect(lines[0].amountCents).toBe(200000);
  });

  it("200 nights with Seasonal → 1 seasonal + greedy fill of 50", () => {
    // Greedy walk of 50 days with [monthly:30, weekly:7, nightly:1]:
    //   floor(50/30) = 1 → 30 days, remaining 20
    //   floor(20/7)  = 2 → 14 days, remaining 6
    //   floor(6/1)   = 6 → 6 days, remaining 0
    // Total: seasonal $2000 + monthly $700 + 2×weekly $480 + 6×nightly $240 = $3420.
    const lines = packRatePlans(fullPlanSet, stayOf(200));
    expect(lines.find((l) => l.ratePlanId === "rp-seasonal")?.units).toBe(1);
    expect(lines.find((l) => l.ratePlanId === "rp-monthly")?.units).toBe(1);
    expect(lines.find((l) => l.ratePlanId === "rp-weekly")?.units).toBe(2);
    expect(lines.find((l) => l.ratePlanId === "rp-nightly")?.units).toBe(6);
    const total = lines.reduce((s, l) => s + l.amountCents, 0);
    expect(total).toBe(342000);
  });

  it("SEASON is capped at 1 unit per stay even if the stay is multi-season", () => {
    // 320 nights with only Seasonal (min 150). One season covers 150;
    // remaining 170 nights have no plan → throws.
    expect(() => packRatePlans([seasonalPlan], stayOf(320))).toThrow(
      PricingError,
    );
  });

  it("5 nights with Weekly+Monthly only (no Nightly) → throws naming the gap", () => {
    let thrown: unknown;
    try {
      packRatePlans([weeklyPlan, monthlyPlan], stayOf(5));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(PricingError);
    expect((thrown as PricingError).message).toMatch(/5 night/);
    expect((thrown as PricingError).message).toMatch(/remainder|covers/i);
  });

  it("higher daysPerUnit always wins; priority is a tiebreaker only at equal daysPerUnit", () => {
    // A high-priority Nightly should NOT preempt Weekly when daysPerUnit differs.
    const promotedNightly = { ...nightlyPlan, priority: 999 };
    const lines = packRatePlans([promotedNightly, weeklyPlan], stayOf(14));
    expect(lines).toHaveLength(1);
    expect(lines[0].ratePlanId).toBe("rp-weekly");
  });
});

describe("computeQuote — base", () => {
  it("3 nights × $40 = $120", () => {
    const q = computeQuote(baseRequest);
    expect(q.nights).toBe(3);
    expect(q.baseCents).toBe(12000);
    expect(q.totalCents).toBe(12000);
    expect(q.stayLines).toHaveLength(1);
    expect(q.stayLines[0].ratePlanId).toBe("rp-nightly");
    expect(q.lineItems.filter((li) => li.kind === "BASE")).toHaveLength(1);
  });

  it("rejects 0-night stay", () => {
    expect(() =>
      computeQuote({
        ...baseRequest,
        checkOut: baseRequest.checkIn,
      }),
    ).toThrow(PricingError);
  });

  it("greedy 9-night quote produces two BASE line items", () => {
    const q = computeQuote({
      ...baseRequest,
      checkOut: d("2026-06-19"), // 9 nights from 2026-06-10
      ratePlans: [nightlyPlan, weeklyPlan],
    });
    expect(q.baseCents).toBe(32000);
    expect(q.stayLines).toHaveLength(2);
    expect(q.lineItems.filter((li) => li.kind === "BASE")).toHaveLength(2);
  });

  it("WEEK plan alone covers a 7-night stay", () => {
    const q = computeQuote({
      ...baseRequest,
      checkOut: d("2026-06-17"),
      ratePlans: [weeklyPlan],
    });
    expect(q.baseCents).toBe(24000);
    expect(q.stayLines).toHaveLength(1);
  });
});

describe("computeQuote — modifiers", () => {
  it("FIXED weekend surcharge applies per matching night", () => {
    // 2026-06-12 is Friday (UTC); checkOut=06-13 ⇒ nights are Wed/Thu/Fri.
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
    // Per-night base = $120 / 3 = $40; 10% × 1 Friday = $4.
    const tenPctFri: ModifierInput = {
      id: "m-pct",
      name: "Friday premium",
      siteTypeId: null,
      modifierType: "PERCENT",
      modifierValue: 1000,
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

  it("PERCENT modifier on a multi-line stay uses the FLAT averaged per-night base", () => {
    // 9-night greedy = $320 base. perNightBase = round(32000/9) = 3556 cents.
    // 10% on a single matching night = round(3556 * 1000 / 10000) = 356 cents.
    const fri: ModifierInput = {
      id: "m-fri",
      name: "Fri premium",
      siteTypeId: null,
      modifierType: "PERCENT",
      modifierValue: 1000,
      appliesTo: "DAY_OF_WEEK",
      daysOfWeek: [5],
      startDate: null,
      endDate: null,
      priority: 0,
      active: true,
    };
    // 2026-06-10 is Wed; 9 nights → Wed Thu Fri Sat Sun Mon Tue Wed Thu.
    // Two Fridays would land but checkOut=06-19 stops at 06-18 night, only one Fri (06-12).
    const q = computeQuote({
      ...baseRequest,
      checkOut: d("2026-06-19"),
      ratePlans: [nightlyPlan, weeklyPlan],
      modifiers: [fri],
    });
    expect(q.baseCents).toBe(32000);
    expect(q.modifierTotalCents).toBe(356);
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
    expect(q.modifierTotalCents).toBe(4000);
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
      daysOfWeek: [3, 4, 5],
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
    expect(q.taxCents).toBe(660);
    expect(q.totalCents).toBe(12660);
  });

  it("ADDON tax taxes only addons", () => {
    const q = computeQuote({
      ...baseRequest,
      taxRates: [addonTax],
      addons: [{ id: "a", name: "Ice", priceCents: 500, quantity: 2 }],
    });
    expect(q.taxCents).toBe(80);
    expect(q.totalCents).toBe(13080);
  });

  it("ALL tax taxes both stay and addons", () => {
    const q = computeQuote({
      ...baseRequest,
      taxRates: [allTax],
      addons: [{ id: "a", name: "Ice", priceCents: 500, quantity: 2 }],
    });
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
