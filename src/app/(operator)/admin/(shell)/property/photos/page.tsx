import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { PhotoGallery } from "@/components/admin/photo-gallery";
import { Button } from "@/components/ui/button";
import {
  deletePropertyGalleryImage,
  reorderPropertyGallery,
  updatePropertyImageCaption,
  uploadPropertyGalleryImage,
} from "./actions";
import { PROPERTY_GALLERY_MAX } from "./constants";

export const dynamic = "force-dynamic";

export default async function PropertyPhotosPage() {
  const ctx = await requireOperatorPropertyOrSetup();
  const images = await ctx.prisma.propertyImage.findMany({
    orderBy: { order: "asc" },
  });

  return (
    <div>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin/property">
            <ChevronLeft className="mr-1 h-4 w-4" /> Back to Property
          </Link>
        </Button>
      </div>
      <PageHeader
        title="Property photos"
        description="Gallery shown on your public property page below the description. Drag to reorder; the first image is the most prominent."
      />
      <PhotoGallery
        label="Property"
        maxImages={PROPERTY_GALLERY_MAX}
        images={images.map((i) => ({
          id: i.id,
          url: i.url,
          caption: i.caption,
        }))}
        uploadAction={uploadPropertyGalleryImage}
        deleteAction={deletePropertyGalleryImage}
        reorderAction={reorderPropertyGallery}
        updateCaptionAction={updatePropertyImageCaption}
      />
    </div>
  );
}
