import type Stripe from "stripe";

/** Stripe product tax code for general tangible goods (not the account's
 * "General - Services" default) — classifies merch correctly for Stripe Tax. */
export const MERCH_TAX_CODE = "txcd_99999999";

/** Stripe product tax code for digital goods / software licenses. */
export const DIGITAL_TAX_CODE = "txcd_10501000";

export interface MerchLineInput {
  productName: string;
  variantLabel: string; // "Black · M" — for the Stripe line description
  unitPriceCents: number;
  quantity: number;
  taxCode?: string; // Optional Stripe tax code; defaults to MERCH_TAX_CODE
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
        tax_code: i.taxCode ?? MERCH_TAX_CODE,
      },
    },
  }));
}
