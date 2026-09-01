/**
 * POST /api/cron/block-nudge-emails
 *
 * Cron entry point for the block-abandon nudge sweep. Mirrors
 * /api/cron/trial-convert-emails (same auth header, same
 * misconfigured-in-prod behavior, same response shape).
 *
 * Runs daily via netlify/functions/scheduled-block-nudge-emails.ts; the
 * manual endpoint exists so we can hand-trigger from CI / curl. Delegates
 * to runBlockNudgeEmails (src/lib/classes/block-nudge.ts), which finds
 * active credit-backed class enrollments the materialize cron has never
 * been able to auto-book (no guardian waiver on file yet — the
 * `skippedNoWaiver` cohort) and emails their parent a one-time nudge toward
 * the choose-slot flow that captures the waiver and books the first seat.
 * Each candidate is isolated so one failure doesn't stop the batch — this
 * endpoint always returns 200 with the counter breakdown (a genuine 500
 * here means the scan/waiver-batch query itself, not a per-child send,
 * blew up).
 */
import type { APIRoute } from "astro";
import { runBlockNudgeEmails } from "@/lib/classes/block-nudge";
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
    const result = await runBlockNudgeEmails(new Date());
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Block-nudge emails: scanned=${result.scanned} sent=${result.sent} skipped=${result.skipped} in ${elapsedMs}ms`,
    );

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Block-nudge emails failed:", err);
    void captureServerException(err, {
      component: "cron/block-nudge-emails",
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
      description: "Block-abandon nudge email cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to email the parent of every active credit-backed class enrollment whose child has no valid waiver and no booking yet on the enrollment's template, once ever per credit grant. Per-child failures are isolated and counted rather than aborting the batch. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
