"use server";

import { revalidatePath } from "next/cache";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { dollarsToCents } from "@/lib/money";
import { ratePlanFormSchema, type RatePlanFormParsed } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

function parseDateOnly(s: string | null): Date | null {
  if (!s) return null;
  // "YYYY-MM-DD" → midnight UTC; Prisma stores as @db.Date so the time is dropped.
  return new Date(`${s}T00:00:00.000Z`);
}

export async function saveRatePlan(
  values: RatePlanFormParsed,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const parsed = ratePlanFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const data = {
    name: v.name,
    siteTypeId: v.siteTypeId,
    chargeUnit: v.chargeUnit,
    pricePerUnitCents: dollarsToCents(v.priceDollars),
    minStayDays: v.minStayDays,
    maxStayDays: v.maxStayDays,
    effectiveFrom: parseDateOnly(v.effectiveFrom),
    effectiveTo: parseDateOnly(v.effectiveTo),
    priority: v.priority,
    active: v.active,
  };

  if (v.id) {
    await ctx.prisma.ratePlan.update({
      where: { id: v.id },
      data,
    });
  } else {
    await ctx.prisma.ratePlan.create({
      data: { ...data, propertyId: ctx.propertyId },
    });
  }

  revalidatePath("/admin/rate-plans");
  return { ok: true };
}

export async function deleteRatePlan(id: string): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.ratePlan.delete({ where: { id } });
  revalidatePath("/admin/rate-plans");
  return { ok: true };
}

export async function toggleRatePlanActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.ratePlan.update({
    where: { id },
    data: { active },
  });
  revalidatePath("/admin/rate-plans");
  return { ok: true };
}
