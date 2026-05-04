import { prisma } from "@/lib/prisma";

/**
 * "Needs wizard" = the operator's property is missing any of the three
 * required pieces of inventory: at least one (non-soft-deleted) SiteType,
 * at least one (non-soft-deleted, active) Site, and at least one active
 * RatePlan. Used by the shell layout to redirect to /admin/setup.
 *
 * Returns null if the property is fully set up.
 */
export async function getSetupGap(propertyId: string): Promise<
  | null
  | {
      hasSiteType: boolean;
      hasSite: boolean;
      hasRatePlan: boolean;
    }
> {
  const [siteTypeCount, siteCount, ratePlanCount] = await Promise.all([
    prisma.siteType.count({
      where: { propertyId, deletedAt: null },
    }),
    prisma.site.count({
      where: { propertyId, deletedAt: null },
    }),
    prisma.ratePlan.count({
      where: { propertyId, active: true },
    }),
  ]);

  const hasSiteType = siteTypeCount > 0;
  const hasSite = siteCount > 0;
  const hasRatePlan = ratePlanCount > 0;

  if (hasSiteType && hasSite && hasRatePlan) return null;
  return { hasSiteType, hasSite, hasRatePlan };
}
