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

// ---- Bulk create ---------------------------------------------------------

export const BULK_MAX_COUNT = 100;

export const bulkSiteFormSchema = z.object({
  siteTypeId: z.string().min(1, "Pick a site type"),
  prefix: z.string().trim().max(20).optional().default(""),
  startNumber: z.coerce.number().int().min(1).default(1),
  count: z.coerce.number().int().min(1).max(BULK_MAX_COUNT).default(1),
  tagsText: z.string().optional().default(""),
});

export type BulkSiteFormValues = z.input<typeof bulkSiteFormSchema>;
export type BulkSiteFormParsed = z.output<typeof bulkSiteFormSchema>;

/** Generate the labels a bulk-create request would produce. Pure. */
export function generateBulkLabels(input: {
  prefix: string;
  startNumber: number;
  count: number;
}): string[] {
  return Array.from(
    { length: input.count },
    (_, i) => `${input.prefix}${input.startNumber + i}`,
  );
}

/** Return the subset of `generated` labels that already exist. Pure. */
export function findLabelCollisions(
  generated: ReadonlyArray<string>,
  existing: ReadonlyArray<string>,
): string[] {
  const set = new Set(existing);
  return generated.filter((l) => set.has(l));
}
