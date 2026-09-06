/**
 * Deposit-refund executor for team registrations (winter-team-fixes, task 2;
 * hardened in review-fix rounds 1 and 2 against a claim-then-crash
 * money-loss window and the re-entry hazards round 1's fix itself
 * introduced — see the state-machine walkthrough below).
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
 * CALLER CONTRACT — READ BEFORE WRITING A NEW CALL SITE (e.g. a cron scan
 * that selects candidate teams to pass in here): ANY QUERY THAT SELECTS
 * CANDIDATE TEAMS MUST USE `deposit_refund_status IN ('none', 'processing')`
 * — NOT `deposit_refund_status = 'none'` ALONE. A 'none'-ONLY PREDICATE
 * MAKES THE CRASH-RECOVERY PATH BELOW COMPLETELY UNREACHABLE: a team stuck
 * in 'processing' from a crashed prior attempt would never be selected
 * again by such a query, silently stranding the captain's $200 forever —
 * exactly the failure mode this whole redesign exists to close.
 *
 * STATE MACHINE (`depositRefundStatus` is a plain varchar — no DB enum, no
 * migration needed to add the 'processing' value):
 *
 *   none -> processing -> {refunded | partially_refunded | forfeited}
 *                       -> none   (reverted, ONLY by the call that owned the claim)
 *
 *   1. CLAIM — a conditional UPDATE (`WHERE deposit_refund_status = 'none'`)
 *      flips the row to 'processing' BEFORE any Stripe call. `didClaim`
 *      tracks whether THIS invocation is the one that won that UPDATE:
 *        - didClaim = true — this call created the 'processing' state, and
 *          it ALONE may revert it back to 'none' on failure.
 *        - didClaim = false (0 rows updated) — re-check the row's current
 *          status and `updatedAt`:
 *            - status is terminal (refunded / partially_refunded /
 *              forfeited): really is settled — skip "already_settled".
 *            - status is 'processing' and FRESH (updatedAt within the last
 *              `REENTRY_STALE_MS`): a genuinely concurrent call owns this
 *              claim right now — skip "in_flight" WITHOUT touching Stripe
 *              or the row at all. This is the ordinary "two triggers fired
 *              almost simultaneously" case, not a crash.
 *            - status is 'processing' and STALE (older than
 *              `REENTRY_STALE_MS`): the prior claimant crashed or was
 *              killed before finishing — this is crash recovery. Proceed,
 *              but `didClaim` stays false: this call does NOT own the
 *              claim and must never revert it. Round 1's fix introduced
 *              exactly this bug: a re-entrant's revert-to-'none' on its own
 *              failure could clobber a genuinely still-live winner's claim,
 *              making the winner's own FINALIZE lose its race and silently
 *              skip recording a refund that really happened at Stripe.
 *   2. RECONCILE — before EVER calling `stripe.refunds.create`, list
 *      existing refunds for the deposit PaymentIntent, ignoring any with
 *      status 'failed' or 'canceled' — money that never actually moved must
 *      never be adopted and told to the captain as "on its way back."
 *      Prefer a refund explicitly tagged `metadata.kind ===
 *      "team_deposit_release"`; fall back to any other usable refund on the
 *      PI (a team deposit PI should never legitimately carry any OTHER kind
 *      of refund) — but ALERT when adopting an untagged one, since it could
 *      be a Stripe-Dashboard goodwill refund a human issued for an
 *      unrelated reason; adopt it anyway (don't block), just flag it. A
 *      found refund's ACTUAL amount always wins over whatever was just
 *      computed locally, and the outcome (refunded / partially_refunded /
 *      forfeited) is recomputed from it — this is what closes the
 *      "amount mismatch" retry loop a naive re-create would hit.
 *
 *      RECONCILE runs even when the fresh computation says "forfeited," as
 *      long as this call did NOT originate the claim (didClaim = false): a
 *      crashed PARTIAL refund from a prior attempt must still be adopted
 *      even if today's fresh recomputation (e.g. the shortfall grew past
 *      the deposit between attempts) would otherwise take the forfeit
 *      shortcut. Only a clean "nothing usable found" result may actually
 *      forfeit. A fresh claim (didClaim = true) that computes "forfeited"
 *      skips RECONCILE entirely — there is no possible prior refund for a
 *      claim that just originated.
 *   3. FINALIZE — ONE atomic UPDATE (`WHERE deposit_refund_status =
 *      'processing'`) writes the terminal status AND depositRefundId /
 *      RefundedCents / RefundedAt together. This is the single race gate
 *      for the bookkeeping fan-out below it (ledger insert, ops ping,
 *      email, analytics). On 0 rows: if THIS call just created or adopted
 *      a real Stripe refund (i.e. it has one in hand), that is NOT benign —
 *      a refund exists at Stripe with no bookkeeping recorded for it, so it
 *      gets its own alert. If this call never got a refund (a clean
 *      forfeit lost the race), 0 rows really does just mean someone else
 *      already settled this row.
 *   4. FAILURE (Stripe throws, or Stripe isn't configured) — log the alert
 *      FIRST (so the failure is visible even if the revert below also
 *      fails), then — ONLY IF didClaim — revert 'processing' -> 'none' in
 *      its own try/catch; if THAT throws too, log a SECOND alert with a
 *      `revert_failed` marker. A re-entrant call (didClaim = false) that
 *      itself fails leaves the row in 'processing' rather than reverting
 *      it — it doesn't own the claim, so it must not destroy it; a LATER
 *      re-entry (once stale again) will retry.
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
 * A 'processing' row younger than this is treated as a genuinely concurrent
 * in-flight call (skip "in_flight"); older than this, it's treated as a
 * crashed prior attempt eligible for crash-recovery re-entry. Ruled value —
 * long enough that any real concurrent call (even a slow one) has finished,
 * short enough that real crash recovery doesn't wait forever.
 */
