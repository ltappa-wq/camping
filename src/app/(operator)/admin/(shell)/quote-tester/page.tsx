import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { QuoteTester } from "./quote-tester";

const ONE_DAY_MS = 86_400_000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function QuoteTesterPage() {
  const ctx = await requireOperatorPropertyOrSetup();

  const [siteTypes, addons] = await Promise.all([
    ctx.prisma.siteType.findMany({
      orderBy: [{ deletedAt: "asc" }, { name: "asc" }],
      select: { id: true, name: true, deletedAt: true },
    }),
    ctx.prisma.addon.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, priceCents: true, active: true },
    }),
  ]);

  const today = new Date();
  const checkInDefault = new Date(today.getTime() + 7 * ONE_DAY_MS);
  const checkOutDefault = new Date(today.getTime() + 10 * ONE_DAY_MS);
  const firstActive = siteTypes.find((t) => t.deletedAt == null);

  return (
    <div>
      <PageHeader
        title="Quote Tester"
        description="Debug tool — exercise the pricing engine against this property's live config."
      />
      <QuoteTester
        siteTypes={siteTypes.map((t) => ({
          id: t.id,
          name: t.name,
          archived: t.deletedAt != null,
        }))}
        addons={addons}
        defaultSiteTypeId={firstActive?.id ?? ""}
        defaultCheckIn={isoDate(checkInDefault)}
        defaultCheckOut={isoDate(checkOutDefault)}
      />
    </div>
  );
}
