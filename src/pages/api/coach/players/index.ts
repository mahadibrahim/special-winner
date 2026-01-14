import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { teams, rosters, registrations, familyMembers, seasons, programs, sports } from "@/lib/db/schema";
import { eq, or, and, inArray } from "drizzle-orm";

// GET - Get all players from coach's teams
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Optional team filter
    const teamId = url.searchParams.get("teamId");

    // Get all teams where user is coach or assistant coach
    const coachTeams = await db
      .select({
        id: teams.id,
        name: teams.name,
        sport: {
          id: sports.id,
          name: sports.name,
        },
        season: {
          id: seasons.id,
          name: seasons.name,
        },
      })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .where(
        or(
          eq(teams.coachUserId, user.id),
          eq(teams.assistantCoachUserId, user.id)
        )
      );

    if (coachTeams.length === 0) {
      return new Response(JSON.stringify({ error: "Access denied - not a coach" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Filter to specific team if requested
    let teamIds = coachTeams.map((t) => t.id);
    if (teamId) {
      if (!teamIds.includes(teamId)) {
        return new Response(JSON.stringify({ error: "Access denied - not coach of this team" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      teamIds = [teamId];
    }

    // Create a map of team info for lookup
    const teamMap = new Map(coachTeams.map((t) => [t.id, t]));

    // Get all players from coach's teams
    const playerData = await db
      .select({
        player: {
          id: familyMembers.id,
          firstName: familyMembers.firstName,
          lastName: familyMembers.lastName,
          birthDate: familyMembers.birthDate,
          gender: familyMembers.gender,
          photoUrl: familyMembers.photoUrl,
        },
        roster: {
          id: rosters.id,
          teamId: rosters.teamId,
          jerseyNumber: rosters.jerseyNumber,
          position: rosters.position,
          status: rosters.status,
        },
      })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .where(
        and(
          inArray(rosters.teamId, teamIds),
          eq(rosters.status, "active")
        )
      )
      .orderBy(familyMembers.lastName, familyMembers.firstName);

    // Format response with team info
    const players = playerData.map((item) => {
      const team = teamMap.get(item.roster.teamId);
      return {
        id: item.player.id,
        firstName: item.player.firstName,
        lastName: item.player.lastName,
        birthDate: item.player.birthDate,
        gender: item.player.gender,
        photoUrl: item.player.photoUrl,
        roster: {
          id: item.roster.id,
          jerseyNumber: item.roster.jerseyNumber,
          position: item.roster.position,
          status: item.roster.status,
        },
        team: team
          ? {
              id: team.id,
              name: team.name,
              sport: team.sport,
              season: team.season,
            }
          : null,
      };
    });

    // Remove duplicates (same player on multiple teams)
    const uniquePlayers = Array.from(
      new Map(players.map((p) => [p.id, p])).values()
    );

    return new Response(JSON.stringify({ players: uniquePlayers }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching players:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
