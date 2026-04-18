import type { APIRoute } from "astro"
import { getDb } from "@/lib/db"
import {
  users,
  familyMemberParents,
  familyMembers,
  registrations,
  rosters,
  teams,
  seasons,
  programs,
  locations,
  teamGroupMemberships,
  teamGroups,
} from "@/lib/db/schema"
import { and, eq, isNotNull } from "drizzle-orm"
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth"

export const prerender = false

export const GET: APIRoute = async (context) => {
  const adminAuth = await requireAdminAccess(context)
  if (!adminAuth.authorized) return adminAuth.response
  const orgContext = await requireOrganizationContext(context)
  if (!orgContext.hasOrganization) return orgContext.response

  const db = getDb()
  const orgId = orgContext.organizationId

  // All distinct parent userIds in this org (parents of kids on any roster in any team of any season of any program in a location in this org)
  const parentRows = await db
    .selectDistinct({ userId: familyMemberParents.parentUserId })
    .from(familyMemberParents)
    .innerJoin(familyMembers, eq(familyMemberParents.familyMemberId, familyMembers.id))
    .innerJoin(registrations, eq(registrations.familyMemberId, familyMembers.id))
    .innerJoin(rosters, eq(rosters.registrationId, registrations.id))
    .innerJoin(teams, eq(rosters.teamId, teams.id))
    .innerJoin(seasons, eq(teams.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(
      and(
        eq(locations.organizationId, orgId),
        eq(familyMemberParents.canReceiveMessages, true),
      ),
    )

  const totalParents = parentRows.length
  const parentIds = parentRows.map((r) => r.userId)

  // Linked: has telegramChatId
  let linkedParents = 0
  if (parentIds.length > 0) {
    const linkedRows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(isNotNull(users.telegramChatId)))

    const linkedSet = new Set(linkedRows.map((r) => r.id))
    linkedParents = parentIds.filter((id) => linkedSet.has(id)).length
  }

  const telegramLinkRate = totalParents > 0 ? linkedParents / totalParents : 0

  // Group join rate: active groups in this org, joined (not opted out) / invited
  const memberships = await db
    .select({
      joinedAt: teamGroupMemberships.joinedAt,
      optedOutAt: teamGroupMemberships.optedOutAt,
    })
    .from(teamGroupMemberships)
    .innerJoin(teamGroups, eq(teamGroupMemberships.teamGroupId, teamGroups.id))
    .where(and(eq(teamGroups.organizationId, orgId), eq(teamGroups.status, "active")))

  const invitedMembers = memberships.length
  const joinedMembers = memberships.filter((m) => m.joinedAt && !m.optedOutAt).length
  const groupJoinRate = invitedMembers > 0 ? joinedMembers / invitedMembers : 0

  return new Response(
    JSON.stringify({
      totalParents,
      linkedParents,
      telegramLinkRate,
      invitedMembers,
      joinedMembers,
      groupJoinRate,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}
