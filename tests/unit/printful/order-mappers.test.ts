import { describe, it, expect } from "vitest";
import {
  toPrintfulRecipient,
  pickCheapestRate,
  shippingRateToCents,
  buildPrintfulOrderItems,
  toPrintfulExternalId,
} from "@/lib/printful/order-mappers";

describe("toPrintfulExternalId", () => {
  it("strips hyphens from the order UUID (Printful rejects the 36-char hyphenated form)", () => {
    expect(toPrintfulExternalId("1499136e-0ae0-4e15-bbc5-3e8d743999a8")).toBe(
      "1499136e0ae04e15bbc53e8d743999a8",
    );
  });
  it("produces a 32-char id with no hyphens", () => {
    const out = toPrintfulExternalId("1499136e-0ae0-4e15-bbc5-3e8d743999a8");
    expect(out).toHaveLength(32);
    expect(out).not.toContain("-");
  });
});

describe("toPrintfulRecipient", () => {
  it("maps a merch shipping address to Printful's recipient shape", () => {
    expect(
      toPrintfulRecipient({
        name: "Sam Coach", address1: "1 Main St", address2: "Apt 2",
        city: "Powell", state: "OH", zip: "43065", country: "US",
      }),
    ).toEqual({
      name: "Sam Coach", address1: "1 Main St", address2: "Apt 2",
      city: "Powell", state_code: "OH", country_code: "US", zip: "43065",
    });
  });
});

describe("shippingRateToCents", () => {
  it("converts a decimal rate string to cents", () => {
    expect(shippingRateToCents("5.99")).toBe(599);
  });
});

describe("pickCheapestRate", () => {
  it("returns the lowest-rate option", () => {
    const rates = [
      { id: "EXPRESS", name: "Express", rate: "15.00", currency: "USD" },
      { id: "STANDARD", name: "Standard", rate: "5.99", currency: "USD" },
    ];
    expect(pickCheapestRate(rates)?.id).toBe("STANDARD");
  });
  it("returns null for no rates", () => {
    expect(pickCheapestRate([])).toBeNull();
  });
});

describe("buildPrintfulOrderItems", () => {
  it("maps order items to sync_variant_id + quantity", () => {
    expect(
      buildPrintfulOrderItems([
        { printfulSyncVariantId: "501", quantity: 2 },
        { printfulSyncVariantId: "502", quantity: 1 },
      ]),
    ).toEqual([
      { sync_variant_id: 501, quantity: 2 },
      { sync_variant_id: 502, quantity: 1 },
    ]);
  });
});
