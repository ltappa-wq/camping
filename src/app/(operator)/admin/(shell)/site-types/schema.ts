import { z } from "zod";

const optionalInt = (max: number) =>
  z
    .union([z.coerce.number().int().min(0).max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v === null ? null : (v as number)))
    .nullable();

export const siteTypeFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(2000).optional().nullable(),

  electricAmps: optionalInt(400),
  hasWater: z.boolean().default(false),
  hasSewer: z.boolean().default(false),

  maxRvLengthFt: optionalInt(200),
  maxAdults: optionalInt(50),
  maxChildren: optionalInt(50),

  petsAllowed: z.boolean().default(true),
  tentsAllowed: z.boolean().default(false),
});

export type SiteTypeFormValues = z.input<typeof siteTypeFormSchema>;
export type SiteTypeFormParsed = z.output<typeof siteTypeFormSchema>;
