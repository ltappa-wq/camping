import { describe, expect, it } from "vitest";

import {
  buildGridMatrix,
  dayIndexOf,
  type GridReservationInput,
  type GridSiteInput,
} from "./grid";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const SITES: GridSiteInput[] = [
  { id: "s1", label: "1", siteTypeId: "t1", siteTypeName: "Wooded" },
  { id: "s2", label: "2", siteTypeId: "t1", siteTypeName: "Wooded" },
  { id: "s10", label: "10", siteTypeId: "t1", siteTypeName: "Wooded" },
  { id: "sA1", label: "A1", siteTypeId: "t2", siteTypeName: "Pull-thru" },
];

const baseReservation = (
  overrides: Partial<GridReservationInput> = {},
): GridReservationInput => ({
  id: "r1",
  siteId: "s1",
  status: "CONFIRMED",
  checkIn: d("2026-05-08"),
  checkOut: d("2026-05-11"), // 3-night stay, half-open
  totalCents: 12_000,
  guestName: "Smith",
  ...overrides,
});

describe("buildGridMatrix — day axis", () => {
  it("produces dayCount labeled YYYY-MM-DD strings", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 3,
      sites: SITES,
      reservations: [],
    });
    expect(m.days).toEqual(["2026-05-08", "2026-05-09", "2026-05-10"]);
  });

  it("dayCount = 0 → empty matrix", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 0,
      sites: SITES,
      reservations: [],
    });
    expect(m.days).toEqual([]);
    expect(m.groups).toEqual([]);
  });
});

describe("buildGridMatrix — site grouping and ordering", () => {
  it("groups by siteType and natural-sorts labels within a group", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      sites: SITES,
      reservations: [],
    });
    expect(m.groups).toHaveLength(2);
    // Group order is alphabetical by name: "Pull-thru" < "Wooded"
    expect(m.groups[0].siteTypeName).toBe("Pull-thru");
    expect(m.groups[1].siteTypeName).toBe("Wooded");
    // Within Wooded: "1" < "2" < "10" (numeric collation)
    const labels = m.groups[1].rows.map((r) => r.siteLabel);
    expect(labels).toEqual(["1", "2", "10"]);
  });
});

describe("buildGridMatrix — segment placement and clipping", () => {
  it("3-night stay starting on rangeStart spans columns [0, 3)", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      sites: SITES,
      reservations: [baseReservation()],
    });
    const seg = m.groups[1].rows[0].segments[0];
    expect(seg.startDayIndex).toBe(0);
    expect(seg.endDayIndex).toBe(3);
    expect(seg.nights).toBe(3);
    expect(seg.startsBeforeRange).toBe(false);
    expect(seg.endsAfterRange).toBe(false);
  });

  it("stay starting before range clips startDayIndex to 0 and flags startsBeforeRange", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 7,
      sites: SITES,
      reservations: [
        baseReservation({
          checkIn: d("2026-05-05"),
          checkOut: d("2026-05-10"),
        }),
      ],
    });
    const seg = m.groups[1].rows[0].segments[0];
    expect(seg.startDayIndex).toBe(0);
    expect(seg.endDayIndex).toBe(2);
    expect(seg.startsBeforeRange).toBe(true);
    expect(seg.endsAfterRange).toBe(false);
    expect(seg.nights).toBe(5); // actual nights, not clipped
  });

  it("stay extending past range clips endDayIndex to dayCount and flags endsAfterRange", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 5,
      sites: SITES,
      reservations: [
        baseReservation({
          checkIn: d("2026-05-10"),
          checkOut: d("2026-05-20"),
        }),
      ],
    });
    const seg = m.groups[1].rows[0].segments[0];
    expect(seg.startDayIndex).toBe(2);
    expect(seg.endDayIndex).toBe(5);
    expect(seg.endsAfterRange).toBe(true);
  });

  it("stay spanning entire range fills columns [0, dayCount)", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 5,
      sites: SITES,
      reservations: [
        baseReservation({
          checkIn: d("2026-05-01"),
          checkOut: d("2026-06-01"),
        }),
      ],
    });
    const seg = m.groups[1].rows[0].segments[0];
    expect(seg.startDayIndex).toBe(0);
    expect(seg.endDayIndex).toBe(5);
    expect(seg.startsBeforeRange).toBe(true);
    expect(seg.endsAfterRange).toBe(true);
  });

  it("stay entirely before range is skipped", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 5,
      sites: SITES,
      reservations: [
        baseReservation({
          checkIn: d("2026-05-01"),
          checkOut: d("2026-05-05"),
        }),
      ],
    });
    expect(m.groups[1].rows[0].segments).toHaveLength(0);
  });

  it("stay entirely after range is skipped", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 5,
      sites: SITES,
      reservations: [
        baseReservation({
          checkIn: d("2026-05-20"),
          checkOut: d("2026-05-25"),
        }),
      ],
    });
    expect(m.groups[1].rows[0].segments).toHaveLength(0);
  });

  it("half-open boundary: a stay ending exactly on rangeStart is excluded", () => {
    // checkOut = rangeStart means the stay ended the morning of rangeStart;
    // no nights overlap the visible range.
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 5,
      sites: SITES,
      reservations: [
        baseReservation({
          checkIn: d("2026-05-05"),
          checkOut: d("2026-05-08"),
        }),
      ],
    });
    expect(m.groups[1].rows[0].segments).toHaveLength(0);
  });

  it("half-open boundary: a stay starting exactly on rangeEnd is excluded", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 5, // range is [05-08, 05-13)
      sites: SITES,
      reservations: [
        baseReservation({
          checkIn: d("2026-05-13"),
          checkOut: d("2026-05-15"),
        }),
      ],
    });
    expect(m.groups[1].rows[0].segments).toHaveLength(0);
  });
});

