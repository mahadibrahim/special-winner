import { getDb } from "../db"
import {
  teamGroups,
  broadcastLog,
  conversationMessages,
  conversations,
  teams,
  seasons,
  programs,
  locations,
  organizations,
  registrations,
  familyMembers,
  familyMemberParents,
  users,
  rosters,
} from "../db/schema"
import { and, eq, inArray, gt } from "drizzle-orm"
import { resolveRouting, type MessageType } from "./routing-policy"
import { postToGroup } from "../telegram/group"
import { sendEmail } from "../email"
import { sendSms } from "../sms/send"
import { resolveOrCreateConversations } from "./conversations-helper"

/**
 * Adaptations from spec:
 * - sendEmail: signature is { to, subject, html, text? }. No body/organizationId params.
 *   We pass body as html (wrapped in <p>) and plain text.
 * - sendSMS → sendSms (lowercase s). Returns SendSmsResult { ok, messageId } | { ok, reason }.
 * - conversationMessages requires conversationId (NOT NULL). For per-user SMS/email messages
 *   we resolve/create a conversation. For group Telegram posts we skip conversationMessages
 *   (no per-user conversation exists).
 * - conversationMessages has no deliveryStatus or sentAt columns; use deliveredAt/failedAt.
 * - conversationMessages has no standalone userId column; use senderUserId for the sender
 *   (not the recipient). We log the broadcast initiator as senderUserId.
 * - registrations has no teamId. Recipient resolution goes through rosters → registrations.
 */

export type ComposeBroadcastInput = {
  organizationId: string
  initiatorId: string | null
  initiatorType: "coach" | "admin" | "system"
  targetType: "team_group" | "multi_team" | "org_dm"
  teamIds: string[]
  messageType: MessageType
  body: string
  isUrgent?: boolean
  hoursUntilEvent?: number
  nonce?: string
}

export type BroadcastResult = {
  broadcastId: string
  deduplicated: boolean
  telegramGroupPosts: number
  smsSent: number
  emailSent: number
  errors: string[]
}

