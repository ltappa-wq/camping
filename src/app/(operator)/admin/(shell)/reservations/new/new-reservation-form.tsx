"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { centsToDollars, dollarsToCents, formatCents } from "@/lib/money";
import {
  computeQuote,
  PricingError,
  type AddonInput,
  type ChargeUnit,
  type ModifierApplies,
  type ModifierInput,
  type ModifierType,
  type RatePlanInput,
  type TaxAppliesTo,
  type TaxRateInput,
} from "@/lib/pricing";
import {
  type ManualOverride,
  type ManualPayment,
} from "@/lib/manual-reservation";
import {
  createManualReservationAction,
  lookupGuestByEmailAction,
  type GuestPrefill,
} from "./actions";

export type AvailableSite = {
  id: string;
  label: string;
  siteTypeId: string;
  siteTypeName: string;
  tags: string[];
};

export type SerializableRatePlan = Omit<
  RatePlanInput,
  "effectiveFrom" | "effectiveTo"
> & {
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type SerializableModifier = Omit<
  ModifierInput,
  "startDate" | "endDate"
> & {
  startDate: string | null;
  endDate: string | null;
};

type Props = {
  from: string;
  to: string;
  sites: AvailableSite[];
  ratePlans: SerializableRatePlan[];
  modifiers: SerializableModifier[];
  taxRates: TaxRateInput[];
  addons: ReadonlyArray<{
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    maxQuantity: number;
  }>;
};

const PAYMENT_METHODS: ReadonlyArray<{
  value: "CARD_MANUAL" | "CASH" | "CHECK" | "COMP" | "OTHER";
  label: string;
}> = [
  { value: "CARD_MANUAL", label: "Card (manual / terminal)" },
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "COMP", label: "Comp" },
  { value: "OTHER", label: "Other" },
];

