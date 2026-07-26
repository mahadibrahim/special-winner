import { describe, it, expect } from "vitest";
import { validateSelections, splitEvenExact } from "@/lib/merch/bundle-checkout";
import {
  bundleFullCents,
  bundleDiscountedCents,
  distributeBundleDiscount,
} from "@/lib/merch/bundle-pricing";
import type { BundleSlot } from "@/lib/merch/bundles";
import type { MerchVariant } from "@/lib/db/schema";

function variant(id: string, overrides: Partial<MerchVariant> = {}): MerchVariant {
  return {
    id,
    productId: "product-x",
    printfulSyncVariantId: null,
    printfulVariantId: null,
    name: `Variant ${id}`,
    size: null,
    color: null,
    sku: null,
    retailPriceCents: 1000,
    weightOz: null,
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    active: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function slot(id: string, productId: string, variants: MerchVariant[], quantity = 1): BundleSlot {
  return {
    slot: {
      id,
      bundleId: "bundle-1",
      productId,
      label: null,
      quantity,
      sortOrder: 0,
    },
    product: { id: productId, name: `Product ${productId}`, slug: productId },
    variants,
  };
}

describe("validateSelections", () => {
  const shirtV1 = variant("shirt-v1");
  const shirtV2 = variant("shirt-v2");
  const hatV1 = variant("hat-v1");
  const slots: BundleSlot[] = [
    slot("slot-shirt", "product-shirt", [shirtV1, shirtV2]),
    slot("slot-hat", "product-hat", [hatV1]),
  ];

  it("ok: one valid selection per slot, in-bundle variants", () => {
    const result = validateSelections(slots, [
      { slotId: "slot-shirt", variantId: "shirt-v2" },
      { slotId: "slot-hat", variantId: "hat-v1" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chosen).toHaveLength(2);
      expect(result.chosen[0].variantId).toBe("shirt-v2");
      expect(result.chosen[1].variantId).toBe("hat-v1");
    }
  });

  it("missing: fewer selections than slots", () => {
    const result = validateSelections(slots, [{ slotId: "slot-shirt", variantId: "shirt-v1" }]);
    expect(result).toEqual({ ok: false, reason: "missing" });
  });

  it("missing: more selections than slots", () => {
    const result = validateSelections(slots, [
      { slotId: "slot-shirt", variantId: "shirt-v1" },
      { slotId: "slot-hat", variantId: "hat-v1" },
      { slotId: "slot-shirt", variantId: "shirt-v2" },
    ]);
    expect(result).toEqual({ ok: false, reason: "missing" });
  });

  it("missing: duplicate slotId (same slot selected twice, another slot uncovered)", () => {
    const result = validateSelections(slots, [
      { slotId: "slot-shirt", variantId: "shirt-v1" },
      { slotId: "slot-shirt", variantId: "shirt-v2" },
    ]);
    expect(result).toEqual({ ok: false, reason: "missing" });
  });

  it("missing: unknown slotId not part of this bundle", () => {
    const result = validateSelections(slots, [
      { slotId: "slot-shirt", variantId: "shirt-v1" },
      { slotId: "slot-nonexistent", variantId: "hat-v1" },
    ]);
    expect(result).toEqual({ ok: false, reason: "missing" });
  });

  it("off-bundle: variant exists but belongs to a different slot's product", () => {
    const result = validateSelections(slots, [
      { slotId: "slot-shirt", variantId: "hat-v1" }, // hat variant offered for the shirt slot
      { slotId: "slot-hat", variantId: "hat-v1" },
    ]);
    expect(result).toEqual({ ok: false, reason: "off-bundle" });
  });

  it("off-bundle: variant id that doesn't exist at all (e.g. an inactive variant already filtered out upstream)", () => {
    const result = validateSelections(slots, [
      { slotId: "slot-shirt", variantId: "shirt-v1" },
      { slotId: "slot-hat", variantId: "some-other-store-variant" },
    ]);
    expect(result).toEqual({ ok: false, reason: "off-bundle" });
  });
});

describe("splitEvenExact", () => {
  it("divisible split: even unit price across all units", () => {
    expect(splitEvenExact(300, 3)).toEqual([{ unitPriceCents: 100, quantity: 3 }]);
  });

  it("indivisible split: remainder units get one extra cent, sum is exact", () => {
    // 100 cents across 3 units: base=33, remainder=1
    const groups = splitEvenExact(100, 3);
    expect(groups).toEqual([
      { unitPriceCents: 34, quantity: 1 },
      { unitPriceCents: 33, quantity: 2 },
    ]);
    const sum = groups.reduce((s, g) => s + g.unitPriceCents * g.quantity, 0);
    expect(sum).toBe(100);
  });

  it("zero total: all units priced at 0, item count preserved", () => {
    const groups = splitEvenExact(0, 4);
    expect(groups).toEqual([{ unitPriceCents: 0, quantity: 4 }]);
  });

  it("count <= 0 returns no groups", () => {
    expect(splitEvenExact(500, 0)).toEqual([]);
  });

  it("sums exactly across randomized totals/counts", () => {
    for (let t = 0; t < 200; t++) {
      const total = Math.floor(Math.random() * 100000);
      const count = 1 + Math.floor(Math.random() * 12);
      const groups = splitEvenExact(total, count);
      const sum = groups.reduce((s, g) => s + g.unitPriceCents * g.quantity, 0);
      const qtySum = groups.reduce((s, g) => s + g.quantity, 0);
      expect(sum).toBe(total);
      expect(qtySum).toBe(count);
      expect(groups.every((g) => Number.isInteger(g.unitPriceCents) && g.unitPriceCents >= 0)).toBe(true);
    }
  });
});

describe("bundle explosion cents-exactness (pure pipeline, no DB)", () => {
  it("a slot.quantity > 1 component with an indivisible discount still sums exactly, scaled across request.quantity bundle copies", () => {
    // Two-slot bundle: slot A is a single jersey ($20), slot B is a 3-pack of
    // socks ($5/each = $15 extended) — quantity 3 is deliberately chosen so the
    // discount doesn't divide evenly across the physical sock units.
    const components = [
      { unitPriceCents: 2000, quantity: 1 }, // slot A: jersey
      { unitPriceCents: 500, quantity: 3 }, // slot B: socks x3
    ];
    const slotQuantities = [1, 3];
    const requestQuantity = 4; // buying 4 copies of this bundle

    const full = bundleFullCents(components); // 2000 + 1500 = 3500
    expect(full).toBe(3500);
    const discountedPerBundle = bundleDiscountedCents(full, "percent", 13); // round(3500*0.87)=3045
    expect(discountedPerBundle).toBe(3045);
    const parts = distributeBundleDiscount(components, discountedPerBundle);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(discountedPerBundle);

    // Explode exactly as explodeBundles does: split each slot's per-bundle
    // part across its slot.quantity physical units, then scale group sizes by
    // request.quantity (all bundle copies are identical, per Task 2.2's emission
    // scheme documented in bundle-checkout.ts).
    const lines: { unitPriceCents: number; quantity: number }[] = [];
    parts.forEach((part, i) => {
      const groups = splitEvenExact(part, slotQuantities[i]);
      for (const g of groups) {
        lines.push({ unitPriceCents: g.unitPriceCents, quantity: g.quantity * requestQuantity });
      }
    });

    // (a) every unit price is a non-negative integer
    expect(lines.every((l) => Number.isInteger(l.unitPriceCents) && l.unitPriceCents >= 0)).toBe(true);

    // (b) the grand total across all emitted lines equals discountedPerBundle * requestQuantity exactly
    const grandTotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
    expect(grandTotal).toBe(discountedPerBundle * requestQuantity);

    // (d) physical item counts: slot A -> 1*4=4 jersey units, slot B -> 3*4=12 sock units
    const jerseyLines = lines.slice(0, splitEvenExact(parts[0], slotQuantities[0]).length);
    const sockLines = lines.slice(jerseyLines.length);
    expect(jerseyLines.reduce((s, l) => s + l.quantity, 0)).toBe(1 * requestQuantity);
    expect(sockLines.reduce((s, l) => s + l.quantity, 0)).toBe(3 * requestQuantity);
  });

  it("sums exactly across randomized multi-slot bundles with varying slot.quantity and discounts", () => {
    for (let t = 0; t < 200; t++) {
      const numSlots = 1 + Math.floor(Math.random() * 4);
      const components = Array.from({ length: numSlots }, () => ({
        unitPriceCents: 1 + Math.floor(Math.random() * 5000),
        quantity: 1 + Math.floor(Math.random() * 5),
      }));
      const requestQuantity = 1 + Math.floor(Math.random() * 6);
      const type: "percent" | "fixed" = Math.random() < 0.5 ? "percent" : "fixed";
      const full = bundleFullCents(components);
      const value = type === "percent" ? Math.floor(Math.random() * 100) : Math.floor(Math.random() * (full + 1));
      const discountedPerBundle = bundleDiscountedCents(full, type, value);
      const parts = distributeBundleDiscount(components, discountedPerBundle);

      let grandTotal = 0;
      let totalPhysicalUnits = 0;
      components.forEach((c, i) => {
        const groups = splitEvenExact(parts[i], c.quantity);
        for (const g of groups) {
          grandTotal += g.unitPriceCents * g.quantity * requestQuantity;
          totalPhysicalUnits += g.quantity * requestQuantity;
        }
      });

      expect(grandTotal).toBe(discountedPerBundle * requestQuantity);
      const expectedUnits = components.reduce((s, c) => s + c.quantity, 0) * requestQuantity;
      expect(totalPhysicalUnits).toBe(expectedUnits);
    }
  });
});
