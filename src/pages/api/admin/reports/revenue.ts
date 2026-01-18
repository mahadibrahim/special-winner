import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { payments, registrations, seasons, programs, sports } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

// GET - Get revenue reports
export const GET: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const url = new URL(context.request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const sportId = url.searchParams.get("sportId");
    const groupBy = url.searchParams.get("groupBy") || "month"; // day, week, month

    // Default to last 12 months if no dates provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getFullYear(), end.getMonth() - 11, 1);

    // Total revenue
    const totalRevenueResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.status, "succeeded"),
          gte(payments.createdAt, start),
          lte(payments.createdAt, end)
        )
      );

    const totalRevenue = totalRevenueResult[0];

    // Revenue by time period
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

    const revenueByPeriod = await db
      .select({
        period: sql<string>`TO_CHAR(${payments.createdAt}, ${dateFormat})`,
        revenue: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
        transactionCount: sql<number>`COUNT(*)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.status, "succeeded"),
          gte(payments.createdAt, start),
          lte(payments.createdAt, end)
        )
      )
      .groupBy(sql`TO_CHAR(${payments.createdAt}, ${dateFormat})`)
      .orderBy(sql`TO_CHAR(${payments.createdAt}, ${dateFormat})`);

    // Revenue by payment type
    const revenueByType = await db
      .select({
        paymentType: payments.paymentType,
        revenue: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.status, "succeeded"),
          gte(payments.createdAt, start),
          lte(payments.createdAt, end)
        )
      )
      .groupBy(payments.paymentType);

    // Revenue by sport/program
    const revenueBySport = await db
      .select({
        sportId: sports.id,
        sportName: sports.name,
        revenue: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
        registrations: sql<number>`COUNT(DISTINCT ${registrations.id})`,
      })
      .from(payments)
      .innerJoin(registrations, eq(payments.registrationId, registrations.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .where(
        and(
          eq(payments.status, "succeeded"),
          gte(payments.createdAt, start),
          lte(payments.createdAt, end)
        )
      )
      .groupBy(sports.id, sports.name)
      .orderBy(desc(sql`SUM(${payments.amountCents})`));

    // Recent transactions
    const recentTransactions = await db
      .select({
        id: payments.id,
        amountCents: payments.amountCents,
        paymentType: payments.paymentType,
        status: payments.status,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(
        and(
          eq(payments.status, "succeeded"),
          gte(payments.createdAt, start),
          lte(payments.createdAt, end)
        )
      )
      .orderBy(desc(payments.createdAt))
      .limit(10);

    // Calculate comparison with previous period
    const periodDuration = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodDuration);

    const prevRevenueResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.status, "succeeded"),
          gte(payments.createdAt, prevStart),
          lte(payments.createdAt, prevEnd)
        )
      );

    const prevRevenue = prevRevenueResult[0]?.total || 0;
    const revenueChange = prevRevenue > 0
      ? ((totalRevenue.total - prevRevenue) / prevRevenue) * 100
      : 0;

    // Refunds summary
    const refundsResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.paymentType, "refund"),
          gte(payments.createdAt, start),
          lte(payments.createdAt, end)
        )
      );

    return new Response(
      JSON.stringify({
        summary: {
          totalRevenue: totalRevenue.total,
          transactionCount: totalRevenue.count,
          revenueChange: Math.round(revenueChange * 100) / 100,
          refunds: refundsResult[0],
        },
        revenueByPeriod,
        revenueByType,
        revenueBySport,
        recentTransactions,
        dateRange: { start, end },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching revenue report:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch revenue report" }), { status: 500 });
  }
};
