// Pure aggregations for the operator reports page. All inputs are
// already-loaded data (reservations, payments, sites, closures, season);
// these functions know nothing about Prisma so they're easy to unit test
// with synthetic scenarios.
//
// Conventions in this module:
//   - Stay nights are inclusive of checkIn, exclusive of checkOut.
//   - Closed-date ranges are inclusive on both ends (matching the
//     existing schema convention; see availability.ts).
//   - "Within range" for a per-day metric means the date d satisfies
//     rangeStart <= d < rangeEnd (half-open).

const ONE_DAY_MS = 86_400_000;

export type DateRange = {
  /** Inclusive lower bound. */
  start: Date;
  /** Exclusive upper bound. */
  end: Date;
};

export type ReservationForReports = {
  id: string;
  status: string;
  checkIn: Date;
  checkOut: Date;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  /** When the reservation was confirmed; used for revenue-by-confirmed-date. */
  confirmedAt: Date | null;
};

export type PaymentForReports = {
  applicationFeeCents: number;
  /** When the payment row was created — proxy for when the platform fee
   *  was earned. Used for the platform-fees-in-range computation. */
  createdAt: Date;
};

export type SeasonWindow = {
  startMonth: number; // 1-12
  startDay: number;
  endMonth: number;
  endDay: number;
};

export type ClosedRangeForReports = {
  startDate: Date;
  endDate: Date;
};

// =============================================================================
// Date helpers
// =============================================================================

export function daysInRange(range: DateRange): number {
  return Math.max(
    0,
    Math.round((range.end.getTime() - range.start.getTime()) / ONE_DAY_MS),
  );
}

/** Iterate every day in [start, end) as YYYY-MM-DD strings. */
export function* eachDay(range: DateRange): Generator<Date> {
  for (
    let t = range.start.getTime();
    t < range.end.getTime();
    t += ONE_DAY_MS
  ) {
    yield new Date(t);
  }
}

function inSeason(d: Date, season: SeasonWindow | null): boolean {
  if (!season) return true; // year-round
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const md = m * 100 + day;
  const startMd = season.startMonth * 100 + season.startDay;
  const endMd = season.endMonth * 100 + season.endDay;
  if (startMd <= endMd) {
    return md >= startMd && md <= endMd;
  }
  // Wraps the year boundary (e.g. Nov–Mar)
  return md >= startMd || md <= endMd;
}

function inAnyClosedRange(
  d: Date,
  closures: ReadonlyArray<ClosedRangeForReports>,
): boolean {
  // Closures are inclusive on both ends.
  for (const c of closures) {
    if (d >= c.startDate && d <= c.endDate) return true;
  }
  return false;
}

// =============================================================================
// Revenue
// =============================================================================

export type RevenueBreakdown = {
  grossCents: number;
  refundsCents: number;
  netCents: number;
  platformFeesCents: number;
  payoutCents: number;
  reservationCount: number;
};

/**
 * Sum revenue from reservations CONFIRMED inside the range. We use
 * confirmedAt rather than checkIn so revenue lines up with the day the
 * money landed (the operator's accounting view). CHECKED_IN and
 * CHECKED_OUT count too — they were confirmed earlier, but we filter on
 * confirmedAt being in range, which catches them naturally.
 */
export function computeRevenue(
  reservations: ReadonlyArray<ReservationForReports>,
  payments: ReadonlyArray<PaymentForReports>,
  range: DateRange,
): RevenueBreakdown {
  let gross = 0;
  let refunds = 0;
  let count = 0;
  for (const r of reservations) {
    if (!r.confirmedAt) continue;
    if (r.confirmedAt < range.start || r.confirmedAt >= range.end) continue;
    gross += r.paidCents;
    refunds += r.refundedCents;
    count += 1;
  }
  let platformFees = 0;
  for (const p of payments) {
    if (p.createdAt < range.start || p.createdAt >= range.end) continue;
    platformFees += p.applicationFeeCents;
  }
  const net = gross - refunds;
  // Operator payout = net minus the platform's cut. Bound at 0 in case
  // refunds exceed the net for the window.
  const payout = Math.max(0, net - platformFees);
  return {
    grossCents: gross,
    refundsCents: refunds,
    netCents: net,
    platformFeesCents: platformFees,
    payoutCents: payout,
    reservationCount: count,
  };
}

// =============================================================================
// Occupancy
// =============================================================================

export type OccupancyBreakdown = {
  /** Site-nights actually booked (CONFIRMED+) inside the range. */
  bookedNights: number;
  /** Site-nights theoretically available — sites × in-season-and-open days. */
  availableNights: number;
  /** bookedNights / availableNights (0 when availableNights is 0). */
  occupancyRate: number;
  /** Distinct reservations whose stay overlaps the range. */
  reservationCount: number;
  /** Mean nights per reservation across the contributing reservations. */
  averageStayNights: number;
  /** Average daily rate in cents = revenue / booked nights, 0 if 0 nights. */
  averageDailyRateCents: number;
};

