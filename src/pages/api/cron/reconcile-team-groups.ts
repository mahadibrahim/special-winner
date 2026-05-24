import type { APIRoute } from "astro"
import { reconcileAllActiveGroups } from "@/lib/messaging/team-group-sync"
import { captureServerException } from "@/lib/observability/server-error"

/**
 * POST /api/cron/reconcile-team-groups
 *
 * Reconciles membership across all active Telegram team groups: invites
 * members who should be in but aren't, removes those who should no longer
 * be present. Intended to run daily or multiple times per day.
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
    const result = await reconcileAllActiveGroups()
    const elapsedMs = Date.now() - startedAt

    console.info(
      `[cron] reconcile-team-groups: ${result.groupsProcessed} groups, ` +
        `${result.totalInvited} invited, ${result.totalRemoved} removed, ` +
        `${result.totalErrors} errors in ${elapsedMs}ms`,
    )

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[cron] reconcile-team-groups failed:", err)
    void captureServerException(err, {
      component: "cron/reconcile-team-groups",
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
      description: "Team group membership reconciliation cron endpoint",
      usage:
        "POST to this endpoint with header x-cron-secret: $CRON_SECRET to reconcile all active groups. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
