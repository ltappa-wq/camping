import { describe, expect, it } from "vitest";

import {
  computeOccupancy,
  computeOccupancyByWeek,
  computeRevenue,
  type ReservationForReports,
} from "./reports";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function r(
  partial: Partial<ReservationForReports> & {
    checkIn: Date;
    checkOut: Date;
  },
): ReservationForReports {
  return {
    id: partial.id ?? "r1",
    status: partial.status ?? "CONFIRMED",
    checkIn: partial.checkIn,
    checkOut: partial.checkOut,
    totalCents: partial.totalCents ?? 0,
    paidCents: partial.paidCents ?? 0,
    refundedCents: partial.refundedCents ?? 0,
    confirmedAt: partial.confirmedAt ?? null,
  };
}

describe("computeRevenue", () => {
  const range = { start: d("2026-07-01"), end: d("2026-08-01") };

  it("sums paidCents and refundedCents for reservations confirmed inside the range", () => {
    const result = computeRevenue(
      [
        r({
          checkIn: d("2026-07-04"),
          checkOut: d("2026-07-07"),
          paidCents: 13500,
          refundedCents: 0,
          confirmedAt: d("2026-07-02"),
        }),
        r({
          id: "r2",
          checkIn: d("2026-07-10"),
          checkOut: d("2026-07-12"),
          paidCents: 9000,
          refundedCents: 4500,
          confirmedAt: d("2026-07-09"),
        }),
        // Outside the range — confirmed before
        r({
          id: "r3",
          checkIn: d("2026-07-15"),
          checkOut: d("2026-07-16"),
          paidCents: 4500,
          confirmedAt: d("2026-06-01"),
        }),
      ],
      [
        { applicationFeeCents: 300, createdAt: d("2026-07-02") },
        { applicationFeeCents: 300, createdAt: d("2026-07-09") },
        // Outside range
        { applicationFeeCents: 300, createdAt: d("2026-08-15") },
      ],
      range,
    );
    expect(result.grossCents).toBe(13500 + 9000);
    expect(result.refundsCents).toBe(4500);
    expect(result.netCents).toBe(13500 + 9000 - 4500);
    expect(result.platformFeesCents).toBe(600);
    expect(result.payoutCents).toBe(13500 + 9000 - 4500 - 600);
    expect(result.reservationCount).toBe(2);
  });

  it("ignores reservations with no confirmedAt", () => {
    const result = computeRevenue(
      [
        r({
          checkIn: d("2026-07-04"),
          checkOut: d("2026-07-07"),
          paidCents: 13500,
          confirmedAt: null,
        }),
      ],
      [],
      range,
    );
    expect(result.grossCents).toBe(0);
    expect(result.reservationCount).toBe(0);
  });

  it("never reports a negative payout", () => {
    const result = computeRevenue(
      [
        r({
          checkIn: d("2026-07-04"),
          checkOut: d("2026-07-07"),
          paidCents: 1000,
          refundedCents: 1000,
          confirmedAt: d("2026-07-02"),
        }),
      ],
      [{ applicationFeeCents: 300, createdAt: d("2026-07-02") }],
      range,
    );
    expect(result.netCents).toBe(0);
    expect(result.payoutCents).toBe(0);
  });
});

