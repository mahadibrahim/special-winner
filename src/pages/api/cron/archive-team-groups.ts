import type { APIRoute } from "astro"
import { processSeasonEndArchivals } from "@/lib/messaging/group-lifecycle"
import { captureServerException } from "@/lib/observability/server-error"

/**
 * POST /api/cron/archive-team-groups
 *
 * Archives active team groups whose season ended more than 7 days ago:
 * posts a farewell message, evicts the bot, and marks the group as archived.
 * Intended to run daily.
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
    const archived = await processSeasonEndArchivals()
    const elapsedMs = Date.now() - startedAt

    console.info(
      `[cron] archive-team-groups: ${archived} groups archived in ${elapsedMs}ms`,
    )

    return new Response(JSON.stringify({ archived, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[cron] archive-team-groups failed:", err)
    void captureServerException(err, { component: "cron/archive-team-groups" })
    return new Response(
      JSON.stringify({ error: "Cron job failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}

export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Season-end team group archival cron endpoint",
      usage:
        "POST to this endpoint with header x-cron-secret: $CRON_SECRET to archive groups whose seasons have ended. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
