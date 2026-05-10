"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireOperatorProperty } from "@/lib/auth-property";
import { dollarsToCents } from "@/lib/money";
import type { ChargeUnit } from "@prisma/client";
import { nextStep, type StepSlug } from "./_lib/steps";

function navigateNext(current: StepSlug): never {
  const next = nextStep(current);
  if (!next) redirect("/admin");
  redirect(`/admin/setup/${next}`);
}

/** Pull a stringy field out of FormData, trim it, and treat "" as undefined. */
function s(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

function bool(form: FormData, key: string): boolean {
  return form.get(key) != null;
}

// =============================================================================
// Step 1 — Welcome (name + address only)
// =============================================================================

const welcomeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  addressLine1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(40).optional(),
  postalCode: z.string().trim().max(20).optional(),
});

export async function saveWelcomeStep(form: FormData) {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId) throw new Error("No property");
  const parsed = welcomeSchema.parse({
    name: s(form, "name"),
    addressLine1: s(form, "addressLine1"),
    city: s(form, "city"),
    state: s(form, "state"),
    postalCode: s(form, "postalCode"),
  });
  await ctx.prisma!.property.update({
    where: { id: ctx.propertyId },
    data: {
      name: parsed.name,
      addressLine1: parsed.addressLine1 ?? null,
      city: parsed.city ?? null,
      state: parsed.state ?? null,
      postalCode: parsed.postalCode ?? null,
    },
  });
  revalidatePath("/admin/setup");
  navigateNext("welcome");
}

// =============================================================================
// Step 2 — Property basics (contact, season, times, free-form text)
// =============================================================================

const TIME_HHMM = /^([0-1]?\d|2[0-3]):[0-5]\d$/;
const basicsSchema = z
  .object({
    phone: z.string().trim().max(60).optional(),
    email: z
      .string()
      .trim()
      .max(200)
      .optional()
      .refine((v) => !v || /.+@.+\..+/.test(v), "Invalid email"),
    seasonStartMonth: z.coerce.number().int().min(1).max(12),
    seasonStartDay: z.coerce.number().int().min(1).max(31),
    seasonEndMonth: z.coerce.number().int().min(1).max(12),
    seasonEndDay: z.coerce.number().int().min(1).max(31),
    checkInTime: z.string().regex(TIME_HHMM, "Use HH:mm (24h)"),
    checkOutTime: z.string().regex(TIME_HHMM, "Use HH:mm (24h)"),
    description: z.string().trim().max(5000).optional(),
    rulesText: z.string().trim().max(5000).optional(),
    directionsText: z.string().trim().max(5000).optional(),
  })
  .refine((v) => v.phone || v.email, {
    message: "Add at least a phone or email",
    path: ["email"],
  });

export async function saveBasicsStep(form: FormData) {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId) throw new Error("No property");
  const parsed = basicsSchema.parse({
    phone: s(form, "phone"),
    email: s(form, "email"),
    seasonStartMonth: s(form, "seasonStartMonth"),
    seasonStartDay: s(form, "seasonStartDay"),
    seasonEndMonth: s(form, "seasonEndMonth"),
    seasonEndDay: s(form, "seasonEndDay"),
    checkInTime: s(form, "checkInTime"),
    checkOutTime: s(form, "checkOutTime"),
    description: s(form, "description"),
    rulesText: s(form, "rulesText"),
    directionsText: s(form, "directionsText"),
  });
  await ctx.prisma!.property.update({
    where: { id: ctx.propertyId },
    data: {
      phone: parsed.phone ?? null,
      email: parsed.email ?? null,
      seasonStartMonth: parsed.seasonStartMonth,
      seasonStartDay: parsed.seasonStartDay,
      seasonEndMonth: parsed.seasonEndMonth,
      seasonEndDay: parsed.seasonEndDay,
      checkInTime: parsed.checkInTime,
      checkOutTime: parsed.checkOutTime,
      description: parsed.description ?? null,
      rulesText: parsed.rulesText ?? null,
      directionsText: parsed.directionsText ?? null,
    },
  });
  revalidatePath("/admin/setup");
  navigateNext("basics");
}

// =============================================================================
// Step 3 — First site type
// =============================================================================

const siteTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(2000).optional(),
  electricAmps: z
    .union([z.coerce.number().int().min(0).max(200), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  hasWater: z.boolean(),
  hasSewer: z.boolean(),
  maxRvLengthFt: z
    .union([z.coerce.number().int().min(0).max(200), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  maxAdults: z
    .union([z.coerce.number().int().min(0).max(20), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  maxChildren: z
    .union([z.coerce.number().int().min(0).max(20), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  petsAllowed: z.boolean(),
  tentsAllowed: z.boolean(),
});

export async function saveSiteTypeStep(form: FormData) {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId) throw new Error("No property");
  const parsed = siteTypeSchema.parse({
    name: s(form, "name"),
    description: s(form, "description"),
    electricAmps: s(form, "electricAmps") ?? "",
    hasWater: bool(form, "hasWater"),
    hasSewer: bool(form, "hasSewer"),
    maxRvLengthFt: s(form, "maxRvLengthFt") ?? "",
    maxAdults: s(form, "maxAdults") ?? "",
    maxChildren: s(form, "maxChildren") ?? "",
    petsAllowed: bool(form, "petsAllowed"),
    tentsAllowed: bool(form, "tentsAllowed"),
  });
  // Find existing first site type for this property; update if present so
  // resuming the wizard doesn't create duplicates.
  const existing = await ctx.prisma!.siteType.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const data = {
    name: parsed.name,
    description: parsed.description ?? null,
    electricAmps: parsed.electricAmps,
    hasWater: parsed.hasWater,
    hasSewer: parsed.hasSewer,
    maxRvLengthFt: parsed.maxRvLengthFt,
    maxAdults: parsed.maxAdults,
    maxChildren: parsed.maxChildren,
    petsAllowed: parsed.petsAllowed,
    tentsAllowed: parsed.tentsAllowed,
  };
  if (existing) {
    await ctx.prisma!.siteType.update({ where: { id: existing.id }, data });
  } else {
    await ctx.prisma!.siteType.create({
      data: { ...data, propertyId: ctx.propertyId },
    });
  }
  revalidatePath("/admin/setup");
  navigateNext("site-type");
}

// =============================================================================
// Step 4 — Bulk-create sites
// =============================================================================

const sitesSchema = z.object({
  prefix: z.string().trim().max(20).optional(),
  startNumber: z.coerce.number().int().min(0).max(99999),
  count: z.coerce.number().int().min(0).max(500),
  tagsText: z.string().trim().max(200).optional(),
});

export async function saveSitesStep(form: FormData) {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId) throw new Error("No property");
  const parsed = sitesSchema.parse({
    prefix: s(form, "prefix"),
    startNumber: s(form, "startNumber") ?? 0,
    count: s(form, "count") ?? 0,
    tagsText: s(form, "tagsText"),
  });
  if (parsed.count === 0) {
    // Operator chose to skip creating more — only allowed if they already have at least one.
    const existingCount = await ctx.prisma!.site.count({
      where: { deletedAt: null },
    });
    if (existingCount === 0) {
      throw new Error("Add at least one site to continue.");
    }
    revalidatePath("/admin/setup");
    navigateNext("sites");
  }
  const siteType = await ctx.prisma!.siteType.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (!siteType) {
    throw new Error("Create a site type first.");
  }
  const tags =
    parsed.tagsText
      ?.split(",")
      .map((t) => t.trim())
      .filter(Boolean) ?? [];
  const labels: string[] = [];
  for (let i = 0; i < parsed.count; i++) {
    labels.push(`${parsed.prefix ?? ""}${parsed.startNumber + i}`);
  }
  // Skip labels that already exist (idempotent on resume).
  const existing = await ctx.prisma!.site.findMany({
    where: { label: { in: labels } },
    select: { label: true },
  });
  const existingLabels = new Set(existing.map((x) => x.label));
  const toCreate = labels.filter((l) => !existingLabels.has(l));
  if (toCreate.length > 0) {
    await ctx.prisma!.site.createMany({
      data: toCreate.map((label) => ({
        propertyId: ctx.propertyId,
        siteTypeId: siteType.id,
        label,
        tags,
        active: true,
      })),
    });
  }
  revalidatePath("/admin/setup");
  navigateNext("sites");
}

// =============================================================================
// Step 5 — First rate plan
// =============================================================================

const ratePlanSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  chargeUnit: z.enum(["NIGHT", "WEEK", "MONTH", "SEASON"]),
  pricePerUnitDollars: z.coerce.number().min(0),
  minStayDays: z.coerce.number().int().min(1).max(365),
  maxStayDays: z
    .union([z.coerce.number().int().min(1).max(3650), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  priority: z.coerce.number().int().min(0).max(100),
});

export async function saveRatePlanStep(form: FormData) {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId) throw new Error("No property");
  const parsed = ratePlanSchema.parse({
    name: s(form, "name"),
    chargeUnit: s(form, "chargeUnit"),
    pricePerUnitDollars: s(form, "pricePerUnitDollars") ?? 0,
    minStayDays: s(form, "minStayDays") ?? 1,
    maxStayDays: s(form, "maxStayDays") ?? "",
    priority: s(form, "priority") ?? 0,
  });
  const existing = await ctx.prisma!.ratePlan.findFirst({
    where: { name: parsed.name },
  });
  const data = {
    name: parsed.name,
    chargeUnit: parsed.chargeUnit as ChargeUnit,
    pricePerUnitCents: dollarsToCents(parsed.pricePerUnitDollars),
    minStayDays: parsed.minStayDays,
    maxStayDays: parsed.maxStayDays,
    priority: parsed.priority,
    active: true,
  };
  if (existing) {
    await ctx.prisma!.ratePlan.update({ where: { id: existing.id }, data });
  } else {
    await ctx.prisma!.ratePlan.create({
      data: { ...data, propertyId: ctx.propertyId },
    });
  }
  revalidatePath("/admin/setup");
  navigateNext("rate-plan");
}

// =============================================================================
// Step 6 — Cancellation policy
// =============================================================================

const cancelSchema = z
  .object({
    cancelFullRefundDays: z.coerce.number().int().min(0).max(365),
    cancelPartialRefundDays: z.coerce.number().int().min(0).max(365),
    cancelPartialRefundPct: z.coerce.number().int().min(0).max(100),
  })
  .refine((v) => v.cancelPartialRefundDays <= v.cancelFullRefundDays, {
    message: "Partial-refund window must be ≤ full-refund window",
    path: ["cancelPartialRefundDays"],
  });

export async function saveCancellationStep(form: FormData) {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId) throw new Error("No property");
  const parsed = cancelSchema.parse({
    cancelFullRefundDays: s(form, "cancelFullRefundDays") ?? 14,
    cancelPartialRefundDays: s(form, "cancelPartialRefundDays") ?? 7,
    cancelPartialRefundPct: s(form, "cancelPartialRefundPct") ?? 50,
  });
  await ctx.prisma!.property.update({
    where: { id: ctx.propertyId },
    data: parsed,
  });
  revalidatePath("/admin/setup");
  navigateNext("cancellation");
}

// =============================================================================
// Step 7 — Tax rates (variable list, indexed names like rates[0].name)
// =============================================================================

const taxRowSchema = z.object({
  name: z.string().trim().max(120).optional(),
  ratePct: z.string().optional(),
  appliesTo: z.enum(["STAY", "ADDON", "ALL"]).optional(),
});

export async function saveTaxesStep(form: FormData) {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId) throw new Error("No property");
  // Parse rates[N].* fields out of FormData.
  const rows: Array<{
    name: string;
    ratePct: number;
    appliesTo: string;
  }> = [];
  for (let i = 0; i < 50; i++) {
    const row = taxRowSchema.parse({
      name: s(form, `rates[${i}].name`),
      ratePct: s(form, `rates[${i}].ratePct`),
      appliesTo: s(form, `rates[${i}].appliesTo`),
    });
    if (!row.name && !row.ratePct) continue;
    const ratePct = Number(row.ratePct ?? 0);
    if (!row.name || isNaN(ratePct) || ratePct <= 0) continue;
    rows.push({
      name: row.name,
      ratePct,
      appliesTo: row.appliesTo ?? "STAY",
    });
  }
  await ctx.prisma!.$transaction([
    ctx.prisma!.taxRate.deleteMany({}),
    ctx.prisma!.taxRate.createMany({
      data: rows.map((r) => ({
        propertyId: ctx.propertyId,
        name: r.name,
        basisPoints: Math.round(r.ratePct * 100),
        appliesTo: r.appliesTo,
        active: true,
      })),
    }),
  ]);
  revalidatePath("/admin/setup");
  navigateNext("taxes");
}

// =============================================================================
// Step 8 — Add-ons (variable list)
// =============================================================================

export async function saveAddonsStep(form: FormData) {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId) throw new Error("No property");
  const rows: Array<{ name: string; priceDollars: number }> = [];
  for (let i = 0; i < 50; i++) {
    const name = s(form, `addons[${i}].name`);
    const price = s(form, `addons[${i}].priceDollars`);
    if (!name) continue;
    const priceDollars = Number(price ?? 0);
    if (isNaN(priceDollars)) continue;
    rows.push({ name, priceDollars });
  }
  await ctx.prisma!.$transaction([
    ctx.prisma!.addon.deleteMany({}),
    ctx.prisma!.addon.createMany({
      data: rows.map((r) => ({
        propertyId: ctx.propertyId,
        name: r.name,
        priceCents: dollarsToCents(r.priceDollars),
        active: true,
      })),
    }),
  ]);
  revalidatePath("/admin/setup");
  navigateNext("addons");
}

// =============================================================================
// Step 9 — Reminder preferences
// =============================================================================

export async function saveRemindersStep(form: FormData) {
  const ctx = await requireOperatorProperty();
  if (!ctx.propertyId) throw new Error("No property");
  const checkInInstructions = s(form, "checkInInstructions");
  await ctx.prisma!.property.update({
    where: { id: ctx.propertyId },
    data: {
      reminder7DaysEnabled: bool(form, "reminder7DaysEnabled"),
      reminder3DaysEnabled: bool(form, "reminder3DaysEnabled"),
      reminderArrivalDayEnabled: bool(form, "reminderArrivalDayEnabled"),
      reminderPostStayEnabled: bool(form, "reminderPostStayEnabled"),
      checkInInstructions: checkInInstructions ?? null,
    },
  });
  revalidatePath("/admin/setup");
  navigateNext("reminders");
}
