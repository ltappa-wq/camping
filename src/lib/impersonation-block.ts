// Guard for "operator-only" Server Actions: certain mutations must not
// be executed while a platform admin is impersonating, because they
// represent privileged operator decisions (Stripe Connect setup,
// operator-user management, the org's platform fee, the sending
// domain). Block them up front with a clear message.
//
// Decision: throw an Error rather than returning { ok: false, error }
// because (a) most blocked actions today don't return ActionResults
// (they redirect), and (b) attempting one while impersonating is a
// programmer / UI bug — the read-only view in step 7 should prevent it
// from ever reaching this guard. The throw surfaces clearly in logs
// rather than going silent.

import { getPlatformAdminSession } from "@/lib/platform-admin-auth";

export class ImpersonationBlockedError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "This action cannot be performed while impersonating. Contact the operator directly.",
    );
    this.name = "ImpersonationBlockedError";
  }
}

/**
 * Throws ImpersonationBlockedError if the current request is from a
 * platform admin acting as an organization. No-op otherwise.
 */
export async function blockIfImpersonating(message?: string): Promise<void> {
  const session = await getPlatformAdminSession();
  if (session?.platformAdminId && session?.actingAsOrganizationId) {
    throw new ImpersonationBlockedError(message);
  }
}

/**
 * Server-side check for pages that want to render a read-only view
 * when an impersonating admin lands on them. Returns true → render
 * the read-only notice; false → render the normal interactive UI.
 */
export async function isImpersonatingRequest(): Promise<boolean> {
  const session = await getPlatformAdminSession();
  return Boolean(
    session?.platformAdminId && session?.actingAsOrganizationId,
  );
}
