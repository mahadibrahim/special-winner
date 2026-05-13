/**
 * Card-payment surcharge calculation.
 *
 * Customers can pay by bank (ACH, no surcharge) or card-family
 * (card / wallet / BNPL, surcharge applied). The rate matches Stripe's
 * standard card processing fee so we recover the merchant cost rather
 * than profit on the fee.
 *
 * Constants exported so the frontend can preview the surcharge in the
 * order summary while the backend is the source of truth on the
 * Checkout Session amount.
 */

export const CARD_SURCHARGE_RATE = 0.029; // 2.9%
export const CARD_SURCHARGE_FLAT_CENTS = 30; // $0.30

export type PaymentMethodCategory = "bank" | "card";

/** Surcharge in cents for a given base amount + chosen method category. */
export function computeSurchargeCents(
  baseAmountCents: number,
  category: PaymentMethodCategory,
): number {
  if (category === "bank") return 0;
  return Math.round(baseAmountCents * CARD_SURCHARGE_RATE) + CARD_SURCHARGE_FLAT_CENTS;
}
