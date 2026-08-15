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
import {
  sendMetaPurchaseEvent,
  sendMetaConversionEvent,
} from "@/lib/analytics/meta-capi";
import { shouldSendConversion } from "@/lib/analytics/conversion-exclusions";
import { collectAdAttribution } from "@/lib/analytics/parse-cookies";

export interface ServerPurchaseInput {
  /** The charge's Stripe metadata — source of the attribution ids. */
  metadata: Record<string, string | undefined | null> | null | undefined;
  /** Stripe PI id or Checkout Session id — dedup key shared with the browser pixel. */
  eventId: string;
  valueCents: number;
  brand: "aspire" | "soccerone";
  /** Customer email — hashed by the CAPI layer for match quality. */
  email?: string | null;
  /** Additional Meta match keys — hashed by the CAPI layer. */
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Our user id (Meta external_id) — hashed by the CAPI layer. */
  userId?: string | null;
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
  // Central gate: tester accounts and non-production environments never
  // produce ad conversions (GA4 or Meta). See conversion-exclusions.ts.
  if (!shouldSendConversion(input.email)) {
    console.log(
      `[server-conversions] skipped purchase ${input.eventId}: excluded (env or tester email)`,
    );
    return;
  }

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
    phone: input.phone ?? null,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    externalId: input.userId ?? null,
    contentIds: input.contentIds,
    contentName: input.contentName,
    contentCategory: input.contentCategory,
  }).catch((err) =>
    console.error("[server-conversions] Meta CAPI send failed:", err),
  );
}

export interface RegistrationCreatedConversionInput {
  /** The incoming request that created the registration — source of the ad
   *  attribution cookies (_fbc/_fbp/fbclid) and the referring page URL. */
  request: Request;
  /** Our registration id — the event_id, so retries/dupes collapse at Meta. */
  registrationId: string;
  brand: "aspire" | "soccerone";
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Our user id (Meta external_id). */
  userId?: string | null;
  seasonId?: string;
  seasonName?: string;
}

/**
 * Server-side Meta `CompleteRegistration` — fired once per *created*
 * registration row (callers must skip resumed drafts). Replaces the GTM
 * browser tag that fired on a junk trigger (~671/mo vs ~50 real
 * registrations); event_id = registration id keeps it idempotent even if an
 * endpoint double-fires. Fire-and-forget: never blocks or throws into the
 * creation flow.
 */
export function fireRegistrationCreatedConversion(
  input: RegistrationCreatedConversionInput,
): void {
  if (!shouldSendConversion(input.email)) {
    return;
  }
  let attribution: Record<string, string> = {};
  let referer: string | null = null;
  try {
    attribution = collectAdAttribution(
      new URL(input.request.url),
      input.request.headers.get("cookie"),
    );
    referer = input.request.headers.get("referer");
  } catch {
    // Malformed URL/headers — send with whatever we have.
  }
  sendMetaConversionEvent({
    eventName: "CompleteRegistration",
    eventId: input.registrationId,
    brand: input.brand,
    eventSourceUrl: referer,
    fbc: attribution._fbc ?? null,
    fbclid: attribution.fbclid ?? null,
    fbp: attribution._fbp ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    externalId: input.userId ?? null,
    contentIds: input.seasonId ? [input.seasonId] : undefined,
    contentName: input.seasonName,
    contentCategory: "registration",
  }).catch((err) =>
    console.error("[server-conversions] Meta CompleteRegistration failed:", err),
  );
}
