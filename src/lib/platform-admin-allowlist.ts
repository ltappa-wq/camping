// Pure helper for parsing PLATFORM_ADMIN_BOOTSTRAP_EMAILS. Lives in
// its own module so unit tests can import it without pulling in
// next-auth (which only runs inside the Next.js request runtime).

/** Parse the comma-separated env var into a case-insensitive Set. */
function bootstrapAllowlist(): Set<string> {
  const raw = process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True when the supplied email matches the env allowlist. */
export function isInBootstrapAllowlist(email: string): boolean {
  return bootstrapAllowlist().has(email.trim().toLowerCase());
}
