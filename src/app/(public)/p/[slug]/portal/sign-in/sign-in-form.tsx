"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestGuestSignInAction } from "./actions";

export function SignInForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await requestGuestSignInAction(slug, email);
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError(res.error);
      }
    });
  }

  if (submitted) {
    // Privacy: identical message whether the email was in the system or
    // not. Operator-side support can investigate if a guest can't get a
    // link.
    return (
      <div className="rounded-md border bg-card p-6 text-sm">
        <p className="font-medium">Check your email.</p>
        <p className="mt-2 text-muted-foreground">
          If we have a booking on file for {email || "that address"}, a sign-in
          link is on its way. The link is good for one hour.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => {
            setSubmitted(false);
            setEmail("");
          }}
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-md border bg-card p-6">
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          We&apos;ll email you a link to view your bookings. No password
          needed.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Sending…" : "Send sign-in link"}
      </Button>
    </form>
  );
}
