import { describe, it, expect } from "vitest";
import { priceRangeCents, primaryImageUrl } from "@/lib/merch/catalog";

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
