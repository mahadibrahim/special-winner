import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { attendance, teams, rosters, seasons, programs, sports, familyMembers, registrations } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { requireAdminAccess } from "@/lib/auth";

// GET - Get attendance reports
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const db = getDb();

    const url = new URL(context.request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const teamId = url.searchParams.get("teamId");
    const groupBy = url.searchParams.get("groupBy") || "week"; // day, week, month

    // Default to last 3 months if no dates provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getFullYear(), end.getMonth() - 2, 1);

    // Build base conditions
    const conditions = [
      gte(attendance.eventDate, start),
      lte(attendance.eventDate, end),
    ];

    if (teamId) {
      conditions.push(eq(attendance.teamId, teamId));
    }

    // Overall attendance summary
    const summaryResult = await getDb()
      .select({
        totalRecords: sql<number>`COUNT(*)`,
        present: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'present')`,
        absent: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'absent')`,
        late: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'late')`,
        excused: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'excused')`,
      })
      .from(attendance)
      .where(and(...conditions));

    const summary = summaryResult[0];
    const attendanceRate = summary.totalRecords > 0
      ? Math.round(((summary.present + summary.late) / summary.totalRecords) * 100)
      : 0;

    // Attendance by time period
    let dateFormat = "";
    switch (groupBy) {
      case "day":
        dateFormat = "YYYY-MM-DD";
        break;
      case "week":
        dateFormat = "IYYY-IW";
        break;
      case "month":
      default:
        dateFormat = "YYYY-MM";
    }

    const attendanceByPeriod = await getDb()
      .select({
        period: sql<string>`TO_CHAR(${attendance.eventDate}, ${dateFormat})`,
        totalRecords: sql<number>`COUNT(*)`,
        present: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'present')`,
        absent: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'absent')`,
        late: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'late')`,
        excused: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'excused')`,
      })
      .from(attendance)
      .where(and(...conditions))
      .groupBy(sql`TO_CHAR(${attendance.eventDate}, ${dateFormat})`)
      .orderBy(sql`TO_CHAR(${attendance.eventDate}, ${dateFormat})`);

    // Attendance by event type
    const attendanceByEventType = await getDb()
      .select({
        eventType: attendance.eventType,
        totalRecords: sql<number>`COUNT(*)`,
        present: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'present')`,
        absent: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'absent')`,
        late: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'late')`,
        excused: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'excused')`,
      })
      .from(attendance)
      .where(and(...conditions))
      .groupBy(attendance.eventType);

    // Attendance by team
    const attendanceByTeam = await getDb()
      .select({
        teamId: teams.id,
        teamName: teams.name,
        totalRecords: sql<number>`COUNT(*)`,
        present: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'present')`,
        absent: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'absent')`,
        attendanceRate: sql<number>`ROUND(COUNT(*) FILTER (WHERE ${attendance.status} IN ('present', 'late')) * 100.0 / NULLIF(COUNT(*), 0))`,
      })
      .from(attendance)
      .innerJoin(teams, eq(attendance.teamId, teams.id))
      .where(and(...conditions))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(20);

    // Players with low attendance (below 70%)
    const lowAttendancePlayers = await getDb()
      .select({
        rosterId: rosters.id,
        playerName: sql<string>`CONCAT(${familyMembers.firstName}, ' ', ${familyMembers.lastName})`,
        teamName: teams.name,
        totalRecords: sql<number>`COUNT(*)`,
        present: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'present')`,
        absent: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'absent')`,
        attendanceRate: sql<number>`ROUND(COUNT(*) FILTER (WHERE ${attendance.status} IN ('present', 'late')) * 100.0 / NULLIF(COUNT(*), 0))`,
      })
      .from(attendance)
      .innerJoin(rosters, eq(attendance.rosterId, rosters.id))
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(teams, eq(attendance.teamId, teams.id))
      .where(and(...conditions))
      .groupBy(rosters.id, familyMembers.firstName, familyMembers.lastName, teams.name)
      .having(sql`COUNT(*) >= 3 AND COUNT(*) FILTER (WHERE ${attendance.status} IN ('present', 'late')) * 100.0 / NULLIF(COUNT(*), 0) < 70`)
      .orderBy(sql`COUNT(*) FILTER (WHERE ${attendance.status} IN ('present', 'late')) * 100.0 / NULLIF(COUNT(*), 0)`)
      .limit(10);

    // Recent attendance events
    const recentEvents = await getDb()
      .select({
        id: attendance.id,
        teamName: teams.name,
        eventDate: attendance.eventDate,
        eventType: attendance.eventType,
        status: attendance.status,
        playerName: sql<string>`CONCAT(${familyMembers.firstName}, ' ', ${familyMembers.lastName})`,
      })
      .from(attendance)
      .innerJoin(teams, eq(attendance.teamId, teams.id))
      .innerJoin(rosters, eq(attendance.rosterId, rosters.id))
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .where(and(...conditions))
      .orderBy(desc(attendance.eventDate))
      .limit(20);

    // Get list of teams for filter dropdown
    const teamsList = await getDb()
      .select({
        id: teams.id,
        name: teams.name,
      })
      .from(teams)
      .orderBy(teams.name);

    return new Response(
      JSON.stringify({
        summary: {
          ...summary,
          attendanceRate,
        },
        attendanceByPeriod,
        attendanceByEventType,
        attendanceByTeam,
        lowAttendancePlayers,
        recentEvents,
        teamsList,
        dateRange: { start, end },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching attendance report:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch attendance report" }), { status: 500 });
  }
};
