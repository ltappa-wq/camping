"use client";

import { useMemo, useState, useTransition } from "react";

import {
  FormFieldRow,
  FormSection,
  LedgerCard,
  LedgerRow,
  LedgerTotal,
} from "@/components/public/chrome";
import { formatCents } from "@/lib/money";
import type { Quote } from "@/lib/pricing";
import { startCheckout } from "./actions";

export type CheckoutAddon = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  maxQuantity: number;
};

function formatSigned(cents: number): string {
  if (cents < 0) return `−${formatCents(-cents)}`;
  return formatCents(cents);
}

const INPUT_CLS =
  "flex h-10 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-1";

export function CheckoutForm({
  slug,
  siteId,
  from,
  to,
  adults,
  children,
  addons,
  initialQuote,
  bookingFee,
  cancellationPolicy,
}: {
  slug: string;
  siteId: string;
  /** Site label/type carried through but only used by the page-level
   *  DataStrip; keeping the props for backward-compat. */
  siteLabel: string;
  siteTypeName: string;
  from: string;
  to: string;
  adults: number;
  children: number;
  addons: CheckoutAddon[];
  initialQuote: Quote;
  /** Per-booking platform fee passed through to the customer; 0 when absorbed. */
  bookingFee: number;
  cancellationPolicy: {
    fullRefundDays: number;
    partialRefundDays: number;
    partialRefundPct: number;
  };
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Optimistic add-ons subtotal — actual quote is recomputed server-side.
  const addonsTotalCents = useMemo(
    () =>
      addons.reduce(
        (sum, a) => sum + a.priceCents * Math.max(0, addonQty[a.id] ?? 0),
        0,
      ),
    [addons, addonQty],
  );
  const approxTotal =
    initialQuote.totalCents -
    initialQuote.addonsCents +
    addonsTotalCents +
    bookingFee;

  function setQty(id: string, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setAddonQty((prev) => ({ ...prev, [id]: n }));
  }

  function bumpQty(id: string, delta: number, max: number) {
    setAddonQty((prev) => {
      const cur = prev[id] ?? 0;
      const next = Math.min(max, Math.max(0, cur + delta));
      return { ...prev, [id]: next };
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await startCheckout({
        slug,
        siteId,
        from,
        to,
        adults,
        children,
        guest: { name, email, phone },
        addonQuantities: addonQty,
      });
      if (result.ok) {
        window.location.href = result.redirectUrl;
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-12 gap-6 lg:gap-8">
        {/* Left — form */}
        <div className="col-span-12 space-y-5 lg:col-span-7">
          <FormSection kicker="Step 1" title="Guest details">
            <FormFieldRow label="Full name" htmlFor="ck-name">
              <input
                id="ck-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                className={INPUT_CLS}
              />
            </FormFieldRow>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormFieldRow label="Email" htmlFor="ck-email">
                <input
                  id="ck-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className={INPUT_CLS}
                />
              </FormFieldRow>
              <FormFieldRow label="Phone" htmlFor="ck-phone">
                <input
                  id="ck-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  className={INPUT_CLS}
                />
              </FormFieldRow>
            </div>
          </FormSection>

          {addons.length > 0 ? (
            <FormSection kicker="Step 2" title="Add-ons (optional)">
              <ul className="divide-y divide-stone-200">
                {addons.map((a) => {
                  const qty = addonQty[a.id] ?? 0;
                  return (
                    <li
                      key={a.id}
                      className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[15.5px] font-medium text-stone-900">
                          {a.name}
                        </div>
                        {a.description ? (
                          <div className="mt-1 text-[13px] text-stone-500">
                            {a.description}
                          </div>
                        ) : null}
                        <div className="mt-1.5 text-[12.5px] tabular-nums text-stone-500">
                          {formatCents(a.priceCents)} each
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => bumpQty(a.id, -1, a.maxQuantity)}
                          className="h-9 w-9 rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                          disabled={qty <= 0}
                          aria-label={`Decrease ${a.name}`}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={a.maxQuantity}
                          value={qty}
                          onChange={(e) => setQty(a.id, e.target.value)}
                          className="h-9 w-14 rounded-md border border-stone-300 bg-white text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                        />
                        <button
                          type="button"
                          onClick={() => bumpQty(a.id, 1, a.maxQuantity)}
                          className="h-9 w-9 rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                          disabled={qty >= a.maxQuantity}
                          aria-label={`Increase ${a.name}`}
                        >
                          +
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </FormSection>
          ) : null}

          <LedgerCard title="Cancellation policy" tone="muted">
            <p className="text-[14px] leading-relaxed text-stone-700">
              Cancel{" "}
              <span className="font-medium text-stone-900">
                {cancellationPolicy.fullRefundDays}+ days
              </span>{" "}
              before arrival for a full refund. Cancel{" "}
              <span className="font-medium text-stone-900">
                {cancellationPolicy.partialRefundDays}–
                {cancellationPolicy.fullRefundDays - 1} days
              </span>{" "}
              before for a{" "}
              <span className="font-medium text-stone-900">
                {cancellationPolicy.partialRefundPct}% refund
              </span>
              . No refund within {cancellationPolicy.partialRefundDays} days of
              arrival.
            </p>
          </LedgerCard>
        </div>

        {/* Right — summary (sticky on desktop) */}
        <aside className="col-span-12 lg:col-span-5">
          <div className="lg:sticky lg:top-6">
            <LedgerCard title="Order summary">
              <dl>
                {initialQuote.lineItems
                  .filter((li) => li.kind !== "ADDON")
                  .map((li, i) => (
                    <LedgerRow
                      key={i}
                      k={li.description}
                      v={formatSigned(li.amountCents)}
                      sign={li.amountCents < 0 ? "neg" : undefined}
                    />
                  ))}
                {addonsTotalCents > 0 ? (
                  <LedgerRow
                    k={addons
                      .filter((a) => (addonQty[a.id] ?? 0) > 0)
                      .map((a) => `${a.name} × ${addonQty[a.id]}`)
                      .join(", ")}
                    v={formatCents(addonsTotalCents)}
                  />
                ) : null}
                {bookingFee > 0 ? (
                  <LedgerRow k="Booking fee" v={formatCents(bookingFee)} />
                ) : null}
              </dl>
              <LedgerTotal
                k="Estimated total"
                v={formatCents(approxTotal)}
              />
              <p className="mt-3 text-[11.5px] leading-snug text-stone-500">
                Final total — including any tax adjustments on add-ons — is
                calculated on the next page before you pay.
              </p>
            </LedgerCard>

            {error ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-md bg-[var(--brand)] px-6 text-[14px] font-medium tracking-tight text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Redirecting…" : "Continue to payment →"}
            </button>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-stone-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Secured by Stripe. We never see your card.
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}
