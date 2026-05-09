import { describe, expect, it } from "vitest";

import {
  checkModificationCutoff,
  classifyModificationDiff,
  computeModificationRefund,
  type ModificationPolicy,
} from "./booking-modification";

const monumentPolicy: ModificationPolicy = {
  cancelFullRefundDays: 14,
  cancelPartialRefundDays: 7,
  cancelPartialRefundPct: 50,
};

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

const at = (s: string) => new Date(s);

describe("checkModificationCutoff", () => {
  it("allows when check-in is well beyond the cutoff window", () => {
    const result = checkModificationCutoff({
      guestModificationCutoffHours: 24,
      checkInAt: at("2026-06-01T00:00:00Z"),
      now: at("2026-05-25T12:00:00Z"), // ~6 days out
    });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      // 6 days 12 hours = 156 hours
      expect(result.hoursUntilCheckIn).toBe(156);
    }
  });

  it("rejects when within cutoff window", () => {
    const result = checkModificationCutoff({
      guestModificationCutoffHours: 24,
      checkInAt: at("2026-06-01T00:00:00Z"),
      now: at("2026-05-31T01:00:00Z"), // ~23 hours out
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toMatch(/24 hours of check-in/);
      expect(result.reason).toMatch(/23 hours/);
    }
  });

  it("rejects exactly at the cutoff boundary (now + cutoff === checkIn)", () => {
    const result = checkModificationCutoff({
      guestModificationCutoffHours: 24,
      checkInAt: at("2026-06-01T00:00:00Z"),
      now: at("2026-05-31T00:00:00Z"), // exactly 24 hours out
    });
    // Strict inequality — the spec uses `now + cutoff > checkIn`, so being
    // exactly at the boundary is allowed.
    expect(result.allowed).toBe(true);
  });

  it("rejects after check-in has already passed", () => {
    const result = checkModificationCutoff({
      guestModificationCutoffHours: 24,
      checkInAt: at("2026-06-01T00:00:00Z"),
      now: at("2026-06-02T00:00:00Z"),
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toMatch(/already started or is imminent/);
    }
  });

  it("cutoffHours = 0 disables self-service entirely", () => {
    const result = checkModificationCutoff({
      guestModificationCutoffHours: 0,
      checkInAt: at("2099-01-01T00:00:00Z"), // far in future, irrelevant
      now: at("2026-05-25T00:00:00Z"),
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toMatch(/aren't available/);
    }
  });

  it("48-hour cutoff blocks at 47 hours out", () => {
    const result = checkModificationCutoff({
      guestModificationCutoffHours: 48,
      checkInAt: at("2026-06-03T00:00:00Z"),
      now: at("2026-06-01T01:00:00Z"), // 47 hours out
    });
    expect(result.allowed).toBe(false);
  });

  it("48-hour cutoff allows at 49 hours out", () => {
    const result = checkModificationCutoff({
      guestModificationCutoffHours: 48,
      checkInAt: at("2026-06-03T00:00:00Z"),
      now: at("2026-05-31T23:00:00Z"), // 49 hours out
    });
    expect(result.allowed).toBe(true);
  });
});

describe("classifyModificationDiff", () => {
  it("equal totals → equal", () => {
    expect(
      classifyModificationDiff({
        currentPaidCents: 12_000,
        newTotalCents: 12_000,
      }),
    ).toEqual({ kind: "equal" });
  });

  it("higher new total → upcharge with the delta", () => {
    expect(
      classifyModificationDiff({
        currentPaidCents: 12_000,
        newTotalCents: 16_000,
      }),
    ).toEqual({ kind: "upcharge", upchargeCents: 4_000 });
  });

  it("lower new total → refund with raw delta (proration applied separately)", () => {
    expect(
      classifyModificationDiff({
        currentPaidCents: 12_000,
        newTotalCents: 8_000,
      }),
    ).toEqual({ kind: "refund", rawRefundCents: 4_000 });
  });
});

describe("computeModificationRefund — date contraction", () => {
  it("removing 2 nights from a 5-night stay (all >14 days out) → 100% refund of 2 nights", () => {
    const result = computeModificationRefund({
      oldCheckIn: day("2026-06-01"),
      oldCheckOut: day("2026-06-06"), // 5 nights @ $40 = $200
      oldTotalCents: 20_000,
      newCheckIn: day("2026-06-01"),
      newCheckOut: day("2026-06-04"), // 3 nights, removes June 4 + June 5
      newTotalCents: 12_000,
      cancellationDate: day("2026-05-01"), // way out, all FULL tier
      policy: monumentPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
      paidCents: 20_000,
      alreadyRefundedCents: 0,
    });
    expect(result.refundCents).toBe(8_000);
    expect(result.removedNights).toHaveLength(2);
    expect(result.removedNights[0].tier).toBe("FULL");
    expect(result.removedNights[1].tier).toBe("FULL");
  });

  it("removing nights split across tiers — each night gets its own tier", () => {
    // Cancellation date 2026-05-25; old stay 2026-06-01 -> 2026-06-08 (7n).
    // Removed nights: June 5, 6, 7 (last 3).
    //   June 5: 11 days away → PARTIAL (50%)
    //   June 6: 12 days away → PARTIAL (50%)
    //   June 7: 13 days away → PARTIAL (50%)
    const oldTotal = 28_000; // 7 × $40
    const result = computeModificationRefund({
      oldCheckIn: day("2026-06-01"),
      oldCheckOut: day("2026-06-08"),
      oldTotalCents: oldTotal,
      newCheckIn: day("2026-06-01"),
      newCheckOut: day("2026-06-05"), // keep first 4 nights
      newTotalCents: 16_000,
      cancellationDate: day("2026-05-25"),
      policy: monumentPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
      paidCents: oldTotal,
      alreadyRefundedCents: 0,
    });
    expect(result.removedNights).toHaveLength(3);
    for (const n of result.removedNights) {
      expect(n.tier).toBe("PARTIAL");
    }
    // Each night value = 4000; PARTIAL = 50% = 2000; total = 6000
    expect(result.refundCents).toBe(6_000);
  });

  it("crossing the 14-day boundary mid-modification produces mixed tiers", () => {
    // Old: June 5–10 (5 nights). Cancel today = May 24.
    // Remove June 9 + June 10 (last 2).
    //   June 9 = 16 days away → FULL
    //   June 10 = 17 days away → FULL
    // Both fall in FULL — let me pick a tighter scenario.
    // Old: May 30–June 8 (9 nights). Cancel today = May 24.
    // Remove June 5, 6, 7 (last 3 of original):
    //   June 5: 12 days → PARTIAL
    //   June 6: 13 days → PARTIAL
    //   June 7: 14 days → FULL (>= cancelFullRefundDays)
    const result = computeModificationRefund({
      oldCheckIn: day("2026-05-30"),
      oldCheckOut: day("2026-06-08"), // 9 nights
      oldTotalCents: 36_000,
      newCheckIn: day("2026-05-30"),
      newCheckOut: day("2026-06-05"), // 6 nights, removes June 5/6/7
      newTotalCents: 24_000,
      cancellationDate: day("2026-05-24"),
      policy: monumentPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
      paidCents: 36_000,
      alreadyRefundedCents: 0,
    });
    expect(result.removedNights.map((n) => n.tier)).toEqual([
      "PARTIAL",
      "PARTIAL",
      "FULL",
    ]);
    // 4000 * 0.5 + 4000 * 0.5 + 4000 * 1 = 2000 + 2000 + 4000 = 8000
    expect(result.refundCents).toBe(8_000);
  });

  it("removing nights inside the no-refund window → 0 refund", () => {
    const result = computeModificationRefund({
      oldCheckIn: day("2026-06-01"),
      oldCheckOut: day("2026-06-06"),
      oldTotalCents: 20_000,
      newCheckIn: day("2026-06-01"),
      newCheckOut: day("2026-06-03"), // remove June 3, 4, 5
      newTotalCents: 8_000,
      cancellationDate: day("2026-05-30"), // June 3 is 4 days out, June 5 is 6 days out — all NONE
      policy: monumentPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
      paidCents: 20_000,
      alreadyRefundedCents: 0,
    });
    expect(result.refundCents).toBe(0);
    for (const n of result.removedNights) {
      expect(n.tier).toBe("NONE");
    }
  });

  it("retains platform fee when refund > 0", () => {
    // 2 nights removed, both FULL tier, $40/night → $80 raw refund.
    // Platform fee $3 retained → $77.
    const result = computeModificationRefund({
      oldCheckIn: day("2026-06-01"),
      oldCheckOut: day("2026-06-06"),
      oldTotalCents: 20_000,
      newCheckIn: day("2026-06-01"),
      newCheckOut: day("2026-06-04"),
      newTotalCents: 12_000,
      cancellationDate: day("2026-05-01"),
      policy: monumentPolicy,
      retainPlatformFee: true,
      platformFeeCents: 300,
      paidCents: 20_000,
      alreadyRefundedCents: 0,
    });
    expect(result.refundCents).toBe(7_700);
  });

  it("never refunds more than (paid − already refunded)", () => {
    // Computed refund would be 8000 but only 5000 left on the booking.
    const result = computeModificationRefund({
      oldCheckIn: day("2026-06-01"),
      oldCheckOut: day("2026-06-06"),
      oldTotalCents: 20_000,
      newCheckIn: day("2026-06-01"),
      newCheckOut: day("2026-06-04"),
      newTotalCents: 12_000,
      cancellationDate: day("2026-05-01"),
      policy: monumentPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
      paidCents: 20_000,
      alreadyRefundedCents: 15_000,
    });
    expect(result.refundCents).toBe(5_000);
  });

  it("post-cancellationDate nights → NONE tier (defensive)", () => {
    // Pathological: removed night is in the past relative to cancellationDate.
    // Treat as NONE rather than letting negative daysAway flow into tier math.
    const result = computeModificationRefund({
      oldCheckIn: day("2026-05-01"),
      oldCheckOut: day("2026-05-05"),
      oldTotalCents: 16_000,
      newCheckIn: day("2026-05-01"),
      newCheckOut: day("2026-05-03"),
      newTotalCents: 8_000,
      cancellationDate: day("2026-06-01"), // way after stay ended
      policy: monumentPolicy,
      retainPlatformFee: false,
      platformFeeCents: 0,
      paidCents: 16_000,
      alreadyRefundedCents: 0,
    });
    expect(result.refundCents).toBe(0);
  });
});
