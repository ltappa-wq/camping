import { headers } from "next/headers";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET not set; cannot verify webhook");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error(`Stripe webhook signature verification failed: ${message}`);
    return new Response(`Webhook signature verification failed: ${message}`, {
      status: 400,
    });
  }

  // Phase 0 stub: log the event and 200. Real handlers added in Phase 3+.
  console.log(`Stripe webhook received: ${event.type} (${event.id})`);

  return Response.json({ received: true });
}
