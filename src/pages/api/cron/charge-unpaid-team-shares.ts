import type { APIRoute } from "astro";
import { and, eq, gt, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teamRegistrations, teamInvitees, payments, seasons, ageGroups } from "@/lib/db/schema";
import { sendTeamShareReminderEmail, sendTeamBackstopWarningEmail } from "@/lib/email/send";
import {
  teamBackstopDueCents,
  teamYouthDueCents,
  chargeTeamBackstop,
} from "@/lib/payments/team-captain-charge";
import { teamMoneyReceivedCents, teamRosterCollectedCents } from "@/lib/registrations/team-funding";
import { isYouthTeamSeason } from "@/lib/registrations/team-season-kind";
import { maybeRefundTeamDeposit } from "@/lib/payments/team-deposit-refund";
import { logAlert } from "@/lib/logging/alerts";
import { sendOpsPing } from "@/lib/ops/ping";
import { env } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server-error";

/**
 * POST /api/cron/charge-unpaid-team-shares
 *
 * Daily scheduled task for the captain payment backstop (TeamPayer model).
 *
 *  1. Reminders (~3 days out): for teams with backstopStatus='pending' whose
 *     paymentDeadline lands in [now+2.5d, now+3.5d], email the captain + each
 *     unpaid teammate a "pay your share or the captain gets charged" nudge.
 *     The 1-day date window is what prevents repeats — there's no "reminded"
 *     status column.
 *
 *  2. Charge (deadline passed): for teams with backstopStatus='pending' whose
 *     paymentDeadline < now, sum the unpaid shares and charge the captain's
 *     saved card off-session. On success set backstopStatus='charged' and mark
 *     the still-unpaid invitees 'charged_to_captain'. On failure set
 *     backstopStatus='failed' and capture an exception for manual follow-up.
 *
 *     ADULT teams keep this exact math (`teamMoneyReceivedCents` +
 *     `teamBackstopDueCents`, deposit folded into "received") untouched.
 *     YOUTH teams (winter-team-fixes, task 3) branch to a separate,
 *     deposit-aware formula: `shortfallCents = max(0, teamFeeCents −
 *     teamRosterCollectedCents)` (excludes the deposit — see that helper's
 *     doc in team-funding.ts) and `chargeCents = max(0, shortfallCents −
 *     depositCents)` (`teamYouthDueCents` in team-captain-charge.ts) — the
 *     card is only charged for what the deposit doesn't already cover.
 *     Order matters here: the shortfall is computed BEFORE the card charge
 *     (a captain backstop 'balance' payment row WOULD itself count toward
 *     `teamRosterCollectedCents` on a later read, so it must not leak into
 *     the number `maybeRefundTeamDeposit` settles against), and the
 *     deposit-settle call (trigger `deadline_settle`, the PRE-charge
 *     shortfall) fires AFTER the charge outcome is known but BEFORE this
 *     team's own backstopStatus/invitee writes for the iteration — "deposit
 *     absorbs first, the card covers the rest" is the owner's rule, and it
 *     holds regardless of whether the subsequent card charge itself
 *     succeeds or fails.
 *
 *  3. Deposit-refund retry sweep (winter-team-fixes, task 3): independent of
 *     backstopStatus entirely — see the CALLER CONTRACT in
 *     team-deposit-refund.ts for why this is contract-mandated. The
 *     deadline-charge pass above is strictly one-shot per team (every branch
 *     flips backstopStatus off 'pending'), so a deposit left unsettled by
 *     that one pass — reverted to 'none', skipped in-flight/retryable, or
 *     stranded 'processing' by a crash — would otherwise never be retried by
 *     anything. This sweep selects purely on the deposit columns
 *     (`deposit_refund_status IN ('none','processing')`,
 *     `deposit_payment_intent_id IS NOT NULL`, `payment_deadline < now()`),
 *     bounded to the last 30 days (`payment_deadline > now() - interval '30
 *     days'`) so the FIRST run of this sweep doesn't settle every historical
 *     team ever created — real refunds/forfeit emails firing for prior
 *     seasons. Cases aged past 30 days are a manual follow-up (see
 *     alerts.ts's `team_deposit_refund_failed` runbook); nothing else
 *     surfaces them. Youth-gated via the season/age-group join, same
 *     predicate as `isYouthTeamSeason` elsewhere. Naturally self-limiting:
 *     every terminal outcome drops the row out of the `deposit_refund_status`
 *     predicate, so the sweep stops touching a team the moment it settles.
 *
 * The backstop charge is recorded in the payments ledger as a team-level row
 * (registrationId NULL, teamRegistrationId set, paymentType "balance") — a
 * backstop spans multiple registrations so it can't attach to any single one.
 * The outcome is also persisted via backstopStatus + invitee status + the
 * PaymentIntent metadata (kind=captain_backstop, team_registration_id).
 *
 * Authentication: requires `x-cron-secret` header matching CRON_SECRET env
 * (same convention as the sibling cron endpoints in this directory).
 *
 * Returns { processed, reminded, charged, failed, depositSwept }.
 */

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  const providedSecret = request.headers.get("x-cron-secret");

  if (secret) {
    if (providedSecret !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else if (import.meta.env.PROD) {
    console.error(
      "[cron] CRON_SECRET not configured in production. Refusing request.",
    );
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const db = getDb();
  const base = (env.PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  let processed = 0;
  let reminded = 0;
  let charged = 0;
  let failed = 0;
  let depositSwept = 0;

  // ---- 1. Reminders (~3 days before the deadline) ----
  try {
    const reminderTeams = await db
      .select({
        id: teamRegistrations.id,
        seasonId: teamRegistrations.seasonId,
        inviteToken: teamRegistrations.inviteToken,
        teamName: teamRegistrations.teamName,
        teamFeeCents: teamRegistrations.teamFeeCents,
        captainName: teamRegistrations.captainName,
        captainEmail: teamRegistrations.captainEmail,
        paymentDeadline: teamRegistrations.paymentDeadline,
        brand: teamRegistrations.brand,
      })
      .from(teamRegistrations)
      .where(
        and(
          eq(teamRegistrations.backstopStatus, "pending"),
          // 1-day window so the reminder fires exactly once.
          gte(
            teamRegistrations.paymentDeadline,
            sql`now() + interval '2.5 days'`,
          ),
          lt(
            teamRegistrations.paymentDeadline,
            sql`now() + interval '3.5 days'`,
          ),
        ),
      );

    for (const team of reminderTeams) {
      try {
        const unpaid = await db
          .select({
            email: teamInvitees.email,
            assignedShareCents: teamInvitees.assignedShareCents,
            status: teamInvitees.status,
          })
          .from(teamInvitees)
          .where(
            and(
              eq(teamInvitees.teamRegistrationId, team.id),
              sql`${teamInvitees.status} <> 'paid'`,
            ),
          );

        // What will actually land on the captain's card — the money-based
        // shortfall (same math as the charge phase below). A team with no
        // invitee rows but an uncovered fee still gets warned; a team whose
        // fee is already covered by member payments gets no warning even if
        // its share bookkeeping looks unpaid.
        const received = await teamMoneyReceivedCents(db, team.id);
        const unpaidTotalCents = teamBackstopDueCents({
          teamFeeCents: team.teamFeeCents ?? null,
          receivedCents: received.totalCents,
          invitees: unpaid,
        });

        if (unpaidTotalCents <= 0) continue;

        const joinUrl = `${base}/register/${team.seasonId}?team=${team.inviteToken}`;
        const deadline = team.paymentDeadline ?? undefined;
        const brand =
          (team.brand as "aspire" | "soccerone" | undefined) ?? undefined;

        // Captain gets the backstop warning (what will land on their card),
        // not the teammate "pay your share" template. Isolated in its own
        // try/catch so a captain-send failure can't skip the teammate loop
        // below.
        try {
          await sendTeamBackstopWarningEmail({
            to: team.captainEmail,
            captainName: team.captainName,
            teamName: team.teamName,
            joinUrl,
            unpaidTotalCents,
            unpaidCount: unpaid.length,
            deadline: team.paymentDeadline ?? null,
            brand,
          });
        } catch (captainErr) {
          console.error(
            `[cron] team backstop warning failed for team ${team.id}:`,
            captainErr,
          );
          void captureServerException(captainErr, {
            component: "cron/charge-unpaid-team-shares",
            metadata: { team_registration_id: team.id, phase: "reminder-captain" },
          });
        }

        // Each unpaid teammate gets their own share reminder.
        for (const inv of unpaid) {
          await sendTeamShareReminderEmail({
            to: inv.email,
            teamName: team.teamName,
            captainName: team.captainName,
            joinUrl,
            shareCents: inv.assignedShareCents,
            deadline,
            brand,
          });
        }

        reminded += 1;
      } catch (teamErr) {
        console.error(
          `[cron] team share reminder failed for team ${team.id}:`,
          teamErr,
        );
        void captureServerException(teamErr, {
          component: "cron/charge-unpaid-team-shares",
          metadata: { team_registration_id: team.id, phase: "reminder" },
        });
      }
    }
  } catch (reminderErr) {
    console.error("[cron] team share reminder query failed:", reminderErr);
    void captureServerException(reminderErr, {
      component: "cron/charge-unpaid-team-shares",
      metadata: { phase: "reminder-query" },
    });
  }

  // ---- 2. Charge teams whose deadline has passed ----
  try {
    const dueTeams = await db
      .select({
        id: teamRegistrations.id,
        organizationId: teamRegistrations.organizationId,
        teamName: teamRegistrations.teamName,
        brand: teamRegistrations.brand,
        teamFeeCents: teamRegistrations.teamFeeCents,
        depositCents: teamRegistrations.depositCents,
        captainUserId: teamRegistrations.captainUserId,
        captainStripeCustomerId: teamRegistrations.captainStripeCustomerId,
        captainPaymentMethodId: teamRegistrations.captainPaymentMethodId,
        seasonMinAge: seasons.minAge,
        ageGroupMinAge: ageGroups.minAge,
      })
      .from(teamRegistrations)
      .innerJoin(seasons, eq(teamRegistrations.seasonId, seasons.id))
      .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
      .where(
        and(
          eq(teamRegistrations.backstopStatus, "pending"),
          lt(teamRegistrations.paymentDeadline, sql`now()`),
        ),
      );

    for (const team of dueTeams) {
      processed += 1;
      const isYouth = isYouthTeamSeason({
        minAge: team.seasonMinAge,
        ageGroupMinAge: team.ageGroupMinAge,
      });

      // ---- YOUTH branch (winter-team-fixes, task 3) — separate formula,
      // deposit-aware. Falls through to the adult/legacy path below only
      // when a youth team has no teamFeeCents recorded (can't compute a
      // meaningful shortfall against a null fee; legacy fallback covers it).
      if (isYouth && team.teamFeeCents != null) {
        try {
          // Shortfall computed BEFORE the card charge, from roster-collected
          // money that EXCLUDES the deposit (see teamRosterCollectedCents'
          // doc) — a backstop 'balance' row created by the charge below
          // WOULD itself count as roster-collected on a later read, so this
          // number must be captured now, not re-derived after charging.
          const rosterCollected = await teamRosterCollectedCents(db, team.id);
          const { shortfallCents, chargeCents } = teamYouthDueCents({
            teamFeeCents: team.teamFeeCents,
            rosterCollectedCents: rosterCollected.totalCents,
            depositCents: team.depositCents ?? 0,
          });

          const chargeResult =
            chargeCents > 0 ? await chargeTeamBackstop(team, chargeCents) : undefined;

          // Deposit settle — AFTER the charge outcome is known, BEFORE this
          // team's own backstopStatus/invitee writes below, using the
          // PRE-charge shortfallCents (not chargeCents): the deposit absorbs
          // the shortfall first regardless of whether the card charge itself
          // succeeds or fails. Best-effort: the executor already self-heals
          // via the retry sweep (phase 3 below), so a throw here must not
          // block this team's own bookkeeping.
          try {
            await maybeRefundTeamDeposit(db, {
              teamId: team.id,
              trigger: "deadline_settle",
              shortfallCents,
            });
          } catch (settleErr) {
            console.error(
              `[cron] deposit settle failed for team ${team.id}:`,
              settleErr,
            );
            await logAlert("team_deposit_refund_failed", {
              teamRegistrationId: team.id,
              organizationId: team.organizationId,
              teamName: team.teamName,
              trigger: "deadline_settle",
              error: settleErr instanceof Error ? settleErr.message : String(settleErr),
              phase: "deadline_settle_caller_threw",
            });
          }

          if (chargeCents <= 0) {
            // Deposit alone covers the shortfall (or there was none) —
            // nothing to charge the card for.
            await db
              .update(teamRegistrations)
              .set({ backstopStatus: "charged", updatedAt: new Date() })
              .where(eq(teamRegistrations.id, team.id));
            charged += 1;
            continue;
          }

          if (chargeResult?.ok) {
            await db
              .update(teamRegistrations)
              .set({ backstopStatus: "charged", updatedAt: new Date() })
              .where(eq(teamRegistrations.id, team.id));

            await db
              .update(teamInvitees)
              .set({ status: "charged_to_captain" })
              .where(
                and(
                  eq(teamInvitees.teamRegistrationId, team.id),
                  sql`${teamInvitees.status} <> 'paid'`,
                ),
              );

            if (team.captainUserId && chargeResult.paymentIntentId) {
              try {
                await db
                  .insert(payments)
                  .values({
                    registrationId: null,
                    teamRegistrationId: team.id,
                    userId: team.captainUserId,
                    amountCents: chargeCents,
                    paymentType: "balance",
                    status: "succeeded",
                    stripePaymentIntentId: chargeResult.paymentIntentId,
                  })
                  .onConflictDoNothing({
                    target: payments.stripePaymentIntentId,
                    where: sql`stripe_payment_intent_id IS NOT NULL`,
                  });
              } catch (ledgerErr) {
                console.error(
                  `[cron] failed to record backstop payment for team ${team.id}:`,
                  ledgerErr,
                );
                void captureServerException(ledgerErr, {
                  component: "cron/charge-unpaid-team-shares",
                  metadata: { team_registration_id: team.id, phase: "charge-ledger" },
                });
              }
            }

            await sendOpsPing(team.organizationId, {
              kind: "team_backstop_charged",
              brand: team.brand ?? "aspire",
              eventId: team.id,
              label: `${team.teamName} · captain card charged for the shortfall`,
              amountCents: chargeCents,
            });

            charged += 1;
          } else {
            await db
              .update(teamRegistrations)
              .set({ backstopStatus: "failed", updatedAt: new Date() })
              .where(eq(teamRegistrations.id, team.id));

            await sendOpsPing(team.organizationId, {
              kind: "team_backstop_failed",
              brand: team.brand ?? "aspire",
              eventId: team.id,
              label: `${team.teamName} · $${(chargeCents / 100).toFixed(2)} uncollected (${chargeResult?.reason ?? chargeResult?.status ?? "charge failed"})`,
            });

            void captureServerException(
              new Error(
                `Captain backstop charge failed for team ${team.id}: ${chargeResult?.reason ?? chargeResult?.status ?? "unknown"}`,
              ),
              {
                component: "cron/charge-unpaid-team-shares",
                metadata: {
                  team_registration_id: team.id,
                  phase: "charge",
                  reason: chargeResult?.reason,
                  status: chargeResult?.status,
                  unpaid_cents: chargeCents,
                },
              },
            );
            failed += 1;
          }
        } catch (teamErr) {
          console.error(
            `[cron] team backstop charge failed for team ${team.id}:`,
            teamErr,
          );
          try {
            await db
              .update(teamRegistrations)
              .set({ backstopStatus: "failed", updatedAt: new Date() })
              .where(eq(teamRegistrations.id, team.id));
          } catch {
            // Best-effort status flip; the captured exception is the record.
          }
          void captureServerException(teamErr, {
            component: "cron/charge-unpaid-team-shares",
            metadata: { team_registration_id: team.id, phase: "charge" },
          });
          failed += 1;
        }
        continue;
      }

      // ---- ADULT (and youth-without-a-recorded-fee legacy) path — the
      // formula here is UNCHANGED: teamMoneyReceivedCents folds the deposit
      // into "received" the way it always has. ----
      try {
        const invitees = await db
          .select({
            assignedShareCents: teamInvitees.assignedShareCents,
            status: teamInvitees.status,
          })
          .from(teamInvitees)
          .where(eq(teamInvitees.teamRegistrationId, team.id));

        // Money model: the charge is the shortfall between the team fee and
        // settled money received (team-level payments + linked member
        // payments) — an uninvited-but-paid member reduces it, and an empty
        // invitee list no longer reads as "nothing owed". Invitee-share sum
        // remains only as the legacy fallback for pre-fee teams.
        const received = await teamMoneyReceivedCents(db, team.id);
        const unpaid = teamBackstopDueCents({
          teamFeeCents: team.teamFeeCents ?? null,
          receivedCents: received.totalCents,
          invitees,
        });

        if (unpaid <= 0) {
          // Fee fully covered — close out the backstop, nothing to charge.
          await db
            .update(teamRegistrations)
            .set({ backstopStatus: "charged", updatedAt: new Date() })
            .where(eq(teamRegistrations.id, team.id));
          charged += 1;
          continue;
        }

        const result = await chargeTeamBackstop(team, unpaid);

        if (result.ok) {
          await db
            .update(teamRegistrations)
            .set({ backstopStatus: "charged", updatedAt: new Date() })
            .where(eq(teamRegistrations.id, team.id));

          // Mark every still-unpaid invitee as covered by the captain charge.
          await db
            .update(teamInvitees)
            .set({ status: "charged_to_captain" })
            .where(
              and(
                eq(teamInvitees.teamRegistrationId, team.id),
                sql`${teamInvitees.status} <> 'paid'`,
              ),
            );

          // Record the backstop charge in the payments ledger. Defensive:
          // never let a ledger failure flip an already-succeeded charge to
          // 'failed'. Skip if captainUserId is somehow null; onConflictDoNothing
          // guards re-runs against the same PaymentIntent.
          if (team.captainUserId && result.paymentIntentId) {
            try {
              await db
                .insert(payments)
                .values({
                  registrationId: null,
                  teamRegistrationId: team.id,
                  userId: team.captainUserId,
                  amountCents: unpaid,
                  paymentType: "balance",
                  status: "succeeded",
                  stripePaymentIntentId: result.paymentIntentId,
                })
                .onConflictDoNothing({
                  target: payments.stripePaymentIntentId,
                  where: sql`stripe_payment_intent_id IS NOT NULL`,
                });
            } catch (ledgerErr) {
              console.error(
                `[cron] failed to record backstop payment for team ${team.id}:`,
                ledgerErr,
              );
              void captureServerException(ledgerErr, {
                component: "cron/charge-unpaid-team-shares",
                metadata: { team_registration_id: team.id, phase: "charge-ledger" },
              });
            }
          }

          // Principal ping — captain's card was just charged the shortfall.
          await sendOpsPing(team.organizationId, {
            kind: "team_backstop_charged",
            brand: team.brand ?? "aspire",
            eventId: team.id,
            label: `${team.teamName} · captain card charged for the shortfall`,
            amountCents: unpaid,
          });

          charged += 1;
        } else {
          await db
            .update(teamRegistrations)
            .set({ backstopStatus: "failed", updatedAt: new Date() })
            .where(eq(teamRegistrations.id, team.id));

          // Principal ping — a failed backstop needs a human TODAY.
          await sendOpsPing(team.organizationId, {
            kind: "team_backstop_failed",
            brand: team.brand ?? "aspire",
            eventId: team.id,
            label: `${team.teamName} · $${(unpaid / 100).toFixed(2)} uncollected (${result.reason ?? result.status ?? "charge failed"})`,
          });

          void captureServerException(
            new Error(
              `Captain backstop charge failed for team ${team.id}: ${result.reason ?? result.status ?? "unknown"}`,
            ),
            {
              component: "cron/charge-unpaid-team-shares",
              metadata: {
                team_registration_id: team.id,
                phase: "charge",
                reason: result.reason,
                status: result.status,
                unpaid_cents: unpaid,
              },
            },
          );
          failed += 1;
        }
      } catch (teamErr) {
        console.error(
          `[cron] team backstop charge failed for team ${team.id}:`,
          teamErr,
        );
        try {
          await db
            .update(teamRegistrations)
            .set({ backstopStatus: "failed", updatedAt: new Date() })
            .where(eq(teamRegistrations.id, team.id));
        } catch {
          // Best-effort status flip; the captured exception is the record.
        }
        void captureServerException(teamErr, {
          component: "cron/charge-unpaid-team-shares",
          metadata: { team_registration_id: team.id, phase: "charge" },
        });
        failed += 1;
      }
    }
  } catch (chargeErr) {
    console.error("[cron] team backstop charge query failed:", chargeErr);
    void captureServerException(chargeErr, {
      component: "cron/charge-unpaid-team-shares",
      metadata: { phase: "charge-query" },
    });
  }

  // ---- 3. Deposit-refund retry sweep — independent of backstopStatus. ----
  // See the module doc above and the CALLER CONTRACT in
  // team-deposit-refund.ts: the charge pass above is strictly one-shot per
  // team, so a deposit left unsettled by it (reverted, in-flight, or
  // crash-stranded) is otherwise never retried by anything. Bounded to the
  // last 30 days so the FIRST run of this sweep doesn't settle every
  // historical team ever created.
  try {
    const sweepRows = await db
      .select({
        id: teamRegistrations.id,
        organizationId: teamRegistrations.organizationId,
        teamName: teamRegistrations.teamName,
        teamFeeCents: teamRegistrations.teamFeeCents,
        seasonMinAge: seasons.minAge,
        ageGroupMinAge: ageGroups.minAge,
      })
      .from(teamRegistrations)
      .innerJoin(seasons, eq(teamRegistrations.seasonId, seasons.id))
      .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
      .where(
        and(
          inArray(teamRegistrations.depositRefundStatus, ["none", "processing"]),
          isNotNull(teamRegistrations.depositPaymentIntentId),
          lt(teamRegistrations.paymentDeadline, sql`now()`),
          // Lower bound — without it the first run settles historical teams:
          // real refunds + forfeit emails to captains from prior seasons.
          gt(teamRegistrations.paymentDeadline, sql`now() - interval '30 days'`),
        ),
      );

    for (const row of sweepRows) {
      if (
        !isYouthTeamSeason({
          minAge: row.seasonMinAge,
          ageGroupMinAge: row.ageGroupMinAge,
        })
      ) {
        continue; // maybeRefundTeamDeposit re-checks this too, but skip the
        // extra roster-collected query for a row we already know is adult.
      }
      if (row.teamFeeCents == null) continue; // nothing to compute a shortfall against

      try {
        // Counts every row the sweep actually reached the executor for —
        // regardless of outcome, including a Stripe-side failure that
        // reverts the claim back to 'none' (that's still a genuine retry
        // attempt, not a no-op; see the module doc's self-limiting note —
        // it stops counting a team only once it's truly terminal and drops
        // out of the predicate above).
        depositSwept += 1;
        const rosterCollected = await teamRosterCollectedCents(db, row.id);
        const shortfallCents = Math.max(0, row.teamFeeCents - rosterCollected.totalCents);
        await maybeRefundTeamDeposit(db, {
          teamId: row.id,
          trigger: "deadline_settle",
          shortfallCents,
        });
      } catch (sweepTeamErr) {
        console.error(
          `[cron] deposit retry-sweep failed for team ${row.id}:`,
          sweepTeamErr,
        );
        await logAlert("team_deposit_refund_failed", {
          teamRegistrationId: row.id,
          organizationId: row.organizationId,
          teamName: row.teamName,
          trigger: "deadline_settle",
          error: sweepTeamErr instanceof Error ? sweepTeamErr.message : String(sweepTeamErr),
          phase: "retry_sweep_caller_threw",
        });
      }
    }
  } catch (sweepErr) {
    console.error("[cron] deposit retry-sweep query failed:", sweepErr);
    void captureServerException(sweepErr, {
      component: "cron/charge-unpaid-team-shares",
      metadata: { phase: "retry-sweep-query" },
    });
  }

  const elapsedMs = Date.now() - startedAt;
  console.info(
    `[cron] Charge unpaid team shares: ${processed} processed, ${reminded} reminded, ${charged} charged, ${failed} failed, ${depositSwept} deposit-swept in ${elapsedMs}ms`,
  );

  return new Response(
    JSON.stringify({ processed, reminded, charged, failed, depositSwept, elapsedMs }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

// GET returns a small status page for human debugging. Does not charge anyone.
export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      description:
        "Captain backstop cron — reminds ~3 days out, charges the captain's saved card after the deadline.",
      usage:
        "POST to this endpoint with header x-cron-secret: $CRON_SECRET. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
