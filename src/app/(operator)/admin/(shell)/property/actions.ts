"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireOperatorProperty } from "@/lib/auth-property";
import {
  deletePropertyMapByUrl,
  uploadPropertyMap,
} from "@/lib/storage";
import { propertyFormSchema, type PropertyFormParsed } from "./schema";

export type ActionResult =
  | { ok: true; mapImageUrl?: string | null }
  | { ok: false; error: string };

/**
 * Save the entire Property settings form in one Prisma transaction.
 * Map image uploads happen via uploadMapImageAction (separate call) and
 * the resulting URL is sent in `values.mapImageUrl`. If the URL changed,
 * the previous one is deleted from storage afterwards.
 */
export async function saveProperty(
  values: PropertyFormParsed,
): Promise<ActionResult> {
  const ctx = await requireOperatorProperty();
  if (!ctx.property || !ctx.propertyId) {
    return { ok: false, error: "No property to update" };
  }

  const parsed = propertyFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const previousMapUrl = ctx.property.mapImageUrl;

  await prisma.property.update({
    where: { id: ctx.propertyId },
    data: {
      name: v.name,
      phone: v.phone ?? null,
      email: v.email ?? null,
      addressLine1: v.addressLine1 ?? null,
      addressLine2: v.addressLine2 ?? null,
      city: v.city ?? null,
      state: v.state ?? null,
      postalCode: v.postalCode ?? null,
      logoUrl: v.logoUrl ?? null,
      primaryColor: v.primaryColor ?? null,
      mapImageUrl: v.mapImageUrl ?? null,
      seasonStartMonth: v.seasonStartMonth ?? null,
      seasonStartDay: v.seasonStartDay ?? null,
      seasonEndMonth: v.seasonEndMonth ?? null,
      seasonEndDay: v.seasonEndDay ?? null,
      checkInTime: v.checkInTime,
      checkOutTime: v.checkOutTime,
      cancelFullRefundDays: v.cancelFullRefundDays,
      cancelPartialRefundDays: v.cancelPartialRefundDays,
      cancelPartialRefundPct: v.cancelPartialRefundPct,
      description: v.description ?? null,
      rulesText: v.rulesText ?? null,
      directionsText: v.directionsText ?? null,
      guestModificationCutoffHours: v.guestModificationCutoffHours,
      reminder7DaysEnabled: v.reminder7DaysEnabled,
      reminder3DaysEnabled: v.reminder3DaysEnabled,
      reminderArrivalDayEnabled: v.reminderArrivalDayEnabled,
      reminderPostStayEnabled: v.reminderPostStayEnabled,
      checkInInstructions: v.checkInInstructions ?? null,
    },
  });

  // Best-effort cleanup of previous map image when replaced or removed.
  if (
    previousMapUrl &&
    previousMapUrl !== v.mapImageUrl
  ) {
    try {
      await deletePropertyMapByUrl(previousMapUrl);
    } catch {
      // Non-fatal: orphaned objects can be cleaned up later.
    }
  }

  revalidatePath("/admin/property");
  return { ok: true, mapImageUrl: v.mapImageUrl ?? null };
}

/**
 * Upload a campground map image and return its public URL.
 * Called from the file picker before the form is submitted; the URL is
 * placed back into the RHF state and persisted on the next "Save" click.
 */
export async function uploadMapImageAction(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireOperatorProperty();
  if (!ctx.property || !ctx.propertyId) {
    return { ok: false, error: "No property" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file uploaded" };
  }

  try {
    const bytes = await file.arrayBuffer();
    const result = await uploadPropertyMap({
      propertyId: ctx.propertyId,
      filename: file.name,
      contentType: file.type,
      bytes,
    });
    return { ok: true, mapImageUrl: result.publicUrl };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    return { ok: false, error: message };
  }
}
