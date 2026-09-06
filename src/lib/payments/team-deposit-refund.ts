/**
 * Deposit-refund executor for team registrations (winter-team-fixes, task 2;
 * hardened across three review-fix rounds against a claim-then-crash
 * money-loss window and the re-entry hazards each earlier fix introduced —
 * see the state-machine walkthrough below).
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
 * ═══════════════════════════════════════════════════════════════════════
 * CALLER CONTRACT — READ BEFORE WRITING A NEW CALL SITE. THIS FUNCTION IS
 * NOT SELF-DRIVING: IT ONLY EVER RUNS WHEN SOMETHING CALLS IT, AND SEVERAL
 * OF ITS RETURN PATHS ARE DELIBERATE SILENT NO-OPS THAT ASSUME A LATER CALL
 * WILL COME. IF NO SUCH LATER CALL EXISTS, A CAPTAIN'S $200 IS STRANDED
 * WITH NO ALERT AND NO TRACE.
 *
 * (1) THE DEADLINE CRON MUST RUN A DEDICATED RETRY SWEEP, INDEPENDENT OF
 *     `backstop_status`.
 *
 *     The deadline cron's existing "due teams" pass
 *     (src/pages/api/cron/charge-unpaid-team-shares.ts) selects on
 *     `backstop_status = 'pending'` AND EVERY BRANCH OF IT FLIPS THAT
 *     COLUMN TO 'charged' OR 'failed'. THAT MAKES IT STRICTLY ONE-SHOT PER
 *     TEAM. A deposit left unsettled by that single pass — reverted to
 *     'none' by `stripe_refund_failed`, skipped as `retryable_race` or
 *     `in_flight`, or stranded in 'processing' by a crash — WILL NEVER BE
 *     SELECTED BY THAT QUERY AGAIN. Nothing anywhere else reads
 *     `deposit_refund_status`, so there is no second trigger and no alert:
 *     the money simply sits at Stripe forever.
 *
 *     SO: THE CRON MUST ALSO RUN A SEPARATE SWEEP THAT SELECTS PURELY ON
 *     THE DEPOSIT COLUMNS, NEVER ON `backstop_status`:
 *
 *       WHERE deposit_refund_status IN ('none', 'processing')
 *         AND deposit_payment_intent_id IS NOT NULL
 *         AND payment_deadline < now()
 *         AND <the same youth-season gate this executor applies>
 *
 *     and invoke this executor with trigger "deadline_settle" (and the
 *     freshly recomputed shortfall) for each row it returns. Because every
 *     terminal outcome — 'refunded' / 'partially_refunded' / 'forfeited' —
 *     drops out of that predicate, the sweep is naturally self-limiting: it
 *     keeps retrying exactly the rows that are still unsettled and stops
 *     touching them the moment they settle.
 *
 *     `deposit_refund_status IN ('none','processing')` — BOTH VALUES, NOT
 *     'none' ALONE. A 'none'-only predicate makes the crash-recovery path
 *     below completely unreachable: a team stuck in 'processing' from a
 *     crashed prior attempt would never be selected again.
 *
 * (2) THE SILENT SKIPS BELOW ARE SAFE ONLY BECAUSE THAT SWEEP EXISTS.
 *     `in_flight` (someone else holds a fresh claim), `retryable_race` (a
 *     live TOCTOU loss), and `stripe_refund_failed` (claim reverted to
 *     'none') all return WITHOUT settling anything and WITHOUT scheduling
 *     any follow-up of their own — they are "come back later," not "done."
 *     The retry sweep IS "later." Delete or `backstop_status`-gate that
 *     sweep and all three silently become permanent money loss.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * STATE MACHINE (`depositRefundStatus` is a plain varchar — no DB enum, no
 * migration needed to add the 'processing' value):
 *
 *   none -> processing -> {refunded | partially_refunded | forfeited}
 *                       -> none   (reverted by the call that owns the claim)
 *
 *   1. CLAIM — ONE atomic, SQL-side conditional UPDATE claims the row,
 *      whether it's fresh ('none') or crash-recoverable ('processing' whose
 *      lease is older than 10 minutes):
 *
 *        SET deposit_refund_status = 'processing',
 *            deposit_refund_claimed_at = now()
 *        WHERE id = ? AND (
 *          deposit_refund_status = 'none'
 *          OR (deposit_refund_status = 'processing'
 *              AND (deposit_refund_claimed_at IS NULL
 *                   OR deposit_refund_claimed_at < now() - interval '10 minutes'))
 *        )
 *
 *      THE LEASE IS ITS OWN DEDICATED COLUMN, `deposit_refund_claimed_at`,
 *      WRITTEN ONLY BY THIS STATEMENT. It is NOT `updated_at`, which an
 *      earlier version of this code used and which was WRONG: `updated_at`
 *      is bumped by every other writer on team_registrations (the backstop
 *      cron's own `backstopStatus` updates, admin edits, roster changes), so
 *      a 'processing' row that some co-writer touches on every pass would
 *      never age past the staleness threshold and the crash-recovery claim
 *      would starve indefinitely — the exact "$200 stranded forever" outcome
 *      this executor exists to prevent. Nothing outside this file may write
 *      the lease column (see its schema comment).
 *
 *      BOTH SIDES OF THE STALENESS COMPARISON ARE POSTGRES'S OWN CLOCK —
 *      the column is stamped with `now()` here and compared against `now() -
 *      interval '10 minutes'` there, never app-side `Date.now()`/`new
 *      Date()`. One clock, literally: no local-clock or timezone skew
 *      hazard across processes or hosts. (The row's `updated_at` is still
 *      bumped alongside, per this table's convention, but NOTHING reads it
 *      for the lease.) A NULL lease on a 'processing' row is treated as
 *      stale — defence only; this statement always stamps the two together,
 *      so the combination should be unreachable, but a row that somehow had
 *      it must be recoverable rather than stuck forever.
 *
 *      `didClaim = claimed.length > 0` is true for BOTH a fresh claim and a
 *      stale-recovery claim — there is no "proceeded without owning" limbo
 *      state. Whichever way it won, THIS call genuinely OWNS the row from
 *      here on and may revert it on failure exactly like any owner (see
 *      FAILURE below). A concurrent herd hitting the same stale row all
 *      serialize on this one UPDATE statement; exactly one wins.
 *
 *      On 0 rows (didClaim = false), re-check the row's CURRENT status to
 *      return an HONEST reason — never overload "already_settled" for a row
 *      that's actually retryable right now:
 *        - status = 'processing' — the row is FRESH (a genuinely concurrent
 *          call owns it right now; if it were stale our own UPDATE above
 *          would have matched it) — skip "in_flight", touch nothing.
 *        - status = 'none' — a live TOCTOU race: some OTHER call claimed
 *          this row, ran its own attempt, and reverted back to 'none', all
 *          between our initial row fetch and this UPDATE executing.
 *          Retrying RIGHT NOW would succeed — skip "retryable_race", not
 *          "already_settled".
 *        - anything else (a terminal status) — really is settled — skip
 *          "already_settled".
 *      "in_flight" and "retryable_race" both leave the deposit UNSETTLED and
 *      schedule nothing — they are safe ONLY because the cron's retry sweep
 *      (caller contract, above) comes back for them. Same for the
 *      "stripe_refund_failed" revert in step 4.
 *   2. RECONCILE — UNCONDITIONALLY, for every call that reaches this step,
 *      regardless of trigger and regardless of whether the fresh
 *      computation says "forfeited": list existing refunds for the deposit
 *      PaymentIntent before EVER calling `stripe.refunds.create`. An
 *      earlier version of this code skipped RECONCILE for "a claim that
 *      just originated and computes forfeited," on the premise that such a
 *      claim couldn't possibly have a prior refund to find. THAT PREMISE IS
 *      FALSE: `stripe.refunds.create` can succeed at Stripe while the HTTP
 *      response is lost (a network blip, the process killed mid-await) —
 *      the catch block then reverts 'processing' back to 'none' with a
 *      REAL refund now sitting at Stripe that this row's history knows
 *      nothing about. A LATER claim (fresh, from 'none') that computes
 *      "forfeited" would, under the old premise, never think to check
 *      Stripe at all — silently stamping forfeited and emailing "not
 *      refunded" while money had already moved. `refunds.list` is one cheap
 *      read (capped at 100 results — the API's default of 10 could hide
 *      ours on a refund-rich PI, though a team deposit PI should rarely
 *      have more than one or two); there is no scenario where skipping it
 *      is worth that risk.
 *
 *      Ignore any found refund with status 'failed' or 'canceled' — money
 *      that never actually moved must never be adopted and told to the
 *      captain as "on its way back." Prefer a refund explicitly tagged
 *      `metadata.kind === "team_deposit_release"`; fall back to any other
 *      usable refund on the PI (a team deposit PI should never legitimately
 *      carry any OTHER kind of refund) — but ALERT when adopting an
 *      untagged one (`adopted_untagged`), since it could be a
 *      Stripe-Dashboard goodwill refund a human issued for an unrelated
 *      reason; adopt it anyway (don't block), just flag it — see
 *      alerts.ts's runbook for what a human should verify. A found refund's
 *      ACTUAL amount always wins over whatever was just computed locally,
 *      and the outcome (refunded / partially_refunded / forfeited) is
 *      recomputed from it — this is what closes the "amount mismatch"
 *      retry loop a naive re-create would hit. Only when NOTHING usable is
 *      found does a "forfeited" computation actually forfeit; only then
 *      does a "refunded" / "partially_refunded" computation reach
 *      `stripe.refunds.create`.
 *   3. FINALIZE — ONE atomic UPDATE (`WHERE deposit_refund_status =
 *      'processing'`) writes the terminal status AND depositRefundId /
 *      RefundedCents / RefundedAt together. Single race gate for the
 *      bookkeeping fan-out below it (ledger insert, ops ping, email,
 *      analytics). On 0 rows: if THIS call holds a just-created-or-adopted
 *      `refund`, that's NOT benign — a refund exists at Stripe with no
 *      bookkeeping recorded for it, so it gets its own alert
 *      (`finalize_lost_race_after_refund`). If this call never got a
 *      refund (a clean forfeit lost the race), 0 rows really does just mean
 *      someone else already settled this row.
 *   4. FAILURE (Stripe throws, or Stripe isn't configured) — log the alert
 *      FIRST (so the failure is visible even if the revert below also
 *      fails), then revert 'processing' -> 'none' in its own try/catch;
 *      didClaim is always true by the time execution reaches here (CLAIM is
 *      step 1 and every early exit before it returns directly), so this
 *      call always genuinely owns the row it's reverting. If the revert
 *      itself throws, log a SECOND alert with a `revert_failed` marker.
 */
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
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
 * module doc for the full state machine and the caller contract.
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

  // ── CLAIM — one atomic, SQL-side conditional UPDATE. Matches a fresh
  // 'none' row OR a 'processing' row whose LEASE is stale — both are real
  // ownership. The lease is `deposit_refund_claimed_at`, this executor's
  // own column, stamped and compared with POSTGRES'S clock on both sides
  // (never app-side `new Date()`); `updated_at` is deliberately NOT the
  // lease, because every other writer on this table bumps it and would keep
  // a crashed claim looking permanently fresh. See the module doc. ───────
  const claimed = await db
    .update(teamRegistrations)
    .set({
      depositRefundStatus: "processing",
      depositRefundClaimedAt: sql`now()`,
      // Table convention only — nothing reads updated_at for the lease.
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(teamRegistrations.id, team.id),
        or(
          eq(teamRegistrations.depositRefundStatus, "none"),
          and(
            eq(teamRegistrations.depositRefundStatus, "processing"),
            or(
              // Defence only: CLAIM always stamps status + lease together,
              // so 'processing' with a NULL lease should be unreachable —
              // but if one ever existed it must be recoverable, not stuck.
              isNull(teamRegistrations.depositRefundClaimedAt),
              lt(
                teamRegistrations.depositRefundClaimedAt,
                sql`now() - interval '10 minutes'`,
              ),
            )!,
          )!,
        )!,
      ),
    )
    .returning({ id: teamRegistrations.id });

  const didClaim = claimed.length > 0;

  if (!didClaim) {
    // Re-check the row's CURRENT status for an honest skip reason — never
    // overload "already_settled" for a row that's actually retryable now.
    const [current] = await db
      .select({ status: teamRegistrations.depositRefundStatus })
      .from(teamRegistrations)
      .where(eq(teamRegistrations.id, team.id))
      .limit(1);

    if (current?.status === "processing") {
      // FRESH — if it were stale, our own UPDATE above would have matched
      // it. A genuinely concurrent call owns this claim right now.
      return { status: "skipped", reason: "in_flight" };
    }
    if (current?.status === "none") {
      // Live TOCTOU race: some other call claimed, attempted, and reverted
      // between our initial fetch and this UPDATE. Retrying now would win.
      return { status: "skipped", reason: "retryable_race" };
    }
    return { status: "skipped", reason: "already_settled" };
  }

  const alertContext = {
    teamRegistrationId: team.id,
    organizationId: team.organizationId,
    teamName: team.teamName,
    stripePaymentIntentId: depositPaymentIntentId,
    trigger,
  };

  let refund: Stripe.Refund | undefined;
  // True only when `refund` was ADOPTED from an existing Stripe refund (via
  // RECONCILE) rather than freshly created — in that case `refundCents` no
  // longer agrees with `opts.shortfallCents` and the email's shortfall
  // figure must be re-derived from the ACTUAL amounts.
  let refundCentsFromReconcile = false;

  if (!stripe) {
    await logAlert("team_deposit_refund_failed", {
      ...alertContext,
      refundCents,
      error: "stripe-not-configured",
    });
    await revertClaim(db, team.id, { ...alertContext, refundCents });
    return { status: "skipped", reason: "stripe_not_configured" };
  }

  try {
    // RECONCILE — unconditional (see module doc for why "skip for a fresh
    // forfeited claim" was a false premise). Stripe is the source of truth
    // for "did this already happen," never our local status column.
    const existing = await stripe.refunds.list({
      payment_intent: depositPaymentIntentId,
      limit: 100, // default 10 could hide ours on a refund-rich PI
    });
    // A failed/canceled refund never actually moved money — never adopt one
    // as "the" deposit refund: the captain must not be told a bank-rejected
    // refund is "on its way back."
    const usable = existing.data.filter(
      (r) => r.status !== "failed" && r.status !== "canceled",
    );
    const taggedRefund = usable.find(
      (r) => r.metadata?.kind === "team_deposit_release",
    );
    const priorRefund = taggedRefund ?? usable[0];

    if (priorRefund) {
      refund = priorRefund;
      refundCents = priorRefund.amount;
      refundCentsFromReconcile = true;
      finalStatus =
        refundCents <= 0
          ? "forfeited"
          : refundCents >= depositCents
            ? "refunded"
            : "partially_refunded";

      if (!taggedRefund) {
        // Adopting an UNTAGGED refund — flag it, don't block. See module
        // doc's RECONCILE section and alerts.ts's runbook.
        await logAlert("team_deposit_refund_failed", {
          ...alertContext,
          refundCents,
          error: "adopted_untagged_refund",
          adopted_untagged: true,
          stripeRefundId: refund.id,
        });
      }
    } else if (finalStatus !== "forfeited") {
      // No usable prior refund, and there's actually something to move.
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
    // else: finalStatus === "forfeited" and nothing usable was found — a
    // clean forfeit, now CONFIRMED by reconciliation. No Stripe write.
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAlert("team_deposit_refund_failed", {
      ...alertContext,
      refundCents,
      error: message,
    });
    await revertClaim(db, team.id, { ...alertContext, refundCents });
    return { status: "skipped", reason: "stripe_refund_failed" };
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
    if (refund) {
      // This call just created or adopted a REAL Stripe refund but lost the
      // finalize race — money exists at Stripe with no bookkeeping recorded
      // for it. NOT benign; a human should verify nothing is unaccounted for.
      await logAlert("team_deposit_refund_failed", {
        ...alertContext,
        refundCents,
        error: "finalize_lost_race_after_refund",
        stripeRefundId: refund.id,
      });
    }
    // Otherwise: a clean forfeit (or a call that never touched Stripe) lost
    // the race — another call really did already settle this row.
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
        refundCents,
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

  // Email shortfall figure: when refundCents came from RECONCILE (adopted,
  // not freshly computed from opts.shortfallCents), the two numbers no
  // longer agree — re-derive the figure from the actual amounts instead of
  // repeating the stale opts value. When even that derivation is incoherent
  // (<= 0), pass undefined so the email builder falls back to its no-figure
  // phrasing rather than print a bogus number.
  let emailShortfallCents: number | undefined;
  if (finalStatus === "partially_refunded" || finalStatus === "forfeited") {
    if (refundCentsFromReconcile) {
      const derived = depositCents - refundCents;
      emailShortfallCents = derived > 0 ? derived : undefined;
    } else {
      emailShortfallCents =
        trigger === "deadline_settle" ? (opts.shortfallCents as number) : undefined;
    }
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
        shortfallCents: emailShortfallCents,
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
 * Revert the claim back to 'none' after a failed (or unavailable) Stripe
 * refund, so the next trigger (cron re-run, redelivered webhook) retries
 * automatically instead of the deposit silently getting stuck
 * claimed-but-unrefunded forever. Every call site reaches this only after
 * CLAIM has already succeeded (didClaim = true) — see the module doc's
 * state machine — so this call always genuinely owns the row it's
 * reverting. Own try/catch: if THIS throws too, log a second alert with a
 * `revert_failed` marker — a row stuck in 'processing' with no alert trail
 * is exactly the money-loss window this exists to close (it still
 * self-heals via the stale-claim path once 10 minutes pass, but a human
 * should verify Stripe manually in the meantime).
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
