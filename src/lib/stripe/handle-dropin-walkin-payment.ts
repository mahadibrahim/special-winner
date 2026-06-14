/**
 * Stripe webhook handler for drop-in walk-in PaymentIntent success.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "payment_intent.succeeded"` AND
 * `metadata.type === "dropin_walkin"`.
 *
 * Flips the pending_claim walk-in booking to `confirmed`. Cancelled-guard
 * protects against late-arriving webhooks after a refund/cancel.
 *
 * The booking row is created by POST /api/kiosk/[locationSlug]/walkin/start
 * in `pending_claim` status; the PaymentIntent is attached by
 * POST /api/kiosk/[locationSlug]/walkin/payment. This handler completes
 * the flow once Stripe confirms the charge.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { dispatchBookingConfirmation } from "@/lib/dropin/messages/dispatch";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";

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

  const result:
    | { status: "skipped"; reason: string }
    | { status: "processed"; bookingId: string; paidCents: number } =
    await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId))
      .for("update");
    if (!row) {
      return { status: "skipped", reason: `booking ${bookingId} not found` };
    }
    bookingUserId = row.userId;
    bookingBrand = normalizeBrand(row.brand);
    bookingSessionId = row.sessionId;
    if (row.status === "cancelled") {
      return {
        status: "skipped",
        reason: `booking ${bookingId} already cancelled — late webhook`,
      };
    }
    if (row.status === "confirmed") {
      return { status: "skipped", reason: `booking ${bookingId} already confirmed` };
    }
    if (row.status !== "pending_claim") {
      return {
        status: "skipped",
        reason: `booking ${bookingId} in unexpected status ${row.status}`,
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

    // Fire-and-forget booking confirmation (same renderer + channels as the
    // online and admin walk-up paths). Messaging failures must not roll back
    // the booking; dispatch logs its own errors.
    queueMicrotask(() => {
      void dispatchBookingConfirmation(bookingId).catch((err) => {
        console.error(
          "[dropin] walk-in booking-confirmation dispatch failed",
          err,
        );
      });
    });

    return { status: "processed", bookingId, paidCents };
  });

  // Revenue analytics only — kiosk walk-in has no ad click, so it is not
  // reported to GA4 Ads / Meta as a conversion (PostHog reporting only).
  if (result.status === "processed") {
    capturePaymentCompleted({
      distinctId: bookingUserId,
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
