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
 *   - `dropin_claim_unexpected_status` — A claim payment settled for a
 *                                      booking that is neither pending_claim
 *                                      nor confirmed nor cancelled (e.g.
 *                                      waitlisted/pending_payment/no_show).
 *                                      Unreachable by design — money landed
 *                                      on a row the flow can't account for.
 *                                      Investigate the booking and refund
 *                                      the `stripePaymentIntentId` manually
 *                                      if the customer has no seat.
 *   - `dropin_duplicate_refunded`    — A paid checkout completed for a user
 *                                      who ALREADY holds an active booking on
 *                                      the session (duplicate charge, e.g.
 *                                      two checkout tabs racing past the
 *                                      pre-mint 409). The duplicate charge
 *                                      was auto-refunded in full — no manual
 *                                      action needed, but money moved.
 *   - `dropin_duplicate_refund_failed` — Same duplicate-charge case, but the
 *                                      auto-refund threw (or Stripe wasn't
 *                                      configured). The customer was CHARGED
 *                                      twice and only seated once. Manual
 *                                      refund needed via the Stripe dashboard
 *                                      using the `stripePaymentIntentId` in
 *                                      the log line.
 *   - `rental_block_payment_refunded` - A rental block's deposit (or balance)
 *                                      settled for a block we could not
 *                                      honour: it lost one or more of its
 *                                      slots between the payment link going
 *                                      out and the money landing, or it had
 *                                      already been cancelled. The charge was
 *                                      auto-refunded in full and the block +
 *                                      every session cancelled - no manual
 *                                      action needed, but money moved and a
 *                                      human should call the renter back with
 *                                      replacement dates.
 *   - `rental_block_refund_failed`    - Same lost-block case, but the
 *                                      auto-refund threw (or Stripe wasn't
 *                                      configured). The renter was CHARGED for
 *                                      a block that does not exist. Manual
 *                                      refund needed via the Stripe dashboard
 *                                      using the `stripePaymentIntentId` in
 *                                      the log line.
 *   - `team_deposit_refund_failed`   — One tag, several distinct shapes
 *                                      (`maybeRefundTeamDeposit` in
 *                                      src/lib/payments/team-deposit-refund.ts).
 *                                      Read `context.error` /
 *                                      `context.revert_failed` /
 *                                      `context.adopted_untagged` to tell
 *                                      them apart:
 *
 *                                      Plain failure (Stripe refund call
 *                                      threw, or Stripe wasn't configured;
 *                                      no `revert_failed`/`adopted_untagged`
 *                                      marker) — the team row's
 *                                      `deposit_refund_status` was reverted
 *                                      to 'none', so the next trigger (a
 *                                      re-run of the cron, or a retried
 *                                      webhook) retries automatically.
 *                                      SELF-HEALS — no action needed for a
 *                                      one-off. If the SAME team recurs
 *                                      repeatedly, that's a signal the
 *                                      PaymentIntent may be genuinely
 *                                      unrefundable (already fully disputed,
 *                                      the charge is too old, etc.) — check
 *                                      the `stripePaymentIntentId` in the
 *                                      Stripe dashboard.
 *
 *                                      `revert_failed: true` — the refund
 *                                      call ALSO failed (or wasn't
 *                                      configured), and the follow-up
 *                                      revert-to-'none' UPDATE threw too.
 *                                      The row is now stuck in
 *                                      'processing'. It still SELF-RECOVERS
 *                                      once the row goes stale (10 minutes)
 *                                      — the next trigger reclaims it via
 *                                      the same atomic UPDATE as any fresh
 *                                      claim — but a human should manually
 *                                      verify at Stripe (using
 *                                      `stripePaymentIntentId`) that no
 *                                      refund actually went through during
 *                                      the failed attempt in the meantime.
 *
 *                                      `error: "finalize_lost_race_after_refund"`
 *                                      — THIS IS THE ONE THAT NEEDS A HUMAN,
 *                                      NOT SELF-HEALING: this call created
 *                                      or adopted a REAL Stripe refund
 *                                      (`stripeRefundId` in the log line)
 *                                      but lost the atomic finalize race
 *                                      before recording it — there is NO
 *                                      ledger row, NO captain email, and NO
 *                                      ops ping for this refund anywhere.
 *                                      Manually verify the refund at Stripe
 *                                      and, if the team row's
 *                                      `deposit_refund_status` genuinely
 *                                      never reflects it (check for a
 *                                      concurrent winner that already
 *                                      recorded the SAME refund id first —
 *                                      that's the benign, expected case),
 *                                      backfill the payments ledger row and
 *                                      notify the captain by hand.
 *
 *                                      `adopted_untagged: true` — RECONCILE
 *                                      found a refund on the deposit
 *                                      PaymentIntent with no
 *                                      `metadata.kind ===
 *                                      "team_deposit_release"` tag and
 *                                      adopted it anyway (a team deposit PI
 *                                      should never carry any OTHER kind of
 *                                      refund, but this could be a
 *                                      Stripe-Dashboard goodwill refund a
 *                                      human issued for an unrelated
 *                                      reason). VERIFY the adopted refund
 *                                      (`stripeRefundId`) was actually meant
 *                                      as the team deposit release — if it
 *                                      was a goodwill refund for something
 *                                      else, adopting it here FORECLOSES the
 *                                      real deposit refund: the row is now
 *                                      stamped settled for the DIFFERENCE
 *                                      (`refundCents` in the log line),
 *                                      which is not what should have
 *                                      happened, and the actual deposit
 *                                      refund the captain is owed must be
 *                                      issued manually.
 *
 *                                      `phase: "ledger_insert"` — the
 *                                      Stripe refund succeeded and the team
 *                                      row IS correctly finalized, but the
 *                                      `payments` ledger row failed to
 *                                      insert. Money and status are correct;
 *                                      only the ledger/reporting trail is
 *                                      missing a row — backfill it by hand
 *                                      using `refundCents`/`stripeRefundId`.
 */

export type AlertTag =
  | "dropin_refund_failed"
  | "dropin_late_payment_refunded"
  | "dropin_late_refund_failed"
  | "dropin_overflow_refunded"
  | "dropin_overflow_refund_failed"
  | "dropin_claim_late_payment_refunded"
  | "dropin_claim_late_refund_failed"
  | "dropin_claim_unexpected_status"
  | "dropin_duplicate_refunded"
  | "dropin_duplicate_refund_failed"
  | "rental_late_refund_failed"
  | "rental_block_payment_refunded"
  | "rental_block_refund_failed"
  | "team_deposit_refund_failed";

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
