import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlatformTopbar } from "./_components/platform-topbar";

export const dynamic = "force-dynamic";

export default async function PlatformAdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";

  const [orgCount, activePropertyCount, reservationCount, platformFeeAgg, recentActions, searchHits] =
    await Promise.all([
      prisma.organization.count(),
      prisma.property.count(),
      prisma.reservation.count({
        where: { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } },
      }),
      // Platform fees we've collected across every confirmed payment.
      prisma.payment.aggregate({
        where: { status: "SUCCEEDED" },
        _sum: { applicationFeeCents: true },
      }),
      prisma.platformAdminAction.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { platformAdmin: { select: { name: true, email: true } } },
      }),
      q.length > 0
        ? Promise.all([
            prisma.organization.findMany({
              where: { name: { contains: q, mode: "insensitive" } },
              take: 8,
              select: { id: true, name: true },
            }),
            prisma.property.findMany({
              where: {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { slug: { contains: q, mode: "insensitive" } },
                ],
              },
              take: 8,
              select: { id: true, name: true, slug: true },
            }),
          ])
        : Promise.resolve([[], []] as const),
    ]);

  const [orgHits, propertyHits] = searchHits;
  const platformFeeTotal = platformFeeAgg._sum.applicationFeeCents ?? 0;

  return (
    <>
      <PlatformTopbar title="Dashboard" />
      <main className="space-y-6 p-6">
        <form className="flex gap-2">
          <Input
            name="q"
            placeholder="Search organizations or properties…"
            defaultValue={q}
            className="max-w-md"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>

        {q.length > 0 ? (
          <section className="rounded-md border bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Quick search · {orgHits.length + propertyHits.length} result
              {orgHits.length + propertyHits.length === 1 ? "" : "s"}
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {orgHits.map((o) => (
                <li key={`o-${o.id}`}>
                  <Link
                    href={`/platform-admin/organizations/${o.id}`}
                    className="text-foreground hover:underline"
                  >
                    Organization · {o.name}
                  </Link>
                </li>
              ))}
              {propertyHits.map((p) => (
                <li key={`p-${p.id}`}>
                  <Link
                    href={`/platform-admin/properties/${p.id}`}
                    className="text-foreground hover:underline"
                  >
                    Property · {p.name}{" "}
                    <span className="text-muted-foreground">
                      ({p.slug})
                    </span>
                  </Link>
                </li>
              ))}
              {orgHits.length + propertyHits.length === 0 ? (
                <li className="text-muted-foreground">
                  No matches.
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Organizations" value={String(orgCount)} />
          <Kpi label="Active properties" value={String(activePropertyCount)} />
          <Kpi label="Reservations" value={String(reservationCount)} sub="Confirmed+ lifetime" />
          <Kpi
            label="Platform revenue"
            value={formatCents(platformFeeTotal)}
            sub="Total fees collected"
          />
        </section>

        <section className="rounded-md border bg-card">
          <div className="border-b p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Recent activity
            </div>
          </div>
          {recentActions.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No back-office activity yet. Acts of impersonation and the
              other audited operations show up here.
            </div>
          ) : (
            <ul className="divide-y">
              {recentActions.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-muted-foreground">
                      {a.action}
                    </div>
                    <div>
                      {a.description ?? <span className="italic">(no description)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.platformAdmin.name ?? a.platformAdmin.email}
                    </div>
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {a.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

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
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}
