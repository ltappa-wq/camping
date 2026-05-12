"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { TagInput } from "@/components/ui/tag-input";

/**
 * Public search tag filter. Wraps TagInput in readOnly mode (guests
 * can only pick from the property's existing tag set) and pushes the
 * selection into the URL as a comma-separated `tags=` param so the
 * server-rendered results can filter accordingly.
 */
export function TagFilter({
  value,
  suggestions,
}: {
  value: string[];
  suggestions: ReadonlyArray<string>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setSelection(next: string[]) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next.length === 0) {
      params.delete("tags");
    } else {
      params.set("tags", next.join(","));
    }
    startTransition(() => router.push(`?${params.toString()}`));
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
        Filter by tag
      </div>
      <TagInput
        value={value}
        onChange={setSelection}
        suggestions={suggestions}
        readOnly
        placeholder="Pick from available tags…"
        disabled={isPending}
      />
    </div>
  );
}
