// Per-action audit log for back-office impersonation. When a platform
// admin is currently acting as an organization, every mutating Server
// Action under /admin should call logIfImpersonating(...) at the end so
// the back-office Audit Log can show who did what to whose data.
//
// When the request comes from a regular operator session (no platform-
// admin overlay), this is a no-op.

import { prisma } from "@/lib/prisma";
import { getPlatformAdminSession } from "@/lib/platform-admin-auth";

export type AuditableAction = {
  /** Dot-namespaced descriptor: "site.update", "reservation.cancel", etc. */
  action: string;
  /** Human-readable summary for the Audit Log UI. Single sentence. */
  description: string;
  /** Optional property scoping when the action applies to one. */
  propertyId?: string;
  /** Optional structured before/after — keep small (meaningful fields only). */
  payload?: Record<string, unknown>;
};

/**
 * No-op when the request isn't impersonation-driven; otherwise creates
 * a PlatformAdminAction row tagged with the admin id, the
 * actingAsOrganizationId, the supplied propertyId / payload, and the
 * dot-namespaced action descriptor.
 *
 * Best-effort: a logging failure must never block the underlying
 * mutation — the audit log is nice-to-have, the mutation is the work.
 */
export async function logIfImpersonating(
  audit: AuditableAction,
): Promise<void> {
  let session: Awaited<ReturnType<typeof getPlatformAdminSession>>;
  try {
    session = await getPlatformAdminSession();
  } catch {
    return;
  }

  if (!session?.platformAdminId || !session?.actingAsOrganizationId) {
    return;
  }

  try {
    await prisma.platformAdminAction.create({
      data: {
        platformAdminId: session.platformAdminId,
        organizationId: session.actingAsOrganizationId,
        propertyId: audit.propertyId,
        action: audit.action,
        description: audit.description,
        // Prisma's Json input type doesn't accept Record<string, unknown>
        // directly; cast to any (audit data is operator-controlled and
        // already a plain object).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload: (audit.payload ?? undefined) as any,
      },
    });
  } catch {
    // Swallow: don't disrupt the user's mutation if the audit insert
    // hits a transient failure.
  }
}
