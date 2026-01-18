import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { coachNotes, teams, familyMembers, rosters, registrations } from "@/lib/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireCoachAccessToPlayer, requireCoachAccess, isPlayerOnCoachTeam } from "@/lib/auth";

const createNoteSchema = z.object({
  teamId: z.string().uuid(),
  category: z.enum(["progress", "achievement", "focus", "encouragement", "general"]),
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  visibleToParent: z.boolean().default(true),
});

// GET - Get all notes for a player
export const GET: APIRoute = async (context) => {
  try {
    const { playerId } = context.params;
    if (!playerId) {
      return new Response(JSON.stringify({ error: "Player ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify coach has access to this player
    const auth = await requireCoachAccessToPlayer(context, playerId);
    if (!auth.authorized) return auth.response;

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get notes for this player (only from teams the coach has access to)
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
      .where(
        and(
          eq(coachNotes.familyMemberId, playerId),
          inArray(coachNotes.teamId, auth.teamIds)
        )
      )
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
export const POST: APIRoute = async (context) => {
  try {
    const { playerId } = context.params;
    if (!playerId) {
      return new Response(JSON.stringify({ error: "Player ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // First verify user is a coach
    const auth = await requireCoachAccess(context);
    if (!auth.authorized) return auth.response;

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    const body = await context.request.json();
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
    if (!auth.teamIds.includes(teamId)) {
      return new Response(JSON.stringify({ error: "Access denied - not coach of this team" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify the player is on this team's roster
    const [rosterEntry] = await db
      .select({ id: rosters.id })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .where(
        and(
          eq(rosters.teamId, teamId),
          eq(registrations.familyMemberId, playerId)
        )
      )
      .limit(1);

    if (!rosterEntry) {
      return new Response(JSON.stringify({ error: "Player is not on this team's roster" }), {
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
        coachUserId: auth.user.id,
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
