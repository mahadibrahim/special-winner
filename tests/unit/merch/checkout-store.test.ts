import { describe, it, expect } from "vitest";
import { partitionByFulfillment, lineNeedsShipping } from "@/lib/merch/checkout-store";
import type { RepricedLine } from "@/lib/merch/reprice";

const line = (ft: RepricedLine["fulfillmentType"]): RepricedLine => ({
  variantId: "v", fulfillmentType: ft, printfulVariantId: null, printfulSyncVariantId: null,
  productName: "P", variantName: "V", size: null, color: null, unitPriceCents: 1000,
  personalizationConfig: null, quantity: 1,
});

describe("checkout-store partition", () => {
  it("splits printful vs pickup", () => {
    const { printful, pickup } = partitionByFulfillment([line("printful_pod"), line("pickup")]);
    expect(printful).toHaveLength(1);
    expect(pickup).toHaveLength(1);
  });
  it("lineNeedsShipping true for printful/self_shipped only", () => {
    expect(lineNeedsShipping(line("printful_pod"))).toBe(true);
    expect(lineNeedsShipping(line("self_shipped"))).toBe(true);
    expect(lineNeedsShipping(line("pickup"))).toBe(false);
    expect(lineNeedsShipping(line("digital"))).toBe(false);
  });
});