describe("buildGridMatrix — multi-segment rows and cross-site placement", () => {
  it("segments on the same site sort by startDayIndex", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 14,
      sites: SITES,
      reservations: [
        baseReservation({
          id: "r2",
          checkIn: d("2026-05-15"),
          checkOut: d("2026-05-18"),
          guestName: "Jones",
        }),
        baseReservation({
          id: "r1",
          checkIn: d("2026-05-09"),
          checkOut: d("2026-05-12"),
          guestName: "Smith",
        }),
      ],
    });
    const segs = m.groups[1].rows[0].segments;
    expect(segs.map((s) => s.reservationId)).toEqual(["r1", "r2"]);
  });

  it("reservation on a site not in the matrix is silently dropped", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 5,
      sites: SITES,
      reservations: [
        baseReservation({ siteId: "s-deleted" }),
      ],
    });
    for (const g of m.groups) {
      for (const r of g.rows) {
        expect(r.segments).toHaveLength(0);
      }
    }
  });

  it("guestLastName derives from last whitespace-delimited token", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 5,
      sites: SITES,
      reservations: [
        baseReservation({ guestName: "John Van Buren" }),
      ],
    });
    expect(m.groups[1].rows[0].segments[0].guestLastName).toBe("Buren");
  });

  it("single-name guests fall back to the whole name", () => {
    const m = buildGridMatrix({
      rangeStart: d("2026-05-08"),
      dayCount: 5,
      sites: SITES,
      reservations: [
        baseReservation({ guestName: "Madonna" }),
      ],
    });
    expect(m.groups[1].rows[0].segments[0].guestLastName).toBe("Madonna");
  });
});

describe("dayIndexOf", () => {
  it("returns the day offset from rangeStart", () => {
    expect(dayIndexOf(d("2026-05-10"), d("2026-05-08"), 7)).toBe(2);
  });
  it("returns null when target is before the range", () => {
    expect(dayIndexOf(d("2026-05-01"), d("2026-05-08"), 7)).toBeNull();
  });
  it("returns null when target is at or after rangeEnd (exclusive)", () => {
    expect(dayIndexOf(d("2026-05-15"), d("2026-05-08"), 7)).toBeNull();
  });
});
