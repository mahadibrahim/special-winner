/**
 * POST /api/cron/trial-convert-emails
 *
 * Cron entry point for the trial-convert follow-up email sweep. Mirrors
 * /api/cron/materialize-class-sessions (same auth header, same
 * misconfigured-in-prod behavior, same response shape).
 *
 * Runs daily via netlify/functions/scheduled-trial-convert-emails.ts; the
 * manual endpoint exists so we can hand-trigger from CI / curl. Delegates
 * to runTrialConvertEmails (src/lib/classes/trial-convert.ts), which finds
 * children whose one-time trial class ended 1-3 days ago and who still have
 * no live membership, and emails their parent a one-time convert nudge.
 * Each candidate is isolated so one failure doesn't stop the batch — this
 * endpoint always returns 200 with the counter breakdown (a genuine 500
 * here means the scan query itself, not a per-child send, blew up).
 */
import type { APIRoute } from "astro";
import { runTrialConvertEmails } from "@/lib/classes/trial-convert";
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
    const result = await runTrialConvertEmails(new Date());
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Trial-convert emails: scanned=${result.scanned} sent=${result.sent} skipped=${result.skipped} in ${elapsedMs}ms`,
    );

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Trial-convert emails failed:", err);
    void captureServerException(err, {
      component: "cron/trial-convert-emails",
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
      description: "Trial-convert follow-up email cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to email the parent of every child whose trial class ended 1-3 days ago and who still has no live membership, once ever per child. Per-child failures are isolated and counted rather than aborting the batch. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
