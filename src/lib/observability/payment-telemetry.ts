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

export type PaymentKind = "registration" | "dropin" | "field_rental" | "membership";

export interface PaymentCompletedInput {
  /** Paying user's id — used as the PostHog distinct id. */
  distinctId: string;
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
    posthog.capture({
      distinctId: input.distinctId,
      event: "payment_completed",
      properties: {
        // PostHog revenue analytics reads `revenue` (major units) + `currency`.
        revenue: input.amountCents / 100,
        currency: "USD",
        amount_cents: input.amountCents,
        payment_kind: input.kind,
        brand: input.brand,
        organization_id: input.organizationId,
        ...input.metadata,
      },
    });
  } catch (err) {
    console.error("[payment-telemetry] capture failed", err);
  }
}
