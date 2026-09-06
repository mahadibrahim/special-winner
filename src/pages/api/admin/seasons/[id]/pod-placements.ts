import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { teams, seasons, programs, locations, registrations, rosters } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";

/**
 * POST /api/admin/seasons/:id/pod-placements
 *
 * Season-locked FULL-REPLACE publish for the camp-group planner (Task 4 of
 * the 2026-09-06-camps-phase4 plan). Mirrors the league batch publish
 * (`placements.ts`) — same FOR UPDATE season lock, same all-or-nothing
 * validate-then-write shape — with two deliberate differences:
 *
 * 1. Full replace, not append: the batch is the season's ENTIRE camp-group
 *    membership. All existing `rosters` rows under this season's teams are
 *    deleted and the batch reinserted in one transaction — so "move a camper
 *    to another group" is just republishing the whole arrangement, and
 *    "already rostered" is not an error condition here.
 * 2. `formationStrategy` ('age' | 'skill' | 'manual') is persisted on the
 *    season alongside the placements (and NOT persisted when the batch is
 *    rejected).
 *
 * The FOR UPDATE lock on the season row is the SAME lock taken by
 * `placements.ts`, `teams/scaffold.ts`, and the legacy single-add
 * `POST /api/admin/rosters` — every writer that adds roster rows to a season
 * serializes through it (season-lock discipline, Phase 2 invariant).
 *
 * Any invalid row -> 422 with a per-placement error list and ZERO writes.
 * Success -> 200 { published: <count> }.
 */
const placementSchema = z.object({
  registrationId: z.string().uuid("Valid registration ID is required"),
  teamId: z.string().uuid("Valid camp group ID is required"),
});

const podPlacementsSchema = z.object({
  placements: z.array(placementSchema).max(500, "Batch is limited to 500 placements"),
  formationStrategy: z.enum(["age", "skill", "manual"]),
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
  const parsed = podPlacementsSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }
  const { placements, formationStrategy } = parsed.data;

  const db = getDb();

  try {
    // Org-scoped, camp-only season check OUTSIDE the transaction so a
    // cross-org or non-camp id 404s without ever taking the row lock (same
    // shape as the GET sibling; camp gate in the WHERE clause).
    const [seasonRow] = await db
      .select({ seasonId: seasons.id })
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

    if (!seasonRow) {
      return new Response(JSON.stringify({ error: "Season not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const txResult = await db.transaction(async (tx) => {
      // Season-lock discipline: serialize against every other roster writer
      // (placements.ts, teams/scaffold.ts, admin/rosters.ts) BEFORE reading
      // the snapshot this batch is validated against.
      await tx.select({ id: seasons.id }).from(seasons).where(eq(seasons.id, seasonId)).for("update");

      const teamRows = await tx
        .select({ id: teams.id, maxRosterSize: teams.maxRosterSize })
        .from(teams)
        .where(eq(teams.seasonId, seasonId));
      const teamById = new Map(teamRows.map((t) => [t.id, t]));
      const teamIds = teamRows.map((t) => t.id);

      // Registrations referenced in the batch — one query for all of them.
      const regIds = [...new Set(placements.map((p) => p.registrationId))];
      const regRows =
        regIds.length > 0
          ? await tx
              .select({
                id: registrations.id,
                seasonId: registrations.seasonId,
                status: registrations.status,
              })
              .from(registrations)
              .where(inArray(registrations.id, regIds))
          : [];
      const regById = new Map(regRows.map((r) => [r.id, r]));

      const errors: ValidationError[] = [];
      const seenRegIds = new Set<string>();
      const batchCountByTeam = new Map<string, number>(teamIds.map((id) => [id, 0]));

      for (const p of placements) {
        if (seenRegIds.has(p.registrationId)) {
          errors.push({
            registrationId: p.registrationId,
            reason: "Duplicate registration within this batch",
          });
          continue;
        }
        seenRegIds.add(p.registrationId);

        const team = teamById.get(p.teamId);
        if (!team) {
          errors.push({
            registrationId: p.registrationId,
            reason: "Camp group not found in this season",
          });
          continue;
        }

        const reg = regById.get(p.registrationId);
        if (!reg || reg.seasonId !== seasonId) {
          errors.push({
            registrationId: p.registrationId,
            reason: "Registration not found in this season",
          });
          continue;
        }

        if (reg.status !== "confirmed") {
          errors.push({
            registrationId: p.registrationId,
            reason: `Registration status is '${reg.status}', not confirmed`,
          });
          continue;
        }

        // Full-replace means the batch itself IS the post-publish load —
        // caps are checked against batch counts, not existing rows.
        const load = (batchCountByTeam.get(p.teamId) ?? 0) + 1;
        if (team.maxRosterSize != null && load > team.maxRosterSize) {
          errors.push({
            registrationId: p.registrationId,
            reason: `Camp group is full (max ${team.maxRosterSize})`,
          });
          continue;
        }
        batchCountByTeam.set(p.teamId, load);
      }

      if (errors.length > 0) {
        // Nothing written — committing the (empty) transaction just releases
        // the season lock, observably identical to a rollback.
        return { ok: false as const, errors };
      }

      // Full replace: clear this season's camp-group membership, reinsert
      // the batch, persist the strategy — all inside the locked transaction.
      if (teamIds.length > 0) {
        await tx.delete(rosters).where(inArray(rosters.teamId, teamIds));
      }
      if (placements.length > 0) {
        await tx.insert(rosters).values(
          placements.map((p) => ({
            teamId: p.teamId,
            registrationId: p.registrationId,
            status: "active" as const,
          })),
        );
      }
      await tx
        .update(seasons)
        .set({ formationStrategy, updatedAt: new Date() })
        .where(eq(seasons.id, seasonId));

      return { ok: true as const, published: placements.length };
    });

    if (!txResult.ok) {
      return new Response(JSON.stringify({ errors: txResult.errors }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ published: txResult.published }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error publishing camp-group placements:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
