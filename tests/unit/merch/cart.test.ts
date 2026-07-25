import { describe, it, expect } from "vitest";
import { cartSubtotalCents, mergeCartItem, cartStoreId, type CartItem } from "@/lib/merch/cart";

const base: CartItem = {
  variantId: "v1", productSlug: "hoodie", name: "Hoodie", size: "M", color: null,
  unitPriceCents: 4650, imageUrl: null, printfulSyncVariantId: "501",
  storeId: "s1", storeSlug: "general", quantity: 1,
};

describe("cartSubtotalCents", () => {
  it("sums price*qty across lines", () => {
    expect(cartSubtotalCents([{ ...base, quantity: 2 }, { ...base, variantId: "v2", unitPriceCents: 5200, quantity: 1 }])).toBe(4650 * 2 + 5200);
  });
});

describe("mergeCartItem (store-aware, personalization-aware)", () => {
  it("adds a new variant", () => {
    expect(mergeCartItem([], base)).toHaveLength(1);
  });
  it("increments quantity for an existing variant", () => {
    const out = mergeCartItem([base], { ...base, quantity: 3 });
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(4);
  });
  it("merges quantities for identical non-personalized variant", () => {
    const out = mergeCartItem([base], { ...base, quantity: 2 });
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(3);
  });
  it("keeps personalized lines separate", () => {
    const a: CartItem = { ...base, lineId: "l1", personalization: { name: "A", number: "7" } };
    const b: CartItem = { ...base, lineId: "l2", personalization: { name: "B", number: "9" } };
    const out = mergeCartItem([a], b);
    expect(out).toHaveLength(2);
  });
});

describe("cartStoreId", () => {
  it("returns null for empty", () => expect(cartStoreId([])).toBeNull());
  it("returns the store id for a single-store cart", () => expect(cartStoreId([base])).toBe("s1"));
});
