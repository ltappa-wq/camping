import { z } from "zod";

export const TAX_APPLIES = ["STAY", "ADDON", "ALL"] as const;

export const taxRateFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  // Operator types percent (e.g. "5.5"). Stored as basis points.
  ratePercent: z.coerce
    .number()
    .min(0, "Cannot be negative")
    .max(100, "Cannot exceed 100%"),
  appliesTo: z.enum(TAX_APPLIES).default("STAY"),
  active: z.boolean().default(true),
});

export type TaxRateFormValues = z.input<typeof taxRateFormSchema>;
export type TaxRateFormParsed = z.output<typeof taxRateFormSchema>;
