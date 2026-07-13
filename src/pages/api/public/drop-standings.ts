import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { dropSeasons, dropTeams, dropMatches } from "@/lib/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";
import { computeStandings } from "@/lib/drop-league/standings";
import type { MatchRow } from "@/lib/drop-league/standings";

/**
 * GET /api/public/drop-standings
 *
 * Returns team-level standings for a drop league season.  No auth required.
 * NEVER returns player weights, BMI, height, or any player-level data.
 *
 * Query params (one required):
 *   ?dropSeasonId=<uuid>   — look up that specific season
 *   ?division=mens|womens  — resolve the current open/active season for that
 *                            division within the tenant org, most recent by
 *                            startDate (multi-tenant safe: orderBy enforced)
 *
 * Response:
 *   { season: { id, name, division } | null, standings: StandingEntry[] }
 *
 *   StandingEntry: { teamId, teamName, played, won, drawn, lost, points,
 *                    bonusGoals, totalGoals }
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const organization = locals.organization;
  if (!organization) {
    return new Response(
      JSON.stringify({ error: "Organization context required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const dropSeasonId = url.searchParams.get("dropSeasonId");
  const division = url.searchParams.get("division");

  if (!dropSeasonId && !division) {
    return new Response(
      JSON.stringify({
        error: "Either dropSeasonId or division query param is required",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    if (!db) throw new Error("No DB");

    // ── 1. Resolve the season ────────────────────────────────────────────────
    let season: { id: string; name: string; division: string } | null = null;

    if (dropSeasonId) {
      // Explicit season lookup — verify org ownership.
      const [row] = await db
        .select({
          id: dropSeasons.id,
          name: dropSeasons.name,
          division: dropSeasons.division,
        })
        .from(dropSeasons)
        .where(
          and(
            eq(dropSeasons.id, dropSeasonId),
            eq(dropSeasons.organizationId, organization.id)
          )
        )
        .limit(1);

      if (row) season = row;
    } else if (division === "mens" || division === "womens") {
      // Division lookup — find the most recent open or active season.
      const [row] = await db
        .select({
          id: dropSeasons.id,
          name: dropSeasons.name,
          division: dropSeasons.division,
        })
        .from(dropSeasons)
        .where(
          and(
            eq(dropSeasons.organizationId, organization.id),
            eq(dropSeasons.division, division),
            inArray(dropSeasons.status, ["open", "active"])
          )
        )
        .orderBy(desc(dropSeasons.startDate))
        .limit(1);

      if (row) season = row;
    } else {
      return new Response(
        JSON.stringify({ error: "division must be 'mens' or 'womens'" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // No matching season → return empty.
    if (!season) {
      return new Response(
        JSON.stringify({ season: null, standings: [] }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=120",
          },
        }
      );
    }

    // ── 2 & 3. Load teams + final matches — independent reads, both scoped
    // by season.id + organization.id, neither depends on the other's result.
    const [teams, rawMatches] = await Promise.all([
      db
        .select({ id: dropTeams.id, name: dropTeams.name })
        .from(dropTeams)
        .where(
          and(
            eq(dropTeams.dropSeasonId, season.id),
            eq(dropTeams.organizationId, organization.id)
          )
        ),
      db
        .select({
          homeTeamId: dropMatches.homeTeamId,
          awayTeamId: dropMatches.awayTeamId,
          homeFinalScore: dropMatches.homeFinalScore,
          awayFinalScore: dropMatches.awayFinalScore,
          homeBonusGoals: dropMatches.homeBonusGoals,
          awayBonusGoals: dropMatches.awayBonusGoals,
        })
        .from(dropMatches)
        .where(
          and(
            eq(dropMatches.dropSeasonId, season.id),
            eq(dropMatches.organizationId, organization.id),
            eq(dropMatches.status, "final")
          )
        ),
    ]);

    // ── 4. Parse numeric strings → numbers ───────────────────────────────────
    const matchRows: MatchRow[] = rawMatches.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeFinalScore: Number(m.homeFinalScore),
      awayFinalScore: Number(m.awayFinalScore),
      homeBonusGoals: Number(m.homeBonusGoals),
      awayBonusGoals: Number(m.awayBonusGoals),
    }));

    // ── 5. Compute standings and join team names ──────────────────────────────
    const teamIds = teams.map((t) => t.id);
    const standingRows = computeStandings(teamIds, matchRows);
    const nameById = new Map(teams.map((t) => [t.id, t.name]));

    const standings = standingRows.map((row) => ({
      teamId: row.teamId,
      teamName: nameById.get(row.teamId) ?? "",
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      points: row.points,
      bonusGoals: row.bonusGoals,
      totalGoals: row.totalGoals,
    }));

    return new Response(
      JSON.stringify({ season, standings }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=120",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching public drop standings:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch standings" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
