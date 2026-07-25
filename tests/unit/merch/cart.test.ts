import { describe, it, expect } from "vitest";
import { cartSubtotalCents, mergeCartItem, type CartItem } from "@/lib/merch/cart";

const base: CartItem = {
  variantId: "v1", productSlug: "hoodie", name: "Hoodie", size: "M", color: null,
  unitPriceCents: 4650, imageUrl: null, printfulSyncVariantId: "501", quantity: 1,
};

describe("cartSubtotalCents", () => {
  it("sums price*qty across lines", () => {
    expect(cartSubtotalCents([{ ...base, quantity: 2 }, { ...base, variantId: "v2", unitPriceCents: 5200, quantity: 1 }])).toBe(4650 * 2 + 5200);
  });
});

describe("mergeCartItem", () => {
  it("adds a new variant", () => {
    expect(mergeCartItem([], base)).toHaveLength(1);
  });
  it("increments quantity for an existing variant", () => {
    const out = mergeCartItem([base], { ...base, quantity: 3 });
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(4);
  });
});
