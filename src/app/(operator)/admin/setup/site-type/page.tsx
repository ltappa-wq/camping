import { requireOperatorProperty } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveSiteTypeStep } from "../actions";
import { WizardShell } from "../_components/wizard-shell";

export const dynamic = "force-dynamic";

export default async function SiteTypeStep() {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId || !ctx.prisma) {
    throw new Error("No property");
  }
  const existing = await ctx.prisma.siteType.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  return (
    <WizardShell
      step="site-type"
      title="First site type"
      description="A site type groups sites with the same amenities (e.g. 'Wooded Electric'). You can add more later."
    >
      <form action={saveSiteTypeStep} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={existing?.name ?? ""}
            placeholder="Wooded Electric Site"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            name="description"
            rows={2}
            defaultValue={existing?.description ?? ""}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="electricAmps">Electric (amps)</Label>
            <Input
              id="electricAmps"
              name="electricAmps"
              type="number"
              defaultValue={existing?.electricAmps ?? ""}
              placeholder="30"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxRvLengthFt">Max RV length (ft)</Label>
            <Input
              id="maxRvLengthFt"
              name="maxRvLengthFt"
              type="number"
              defaultValue={existing?.maxRvLengthFt ?? ""}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="maxAdults">Max adults</Label>
            <Input
              id="maxAdults"
              name="maxAdults"
              type="number"
              defaultValue={existing?.maxAdults ?? 2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxChildren">Max children</Label>
            <Input
              id="maxChildren"
              name="maxChildren"
              type="number"
              defaultValue={existing?.maxChildren ?? 4}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Toggle
            name="hasWater"
            label="Water"
            defaultChecked={existing?.hasWater ?? false}
          />
          <Toggle
            name="hasSewer"
            label="Sewer"
            defaultChecked={existing?.hasSewer ?? false}
          />
          <Toggle
            name="petsAllowed"
            label="Pets OK"
            defaultChecked={existing?.petsAllowed ?? true}
          />
          <Toggle
            name="tentsAllowed"
            label="Tents OK"
            defaultChecked={existing?.tentsAllowed ?? false}
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </WizardShell>
  );
}

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        value="true"
        className="h-4 w-4"
      />
      {label}
    </label>
  );
}
