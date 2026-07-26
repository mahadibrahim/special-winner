import { describe, it, expect } from "vitest";
import { orderHasDigital, orderIsAllDigital, orderFulfillmentPlan } from "@/lib/merch/fulfillment";
import { buildDigitalDeliveryHtml } from "@/lib/merch/order-confirmation-email";

describe("orderHasDigital", () => {
  it("is false for an empty order", () => {
    expect(orderHasDigital([])).toBe(false);
  });
  it("is true when every item is digital", () => {
    expect(orderHasDigital([{ fulfillmentType: "digital" }, { fulfillmentType: "digital" }])).toBe(true);
  });
  it("is true for a mixed digital + physical order", () => {
    expect(orderHasDigital([{ fulfillmentType: "digital" }, { fulfillmentType: "printful_pod" }])).toBe(true);
  });
  it("is false when no item is digital", () => {
    expect(orderHasDigital([{ fulfillmentType: "printful_pod" }, { fulfillmentType: "pickup" }])).toBe(false);
  });
});

describe("orderIsAllDigital", () => {
  it("is false for an empty order", () => {
    expect(orderIsAllDigital([])).toBe(false);
  });
  it("is true when every item is digital", () => {
    expect(orderIsAllDigital([{ fulfillmentType: "digital" }, { fulfillmentType: "digital" }])).toBe(true);
  });
  it("is false for a mixed digital + physical order", () => {
    expect(orderIsAllDigital([{ fulfillmentType: "digital" }, { fulfillmentType: "printful_pod" }])).toBe(false);
  });
  it("is false when no item is digital", () => {
    expect(orderIsAllDigital([{ fulfillmentType: "printful_pod" }])).toBe(false);
  });
});

describe("orderFulfillmentPlan — digital lines are orthogonal to the physical plan", () => {
  it("resolves a mixed digital + pickup order to pickup (not the printful fallback)", () => {
    expect(
      orderFulfillmentPlan([{ fulfillmentType: "digital" }, { fulfillmentType: "pickup" }]),
    ).toBe("pickup");
  });

  it("resolves a mixed digital + self_shipped order to self_shipped", () => {
    expect(
      orderFulfillmentPlan([{ fulfillmentType: "self_shipped" }, { fulfillmentType: "digital" }]),
    ).toBe("self_shipped");
  });

  it("still resolves a mixed digital + printful order to printful", () => {
    expect(
      orderFulfillmentPlan([{ fulfillmentType: "digital" }, { fulfillmentType: "printful_pod" }]),
    ).toBe("printful");
  });

  it("leaves a pure-physical order's plan unchanged (no digital present)", () => {
    expect(orderFulfillmentPlan([{ fulfillmentType: "pickup" }, { fulfillmentType: "pickup" }])).toBe("pickup");
    expect(orderFulfillmentPlan([{ fulfillmentType: "pickup" }, { fulfillmentType: "self_shipped" }])).toBe("printful");
  });
});

describe("buildDigitalDeliveryHtml", () => {
  it("renders a download link per item", () => {
    const html = buildDigitalDeliveryHtml({
      items: [
        { name: "Training Plan PDF", url: "https://example.com/shop/download/abc123" },
        { name: "Coach Playbook", url: "https://example.com/shop/download/def456" },
      ],
    });
    expect(html).toContain(`<a href="https://example.com/shop/download/abc123">`);
    expect(html).toContain(`<a href="https://example.com/shop/download/def456">`);
    expect(html).toContain("Training Plan PDF");
    expect(html).toContain("Coach Playbook");
  });

  it("mentions the 6-month validity window", () => {
    const html = buildDigitalDeliveryHtml({ items: [{ name: "Guide", url: "https://example.com/x" }] });
    expect(html).toContain("6 months");
  });
});