export function NewReservationForm({
  from,
  to,
  sites,
  ratePlans,
  modifiers,
  taxRates,
  addons,
}: Props) {
  const router = useRouter();

  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [guest, setGuest] = useState({
    name: "",
    email: "",
    phone: "",
    rvMake: "",
    rvModel: "",
    rvYear: "",
    rvLengthFt: "",
    licensePlate: "",
    notes: "",
  });
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});

  // Override state
  const [overrideKind, setOverrideKind] = useState<"none" | "discount" | "total">(
    "none",
  );
  const [overrideAmount, setOverrideAmount] = useState("0.00");
  const [overrideDescription, setOverrideDescription] = useState("");

  // Payment state
  const [paymentMode, setPaymentMode] = useState<"paid" | "unpaid">("paid");
  const [paymentMethod, setPaymentMethod] = useState<
    "CARD_MANUAL" | "CASH" | "CHECK" | "COMP" | "OTHER"
  >("CASH");
  const [paymentAmount, setPaymentAmount] = useState("0.00");
  const [paymentNotes, setPaymentNotes] = useState("");

  const [notifyGuest, setNotifyGuest] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === siteId) ?? sites[0],
    [sites, siteId],
  );

  // Run the pricing engine in the browser. The fixtures came from the
  // server already filtered to active rows; we just hydrate Date strings.
  const quote = useMemo(() => {
    if (!selectedSite) return null;
    try {
      return computeQuote({
        checkIn: new Date(`${from}T00:00:00.000Z`),
        checkOut: new Date(`${to}T00:00:00.000Z`),
        siteTypeId: selectedSite.siteTypeId,
        ratePlans: ratePlans.map((p) => ({
          ...p,
          chargeUnit: p.chargeUnit as ChargeUnit,
          effectiveFrom: p.effectiveFrom ? new Date(p.effectiveFrom) : null,
          effectiveTo: p.effectiveTo ? new Date(p.effectiveTo) : null,
        })),
        modifiers: modifiers.map((m) => ({
          ...m,
          modifierType: m.modifierType as ModifierType,
          appliesTo: m.appliesTo as ModifierApplies,
          startDate: m.startDate ? new Date(m.startDate) : null,
          endDate: m.endDate ? new Date(m.endDate) : null,
        })),
        taxRates: taxRates as TaxRateInput[],
        addons: addons.map((a) => ({
          id: a.id,
          name: a.name,
          priceCents: a.priceCents,
          quantity: Math.max(0, addonQty[a.id] ?? 0),
        })) as AddonInput[],
      });
    } catch (e) {
      if (e instanceof PricingError) return { error: e.message } as const;
      throw e;
    }
  }, [selectedSite, from, to, ratePlans, modifiers, taxRates, addons, addonQty]);

  const baseTotal = quote && "totalCents" in quote ? quote.totalCents : 0;
  const overrideAmountCents = (() => {
    try {
      return dollarsToCents(overrideAmount || "0", { allowNegative: false });
    } catch {
      return 0;
    }
  })();
  const finalTotal = (() => {
    if (overrideKind === "total") return Math.max(0, overrideAmountCents);
    if (overrideKind === "discount")
      return Math.max(0, baseTotal - overrideAmountCents);
    return baseTotal;
  })();
  const isComp = finalTotal === 0;

  function setGuestField<K extends keyof typeof guest>(
    key: K,
    value: (typeof guest)[K],
  ) {
    setGuest((prev) => ({ ...prev, [key]: value }));
  }

  function applyPrefill(prefill: GuestPrefill | null) {
    if (!prefill) {
      setPrefillNote(null);
      return;
    }
    setGuest((prev) => ({
      ...prev,
      name: prev.name || prefill.name,
      phone: prev.phone || prefill.phone,
      rvMake: prev.rvMake || prefill.rvMake,
      rvModel: prev.rvModel || prefill.rvModel,
      rvYear: prev.rvYear || prefill.rvYear,
      rvLengthFt: prev.rvLengthFt || prefill.rvLengthFt,
      licensePlate: prev.licensePlate || prefill.licensePlate,
      notes: prev.notes || prefill.notes,
    }));
    setPrefillNote(`Prefilled from existing guest record for ${prefill.name}.`);
  }

  function onEmailBlur() {
    if (!guest.email.trim()) return;
    setPrefillNote(null);
    void lookupGuestByEmailAction(guest.email).then(applyPrefill);
  }

  function buildOverride(): ManualOverride {
    if (overrideKind === "none") return { kind: "none" };
    if (overrideKind === "discount") {
      return {
        kind: "discount",
        amountCents: overrideAmountCents,
        description: overrideDescription,
      };
    }
    return {
      kind: "total",
      amountCents: overrideAmountCents,
      description: overrideDescription,
    };
  }

  function buildPayment(): ManualPayment {
    if (paymentMode === "unpaid" || isComp) return { kind: "unpaid" };
    let amount = 0;
    try {
      amount = dollarsToCents(paymentAmount || "0", { allowNegative: false });
    } catch {
      amount = 0;
    }
    return {
      kind: "paid",
      method: paymentMethod,
      amountCents: amount,
      notes: paymentNotes,
    };
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedSite) {
      setError("Pick a site.");
      return;
    }

    startTransition(async () => {
      const res = await createManualReservationAction({
        from,
        to,
        siteId: selectedSite.id,
        guest,
        addonQuantities: addonQty,
        override: buildOverride(),
        payment: buildPayment(),
        notifyGuest,
      });
      if (res.ok) {
        router.push(`/admin/reservations/${res.reservationId}`);
      } else {
        setError(res.error);
      }
    });
  }

  if (sites.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-6 text-sm">
        No sites are available for these dates. Pick different dates above.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Site">
        <Label htmlFor="siteId">Site</Label>
        <select
          id="siteId"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              Site {s.label} — {s.siteTypeName}
              {s.tags.length > 0 ? ` (${s.tags.join(", ")})` : ""}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Guest">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Email" required>
              <Input
                type="email"
                value={guest.email}
                onChange={(e) => setGuestField("email", e.target.value)}
                onBlur={onEmailBlur}
                required
              />
            </Field>
            <Field label="Name" required>
              <Input
                value={guest.name}
                onChange={(e) => setGuestField("name", e.target.value)}
                required
              />
            </Field>
          </div>
          {prefillNote ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {prefillNote}
            </p>
          ) : null}
          <Field label="Phone">
            <Input
              type="tel"
              value={guest.phone}
              onChange={(e) => setGuestField("phone", e.target.value)}
            />
          </Field>
          <details className="space-y-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              RV details (optional)
            </summary>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Make">
                <Input
                  value={guest.rvMake}
                  onChange={(e) => setGuestField("rvMake", e.target.value)}
                />
              </Field>
              <Field label="Model">
                <Input
                  value={guest.rvModel}
                  onChange={(e) => setGuestField("rvModel", e.target.value)}
                />
              </Field>
              <Field label="Year">
                <Input
                  inputMode="numeric"
                  value={guest.rvYear}
                  onChange={(e) => setGuestField("rvYear", e.target.value)}
                />
              </Field>
              <Field label="Length (ft)">
                <Input
                  inputMode="numeric"
                  value={guest.rvLengthFt}
                  onChange={(e) => setGuestField("rvLengthFt", e.target.value)}
                />
              </Field>
              <Field label="License plate">
                <Input
                  value={guest.licensePlate}
                  onChange={(e) => setGuestField("licensePlate", e.target.value)}
                />
              </Field>
            </div>
          </details>
          <Field label="Operator notes (private)">
            <Textarea
              rows={2}
              value={guest.notes}
              onChange={(e) => setGuestField("notes", e.target.value)}
              placeholder="Operator-only notes about this guest."
            />
          </Field>
        </div>
      </Section>

      {addons.length > 0 ? (
        <Section title="Add-ons">
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
                  <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {formatCents(a.priceCents)} each
                  </div>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={a.maxQuantity}
                  className="h-9 w-20"
                  value={addonQty[a.id] ?? 0}
                  onChange={(e) =>
                    setAddonQty((prev) => ({
                      ...prev,
                      [a.id]: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Pricing">
        {quote && "error" in quote ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            {quote.error}. Switch to "Override total" below to proceed
            anyway.
          </div>
        ) : quote ? (
          <ul className="space-y-1 text-sm">
            {quote.lineItems.map((li, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  <Badge variant="outline" className="mr-2">
                    {li.kind}
                  </Badge>
                  {li.description}
                </span>
                <span className="tabular-nums">
                  {formatCents(li.amountCents)}
                </span>
              </li>
            ))}
            <li className="flex justify-between gap-2 border-t pt-2 font-medium">
              <span>Quote total</span>
              <span className="tabular-nums">{formatCents(quote.totalCents)}</span>
            </li>
          </ul>
        ) : null}

        <div className="mt-4 space-y-3 rounded-md border border-dashed p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Adjust pricing (optional)
          </div>
          <div className="flex flex-wrap gap-3">
            {(
              [
                { value: "none", label: "Use quote" },
                { value: "discount", label: "Add discount" },
                { value: "total", label: "Override total" },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="override"
                  value={opt.value}
                  checked={overrideKind === opt.value}
                  onChange={() => setOverrideKind(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {overrideKind !== "none" ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field
                label={
                  overrideKind === "discount"
                    ? "Discount amount (USD)"
                    : "New total (USD; 0 = comp)"
                }
              >
                <Input
                  inputMode="decimal"
                  value={overrideAmount}
                  onChange={(e) => setOverrideAmount(e.target.value)}
                />
              </Field>
              <Field label="Reason / description">
                <Input
                  value={overrideDescription}
                  onChange={(e) => setOverrideDescription(e.target.value)}
                  placeholder={
                    overrideKind === "discount"
                      ? "e.g. Returning guest"
                      : "e.g. Bespoke weekly rate"
                  }
                />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex justify-between border-t pt-3 text-base font-semibold">
          <span>Final total</span>
          <span className="tabular-nums">
            {isComp ? "Complimentary" : formatCents(finalTotal)}
          </span>
        </div>
      </Section>

      <Section title="Payment">
        {isComp ? (
          <p className="text-sm text-muted-foreground">
            $0 total — no payment recorded. The reservation will be marked
            CONFIRMED with paidCents=0.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="paymentMode"
                  checked={paymentMode === "paid"}
                  onChange={() => setPaymentMode("paid")}
                />
                Paid now
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="paymentMode"
                  checked={paymentMode === "unpaid"}
                  onChange={() => setPaymentMode("unpaid")}
                />
                Confirmed — collect later
              </label>
            </div>
            {paymentMode === "paid" ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Method">
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(
                        e.target.value as typeof paymentMethod,
                      )
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {PAYMENT_METHODS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Amount paid (USD)">
                  <Input
                    inputMode="decimal"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={centsToDollars(finalTotal).toFixed(2)}
                  />
                </Field>
                <Field label="Notes">
                  <Input
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="e.g. Check #4521"
                  />
                </Field>
              </div>
            ) : null}
          </div>
        )}
      </Section>

      <Section title="Email">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={notifyGuest}
            onChange={(e) => setNotifyGuest(e.target.checked)}
          />
          Send confirmation email to {guest.email || "the guest"}
        </label>
      </Section>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create reservation"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
