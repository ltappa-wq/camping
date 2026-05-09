"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { claimAction } from "./actions";

/**
 * Auto-submits on mount so the typical click-the-email-link flow lands
 * the guest in the portal without an extra click. The visible button is
 * the no-JS fallback — also acts as the rendered state for the brief
 * moment between mount and submit.
 */
export function ClaimAutoSubmit({
  token,
  slug,
}: {
  token: string;
  slug: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
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
