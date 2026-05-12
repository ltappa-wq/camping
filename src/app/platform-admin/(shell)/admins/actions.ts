"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  getPlatformAdminSession,
  isInBootstrapAllowlist,
} from "@/lib/platform-admin-auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add a new PlatformAdmin row. v1 doesn't email an invite — the new
 * admin needs to be in PLATFORM_ADMIN_BOOTSTRAP_EMAILS to actually
 * sign in, OR they need an existing PlatformAdmin row. This action
 * just provisions the row up front so subsequent sign-in succeeds
 * even without env-var membership.
 *
 * Returns void to fit React 19's form-action contract; redirects with
 * ?error= on validation failure.
 */
export async function inviteAdminAction(formData: FormData): Promise<void> {
  const me = await getPlatformAdminSession();
  if (!me) redirect("/platform-admin/sign-in");

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;

  if (!EMAIL_RE.test(email)) {
    redirect("/platform-admin/admins?error=bad_email");
  }

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    redirect("/platform-admin/admins?error=exists");
  }

  await prisma.platformAdmin.create({
    data: { email, name, active: true },
  });
  await prisma.platformAdminAction.create({
    data: {
      platformAdminId: me.platformAdminId,
      action: "admin.invite",
      description: `Provisioned platform admin ${email}`,
      payload: { email, name },
    },
  });

  revalidatePath("/platform-admin/admins");
  redirect("/platform-admin/admins?ok=invited");
}

export async function toggleAdminActiveAction(
  formData: FormData,
): Promise<void> {
  const me = await getPlatformAdminSession();
  if (!me) redirect("/platform-admin/sign-in");

  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/platform-admin/admins");

  // Defensive: don't let an admin deactivate themselves and lock the
  // back-office. They can be deactivated by another admin if needed.
  if (id === me.platformAdminId) {
    redirect("/platform-admin/admins?error=self_deactivate");
  }

  const target = await prisma.platformAdmin.findUnique({ where: { id } });
  if (!target) redirect("/platform-admin/admins?error=not_found");

  const nextActive = !target!.active;
  await prisma.platformAdmin.update({
    where: { id },
    data: { active: nextActive },
  });
  await prisma.platformAdminAction.create({
    data: {
      platformAdminId: me.platformAdminId,
      action: nextActive ? "admin.activate" : "admin.deactivate",
      description: `${nextActive ? "Activated" : "Deactivated"} ${target!.email}`,
      payload: { targetAdminId: id, active: nextActive },
    },
  });

  revalidatePath("/platform-admin/admins");
}
