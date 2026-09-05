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
 *
 * OPS RECOVERY MODEL (F2): the netlify scheduled function
 * (netlify/functions/scheduled-development-reports.ts) doesn't retry on
 * failure, and `computeReportPeriod(new Date())` always resolves relative
 * to "right now" — so a failed run is naturally recoverable by re-POSTing
 * WITHIN the same month (the period is still the same just-closed one, and
 * per-(child, guardian, period) dedupe makes the retry idempotent). Once
 * the month rolls, the plain route moves on to the NEXT period and the
 * missed one becomes otherwise unreachable. `?period=YYYY-MM` /
 * `?period=YYYY-Qn` names that missed period explicitly — see
 * `resolveOverridePeriod`'s docstring for the exact resolution and
 * validation rules (shape + "must already be closed" both reject with
 * 422). Runs the identical scan/build/send/dedupe pipeline as the plain
 * path, just against the named period instead of "now"'s. NOTE:
 * `?period=YYYY-12` (or any Mar/Jun/Sep/Dec month) runs the Q4 (or
 * respective quarter) report, NOT a standalone monthly — monthly subsets
 * don't exist for quarter-ending months in production, so the override
 * collapses to the quarter here too, matching the scheduler exactly.
 */
import type { APIRoute } from "astro";
import {
  computeReportPeriod,
  emailTypeForPeriod,
  InvalidPeriodOverrideError,
  resolveOverridePeriod,
  runDevelopmentReports,
} from "@/lib/reports/development-reports";
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
  const periodParam = url.searchParams.get("period");

  let period;
  if (periodParam) {
    try {
      period = resolveOverridePeriod(periodParam, new Date());
    } catch (err) {
      if (err instanceof InvalidPeriodOverrideError) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw err;
    }
  } else {
    period = computeReportPeriod(new Date());
  }

  try {
    await warmDbConnection();
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
        "POST with header x-cron-secret: $CRON_SECRET to email every qualifying child's guardians a development report for the just-closed period (monthly subset most months, quarterly full report on the four months that close a quarter). Add ?dryRun=1 to return the scanned candidates without sending. Add ?period=YYYY-MM or ?period=YYYY-Qn to run for an explicit already-closed period instead of 'now' — ops recovery for a failed run after the month has rolled past it (within the same month, just re-POST with no override; dedupe makes the retry idempotent). ?period=YYYY-12 (or any Mar/Jun/Sep/Dec month) runs that quarter's Q4/Q1/Q2/Q3 report, not a standalone monthly — monthly subsets don't exist for quarter-ending months, matching the scheduler. Malformed or not-yet-closed period values return 422. Per-child/guardian failures are isolated and counted rather than aborting the batch. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
