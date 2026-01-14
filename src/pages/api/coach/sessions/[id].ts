import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import {
  sessionPlans,
  sessionActivityUsage,
  activities,
  teams,
  seasons,
  programs,
} from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { eq, and, or } from "drizzle-orm";
import { z } from "zod";

const updateSessionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  scheduledDate: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(15).max(180).optional(),
  status: z.enum(["draft", "planned", "in_progress", "completed", "cancelled"]).optional(),
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
  postSessionReflection: z.string().optional(),
  whatWorkedWell: z.string().optional(),
  whatToImprove: z.string().optional(),
  playerObservations: z.string().optional(),
});

// Helper to verify coach access to session
async function verifyCoachAccess(userId: string, sessionId: string) {
  if (!db) return null;

  const [session] = await db
    .select({
      id: sessionPlans.id,
      teamId: sessionPlans.teamId,
      coachUserId: teams.coachUserId,
      assistantCoachUserId: teams.assistantCoachUserId,
    })
    .from(sessionPlans)
    .innerJoin(teams, eq(sessionPlans.teamId, teams.id))
    .where(eq(sessionPlans.id, sessionId));

  if (!session) return null;

  if (session.coachUserId !== userId && session.assistantCoachUserId !== userId) {
    return null;
  }

  return session;
}

// GET - Get a specific session plan with full details
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Session ID required" }), {
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

    // Verify access
    const access = await verifyCoachAccess(user.id, id);
    if (!access) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get full session details
    const [session] = await db
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
        playerObservations: sessionPlans.playerObservations,
        completedAt: sessionPlans.completedAt,
        createdAt: sessionPlans.createdAt,
        updatedAt: sessionPlans.updatedAt,
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
      .where(eq(sessionPlans.id, id));

    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get activity usage records if any
    const activityUsages = await db
      .select({
        id: sessionActivityUsage.id,
        activityId: sessionActivityUsage.activityId,
        segmentOrder: sessionActivityUsage.segmentOrder,
        durationMinutes: sessionActivityUsage.durationMinutes,
        coachRating: sessionActivityUsage.coachRating,
        coachNotes: sessionActivityUsage.coachNotes,
        activity: {
          id: activities.id,
          name: activities.name,
          activityType: activities.activityType,
        },
      })
      .from(sessionActivityUsage)
      .innerJoin(activities, eq(sessionActivityUsage.activityId, activities.id))
      .where(eq(sessionActivityUsage.sessionPlanId, id));

    return new Response(
      JSON.stringify({
        session,
        activityUsages,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching session:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// PUT - Update a session plan
export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Session ID required" }), {
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

    // Verify access
    const access = await verifyCoachAccess(user.id, id);
    if (!access) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = updateSessionSchema.safeParse(body);

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

    // Build update object
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.scheduledDate !== undefined) updateData.scheduledDate = new Date(data.scheduledDate);
    if (data.durationMinutes !== undefined) updateData.durationMinutes = data.durationMinutes;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === "completed") {
        updateData.completedAt = new Date();
      }
    }
    if (data.segments !== undefined) updateData.segments = data.segments;
    if (data.focusSkillIds !== undefined) updateData.focusSkillIds = data.focusSkillIds;
    if (data.objectives !== undefined) updateData.objectives = data.objectives;
    if (data.equipmentNeeded !== undefined) updateData.equipmentNeeded = data.equipmentNeeded;
    if (data.preSessionNotes !== undefined) updateData.preSessionNotes = data.preSessionNotes;
    if (data.postSessionReflection !== undefined) updateData.postSessionReflection = data.postSessionReflection;
    if (data.whatWorkedWell !== undefined) updateData.whatWorkedWell = data.whatWorkedWell;
    if (data.whatToImprove !== undefined) updateData.whatToImprove = data.whatToImprove;
    if (data.playerObservations !== undefined) updateData.playerObservations = data.playerObservations;

    // Update the session
    const [updatedSession] = await db
      .update(sessionPlans)
      .set(updateData)
      .where(eq(sessionPlans.id, id))
      .returning();

    // If activities changed, update activity usage counts
    if (data.segments) {
      // Clear old usage records
      await db
        .delete(sessionActivityUsage)
        .where(eq(sessionActivityUsage.sessionPlanId, id));

      // Insert new usage records for activities
      for (const segment of data.segments) {
        if (segment.activityId) {
          await db.insert(sessionActivityUsage).values({
            sessionPlanId: id,
            activityId: segment.activityId,
            segmentOrder: segment.order,
            durationMinutes: segment.durationMinutes,
          });

          // Increment activity usage count
          await db
            .update(activities)
            .set({
              usageCount: (activities.usageCount || 0) + 1,
              updatedAt: new Date(),
            })
            .where(eq(activities.id, segment.activityId));
        }
      }
    }

    return new Response(JSON.stringify({ session: updatedSession }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating session:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// DELETE - Delete a session plan
export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Session ID required" }), {
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

    // Verify access
    const access = await verifyCoachAccess(user.id, id);
    if (!access) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Delete activity usage records first (cascade should handle this but being explicit)
    await db
      .delete(sessionActivityUsage)
      .where(eq(sessionActivityUsage.sessionPlanId, id));

    // Delete the session
    await db.delete(sessionPlans).where(eq(sessionPlans.id, id));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error deleting session:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
