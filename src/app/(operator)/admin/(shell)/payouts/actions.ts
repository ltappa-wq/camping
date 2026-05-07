"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOperatorProperty } from "@/lib/auth-property";
import { prisma } from "@/lib/prisma";
import {
  createDashboardLoginLink,
  createOnboardingLink,
} from "@/lib/stripe";

export async function continueOnboardingAction(): Promise<void> {
  const ctx = await requireOperatorProperty();
  const url = await createOnboardingLink(ctx.organization.id);
  redirect(url);
}

export async function openStripeDashboardAction(): Promise<void> {
  const ctx = await requireOperatorProperty();
  const url = await createDashboardLoginLink(ctx.organization.id);
  redirect(url);
}

/**
 * Flip whether the customer pays the platform fee on top of their booking
 * total or whether the operator absorbs it via Stripe's application fee on
 * the destination charge. Existing reservations carry their fee snapshot
 * in their line items, so this only affects future bookings.
 */
export async function setFeePassThroughAction(
  customerPaysPlatformFee: boolean,
): Promise<void> {
  const ctx = await requireOperatorProperty();
  await prisma.organization.update({
    where: { id: ctx.organization.id },
    data: { customerPaysPlatformFee },
  });
  revalidatePath("/admin/payouts");
}
