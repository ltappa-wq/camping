import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildOrderBy,
  buildWhere,
  parseFilters,
} from "@/app/(operator)/admin/(shell)/reservations/_lib/query";

const ONE_DAY_MS = 86_400_000;

export async function GET(req: Request) {
  // Inline session check (rather than requireOperatorPropertyOrSetup) so
  // we can return 401/403 instead of redirecting — redirect on a CSV
  // download lands the user on /login with no clear cause.
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }
  const operator = await prisma.operatorUser.findUnique({
    where: { email: session.user.email },
    include: {
      organization: {
        include: {
          properties: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });
  const property = operator?.organization.properties[0];
  if (!operator || !property) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const sp: Record<string, string | string[] | undefined> = {};
  for (const key of url.searchParams.keys()) {
    const all = url.searchParams.getAll(key);
    sp[key] = all.length === 1 ? all[0] : all;
  }
  const filters = parseFilters(sp);

  const rows = await prisma.reservation.findMany({
    where: buildWhere(property.id, filters),
    orderBy: buildOrderBy(filters),
    include: {
      site: { select: { label: true } },
      guest: { select: { name: true, email: true } },
    },
  });

  const operatorIds = Array.from(
    new Set(
      rows.map((r) => r.createdByOperatorId).filter((id): id is string => !!id),
    ),
  );
  const operators =
    operatorIds.length > 0
      ? await prisma.operatorUser.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, name: true },
        })
      : [];
  const operatorById = new Map(operators.map((o) => [o.id, o.name]));

  const headers = [
    "Confirmation",
    "Guest name",
    "Guest email",
    "Site",
    "Check-in",
    "Check-out",
    "Nights",
    "Status",
    "Total",
    "Paid",
    "Refunded",
    "Balance",
    "Created at",
    "Created by",
  ];

  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => {
      const nights = Math.round(
        (r.checkOut.getTime() - r.checkIn.getTime()) / ONE_DAY_MS,
      );
      const balance = r.totalCents - r.paidCents + r.refundedCents;
      const createdBy = r.createdByOperatorId
        ? (operatorById.get(r.createdByOperatorId) ?? "Operator")
        : "Guest checkout";
      return [
        r.confirmationCode,
        r.guest.name,
        r.guest.email,
        r.site.label,
        r.checkIn.toISOString().slice(0, 10),
        r.checkOut.toISOString().slice(0, 10),
        String(nights),
        r.status,
        formatCsvCents(r.totalCents),
        formatCsvCents(r.paidCents),
        formatCsvCents(r.refundedCents),
        formatCsvCents(balance),
        r.createdAt.toISOString(),
        createdBy,
      ]
        .map(csvEscape)
        .join(",");
    }),
  ];

  const body = lines.join("\r\n") + "\r\n";

  const filename = `reservations-${filters.from}-to-${filters.to}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** RFC 4180 escaping: wrap in quotes if the field contains comma, quote,
 *  CR, or LF; double up any quotes inside. */
function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[,"\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Cents → "12.34" with two-decimal places. No currency symbol —
 *  Excel/Sheets parse plain decimals as numbers. */
function formatCsvCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
