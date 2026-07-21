/**
 * Stripe webhook handler for drop-in walk-in PaymentIntent success.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "payment_intent.succeeded"` AND
 * `metadata.type === "dropin_walkin"`.
 *
 * Flips a pending walk-in booking to `confirmed`. Cancelled-guard protects
 * against late-arriving webhooks after a refund/cancel — and when the
 * cancelled booking's PaymentIntent actually CAPTURED funds (the customer
 * paid while/after the expiry sweep released the hold), the charge is
 * auto-refunded in full rather than silently kept (mirrors
 * handle-field-rental-checkout-complete.ts's late_refund branch).
 *
 * The booking row is created by POST /api/kiosk/[locationSlug]/walkin/start
 * in `pending_payment` status (2h hold; see that module's comment for the
 * full lifecycle); the PaymentIntent is attached by
 * POST /api/kiosk/[locationSlug]/walkin/payment. This handler completes
 * the flow once Stripe confirms the charge. `pending_claim` is also
 * accepted here for backward compatibility with pre-cutover stranded
 * walk-in holds (rows created before the pending_payment status existed) —
 * see the walk-in remote payment plan's amendment.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { dispatchBookingConfirmation } from "@/lib/dropin/messages/dispatch";
import { awaitDispatch } from "@/lib/notifications/await-dispatch";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";
import { stripe } from "@/lib/stripe/client";
import { logAlert } from "@/lib/logging/alerts";

export async function handleDropinWalkinPayment(
  paymentIntent: Stripe.PaymentIntent,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; bookingId: string; paidCents: number }
> {
  const bookingId = paymentIntent.metadata?.booking_id;
  if (!bookingId) {
    return { status: "skipped", reason: "missing booking_id metadata" };
  }
  const paidCents = paymentIntent.amount_received ?? paymentIntent.amount ?? 0;
  const db = getDb();

  // Captured inside the tx for the post-commit revenue event.
  let bookingUserId = "";
  let bookingBrand: "aspire" | "soccerone" = "aspire";
  let bookingSessionId = "";

  type HandlerResult =
    | { status: "skipped"; reason: string }
    | { status: "processed"; bookingId: string; paidCents: number };

  const classified: { kind: "done"; result: HandlerResult } | { kind: "late_refund" } =
    await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId))
      .for("update");
    if (!row) {
      return {
        kind: "done" as const,
        result: { status: "skipped" as const, reason: `booking ${bookingId} not found` },
      };
    }
    bookingUserId = row.userId;
    bookingBrand = normalizeBrand(row.brand);
    bookingSessionId = row.sessionId;
    if (row.status === "cancelled") {
      // Late webhook after the hold was cancelled (usually the expiry
      // sweep). If the intent actually CAPTURED funds and the booking has
      // no payment recorded, the customer paid for a slot they no longer
      // have — auto-refund after this tx commits (never inside it: a
      // Stripe call mid-transaction holds the row lock across a network
      // round-trip). `stripeRefundId` doubles as the durable "already
      // refunded" marker so webhook redeliveries beyond Stripe's 24h
      // idempotency-key window still can't refund twice.
      if (paidCents > 0 && row.amountPaidCents === 0 && !row.stripeRefundId) {
        return { kind: "late_refund" as const };
      }
      if (row.stripeRefundId) {
        return {
          kind: "done" as const,
          result: {
            status: "skipped" as const,
            reason: `booking ${bookingId} already cancelled — late payment already refunded (${row.stripeRefundId})`,
          },
        };
      }
      return {
        kind: "done" as const,
        result: {
          status: "skipped" as const,
          reason: `booking ${bookingId} already cancelled — late webhook`,
        },
      };
    }
    if (row.status === "confirmed") {
      return {
        kind: "done" as const,
        result: { status: "skipped" as const, reason: `booking ${bookingId} already confirmed` },
      };
    }
    if (row.status !== "pending_claim" && row.status !== "pending_payment") {
      return {
        kind: "done" as const,
        result: {
          status: "skipped" as const,
          reason: `booking ${bookingId} in unexpected status ${row.status}`,
        },
      };
    }

    await tx
      .update(dropInBookings)
      .set({
        status: "confirmed",
        amountPaidCents: paidCents,
        stripePaymentIntentId: paymentIntent.id,
        promotionExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(dropInBookings.id, bookingId));

    // Confirmation is dispatched after the tx commits (see below) — an
    // un-awaited send here is dropped when the serverless function freezes.

    return {
      kind: "done" as const,
      result: { status: "processed" as const, bookingId, paidCents },
    };
  });

  if (classified.kind === "late_refund") {
    return refundLatePaymentOnSweptHold(paymentIntent, bookingId, paidCents);
  }

  const result = classified.result;

  // Revenue analytics only — kiosk walk-in has no ad click, so it is not
  // reported to GA4 Ads / Meta as a conversion (PostHog reporting only).
  if (result.status === "processed") {
    // Confirmation email — awaited so the send completes before the function
    // freezes; logged-but-not-thrown on failure.
    await awaitDispatch(
      "dropin walk-in confirmation",
      () => dispatchBookingConfirmation(result.bookingId),
      { bookingId: result.bookingId },
    );

    capturePaymentCompleted({
      distinctId: bookingUserId,
      clientDistinctId: paymentIntent.metadata?.ph_distinct_id,
      kind: "dropin",
      amountCents: result.paidCents,
      brand: bookingBrand,
      metadata: {
        booking_id: result.bookingId,
        session_id: bookingSessionId,
        source: "walk_in",
      },
    });
  }

  return result;
}

/**
 * The hold was cancelled (expiry sweep) but the customer's PaymentIntent
 * captured anyway — the classic race: PayCard confirm in flight while the
 * cron sweeps the hold. Refund the full charge automatically and record it.
 *
 * Double-refund guards, layered:
 *   1. The caller only routes here when `stripeRefundId` is NULL on the
 *      booking (checked under a row lock) — a redelivered webhook after a
 *      successful refund short-circuits before reaching this function.
 *   2. `refunds.create` carries the idempotency key
 *      `${intent.id}:sweep-refund`, so two CONCURRENT deliveries that both
 *      pass check 1 get the same refund object back from Stripe instead of
 *      creating two refunds (and any refund covers >24h redeliveries via
 *      check 1 once the id is written below).
 */
