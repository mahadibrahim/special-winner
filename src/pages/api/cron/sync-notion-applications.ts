// Mirrors /api/cron/expire-pending-claims: same x-cron-secret auth, same
// misconfigured-in-prod behavior, same response shape.
import type { APIRoute } from "astro";
import { syncPendingApplications } from "@/lib/careers/sync-pending";

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
    const result = await syncPendingApplications();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron/sync-notion-applications] failed", err);
    return new Response(JSON.stringify({ error: "Sync failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
