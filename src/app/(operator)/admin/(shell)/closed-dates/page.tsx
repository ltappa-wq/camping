import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { ClosedDatesList } from "./closed-dates-list";

export const dynamic = "force-dynamic";

export default async function ClosedDatesPage() {
  const ctx = await requireOperatorPropertyOrSetup();

  const rows = await ctx.prisma.closedDateRange.findMany({
    orderBy: { startDate: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Closed dates"
        description="Block specific date ranges (holidays, maintenance) on top of the recurring season window. Existing reservations are not affected; new bookings will be blocked."
      />
      <ClosedDatesList
        rows={rows.map((r) => ({
          id: r.id,
          startDate: r.startDate.toISOString().slice(0, 10),
          endDate: r.endDate.toISOString().slice(0, 10),
          reason: r.reason,
        }))}
      />
    </div>
  );
}
