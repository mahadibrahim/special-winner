import type { APIRoute } from "astro"
import { getDb } from "@/lib/db"
import { teamGroups, teamGroupMemberships, users } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { sendInviteDM } from "@/lib/telegram/group"

export const prerender = false

export const POST: APIRoute = async ({ locals, params }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }
  const teamGroupId = params.teamGroupId
  if (!teamGroupId) {
    return new Response(JSON.stringify({ error: "teamGroupId required" }), { status: 400 })
  }

  const db = getDb()
  const membership = await db.query.teamGroupMemberships.findFirst({
    where: and(
      eq(teamGroupMemberships.teamGroupId, teamGroupId),
      eq(teamGroupMemberships.userId, locals.user.id),
    ),
  })
  if (!membership) {
    return new Response(JSON.stringify({ error: "No prior membership to rejoin" }), { status: 404 })
  }

  await db
    .update(teamGroupMemberships)
    .set({ optedOutAt: null, removedAt: null, lastSyncedAt: new Date() })
    .where(eq(teamGroupMemberships.id, membership.id))

  const group = await db.query.teamGroups.findFirst({ where: eq(teamGroups.id, teamGroupId) })
  const user = await db.query.users.findFirst({ where: eq(users.id, locals.user.id) })
  if (group?.status === "active" && group.telegramChatId && user?.telegramChatId && group.inviteLink) {
    try {
      await sendInviteDM(user.telegramChatId, group.name, group.inviteLink)
    } catch (err) {
      console.warn(`[rejoin] invite DM failed:`, err)
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
