import { z } from "zod";

export const siteFormSchema = z.object({
  id: z.string().optional(),
  siteTypeId: z.string().min(1, "Pick a site type"),
  label: z.string().trim().min(1, "Label is required").max(40),
  notes: z.string().trim().max(2000).optional().nullable(),
  // Comma-separated in the UI; we split / trim / dedupe before persisting.
  tagsText: z.string().optional().default(""),
  active: z.boolean().default(true),
});

export type SiteFormValues = z.input<typeof siteFormSchema>;
export type SiteFormParsed = z.output<typeof siteFormSchema>;

export function parseTags(text: string): string[] {
  const parts = text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return Array.from(new Set(parts));
}

export function formatTags(tags: string[]): string {
  return tags.join(", ");
}