export async function composeBroadcast(input: ComposeBroadcastInput): Promise<BroadcastResult> {
  const db = getDb()

  if (input.nonce) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const existing = await db.query.broadcastLog.findFirst({
      where: and(
        eq(broadcastLog.nonce, input.nonce),
        eq(broadcastLog.organizationId, input.organizationId),
        gt(broadcastLog.createdAt, fiveMinutesAgo),
      ),
      // desc so the most-recent match wins if somehow multiple exist
      orderBy: (b, { desc }) => desc(b.createdAt),
    })
    if (existing) {
      return {
        broadcastId: existing.id,
        deduplicated: true,
        telegramGroupPosts: 0,
        smsSent: 0,
        emailSent: 0,
        errors: [],
      }
    }
  }

  const route = resolveRouting({
    messageType: input.messageType,
    hoursUntilEvent: input.hoursUntilEvent,
    isUrgent: input.isUrgent,
  })

  const [logRow] = await db
    .insert(broadcastLog)
    .values({
      organizationId: input.organizationId,
      initiatorId: input.initiatorId,
      initiatorType: input.initiatorType,
      targetType: input.targetType,
      teamIds: input.teamIds,
      messageType: input.messageType,
      body: input.body,
      isUrgent: input.isUrgent ?? false,
      nonce: input.nonce,
      channelsUsed: route as unknown as Record<string, unknown>,
      deliverySummary: {},
    })
    .returning()

  const errors: string[] = []
  let telegramGroupPosts = 0
  let smsSent = 0
  let emailSent = 0

  const recipients = await resolveRecipients(input)

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, input.organizationId),
  })
  const orgName = org?.slug ?? "Organization"

  const displayBody = buildDisplayBody(input, recipients.initiatorFirstName, orgName)

  // ── Telegram group posts ──────────────────────────────────────────────────
  if (route.telegramGroup && input.targetType !== "org_dm") {
    for (const teamId of input.teamIds) {
      const group = await db.query.teamGroups.findFirst({
        where: and(eq(teamGroups.teamId, teamId), eq(teamGroups.status, "active")),
        // Deterministic oldest-active-wins if multiple active groups share a team
        orderBy: (g, { asc }) => asc(g.createdAt),
      })
      if (!group?.telegramChatId) {
        errors.push(`No active group for team ${teamId}`)
        continue
      }
      try {
        const result = await postToGroup(group.telegramChatId, displayBody)
        // conversationMessages requires a conversationId (NOT NULL) tied to a specific parent.
        // Group posts are not per-user conversations — we log only to broadcastLog.
        // The broadcastId on broadcastLog already captures this event.
        void result // acknowledge the post happened; broadcastLog is the source of truth
        telegramGroupPosts++
      } catch (err) {
        errors.push(`Telegram post to team ${teamId}: ${err}`)
      }
    }
  }

  // ── Per-user SMS / email fan-out ──────────────────────────────────────────
  // Work out who actually gets a channel send, then resolve conversations
  // for all of them in one batch up front. The send loop itself then does
  // zero DB reads — message logging is accumulated and bulk-inserted after.
  const planned = recipients.users.map((recipient) => {
    const sendSmsThis =
      (route.sms === "all_recipients" ||
        (route.sms === "unlinked_only" && !recipient.hasTelegram)) &&
      !!recipient.phone
    const sendEmailThis =
      (route.email === "all_recipients" ||
        (route.email === "unlinked_only" && !recipient.hasTelegram) ||
        (route.email === "unlinked_only" && recipient.alsoEmailCopy)) &&
      !!recipient.email
    return { recipient, sendSmsThis, sendEmailThis }
  })

  const conversationByUser = await resolveOrCreateConversations(
    planned
      .filter((p) => p.sendSmsThis || p.sendEmailThis)
      .map((p) => p.recipient.userId),
    input.organizationId,
  )

  const messageRows: (typeof conversationMessages.$inferInsert)[] = []
  const senderType = input.initiatorType === "system" ? "system" : input.initiatorType

  for (const { recipient, sendSmsThis, sendEmailThis } of planned) {
    const conversationId = conversationByUser.get(recipient.userId)

    if (sendSmsThis && recipient.phone) {
      try {
        const result = await sendSms({
          to: recipient.phone,
          body: input.body,
          organizationId: input.organizationId,
        })
        if (result.ok) {
          if (conversationId) {
            messageRows.push({
              conversationId,
              organizationId: input.organizationId,
              senderUserId: input.initiatorId ?? null,
              broadcastId: logRow.id,
              targetType: "user",
              channel: "sms",
              direction: "outbound",
              senderType,
              body: input.body,
              externalMessageId: result.messageId,
              deliveredAt: new Date(),
            })
          }
          smsSent++
        } else {
          errors.push(`SMS to ${recipient.userId}: ${result.reason}`)
        }
      } catch (err) {
        errors.push(`SMS to ${recipient.userId}: ${err}`)
      }
    }

    if (sendEmailThis && recipient.email) {
      try {
        const result = await sendEmail({
          to: recipient.email,
          subject: buildEmailSubject(input),
          html: `<p>${input.body.replace(/\n/g, "<br>")}</p>`,
          text: input.body,
        })
        if (result.success) {
          if (conversationId) {
            messageRows.push({
              conversationId,
              organizationId: input.organizationId,
              senderUserId: input.initiatorId ?? null,
              broadcastId: logRow.id,
              targetType: "user",
              channel: "email",
              direction: "outbound",
              senderType,
              body: input.body,
              externalMessageId: result.messageId ?? null,
              deliveredAt: new Date(),
            })
          }
          emailSent++
        } else {
          errors.push(`Email to ${recipient.userId}: ${result.error}`)
        }
      } catch (err) {
        errors.push(`Email to ${recipient.userId}: ${err}`)
      }
    }
  }

  if (messageRows.length > 0) {
    await db.insert(conversationMessages).values(messageRows)
  }

  await db
    .update(broadcastLog)
    .set({
      sentAt: new Date(),
      deliverySummary: {
        telegramGroupPosts,
        smsSent,
        emailSent,
        errors: errors.length,
      },
    })
    .where(eq(broadcastLog.id, logRow.id))

  return {
    broadcastId: logRow.id,
    deduplicated: false,
    telegramGroupPosts,
    smsSent,
    emailSent,
    errors,
  }
}

