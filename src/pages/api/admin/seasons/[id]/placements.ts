import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { teams, seasons, programs, locations, registrations, rosters } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { triggerTeamGroupSync } from "@/pages/api/admin/rosters";

/**
 * POST /api/admin/seasons/:id/placements
 *
 * Transactional batch-publish for the roster placement planner. Draft
 * placements live entirely client-side (see draft-placements.ts) until the
 * admin hits "publish" — this endpoint is the only place they become real
 * `rosters` rows.
 *
 * All-or-nothing: every assignment in the batch is validated against a
 * single consistent snapshot of the season's teams/counts/rostered-registration
 * set taken inside the transaction (after locking the season row), and if
 * ANY assignment is invalid the whole batch is rejected with a 422 and a
 * per-assignment error list — nothing is written. There is no DB constraint
 * that would catch a season-wide duplicate placement (the `rosters` unique
 * index is (teamId, registrationId) only, not registrationId alone), so
 * that check has to happen here, inside the transaction, against the locked
 * snapshot.
 *
 * The `FOR UPDATE` lock taken on the season row below is the SAME lock
 * taken by `teams/scaffold.ts` (bulk team creation) and by the legacy
 * single-add `POST /api/admin/rosters` (`rosters.ts`) — all three call
 * sites that can add roster rows or teams to a season serialize against
 * each other through this one row lock. Without it, this batch publish and
 * a concurrent legacy single-add could each read the same pre-write roster
 * count under READ COMMITTED and both believe a capped team has room,
 * overshooting `maxRosterSize` (no DB constraint would catch that either).
 */
const assignmentSchema = z.object({
  registrationId: z.string().uuid("Valid registration ID is required"),
  teamId: z.string().uuid("Valid team ID is required"),
});

const placementsSchema = z.object({
  assignments: z.array(assignmentSchema).max(500, "Batch is limited to 500 assignments"),
});

