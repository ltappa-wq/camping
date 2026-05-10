// Wizard step definitions + detection logic. Each step has a slug, a
// short label for the progress strip, and a `done(ctx)` predicate the
// detector uses to decide whether the operator can be skipped past it
// when the URL doesn't pin a specific step.

import { prisma } from "@/lib/prisma";

export const STEP_SLUGS = [
  "welcome",
  "basics",
  "site-type",
  "sites",
  "rate-plan",
  "cancellation",
  "taxes",
  "addons",
  "reminders",
  "domain",
  "done",
] as const;

export type StepSlug = (typeof STEP_SLUGS)[number];

export const STEP_LABELS: Record<StepSlug, string> = {
  welcome: "Welcome",
  basics: "Property basics",
  "site-type": "First site type",
  sites: "Sites",
  "rate-plan": "First rate plan",
  cancellation: "Cancellation policy",
  taxes: "Tax rates",
  addons: "Add-ons",
  reminders: "Reminders",
  domain: "Sending domain",
  done: "Done",
};

/** Steps the operator can skip without breaking the rest of the flow. */
export const OPTIONAL_STEPS = new Set<StepSlug>([
  "taxes",
  "addons",
  "reminders",
  "domain",
]);

export function isStepSlug(s: string): s is StepSlug {
  return (STEP_SLUGS as readonly string[]).includes(s);
}

export function nextStep(current: StepSlug): StepSlug | null {
  const idx = STEP_SLUGS.indexOf(current);
  return idx === -1 || idx === STEP_SLUGS.length - 1
    ? null
    : STEP_SLUGS[idx + 1] ?? null;
}

export function prevStep(current: StepSlug): StepSlug | null {
  const idx = STEP_SLUGS.indexOf(current);
  return idx <= 0 ? null : STEP_SLUGS[idx - 1] ?? null;
}

export type SetupSnapshot = {
  hasName: boolean;
  hasContact: boolean;
  hasSeason: boolean;
  hasSiteType: boolean;
  hasSite: boolean;
  hasRatePlan: boolean;
};

/**
 * Single round-trip count of every "did the operator do this yet"
 * predicate we use across the wizard. Cheap on a typical install
 * (handful of tiny SELECTs).
 */
export async function loadSetupSnapshot(
  propertyId: string,
): Promise<SetupSnapshot> {
  const [property, siteTypeCount, siteCount, ratePlanCount] = await Promise.all([
    prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        name: true,
        phone: true,
        email: true,
        seasonStartMonth: true,
      },
    }),
    prisma.siteType.count({
      where: { propertyId, deletedAt: null },
    }),
    prisma.site.count({
      where: { propertyId, deletedAt: null },
    }),
    prisma.ratePlan.count({ where: { propertyId, active: true } }),
  ]);
  return {
    hasName: Boolean(property?.name && property.name.trim().length > 0),
    hasContact: Boolean(property?.phone || property?.email),
    hasSeason: property?.seasonStartMonth != null,
    hasSiteType: siteTypeCount > 0,
    hasSite: siteCount > 0,
    hasRatePlan: ratePlanCount > 0,
  };
}

/**
 * Pick which step the operator should see when they arrive at /admin/setup
 * without an explicit step. Returns the first step whose required data
 * isn't satisfied, or "done" if everything's in place.
 */
export function pickResumeStep(snapshot: SetupSnapshot): StepSlug {
  if (!snapshot.hasName) return "welcome";
  if (!snapshot.hasContact || !snapshot.hasSeason) return "basics";
  if (!snapshot.hasSiteType) return "site-type";
  if (!snapshot.hasSite) return "sites";
  if (!snapshot.hasRatePlan) return "rate-plan";
  return "done";
}
