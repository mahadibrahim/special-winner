import { getDb } from "@/lib/db";
import {
  registrations,
  payments,
  organizations,
  type Registration,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";

export type AdminRefundResult =
  | {
      ok: true;
      registration: Registration;
      stripeRefundId: string | null;
      isPartial: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
      details?: string;
    };

export interface AdminRefundInput {
  registration: Registration;
  refundAmountCents: number;
  reason?: string;
  adminUserId: string;
  organizationId: string;
  /** Display strings used for the customer email. */
  childName: string;
  programName: string;
  seasonName: string;
}

/**
 * Issues a Stripe refund (Connect-aware) for a registration and marks the
 * registration as in-flight (`refundStatus: "approved"`).
 *
 * The `charge.refunded` webhook is the single writer of refund tracking
 * (DB updates for paymentStatus / status / refundAmountCents) and the
 * customer email. This action only: validates, creates the Stripe refund,
 * and marks the registration in-flight.
 *
 * Used by both the customer-initiated refund queue
 * (POST /api/admin/refunds/[id], action="approve") and the admin-direct
 * refund endpoint (POST /api/admin/registrations/[id]/refund).
 */
export async function adminRefund(input: AdminRefundInput): Promise<AdminRefundResult> {
  const {
    registration,
    refundAmountCents,
    adminUserId,
    organizationId,
  } = input;

  if (refundAmountCents < 0) {
    return { ok: false, status: 400, error: "refundAmountCents must be non-negative" };
  }

  const previousAmountPaid = registration.amountPaidCents ?? 0;
  if (refundAmountCents > previousAmountPaid) {
    return {
      ok: false,
      status: 400,
      error: `Refund ${refundAmountCents}¢ exceeds paid ${previousAmountPaid}¢`,
    };
  }

  // Look up payment record for the Stripe payment intent.
  const [payment] = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.registrationId, registration.id));

  const stripePaymentIntentId = payment?.stripePaymentIntentId ?? null;

  // Call Stripe only when there's something to refund and a payment intent to refund against.
  let stripeRefundId: string | null = null;

  if (refundAmountCents > 0 && stripePaymentIntentId) {
    if (!isStripeConfigured() || !stripe) {
      return { ok: false, status: 503, error: "Stripe not configured for refunds" };
    }

    const [org] = await getDb()
      .select({
        stripeAccountId: organizations.stripeAccountId,
        stripeOnboardingComplete: organizations.stripeOnboardingComplete,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const useConnect = !!org?.stripeAccountId && org.stripeOnboardingComplete === true;

    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: stripePaymentIntentId,
      amount: refundAmountCents,
      reason: "requested_by_customer",
      metadata: {
        registrationId: registration.id,
        approvedBy: adminUserId,
      },
    };

    if (useConnect) {
      refundParams.reverse_transfer = true;
      refundParams.refund_application_fee = true;
    }

    const requestOptions: Stripe.RequestOptions = {
      // Stable idempotency key — see src/lib/stripe/client.ts top.
      idempotencyKey: `${registration.id}:refund:${refundAmountCents}`,
    };
    if (useConnect && org?.stripeAccountId) {
      requestOptions.stripeAccount = org.stripeAccountId;
    }

    try {
      const refund = await stripe.refunds.create(refundParams, requestOptions);
      stripeRefundId = refund.id;
    } catch (stripeError) {
      console.error("Stripe refund error:", stripeError);
      return {
        ok: false,
        status: 500,
        error: "Failed to process Stripe refund",
        details: stripeError instanceof Error ? stripeError.message : "Unknown error",
      };
    }
  }

  // No Stripe refund was created (zero amount, or no payment intent on
  // record) — there will be no webhook. Finalize synchronously.
  if (!stripeRefundId) {
    const [updated] = await getDb()
      .update(registrations)
      .set({
        refundStatus: "processed",
        status: "refunded",
        paymentStatus: "refunded",
        refundAmountCents,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registration.id))
      .returning();
    return { ok: true, registration: updated, stripeRefundId: null, isPartial: false };
  }

  // The charge.refunded webhook is the single writer of refund tracking and
  // the customer email. Here we only mark the refund in-flight so the admin
  // UI can show a "processing" state until Stripe confirms.
  const [updated] = await getDb()
    .update(registrations)
    .set({
      refundStatus: "approved",
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, registration.id))
    .returning();

  const isPartial = refundAmountCents > 0 && refundAmountCents < previousAmountPaid;

  return {
    ok: true,
    registration: updated,
    stripeRefundId,
    isPartial,
  };
}