async function refundLatePaymentOnSweptHold(
  paymentIntent: Stripe.PaymentIntent,
  bookingId: string,
  paidCents: number,
): Promise<{ status: "skipped"; reason: string }> {
  const db = getDb();

  if (!stripe) {
    // Charged, hold released, and we can't refund from here — staff must
    // refund manually in the Stripe dashboard.
    await logAlert("dropin_late_refund_failed", {
      bookingId,
      stripePaymentIntentId: paymentIntent.id,
      paidCents,
      error: "stripe-not-configured",
    });
    await db
      .update(dropInBookings)
      .set({ stripePaymentIntentId: paymentIntent.id, updatedAt: new Date() })
      .where(eq(dropInBookings.id, bookingId));
    return {
      status: "skipped",
      reason: `booking ${bookingId} cancelled before payment settled — refund FAILED (stripe not configured), manual refund required for ${paymentIntent.id}`,
    };
  }

  try {
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntent.id },
      { idempotencyKey: `${paymentIntent.id}:sweep-refund` },
    );
    await db
      .update(dropInBookings)
      .set({
        stripePaymentIntentId: paymentIntent.id,
        stripeRefundId: refund.id,
        updatedAt: new Date(),
      })
      .where(eq(dropInBookings.id, bookingId));
    // LOUD by design: money moved without a human in the loop. logAlert
    // emits the grep-able stderr line AND a PostHog server_exception event
    // (component alert/dropin_late_payment_refunded) for alerting.
    await logAlert("dropin_late_payment_refunded", {
      message: "late payment on swept hold — auto-refunded",
      bookingId,
      stripePaymentIntentId: paymentIntent.id,
      stripeRefundId: refund.id,
      paidCents,
    });
    return {
      status: "skipped",
      reason: `booking ${bookingId} cancelled before payment settled — late payment auto-refunded (${refund.id})`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Customer was CHARGED for a released slot and the refund threw —
    // record the PI on the row so staff can refund by hand, and alert.
    await logAlert("dropin_late_refund_failed", {
      bookingId,
      stripePaymentIntentId: paymentIntent.id,
      paidCents,
      error: message,
    });
    await db
      .update(dropInBookings)
      .set({ stripePaymentIntentId: paymentIntent.id, updatedAt: new Date() })
      .where(eq(dropInBookings.id, bookingId));
    return {
      status: "skipped",
      reason: `booking ${bookingId} cancelled before payment settled — refund FAILED, manual refund required for ${paymentIntent.id}`,
    };
  }
}
