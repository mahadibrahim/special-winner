import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teamRegistrations, payments, seasons } from "@/lib/db/schema";
import { getPostHogServer } from "@/lib/posthog-server";
import { SERVER_EVENTS } from "@/lib/analytics/events";
import { sendTeamDepositReceiptEmail } from "@/lib/email/send";
import type { BrandId } from "@/lib/branding/themes";
import { CAPTAIN_DEPOSIT_CENTS } from "@/lib/registrations/team-deposit";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";

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
 * The deposit IS recorded in the `payments` table (`paymentType: "deposit"`,
 * `registrationId` null — a team deposit is a team-level reservation, not a
 * per-player payment), and its id is written back to
 * `team_registrations.depositPaymentId`. Both, plus the status write, happen in
 * one transaction below (see the ledger insert + depositPaymentId backfill), so
 * `depositPaymentId` is the idempotency key: a non-null value means this deposit
 * already finalized and a retry short-circuits.
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
      captainEmail: teamRegistrations.captainEmail,
      captainName: teamRegistrations.captainName,
      teamName: teamRegistrations.teamName,
      inviteToken: teamRegistrations.inviteToken,
      teamFeeCents: teamRegistrations.teamFeeCents,
      depositCents: teamRegistrations.depositCents,
      paymentDeadline: teamRegistrations.paymentDeadline,
      brand: teamRegistrations.brand,
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

  // Single transaction for the status write + ledger insert + depositPaymentId
  // backfill. All three must land together: if depositPaymentId is left null
  // by a crash between the ledger insert and this update, the dedupe gate
  // above never closes and a redelivered webhook re-runs the ledger insert
  // (harmless — onConflictDoNothing guards it) AND re-fires the PostHog
  // capture (not harmless — see below). Wrapping them atomically means either
  // all three commit or none do, so a redelivery after a crash safely re-enters
  // this same transaction rather than resuming from a half-written state.
  //
  // backstopStatus is written advance-only, mirroring the bridge's guard in
  // confirm-deposit.ts: only "none" flips to "pending". Without this guard, a
  // webhook delivery delayed past a cron backstop charge would downgrade
  // "charged" back to "pending", and the next cron run would charge the
  // captain's card a second time.
  //
  // captainPaymentMethodId uses COALESCE for the same reason the bridge does:
  // don't clobber a value either side already wrote.
  const result = await db.transaction(async (tx) => {
    await tx
      .update(teamRegistrations)
      .set({
        ...(paymentMethodId
          ? {
              captainPaymentMethodId: sql`COALESCE(${teamRegistrations.captainPaymentMethodId}, ${paymentMethodId})`,
            }
          : {}),
        backstopStatus: sql`CASE WHEN ${teamRegistrations.backstopStatus} = 'none' THEN 'pending' ELSE ${teamRegistrations.backstopStatus} END`,
        updatedAt: new Date(),
      })
      .where(eq(teamRegistrations.id, teamRegistrationId));

    // Record the $200 deposit in the payments ledger. captainUserId should
    // always be set (the deposit requires an authed captain), but skip the
    // ledger row if it's somehow null rather than insert a bad row.
    if (team.captainUserId) {
      const [paymentRow] = await tx
        .insert(payments)
        .values({
          registrationId: null,
          teamRegistrationId: team.id,
          userId: team.captainUserId,
          amountCents: CAPTAIN_DEPOSIT_CENTS,
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
        await tx
          .update(teamRegistrations)
          .set({ depositPaymentId: paymentRow.id, updatedAt: new Date() })
          .where(eq(teamRegistrations.id, teamRegistrationId));
      }

      return { ledgerRowInserted: paymentRow?.id != null };
    }

    return { ledgerRowInserted: false };
  });

  // Fire-and-forget analytics — deliberately AFTER the transaction commits,
  // and only when this call is the one that actually inserted the ledger
  // row. That keeps the capture to at most once per successful terminal
  // transition: a crash before commit rolls back the whole transaction (so a
  // retry re-enters cleanly and fires again, correctly, since nothing
  // committed), and a crash after commit can never re-fire (depositPaymentId
  // is now set, so the dedupe gate above short-circuits future deliveries
  // before this code even runs).
  if (team.captainUserId && result.ledgerRowInserted) {
    const md = paymentIntent.metadata ?? {};
    getPostHogServer().capture({
      // Capture against the browser's PostHog id when the creating route
      // stored one, so the deposit joins the captain's anonymous funnel
      // (team_create_viewed → deposit) — mirrors payment-telemetry.ts.
      distinctId: md.ph_distinct_id || team.captainUserId,
      event: SERVER_EVENTS.teamDepositPaid,
      properties: {
        ...(md.ph_session_id ? { $session_id: md.ph_session_id } : {}),
        team_registration_id: team.id,
        season_id: team.seasonId,
        amount_cents: paymentIntent.amount,
        user_id: team.captainUserId,
      },
    });
    // Revenue signal — the $200 deposit is captured money and belongs in
    // payment_completed alongside registration/dropin revenue.
    capturePaymentCompleted({
      distinctId: team.captainUserId,
      clientDistinctId: md.ph_distinct_id,
      sessionId: md.ph_session_id,
      kind: "team_deposit",
      amountCents: paymentIntent.amount,
      brand: normalizeBrand(md.brand ?? team.brand),
      metadata: { team_registration_id: team.id, season_id: team.seasonId },
    });

    // Deposit receipt — the captain's durable copy of the join link + next
    // steps. Same exactly-once gate as the capture above (ledgerRowInserted).
    // The season-name lookup lives inside this try/catch too: a transient DB
    // blip here must never throw out of the handler — depositPaymentId is
    // already committed by this point, so a thrown error would 500 the
    // webhook, Stripe would retry, and the retry would short-circuit at the
    // dedupe gate above, permanently losing this email (the capture above has
    // already fired by then, so it's safe either way). Awaited so the
    // serverless function doesn't freeze mid-send; any failure here logs and
    // never fails the webhook.
    try {
      let seasonRow: { name: string } | undefined;
      try {
        [seasonRow] = await db
          .select({ name: seasons.name })
          .from(seasons)
          .where(eq(seasons.id, team.seasonId));
      } catch (err) {
        console.error("[team-deposit] season name lookup failed:", err);
      }
      await sendTeamDepositReceiptEmail({
        to: team.captainEmail,
        captainName: team.captainName,
        teamName: team.teamName,
        seasonName: seasonRow?.name ?? "your season",
        seasonId: team.seasonId,
        inviteToken: team.inviteToken,
        teamRegistrationId: team.id,
        teamFeeCents: team.teamFeeCents,
        depositCents: team.depositCents ?? CAPTAIN_DEPOSIT_CENTS,
        paymentDeadline: team.paymentDeadline,
        brand: (team.brand as BrandId | undefined) ?? undefined,
      });
    } catch (err) {
      console.error("[team-deposit] receipt email failed:", err);
    }
  }

  return { status: "processed", teamRegistrationId };
}
