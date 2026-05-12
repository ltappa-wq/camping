"use server";

import { revalidatePath } from "next/cache";

import { logIfImpersonating } from "@/lib/audit";
import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { countReservationsOverlappingClosure } from "@/lib/closed-dates";
import {
  closedDateRangeFormSchema,
  type ClosedDateRangeFormParsed,
} from "./schema";

export type ActionResult =
  | { ok: true; overlappingReservations: number }
  | { ok: false; error: string };

export type DeleteResult = { ok: true } | { ok: false; error: string };

/** Convert a date-only "YYYY-MM-DD" string to a UTC midnight Date so it
 *  serializes back to the same ISO date regardless of server timezone. */
function dateOnlyUtc(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/**
 * Upsert a closed-date range. Returns the count of existing reservations
 * that overlap so the UI can surface a warning ("3 reservations are
 * already in this window — they're unaffected, but no new bookings can
 * land here"). We never auto-cancel existing reservations.
 */
export async function saveClosedDateRange(
  values: ClosedDateRangeFormParsed,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const parsed = closedDateRangeFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const v = parsed.data;
  const startDate = dateOnlyUtc(v.startDate);
  const endDate = dateOnlyUtc(v.endDate);

  // Pull every CONFIRMED-or-later reservation in a window that could
  // touch the closure. CHECKED_OUT reservations are excluded — historical
  // overlap doesn't matter to the operator picking new closed dates.
  const reservations = await ctx.prisma.reservation.findMany({
    where: {
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      // Cheap pre-filter: anything that could possibly overlap.
      checkIn: { lt: new Date(endDate.getTime() + 86_400_000) },
      checkOut: { gt: startDate },
    },
    select: { checkIn: true, checkOut: true },
  });
  const overlappingReservations = countReservationsOverlappingClosure(
    { startDate, endDate },
    reservations,
  );

  if (v.id) {
    await ctx.prisma.closedDateRange.update({
      where: { id: v.id },
      data: { startDate, endDate, reason: v.reason ?? null },
    });
  } else {
    await ctx.prisma.closedDateRange.create({
      data: {
        propertyId: ctx.propertyId,
        startDate,
        endDate,
        reason: v.reason ?? null,
      },
    });
  }

  await logIfImpersonating({
    action: v.id ? "closed_date.update" : "closed_date.create",
    description: v.id
      ? `Updated closed-date range ${v.startDate} → ${v.endDate}`
      : `Closed dates ${v.startDate} → ${v.endDate}`,
    propertyId: ctx.propertyId,
    payload: {
      id: v.id,
      startDate: v.startDate,
      endDate: v.endDate,
      reason: v.reason,
      overlappingReservations,
    },
  });

  revalidatePath("/admin/closed-dates");
  return { ok: true, overlappingReservations };
}

export async function deleteClosedDateRange(
  id: string,
): Promise<DeleteResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const before = await ctx.prisma.closedDateRange.findUnique({
    where: { id },
    select: { startDate: true, endDate: true },
  });
  await ctx.prisma.closedDateRange.delete({ where: { id } });
  await logIfImpersonating({
    action: "closed_date.delete",
    description: before
      ? `Removed closed-date range ${before.startDate.toISOString().slice(0, 10)} → ${before.endDate.toISOString().slice(0, 10)}`
      : "Removed a closed-date range",
    propertyId: ctx.propertyId,
    payload: { id },
  });
  revalidatePath("/admin/closed-dates");
  return { ok: true };
}
