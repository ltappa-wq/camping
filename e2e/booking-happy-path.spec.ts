import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Smoke test of the public booking flow. Runs end-to-end against a
 * real database, real Stripe (test mode), and real Resend (sandbox).
 *
 * Preconditions when running against localhost:
 *   1. `pnpm dev` is running on the baseURL.
 *   2. `stripe listen --forward-to localhost:3000/api/stripe/webhook`
 *      is forwarding webhook events.
 *   3. The "monument-point" property's Organization has Stripe Connect
 *      onboarding marked complete (`stripeOnboardingComplete = true`,
 *      `stripeChargesEnabled = true`). Without this, the public page
 *      shows "Online bookings coming soon" and the test fails fast.
 *   4. A nightly RatePlan exists for monument-point.
 *
 * Per phase 3 spec: not part of CI yet — run by hand after each deploy.
 */

const SLUG = "monument-point";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

test("guest books a site end-to-end with a Stripe test card", async ({
  page,
}) => {
  // Dates: 30 days out, 3-night stay. Far enough that nothing else conflicts.
  const checkIn = new Date();
  checkIn.setUTCDate(checkIn.getUTCDate() + 30);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 3);

  // Skip the date-picker UI by submitting the search via URL — the date
  // picker is exercised separately and isn't the point of this test.
  await page.goto(
    `/p/${SLUG}/search?from=${ymd(checkIn)}&to=${ymd(checkOut)}&adults=2&children=0`,
  );

  await expect(
    page.getByRole("heading", { name: /available site/i }),
  ).toBeVisible();

  // Click the first "Book this site" link — cards are sorted by price asc
  // so this is the cheapest available match.
  await page.getByRole("link", { name: /book this site/i }).first().click();

  // Checkout form
  await page.fill("#name", "E2E Test Guest");
  await page.fill("#email", "e2e-test@example.com");
  await page.fill("#phone", "555-555-0100");
  await page
    .getByRole("button", { name: /continue to payment/i })
    .click();

  // Stripe Checkout — wait for cross-origin navigation
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

  // Stripe Checkout's hosted form — placeholders are the most stable
  // selectors today. If Stripe revamps the UI these will need updates.
  await page
    .getByPlaceholder("1234 1234 1234 1234")
    .fill("4242 4242 4242 4242");
  await page.getByPlaceholder("MM / YY").fill("12 / 34");
  await page.getByPlaceholder("CVC").fill("123");
  await page
    .getByPlaceholder("Full name on card")
    .fill("E2E Test Guest");

  // Stripe sometimes shows a ZIP / postal-code field depending on the
  // country and card type. Best-effort fill if present.
  const zip = page.getByPlaceholder(/zip|postal/i).first();
  if (await zip.isVisible().catch(() => false)) {
    await zip.fill("53234");
  }

  // The pay button label includes the price — match by prefix.
  await page.getByRole("button", { name: /^pay\s+\$/i }).click();

  // Stripe redirects back to /p/[slug]/booking/[code]?session_id=...
  await page.waitForURL(/\/p\/.+\/booking\/.+/, { timeout: 60_000 });

  // The page may render the HELD spinner first while the webhook is in
  // flight; wait up to 30s for the success heading. router.refresh()
  // inside HoldingView swaps to State A as soon as the webhook lands.
  await expect(
    page.getByRole("heading", { name: /you'?re booked/i }),
  ).toBeVisible({ timeout: 30_000 });

  // Pull the confirmation code from the URL and verify the DB row.
  const code = decodeURIComponent(
    new URL(page.url()).pathname.split("/").filter(Boolean).pop()!,
  );

  const prisma = new PrismaClient();
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { confirmationCode: code },
      select: { status: true, paidCents: true, totalCents: true },
    });
    expect(reservation).not.toBeNull();
    expect(reservation!.status).toBe("CONFIRMED");
    expect(reservation!.paidCents).toBeGreaterThan(0);
    expect(reservation!.paidCents).toBe(reservation!.totalCents);
  } finally {
    await prisma.$disconnect();
  }
});
