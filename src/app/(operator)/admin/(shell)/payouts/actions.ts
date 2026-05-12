"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOperatorProperty } from "@/lib/auth-property";
import { blockIfImpersonating } from "@/lib/impersonation-block";
import { prisma } from "@/lib/prisma";
import {
  createDashboardLoginLink,
  createOnboardingLink,
} from "@/lib/stripe";

// Decision: every Server Action in this file is operator-only. A
// platform admin acting on behalf of an org must NOT be able to start
// or refresh Stripe Connect onboarding, open the operator's Stripe
// dashboard, or change the platform fee — those are privileged
// operator decisions. blockIfImpersonating() throws up front; the
// /admin/payouts page renders a read-only notice instead of these
// controls when impersonating, so this guard is the belt to that page's
// suspenders.

export async function continueOnboardingAction(): Promise<void> {
  await blockIfImpersonating();
  const ctx = await requireOperatorProperty();
  const url = await createOnboardingLink(ctx.organization.id);
  redirect(url);
}

export async function openStripeDashboardAction(): Promise<void> {
  await blockIfImpersonating();
  const ctx = await requireOperatorProperty();
  const url = await createDashboardLoginLink(ctx.organization.id);
  redirect(url);
}

/**
 * Flip whether the customer pays the platform fee on top of their booking
 * total or whether the operator absorbs it via Stripe's application fee on
 * the destination charge. Existing reservations carry their fee snapshot
 * in their line items, so this only affects future bookings.
 *
 * Operator-only — see top-of-file decision.
 */
export async function setFeePassThroughAction(
  customerPaysPlatformFee: boolean,
): Promise<void> {
  await blockIfImpersonating();
  const ctx = await requireOperatorProperty();
  await prisma.organization.update({
    where: { id: ctx.organization.id },
    data: { customerPaysPlatformFee },
  });
  revalidatePath("/admin/payouts");
}
