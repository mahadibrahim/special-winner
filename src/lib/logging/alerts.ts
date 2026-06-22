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
 */

export type AlertTag =
  | "dropin_refund_failed"
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
