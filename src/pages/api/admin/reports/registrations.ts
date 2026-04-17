import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, sports, users } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc, count } from "drizzle-orm";
import { requireAdminAccess } from "@/lib/auth";

// GET - Get registration reports
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const url = new URL(context.request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const groupBy = url.searchParams.get("groupBy") || "month"; // day, week, month

    // Default to last 12 months if no dates provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getFullYear(), end.getMonth() - 11, 1);

    // Total registrations by status
    const registrationsByStatus = await getDb()
      .select({
        status: registrations.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(registrations)
      .where(
        and(
          gte(registrations.createdAt, start),
          lte(registrations.createdAt, end)
        )
      )
      .groupBy(registrations.status);

    const statusCounts: Record<string, number> = {};
    registrationsByStatus.forEach((r) => {
      statusCounts[r.status] = Number(r.count);
    });

    const totalRegistrations = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    // Registrations by time period
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

    const registrationsByPeriod = await getDb()
      .select({
        period: sql<string>`TO_CHAR(${registrations.createdAt}, ${sql.raw(`'${dateFormat}'`)})`,
        total: sql<number>`COUNT(*)`,
        confirmed: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'confirmed')`,
        pending: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'pending')`,
        cancelled: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'cancelled')`,
        waitlisted: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'waitlisted')`,
      })
      .from(registrations)
      .where(
        and(
          gte(registrations.createdAt, start),
          lte(registrations.createdAt, end)
        )
      )
      .groupBy(sql`TO_CHAR(${registrations.createdAt}, ${sql.raw(`'${dateFormat}'`)})`)
      .orderBy(sql`TO_CHAR(${registrations.createdAt}, ${sql.raw(`'${dateFormat}'`)})`);

    // Registrations by sport
    const registrationsBySport = await getDb()
      .select({
        sportId: sports.id,
        sportName: sports.name,
        total: sql<number>`COUNT(*)`,
        confirmed: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'confirmed')`,
      })
      .from(registrations)
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .where(
        and(
          gte(registrations.createdAt, start),
          lte(registrations.createdAt, end)
        )
      )
      .groupBy(sports.id, sports.name)
      .orderBy(desc(sql`COUNT(*)`));

    // Registrations by program
    const registrationsByProgram = await getDb()
      .select({
        programId: programs.id,
        programName: programs.name,
        sportName: sports.name,
        total: sql<number>`COUNT(*)`,
        confirmed: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'confirmed')`,
      })
      .from(registrations)
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .where(
        and(
          gte(registrations.createdAt, start),
          lte(registrations.createdAt, end)
        )
      )
      .groupBy(programs.id, programs.name, sports.name)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

    // Payment status breakdown
    const paymentStatusBreakdown = await getDb()
      .select({
        paymentStatus: registrations.paymentStatus,
        count: sql<number>`COUNT(*)`,
        totalAmountDue: sql<number>`COALESCE(SUM(${registrations.amountDueCents}), 0)`,
        totalAmountPaid: sql<number>`COALESCE(SUM(${registrations.amountPaidCents}), 0)`,
      })
      .from(registrations)
      .where(
        and(
          gte(registrations.createdAt, start),
          lte(registrations.createdAt, end)
        )
      )
      .groupBy(registrations.paymentStatus);

    // Recent registrations
    const recentRegistrations = await getDb()
      .select({
        id: registrations.id,
        status: registrations.status,
        paymentStatus: registrations.paymentStatus,
        createdAt: registrations.createdAt,
        familyMember: {
          firstName: familyMembers.firstName,
          lastName: familyMembers.lastName,
        },
        season: {
          name: seasons.name,
        },
        program: {
          name: programs.name,
        },
      })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .where(
        and(
          gte(registrations.createdAt, start),
          lte(registrations.createdAt, end)
        )
      )
      .orderBy(desc(registrations.createdAt))
      .limit(10);

    // Unique families/users who registered
    const uniqueFamiliesResult = await getDb()
      .select({
        count: sql<number>`COUNT(DISTINCT ${registrations.registeredByUserId})`,
      })
      .from(registrations)
      .where(
        and(
          gte(registrations.createdAt, start),
          lte(registrations.createdAt, end)
        )
      );

    // Calculate comparison with previous period
    const periodDuration = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodDuration);

    const prevRegistrationsResult = await getDb()
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(registrations)
      .where(
        and(
          gte(registrations.createdAt, prevStart),
          lte(registrations.createdAt, prevEnd)
        )
      );

    const prevCount = Number(prevRegistrationsResult[0]?.count || 0);
    const registrationChange = prevCount > 0
      ? ((totalRegistrations - prevCount) / prevCount) * 100
      : 0;

    // Conversion rate (confirmed / total)
    const conversionRate = totalRegistrations > 0
      ? (statusCounts["confirmed"] || 0) / totalRegistrations * 100
      : 0;

    return new Response(
      JSON.stringify({
        summary: {
          totalRegistrations,
          confirmedRegistrations: statusCounts["confirmed"] || 0,
          pendingRegistrations: statusCounts["pending"] || 0,
          cancelledRegistrations: statusCounts["cancelled"] || 0,
          waitlistedRegistrations: statusCounts["waitlisted"] || 0,
          uniqueFamilies: Number(uniqueFamiliesResult[0]?.count || 0),
          registrationChange: Math.round(registrationChange * 100) / 100,
          conversionRate: Math.round(conversionRate * 100) / 100,
        },
        registrationsByPeriod,
        registrationsBySport,
        registrationsByProgram,
        paymentStatusBreakdown,
        recentRegistrations,
        dateRange: { start, end },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching registration report:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch registration report" }), { status: 500 });
  }
};
