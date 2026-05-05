"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import {
  parseTags,
  siteFormSchema,
  type SiteFormParsed,
} from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveSite(
  values: SiteFormParsed,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const parsed = siteFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const tags = parseTags(v.tagsText ?? "");

  const data = {
    siteTypeId: v.siteTypeId,
    label: v.label,
    notes: v.notes ?? null,
    tags,
    active: v.active,
  };

  try {
    if (v.id) {
      await ctx.prisma.site.update({
        where: { id: v.id },
        data,
      });
    } else {
      await ctx.prisma.site.create({
        data: { ...data, propertyId: ctx.propertyId },
      });
    }
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, error: `Label "${v.label}" is already in use.` };
    }
    throw e;
  }

  revalidatePath("/admin/sites");
  return { ok: true };
}

export async function archiveSite(id: string): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.site.update({
    where: { id },
    data: { deletedAt: new Date(), active: false },
  });
  revalidatePath("/admin/sites");
  return { ok: true };
}

export async function restoreSite(id: string): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.site.update({
    where: { id },
    data: { deletedAt: null },
  });
  revalidatePath("/admin/sites");
  return { ok: true };
}

export async function toggleSiteActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.site.update({
    where: { id },
    data: { active },
  });
  revalidatePath("/admin/sites");
  return { ok: true };
}
