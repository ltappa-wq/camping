"use server";

import { revalidatePath } from "next/cache";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import {
  deletePropertyPhotoByUrl,
  uploadPropertyPhoto,
} from "@/lib/storage";

export const PROPERTY_GALLERY_MAX = 20;

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Add one image to the property gallery. Server enforces the per-gallery
 * cap (20 images). Order is appended at end + 1 so newly-uploaded
 * images sort to the bottom; the operator can drag them up.
 */
export async function uploadPropertyGalleryImage(
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file uploaded" };
  }

  const existingCount = await ctx.prisma.propertyImage.count();
  if (existingCount >= PROPERTY_GALLERY_MAX) {
    return {
      ok: false,
      error: `Property gallery is full (${PROPERTY_GALLERY_MAX} max).`,
    };
  }

  let publicUrl: string;
  try {
    const bytes = await file.arrayBuffer();
    const result = await uploadPropertyPhoto({
      propertyId: ctx.propertyId,
      filename: file.name,
      contentType: file.type,
      bytes,
    });
    publicUrl = result.publicUrl;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Upload failed",
    };
  }

  const last = await ctx.prisma.propertyImage.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await ctx.prisma.propertyImage.create({
    data: {
      propertyId: ctx.propertyId,
      url: publicUrl,
      order: (last?.order ?? -1) + 1,
    },
  });

  revalidatePath("/admin/property/photos");
  revalidatePath(`/p/${ctx.property.slug}`);
  return { ok: true };
}

export async function deletePropertyGalleryImage(
  imageId: string,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const image = await ctx.prisma.propertyImage.findUnique({
    where: { id: imageId },
  });
  if (!image) return { ok: false, error: "Image not found" };

  await ctx.prisma.propertyImage.delete({ where: { id: imageId } });
  try {
    await deletePropertyPhotoByUrl(image.url);
  } catch {
    // Non-fatal — orphaned object can be cleaned up later.
  }

  revalidatePath("/admin/property/photos");
  revalidatePath(`/p/${ctx.property.slug}`);
  return { ok: true };
}

/**
 * Persist a new ordering. Caller passes the IDs in their desired order;
 * we update each row's `order` to its index. The whole thing runs in a
 * single transaction so partial writes can't corrupt the sequence.
 */
export async function reorderPropertyGallery(
  orderedIds: string[],
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  // Defense: only accept IDs that belong to this property.
  const ours = await ctx.prisma.propertyImage.findMany({
    where: { id: { in: orderedIds } },
    select: { id: true },
  });
  const ourIds = new Set(ours.map((o) => o.id));
  if (ourIds.size !== orderedIds.length) {
    return {
      ok: false,
      error: "Some images don't belong to this property.",
    };
  }
  await ctx.prisma.$transaction(
    orderedIds.map((id, idx) =>
      ctx.prisma.propertyImage.update({
        where: { id },
        data: { order: idx },
      }),
    ),
  );
  revalidatePath("/admin/property/photos");
  revalidatePath(`/p/${ctx.property.slug}`);
  return { ok: true };
}

export async function updatePropertyImageCaption(
  imageId: string,
  caption: string,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const trimmed = caption.trim().slice(0, 200);
  await ctx.prisma.propertyImage.update({
    where: { id: imageId },
    data: { caption: trimmed.length > 0 ? trimmed : null },
  });
  revalidatePath("/admin/property/photos");
  revalidatePath(`/p/${ctx.property.slug}`);
  return { ok: true };
}
