"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { LedgerCard } from "@/components/public/chrome";
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
  obfuscatedEmail,
}: {
  slug: string;
  code: string;
  obfuscatedEmail: string;
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
      <LedgerCard title="Status" className="max-w-[680px]">
        <div className="flex items-center gap-3">
          <span className="inline-block h-3 w-3 rounded-full bg-stone-400" />
          <span className="text-[14.5px] text-stone-700">
            Still processing
          </span>
        </div>
        <p className="mt-4 text-[13.5px] leading-relaxed text-stone-500">
          Your payment is taking a moment to confirm. We&apos;ll email you at{" "}
          <span className="text-stone-800">{obfuscatedEmail}</span> the minute
          it&apos;s done — feel free to close this tab.
        </p>
      </LedgerCard>
    );
  }

  return (
    <LedgerCard title="Status" className="max-w-[680px]">
      <div className="flex items-center gap-3">
        <span className="relative inline-flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/70" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
        </span>
        <span className="text-[14.5px] text-stone-700">
          Awaiting payment confirmation
        </span>
      </div>
      <p className="mt-4 text-[13.5px] leading-relaxed text-stone-500">
        You can leave this page — we&apos;ll email you at{" "}
        <span className="text-stone-800">{obfuscatedEmail}</span> as soon as we
        get the green light from Stripe.
      </p>
    </LedgerCard>
  );
}
