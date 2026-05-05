import { z } from "zod";

const optionalInt = (max: number) =>
  z
    .union([z.coerce.number().int().min(0).max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v === null ? null : (v as number)))
    .nullable();

export const addonFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  // Operator types dollars; persisted as integer cents.
  priceDollars: z.coerce.number().min(0, "Cannot be negative"),
  // Null = unlimited inventory.
  inventoryCount: optionalInt(100000),
  active: z.boolean().default(true),
});

export type AddonFormValues = z.input<typeof addonFormSchema>;
export type AddonFormParsed = z.output<typeof addonFormSchema>;
