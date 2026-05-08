"use client";

import { useState, useTransition } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { centsToDollars, dollarsToCents, formatCents } from "@/lib/money";
import { cancelReservationAction } from "./actions";

export type CancelModalProps = {
  reservationId: string;
  confirmationCode: string;
  guestName: string;
  guestEmail: string;
  siteLabel: string;
  checkInDate: string;
  checkOutDate: string;
  totalCents: number;
  paidCents: number;
  alreadyRefundedCents: number;
  /** Pre-computed by the server via computeRefund. */
  suggestedRefundCents: number;
  /** Human-readable rationale, e.g. "50% refund per policy: 8 days before arrival". */
  refundReason: string;
  /** False when there's no STRIPE Payment to refund against — refund fields hide. */
  canRefundViaStripe: boolean;
};

export function CancelModal(props: CancelModalProps) {
  const [open, setOpen] = useState(false);
  const remaining = Math.max(0, props.paidCents - props.alreadyRefundedCents);
  const initialRefundDollars = centsToDollars(
    Math.min(props.suggestedRefundCents, remaining),
  ).toFixed(2);

  const [refundDollars, setRefundDollars] = useState(initialRefundDollars);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setRefundDollars(initialRefundDollars);
    setReason("");
    setNotify(true);
    setError(null);
  }

  function onOpenChange(next: boolean) {
    if (!next) reset();
    setOpen(next);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let refundCents = 0;
    if (props.canRefundViaStripe) {
      try {
        refundCents = dollarsToCents(refundDollars || "0");
      } catch {
        setError("Refund amount must be a number.");
        return;
      }
      if (refundCents < 0) {
        setError("Refund amount can't be negative.");
        return;
      }
      if (refundCents > remaining) {
        setError(
          `Refund amount can't exceed the remaining refundable (${formatCents(remaining)}).`,
        );
        return;
      }
    }

    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }

    startTransition(async () => {
      const res = await cancelReservationAction({
        reservationId: props.reservationId,
        refundCents,
        reason,
        notifyGuest: notify,
      });
      if (res.ok) {
        setOpen(false);
        // server action revalidates — page re-renders with CANCELLED state.
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive">
          Cancel reservation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Cancel reservation {props.confirmationCode}?
          </DialogTitle>
          <DialogDescription>
            This marks the reservation cancelled
            {props.canRefundViaStripe
              ? " and issues a Stripe refund if you specify an amount."
              : ". Any refunds need to happen outside Stripe — there's no Stripe payment on this booking."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <section className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium">{props.guestName}</div>
            <div className="text-xs text-muted-foreground">
              {props.guestEmail}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
              <span className="text-muted-foreground">Site</span>
              <span>{props.siteLabel}</span>
              <span className="text-muted-foreground">Dates</span>
              <span>
                {props.checkInDate} → {props.checkOutDate}
              </span>
              <span className="text-muted-foreground">Total</span>
              <span className="tabular-nums">
                {formatCents(props.totalCents)}
              </span>
              <span className="text-muted-foreground">Paid</span>
              <span className="tabular-nums">
                {formatCents(props.paidCents)}
              </span>
              {props.alreadyRefundedCents > 0 ? (
                <>
                  <span className="text-muted-foreground">Already refunded</span>
                  <span className="tabular-nums">
                    {formatCents(props.alreadyRefundedCents)}
                  </span>
                </>
              ) : null}
            </div>
          </section>

          {props.canRefundViaStripe ? (
            <div className="space-y-2">
              <div className="rounded-md border border-dashed p-3 text-xs">
                <div className="font-medium text-foreground">
                  Suggested refund: {formatCents(props.suggestedRefundCents)}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {props.refundReason}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="refund">Refund amount (USD)</Label>
                <Input
                  id="refund"
                  inputMode="decimal"
                  value={refundDollars}
                  onChange={(e) => setRefundDollars(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Up to {formatCents(remaining)} can be refunded. Set to 0 to
                  cancel without a refund.
                </p>
              </div>
            </div>
          ) : (
            <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              No Stripe payment to refund. The reservation will be marked
              cancelled — return any cash/check payments to the guest
              directly.
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this reservation being cancelled?"
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="h-4 w-4"
            />
            Email the guest a cancellation notice ({props.guestEmail})
          </label>

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
              Keep reservation
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isPending}
            >
              {isPending ? "Cancelling…" : "Confirm cancellation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
