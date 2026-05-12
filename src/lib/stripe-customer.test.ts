import { describe, expect, it } from "vitest";

import {
  customerArgsForCheckout,
  extractStripeCustomerId,
} from "./stripe-customer";

describe("customerArgsForCheckout", () => {
  it("uses the saved customer id when the guest has one", () => {
    expect(
      customerArgsForCheckout({
        email: "alice@example.com",
        stripeCustomerId: "cus_ABC123",
      }),
    ).toEqual({ customer: "cus_ABC123" });
  });

  it("falls back to email + customer_creation:always when there's no saved customer", () => {
    expect(
      customerArgsForCheckout({
        email: "alice@example.com",
        stripeCustomerId: null,
      }),
    ).toEqual({
      customer_email: "alice@example.com",
      customer_creation: "always",
    });
  });

  it("returns the customer branch even with email also set", () => {
    // Defensive: if both fields are populated, the customer wins —
    // we never want to leak Stripe deduplication issues by passing
    // both fields at once.
    const args = customerArgsForCheckout({
      email: "alice@example.com",
      stripeCustomerId: "cus_XYZ",
    });
    expect(args).not.toHaveProperty("customer_email");
  });
});

describe("extractStripeCustomerId", () => {
  it("returns the string when customer is already an id", () => {
    expect(extractStripeCustomerId({ customer: "cus_123" })).toBe("cus_123");
  });

  it("pulls .id when customer is an expanded object", () => {
    expect(extractStripeCustomerId({ customer: { id: "cus_456" } })).toBe(
      "cus_456",
    );
  });

  it("returns null when customer is missing or null", () => {
    expect(extractStripeCustomerId({})).toBeNull();
    expect(extractStripeCustomerId({ customer: null })).toBeNull();
  });
});
