"use client";

import { useState, useTransition } from "react";

import { LedgerCard } from "@/components/public/chrome";
import { createCustomerPortalSession } from "../actions";

/**
 * "Payment methods" card on the portal home. Invokes the server action
 * that creates a Stripe Customer Portal Session, then redirects the
 * browser to the hosted page. When the guest hasn't paid yet (no
 * stripeCustomerId on file), we surface a friendly empty-state copy
 * instead of trying to open the portal.
 */
export function PaymentMethodsCard({
  slug,
  hasSavedCustomer,
}: {
  slug: string;
  /** Server-known: the signed-in guest's stripeCustomerId is non-null. */
  hasSavedCustomer: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    startTransition(async () => {
      const result = await createCustomerPortalSession(slug);
      if (result.ok) {
        window.location.href = result.url;
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <LedgerCard title="Payment methods">
      {hasSavedCustomer ? (
        <div className="space-y-3">
          <p className="text-[14px] leading-relaxed text-stone-700">
            View, add, or remove the cards on file at this property. We
            redirect to Stripe&apos;s hosted page — your card details never
            touch us directly.
          </p>
          <button
            type="button"
            onClick={open}
            disabled={isPending}
            className="inline-flex h-10 items-center rounded-md bg-[var(--brand)] px-4 text-[13.5px] font-medium tracking-tight text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? "Opening…" : "Manage payment methods →"}
          </button>
          {error ? (
            <p className="text-[13px] text-red-700">{error}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-[13.5px] leading-relaxed text-stone-600">
          Saved cards appear here after your first paid booking at this
          property. Next time you book, your card is one tap away.
        </p>
      )}
    </LedgerCard>
  );
}
