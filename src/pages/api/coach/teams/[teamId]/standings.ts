import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { teams, standings, seasons, programs, sports } from "@/lib/db/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { isCoachOfTeam } from "@/lib/auth/roles";

// GET - Get standings for a team's season/division
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { teamId } = params;
    if (!teamId) {
      return new Response(JSON.stringify({ error: "Team ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify user is coach of this team
    const isCoach = await isCoachOfTeam(user.id, teamId);
    if (!isCoach) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get team info to know the season and division
    const [team] = await db
      .select({
        id: teams.id,
        name: teams.name,
        color: teams.color,
        seasonId: teams.seasonId,
        division: teams.division,
      })
      .from(teams)
      .where(eq(teams.id, teamId));

    if (!team) {
      return new Response(JSON.stringify({ error: "Team not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get season info
    const [season] = await db
      .select({
        id: seasons.id,
        name: seasons.name,
        programId: seasons.programId,
      })
      .from(seasons)
      .where(eq(seasons.id, team.seasonId));

    // Get program and sport info
    let programInfo = null;
    if (season) {
      const [program] = await db
        .select({
          id: programs.id,
          name: programs.name,
          sportId: programs.sportId,
          sport: {
            id: sports.id,
            name: sports.name,
          },
        })
        .from(programs)
        .leftJoin(sports, eq(programs.sportId, sports.id))
        .where(eq(programs.id, season.programId));
      programInfo = program;
    }

    // Build the standings query - all teams in the same season
    // Optionally filter by division if the team has one
    let standingsQuery = db
      .select({
        id: standings.id,
        teamId: standings.teamId,
        seasonId: standings.seasonId,
        division: standings.division,
        wins: standings.wins,
        losses: standings.losses,
        ties: standings.ties,
        pointsFor: standings.pointsFor,
        pointsAgainst: standings.pointsAgainst,
        gamesPlayed: standings.gamesPlayed,
        teamName: teams.name,
        teamColor: teams.color,
      })
      .from(standings)
      .leftJoin(teams, eq(standings.teamId, teams.id))
      .where(eq(standings.seasonId, team.seasonId));

    const divisionStandings = await standingsQuery;

    // Calculate win percentage and sort
    const sortedStandings = divisionStandings
      .map((s) => ({
        ...s,
        winPercentage: s.gamesPlayed > 0 ? s.wins / s.gamesPlayed : 0,
        pointDifferential: s.pointsFor - s.pointsAgainst,
        isCurrentTeam: s.teamId === teamId,
      }))
      .sort((a, b) => {
        // Sort by wins descending, then by point differential
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.pointDifferential - a.pointDifferential;
      })
      .map((s, index) => ({
        ...s,
        rank: index + 1,
      }));

    return new Response(
      JSON.stringify({
        standings: sortedStandings,
        team: {
          id: team.id,
          name: team.name,
          color: team.color,
          division: team.division,
        },
        season: season
          ? {
              id: season.id,
              name: season.name,
            }
          : null,
        program: programInfo
          ? {
              id: programInfo.id,
              name: programInfo.name,
              sport: programInfo.sport,
            }
          : null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching standings:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
