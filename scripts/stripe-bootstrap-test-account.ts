import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

/**
 * Bootstrap a Stripe Connect Express account for the seeded
 * Monument Point organization in TEST MODE. Idempotent — running it
 * twice reuses the existing stripeAccountId.
 *
 * What it does:
 *   1. Creates a fresh Express account on the platform's Stripe
 *      account (type=express, country=US, card_payments + transfers).
 *   2. Saves the resulting account id on Organization.stripeAccountId.
 *   3. Reads the live account state from Stripe and syncs the three
 *      Organization flags (charges/payouts/onboardingComplete).
 *
 * What it does NOT do:
 *   - Submit the Stripe-hosted onboarding form. Stripe requires a
 *     human to click through it for Express accounts even in test
 *     mode. After this script runs, visit /admin/payouts in the
 *     browser and click "Continue Stripe setup" — the form has a
 *     "Use test data" autofill helper that finishes in ~2 min.
 *
 * Usage: pnpm tsx scripts/stripe-bootstrap-test-account.ts
 */

config();

const ORG_ID = "seed-org-monument-point";

async function main() {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    throw new Error("STRIPE_SECRET_KEY is not set in .env");
  }
  if (stripeSecret.startsWith("sk_live")) {
    throw new Error(
      "Refusing to run against a live Stripe key — this script only makes sense in test mode.",
    );
  }

  const prisma = new PrismaClient();
  const stripe = new Stripe(stripeSecret, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });

  try {
    const org = await prisma.organization.findUnique({ where: { id: ORG_ID } });
    if (!org) {
      throw new Error(
        `Organization ${ORG_ID} not found. Run \`pnpm db:seed\` first.`,
      );
    }

    let accountId = org.stripeAccountId;
    if (!accountId) {
      const owner = await prisma.operatorUser.findFirst({
        where: { organizationId: org.id, role: "OWNER" },
        orderBy: { createdAt: "asc" },
        select: { email: true },
      });
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: owner?.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { organizationId: org.id },
      });
      accountId = account.id;
      console.log(`Created Stripe Express account: ${accountId}`);
    } else {
      console.log(`Reusing existing Stripe account: ${accountId}`);
    }

    const account = await stripe.accounts.retrieve(accountId);
    const onboardingComplete =
      account.charges_enabled === true &&
      account.payouts_enabled === true &&
      account.details_submitted === true;

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        stripeAccountId: accountId,
        stripeChargesEnabled: account.charges_enabled === true,
        stripePayoutsEnabled: account.payouts_enabled === true,
        stripeOnboardingComplete: onboardingComplete,
      },
    });

    console.log("");
    console.log(`Organization: ${org.id}`);
    console.log(`  stripeAccountId:          ${accountId}`);
    console.log(`  stripeChargesEnabled:     ${account.charges_enabled}`);
    console.log(`  stripePayoutsEnabled:     ${account.payouts_enabled}`);
    console.log(`  stripeOnboardingComplete: ${onboardingComplete}`);

    if (!onboardingComplete) {
      console.log("");
      console.log(
        "⚠  Onboarding is not complete. The public booking page will still",
      );
      console.log(
        '   show "Online bookings coming soon" until you finish the form.',
      );
      console.log(
        "   Sign in at /login as the seeded owner, then go to /admin/payouts",
      );
      console.log(
        '   and click "Continue Stripe setup". The Stripe-hosted form has a',
      );
      console.log("   'Use test data' helper for fast completion.");
    } else {
      console.log("");
      console.log(
        "✓ Org is fully onboarded — the public page will accept bookings.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