type Recipient = {
  userId: string
  phone: string | null
  email: string | null
  hasTelegram: boolean
  alsoEmailCopy: boolean
}

type ResolvedRecipients = {
  users: Recipient[]
  initiatorFirstName: string | null
}

/**
 * Resolve the list of parent users to notify.
 *
 * Adaptation: registrations has no teamId column. For team-scoped broadcasts we
 * go through rosters (rosters.teamId → rosters.registrationId → registrations →
 * familyMemberId → familyMemberParents → parentUserId). For org_dm we join
 * teams → seasons → programs to find teams in the org, then follow the same path.
 */
async function resolveRecipients(input: ComposeBroadcastInput): Promise<ResolvedRecipients> {
  const db = getDb()
  let userIds: string[] = []

  if (input.targetType === "org_dm") {
    // Find all parent users with active kids on any team in the org.
    // Traverse: teams.seasonId → seasons.programId → programs.locationId → locations.organizationId
    // Then: teams → rosters → registrations → familyMembers → familyMemberParents
    const rows = await db
      .selectDistinct({ userId: familyMemberParents.parentUserId })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(familyMemberParents, eq(familyMemberParents.familyMemberId, familyMembers.id))
      .innerJoin(teams, eq(rosters.teamId, teams.id))
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .innerJoin(organizations, eq(locations.organizationId, organizations.id))
      .where(
        and(
          eq(organizations.id, input.organizationId),
          eq(familyMemberParents.canReceiveMessages, true),
        ),
      )
    userIds = rows.map((r) => r.userId)
  } else {
    // Team-scoped: go through rosters for each teamId
    const rows = await db
      .selectDistinct({ userId: familyMemberParents.parentUserId })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(familyMemberParents, eq(familyMemberParents.familyMemberId, familyMembers.id))
      .where(
        and(
          inArray(rosters.teamId, input.teamIds),
          eq(familyMemberParents.canReceiveMessages, true),
        ),
      )
    userIds = rows.map((r) => r.userId)
  }

  const initiator = input.initiatorId
    ? await db.query.users.findFirst({ where: eq(users.id, input.initiatorId) })
    : null

  if (userIds.length === 0) {
    return { users: [], initiatorFirstName: initiator?.firstName ?? null }
  }

  const recipientsRaw = await db
    .select({
      userId: users.id,
      phone: users.phone,
      email: users.email,
      telegramChatId: users.telegramChatId,
      alsoEmailCopy: users.alsoEmailCopy,
    })
    .from(users)
    .where(inArray(users.id, userIds))

  return {
    users: recipientsRaw.map((u) => ({
      userId: u.userId,
      phone: u.phone,
      email: u.email,
      hasTelegram: !!u.telegramChatId,
      alsoEmailCopy: u.alsoEmailCopy,
    })),
    initiatorFirstName: initiator?.firstName ?? null,
  }
}

function buildDisplayBody(
  input: ComposeBroadcastInput,
  initiatorFirstName: string | null,
  orgName: string,
): string {
  if (input.initiatorType === "coach" && initiatorFirstName) {
    return `From Coach ${initiatorFirstName}:\n${input.body}`
  }
  if (input.initiatorType === "admin") {
    return `From ${orgName} Admin:\n${input.body}`
  }
  return input.body
}

function buildEmailSubject(input: ComposeBroadcastInput): string {
  switch (input.messageType) {
    case "team_broadcast_general":
      return "Team announcement"
    case "event_change":
      return "Schedule update"
    case "event_cancellation":
      return "Event cancelled"
    case "coach_urgent_override":
      return "URGENT: Team announcement"
    case "day_before_reminder":
      return "Reminder for tomorrow"
    default:
      return "Announcement"
  }
}
