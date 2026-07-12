/**
 * POST /api/cron/expire-pending-claims
 *
 * Cron entry point for the drop-in expiry sweep. Mirrors
 * /api/cron/tick-activity-tracker (same auth header, same misconfigured-
 * in-prod behavior, same response shape).
 *
 * Runs every 5 minutes via netlify/functions/scheduled-expire-pending-claims.ts;
 * the manual endpoint exists so we can hand-trigger from CI / curl during
 * pilots. Two passes run in order, both idempotent per tick:
 *
 *   1. `sendDuePaymentReminders` (src/lib/dropin/payment-reminder.ts) —
 *      stamps + sends the one-shot pre-expiry reminder for `pending_payment`
 *      walk-in holds closing within 30 minutes. Runs BEFORE the expiry pass
 *      so a hold that's about to be expired by pass 2 in this same tick
 *      still gets its reminder attempt (acceptable ordering — the reminder
 *      window and the expiry sweep both run every 5 minutes, so "reminded
 *      then expired in the same tick" only happens for holds that were
 *      already inside the last few minutes of their window).
 *   2. `expireOverduePromotions` (src/lib/dropin/promotion.ts) sweeps
 *      overdue waitlist promotions, overdue walk-in payment holds, and
 *      legacy stranded walk-in holds — see that module's doc header for the
 *      three branches.
 */
import type { APIRoute } from "astro";
import { expireOverduePromotions } from "@/lib/dropin/promotion";
import { sendDuePaymentReminders } from "@/lib/dropin/payment-reminder";
import { captureServerException } from "@/lib/observability/server-error";
import { warmDbConnection } from "@/lib/db/retry";

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

  try {
    // Warm the DB connection (with retry) before any work — rides out the
    // transient Railway CONNECT_TIMEOUT blips that otherwise fail the run.
    await warmDbConnection();
    const startedAt = Date.now();
    const reminderResult = await sendDuePaymentReminders();
    const result = await expireOverduePromotions();
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Drop-in expiry: reminded=${reminderResult.reminded} expired=${result.expired} expiredPaymentHolds=${result.expiredPaymentHolds} promotedNext=${result.promotedNext} in ${elapsedMs}ms`,
    );

    return new Response(JSON.stringify({ ...result, ...reminderResult, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Expire pending claims failed:", err);
    void captureServerException(err, {
      component: "cron/expire-pending-claims",
    });
    return new Response(JSON.stringify({ error: "Cron job failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Drop-in expiry cron endpoint (payment reminders + waitlist promotions + walk-in payment holds)",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to send due pending_payment reminders, then expire overdue pending_claim/pending_payment rows. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
