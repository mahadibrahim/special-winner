/**
 * Server-side GA4 Measurement Protocol client.
 *
 * Fires `purchase` events to GA4 directly from the Stripe webhook,
 * recovering conversions lost to ad blockers / iOS Intelligent Tracking
 * Prevention. Uses the same transaction_id as the client-side dataLayer
 * fire so GA4 dedupes within the standard event window.
 *
 * Soft-fails on every error path — never blocks webhook ack.
 *
 * Spec: docs/superpowers/specs/2026-05-03-embedded-stripe-checkout-gtm-design.md §4.4
 */

export interface GA4PurchaseItem {
  /** Maps to GA4 item_id (typically the seasonId) */
  id: string;
  /** Maps to GA4 item_name */
  name: string;
  /** Maps to GA4 item_category */
  category: string;
  /** Unit price (full season price) */
  priceCents: number;
}

export interface SendPurchaseEventInput {
  /** GA4 client_id parsed from the _ga cookie */
  clientId: string;
  /** Stripe PaymentIntent ID — same value used client-side for dedupe */
  transactionId: string;
  /** Amount paid in this charge (deposit OR balance OR full) */
  valueCents: number;
  currency: "USD";
  items: GA4PurchaseItem[];
  paymentType: "deposit" | "balance" | "full";
  coupon?: string;
}

const ENDPOINT = "https://www.google-analytics.com/mp/collect";

export async function sendPurchaseEvent(
  input: SendPurchaseEventInput,
): Promise<void> {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;

  if (!measurementId || !apiSecret) {
    return;
  }

  const url = `${ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = {
    client_id: input.clientId,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: input.transactionId,
          value: input.valueCents / 100,
          currency: input.currency,
          payment_type: input.paymentType,
          ...(input.coupon ? { coupon: input.coupon } : {}),
          items: input.items.map((it) => ({
            item_id: it.id,
            item_name: it.name,
            item_category: it.category,
            price: it.priceCents / 100,
            quantity: 1,
          })),
        },
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(
        `[ga4-mp] non-2xx response: ${res.status} for transaction ${input.transactionId}`,
      );
    }
  } catch (err) {
    console.error("[ga4-mp] send failed:", err);
  }
}
