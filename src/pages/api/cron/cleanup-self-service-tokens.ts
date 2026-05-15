/**
 * POST /api/cron/cleanup-self-service-tokens
 *
 * Cron entry point for the self-service tokens expiry cleanup sweep. Mirrors
 * /api/cron/tick-activity-tracker (same auth header, same misconfigured-
 * in-prod behavior, same response shape).
 *
 * Runs every day via netlify/functions/scheduled-cleanup-self-service-tokens.ts;
 * the manual endpoint exists so we can hand-trigger from CI / curl during
 * pilots.
 */
import type { APIRoute } from "astro";
import { cleanupExpiredSelfServiceTokens } from "@/lib/check-in/cleanup-expired-tokens";

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
    const result = await cleanupExpiredSelfServiceTokens();
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Self-service tokens expiry cleanup: deleted=${result.deleted} in ${elapsedMs}ms`,
    );

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Cleanup self-service tokens failed:", err);
    return new Response(JSON.stringify({ error: "Cron job failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Self-service tokens expiry cleanup cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to delete self_service_tokens rows older than 30 days past expiry. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
