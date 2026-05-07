/**
 * POST /api/cron/tick-activity-tracker
 *
 * Manual cron endpoint for the activity-tracking reminder loop. Designed
 * to be called every ~5 minutes by a scheduler (Netlify Scheduled
 * Function in production; local cron-job.org / GitHub Actions / curl
 * during pilots).
 *
 * Authentication: requires `x-cron-secret: <CRON_SECRET>` header. When
 * CRON_SECRET is unset in PROD we refuse the request (server
 * misconfigured) rather than running open. This matches the pattern in
 * /api/cron/day-before-reminders.
 *
 * Response: { processed, fired, errors, elapsedMs }.
 */
import type { APIRoute } from "astro";
import { runActivityTrackerTick } from "@/lib/activity-tracking/tick";

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
    const result = await runActivityTrackerTick();
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Activity tracker tick: ${result.fired} fired, ${result.errors} errors, ${result.processed} processed, ${result.counterCompleted} counter-auto-completed in ${elapsedMs}ms`,
    );

    return new Response(
      JSON.stringify({ ...result, elapsedMs }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[cron] Activity tracker tick failed:", err);
    return new Response(JSON.stringify({ error: "Cron job failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      description: "Activity-tracking tick cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to dispatch activity reminders. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
