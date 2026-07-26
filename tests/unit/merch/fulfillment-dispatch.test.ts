import { describe, it, expect } from "vitest";
import { orderFulfillmentPlan } from "@/lib/merch/fulfillment";

describe("orderFulfillmentPlan", () => {
  it("pickup when all items are pickup", () => {
    expect(orderFulfillmentPlan([{ fulfillmentType: "pickup" }, { fulfillmentType: "pickup" }])).toBe("pickup");
  });
  it("printful when any item ships", () => {
    expect(orderFulfillmentPlan([{ fulfillmentType: "pickup" }, { fulfillmentType: "printful_pod" }])).toBe("printful");
  });
  it("printful when items is empty", () => {
    expect(orderFulfillmentPlan([])).toBe("printful");
  });
  it("self_shipped when all items are self_shipped", () => {
    expect(orderFulfillmentPlan([{ fulfillmentType: "self_shipped" }])).toBe("self_shipped");
  });
  it("printful when self_shipped is mixed with printful_pod", () => {
    expect(
      orderFulfillmentPlan([{ fulfillmentType: "self_shipped" }, { fulfillmentType: "printful_pod" }]),
    ).toBe("printful");
  });
  it("lulu when all physical items are lulu_pod", () => {
    expect(orderFulfillmentPlan([{ fulfillmentType: "lulu_pod" }])).toBe("lulu");
    expect(orderFulfillmentPlan([{ fulfillmentType: "lulu_pod" }, { fulfillmentType: "digital" }])).toBe("lulu");
  });
  it("printful catch-all when lulu is (impossibly) mixed with another physical type", () => {
    expect(orderFulfillmentPlan([{ fulfillmentType: "lulu_pod" }, { fulfillmentType: "printful_pod" }])).toBe("printful");
  });
});
