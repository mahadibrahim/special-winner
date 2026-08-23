/**
 * POST /api/cron/membership-annual-fees
 *
 * Cron entry point for the membership annual-fee anniversary sweep. Mirrors
 * /api/cron/cleanup-self-service-tokens (same auth header, same
 * misconfigured-in-prod behavior, same response shape).
 *
 * Runs every day via netlify/functions/scheduled-membership-annual-fees.ts;
 * the manual endpoint exists so we can hand-trigger from CI / curl during
 * pilots. Delegates to processDueAnnualFees (src/lib/memberships/annual-fee.ts),
 * which adds a Stripe invoice item for each membership whose fee anniversary
 * is due and advances feeNextDueAt by one calendar year. Each membership is
 * isolated in its own try/catch, so one Stripe failure doesn't stop the
 * batch — this endpoint always returns 200 with { processed, failed } counts
 * (a genuine 500 here means the query itself, not a per-row charge, blew up).
 */
import type { APIRoute } from "astro";
import { processDueAnnualFees } from "@/lib/memberships/annual-fee";
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
    const { processed, failed } = await processDueAnnualFees(new Date());
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Membership annual fees: processed=${processed} failed=${failed} in ${elapsedMs}ms`,
    );

    return new Response(JSON.stringify({ processed, failed, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Membership annual fees failed:", err);
    void captureServerException(err, {
      component: "cron/membership-annual-fees",
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
      description: "Membership annual fee anniversary cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to add a Stripe invoice item for each membership whose annual fee anniversary is due, and advance fee_next_due_at by one calendar year. Per-membership failures are isolated and counted in the failed field rather than aborting the batch. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
