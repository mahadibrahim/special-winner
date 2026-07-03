/**
 * POST /api/cron/send-ops-digest
 *
 * Daily 8am ET sweep that recaps the prior day's operational pings (new
 * signups by brand, money totals by kind, rate-cap collapsed count) into
 * one message per enabled org, delivered via the same WhatsApp→email
 * fallback ladder as instant pings. Mirrors /api/cron/expire-pending-rentals
 * (same auth header, same misconfigured-in-prod behavior, same response
 * shape).
 */
import type { APIRoute } from "astro";
import { sendOpsDigest } from "@/lib/ops/digest";
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
    console.error("[cron] CRON_SECRET not configured in production. Refusing request.");
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
    const result = await sendOpsDigest();
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Ops digest: orgs=${result.orgs} sent=${result.sent}`,
    );

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Ops digest failed:", err);
    void captureServerException(err, {
      component: "cron/send-ops-digest",
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
      description: "Daily ops digest cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to recap the prior day's operational pings (signups, money totals, suppressed count) per enabled org.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
