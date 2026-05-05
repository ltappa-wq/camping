import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { AddonsList } from "./addons-list";

export default async function AddonsPage() {
  const ctx = await requireOperatorPropertyOrSetup();

  const addons = await ctx.prisma.addon.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="Add-ons"
        description="Optional extras offered at checkout — firewood, ice, propane."
      />
      <AddonsList
        rows={addons.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          priceCents: a.priceCents,
          inventoryCount: a.inventoryCount,
          active: a.active,
        }))}
      />
    </div>
  );
}
