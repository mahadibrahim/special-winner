import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teamRegistrations } from "@/lib/db/schema";

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
 * is NOT NULL (onDelete: restrict), and a team deposit has no owning
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
    .select({ id: teamRegistrations.id, backstopStatus: teamRegistrations.backstopStatus })
    .from(teamRegistrations)
    .where(eq(teamRegistrations.id, teamRegistrationId));

  if (!team) {
    return {
      status: "skipped",
      reason: `team_registration ${teamRegistrationId} not found`,
    };
  }

  // Dedupe — a re-delivered event shouldn't reset state. Once we've recorded
  // the saved card and flipped to "pending", treat the event as processed.
  if (team.backstopStatus !== "none") {
    return {
      status: "skipped",
      reason: `team_registration ${teamRegistrationId} already past 'none' (${team.backstopStatus})`,
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

  return { status: "processed", teamRegistrationId };
}
