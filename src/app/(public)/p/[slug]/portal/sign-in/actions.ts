"use server";

import { prisma } from "@/lib/prisma";
import {
  issueGuestSignInLink,
  sendGuestSignInEmail,
} from "@/lib/guest-magic-link";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RequestSignInResult =
  | { ok: true; sent: true }
  | { ok: false; error: string };

/**
 * Request a sign-in magic link for the guest portal at a given property.
 *
 * Privacy guard: the response is identical regardless of whether the
 * email matches an existing Guest. We never confirm or deny an email's
 * presence in the system. Callers should always show "If we have your
 * email, a sign-in link is on its way." — wording is at the UI layer
 * but enforced here by always returning ok:true for valid input.
 */
export async function requestGuestSignInAction(
  slug: string,
  email: string,
): Promise<RequestSignInResult> {
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) {
    return { ok: false, error: "Enter a valid email." };
  }

  const property = await prisma.property.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
  if (!property) {
    // Don't 404 — that would leak which slugs exist. Treat as no-match.
    return { ok: true, sent: true };
  }

  const link = await issueGuestSignInLink({
    propertyId: property.id,
    email: trimmed,
  });

  if (link) {
    await sendGuestSignInEmail({
      propertyId: property.id,
      propertySlug: property.slug,
      propertyName: property.name,
      email: trimmed,
      token: link.token,
    });
  }

  return { ok: true, sent: true };
}
