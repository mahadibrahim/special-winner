import { describe, it, expect } from "vitest"
import { getDb } from "@/lib/db"
import { users } from "@/lib/db/schema/users"
import { familyMembers, registrations } from "@/lib/db/schema/registrations"
import { familyMemberParents } from "@/lib/db/schema/family-member-parents"
import { rosters } from "@/lib/db/schema/teams"
import { teamGroups, teamGroupMemberships } from "@/lib/db/schema/team-groups"
import { eq } from "drizzle-orm"
import {
  syncWhatsAppGroupMembership,
  computeExpectedWhatsAppMembership,
} from "@/lib/messaging/team-group-sync"
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context"
import type { ZernioClient } from "@/lib/zernio/messaging"

/**
 * Records the phone numbers handed to addGroupParticipants so the test can
 * assert the roster's phones were pushed to the group in E.164. Dependency
 * injection — no Zernio network calls. Only the methods the sync touches are
 * implemented; the rest throw if reached.
 */
function fakeZernio(): { client: ZernioClient; added: string[] } {
  const added: string[] = []
  const client = {
    async addGroupParticipants(input: { groupId: string; phoneNumbers: string[] }) {
      added.push(...input.phoneNumbers)
    },
    async sendInboxMessage() {
      throw new Error("sendInboxMessage not expected")
    },
    async createWhatsAppGroup() {
      throw new Error("createWhatsAppGroup not expected")
    },
    async createGroupInviteLink() {
      throw new Error("createGroupInviteLink not expected")
    },
  } as unknown as ZernioClient
  return { client, added }
}

/** Seed one active-roster parent (with optional phone) on the given team/season. */
async function seedRosterParent(opts: {
  seasonId: string
  teamId: string
  phone: string | null
  canReceiveMessages?: boolean
}): Promise<string> {
  const db = getDb()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`

  const [user] = await db
    .insert(users)
    .values({ email: `wa-parent-${stamp}@test.aspiresports.com`, phone: opts.phone })
    .returning()

  const [member] = await db
    .insert(familyMembers)
    .values({
      parentUserId: user.id,
      firstName: "Kid",
      lastName: stamp.slice(-6),
      birthDate: "2015-01-01",
    })
    .returning()

  await db.insert(familyMemberParents).values({
    familyMemberId: member.id,
    parentUserId: user.id,
    canReceiveMessages: opts.canReceiveMessages ?? true,
  })

  const [registration] = await db
    .insert(registrations)
    .values({
      seasonId: opts.seasonId,
      familyMemberId: member.id,
      registeredByUserId: user.id,
      status: "confirmed",
      amountDueCents: 0,
    })
    .returning()

  await db.insert(rosters).values({
    teamId: opts.teamId,
    registrationId: registration.id,
    status: "active",
  })

  return user.id
}

/** Create an active team_groups row already provisioned with a whatsapp chat id. */
async function seedActiveWhatsAppGroup(ctx: {
  organizationId: string
  programId: string
  homeTeamId: string
}): Promise<string> {
  const db = getDb()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
  const [group] = await db
    .insert(teamGroups)
    .values({
      teamId: ctx.homeTeamId,
      programId: ctx.programId,
      organizationId: ctx.organizationId,
      audienceType: "parents",
      name: `WA Test Group ${stamp}`,
      status: "active",
      whatsappChatId: `wa-chat-${stamp}`,
      createdAt: new Date(),
    })
    .returning()
  return group.id
}

describe("syncWhatsAppGroupMembership", () => {
  it("pushes active-roster phones to the group in E.164 and records joined memberships", async () => {
    const ctx = await createAdminOrgGameContext({ audienceType: "parents" })
    const userId = await seedRosterParent({
      seasonId: ctx.seasonId,
      teamId: ctx.homeTeamId,
      phone: "(614) 555-0182",
    })
    const groupId = await seedActiveWhatsAppGroup(ctx)

    const { client, added } = fakeZernio()
    const result = await syncWhatsAppGroupMembership(groupId, client)

    expect(result.added).toContain(userId)
    expect(added).toContain("+16145550182")

    const db = getDb()
    const memberships = await db
      .select()
      .from(teamGroupMemberships)
      .where(eq(teamGroupMemberships.teamGroupId, groupId))
    const mine = memberships.find((m) => m.userId === userId)
    expect(mine).toBeDefined()
    expect(mine?.joinedAt).not.toBeNull()
    expect(mine?.role).toBe("parent")
  })

  it("is idempotent — a second sync adds nothing and reports already_member", async () => {
    const ctx = await createAdminOrgGameContext({ audienceType: "parents" })
    const userId = await seedRosterParent({
      seasonId: ctx.seasonId,
      teamId: ctx.homeTeamId,
      phone: "614-555-0199",
    })
    const groupId = await seedActiveWhatsAppGroup(ctx)

    const first = await syncWhatsAppGroupMembership(groupId, fakeZernio().client)
    expect(first.added).toContain(userId)

    const { client, added } = fakeZernio()
    const second = await syncWhatsAppGroupMembership(groupId, client)
    expect(second.added).not.toContain(userId)
    expect(added).toHaveLength(0)
    expect(second.skipped).toEqual(
      expect.arrayContaining([{ userId, reason: "already_member" }]),
    )
  })

  it("skips a roster member with no phone on file", async () => {
    const ctx = await createAdminOrgGameContext({ audienceType: "parents" })
    const withPhone = await seedRosterParent({
      seasonId: ctx.seasonId,
      teamId: ctx.homeTeamId,
      phone: "6145550111",
    })
    const noPhone = await seedRosterParent({
      seasonId: ctx.seasonId,
      teamId: ctx.homeTeamId,
      phone: null,
    })
    const groupId = await seedActiveWhatsAppGroup(ctx)

    const result = await syncWhatsAppGroupMembership(groupId, fakeZernio().client)

    expect(result.added).toContain(withPhone)
    // No phone → never surfaces in the expected set at all.
    expect(result.added).not.toContain(noPhone)
    const expected = await computeExpectedWhatsAppMembership(groupId)
    expect(expected.map((e) => e.userId)).not.toContain(noPhone)
  })

  it("no-ops on a group that is not active or has no whatsapp chat id", async () => {
    const ctx = await createAdminOrgGameContext({ audienceType: "parents" })
    await seedRosterParent({
      seasonId: ctx.seasonId,
      teamId: ctx.homeTeamId,
      phone: "6145550133",
    })
    const db = getDb()
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
    const [scheduled] = await db
      .insert(teamGroups)
      .values({
        teamId: ctx.homeTeamId,
        programId: ctx.programId,
        organizationId: ctx.organizationId,
        audienceType: "parents",
        name: `WA Scheduled ${stamp}`,
        status: "scheduled",
      })
      .returning()

    const { client, added } = fakeZernio()
    const result = await syncWhatsAppGroupMembership(scheduled.id, client)
    expect(result).toEqual({ added: [], skipped: [] })
    expect(added).toHaveLength(0)
  })
})
