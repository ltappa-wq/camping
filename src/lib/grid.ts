// Pure data-shaping for the reservation grid. Given a flat list of
// reservations and a date window, produce the matrix the renderer walks
// — sites grouped by type, reservations placed as half-open segments
// clipped to the visible range. No I/O, no React, fast to test.

import type { ReservationStatus } from "@prisma/client";

const ONE_DAY_MS = 86_400_000;

export type GridReservationInput = {
  id: string;
  siteId: string;
  status: ReservationStatus;
  /** Date-only midnight UTC. */
  checkIn: Date;
  /** Date-only midnight UTC. Half-open: a 3-night stay May 1–4 has
   *  checkOut = May 4 and visually fills May 1, 2, 3. */
  checkOut: Date;
  totalCents: number;
  guestName: string;
};

export type GridSiteInput = {
  id: string;
  label: string;
  siteTypeId: string;
  siteTypeName: string;
};

export type GridSegment = {
  reservationId: string;
  /** 0-based index into days[] (clamped to range). */
  startDayIndex: number;
  /** Half-open exclusive index. */
  endDayIndex: number;
  /** True when the actual checkIn is earlier than the visible range. */
  startsBeforeRange: boolean;
  /** True when the actual checkOut is later than the visible range. */
  endsAfterRange: boolean;
  guestName: string;
  guestLastName: string;
  status: ReservationStatus;
  totalCents: number;
  /** YYYY-MM-DD of the actual reservation, not the clipped segment. */
  checkInDate: string;
  checkOutDate: string;
  nights: number;
};

export type GridSiteRow = {
  siteId: string;
  siteLabel: string;
  siteTypeId: string;
  siteTypeName: string;
  segments: GridSegment[];
};

export type GridSiteTypeGroup = {
  siteTypeId: string;
  siteTypeName: string;
  rows: GridSiteRow[];
};

export type GridMatrix = {
  /** YYYY-MM-DD per visible column. */
  days: string[];
  /** Sites grouped by site type. Group order is alphabetical by name;
   *  rows within a group are natural-sorted by label ("2" < "10" < "A1"). */
  groups: GridSiteTypeGroup[];
};

export type BuildGridMatrixInput = {
  /** Midnight-UTC of the first visible day. */
  rangeStart: Date;
  /** Number of columns. */
  dayCount: number;
  sites: ReadonlyArray<GridSiteInput>;
  reservations: ReadonlyArray<GridReservationInput>;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "Guest";
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] ?? trimmed;
}

export function buildGridMatrix(input: BuildGridMatrixInput): GridMatrix {
  const { rangeStart, dayCount, sites, reservations } = input;
  if (dayCount <= 0) return { days: [], groups: [] };

  // Build the day-label array.
  const days: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    days.push(ymd(new Date(rangeStart.getTime() + i * ONE_DAY_MS)));
  }
  const rangeEndExclusive = new Date(
    rangeStart.getTime() + dayCount * ONE_DAY_MS,
  );

  // Group sites by type, preserving stable order via Intl.Collator.
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });

  const groupsMap = new Map<string, GridSiteTypeGroup>();
  for (const s of sites) {
    let g = groupsMap.get(s.siteTypeId);
    if (!g) {
      g = {
        siteTypeId: s.siteTypeId,
        siteTypeName: s.siteTypeName,
        rows: [],
      };
      groupsMap.set(s.siteTypeId, g);
    }
    g.rows.push({
      siteId: s.id,
      siteLabel: s.label,
      siteTypeId: s.siteTypeId,
      siteTypeName: s.siteTypeName,
      segments: [],
    });
  }
  for (const g of groupsMap.values()) {
    g.rows.sort((a, b) => collator.compare(a.siteLabel, b.siteLabel));
  }
  const groups = [...groupsMap.values()].sort((a, b) =>
    collator.compare(a.siteTypeName, b.siteTypeName),
  );

  // Index rows by siteId for O(1) placement lookup.
  const rowBySiteId = new Map<string, GridSiteRow>();
  for (const g of groups) {
    for (const r of g.rows) {
      rowBySiteId.set(r.siteId, r);
    }
  }

  for (const r of reservations) {
    // Skip reservations entirely outside the range.
    if (r.checkIn.getTime() >= rangeEndExclusive.getTime()) continue;
    if (r.checkOut.getTime() <= rangeStart.getTime()) continue;

    const row = rowBySiteId.get(r.siteId);
    if (!row) continue; // reservation is on a site not in our matrix

    const rawStart = Math.floor(
      (r.checkIn.getTime() - rangeStart.getTime()) / ONE_DAY_MS,
    );
    const rawEnd = Math.ceil(
      (r.checkOut.getTime() - rangeStart.getTime()) / ONE_DAY_MS,
    );
    const startDayIndex = Math.max(0, rawStart);
    const endDayIndex = Math.min(dayCount, rawEnd);

    // Sanity: a clip that produces zero-width segments should be skipped
    // rather than rendered. Happens only on degenerate inputs.
    if (endDayIndex <= startDayIndex) continue;

    const nights = Math.round(
      (r.checkOut.getTime() - r.checkIn.getTime()) / ONE_DAY_MS,
    );

    row.segments.push({
      reservationId: r.id,
      startDayIndex,
      endDayIndex,
      startsBeforeRange: rawStart < 0,
      endsAfterRange: rawEnd > dayCount,
      guestName: r.guestName,
      guestLastName: lastNameOf(r.guestName),
      status: r.status,
      totalCents: r.totalCents,
      checkInDate: ymd(r.checkIn),
      checkOutDate: ymd(r.checkOut),
      nights,
    });
  }

  // Sort segments within each row by startDayIndex so adjacent stays
  // render in a natural left-to-right order.
  for (const g of groups) {
    for (const r of g.rows) {
      r.segments.sort(
        (a, b) =>
          a.startDayIndex - b.startDayIndex ||
          a.endDayIndex - b.endDayIndex,
      );
    }
  }

  return { days, groups };
}

/** Day index (0-based) of `target` within a range starting at `rangeStart`,
 *  or null if `target` is outside [rangeStart, rangeStart + dayCount). */
export function dayIndexOf(
  target: Date,
  rangeStart: Date,
  dayCount: number,
): number | null {
  const idx = Math.floor(
    (target.getTime() - rangeStart.getTime()) / ONE_DAY_MS,
  );
  if (idx < 0 || idx >= dayCount) return null;
  return idx;
}
