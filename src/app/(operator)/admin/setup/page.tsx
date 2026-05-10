import { redirect } from "next/navigation";

import { requireOperatorProperty } from "@/lib/auth-property";
import { loadSetupSnapshot, pickResumeStep } from "./_lib/steps";

/**
 * /admin/setup → resume at the right step. The shell layout redirects
 * here whenever required setup data is missing; this page picks the
 * specific step. Re-running the wizard manually goes through here too.
 */
export default async function SetupRoot() {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId) {
    // No property at all (rare — invite-only flow should always create one).
    // Send to welcome anyway so we get a useful error if we land here.
    redirect("/admin/setup/welcome");
  }
  const snapshot = await loadSetupSnapshot(ctx.propertyId);
  const next = pickResumeStep(snapshot);
  redirect(`/admin/setup/${next}`);
}
