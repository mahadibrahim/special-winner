import { getDb } from "../db"
import { teamGroups, seasons, programs, locations, organizations, sports } from "../db/schema"
import { teams } from "../db/schema"
import { and, eq, lte, sql } from "drizzle-orm"
import {
  botLeaveGroup,
  postToGroup,
  sendInviteDM,
  createPermanentInviteLink,
  setGroupTitle,
  setGroupDescription,
} from "../telegram/group"
import { createZernioClientFromEnv, type ZernioClient } from "../zernio/messaging"

type ScheduleCreationInput = {
  teamId: string
  firstEventAt: Date | null
}

/**
 * Called when a roster changes: ensure a team_groups row exists in 'scheduled' state,
 * with creation_scheduled_for set to 7 days before the team's first event (or now
 * if the first event is <7d away). If no first event is known yet, leave
 * creation_scheduled_for null — will be set when an event is added to the schedule.
 *
 * Adaptations from spec:
 * - teams has no programId/organizationId columns. We join season→program→location→organization.
 * - organizations.shortName does not exist; we use organizations.slug instead.
 * - sports.displayName does not exist; we use sports.name instead.
 * - db is nullable (getDb() used throughout).
 */
export async function scheduleGroupCreation(input: ScheduleCreationInput): Promise<void> {
  const { teamId, firstEventAt } = input
  const db = getDb()

  // Fetch team + season + program + sport + location + organization via joins
  const rows = await db
    .select({
      teamName: teams.name,
      seasonName: seasons.name,
      seasonId: seasons.id,
      programId: programs.id,
      programName: programs.name,
      audienceType: programs.audienceType,
      sportName: sports.name,
      organizationId: organizations.id,
      organizationSlug: organizations.slug,
    })
    .from(teams)
    .innerJoin(seasons, eq(teams.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(sports, eq(programs.sportId, sports.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(organizations, eq(locations.organizationId, organizations.id))
    .where(eq(teams.id, teamId))
    .limit(1)

  if (rows.length === 0) throw new Error(`Team ${teamId} not found`)
  const row = rows[0]

  // Compose the group name (org slug as short name, sport name, team name, season, audience)
  const sportLabel = row.sportName ?? row.programName
  const audience = row.audienceType === "players" ? "Players" : "Parents"
  const name = `${row.organizationSlug} ${sportLabel} ${row.teamName} — ${row.seasonName} ${audience}`.slice(0, 128)

  // Compute creation_scheduled_for: 7 days before firstEventAt, or now if <7d, or null
  let creationScheduledFor: Date | null = null
  if (firstEventAt) {
    const sevenDaysBefore = new Date(firstEventAt.getTime() - 7 * 24 * 60 * 60 * 1000)
    creationScheduledFor = sevenDaysBefore <= new Date() ? new Date() : sevenDaysBefore
  }

  // Upsert: create if missing, update creation_scheduled_for if present and still 'scheduled'.
  // orderBy keeps this deterministic on shared DBs if duplicates somehow exist.
  const existing = await db.query.teamGroups.findFirst({
    where: and(eq(teamGroups.teamId, teamId), eq(teamGroups.status, "scheduled")),
    orderBy: (g, { asc }) => asc(g.createdAt),
  })

  if (!existing) {
    await db.insert(teamGroups).values({
      teamId,
      programId: row.programId,
      organizationId: row.organizationId,
      audienceType: row.audienceType,
      name,
      status: "scheduled",
      creationScheduledFor,
    })
  } else if (
    creationScheduledFor &&
    (!existing.creationScheduledFor || existing.creationScheduledFor > creationScheduledFor)
  ) {
    await db
      .update(teamGroups)
      .set({ creationScheduledFor })
      .where(eq(teamGroups.id, existing.id))
  }
}

export async function processScheduledGroupCreations(): Promise<number> {
  const db = getDb()

  const due = await db
    .select()
    .from(teamGroups)
    .where(
      and(
        eq(teamGroups.status, "scheduled"),
        lte(teamGroups.creationScheduledFor, new Date()),
      ),
    )

  let promoted = 0
  for (const group of due) {
    await db
      .update(teamGroups)
      .set({ status: "pending_manual_creation" })
      .where(eq(teamGroups.id, group.id))
    promoted++
  }
  return promoted
}

export async function promoteGroupToActive(
  teamGroupId: string,
  telegramChatId: string,
): Promise<void> {
  const db = getDb()

  const group = await db.query.teamGroups.findFirst({ where: eq(teamGroups.id, teamGroupId) })
  if (!group) throw new Error(`Team group ${teamGroupId} not found`)

  await setGroupTitle(telegramChatId, group.name)
  await setGroupDescription(
    telegramChatId,
    `${group.name}\nManaged by Ace. Parents chat here; coach posts via Aspire.`,
  )
  const inviteLink = await createPermanentInviteLink(telegramChatId)

  await db
    .update(teamGroups)
    .set({
      telegramChatId,
      inviteLink,
      status: "active",
      createdAt: new Date(),
    })
    .where(eq(teamGroups.id, teamGroupId))

  const { syncTeamGroupMembership } = await import("./team-group-sync")
  await syncTeamGroupMembership(teamGroupId)
}

/**
 * Provision a WhatsApp group for a team_group and activate it.
 *
 * The key upgrade over Telegram: Zernio's Cloud API can CREATE the group
 * programmatically, so there is no `pending_manual_creation` step — no human
 * has to make the group and hand back a chat id. We create it, store the
 * whatsapp_chat_id + invite link, and mark active in one pass.
 *
 * Idempotent: if the group already has a whatsapp_chat_id, this no-ops (a retry
 * must not create a duplicate WhatsApp group). Membership population (adding
 * roster phones as participants) is a separate concern handled by the
 * WhatsApp-aware membership sync — not done here yet.
 */
export async function provisionWhatsAppGroup(
  teamGroupId: string,
  client?: ZernioClient,
): Promise<void> {
  const db = getDb()

  const group = await db.query.teamGroups.findFirst({
    where: eq(teamGroups.id, teamGroupId),
    orderBy: (t, { asc }) => asc(t.createdAt),
  })
  if (!group) throw new Error(`Team group ${teamGroupId} not found`)
  if (group.whatsappChatId) return // already provisioned — do not create a duplicate

  const zernio = client ?? createZernioClientFromEnv()
  const created = await zernio.createWhatsAppGroup({
    subject: group.name.slice(0, 128),
    description: `${group.name} — managed by Aspire. Posts come from your league; reply here to reach the team.`,
    joinApprovalMode: "approval_required",
  })

  const inviteLink =
    created.inviteLink ??
    (await zernio.createGroupInviteLink({ groupId: created.groupId }))

  await db
    .update(teamGroups)
    .set({
      whatsappChatId: created.groupId,
      inviteLink,
      status: "active",
      createdAt: new Date(),
    })
    .where(eq(teamGroups.id, teamGroupId))
}

export async function archiveTeamGroup(teamGroupId: string): Promise<void> {
  const db = getDb()

  const group = await db.query.teamGroups.findFirst({ where: eq(teamGroups.id, teamGroupId) })
  if (!group || !group.telegramChatId) return
  if (group.status === "archived") return

  try {
    await postToGroup(
      group.telegramChatId,
      `Season wrapped — thanks for a great season. This group is now archived. Message history remains; Ace will no longer post here.`,
    )
    await botLeaveGroup(group.telegramChatId)
  } catch (err) {
    console.warn(`Archive ${teamGroupId}: telegram calls failed, marking archived anyway`, err)
  }

  await db
    .update(teamGroups)
    .set({ status: "archived", archivedAt: new Date() })
    .where(eq(teamGroups.id, teamGroupId))
}

/**
 * Find all active team_groups whose season end_date was more than 7 days ago
 * and archive them.
 *
 * Adaptation: seasons.endDate is a `date` column (stored as ISO string YYYY-MM-DD).
 * We compare against a date string 7 days ago. We join through teams → seasons.
 */
export async function processSeasonEndArchivals(): Promise<number> {
  const db = getDb()

  // Compute the cutoff date as YYYY-MM-DD string (seasons.endDate is a date column, returned as string)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const cutoffDateStr = sevenDaysAgo.toISOString().slice(0, 10)

  const eligible = await db
    .select({ id: teamGroups.id })
    .from(teamGroups)
    .innerJoin(teams, eq(teamGroups.teamId, teams.id))
    .innerJoin(seasons, eq(teams.seasonId, seasons.id))
    .where(
      and(
        eq(teamGroups.status, "active"),
        lte(seasons.endDate, cutoffDateStr),
      ),
    )

  for (const group of eligible) {
    await archiveTeamGroup(group.id)
  }
  return eligible.length
}
