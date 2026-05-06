"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { prisma } from "@/lib/prisma";
import {
  bulkSiteFormSchema,
  findLabelCollisions,
  generateBulkLabels,
  parseTags,
  siteFormSchema,
  type BulkSiteFormParsed,
  type SiteFormParsed,
} from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type BulkActionResult =
  | { ok: true; createdCount: number }
  | { ok: false; error: string };

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

/**
 * Bulk create sites in a single transaction. Pre-checks for label collisions
 * with a clear error message before any insert happens; the unique
 * constraint on (propertyId, label) is the final safety net against races.
 */
export async function bulkCreateSites(
  values: BulkSiteFormParsed,
): Promise<BulkActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const parsed = bulkSiteFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const labels = generateBulkLabels({
    prefix: v.prefix ?? "",
    startNumber: v.startNumber,
    count: v.count,
  });
  const tags = parseTags(v.tagsText ?? "");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.site.findMany({
        where: { propertyId: ctx.propertyId, label: { in: labels } },
        select: { label: true },
      });
      const collisions = findLabelCollisions(
        labels,
        existing.map((e) => e.label),
      );
      if (collisions.length > 0) {
        return { kind: "collision" as const, collisions };
      }
      await tx.site.createMany({
        data: labels.map((label) => ({
          propertyId: ctx.propertyId,
          siteTypeId: v.siteTypeId,
          label,
          tags,
          active: true,
        })),
      });
      return { kind: "ok" as const };
    });

    if (result.kind === "collision") {
      return {
        ok: false,
        error: `Cannot create — labels already in use: ${result.collisions.join(", ")}. Adjust your starting number or remove existing sites first.`,
      };
    }
  } catch (e) {
    // Race-condition fallback: another writer slipped a colliding label
    // between the pre-check and the insert.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok: false,
        error: "One or more labels were taken by another writer. Try again.",
      };
    }
    throw e;
  }

  revalidatePath("/admin/sites");
  return { ok: true, createdCount: labels.length };
}
