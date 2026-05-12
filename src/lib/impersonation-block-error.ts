// Standalone error class for blocked-during-impersonation actions.
// Lives here (not in impersonation-block.ts) so unit tests can import
// it without indirectly pulling in next-auth.

export class ImpersonationBlockedError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "This action cannot be performed while impersonating. Contact the operator directly.",
    );
    this.name = "ImpersonationBlockedError";
  }
}
