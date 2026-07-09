/**
 * POST /api/referee/matches/[gameId]/ejections
 *
 * Additive-only ejection capture (product-backlog build #4). Deliberately
 * NOT folded into the bulk `incidents` array on /report — that endpoint
 * deletes-all-and-reinserts a game's incidents on every submit, which would
 * silently erase an ejection (and its suspension trail) on a later routine
 * score correction. See report.ts and
 * docs/superpowers/plans/2026-07-07-ejection-tracker.md.
 *
 * Tenant scope is inherited from the gameOfficials assignment check
 * (requireAssignedOfficial) — same pattern as report.ts. organizationId is
 * resolved from the game's own games -> seasons -> programs -> locations
 * chain purely to denormalize onto the suspension row (mirrors how
 * incidents.organizationId is denormalized at insert time).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { games } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { requireAssignedOfficial } from "@/lib/referee/require-assigned-official";
import { ejectionSchema } from "@/lib/suspensions/ejection-schema";
import { createEjection } from "@/lib/referee/create-ejection";

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const gameId = context.params.gameId;
  if (!gameId) return json({ error: "game id required" }, 400);

  if (!(await requireAssignedOfficial(user.id, gameId))) {
    return json({ error: "Not found" }, 404);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = ejectionSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid ejection payload", issues: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  const db = getDb();
  const [gameRow] = await db
    .select({
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      organizationId: locations.organizationId,
    })
    .from(games)
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(games.id, gameId))
    .limit(1);
  if (!gameRow) return json({ error: "Not found" }, 404);

  const teamId = input.side === "home" ? gameRow.homeTeamId : gameRow.awayTeamId;
  if (input.carriesSuspension && !teamId) {
    return json({ error: "Cannot record a suspension for a TBD team" }, 400);
  }

  const result = await db.transaction(async (tx) =>
    createEjection(tx, {
      gameId,
      reportedByUserId: user.id,
      organizationId: gameRow.organizationId,
      teamId,
      input,
    }),
  );

  return json(result, 201);
};
