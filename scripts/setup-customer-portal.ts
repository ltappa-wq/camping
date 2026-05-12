/**
 * One-time setup: create a default Customer Portal Configuration on the
 * platform Stripe account. The Customer Portal hosts the "manage saved
 * cards" UI guests reach from /p/[slug]/portal — this configuration
 * controls which features show up there.
 *
 * Idempotent: if a default configuration already exists with our
 * payment_method_update setup, we leave it alone.
 *
 * Usage: pnpm setup:customer-portal
 *
 * Architecture note: we use destination charges (not direct charges),
 * so Customers live on the platform account. No `stripeAccount` header
 * is needed when creating the Configuration or any BillingPortal
 * Session — both target the platform.
 *
 * Requires STRIPE_SECRET_KEY in .env.
 */
import { config } from "dotenv";
import Stripe from "stripe";

config();

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Missing STRIPE_SECRET_KEY in .env.");
  process.exit(1);
}

const stripe = new Stripe(key);

async function main() {
  console.log(
    "Looking for an existing default Customer Portal configuration…",
  );
  const existing = await stripe.billingPortal.configurations.list({
    is_default: true,
    limit: 5,
  });
  if (existing.data.length > 0) {
    const cfg = existing.data[0]!;
    console.log(`✓ Default configuration already exists: ${cfg.id}`);
    console.log(
      `  payment_method_update: ${cfg.features.payment_method_update.enabled ? "ON" : "OFF"}`,
    );
    console.log(
      "  Re-run is safe; nothing to change. Edit via the Stripe dashboard if you need to.",
    );
    return;
  }

  console.log("No default configuration found. Creating one…");
  const cfg = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "Manage your saved cards",
    },
    features: {
      // The only thing campsite guests need from the portal: add /
      // remove / update saved payment methods.
      payment_method_update: { enabled: true },
      customer_update: { enabled: false, allowed_updates: [] },
      invoice_history: { enabled: false },
      subscription_cancel: { enabled: false },
      // subscription_update needs nested defaults even when disabled
      // per current Stripe API.
      subscription_update: {
        enabled: false,
        default_allowed_updates: [],
        products: [],
      },
    },
    default_return_url: process.env.NEXT_PUBLIC_APP_URL ?? undefined,
  });

  console.log(`✓ Created configuration ${cfg.id}.`);
  console.log(
    "  payment_method_update enabled; everything else off (we don't use them).",
  );
  console.log(
    "  Future BillingPortal sessions will use this configuration by default.",
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
