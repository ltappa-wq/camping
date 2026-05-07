import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for Camping. The booking flow is stateful (it creates real
 * Reservation rows, charges Stripe test cards, queues real Resend emails)
 * so we run a single worker, no parallelism, no retries — flakiness should
 * be diagnosed, not papered over.
 *
 * `E2E_BASE_URL` overrides the default `http://localhost:3000`. Point it
 * at a Vercel preview URL when smoke-testing a deploy:
 *   E2E_BASE_URL=https://camping-mauve.vercel.app pnpm e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
