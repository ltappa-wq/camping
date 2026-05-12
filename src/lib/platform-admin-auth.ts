import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";

// Module augmentation: the platform-admin session lives on the same
// next-auth Session type as operator + guest, so its custom fields go
// here as optional. The require helpers below narrow them.
declare module "next-auth" {
  interface Session {
    platformAdminId?: string;
    platformAdminName?: string | null;
    // Impersonation overlay — set when "Acting as" an org. Otherwise
    // undefined.
    actingAsOrganizationId?: string;
    actingAsOrganizationName?: string;
    impersonationStartedAt?: string;
  }
}

// next-auth v5-beta doesn't ship the next-auth/jwt module path that v4
// used for JWT augmentation; type the token as a loose record at the
// callback boundary instead.
type PlatformAdminTokenFields = {
  platformAdminId?: string;
  platformAdminName?: string | null;
  actingAsOrganizationId?: string;
  actingAsOrganizationName?: string;
  impersonationStartedAt?: string;
};

const isProd = process.env.NODE_ENV === "production";

/**
 * Platform-admin Auth.js instance, completely separate from operator
 * and guest handlers. Differences:
 *   - basePath at /api/platform-admin-auth (cookies + callbacks isolated)
 *   - Distinct cookie names so a platform-admin session can't be
 *     mistaken for either operator or guest sessions
 *   - JWT strategy keyed to the PlatformAdmin row (not the User model
 *     the operator side uses via the Prisma adapter)
 *   - Single credentials provider that accepts { email } and authorizes
 *     against an allowlist (PLATFORM_ADMIN_BOOTSTRAP_EMAILS) and the
 *     PlatformAdmin table. v1 doesn't send a magic link — bootstrap
 *     allowlist + dev-friendly direct issuance. The PlatformAdminMagicLink
 *     model is intentionally omitted; add when we wire Resend-backed
 *     magic links later.
 *
 * The shared AUTH_SECRET signs all three JWTs; cookie names keep the
 * surfaces isolated.
 */
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function bootstrapAllowlist(): Set<string> {
  const raw = process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const {
  handlers: platformAdminHandlers,
  auth: platformAdminAuth,
  signIn: platformAdminSignIn,
  signOut: platformAdminSignOut,
} = NextAuth({
  basePath: "/api/platform-admin-auth",
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  cookies: {
    sessionToken: {
      name: isProd
        ? "__Secure-camping.platform-admin-session-token"
        : "camping.platform-admin-session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
    callbackUrl: {
      name: isProd
        ? "__Secure-camping.platform-admin-callback-url"
        : "camping.platform-admin-callback-url",
      options: {
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
    csrfToken: {
      name: isProd
        ? "__Host-camping.platform-admin-csrf-token"
        : "camping.platform-admin-csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
  },
  providers: [
    Credentials({
      id: "platform-admin-allowlist",
      name: "Platform admin allowlist",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const raw =
          typeof credentials?.email === "string" ? credentials.email : null;
        if (!raw) return null;
        const email = raw.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

        // Look up an existing PlatformAdmin row first.
        let admin = await prisma.platformAdmin.findUnique({
          where: { email },
        });

        if (!admin) {
          // Fall back to the bootstrap allowlist; on a match, auto-create
          // the PlatformAdmin row (so subsequent sign-ins go through the
          // first branch).
          if (!bootstrapAllowlist().has(email)) {
            return null;
          }
          admin = await prisma.platformAdmin.create({
            data: { email, active: true },
          });
        }

        if (!admin.active) return null;

        // Stamp lastLoginAt; failure here shouldn't block sign-in.
        try {
          await prisma.platformAdmin.update({
            where: { id: admin.id },
            data: { lastLoginAt: new Date() },
          });
        } catch {
          /* non-fatal */
        }

        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          // Surfaced via the jwt callback below.
          platformAdminId: admin.id,
        } as {
          id: string;
          email: string;
          name: string | null;
          platformAdminId: string;
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Initial sign-in: copy admin id + name onto the token.
      if (user) {
        const u = user as Record<string, unknown>;
        const t = token as PlatformAdminTokenFields & typeof token;
        if (typeof u.platformAdminId === "string") {
          t.platformAdminId = u.platformAdminId;
        }
        if (typeof u.name === "string" || u.name === null) {
          t.platformAdminName = u.name as string | null;
        }
      }
      // Server-triggered session updates (impersonation start/end).
      // Caller invokes `unstable_update({ ... })` and the new fields
      // arrive on `session` here.
      if (trigger === "update" && session) {
        const t = token as PlatformAdminTokenFields & typeof token;
        const s = session as Partial<PlatformAdminTokenFields>;
        // Allow null/undefined to CLEAR the overlay (impersonation end).
        if ("actingAsOrganizationId" in s)
          t.actingAsOrganizationId = s.actingAsOrganizationId;
        if ("actingAsOrganizationName" in s)
          t.actingAsOrganizationName = s.actingAsOrganizationName;
        if ("impersonationStartedAt" in s)
          t.impersonationStartedAt = s.impersonationStartedAt;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as PlatformAdminTokenFields;
      if (t.platformAdminId) session.platformAdminId = t.platformAdminId;
      if (t.platformAdminName !== undefined)
        session.platformAdminName = t.platformAdminName;
      if (t.actingAsOrganizationId)
        session.actingAsOrganizationId = t.actingAsOrganizationId;
      if (t.actingAsOrganizationName)
        session.actingAsOrganizationName = t.actingAsOrganizationName;
      if (t.impersonationStartedAt)
        session.impersonationStartedAt = t.impersonationStartedAt;
      return session;
    },
  },
});

export type PlatformAdminSessionInfo = {
  platformAdminId: string;
  email: string;
  name: string | null;
  actingAsOrganizationId: string | null;
  actingAsOrganizationName: string | null;
  impersonationStartedAt: string | null;
};

/**
 * Read the current platform-admin session if one exists. Returns null
 * when not signed in or when the session is missing required fields.
 */
export async function getPlatformAdminSession(): Promise<PlatformAdminSessionInfo | null> {
  const session = await platformAdminAuth();
  if (!session?.platformAdminId || !session.user?.email) return null;
  return {
    platformAdminId: session.platformAdminId,
    email: session.user.email,
    name: session.platformAdminName ?? session.user.name ?? null,
    actingAsOrganizationId: session.actingAsOrganizationId ?? null,
    actingAsOrganizationName: session.actingAsOrganizationName ?? null,
    impersonationStartedAt: session.impersonationStartedAt ?? null,
  };
}

import { redirect } from "next/navigation";

/**
 * Require a valid platform-admin session. No session → redirect to the
 * platform-admin sign-in page. Use on every page under /platform-admin.
 */
export async function requirePlatformAdminSession(): Promise<PlatformAdminSessionInfo> {
  const session = await getPlatformAdminSession();
  if (!session) {
    redirect("/platform-admin/sign-in");
  }
  return session;
}

/** True when the supplied email matches the env allowlist. */
export function isInBootstrapAllowlist(email: string): boolean {
  return bootstrapAllowlist().has(email.trim().toLowerCase());
}
