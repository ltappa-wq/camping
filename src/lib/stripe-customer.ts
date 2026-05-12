// Pure helpers for the Stripe Customer + Customer Portal flow. Extracted
// from the checkout / modify / webhook actions so the branching logic
// can be unit-tested without mocking the Stripe SDK.

/**
 * Choose the Customer-related arguments for a Stripe Checkout Session.
 *
 * - Returning guest with a saved Customer → pre-attach via { customer }.
 *   Stripe Checkout will surface their saved cards as primary options
 *   and let them pick "new card" if they want.
 * - First-time guest → pass { customer_email + customer_creation:
 *   "always" } so Stripe mints a Customer (and our webhook can capture
 *   the ID).
 */
export type CheckoutCustomerArgs =
  | { customer: string }
  | { customer_email: string; customer_creation: "always" };

export function customerArgsForCheckout(guest: {
  email: string;
  stripeCustomerId: string | null;
}): CheckoutCustomerArgs {
  if (guest.stripeCustomerId) {
    return { customer: guest.stripeCustomerId };
  }
  return {
    customer_email: guest.email,
    customer_creation: "always",
  };
}

/**
 * Pull the Customer ID out of a checkout.session.completed payload. The
 * `customer` field can be either a string id or an expanded object
 * depending on retrieval shape; either way, normalize to id-or-null.
 */
export function extractStripeCustomerId(session: {
  customer?: string | { id: string } | null;
}): string | null {
  const c = session.customer;
  if (!c) return null;
  if (typeof c === "string") return c;
  return c.id ?? null;
}
