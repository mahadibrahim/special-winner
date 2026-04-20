import type { APIRoute } from "astro"
import { z } from "zod"
import { getDb } from "@/lib/db"
import {
  teamGroups,
  teams,
  seasons,
  programs,
  locations,
  organizations,
  sports,
} from "@/lib/db/schema"
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

  // Find existing non-archived group for this team
  let targetId: string | undefined
  const existing = await db.query.teamGroups.findFirst({
    where: and(eq(teamGroups.teamId, teamId), ne(teamGroups.status, "archived")),
  })
  if (existing) {
    if (existing.status === "active") {
      return new Response(
        JSON.stringify({ error: "Team group is already active" }),
        { status: 409 },
      )
    }
    targetId = existing.id
  } else {
    // No row yet — create one on the fly (admin is manually initializing the
    // group for a team that never triggered scheduleGroupCreation, e.g. a
    // team with no roster yet).
    const [teamRow] = await db
      .select({
        teamName: teams.name,
        seasonId: teams.seasonId,
        programId: seasons.programId,
        audienceType: programs.audienceType,
        programName: programs.name,
        sportName: sports.name,
        orgId: locations.organizationId,
        orgSlug: organizations.slug,
        seasonName: seasons.name,
      })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .leftJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .innerJoin(organizations, eq(locations.organizationId, organizations.id))
      .where(eq(teams.id, teamId))
      .limit(1)

    if (!teamRow) {
      return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 })
    }

    const name = `${teamRow.orgSlug} ${teamRow.sportName ?? teamRow.programName} ${teamRow.teamName} — ${teamRow.seasonName} ${
      teamRow.audienceType === "players" ? "Players" : "Parents"
    }`.slice(0, 128)

    const [row] = await db
      .insert(teamGroups)
      .values({
        teamId,
        programId: teamRow.programId,
        organizationId: teamRow.orgId,
        audienceType: teamRow.audienceType,
        name,
        status: "pending_manual_creation",
      })
      .returning({ id: teamGroups.id })
    targetId = row.id
  }

  try {
    await promoteGroupToActive(targetId!, parsed.data.telegramChatId)
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Promotion failed", details: String(err) }),
      { status: 500 },
    )
  }

  return new Response(JSON.stringify({ ok: true, teamGroupId: targetId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
