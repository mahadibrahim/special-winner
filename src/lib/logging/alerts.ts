/**
 * Structured operational-alert emitter.
 *
 * Use this for events the on-call human needs to see and act on — NOT for
 * routine debug logs. Each call emits ONE stringified JSON line to stderr,
 * grep-able by `tag`, AND captures a PostHog `server_exception` event
 * (component `alert/<tag>`) so the alert is queryable and can drive alert
 * rules instead of dying in a log file nobody watches.
 *
 * Adding a new alert:
 *   1. Add a `<scope>_<event>` literal to the `AlertTag` union below
 *   2. Document what the tag means and the manual action staff should take
 *   3. Call `logAlert("your_tag", { ...context })` at the failure site
 *
 * Current tags:
 *   - `dropin_refund_failed`         — Stripe refund call threw during a
 *                                      drop-in cancellation. The booking is
 *                                      still cancelled (customer-UI
 *                                      consistency) but the money was NOT
 *                                      returned. Manual refund needed via the
 *                                      Stripe dashboard using the
 *                                      `stripePaymentIntentId` in the log line.
 *   - `rental_late_refund_failed`    — A Stripe Checkout completed AFTER the
 *                                      rental hold's `payment_expires_at`
 *                                      lapsed (cron cancelled the row first).
 *                                      We tried to auto-refund and it threw.
 *                                      The customer was CHARGED for a slot
 *                                      they don't have. Manual refund needed.
 *   - `dropin_late_payment_refunded` — A walk-in payment settled AFTER the
 *                                      expiry sweep cancelled the hold
 *                                      (customer paid mid-sweep). The charge
 *                                      was auto-refunded in full — no manual
 *                                      action needed, but the on-call human
 *                                      should know money moved: the customer
 *                                      paid for a slot they no longer have.
 *   - `dropin_late_refund_failed`    — Same late-payment-on-swept-hold case,
 *                                      but the auto-refund threw (or Stripe
 *                                      wasn't configured). The customer was
 *                                      CHARGED for a released slot. Manual
 *                                      refund needed via the Stripe dashboard
 *                                      using the `stripePaymentIntentId` in
 *                                      the log line.
 *   - `dropin_overflow_refunded`     — The transactional capacity gate caught
 *                                      the last-spot race: a Checkout
 *                                      completed for a session that filled up
 *                                      elsewhere while payment was in flight.
 *                                      The booking was waitlisted front-of-
 *                                      line (priority 100) and the charge was
 *                                      auto-refunded in full — no manual
 *                                      action needed, but the on-call human
 *                                      should know money moved.
 *   - `dropin_overflow_refund_failed` — Same overflow case, but the auto-
 *                                      refund threw (or Stripe wasn't
 *                                      configured). The customer was CHARGED
 *                                      and is waitlisted, not confirmed, and
 *                                      NOT yet refunded. Manual refund needed
 *                                      via the Stripe dashboard using the
 *                                      `stripePaymentIntentId` in the log
 *                                      line — a webhook redelivery will also
 *                                      retry automatically (see
 *                                      handle-dropin-checkout-complete.ts).
 *                                      NOTE: a manual dashboard refund does
 *                                      NOT stamp the row's stripe_refund_id,
 *                                      and un-stamped overflow rows are
 *                                      deliberately excluded from waitlist
 *                                      promotion — after refunding manually,
 *                                      also set the row's stripe_refund_id to
 *                                      the refund id so the customer becomes
 *                                      promotable again.
 *   - `dropin_claim_late_payment_refunded` — A claim payment (paying to
 *                                      confirm a promoted overflow booking —
 *                                      see handle-dropin-claim-payment.ts)
 *                                      settled after the claim was swept, or
 *                                      the seat was already bought by a
 *                                      different payment. The charge was
 *                                      auto-refunded in full — no manual
 *                                      action needed, but money moved.
 *   - `dropin_claim_late_refund_failed` — Same claim-payment case, but the
 *                                      auto-refund threw (or Stripe wasn't
 *                                      configured). The customer was CHARGED
 *                                      for a seat they don't have. Manual
 *                                      refund needed via the Stripe dashboard
 *                                      using the `stripePaymentIntentId` in
 *                                      the log line.
 */

export type AlertTag =
  | "dropin_refund_failed"
  | "dropin_late_payment_refunded"
  | "dropin_late_refund_failed"
  | "dropin_overflow_refunded"
  | "dropin_overflow_refund_failed"
  | "dropin_claim_late_payment_refunded"
  | "dropin_claim_late_refund_failed"
  | "rental_late_refund_failed";

export type AlertContext = Record<string, unknown>;

import { captureServerException } from "@/lib/observability/server-error";

export async function logAlert(
  tag: AlertTag,
  context: AlertContext = {},
): Promise<void> {
  // Context first so a `tag` or `ts` value inside `context` cannot
  // override the canonical fields — JSON later-key-wins.
  console.error(
    JSON.stringify({
      ...context,
      tag,
      ts: new Date().toISOString(),
    }),
  );

  // Also route to PostHog so the alert is an actual queryable event, not just
  // a stderr line. captureServerException is fail-soft (never throws), so a
  // telemetry blip can't break the cancel/refund path that emitted the alert.
  const errVal = context.error;
  const error =
    errVal instanceof Error ? errVal : new Error(String(errVal ?? tag));
  await captureServerException(error, {
    component: `alert/${tag}`,
    metadata: { ...context, alert_tag: tag },
  });
}
