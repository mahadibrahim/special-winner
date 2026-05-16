/**
 * POST /api/cron/expire-unverified-users
 *
 * Cron entry point for the daily unverified-user TTL sweep. Mirrors the
 * other cron endpoints (same x-cron-secret header guard, same misconfigured-
 * in-prod behavior, same response shape).
 *
 * Runs every day via netlify/functions/scheduled-expire-unverified-users.ts;
 * the manual endpoint exists so we can hand-trigger from CI / curl when
 * investigating bot signup spikes.
 */
import type { APIRoute } from "astro";
import { cleanupUnverifiedUsers } from "@/lib/auth/cleanup-unverified-users";

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
    const result = await cleanupUnverifiedUsers();
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Unverified-user TTL sweep: deleted=${result.deleted} in ${elapsedMs}ms`,
    );

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Expire unverified users failed:", err);
    return new Response(JSON.stringify({ error: "Cron job failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Unverified-user TTL sweep cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to delete users where email_verified=false AND created_at < NOW() - 7 days AND no roles/org-access/family-members attached. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
