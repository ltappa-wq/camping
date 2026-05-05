import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { RatePlansList } from "./rate-plans-list";
import type { ChargeUnit } from "./schema";

function toIsoDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export default async function RatePlansPage() {
  const ctx = await requireOperatorPropertyOrSetup();

  const [ratePlans, siteTypes] = await Promise.all([
    ctx.prisma.ratePlan.findMany({
      orderBy: [
        { active: "desc" },
        { priority: "desc" },
        { name: "asc" },
      ],
      include: { siteType: { select: { name: true } } },
    }),
    ctx.prisma.siteType.findMany({
      orderBy: [{ deletedAt: "asc" }, { name: "asc" }],
      select: { id: true, name: true, deletedAt: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Rate Plans"
        description="Stay-length pricing — nightly, weekly, monthly, seasonal."
      />
      <RatePlansList
        rows={ratePlans.map((p) => ({
          id: p.id,
          name: p.name,
          siteTypeId: p.siteTypeId,
          siteTypeName: p.siteType?.name ?? null,
          chargeUnit: p.chargeUnit as ChargeUnit,
          pricePerUnitCents: p.pricePerUnitCents,
          minStayDays: p.minStayDays,
          maxStayDays: p.maxStayDays,
          effectiveFrom: toIsoDate(p.effectiveFrom),
          effectiveTo: toIsoDate(p.effectiveTo),
          priority: p.priority,
          active: p.active,
        }))}
        siteTypes={siteTypes.map((t) => ({
          id: t.id,
          name: t.name,
          archived: t.deletedAt != null,
        }))}
      />
    </div>
  );
}
