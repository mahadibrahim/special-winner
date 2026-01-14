import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import {
  sessionPlans,
  practiceTemplates,
  teams,
  seasons,
  programs,
} from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { eq, and, or, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";

const createSessionSchema = z.object({
  teamId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  scheduledDate: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(180),
  segments: z
    .array(
      z.object({
        order: z.number().int(),
        name: z.string(),
        type: z.string(),
        durationMinutes: z.number().int(),
        activityId: z.string().uuid().optional(),
        activityName: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  focusSkillIds: z.array(z.string().uuid()).optional(),
  objectives: z.array(z.string()).optional(),
  equipmentNeeded: z.array(z.string()).optional(),
  preSessionNotes: z.string().optional(),
});

// GET - Get session plans for coach's teams
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

    // Query parameters
    const teamId = url.searchParams.get("teamId");
    const status = url.searchParams.get("status");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const limit = parseInt(url.searchParams.get("limit") || "20");

    // Get coach's teams
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
      return new Response(
        JSON.stringify({ error: "Access denied - not a coach" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const teamIds = coachTeams.map((t) => t.id);

    // Build conditions
    const conditions = [];

    // If teamId is specified, verify it's one of coach's teams
    if (teamId) {
      if (!teamIds.includes(teamId)) {
        return new Response(
          JSON.stringify({ error: "Access denied - not coach of this team" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      conditions.push(eq(sessionPlans.teamId, teamId));
    } else {
      // Get sessions for all coach's teams
      conditions.push(
        or(...teamIds.map((id) => eq(sessionPlans.teamId, id)))!
      );
    }

    if (status) {
      conditions.push(eq(sessionPlans.status, status as any));
    }

    if (startDate) {
      conditions.push(gte(sessionPlans.scheduledDate, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(sessionPlans.scheduledDate, new Date(endDate)));
    }

    // Get sessions
    const sessions = await db
      .select({
        id: sessionPlans.id,
        teamId: sessionPlans.teamId,
        templateId: sessionPlans.templateId,
        coachUserId: sessionPlans.coachUserId,
        title: sessionPlans.title,
        scheduledDate: sessionPlans.scheduledDate,
        durationMinutes: sessionPlans.durationMinutes,
        status: sessionPlans.status,
        segments: sessionPlans.segments,
        focusSkillIds: sessionPlans.focusSkillIds,
        objectives: sessionPlans.objectives,
        equipmentNeeded: sessionPlans.equipmentNeeded,
        preSessionNotes: sessionPlans.preSessionNotes,
        postSessionReflection: sessionPlans.postSessionReflection,
        whatWorkedWell: sessionPlans.whatWorkedWell,
        whatToImprove: sessionPlans.whatToImprove,
        completedAt: sessionPlans.completedAt,
        createdAt: sessionPlans.createdAt,
        team: {
          id: teams.id,
          name: teams.name,
        },
        sport: {
          id: sports.id,
          name: sports.name,
        },
      })
      .from(sessionPlans)
      .innerJoin(teams, eq(sessionPlans.teamId, teams.id))
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .where(and(...conditions))
      .orderBy(desc(sessionPlans.scheduledDate))
      .limit(limit);

    return new Response(
      JSON.stringify({
        sessions,
        teams: coachTeams,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// POST - Create a new session plan
export const POST: APIRoute = async ({ request, locals }) => {
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

    // Parse and validate request body
    const body = await request.json();
    const validation = createSessionSchema.safeParse(body);

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

    const data = validation.data;

    // Verify user is coach of this team
    const [team] = await db
      .select()
      .from(teams)
      .where(
        and(
          eq(teams.id, data.teamId),
          or(
            eq(teams.coachUserId, user.id),
            eq(teams.assistantCoachUserId, user.id)
          )
        )
      );

    if (!team) {
      return new Response(
        JSON.stringify({ error: "Access denied - not coach of this team" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // If using a template, increment its usage count
    if (data.templateId) {
      await db
        .update(practiceTemplates)
        .set({
          usageCount: (practiceTemplates.usageCount || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(practiceTemplates.id, data.templateId));
    }

    // Create the session plan
    const [newSession] = await db
      .insert(sessionPlans)
      .values({
        teamId: data.teamId,
        templateId: data.templateId || null,
        coachUserId: user.id,
        title: data.title,
        scheduledDate: new Date(data.scheduledDate),
        durationMinutes: data.durationMinutes,
        status: "draft",
        segments: data.segments || null,
        focusSkillIds: data.focusSkillIds || null,
        objectives: data.objectives || null,
        equipmentNeeded: data.equipmentNeeded || null,
        preSessionNotes: data.preSessionNotes || null,
      })
      .returning();

    return new Response(JSON.stringify({ session: newSession }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating session:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
