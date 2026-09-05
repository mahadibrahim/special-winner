/**
 * POST /api/cron/send-development-reports
 *
 * Monthly cron — the repo's FIRST monthly-cadence scheduled task (every
 * other cron in this directory is daily). Fires the closed-period
 * development report for every qualifying child: a monthly SUBSET report
 * most months, or a quarterly FULL report on the four months that close a
 * quarter (Jan/Apr/Jul/Oct 1st) — see
 * src/lib/reports/development-reports.ts's computeReportPeriod for the
 * exact decision, and its module docstring for the scan/dedupe/guardian
 * design.
 *
 * Mirrors /api/cron/trial-convert-emails in shell (same CRON_SECRET auth,
 * same warmDbConnection-before-work, same "always 200 with counters"
 * contract — a per-child/guardian failure is isolated and counted, never
 * aborts the batch; a genuine 500 here means the SCAN query itself failed).
 *
 * `?dryRun=1` runs the scan and returns the candidate list without
 * resolving guardians, building report data, or sending anything — cheap
 * ops sanity-check before a live run.
 */
import type { APIRoute } from "astro";
import { computeReportPeriod, emailTypeForPeriod, runDevelopmentReports } from "@/lib/reports/development-reports";
import { captureServerException } from "@/lib/observability/server-error";
import { warmDbConnection } from "@/lib/db/retry";

export const prerender = false;

function checkCronSecret(request: Request): Response | null {
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
    console.error("[cron] CRON_SECRET not configured in production. Refusing request.");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

export const POST: APIRoute = async ({ request, url }) => {
  const authError = checkCronSecret(request);
  if (authError) return authError;

  const dryRun = url.searchParams.get("dryRun") === "1";

  try {
    await warmDbConnection();
    const now = new Date();
    const period = computeReportPeriod(now);
    const startedAt = Date.now();
    const result = await runDevelopmentReports(period, { dryRun });
    const elapsedMs = Date.now() - startedAt;

    const periodSummary =
      period.kind === "monthly"
        ? { kind: "monthly" as const, key: period.periodKey, label: period.label }
        : { kind: "quarterly" as const, key: period.quarterKey, label: period.label, months: period.months };

    console.info(
      `[cron] Development reports (${emailTypeForPeriod(period)}): scanned=${result.scanned} sent=${result.sent} skipped=${result.skipped} failed=${result.failed} in ${elapsedMs}ms${dryRun ? " (dryRun)" : ""}`,
    );

    return new Response(JSON.stringify({ ...result, period: periodSummary, dryRun, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Development reports failed:", err);
    void captureServerException(err, { component: "cron/send-development-reports" });
    return new Response(JSON.stringify({ error: "Cron job failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Monthly subset / quarterly full development-report cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to email every qualifying child's guardians a development report for the just-closed period (monthly subset most months, quarterly full report on the four months that close a quarter). Add ?dryRun=1 to return the scanned candidates without sending. Per-child/guardian failures are isolated and counted rather than aborting the batch. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
