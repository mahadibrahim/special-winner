/**
 * Stripe webhook handler for drop-in claim payments.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "payment_intent.succeeded"` AND
 * `metadata.type === "dropin_claim_payment"`.
 *
 * Where these payments come from: an overflow-refunded booking (the
 * transactional capacity gate waitlisted + refunded a customer whose
 * Checkout completed after the session filled — see
 * handle-dropin-checkout-complete.ts) is later PROMOTED off the waitlist.
 * Its original payment was refunded, so claiming the promoted spot
 * requires paying again — POST /api/dropin/claim/[token] refuses the
 * free-confirm for refunded rows and instead mints a Checkout Session
 * whose PaymentIntent carries this metadata type. This handler completes
 * that flow: it flips the still-`pending_claim` row to `confirmed` once
 * the new charge settles.
 *
 * Why NOT reuse handle-dropin-walkin-payment.ts (which also flips pending
 * rows to confirmed): its cancelled-guard decides "already refunded" from
 * `row.stripeRefundId` alone — and a claim-payment row ALREADY carries the
 * stripeRefundId of its original overflow refund. A late claim payment on
 * a swept row would be silently kept ("already refunded" refers to the
 * OLD charge, not this one). This handler keys its refund guards on the
 * INCOMING PaymentIntent id instead.
 *
 * Money guards, mirroring the repo's late-refund pattern:
 *   1. `refunds.create` carries idempotency key `${pi.id}:claim-late-refund`
 *      (Stripe-side dedupe for concurrent deliveries).
 *   2. The row's (stripePaymentIntentId === pi.id && stripeRefundId) pair is
 *      the durable "this charge was refunded" marker for post-window
 *      redeliveries.
 *   3. Stripe itself refuses a second full refund of the same PaymentIntent,
 *      so even a marker miss cannot double-refund — it just logs a failed
 *      attempt.
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

export async function handleDropInClaimPayment(
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

  const classified:
    | { kind: "done"; result: HandlerResult; alertUnexpectedStatus?: string }
    | { kind: "late_refund"; recordOnRow: boolean } = await db.transaction(
    async (tx) => {
    const [row] = await tx
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId))
      .for("update");
    if (!row) {
      return {
        kind: "done" as const,
        result: {
          status: "skipped" as const,
          reason: `booking ${bookingId} not found`,
        },
      };
    }
    bookingUserId = row.userId;
    bookingBrand = normalizeBrand(row.brand);
    bookingSessionId = row.sessionId;

    if (row.status === "confirmed") {
      if (row.stripePaymentIntentId === paymentIntent.id) {
        return {
          kind: "done" as const,
          result: {
            status: "skipped" as const,
            reason: `booking ${bookingId} already confirmed by this payment — redelivery`,
          },
        };
      }
      // Confirmed on the strength of a DIFFERENT payment (e.g. the customer
      // paid through two Checkout tabs whose amounts differed, defeating the
      // creation idempotency key). This charge bought nothing → refund it —
      // but do NOT record it on the row: the row's PI/refund columns
      // describe its LIVE payment, which is the other charge.
      return { kind: "late_refund" as const, recordOnRow: false };
    }

    if (row.status === "cancelled") {
      // The claim window expired and the sweep released the seat while the
      // payment was in flight. The customer paid for a seat they no longer
      // have — refund THIS charge (guards keyed on the incoming PI, see the
      // module doc; the row's existing stripeRefundId belongs to the
      // original overflow refund, not this payment).
      if (row.stripePaymentIntentId === paymentIntent.id && row.stripeRefundId) {
        return {
          kind: "done" as const,
          result: {
            status: "skipped" as const,
            reason: `booking ${bookingId} cancelled — late claim payment already refunded (${row.stripeRefundId})`,
          },
        };
      }
      return { kind: "late_refund" as const, recordOnRow: true };
    }

    if (row.status !== "pending_claim") {
      // Unreachable by design (claim checkouts are only minted from
      // pending_claim rows and the other terminal statuses are handled
      // above) — but money just landed on a row the flow can't account
      // for, so scream rather than only skip. Manual follow-up: refund the
      // PaymentIntent if the customer has no seat.
      return {
        kind: "done" as const,
        result: {
          status: "skipped" as const,
          reason: `booking ${bookingId} in unexpected status ${row.status}`,
        },
        alertUnexpectedStatus: row.status,
      };
    }

    // The happy path: the claim is still open and the payment settled —
    // confirm the seat. stripeRefundId is cleared: the refund it recorded
    // belongs to the ORIGINAL (pre-overflow) payment, which is fully
    // settled history; the row's live payment is this PaymentIntent, which
    // has not been refunded. Leaving the stale id would make every
    // "was this booking refunded?" reader lie about the live charge.
    await tx
      .update(dropInBookings)
      .set({
        status: "confirmed",
        amountPaidCents: paidCents,
        stripePaymentIntentId: paymentIntent.id,
        stripeRefundId: null,
        promotionExpiresAt: null,
        promotionToken: null,
        updatedAt: new Date(),
      })
      .where(eq(dropInBookings.id, bookingId));

    return {
      kind: "done" as const,
      result: { status: "processed" as const, bookingId, paidCents },
    };
  },
  );

  if (classified.kind === "late_refund") {
    return refundLateClaimPayment(
      paymentIntent,
      bookingId,
      paidCents,
      classified.recordOnRow,
    );
  }

  if (classified.alertUnexpectedStatus) {
    await logAlert("dropin_claim_unexpected_status", {
      bookingId,
      bookingStatus: classified.alertUnexpectedStatus,
      stripePaymentIntentId: paymentIntent.id,
      paidCents,
      error: `claim payment landed on a ${classified.alertUnexpectedStatus} booking`,
    });
  }

  const result = classified.result;

  if (result.status === "processed") {
    // Confirmation — awaited so the send completes before the function
    // freezes; logged-but-not-thrown on failure.
    await awaitDispatch(
      "dropin claim-payment confirmation",
      () => dispatchBookingConfirmation(result.bookingId, bookingBrand),
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
        source: "claim_payment",
      },
    });
  }

  return result;
}

/**
 * The claim payment settled but the seat is gone (sweep-cancelled claim) or
 * was already bought by a different payment. Refund the full charge.
 * Mirrors refundLatePaymentOnSweptHold in handle-dropin-walkin-payment.ts,
 * with claim-specific idempotency key and alert tags.
 *
 * `recordOnRow`: true for the cancelled-row case — the row's PI/refund
 * columns take this payment+refund pair as its most recent money event
 * (same convention as the walk-in late refund), which also arms the
 * durable redelivery marker. False for the confirmed-via-other-payment
 * case: the row's columns describe its LIVE charge and must not be
 * overwritten by the refunded duplicate (redeliveries there retry the
 * refund and are absorbed by Stripe's refusal to double-refund a fully
 * refunded PaymentIntent — alert noise at worst, never double money).
 *
 * Divergence from the walk-in mirror, deliberate: on a FAILED refund the
 * row is not touched at all (walk-in records the PI for staff). Keeping
 * the original PaymentIntent id on the row preserves the PI-based
 * redelivery dedupe for the booking's earlier events; the alert line
 * carries the PI staff need for a manual refund.
 */
