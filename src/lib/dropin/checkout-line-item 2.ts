import type Stripe from "stripe";
import { formatSessionTime } from "@/lib/dropin/messages/types";

export interface DropInLineItemInput {
  sportOrClassLabel: string;
  formatLabel?: string | null;
  startsAt: Date;
  venueName: string | null;
  timezone?: string | null;
}

/**
 * Build the Stripe Checkout line-item copy (name + description) for a
 * drop-in booking. This text appears on the Checkout page, the customer's
 * receipt, and the payment in the Stripe dashboard — so the description
 * must be human-readable, never a raw ISO timestamp.
 */
export function dropInLineItemCopy(input: DropInLineItemInput): {
  name: string;
  description: string;
} {
  const name = input.formatLabel
    ? `${input.sportOrClassLabel} · ${input.formatLabel} — Drop-in`
    : `${input.sportOrClassLabel} — Drop-in`;
  const when = formatSessionTime(input.startsAt, input.timezone);
  const where = input.venueName ?? "TBD venue";
  return { name, description: `${when} · ${where}` };
}

/**
 * One-line human-readable description for the drop-in PaymentIntent — what
 * shows in the Stripe dashboard's payment list and on a refund. Without it
 * Stripe falls back to the raw `pi_…` id, which is useless when deciding
 * whether to refund a payment.
 */
export function dropInPaymentDescription(input: DropInLineItemInput): string {
  const copy = dropInLineItemCopy(input);
  return `${copy.name} · ${copy.description}`;
}

/**
 * Assemble the Stripe Checkout line items for a drop-in booking: the
 * session at its base rate, plus a separate "Card processing fee" line
 * when a surcharge applies (mirrors the registration order summary, which
 * itemises the fee rather than burying it in the price).
 */
export function buildDropInCheckoutLineItems(
  input: DropInLineItemInput & {
    baseAmountCents: number;
    surchargeCents: number;
  },
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const copy = dropInLineItemCopy(input);
  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: "usd",
        product_data: { name: copy.name, description: copy.description },
        unit_amount: input.baseAmountCents,
      },
      quantity: 1,
    },
  ];
  if (input.surchargeCents > 0) {
    items.push({
      price_data: {
        currency: "usd",
        product_data: { name: "Card processing fee" },
        unit_amount: input.surchargeCents,
      },
      quantity: 1,
    });
  }
  return items;
}
