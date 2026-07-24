import { describe, it, expect } from "vitest";
import { buildMerchLineItems, MERCH_TAX_CODE } from "@/lib/merch/checkout-line-items";

describe("buildMerchLineItems", () => {
  it("builds Stripe line items with the tangible-goods tax code", () => {
    const li = buildMerchLineItems(
      [{ productName: "Hoodie", variantLabel: "Black · M", unitPriceCents: 4650, quantity: 2 }],
      "usd",
    );
    expect(li).toHaveLength(1);
    expect(li[0].quantity).toBe(2);
    expect(li[0].price_data?.unit_amount).toBe(4650);
    expect(li[0].price_data?.currency).toBe("usd");
    expect(li[0].price_data?.product_data?.tax_code).toBe(MERCH_TAX_CODE);
    expect(MERCH_TAX_CODE).toBe("txcd_99999999");
  });
});
