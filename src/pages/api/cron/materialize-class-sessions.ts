/**
 * POST /api/cron/materialize-class-sessions
 *
 * Cron entry point for the class-slot materialization + auto-booking sweep.
 * Mirrors /api/cron/membership-annual-fees (same auth header, same
 * misconfigured-in-prod behavior, same response shape).
 *
 * Runs daily via netlify/functions/scheduled-materialize-class-sessions.ts;
 * the manual endpoint exists so we can hand-trigger from CI / curl. Delegates
 * to materializeClassSessions (src/lib/classes/materialize.ts), which
 * inserts the next HORIZON_DAYS days of `drop_in_sessions` rows for every
 * active class_slot_templates row and auto-books each active enrollment into
 * every session actually created this run. Each session (and, within it,
 * each enrollment) is isolated so one failure doesn't stop the batch — this
 * endpoint always returns 200 with the counter breakdown (a genuine 500 here
 * means the query itself, not a per-session/per-booking step, blew up).
 */
import type { APIRoute } from "astro";
import { materializeClassSessions } from "@/lib/classes/materialize";
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
    const result = await materializeClassSessions(new Date());
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Materialize class sessions: sessionsCreated=${result.sessionsCreated} autoBooked=${result.autoBooked} skippedExhausted=${result.skippedExhausted} skippedPastDue=${result.skippedPastDue} failed=${result.failed} in ${elapsedMs}ms`,
    );

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Materialize class sessions failed:", err);
    void captureServerException(err, {
      component: "cron/materialize-class-sessions",
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
      description: "Class-slot materialization + auto-booking cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to materialize the next HORIZON_DAYS days of drop_in_sessions rows for every active class_slot_templates row and auto-book each active enrollment into every session created this run. Per-session and per-enrollment failures are isolated and counted rather than aborting the batch. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
