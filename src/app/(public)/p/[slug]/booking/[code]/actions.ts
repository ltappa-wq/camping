"use server";

import type { ReservationStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Used by the HELD-state polling client to find out if the webhook has
 * landed yet. Returns "NOT_FOUND" if the slug or code don't resolve so
 * the caller can stop polling on bogus URLs.
 *
 * Intentionally returns no PII — just the status enum.
 */
export async function getReservationStatus(
  slug: string,
  code: string,
): Promise<ReservationStatus | "NOT_FOUND"> {
  const property = await prisma.property.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!property) return "NOT_FOUND";
  const reservation = await prisma.reservation.findFirst({
    where: { confirmationCode: code, propertyId: property.id },
    select: { status: true },
  });
  return reservation?.status ?? "NOT_FOUND";
}
