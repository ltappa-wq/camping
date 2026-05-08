"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resendConfirmationAction } from "./actions";

export function ResendButton({
  reservationId,
  guestEmail,
  disabled,
}: {
  reservationId: string;
  guestEmail: string;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (disabled || isPending) return;
    if (!confirm(`Resend confirmation email to ${guestEmail}?`)) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await resendConfirmationAction(reservationId);
      if (res.ok) {
        setSuccess(`Sent to ${guestEmail}.`);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={disabled || isPending}
      >
        <Mail className="mr-1.5 h-4 w-4" />
        {isPending ? "Sending…" : "Resend confirmation"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {success ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          {success}
        </p>
      ) : null}
    </div>
  );
}
