import { requireOperatorProperty } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSitesStep } from "../actions";
import { WizardShell } from "../_components/wizard-shell";

export const dynamic = "force-dynamic";

export default async function SitesStep() {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId || !ctx.prisma) throw new Error("No property");
  const siteCount = await ctx.prisma.site.count({
    where: { deletedAt: null },
  });

  return (
    <WizardShell
      step="sites"
      title="Add your sites"
      description={
        siteCount > 0
          ? `You already have ${siteCount} site${siteCount === 1 ? "" : "s"}. Add more or continue.`
          : "Bulk-create sites by label. You can edit individual sites afterwards."
      }
    >
      <form action={saveSitesStep} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="prefix">Prefix (optional)</Label>
            <Input id="prefix" name="prefix" placeholder="A" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="startNumber">Starting number</Label>
            <Input
              id="startNumber"
              name="startNumber"
              type="number"
              defaultValue={1}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="count">How many?</Label>
            <Input
              id="count"
              name="count"
              type="number"
              defaultValue={siteCount > 0 ? 0 : 35}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tagsText">Default tags (optional)</Label>
          <Input
            id="tagsText"
            name="tagsText"
            placeholder="shaded, pull-through"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated. Applied to every site you create here.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </WizardShell>
  );
}
