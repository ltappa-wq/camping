"use server";

import { revalidatePath } from "next/cache";

import { logIfImpersonating } from "@/lib/audit";
import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { deleteSitePhotoByUrl, uploadSitePhoto } from "@/lib/storage";
import { SITE_GALLERY_MAX } from "./constants";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function assertSiteBelongsToProperty(
  ctx: Awaited<ReturnType<typeof requireOperatorPropertyOrSetup>>,
  siteId: string,
) {
  const site = await ctx.prisma.site.findFirst({
    where: { id: siteId },
    select: { id: true },
  });
  if (!site) throw new Error("Site not found");
  return site;
}

/**
 * Add one image to a site gallery. Server enforces the per-gallery cap
 * (5 images) and the site-belongs-to-property scope. New images get
 * order = max(current) + 1 so they sort to the bottom.
 */
export async function uploadSiteGalleryImage(
  siteId: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  try {
    await assertSiteBelongsToProperty(ctx, siteId);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Site not found",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file uploaded" };
  }

  const existingCount = await ctx.prisma.siteImage.count({
    where: { siteId },
  });
  if (existingCount >= SITE_GALLERY_MAX) {
    return {
      ok: false,
      error: `Site galleries cap at ${SITE_GALLERY_MAX} images.`,
    };
  }

  let publicUrl: string;
  try {
    const bytes = await file.arrayBuffer();
    const result = await uploadSitePhoto({
      propertyId: ctx.propertyId,
      siteId,
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

  const last = await ctx.prisma.siteImage.findFirst({
    where: { siteId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await ctx.prisma.siteImage.create({
    data: {
      siteId,
      url: publicUrl,
      order: (last?.order ?? -1) + 1,
    },
  });

  await logIfImpersonating({
    action: "photo.upload",
    description: "Uploaded a site gallery image",
    propertyId: ctx.propertyId,
    payload: { url: publicUrl, siteId, kind: "site" },
  });

  revalidatePath(`/admin/sites/${siteId}/photos`);
  revalidatePath(`/p/${ctx.property.slug}/search`);
  return { ok: true };
}

export async function deleteSiteGalleryImage(
  imageId: string,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const image = await ctx.prisma.siteImage.findFirst({
    where: { id: imageId, site: { propertyId: ctx.propertyId } },
  });
  if (!image) return { ok: false, error: "Image not found" };

  await ctx.prisma.siteImage.delete({ where: { id: imageId } });
  try {
    await deleteSitePhotoByUrl(image.url);
  } catch {
    // Non-fatal — orphaned object can be cleaned up later.
  }

  await logIfImpersonating({
    action: "photo.delete",
    description: "Removed a site gallery image",
    propertyId: ctx.propertyId,
    payload: { imageId, siteId: image.siteId, kind: "site" },
  });

  revalidatePath(`/admin/sites/${image.siteId}/photos`);
  revalidatePath(`/p/${ctx.property.slug}/search`);
  return { ok: true };
}

export async function reorderSiteGallery(
  siteId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  try {
    await assertSiteBelongsToProperty(ctx, siteId);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Site not found",
    };
  }
  // Defense: only IDs that belong to this site.
  const ours = await ctx.prisma.siteImage.findMany({
    where: { id: { in: orderedIds }, siteId },
    select: { id: true },
  });
  if (ours.length !== orderedIds.length) {
    return { ok: false, error: "Some images don't belong to this site." };
  }
  await ctx.prisma.$transaction(
    orderedIds.map((id, idx) =>
      ctx.prisma.siteImage.update({
        where: { id },
        data: { order: idx },
      }),
    ),
  );
  revalidatePath(`/admin/sites/${siteId}/photos`);
  revalidatePath(`/p/${ctx.property.slug}/search`);
  return { ok: true };
}

export async function updateSiteImageCaption(
  imageId: string,
  caption: string,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const image = await ctx.prisma.siteImage.findFirst({
    where: { id: imageId, site: { propertyId: ctx.propertyId } },
    select: { id: true, siteId: true },
  });
  if (!image) return { ok: false, error: "Image not found" };

  const trimmed = caption.trim().slice(0, 200);
  await ctx.prisma.siteImage.update({
    where: { id: imageId },
    data: { caption: trimmed.length > 0 ? trimmed : null },
  });
  revalidatePath(`/admin/sites/${image.siteId}/photos`);
  revalidatePath(`/p/${ctx.property.slug}/search`);
  return { ok: true };
}
