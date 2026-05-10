import Link from "next/link";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/money";
import {
  computeOccupancy,
  computeOccupancyByWeek,
  computeRevenue,
} from "@/lib/reports";
import { Download } from "lucide-react";
import { OccupancyChart } from "./_components/occupancy-chart";
import { DateRangePicker } from "./_components/date-range-picker";
import {
  parseRangeFromSearchParams,
  rangeFromKey,
} from "./_lib/range";
import {
  loadReportData,
  loadReservationRowsForRange,
} from "./_lib/load";

export const dynamic = "force-dynamic";

type SearchParams = {
  from?: string;
  to?: string;
  tab?: string;
};

const VALID_TABS = ["revenue", "occupancy", "bookings"] as const;
type Tab = (typeof VALID_TABS)[number];

function pickTab(raw: string | undefined): Tab {
  return (VALID_TABS as readonly string[]).includes(raw ?? "")
    ? (raw as Tab)
    : "revenue";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requireOperatorPropertyOrSetup();
  const sp = await searchParams;
  const today = new Date();
  const range = parseRangeFromSearchParams(sp, today);
  const tab = pickTab(sp.tab);

  // Pre-compute all preset boundary dates so the chip click navigation
  // doesn't have to redo timezone-aware date math on the client.
  const presetDates = Object.fromEntries(
    (["this-month", "last-month", "this-quarter", "ytd"] as const).map((k) => {
      const r = rangeFromKey(k, today);
      return [k, { from: r.fromIso, to: r.toIso }];
    }),
  );

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Revenue, occupancy, and bookings for any date window."
      />
      <div className="mb-4">
        <DateRangePicker
          rangeKey={range.rangeKey}
          fromIso={range.fromIso}
          toIso={range.toIso}
          presetDates={presetDates}
        />
      </div>
      <div className="mb-4 flex flex-wrap gap-1 border-b">
        {VALID_TABS.map((t) => {
          const active = t === tab;
          const params = new URLSearchParams({
            tab: t,
            from: range.fromIso,
            to: range.toIso,
          });
          return (
            <Link
              key={t}
              href={`?${params.toString()}`}
              className={`rounded-t-md border-b-2 px-4 py-2 text-sm font-medium capitalize ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </Link>
          );
        })}
      </div>

      {tab === "revenue" ? (
        <RevenueTab
          property={ctx.property}
          range={range}
        />
      ) : null}
      {tab === "occupancy" ? (
        <OccupancyTab property={ctx.property} range={range} />
      ) : null}
      {tab === "bookings" ? (
        <BookingsTab property={ctx.property} range={range} />
      ) : null}
    </div>
  );
}

// =============================================================================
// Revenue tab
// =============================================================================

async function RevenueTab({
  property,
  range,
}: {
  property: { id: string };
  range: ReturnType<typeof parseRangeFromSearchParams>;
}) {
  const data = await loadReportData(property as never, range);
  const revenue = computeRevenue(data.reservations, data.payments, range);
  const rows = await loadReservationRowsForRange(property as never, range);
  const inWindow = rows.filter(
    (r) =>
      r.confirmedAt !== null &&
      r.confirmedAt >= range.start &&
      r.confirmedAt < range.end,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Gross revenue" value={formatCents(revenue.grossCents)} />
        <Kpi label="Refunds" value={formatCents(revenue.refundsCents)} />
        <Kpi label="Net revenue" value={formatCents(revenue.netCents)} />
        <Kpi
          label="Platform fees"
          value={formatCents(revenue.platformFeesCents)}
        />
        <Kpi
          label="Operator payout"
          value={formatCents(revenue.payoutCents)}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Reservations contributing to revenue</CardTitle>
            <CardDescription>
              Confirmed between {range.fromIso} and {range.toIso}.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <a
              href={`/admin/reports/csv/revenue?from=${range.fromIso}&to=${range.toIso}`}
            >
              <Download className="mr-1 h-4 w-4" /> CSV
            </a>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Refunded</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inWindow.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No reservations confirmed in this range.
                  </TableCell>
                </TableRow>
              ) : (
                inWindow.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.confirmationCode}
                    </TableCell>
                    <TableCell>{r.guest.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.checkIn.toISOString().slice(0, 10)} →{" "}
                      {r.checkOut.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(r.totalCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(r.paidCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(r.refundedCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(r.paidCents - r.refundedCents)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Occupancy tab
// =============================================================================

async function OccupancyTab({
  property,
  range,
}: {
  property: { id: string };
  range: ReturnType<typeof parseRangeFromSearchParams>;
}) {
  const data = await loadReportData(property as never, range);
  const occupancy = computeOccupancy({
    reservations: data.reservations,
    range,
    activeSiteCount: data.activeSiteCount,
    season: data.season,
    closures: data.closures,
  });
  const weekly = computeOccupancyByWeek({
    reservations: data.reservations,
    range,
    activeSiteCount: data.activeSiteCount,
    season: data.season,
    closures: data.closures,
  });
  const chartData = weekly.map((w) => ({
    weekIso: w.weekStart.toISOString().slice(0, 10),
    bookedNights: w.bookedNights,
    availableNights: w.availableNights,
    occupancyPct:
      w.availableNights > 0
        ? Math.round((w.bookedNights / w.availableNights) * 100)
        : 0,
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Occupancy rate"
          value={`${Math.round(occupancy.occupancyRate * 1000) / 10}%`}
          sub={`${occupancy.bookedNights} / ${occupancy.availableNights} site-nights`}
        />
        <Kpi
          label="Reservations"
          value={String(occupancy.reservationCount)}
          sub="Overlapping the range"
        />
        <Kpi
          label="Average stay"
          value={`${(Math.round(occupancy.averageStayNights * 10) / 10).toFixed(1)}n`}
          sub="Mean nights"
        />
        <Kpi
          label="ADR"
          value={formatCents(occupancy.averageDailyRateCents)}
          sub="Average daily rate"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Occupancy by week</CardTitle>
          <CardDescription>
            Sunday-aligned. Partial weeks at the edges count only the in-range
            days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OccupancyChart data={chartData} />
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Bookings tab
// =============================================================================

async function BookingsTab({
  property,
  range,
}: {
  property: { id: string };
  range: ReturnType<typeof parseRangeFromSearchParams>;
}) {
  const rows = await loadReservationRowsForRange(property as never, range);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>All reservations</CardTitle>
            <CardDescription>
              Anything overlapping or confirmed inside {range.fromIso} →{" "}
              {range.toIso}.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <a
              href={`/admin/reports/csv/bookings?from=${range.fromIso}&to=${range.toIso}`}
            >
              <Download className="mr-1 h-4 w-4" /> CSV
            </a>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No reservations in this range.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/admin/reservations/${r.id}`}
                        className="hover:underline"
                      >
                        {r.confirmationCode}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>{r.guest.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.guest.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.site.label}
                      <div className="text-xs text-muted-foreground">
                        {r.site.siteType.name}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.checkIn.toISOString().slice(0, 10)} →{" "}
                      {r.checkOut.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(r.totalCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(r.paidCents)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Shared
// =============================================================================

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}
