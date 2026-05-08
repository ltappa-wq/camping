// Pure metrics for the operator dashboard. Given a date window, an
// active-site count, and a list of reservations, compute the KPIs the
// dashboard cards display. No I/O, no React, fast to test.

import type { ReservationStatus } from "@prisma/client";

const ONE_DAY_MS = 86_400_000;

export type DashboardReservationInput = {
  status: ReservationStatus;
  /** Date-only midnight UTC. */
  checkIn: Date;
  /** Date-only midnight UTC. Half-open. */
  checkOut: Date;
  totalCents: number;
};

export type DashboardMetricsInput = {
  /** Midnight UTC of the first day of the window. */
  rangeStart: Date;
  /** Number of days in the window. */
  dayCount: number;
  /** Count of active, non-soft-deleted sites available for booking. */
  activeSiteCount: number;
  reservations: ReadonlyArray<DashboardReservationInput>;
};

export type DashboardMetrics = {
  arrivalsCount: number;
  departuresCount: number;
  /** Sum of nights booked across all overlapping reservations, clipped to
   *  the window. CONFIRMED + CHECKED_IN + CHECKED_OUT count; HELD,
   *  CANCELLED, NO_SHOW, DRAFT do not. */
  bookedSiteNights: number;
  /** activeSiteCount × dayCount. */
  totalSiteNights: number;
  /** bookedSiteNights / totalSiteNights × 100, rounded to 1 decimal. 0
   *  when totalSiteNights is 0 (no sites configured). */
  occupancyPct: number;
  /** Pro-rated revenue: a 5-night $200 stay overlapping 2 window nights
   *  contributes (2/5)*$200 = $80. Same status filter as bookedSiteNights. */
  estimatedRevenueCents: number;
};

/** Overlap in nights between a reservation [checkIn, checkOut) and the
 *  window [rangeStart, rangeEnd) — both half-open. 0 when no overlap. */
function overlapNights(
  checkIn: Date,
  checkOut: Date,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  const start = Math.max(checkIn.getTime(), rangeStart.getTime());
  const end = Math.min(checkOut.getTime(), rangeEnd.getTime());
  if (end <= start) return 0;
  return Math.round((end - start) / ONE_DAY_MS);
}

/** Status filter for "this counts as a real booking" math. CANCELLED and
 *  DRAFT obviously don't; HELD is in-flight payment, not a confirmed
 *  booking; NO_SHOW is excluded from revenue but the operator may have
 *  charged anyway — judgment call. We include NO_SHOW in occupancy
 *  (the site-night was reserved for them) but not revenue. */
function isActiveBooking(status: ReservationStatus): boolean {
  return (
    status === "CONFIRMED" ||
    status === "CHECKED_IN" ||
    status === "CHECKED_OUT"
  );
}

function isHeldOrActive(status: ReservationStatus): boolean {
  return isActiveBooking(status) || status === "NO_SHOW";
}

export function computeDashboardMetrics(
  input: DashboardMetricsInput,
): DashboardMetrics {
  const { rangeStart, dayCount, activeSiteCount, reservations } = input;
  if (dayCount <= 0) {
    return {
      arrivalsCount: 0,
      departuresCount: 0,
      bookedSiteNights: 0,
      totalSiteNights: 0,
      occupancyPct: 0,
      estimatedRevenueCents: 0,
    };
  }

  const rangeEnd = new Date(rangeStart.getTime() + dayCount * ONE_DAY_MS);
  const totalSiteNights = Math.max(0, activeSiteCount) * dayCount;

  let arrivals = 0;
  let departures = 0;
  let bookedSiteNights = 0;
  let estimatedRevenueCents = 0;

  for (const r of reservations) {
    if (r.status === "DRAFT" || r.status === "CANCELLED") continue;

    // Arrival/departure counts use the actual booking dates (no clip to
    // window edges). HELD reservations don't count — they're not yet
    // confirmed.
    if (isActiveBooking(r.status) || r.status === "NO_SHOW") {
      if (
        r.checkIn.getTime() >= rangeStart.getTime() &&
        r.checkIn.getTime() < rangeEnd.getTime()
      ) {
        arrivals++;
      }
      if (
        r.checkOut.getTime() >= rangeStart.getTime() &&
        r.checkOut.getTime() < rangeEnd.getTime()
      ) {
        departures++;
      }
    }

    // Occupancy uses overlap nights, clipped. NO_SHOW reservations are
    // counted because the site was reserved (the no-show didn't free it
    // up — only a CANCELLED would).
    if (isHeldOrActive(r.status)) {
      const overlap = overlapNights(r.checkIn, r.checkOut, rangeStart, rangeEnd);
      bookedSiteNights += overlap;
    }

    // Revenue pro-rates on actual stay nights, only for charged stays.
    if (isActiveBooking(r.status)) {
      const stayNights = Math.round(
        (r.checkOut.getTime() - r.checkIn.getTime()) / ONE_DAY_MS,
      );
      if (stayNights > 0) {
        const overlap = overlapNights(
          r.checkIn,
          r.checkOut,
          rangeStart,
          rangeEnd,
        );
        estimatedRevenueCents += Math.round(
          (r.totalCents * overlap) / stayNights,
        );
      }
    }
  }

  const occupancyPct =
    totalSiteNights > 0
      ? Math.round((bookedSiteNights / totalSiteNights) * 1000) / 10
      : 0;

  return {
    arrivalsCount: arrivals,
    departuresCount: departures,
    bookedSiteNights,
    totalSiteNights,
    occupancyPct,
    estimatedRevenueCents,
  };
}
