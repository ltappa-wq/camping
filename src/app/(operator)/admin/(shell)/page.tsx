import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarRange,
  DollarSign,
  Home,
} from "lucide-react";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { formatCents } from "@/lib/money";
import { computeDashboardMetrics } from "@/lib/dashboard-metrics";

const ONE_DAY_MS = 86_400_000;
type Window = "today" | "tomorrow" | "week" | "month";

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function startOfWeekUtc(d: Date): Date {
  // Sunday-start, matching the grid view.
  const dow = d.getUTCDay();
  const start = new Date(d);
  start.setUTCDate(start.getUTCDate() - dow);
  return new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function daysInMonth(d: Date): number {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolveWindow(
  win: Window,
  today: Date,
): { rangeStart: Date; dayCount: number; label: string; possessive: string } {
  switch (win) {
    case "tomorrow": {
      const start = new Date(today.getTime() + ONE_DAY_MS);
      return {
        rangeStart: start,
        dayCount: 1,
        label: "Tomorrow",
        possessive: "Tomorrow's",
      };
    }
    case "week": {
      return {
        rangeStart: startOfWeekUtc(today),
        dayCount: 7,
        label: "This week",
        possessive: "This week's",
      };
    }
    case "month": {
      const start = startOfMonthUtc(today);
      return {
        rangeStart: start,
        dayCount: daysInMonth(today),
        label: "This month",
        possessive: "This month's",
      };
    }
    case "today":
    default: {
      return {
        rangeStart: today,
        dayCount: 1,
        label: "Today",
        possessive: "Today's",
      };
    }
  }
}

const WINDOW_OPTIONS: ReadonlyArray<{ value: Window; label: string }> = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOperatorPropertyOrSetup();
  const sp = await searchParams;

  const winParam = (typeof sp.window === "string" ? sp.window : "today") as
    | Window
    | string;
  const window: Window = (
    ["today", "tomorrow", "week", "month"] as const
  ).includes(winParam as Window)
    ? (winParam as Window)
    : "today";

  const today = todayUtc();
  const { rangeStart, dayCount, label, possessive } = resolveWindow(
    window,
    today,
  );
  const rangeEnd = new Date(rangeStart.getTime() + dayCount * ONE_DAY_MS);

  const [
    activeSiteCount,
    reservationsInWindow,
    onSiteNowCount,
    recentBookings,
    recentPayments,
  ] = await Promise.all([
    ctx.prisma.site.count({
      where: { deletedAt: null, active: true },
    }),
    ctx.prisma.reservation.findMany({
      where: {
        checkIn: { lt: rangeEnd },
        checkOut: { gt: rangeStart },
        status: { not: "DRAFT" },
      },
      select: {
        status: true,
        checkIn: true,
        checkOut: true,
        totalCents: true,
      },
    }),
    ctx.prisma.reservation.count({
      where: { status: "CHECKED_IN" },
    }),
    ctx.prisma.reservation.findMany({
      where: { status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        guest: { select: { name: true } },
        site: { select: { label: true } },
      },
    }),
    ctx.prisma.payment.findMany({
      where: {
        reservation: { propertyId: ctx.propertyId },
        status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        reservation: {
          select: {
            id: true,
            confirmationCode: true,
            guest: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const metrics = computeDashboardMetrics({
    rangeStart,
    dayCount,
    activeSiteCount,
    reservations: reservationsInWindow,
  });

  const occupancyLabel = dayCount > 1 ? "Avg. occupancy" : "Occupancy";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${ctx.property.name} · ${ymd(rangeStart)}${
          dayCount > 1
            ? ` → ${ymd(new Date(rangeEnd.getTime() - ONE_DAY_MS))}`
            : ""
        }`}
      />

      <div className="flex flex-wrap gap-2">
        {WINDOW_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            asChild
            size="sm"
            variant={window === opt.value ? "default" : "outline"}
          >
            <Link href={`/admin?window=${opt.value}`}>{opt.label}</Link>
          </Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Kpi
          icon={ArrowDownToLine}
          label={`${possessive} arrivals`}
          value={metrics.arrivalsCount.toString()}
        />
        <Kpi
          icon={ArrowUpFromLine}
          label={`${possessive} departures`}
          value={metrics.departuresCount.toString()}
        />
        <Kpi
          icon={Home}
          label="On-site now"
          value={onSiteNowCount.toString()}
          hint="Currently checked-in"
        />
        <Kpi
          icon={CalendarRange}
          label={occupancyLabel}
          value={`${metrics.occupancyPct.toFixed(1)}%`}
          hint={`${metrics.bookedSiteNights} of ${metrics.totalSiteNights} site-nights`}
        />
        <Kpi
          icon={DollarSign}
          label={`${possessive} revenue`}
          value={formatCents(metrics.estimatedRevenueCents)}
          hint={dayCount > 1 ? "Pro-rated to window" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent bookings</CardTitle>
            <CardDescription>The last 5 reservations created.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reservations yet.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentBookings.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-md border bg-card/50 p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/reservations/${r.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.guest.name}
                      </Link>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        Site {r.site.label} ·{" "}
                        {r.checkIn.toISOString().slice(0, 10)} →{" "}
                        {r.checkOut.toISOString().slice(0, 10)}
                      </div>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {r.status.replace("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent payments</CardTitle>
            <CardDescription>The last 5 payments processed.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payments recorded yet.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentPayments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-md border bg-card/50 p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/reservations/${p.reservation.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.reservation.guest.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {p.paymentMethod} · {p.reservation.confirmationCode}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium tabular-nums">
                        {formatCents(p.amountCents)}
                      </div>
                      {p.refundedAmountCents > 0 ? (
                        <div className="text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                          −{formatCents(p.refundedAmountCents)} refunded
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
