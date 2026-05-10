import { requireOperatorProperty } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveWelcomeStep } from "../actions";
import { WizardShell } from "../_components/wizard-shell";

export const dynamic = "force-dynamic";

export default async function WelcomeStep() {
  const ctx = await requireOperatorProperty();
  const p = ctx.property;

  return (
    <WizardShell
      step="welcome"
      title="Welcome"
      description={`Let's set up ${ctx.organization.name} for online bookings. Start with the basics — you can edit any of this later.`}
    >
      <form action={saveWelcomeStep} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Property name</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={p?.name ?? ""}
            placeholder="Monument Point Camping"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="addressLine1">Street address</Label>
          <Input
            id="addressLine1"
            name="addressLine1"
            defaultValue={p?.addressLine1 ?? ""}
            placeholder="1 Lighthouse Rd"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" defaultValue={p?.city ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              name="state"
              maxLength={2}
              defaultValue={p?.state ?? ""}
              placeholder="WI"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="postalCode">ZIP</Label>
            <Input
              id="postalCode"
              name="postalCode"
              defaultValue={p?.postalCode ?? ""}
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </WizardShell>
  );
}
