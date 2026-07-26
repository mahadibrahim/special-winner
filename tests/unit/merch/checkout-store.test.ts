import { describe, it, expect } from "vitest";
import { partitionByFulfillment, lineNeedsShipping, cartNeedsAddress, cartMixesLuluWithOtherPhysical } from "@/lib/merch/checkout-store";
import type { RepricedLine } from "@/lib/merch/reprice";

const line = (ft: RepricedLine["fulfillmentType"]): RepricedLine => ({
  variantId: "v", fulfillmentType: ft, printfulVariantId: null, printfulSyncVariantId: null,
  productName: "P", variantName: "V", size: null, color: null, unitPriceCents: 1000,
  personalizationConfig: null, quantity: 1,
  weightOz: null, lengthIn: null, widthIn: null, heightIn: null,
  luluPodPackageId: null, luluPageCount: null,
});

describe("checkout-store partition", () => {
  it("splits printful vs pickup", () => {
    const { printful, pickup } = partitionByFulfillment([line("printful_pod"), line("pickup")]);
    expect(printful).toHaveLength(1);
    expect(pickup).toHaveLength(1);
  });
  it("buckets self_shipped separately", () => {
    const { selfShipped, printful, pickup } = partitionByFulfillment([
      line("self_shipped"),
      line("printful_pod"),
      line("pickup"),
    ]);
    expect(selfShipped).toHaveLength(1);
    expect(selfShipped[0].fulfillmentType).toBe("self_shipped");
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

describe("cartNeedsAddress", () => {
  it("pure-digital cart never needs an address", () => {
    expect(cartNeedsAddress([line("digital"), line("digital")])).toBe(false);
  });
  it("digital + printful cart needs an address", () => {
    expect(cartNeedsAddress([line("digital"), line("printful_pod")])).toBe(true);
  });
  it("pure-pickup cart never needs an address", () => {
    expect(cartNeedsAddress([line("pickup"), line("pickup")])).toBe(false);
  });
  it("digital + pickup cart never needs an address", () => {
    expect(cartNeedsAddress([line("digital"), line("pickup")])).toBe(false);
  });
  it("self_shipped alone needs an address", () => {
    expect(cartNeedsAddress([line("self_shipped")])).toBe(true);
  });
  it("empty cart needs no address", () => {
    expect(cartNeedsAddress([])).toBe(false);
  });
});

describe("cartMixesLuluWithOtherPhysical", () => {
  it("false with no lulu lines", () => {
    expect(cartMixesLuluWithOtherPhysical([{ fulfillmentType: "printful_pod" }])).toBe(false);
  });
  it("false for lulu-only and lulu+digital carts", () => {
    expect(cartMixesLuluWithOtherPhysical([{ fulfillmentType: "lulu_pod" }])).toBe(false);
    expect(cartMixesLuluWithOtherPhysical([{ fulfillmentType: "lulu_pod" }, { fulfillmentType: "digital" }])).toBe(false);
  });
  it("true when lulu mixes with any other physical type", () => {
    for (const other of ["printful_pod", "self_shipped", "pickup"] as const) {
      expect(cartMixesLuluWithOtherPhysical([{ fulfillmentType: "lulu_pod" }, { fulfillmentType: other }])).toBe(true);
    }
  });
});

describe("lulu_pod plumbing", () => {
  it("lulu_pod needs shipping (address required)", () => {
    expect(lineNeedsShipping({ fulfillmentType: "lulu_pod" })).toBe(true);
  });
  it("partition exposes lulu lines", () => {
    const line = { fulfillmentType: "lulu_pod" } as any;
    expect(partitionByFulfillment([line]).lulu).toEqual([line]);
  });
});
