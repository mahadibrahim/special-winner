/**
 * Payment telemetry — records a `payment_completed` business event in
 * PostHog when money is actually captured (registration paid, drop-in
 * booked, etc.). This is the revenue signal: PostHog's revenue analytics
 * and the founder's funnels read the `revenue` / `currency` properties.
 *
 * Fires alongside the existing GA4 purchase event and confirmation emails;
 * it does not replace them. Distinct from `stripe_webhook_outcome`
 * (delivery accounting) and `checkout_initiated` (intent, not completion).
 *
 * Like webhook-telemetry, this is fail-soft: a telemetry error must never
 * break payment fulfillment or bubble out of a webhook handler. Errors
 * importing or calling PostHog are swallowed — worst case is "no revenue
 * event for this payment," never "fulfillment 500s."
 *
 * Server-side capture keyed by the paying user's id, so the event attaches
 * to the same person the client-side identify resolves (see posthog.astro).
 */
import { getPostHogServer } from "@/lib/posthog-server";

export type PaymentKind =
  | "registration"
  | "dropin"
  | "field_rental"
  | "membership"
  | "team_deposit"
  /** One-off purchase of N floating class credits (class_pack_products). */
  | "class_pack"
  /** Prorated purchase of a fixed-term class block — credits PINNED to one
   *  weekly slot, plus the standing enrollment in it (class_blocks). */
  | "class_block";

export interface PaymentCompletedInput {
  /** Paying user's id — used as the PostHog distinct id. */
  distinctId: string;
  /**
   * The browser's PostHog distinct id, threaded through Stripe metadata as
   * `ph_distinct_id` by the checkout-creating route (collectAdAttribution).
   * When present, the event is captured against THIS id — the one the whole
   * anonymous pre-payment journey used — so funnels can join the paid step,
   * and the two identities are aliased into one person. Guests never call
   * identify (their account is created after payment), so without this the
   * paid step lands on a separate person and every funnel shows 0 paid.
   */
  clientDistinctId?: string | null;
  /**
   * The browser's PostHog session id, threaded through Stripe metadata as
   * `ph_session_id` by the checkout-creating route. Emitted as `$session_id`
   * so this webhook-fired event joins the same session as the client-side
   * funnel events — the piece that lets a session-aggregated funnel link
   * landing → payment.
   */
  sessionId?: string | null;
  kind: PaymentKind;
  amountCents: number;
  /** Host-derived brand attribution, matching the charge metadata. */
  brand: "aspire" | "soccerone";
  organizationId?: string;
  /** Extra grouping fields (registrationId, bookingId, seasonId, …). */
  metadata?: Record<string, unknown>;
}

export function capturePaymentCompleted(input: PaymentCompletedInput): void {
  try {
    const posthog = getPostHogServer();
    if (input.clientDistinctId && input.clientDistinctId !== input.distinctId) {
      // Merge the anonymous browser person into the user person so history
      // (the pre-payment funnel) and future server events unify.
      posthog.alias({
        distinctId: input.clientDistinctId,
        alias: input.distinctId,
      });
    }
    posthog.capture({
      distinctId: input.clientDistinctId || input.distinctId,
      event: "payment_completed",
      properties: {
        ...(input.sessionId ? { $session_id: input.sessionId } : {}),
        // PostHog revenue analytics reads `revenue` (major units) + `currency`.
        revenue: input.amountCents / 100,
        currency: "USD",
        amount_cents: input.amountCents,
        payment_kind: input.kind,
        brand: input.brand,
        // Always carry the DB user id, whichever distinct id the event
        // landed on — keeps revenue user-attributable post-alias.
        user_id: input.distinctId,
        organization_id: input.organizationId,
        ...input.metadata,
      },
    });
  } catch (err) {
    console.error("[payment-telemetry] capture failed", err);
  }
}
