import type { APIRoute } from "astro"
import { processScheduledGroupCreations } from "@/lib/messaging/group-lifecycle"
import { captureServerException } from "@/lib/observability/server-error"

/**
 * POST /api/cron/create-scheduled-team-groups
 *
 * Promotes team groups whose creation_scheduled_for date has arrived from
 * 'scheduled' → 'pending_manual_creation'. Intended to run daily via a
 * scheduler (Netlify scheduled function, GitHub Actions, cron-job.org, etc.).
 *
 * Authentication: requires x-cron-secret header matching CRON_SECRET env var.
 */

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET
  const provided = request.headers.get("x-cron-secret")

  if (secret) {
    if (provided !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }
  } else if (import.meta.env.PROD) {
    console.error("[cron] CRON_SECRET not configured in production. Refusing request.")
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const startedAt = Date.now()
    const promoted = await processScheduledGroupCreations()
    const elapsedMs = Date.now() - startedAt

    console.info(
      `[cron] create-scheduled-team-groups: ${promoted} groups promoted to pending_manual_creation in ${elapsedMs}ms`,
    )

    return new Response(JSON.stringify({ promoted, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[cron] create-scheduled-team-groups failed:", err)
    void captureServerException(err, {
      component: "cron/create-scheduled-team-groups",
    })
    return new Response(
      JSON.stringify({ error: "Cron job failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}

export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Scheduled team group creation cron endpoint",
      usage:
        "POST to this endpoint with header x-cron-secret: $CRON_SECRET to promote due scheduled groups. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
