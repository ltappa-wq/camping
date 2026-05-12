import { describe, expect, it } from "vitest";

import { bankersRound } from "./money";

describe("bankersRound", () => {
  it("rounds exact halves toward even", () => {
    // The defining property of half-to-even.
    expect(bankersRound(0.5)).toBe(0);
    expect(bankersRound(1.5)).toBe(2);
    expect(bankersRound(2.5)).toBe(2);
    expect(bankersRound(3.5)).toBe(4);
    expect(bankersRound(4.5)).toBe(4);
    expect(bankersRound(5.5)).toBe(6);
  });

  it("rounds normal non-half values like Math.round", () => {
    expect(bankersRound(2.4)).toBe(2);
    expect(bankersRound(2.6)).toBe(3);
    expect(bankersRound(0)).toBe(0);
    expect(bankersRound(7)).toBe(7);
    expect(bankersRound(7.4999)).toBe(7);
    expect(bankersRound(7.5001)).toBe(8);
  });

  it("handles negatives with the same half-to-even rule", () => {
    // floor(-0.5) = -1, diff = 0.5, floor is odd → +1 → 0
    expect(bankersRound(-0.5)).toBe(0);
    // floor(-1.5) = -2, diff = 0.5, floor is even → return -2
    expect(bankersRound(-1.5)).toBe(-2);
    // floor(-2.5) = -3, diff = 0.5, floor is odd → +1 → -2
    expect(bankersRound(-2.5)).toBe(-2);
    // floor(-3.5) = -4, diff = 0.5, floor is even → return -4
    expect(bankersRound(-3.5)).toBe(-4);
  });

  it("handles non-half negatives", () => {
    expect(bankersRound(-2.4)).toBe(-2);
    expect(bankersRound(-2.6)).toBe(-3);
  });

  it("doesn't get fooled by floating-point near-halves", () => {
    // 0.1 + 0.2 = 0.30000000000000004 — should be a normal floor case,
    // not interpreted as "exactly 0.5".
    expect(bankersRound(0.1 + 0.2)).toBe(0);
    // 1.4999... ish (an actual representable-but-slightly-off value)
    expect(bankersRound(1.4999999999999998)).toBe(1);
  });

  it("preserves integers exactly", () => {
    expect(bankersRound(0)).toBe(0);
    expect(bankersRound(100)).toBe(100);
    expect(bankersRound(-100)).toBe(-100);
  });
});
