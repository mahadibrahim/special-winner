import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { teams, rosters, registrations, familyMembers, users } from "@/lib/db/schema";
import { eq, or, and } from "drizzle-orm";
import { isCoachOfTeam } from "@/lib/auth/roles";

// GET - Get roster for a specific team
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

    // Get team info
    const [team] = await db
      .select({
        id: teams.id,
        name: teams.name,
        maxRosterSize: teams.maxRosterSize,
      })
      .from(teams)
      .where(eq(teams.id, teamId));

    if (!team) {
      return new Response(JSON.stringify({ error: "Team not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get roster with player and parent info
    const rosterData = await db
      .select({
        roster: {
          id: rosters.id,
          jerseyNumber: rosters.jerseyNumber,
          position: rosters.position,
          status: rosters.status,
          notes: rosters.notes,
        },
        player: {
          id: familyMembers.id,
          firstName: familyMembers.firstName,
          lastName: familyMembers.lastName,
          birthDate: familyMembers.birthDate,
          gender: familyMembers.gender,
          photoUrl: familyMembers.photoUrl,
          medicalNotes: familyMembers.medicalNotes,
          emergencyContactName: familyMembers.emergencyContactName,
          emergencyContactPhone: familyMembers.emergencyContactPhone,
        },
        parent: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        },
      })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(users, eq(familyMembers.parentUserId, users.id))
      .where(eq(rosters.teamId, teamId))
      .orderBy(familyMembers.lastName, familyMembers.firstName);

    // Calculate age for each player
    const roster = rosterData.map((item) => {
      const birthDate = new Date(item.player.birthDate);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      return {
        id: item.roster.id,
        jerseyNumber: item.roster.jerseyNumber,
        position: item.roster.position,
        status: item.roster.status,
        notes: item.roster.notes,
        player: {
          ...item.player,
          age,
        },
        parent: item.parent,
        emergencyContact: {
          name: item.player.emergencyContactName,
          phone: item.player.emergencyContactPhone,
        },
      };
    });

    return new Response(JSON.stringify({ roster, team }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching roster:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
