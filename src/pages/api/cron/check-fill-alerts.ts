/**
 * POST /api/cron/check-fill-alerts
 *
 * Cron entry point for the "needs players" fill-alert sweep. Mirrors
 * /api/cron/expire-pending-claims (same auth header, same
 * misconfigured-in-prod behavior, same response shape).
 *
 * Runs every 15 minutes via netlify/functions/scheduled-check-fill-alerts.ts;
 * the manual endpoint exists so we can hand-trigger from CI / curl during
 * pilots. Delegates entirely to runFillAlertSweep
 * (src/lib/dropin/fill-alerts.ts) — see that module's doc header for the
 * eligibility rules (window/threshold from the org rate card, stamp-then-send
 * one-blast-per-session, 2/day/user cap).
 */
import type { APIRoute } from "astro";
import { runFillAlertSweep } from "@/lib/dropin/fill-alerts";
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

  // Test-only `now` override so integration tests can exercise the
  // quiet-hours gate deterministically instead of depending on wall-clock
  // time-of-day when the suite happens to run. Gated behind the same flag
  // as every other /api/test/** fixture; never available in prod.
  let nowOverride: Date | undefined;
  if (process.env.E2E_TEST_ENDPOINTS === "yes") {
    const body: { now?: unknown } | null = await request
      .clone()
      .json()
      .catch(() => null);
    if (body && typeof body.now === "string") {
      const parsed = new Date(body.now);
      if (!Number.isNaN(parsed.getTime())) nowOverride = parsed;
    }
  }

  try {
    // Warm the DB connection (with retry) before any work — rides out the
    // transient Railway CONNECT_TIMEOUT blips that otherwise fail the run.
    await warmDbConnection();
    const startedAt = Date.now();
    const result = await runFillAlertSweep(nowOverride);
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Fill alerts: sessions=${result.sessionsAlerted} sent=${result.smsSent} skipped=${result.smsSkipped} in ${elapsedMs}ms`,
    );

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Check fill alerts failed:", err);
    void captureServerException(err, {
      component: "cron/check-fill-alerts",
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
      description: "Pickup fill-alert cron endpoint (needs-players SMS sweep)",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to sweep scheduled pickup sessions and text subscribers whose session is inside the fill-alert window and under the fill threshold. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
