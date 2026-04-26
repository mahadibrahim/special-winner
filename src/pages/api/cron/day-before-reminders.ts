import type { APIRoute } from "astro";
import { sendDayBeforeReminders } from "@/lib/messaging/notifications";

/**
 * POST /api/cron/day-before-reminders
 *
 * Scheduled task that sends reminder messages for events happening in the
 * next ~24 hours. Intended to be called daily at the same time (e.g. via
 * Netlify scheduled functions, GitHub Actions cron, or an external uptime
 * monitor like cron-job.org).
 *
 * Authentication: requires a shared secret header to prevent random
 * internet visitors from triggering notifications. Set CRON_SECRET in
 * Netlify env and configure the scheduler to send it as
 * `x-cron-secret: <value>`.
 *
 * Returns a summary of events processed and messages sent/failed.
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

  try {
    const startedAt = Date.now();
    const result = await sendDayBeforeReminders();
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Day-before reminders: ${result.contacted} sent, ${result.skipped} skipped, ${result.eventCount} events processed in ${elapsedMs}ms`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        contacted: result.contacted,
        skipped: result.skipped,
        eventCount: result.eventCount,
        elapsedMs,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[cron] Day-before reminder job failed:", err);
    return new Response(
      JSON.stringify({ error: "Cron job failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};

// GET returns a small status page for human debugging. Does not send messages.
export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      description: "Day-before reminder cron endpoint",
      usage:
        "POST to this endpoint with header x-cron-secret: $CRON_SECRET to dispatch reminders. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
