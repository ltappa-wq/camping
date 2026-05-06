import { describe, expect, it } from "vitest";

import {
  BULK_MAX_COUNT,
  bulkSiteFormSchema,
  findLabelCollisions,
  generateBulkLabels,
} from "./schema";

describe("generateBulkLabels", () => {
  it("emits sequential labels with no prefix", () => {
    expect(
      generateBulkLabels({ prefix: "", startNumber: 1, count: 3 }),
    ).toEqual(["1", "2", "3"]);
  });

  it("prepends a prefix", () => {
    expect(
      generateBulkLabels({ prefix: "A", startNumber: 1, count: 5 }),
    ).toEqual(["A1", "A2", "A3", "A4", "A5"]);
  });

  it("respects a starting number > 1", () => {
    expect(
      generateBulkLabels({ prefix: "B", startNumber: 11, count: 3 }),
    ).toEqual(["B11", "B12", "B13"]);
  });

  it("count=1 returns a single label", () => {
    expect(
      generateBulkLabels({ prefix: "Site-", startNumber: 7, count: 1 }),
    ).toEqual(["Site-7"]);
  });
});

describe("findLabelCollisions", () => {
  it("returns an empty array when nothing exists", () => {
    expect(findLabelCollisions(["A1", "A2"], [])).toEqual([]);
  });

  it("returns the subset of generated labels that already exist", () => {
    expect(
      findLabelCollisions(["A1", "A2", "A3"], ["A2", "B5"]),
    ).toEqual(["A2"]);
  });

  it("preserves the order of the generated labels", () => {
    expect(
      findLabelCollisions(["A3", "A1", "A2"], ["A1", "A3"]),
    ).toEqual(["A3", "A1"]);
  });

  it("handles all collisions", () => {
    expect(
      findLabelCollisions(["A1", "A2"], ["A1", "A2", "A3"]),
    ).toEqual(["A1", "A2"]);
  });
});

describe("bulkSiteFormSchema", () => {
  const valid = {
    siteTypeId: "st-1",
    prefix: "A",
    startNumber: 1,
    count: 5,
    tagsText: "shaded",
  };

  it("accepts a valid input", () => {
    expect(bulkSiteFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a siteTypeId", () => {
    const r = bulkSiteFormSchema.safeParse({ ...valid, siteTypeId: "" });
    expect(r.success).toBe(false);
  });

  it("rejects count > BULK_MAX_COUNT", () => {
    const r = bulkSiteFormSchema.safeParse({
      ...valid,
      count: BULK_MAX_COUNT + 1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects count < 1", () => {
    expect(bulkSiteFormSchema.safeParse({ ...valid, count: 0 }).success).toBe(
      false,
    );
  });

  it("rejects startNumber < 1", () => {
    expect(
      bulkSiteFormSchema.safeParse({ ...valid, startNumber: 0 }).success,
    ).toBe(false);
  });

  it("rejects prefix > 20 chars", () => {
    expect(
      bulkSiteFormSchema.safeParse({ ...valid, prefix: "x".repeat(21) })
        .success,
    ).toBe(false);
  });

  it("coerces numeric strings", () => {
    const r = bulkSiteFormSchema.safeParse({
      ...valid,
      startNumber: "5",
      count: "3",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.startNumber).toBe(5);
      expect(r.data.count).toBe(3);
    }
  });
});
