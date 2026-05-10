import { describe, expect, it } from "vitest";

import { fromAddressForProperty } from "./email-from";

describe("fromAddressForProperty", () => {
  const verified = {
    sendingDomain: "monumentpointcamping.com",
    sendingDomainVerified: true,
    sendingFromLocal: "bookings",
  };

  it("uses the verified custom domain when all fields are set", () => {
    expect(fromAddressForProperty(verified)).toBe(
      "bookings@monumentpointcamping.com",
    );
  });

  it("uses the explicit fallback when domain is not verified", () => {
    expect(
      fromAddressForProperty(
        { ...verified, sendingDomainVerified: false },
        "onboarding@resend.dev",
      ),
    ).toBe("onboarding@resend.dev");
  });

  it("uses the explicit fallback when domain is null", () => {
    expect(
      fromAddressForProperty(
        { ...verified, sendingDomain: null },
        "platform@example.com",
      ),
    ).toBe("platform@example.com");
  });

  it("uses the explicit fallback when local part is empty", () => {
    expect(
      fromAddressForProperty(
        { ...verified, sendingFromLocal: "" },
        "platform@example.com",
      ),
    ).toBe("platform@example.com");
  });

  it("falls back to the default platform address when fallback is undefined", () => {
    expect(
      fromAddressForProperty(
        { ...verified, sendingDomainVerified: false },
        undefined,
      ),
    ).toBe("onboarding@resend.dev");
  });

  it("respects a non-default sendingFromLocal", () => {
    expect(
      fromAddressForProperty({
        ...verified,
        sendingFromLocal: "reservations",
      }),
    ).toBe("reservations@monumentpointcamping.com");
  });
});
