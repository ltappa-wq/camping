import { requireOperatorProperty } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToDollars } from "@/lib/money";
import { saveAddonsStep } from "../actions";
import { WizardShell } from "../_components/wizard-shell";

export const dynamic = "force-dynamic";

const PRESET_NAMES = ["Firewood Bundle"];

export default async function AddonsStep() {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId || !ctx.prisma) throw new Error("No property");
  const existing = await ctx.prisma.addon.findMany({
    orderBy: { createdAt: "asc" },
  });

  // Show 5 rows: existing first, then placeholders.
  const rows = [];
  for (let i = 0; i < Math.max(5, existing.length); i++) {
    const e = existing[i];
    rows.push({
      name: e?.name ?? PRESET_NAMES[i] ?? "",
      priceDollars: e ? centsToDollars(e.priceCents).toString() : "",
    });
  }

  return (
    <WizardShell
      step="addons"
      title="Add-ons"
      description="Optional purchases at checkout — firewood, ice, propane. Skip if you don't sell anything on top of stays."
      skipHref="/admin/setup/reminders"
    >
      <form action={saveAddonsStep} className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <div className="col-span-8 space-y-1.5">
              {i === 0 ? <Label>Name</Label> : null}
              <Input
                name={`addons[${i}].name`}
                defaultValue={row.name}
                placeholder="Firewood Bundle"
              />
            </div>
            <div className="col-span-4 space-y-1.5">
              {i === 0 ? <Label>Price ($)</Label> : null}
              <Input
                name={`addons[${i}].priceDollars`}
                type="number"
                step="0.01"
                defaultValue={row.priceDollars}
                placeholder="8.00"
              />
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Leave blank rows alone — they won&apos;t be saved.
        </p>

        <div className="flex justify-end pt-2">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </WizardShell>
  );
}
