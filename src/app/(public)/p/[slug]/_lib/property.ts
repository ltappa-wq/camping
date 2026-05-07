import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

/** Fetch a property by its public slug, 404 if missing. Server-only. */
export async function getPropertyBySlug(slug: string) {
  const property = await prisma.property.findUnique({
    where: { slug },
  });
  if (!property) notFound();
  return property;
}

/**
 * Property + Organization payment-readiness flags. Used by the public
 * booking flow to gate the date picker / checkout when the operator
 * hasn't completed Stripe Connect onboarding.
 */
export async function getPropertyWithOrgBySlug(slug: string) {
  const property = await prisma.property.findUnique({
    where: { slug },
    include: {
      organization: {
        select: {
          stripeAccountId: true,
          stripeOnboardingComplete: true,
          stripeChargesEnabled: true,
        },
      },
    },
  });
  if (!property) notFound();
  return property;
}

export function isAcceptingBookings(org: {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean;
}): boolean {
  return Boolean(
    org.stripeAccountId &&
      org.stripeOnboardingComplete &&
      org.stripeChargesEnabled,
  );
}
