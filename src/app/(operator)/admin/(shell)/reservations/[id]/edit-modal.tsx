"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { editReservationAction } from "./actions";
import type {
  SerializableModifier,
  SerializableRatePlan,
} from "../new/new-reservation-form";

export type EditableSite = {
  id: string;
  label: string;
  siteTypeId: string;
  siteTypeName: string;
};

export type EditModalProps = {
  reservationId: string;
  currentSiteId: string;
  currentSiteLabel: string;
  currentFrom: string;
  currentTo: string;
  currentTotalCents: number;
  paidCents: number;
  refundedCents: number;
  /** Add-on quantities preserved from the original booking; matches what
   *  the server-side recompute uses. */
  preservedAddons: ReadonlyArray<{
    id: string;
    name: string;
    priceCents: number;
    quantity: number;
  }>;
  sites: ReadonlyArray<EditableSite>;
  ratePlans: ReadonlyArray<SerializableRatePlan>;
  modifiers: ReadonlyArray<SerializableModifier>;
  taxRates: ReadonlyArray<TaxRateInput>;
};

export function EditModal(props: EditModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState(props.currentSiteId);
  const [from, setFrom] = useState(props.currentFrom);
  const [to, setTo] = useState(props.currentTo);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setSiteId(props.currentSiteId);
    setFrom(props.currentFrom);
    setTo(props.currentTo);
    setError(null);
  }
  function onOpenChange(next: boolean) {
    if (!next) reset();
    setOpen(next);
  }

  const selectedSite = useMemo(
    () => props.sites.find((s) => s.id === siteId),
    [props.sites, siteId],
  );

  const datesValid = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
    return new Date(from) < new Date(to);
  }, [from, to]);

  const sameSite = siteId === props.currentSiteId;
  const sameDates = from === props.currentFrom && to === props.currentTo;
  const noChanges = sameSite && sameDates;

  // Live re-quote in the browser. Engine is pure — same fixtures the
  // server uses, so the displayed delta should match what the action
  // computes on confirm (within rounding boundaries).
  const newQuote = useMemo(() => {
    if (!selectedSite || !datesValid) return null;
    try {
      return computeQuote({
        checkIn: new Date(`${from}T00:00:00.000Z`),
        checkOut: new Date(`${to}T00:00:00.000Z`),
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
        addons: props.preservedAddons as AddonInput[],
      });
    } catch (e) {
      if (e instanceof PricingError) return { error: e.message } as const;
      throw e;
    }
  }, [
    selectedSite,
    datesValid,
    from,
    to,
    props.ratePlans,
    props.modifiers,
    props.taxRates,
    props.preservedAddons,
  ]);

  const newTotal =
    newQuote && "totalCents" in newQuote ? newQuote.totalCents : null;
  const delta = newTotal != null ? newTotal - props.currentTotalCents : null;

  const remainingPaid = props.paidCents - props.refundedCents;
  const balanceAfter =
    newTotal != null ? newTotal - remainingPaid : null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (noChanges) {
      setError("Pick a different site or different dates first.");
      return;
    }
    if (!datesValid) {
      setError("Invalid dates.");
      return;
    }
    startTransition(async () => {
      const res = await editReservationAction({
        reservationId: props.reservationId,
        siteId,
        from,
        to,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit booking
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit booking</DialogTitle>
          <DialogDescription>
            Change the site, the dates, or both. The system re-quotes
            against current rate plans and modifiers, and shows the new
            total before you confirm. The cancellation policy snapshot
            from booking time is preserved either way.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
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
              <Label htmlFor="from">Check-in</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">Check-out</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Quote diff
            </div>
            {newQuote && "error" in newQuote ? (
              <p className="mt-2 text-destructive">{newQuote.error}</p>
            ) : newTotal == null ? (
              <p className="mt-2 text-muted-foreground">
                Pick a site and valid dates to see the new total.
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current total</span>
                  <span className="tabular-nums">
                    {formatCents(props.currentTotalCents)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">New total</span>
                  <span className="tabular-nums">{formatCents(newTotal)}</span>
                </div>
                {delta !== 0 ? (
                  <div
                    className={`flex justify-between font-medium ${
                      delta && delta > 0
                        ? "text-destructive"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    <span>Delta</span>
                    <span className="tabular-nums">
                      {delta && delta > 0
                        ? `+${formatCents(delta)}`
                        : `−${formatCents(Math.abs(delta ?? 0))}`}
                    </span>
                  </div>
                ) : null}
                {balanceAfter != null && balanceAfter > 0 ? (
                  <p className="mt-2 text-xs text-destructive">
                    After this change the guest will owe{" "}
                    {formatCents(balanceAfter)}. Record a payment from the
                    reservation page when collected.
                  </p>
                ) : balanceAfter != null && balanceAfter < 0 ? (
                  <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                    After this change the guest will be due a refund of{" "}
                    {formatCents(-balanceAfter)}. Use Cancel reservation
                    or contact the operator if a partial refund is needed.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isPending ||
                noChanges ||
                !datesValid ||
                Boolean(newQuote && "error" in newQuote)
              }
            >
              {isPending ? "Saving…" : "Confirm changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
