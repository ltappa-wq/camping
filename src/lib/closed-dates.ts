// Pure helpers for the operator-facing closed-dates UI. Detect overlaps
// with existing reservations so we can warn (not block) when a new
// closure covers a date someone has already booked.
//
// Convention reminder:
//   ClosedDateRange is inclusive on both ends — startDate and endDate
//   are both "closed" days, so a one-day closure has start === end.
//   Reservations use half-open [checkIn, checkOut) — the checkout day
//   is the day the guest leaves, not a stay night.
// A closure overlaps a reservation iff there is at least one day that
// is both closed AND a stay night.

const ONE_DAY_MS = 86_400_000;

export type ClosedRangeInput = {
  startDate: Date;
  endDate: Date;
};

export type ReservationInterval = {
  checkIn: Date;
  checkOut: Date;
};

/**
 * Returns true when the inclusive `[start, end]` closure shares at least
 * one stay-night with the half-open `[checkIn, checkOut)` reservation.
 */
export function closedRangeOverlapsReservation(
  closure: ClosedRangeInput,
  reservation: ReservationInterval,
): boolean {
  // Closure inclusive end → exclusive end is endDate + 1 day.
  const closureExclusiveEnd = new Date(closure.endDate.getTime() + ONE_DAY_MS);
  return (
    closure.startDate < reservation.checkOut &&
    closureExclusiveEnd > reservation.checkIn
  );
}

/**
 * How many of `reservations` overlap the proposed closure. Used by the
 * admin UI to show a "N reservations exist in this range" warning at
 * save time so operators can decide whether to proceed.
 */
export function countReservationsOverlappingClosure(
  closure: ClosedRangeInput,
  reservations: ReadonlyArray<ReservationInterval>,
): number {
  let n = 0;
  for (const r of reservations) {
    if (closedRangeOverlapsReservation(closure, r)) n++;
  }
  return n;
}

/** True when `endDate` is on or after `startDate`. Both are date-only. */
export function isClosedRangeOrdered(closure: ClosedRangeInput): boolean {
  return closure.endDate >= closure.startDate;
}
