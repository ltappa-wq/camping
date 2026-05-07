"use client";

import { useState, useTransition } from "react";

import { Switch } from "@/components/ui/switch";
import { setFeePassThroughAction } from "./actions";

export function FeeModeToggle({
  initialPassThrough,
}: {
  initialPassThrough: boolean;
}) {
  const [passThrough, setPassThrough] = useState(initialPassThrough);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onCheckedChange(next: boolean) {
    // Optimistic — flip immediately, roll back on failure.
    const prev = passThrough;
    setPassThrough(next);
    setError(null);
    startTransition(async () => {
      try {
        await setFeePassThroughAction(next);
      } catch (err) {
        setPassThrough(prev);
        setError(
          err instanceof Error ? err.message : "Could not save fee setting.",
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm font-medium">Customer pays the fee</div>
          <p className="text-xs text-muted-foreground">
            {passThrough
              ? "Added on top of the booking total. You receive the full nightly rate."
              : "Deducted from your payout. The customer sees only the booking total."}
          </p>
        </div>
        <Switch
          checked={passThrough}
          disabled={isPending}
          onCheckedChange={onCheckedChange}
          aria-label="Customer pays the booking fee"
        />
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Applies to future bookings only. Existing reservations keep the fee
        treatment they were booked with.
      </p>
    </div>
  );
}
