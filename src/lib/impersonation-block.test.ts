import { describe, expect, it } from "vitest";

import { ImpersonationBlockedError } from "./impersonation-block-error";

// Note: blockIfImpersonating + isImpersonatingRequest both read the
// platform-admin session from Auth.js, which needs cookies and a
// running request context to mock. Those paths are covered by
// dogfooding the back-office; here we just pin the error class shape.

describe("ImpersonationBlockedError", () => {
  it("uses a clear default message", () => {
    const err = new ImpersonationBlockedError();
    expect(err.message).toContain("impersonating");
    expect(err.name).toBe("ImpersonationBlockedError");
  });

  it("accepts a custom message", () => {
    const err = new ImpersonationBlockedError("custom thing");
    expect(err.message).toBe("custom thing");
    expect(err.name).toBe("ImpersonationBlockedError");
  });

  it("is recognized as an Error instance for catch blocks", () => {
    expect(new ImpersonationBlockedError()).toBeInstanceOf(Error);
  });
});
