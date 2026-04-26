import { getDb } from "../db"
import {
  teamGroups,
  teamGroupMemberships,
  familyMembers,
  familyMemberParents,
  registrations,
  users,
  reconciliationLog,
  rosters,
} from "../db/schema"
import { and, eq, isNotNull } from "drizzle-orm"
import { sendInviteDM, removeMember } from "../telegram/group"

/**
 * Compute the set of user IDs that should be in the given team group.
 *
 * Adaptation from spec:
 * - registrations has no teamId column. The team→player link goes through
 *   the `rosters` table: rosters.teamId + rosters.registrationId → registrations.id
 *   → registrations.familyMemberId → familyMemberParents → users.
 */
export async function computeExpectedMembership(teamGroupId: string): Promise<string[]> {
  const db = getDb()

  // Lookup by primary key but be explicit about ordering for CI determinism.
  const group = await db.query.teamGroups.findFirst({
    where: eq(teamGroups.id, teamGroupId),
    orderBy: (t, { asc }) => asc(t.createdAt),
  })
  if (!group) return []

  // rosters.teamId joins to team; rosters.registrationId → registrations.id → familyMemberId
  const rows = await db
    .selectDistinct({ userId: users.id })
    .from(rosters)
    .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .innerJoin(familyMemberParents, eq(familyMemberParents.familyMemberId, familyMembers.id))
    .innerJoin(users, eq(familyMemberParents.parentUserId, users.id))
    .where(
      and(
        eq(rosters.teamId, group.teamId),
        eq(rosters.status, "active"),
        eq(familyMemberParents.canReceiveMessages, true),
        isNotNull(users.telegramChatId),
      ),
    )

  return [...new Set(rows.map((r) => r.userId))]
}

export async function syncTeamGroupMembership(teamGroupId: string): Promise<{
  invited: string[]
  removed: string[]
  errors: Array<{ userId: string; error: string }>
}> {
  const db = getDb()

  const group = await db.query.teamGroups.findFirst({
    where: eq(teamGroups.id, teamGroupId),
    orderBy: (t, { asc }) => asc(t.createdAt),
  })
  if (!group || group.status !== "active" || !group.telegramChatId) {
    return { invited: [], removed: [], errors: [] }
  }

  const expectedUserIds = await computeExpectedMembership(teamGroupId)

  const existing = await db
    .select()
    .from(teamGroupMemberships)
    .where(eq(teamGroupMemberships.teamGroupId, teamGroupId))

  const existingByUserId = new Map(existing.map((m) => [m.userId, m]))
  const errors: Array<{ userId: string; error: string }> = []
  const invited: string[] = []
  const removed: string[] = []

  for (const userId of expectedUserIds) {
    const membership = existingByUserId.get(userId)
    if (membership?.optedOutAt) continue
    if (membership?.joinedAt) continue

    try {
      const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
      if (!user?.telegramChatId) continue
      await sendInviteDM(user.telegramChatId, group.name, group.inviteLink ?? "")
      if (!membership) {
        await db.insert(teamGroupMemberships).values({
          teamGroupId,
          userId,
          role: group.audienceType === "players" ? "player" : "parent",
          lastSyncedAt: new Date(),
        })
      } else {
        await db
          .update(teamGroupMemberships)
          .set({ lastSyncedAt: new Date(), removedAt: null })
          .where(eq(teamGroupMemberships.id, membership.id))
      }
      invited.push(userId)
    } catch (err) {
      errors.push({ userId, error: String(err) })
    }
  }

  const expectedSet = new Set(expectedUserIds)
  for (const membership of existing) {
    if (expectedSet.has(membership.userId)) continue
    if (membership.removedAt) continue

    try {
      const user = await db.query.users.findFirst({ where: eq(users.id, membership.userId) })
      if (user?.telegramChatId && group.telegramChatId) {
        await removeMember(group.telegramChatId, user.telegramChatId)
      }
      await db
        .update(teamGroupMemberships)
        .set({ removedAt: new Date(), lastSyncedAt: new Date() })
        .where(eq(teamGroupMemberships.id, membership.id))
      removed.push(membership.userId)
    } catch (err) {
      errors.push({ userId: membership.userId, error: String(err) })
    }
  }

  return { invited, removed, errors }
}

export async function reconcileAllActiveGroups(): Promise<{
  groupsProcessed: number
  totalInvited: number
  totalRemoved: number
  totalErrors: number
}> {
  const db = getDb()

  const active = await db
    .select({ id: teamGroups.id })
    .from(teamGroups)
    .where(eq(teamGroups.status, "active"))

  let totalInvited = 0
  let totalRemoved = 0
  let totalErrors = 0

  for (const group of active) {
    const result = await syncTeamGroupMembership(group.id)
    await db.insert(reconciliationLog).values({
      teamGroupId: group.id,
      driftDetected: { added: result.invited, removed: result.removed },
      fixesApplied: { invited: result.invited, removed: result.removed },
      errors: result.errors as unknown as Record<string, unknown>[],
    })
    totalInvited += result.invited.length
    totalRemoved += result.removed.length
    totalErrors += result.errors.length
  }

  return {
    groupsProcessed: active.length,
    totalInvited,
    totalRemoved,
    totalErrors,
  }
}
