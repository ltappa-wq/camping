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
  const inWindow = rows.filter(
    (r) =>
      r.confirmedAt !== null &&
      r.confirmedAt >= range.start &&
      r.confirmedAt < range.end,
  );

  const csv = buildCsv(
    [
      "Confirmation",
      "Guest name",
      "Guest email",
      "Status",
      "Check-in",
      "Check-out",
      "Total",
      "Paid",
      "Refunded",
      "Net",
      "Confirmed at",
    ],
    inWindow.map((r) => [
      r.confirmationCode,
      r.guest.name,
      r.guest.email,
      r.status,
      r.checkIn.toISOString().slice(0, 10),
      r.checkOut.toISOString().slice(0, 10),
      centsToDollars(r.totalCents),
      centsToDollars(r.paidCents),
      centsToDollars(r.refundedCents),
      centsToDollars(r.paidCents - r.refundedCents),
      r.confirmedAt?.toISOString() ?? "",
    ]),
  );

  return new NextResponse(csv, {
    headers: csvHeaders(`revenue-${range.fromIso}-${range.toIso}.csv`),
  });
}
