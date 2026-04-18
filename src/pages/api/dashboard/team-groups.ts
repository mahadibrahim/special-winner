import type { APIRoute } from "astro"
import { getDb } from "@/lib/db"
import { teamGroups, teamGroupMemberships } from "@/lib/db/schema"
import { eq, inArray } from "drizzle-orm"

export const prerender = false

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const db = getDb()
  const memberships = await db
    .select({
      id: teamGroupMemberships.id,
      teamGroupId: teamGroupMemberships.teamGroupId,
      joinedAt: teamGroupMemberships.joinedAt,
      optedOutAt: teamGroupMemberships.optedOutAt,
      removedAt: teamGroupMemberships.removedAt,
    })
    .from(teamGroupMemberships)
    .where(eq(teamGroupMemberships.userId, locals.user.id))

  if (memberships.length === 0) {
    return new Response(JSON.stringify({ teamGroups: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  const groupIds = memberships.map((m) => m.teamGroupId)
  const groups = await db
    .select({
      id: teamGroups.id,
      name: teamGroups.name,
      status: teamGroups.status,
    })
    .from(teamGroups)
    .where(inArray(teamGroups.id, groupIds))

  const byId = new Map(groups.map((g) => [g.id, g]))
  const result = memberships
    .map((m) => {
      const g = byId.get(m.teamGroupId)
      if (!g || g.status === "archived") return null
      return {
        id: g.id,
        name: g.name,
        status: g.status,
        joined: !!m.joinedAt && !m.removedAt && !m.optedOutAt,
        optedOut: !!m.optedOutAt,
      }
    })
    .filter(Boolean)

  return new Response(JSON.stringify({ teamGroups: result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