async function refundLateClaimPayment(
  paymentIntent: Stripe.PaymentIntent,
  bookingId: string,
  paidCents: number,
  recordOnRow: boolean,
): Promise<{ status: "skipped"; reason: string }> {
  const db = getDb();

  if (!stripe) {
    await logAlert("dropin_claim_late_refund_failed", {
      bookingId,
      stripePaymentIntentId: paymentIntent.id,
      paidCents,
      error: "stripe-not-configured",
    });
    return {
      status: "skipped",
      reason: `booking ${bookingId} — claim payment settled for a lost seat, refund FAILED (stripe not configured), manual refund required for ${paymentIntent.id}`,
    };
  }

  try {
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntent.id },
      { idempotencyKey: `${paymentIntent.id}:claim-late-refund` },
    );
    if (recordOnRow) {
      // Record THIS payment + refund pair on the row — same convention as
      // the walk-in late-refund (the most recent money event wins the
      // columns; the original overflow refund is fully settled and remains
      // recorded in Stripe and in the dropin_overflow_refunded alert trail).
      await db
        .update(dropInBookings)
        .set({
          stripePaymentIntentId: paymentIntent.id,
          stripeRefundId: refund.id,
          updatedAt: new Date(),
        })
        .where(eq(dropInBookings.id, bookingId));
    }
    await logAlert("dropin_claim_late_payment_refunded", {
      message: "claim payment settled after the seat was lost — auto-refunded",
      bookingId,
      stripePaymentIntentId: paymentIntent.id,
      stripeRefundId: refund.id,
      paidCents,
    });
    return {
      status: "skipped",
      reason: `booking ${bookingId} — claim payment settled for a lost seat, auto-refunded (${refund.id})`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAlert("dropin_claim_late_refund_failed", {
      bookingId,
      stripePaymentIntentId: paymentIntent.id,
      paidCents,
      error: message,
    });
    return {
      status: "skipped",
      reason: `booking ${bookingId} — claim payment settled for a lost seat, refund FAILED, manual refund required for ${paymentIntent.id}`,
    };
  }
}
