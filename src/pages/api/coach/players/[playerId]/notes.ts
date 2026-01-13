import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { coachNotes, teams, rosters, familyMembers } from "@/lib/db/schema";
import { eq, and, desc, or } from "drizzle-orm";
import { z } from "zod";

const createNoteSchema = z.object({
  teamId: z.string().uuid(),
  category: z.enum(["progress", "achievement", "focus", "encouragement", "general"]),
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  visibleToParent: z.boolean().default(true),
});

// GET - Get all notes for a player
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { playerId } = params;
    if (!playerId) {
      return new Response(JSON.stringify({ error: "Player ID required" }), {
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

    // Verify user is coach of a team that has this player on roster
    // First, get all teams where this user is coach
    const coachTeams = await db
      .select({ id: teams.id })
      .from(teams)
      .where(
        or(
          eq(teams.coachUserId, user.id),
          eq(teams.assistantCoachUserId, user.id)
        )
      );

    const coachTeamIds = coachTeams.map((t) => t.id);

    if (coachTeamIds.length === 0) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get notes for this player created by coaches of teams that have this player
    const notes = await db
      .select({
        id: coachNotes.id,
        familyMemberId: coachNotes.familyMemberId,
        teamId: coachNotes.teamId,
        coachUserId: coachNotes.coachUserId,
        category: coachNotes.category,
        title: coachNotes.title,
        content: coachNotes.content,
        visibleToParent: coachNotes.visibleToParent,
        createdAt: coachNotes.createdAt,
        updatedAt: coachNotes.updatedAt,
        teamName: teams.name,
        teamColor: teams.color,
      })
      .from(coachNotes)
      .leftJoin(teams, eq(coachNotes.teamId, teams.id))
      .where(eq(coachNotes.familyMemberId, playerId))
      .orderBy(desc(coachNotes.createdAt));

    return new Response(JSON.stringify({ notes }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching player notes:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// POST - Create a new note for a player
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { playerId } = params;
    if (!playerId) {
      return new Response(JSON.stringify({ error: "Player ID required" }), {
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

    // Parse and validate request body
    const body = await request.json();
    const validation = createNoteSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { teamId, category, title, content, visibleToParent } = validation.data;

    // Verify user is coach of the specified team
    const [team] = await db
      .select()
      .from(teams)
      .where(
        and(
          eq(teams.id, teamId),
          or(
            eq(teams.coachUserId, user.id),
            eq(teams.assistantCoachUserId, user.id)
          )
        )
      );

    if (!team) {
      return new Response(JSON.stringify({ error: "Access denied - not coach of this team" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify the player (family member) exists
    const [player] = await db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.id, playerId));

    if (!player) {
      return new Response(JSON.stringify({ error: "Player not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create the note
    const [newNote] = await db
      .insert(coachNotes)
      .values({
        familyMemberId: playerId,
        teamId,
        coachUserId: user.id,
        category,
        title,
        content,
        visibleToParent,
      })
      .returning();

    return new Response(JSON.stringify({ note: newNote }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating player note:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