describe("computeOccupancy", () => {
  const range = { start: d("2026-07-01"), end: d("2026-07-08") };

  it("computes the rate for a wide-open week with no reservations", () => {
    const result = computeOccupancy({
      reservations: [],
      range,
      activeSiteCount: 5,
      season: null,
      closures: [],
    });
    expect(result.availableNights).toBe(7 * 5);
    expect(result.bookedNights).toBe(0);
    expect(result.occupancyRate).toBe(0);
    expect(result.reservationCount).toBe(0);
    expect(result.averageStayNights).toBe(0);
    expect(result.averageDailyRateCents).toBe(0);
  });

  it("subtracts closed days and out-of-season days from availableNights", () => {
    const result = computeOccupancy({
      reservations: [],
      range, // Jul 1–8 (7 days)
      activeSiteCount: 5,
      // Season is Jul 5 onward, so Jul 1–4 are out of season
      season: { startMonth: 7, startDay: 5, endMonth: 9, endDay: 30 },
      // Jul 6 is closed (inclusive both ends)
      closures: [{ startDate: d("2026-07-06"), endDate: d("2026-07-06") }],
    });
    // Open days within range: Jul 5 (in-season), Jul 7 (in-season),
    // skipping Jul 6 (closed). That's 2 open days × 5 sites = 10.
    expect(result.availableNights).toBe(2 * 5);
  });

  it("counts overlapping reservations and computes an honest rate", () => {
    const result = computeOccupancy({
      reservations: [
        r({
          checkIn: d("2026-07-01"),
          checkOut: d("2026-07-05"),
          status: "CONFIRMED",
          paidCents: 4 * 4000,
        }),
        r({
          id: "r2",
          checkIn: d("2026-07-04"),
          checkOut: d("2026-07-09"),
          status: "CHECKED_IN",
          paidCents: 5 * 6000,
        }),
      ],
      range, // Jul 1–8 (7 days)
      activeSiteCount: 5,
      season: null,
      closures: [],
    });
    // r1 contributes 4 nights inside range (Jul 1–4)
    // r2 contributes 4 nights inside range (Jul 4–7)
    expect(result.bookedNights).toBe(8);
    expect(result.availableNights).toBe(35);
    expect(result.occupancyRate).toBeCloseTo(8 / 35, 6);
    expect(result.reservationCount).toBe(2);
    // r1 is 4 nights, r2 is 5 nights → mean is 4.5
    expect(result.averageStayNights).toBeCloseTo(4.5, 6);
    // ADR: prorated revenue / booked nights.
    // r1: 16000 paid * 4/4 = 16000; r2: 30000 paid * 4/5 = 24000.
    // Total revenue in range = 40000, booked nights = 8 → ADR = 5000.
    expect(result.averageDailyRateCents).toBe(5000);
  });

  it("excludes cancelled and held reservations", () => {
    const result = computeOccupancy({
      reservations: [
        r({
          checkIn: d("2026-07-04"),
          checkOut: d("2026-07-07"),
          status: "CANCELLED",
        }),
        r({
          id: "r2",
          checkIn: d("2026-07-04"),
          checkOut: d("2026-07-07"),
          status: "HELD",
        }),
      ],
      range,
      activeSiteCount: 5,
      season: null,
      closures: [],
    });
    expect(result.bookedNights).toBe(0);
    expect(result.reservationCount).toBe(0);
  });
});

describe("computeOccupancyByWeek", () => {
  it("buckets nights into Sunday-aligned weeks", () => {
    const result = computeOccupancyByWeek({
      // Jul 1, 2026 is a Wednesday → first bucket starts Sun Jun 28
      range: { start: d("2026-07-01"), end: d("2026-07-15") },
      activeSiteCount: 1,
      season: null,
      closures: [],
      reservations: [
        r({
          // Wed Jul 1 → Sat Jul 4, 3 nights, all in bucket starting Sun Jun 28
          checkIn: d("2026-07-01"),
          checkOut: d("2026-07-04"),
          status: "CONFIRMED",
        }),
        r({
          id: "r2",
          // Sun Jul 5 → Tue Jul 7, 2 nights, in bucket starting Sun Jul 5
          checkIn: d("2026-07-05"),
          checkOut: d("2026-07-07"),
          status: "CONFIRMED",
        }),
      ],
    });
    expect(result).toHaveLength(3); // Jun 28, Jul 5, Jul 12 buckets
    expect(result[0]?.weekStart.toISOString().slice(0, 10)).toBe("2026-06-28");
    expect(result[0]?.bookedNights).toBe(3);
    expect(result[1]?.weekStart.toISOString().slice(0, 10)).toBe("2026-07-05");
    expect(result[1]?.bookedNights).toBe(2);
    expect(result[2]?.bookedNights).toBe(0);
  });
});
