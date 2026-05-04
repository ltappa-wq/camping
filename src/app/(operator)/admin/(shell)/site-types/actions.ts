"use server";

import { revalidatePath } from "next/cache";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { siteTypeFormSchema, type SiteTypeFormParsed } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveSiteType(
  values: SiteTypeFormParsed,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const parsed = siteTypeFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const data = {
    name: v.name,
    description: v.description ?? null,
    electricAmps: v.electricAmps,
    hasWater: v.hasWater,
    hasSewer: v.hasSewer,
    maxRvLengthFt: v.maxRvLengthFt,
    maxAdults: v.maxAdults,
    maxChildren: v.maxChildren,
    petsAllowed: v.petsAllowed,
    tentsAllowed: v.tentsAllowed,
  };

  if (v.id) {
    await ctx.prisma.siteType.update({
      where: { id: v.id },
      data,
    });
  } else {
    await ctx.prisma.siteType.create({
      data: { ...data, propertyId: ctx.propertyId },
    });
  }

  revalidatePath("/admin/site-types");
  return { ok: true };
}

export async function archiveSiteType(id: string): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.siteType.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/admin/site-types");
  return { ok: true };
}

export async function restoreSiteType(id: string): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.siteType.update({
    where: { id },
    data: { deletedAt: null },
  });
  revalidatePath("/admin/site-types");
  return { ok: true };
}
