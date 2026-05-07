import { test } from "@playwright/test";

/**
 * Failure-path E2E tests — written but skipped until our CI environment is
 * stable enough to exercise the timing-sensitive pieces (cron sweeper,
 * Postgres exclusion constraint racing). Un-skip individually when
 * iterating on the relevant code.
 *
 * Each `test.skip` body documents the intended behavior so the test is
 * a checklist of edge-case expectations even before it runs.
 */

test.describe("Booking edge cases", () => {
  test.skip(
    "guest abandons checkout, hold expires, site becomes available again",
    async () => {
      // 1. Search /p/monument-point/search for a date window.
      // 2. Click "Book this site" on the first card; fill the form and
      //    "Continue to payment" — but DO NOT complete payment on the
      //    Stripe Checkout page.
      // 3. Note the siteId. Confirm via DB that a HELD Reservation row
      //    exists for it with heldUntil ≈ now + 15 min.
      // 4. Either wait out the hold (15 min) or fast-forward by directly
      //    setting heldUntil to the past in the DB, then hit
      //    /api/cron/sweep-holds with the CRON_SECRET to run the sweeper.
      // 5. Re-search for the same window. The site that was previously
      //    held should be back in the available list.
    },
  );

  test.skip(
    "two guests racing for the same site — only one wins",
    async ({ browser }) => {
      // Reproduces the Postgres exclusion-constraint race that the
      // checkout server action depends on for correctness.
      //
      // 1. Open two independent browser contexts.
      // 2. Both navigate to the same /p/[slug]/checkout?siteId=...&from=...&to=...
      //    URL with the same dates and the same site.
      // 3. Both fill the form with different guest emails.
      // 4. Click "Continue to payment" on both as close to simultaneously
      //    as possible (Promise.all on two page.click() calls).
      // 5. Assert exactly one ends up on checkout.stripe.com; the other
      //    sees "Site no longer available" inline on the form.
      // 6. Confirm via DB that exactly one HELD Reservation row exists
      //    for that site/window.
      void browser;
    },
  );
});