type ValidationError = { registrationId: string; reason: string };

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
  const parsed = placementsSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }
  const { assignments } = parsed.data;

  const db = getDb();

  try {
    // Org-scoped season existence check, same tenant-join shape as
    // games.ts/teams.ts/scaffold.ts/placement.ts (GET). Do this OUTSIDE the
    // transaction so a cross-org id 404s without ever taking the row lock.
    const [seasonRow] = await db
      .select({ seasonId: seasons.id })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(
        and(eq(seasons.id, seasonId), eq(locations.organizationId, orgContext.organizationId)),
      )
      .limit(1); // seasons.id is a PK — at most one row

    if (!seasonRow) {
      return new Response(JSON.stringify({ error: "Season not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const txResult = await db.transaction(async (tx) => {
      // Lock the season row first so a concurrent publish, a P2-style team
      // scaffold, OR a legacy single roster add (admin/rosters.ts POST,
      // which takes this same lock) on the same season serializes against
      // this one instead of both reading the same pre-write snapshot under
      // READ COMMITTED.
      await tx.select({ id: seasons.id }).from(seasons).where(eq(seasons.id, seasonId)).for("update");

      // This season's teams + their max sizes.
      const teamRows = await tx
        .select({ id: teams.id, maxRosterSize: teams.maxRosterSize })
        .from(teams)
        .where(eq(teams.seasonId, seasonId));
      const teamById = new Map(teamRows.map((t) => [t.id, t]));
      const teamIds = teamRows.map((t) => t.id);

      // Current published roster counts per team, and the set of
      // registrations already rostered anywhere in this season — both
      // read from the same locked snapshot.
      const countRows =
        teamIds.length > 0
          ? await tx
              .select({ teamId: rosters.teamId, count: sql<number>`count(*)::int` })
              .from(rosters)
              .where(inArray(rosters.teamId, teamIds))
              .groupBy(rosters.teamId)
          : [];
      const runningCountByTeam = new Map<string, number>(teamIds.map((id) => [id, 0]));
      for (const c of countRows) runningCountByTeam.set(c.teamId, Number(c.count));

      const rosteredRows =
        teamIds.length > 0
          ? await tx
              .select({ registrationId: rosters.registrationId })
              .from(rosters)
              .where(inArray(rosters.teamId, teamIds))
          : [];
      const alreadyRosteredInSeason = new Set(rosteredRows.map((r) => r.registrationId));

      // Registrations referenced anywhere in the batch — one query for all
      // of them rather than one per assignment.
      const regIds = [...new Set(assignments.map((a) => a.registrationId))];
      const regRows =
        regIds.length > 0
          ? await tx
              .select({ id: registrations.id, seasonId: registrations.seasonId, status: registrations.status })
              .from(registrations)
              .where(inArray(registrations.id, regIds))
          : [];
      const regById = new Map(regRows.map((r) => [r.id, r]));

      const errors: ValidationError[] = [];
      const valid: Array<{ registrationId: string; teamId: string }> = [];
      const seenRegIds = new Set<string>();

      for (const a of assignments) {
        // In-batch duplicate: every occurrence after the first is flagged,
        // regardless of which team it targets.
        if (seenRegIds.has(a.registrationId)) {
          errors.push({
            registrationId: a.registrationId,
            reason: "Duplicate registration within this batch",
          });
          continue;
        }
        seenRegIds.add(a.registrationId);

        const team = teamById.get(a.teamId);
        if (!team) {
          errors.push({ registrationId: a.registrationId, reason: "Team not found in this season" });
          continue;
        }

        const reg = regById.get(a.registrationId);
        if (!reg || reg.seasonId !== seasonId) {
          errors.push({
            registrationId: a.registrationId,
            reason: "Registration not found in this season",
          });
          continue;
        }

        if (reg.status !== "confirmed") {
          errors.push({
            registrationId: a.registrationId,
            reason: `Registration status is '${reg.status}', not confirmed`,
          });
          continue;
        }

        if (alreadyRosteredInSeason.has(a.registrationId)) {
          errors.push({
            registrationId: a.registrationId,
            reason: "Registration is already rostered onto a team in this season",
          });
          continue;
        }

        const currentLoad = runningCountByTeam.get(a.teamId) ?? 0;
        if (team.maxRosterSize != null && currentLoad + 1 > team.maxRosterSize) {
          errors.push({
            registrationId: a.registrationId,
            reason: `Team roster is full (max ${team.maxRosterSize})`,
          });
          continue;
        }

        runningCountByTeam.set(a.teamId, currentLoad + 1);
        valid.push(a);
      }

      if (errors.length > 0) {
        // Nothing written — returning here without inserting still commits
        // the (empty) transaction, which is fine: releasing the season lock
        // with no writes has the same observable effect as a rollback.
        return { ok: false as const, errors };
      }

      if (valid.length > 0) {
        await tx.insert(rosters).values(
          valid.map((a) => ({
            teamId: a.teamId,
            registrationId: a.registrationId,
            status: "active" as const,
          })),
        );
      }

      const affectedTeamIds = [...new Set(valid.map((a) => a.teamId))];
      const teamCounts = affectedTeamIds.map((teamId) => ({
        teamId,
        newCount: runningCountByTeam.get(teamId) ?? 0,
      }));

      return { ok: true as const, teams: teamCounts };
    });

    if (!txResult.ok) {
      return new Response(JSON.stringify({ errors: txResult.errors }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fire-and-forget Telegram sync, once per distinct affected team — after
    // commit, never blocking the response (mirrors admin/rosters.ts:198's
    // POST handler).
    for (const { teamId } of txResult.teams) {
      triggerTeamGroupSync(teamId).catch((err) => {
        console.warn(`Team group sync failed for team ${teamId}:`, err);
      });
    }

    return new Response(JSON.stringify({ teams: txResult.teams }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error publishing placements:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
