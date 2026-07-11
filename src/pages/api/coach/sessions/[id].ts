import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  sessionPlans,
  sessionActivityUsage,
  activities,
  teams,
  seasons,
  programs,
  users,
} from "@/lib/db/schema";
import { sequenceAttachments } from "@/lib/db/schema/blueprint";
import { sports } from "@/lib/db/schema/sports";
import { eq, and, or, sql, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireCoachPortalAccess } from "@/lib/auth";

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
  const [session] = await getDb()
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

    const db = getDb();

    // Verify access
    const access = await verifyCoachAccess(user.id, id);
    if (!access) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get full session details
    const [rawSession] = await getDb()
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
        // Program Blueprint (Task 5): prescribed-badge data, left-joined so
        // coach-created sessions (sequenceAttachmentId null) still return a
        // row -- see the `prescribed` shaping below.
        sequenceAttachmentId: sessionPlans.sequenceAttachmentId,
        distributorFirstName: users.firstName,
        distributorEmail: users.email,
      })
      .from(sessionPlans)
      .innerJoin(teams, eq(sessionPlans.teamId, teams.id))
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .leftJoin(
        sequenceAttachments,
        eq(sessionPlans.sequenceAttachmentId, sequenceAttachments.id),
      )
      .leftJoin(users, eq(sequenceAttachments.distributedBy, users.id))
      .where(eq(sessionPlans.id, id));

    if (!rawSession) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const {
      sequenceAttachmentId,
      distributorFirstName,
      distributorEmail,
      ...sessionRest
    } = rawSession;
    const session = {
      ...sessionRest,
      prescribed: sequenceAttachmentId
        ? {
            attachmentId: sequenceAttachmentId,
            distributorFirstName:
              distributorFirstName || distributorEmail?.split("@")[0] || null,
          }
        : null,
    };

    // Get activity usage records if any
    const activityUsages = await getDb()
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
export const PUT: APIRoute = async (context) => {
  try {
    const { params } = context;
    const auth = await requireCoachPortalAccess(context);
    if (!auth.authorized) return auth.response;

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Session ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    // Verify access
    const access = await verifyCoachAccess(auth.user.id, id);
    if (!access) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    const body = await context.request.json();
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

    // Segment activities must be org-or-global visible (same filter as the
    // coach activities list).
    const segmentActivityIds = [
      ...new Set(
        (data.segments ?? [])
          .map((s) => s.activityId)
          .filter((aid): aid is string => Boolean(aid))
      ),
    ];
    if (segmentActivityIds.length > 0) {
      const visibleActivities = await getDb()
        .select({ id: activities.id })
        .from(activities)
        .where(
          and(
            inArray(activities.id, segmentActivityIds),
            or(
              isNull(activities.organizationId),
              eq(activities.organizationId, auth.organizationId)
            )
          )
        );
      if (visibleActivities.length !== segmentActivityIds.length) {
        return new Response(
          JSON.stringify({ error: "One or more activities are not available to your organization" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Build update object
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.scheduledDate !== undefined) updateData.scheduledDate = new Date(data.scheduledDate);
    if (data.durationMinutes !== undefined) updateData.durationMinutes = data.durationMinutes;
    if (data.status !== undefined) {
      // Fetch current timestamps so transitions are retry-safe no-ops —
      // the field-mode client flushes aggressively offline->online and
      // must never move startedAt/completedAt on a duplicate request.
      const [current] = await getDb()
        .select({
          startedAt: sessionPlans.startedAt,
          completedAt: sessionPlans.completedAt,
        })
        .from(sessionPlans)
        .where(eq(sessionPlans.id, id));

      updateData.status = data.status;
      if (data.status === "in_progress" && !current?.startedAt) {
        updateData.startedAt = new Date();
      }
      if (data.status === "completed" && !current?.completedAt) {
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

    // Snapshot the previous usage set BEFORE mutating so usageCount is only
    // incremented for activities newly added by this save (it previously
    // re-incremented every activity on every save).
    const previousUsage = data.segments
      ? await getDb()
          .select({ activityId: sessionActivityUsage.activityId })
          .from(sessionActivityUsage)
          .where(eq(sessionActivityUsage.sessionPlanId, id))
      : [];
    const previousActivityIds = new Set(previousUsage.map((u) => u.activityId));

    const updatedSession = await getDb().transaction(async (tx) => {
      const [updated] = await tx
        .update(sessionPlans)
        .set(updateData)
        .where(eq(sessionPlans.id, id))
        .returning();

      if (data.segments) {
        await tx
          .delete(sessionActivityUsage)
          .where(eq(sessionActivityUsage.sessionPlanId, id));

        for (const segment of data.segments) {
          if (segment.activityId) {
            await tx.insert(sessionActivityUsage).values({
              sessionPlanId: id,
              activityId: segment.activityId,
              segmentOrder: segment.order,
              durationMinutes: segment.durationMinutes,
            });
          }
        }

        const newActivityIds = segmentActivityIds.filter(
          (aid) => !previousActivityIds.has(aid)
        );
        if (newActivityIds.length > 0) {
          await tx
            .update(activities)
            .set({
              usageCount: sql`${activities.usageCount} + 1`,
              updatedAt: new Date(),
            })
            .where(inArray(activities.id, newActivityIds));
        }
      }

      return updated;
    });

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

    const db = getDb();

    // Verify access
    const access = await verifyCoachAccess(user.id, id);
    if (!access) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Delete activity usage records first (cascade should handle this but being explicit)
    await getDb()
      .delete(sessionActivityUsage)
      .where(eq(sessionActivityUsage.sessionPlanId, id));

    // Delete the session
    await getDb().delete(sessionPlans).where(eq(sessionPlans.id, id));

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
