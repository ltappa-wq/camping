import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePlatformAdminSession } from "@/lib/platform-admin-auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(s: string | null): Date | null {
  if (!s || !DATE_RE.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

function escapeCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: Request) {
  // Auth check — only logged-in platform admins can export.
  await requirePlatformAdminSession();

  const url = new URL(request.url);
  const fromDate = parseDate(url.searchParams.get("from"));
  const toDate = parseDate(url.searchParams.get("to"));
  const toExclusive = toDate
    ? new Date(toDate.getTime() + 86_400_000)
    : null;
  const adminId = url.searchParams.get("admin");
  const orgId = url.searchParams.get("org");
  const action = url.searchParams.get("action");

  const where = {
    ...(adminId ? { platformAdminId: adminId } : {}),
    ...(orgId ? { organizationId: orgId } : {}),
    ...(action ? { action } : {}),
    ...(fromDate || toExclusive
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toExclusive ? { lt: toExclusive } : {}),
          },
        }
      : {}),
  };

  // 10k cap — beyond that we'd want a paged streamed export. For the
  // foreseeable size of this audit log, this is fine.
  const rows = await prisma.platformAdminAction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10_000,
    include: {
      platformAdmin: { select: { name: true, email: true } },
    },
  });
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

  const headers = [
    "When (UTC)",
    "Admin",
    "Admin email",
    "Action",
    "Description",
    "Organization id",
    "Organization name",
    "Property id",
    "Property name",
    "Payload",
  ];
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.createdAt.toISOString(),
        r.platformAdmin.name ?? "",
        r.platformAdmin.email,
        r.action,
        r.description ?? "",
        r.organizationId ?? "",
        r.organizationId ? (orgsMap.get(r.organizationId) ?? "") : "",
        r.propertyId ?? "",
        r.propertyId ? (propsMap.get(r.propertyId) ?? "") : "",
        r.payload ? JSON.stringify(r.payload) : "",
      ]
        .map(escapeCell)
        .join(","),
    ),
  ].join("\r\n");

  const filename = `platform-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  // UTF-8 BOM so Excel handles non-ASCII characters correctly.
  return new NextResponse("﻿" + csv, {
    headers: new Headers({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    }),
  });
}
