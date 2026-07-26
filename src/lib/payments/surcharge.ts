/**
 * Card-payment surcharge calculation.
 *
 * The surcharge is the single source of truth for the card processing fee
 * passed through to customers. It feeds every paid flow — registration,
 * drop-in, kiosk walk-in, and self-serve pay links — via
 * `computeSurchargeCents`, and the frontend previews it in the order summary
 * while the backend stays authoritative on the charged amount.
 *
 * 2026-07-25: surcharge ZEROED — we are absorbing card processing fees this
 * round and revisiting pricing next round. Restore the rate + flat below to
 * re-enable pass-through; the display rows are all guarded on `> 0`, so they
 * reappear automatically.
 */

export const CARD_SURCHARGE_RATE = 0; // was 0.029 (2.9%)
export const CARD_SURCHARGE_FLAT_CENTS = 0; // was 30 ($0.30)

export type PaymentMethodCategory = "bank" | "card";

/** Surcharge in cents for a given base amount + chosen method category. */
export function computeSurchargeCents(
  baseAmountCents: number,
  category: PaymentMethodCategory,
): number {
  if (category === "bank") return 0;
  return Math.round(baseAmountCents * CARD_SURCHARGE_RATE) + CARD_SURCHARGE_FLAT_CENTS;
}