const REENTRY_STALE_MS = 10 * 60 * 1000;

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

  // Ownership of the claim — ONLY the call that actually won the none ->
  // processing transition may ever revert it back to 'none'. A re-entrant
  // (didClaim = false) that itself fails must leave the row in 'processing'
  // — see FAILURE in the module doc for why (round 1's exact bug).
  const didClaim = claimed.length > 0;

  if (!didClaim) {
    // Either a prior call already holds 'processing', or the row settled
    // between our SELECT above and this UPDATE — re-check rather than trust
    // the now-possibly-stale in-memory status from the initial row fetch.
    const [current] = await db
      .select({
        status: teamRegistrations.depositRefundStatus,
        updatedAt: teamRegistrations.updatedAt,
      })
      .from(teamRegistrations)
      .where(eq(teamRegistrations.id, team.id))
      .limit(1);

    if (current?.status !== "processing") {
      return { status: "skipped", reason: "already_settled" };
    }

    const ageMs = Date.now() - current.updatedAt.getTime();
    if (ageMs < REENTRY_STALE_MS) {
      // Fresh 'processing' row — a genuinely concurrent call owns this
      // claim right now. Do NOT touch Stripe or the row; just back off.
      return { status: "skipped", reason: "in_flight" };
    }
    // Stale — crash recovery. Proceed as a re-entrant (didClaim stays false).
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
  // figure must be re-derived from the ACTUAL amounts (fix round 2, finding 4).
  let refundCentsFromReconcile = false;

  // RECONCILE runs whenever we actually need to move money (not forfeited),
  // OR whenever this call is a re-entrant (didClaim = false) even if the
  // fresh computation says forfeited — a crashed prior attempt may have
  // already moved money before today's recomputation decided there was
  // nothing left to refund. A fresh claim that computes "forfeited" skips
  // this entirely: there's no possible prior refund for a claim that just
  // originated.
  const mustReconcile = finalStatus !== "forfeited" || !didClaim;

  if (mustReconcile) {
    if (!stripe) {
      await logAlert("team_deposit_refund_failed", {
        ...alertContext,
        refundCents,
        error: "stripe-not-configured",
      });
      if (didClaim) await revertClaim(db, team.id, { ...alertContext, refundCents });
      return { status: "skipped", reason: "stripe_not_configured" };
    }

    try {
      // RECONCILE — Stripe is the source of truth for "did this already
      // happen," never our local status column (see module doc).
      const existing = await stripe.refunds.list({
        payment_intent: depositPaymentIntentId,
      });
      // A failed/canceled refund never actually moved money — never adopt
      // one as "the" deposit refund (fix round 2, finding 2): the captain
      // must not be told a bank-rejected refund is "on its way back."
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
          // fix round 2, finding 7: adopting an UNTAGGED refund — flag it,
          // don't block. See module doc's RECONCILE section.
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
        // (Only reachable here when finalStatus is refunded/
        // partially_refunded — a re-entrant forfeit with nothing found
        // stays forfeited, per mustReconcile's contract above.)
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
      if (didClaim) await revertClaim(db, team.id, { ...alertContext, refundCents });
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
    if (refund) {
      // This call just created or adopted a REAL Stripe refund but lost the
      // finalize race — money exists at Stripe with no bookkeeping recorded
      // for it. NOT benign; a human should verify nothing is unaccounted
      // for (fix round 2, finding 5).
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
  // repeating the stale opts value (fix round 2, finding 4). When even that
  // derivation is incoherent (<= 0), pass undefined so the email builder
  // falls back to its no-figure phrasing rather than print a bogus number.
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
 * Revert the optimistic claim back to 'none' after a failed (or unavailable)
 * Stripe refund, so the next trigger (cron re-run, redelivered webhook)
 * retries automatically instead of the deposit silently getting stuck
 * claimed-but-unrefunded forever. Callers MUST only invoke this when
 * `didClaim` was true — see the module doc's FAILURE section for why a
 * re-entrant call reverting a claim it doesn't own is exactly round 1's
 * money-loss bug. Own try/catch: if THIS throws too, log a second alert
 * with a `revert_failed` marker — a row stuck in 'processing' with no alert
 * trail is exactly the money-loss window this exists to close.
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
