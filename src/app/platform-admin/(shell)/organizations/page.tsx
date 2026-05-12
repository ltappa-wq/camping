import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlatformTopbar } from "../_components/platform-topbar";

export const dynamic = "force-dynamic";

type SortKey = "name" | "properties" | "reservations" | "createdAt";

export default async function OrganizationsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: SortKey }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const sort: SortKey = (sp.sort as SortKey) ?? "name";

  const rows = await prisma.organization.findMany({
    where: q
      ? { name: { contains: q, mode: "insensitive" } }
      : undefined,
    include: {
      properties: {
        select: {
          id: true,
          name: true,
          slug: true,
          email: true,
        },
      },
      operatorUsers: {
        select: { email: true, role: true },
      },
      _count: {
        select: { properties: true },
      },
    },
  });

  // Pull reservation totals in a second pass so we can sort by them.
  const reservationCounts = await prisma.reservation.groupBy({
    by: ["propertyId"],
    where: {
      status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
    },
    _count: { _all: true },
  });
  const reservationsByProperty = new Map(
    reservationCounts.map((r) => [r.propertyId, r._count._all]),
  );

  const enriched = rows.map((o) => ({
    ...o,
    reservationCount: o.properties.reduce(
      (sum, p) => sum + (reservationsByProperty.get(p.id) ?? 0),
      0,
    ),
    primaryContact:
      o.properties.find((p) => p.email)?.email ??
      o.operatorUsers[0]?.email ??
      null,
  }));

  // Server-side sort — small data, no need for client-side reactivity.
  enriched.sort((a, b) => {
    switch (sort) {
      case "properties":
        return b._count.properties - a._count.properties;
      case "reservations":
        return b.reservationCount - a.reservationCount;
      case "createdAt":
        return b.createdAt.getTime() - a.createdAt.getTime();
      case "name":
      default:
        return a.name.localeCompare(b.name);
    }
  });

  return (
    <>
      <PlatformTopbar title="Organizations" />
      <main className="space-y-4 p-6">
        <form className="flex gap-2">
          <Input
            name="q"
            placeholder="Search by name…"
            defaultValue={q}
            className="max-w-md"
          />
          <input type="hidden" name="sort" value={sort} />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortLink current={sort} target="name">
                    Name
                  </SortLink>
                </TableHead>
                <TableHead>
                  <SortLink current={sort} target="properties">
                    Properties
                  </SortLink>
                </TableHead>
                <TableHead>Primary contact</TableHead>
                <TableHead>Stripe</TableHead>
                <TableHead>
                  <SortLink current={sort} target="reservations">
                    Reservations
                  </SortLink>
                </TableHead>
                <TableHead>
                  <SortLink current={sort} target="createdAt">
                    Created
                  </SortLink>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enriched.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {q
                      ? `No organizations match "${q}".`
                      : "No organizations on the platform yet."}
                  </TableCell>
                </TableRow>
              ) : (
                enriched.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/platform-admin/organizations/${o.id}`}
                        className="hover:underline"
                      >
                        {o.name}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {o._count.properties}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {o.primaryContact ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StripeStatusBadge
                        accountId={o.stripeAccountId}
                        onboardingComplete={o.stripeOnboardingComplete}
                        chargesEnabled={o.stripeChargesEnabled}
                      />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {o.reservationCount}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {o.createdAt.toISOString().slice(0, 10)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </>
  );
}

function SortLink({
  current,
  target,
  children,
}: {
  current: string;
  target: SortKey;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`?sort=${target}`}
      className={`inline-flex items-center gap-1 hover:text-foreground ${
        current === target ? "text-foreground" : ""
      }`}
    >
      {children}
      {current === target ? <span className="text-xs">↓</span> : null}
    </Link>
  );
}

function StripeStatusBadge({
  accountId,
  onboardingComplete,
  chargesEnabled,
}: {
  accountId: string | null;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
}) {
  if (!accountId)
    return <Badge variant="outline">Not started</Badge>;
  if (chargesEnabled && onboardingComplete)
    return <Badge variant="default">Live</Badge>;
  return <Badge variant="secondary">In progress</Badge>;
}
