"use server";

import { revalidatePath } from "next/cache";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import {
  modifierFormSchema,
  toModifierValue,
  type ModifierFormParsed,
} from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

function parseDateOnly(s: string | null): Date | null {
  if (!s) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

export async function saveModifier(
  values: ModifierFormParsed,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const parsed = modifierFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const isDayOfWeek = v.appliesTo === "DAY_OF_WEEK";
  const data = {
    name: v.name,
    siteTypeId: v.siteTypeId,
    modifierType: v.modifierType,
    modifierValue: toModifierValue(v.modifierType, v.direction, v.magnitude),
    appliesTo: v.appliesTo,
    daysOfWeek: isDayOfWeek ? Array.from(new Set(v.daysOfWeek)).sort() : [],
    startDate: isDayOfWeek ? null : parseDateOnly(v.startDate),
    endDate: isDayOfWeek ? null : parseDateOnly(v.endDate),
    priority: v.priority,
    active: v.active,
  };

  if (v.id) {
    await ctx.prisma.rateModifier.update({
      where: { id: v.id },
      data,
    });
  } else {
    await ctx.prisma.rateModifier.create({
      data: { ...data, propertyId: ctx.propertyId },
    });
  }

  revalidatePath("/admin/modifiers");
  return { ok: true };
}

export async function deleteModifier(id: string): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.rateModifier.delete({ where: { id } });
  revalidatePath("/admin/modifiers");
  return { ok: true };
}

export async function toggleModifierActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.rateModifier.update({
    where: { id },
    data: { active },
  });
  revalidatePath("/admin/modifiers");
  return { ok: true };
}
