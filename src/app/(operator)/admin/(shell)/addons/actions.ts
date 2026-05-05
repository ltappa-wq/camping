"use server";

import { revalidatePath } from "next/cache";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { dollarsToCents } from "@/lib/money";
import { addonFormSchema, type AddonFormParsed } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveAddon(
  values: AddonFormParsed,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const parsed = addonFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const data = {
    name: v.name,
    description: v.description ?? null,
    priceCents: dollarsToCents(v.priceDollars),
    inventoryCount: v.inventoryCount,
    active: v.active,
  };

  if (v.id) {
    await ctx.prisma.addon.update({ where: { id: v.id }, data });
  } else {
    await ctx.prisma.addon.create({
      data: { ...data, propertyId: ctx.propertyId },
    });
  }

  revalidatePath("/admin/addons");
  return { ok: true };
}

export async function deleteAddon(id: string): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.addon.delete({ where: { id } });
  revalidatePath("/admin/addons");
  return { ok: true };
}

export async function toggleAddonActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.addon.update({
    where: { id },
    data: { active },
  });
  revalidatePath("/admin/addons");
  return { ok: true };
}
