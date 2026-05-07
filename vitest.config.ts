import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // e2e/ holds Playwright specs — they import @playwright/test and must be
    // run via `pnpm e2e`, not via vitest. node_modules and dist are vitest's
    // own defaults; we re-list them when overriding `exclude`.
    exclude: ["e2e/**", "node_modules/**", "dist/**", ".next/**"],
  },
});
