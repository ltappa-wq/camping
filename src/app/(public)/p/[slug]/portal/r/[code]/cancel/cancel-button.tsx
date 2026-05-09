"use client";

import { useState, useTransition } from "react";
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
import { formatCents } from "@/lib/money";
import { cancelReservationByGuestAction } from "./actions";

export type CancelButtonProps = {
  slug: string;
  code: string;
  /** Refund the policy will issue at today's date. Computed server-side. */
  suggestedRefundCents: number;
  /** Plain-English version of the policy (for display). */
  refundReason: string;
  /** Total paid so the guest knows what's at stake. */
  paidCents: number;
  /** Property name for friendlier copy. */
  propertyName: string;
  /** Booking dates for the summary block. */
  checkInDate: string;
  checkOutDate: string;
};

export function CancelButton(props: CancelButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const noRefund = props.suggestedRefundCents === 0;

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const res = await cancelReservationByGuestAction(props.slug, props.code);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive">
          Cancel reservation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel your reservation?</DialogTitle>
          <DialogDescription>
            This cancels your stay at {props.propertyName} on{" "}
            {props.checkInDate}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="grid grid-cols-2 gap-1 text-xs">
              <span className="text-muted-foreground">Dates</span>
              <span>
                {props.checkInDate} → {props.checkOutDate}
              </span>
              <span className="text-muted-foreground">Paid</span>
              <span className="tabular-nums">
                {formatCents(props.paidCents)}
              </span>
              <span className="text-muted-foreground">Refund</span>
              <span className="tabular-nums font-medium">
                {noRefund ? "None" : formatCents(props.suggestedRefundCents)}
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{props.refundReason}</p>

          {!noRefund ? (
            <p className="text-xs text-muted-foreground">
              Refunds typically take 5–10 business days to appear on your
              card statement.
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Keep reservation
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Cancelling…" : "Confirm cancellation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
