"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { uploadHeroImageAction } from "./actions";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Upload widget for the hero image (single per property). Mirrors
 * MapImageUpload's UX — uploads to Supabase up front, hands the URL
 * back to RHF; persistence happens on the next form Save.
 */
export function HeroImageUpload({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [previewError, setPreviewError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Unsupported file type",
        description: "Use PNG, JPG, or WebP.",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Hero images are capped at 10 MB.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const result = await uploadHeroImageAction(formData);
      if (result.ok) {
        onChange(result.heroImageUrl ?? null);
        setPreviewError(false);
        toast({ title: "Hero image uploaded", description: "Click Save to apply." });
      } else {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: result.error,
        });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  return (
    <div className="space-y-3">
      {value && !previewError ? (
        <div className="relative aspect-[3/1] w-full max-w-2xl overflow-hidden rounded-md border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Hero preview"
            className="h-full w-full object-cover"
            onError={() => setPreviewError(true)}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
        >
          <Upload className="mr-2 h-4 w-4" />
          {isPending ? "Uploading…" : value ? "Replace hero" : "Upload hero"}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
            disabled={isPending}
          >
            <X className="mr-1 h-4 w-4" />
            Remove
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        PNG, JPG, or WebP up to 10 MB. Wide image recommended (3:1).
      </p>
    </div>
  );
}
