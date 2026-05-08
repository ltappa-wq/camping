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

// Placeholder list view — Phase 4 step 3 replaces this with the proper
// data-table (filters, sort, CSV export). Step 2's job is just to give
// the operator a path into the detail page.

export default async function ReservationsPage() {
  const ctx = await requireOperatorPropertyOrSetup();

  const reservations = await ctx.prisma.reservation.findMany({
    where: {
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    orderBy: [{ checkIn: "asc" }, { confirmationCode: "asc" }],
    include: {
      site: { select: { label: true } },
      guest: { select: { name: true, email: true } },
    },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservations"
        description="Click a row to view, edit, or cancel a reservation."
      />

      {reservations.length === 0 ? (
        <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
          No reservations yet. They&apos;ll appear here as guests book or as
          you create them manually.
        </div>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservations.map((r) => (
                <TableRow key={r.id} className="cursor-pointer">
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/admin/reservations/${r.id}`}
                      className="block underline-offset-2 hover:underline"
                    >
                      {r.confirmationCode}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/reservations/${r.id}`}
                      className="block"
                    >
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
                  <TableCell className="text-xs">
                    {r.status.replace("_", " ")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(r.totalCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
