import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  trackViewItem,
  trackBeginCheckout,
  trackAddPaymentInfo,
  trackPurchase,
  type SeasonItem,
} from "@/lib/analytics/datalayer";

const item: SeasonItem = {
  id: "season-uuid-1",
  name: "Summer Soccer - Worthington 2026",
  category: "Soccer",
  category2: "Worthington",
  priceCents: 25000,
};

describe("dataLayer trackers", () => {
  beforeEach(() => {
    (globalThis as any).window = { dataLayer: [] };
  });

  it("trackViewItem pushes ecommerce reset followed by view_item", () => {
    trackViewItem(item);
    const dl = (globalThis as any).window.dataLayer;
    expect(dl).toHaveLength(2);
    expect(dl[0]).toEqual({ ecommerce: null });
    expect(dl[1]).toMatchObject({
      event: "view_item",
      ecommerce: {
        currency: "USD",
        value: 250,
        items: [
          {
            item_id: "season-uuid-1",
            item_name: "Summer Soccer - Worthington 2026",
            item_category: "Soccer",
            item_category2: "Worthington",
            price: 250,
            quantity: 1,
          },
        ],
      },
    });
  });

  it("trackBeginCheckout pushes value at deposit/full amount, not unit price", () => {
    trackBeginCheckout(item, 7500, "EARLYBIRD");
    const dl = (globalThis as any).window.dataLayer;
    expect(dl[1]).toMatchObject({
      event: "begin_checkout",
      ecommerce: {
        currency: "USD",
        value: 75,
        coupon: "EARLYBIRD",
      },
    });
  });

  it("trackAddPaymentInfo includes payment_type", () => {
    trackAddPaymentInfo(item, 25000, "card");
    const dl = (globalThis as any).window.dataLayer;
    expect(dl[1]).toMatchObject({
      event: "add_payment_info",
      ecommerce: {
        currency: "USD",
        value: 250,
        payment_type: "card",
      },
    });
  });

  it("trackPurchase includes transaction_id + payment_type", () => {
    trackPurchase("pi_test_123", item, 7500, "deposit");
    const dl = (globalThis as any).window.dataLayer;
    expect(dl[1]).toMatchObject({
      event: "purchase",
      ecommerce: {
        transaction_id: "pi_test_123",
        currency: "USD",
        value: 75,
        payment_type: "deposit",
      },
    });
  });

  it("trackPurchase soft-fails when window.dataLayer is undefined", () => {
    delete (globalThis as any).window.dataLayer;
    expect(() => trackPurchase("pi_test_123", item, 7500, "deposit")).not.toThrow();
  });

  it("trackPurchase soft-fails when window itself is undefined", () => {
    delete (globalThis as any).window;
    expect(() => trackPurchase("pi_test_123", item, 7500, "deposit")).not.toThrow();
  });
});
