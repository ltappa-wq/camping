import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download } from "lucide-react";
import { PlatformTopbar } from "../_components/platform-topbar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SearchParams = {
  from?: string;
  to?: string;
  admin?: string;
  org?: string;
  action?: string;
  page?: string;
};

function parseDate(s: string | undefined): Date | null {
  if (!s || !DATE_RE.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const fromDate = parseDate(sp.from);
  const toDate = parseDate(sp.to);
  // Inclusive upper bound: bump `to` to the next-day boundary.
  const toExclusive = toDate
    ? new Date(toDate.getTime() + 86_400_000)
    : null;

  const where = {
    ...(sp.admin ? { platformAdminId: sp.admin } : {}),
    ...(sp.org ? { organizationId: sp.org } : {}),
    ...(sp.action ? { action: sp.action } : {}),
    ...(fromDate || toExclusive
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toExclusive ? { lt: toExclusive } : {}),
          },
        }
      : {}),
  };

  const [total, rows, admins, orgs, actionTypes] = await Promise.all([
    prisma.platformAdminAction.count({ where }),
    prisma.platformAdminAction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        platformAdmin: { select: { name: true, email: true } },
      },
    }),
    prisma.platformAdmin.findMany({
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    }),
    prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.platformAdminAction
      .groupBy({ by: ["action"], _count: { _all: true } })
      .then((rows) =>
        rows.sort((a, b) => a.action.localeCompare(b.action)),
      ),
  ]);

  // Pull org/property names in a second query so the table can display
  // them without N+1 lookups.
  const orgIds = Array.from(
    new Set(rows.map((r) => r.organizationId).filter((x): x is string => !!x)),
  );
  const propertyIds = Array.from(
    new Set(rows.map((r) => r.propertyId).filter((x): x is string => !!x)),
  );
  const [orgsMap, propsMap] = await Promise.all([
    prisma.organization
      .findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
      })
      .then((rs) => new Map(rs.map((r) => [r.id, r.name]))),
    prisma.property
      .findMany({
        where: { id: { in: propertyIds } },
        select: { id: true, name: true },
      })
      .then((rs) => new Map(rs.map((r) => [r.id, r.name]))),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const csvQuery = new URLSearchParams();
  if (sp.from) csvQuery.set("from", sp.from);
  if (sp.to) csvQuery.set("to", sp.to);
  if (sp.admin) csvQuery.set("admin", sp.admin);
  if (sp.org) csvQuery.set("org", sp.org);
  if (sp.action) csvQuery.set("action", sp.action);

  return (
    <>
      <PlatformTopbar title="Audit log" />
      <main className="space-y-4 p-6">
        <form className="grid grid-cols-1 gap-3 rounded-md border bg-card p-4 sm:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs">
              From
            </Label>
            <Input id="from" name="from" type="date" defaultValue={sp.from ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs">
              To
            </Label>
            <Input id="to" name="to" type="date" defaultValue={sp.to ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="admin" className="text-xs">
              Admin
            </Label>
            <select
              id="admin"
              name="admin"
              defaultValue={sp.admin ?? ""}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">All admins</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name ?? a.email}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="org" className="text-xs">
              Organization
            </Label>
            <select
              id="org"
              name="org"
              defaultValue={sp.org ?? ""}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">All organizations</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="action" className="text-xs">
              Action
            </Label>
            <select
              id="action"
              name="action"
              defaultValue={sp.action ?? ""}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">All actions</option>
              {actionTypes.map((a) => (
                <option key={a.action} value={a.action}>
                  {a.action} ({a._count._all})
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-full flex justify-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/platform-admin/audit/csv?${csvQuery.toString()}`}>
                <Download className="mr-1 h-4 w-4" /> CSV
              </Link>
            </Button>
            <Button type="submit" size="sm">
              Apply filters
            </Button>
          </div>
        </form>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Org / Property</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No audit entries match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {r.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.platformAdmin.name ?? r.platformAdmin.email}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.action}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.description ?? <span className="italic">(none)</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.organizationId ? (
                        <Link
                          href={`/platform-admin/organizations/${r.organizationId}`}
                          className="hover:underline"
                        >
                          {orgsMap.get(r.organizationId) ?? r.organizationId}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {r.propertyId ? (
                        <>
                          {" / "}
                          <Link
                            href={`/platform-admin/properties/${r.propertyId}`}
                            className="hover:underline"
                          >
                            {propsMap.get(r.propertyId) ?? r.propertyId}
                          </Link>
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Page {page} of {totalPages} · {total} entr
            {total === 1 ? "y" : "ies"}
          </div>
          <div className="flex gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page <= 1}
            >
              <Link
                href={`?${withPage(sp, page - 1)}`}
                aria-disabled={page <= 1}
              >
                Previous
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
            >
              <Link
                href={`?${withPage(sp, page + 1)}`}
                aria-disabled={page >= totalPages}
              >
                Next
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}

function withPage(sp: SearchParams, page: number): string {
  const next = new URLSearchParams();
  if (sp.from) next.set("from", sp.from);
  if (sp.to) next.set("to", sp.to);
  if (sp.admin) next.set("admin", sp.admin);
  if (sp.org) next.set("org", sp.org);
  if (sp.action) next.set("action", sp.action);
  next.set("page", String(Math.max(1, page)));
  return next.toString();
}
