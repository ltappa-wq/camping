import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { ModifiersList } from "./modifiers-list";
import type { ModifierApplies, ModifierType } from "./schema";

function toIsoDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export default async function ModifiersPage() {
  const ctx = await requireOperatorPropertyOrSetup();

  const [modifiers, siteTypes] = await Promise.all([
    ctx.prisma.rateModifier.findMany({
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
        title="Modifiers"
        description="Surcharges and discounts that stack additively on top of rate plans."
      />
      <ModifiersList
        rows={modifiers.map((m) => ({
          id: m.id,
          name: m.name,
          siteTypeId: m.siteTypeId,
          siteTypeName: m.siteType?.name ?? null,
          modifierType: m.modifierType as ModifierType,
          modifierValue: m.modifierValue,
          appliesTo: m.appliesTo as ModifierApplies,
          daysOfWeek: m.daysOfWeek,
          startDate: toIsoDate(m.startDate),
          endDate: toIsoDate(m.endDate),
          priority: m.priority,
          active: m.active,
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
