/**
 * Deposit-refund executor for team registrations (winter-team-fixes, task 2).
 *
 * Two callers fire the same executor with different triggers:
 *   - "full_collection" — the share-payment handler, the moment the roster's
 *     payments cover the team fee in full. The captain's $200 deposit is no
 *     longer needed as a backstop, so it goes back in full.
 *   - "deadline_settle" — the payment-deadline cron, once past the deadline,
 *     with the computed shortfall (how much of the roster's shares are still
 *     unpaid). The deposit absorbs the shortfall; whatever's left over (if
 *     any) is refunded.
 *
 * Money guards, mirroring the repo's late-refund pattern (see
 * refundLateClaimPayment in handle-dropin-claim-payment.ts, which this is
 * modeled on):
 *   1. A conditional UPDATE (`WHERE deposit_refund_status = 'none'`) claims
 *      the row BEFORE any Stripe call — this is the atomic race guard for
 *      two triggers firing concurrently (e.g. the last share payment lands
 *      the same moment the deadline cron runs). Zero rows updated means
 *      another call already claimed it; this call backs off as "skipped".
 *   2. `stripe.refunds.create` carries an idempotency key derived from the
 *      deposit PaymentIntent id, so a retried delivery of the SAME claim
 *      cannot double-refund at Stripe's end either.
 *   3. On a Stripe failure (or Stripe not configured), the claimed status is
 *      reverted to 'none' in a catch, and `logAlert("team_deposit_refund_failed", …)`
 *      fires — so the NEXT trigger (a cron re-run, a redelivered webhook)
 *      retries automatically instead of the deposit silently never refunding.
 *
 * The "forfeited" outcome (shortfall >= depositCents) never calls Stripe at
 * all — no money moves — so there is nothing to revert; the claim UPDATE
 * doubles as the final write for that path.
 */
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { getDb } from "@/lib/db";
import { ageGroups, payments, seasons, teamRegistrations } from "@/lib/db/schema";
import { isYouthTeamSeason } from "@/lib/registrations/team-season-kind";
import { stripe } from "@/lib/stripe/client";
import { logAlert } from "@/lib/logging/alerts";
import { sendOpsPing } from "@/lib/ops/ping";
import { sendTeamDepositRefundedEmail } from "@/lib/email/send";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { getPostHogServer } from "@/lib/posthog-server";
import { SERVER_EVENTS } from "@/lib/analytics/events";
import type { BrandId } from "@/lib/branding/themes";

export interface MaybeRefundTeamDepositOpts {
  teamId: string;
  /** "full_collection" fires from the share-payment handler; "deadline_settle"
   *  from the cron with the computed shortfall. */
  trigger: "full_collection" | "deadline_settle";
  shortfallCents?: number; // required for deadline_settle
}

export interface MaybeRefundTeamDepositResult {
  status: "refunded" | "partial" | "forfeited" | "skipped";
  reason?: string;
}

/**
 * Decide and execute the deposit refund/forfeit for one team, idempotently.
 * Safe to call repeatedly (from redelivered webhooks or cron re-runs) — every
 * non-"none" `depositRefundStatus` short-circuits to "skipped".
 */
