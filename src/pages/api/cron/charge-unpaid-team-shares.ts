import type { APIRoute } from "astro";
import { and, eq, lt, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teamRegistrations, teamInvitees, payments } from "@/lib/db/schema";
import { sendTeamShareReminderEmail, sendTeamBackstopWarningEmail } from "@/lib/email/send";
import {
  sumUnpaidSharesCents,
  chargeTeamBackstop,
} from "@/lib/payments/team-captain-charge";
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
 * No payments row is written for the backstop charge — payments.registrationId
 * is NOT NULL and a backstop spans multiple registrations. The outcome is
 * persisted via backstopStatus + invitee status + the PaymentIntent metadata
 * (kind=captain_backstop, team_registration_id).
 *
 * Authentication: requires `x-cron-secret` header matching CRON_SECRET env
 * (same convention as the sibling cron endpoints in this directory).
 *
 * Returns { processed, reminded, charged, failed }.
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

  // ---- 1. Reminders (~3 days before the deadline) ----
  try {
    const reminderTeams = await db
      .select({
        id: teamRegistrations.id,
        seasonId: teamRegistrations.seasonId,
        inviteToken: teamRegistrations.inviteToken,
        teamName: teamRegistrations.teamName,
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

        if (unpaid.length === 0) continue;

        const joinUrl = `${base}/register/${team.seasonId}?team=${team.inviteToken}`;
        const deadline = team.paymentDeadline ?? undefined;
        const brand =
          (team.brand as "aspire" | "soccerone" | undefined) ?? undefined;

        // Captain gets the backstop warning (what will land on their card),
        // not the teammate "pay your share" template. Isolated in its own
        // try/catch so a captain-send failure can't skip the teammate loop
        // below.
        try {
          const unpaidTotalCents = unpaid.reduce(
            (sum, inv) => sum + inv.assignedShareCents,
            0,
          );
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
        captainUserId: teamRegistrations.captainUserId,
        captainStripeCustomerId: teamRegistrations.captainStripeCustomerId,
        captainPaymentMethodId: teamRegistrations.captainPaymentMethodId,
      })
      .from(teamRegistrations)
      .where(
        and(
          eq(teamRegistrations.backstopStatus, "pending"),
          lt(teamRegistrations.paymentDeadline, sql`now()`),
        ),
      );

    for (const team of dueTeams) {
      processed += 1;
      try {
        const invitees = await db
          .select({
            assignedShareCents: teamInvitees.assignedShareCents,
            status: teamInvitees.status,
          })
          .from(teamInvitees)
          .where(eq(teamInvitees.teamRegistrationId, team.id));

        const unpaid = sumUnpaidSharesCents(invitees);

        if (unpaid <= 0) {
          // Everyone paid — close out the backstop, nothing to charge.
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

          charged += 1;
        } else {
          await db
            .update(teamRegistrations)
            .set({ backstopStatus: "failed", updatedAt: new Date() })
            .where(eq(teamRegistrations.id, team.id));

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

  const elapsedMs = Date.now() - startedAt;
  console.info(
    `[cron] Charge unpaid team shares: ${processed} processed, ${reminded} reminded, ${charged} charged, ${failed} failed in ${elapsedMs}ms`,
  );

  return new Response(
    JSON.stringify({ processed, reminded, charged, failed, elapsedMs }),
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
