import { z } from "zod";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const closedDateRangeFormSchema = z
  .object({
    id: z.string().optional(),
    startDate: dateOnly,
    endDate: dateOnly,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

export type ClosedDateRangeFormValues = z.input<typeof closedDateRangeFormSchema>;
export type ClosedDateRangeFormParsed = z.output<typeof closedDateRangeFormSchema>;
