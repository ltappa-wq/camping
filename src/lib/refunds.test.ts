import { describe, expect, it } from "vitest";

import { computeRefund, type RefundPolicySnapshot } from "./refunds";

// Monument Point's seeded defaults — used as the baseline policy.
const monumentPointPolicy: RefundPolicySnapshot = {
  cancelFullRefundDays: 14,
  cancelPartialRefundDays: 7,
  cancelPartialRefundPct: 50,
};

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("computeRefund — policy tiers", () => {
  it("20 days before check-in → FULL tier", () => {
    const result = computeRefund({
      paidCents: 12_000,
      alreadyRefundedCents: 0,
      checkInDate: d("2026-06-01"),
      cancellationDate: d("2026-05-12"),
      policy: monumentPointPolicy,
      retainPlatformFee: false,
      platformFeeCents: 300,
    });
    expect(result.policyTier).toBe("FULL");
    expect(result.daysBeforeCheckIn).toBe(20);
    expect(result.suggestedRefundCents).toBe(12_000);
  });

  it("exactly 14 days before → FULL tier (boundary)", () => {
    const result = computeRefund({
      paidCents: 10_000,
      alreadyRefundedCents: 0,
      checkInDate: d("2026-06-15"),
      cancellationDate: d("2026-06-01"),
      policy: monumentPointPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
    });
    expect(result.policyTier).toBe("FULL");
    expect(result.suggestedRefundCents).toBe(10_000);
  });

  it("8 days before check-in → PARTIAL at 50%", () => {
    const result = computeRefund({
      paidCents: 10_000,
      alreadyRefundedCents: 0,
      checkInDate: d("2026-06-09"),
      cancellationDate: d("2026-06-01"),
      policy: monumentPointPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
    });
    expect(result.policyTier).toBe("PARTIAL");
    expect(result.daysBeforeCheckIn).toBe(8);
    expect(result.suggestedRefundCents).toBe(5_000);
    expect(result.reason).toMatch(/50%/);
  });

  it("exactly 7 days before → PARTIAL (boundary)", () => {
    const result = computeRefund({
      paidCents: 10_000,
      alreadyRefundedCents: 0,
      checkInDate: d("2026-06-08"),
      cancellationDate: d("2026-06-01"),
      policy: monumentPointPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
    });
    expect(result.policyTier).toBe("PARTIAL");
    expect(result.suggestedRefundCents).toBe(5_000);
  });

  it("3 days before check-in → NONE", () => {
    const result = computeRefund({
      paidCents: 10_000,
      alreadyRefundedCents: 0,
      checkInDate: d("2026-06-04"),
      cancellationDate: d("2026-06-01"),
      policy: monumentPointPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
    });
    expect(result.policyTier).toBe("NONE");
    expect(result.suggestedRefundCents).toBe(0);
  });

  it("day-of cancellation → NONE", () => {
    const result = computeRefund({
      paidCents: 10_000,
      alreadyRefundedCents: 0,
      checkInDate: d("2026-06-01"),
      cancellationDate: d("2026-06-01"),
      policy: monumentPointPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
    });
    expect(result.policyTier).toBe("NONE");
    expect(result.daysBeforeCheckIn).toBe(0);
    expect(result.suggestedRefundCents).toBe(0);
  });

  it("after check-in → NONE with explanatory reason", () => {
    const result = computeRefund({
      paidCents: 10_000,
      alreadyRefundedCents: 0,
      checkInDate: d("2026-06-01"),
      cancellationDate: d("2026-06-04"),
      policy: monumentPointPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
    });
    expect(result.policyTier).toBe("NONE");
    expect(result.daysBeforeCheckIn).toBe(-3);
    expect(result.suggestedRefundCents).toBe(0);
    expect(result.reason).toMatch(/after arrival/);
  });
});