export async function maybeRefundTeamDeposit(
  db: ReturnType<typeof getDb>,
  opts: MaybeRefundTeamDepositOpts,
): Promise<MaybeRefundTeamDepositResult> {
  const { teamId, trigger } = opts;

  if (trigger === "deadline_settle" && opts.shortfallCents == null) {
    // Programmer error, not a runtime/data condition — the cron caller must
    // always compute and pass the shortfall for this trigger.
    throw new Error(
      "maybeRefundTeamDeposit: deadline_settle requires shortfallCents",
    );
  }

  const [row] = await db
    .select({
      team: teamRegistrations,
      seasonMinAge: seasons.minAge,
      ageGroupMinAge: ageGroups.minAge,
    })
    .from(teamRegistrations)
    .innerJoin(seasons, eq(teamRegistrations.seasonId, seasons.id))
    .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
    .where(eq(teamRegistrations.id, teamId))
    .limit(1);

  if (!row) {
    return { status: "skipped", reason: "team_not_found" };
  }

  const { team } = row;

  if (
    !isYouthTeamSeason({
      minAge: row.seasonMinAge,
      ageGroupMinAge: row.ageGroupMinAge,
    })
  ) {
    return { status: "skipped", reason: "adult_season" };
  }

  if (team.depositRefundStatus !== "none") {
    return { status: "skipped", reason: "already_settled" };
  }

  if (!team.depositPaymentIntentId) {
    return { status: "skipped", reason: "no_deposit_pi" };
  }

  const depositCents = team.depositCents ?? 0;

  // ── Compute the outcome up front — the claim UPDATE below writes this
  // final status directly (optimistic claim), reverting to 'none' only if a
  // subsequent Stripe call fails. ─────────────────────────────────────────
  let refundCents: number;
  let finalStatus: "refunded" | "partially_refunded" | "forfeited";

  if (trigger === "full_collection") {
    refundCents = depositCents;
    finalStatus = "refunded";
  } else {
    const shortfallCents = opts.shortfallCents as number;
    if (shortfallCents <= 0) {
      refundCents = depositCents;
      finalStatus = "refunded";
    } else if (shortfallCents < depositCents) {
      refundCents = depositCents - shortfallCents;
      finalStatus = "partially_refunded";
    } else {
      refundCents = 0;
      finalStatus = "forfeited";
    }
  }

  // ── Conditional claim — BEFORE any Stripe call. Zero rows means another
  // caller already won the race (or already settled between our SELECT and
  // here); back off rather than double-act. ──────────────────────────────
  const claimed = await db
    .update(teamRegistrations)
    .set({ depositRefundStatus: finalStatus, updatedAt: new Date() })
    .where(
      and(
        eq(teamRegistrations.id, team.id),
        eq(teamRegistrations.depositRefundStatus, "none"),
      ),
    )
    .returning({ id: teamRegistrations.id });

  if (claimed.length === 0) {
    return { status: "skipped", reason: "raced" };
  }

  if (finalStatus === "forfeited") {
    // No money moves — the deposit is kept outright. Stamp the resolution
    // columns now; there's no Stripe step to fail and revert from.
    await db
      .update(teamRegistrations)
      .set({
        depositRefundedCents: 0,
        depositRefundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(teamRegistrations.id, team.id));
    return { status: "forfeited" };
  }

  // ── Stripe refund path (refundCents > 0) ───────────────────────────────
  if (!stripe) {
    await revertClaim(db, team.id);
    await logAlert("team_deposit_refund_failed", {
      teamRegistrationId: team.id,
      stripePaymentIntentId: team.depositPaymentIntentId,
      refundCents,
      trigger,
      error: "stripe-not-configured",
    });
    return { status: "skipped", reason: "stripe_not_configured" };
  }

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: team.depositPaymentIntentId,
        amount: refundCents,
        metadata: {
          kind: "team_deposit_release",
          team_registration_id: team.id,
        },
      },
      { idempotencyKey: `${team.depositPaymentIntentId}:deposit-refund` },
    );
  } catch (err) {
    await revertClaim(db, team.id);
    const message = err instanceof Error ? err.message : String(err);
    await logAlert("team_deposit_refund_failed", {
      teamRegistrationId: team.id,
      stripePaymentIntentId: team.depositPaymentIntentId,
      refundCents,
      trigger,
      error: message,
    });
    return { status: "skipped", reason: "stripe_refund_failed" };
  }

  // ── Bookkeeping (Stripe already succeeded — these are best-effort but
  // logged, never re-thrown; the refund itself must not be lost/duplicated
  // over a downstream failure here). ─────────────────────────────────────
  try {
    await db.insert(payments).values({
      registrationId: null,
      teamRegistrationId: team.id,
      // The deposit ledger row used the same convention (userId = the
      // captain) — see finalizeTeamDeposit in finalize-team-deposit.ts.
      userId: team.captainUserId as string,
      amountCents: refundCents,
      paymentType: "refund",
      status: "succeeded",
      stripePaymentIntentId: null, // the refund has no PaymentIntent of its own
      refundReason: "team_deposit_release",
      metadata: { stripeRefundId: refund.id },
    });
  } catch (err) {
    console.error("[maybeRefundTeamDeposit] payments ledger insert failed:", err);
  }

  await db
    .update(teamRegistrations)
    .set({
      depositRefundId: refund.id,
      depositRefundedCents: refundCents,
      depositRefundedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(teamRegistrations.id, team.id));

  const brand = normalizeBrand(team.brand);
  const isPartial = finalStatus === "partially_refunded";

  await sendOpsPing(team.organizationId, {
    kind: "team_deposit_refunded",
    brand,
    // eventId keyed on the refund id (not team.id) — team.id is already the
    // dedupe key for the team_reserved ping fired at creation, and the
    // (kind, eventId) unique index is scoped per-kind, so this is only a
    // defensive distinction, not a requirement.
    eventId: refund.id,
    label: `${team.teamName} · deposit ${isPartial ? "partially refunded" : "refunded"}`,
    amountCents: refundCents,
  });

  try {
    await sendTeamDepositRefundedEmail({
      to: team.captainEmail,
      captainName: team.captainName,
      teamName: team.teamName,
      refundedCents: refundCents,
      shortfallCents: isPartial ? (opts.shortfallCents as number) : undefined,
      brand: (team.brand as BrandId | undefined) || undefined,
    });
  } catch (err) {
    console.error("[maybeRefundTeamDeposit] refund email failed:", err);
  }

  try {
    getPostHogServer().capture({
      distinctId: team.captainUserId ?? team.id,
      event: SERVER_EVENTS.teamDepositRefunded,
      properties: {
        team_registration_id: team.id,
        season_id: team.seasonId,
        amount_cents: refundCents,
        trigger,
        final_status: finalStatus,
      },
    });
  } catch (err) {
    console.error("[maybeRefundTeamDeposit] analytics failed:", err);
  }

  return isPartial ? { status: "partial" } : { status: "refunded" };
}

/**
 * Revert the optimistic claim back to 'none' after a failed (or unavailable)
 * Stripe refund, so the next trigger (cron re-run, redelivered webhook)
 * retries automatically instead of the deposit silently getting stuck
 * claimed-but-unrefunded forever.
 */
async function revertClaim(
  db: ReturnType<typeof getDb>,
  teamRegistrationId: string,
): Promise<void> {
  await db
    .update(teamRegistrations)
    .set({ depositRefundStatus: "none", updatedAt: new Date() })
    .where(eq(teamRegistrations.id, teamRegistrationId));
}
