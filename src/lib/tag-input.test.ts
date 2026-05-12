import { describe, expect, it } from "vitest";

import { commitTags, filterSuggestions, removeTagAt } from "./tag-input";

describe("commitTags", () => {
  it("appends a single tag", () => {
    expect(commitTags(["a"], "b")).toEqual(["a", "b"]);
  });

  it("trims whitespace", () => {
    expect(commitTags([], "  shaded  ")).toEqual(["shaded"]);
  });

  it("ignores empty input", () => {
    expect(commitTags(["a"], "")).toEqual(["a"]);
    expect(commitTags(["a"], "   ")).toEqual(["a"]);
  });

  it("splits on commas", () => {
    expect(commitTags([], "shaded, near bath, lake")).toEqual([
      "shaded",
      "near bath",
      "lake",
    ]);
  });

  it("splits on newlines and tabs (paste-from-spreadsheet)", () => {
    expect(commitTags([], "shaded\nnear bath\tlake")).toEqual([
      "shaded",
      "near bath",
      "lake",
    ]);
  });

  it("treats commas + newlines together as separators", () => {
    expect(commitTags([], "shaded\nnear bath,\nlake")).toEqual([
      "shaded",
      "near bath",
      "lake",
    ]);
  });

  it("drops duplicates against existing tags", () => {
    expect(commitTags(["shaded"], "shaded, near bath")).toEqual([
      "shaded",
      "near bath",
    ]);
  });

  it("drops duplicates within a single batch", () => {
    expect(commitTags([], "lake, lake, lake")).toEqual(["lake"]);
  });

  it("honors maxTags cap", () => {
    expect(commitTags(["a", "b"], "c, d, e", { maxTags: 4 })).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("readOnly mode rejects values that aren't in suggestions", () => {
    expect(
      commitTags([], "shaded, mystery", {
        readOnly: true,
        suggestions: ["shaded", "lake"],
      }),
    ).toEqual(["shaded"]);
  });

  it("readOnly + suggestions: empty input is a no-op", () => {
    expect(
      commitTags(["lake"], "", {
        readOnly: true,
        suggestions: ["shaded", "lake"],
      }),
    ).toEqual(["lake"]);
  });

  it("non-readOnly accepts free tags even with suggestions present", () => {
    expect(
      commitTags([], "newtag", { suggestions: ["other"] }),
    ).toEqual(["newtag"]);
  });
});

describe("removeTagAt", () => {
  it("removes the indexed tag", () => {
    expect(removeTagAt(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("no-ops on out-of-range index", () => {
    expect(removeTagAt(["a"], -1)).toEqual(["a"]);
    expect(removeTagAt(["a"], 5)).toEqual(["a"]);
  });
});

describe("filterSuggestions", () => {
  const pool = ["shaded", "pull-through", "lake view", "shaded back-in"];

  it("excludes already-selected tags", () => {
    expect(filterSuggestions(pool, ["shaded"], "")).toEqual([
      "pull-through",
      "lake view",
      "shaded back-in",
    ]);
  });

  it("substring-matches the draft case-insensitively", () => {
    expect(filterSuggestions(pool, [], "SHA")).toEqual([
      "shaded",
      "shaded back-in",
    ]);
  });

  it("returns the full pool when draft is empty", () => {
    expect(filterSuggestions(pool, [], "")).toEqual(pool);
  });

  it("respects the limit", () => {
    expect(filterSuggestions(pool, [], "", 2)).toHaveLength(2);
  });
});
