import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { dropMatches, dropTeams, dropSeasons } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { computeStandings } from "@/lib/drop-league/standings";
import type { MatchRow } from "@/lib/drop-league/standings";

// ─── GET ?dropSeasonId= ───────────────────────────────────────────────────────

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const dropSeasonId = context.url.searchParams.get("dropSeasonId");
  if (!dropSeasonId) {
    return new Response(
      JSON.stringify({ error: "dropSeasonId query param is required" }),
      { status: 400 }
    );
  }

  try {
    const db = getDb();

    // Verify the season belongs to this org.
    const [season] = await db
      .select({ id: dropSeasons.id })
      .from(dropSeasons)
      .where(
        and(
          eq(dropSeasons.id, dropSeasonId),
          eq(dropSeasons.organizationId, orgContext.organizationId)
        )
      )
      .limit(1);

    if (!season) {
      return new Response(
        JSON.stringify({ error: "Drop season not found" }),
        { status: 404 }
      );
    }

    // Load teams for this season (org already scoped via season ownership above,
    // but double-fence with organizationId for defence-in-depth).
    const teams = await db
      .select({ id: dropTeams.id, name: dropTeams.name })
      .from(dropTeams)
      .where(
        and(
          eq(dropTeams.dropSeasonId, dropSeasonId),
          eq(dropTeams.organizationId, orgContext.organizationId)
        )
      );

    // Load final matches for the season.
    const rawMatches = await db
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
          eq(dropMatches.dropSeasonId, dropSeasonId),
          eq(dropMatches.organizationId, orgContext.organizationId),
          eq(dropMatches.status, "final")
        )
      );

    // numeric columns come back as strings from drizzle — parse to numbers.
    const matchRows: MatchRow[] = rawMatches.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeFinalScore: Number(m.homeFinalScore),
      awayFinalScore: Number(m.awayFinalScore),
      homeBonusGoals: Number(m.homeBonusGoals),
      awayBonusGoals: Number(m.awayBonusGoals),
    }));

    const teamIds = teams.map((t) => t.id);
    const standingRows = computeStandings(teamIds, matchRows);

    // Join team names.
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

    return new Response(JSON.stringify({ standings }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching drop standings:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch standings" }),
      { status: 500 }
    );
  }
};
