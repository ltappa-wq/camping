"use server";

import { redirect } from "next/navigation";

import { requireOperatorProperty } from "@/lib/auth-property";
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
