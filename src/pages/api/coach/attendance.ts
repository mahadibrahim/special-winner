import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { attendance, rosters, teams, familyMembers, registrations, games } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { validateSession } from "@/lib/auth";

const attendanceSchema = z.object({
  teamId: z.string().uuid(),
  rosterId: z.string().uuid(),
  gameId: z.string().uuid().optional().nullable(),
  eventDate: z.string().datetime(),
  eventType: z.enum(["practice", "game", "other"]),
  status: z.enum(["present", "absent", "late", "excused"]),
  notes: z.string().optional().nullable(),
});

const bulkAttendanceSchema = z.object({
  teamId: z.string().uuid(),
  eventDate: z.string().datetime(),
  eventType: z.enum(["practice", "game", "other"]),
  gameId: z.string().uuid().optional().nullable(),
  records: z.array(z.object({
    rosterId: z.string().uuid(),
    status: z.enum(["present", "absent", "late", "excused"]),
    notes: z.string().optional().nullable(),
  })),
});

// GET - Get attendance records for a team
export const GET: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const url = new URL(context.request.url);
    const teamId = url.searchParams.get("teamId");
    const eventDate = url.searchParams.get("eventDate");

    if (!teamId) {
      return new Response(JSON.stringify({ error: "Team ID is required" }), { status: 400 });
    }

    // Verify user is coach of this team
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });

    if (!team) {
      return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 });
    }

    // Get team roster with family member info
    const rosterList = await db
      .select({
        id: rosters.id,
        jerseyNumber: rosters.jerseyNumber,
        position: rosters.position,
        status: rosters.status,
        familyMember: {
          id: familyMembers.id,
          firstName: familyMembers.firstName,
          lastName: familyMembers.lastName,
        },
      })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .where(and(eq(rosters.teamId, teamId), eq(rosters.status, "active")));

    // Get attendance records
    const conditions = [eq(attendance.teamId, teamId)];
    if (eventDate) {
      const startOfDay = new Date(eventDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(eventDate);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(
        sql`${attendance.eventDate} >= ${startOfDay} AND ${attendance.eventDate} <= ${endOfDay}`
      );
    }

    const attendanceRecords = await db
      .select({
        id: attendance.id,
        rosterId: attendance.rosterId,
        gameId: attendance.gameId,
        eventDate: attendance.eventDate,
        eventType: attendance.eventType,
        status: attendance.status,
        notes: attendance.notes,
      })
      .from(attendance)
      .where(and(...conditions))
      .orderBy(desc(attendance.eventDate));

    // Get upcoming games for this team
    const upcomingGames = await db
      .select({
        id: games.id,
        scheduledAt: games.scheduledAt,
        status: games.status,
      })
      .from(games)
      .where(
        and(
          sql`(${games.homeTeamId} = ${teamId} OR ${games.awayTeamId} = ${teamId})`,
          eq(games.status, "scheduled")
        )
      )
      .orderBy(games.scheduledAt)
      .limit(10);

    // Calculate attendance stats
    const stats = await db
      .select({
        rosterId: attendance.rosterId,
        totalPresent: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'present')`,
        totalAbsent: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'absent')`,
        totalLate: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'late')`,
        totalExcused: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'excused')`,
        totalRecords: sql<number>`COUNT(*)`,
      })
      .from(attendance)
      .where(eq(attendance.teamId, teamId))
      .groupBy(attendance.rosterId);

    return new Response(
      JSON.stringify({
        team,
        roster: rosterList,
        attendance: attendanceRecords,
        upcomingGames,
        stats,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch attendance" }), { status: 500 });
  }
};

// POST - Record attendance (single or bulk)
export const POST: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const body = await context.request.json();

    // Check if it's a bulk operation
    if (body.records && Array.isArray(body.records)) {
      const result = bulkAttendanceSchema.safeParse(body);
      if (!result.success) {
        return new Response(
          JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
          { status: 400 }
        );
      }

      const { teamId, eventDate, eventType, gameId, records } = result.data;

      // Delete existing attendance for this event
      const startOfDay = new Date(eventDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(eventDate);
      endOfDay.setHours(23, 59, 59, 999);

      await db
        .delete(attendance)
        .where(
          and(
            eq(attendance.teamId, teamId),
            sql`${attendance.eventDate} >= ${startOfDay} AND ${attendance.eventDate} <= ${endOfDay}`,
            eq(attendance.eventType, eventType)
          )
        );

      // Insert new records
      const newRecords = records.map((record) => ({
        teamId,
        rosterId: record.rosterId,
        gameId: gameId || null,
        eventDate: new Date(eventDate),
        eventType: eventType as "practice" | "game" | "other",
        status: record.status as "present" | "absent" | "late" | "excused",
        notes: record.notes || null,
        recordedByUserId: user.id,
      }));

      await db.insert(attendance).values(newRecords);

      return new Response(
        JSON.stringify({ success: true, count: records.length }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      // Single record
      const result = attendanceSchema.safeParse(body);
      if (!result.success) {
        return new Response(
          JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
          { status: 400 }
        );
      }

      const [newAttendance] = await db
        .insert(attendance)
        .values({
          ...result.data,
          eventDate: new Date(result.data.eventDate),
          gameId: result.data.gameId || null,
          notes: result.data.notes || null,
          recordedByUserId: user.id,
        })
        .returning();

      return new Response(JSON.stringify({ attendance: newAttendance }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("Error recording attendance:", error);
    return new Response(JSON.stringify({ error: "Failed to record attendance" }), { status: 500 });
  }
};

// PUT - Update single attendance record
export const PUT: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const body = await context.request.json();
    const { id, status, notes } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Attendance ID is required" }), { status: 400 });
    }

    const [updated] = await db
      .update(attendance)
      .set({
        status,
        notes,
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, id))
      .returning();

    if (!updated) {
      return new Response(JSON.stringify({ error: "Attendance record not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ attendance: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating attendance:", error);
    return new Response(JSON.stringify({ error: "Failed to update attendance" }), { status: 500 });
  }
};
