import { describe, expect, it } from "vitest";

import { TEMPLATE_DEFAULTS } from "./defaults";
import { escapeHtml, fill, renderEmailTemplate, textToHtml } from "./render";

describe("fill", () => {
  it("replaces simple {{var}} placeholders", () => {
    expect(fill("Hi {{name}}", { name: "Sam" })).toBe("Hi Sam");
  });

  it("tolerates whitespace around the var name", () => {
    expect(fill("{{  guestName  }}", { guestName: "Alex" })).toBe("Alex");
  });

  it("replaces missing keys with empty string instead of throwing", () => {
    expect(fill("Hi {{name}} — {{missing}}", { name: "Sam" })).toBe(
      "Hi Sam — ",
    );
  });

  it("substitutes the same key multiple times", () => {
    expect(fill("{{x}}-{{x}}-{{x}}", { x: "abc" })).toBe("abc-abc-abc");
  });

  it("leaves the literal text untouched when there are no placeholders", () => {
    expect(fill("plain text — no vars", {})).toBe("plain text — no vars");
  });

  it("ignores malformed placeholders", () => {
    // Single-brace, unclosed, or non-identifier names are left alone.
    expect(fill("{name} {{1bad}} {{good}}", { good: "ok" })).toBe(
      "{name} {{1bad}} ok",
    );
  });
});

describe("escapeHtml", () => {
  it("escapes the three dangerous chars", () => {
    expect(escapeHtml('a & b < c > "d"')).toBe('a &amp; b &lt; c &gt; "d"');
  });
});

describe("textToHtml", () => {
  it("wraps each paragraph in <p> tags", () => {
    expect(textToHtml("first\n\nsecond")).toBe("<p>first</p>\n<p>second</p>");
  });

  it("converts internal newlines to <br>", () => {
    expect(textToHtml("line one\nline two")).toBe(
      "<p>line one<br>line two</p>",
    );
  });

  it("escapes HTML in the source text", () => {
    expect(textToHtml("a & <b>")).toBe("<p>a &amp; &lt;b&gt;</p>");
  });

  it("linkifies bare URLs", () => {
    expect(textToHtml("visit https://example.com")).toBe(
      '<p>visit <a href="https://example.com">https://example.com</a></p>',
    );
  });

  it("collapses leading/trailing blank paragraphs", () => {
    expect(textToHtml("\n\n  hello  \n\n")).toBe("<p>hello</p>");
  });
});

describe("renderEmailTemplate", () => {
  it("uses the hardcoded default when no override is provided", () => {
    const out = renderEmailTemplate("RESERVATION_CONFIRMATION", {
      guestName: "Sam",
      confirmationCode: "MP-A8KQ2",
      propertyName: "Monument Point",
      siteLabel: "12",
      siteType: "Wooded Electric",
      checkInDate: "2026-07-04",
      checkInTime: "14:00",
      checkOutDate: "2026-07-07",
      checkOutTime: "11:00",
      totalAmount: "$135.00",
      manageBookingUrl: "https://example.com/manage",
      portalSectionText: "",
      portalSectionHtml: "",
    });
    expect(out.subject).toBe(
      "Booking confirmed — MP-A8KQ2 at Monument Point",
    );
    expect(out.bodyText).toContain("Site: 12 (Wooded Electric)");
    expect(out.bodyHtml).toContain("<strong>MP-A8KQ2</strong>");
  });

  it("prefers the operator override when one is provided", () => {
    const out = renderEmailTemplate(
      "RESERVATION_CONFIRMATION",
      { guestName: "Sam", propertyName: "Monument Point" },
      {
        subject: "Custom subject for {{guestName}}",
        bodyText: "Custom body — see you at {{propertyName}}",
        bodyHtml: "<p>Custom HTML — {{propertyName}}</p>",
      },
    );
    expect(out.subject).toBe("Custom subject for Sam");
    expect(out.bodyText).toBe("Custom body — see you at Monument Point");
    expect(out.bodyHtml).toBe("<p>Custom HTML — Monument Point</p>");
  });

  it("treats a null override the same as missing", () => {
    const fromUndefined = renderEmailTemplate(
      "GUEST_PROFILE_CLAIM",
      { propertyName: "MP", intentLabel: "X", intro: "y", magicLink: "z", expiresIn: "1h" },
      undefined,
    );
    const fromNull = renderEmailTemplate(
      "GUEST_PROFILE_CLAIM",
      { propertyName: "MP", intentLabel: "X", intro: "y", magicLink: "z", expiresIn: "1h" },
      null,
    );
    expect(fromNull).toEqual(fromUndefined);
  });

  it("substitutes empty string for any var the override references but the bag lacks", () => {
    const out = renderEmailTemplate(
      "RESERVATION_CONFIRMATION",
      { guestName: "Sam" },
      {
        subject: "{{guestName}} — {{notAVariable}} — done",
        bodyText: "{{guestName}}, missing: {{nope}}",
        bodyHtml: "<p>{{guestName}}</p>",
      },
    );
    expect(out.subject).toBe("Sam —  — done");
    expect(out.bodyText).toBe("Sam, missing: ");
  });

  it("each customizable type has a default with subject + bodyText + bodyHtml", () => {
    for (const type of Object.keys(TEMPLATE_DEFAULTS) as Array<
      keyof typeof TEMPLATE_DEFAULTS
    >) {
      const def = TEMPLATE_DEFAULTS[type];
      expect(def.subject.length).toBeGreaterThan(0);
      expect(def.bodyText.length).toBeGreaterThan(0);
      expect(def.bodyHtml.length).toBeGreaterThan(0);
    }
  });
});
