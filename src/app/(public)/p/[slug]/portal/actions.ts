"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { guestSignOut } from "@/lib/guest-auth";

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
