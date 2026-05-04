import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { TaxRatesList } from "./tax-rates-list";

export default async function TaxRatesPage() {
  const ctx = await requireOperatorPropertyOrSetup();

  const taxRates = await ctx.prisma.taxRate.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="Tax Rates"
        description="State, county, and local taxes added at checkout."
      />
      <TaxRatesList
        rows={taxRates.map((t) => ({
          id: t.id,
          name: t.name,
          basisPoints: t.basisPoints,
          appliesTo: t.appliesTo,
          active: t.active,
        }))}
      />
    </div>
  );
}
