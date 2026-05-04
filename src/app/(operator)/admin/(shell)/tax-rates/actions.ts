"use server";

import { revalidatePath } from "next/cache";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { percentToBasisPoints } from "@/lib/money";
import { taxRateFormSchema, type TaxRateFormParsed } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveTaxRate(
  values: TaxRateFormParsed,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const parsed = taxRateFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const basisPoints = percentToBasisPoints(v.ratePercent);

  if (v.id) {
    await ctx.prisma.taxRate.update({
      where: { id: v.id },
      data: {
        name: v.name,
        basisPoints,
        appliesTo: v.appliesTo,
        active: v.active,
      },
    });
  } else {
    await ctx.prisma.taxRate.create({
      data: {
        propertyId: ctx.propertyId,
        name: v.name,
        basisPoints,
        appliesTo: v.appliesTo,
        active: v.active,
      },
    });
  }

  revalidatePath("/admin/tax-rates");
  return { ok: true };
}

export async function deleteTaxRate(id: string): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.taxRate.delete({ where: { id } });
  revalidatePath("/admin/tax-rates");
  return { ok: true };
}

export async function toggleTaxRateActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.taxRate.update({
    where: { id },
    data: { active },
  });
  revalidatePath("/admin/tax-rates");
  return { ok: true };
}
