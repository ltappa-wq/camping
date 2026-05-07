import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Persistent admin banner shown when the operator's Stripe Connect account
 * isn't fully active. The booking flow is gated server-side by the same
 * flags; this banner just nudges the operator to finish setup.
 */
export function OnboardingBanner() {
  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <AlertTitle>Set up payments to start accepting bookings.</AlertTitle>
          <AlertDescription>
            Online bookings are paused on your public page until your Stripe
            Connect account is active.
          </AlertDescription>
        </div>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <Link href="/admin/payouts">Set up payments</Link>
        </Button>
      </div>
    </Alert>
  );
}
