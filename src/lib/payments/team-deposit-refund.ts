/**
 * Deposit-refund executor for team registrations (winter-team-fixes, task 2;
 * hardened in review-fix round 1 against a claim-then-crash money-loss
 * window — see the state-machine walkthrough below).
 *
 * Two callers fire the same executor with different triggers:
 *   - "full_collection" — the share-payment handler, the moment the roster's
 *     payments cover the team fee in full. The captain's $200 deposit is no
 *     longer needed as a backstop, so it goes back in full.
 *   - "deadline_settle" — the payment-deadline cron, once past the deadline,
 *     with the computed shortfall (how much of the roster's shares are still
 *     unpaid). The deposit absorbs the shortfall; whatever's left over (if
 *     any) is refunded; if the shortfall consumes the whole deposit, it's
 *     forfeited outright.
 *
 * STATE MACHINE (`depositRefundStatus` is a plain varchar — no DB enum, no
 * migration needed to add the 'processing' value):
 *
 *   none -> processing -> {refunded | partially_refunded | forfeited}
 *                       -> none   (reverted, on a failed/unavailable Stripe call)
 *
 *   1. CLAIM — a conditional UPDATE (`WHERE deposit_refund_status = 'none'`)
 *      flips the row to 'processing' BEFORE any Stripe call. Zero rows
 *      updated does NOT necessarily mean "already handled": re-check the
 *      row's current status. 'processing' means a PRIOR call already
 *      claimed this row and then crashed or was killed before finishing (a
 *      process restart, a bad deploy, whatever) — that row is claimable
 *      AGAIN, because leaving it stuck in 'processing' forever would
 *      silently strand the captain's $200 with nothing ever reading the
 *      column again. Any OTHER status ('refunded' / 'partially_refunded' /
 *      'forfeited') really is terminal — skip as "already_settled".
 *   2. RECONCILE — before EVER calling `stripe.refunds.create`, list
 *      existing refunds for the deposit PaymentIntent. If one already
 *      exists (the expected case on re-entry: the prior crashed attempt's
 *      Stripe call actually succeeded, it just never got to record that
 *      locally), use IT — its id and actual amount — instead of creating a
 *      second one. Stripe is the source of truth for "did money already
 *      move," never our local status column. The idempotency key on
 *      `refunds.create` is still set (belt), but its 24h TTL means it
 *      cannot be relied on alone: a re-entry long after the original
 *      attempt could otherwise create a genuine second refund, or — if the
 *      retry recomputed a different amount (e.g. a re-run cron with a
 *      different shortfall) — hit Stripe's "amount mismatch" error on every
 *      subsequent retry, forever.
 *   3. FINALIZE — ONE atomic UPDATE (`WHERE deposit_refund_status =
 *      'processing'`) writes the terminal status AND depositRefundId /
 *      RefundedCents / RefundedAt together. This is the single race gate
 *      for the bookkeeping fan-out below it (ledger insert, ops ping,
 *      email, analytics): a concurrent re-entrant that loses this
 *      conditional UPDATE (0 rows) means someone else already finalized
 *      this refund, so IT stops here rather than double-firing the side
 *      effects.
 *   4. FAILURE (Stripe throws, or Stripe isn't configured) — log the alert
 *      FIRST (so the failure is visible even if the revert below also
 *      fails), then revert 'processing' -> 'none' in its OWN try/catch — if
 *      THAT throws too, log a SECOND alert with a `revert_failed` marker,
 *      because a row stuck in 'processing' with no alert trail at all is
 *      exactly the money-loss window this redesign exists to close.
 *
 * The "forfeited" outcome (refundCents computes to <= 0 — either the
 * deadline shortfall consumed the whole deposit, or there was no real
 * deposit to begin with) never calls Stripe at all — nothing to reconcile
 * or create — so it goes straight from the claim to the finalize step.
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
import { captureServerException } from "@/lib/observability/server-error";

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

type FinalStatus = "refunded" | "partially_refunded" | "forfeited";

/**
 * Decide and execute the deposit refund/forfeit for one team, idempotently
 * and race-safely across concurrent and crash-recovered re-entries. See the
 * module doc for the full state machine.
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

  // 'processing' is an in-flight / crash-recoverable state, NOT terminal —
  // see the state machine above. Any other non-'none' status IS terminal.
  if (
    team.depositRefundStatus !== "none" &&
    team.depositRefundStatus !== "processing"
  ) {
    return { status: "skipped", reason: "already_settled" };
  }

  if (!team.depositPaymentIntentId) {
    return { status: "skipped", reason: "no_deposit_pi" };
  }
  const depositPaymentIntentId = team.depositPaymentIntentId;

  const depositCents = team.depositCents ?? 0;

  // ── Compute the outcome up front. RECONCILE below may still revise this
  // (Stripe's actual refunded amount wins over our locally-computed one). ──
  let refundCents: number;
  let finalStatus: FinalStatus;

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

  // A computed refund of $0 or less is always a no-op settle, never a "$0
  // refund" — normalize to forfeited regardless of which branch produced it
  // (a null/zero depositCents on an otherwise-full_collection trigger is the
  // other way to land here — there's no real deposit to refund or forfeit).
  if (refundCents <= 0) {
    refundCents = 0;
    finalStatus = "forfeited";
  }

  // ── CLAIM ───────────────────────────────────────────────────────────────
  const claimed = await db
    .update(teamRegistrations)
    .set({ depositRefundStatus: "processing", updatedAt: new Date() })
    .where(
      and(
        eq(teamRegistrations.id, team.id),
        eq(teamRegistrations.depositRefundStatus, "none"),
      ),
    )
    .returning({ id: teamRegistrations.id });

  if (claimed.length === 0) {
    // Either a prior call already holds 'processing' (crash re-entry —
    // proceed below), or the row settled between our SELECT above and this
    // UPDATE (re-check rather than trust the now-possibly-stale in-memory
    // status from the initial row fetch).
    const [current] = await db
      .select({ status: teamRegistrations.depositRefundStatus })
      .from(teamRegistrations)
      .where(eq(teamRegistrations.id, team.id))
      .limit(1);
    if (current?.status !== "processing") {
      return { status: "skipped", reason: "already_settled" };
    }
  }

  const alertContext = {
    teamRegistrationId: team.id,
    organizationId: team.organizationId,
    teamName: team.teamName,
    stripePaymentIntentId: depositPaymentIntentId,
    refundCents,
    trigger,
  };

  let refund: Stripe.Refund | undefined;

  if (finalStatus !== "forfeited") {
    if (!stripe) {
      await logAlert("team_deposit_refund_failed", {
        ...alertContext,
        error: "stripe-not-configured",
      });
      await revertClaim(db, team.id, alertContext);
      return { status: "skipped", reason: "stripe_not_configured" };
    }

    try {
      // RECONCILE — Stripe is the source of truth for "did this already
      // happen," never our local status column (see module doc). Prefer a
      // refund explicitly tagged as ours; fall back to any refund on the PI
      // (a team deposit PI should never carry any other kind of refund).
      const existing = await stripe.refunds.list({
        payment_intent: depositPaymentIntentId,
      });
      const priorRefund =
        existing.data.find((r) => r.metadata?.kind === "team_deposit_release") ??
        existing.data[0];

      if (priorRefund) {
        refund = priorRefund;
        refundCents = priorRefund.amount;
        finalStatus =
          refundCents <= 0
            ? "forfeited"
            : refundCents >= depositCents
              ? "refunded"
              : "partially_refunded";
      } else {
        refund = await stripe.refunds.create(
          {
            payment_intent: depositPaymentIntentId,
            amount: refundCents,
            metadata: {
              kind: "team_deposit_release",
              team_registration_id: team.id,
            },
          },
          // Belt only — its 24h TTL is why RECONCILE above is the real
          // source of truth, not this key.
          { idempotencyKey: `${depositPaymentIntentId}:deposit-refund` },
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logAlert("team_deposit_refund_failed", {
        ...alertContext,
        error: message,
      });
      await revertClaim(db, team.id, alertContext);
      return { status: "skipped", reason: "stripe_refund_failed" };
    }
  }

  // ── FINALIZE — the single race gate for every side effect below. ───────
  const finalized = await db
    .update(teamRegistrations)
    .set({
      depositRefundStatus: finalStatus,
      depositRefundId: refund?.id ?? null,
      depositRefundedCents: finalStatus === "forfeited" ? null : refundCents,
      depositRefundedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(teamRegistrations.id, team.id),
        eq(teamRegistrations.depositRefundStatus, "processing"),
      ),
    )
    .returning({ id: teamRegistrations.id });

  if (finalized.length === 0) {
    // Another concurrent call already finalized this row between our
    // reconcile/create and this write — its side effects already ran.
    return { status: "skipped", reason: "already_settled" };
  }

  // ── Side effects — only the call that WON the finalize reaches here. ───
  const isForfeited = finalStatus === "forfeited";
  const isPartial = finalStatus === "partially_refunded";
  const brand = normalizeBrand(team.brand);

  if (!isForfeited) {
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
        metadata: { stripeRefundId: refund?.id },
      });
    } catch (err) {
      console.error(
        "[maybeRefundTeamDeposit] payments ledger insert failed:",
        err,
      );
      const message = err instanceof Error ? err.message : String(err);
      await logAlert("team_deposit_refund_failed", {
        ...alertContext,
        error: message,
        phase: "ledger_insert",
      });
      void captureServerException(err, {
        component: "payments/team-deposit-refund",
        metadata: { team_registration_id: team.id, phase: "ledger-insert" },
      });
    }

    // Ops visibility for a forfeit rides the existing backstop-charged ping
    // (charge-unpaid-team-shares.ts) — no separate ping when nothing moved.
    await sendOpsPing(team.organizationId, {
      kind: "team_deposit_refunded",
      brand,
      // eventId keyed on the refund id (not team.id) — team.id is already
      // the dedupe key for the team_reserved ping fired at creation.
      eventId: refund!.id,
      label: `${team.teamName} · deposit ${isPartial ? "partially refunded" : "refunded"}`,
      amountCents: refundCents,
    });
  }

  // Forfeit is not silent — the captain hears about it either way, so the
  // owner-model transparency promise holds even when nothing is returned.
  // Skip only the degenerate case where there was never a real deposit to
  // begin with (nothing true to say).
  if (!(isForfeited && depositCents <= 0)) {
    try {
      await sendTeamDepositRefundedEmail({
        to: team.captainEmail,
        captainName: team.captainName,
        teamName: team.teamName,
        outcome: finalStatus,
        refundedCents: isForfeited ? undefined : refundCents,
        depositCents,
        shortfallCents:
          trigger === "deadline_settle" ? (opts.shortfallCents as number) : undefined,
        brand,
      });
    } catch (err) {
      console.error("[maybeRefundTeamDeposit] refund email failed:", err);
    }
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

  if (finalStatus === "refunded") return { status: "refunded" };
  if (finalStatus === "partially_refunded") return { status: "partial" };
  return { status: "forfeited" };
}

/**
 * Revert the optimistic claim back to 'none' after a failed (or unavailable)
 * Stripe refund, so the next trigger (cron re-run, redelivered webhook)
 * retries automatically instead of the deposit silently getting stuck
 * claimed-but-unrefunded forever. Own try/catch: if THIS throws too, log a
 * second alert with a `revert_failed` marker — a row stuck in 'processing'
 * with no alert trail is exactly the money-loss window this exists to close.
 */
async function revertClaim(
  db: ReturnType<typeof getDb>,
  teamRegistrationId: string,
  alertContext: Record<string, unknown>,
): Promise<void> {
  try {
    await db
      .update(teamRegistrations)
      .set({ depositRefundStatus: "none", updatedAt: new Date() })
      .where(
        and(
          eq(teamRegistrations.id, teamRegistrationId),
          eq(teamRegistrations.depositRefundStatus, "processing"),
        ),
      );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAlert("team_deposit_refund_failed", {
      ...alertContext,
      error: message,
      revert_failed: true,
    });
  }
}
