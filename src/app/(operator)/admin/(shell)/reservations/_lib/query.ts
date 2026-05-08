import type { Prisma, ReservationStatus } from "@prisma/client";

// Shared filter + sort parsing for the reservations table view and CSV
// export. Consumed by both /admin/reservations (server component) and
// /api/admin/reservations/export.csv (route handler) so the two stay in
// lockstep — the CSV is always exactly what the screen shows.

const ALL_STATUSES: ReservationStatus[] = [
  "DRAFT",
  "HELD",
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "CANCELLED",
  "NO_SHOW",
];

/** Default status filter per spec: everything except cancelled + draft. */
export const DEFAULT_STATUSES: ReservationStatus[] = [
  "HELD",
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "NO_SHOW",
];

export type SortField =
  | "confirmationCode"
  | "guest"
  | "site"
  | "checkIn"
  | "checkOut"
  | "status"
  | "totalCents"
  | "paidCents"
  | "createdAt";

export type SortDir = "asc" | "desc";

export type ParsedFilters = {
  statuses: ReservationStatus[];
  /** YYYY-MM-DD inclusive lower bound on checkIn. */
  from: string;
  /** YYYY-MM-DD inclusive upper bound on checkIn. */
  to: string;
  siteTypeId: string | null;
  siteLabel: string;
  guestQuery: string;
  sort: SortField;
  sortDir: SortDir;
};

function startOfMonth(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function endOfMonth(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseStatuses(raw: string[] | undefined): ReservationStatus[] {
  if (!raw || raw.length === 0) return DEFAULT_STATUSES;
  // Each value can be a single status or comma-separated.
  const flat = raw.flatMap((v) => v.split(",")).map((s) => s.trim());
  const valid = flat.filter((s): s is ReservationStatus =>
    (ALL_STATUSES as string[]).includes(s),
  );
  return valid.length ? Array.from(new Set(valid)) : DEFAULT_STATUSES;
}

function parseSort(raw: string | undefined): {
  field: SortField;
  dir: SortDir;
} {
  if (!raw) return { field: "checkIn", dir: "asc" };
  const [field, dir] = raw.split(":") as [string, string | undefined];
  const validFields: SortField[] = [
    "confirmationCode",
    "guest",
    "site",
    "checkIn",
    "checkOut",
    "status",
    "totalCents",
    "paidCents",
    "createdAt",
  ];
  if (!(validFields as string[]).includes(field)) {
    return { field: "checkIn", dir: "asc" };
  }
  return {
    field: field as SortField,
    dir: dir === "desc" ? "desc" : "asc",
  };
}

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ParsedFilters {
  const statuses = parseStatuses(
    Array.isArray(searchParams.status)
      ? searchParams.status
      : searchParams.status
        ? [searchParams.status]
        : undefined,
  );

  const today = new Date();
  const from =
    typeof searchParams.from === "string" && DATE_RE.test(searchParams.from)
      ? searchParams.from
      : startOfMonth(today);
  const to =
    typeof searchParams.to === "string" && DATE_RE.test(searchParams.to)
      ? searchParams.to
      : endOfMonth(today);

  const siteTypeId =
    typeof searchParams.siteType === "string" && searchParams.siteType
      ? searchParams.siteType
      : null;

  const siteLabel =
    typeof searchParams.siteLabel === "string"
      ? searchParams.siteLabel.trim()
      : "";
  const guestQuery =
    typeof searchParams.q === "string" ? searchParams.q.trim() : "";

  const { field, dir } = parseSort(
    typeof searchParams.sort === "string" ? searchParams.sort : undefined,
  );

  return {
    statuses,
    from,
    to,
    siteTypeId,
    siteLabel,
    guestQuery,
    sort: field,
    sortDir: dir,
  };
}

export function buildWhere(
  propertyId: string,
  filters: ParsedFilters,
): Prisma.ReservationWhereInput {
  const where: Prisma.ReservationWhereInput = {
    propertyId,
    status: { in: filters.statuses },
    checkIn: {
      gte: new Date(`${filters.from}T00:00:00.000Z`),
      lte: new Date(`${filters.to}T00:00:00.000Z`),
    },
  };

  const siteFilter: Prisma.SiteWhereInput = {};
  if (filters.siteTypeId) siteFilter.siteTypeId = filters.siteTypeId;
  if (filters.siteLabel) {
    siteFilter.label = { contains: filters.siteLabel, mode: "insensitive" };
  }
  if (Object.keys(siteFilter).length > 0) {
    where.site = siteFilter;
  }

  if (filters.guestQuery) {
    where.guest = {
      OR: [
        { name: { contains: filters.guestQuery, mode: "insensitive" } },
        { email: { contains: filters.guestQuery, mode: "insensitive" } },
      ],
    };
  }

  return where;
}

export function buildOrderBy(
  filters: ParsedFilters,
): Prisma.ReservationOrderByWithRelationInput[] {
  const dir = filters.sortDir;
  switch (filters.sort) {
    case "guest":
      return [{ guest: { name: dir } }, { confirmationCode: "asc" }];
    case "site":
      return [{ site: { label: dir } }, { confirmationCode: "asc" }];
    case "confirmationCode":
      return [{ confirmationCode: dir }];
    case "status":
      return [{ status: dir }, { checkIn: "asc" }];
    case "totalCents":
      return [{ totalCents: dir }, { confirmationCode: "asc" }];
    case "paidCents":
      return [{ paidCents: dir }, { confirmationCode: "asc" }];
    case "checkOut":
      return [{ checkOut: dir }, { confirmationCode: "asc" }];
    case "createdAt":
      return [{ createdAt: dir }, { confirmationCode: "asc" }];
    case "checkIn":
    default:
      return [{ checkIn: dir }, { confirmationCode: "asc" }];
  }
}

/**
 * Build a query-string for a search-params-driven URL with the given
 * overrides. Use this for sortable column header links: clicking a
 * header keeps every other filter and only changes the sort param.
 */
export function buildQueryString(
  filters: ParsedFilters,
  overrides: Partial<{
    sort: SortField;
    sortDir: SortDir;
  }> = {},
): string {
  const params = new URLSearchParams();
  const defaultStatuses = new Set(DEFAULT_STATUSES);
  const currentStatuses = new Set(filters.statuses);
  const statusesChanged =
    currentStatuses.size !== defaultStatuses.size ||
    [...currentStatuses].some((s) => !defaultStatuses.has(s));
  if (statusesChanged) {
    for (const s of filters.statuses) params.append("status", s);
  }
  params.set("from", filters.from);
  params.set("to", filters.to);
  if (filters.siteTypeId) params.set("siteType", filters.siteTypeId);
  if (filters.siteLabel) params.set("siteLabel", filters.siteLabel);
  if (filters.guestQuery) params.set("q", filters.guestQuery);

  const sort = overrides.sort ?? filters.sort;
  const sortDir = overrides.sortDir ?? filters.sortDir;
  if (sort !== "checkIn" || sortDir !== "asc") {
    params.set("sort", `${sort}:${sortDir}`);
  }
  return params.toString();
}
