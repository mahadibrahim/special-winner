import type { APIRoute } from "astro"
import { z } from "zod"
import { getDb } from "@/lib/db"
import { broadcastLog, teams, seasons, programs, locations } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { composeBroadcast } from "@/lib/messaging/broadcast"
import {
  requireAdminAccess,
  requireCoachAccess,
  requireCoachAccessToTeam,
  requireOrganizationContext,
} from "@/lib/auth"

export const prerender = false

const ComposeSchema = z.object({
  targetType: z.enum(["team_group", "multi_team", "org_dm"]),
  teamIds: z.array(z.string().uuid()).default([]),
  messageType: z.enum([
    "team_broadcast_general",
    "event_change",
    "coach_urgent_override",
    "day_before_reminder",
    "event_cancellation",
  ]),
  body: z.string().min(1).max(4000),
  isUrgent: z.boolean().optional(),
  hoursUntilEvent: z.number().optional(),
  nonce: z.string().optional(),
})

/**
 * Derive the organizationId from a teamId by joining through
 * teams → seasons → programs → locations → organizationId.
 */
async function resolveTeamOrganization(teamId: string): Promise<string | null> {
  const db = getDb()
  const rows = await db
    .select({ organizationId: locations.organizationId })
    .from(teams)
    .innerJoin(seasons, eq(teams.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(teams.id, teamId))
    .limit(1)
  return rows[0]?.organizationId ?? null
}

// POST — compose a broadcast (admin: any target; coach: own team only)
export const POST: APIRoute = async (context) => {
  const { request } = context

  // Parse + validate body first so we know targetType before choosing auth path
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const parsed = ComposeSchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid payload", details: parsed.error.format() }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }
  const input = parsed.data

  // Try admin auth first; fall back to coach auth
  const adminAuth = await requireAdminAccess(context)
  const isAdminUser = adminAuth.authorized

  let initiatorId: string
  let initiatorType: "admin" | "coach"

  if (isAdminUser) {
    initiatorId = adminAuth.user.id
    initiatorType = "admin"
  } else {
    // Try coach auth
    const coachAuth = await requireCoachAccess(context)
    if (!coachAuth.authorized) {
      // Return the coach auth error (will be 401 if unauthenticated, 403 if not a coach)
      return coachAuth.response
    }

    // Coaches can only broadcast to a single team they own
    if (input.targetType !== "team_group" || input.teamIds.length !== 1) {
      return new Response(
        JSON.stringify({ error: "Coaches can only broadcast to their own team" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      )
    }

    const teamId = input.teamIds[0]
    const teamAuth = await requireCoachAccessToTeam(context, teamId)
    if (!teamAuth.authorized) {
      return teamAuth.response
    }

    initiatorId = coachAuth.user.id
    initiatorType = "coach"
  }

  // Resolve organizationId
  let organizationId: string

  if (input.targetType === "org_dm") {
    const orgContext = await requireOrganizationContext(context)
    if (!orgContext.hasOrganization) return orgContext.response
    organizationId = orgContext.organizationId
  } else {
    if (input.teamIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "teamIds required for team_group / multi_team targets" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }
    const resolved = await resolveTeamOrganization(input.teamIds[0])
    if (!resolved) {
      return new Response(JSON.stringify({ error: "Team not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }
    organizationId = resolved
  }

  try {
    const result = await composeBroadcast({
      organizationId,
      initiatorId,
      initiatorType,
      targetType: input.targetType,
      teamIds: input.teamIds,
      messageType: input.messageType,
      body: input.body,
      isUrgent: input.isUrgent,
      hoursUntilEvent: input.hoursUntilEvent,
      nonce: input.nonce,
    })

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[admin/broadcasts] composeBroadcast failed:", err)
    return new Response(
      JSON.stringify({
        error: "Broadcast failed",
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}

// GET — list sent broadcasts for the current organization
export const GET: APIRoute = async (context) => {
  const adminAuth = await requireAdminAccess(context)
  if (!adminAuth.authorized) {
    // Also allow coaches to list broadcasts
    const coachAuth = await requireCoachAccess(context)
    if (!coachAuth.authorized) return coachAuth.response
  }

  const orgContext = await requireOrganizationContext(context)
  if (!orgContext.hasOrganization) return orgContext.response

  const db = getDb()
  const limit = Math.min(Number(context.url.searchParams.get("limit") ?? 50), 200)

  const rows = await db
    .select()
    .from(broadcastLog)
    .where(eq(broadcastLog.organizationId, orgContext.organizationId))
    .orderBy(desc(broadcastLog.createdAt))
    .limit(limit)

  return new Response(JSON.stringify({ broadcasts: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
