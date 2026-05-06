import Stripe from "stripe";

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
  const stripe = getStripe();
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
