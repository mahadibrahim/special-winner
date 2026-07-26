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
});
