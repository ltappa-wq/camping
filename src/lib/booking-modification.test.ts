import { describe, expect, it } from "vitest";

import { checkModificationCutoff } from "./booking-modification";

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
