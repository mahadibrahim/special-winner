/**
 * POST /api/cron/poll-lulu-jobs
 *
 * Cron entry point for the Lulu print-job status poll. Mirrors
 * /api/cron/cleanup-self-service-tokens (same auth header, same misconfigured-
 * in-prod behavior, same response shape).
 *
 * Runs every 30 minutes via netlify/functions/scheduled-poll-lulu-jobs.ts;
 * the manual endpoint exists so we can hand-trigger from CI / curl during
 * pilots.
 */
import type { APIRoute } from "astro";
import { pollLuluJobs } from "@/lib/merch/lulu-status";
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
    const result = await pollLuluJobs();
    const elapsedMs = Date.now() - startedAt;

    console.info(`[cron] Lulu job poll: checked=${result.checked} shipped=${result.shipped} failed=${result.failed} in ${elapsedMs}ms`);

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Poll Lulu jobs failed:", err);
    void captureServerException(err, {
      component: "cron/poll-lulu-jobs",
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
      description: "Lulu print-job status poll cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to poll submitted Lulu print jobs, mark shipped orders with tracking, and fail rejected/canceled ones. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
