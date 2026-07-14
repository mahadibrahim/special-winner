import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { attendance, teams, rosters, seasons, programs, sports, familyMembers, registrations } from "@/lib/db/schema";
import { locations } from "@/lib/db/schema/organizations";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { periodBucket } from "@/lib/admin/report-period";

// GET - Get attendance reports
export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) {
    return auth.response;
  }

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

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

    // Org-scoped team set — attendance has no direct org column, so every
    // query in this report filters teamId through the org's teams
    // (team -> season -> program -> location -> organization). Without
    // this the report aggregated attendance across ALL tenants.
    const orgTeamIds = db
      .select({ id: teams.id })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(eq(locations.organizationId, orgContext.organizationId));

    // Build base conditions
    const conditions = [
      gte(attendance.eventDate, start),
      lte(attendance.eventDate, end),
      inArray(attendance.teamId, orgTeamIds),
    ];

    if (teamId) {
      conditions.push(eq(attendance.teamId, teamId));
    }

    // Attendance by time period — bucket expression comes from a closed
    // map (never request input); see periodBucket for why.
    const periodExpr = periodBucket(attendance.eventDate, groupBy);

    // All 7 queries below share `conditions` / `periodExpr` but are
    // otherwise independent of each other — run in parallel.
    const [
      summaryResult,
      attendanceByPeriod,
      attendanceByEventType,
      attendanceByTeam,
      lowAttendancePlayers,
      recentEvents,
      teamsList,
    ] = await Promise.all([
      // Overall attendance summary
      getDb()
        .select({
          totalRecords: sql<number>`COUNT(*)`,
          present: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'present')`,
          absent: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'absent')`,
          late: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'late')`,
          excused: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'excused')`,
        })
        .from(attendance)
        .where(and(...conditions)),

      getDb()
        .select({
          period: periodExpr,
          totalRecords: sql<number>`COUNT(*)`,
          present: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'present')`,
          absent: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'absent')`,
          late: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'late')`,
          excused: sql<number>`COUNT(*) FILTER (WHERE ${attendance.status} = 'excused')`,
        })
        .from(attendance)
        .where(and(...conditions))
        .groupBy(periodExpr)
        .orderBy(periodExpr),

      // Attendance by event type
      getDb()
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
        .groupBy(attendance.eventType),

      // Attendance by team
      getDb()
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
        .limit(20),

      // Players with low attendance (below 70%)
      getDb()
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
        .limit(10),

      // Recent attendance events
      getDb()
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
        .limit(20),

      // Get list of teams for filter dropdown — org-scoped, same as the
      // report queries above.
      getDb()
        .select({
          id: teams.id,
          name: teams.name,
        })
        .from(teams)
        .where(inArray(teams.id, orgTeamIds))
        .orderBy(teams.name),
    ]);

    const summary = summaryResult[0];
    const attendanceRate = summary.totalRecords > 0
      ? Math.round(((summary.present + summary.late) / summary.totalRecords) * 100)
      : 0;

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
