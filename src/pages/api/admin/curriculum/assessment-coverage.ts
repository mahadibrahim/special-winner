import type { APIRoute } from "astro";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teams } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { playerAssessments } from "@/lib/db/schema/assessments";
import { skillDomains } from "@/lib/db/schema/curriculum";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  cadenceThresholdDays,
  summarizeLevelDistribution,
} from "@/lib/curriculum/assessment-cadence";
import { getTeamCadence } from "@/lib/curriculum/assessment-cadence-query";

export const prerender = false;

// Seasons currently being delivered: registration open/closed but running,
// or explicitly active. draft/forming teams aren't practicing; completed/
// cancelled seasons are history.
const RUNNING_SEASON_STATUSES = ["open", "closed", "active"] as const;

// GET - Phase 4 assessment-coverage report. Visibility only (no enforcement,
// no verdicts): per-team staleness buckets + never-assessed flags, and a
// per-coach rollup with a display-only level distribution.
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();
    const now = new Date();

    // Tenant pin: every team is reached through the org's own location chain.
    const teamRows = await db
      .select({
        teamId: teams.id,
        teamName: teams.name,
        seasonName: seasons.name,
        coachUserId: teams.coachUserId,
      })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(
        and(
          eq(locations.organizationId, auth.organizationId),
          inArray(seasons.status, [...RUNNING_SEASON_STATUSES]),
        ),
      )
      .orderBy(asc(teams.name));

    const teamIds = teamRows.map((t) => t.teamId);
    const cadence = await getTeamCadence(db, teamIds, now);
    const cadenceByTeam = new Map(cadence.map((t) => [t.teamId, t]));

    // Coach display names.
    const coachIds = [
      ...new Set(
        teamRows.map((t) => t.coachUserId).filter((x): x is string => !!x),
      ),
    ];
    const coachRows =
      coachIds.length === 0
        ? []
        : await db
            .select({
              id: users.id,
              firstName: users.firstName,
              lastName: users.lastName,
            })
            .from(users)
            .where(inArray(users.id, coachIds));
    const coachNameById = new Map(
      coachRows.map((c) => [
        c.id,
        [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown",
      ]),
    );

    // Level distribution inputs: assessments authored by the org's current
    // coaches on the org's current roster players (playerAssessments.teamId
    // is nullable/often unset, so anchor on author + org players instead).
    const playerIds = [
      ...new Set(cadence.flatMap((t) => t.players.map((p) => p.familyMemberId))),
    ];
    const levelRows =
      coachIds.length === 0 || playerIds.length === 0
        ? []
        : await db
            .select({
              coachUserId: playerAssessments.coachUserId,
              level: playerAssessments.level,
            })
            .from(playerAssessments)
            .where(
              and(
                inArray(playerAssessments.coachUserId, coachIds),
                inArray(playerAssessments.familyMemberId, playerIds),
              ),
            );
    const levelsByCoach = new Map<string, number[]>();
    for (const row of levelRows) {
      const list = levelsByCoach.get(row.coachUserId) ?? [];
      list.push(row.level);
      levelsByCoach.set(row.coachUserId, list);
    }

    const teamsOut = teamRows.map((t) => {
      const players = cadenceByTeam.get(t.teamId)?.players ?? [];
      const bucket = { fresh: 0, due: 0, overdue: 0, never: 0 };
      for (const p of players) bucket[p.worstStatus]++;
      return {
        teamId: t.teamId,
        teamName: t.teamName,
        seasonName: t.seasonName,
        coachUserId: t.coachUserId,
        coachName: t.coachUserId
          ? (coachNameById.get(t.coachUserId) ?? "Unknown")
          : null,
        rosterCount: players.length,
        freshCount: bucket.fresh,
        dueCount: bucket.due,
        overdueCount: bucket.overdue,
        neverCount: bucket.never,
        coveragePct:
          players.length === 0
            ? null
            : Math.round((bucket.fresh / players.length) * 100),
        neverAssessedPlayers: players
          .filter((p) => !p.hasAnyAssessment)
          .map((p) => ({
            familyMemberId: p.familyMemberId,
            name: `${p.firstName} ${p.lastName}`,
          })),
      };
    });

    const coachesOut = coachIds.map((id) => {
      const coachTeams = teamsOut.filter((t) => t.coachUserId === id);
      const playerCount = coachTeams.reduce((s, t) => s + t.rosterCount, 0);
      const freshCount = coachTeams.reduce((s, t) => s + t.freshCount, 0);
      return {
        coachUserId: id,
        coachName: coachNameById.get(id) ?? "Unknown",
        teamCount: coachTeams.length,
        playerCount,
        freshCount,
        coveragePct:
          playerCount === 0 ? null : Math.round((freshCount / playerCount) * 100),
        levelDistribution: summarizeLevelDistribution(
          levelsByCoach.get(id) ?? [],
        ),
      };
    });

    const domainRows = await db
      .select({
        domainId: skillDomains.id,
        displayName: skillDomains.displayName,
        assessmentFrequency: skillDomains.assessmentFrequency,
      })
      .from(skillDomains)
      .orderBy(asc(skillDomains.sortOrder));
    const domains = domainRows.map((d) => ({
      ...d,
      thresholdDays: cadenceThresholdDays(d.assessmentFrequency),
    }));

    return new Response(
      JSON.stringify({
        generatedAt: now.toISOString(),
        domains,
        teams: teamsOut,
        coaches: coachesOut,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error building assessment coverage report:", error);
    return new Response(
      JSON.stringify({ error: "Failed to build assessment coverage report" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
