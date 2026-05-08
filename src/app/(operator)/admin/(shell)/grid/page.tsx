import Link from "next/link";
import type { ReservationStatus } from "@prisma/client";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/admin/page-header";
import { formatCents } from "@/lib/money";
import {
  buildGridMatrix,
  dayIndexOf,
  type GridSegment,
} from "@/lib/grid";

const ONE_DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COL_PX = 40; // fixed column width — keeps the today line easy to place
const LABEL_PX = 160;

// Status → segment color tokens. Tailwind classes; Cancellation uses an
// inline diagonal-hatch background since we don't have a repeating-pattern
// utility class for that pattern in this project.
const STATUS_STYLE: Record<
  ReservationStatus,
  {
    base: string;
    /** Inline style override when the variant needs a bg pattern. */
    inline?: React.CSSProperties;
  }
> = {
  CONFIRMED: {
    base: "bg-blue-500/20 text-blue-900 dark:text-blue-100 border-blue-500/60",
  },
  HELD: {
    base: "bg-amber-500/20 text-amber-900 dark:text-amber-100 border-amber-500/60 animate-pulse",
  },
  CHECKED_IN: {
    base: "bg-emerald-500/25 text-emerald-900 dark:text-emerald-100 border-emerald-600/60",
  },
  CHECKED_OUT: {
    base: "bg-muted text-muted-foreground border-muted-foreground/30",
  },
  CANCELLED: {
    base: "text-muted-foreground border border-muted-foreground/40",
    inline: {
      backgroundImage:
        "repeating-linear-gradient(45deg, hsl(var(--muted)) 0 4px, transparent 4px 8px)",
    },
  },
  NO_SHOW: {
    base: "text-destructive border border-destructive/60 line-through",
  },
  DRAFT: {
    base: "bg-muted text-muted-foreground border-muted-foreground/30",
  },
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfNextMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

function daysInMonth(d: Date): number {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

function startOfWeekUtc(d: Date): Date {
  // Sunday-start; matches US-default "weekend" mental model.
  const dayOfWeek = d.getUTCDay();
  const start = new Date(d);
  start.setUTCDate(start.getUTCDate() - dayOfWeek);
  return new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function tooltipText(seg: GridSegment): string {
  return [
    seg.guestName,
    `${seg.checkInDate} → ${seg.checkOutDate}`,
    `${seg.nights} night${seg.nights === 1 ? "" : "s"}`,
    formatCents(seg.totalCents),
    seg.status.replace("_", " "),
  ].join("\n");
}

export default async function GridPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOperatorPropertyOrSetup();
  const sp = await searchParams;

  const today = todayUtc();
  const fromParam = typeof sp.from === "string" ? sp.from : "";
  const daysParam = typeof sp.days === "string" ? sp.days : "";

  const rangeStart = DATE_RE.test(fromParam)
    ? new Date(`${fromParam}T00:00:00.000Z`)
    : today;
  const dayCount = (() => {
    const n = Number.parseInt(daysParam, 10);
    if (Number.isFinite(n) && n > 0 && n <= 90) return n;
    return 30;
  })();

  const rangeEnd = new Date(rangeStart.getTime() + dayCount * ONE_DAY_MS);

  // Quick-jump links keep the operator out of the date picker for the
  // common windows.
  const quickJumps = [
    { label: "Today", from: today, days: 7 },
    {
      label: "This week",
      from: startOfWeekUtc(today),
      days: 7,
    },
    { label: "Next 30 days", from: today, days: 30 },
    {
      label: "This month",
      from: startOfMonthUtc(today),
      days: daysInMonth(today),
    },
    {
      label: "Next month",
      from: startOfNextMonthUtc(today),
      days: daysInMonth(startOfNextMonthUtc(today)),
    },
  ] as const;

  const [sites, reservations] = await Promise.all([
    ctx.prisma.site.findMany({
      where: { deletedAt: null, active: true },
      include: { siteType: true },
    }),
    ctx.prisma.reservation.findMany({
      where: {
        // Overlap with [rangeStart, rangeEnd) — half-open.
        checkIn: { lt: rangeEnd },
        checkOut: { gt: rangeStart },
        status: { not: "DRAFT" },
      },
      include: {
        guest: { select: { name: true } },
      },
    }),
  ]);

  const matrix = buildGridMatrix({
    rangeStart,
    dayCount,
    sites: sites
      .filter((s) => s.siteType.deletedAt == null)
      .map((s) => ({
        id: s.id,
        label: s.label,
        siteTypeId: s.siteTypeId,
        siteTypeName: s.siteType.name,
      })),
    reservations: reservations.map((r) => ({
      id: r.id,
      siteId: r.siteId,
      status: r.status,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      totalCents: r.totalCents,
      guestName: r.guest.name,
    })),
  });

  const todayIndex = dayIndexOf(today, rangeStart, dayCount);
  const totalCols = dayCount + 1;
  const gridTemplate = `${LABEL_PX}px repeat(${dayCount}, ${COL_PX}px)`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grid"
        description={`${ymd(rangeStart)} → ${ymd(new Date(rangeEnd.getTime() - ONE_DAY_MS))} · ${dayCount} day${dayCount === 1 ? "" : "s"}`}
      />

      <section className="rounded-md border bg-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {quickJumps.map((q) => {
            const fromYmd = ymd(q.from);
            const isActive =
              ymd(rangeStart) === fromYmd && dayCount === q.days;
            return (
              <Button
                key={q.label}
                asChild
                size="sm"
                variant={isActive ? "default" : "outline"}
              >
                <Link href={`/admin/grid?from=${fromYmd}&days=${q.days}`}>
                  {q.label}
                </Link>
              </Button>
            );
          })}
        </div>

        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs text-muted-foreground">
              Start date
            </Label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={ymd(rangeStart)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="days" className="text-xs text-muted-foreground">
              Days
            </Label>
            <Input
              id="days"
              name="days"
              type="number"
              min={1}
              max={90}
              defaultValue={dayCount}
              className="w-24"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            Apply
          </Button>
        </form>
      </section>

      {matrix.groups.length === 0 ? (
        <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
          No active sites found. Add some at{" "}
          <Link href="/admin/sites" className="underline">
            /admin/sites
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <div
            className="relative grid text-xs"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {/* Header row */}
            <div
              className="sticky top-0 left-0 z-30 border-b border-r bg-card px-2 py-2 font-medium"
              style={{ gridRow: 1 }}
            >
              Site
            </div>
            {matrix.days.map((day, i) => {
              const date = new Date(`${day}T00:00:00.000Z`);
              const dow = WEEKDAY_LABELS[date.getUTCDay()];
              const dayOfMonth = date.getUTCDate();
              const isFirstOfMonth = dayOfMonth === 1;
              const isToday = i === todayIndex;
              return (
                <div
                  key={day}
                  className={[
                    "sticky top-0 z-20 border-b py-2 text-center",
                    isFirstOfMonth ? "border-l-2 border-l-foreground/40" : "border-l border-l-border/60",
                    isToday
                      ? "bg-amber-100/60 dark:bg-amber-950/40 font-bold text-amber-900 dark:text-amber-200"
                      : "bg-card text-muted-foreground",
                  ].join(" ")}
                  style={{ gridRow: 1 }}
                >
                  <div>{dow}</div>
                  <div className="font-mono">{dayOfMonth}</div>
                </div>
              );
            })}

            {/* Group + site rows. We let CSS Grid auto-flow them in
                row-by-row order. The site-label cells use position:sticky
                left:0 so the label stays visible during horizontal
                scroll. */}
            {matrix.groups.flatMap((group, gIdx) => {
              const groupHeaderRow = (
                <div
                  key={`g-${group.siteTypeId}`}
                  className="border-b border-t bg-muted/40 px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  style={{ gridColumn: `1 / ${totalCols + 1}` }}
                >
                  {group.siteTypeName} · {group.rows.length} site
                  {group.rows.length === 1 ? "" : "s"}
                </div>
              );
              const rowFragments = group.rows.flatMap((row) => {
                const cells: React.ReactNode[] = [];
                cells.push(
                  <div
                    key={`label-${row.siteId}`}
                    className="sticky left-0 z-10 border-b border-r bg-card px-2 py-2 text-sm font-medium"
                  >
                    {row.siteLabel}
                  </div>,
                );
                // Empty day cells so grid lines render even on rows with
                // no reservations.
                for (let i = 0; i < dayCount; i++) {
                  const isToday = i === todayIndex;
                  const date = new Date(
                    rangeStart.getTime() + i * ONE_DAY_MS,
                  );
                  const isFirstOfMonth = date.getUTCDate() === 1;
                  cells.push(
                    <div
                      key={`cell-${row.siteId}-${i}`}
                      className={[
                        "border-b h-12",
                        isFirstOfMonth ? "border-l-2 border-l-foreground/40" : "border-l border-l-border/60",
                        isToday ? "bg-amber-50/40 dark:bg-amber-950/20" : "",
                      ].join(" ")}
                    />,
                  );
                }
                // Reservation segments overlay the empty cells.
                for (const seg of row.segments) {
                  const styleEntry = STATUS_STYLE[seg.status];
                  const tooltip = tooltipText(seg);
                  const startCol = seg.startDayIndex + 2;
                  const endCol = seg.endDayIndex + 2;
                  cells.push(
                    <Link
                      key={`seg-${seg.reservationId}`}
                      href={`/admin/reservations/${seg.reservationId}`}
                      title={tooltip}
                      className={`mx-px my-1 flex items-center overflow-hidden rounded border px-1.5 text-[11px] font-medium leading-tight hover:ring-2 hover:ring-ring/50 ${styleEntry.base}`}
                      style={{
                        gridColumn: `${startCol} / ${endCol}`,
                        ...styleEntry.inline,
                      }}
                    >
                      <span className="truncate">
                        {seg.startsBeforeRange ? "← " : ""}
                        {seg.guestLastName} · {seg.nights}n
                        {seg.endsAfterRange ? " →" : ""}
                      </span>
                    </Link>,
                  );
                }
                return cells;
              });
              return [groupHeaderRow, ...rowFragments];
            })}

            {/* Today vertical line — single overlay element spanning all
                rows. pointer-events-none lets clicks fall through to the
                segments beneath it. */}
            {todayIndex !== null ? (
              <div
                aria-hidden
                className="pointer-events-none border-l-2 border-amber-500/80"
                style={{
                  gridColumn: `${todayIndex + 2}`,
                  gridRow: "1 / -1",
                }}
              />
            ) : null}
          </div>
        </div>
      )}

      <Legend />
    </div>
  );
}

function Legend() {
  const items: Array<{ status: ReservationStatus; label: string }> = [
    { status: "CONFIRMED", label: "Confirmed" },
    { status: "CHECKED_IN", label: "Checked-in" },
    { status: "CHECKED_OUT", label: "Checked-out" },
    { status: "HELD", label: "Held" },
    { status: "CANCELLED", label: "Cancelled" },
    { status: "NO_SHOW", label: "No-show" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span>Legend:</span>
      {items.map((it) => {
        const s = STATUS_STYLE[it.status];
        return (
          <span key={it.status} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3 w-6 rounded border ${s.base}`}
              style={s.inline}
            />
            {it.label}
          </span>
        );
      })}
    </div>
  );
}
