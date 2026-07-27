import { describe, it, expect } from "vitest";
import { excludeCompanionProducts, priceRangeCents, primaryImageUrl } from "@/lib/merch/catalog";

describe("priceRangeCents", () => {
  it("returns null for no variants", () => {
    expect(priceRangeCents([])).toBeNull();
  });
  it("returns min and max across variants", () => {
    expect(
      priceRangeCents([
        { retailPriceCents: 2500 },
        { retailPriceCents: 3000 },
        { retailPriceCents: 2000 },
      ]),
    ).toEqual({ minCents: 2000, maxCents: 3000 });
  });
});

describe("primaryImageUrl", () => {
  it("returns the first image url", () => {
    expect(primaryImageUrl([{ url: "a.png" }, { url: "b.png" }])).toBe("a.png");
  });
  it("returns null for null or empty images", () => {
    expect(primaryImageUrl(null)).toBeNull();
    expect(primaryImageUrl([])).toBeNull();
  });
});

describe("excludeCompanionProducts", () => {
  it("drops a product referenced as another product's digitalCompanionId", () => {
    const book = { id: "book-1", digitalCompanionId: "ebook-1" };
    const ebook = { id: "ebook-1", digitalCompanionId: null };
    const tee = { id: "tee-1", digitalCompanionId: null };
    expect(excludeCompanionProducts([book, ebook, tee])).toEqual([book, tee]);
  });

  it("is a no-op when nothing links to a companion", () => {
    const a = { id: "a", digitalCompanionId: null };
    const b = { id: "b", digitalCompanionId: null };
    expect(excludeCompanionProducts([a, b])).toEqual([a, b]);
  });

  it("preserves order", () => {
    const a = { id: "a", digitalCompanionId: null };
    const b = { id: "b", digitalCompanionId: "c" };
    const c = { id: "c", digitalCompanionId: null };
    const d = { id: "d", digitalCompanionId: null };
    expect(excludeCompanionProducts([a, b, c, d])).toEqual([a, b, d]);
  });

  it("handles an empty list", () => {
    expect(excludeCompanionProducts([])).toEqual([]);
  });
});
