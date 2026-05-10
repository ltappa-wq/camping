import { describe, expect, it } from "vitest";

import {
  closedRangeOverlapsReservation,
  countReservationsOverlappingClosure,
  isClosedRangeOrdered,
} from "./closed-dates";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("closedRangeOverlapsReservation", () => {
  it("detects a reservation entirely inside a closure", () => {
    expect(
      closedRangeOverlapsReservation(
        { startDate: d("2026-07-01"), endDate: d("2026-07-10") },
        { checkIn: d("2026-07-04"), checkOut: d("2026-07-07") },
      ),
    ).toBe(true);
  });

  it("detects a closure entirely inside a reservation", () => {
    expect(
      closedRangeOverlapsReservation(
        { startDate: d("2026-07-05"), endDate: d("2026-07-06") },
        { checkIn: d("2026-07-01"), checkOut: d("2026-07-10") },
      ),
    ).toBe(true);
  });

  it("detects an overlap on the closure's last inclusive day", () => {
    // Closure: Jul 4 inclusive (single day)
    // Reservation: check in Jul 4, check out Jul 5 → stays Jul 4 night
    expect(
      closedRangeOverlapsReservation(
        { startDate: d("2026-07-04"), endDate: d("2026-07-04") },
        { checkIn: d("2026-07-04"), checkOut: d("2026-07-05") },
      ),
    ).toBe(true);
  });

  it("does not flag a reservation that ends the day the closure starts", () => {
    // Reservation [Jul 1, Jul 4) — last stay night is Jul 3
    // Closure [Jul 4, Jul 6] — first closed day is Jul 4
    // No shared day.
    expect(
      closedRangeOverlapsReservation(
        { startDate: d("2026-07-04"), endDate: d("2026-07-06") },
        { checkIn: d("2026-07-01"), checkOut: d("2026-07-04") },
      ),
    ).toBe(false);
  });

  it("does not flag a reservation that starts the day after the closure ends", () => {
    // Closure [Jul 1, Jul 3] — last closed day is Jul 3
    // Reservation [Jul 4, Jul 7) — first stay night is Jul 4
    expect(
      closedRangeOverlapsReservation(
        { startDate: d("2026-07-01"), endDate: d("2026-07-03") },
        { checkIn: d("2026-07-04"), checkOut: d("2026-07-07") },
      ),
    ).toBe(false);
  });

  it("treats an inclusive same-day closure as a single closed day", () => {
    // Closure on Jul 4 only; reservation Jul 5–Jul 7 → no overlap.
    expect(
      closedRangeOverlapsReservation(
        { startDate: d("2026-07-04"), endDate: d("2026-07-04") },
        { checkIn: d("2026-07-05"), checkOut: d("2026-07-07") },
      ),
    ).toBe(false);
  });
});

describe("countReservationsOverlappingClosure", () => {
  it("returns 0 for an empty reservation list", () => {
    expect(
      countReservationsOverlappingClosure(
        { startDate: d("2026-07-01"), endDate: d("2026-07-10") },
        [],
      ),
    ).toBe(0);
  });

  it("counts every overlap and ignores adjacencies", () => {
    const closure = {
      startDate: d("2026-07-04"),
      endDate: d("2026-07-06"),
    };
    const overlap = countReservationsOverlappingClosure(closure, [
      // overlaps — starts inside
      { checkIn: d("2026-07-05"), checkOut: d("2026-07-08") },
      // overlaps — ends inside
      { checkIn: d("2026-07-02"), checkOut: d("2026-07-05") },
      // overlaps — full coverage
      { checkIn: d("2026-07-04"), checkOut: d("2026-07-07") },
      // adjacent before (ends Jul 4 morning) — no overlap
      { checkIn: d("2026-07-01"), checkOut: d("2026-07-04") },
      // adjacent after (starts Jul 7) — no overlap
      { checkIn: d("2026-07-07"), checkOut: d("2026-07-10") },
    ]);
    expect(overlap).toBe(3);
  });
});

describe("isClosedRangeOrdered", () => {
  it("accepts equal dates (single-day closure)", () => {
    expect(
      isClosedRangeOrdered({ startDate: d("2026-07-04"), endDate: d("2026-07-04") }),
    ).toBe(true);
  });

  it("accepts end after start", () => {
    expect(
      isClosedRangeOrdered({ startDate: d("2026-07-04"), endDate: d("2026-07-10") }),
    ).toBe(true);
  });

  it("rejects end before start", () => {
    expect(
      isClosedRangeOrdered({ startDate: d("2026-07-10"), endDate: d("2026-07-04") }),
    ).toBe(false);
  });
});
