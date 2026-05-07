"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { getReservationStatus } from "./actions";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;

/**
 * Renders while a reservation is HELD, waiting for the Stripe webhook to
 * promote it to CONFIRMED (or CANCELLED if payment failed). Polls every
 * 2s. As soon as the status changes we trigger router.refresh() so the
 * server component re-runs and renders the right view.
 *
 * After 30 seconds we stop polling and show a "still processing" message
 * with guidance to check email — webhooks have arrived hours late before,
 * and a runaway poll loop is worse than a static fallback.
 */
export function HoldingView({
  slug,
  code,
}: {
  slug: string;
  code: string;
}) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    const startedAt = startedAtRef.current;

    async function tick(): Promise<void> {
      if (cancelled) return;
      try {
        const status = await getReservationStatus(slug, code);
        if (cancelled) return;
        if (status !== "HELD") {
          // Status changed (CONFIRMED, CANCELLED, etc.) or NOT_FOUND.
          // Re-render the server component to pick the right view.
          router.refresh();
          return;
        }
      } catch {
        // Network blips are non-fatal; we'll try again on the next tick.
      }
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    }

    void tick();
    return () => {
      cancelled = true;
    };
  }, [slug, code, router]);

  if (timedOut) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Still processing</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your payment is taking a moment to confirm. We&apos;ll email you the
          minute it&apos;s done — feel free to close this tab.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-8 text-center">
      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      <h1 className="mt-3 text-xl font-semibold">Confirming your booking…</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Hang tight — we&apos;re finalizing payment with our processor.
      </p>
    </div>
  );
}
