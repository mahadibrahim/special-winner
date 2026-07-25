import { describe, it, expect } from "vitest";
import { assertSupportedFulfillment, UnsupportedFulfillmentError } from "@/lib/merch/fulfillment";

describe("assertSupportedFulfillment", () => {
  it("allows printful_pod", () => {
    expect(() => assertSupportedFulfillment(["printful_pod"])).not.toThrow();
  });
  it("throws on a Phase-3 fulfillment type", () => {
    expect(() => assertSupportedFulfillment(["printful_pod", "pickup"])).toThrow(UnsupportedFulfillmentError);
  });
});
