import { NextResponse } from "next/server";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { centsToDollars } from "@/lib/money";
import { buildCsv, csvHeaders } from "../../_lib/csv";
import { loadReservationRowsForRange } from "../../_lib/load";
import { parseRangeFromSearchParams } from "../../_lib/range";

export async function GET(request: Request) {
  const ctx = await requireOperatorPropertyOrSetup();
  const url = new URL(request.url);
  const range = parseRangeFromSearchParams({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const rows = await loadReservationRowsForRange(ctx.property, range);

  const csv = buildCsv(
    [
      "Confirmation",
      "Status",
      "Guest name",
      "Guest email",
      "Site",
      "Site type",
      "Check-in",
      "Check-out",
      "Nights",
      "Total",
      "Paid",
      "Refunded",
      "Confirmed at",
    ],
    rows.map((r) => [
      r.confirmationCode,
      r.status,
      r.guest.name,
      r.guest.email,
      r.site.label,
      r.site.siteType.name,
      r.checkIn.toISOString().slice(0, 10),
      r.checkOut.toISOString().slice(0, 10),
      Math.round(
        (r.checkOut.getTime() - r.checkIn.getTime()) / 86_400_000,
      ),
      centsToDollars(r.totalCents),
      centsToDollars(r.paidCents),
      centsToDollars(r.refundedCents),
      r.confirmedAt?.toISOString() ?? "",
    ]),
  );

  return new NextResponse(csv, {
    headers: csvHeaders(`bookings-${range.fromIso}-${range.toIso}.csv`),
  });
}
