import { requireOperatorProperty } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveRemindersStep } from "../actions";
import { WizardShell } from "../_components/wizard-shell";

export const dynamic = "force-dynamic";

export default async function RemindersStep() {
  const ctx = await requireOperatorProperty();
  const p = ctx.property;

  return (
    <WizardShell
      step="reminders"
      title="Reminder emails"
      description="Choose which automated emails go to guests. You can edit the wording on the Emails page later."
      skipHref="/admin/setup/domain"
    >
      <form action={saveRemindersStep} className="space-y-4">
        <div className="space-y-2">
          <Toggle
            name="reminder7DaysEnabled"
            label="7 days before arrival"
            defaultChecked={p?.reminder7DaysEnabled ?? true}
          />
          <Toggle
            name="reminder3DaysEnabled"
            label="3 days before arrival"
            defaultChecked={p?.reminder3DaysEnabled ?? true}
          />
          <Toggle
            name="reminderArrivalDayEnabled"
            label="Morning of check-in"
            defaultChecked={p?.reminderArrivalDayEnabled ?? true}
          />
          <Toggle
            name="reminderPostStayEnabled"
            label="Day after check-out (thank-you)"
            defaultChecked={p?.reminderPostStayEnabled ?? true}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="checkInInstructions">
            Check-in instructions (optional)
          </Label>
          <Textarea
            id="checkInInstructions"
            name="checkInInstructions"
            rows={4}
            defaultValue={p?.checkInInstructions ?? ""}
            placeholder="Office hours, gate code, after-hours envelope location…"
          />
          <p className="text-xs text-muted-foreground">
            Injected into the 7-day, 3-day, and arrival-day reminders.
          </p>
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
    <label className="flex items-center justify-between rounded-md border bg-background p-3 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        value="true"
        className="h-4 w-4"
      />
    </label>
  );
}
