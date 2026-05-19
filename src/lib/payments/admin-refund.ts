import { getDb } from "@/lib/db";
import {
  registrations,
  payments,
  organizations,
  users,
  type Registration,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { stripe, isStripeConfigured } from "@/lib/stripe/client";
import { sendRefundNotificationEmail } from "@/lib/email/send";

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
 * Issues a Stripe refund (Connect-aware) for a registration, updates the
 * registration + payment rows, and emails the customer.
 *
 * Used by both the customer-initiated refund queue
 * (POST /api/admin/refunds/[id], action="approve") and the admin-direct
 * refund endpoint (POST /api/admin/registrations/[id]/refund).
 *
 * `refundStatus` is set to "processed" — callers should not pre-set it.
 * Partial vs full is detected by comparing `refundAmountCents` to the row's
 * `amountPaidCents`.
 */
export async function adminRefund(input: AdminRefundInput): Promise<AdminRefundResult> {
  const {
    registration,
    refundAmountCents,
    reason,
    adminUserId,
    organizationId,
    childName,
    programName,
    seasonName,
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

  const isPartial = refundAmountCents > 0 && refundAmountCents < previousAmountPaid;
  const newAmountPaid = Math.max(0, previousAmountPaid - refundAmountCents);

  const [updated] = await getDb()
    .update(registrations)
    .set({
      refundStatus: "processed",
      status: isPartial ? registration.status : "refunded",
      amountPaidCents: newAmountPaid,
      paymentStatus: isPartial ? "partial_refund" : "refunded",
      refundAmountCents,
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, registration.id))
    .returning();

  if (payment) {
    await getDb()
      .update(payments)
      .set({
        status: "refunded",
        refundReason: reason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));
  }

  // Email the parent. Fail soft — never block the refund on email delivery.
  const [parentUser] = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, registration.registeredByUserId));

  if (parentUser) {
    sendRefundNotificationEmail({
      userId: parentUser.id,
      organizationId,
      registrationId: registration.id,
      parentEmail: parentUser.email,
      parentName: parentUser.firstName || parentUser.email.split("@")[0],
      childName,
      programName,
      seasonName,
      refundAmountCents,
      refundStatus: "approved",
    }).catch((err) => console.error("Error sending refund approval email:", err));
  }

  return {
    ok: true,
    registration: updated,
    stripeRefundId,
    isPartial,
  };
}
