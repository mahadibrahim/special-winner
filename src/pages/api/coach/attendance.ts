import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { attendance, rosters, teams, familyMembers, registrations, games } from "@/lib/db/schema";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireCoachAccessToTeam } from "@/lib/auth";

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
  try {
    const url = new URL(context.request.url);
    const teamId = url.searchParams.get("teamId");
    const eventDate = url.searchParams.get("eventDate");

    if (!teamId) {
      return new Response(JSON.stringify({ error: "Team ID is required" }), { status: 400 });
    }

    // Verify coach has access to this team
    const auth = await requireCoachAccessToTeam(context, teamId);
    if (!auth.authorized) return auth.response;

    // Get team details
    const team = await getDb().query.teams.findFirst({
      where: eq(teams.id, teamId),
    });

    if (!team) {
      return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 });
    }

    // Get team roster with family member info
    const rosterList = await getDb()
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

    const attendanceRecords = await getDb()
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
    const upcomingGames = await getDb()
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

    // Calculate attendance stats.
    // pg returns COUNT(*) as bigint -> string in the JS driver. Coerce to numbers
    // so the client can do arithmetic (otherwise "1" + "0" = "10" -> 1000% rate).
    const rawStats = await getDb()
      .select({
        rosterId: attendance.rosterId,
        totalPresent: sql<number | string>`COUNT(*) FILTER (WHERE ${attendance.status} = 'present')`,
        totalAbsent: sql<number | string>`COUNT(*) FILTER (WHERE ${attendance.status} = 'absent')`,
        totalLate: sql<number | string>`COUNT(*) FILTER (WHERE ${attendance.status} = 'late')`,
        totalExcused: sql<number | string>`COUNT(*) FILTER (WHERE ${attendance.status} = 'excused')`,
        totalRecords: sql<number | string>`COUNT(*)`,
      })
      .from(attendance)
      .where(eq(attendance.teamId, teamId))
      .groupBy(attendance.rosterId);

    const toNum = (v: unknown): number => {
      const n = typeof v === "number" ? v : Number(v ?? 0);
      return Number.isFinite(n) ? n : 0;
    };

    const stats = rawStats.map((s) => ({
      rosterId: s.rosterId,
      totalPresent: toNum(s.totalPresent),
      totalAbsent: toNum(s.totalAbsent),
      totalLate: toNum(s.totalLate),
      totalExcused: toNum(s.totalExcused),
      totalRecords: toNum(s.totalRecords),
    }));

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

      // Verify coach has access to this team
      const auth = await requireCoachAccessToTeam(context, teamId);
      if (!auth.authorized) return auth.response;

      // Whole-batch integrity: every rosterId must belong to this team.
      const rosterIds = [...new Set(records.map((r) => r.rosterId))];
      if (rosterIds.length > 0) {
        const validRosters = await getDb()
          .select({ id: rosters.id })
          .from(rosters)
          .where(and(eq(rosters.teamId, teamId), inArray(rosters.id, rosterIds)));
        if (validRosters.length !== rosterIds.length) {
          return new Response(
            JSON.stringify({ error: "One or more rosterIds do not belong to this team" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      // Delete existing attendance for this event
      const startOfDay = new Date(eventDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(eventDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Insert new records
      const newRecords = records.map((record) => ({
        teamId,
        rosterId: record.rosterId,
        gameId: gameId || null,
        eventDate: new Date(eventDate),
        eventType: eventType as "practice" | "game" | "other",
        status: record.status as "present" | "absent" | "late" | "excused",
        notes: record.notes || null,
        recordedByUserId: auth.user.id,
      }));

      await getDb().transaction(async (tx) => {
        await tx
          .delete(attendance)
          .where(
            and(
              eq(attendance.teamId, teamId),
              sql`${attendance.eventDate} >= ${startOfDay} AND ${attendance.eventDate} <= ${endOfDay}`,
              eq(attendance.eventType, eventType)
            )
          );
        if (newRecords.length > 0) {
          await tx.insert(attendance).values(newRecords);
        }
      });

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

      // Verify coach has access to this team
      const auth = await requireCoachAccessToTeam(context, result.data.teamId);
      if (!auth.authorized) return auth.response;

      const [rosterEntry] = await getDb()
        .select({ id: rosters.id })
        .from(rosters)
        .where(and(eq(rosters.id, result.data.rosterId), eq(rosters.teamId, result.data.teamId)))
        .orderBy(asc(rosters.id))
        .limit(1);
      if (!rosterEntry) {
        return new Response(
          JSON.stringify({ error: "rosterId does not belong to this team" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const [newAttendance] = await getDb()
        .insert(attendance)
        .values({
          ...result.data,
          eventDate: new Date(result.data.eventDate),
          gameId: result.data.gameId || null,
          notes: result.data.notes || null,
          recordedByUserId: auth.user.id,
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

const updateAttendanceSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["present", "absent", "late", "excused"]),
  notes: z.string().optional().nullable(),
});

// PUT - Update single attendance record
export const PUT: APIRoute = async (context) => {
  try {
    const body = await context.request.json();
    const validation = updateAttendanceSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: validation.error.flatten().fieldErrors }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const { id, status, notes } = validation.data;

    // First, get the attendance record to find its teamId
    const [existingRecord] = await getDb()
      .select({ teamId: attendance.teamId })
      .from(attendance)
      .where(eq(attendance.id, id));

    if (!existingRecord) {
      return new Response(JSON.stringify({ error: "Attendance record not found" }), { status: 404 });
    }

    // Verify coach has access to this team
    const auth = await requireCoachAccessToTeam(context, existingRecord.teamId);
    if (!auth.authorized) return auth.response;

    const [updated] = await getDb()
      .update(attendance)
      .set({
        status,
        notes,
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, id))
      .returning();

    return new Response(JSON.stringify({ attendance: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating attendance:", error);
    return new Response(JSON.stringify({ error: "Failed to update attendance" }), { status: 500 });
  }
};
