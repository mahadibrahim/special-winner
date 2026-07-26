import { describe, it, expect } from "vitest";
import {
  addLineToCart,
  cartSubtotalCents,
  mergeCartItem,
  cartStoreId,
  isBundleLine,
  type CartItem,
  type CartBundleItem,
  type CartLine,
} from "@/lib/merch/cart";

const base: CartItem = {
  variantId: "v1", productSlug: "hoodie", name: "Hoodie", size: "M", color: null,
  unitPriceCents: 4650, imageUrl: null, printfulSyncVariantId: "501",
  storeId: "s1", storeSlug: "general", quantity: 1,
};

const bundleLine = (overrides: Partial<CartBundleItem> = {}): CartBundleItem => ({
  kind: "bundle",
  lineId: "b1",
  bundleId: "bundle-1",
  bundleSlug: "starter-kit",
  storeId: "s1",
  storeSlug: "general",
  fulfillmentType: "printful_pod",
  name: "Starter Kit",
  imageUrl: null,
  unitPriceCents: 6000,
  selections: [
    { slotId: "slot-1", productId: "p1", variantId: "v1", label: "Jersey", size: "M" },
    { slotId: "slot-2", productId: "p2", variantId: "v2", label: "Shorts", size: "L" },
  ],
  quantity: 1,
  ...overrides,
});

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
  it("returns the store id for a bundle-only cart", () => expect(cartStoreId([bundleLine()])).toBe("s1"));
});

describe("isBundleLine", () => {
  it("identifies bundle lines", () => {
    expect(isBundleLine(bundleLine())).toBe(true);
    expect(isBundleLine(base)).toBe(false);
  });
});

describe("bundle cart lines", () => {
  it("never merges — two adds of the same bundle produce two distinct lines", () => {
    const first = mergeCartItem([], bundleLine({ lineId: "b1" }));
    const out = mergeCartItem(first, bundleLine({ lineId: "b2" }));
    expect(out).toHaveLength(2);
  });

  it("never merges even when selections are identical", () => {
    const first = mergeCartItem([], bundleLine({ lineId: "b1" }));
    const out = mergeCartItem(first, bundleLine({ lineId: "b2" }));
    expect(out.every(isBundleLine)).toBe(true);
    expect(out).toHaveLength(2);
  });

  it("sums a mixed product + bundle cart via cartSubtotalCents", () => {
    const lines: CartLine[] = [{ ...base, quantity: 2 }, bundleLine({ quantity: 3 })];
    expect(cartSubtotalCents(lines)).toBe(4650 * 2 + 6000 * 3);
  });

  it("a product and a bundle from the same store coexist", () => {
    const withProduct = mergeCartItem([], base);
    const withBoth = mergeCartItem(withProduct, bundleLine());
    expect(withBoth).toHaveLength(2);
    expect(withBoth.some(isBundleLine)).toBe(true);
    expect(withBoth.some((l) => !isBundleLine(l))).toBe(true);
  });
});

describe("addLineToCart (single-store rule)", () => {
  it("adds a bundle line to an empty cart", () => {
    expect(addLineToCart([], bundleLine())).toHaveLength(1);
  });

  it("keeps a same-store bundle add alongside an existing product line", () => {
    const out = addLineToCart([base], bundleLine({ storeId: "s1" }));
    expect(out).toHaveLength(2);
  });

  it("replaces the whole cart when a bundle from a different store is added", () => {
    const out = addLineToCart([base], bundleLine({ storeId: "s2" }));
    expect(out).toHaveLength(1);
    expect(out[0].storeId).toBe("s2");
  });

  it("replaces the whole cart when a product from a different store is added", () => {
    const out = addLineToCart([bundleLine({ storeId: "s1" })], { ...base, storeId: "s2" });
    expect(out).toHaveLength(1);
    expect(out[0].storeId).toBe("s2");
  });
});
