import { z } from "zod";

export const MODIFIER_TYPES = ["PERCENT", "FIXED_AMOUNT"] as const;
export type ModifierType = (typeof MODIFIER_TYPES)[number];

export const MODIFIER_APPLIES = ["DAY_OF_WEEK", "DATE_RANGE"] as const;
export type ModifierApplies = (typeof MODIFIER_APPLIES)[number];

export const DIRECTIONS = ["SURCHARGE", "DISCOUNT"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const optionalDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
  .transform((v) => (v === "" || v == null ? null : (v as string)))
  .nullable();

export const modifierFormSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1, "Name is required").max(120),
    siteTypeId: z
      .string()
      .transform((v) => (v === "" || v === "__all__" ? null : v))
      .nullable(),

    modifierType: z.enum(MODIFIER_TYPES),
    direction: z.enum(DIRECTIONS),
    // PERCENT: percent value (e.g. 10 = 10%, capped at 1000 for sanity)
    // FIXED_AMOUNT: dollar value (capped at 10000)
    magnitude: z.coerce.number().gt(0, "Must be greater than zero"),

    appliesTo: z.enum(MODIFIER_APPLIES),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
    startDate: optionalDate,
    endDate: optionalDate,

    priority: z.coerce.number().int().min(0).max(1000).default(0),
    active: z.boolean().default(true),
  })
  .refine(
    (v) => v.modifierType !== "PERCENT" || v.magnitude <= 1000,
    { message: "Percent must be <= 1000", path: ["magnitude"] },
  )
  .refine(
    (v) => v.modifierType !== "FIXED_AMOUNT" || v.magnitude <= 10000,
    { message: "Amount must be <= $10000", path: ["magnitude"] },
  )
  .refine(
    (v) => v.appliesTo !== "DAY_OF_WEEK" || v.daysOfWeek.length > 0,
    { message: "Pick at least one day", path: ["daysOfWeek"] },
  )
  .refine(
    (v) => v.appliesTo !== "DATE_RANGE" || (v.startDate && v.endDate),
    { message: "Both dates are required", path: ["startDate"] },
  )
  .refine(
    (v) =>
      v.appliesTo !== "DATE_RANGE" ||
      !v.startDate ||
      !v.endDate ||
      v.startDate <= v.endDate,
    { message: "End must be on or after start", path: ["endDate"] },
  );

export type ModifierFormValues = z.input<typeof modifierFormSchema>;
export type ModifierFormParsed = z.output<typeof modifierFormSchema>;

/** Convert (direction, magnitude, type) → signed integer for the DB column. */
export function toModifierValue(
  type: ModifierType,
  direction: Direction,
  magnitude: number,
): number {
  // PERCENT magnitude is whole-percent → basis points (×100)
  // FIXED magnitude is dollars → cents (×100)
  const abs = Math.round(magnitude * 100);
  return direction === "DISCOUNT" ? -abs : abs;
}

/** Inverse of toModifierValue: signed DB integer → (direction, magnitude). */
export function fromModifierValue(value: number): {
  direction: Direction;
  magnitude: number;
} {
  return {
    direction: value < 0 ? "DISCOUNT" : "SURCHARGE",
    magnitude: Math.abs(value) / 100,
  };
}
