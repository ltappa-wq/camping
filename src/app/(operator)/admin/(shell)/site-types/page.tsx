import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { SiteTypesList } from "./site-types-list";

export default async function SiteTypesPage() {
  const ctx = await requireOperatorPropertyOrSetup();

  const siteTypes = await ctx.prisma.siteType.findMany({
    orderBy: [{ deletedAt: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { sites: { where: { deletedAt: null } } } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Site Types"
        description="Categories of sites with shared specs (hookups, capacity, rules)."
      />
      <SiteTypesList
        rows={siteTypes.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          electricAmps: t.electricAmps,
          hasWater: t.hasWater,
          hasSewer: t.hasSewer,
          maxRvLengthFt: t.maxRvLengthFt,
          maxAdults: t.maxAdults,
          maxChildren: t.maxChildren,
          petsAllowed: t.petsAllowed,
          tentsAllowed: t.tentsAllowed,
          archived: t.deletedAt != null,
          siteCount: t._count.sites,
        }))}
      />
    </div>
  );
}
