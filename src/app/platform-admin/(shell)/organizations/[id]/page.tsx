import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { PlatformTopbar } from "../../_components/platform-topbar";
import { startImpersonationAction } from "../../impersonation-actions";

export const dynamic = "force-dynamic";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      properties: {
        include: {
          _count: { select: { sites: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      operatorUsers: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!org) notFound();

  const [recentReservations, recentActions] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        propertyId: { in: org.properties.map((p) => p.id) },
        status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
      },
      orderBy: { confirmedAt: "desc" },
      take: 5,
      include: {
        guest: { select: { name: true, email: true } },
        site: { select: { label: true } },
      },
    }),
    prisma.platformAdminAction.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { platformAdmin: { select: { name: true, email: true } } },
    }),
  ]);

  return (
    <>
      <PlatformTopbar title={org.name} />
      <main className="space-y-6 p-6">
        <Link
          href="/platform-admin/organizations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to organizations
        </Link>

        <section className="rounded-md border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{org.name}</h2>
              <div className="mt-1 text-xs text-muted-foreground">
                Created {org.createdAt.toISOString().slice(0, 10)} ·{" "}
                {org.properties.length} propert
                {org.properties.length === 1 ? "y" : "ies"}
              </div>
            </div>
            <form action={startImpersonationAction}>
              <input type="hidden" name="organizationId" value={org.id} />
              <Button type="submit" variant="default">
                Act as this organization →
              </Button>
            </form>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Kv label="Stripe account">
              <StripeStatus
                accountId={org.stripeAccountId}
                onboardingComplete={org.stripeOnboardingComplete}
                chargesEnabled={org.stripeChargesEnabled}
              />
            </Kv>
            <Kv label="Platform fee">
              {formatCents(org.platformFeeFlatCents)}
              <span className="ml-1 text-xs text-muted-foreground">
                / booking ({org.customerPaysPlatformFee ? "passed through" : "operator absorbs"})
              </span>
            </Kv>
            <Kv label="Operator users">
              {org.operatorUsers.length}
            </Kv>
          </div>
        </section>

        <section className="rounded-md border bg-card">
          <SectionHeader title="Properties" count={org.properties.length} />
          {org.properties.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No properties yet.
            </p>
          ) : (
            <ul className="divide-y">
              {org.properties.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 p-4">
                  <div>
                    <Link
                      href={`/platform-admin/properties/${p.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      /p/{p.slug} · {p._count.sites} site
                      {p._count.sites === 1 ? "" : "s"}
                    </div>
                  </div>
                  <a
                    href={`/p/${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    View public page ↗
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border bg-card">
          <SectionHeader title="Operator users" count={org.operatorUsers.length} />
          {org.operatorUsers.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No operator users registered.
            </p>
          ) : (
            <ul className="divide-y">
              {org.operatorUsers.map((u) => (
                <li
                  key={u.id}
                  className="flex items-baseline justify-between gap-3 p-4 text-sm"
                >
                  <div>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <Badge variant="outline">{u.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border bg-card">
          <SectionHeader title="Recent reservations" count={recentReservations.length} />
          {recentReservations.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No reservations yet.
            </p>
          ) : (
            <ul className="divide-y">
              {recentReservations.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm"
                >
                  <div>
                    <span className="font-mono text-xs">
                      {r.confirmationCode}
                    </span>{" "}
                    · {r.guest.name} · Site {r.site.label}
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {r.checkIn.toISOString().slice(0, 10)} → {r.checkOut.toISOString().slice(0, 10)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border bg-card">
          <SectionHeader title="Recent back-office activity" count={recentActions.length} />
          {recentActions.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No back-office activity on this org yet.
            </p>
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
                    <div>{a.description ?? <span className="italic">(no description)</span>}</div>
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

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-baseline justify-between border-b p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <span className="text-xs text-muted-foreground tabular-nums">
        {count}
      </span>
    </div>
  );
}

function StripeStatus({
  accountId,
  onboardingComplete,
  chargesEnabled,
}: {
  accountId: string | null;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
}) {
  if (!accountId) return <Badge variant="outline">Not started</Badge>;
  if (chargesEnabled && onboardingComplete)
    return <Badge>Live</Badge>;
  return <Badge variant="secondary">In progress</Badge>;
}
