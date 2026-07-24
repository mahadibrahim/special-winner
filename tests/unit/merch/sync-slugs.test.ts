import { describe, it, expect } from "vitest";
import { dedupeSlugs } from "@/lib/merch/sync";

describe("dedupeSlugs", () => {
  it("passes distinct slugs through unchanged", () => {
    expect(dedupeSlugs([{ baseSlug: "tee" }, { baseSlug: "hoodie" }])).toEqual([
      "tee",
      "hoodie",
    ]);
  });
  it("suffixes collisions in order", () => {
    expect(
      dedupeSlugs([{ baseSlug: "tee" }, { baseSlug: "tee" }, { baseSlug: "tee" }]),
    ).toEqual(["tee", "tee-2", "tee-3"]);
  });
  it("falls back to 'item' for an empty base slug", () => {
    expect(dedupeSlugs([{ baseSlug: "" }, { baseSlug: "" }])).toEqual([
      "item",
      "item-2",
    ]);
  });
  it("resolves a suffix-vs-literal collision to all-unique slugs", () => {
    const out = dedupeSlugs([{ baseSlug: "tee" }, { baseSlug: "tee-2" }, { baseSlug: "tee" }]);
    expect(new Set(out).size).toBe(out.length); // no duplicates
    expect(out).toEqual(["tee", "tee-2", "tee-3"]);
  });
});
