import type { APIRoute } from "astro"
import { getDb } from "@/lib/db"
import { scheduledBroadcasts } from "@/lib/db/schema"
import { and, eq, lte } from "drizzle-orm"
import { composeBroadcast } from "@/lib/messaging/broadcast"
import { captureServerException } from "@/lib/observability/server-error"

/**
 * POST /api/cron/process-scheduled-broadcasts
 *
 * Fires any scheduled_broadcasts rows that are pending and whose
 * scheduled_for timestamp has passed. Skips (cancels) rows where
 * cancelIf.event_cancelled is true. Intended to run frequently (e.g. hourly).
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
    const db = getDb()

    const due = await db
      .select()
      .from(scheduledBroadcasts)
      .where(
        and(
          eq(scheduledBroadcasts.status, "pending"),
          lte(scheduledBroadcasts.scheduledFor, new Date()),
        ),
      )

    let fired = 0
    let cancelled = 0

    for (const sb of due) {
      const cancelConditions = sb.cancelIf as Record<string, unknown>
      if (cancelConditions.event_cancelled === true) {
        await db
          .update(scheduledBroadcasts)
          .set({ status: "cancelled" })
          .where(eq(scheduledBroadcasts.id, sb.id))
        cancelled++
        continue
      }

      try {
        const result = await composeBroadcast({
          organizationId: sb.organizationId,
          initiatorId: sb.initiatorId,
          initiatorType: sb.initiatorId ? "admin" : "system",
          targetType: sb.teamId ? "team_group" : "org_dm",
          teamIds: sb.teamId ? [sb.teamId] : [],
          messageType: sb.messageType as Parameters<typeof composeBroadcast>[0]["messageType"],
          body: sb.body,
          isUrgent: sb.isUrgent,
        })

        await db
          .update(scheduledBroadcasts)
          .set({
            status: "sent",
            firedAt: new Date(),
            resultingBroadcastId: result.broadcastId,
          })
          .where(eq(scheduledBroadcasts.id, sb.id))

        fired++
      } catch (err) {
        console.error(`[cron] Failed to fire scheduled broadcast ${sb.id}:`, err)
        // Don't mark as failed — leave as pending so it can retry next run
      }
    }

    const elapsedMs = Date.now() - startedAt
    console.info(
      `[cron] process-scheduled-broadcasts: ${fired} fired, ${cancelled} cancelled, ` +
        `${due.length - fired - cancelled} errors in ${elapsedMs}ms`,
    )

    return new Response(JSON.stringify({ fired, cancelled, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[cron] process-scheduled-broadcasts failed:", err)
    void captureServerException(err, {
      component: "cron/process-scheduled-broadcasts",
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
      description: "Scheduled broadcast dispatch cron endpoint",
      usage:
        "POST to this endpoint with header x-cron-secret: $CRON_SECRET to fire pending scheduled broadcasts. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
