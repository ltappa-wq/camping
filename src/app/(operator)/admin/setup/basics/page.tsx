import { requireOperatorProperty } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBasicsStep } from "../actions";
import { WizardShell } from "../_components/wizard-shell";

export const dynamic = "force-dynamic";

export default async function BasicsStep() {
  const ctx = await requireOperatorProperty();
  const p = ctx.property;

  return (
    <WizardShell
      step="basics"
      title="Property basics"
      description="Contact info, season window, and check-in times — these flow into emails, the public page, and the booking flow."
    >
      <form action={saveBasicsStep} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={p?.phone ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Contact email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={p?.email ?? ""}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          One of phone or email is required — guest reply emails route to the
          contact email.
        </p>

        <div>
          <div className="mb-2 text-sm font-medium">Season window</div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="seasonStartMonth">Start month</Label>
              <Input
                id="seasonStartMonth"
                name="seasonStartMonth"
                type="number"
                min={1}
                max={12}
                defaultValue={p?.seasonStartMonth ?? 5}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seasonStartDay">Day</Label>
              <Input
                id="seasonStartDay"
                name="seasonStartDay"
                type="number"
                min={1}
                max={31}
                defaultValue={p?.seasonStartDay ?? 1}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seasonEndMonth">End month</Label>
              <Input
                id="seasonEndMonth"
                name="seasonEndMonth"
                type="number"
                min={1}
                max={12}
                defaultValue={p?.seasonEndMonth ?? 10}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seasonEndDay">Day</Label>
              <Input
                id="seasonEndDay"
                name="seasonEndDay"
                type="number"
                min={1}
                max={31}
                defaultValue={p?.seasonEndDay ?? 15}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="checkInTime">Check-in time</Label>
            <Input
              id="checkInTime"
              name="checkInTime"
              defaultValue={p?.checkInTime ?? "14:00"}
              placeholder="14:00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="checkOutTime">Check-out time</Label>
            <Input
              id="checkOutTime"
              name="checkOutTime"
              defaultValue={p?.checkOutTime ?? "11:00"}
              placeholder="11:00"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={p?.description ?? ""}
            placeholder="What guests should know about your campground."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rulesText">House rules</Label>
          <Textarea
            id="rulesText"
            name="rulesText"
            rows={3}
            defaultValue={p?.rulesText ?? ""}
            placeholder="Quiet hours, pet policy, etc."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="directionsText">Directions</Label>
          <Textarea
            id="directionsText"
            name="directionsText"
            rows={3}
            defaultValue={p?.directionsText ?? ""}
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </WizardShell>
  );
}
