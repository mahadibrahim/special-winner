import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  payments,
  registrations,
  familyMembers,
  seasons,
  programs,
  users,
} from "@/lib/db/schema";
import { sendDisputeAlertEmail } from "@/lib/email/send";

export type ChargeDisputeEventType =
  | "charge.dispute.created"
  | "charge.dispute.funds_withdrawn"
  | "charge.dispute.closed";

/**
 * Handler for the three `charge.dispute.*` events Stripe emits over a
 * dispute's lifecycle. Records the dispute state on the matching
 * payment row and, on the initial `created` event only, emails the
 * founder so they can respond inside the evidence window via the Stripe
 * dashboard.
 *
 * Deliberately:
 *   - No customer-facing UI. The cardholder is already disputing in
 *     their bank's app; communicating from our side risks confusion.
 *   - No evidence-upload UI in admin. Stripe's dashboard does this
 *     better than anything we'd build for the launch cohort's volume.
 *   - Founder is the sole recipient. Email on `created` only —
 *     `funds_withdrawn` and `closed` are state transitions the founder
 *     can read from the Stripe dashboard once they're already there.
 *
 * Returns `{ status: "skipped", reason }` when the charge can't be
 * mapped to a payment row (e.g. drop-in or rental charge — out of
 * scope for the registration dispute alert), or `{ status: "processed",
 * paymentId, disputeId }` otherwise. Either way, never throws on the
 * happy path — the caller (handleStripeEvent) propagates throws as a
 * release-the-claim + 500 to Stripe so the webhook retries.
 */
export async function handleChargeDispute(
  dispute: Stripe.Dispute,
  eventType: ChargeDisputeEventType,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; paymentId: string; disputeId: string }
> {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) {
    return { status: "skipped", reason: "dispute has no charge id" };
  }

  const db = getDb();
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripeChargeId, chargeId))
    .limit(1);

  if (!payment) {
    return { status: "skipped", reason: `no payment for charge ${chargeId}` };
  }

  await db
    .update(payments)
    .set({
      stripeDisputeId: dispute.id,
      disputeStatus: dispute.status as any,
      disputeReasonCode: dispute.reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  // Alert on `created` only. funds_withdrawn / closed are follow-on
  // state transitions; spamming the founder for each one would train
  // them to ignore the alert.
  if (eventType === "charge.dispute.created" && payment.registrationId) {
    const [row] = await db
      .select({
        registrationId: registrations.id,
        playerFirst: familyMembers.firstName,
        playerLast: familyMembers.lastName,
        seasonName: seasons.name,
        programName: programs.name,
        parentEmail: users.email,
      })
      .from(registrations)
      .innerJoin(
        familyMembers,
        eq(registrations.familyMemberId, familyMembers.id),
      )
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(users, eq(registrations.registeredByUserId, users.id))
      .where(eq(registrations.id, payment.registrationId));

    if (row) {
      // Fire-and-forget — never block the webhook on email delivery,
      // and never throw out of the handler because of email failure.
      // The dispute state is already recorded; the alert is a nudge.
      sendDisputeAlertEmail({
        stripeDisputeId: dispute.id,
        registrationId: row.registrationId,
        playerName: `${row.playerFirst} ${row.playerLast}`,
        programName: row.programName,
        seasonName: row.seasonName,
        parentEmail: row.parentEmail,
        amountCents: dispute.amount,
        reasonCode: dispute.reason ?? "unknown",
        // Stripe sets evidence_details on every new dispute; defensive
        // optional-chain in case Stripe ever omits it.
        evidenceDueBy: (dispute as any).evidence_details?.due_by
          ? new Date((dispute as any).evidence_details.due_by * 1000)
          : null,
      }).catch((err) =>
        console.error("[stripe webhook] dispute alert email send failed:", err),
      );
    }
  }

  return { status: "processed", paymentId: payment.id, disputeId: dispute.id };
}
