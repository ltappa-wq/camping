import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { PhotoGallery } from "@/components/admin/photo-gallery";
import { Button } from "@/components/ui/button";
import {
  deleteSiteGalleryImage,
  reorderSiteGallery,
  SITE_GALLERY_MAX,
  updateSiteImageCaption,
  uploadSiteGalleryImage,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function SitePhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOperatorPropertyOrSetup();

  const site = await ctx.prisma.site.findFirst({
    where: { id },
    include: {
      siteType: { select: { name: true } },
      images: { orderBy: { order: "asc" } },
    },
  });
  if (!site) notFound();

  // Bind the site-scoped variants — the shared PhotoGallery component
  // expects single-arg signatures (no siteId from the client).
  const upload = uploadSiteGalleryImage.bind(null, site.id);
  const reorder = reorderSiteGallery.bind(null, site.id);

  return (
    <div>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin/sites">
            <ChevronLeft className="mr-1 h-4 w-4" /> Back to Sites
          </Link>
        </Button>
      </div>
      <PageHeader
        title={`Site ${site.label} — Photos`}
        description={`${site.siteType.name}. Up to ${SITE_GALLERY_MAX} images per site. The first image is what guests see on search results.`}
      />
      <PhotoGallery
        label="Site"
        maxImages={SITE_GALLERY_MAX}
        images={site.images.map((i) => ({
          id: i.id,
          url: i.url,
          caption: i.caption,
        }))}
        uploadAction={upload}
        deleteAction={deleteSiteGalleryImage}
        reorderAction={reorder}
        updateCaptionAction={updateSiteImageCaption}
      />
    </div>
  );
}
