import type { APIRoute } from "astro"
import { getDb } from "@/lib/db"
import { teamGroups } from "@/lib/db/schema"
import { and, eq, ne } from "drizzle-orm"
import {
  requireAdminAccess,
  requireCoachAccessToTeam,
} from "@/lib/auth"

export const prerender = false

/**
 * GET /api/admin/teams/:teamId/group
 *
 * Returns the active (or scheduled/pending) team_group for a given team.
 * Accessible by admins OR the coach assigned to that team.
 */
export const GET: APIRoute = async (context) => {
  const teamId = context.params.teamId
  if (!teamId) {
    return new Response(JSON.stringify({ error: "teamId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Allow admin access
  const adminAuth = await requireAdminAccess(context)
  if (!adminAuth.authorized) {
    // Not an admin — try coach access to this specific team
    const coachAuth = await requireCoachAccessToTeam(context, teamId)
    if (!coachAuth.authorized) {
      // Return the coach auth error (401 if unauthenticated, 403 if not coach of team)
      return coachAuth.response
    }
  }

  const db = getDb()
  const group = await db.query.teamGroups.findFirst({
    where: and(eq(teamGroups.teamId, teamId), ne(teamGroups.status, "archived")),
  })

  return new Response(JSON.stringify({ teamGroup: group ?? null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
