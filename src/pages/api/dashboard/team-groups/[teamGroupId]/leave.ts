import type { APIRoute } from "astro"
import { getDb } from "@/lib/db"
import { teamGroups, teamGroupMemberships, users } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { removeMember } from "@/lib/telegram/group"

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
    return new Response(JSON.stringify({ error: "Not a member of this group" }), { status: 404 })
  }

  const group = await db.query.teamGroups.findFirst({ where: eq(teamGroups.id, teamGroupId) })
  const user = await db.query.users.findFirst({ where: eq(users.id, locals.user.id) })

  if (group?.telegramChatId && user?.telegramChatId) {
    try {
      await removeMember(group.telegramChatId, user.telegramChatId)
    } catch (err) {
      console.warn(`[leave] telegram remove failed:`, err)
    }
  }

  await db
    .update(teamGroupMemberships)
    .set({ optedOutAt: new Date(), removedAt: new Date(), lastSyncedAt: new Date() })
    .where(eq(teamGroupMemberships.id, membership.id))

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
