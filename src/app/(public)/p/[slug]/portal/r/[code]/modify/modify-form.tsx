"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents } from "@/lib/money";
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
  classifyModificationDiff,
  computeModificationRefund,
  type ModificationPolicy,
} from "@/lib/booking-modification";
import { applyModificationAction } from "./actions";

export type ModifySite = {
  id: string;
  label: string;
  siteTypeId: string;
  siteTypeName: string;
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
  slug: string;
  code: string;
  currentSiteId: string;
  currentCheckIn: string; // YYYY-MM-DD
  currentCheckOut: string;
  currentTotalCents: number;
  currentRemainingPaid: number;
  reservedAddons: ReadonlyArray<{
    id: string;
    name: string;
    priceCents: number;
    quantity: number;
  }>;
  sites: ReadonlyArray<ModifySite>;
  ratePlans: ReadonlyArray<SerializableRatePlan>;
  modifiers: ReadonlyArray<SerializableModifier>;
  taxRates: ReadonlyArray<TaxRateInput>;
  policy: ModificationPolicy;
  platformFeeCents: number;
};

export function ModifyForm(props: Props) {
  const router = useRouter();
  const [siteId, setSiteId] = useState(props.currentSiteId);
  const [checkIn, setCheckIn] = useState(props.currentCheckIn);
  const [checkOut, setCheckOut] = useState(props.currentCheckOut);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedSite = useMemo(
    () => props.sites.find((s) => s.id === siteId),
    [props.sites, siteId],
  );

  const datesValid =
    /^\d{4}-\d{2}-\d{2}$/.test(checkIn) &&
    /^\d{4}-\d{2}-\d{2}$/.test(checkOut) &&
    new Date(checkIn) < new Date(checkOut);

  const sameSite = siteId === props.currentSiteId;
  const sameDates =
    checkIn === props.currentCheckIn && checkOut === props.currentCheckOut;
  const noChanges = sameSite && sameDates;

  // Browser-side recompute. Same engine the server runs, so the
  // displayed numbers should match (modulo rounding).
  const newQuote = useMemo(() => {
    if (!selectedSite || !datesValid) return null;
    try {
      return computeQuote({
        checkIn: new Date(`${checkIn}T00:00:00.000Z`),
        checkOut: new Date(`${checkOut}T00:00:00.000Z`),
        siteTypeId: selectedSite.siteTypeId,
        ratePlans: props.ratePlans.map((p) => ({
          ...p,
          chargeUnit: p.chargeUnit as ChargeUnit,
          effectiveFrom: p.effectiveFrom ? new Date(p.effectiveFrom) : null,
          effectiveTo: p.effectiveTo ? new Date(p.effectiveTo) : null,
        })) as RatePlanInput[],
        modifiers: props.modifiers.map((m) => ({
          ...m,
          modifierType: m.modifierType as ModifierType,
          appliesTo: m.appliesTo as ModifierApplies,
          startDate: m.startDate ? new Date(m.startDate) : null,
          endDate: m.endDate ? new Date(m.endDate) : null,
        })) as ModifierInput[],
        taxRates: props.taxRates as TaxRateInput[],
        addons: props.reservedAddons as AddonInput[],
      });
    } catch (e) {
      if (e instanceof PricingError) return { error: e.message } as const;
      throw e;
    }
  }, [
    selectedSite,
    datesValid,
    checkIn,
    checkOut,
    props.ratePlans,
    props.modifiers,
    props.taxRates,
    props.reservedAddons,
  ]);

  const newTotal =
    newQuote && "totalCents" in newQuote ? newQuote.totalCents : null;
  const diff =
    newTotal != null
      ? classifyModificationDiff({
          currentPaidCents: props.currentRemainingPaid,
          newTotalCents: newTotal,
        })
      : null;

  // Refund preview — only meaningful for refund-side mods.
  const refundPreview = useMemo(() => {
    if (!diff || diff.kind !== "refund") return null;
    if (!newTotal) return null;
    const today = new Date();
    const todayMid = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
      ),
    );
    // See actions.ts: retainPlatformFee=false for modifications. The
    // platform fee was settled on the original booking; we don't
    // double-charge guests for shortening their stay.
    return computeModificationRefund({
      oldCheckIn: new Date(`${props.currentCheckIn}T00:00:00.000Z`),
      oldCheckOut: new Date(`${props.currentCheckOut}T00:00:00.000Z`),
      oldTotalCents: props.currentTotalCents,
      newCheckIn: new Date(`${checkIn}T00:00:00.000Z`),
      newCheckOut: new Date(`${checkOut}T00:00:00.000Z`),
      newTotalCents: newTotal,
      cancellationDate: todayMid,
      policy: props.policy,
      retainPlatformFee: false,
      platformFeeCents: props.platformFeeCents,
      paidCents: props.currentRemainingPaid,
      alreadyRefundedCents: 0,
    });
  }, [
    diff,
    newTotal,
    checkIn,
    checkOut,
    props.currentCheckIn,
    props.currentCheckOut,
    props.currentTotalCents,
    props.currentRemainingPaid,
    props.policy,
    props.platformFeeCents,
  ]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (noChanges) {
      setError("Pick a different site or dates first.");
      return;
    }
    if (!datesValid) {
      setError("Invalid dates.");
      return;
    }

    startTransition(async () => {
      const res = await applyModificationAction({
        slug: props.slug,
        code: props.code,
        newCheckIn: checkIn,
        newCheckOut: checkOut,
        newSiteId: siteId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.kind === "checkout") {
        // Upcharge — guest pays the difference via Stripe. Modification
        // applies after the webhook lands.
        window.location.href = res.redirectUrl;
        return;
      }
      // Equal or refund — applied immediately.
      router.push(`/p/${props.slug}/portal/r/${props.code}`);
      router.refresh();
    });
  }

  const submitDisabled =
    isPending ||
    noChanges ||
    !datesValid ||
    Boolean(newQuote && "error" in newQuote);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-3 rounded-md border bg-card p-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Choose changes
        </h2>
        <div className="space-y-1">
          <Label htmlFor="site">Site</Label>
          <select
            id="site"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {props.sites.map((s) => (
              <option key={s.id} value={s.id}>
                Site {s.label} — {s.siteTypeName}
                {s.id === props.currentSiteId ? " (current)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="checkIn">Check-in</Label>
            <Input
              id="checkIn"
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="checkOut">Check-out</Label>
            <Input
              id="checkOut"
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-md border bg-muted/30 p-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Review and confirm
        </h2>
        {newQuote && "error" in newQuote ? (
          <p className="mt-3 text-sm text-destructive">
            {newQuote.error}. Please pick different dates or contact the
            property.
          </p>
        ) : newTotal == null ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Pick a site and valid dates to see the price difference.
          </p>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-1 rounded-md border bg-background/50 p-3 text-xs">
              <span className="text-muted-foreground">Current total</span>
              <span className="text-right tabular-nums">
                {formatCents(props.currentTotalCents)}
              </span>
              <span className="text-muted-foreground">New total</span>
              <span className="text-right tabular-nums">
                {formatCents(newTotal)}
              </span>
              {diff?.kind === "upcharge" ? (
                <>
                  <span className="font-medium text-destructive">
                    Amount due
                  </span>
                  <span className="text-right font-medium tabular-nums text-destructive">
                    +{formatCents(diff.upchargeCents)}
                  </span>
                </>
              ) : null}
              {diff?.kind === "refund" && refundPreview ? (
                <>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Refund
                  </span>
                  <span className="text-right font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    −{formatCents(refundPreview.refundCents)}
                  </span>
                </>
              ) : null}
              {diff?.kind === "equal" ? (
                <>
                  <span className="font-medium">No money owed</span>
                  <span className="text-right text-muted-foreground">—</span>
                </>
              ) : null}
            </div>

            {diff?.kind === "refund" && refundPreview ? (
              <p className="text-xs text-muted-foreground">
                {refundPreview.reason} Refunds typically take 5–10
                business days to appear on your card.
              </p>
            ) : null}

            {diff?.kind === "upcharge" ? (
              <p className="text-xs text-muted-foreground">
                Confirming will take you to a secure payment page to pay the
                difference. Your booking only updates after the payment
                completes.
              </p>
            ) : null}
          </div>
        )}
      </section>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitDisabled}>
          {isPending
            ? diff?.kind === "upcharge"
              ? "Redirecting…"
              : "Applying…"
            : diff?.kind === "upcharge"
              ? `Pay ${formatCents(diff.upchargeCents)} to confirm`
              : diff?.kind === "refund"
                ? `Confirm — receive ${refundPreview ? formatCents(refundPreview.refundCents) : ""} back`
                : "Confirm changes"}
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
