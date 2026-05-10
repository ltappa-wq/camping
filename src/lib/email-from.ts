// Pure helpers for selecting From and Reply-To addresses on outgoing
// transactional email. Kept separate from email.ts so it can be unit
// tested without pulling Resend, Prisma, or any I/O.

const DEFAULT_FALLBACK = "onboarding@resend.dev";

export type SendingDomainSnapshot = {
  sendingDomain: string | null;
  sendingDomainVerified: boolean;
  sendingFromLocal: string;
};

/**
 * Returns the From address for a property's transactional email.
 *
 * If the operator has verified their own sending domain, mail goes from
 * `${sendingFromLocal}@${sendingDomain}` (e.g. bookings@monumentpoint.com).
 * Otherwise we fall back to `RESEND_FROM_EMAIL` (the platform's default,
 * usually onboarding@resend.dev in dev). Resend will only deliver from the
 * fallback to the address that signed up for the Resend account, so
 * verified domains are required for production traffic.
 */
export function fromAddressForProperty(
  property: SendingDomainSnapshot,
  fallback: string | undefined = process.env.RESEND_FROM_EMAIL,
): string {
  if (
    property.sendingDomainVerified &&
    property.sendingDomain &&
    property.sendingFromLocal
  ) {
    return `${property.sendingFromLocal}@${property.sendingDomain}`;
  }
  return fallback ?? DEFAULT_FALLBACK;
}
