import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { SitesList } from "./sites-list";

export default async function SitesPage() {
  const ctx = await requireOperatorPropertyOrSetup();

  const [sites, siteTypes] = await Promise.all([
    ctx.prisma.site.findMany({
      orderBy: [{ deletedAt: "asc" }, { active: "desc" }, { label: "asc" }],
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
