import type { APIRoute } from "astro"
import { getDb } from "@/lib/db"
import { teamGroups } from "@/lib/db/schema"
import { and, eq, ne } from "drizzle-orm"
import {
  requireSuperAdminAccess,
  requireCoachAccessToTeam,
  requireOrganizationContext,
} from "@/lib/auth"
import {
  requireSameOrgTeam,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership"

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

  // Allow admin access OR coach-of-this-team access. We also verify the team
  // belongs to the caller's organization for admin paths (coach path is already
  // pinned by team via requireCoachAccessToTeam).
  const adminAuth = await requireSuperAdminAccess(context)
  if (adminAuth.authorized) {
    const orgContext = await requireOrganizationContext(context)
    if (!orgContext.hasOrganization) return orgContext.response
    const teamCheck = await requireSameOrgTeam(orgContext.organizationId, teamId)
    if (!teamCheck.ok) return ownershipDeniedResponse()
  } else {
    // Not an admin — try coach access to this specific team
    const coachAuth = await requireCoachAccessToTeam(context, teamId)
    if (!coachAuth.authorized) {
      // Return the coach auth error (401 if unauthenticated, 403 if not coach of team)
      return coachAuth.response
    }
  }

  const db = getDb()
  // Explicit orderBy for CI determinism — multiple non-archived rows for the
  // same team are unexpected but defensive (CLAUDE.md multi-tenant hazard).
  const group = await db.query.teamGroups.findFirst({
    where: and(eq(teamGroups.teamId, teamId), ne(teamGroups.status, "archived")),
    orderBy: (t, { asc }) => asc(t.createdAt),
  })

  return new Response(JSON.stringify({ teamGroup: group ?? null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
