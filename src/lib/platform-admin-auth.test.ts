import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isInBootstrapAllowlist } from "./platform-admin-allowlist";

// Most of platform-admin-auth.ts is Auth.js wiring that requires a
// request context to test meaningfully. The allowlist parser is the
// one piece that's pure — extracted to its own module so it can be
// imported here without dragging next-auth into the test runtime.

describe("isInBootstrapAllowlist", () => {
  const ORIGINAL = process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS;

  beforeEach(() => {
    delete process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS;
  });
  afterEach(() => {
    if (ORIGINAL !== undefined) {
      process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS = ORIGINAL;
    } else {
      delete process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS;
    }
  });

  it("returns false when the env var is unset or empty", () => {
    expect(isInBootstrapAllowlist("anyone@example.com")).toBe(false);
    process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS = "";
    expect(isInBootstrapAllowlist("anyone@example.com")).toBe(false);
  });

  it("matches a single email", () => {
    process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS = "ltappa@example.com";
    expect(isInBootstrapAllowlist("ltappa@example.com")).toBe(true);
    expect(isInBootstrapAllowlist("someone@example.com")).toBe(false);
  });

  it("matches against a comma-separated list", () => {
    process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS =
      "a@example.com,b@example.com, c@example.com";
    expect(isInBootstrapAllowlist("a@example.com")).toBe(true);
    expect(isInBootstrapAllowlist("b@example.com")).toBe(true);
    expect(isInBootstrapAllowlist("c@example.com")).toBe(true);
  });

  it("is case-insensitive on both sides", () => {
    process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS = "Pat@Example.COM";
    expect(isInBootstrapAllowlist("pat@example.com")).toBe(true);
    expect(isInBootstrapAllowlist("PAT@example.com")).toBe(true);
  });
});
