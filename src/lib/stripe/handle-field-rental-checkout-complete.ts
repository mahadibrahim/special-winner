/**
 * Stripe webhook handler for field-rental checkout completion.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "checkout.session.completed"` AND
 * `metadata.type === "field_rental"`.
 *
 * Normal path: flips the `pending_payment` hold row to `confirmed` and
 * records payment. Mirrors src/lib/stripe/handle-dropin-checkout-complete.ts.
 *
 * Late-payment path: if the hold's `payment_expires_at` lapsed before this
 * webhook arrived, the expire-pending sweep cancelled the row and released
 * the field — but Stripe still captured the customer's card. We auto-refund
 * outside the row-lock transaction so the customer isn't charged for a slot
 * they don't have.
 *
 * Idempotent on duplicate deliveries via the upstream `stripe_events` ledger
 * plus a status guard on the final UPDATE (concurrent deliveries serialize
 * on SELECT FOR UPDATE; the second sees `status != pending_payment` and bails).
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { stripe } from "@/lib/stripe/client";
import { logAlert } from "@/lib/logging/alerts";
import { syncRentalBlock } from "@/lib/scheduling/sync";
import { dispatchRentalConfirmation } from "@/lib/rentals/messages/dispatch";
import { awaitDispatch } from "@/lib/notifications/await-dispatch";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";
import { fireServerPurchaseConversions } from "@/lib/analytics/server-conversions";

export async function handleFieldRentalCheckoutComplete(
  session: Stripe.Checkout.Session,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; rentalId: string; paidCents: number }
> {
  const rentalId = session.metadata?.rental_id;
  if (!rentalId) {
    return { status: "skipped", reason: "missing rental_id metadata" };
  }

  const db = getDb();
  const paymentIntentId = (session.payment_intent as string) ?? null;
  const paidCents = session.amount_total ?? 0;

  // First pass: classify the row's current state under a row-lock. We
  // intentionally do NOT issue the Stripe refund here — refunds can take
  // seconds and we don't want to hold the lock for an external network call.
  const classified = await db.transaction(async (tx) => {
    const [rental] = await tx
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId))
      .for("update");
    if (!rental) {
      return {
        kind: "skip" as const,
        result: { status: "skipped" as const, reason: `rental ${rentalId} not found` },
      };
    }
    if (rental.status === "cancelled") {
      // Late webhook — the hold expired and the field has been released.
      // Refund happens after this tx commits (see below).
      return { kind: "late_refund" as const };
    }
    if (rental.status === "confirmed") {
      return {
        kind: "skip" as const,
        result: { status: "skipped" as const, reason: `rental ${rentalId} already confirmed` },
      };
    }
    if (rental.status !== "pending_payment") {
      return {
        kind: "skip" as const,
        result: {
          status: "skipped" as const,
          reason: `rental ${rentalId} in unexpected status ${rental.status}`,
        },
      };
    }
    return { kind: "confirm" as const };
  });

  if (classified.kind === "skip") {
    return classified.result;
  }

  if (classified.kind === "late_refund") {
    const piId = paymentIntentId;
    let refundId: string | null = null;
    let refundError: string | null = null;
    if (piId && stripe) {
      try {
        const refund = await stripe.refunds.create({ payment_intent: piId });
        refundId = refund.id;
      } catch (err) {
        refundError = err instanceof Error ? err.message : String(err);
        // The customer was CHARGED but the hold was already released — staff
        // must refund manually using the paymentIntentId in the log line.
        await logAlert("rental_late_refund_failed", {
          rentalId,
          stripePaymentIntentId: piId,
          paidCents,
          error: refundError,
        });
      }
    } else if (!stripe) {
      refundError = "stripe-not-configured";
    }
    if (refundId) {
      await db
        .update(fieldRentals)
        .set({
          stripePaymentIntentId: piId,
          stripeRefundId: refundId,
          paymentStatus: "refunded",
          updatedAt: new Date(),
        })
        .where(eq(fieldRentals.id, rentalId));
    } else {
      // Refund didn't succeed: at minimum record the PI so staff has the
      // ID needed to refund by hand. paymentStatus stays as-is so a follow-up
      // query for "paid + cancelled + no refund id" surfaces these rows.
      await db
        .update(fieldRentals)
        .set({
          stripePaymentIntentId: piId,
          paymentStatus: "paid",
          amountPaidCents: paidCents,
          updatedAt: new Date(),
        })
        .where(eq(fieldRentals.id, rentalId));
    }
    return {
      status: "skipped",
      reason: `rental ${rentalId} already cancelled — late webhook${
        refundId ? `; auto-refunded ${refundId}` : `; refund FAILED (${refundError ?? "unknown"})`
      }`,
    };
  }

  // Second pass: re-lock and confirm. The status guard protects against
  // the row being modified (e.g. an admin cancel) between the two passes.
  const result:
    | { status: "skipped"; reason: string }
    | { status: "processed"; rentalId: string; paidCents: number } =
    await db.transaction(async (tx) => {
    const [reLocked] = await tx
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId))
      .for("update");
    if (!reLocked || reLocked.status !== "pending_payment") {
      return {
        status: "skipped",
        reason: `rental ${rentalId} status changed during processing`,
      };
    }
    await tx
      .update(fieldRentals)
      .set({
        status: "confirmed",
        paymentStatus: "paid",
        amountPaidCents: paidCents,
        stripePaymentIntentId: paymentIntentId,
        paymentExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(fieldRentals.id, rentalId));
    return { status: "processed", rentalId, paidCents };
  });

  // Confirmed — refresh the ledger block AFTER the row-lock transaction
  // commits (the pg pool is max:1; opening the ledger's own transaction
  // inside this one deadlocks). Never fail the webhook over a ledger
  // conflict: the payment already happened, and a rare
  // hold-expired-then-resold race must surface on the admin calendar,
  // not poison Stripe deliveries.
  if (result.status === "processed") {
    try {
      await syncRentalBlock(result.rentalId);
    } catch (err) {
      console.error("[rentals] ledger sync after confirm failed", result.rentalId, err);
    }

    // Rental confirmation (email-preferred, SMS fallback). Awaited so the send
    // completes before the serverless function freezes; logged-but-not-thrown
    // on failure so it can't poison the webhook.
    await awaitDispatch(
      "rental checkout confirmation",
      () => dispatchRentalConfirmation(result.rentalId),
      { rentalId: result.rentalId },
    );

    // Revenue analytics (all rentals) + server-side ad conversions (online
    // path is ad-attributable). Brand/user/venue come from the checkout
    // metadata, so no extra query is needed here.
    const md = session.metadata ?? {};
    const brand = normalizeBrand(md.brand);
    const renterUserId = md.user_id;
    if (renterUserId) {
      capturePaymentCompleted({
        distinctId: renterUserId,
        kind: "field_rental",
        amountCents: paidCents,
        brand,
        organizationId: md.organization_id || undefined,
        metadata: {
          rental_id: result.rentalId,
          venue_name: md.venue_name,
          used_membership: Boolean(md.membership_id),
        },
      });
    }

    const hasAttribution = md.ga_client_id || md.fbclid || md._fbc || md._fbp;
    if (hasAttribution) {
      const itemName = md.venue_name
        ? `Field rental — ${md.venue_name}`
        : "Field rental";
      fireServerPurchaseConversions({
        metadata: md,
        eventId: paymentIntentId ?? session.id,
        valueCents: paidCents,
        brand,
        email: session.customer_details?.email ?? session.customer_email ?? null,
        ga4Items: [
          {
            id: result.rentalId,
            name: itemName,
            category: "Field Rental",
            priceCents: paidCents,
          },
        ],
        ga4PaymentType: "full",
        contentIds: [result.rentalId],
        contentName: itemName,
        contentCategory: "field_rental",
      });
    }
  }
  return result;
}
