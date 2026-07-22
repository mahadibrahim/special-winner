import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teamRegistrations, payments } from "@/lib/db/schema";
import { getPostHogServer } from "@/lib/posthog-server";
import { SERVER_EVENTS } from "@/lib/analytics/events";

/**
 * Handles `payment_intent.succeeded` for the captain's $200 team deposit
 * (metadata.kind === "team_deposit").
 *
 * The deposit PaymentIntent was created with `setup_future_usage:
 * "off_session"`, so by the time it succeeds Stripe has attached a reusable
 * payment method to the customer. We persist that payment method id +
 * customer-backed Stripe state onto the team_registrations row so the backstop
 * charge (Task 6) can charge the captain off-session if invitees don't pay
 * their shares by the deadline.
 *
 * NOTE — deposit is NOT recorded in the `payments` table. `payments.registrationId`
 * is nullable (onDelete: restrict), and a team deposit has no owning
 * registration row — it's a team-level reservation, not a per-player payment.
 * We therefore leave `team_registrations.depositPaymentId` NULL and record the
 * deposit minimally on the team row (Stripe PI id is recoverable from Stripe;
 * the backstop logic only needs customerId + paymentMethodId + backstopStatus).
 * If a money-trail row is later required, it needs either a nullable
 * `registrationId` on `payments` or a dedicated team-payments table.
 */
export async function handleTeamDepositSucceeded(
  paymentIntent: Stripe.PaymentIntent,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; teamRegistrationId: string }
> {
  const teamRegistrationId = paymentIntent.metadata?.team_registration_id;
  if (!teamRegistrationId) {
    return { status: "skipped", reason: "no team_registration_id in metadata" };
  }

  const db = getDb();

  const [team] = await db
    .select({
      id: teamRegistrations.id,
      seasonId: teamRegistrations.seasonId,
      backstopStatus: teamRegistrations.backstopStatus,
      captainUserId: teamRegistrations.captainUserId,
      depositPaymentId: teamRegistrations.depositPaymentId,
    })
    .from(teamRegistrations)
    .where(eq(teamRegistrations.id, teamRegistrationId));

  if (!team) {
    return {
      status: "skipped",
      reason: `team_registration ${teamRegistrationId} not found`,
    };
  }

  // Dedupe — a re-delivered event shouldn't repeat the ledger insert/analytics
  // fire below. This used to gate on `backstopStatus !== "none"`, but the
  // POST /api/public/team-registrations/[token]/confirm-deposit bridge (which
  // lets a captain's browser flip the credit-visible state the instant Stripe
  // confirms, without waiting on this webhook) now also moves backstopStatus
  // off "none" — using the exact same "pending" value this function writes.
  // If the bridge wins the race, backstopStatus alone can no longer tell us
  // whether THIS function's side effects (payments ledger row + PostHog
  // capture) already ran. `depositPaymentId` can: it is only ever set by the
  // ledger insert below, so it's the one field the bridge never touches.
  // Gating on it keeps both orderings — webhook-first or bridge-first —
  // converging on the same final row, with the ledger/analytics work done
  // exactly once by whichever of the two actually does it (this function).
  if (team.depositPaymentId != null) {
    return {
      status: "skipped",
      reason: `team_registration ${teamRegistrationId} already has depositPaymentId`,
    };
  }

  // setup_future_usage attaches a reusable payment method; resolve its id.
  const paymentMethodId =
    typeof paymentIntent.payment_method === "string"
      ? paymentIntent.payment_method
      : paymentIntent.payment_method?.id ?? null;

  await db
    .update(teamRegistrations)
    .set({
      captainPaymentMethodId: paymentMethodId,
      backstopStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(teamRegistrations.id, teamRegistrationId));

  // Fire-and-forget analytics — never block or fail the webhook on this.
  // captainUserId should always be set (the deposit requires an authed
  // captain), but skip the capture rather than send an anonymous event.
  if (team.captainUserId) {
    getPostHogServer().capture({
      distinctId: team.captainUserId,
      event: SERVER_EVENTS.teamDepositPaid,
      properties: {
        team_registration_id: team.id,
        season_id: team.seasonId,
        amount_cents: paymentIntent.amount,
      },
    });
  }

  // Record the $200 deposit in the payments ledger. Defensive: a failure here
  // must never break the (already-committed) card-saving + status update above,
  // so it's wrapped in try/catch and onConflictDoNothing guards webhook retries.
  // captainUserId should always be set (the deposit requires an authed captain),
  // but skip the ledger row if it's somehow null rather than insert a bad row.
  if (team.captainUserId) {
    try {
      const [paymentRow] = await db
        .insert(payments)
        .values({
          registrationId: null,
          teamRegistrationId: team.id,
          userId: team.captainUserId,
          amountCents: 20000,
          paymentType: "deposit",
          status: "succeeded",
          stripePaymentIntentId: paymentIntent.id,
        })
        .onConflictDoNothing({
          target: payments.stripePaymentIntentId,
          where: sql`stripe_payment_intent_id IS NOT NULL`,
        })
        .returning({ id: payments.id });

      if (paymentRow?.id) {
        await db
          .update(teamRegistrations)
          .set({ depositPaymentId: paymentRow.id, updatedAt: new Date() })
          .where(eq(teamRegistrations.id, teamRegistrationId));
      }
    } catch (ledgerErr) {
      console.error(
        `[handleTeamDepositSucceeded] failed to record deposit payment for team ${teamRegistrationId}:`,
        ledgerErr,
      );
    }
  }

  return { status: "processed", teamRegistrationId };
}
