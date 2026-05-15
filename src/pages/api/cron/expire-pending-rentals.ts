/**
 * POST /api/cron/expire-pending-rentals
 *
 * Cron entry point for the field-rental pending-payment expiry sweep. Mirrors
 * /api/cron/tick-activity-tracker (same auth header, same misconfigured-
 * in-prod behavior, same response shape).
 *
 * Runs every 5 minutes via netlify/functions/scheduled-expire-pending-rentals.ts;
 * the manual endpoint exists so we can hand-trigger from CI / curl during
 * pilots.
 */
import type { APIRoute } from "astro";
import { expirePendingRentals } from "@/lib/rentals/expire";

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
    const result = await expirePendingRentals();
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Field-rental pending-payment expiry: expired=${result.expired} in ${elapsedMs}ms`,
    );

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Expire pending rentals failed:", err);
    return new Response(JSON.stringify({ error: "Cron job failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Field-rental pending-payment expiry cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to expire overdue pending_payment rental rows. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
