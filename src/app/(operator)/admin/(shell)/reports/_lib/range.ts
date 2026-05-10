// Date-range parsing + quick-jump presets shared by every report tab.
// Stays pure (no DB) and timezone-stable (everything works in UTC).

const ONE_DAY_MS = 86_400_000;

export type RangeKey =
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "ytd"
  | "custom";

export type ParsedRange = {
  /** YYYY-MM-DD inclusive lower bound used in the URL. */
  fromIso: string;
  /** YYYY-MM-DD inclusive upper bound used in the URL. */
  toIso: string;
  /** Which preset the URL maps to (or "custom" if dates don't match a preset). */
  rangeKey: RangeKey;
  /** Half-open Date interval used by the aggregation helpers. */
  start: Date;
  end: Date;
};

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfNextMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

function endOfMonth(d: Date): Date {
  return new Date(startOfNextMonth(d).getTime() - ONE_DAY_MS);
}

function startOfQuarter(d: Date): Date {
  const m = d.getUTCMonth();
  const qStart = m - (m % 3);
  return new Date(Date.UTC(d.getUTCFullYear(), qStart, 1));
}

function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function fmtIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function rangeFromKey(key: RangeKey, today: Date): ParsedRange {
  switch (key) {
    case "this-month": {
      const from = startOfMonth(today);
      const to = endOfMonth(today);
      return {
        rangeKey: "this-month",
        fromIso: fmtIso(from),
        toIso: fmtIso(to),
        start: from,
        end: new Date(to.getTime() + ONE_DAY_MS),
      };
    }
    case "last-month": {
      const lastMonth = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
      );
      const to = endOfMonth(lastMonth);
      return {
        rangeKey: "last-month",
        fromIso: fmtIso(lastMonth),
        toIso: fmtIso(to),
        start: lastMonth,
        end: new Date(to.getTime() + ONE_DAY_MS),
      };
    }
    case "this-quarter": {
      const from = startOfQuarter(today);
      const to = endOfMonth(
        new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 2, 1)),
      );
      return {
        rangeKey: "this-quarter",
        fromIso: fmtIso(from),
        toIso: fmtIso(to),
        start: from,
        end: new Date(to.getTime() + ONE_DAY_MS),
      };
    }
    case "ytd": {
      const from = startOfYear(today);
      return {
        rangeKey: "ytd",
        fromIso: fmtIso(from),
        toIso: fmtIso(today),
        start: from,
        end: new Date(today.getTime() + ONE_DAY_MS),
      };
    }
    case "custom":
      // Caller must supply explicit dates; returning a usable default.
      return rangeFromKey("this-month", today);
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse from/to query params into a usable range. Returns the
 * "this-month" preset when params are missing or unparseable.
 */
export function parseRangeFromSearchParams(
  searchParams: { from?: string; to?: string },
  today: Date = new Date(),
): ParsedRange {
  const fromOk = searchParams.from && ISO.test(searchParams.from);
  const toOk = searchParams.to && ISO.test(searchParams.to);
  if (!fromOk || !toOk) {
    return rangeFromKey("this-month", today);
  }
  const from = new Date(`${searchParams.from}T00:00:00.000Z`);
  const to = new Date(`${searchParams.to}T00:00:00.000Z`);
  if (to < from) {
    return rangeFromKey("this-month", today);
  }
  // Detect whether these match one of our presets so the chip stays lit.
  for (const key of ["this-month", "last-month", "this-quarter", "ytd"] as const) {
    const preset = rangeFromKey(key, today);
    if (preset.fromIso === searchParams.from && preset.toIso === searchParams.to) {
      return preset;
    }
  }
  return {
    rangeKey: "custom",
    fromIso: searchParams.from!,
    toIso: searchParams.to!,
    start: from,
    end: new Date(to.getTime() + ONE_DAY_MS),
  };
}
