import Link from "next/link";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/money";
import { FilterBar } from "./_components/filter-bar";
import { SortableHeader } from "./_components/sortable-header";
import { buildOrderBy, buildWhere, parseFilters } from "./_lib/query";

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  HELD: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  CHECKED_IN: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CHECKED_OUT: "bg-muted text-muted-foreground",
  CANCELLED: "bg-destructive/10 text-destructive",
  NO_SHOW: "bg-destructive/10 text-destructive line-through",
  DRAFT: "bg-muted text-muted-foreground",
};

const ONE_DAY_MS = 86_400_000;

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOperatorPropertyOrSetup();
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [rows, siteTypes] = await Promise.all([
    ctx.prisma.reservation.findMany({
      where: buildWhere(ctx.propertyId, filters),
      orderBy: buildOrderBy(filters),
      include: {
        site: { select: { label: true } },
        guest: { select: { name: true, email: true } },
      },
      take: 500,
    }),
    ctx.prisma.siteType.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Operator names are pulled in a single batch keyed by id, then joined in
  // memory — beats a per-row lookup or a relation include with no FK.
  const operatorIds = Array.from(
    new Set(
      rows.map((r) => r.createdByOperatorId).filter((id): id is string => !!id),
    ),
  );
  const operators =
    operatorIds.length > 0
      ? await ctx.prisma.operatorUser.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, name: true },
        })
      : [];
  const operatorById = new Map(operators.map((o) => [o.id, o.name]));

  const csvHref = `/api/admin/reservations/export.csv?${buildSearch(sp)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservations"
        description={`${rows.length} reservation${rows.length === 1 ? "" : "s"} match the current filters.`}
      />

      <FilterBar filters={filters} siteTypes={siteTypes} csvHref={csvHref} />

      {rows.length === 0 ? (
        <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
          No reservations match these filters. Adjust the filters above or{" "}
          <Link href="/admin/reservations" className="underline">
            reset
          </Link>
          .
        </div>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader
                    field="confirmationCode"
                    label="Code"
                    filters={filters}
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    field="guest"
                    label="Guest"
                    filters={filters}
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    field="site"
                    label="Site"
                    filters={filters}
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    field="checkIn"
                    label="Check-in"
                    filters={filters}
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    field="checkOut"
                    label="Check-out"
                    filters={filters}
                  />
                </TableHead>
                <TableHead className="text-right">Nights</TableHead>
                <TableHead>
                  <SortableHeader
                    field="status"
                    label="Status"
                    filters={filters}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    field="totalCents"
                    label="Total"
                    filters={filters}
                    align="right"
                  />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    field="paidCents"
                    label="Paid"
                    filters={filters}
                    align="right"
                  />
                </TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>
                  <SortableHeader
                    field="createdAt"
                    label="Created"
                    filters={filters}
                  />
                </TableHead>
                <TableHead>Created by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const nights = Math.round(
                  (r.checkOut.getTime() - r.checkIn.getTime()) / ONE_DAY_MS,
                );
                const balance =
                  r.totalCents - r.paidCents + r.refundedCents;
                const createdBy = r.createdByOperatorId
                  ? (operatorById.get(r.createdByOperatorId) ?? "Operator")
                  : "Guest checkout";
                return (
                  <TableRow key={r.id} className="hover:bg-muted/40">
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/admin/reservations/${r.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {r.confirmationCode}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/reservations/${r.id}`}>
                        <div className="font-medium">{r.guest.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.guest.email}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>{r.site.label}</TableCell>
                    <TableCell className="tabular-nums">
                      {r.checkIn.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.checkOut.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {nights}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          STATUS_TONE[r.status] ??
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {r.status.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(r.totalCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(r.paidCents)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        balance > 0
                          ? "text-destructive"
                          : balance < 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {balance === 0
                        ? "—"
                        : balance > 0
                          ? formatCents(balance)
                          : `−${formatCents(-balance)}`}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {r.createdAt.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-xs">{createdBy}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Forward the page's raw search params verbatim to the CSV endpoint so
 *  the export matches the visible table exactly. */
function buildSearch(
  sp: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.append(key, value);
    }
  }
  return params.toString();
}
