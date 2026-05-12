"use server";

import { revalidatePath } from "next/cache";

import { logIfImpersonating } from "@/lib/audit";
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

  await logIfImpersonating({
    action: v.id ? "addon.update" : "addon.create",
    description: v.id
      ? `Updated add-on "${v.name}"`
      : `Created add-on "${v.name}"`,
    propertyId: ctx.propertyId,
    payload: { addonId: v.id, name: v.name, priceCents: data.priceCents },
  });

  revalidatePath("/admin/addons");
  return { ok: true };
}

export async function deleteAddon(id: string): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const before = await ctx.prisma.addon.findUnique({
    where: { id },
    select: { name: true },
  });
  await ctx.prisma.addon.delete({ where: { id } });
  await logIfImpersonating({
    action: "addon.delete",
    description: `Deleted add-on "${before?.name ?? id}"`,
    propertyId: ctx.propertyId,
    payload: { addonId: id },
  });
  revalidatePath("/admin/addons");
  return { ok: true };
}

export async function toggleAddonActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const a = await ctx.prisma.addon.update({
    where: { id },
    data: { active },
  });
  await logIfImpersonating({
    action: "addon.toggle_active",
    description: `${active ? "Activated" : "Deactivated"} add-on "${a.name}"`,
    propertyId: ctx.propertyId,
    payload: { addonId: id, active },
  });
  revalidatePath("/admin/addons");
  return { ok: true };
}
