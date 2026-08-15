/**
 * POST /api/cron/rental-block-sweeps
 *
 * Cron entry point for the recurring-rental-block housekeeping. Mirrors
 * /api/cron/expire-pending-rentals (same auth header, same misconfigured-
 * in-prod behavior, same response shape) and runs the four block sweeps in one
 * pass:
 *
 *   1. purge expired quote markers (soft holds on draft quotes)
 *   2. expire unpaid blocks whose deposit hold has lapsed, as a UNIT
 *   3. send balance reminders at T-14, T-3 and T+1 (never cancels)
 *   4. complete blocks that are paid in full with every session played
 *
 * Runs hourly via netlify/functions/scheduled-rental-block-sweeps.ts; the
 * manual endpoint exists so we can hand-trigger from CI / curl.
 */
import type { APIRoute } from "astro";
import {
  completeFinishedBlocks,
  expireUnpaidRentalBlocks,
  sendBlockBalanceReminders,
} from "@/lib/rentals/blocks/lifecycle";
import { purgeExpiredQuoteMarkers } from "@/lib/rentals/blocks/quote-markers";
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

    const markers = await purgeExpiredQuoteMarkers();
    const expired = await expireUnpaidRentalBlocks();
    const reminders = await sendBlockBalanceReminders();
    const completed = await completeFinishedBlocks();

    const result = {
      purgedMarkers: markers.purged,
      expiredBlocks: expired.expired,
      remindersSent: reminders.sent,
      completedBlocks: completed.completed,
    };
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Rental block sweeps: purgedMarkers=${result.purgedMarkers} expiredBlocks=${result.expiredBlocks} remindersSent=${result.remindersSent} completedBlocks=${result.completedBlocks} in ${elapsedMs}ms`,
    );

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Rental block sweeps failed:", err);
    void captureServerException(err, {
      component: "cron/rental-block-sweeps",
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
      description: "Recurring rental block sweeps cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to purge quote markers, expire unpaid blocks, send balance reminders and complete finished blocks. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
