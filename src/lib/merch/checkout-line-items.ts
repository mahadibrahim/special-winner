import type Stripe from "stripe";

/** Stripe product tax code for general tangible goods (not the account's
 * "General - Services" default) — classifies merch correctly for Stripe Tax. */
export const MERCH_TAX_CODE = "txcd_99999999";

export interface MerchLineInput {
  productName: string;
  variantLabel: string; // "Black · M" — for the Stripe line description
  unitPriceCents: number;
  quantity: number;
}

export function buildMerchLineItems(
  items: MerchLineInput[],
  currency: string,
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return items.map((i) => ({
    quantity: i.quantity,
    price_data: {
      currency,
      unit_amount: i.unitPriceCents,
      product_data: {
        name: i.variantLabel ? `${i.productName} (${i.variantLabel})` : i.productName,
        tax_code: MERCH_TAX_CODE,
      },
    },
  }));
}
