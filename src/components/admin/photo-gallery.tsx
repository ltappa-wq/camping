"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type GalleryImage = {
  id: string;
  url: string;
  caption: string | null;
};

export type ActionResult = { ok: true } | { ok: false; error: string };

type Props = {
  images: GalleryImage[];
  /** "Property" or "Site" — used in copy. */
  label: string;
  /** Server-side cap. Reject more uploads above this. */
  maxImages: number;
  uploadAction: (formData: FormData) => Promise<ActionResult>;
  deleteAction: (imageId: string) => Promise<ActionResult>;
  reorderAction: (orderedIds: string[]) => Promise<ActionResult>;
  updateCaptionAction: (
    imageId: string,
    caption: string,
  ) => Promise<ActionResult>;
};

/**
 * Shared admin UI for managing a list of images on Property or Site.
 * Multi-file upload, drag-to-reorder via dnd-kit, inline caption editing,
 * delete with confirmation. Server-action callbacks own the data; the
 * component owns the optimistic local state for snappy reorder UX.
 */
export function PhotoGallery(props: Props) {
  const [images, setImages] = useState<GalleryImage[]>(props.images);
  const [uploading, startUploadTransition] = useTransition();
  const [savingOrder, setSavingOrder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Re-sync from server props when the parent reloads (e.g. after upload).
  useEffect(() => {
    setImages(props.images);
  }, [props.images]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleFiles(files: FileList) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    const remainingSlots = props.maxImages - images.length;
    if (remainingSlots <= 0) {
      toast({
        variant: "destructive",
        title: "Gallery full",
        description: `${props.label} galleries cap at ${props.maxImages} images.`,
      });
      return;
    }
    if (arr.length > remainingSlots) {
      toast({
        variant: "destructive",
        title: "Too many files",
        description: `Only ${remainingSlots} more image${remainingSlots === 1 ? "" : "s"} fit in this gallery.`,
      });
      return;
    }
    for (const file of arr) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast({
          variant: "destructive",
          title: "Unsupported file type",
          description: `${file.name} — use PNG, JPG, or WebP.`,
        });
        return;
      }
      if (file.size > MAX_BYTES) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: `${file.name} exceeds 10 MB.`,
        });
        return;
      }
    }

    startUploadTransition(async () => {
      // Sequential to surface per-file errors; parallel would race the
      // ordering on the server side.
      let okCount = 0;
      for (const file of arr) {
        const formData = new FormData();
        formData.append("file", file);
        const result = await props.uploadAction(formData);
        if (result.ok) okCount++;
        else {
          toast({
            variant: "destructive",
            title: `Upload failed: ${file.name}`,
            description: result.error,
          });
        }
      }
      if (okCount > 0) {
        toast({
          title: `${okCount} image${okCount === 1 ? "" : "s"} uploaded`,
        });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = images.findIndex((i) => i.id === active.id);
    const newIndex = images.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(images, oldIndex, newIndex);
    setImages(next);
    setSavingOrder(true);
    try {
      const result = await props.reorderAction(next.map((i) => i.id));
      if (!result.ok) {
        // Revert on failure.
        setImages(images);
        toast({
          variant: "destructive",
          title: "Reorder failed",
          description: result.error,
        });
      }
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleDelete(image: GalleryImage) {
    if (!confirm("Remove this image?")) return;
    const previous = images;
    setImages((cur) => cur.filter((i) => i.id !== image.id));
    const result = await props.deleteAction(image.id);
    if (!result.ok) {
      setImages(previous);
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: result.error,
      });
    } else {
      toast({ title: "Image removed" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {images.length} / {props.maxImages} images. Drag to reorder.
        </div>
        <div className="flex items-center gap-2">
          {savingOrder ? (
            <span className="text-xs text-muted-foreground">
              Saving order…
            </span>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || images.length >= props.maxImages}
          >
            {uploading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            Upload images
          </Button>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="rounded-md border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          No images yet. Upload up to {props.maxImages} — PNG, JPG, or WebP, 10
          MB each.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={images.map((i) => i.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((img) => (
                <SortableImage
                  key={img.id}
                  image={img}
                  onDelete={() => handleDelete(img)}
                  onCaptionSave={(caption) =>
                    props.updateCaptionAction(img.id, caption)
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableImage({
  image,
  onDelete,
  onCaptionSave,
}: {
  image: GalleryImage;
  onDelete: () => void;
  onCaptionSave: (caption: string) => Promise<ActionResult>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [caption, setCaption] = useState(image.caption ?? "");
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    setCaption(image.caption ?? "");
  }, [image.caption]);

  function saveCaption() {
    if ((image.caption ?? "") === caption) return;
    startTransition(async () => {
      const result = await onCaptionSave(caption);
      if (!result.ok) {
        toast({
          variant: "destructive",
          title: "Caption not saved",
          description: result.error,
        });
      }
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="overflow-hidden rounded-md border bg-card"
    >
      <div className="relative aspect-[4/3] bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.caption ?? ""}
          className="h-full w-full object-cover"
        />
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute left-2 top-2 rounded bg-background/80 p-1 backdrop-blur hover:bg-background"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="absolute right-2 top-2 rounded bg-background/80 p-1 text-destructive backdrop-blur hover:bg-background"
          aria-label="Delete image"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="p-2">
        <Input
          placeholder="Caption (optional)"
          value={caption}
          maxLength={200}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={saveCaption}
          className="text-sm"
          disabled={pending}
        />
      </div>
    </div>
  );
}
