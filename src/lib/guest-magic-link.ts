import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { renderGuestMagicLinkEmail } from "@/lib/email";
import { dispatchEmail } from "@/lib/email-dispatch";
import { loadEmailTemplateOverride } from "@/lib/email-templates/load";

const SIGN_IN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const PROFILE_CLAIM_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Cryptographically random URL-safe magic-link token. 32 bytes → 43
 *  chars of base64url, plenty of entropy. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Issue a sign-in magic-link for a guest who already has an account at
 * this property. Caller is responsible for the privacy guard:
 * never reveal whether the email matched. This function silently
 * no-ops (returns null) if there's no Guest with that email.
 */
export async function issueGuestSignInLink({
  propertyId,
  email,
}: {
  propertyId: string;
  email: string;
}): Promise<{ token: string; expiresAt: Date } | null> {
  const guest = await prisma.guest.findUnique({
    where: { propertyId_email: { propertyId, email: email.toLowerCase() } },
    select: { id: true },
  });
  if (!guest) return null;

  const token = newToken();
  const expiresAt = new Date(Date.now() + SIGN_IN_EXPIRY_MS);
  await prisma.guestMagicLink.create({
    data: {
      email: email.toLowerCase(),
      propertyId,
      token,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

/**
 * Issue a long-expiry profile-claim link for inclusion in the
 * confirmation email. 30-day window because confirmation emails get
 * archived and revisited days later.
 */
export async function issueGuestProfileClaimLink({
  propertyId,
  email,
}: {
  propertyId: string;
  email: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + PROFILE_CLAIM_EXPIRY_MS);
  await prisma.guestMagicLink.create({
    data: {
      email: email.toLowerCase(),
      propertyId,
      token,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

/**
 * Send the sign-in email for a returning guest. Best-effort; logs every
 * attempt to EmailLog.
 */
export async function sendGuestSignInEmail({
  propertyId,
  propertySlug,
  propertyName,
  email,
  token,
}: {
  propertyId: string;
  propertySlug: string;
  propertyName: string;
  email: string;
  token: string;
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/p/${propertySlug}/portal/claim?token=${encodeURIComponent(token)}`;
  const override = await loadEmailTemplateOverride(
    propertyId,
    "GUEST_PROFILE_CLAIM",
  );
  const content = renderGuestMagicLinkEmail(
    {
      propertyName,
      intentLabel: `Sign in to ${propertyName}`,
      intro: `Click the link below to view and manage your bookings at ${propertyName}.`,
      link,
      expiresIn: "1 hour",
    },
    override,
  );
  await dispatchEmail({
    propertyId,
    reservationId: null,
    type: "GUEST_PROFILE_CLAIM",
    to: email,
    content,
  });
}
