// Server-side loader shared by the report tabs and the CSV endpoints.
// Pulls every reservation/payment that could matter for the window plus
// the slow-changing surrounding data (active sites, closures, season).

import type { Property } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  ClosedRangeForReports,
  PaymentForReports,
  ReservationForReports,
  SeasonWindow,
} from "@/lib/reports";
import type { ParsedRange } from "./range";

export type ReportData = {
  reservations: ReservationForReports[];
  payments: PaymentForReports[];
  activeSiteCount: number;
  season: SeasonWindow | null;
  closures: ClosedRangeForReports[];
};

export async function loadReportData(
  property: Property,
  range: ParsedRange,
): Promise<ReportData> {
  const [reservations, payments, activeSiteCount, closures] = await Promise.all([
    // Pull anything that could matter:
    //   - confirmedAt inside the range  (for revenue)
    //   - stay overlapping the range    (for occupancy)
    prisma.reservation.findMany({
      where: {
        propertyId: property.id,
        OR: [
          { confirmedAt: { gte: range.start, lt: range.end } },
          {
            AND: [
              { checkIn: { lt: range.end } },
              { checkOut: { gt: range.start } },
            ],
          },
        ],
      },
      select: {
        id: true,
        confirmationCode: true,
        guest: { select: { name: true, email: true } },
        site: { select: { label: true, siteType: { select: { name: true } } } },
        status: true,
        checkIn: true,
        checkOut: true,
        totalCents: true,
        paidCents: true,
        refundedCents: true,
        confirmedAt: true,
      },
      orderBy: { checkIn: "asc" },
    }),
    prisma.payment.findMany({
      where: {
        reservation: { propertyId: property.id },
        createdAt: { gte: range.start, lt: range.end },
      },
      select: { applicationFeeCents: true, createdAt: true },
    }),
    prisma.site.count({
      where: { propertyId: property.id, deletedAt: null, active: true },
    }),
    prisma.closedDateRange.findMany({
      where: {
        propertyId: property.id,
        startDate: { lt: range.end },
        endDate: { gte: range.start },
      },
      select: { startDate: true, endDate: true },
    }),
  ]);

  const season: SeasonWindow | null =
    property.seasonStartMonth != null &&
    property.seasonStartDay != null &&
    property.seasonEndMonth != null &&
    property.seasonEndDay != null
      ? {
          startMonth: property.seasonStartMonth,
          startDay: property.seasonStartDay,
          endMonth: property.seasonEndMonth,
          endDay: property.seasonEndDay,
        }
      : null;

  return {
    reservations: reservations.map((r) => ({
      id: r.id,
      status: r.status,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      totalCents: r.totalCents,
      paidCents: r.paidCents,
      refundedCents: r.refundedCents,
      confirmedAt: r.confirmedAt,
    })),
    payments,
    activeSiteCount,
    season,
    closures,
  };
}

/** Same query as above but returns the rich row objects the table tabs render. */
export async function loadReservationRowsForRange(
  property: Property,
  range: ParsedRange,
) {
  return prisma.reservation.findMany({
    where: {
      propertyId: property.id,
      OR: [
        { confirmedAt: { gte: range.start, lt: range.end } },
        {
          AND: [
            { checkIn: { lt: range.end } },
            { checkOut: { gt: range.start } },
          ],
        },
      ],
    },
    select: {
      id: true,
      confirmationCode: true,
      status: true,
      checkIn: true,
      checkOut: true,
      totalCents: true,
      paidCents: true,
      refundedCents: true,
      confirmedAt: true,
      guest: { select: { name: true, email: true } },
      site: {
        select: { label: true, siteType: { select: { name: true } } },
      },
    },
    orderBy: { checkIn: "asc" },
  });
}
