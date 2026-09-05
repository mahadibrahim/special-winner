import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  teams,
  seasons,
  programs,
  locations,
  ageGroups,
  registrations,
  familyMembers,
  rosters,
  users,
} from "@/lib/db/schema";
import { eq, and, asc, sql, inArray, notInArray } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { ageOnDate } from "@/lib/classes/book-child";

/**
 * GET /api/admin/seasons/:id/placement
 *
 * Data endpoint for the roster placement planner: the season's teams (with
 * current roster counts + coach) and the pool of confirmed registrations
 * that have not yet been rostered onto any team in this season ("unplaced").
 *
 * Draft placements produced client-side by `draftPlacements`
 * (`src/lib/leagues/draft-placements.ts`) are never persisted here — this
 * endpoint only reads. Publishing goes through the sibling POST
 * `/api/admin/seasons/:id/placements` endpoint.
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
    // as games.ts/teams.ts/scaffold.ts.
    const [row] = await db
      .select({
        seasonId: seasons.id,
        seasonName: seasons.name,
        ageGroupId: seasons.ageGroupId,
        divisionGender: seasons.divisionGender,
        skillLevel: seasons.skillLevel,
        audienceType: programs.audienceType,
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
      const [ag] = await db
        .select({ name: ageGroups.name })
        .from(ageGroups)
        .where(eq(ageGroups.id, row.ageGroupId))
        .limit(1); // ageGroups.id is a PK — at most one row
      ageGroupName = ag?.name ?? null;
    }

    // Teams for this season, with coach name (left join — coach is
    // optional) and roster counts (grouped query, mirrors teams.ts:113-135
    // instead of one count query per team).
    const teamRows = await db
      .select({
        teamId: teams.id,
        name: teams.name,
        maxRosterSize: teams.maxRosterSize,
        coachUserId: teams.coachUserId,
        coachFirstName: users.firstName,
        coachLastName: users.lastName,
      })
      .from(teams)
      .leftJoin(users, eq(teams.coachUserId, users.id))
      .where(eq(teams.seasonId, seasonId))
      .orderBy(asc(teams.name));

    const teamIds = teamRows.map((t) => t.teamId);
    const counts =
      teamIds.length > 0
        ? await db
            .select({ teamId: rosters.teamId, count: sql<number>`count(*)::int` })
            .from(rosters)
            .where(inArray(rosters.teamId, teamIds))
            .groupBy(rosters.teamId)
        : [];
    const countByTeam = new Map(counts.map((c) => [c.teamId, Number(c.count)]));

    const teamsResult = teamRows.map((t) => ({
      teamId: t.teamId,
      name: t.name,
      currentCount: countByTeam.get(t.teamId) ?? 0,
      maxRosterSize: t.maxRosterSize,
      coachUserId: t.coachUserId,
      coachName: t.coachUserId
        ? `${t.coachFirstName ?? ""} ${t.coachLastName ?? ""}`.trim() || null
        : null,
    }));

    // Unplaced = confirmed registrations of this season minus any already
    // rostered onto a team in this season — done in SQL via a NOT IN
    // subquery (the JS-filter version lives at admin/rosters.ts:83-96), so
    // it stays correct as the season grows instead of pulling every roster
    // row into JS to diff.
    const rosteredInSeason = db
      .select({ registrationId: rosters.registrationId })
      .from(rosters)
      .innerJoin(teams, eq(rosters.teamId, teams.id))
      .where(eq(teams.seasonId, seasonId));

    const unplacedRows = await db
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
      .where(
        and(
          eq(registrations.seasonId, seasonId),
          eq(registrations.status, "confirmed"),
          notInArray(registrations.id, rosteredInSeason),
        ),
      )
      .orderBy(asc(registrations.createdAt));

    const now = new Date();
    const unplaced = unplacedRows.map((r) => ({
      registrationId: r.registrationId,
      familyMemberId: r.familyMemberId,
      birthDate: r.birthDate,
      gender: r.gender,
      childName: `${r.childFirstName} ${r.childLastName}`,
      age: r.birthDate ? ageOnDate(r.birthDate, now) : null,
    }));

    return new Response(
      JSON.stringify({
        season: {
          id: row.seasonId,
          name: row.seasonName,
          ageGroupName,
          divisionGender: row.divisionGender,
          skillLevel: row.skillLevel,
          audienceType: row.audienceType,
        },
        teams: teamsResult,
        unplaced,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error fetching placement planner data:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
