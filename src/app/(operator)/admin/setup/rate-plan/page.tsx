import { requireOperatorProperty } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToDollars } from "@/lib/money";
import { saveRatePlanStep } from "../actions";
import { WizardShell } from "../_components/wizard-shell";

export const dynamic = "force-dynamic";

export default async function RatePlanStep() {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId || !ctx.prisma) throw new Error("No property");
  const existing = await ctx.prisma.ratePlan.findFirst({
    orderBy: { createdAt: "asc" },
  });

  return (
    <WizardShell
      step="rate-plan"
      title="First rate plan"
      description="Most operators start with a nightly rate. You can layer in weekly, monthly, and seasonal plans later."
    >
      <form action={saveRatePlanStep} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={existing?.name ?? "Nightly"}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="chargeUnit">Charge per</Label>
            <select
              id="chargeUnit"
              name="chargeUnit"
              defaultValue={existing?.chargeUnit ?? "NIGHT"}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="NIGHT">Night</option>
              <option value="WEEK">Week</option>
              <option value="MONTH">Month</option>
              <option value="SEASON">Season</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pricePerUnitDollars">Price ($)</Label>
            <Input
              id="pricePerUnitDollars"
              name="pricePerUnitDollars"
              type="number"
              step="0.01"
              defaultValue={
                existing ? centsToDollars(existing.pricePerUnitCents) : 40
              }
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="minStayDays">Min nights</Label>
            <Input
              id="minStayDays"
              name="minStayDays"
              type="number"
              defaultValue={existing?.minStayDays ?? 1}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxStayDays">Max nights</Label>
            <Input
              id="maxStayDays"
              name="maxStayDays"
              type="number"
              defaultValue={existing?.maxStayDays ?? ""}
              placeholder="No limit"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              name="priority"
              type="number"
              defaultValue={existing?.priority ?? 0}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Priority breaks ties when multiple plans match a stay length —
          higher wins.
        </p>

        <div className="flex justify-end pt-2">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </WizardShell>
  );
}
