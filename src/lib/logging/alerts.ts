/**
 * Structured operational-alert emitter.
 *
 * Use this for events the on-call human needs to see and act on — NOT for
 * routine debug logs. Each call emits ONE stringified JSON line to stderr,
 * grep-able by `tag`, so a future Sentry/PagerDuty hook can route these
 * without parsing free-form text.
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
 */

export type AlertTag =
  | "dropin_refund_failed"
  | "rental_late_refund_failed";

export type AlertContext = Record<string, unknown>;

export function logAlert(tag: AlertTag, context: AlertContext = {}): void {
  // Context first so a `tag` or `ts` value inside `context` cannot
  // override the canonical fields — JSON later-key-wins.
  console.error(
    JSON.stringify({
      ...context,
      tag,
      ts: new Date().toISOString(),
    }),
  );
}
