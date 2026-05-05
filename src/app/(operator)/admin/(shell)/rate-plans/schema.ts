import { z } from "zod";

export const CHARGE_UNITS = ["NIGHT", "WEEK", "MONTH", "SEASON"] as const;
export type ChargeUnit = (typeof CHARGE_UNITS)[number];

const optionalIntInput = (max: number) =>
  z
    .union([z.coerce.number().int().min(1).max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v === null ? null : (v as number)))
    .nullable();

const optionalDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
  .transform((v) => (v === "" || v == null ? null : (v as string)))
  .nullable();

export const ratePlanFormSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1, "Name is required").max(120),
    // null = applies to all site types. Empty string from Select treated as null.
    siteTypeId: z
      .string()
      .transform((v) => (v === "" || v === "__all__" ? null : v))
      .nullable(),
    chargeUnit: z.enum(CHARGE_UNITS),
    // Operator enters dollars (e.g. "40" or "40.00"); persisted as integer cents.
    priceDollars: z.coerce.number().min(0, "Cannot be negative"),

    minStayDays: z.coerce.number().int().min(1).max(3650).default(1),
    maxStayDays: optionalIntInput(3650),

    effectiveFrom: optionalDate,
    effectiveTo: optionalDate,

    priority: z.coerce.number().int().min(0).max(1000).default(0),
    active: z.boolean().default(true),
  })
  .refine(
    (v) => v.maxStayDays == null || v.maxStayDays >= v.minStayDays,
    {
      message: "Max stay must be greater than or equal to min stay",
      path: ["maxStayDays"],
    },
  )
  .refine(
    (v) =>
      v.effectiveFrom == null ||
      v.effectiveTo == null ||
      v.effectiveFrom <= v.effectiveTo,
    {
      message: "Effective end must be on or after start",
      path: ["effectiveTo"],
    },
  );

export type RatePlanFormValues = z.input<typeof ratePlanFormSchema>;
export type RatePlanFormParsed = z.output<typeof ratePlanFormSchema>;

export const CHARGE_UNIT_LABELS: Record<ChargeUnit, string> = {
  NIGHT: "Per night",
  WEEK: "Per week",
  MONTH: "Per month",
  SEASON: "Per season",
};
