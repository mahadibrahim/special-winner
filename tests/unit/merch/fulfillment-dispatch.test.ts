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
});
