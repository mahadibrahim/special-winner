/**
 * One call to fire the server-side purchase conversions for a completed
 * payment: GA4 Measurement Protocol + Meta Conversions API. These are the
 * ad-blocker / iOS-ATP-resistant twins of the browser-side fires GTM emits
 * from the `purchase` dataLayer event, deduped against them by a shared
 * `eventId` (the Stripe PaymentIntent or Checkout Session id).
 *
 * Reads the ad-attribution identifiers (`ga_client_id`, `gclid`, `fbclid`,
 * `_fbc`, `_fbp`) straight out of the charge's Stripe metadata — the values
 * `collectAdAttribution()` stamped on at checkout creation.
 *
 * Fire-and-forget: both network calls are `.catch`-guarded and never awaited,
 * so this is safe to call from a webhook handler without blocking ack. It
 * must run AFTER the fulfillment DB transaction — building GA4 item context
 * needs a JOIN, and any query inside `db.transaction` deadlocks the max:1
 * pool.
 *
 * Online (ad-attributable) payment paths only. In-person walk-up / walk-in
 * sales are deliberately excluded — they have no ad click behind them, so
 * counting them as ad conversions would poison campaign optimization.
 */
import {
  sendPurchaseEvent,
  type GA4PurchaseItem,
} from "@/lib/analytics/ga4-measurement-protocol";
import { sendMetaPurchaseEvent } from "@/lib/analytics/meta-capi";

export interface ServerPurchaseInput {
  /** The charge's Stripe metadata — source of the attribution ids. */
  metadata: Record<string, string | undefined | null> | null | undefined;
  /** Stripe PI id or Checkout Session id — dedup key shared with the browser pixel. */
  eventId: string;
  valueCents: number;
  brand: "aspire" | "soccerone";
  /** Customer email — hashed by the CAPI layer for match quality. */
  email?: string | null;
  /** GA4 ecommerce item context. Omit (or empty) to skip the GA4 fire. */
  ga4Items?: GA4PurchaseItem[];
  ga4PaymentType?: "deposit" | "balance" | "full";
  ga4Coupon?: string;
  /** Meta content fields. */
  contentIds?: string[];
  contentName?: string;
  /** High-level grouping in Events Manager, e.g. "registration", "membership". */
  contentCategory?: string;
}

export function fireServerPurchaseConversions(input: ServerPurchaseInput): void {
  const md = input.metadata ?? {};
  const gaClientId = md.ga_client_id ?? undefined;

  if (gaClientId && input.ga4Items && input.ga4Items.length > 0) {
    sendPurchaseEvent({
      clientId: gaClientId,
      transactionId: input.eventId,
      valueCents: input.valueCents,
      currency: "USD",
      paymentType: input.ga4PaymentType ?? "full",
      coupon: input.ga4Coupon,
      items: input.ga4Items,
    }).catch((err) =>
      console.error("[server-conversions] GA4 MP send failed:", err),
    );
  }

  sendMetaPurchaseEvent({
    eventId: input.eventId,
    valueCents: input.valueCents,
    currency: "USD",
    brand: input.brand,
    fbc: md._fbc ?? null,
    fbclid: md.fbclid ?? null,
    fbp: md._fbp ?? null,
    email: input.email ?? null,
    contentIds: input.contentIds,
    contentName: input.contentName,
    contentCategory: input.contentCategory,
  }).catch((err) =>
    console.error("[server-conversions] Meta CAPI send failed:", err),
  );
}
