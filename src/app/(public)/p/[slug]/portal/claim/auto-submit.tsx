"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { claimAction } from "./actions";

/**
 * Auto-submits on mount so the typical click-the-email-link flow lands
 * the guest in the portal without an extra click. The visible button is
 * the no-JS fallback — also acts as the rendered state for the brief
 * moment between mount and submit.
 *
 * Important: we ref-gate the submit because React Strict Mode in dev
 * double-invokes effects. Without the gate, two POSTs fire — the first
 * consumes the token and signs the guest in, but the browser receives
 * both 302 responses and navigates to whichever lands last. The second
 * POST always errors (already-consumed token) and bounces to the
 * sign-in error page, so without this guard the guest sees "expired"
 * even on a successful first try.
 */
export function ClaimAutoSubmit({
  token,
  slug,
}: {
  token: string;
  slug: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    formRef.current?.requestSubmit();
  }, []);

  return (
    <form
      ref={formRef}
      action={claimAction}
      className="rounded-md border bg-card p-6 text-center space-y-4"
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="slug" value={slug} />
      <p className="text-sm text-muted-foreground">
        Signing you in…
      </p>
      <Button type="submit">Continue to portal</Button>
    </form>
  );
}
