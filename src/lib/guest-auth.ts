import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";

// Module augmentation: guest fields are optional on the Session type so
// the operator-side session (which uses the same type from the next-auth
// package) doesn't lie about having them. The require helpers below
// narrow when these fields ARE present.
declare module "next-auth" {
  interface Session {
    guestId?: string;
    propertyId?: string;
    propertySlug?: string;
  }
}

// next-auth v5-beta doesn't ship the next-auth/jwt module path that v4
// used for JWT augmentation, so we type the token as a loose record at
// the callback boundary instead.
type GuestTokenFields = {
  guestId?: string;
  propertyId?: string;
  propertySlug?: string;
};

const isProd = process.env.NODE_ENV === "production";

/**
 * Guest-portal Auth.js instance, completely separate from the operator
 * handler in src/lib/auth.ts. Differences:
 *   - basePath at /api/guest-auth (cookies + callbacks isolated)
 *   - Distinct cookie names so a guest session can't be mistaken for an
 *     operator session and vice versa
 *   - JWT strategy: the session is keyed to a Guest row, not the User
 *     model the operator side uses via the Prisma adapter
 *   - Single credentials provider that exchanges a one-shot
 *     GuestMagicLink token for a session
 *
 * The shared AUTH_SECRET signs both JWTs; that's fine — it's the cookie
 * names that keep the two systems isolated.
 */
export const {
  handlers: guestHandlers,
  auth: guestAuth,
  signIn: guestSignIn,
  signOut: guestSignOut,
} = NextAuth({
  basePath: "/api/guest-auth",
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 }, // 30 days
  cookies: {
    sessionToken: {
      name: isProd
        ? "__Secure-camping.guest-session-token"
        : "camping.guest-session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
    callbackUrl: {
      name: isProd
        ? "__Secure-camping.guest-callback-url"
        : "camping.guest-callback-url",
      options: {
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
    csrfToken: {
      name: isProd
        ? "__Host-camping.guest-csrf-token"
        : "camping.guest-csrf-token",
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
      id: "guest-magic-link",
      name: "Guest magic link",
      credentials: {
        token: { label: "Magic link token", type: "text" },
      },
      async authorize(credentials) {
        const rawToken =
          typeof credentials?.token === "string" ? credentials.token : null;
        if (!rawToken) return null;

        const link = await prisma.guestMagicLink.findUnique({
          where: { token: rawToken },
        });
        if (!link) return null;
        if (link.consumedAt) return null;
        if (link.expiresAt.getTime() < Date.now()) return null;

        const guest = await prisma.guest.findUnique({
          where: {
            propertyId_email: {
              propertyId: link.propertyId,
              email: link.email,
            },
          },
        });
        if (!guest) return null;

        const property = await prisma.property.findUnique({
          where: { id: link.propertyId },
          select: { id: true, slug: true },
        });
        if (!property) return null;

        // Consume the token + mark profile claimed in one transaction.
        // profileClaimedAt only sets on first successful claim; we don't
        // overwrite an earlier timestamp.
        await prisma.$transaction([
          prisma.guestMagicLink.update({
            where: { id: link.id },
            data: { consumedAt: new Date() },
          }),
          prisma.guest.update({
            where: { id: guest.id },
            data: {
              profileClaimedAt: guest.profileClaimedAt ?? new Date(),
            },
          }),
        ]);

        return {
          id: guest.id,
          email: guest.email,
          name: guest.name,
          // Custom fields surfaced via the jwt callback below.
          propertyId: property.id,
          propertySlug: property.slug,
        } as {
          id: string;
          email: string;
          name: string;
          propertyId: string;
          propertySlug: string;
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as Record<string, unknown>;
        const t = token as GuestTokenFields & typeof token;
        if (typeof u.id === "string") t.guestId = u.id;
        if (typeof u.propertyId === "string") t.propertyId = u.propertyId;
        if (typeof u.propertySlug === "string")
          t.propertySlug = u.propertySlug;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as GuestTokenFields;
      if (t.guestId) session.guestId = t.guestId;
      if (t.propertyId) session.propertyId = t.propertyId;
      if (t.propertySlug) session.propertySlug = t.propertySlug;
      return session;
    },
  },
});

export type GuestSession = {
  guestId: string;
  email: string;
  propertyId: string;
  propertySlug: string;
};

/**
 * Read the current guest session if one exists. Returns null when the
 * guest isn't signed in or the session is missing the required custom
 * fields (defensive — shouldn't happen, but keeps callers honest).
 */
export async function getGuestSession(): Promise<GuestSession | null> {
  const session = await guestAuth();
  if (
    !session?.guestId ||
    !session.user?.email ||
    !session.propertyId ||
    !session.propertySlug
  ) {
    return null;
  }
  return {
    guestId: session.guestId,
    email: session.user.email,
    propertyId: session.propertyId,
    propertySlug: session.propertySlug,
  };
}

// `next/navigation` exports redirect; importing it here keeps the
// require helper next to the session reader so callers don't have to
// remember the redirect target shape.
import { redirect } from "next/navigation";

/**
 * Require a valid guest session whose propertySlug matches the page's
 * slug. No session, or a session for a different property, redirects
 * to that property's sign-in page. Cross-property redirects matter
 * because a guest signed in to property A clicking a link to property
 * B's portal should land on B's sign-in, not see A's reservations.
 */
export async function requireGuestSession(slug: string): Promise<GuestSession> {
  const session = await getGuestSession();
  if (!session) {
    redirect(`/p/${slug}/portal/sign-in`);
  }
  if (session.propertySlug !== slug) {
    redirect(`/p/${slug}/portal/sign-in`);
  }
  return session;
}
