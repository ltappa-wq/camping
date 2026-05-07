import Stripe from "stripe";

import { prisma } from "@/lib/prisma";

// Lazy-init: rendering a page that transitively imports this module shouldn't
// crash just because STRIPE_SECRET_KEY hasn't been set. The same clear error
// fires the moment any caller actually touches the client.

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  _stripe = new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
  return _stripe;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Get the Organization's Stripe Connect account id, creating an Express
 * account on first call. The id is persisted to Organization.stripeAccountId.
 */
export async function getOrCreateConnectAccount(orgId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      operatorUsers: {
        where: { role: "OWNER" },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
  if (!org) throw new Error(`Organization ${orgId} not found`);
  if (org.stripeAccountId) return org.stripeAccountId;

  const ownerEmail = org.operatorUsers[0]?.email;

  const account = await getStripe().accounts.create({
    type: "express",
    country: "US",
    email: ownerEmail,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { organizationId: org.id },
  });

  await prisma.organization.update({
    where: { id: org.id },
    data: { stripeAccountId: account.id },
  });
  return account.id;
}

/**
 * Generate a one-shot Stripe AccountLink URL the operator can use to start or
 * resume Express onboarding. AccountLinks expire after a few minutes; create
 * a fresh one each time the operator clicks "Continue Stripe setup".
 */
export async function createOnboardingLink(orgId: string): Promise<string> {
  const accountId = await getOrCreateConnectAccount(orgId);
  const link = await getStripe().accountLinks.create({
    account: accountId,
    return_url: `${appUrl()}/admin/payouts`,
    refresh_url: `${appUrl()}/admin/payouts`,
    type: "account_onboarding",
  });
  return link.url;
}

/**
 * Generate a Stripe Express dashboard login link so the operator can manage
 * their connected account (payouts, bank, tax forms) self-service.
 * Only valid for accounts that have completed onboarding.
 */
export async function createDashboardLoginLink(orgId: string): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org?.stripeAccountId) {
    throw new Error("Organization has no Stripe account yet");
  }
  const link = await getStripe().accounts.createLoginLink(org.stripeAccountId);
  return link.url;
}

/**
 * Pull the latest account state from Stripe and sync the three flags. Used as
 * a fallback when account.updated webhooks are missed; safe to call on any
 * page render.
 */
export async function refreshAccountStatus(orgId: string): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org?.stripeAccountId) return;
  const account = await getStripe().accounts.retrieve(org.stripeAccountId);
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      stripeChargesEnabled: account.charges_enabled,
      stripePayoutsEnabled: account.payouts_enabled,
      stripeOnboardingComplete:
        account.charges_enabled &&
        account.payouts_enabled &&
        account.details_submitted,
    },
  });
}
