"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { guestSignIn } from "@/lib/guest-auth";

/**
 * Form action: exchange a magic-link token for a guest session and
 * redirect to the portal home. The credentials provider in
 * src/lib/guest-auth.ts handles validation and consumption atomically;
 * this action just kicks the flow off.
 *
 * On signIn success Auth.js throws a NEXT_REDIRECT (it's how the
 * redirectTo param works under the hood) — we let that propagate.
 * On AuthError (token consumed/expired between page render and form
 * submit) we redirect to the sign-in page with an inline error.
 */
export async function claimAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const slug = String(formData.get("slug") ?? "");

  if (!token || !slug) {
    redirect(`/p/${slug || ""}/portal/sign-in?error=expired`);
  }

  try {
    await guestSignIn("guest-magic-link", {
      token,
      redirectTo: `/p/${slug}/portal`,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect(`/p/${slug}/portal/sign-in?error=expired`);
    }
    throw err;
  }
}