describe("computeRefund — platform fee retention", () => {
  it("$100 paid + $3 fee, full refund → guest gets $97 back", () => {
    const result = computeRefund({
      paidCents: 10_000,
      alreadyRefundedCents: 0,
      checkInDate: d("2026-06-01"),
      cancellationDate: d("2026-05-01"),
      policy: monumentPointPolicy,
      retainPlatformFee: true,
      platformFeeCents: 300,
    });
    expect(result.policyTier).toBe("FULL");
    expect(result.suggestedRefundCents).toBe(9_700);
  });

  it("paid amount less than platform fee → refund floors at 0, never negative", () => {
    const result = computeRefund({
      paidCents: 200,
      alreadyRefundedCents: 0,
      checkInDate: d("2026-06-01"),
      cancellationDate: d("2026-05-01"),
      policy: monumentPointPolicy,
      retainPlatformFee: true,
      platformFeeCents: 300,
    });
    expect(result.policyTier).toBe("FULL");
    expect(result.suggestedRefundCents).toBe(0);
  });

  it("NONE tier with retainPlatformFee true → still 0 (no fee math applied to 0)", () => {
    const result = computeRefund({
      paidCents: 10_000,
      alreadyRefundedCents: 0,
      checkInDate: d("2026-06-04"),
      cancellationDate: d("2026-06-01"),
      policy: monumentPointPolicy,
      retainPlatformFee: true,
      platformFeeCents: 300,
    });
    expect(result.policyTier).toBe("NONE");
    expect(result.suggestedRefundCents).toBe(0);
  });
});

describe("computeRefund — already-refunded netting", () => {
  it("already-refunded $50, full tier on $100 → $50 remaining", () => {
    const result = computeRefund({
      paidCents: 10_000,
      alreadyRefundedCents: 5_000,
      checkInDate: d("2026-06-01"),
      cancellationDate: d("2026-05-01"),
      policy: monumentPointPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
    });
    expect(result.policyTier).toBe("FULL");
    expect(result.suggestedRefundCents).toBe(5_000);
  });

  it("already over-refunded → floors at 0, never negative", () => {
    const result = computeRefund({
      paidCents: 10_000,
      alreadyRefundedCents: 15_000, // somehow more refunded than paid
      checkInDate: d("2026-06-01"),
      cancellationDate: d("2026-05-01"),
      policy: monumentPointPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
    });
    expect(result.suggestedRefundCents).toBe(0);
  });

  it("partial tier ($50 of $100) with $20 already refunded → $30 remaining", () => {
    const result = computeRefund({
      paidCents: 10_000,
      alreadyRefundedCents: 2_000,
      checkInDate: d("2026-06-09"),
      cancellationDate: d("2026-06-01"),
      policy: monumentPointPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
    });
    expect(result.policyTier).toBe("PARTIAL");
    expect(result.suggestedRefundCents).toBe(3_000);
  });

  it("platform fee + already-refunded interact: $100 paid, $3 fee, $50 already refunded, full tier → $47", () => {
    const result = computeRefund({
      paidCents: 10_000,
      alreadyRefundedCents: 5_000,
      checkInDate: d("2026-06-01"),
      cancellationDate: d("2026-05-01"),
      policy: monumentPointPolicy,
      retainPlatformFee: true,
      platformFeeCents: 300,
    });
    expect(result.suggestedRefundCents).toBe(4_700);
  });
});

describe("computeRefund — partial percentage rounding", () => {
  it("33% of $99.99 → 3333 cents (Math.round half-up)", () => {
    const result = computeRefund({
      paidCents: 9_999,
      alreadyRefundedCents: 0,
      checkInDate: d("2026-06-08"),
      cancellationDate: d("2026-06-01"),
      policy: { ...monumentPointPolicy, cancelPartialRefundPct: 33 },
      retainPlatformFee: false,
      platformFeeCents: 0,
    });
    expect(result.policyTier).toBe("PARTIAL");
    expect(result.suggestedRefundCents).toBe(3_300);
  });
});
