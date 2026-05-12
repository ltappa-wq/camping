"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { guestSignOut, requireGuestSession } from "@/lib/guest-auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

/**
 * Form action: sign out of the guest portal and land back on the
 * sign-in page for the same property. The Auth.js redirect throws
 * NEXT_REDIRECT — let it propagate.
 */
export async function guestSignOutAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  try {
    await guestSignOut({
      redirectTo: slug
        ? `/p/${slug}/portal/sign-in`
        : "/",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      // Sign-out shouldn't fail under normal circumstances, but if it
      // does we still want the user to land somewhere safe.
      redirect(slug ? `/p/${slug}/portal/sign-in` : "/");
    }
    throw err;
  }
}

export type PortalSessionResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Create a Stripe Customer Portal session for the signed-in guest and
 * return its hosted URL. The guest needs at least one prior paid
 * booking — that's when the webhook captured Guest.stripeCustomerId.
 *
 * We use destination charges, so the Customer lives on the platform
 * account; the BillingPortal session is created on the platform too
 * (no `stripeAccount` header). A platform-level default Configuration
 * (created once via `pnpm setup:customer-portal`) controls which
 * features appear in the portal.
 */
export async function createCustomerPortalSession(
  slug: string,
): Promise<PortalSessionResult> {
  const session = await requireGuestSession(slug);
  const guest = await prisma.guest.findUnique({
    where: { id: session.guestId },
    select: { stripeCustomerId: true },
  });
  if (!guest?.stripeCustomerId) {
    return {
      ok: false,
      error:
        "Saved cards appear here after your first paid booking at this property.",
    };
  }
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: guest.stripeCustomerId,
      return_url: `${baseUrl}/p/${slug}/portal`,
    });
    return { ok: true, url: portal.url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return {
      ok: false,
      error: `Couldn't open payment management: ${message}`,
    };
  }
}
