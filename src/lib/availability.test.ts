import { describe, expect, it } from "vitest";

import {
  checkAvailability,
  nightsBetween,
  rangesOverlap,
  seasonWindowForYear,
  type SeasonWindow,
} from "./availability";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const monumentPointSeason: SeasonWindow = {
  startMonth: 5,
  startDay: 1,
  endMonth: 10,
  endDay: 15,
};

describe("nightsBetween", () => {
  it("counts whole nights between half-open dates", () => {
    expect(nightsBetween(d("2026-05-01"), d("2026-05-04"))).toBe(3);
  });
  it("returns 0 for same-day", () => {
    expect(nightsBetween(d("2026-05-01"), d("2026-05-01"))).toBe(0);
  });
});

describe("rangesOverlap", () => {
  it("back-to-back stays do not overlap (half-open)", () => {
    expect(
      rangesOverlap(
        { start: d("2026-05-01"), end: d("2026-05-03") },
        { start: d("2026-05-03"), end: d("2026-05-05") },
      ),
    ).toBe(false);
  });
  it("partial overlap detected", () => {
    expect(
      rangesOverlap(
        { start: d("2026-05-01"), end: d("2026-05-04") },
        { start: d("2026-05-03"), end: d("2026-05-05") },
      ),
    ).toBe(true);
  });
  it("contained range overlaps", () => {
    expect(
      rangesOverlap(
        { start: d("2026-05-01"), end: d("2026-05-10") },
        { start: d("2026-05-03"), end: d("2026-05-05") },
      ),
    ).toBe(true);
  });
});

describe("seasonWindowForYear", () => {
  it("non-wrapping season uses the same year", () => {
    const w = seasonWindowForYear(monumentPointSeason, 2026);
    expect(w.start.toISOString().slice(0, 10)).toBe("2026-05-01");
    // Half-open: end is the day AFTER the last operating night
    expect(w.end.toISOString().slice(0, 10)).toBe("2026-10-16");
  });
  it("wrapping season ends in the following year", () => {
    const winter: SeasonWindow = {
      startMonth: 11,
      startDay: 1,
      endMonth: 3,
      endDay: 31,
    };
    const w = seasonWindowForYear(winter, 2025);
    expect(w.start.toISOString().slice(0, 10)).toBe("2025-11-01");
    expect(w.end.toISOString().slice(0, 10)).toBe("2026-04-01");
  });
});

describe("checkAvailability", () => {
  const empty = {
    reservations: [],
    closedRanges: [],
    season: monumentPointSeason,
  };

  it("rejects checkOut <= checkIn", () => {
    const r = checkAvailability({
      ...empty,
      checkIn: d("2026-05-05"),
      checkOut: d("2026-05-05"),
    });
    expect(r.available).toBe(false);
    expect(r.reasons[0]).toMatch(/check-out/i);
  });

  it("allows a clean stay inside season", () => {
    const r = checkAvailability({
      ...empty,
      checkIn: d("2026-06-10"),
      checkOut: d("2026-06-13"),
    });
    expect(r.available).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("rejects a stay starting before season opens", () => {
    const r = checkAvailability({
      ...empty,
      checkIn: d("2026-04-29"),
      checkOut: d("2026-05-03"),
    });
    expect(r.available).toBe(false);
    expect(r.reasons.some((m) => /season/i.test(m))).toBe(true);
  });

  it("allows a stay that ends on the season-end day's morning", () => {
    // Last operating night = Oct 15; checkout Oct 16 morning is the boundary.
    const r = checkAvailability({
      ...empty,
      checkIn: d("2026-10-13"),
      checkOut: d("2026-10-16"),
    });
    expect(r.available).toBe(true);
  });

  it("rejects a stay that extends past the season end", () => {
    const r = checkAvailability({
      ...empty,
      checkIn: d("2026-10-14"),
      checkOut: d("2026-10-17"),
    });
    expect(r.available).toBe(false);
  });

  it("year-round (season=null) skips the season check", () => {
    const r = checkAvailability({
      reservations: [],
      closedRanges: [],
      season: null,
      checkIn: d("2026-01-01"),
      checkOut: d("2026-01-04"),
    });
    expect(r.available).toBe(true);
  });

  it("blocks when overlapping a closed range (inclusive ends)", () => {
    const r = checkAvailability({
      reservations: [],
      closedRanges: [{ startDate: d("2026-07-04"), endDate: d("2026-07-06") }],
      season: monumentPointSeason,
      checkIn: d("2026-07-06"), // last closed day
      checkOut: d("2026-07-08"),
    });
    expect(r.available).toBe(false);
    expect(r.reasons.some((m) => /closed/i.test(m))).toBe(true);
  });

  it("allows a stay starting the day after a closed range ends", () => {
    const r = checkAvailability({
      reservations: [],
      closedRanges: [{ startDate: d("2026-07-04"), endDate: d("2026-07-06") }],
      season: monumentPointSeason,
      checkIn: d("2026-07-07"),
      checkOut: d("2026-07-10"),
    });
    expect(r.available).toBe(true);
  });

  it("blocks when a reservation overlaps", () => {
    const r = checkAvailability({
      reservations: [
        { checkIn: d("2026-06-10"), checkOut: d("2026-06-13") },
      ],
      closedRanges: [],
      season: monumentPointSeason,
      checkIn: d("2026-06-12"),
      checkOut: d("2026-06-15"),
    });
    expect(r.available).toBe(false);
    expect(r.reasons.some((m) => /booked/i.test(m))).toBe(true);
  });

  it("permits back-to-back stays (half-open)", () => {
    const r = checkAvailability({
      reservations: [
        { checkIn: d("2026-06-10"), checkOut: d("2026-06-13") },
      ],
      closedRanges: [],
      season: monumentPointSeason,
      checkIn: d("2026-06-13"),
      checkOut: d("2026-06-15"),
    });
    expect(r.available).toBe(true);
  });

  it("reports multiple reasons when multiple things block", () => {
    const r = checkAvailability({
      reservations: [
        { checkIn: d("2026-04-28"), checkOut: d("2026-05-04") },
      ],
      closedRanges: [],
      season: monumentPointSeason,
      checkIn: d("2026-04-29"),
      checkOut: d("2026-05-03"),
    });
    expect(r.available).toBe(false);
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
