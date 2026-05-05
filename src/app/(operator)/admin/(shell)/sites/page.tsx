import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { SitesList } from "./sites-list";

export default async function SitesPage() {
  const ctx = await requireOperatorPropertyOrSetup();

  const [sites, siteTypes] = await Promise.all([
    ctx.prisma.site.findMany({
      include: { siteType: { select: { name: true } } },
    }),
    ctx.prisma.siteType.findMany({
      orderBy: [{ deletedAt: "asc" }, { name: "asc" }],
      select: { id: true, name: true, deletedAt: true },
    }),
  ]);

  // Natural-sort labels so "2" < "10" < "A1" < "A10".
  // Group order: active → inactive → archived; sort by label within each group.
  const labelCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  sites.sort((a, b) => {
    const aGroup = a.deletedAt ? 2 : a.active ? 0 : 1;
    const bGroup = b.deletedAt ? 2 : b.active ? 0 : 1;
    if (aGroup !== bGroup) return aGroup - bGroup;
    return labelCollator.compare(a.label, b.label);
  });

  return (
    <div>
      <PageHeader
        title="Sites"
        description="Individual campsites — labels, tags, and per-site availability."
      />
      <SitesList
        rows={sites.map((s) => ({
          id: s.id,
          label: s.label,
          siteTypeId: s.siteTypeId,
          siteTypeName: s.siteType.name,
          notes: s.notes,
          tags: s.tags,
          active: s.active,
          archived: s.deletedAt != null,
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
