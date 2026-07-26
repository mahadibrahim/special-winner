import { describe, it, expect } from "vitest";
import { assertSupportedFulfillment, UnsupportedFulfillmentError } from "@/lib/merch/fulfillment";

describe("assertSupportedFulfillment", () => {
  it("allows printful_pod", () => {
    expect(() => assertSupportedFulfillment(["printful_pod"])).not.toThrow();
  });
  it("allows pickup", () => {
    expect(() => assertSupportedFulfillment(["printful_pod", "pickup"])).not.toThrow();
  });
  it("throws on an unsupported fulfillment type", () => {
    expect(() => assertSupportedFulfillment(["printful_pod", "self_shipped"])).toThrow(UnsupportedFulfillmentError);
  });
});
