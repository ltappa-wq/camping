import { describe, expect, it } from "vitest";

import {
  buildManualReservationPayload,
  type BuildPayloadInput,
} from "./manual-reservation";
import type {
  RatePlanInput,
  ModifierInput,
  TaxRateInput,
  AddonInput,
} from "./pricing";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const NIGHTLY_PLAN: RatePlanInput = {
  id: "plan-nightly",
  name: "Nightly",
  siteTypeId: null,
  chargeUnit: "NIGHT",
  pricePerUnitCents: 4000, // $40
  minStayDays: 1,
  maxStayDays: null,
  effectiveFrom: null,
  effectiveTo: null,
  priority: 0,
  active: true,
};

const baseInput = (
  overrides: Partial<BuildPayloadInput> = {},
): BuildPayloadInput => ({
  checkIn: d("2026-06-01"),
  checkOut: d("2026-06-04"), // 3 nights
  siteTypeId: "type-1",
  ratePlans: [NIGHTLY_PLAN],
  modifiers: [] as ModifierInput[],
  taxRates: [] as TaxRateInput[],
  addons: [] as AddonInput[],
  override: { kind: "none" },
  payment: { kind: "unpaid" },
  ...overrides,
});

describe("buildManualReservationPayload — straight quote", () => {
  it("3 nights at $40 with no modifiers/tax/addons → $120 total, unpaid", () => {
    const r = buildManualReservationPayload(baseInput());
    expect(r.subtotalCents).toBe(12_000);
    expect(r.taxCents).toBe(0);
    expect(r.totalCents).toBe(12_000);
    expect(r.paidCents).toBe(0);
    expect(r.shouldCreatePayment).toBe(false);
    expect(r.isComp).toBe(false);
    expect(r.stayType).toBe("NIGHTLY");
    expect(r.lineItems).toHaveLength(1); // BASE only
    expect(r.lineItems[0].type).toBe("STAY");
    expect(r.lineItems[0].amountCents).toBe(12_000);
  });

  it("paid in cash → paidCents matches, shouldCreatePayment true", () => {
    const r = buildManualReservationPayload(
      baseInput({
        payment: { kind: "paid", method: "CASH", amountCents: 12_000 },
      }),
    );
    expect(r.paidCents).toBe(12_000);
    expect(r.shouldCreatePayment).toBe(true);
  });

  it("paid less than total (deposit) → partial paidCents, payment row still created", () => {
    const r = buildManualReservationPayload(
      baseInput({
        payment: { kind: "paid", method: "CHECK", amountCents: 5_000 },
      }),
    );
    expect(r.totalCents).toBe(12_000);
    expect(r.paidCents).toBe(5_000);
    expect(r.shouldCreatePayment).toBe(true);
  });
});

describe("buildManualReservationPayload — discount override", () => {
  it("$30 discount on $120 stay → $90 total, extra DISCOUNT line", () => {
    const r = buildManualReservationPayload(
      baseInput({
        override: {
          kind: "discount",
          amountCents: 3_000,
          description: "Returning guest",
        },
      }),
    );
    expect(r.totalCents).toBe(9_000);
    expect(r.subtotalCents).toBe(9_000);
    expect(r.lineItems).toHaveLength(2);
    const discount = r.lineItems[1];
    expect(discount.type).toBe("DISCOUNT");
    expect(discount.amountCents).toBe(-3_000);
    expect(discount.description).toBe("Returning guest");
  });

  it("discount exceeding total → total floors at 0, line still negative", () => {
    const r = buildManualReservationPayload(
      baseInput({
        override: {
          kind: "discount",
          amountCents: 50_000,
          description: "Comped via discount",
        },
      }),
    );
    expect(r.totalCents).toBe(0);
    expect(r.subtotalCents).toBe(0);
    expect(r.isComp).toBe(true);
  });

  it("default discount description when blank", () => {
    const r = buildManualReservationPayload(
      baseInput({
        override: { kind: "discount", amountCents: 1_000, description: "" },
      }),
    );
    expect(r.lineItems[1].description).toBe("Operator discount");
  });
});

describe("buildManualReservationPayload — total override", () => {
  it("override total of $200 → single STAY line, no engine call", () => {
    const r = buildManualReservationPayload(
      baseInput({
        override: {
          kind: "total",
          amountCents: 20_000,
          description: "Bespoke weekly rate",
        },
      }),
    );
    expect(r.totalCents).toBe(20_000);
    expect(r.subtotalCents).toBe(20_000);
    expect(r.taxCents).toBe(0);
    expect(r.lineItems).toHaveLength(1);
    expect(r.lineItems[0].type).toBe("STAY");
    expect(r.lineItems[0].description).toBe("Bespoke weekly rate");
    expect(r.lineItems[0].amountCents).toBe(20_000);
    expect(r.isComp).toBe(false);
  });

  it("override-total with no rate plans available — succeeds (engine not called)", () => {
    // Regular quote would throw PricingError for an unsupported stay length;
    // override-total bypasses the engine entirely.
    const r = buildManualReservationPayload(
      baseInput({
        ratePlans: [], // intentionally empty
        override: {
          kind: "total",
          amountCents: 5_000,
          description: "Walk-up special",
        },
      }),
    );
    expect(r.totalCents).toBe(5_000);
  });

  it("comp ($0 total) → isComp true, no payment row even when paid kind set", () => {
    const r = buildManualReservationPayload(
      baseInput({
        override: { kind: "total", amountCents: 0, description: "" },
        payment: { kind: "paid", method: "COMP", amountCents: 0 },
      }),
    );
    expect(r.totalCents).toBe(0);
    expect(r.paidCents).toBe(0);
    expect(r.shouldCreatePayment).toBe(false);
    expect(r.isComp).toBe(true);
    expect(r.lineItems[0].description).toBe("Complimentary stay");
  });

  it("negative override total → floors at 0", () => {
    const r = buildManualReservationPayload(
      baseInput({
        override: {
          kind: "total",
          amountCents: -100,
          description: "fat-finger",
        },
      }),
    );
    expect(r.totalCents).toBe(0);
    expect(r.isComp).toBe(true);
  });
});

describe("buildManualReservationPayload — Confirmed-unpaid", () => {
  it("payment.kind=unpaid + non-zero total → paidCents 0, no payment row", () => {
    const r = buildManualReservationPayload(baseInput());
    expect(r.totalCents).toBe(12_000);
    expect(r.paidCents).toBe(0);
    expect(r.shouldCreatePayment).toBe(false);
  });
});
