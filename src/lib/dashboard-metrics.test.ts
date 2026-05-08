import { describe, expect, it } from "vitest";

import {
  computeDashboardMetrics,
  type DashboardReservationInput,
} from "./dashboard-metrics";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const baseRes = (
  overrides: Partial<DashboardReservationInput> = {},
): DashboardReservationInput => ({
  status: "CONFIRMED",
  checkIn: d("2026-05-10"),
  checkOut: d("2026-05-13"), // 3 nights
  totalCents: 12_000,
  ...overrides,
});

describe("computeDashboardMetrics — arrivals/departures", () => {
  it("counts arrivals with checkIn inside the window", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      activeSiteCount: 0,
      reservations: [
        baseRes({ checkIn: d("2026-05-09"), checkOut: d("2026-05-12") }),
        baseRes({ checkIn: d("2026-05-08"), checkOut: d("2026-05-10") }),
        // Outside window:
        baseRes({ checkIn: d("2026-05-15"), checkOut: d("2026-05-18") }),
      ],
    });
    expect(m.arrivalsCount).toBe(2);
  });

  it("counts departures with checkOut inside the window", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      activeSiteCount: 0,
      reservations: [
        // checkOut on May 10, inside the window → departure
        baseRes({ checkIn: d("2026-05-05"), checkOut: d("2026-05-10") }),
        // checkOut on May 16, after window → not counted
        baseRes({ checkIn: d("2026-05-12"), checkOut: d("2026-05-16") }),
      ],
    });
    expect(m.departuresCount).toBe(1);
  });

  it("excludes CANCELLED, DRAFT, HELD from arrivals + departures", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      activeSiteCount: 0,
      reservations: [
        baseRes({ status: "CANCELLED" }),
        baseRes({ status: "DRAFT" }),
        baseRes({ status: "HELD" }),
      ],
    });
    expect(m.arrivalsCount).toBe(0);
    expect(m.departuresCount).toBe(0);
  });
});

describe("computeDashboardMetrics — occupancy", () => {
  it("35 sites × 7 days, four 3-night stays = 12 / 245 ≈ 4.9%", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      activeSiteCount: 35,
      reservations: [
        baseRes({ checkIn: d("2026-05-08"), checkOut: d("2026-05-11") }),
        baseRes({ checkIn: d("2026-05-09"), checkOut: d("2026-05-12") }),
        baseRes({ checkIn: d("2026-05-10"), checkOut: d("2026-05-13") }),
        baseRes({ checkIn: d("2026-05-11"), checkOut: d("2026-05-14") }),
      ],
    });
    expect(m.totalSiteNights).toBe(245);
    expect(m.bookedSiteNights).toBe(12);
    expect(m.occupancyPct).toBe(4.9);
  });

  it("clips occupancy to window edges", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      activeSiteCount: 1,
      reservations: [
        // 10-night stay starting 3 days before window → 4 nights inside
        baseRes({ checkIn: d("2026-05-05"), checkOut: d("2026-05-15") }),
      ],
    });
    expect(m.bookedSiteNights).toBe(7); // entire window covered
    expect(m.totalSiteNights).toBe(7);
    expect(m.occupancyPct).toBe(100);
  });

  it("0 sites configured → 0% occupancy without divide-by-zero", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      activeSiteCount: 0,
      reservations: [baseRes()],
    });
    expect(m.totalSiteNights).toBe(0);
    expect(m.occupancyPct).toBe(0);
  });

  it("CANCELLED reservations are not counted toward occupancy", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      activeSiteCount: 1,
      reservations: [
        baseRes({ status: "CANCELLED" }),
      ],
    });
    expect(m.bookedSiteNights).toBe(0);
  });

  it("NO_SHOW reservations DO count toward occupancy (site was held)", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      activeSiteCount: 1,
      reservations: [
        baseRes({
          status: "NO_SHOW",
          checkIn: d("2026-05-09"),
          checkOut: d("2026-05-12"),
        }),
      ],
    });
    expect(m.bookedSiteNights).toBe(3);
  });
});

describe("computeDashboardMetrics — pro-rated revenue", () => {
  it("5-night $200 stay with 2 nights overlapping window → $80", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 7, // [05-08, 05-15)
      activeSiteCount: 1,
      reservations: [
        // 5 nights, May 6 → May 11. Overlap May 8/9/10 = 3 nights.
        // Wait: clamp May 6→May 11 with window May 8→May 15: overlap is May 8-May 11 = 3 nights.
        baseRes({
          checkIn: d("2026-05-06"),
          checkOut: d("2026-05-11"),
          totalCents: 20_000,
        }),
      ],
    });
    // 3/5 × $200 = $120
    expect(m.estimatedRevenueCents).toBe(12_000);
  });

  it("entirely-inside reservation → full revenue", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 14,
      activeSiteCount: 1,
      reservations: [
        baseRes({
          checkIn: d("2026-05-10"),
          checkOut: d("2026-05-13"),
          totalCents: 12_000,
        }),
      ],
    });
    expect(m.estimatedRevenueCents).toBe(12_000);
  });

  it("HELD and CANCELLED reservations are excluded from revenue", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      activeSiteCount: 1,
      reservations: [
        baseRes({ status: "HELD", totalCents: 50_000 }),
        baseRes({ status: "CANCELLED", totalCents: 50_000 }),
      ],
    });
    expect(m.estimatedRevenueCents).toBe(0);
  });

  it("NO_SHOW is excluded from revenue (operator may have charged separately)", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      activeSiteCount: 1,
      reservations: [
        baseRes({
          status: "NO_SHOW",
          checkIn: d("2026-05-10"),
          checkOut: d("2026-05-13"),
          totalCents: 12_000,
        }),
      ],
    });
    expect(m.estimatedRevenueCents).toBe(0);
  });
});

describe("computeDashboardMetrics — degenerate inputs", () => {
  it("dayCount = 0 → all metrics zero", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 0,
      activeSiteCount: 35,
      reservations: [baseRes()],
    });
    expect(m).toEqual({
      arrivalsCount: 0,
      departuresCount: 0,
      bookedSiteNights: 0,
      totalSiteNights: 0,
      occupancyPct: 0,
      estimatedRevenueCents: 0,
    });
  });

  it("empty reservation list → zeros except totalSiteNights", () => {
    const m = computeDashboardMetrics({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      activeSiteCount: 35,
      reservations: [],
    });
    expect(m.arrivalsCount).toBe(0);
    expect(m.departuresCount).toBe(0);
    expect(m.bookedSiteNights).toBe(0);
    expect(m.totalSiteNights).toBe(245);
    expect(m.occupancyPct).toBe(0);
    expect(m.estimatedRevenueCents).toBe(0);
  });
});
