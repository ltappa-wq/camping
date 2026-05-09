import { z } from "zod";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const TIME_HHMM = /^([0-1]?\d|2[0-3]):[0-5]\d$/;

const optionalString = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : undefined));

const optionalLong = z
  .string()
  .trim()
  .max(5000, "Max 5000 characters")
  .optional()
  .transform((v) => (v ? v : undefined));

const monthDay = z.object({
  month: z.coerce.number().int().min(1).max(12).optional().nullable(),
  day: z.coerce.number().int().min(1).max(31).optional().nullable(),
});

export const propertyFormSchema = z
  .object({
    // Basics
    name: z.string().trim().min(1, "Name is required").max(120),
    addressLine1: optionalString,
    addressLine2: optionalString,
    city: optionalString,
    state: optionalString,
    postalCode: optionalString,
    phone: optionalString,
    email: z
      .string()
      .trim()
      .max(200)
      .optional()
      .refine((v) => !v || /.+@.+\..+/.test(v), "Invalid email")
      .transform((v) => (v ? v : undefined)),

    // Branding
    logoUrl: z
      .string()
      .trim()
      .max(500)
      .optional()
      .refine((v) => !v || /^https?:\/\//.test(v), "Must start with http(s)://")
      .transform((v) => (v ? v : undefined)),
    primaryColor: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || HEX_COLOR.test(v), "Use #RRGGBB")
      .transform((v) => (v ? v : undefined)),

    // Map (URL is set after upload completes; the upload itself is a separate
    // submission. mapImageUrl on this form represents "the URL to persist".)
    mapImageUrl: z
      .string()
      .url()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),

    // Operating Hours
    seasonStartMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
    seasonStartDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
    seasonEndMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
    seasonEndDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
    checkInTime: z.string().regex(TIME_HHMM, "Use HH:mm (24h)"),
    checkOutTime: z.string().regex(TIME_HHMM, "Use HH:mm (24h)"),

    // Cancellation policy
    cancelFullRefundDays: z.coerce.number().int().min(0).max(365),
    cancelPartialRefundDays: z.coerce.number().int().min(0).max(365),
    cancelPartialRefundPct: z.coerce.number().int().min(0).max(100),

    // Public info
    description: optionalLong,
    rulesText: optionalLong,
    directionsText: optionalLong,

    // Phase 5 — guest self-service
    guestModificationCutoffHours: z.coerce.number().int().min(0).max(720),

    // Phase 5 — reminder emails
    reminder7DaysEnabled: z.coerce.boolean(),
    reminder3DaysEnabled: z.coerce.boolean(),
    reminderArrivalDayEnabled: z.coerce.boolean(),
    reminderPostStayEnabled: z.coerce.boolean(),
    checkInInstructions: optionalLong,
  })
  .refine(
    (v) =>
      v.cancelPartialRefundDays <= v.cancelFullRefundDays,
    {
      message:
        "Partial-refund window must be smaller than full-refund window",
      path: ["cancelPartialRefundDays"],
    },
  );

export type PropertyFormValues = z.input<typeof propertyFormSchema>;
export type PropertyFormParsed = z.output<typeof propertyFormSchema>;
