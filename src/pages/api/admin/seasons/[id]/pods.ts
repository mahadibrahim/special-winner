import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  teams,
  seasons,
  programs,
  locations,
  registrations,
  familyMembers,
  rosters,
  playerSkillSummary,
} from "@/lib/db/schema";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";

/**
 * GET /api/admin/seasons/:id/pods
 *
 * Bootstrap endpoint for the camp-group planner (Task 4 of the
 * 2026-09-06-camps-phase4 plan). Mirrors the league placement GET
 * (`placement.ts`) but for camp seasons:
 *
 * - 404 unless the season is same-org AND `programType='camp'` — the
 *   planner (and its full-replace publish semantics) exist only for camps.
 * - `candidates` = ALL confirmed registrations of the season (including
 *   already-grouped ones — unlike leagues, the camp planner full-replaces
 *   membership, so every camper is always adjustable). `skillScore` is the
 *   avg of `player_skill_summary.currentLevel` per family member, computed
 *   in ONE grouped query (no N+1); null = never assessed.
 * - `pods` = the season's teams plus current published roster membership.
 *
 * Nothing is written here — publishing goes through the sibling POST
 * `/api/admin/seasons/:id/pod-placements`.
 */
export const GET: APIRoute = async (context) => {
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

  const db = getDb();

  try {
    // Season -> program -> location.organizationId — same tenant-join shape
    // as placement.ts/scaffold.ts. The camp gate lives in the WHERE clause so
    // a non-camp season is indistinguishable from a missing one (404).
    const [row] = await db
      .select({
        seasonId: seasons.id,
        seasonName: seasons.name,
        formationStrategy: seasons.formationStrategy,
        programType: programs.programType,
      })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(
        and(
          eq(seasons.id, seasonId),
          eq(locations.organizationId, orgContext.organizationId),
          eq(programs.programType, "camp"),
        ),
      )
      .limit(1); // seasons.id is a PK — at most one row

    if (!row) {
      return new Response(JSON.stringify({ error: "Season not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Candidates: every confirmed registration of the season with the
    // camper's identity fields.
    const candidateRows = await db
      .select({
        registrationId: registrations.id,
        familyMemberId: registrations.familyMemberId,
        birthDate: familyMembers.birthDate,
        gender: familyMembers.gender,
        childFirstName: familyMembers.firstName,
        childLastName: familyMembers.lastName,
      })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .where(and(eq(registrations.seasonId, seasonId), eq(registrations.status, "confirmed")))
      .orderBy(asc(registrations.createdAt));

    // Skill scores: ONE grouped avg over player_skill_summary for all
    // candidate family members (no per-candidate query).
    const memberIds = [...new Set(candidateRows.map((c) => c.familyMemberId))];
    const skillRows =
      memberIds.length > 0
        ? await db
            .select({
              familyMemberId: playerSkillSummary.familyMemberId,
              avgLevel: sql<number>`avg(${playerSkillSummary.currentLevel})::float`,
            })
            .from(playerSkillSummary)
            .where(inArray(playerSkillSummary.familyMemberId, memberIds))
            .groupBy(playerSkillSummary.familyMemberId)
        : [];
    const skillByMember = new Map(skillRows.map((r) => [r.familyMemberId, Number(r.avgLevel)]));

    const candidates = candidateRows.map((c) => ({
      registrationId: c.registrationId,
      familyMemberId: c.familyMemberId,
      birthDate: c.birthDate,
      gender: c.gender,
      skillScore: skillByMember.get(c.familyMemberId) ?? null,
      childName: `${c.childFirstName} ${c.childLastName}`,
    }));

    // Pods: the season's teams + current published roster membership.
    const teamRows = await db
      .select({ teamId: teams.id, name: teams.name, maxRosterSize: teams.maxRosterSize })
      .from(teams)
      .where(eq(teams.seasonId, seasonId))
      .orderBy(asc(teams.name));

    const teamIds = teamRows.map((t) => t.teamId);
    const memberRows =
      teamIds.length > 0
        ? await db
            .select({ teamId: rosters.teamId, registrationId: rosters.registrationId })
            .from(rosters)
            .where(inArray(rosters.teamId, teamIds))
            .orderBy(asc(rosters.createdAt))
        : [];
    const membersByTeam = new Map<string, string[]>(teamIds.map((id) => [id, []]));
    for (const m of memberRows) membersByTeam.get(m.teamId)?.push(m.registrationId);

    const pods = teamRows.map((t) => ({
      teamId: t.teamId,
      name: t.name,
      maxRosterSize: t.maxRosterSize,
      memberRegistrationIds: membersByTeam.get(t.teamId) ?? [],
    }));

    return new Response(
      JSON.stringify({
        season: {
          id: row.seasonId,
          name: row.seasonName,
          formationStrategy: row.formationStrategy,
          programType: row.programType,
        },
        candidates,
        pods,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error fetching camp-group planner data:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
