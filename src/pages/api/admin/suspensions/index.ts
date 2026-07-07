/**
 * GET /api/admin/suspensions?status=<...>&teamId=<uuid>
 *
 * Admin read surface for the ejection/suspension tracker (product-backlog
 * build #4). super_admin sees every suspension in the resolved org;
 * location_admin is scoped to the venues covered by getLocationIdsForUser —
 * same pattern as /api/admin/incidents. NOT super-admin-only at the route
 * level (see src/middleware.ts) so location_admin can see their own teams'
 * suspensions.
 *
 * Surfaces each person's total ejection count in the org (case-insensitive
 * match on gameIncidents.player) so the director can decide whether to
 * escalate a repeat offender to 'season'/'permanent' — there is no
 * hardcoded auto-escalation threshold in v1.
 */
import type { APIRoute } from "astro";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { suspensions, suspensionStatusEnum } from "@/lib/db/schema/suspensions";
import { teams, games, gameIncidents } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const url = new URL(context.request.url);
  const statusParam = url.searchParams.get("status");
  const teamIdParam = url.searchParams.get("teamId");

  type SuspensionStatus = (typeof suspensionStatusEnum.enumValues)[number];
  const statusValues: readonly string[] = suspensionStatusEnum.enumValues;
  if (statusParam && !statusValues.includes(statusParam)) {
    return json({ error: "Invalid status filter" }, 400);
  }

  const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");

  const conditions = [eq(suspensions.organizationId, auth.organizationId)];
  if (statusParam) {
    conditions.push(eq(suspensions.status, statusParam as SuspensionStatus));
  }
  if (teamIdParam) {
    conditions.push(eq(suspensions.teamId, teamIdParam));
  }
  if (!isSuperAdmin) {
    const allowedLocationIds = await getLocationIdsForUser(auth.user.id);
    if (allowedLocationIds.length === 0) {
      return json({ suspensions: [] }, 200);
    }
    conditions.push(inArray(locations.id, allowedLocationIds));
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: suspensions.id,
        personName: suspensions.personName,
        teamId: suspensions.teamId,
        teamName: teams.name,
        reason: suspensions.reason,
        gamesMissed: suspensions.gamesMissed,
        gamesServed: suspensions.gamesServed,
        status: suspensions.status,
        escalatedToDirector: suspensions.escalatedToDirector,
        notes: suspensions.notes,
        createdAt: suspensions.createdAt,
        incidentGameId: gameIncidents.gameId,
        incidentMinute: gameIncidents.minute,
        incidentSide: gameIncidents.side,
      })
      .from(suspensions)
      .innerJoin(teams, eq(suspensions.teamId, teams.id))
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .innerJoin(gameIncidents, eq(suspensions.gameIncidentId, gameIncidents.id))
      .where(and(...conditions))
      .orderBy(desc(suspensions.createdAt));

    // Per-person ejection count/history in this org — case-insensitive match
    // on the free-text player/personName (no roster FK in v1). Computed as a
    // single grouped query over the distinct names in this result page
    // rather than a correlated subquery per row.
    const personNames = Array.from(new Set(rows.map((r) => r.personName.toLowerCase())));
    const ejectionCounts = new Map<string, number>();
    if (personNames.length > 0) {
      const countRows = await db
        .select({
          personNameLower: sql<string>`lower(${gameIncidents.player})`,
          count: sql<number>`count(*)::int`,
        })
        .from(gameIncidents)
        .innerJoin(games, eq(gameIncidents.gameId, games.id))
        .innerJoin(seasons, eq(games.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(
          and(
            eq(gameIncidents.type, "ejection"),
            eq(locations.organizationId, auth.organizationId),
            inArray(sql`lower(${gameIncidents.player})`, personNames),
          ),
        )
        .groupBy(sql`lower(${gameIncidents.player})`);
      for (const cr of countRows) {
        ejectionCounts.set(cr.personNameLower, cr.count);
      }
    }

    const result = rows.map((r) => ({
      ...r,
      ejectionCount: ejectionCounts.get(r.personName.toLowerCase()) ?? 0,
    }));

    return json({ suspensions: result }, 200);
  } catch (error) {
    console.error("Error listing suspensions:", error);
    return json({ error: "Failed to list suspensions" }, 500);
  }
};
