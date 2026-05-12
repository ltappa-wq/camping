"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { platformAdminSignIn } from "@/lib/platform-admin-auth";

/**
 * Allowlist sign-in for /platform-admin. The Credentials provider does
 * the real authorization (PlatformAdmin row OR PLATFORM_ADMIN_BOOTSTRAP_
 * EMAILS env var). On failure we redirect back to the sign-in page with
 * a generic ?error= so the form renders the message — we never reveal
 * whether the email is unauthorized vs. inactive vs. mistyped.
 */
export async function platformAdminSignInAction(
  formData: FormData,
): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect("/platform-admin/sign-in?error=missing_email");
  }

  try {
    await platformAdminSignIn("platform-admin-allowlist", {
      email,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/platform-admin/sign-in?error=denied");
    }
    throw err;
  }

  redirect("/platform-admin");
}

/**
 * Sign out the current platform-admin session and land on the sign-in
 * page. Used by the back-office topbar.
 */
export async function platformAdminSignOutAction(): Promise<void> {
  const { platformAdminSignOut } = await import("@/lib/platform-admin-auth");
  try {
    await platformAdminSignOut({ redirectTo: "/platform-admin/sign-in" });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/platform-admin/sign-in");
    }
    throw err;
  }
}
