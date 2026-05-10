import { requireOperatorProperty } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTaxesStep } from "../actions";
import { WizardShell } from "../_components/wizard-shell";

export const dynamic = "force-dynamic";

const PRESET_LABELS = ["State Sales Tax", "County Tax", "Local/City Tax"];

export default async function TaxesStep() {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId || !ctx.prisma) throw new Error("No property");
  const existing = await ctx.prisma.taxRate.findMany({
    orderBy: { createdAt: "asc" },
  });

  // Pre-populate three rows. Use existing tax rates first, then fill with
  // preset labels for any remaining slots.
  const seed: Array<{
    id?: string;
    name: string;
    ratePct: string;
    appliesTo: string;
  }> = [];
  for (let i = 0; i < Math.max(3, existing.length); i++) {
    const e = existing[i];
    seed.push({
      id: e?.id,
      name: e?.name ?? PRESET_LABELS[i] ?? "",
      ratePct: e ? (e.basisPoints / 100).toString() : "",
      appliesTo: e?.appliesTo ?? "STAY",
    });
  }

  return (
    <WizardShell
      step="taxes"
      title="Tax rates"
      description="Configure the taxes you collect. Skip if your jurisdiction doesn't apply lodging tax (you can add later)."
      skipHref="/admin/setup/addons"
    >
      <form action={saveTaxesStep} className="space-y-4">
        <div className="space-y-3">
          {seed.map((row, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <div className="col-span-6 space-y-1.5">
                {i === 0 ? <Label>Name</Label> : null}
                <Input
                  name={`rates[${i}].name`}
                  defaultValue={row.name}
                  placeholder={PRESET_LABELS[i] ?? ""}
                />
              </div>
              <div className="col-span-3 space-y-1.5">
                {i === 0 ? <Label>Rate %</Label> : null}
                <Input
                  name={`rates[${i}].ratePct`}
                  type="number"
                  step="0.01"
                  defaultValue={row.ratePct}
                  placeholder="0.00"
                />
              </div>
              <div className="col-span-3 space-y-1.5">
                {i === 0 ? <Label>Applies to</Label> : null}
                <select
                  name={`rates[${i}].appliesTo`}
                  defaultValue={row.appliesTo}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="STAY">Stay</option>
                  <option value="ADDON">Add-ons</option>
                  <option value="ALL">All</option>
                </select>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Leave a row blank to skip it. Add more taxes anytime via the Tax
          Rates page.
        </p>

        <div className="flex justify-end pt-2">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </WizardShell>
  );
}
