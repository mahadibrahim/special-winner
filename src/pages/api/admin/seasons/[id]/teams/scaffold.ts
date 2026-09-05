import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { teams, seasons, programs, ageGroups, locations } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { bulkCreateTeams } from "@/lib/seasons/scaffold";

/**
 * POST /api/admin/seasons/:id/teams/scaffold
 *
 * Bulk-creates placeholder teams on an EXISTING season. Previously this was
 * only possible at season-creation time (see `bulkCreateTeams` usage in
 * `admin/seasons.ts`) — this endpoint reuses the same helper so a season
 * that already went live with zero teams can be backfilled.
 *
 * Idempotency note: calling this twice on the same season ADDS more teams
 * rather than replacing the existing set (matches the pre-existing
 * scaffold-at-creation semantics). Under the default naming convention
 * (no `namePrefix`), numbering CONTINUES from the season's existing team
 * count rather than restarting at "Team 1" — the pre-insert count is read
 * inside the same transaction as the insert so two concurrent calls can't
 * interleave a stale count and collide on numbers. The response carries
 * `createdTeamIds` and `totalTeams` so the caller/UI can warn before a
 * second call.
 */
const scaffoldTeamsSchema = z.object({
  count: z.number().int().min(1).max(26),
  maxRosterSize: z.number().int().positive().nullable(),
  namePrefix: z.string().min(1).optional(),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const { id: seasonId } = context.params;
  if (!seasonId) {
    return new Response(JSON.stringify({ error: "Season ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await context.request.json().catch(() => ({}));
  const result = scaffoldTeamsSchema.safeParse(body);
  if (!result.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }
  const { count, maxRosterSize, namePrefix } = result.data;

  try {
    // Season -> program -> location.organizationId, joined with the
    // program's name and (optional) age group's name for the default team
    // name prefix — same tenant-join shape as games.ts/teams.ts.
    const [row] = await getDb()
      .select({
        seasonId: seasons.id,
        programName: programs.name,
        ageGroupId: seasons.ageGroupId,
        organizationId: locations.organizationId,
      })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(
        and(eq(seasons.id, seasonId), eq(locations.organizationId, orgContext.organizationId)),
      )
      .limit(1); // seasons.id is a PK — at most one row

    if (!row) {
      return new Response(JSON.stringify({ error: "Season not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    let ageGroupName: string | null = null;
    if (row.ageGroupId) {
      const [ag] = await getDb()
        .select({ name: ageGroups.name })
        .from(ageGroups)
        .where(eq(ageGroups.id, row.ageGroupId))
        .limit(1); // ageGroups.id is a PK — at most one row
      ageGroupName = ag?.name ?? null;
    }

    const createdTeams = await getDb().transaction(async (tx) => {
      // Lock the season row first so two concurrent scaffold calls on the
      // same season serialize instead of both reading the same pre-insert
      // count under READ COMMITTED — mirrors the FOR UPDATE capacity-gate
      // pattern used elsewhere (classes/enrollment.ts, rentals/blocks).
      await tx.select({ id: seasons.id }).from(seasons).where(eq(seasons.id, seasonId)).for("update");

      // Read the pre-insert count INSIDE the (now-serialized) transaction so
      // a repeat call continues numbering instead of restarting at Team 1.
      const existing = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.seasonId, seasonId));

      return bulkCreateTeams(tx, {
        targetSeasonId: seasonId,
        count,
        programName: row.programName,
        ageGroupName,
        maxRosterSize,
        namePrefix,
        startIndex: existing.length,
      });
    });

    const allTeamsForSeason = await getDb()
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.seasonId, seasonId))
      .orderBy(asc(teams.createdAt));

    return new Response(
      JSON.stringify({
        createdTeamIds: createdTeams.map((t) => t.id),
        totalTeams: allTeamsForSeason.length,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error scaffolding teams onto season:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