/** Status values that count toward occupancy ("the site was held that night"). */
const OCCUPIED_STATUSES = new Set(["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"]);

/**
 * Count how many of a reservation's nights fall inside `range`. Inclusive
 * lower / exclusive upper on both ends.
 */
function nightsInRange(
  reservation: ReservationForReports,
  range: DateRange,
): number {
  const start = Math.max(reservation.checkIn.getTime(), range.start.getTime());
  const end = Math.min(reservation.checkOut.getTime(), range.end.getTime());
  if (end <= start) return 0;
  return Math.round((end - start) / ONE_DAY_MS);
}

export function computeOccupancy(args: {
  reservations: ReadonlyArray<ReservationForReports>;
  range: DateRange;
  /** Count of currently-active sites (active && !deletedAt). */
  activeSiteCount: number;
  season: SeasonWindow | null;
  closures: ReadonlyArray<ClosedRangeForReports>;
}): OccupancyBreakdown {
  let openDays = 0;
  for (const d of eachDay(args.range)) {
    if (!inSeason(d, args.season)) continue;
    if (inAnyClosedRange(d, args.closures)) continue;
    openDays++;
  }
  const availableNights = openDays * args.activeSiteCount;

  let bookedNights = 0;
  let stayNightSum = 0;
  let stayCount = 0;
  let revenueForRangeCents = 0;
  for (const r of args.reservations) {
    if (!OCCUPIED_STATUSES.has(r.status)) continue;
    const n = nightsInRange(r, args.range);
    if (n === 0) continue;
    bookedNights += n;
    // Per-reservation totals (the whole stay) — not pro-rated.
    const totalNights = Math.round(
      (r.checkOut.getTime() - r.checkIn.getTime()) / ONE_DAY_MS,
    );
    stayNightSum += totalNights;
    stayCount += 1;
    // Pro-rate revenue against the range so ADR averages the right slice.
    if (totalNights > 0) {
      revenueForRangeCents += Math.round((r.paidCents * n) / totalNights);
    }
  }
  return {
    bookedNights,
    availableNights,
    occupancyRate:
      availableNights > 0 ? bookedNights / availableNights : 0,
    reservationCount: stayCount,
    averageStayNights: stayCount > 0 ? stayNightSum / stayCount : 0,
    averageDailyRateCents:
      bookedNights > 0
        ? Math.round(revenueForRangeCents / bookedNights)
        : 0,
  };
}

// =============================================================================
// Occupancy by week (for the chart)
// =============================================================================

export type WeekBucket = {
  /** First day of the bucket (Sunday-aligned). */
  weekStart: Date;
  bookedNights: number;
  availableNights: number;
};

function startOfSundayWeek(d: Date): Date {
  const dayOfWeek = d.getUTCDay(); // 0 = Sun
  return new Date(d.getTime() - dayOfWeek * ONE_DAY_MS);
}

/**
 * Bucket the range into Sunday-aligned weeks and report booked vs
 * available nights per week. The first/last buckets may be partial weeks
 * if `range` doesn't align to Sunday.
 */
export function computeOccupancyByWeek(args: {
  reservations: ReadonlyArray<ReservationForReports>;
  range: DateRange;
  activeSiteCount: number;
  season: SeasonWindow | null;
  closures: ReadonlyArray<ClosedRangeForReports>;
}): WeekBucket[] {
  if (args.range.end <= args.range.start) return [];
  const buckets = new Map<number, WeekBucket>();
  for (const d of eachDay(args.range)) {
    const weekStart = startOfSundayWeek(d);
    const key = weekStart.getTime();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        weekStart,
        bookedNights: 0,
        availableNights: 0,
      };
      buckets.set(key, bucket);
    }
    if (!inSeason(d, args.season) || inAnyClosedRange(d, args.closures)) {
      continue;
    }
    bucket.availableNights += args.activeSiteCount;
  }
  for (const r of args.reservations) {
    if (!OCCUPIED_STATUSES.has(r.status)) continue;
    const start = Math.max(
      r.checkIn.getTime(),
      args.range.start.getTime(),
    );
    const end = Math.min(r.checkOut.getTime(), args.range.end.getTime());
    for (let t = start; t < end; t += ONE_DAY_MS) {
      const d = new Date(t);
      const weekStart = startOfSundayWeek(d).getTime();
      const bucket = buckets.get(weekStart);
      if (bucket) bucket.bookedNights += 1;
    }
  }
  return [...buckets.values()].sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime(),
  );
}
