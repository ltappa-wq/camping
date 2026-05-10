import { requireOperatorProperty } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCancellationStep } from "../actions";
import { WizardShell } from "../_components/wizard-shell";

export const dynamic = "force-dynamic";

export default async function CancellationStep() {
  const ctx = await requireOperatorProperty();
  const p = ctx.property;

  return (
    <WizardShell
      step="cancellation"
      title="Cancellation policy"
      description="Defaults are 14 / 7 / 50% — full refund 14+ days out, half refund 7-14 days out, no refund within 7 days."
    >
      <form action={saveCancellationStep} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cancelFullRefundDays">Full refund (days out)</Label>
            <Input
              id="cancelFullRefundDays"
              name="cancelFullRefundDays"
              type="number"
              min={0}
              defaultValue={p?.cancelFullRefundDays ?? 14}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cancelPartialRefundDays">Partial refund window</Label>
            <Input
              id="cancelPartialRefundDays"
              name="cancelPartialRefundDays"
              type="number"
              min={0}
              defaultValue={p?.cancelPartialRefundDays ?? 7}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cancelPartialRefundPct">Partial refund (%)</Label>
            <Input
              id="cancelPartialRefundPct"
              name="cancelPartialRefundPct"
              type="number"
              min={0}
              max={100}
              defaultValue={p?.cancelPartialRefundPct ?? 50}
              required
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Inside the partial-refund window: no refund.
        </p>

        <div className="flex justify-end pt-2">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </WizardShell>
  );
}
