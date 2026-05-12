"use server";

import { revalidatePath } from "next/cache";

import { logIfImpersonating } from "@/lib/audit";
import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { dollarsToCents } from "@/lib/money";
import { ratePlanFormSchema, type RatePlanFormParsed } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

function parseDateOnly(s: string | null): Date | null {
  if (!s) return null;
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

  await logIfImpersonating({
    action: v.id ? "rate_plan.update" : "rate_plan.create",
    description: v.id
      ? `Updated rate plan "${v.name}"`
      : `Created rate plan "${v.name}"`,
    propertyId: ctx.propertyId,
    payload: {
      ratePlanId: v.id,
      name: v.name,
      pricePerUnitCents: data.pricePerUnitCents,
      chargeUnit: v.chargeUnit,
    },
  });

  revalidatePath("/admin/rate-plans");
  return { ok: true };
}

export async function deleteRatePlan(id: string): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const before = await ctx.prisma.ratePlan.findUnique({
    where: { id },
    select: { name: true },
  });
  await ctx.prisma.ratePlan.delete({ where: { id } });
  await logIfImpersonating({
    action: "rate_plan.delete",
    description: `Deleted rate plan "${before?.name ?? id}"`,
    propertyId: ctx.propertyId,
    payload: { ratePlanId: id },
  });
  revalidatePath("/admin/rate-plans");
  return { ok: true };
}

export async function toggleRatePlanActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const rp = await ctx.prisma.ratePlan.update({
    where: { id },
    data: { active },
  });
  await logIfImpersonating({
    action: "rate_plan.toggle_active",
    description: `${active ? "Activated" : "Deactivated"} rate plan "${rp.name}"`,
    propertyId: ctx.propertyId,
    payload: { ratePlanId: id, active },
  });
  revalidatePath("/admin/rate-plans");
  return { ok: true };
}
