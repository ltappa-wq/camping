"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  getPlatformAdminSession,
  platformAdminUpdateSession,
} from "@/lib/platform-admin-auth";

/**
 * Start impersonation. Reads the target Organization id from the form,
 * validates it exists, overlays the platform-admin session with
 * actingAs* fields, logs an impersonation.start audit row, and redirects
 * the browser to /admin where the operator surface is now scoped to
 * the impersonated organization.
 *
 * The platform-admin session remains the authoritative session — we
 * never swap to an operator session. The overlay is what scoped queries
 * read; "Switch back" simply clears it.
 */
export async function startImpersonationAction(
  formData: FormData,
): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!organizationId) {
    redirect("/platform-admin/organizations?error=missing_org");
  }

  const session = await getPlatformAdminSession();
  if (!session) redirect("/platform-admin/sign-in");

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!org) {
    redirect("/platform-admin/organizations?error=org_not_found");
  }

  const startedAt = new Date().toISOString();

  await platformAdminUpdateSession({
    actingAsOrganizationId: org.id,
    actingAsOrganizationName: org.name,
    impersonationStartedAt: startedAt,
  });

  await prisma.platformAdminAction.create({
    data: {
      platformAdminId: session.platformAdminId,
      organizationId: org.id,
      action: "impersonation.start",
      description: `Started impersonating ${org.name}`,
    },
  });

  redirect("/admin");
}

/**
 * End impersonation cleanly. Computes elapsed seconds, logs an
 * impersonation.end audit row with the duration, clears the overlay
 * fields from the session, and lands back on the organization detail
 * page in the back-office.
 */
export async function endImpersonationAction(): Promise<void> {
  const session = await getPlatformAdminSession();
  if (!session) redirect("/platform-admin/sign-in");
  if (!session.actingAsOrganizationId) {
    // Already not impersonating; nothing to do but go home.
    redirect("/platform-admin");
  }

  const startedAt = session.impersonationStartedAt
    ? Date.parse(session.impersonationStartedAt)
    : Date.now();
  const durationSeconds = Math.max(
    0,
    Math.floor((Date.now() - startedAt) / 1000),
  );

  const orgId = session.actingAsOrganizationId;
  const orgName = session.actingAsOrganizationName ?? "(unknown)";

  await prisma.platformAdminAction.create({
    data: {
      platformAdminId: session.platformAdminId,
      organizationId: orgId,
      action: "impersonation.end",
      description: `Ended impersonating ${orgName}. Duration: ${formatDuration(durationSeconds)}.`,
      payload: { durationSeconds },
    },
  });

  // Clearing requires explicitly setting undefined so the jwt callback's
  // "update" branch overwrites the existing values.
  await platformAdminUpdateSession({
    actingAsOrganizationId: undefined,
    actingAsOrganizationName: undefined,
    impersonationStartedAt: undefined,
  });

  redirect(`/platform-admin/organizations/${orgId}`);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
