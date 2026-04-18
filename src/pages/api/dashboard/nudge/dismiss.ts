import type { APIRoute } from "astro"
import { z } from "zod"
import { getDb } from "@/lib/db"
import { userNudgeState } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"

export const prerender = false

const ALLOWED_NUDGE_KEYS = ["telegram_connect_banner"] as const

const DismissSchema = z.object({
  nudgeKey: z.enum(ALLOWED_NUDGE_KEYS),
})

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  let raw: unknown
  try { raw = await request.json() } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 })
  }
  const parsed = DismissSchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 })
  }

  const db = getDb()
  const existing = await db.query.userNudgeState.findFirst({
    where: and(
      eq(userNudgeState.userId, locals.user.id),
      eq(userNudgeState.nudgeKey, parsed.data.nudgeKey),
    ),
  })

  if (!existing) {
    await db.insert(userNudgeState).values({
      userId: locals.user.id,
      nudgeKey: parsed.data.nudgeKey,
      lastDismissedAt: new Date(),
      dismissalCount: 1,
    })
  } else {
    await db
      .update(userNudgeState)
      .set({
        lastDismissedAt: new Date(),
        dismissalCount: sql`${userNudgeState.dismissalCount} + 1`,
      })
      .where(eq(userNudgeState.id, existing.id))
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
