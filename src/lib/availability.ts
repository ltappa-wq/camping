// Pure availability logic. No DB calls, no React, no I/O — every input is
// passed in by the caller. The caller is responsible for filtering
// reservations to the ones that should block (e.g. CONFIRMED, CHECKED_IN,
// CHECKED_OUT, plus HELD with heldUntil > now). DRAFT and CANCELLED
// reservations should NOT be passed in.

/**
 * Half-open date interval `[start, end)`. Same convention as Reservation
 * (CLAUDE.md): the checkout day is the day a guest leaves; back-to-back
 * stays where one ends and another starts on the same day do NOT overlap.
 */
export type DateRange = { start: Date; end: Date };

/** Inputs to checkAvailability. */
export type AvailabilityCheck = {
  checkIn: Date;
  checkOut: Date;
  /** Existing reservations on the candidate site, half-open. */
  reservations: ReadonlyArray<{ checkIn: Date; checkOut: Date }>;
  /** Operator-defined property closures, INCLUSIVE on both ends. */
  closedRanges: ReadonlyArray<{ startDate: Date; endDate: Date }>;
  /**
   * Recurring annual season window expressed as month/day pairs, OR null
   * for year-round. If non-null, all four fields must be set.
   */
  season: SeasonWindow | null;
};

export type SeasonWindow = {
  startMonth: number; // 1-12
  startDay: number; // 1-31
  endMonth: number;
  endDay: number;
};

export type AvailabilityResult = {
  available: boolean;
  /**
   * Human-readable reasons the stay is blocked. Empty if available is true.
   * One reason per blocking factor — multiple may apply.
   */
  reasons: string[];
};

const ONE_DAY_MS = 86_400_000;

/** Number of nights in a half-open [checkIn, checkOut) range. */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / ONE_DAY_MS);
}

/**
 * Standard half-open interval overlap. Two ranges `[a.start, a.end)` and
 * `[b.start, b.end)` overlap iff each starts before the other ends.
 */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/** UTC midnight on the given Y-M-D. Avoids local TZ drift on date arithmetic. */
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Add n calendar days (UTC-safe). */
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * ONE_DAY_MS);
}

/**
 * Materialize a season window for a specific year. If end (month/day) sorts
 * before start, the season wraps into the following year.
 *
 * Returned range is half-open `[start, endExclusive)` where endExclusive is
 * one day past the last operating night — matching the Reservation convention
 * (a checkout on endExclusive is the morning after the last allowed night).
 */
export function seasonWindowForYear(
  season: SeasonWindow,
  year: number,
): DateRange {
  const start = utcDate(year, season.startMonth, season.startDay);
  const wraps =
    season.endMonth < season.startMonth ||
    (season.endMonth === season.startMonth && season.endDay < season.startDay);
  const endYear = wraps ? year + 1 : year;
  const lastNight = utcDate(endYear, season.endMonth, season.endDay);
  return { start, end: addDays(lastNight, 1) };
}

/**
 * True if the requested half-open range fits entirely inside a season window
 * for some year. We try the year of checkIn and the prior year to cover the
 * wraparound case (e.g. a Dec 28 → Jan 3 stay sits in the season that started
 * the year before).
 */
function isWithinSeason(
  range: DateRange,
  season: SeasonWindow,
): boolean {
  const candidates = [
    seasonWindowForYear(season, range.start.getUTCFullYear()),
    seasonWindowForYear(season, range.start.getUTCFullYear() - 1),
  ];
  return candidates.some(
    (w) => range.start >= w.start && range.end <= w.end,
  );
}

/**
 * Determine whether a requested stay can be booked on a given site.
 *
 * Pure: no DB calls, no Date.now(). Caller pre-filters the reservation list
 * to those that should block (status ∈ {HELD-with-live-hold, CONFIRMED,
 * CHECKED_IN, CHECKED_OUT}). DRAFT and CANCELLED must NOT be in the list.
 */
export function checkAvailability(args: AvailabilityCheck): AvailabilityResult {
  const reasons: string[] = [];
  const requested: DateRange = { start: args.checkIn, end: args.checkOut };

  if (!(args.checkIn < args.checkOut)) {
    reasons.push("Check-out must be after check-in");
    return { available: false, reasons };
  }

  if (args.season && !isWithinSeason(requested, args.season)) {
    reasons.push("Outside the property's operating season");
  }

  for (const closed of args.closedRanges) {
    // ClosedDateRange is INCLUSIVE on both ends; convert to half-open
    // [start, endExclusive) for the overlap check.
    const closedHalfOpen: DateRange = {
      start: closed.startDate,
      end: addDays(closed.endDate, 1),
    };
    if (rangesOverlap(requested, closedHalfOpen)) {
      reasons.push("Property is closed during part of the requested stay");
      break;
    }
  }

  const conflict = args.reservations.find((r) =>
    rangesOverlap(requested, { start: r.checkIn, end: r.checkOut }),
  );
  if (conflict) {
    reasons.push("Site is already booked for part of the requested stay");
  }

  return { available: reasons.length === 0, reasons };
}
