import { describe, it, expect } from "vitest";
import { matchRequestedToRows, type VariantPriceRow } from "@/lib/merch/reprice";

const row = {
  id: "v1", printfulVariantId: 4012, printfulSyncVariantId: "501",
  variantName: "Hoodie / M", size: "M", color: null, retailPriceCents: 4650, productName: "Hoodie",
  fulfillmentType: "printful_pod" as const, personalizationConfig: null,
};

const pickupRow: VariantPriceRow = {
  id: "v1", printfulVariantId: null, printfulSyncVariantId: null,
  variantName: "Jersey / M", size: "M", color: null, retailPriceCents: 4500,
  productName: "Home Jersey", fulfillmentType: "pickup", personalizationConfig: { name: true, number: true },
};

describe("matchRequestedToRows", () => {
  it("prices each requested line from the DB row (server price, not client)", () => {
    const r = matchRequestedToRows([{ variantId: "v1", quantity: 2 }], [row]);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.lines[0].unitPriceCents).toBe(4650); expect(r.lines[0].quantity).toBe(2); }
  });
  it("handles the same variant across two requested lines (no false-negative)", () => {
    const r = matchRequestedToRows([{ variantId: "v1", quantity: 1 }, { variantId: "v1", quantity: 3 }], [row]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines).toHaveLength(2);
  });
  it("fails when a requested variant has no matching row", () => {
    expect(matchRequestedToRows([{ variantId: "vX", quantity: 1 }], [row]).ok).toBe(false);
  });
});

describe("matchRequestedToRows (pickup/manual)", () => {
  it("prices a pickup line with null printful ids", () => {
    const out = matchRequestedToRows([{ variantId: "v1", quantity: 1 }], [pickupRow]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.lines[0].fulfillmentType).toBe("pickup");
      expect(out.lines[0].printfulVariantId).toBeNull();
      expect(out.lines[0].unitPriceCents).toBe(4500);
      expect(out.lines[0].personalizationConfig).toEqual({ name: true, number: true });
    }
  });
  it("fails when a requested variant is missing", () => {
    expect(matchRequestedToRows([{ variantId: "nope", quantity: 1 }], [pickupRow]).ok).toBe(false);
  });
});
