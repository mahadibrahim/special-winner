import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  payments,
  familyMembers,
  seasons,
  programs,
  locations,
  users,
} from "@/lib/db/schema";
import { sendRefundNotificationEmail } from "@/lib/email/send";

/**
 * Handler for `charge.refunded`. The webhook is the single source of truth
 * for refund state — it runs for refunds created from the admin UI AND for
 * refunds created directly in the Stripe dashboard, so both converge here.
 *
 * The admin UI sets registrations.refundStatus = "approved" when it creates
 * the Stripe refund; this handler flips it to "processed" on confirmation.
 * Dashboard-initiated refunds arrive with refundStatus still "none".
 */
export async function handleChargeRefunded(
  charge: Stripe.Charge,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; registrationId: string; refundedCents: number }
> {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!paymentIntentId) {
    return { status: "skipped", reason: "charge has no payment_intent" };
  }

  const db = getDb();

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntentId))
    .limit(1);

  if (!payment || !payment.registrationId) {
    // Not a registration charge (could be a drop-in/rental refund — out of
    // scope for the registration refund email).
    return { status: "skipped", reason: `no registration payment for ${paymentIntentId}` };
  }

  const [row] = await db
    .select({
      registration: registrations,
      familyMember: familyMembers,
      season: seasons,
      program: programs,
      location: locations,
      user: users,
    })
    .from(registrations)
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(users, eq(registrations.registeredByUserId, users.id))
    .where(eq(registrations.id, payment.registrationId));

  if (!row) {
    return { status: "skipped", reason: `registration ${payment.registrationId} not found` };
  }

  const refundedCents = charge.amount_refunded ?? 0;
  if (refundedCents <= 0) {
    return { status: "skipped", reason: "charge.amount_refunded is zero" };
  }

  // amount_refunded is the cumulative total refunded on the charge, so this
  // is correct even on a second partial-refund delivery.
  const originalPaid = charge.amount ?? row.registration.amountPaidCents ?? 0;
  const isFullRefund = refundedCents >= originalPaid;
  const newAmountPaid = Math.max(0, originalPaid - refundedCents);

  // Idempotency belt-and-braces: if already recorded as processed for this
  // amount, do nothing (the stripe_events ledger is the primary guard).
  if (
    row.registration.refundStatus === "processed" &&
    row.registration.refundAmountCents === refundedCents
  ) {
    return { status: "processed", registrationId: row.registration.id, refundedCents };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(registrations)
      .set({
        refundStatus: "processed",
        refundAmountCents: refundedCents,
        amountPaidCents: newAmountPaid,
        paymentStatus: isFullRefund ? "refunded" : "partial_refund",
        status: isFullRefund ? "refunded" : row.registration.status,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, row.registration.id));

    await tx
      .update(payments)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
  });

  sendRefundNotificationEmail({
    userId: row.user.id,
    organizationId: row.location.organizationId ?? undefined,
    registrationId: row.registration.id,
    parentEmail: row.user.email,
    parentName: row.user.firstName || row.user.email.split("@")[0],
    childName: `${row.familyMember.firstName} ${row.familyMember.lastName}`,
    programName: row.program.name,
    seasonName: row.season.name,
    refundAmountCents: refundedCents,
    refundStatus: "approved",
  }).catch((err) =>
    console.error("[stripe webhook] refund email send failed:", err),
  );

  return { status: "processed", registrationId: row.registration.id, refundedCents };
}
