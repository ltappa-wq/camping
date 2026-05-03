import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
});

/**
 * Create a Stripe Connect (Express) account and onboarding link for an
 * Organization. The returned URL is short-lived; redirect the operator to it.
 *
 * Pass the existing stripeAccountId on retry; otherwise a new account is
 * created and you should persist the returned accountId on the Organization.
 */
export async function createConnectOnboardingLink(params: {
  organizationId: string;
  email?: string;
  existingAccountId?: string | null;
  returnUrl: string;
  refreshUrl: string;
}) {
  const account = params.existingAccountId
    ? await stripe.accounts.retrieve(params.existingAccountId)
    : await stripe.accounts.create({
        type: "express",
        country: "US",
        email: params.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { organizationId: params.organizationId },
      });

  const link = await stripe.accountLinks.create({
    account: account.id,
    return_url: params.returnUrl,
    refresh_url: params.refreshUrl,
    type: "account_onboarding",
  });

  return { accountId: account.id, url: link.url };
}
