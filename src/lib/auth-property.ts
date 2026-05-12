import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPlatformAdminSession,
  platformAdminUpdateSession,
} from "@/lib/platform-admin-auth";
import { scopedPrisma } from "@/lib/prisma-scoped";

const IMPERSONATION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Resolves the current operator context into Organization + (single)
 * Property, returning a prisma client pre-scoped to that property.
 *
 * Three possible authentication paths, in priority order:
 *
 *   1. Platform-admin session WITH actingAsOrganizationId set →
 *      resolve to that organization's property. The platform-admin
 *      session stays authoritative; impersonation is an overlay.
 *      A 4-hour-old impersonation auto-expires here.
 *
 *   2. Platform-admin session WITHOUT actingAs → redirect to
 *      /platform-admin. They shouldn't be on /admin without choosing
 *      an org to act as.
 *
 *   3. Operator session → resolve via OperatorUser.organizationId,
 *      same as before Phase 7a.
 *
 * No valid session at all → redirect to /login.
 *
 * v1 assumes one Property per Organization. The schema supports many-
 * to-one but the UI is single-property; we pick the first by createdAt
 * ascending so behavior is deterministic.
 */
export async function requireOperatorProperty() {
  // --- 1 & 2: Platform-admin path -----------------------------------------
  const adminSession = await getPlatformAdminSession();
  if (adminSession) {
    let actingOrgId = adminSession.actingAsOrganizationId;
    const startedAt = adminSession.impersonationStartedAt
      ? Date.parse(adminSession.impersonationStartedAt)
      : null;

    // Auto-timeout safety rail.
    if (
      actingOrgId &&
      startedAt != null &&
      Date.now() - startedAt > IMPERSONATION_MAX_AGE_MS
    ) {
      const durationSeconds = Math.floor(
        (Date.now() - startedAt) / 1000,
      );
      try {
        await prisma.platformAdminAction.create({
          data: {
            platformAdminId: adminSession.platformAdminId,
            organizationId: actingOrgId,
            action: "impersonation.timeout",
            description: `Impersonation auto-expired after ${Math.round(
              durationSeconds / 3600,
            )}h.`,
            payload: { durationSeconds },
          },
        });
      } catch {
        /* non-fatal */
      }
      try {
        await platformAdminUpdateSession({
          actingAsOrganizationId: undefined,
          actingAsOrganizationName: undefined,
          impersonationStartedAt: undefined,
        });
      } catch {
        /* non-fatal */
      }
      actingOrgId = null;
    }

    if (!actingOrgId) {
      // Platform admin not currently impersonating — they don't belong
      // on /admin pages.
      redirect("/platform-admin");
    }

    const property = await prisma.property.findFirst({
      where: { organizationId: actingOrgId },
      orderBy: { createdAt: "asc" },
    });
    if (!property) {
      redirect("/admin/setup");
    }

    const organization = await prisma.organization.findUnique({
      where: { id: actingOrgId },
    });

    return {
      session: {
        user: { email: adminSession.email, name: adminSession.name },
      },
      operator: null,
      organization: organization!,
      property,
      propertyId: property.id,
      prisma: scopedPrisma(property.id),
      isImpersonating: true as const,
      impersonatingAdmin: {
        platformAdminId: adminSession.platformAdminId,
        email: adminSession.email,
        actingAsOrganizationName:
          adminSession.actingAsOrganizationName ?? null,
      },
    };
  }

  // --- 3: Operator path ---------------------------------------------------
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const operator = await prisma.operatorUser.findUnique({
    where: { email: session.user.email },
    include: {
      organization: {
        include: {
          properties: {
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!operator) redirect("/login");

  const property = operator.organization.properties[0] ?? null;

  return {
    session,
    operator,
    organization: operator.organization,
    property,
    propertyId: property?.id ?? null,
    prisma: property ? scopedPrisma(property.id) : null,
    isImpersonating: false as const,
    impersonatingAdmin: null,
  };
}

/**
 * Like requireOperatorProperty(), but throws (and the caller should
 * redirect to /admin/setup) if no Property exists. Use in Server
 * Actions and pages that *require* a property to be configured.
 */
export async function requireOperatorPropertyOrSetup() {
  const ctx = await requireOperatorProperty();
  if (!ctx.property || !ctx.propertyId || !ctx.prisma) {
    redirect("/admin/setup");
  }
  return {
    session: ctx.session,
    operator: ctx.operator,
    organization: ctx.organization,
    property: ctx.property,
    propertyId: ctx.propertyId,
    prisma: ctx.prisma,
    isImpersonating: ctx.isImpersonating,
    impersonatingAdmin: ctx.impersonatingAdmin,
  };
}
