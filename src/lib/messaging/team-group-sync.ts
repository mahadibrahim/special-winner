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
import { toE164 } from "../phone"
import { createZernioClientFromEnv, type ZernioClient } from "../zernio/messaging"

/**
 * Compute the set of user IDs that should be in the given team group.
 *
 * Adaptation from spec:
 * - registrations has no teamId column. The team→player link goes through
 *   the `rosters` table: rosters.teamId + rosters.registrationId → registrations.id
 *   → registrations.familyMemberId → familyMemberParents → users.
 */
export async function computeExpectedMembership(teamGroupId: string): Promise<string[]> {
  const rows = await computeExpectedMembershipDetailed(teamGroupId)
  return rows.map((r) => r.userId)
}

/**
 * Same query as computeExpectedMembership, but also returns each expected
 * member's telegramChatId — the join already touches `users` (filtered on
 * isNotNull(users.telegramChatId)), so selecting the column here is free and
 * lets syncTeamGroupMembership's invite loop skip a per-member
 * users.findFirst lookup.
 */
async function computeExpectedMembershipDetailed(
  teamGroupId: string,
): Promise<Array<{ userId: string; telegramChatId: string }>> {
  const db = getDb()

  // Lookup by primary key but be explicit about ordering for CI determinism.
  const group = await db.query.teamGroups.findFirst({
    where: eq(teamGroups.id, teamGroupId),
    orderBy: (t, { asc }) => asc(t.createdAt),
  })
  if (!group) return []

  // rosters.teamId joins to team; rosters.registrationId → registrations.id → familyMemberId
  const rows = await db
    .selectDistinct({ userId: users.id, telegramChatId: users.telegramChatId })
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

  const byUser = new Map<string, string>()
  for (const r of rows) {
    // isNotNull(users.telegramChatId) in the WHERE guarantees this, but the
    // column type is still nullable — narrow it here for callers.
    if (r.telegramChatId && !byUser.has(r.userId)) byUser.set(r.userId, r.telegramChatId)
  }
  return [...byUser].map(([userId, telegramChatId]) => ({ userId, telegramChatId }))
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

  const expected = await computeExpectedMembershipDetailed(teamGroupId)
  const expectedUserIds = expected.map((e) => e.userId)
  const telegramChatIdByUser = new Map(expected.map((e) => [e.userId, e.telegramChatId]))

  // Join users here (instead of a per-member users.findFirst below) so the
  // removal loop has telegramChatId for every existing member up front too.
  const existing = await db
    .select({
      id: teamGroupMemberships.id,
      teamGroupId: teamGroupMemberships.teamGroupId,
      userId: teamGroupMemberships.userId,
      role: teamGroupMemberships.role,
      joinedAt: teamGroupMemberships.joinedAt,
      removedAt: teamGroupMemberships.removedAt,
      optedOutAt: teamGroupMemberships.optedOutAt,
      lastSyncedAt: teamGroupMemberships.lastSyncedAt,
      telegramChatId: users.telegramChatId,
    })
    .from(teamGroupMemberships)
    .innerJoin(users, eq(teamGroupMemberships.userId, users.id))
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
      const telegramChatId = telegramChatIdByUser.get(userId)
      if (!telegramChatId) continue
      await sendInviteDM(telegramChatId, group.name, group.inviteLink ?? "")
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
      if (membership.telegramChatId && group.telegramChatId) {
        await removeMember(group.telegramChatId, membership.telegramChatId)
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

/**
 * Compute who should be in a WhatsApp team group: active-roster users whose
 * parent link can receive messages and who have a phone on file.
 *
 * The WhatsApp peer of computeExpectedMembership. The difference is the
 * reachability key — WhatsApp adds people by phone number (push), where
 * Telegram needs a telegramChatId to DM an invite. Returns one {userId, phone}
 * per user (first non-empty phone wins on the unlikely duplicate).
 */
export async function computeExpectedWhatsAppMembership(
  teamGroupId: string,
): Promise<Array<{ userId: string; phone: string }>> {
  const db = getDb()

  const group = await db.query.teamGroups.findFirst({
    where: eq(teamGroups.id, teamGroupId),
    orderBy: (t, { asc }) => asc(t.createdAt),
  })
  if (!group) return []

  const rows = await db
    .selectDistinct({ userId: users.id, phone: users.phone })
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
        isNotNull(users.phone),
      ),
    )

  const byUser = new Map<string, string>()
  for (const r of rows) {
    if (r.phone && !byUser.has(r.userId)) byUser.set(r.userId, r.phone)
  }
  return [...byUser].map(([userId, phone]) => ({ userId, phone }))
}

/**
 * Populate a provisioned WhatsApp team group with its roster.
 *
 * Additive (the create→populate path): adds expected members not already in the
 * group via Zernio's addGroupParticipants (which chunks at the 8-per-request
 * cap internally), then records joined memberships. Unlike the Telegram sync
 * there is no invite-accept step — Zernio pushes participants straight in, so
 * joinedAt is stamped immediately. Skips users who opted out, are already
 * members, or have an un-normalizable phone.
 *
 * No-ops unless the group is active with a whatsapp_chat_id. Removal of stale
 * members is intentionally out of scope here (the Zernio client exposes no
 * remove-participant call yet) — follow-up alongside the gateway channel work.
 */
export async function syncWhatsAppGroupMembership(
  teamGroupId: string,
  client?: ZernioClient,
): Promise<{ added: string[]; skipped: Array<{ userId: string; reason: string }> }> {
  const db = getDb()

  const group = await db.query.teamGroups.findFirst({
    where: eq(teamGroups.id, teamGroupId),
    orderBy: (t, { asc }) => asc(t.createdAt),
  })
  if (!group || group.status !== "active" || !group.whatsappChatId) {
    return { added: [], skipped: [] }
  }

  const expected = await computeExpectedWhatsAppMembership(teamGroupId)

  const existing = await db
    .select()
    .from(teamGroupMemberships)
    .where(eq(teamGroupMemberships.teamGroupId, teamGroupId))
  const existingByUserId = new Map(existing.map((m) => [m.userId, m]))

  const added: string[] = []
  const skipped: Array<{ userId: string; reason: string }> = []
  const toAdd: Array<{ userId: string; e164: string }> = []

  for (const { userId, phone } of expected) {
    const membership = existingByUserId.get(userId)
    if (membership?.optedOutAt) {
      skipped.push({ userId, reason: "opted_out" })
      continue
    }
    if (membership?.joinedAt) {
      skipped.push({ userId, reason: "already_member" })
      continue
    }
    const e164 = toE164(phone)
    if (!e164) {
      skipped.push({ userId, reason: "invalid_phone" })
      continue
    }
    toAdd.push({ userId, e164 })
  }

  if (toAdd.length === 0) return { added, skipped }

  const zernio = client ?? createZernioClientFromEnv()
  await zernio.addGroupParticipants({
    groupId: group.whatsappChatId,
    phoneNumbers: toAdd.map((t) => t.e164),
  })

  const now = new Date()
  for (const { userId } of toAdd) {
    const membership = existingByUserId.get(userId)
    if (!membership) {
      await db.insert(teamGroupMemberships).values({
        teamGroupId,
        userId,
        role: group.audienceType === "players" ? "player" : "parent",
        joinedAt: now,
        lastSyncedAt: now,
      })
    } else {
      await db
        .update(teamGroupMemberships)
        .set({ joinedAt: now, removedAt: null, lastSyncedAt: now })
        .where(eq(teamGroupMemberships.id, membership.id))
    }
    added.push(userId)
  }

  return { added, skipped }
}
