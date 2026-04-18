import type { APIRoute } from "astro"
import { z } from "zod"
import { getDb } from "@/lib/db"
import { teamGroups } from "@/lib/db/schema"
import { and, eq, ne } from "drizzle-orm"
import { requireAdminAccess } from "@/lib/auth"
import { promoteGroupToActive } from "@/lib/messaging/group-lifecycle"

export const prerender = false

const PromoteSchema = z.object({
  telegramChatId: z.string().min(1).max(100),
})

export const POST: APIRoute = async (context) => {
  const adminAuth = await requireAdminAccess(context)
  if (!adminAuth.authorized) return adminAuth.response

  const teamId = context.params.teamId
  if (!teamId) {
    return new Response(JSON.stringify({ error: "teamId required" }), { status: 400 })
  }

  let raw: unknown
  try { raw = await context.request.json() } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 })
  }
  const parsed = PromoteSchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid payload", details: parsed.error.format() }),
      { status: 400 },
    )
  }

  const db = getDb()
  const pending = await db.query.teamGroups.findFirst({
    where: and(eq(teamGroups.teamId, teamId), ne(teamGroups.status, "archived")),
  })
  if (!pending) {
    return new Response(JSON.stringify({ error: "No team group for this team" }), { status: 404 })
  }
  if (pending.status === "active") {
    return new Response(JSON.stringify({ error: "Team group is already active" }), { status: 409 })
  }

  try {
    await promoteGroupToActive(pending.id, parsed.data.telegramChatId)
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Promotion failed", details: String(err) }),
      { status: 500 },
    )
  }

  return new Response(JSON.stringify({ ok: true, teamGroupId: pending.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
