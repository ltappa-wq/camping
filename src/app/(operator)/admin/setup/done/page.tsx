import Link from "next/link";
import { Check } from "lucide-react";

import { requireOperatorProperty } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import { loadSetupSnapshot } from "../_lib/steps";
import { WizardShell } from "../_components/wizard-shell";

export const dynamic = "force-dynamic";

export default async function DoneStep() {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId || !ctx.prisma) {
    throw new Error("No property");
  }
  const snapshot = await loadSetupSnapshot(ctx.propertyId);
  const [taxCount, addonCount] = await Promise.all([
    ctx.prisma.taxRate.count({ where: { active: true } }),
    ctx.prisma.addon.count({ where: { active: true } }),
  ]);
  const sendingDomainVerified = ctx.property?.sendingDomainVerified === true;

  const checklist = [
    { ok: snapshot.hasName, label: "Property name + address" },
    { ok: snapshot.hasContact && snapshot.hasSeason, label: "Property basics" },
    { ok: snapshot.hasSiteType, label: "First site type" },
    { ok: snapshot.hasSite, label: "Sites" },
    { ok: snapshot.hasRatePlan, label: "First rate plan" },
    { ok: taxCount > 0, label: `Tax rates (${taxCount})`, optional: true },
    { ok: addonCount > 0, label: `Add-ons (${addonCount})`, optional: true },
    {
      ok: sendingDomainVerified,
      label: "Verified sending domain",
      optional: true,
    },
  ];

  return (
    <WizardShell
      step="done"
      title="You're set up"
      description="Here's what you've configured. Anything marked optional you can finish later from the admin sidebar."
    >
      <div className="space-y-4">
        <ul className="space-y-2">
          {checklist.map((item, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${
                    item.ok
                      ? "bg-emerald-600 text-white"
                      : "border bg-muted text-muted-foreground"
                  }`}
                >
                  {item.ok ? <Check className="h-3 w-3" /> : null}
                </span>
                <span>{item.label}</span>
              </div>
              {item.optional && !item.ok ? (
                <span className="text-xs text-muted-foreground">
                  Optional
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="flex justify-end">
          <Button asChild>
            <Link href="/admin">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </WizardShell>
  );
}
