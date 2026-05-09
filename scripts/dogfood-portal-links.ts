import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * Mint magic-link sign-in URLs for the DOGFOOD-* reservations seeded
 * via `pnpm seed:dogfood`. The portal claim flow normally consumes a
 * token mailed by Resend — fine in production, but Resend's sandbox
 * limits delivery to the verified signup address.
 *
 * This script bypasses email entirely: it inserts GuestMagicLink rows
 * directly and prints clickable URLs to stdout. Paste one into the
 * browser, the claim page validates the token, the credentials
 * provider issues a guest session, and you land in the portal.
 *
 * Tokens expire 24 hours from creation. Re-running mints fresh ones —
 * each call cleans up its predecessors so the DB doesn't accumulate
 * unconsumed dogfood tokens.
 *
 * Usage: pnpm tsx scripts/dogfood-portal-links.ts
 */

config();

const SLUG = "monument-point";
const EXPIRY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const prisma = new PrismaClient();
  try {
    const property = await prisma.property.findUnique({
      where: { slug: SLUG },
      select: { id: true, slug: true, name: true },
    });
    if (!property) {
      throw new Error(
        `Property ${SLUG} not found — run \`pnpm db:seed\` first.`,
      );
    }

    const dogfoodReservations = await prisma.reservation.findMany({
      where: {
        propertyId: property.id,
        confirmationCode: { startsWith: "DOGFOOD-" },
      },
      include: { guest: { select: { email: true, name: true } } },
      orderBy: { confirmationCode: "asc" },
    });
    if (dogfoodReservations.length === 0) {
      throw new Error(
        "No DOGFOOD-* reservations found. Run `pnpm seed:dogfood` first.",
      );
    }

    // Unique by guest email — Alice has two reservations and we only
    // want one sign-in link per email.
    const seen = new Set<string>();
    const uniqueGuests = dogfoodReservations
      .filter((r) => {
        if (seen.has(r.guest.email)) return false;
        seen.add(r.guest.email);
        return true;
      })
      .map((r) => r.guest);

    // Clean up any prior unconsumed dogfood tokens so re-runs don't
    // accumulate cruft. Filter by email belonging to dogfood guests.
    const dogfoodEmails = uniqueGuests.map((g) => g.email);
    const cleaned = await prisma.guestMagicLink.deleteMany({
      where: {
        propertyId: property.id,
        email: { in: dogfoodEmails },
        consumedAt: null,
      },
    });
    if (cleaned.count > 0) {
      console.log(`Cleaned up ${cleaned.count} prior unconsumed token(s).`);
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const expiresAt = new Date(Date.now() + EXPIRY_MS);

    console.log("");
    console.log(`Dogfood portal sign-in links for ${property.name}:`);
    console.log("");

    for (const g of uniqueGuests) {
      const token = randomBytes(32).toString("base64url");
      await prisma.guestMagicLink.create({
        data: {
          email: g.email,
          propertyId: property.id,
          token,
          expiresAt,
        },
      });
      const url = `${baseUrl}/p/${property.slug}/portal/claim?token=${encodeURIComponent(token)}`;
      console.log(`  ${g.name.padEnd(20)} ${g.email}`);
      console.log(`    ${url}`);
      console.log("");
    }

    console.log(`Tokens expire ${expiresAt.toISOString()}.`);
    console.log(
      "Paste any URL into your browser to sign in as that guest. The link is single-use.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
