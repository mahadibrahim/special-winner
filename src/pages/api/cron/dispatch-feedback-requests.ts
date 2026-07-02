/**
 * POST /api/cron/dispatch-feedback-requests
 *
 * Hourly sweep that creates + sends post-event feedback asks (NPS surveys,
 * referee ratings). Mirrors /api/cron/expire-pending-rentals (same auth
 * header, same misconfigured-in-prod behavior, same response shape).
 */
import type { APIRoute } from "astro";
import { dispatchFeedbackRequests } from "@/lib/feedback/dispatch";
import { captureServerException } from "@/lib/observability/server-error";

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
    const startedAt = Date.now();
    const result = await dispatchFeedbackRequests();
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Feedback dispatch: created=${result.created} sent=${result.sent} skippedCooldown=${result.skippedCooldown} errors=${result.errors} in ${elapsedMs}ms`,
    );

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Feedback dispatch failed:", err);
    void captureServerException(err, {
      component: "cron/dispatch-feedback-requests",
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
      description: "Post-event feedback dispatch cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to create + send NPS surveys and referee-rating asks for newly-eligible events.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
