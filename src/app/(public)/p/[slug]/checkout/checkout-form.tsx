"use client";

import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function CheckoutForm({
  slug,
  siteId,
  siteLabel,
  siteTypeName,
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
  // We only display this delta so the user can preview.
  const addonsTotalCents = useMemo(
    () =>
      addons.reduce(
        (sum, a) => sum + a.priceCents * Math.max(0, addonQty[a.id] ?? 0),
        0,
      ),
    [addons, addonQty],
  );
  // Cheap rough total: stay base + modifiers + addons + flat tax estimate
  // + booking fee (when the operator passes it to the customer). For an
  // exact figure, the server returns the authoritative quote during
  // checkout. We label this clearly as an estimate to avoid confusion.
  const approxTotal =
    initialQuote.totalCents -
    initialQuote.addonsCents +
    addonsTotalCents +
    bookingFee;

  function setQty(id: string, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setAddonQty((prev) => ({ ...prev, [id]: n }));
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
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-3 rounded-md border bg-card p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Guest details
        </h2>
        <div className="space-y-1">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>
        </div>
      </section>

      {addons.length > 0 ? (
        <section className="space-y-3 rounded-md border bg-card p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Add-ons
          </h2>
          <ul className="space-y-3">
            {addons.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{a.name}</div>
                  {a.description ? (
                    <div className="text-xs text-muted-foreground">
                      {a.description}
                    </div>
                  ) : null}
                  <div className="mt-1 text-sm tabular-nums text-muted-foreground">
                    {formatCents(a.priceCents)} each
                  </div>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={a.maxQuantity}
                  className="h-8 w-20"
                  value={addonQty[a.id] ?? 0}
                  onChange={(e) => setQty(a.id, e.target.value)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3 rounded-md border bg-card p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Stay summary
        </h2>
        <div className="text-sm">
          Site {siteLabel} · {siteTypeName}
          <br />
          {from} → {to} · {initialQuote.nights} night
          {initialQuote.nights === 1 ? "" : "s"} · {adults} adult
          {adults === 1 ? "" : "s"}
          {children > 0
            ? `, ${children} child${children === 1 ? "" : "ren"}`
            : ""}
        </div>
        <div className="space-y-1 text-sm">
          {initialQuote.lineItems
            .filter((li) => li.kind !== "ADDON")
            .map((li, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  <Badge variant="outline" className="mr-2">
                    {li.kind === "BASE"
                      ? "Stay"
                      : li.kind === "MODIFIER"
                        ? "Modifier"
                        : "Tax"}
                  </Badge>
                  {li.description}
                </span>
                <span
                  className={`tabular-nums ${
                    li.amountCents < 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : ""
                  }`}
                >
                  {formatSigned(li.amountCents)}
                </span>
              </div>
            ))}
          {addonsTotalCents > 0 ? (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                <Badge variant="outline" className="mr-2">
                  Add-ons
                </Badge>
                {Object.entries(addonQty)
                  .filter(([, q]) => q > 0)
                  .map(([id, q]) => {
                    const a = addons.find((x) => x.id === id);
                    return a ? `${a.name} × ${q}` : null;
                  })
                  .filter(Boolean)
                  .join(", ")}
              </span>
              <span className="tabular-nums">
                {formatCents(addonsTotalCents)}
              </span>
            </div>
          ) : null}
          {bookingFee > 0 ? (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                <Badge variant="outline" className="mr-2">
                  Fee
                </Badge>
                Booking fee
              </span>
              <span className="tabular-nums">{formatCents(bookingFee)}</span>
            </div>
          ) : null}
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-semibold">
          <span>Estimated total</span>
          <span className="tabular-nums">{formatCents(approxTotal)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Final total (including any tax adjustments on add-ons) is calculated
          on the next page.
        </p>
      </section>

      <section className="rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Cancellation policy</div>
        <p className="mt-1">
          Cancel ≥ {cancellationPolicy.fullRefundDays} days before arrival for a
          full refund; ≥ {cancellationPolicy.partialRefundDays} days for a{" "}
          {cancellationPolicy.partialRefundPct}% refund. No refund within{" "}
          {cancellationPolicy.partialRefundDays} days.
        </p>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Redirecting…" : "Continue to payment"}
      </Button>
    </form>
  );
}
