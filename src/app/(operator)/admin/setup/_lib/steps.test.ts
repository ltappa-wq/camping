import { describe, expect, it } from "vitest";

import {
  isStepSlug,
  nextStep,
  pickResumeStep,
  prevStep,
  STEP_SLUGS,
  type SetupSnapshot,
} from "./steps";

const COMPLETE: SetupSnapshot = {
  hasName: true,
  hasContact: true,
  hasSeason: true,
  hasSiteType: true,
  hasSite: true,
  hasRatePlan: true,
};

describe("pickResumeStep", () => {
  it("returns 'done' when everything's in place", () => {
    expect(pickResumeStep(COMPLETE)).toBe("done");
  });

  it("returns 'welcome' when the property has no name", () => {
    expect(pickResumeStep({ ...COMPLETE, hasName: false })).toBe("welcome");
  });

  it("returns 'basics' when contact is missing", () => {
    expect(pickResumeStep({ ...COMPLETE, hasContact: false })).toBe("basics");
  });

  it("returns 'basics' when season is missing", () => {
    expect(pickResumeStep({ ...COMPLETE, hasSeason: false })).toBe("basics");
  });

  it("prefers earlier gaps when several are missing", () => {
    // No name AND no site type → name wins, returns 'welcome'.
    expect(
      pickResumeStep({
        ...COMPLETE,
        hasName: false,
        hasSiteType: false,
      }),
    ).toBe("welcome");
  });

  it("returns 'site-type' when only site-type is missing", () => {
    expect(pickResumeStep({ ...COMPLETE, hasSiteType: false })).toBe(
      "site-type",
    );
  });

  it("returns 'sites' when only sites are missing", () => {
    expect(pickResumeStep({ ...COMPLETE, hasSite: false })).toBe("sites");
  });

  it("returns 'rate-plan' when only rate plan is missing", () => {
    expect(pickResumeStep({ ...COMPLETE, hasRatePlan: false })).toBe(
      "rate-plan",
    );
  });
});

describe("step slug helpers", () => {
  it("isStepSlug accepts known slugs and rejects others", () => {
    expect(isStepSlug("welcome")).toBe(true);
    expect(isStepSlug("done")).toBe(true);
    expect(isStepSlug("nope")).toBe(false);
  });

  it("nextStep advances and returns null at the end", () => {
    expect(nextStep("welcome")).toBe("basics");
    expect(nextStep("done")).toBeNull();
  });

  it("prevStep goes back and returns null at the start", () => {
    expect(prevStep("basics")).toBe("welcome");
    expect(prevStep("welcome")).toBeNull();
  });

  it("step list is the documented length", () => {
    expect(STEP_SLUGS).toHaveLength(11);
  });
});
