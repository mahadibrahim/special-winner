import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  payments,
  registrations,
  seasons,
  programs,
  sports,
  teamRegistrations,
} from "@/lib/db/schema";
import { locations } from "@/lib/db/schema/organizations";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { periodBucket } from "@/lib/admin/report-period";

// Every query below resolves a payment's season either through its solo
// registration or through its team registration (captain deposit, backstop
// balance) — see #525. Orphaned rows (both ids NULL) stay excluded by the
// inner seasons join, matching the old behavior.
const paymentSeasonId = sql`COALESCE(${registrations.seasonId}, ${teamRegistrations.seasonId})`;

// GET - Get revenue reports
export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) {
    return auth.response;
  }

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

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

    const orgScope = eq(locations.organizationId, orgContext.organizationId);

    // Revenue by time period — bucket expression comes from a closed
    // map (never request input); see periodBucket for why.
    const periodExpr = periodBucket(payments.createdAt, groupBy);

    // Calculate comparison with previous period
    const periodDuration = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodDuration);

    // All 7 queries below are independent of each other — run in parallel.
    const [
      totalRevenueResult,
      revenueByPeriod,
      revenueByType,
      revenueBySport,
      recentTransactions,
      prevRevenueResult,
      refundsResult,
    ] = await Promise.all([
      // Total revenue (org-scoped via payments -> registrations -> seasons -> programs -> locations)
      getDb()
        .select({
          total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(payments)
        .leftJoin(registrations, eq(payments.registrationId, registrations.id))
        .leftJoin(teamRegistrations, eq(payments.teamRegistrationId, teamRegistrations.id))
        .innerJoin(seasons, sql`${seasons.id} = ${paymentSeasonId}`)
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(
          and(
            orgScope,
            eq(payments.status, "succeeded"),
            gte(payments.createdAt, start),
            lte(payments.createdAt, end)
          )
        ),

      getDb()
        .select({
          period: periodExpr,
          revenue: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
          transactionCount: sql<number>`COUNT(*)`,
        })
        .from(payments)
        .leftJoin(registrations, eq(payments.registrationId, registrations.id))
        .leftJoin(teamRegistrations, eq(payments.teamRegistrationId, teamRegistrations.id))
        .innerJoin(seasons, sql`${seasons.id} = ${paymentSeasonId}`)
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(
          and(
            orgScope,
            eq(payments.status, "succeeded"),
            gte(payments.createdAt, start),
            lte(payments.createdAt, end)
          )
        )
        .groupBy(periodExpr)
        .orderBy(periodExpr),

      // Revenue by payment type
      getDb()
        .select({
          paymentType: payments.paymentType,
          revenue: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(payments)
        .leftJoin(registrations, eq(payments.registrationId, registrations.id))
        .leftJoin(teamRegistrations, eq(payments.teamRegistrationId, teamRegistrations.id))
        .innerJoin(seasons, sql`${seasons.id} = ${paymentSeasonId}`)
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(
          and(
            orgScope,
            eq(payments.status, "succeeded"),
            gte(payments.createdAt, start),
            lte(payments.createdAt, end)
          )
        )
        .groupBy(payments.paymentType),

      // Revenue by sport/program
      getDb()
        .select({
          sportId: sports.id,
          sportName: sports.name,
          revenue: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
          registrations: sql<number>`COUNT(DISTINCT ${registrations.id})`,
        })
        .from(payments)
        .leftJoin(registrations, eq(payments.registrationId, registrations.id))
        .leftJoin(teamRegistrations, eq(payments.teamRegistrationId, teamRegistrations.id))
        .innerJoin(seasons, sql`${seasons.id} = ${paymentSeasonId}`)
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .innerJoin(sports, eq(programs.sportId, sports.id))
        .where(
          and(
            orgScope,
            eq(payments.status, "succeeded"),
            gte(payments.createdAt, start),
            lte(payments.createdAt, end)
          )
        )
        .groupBy(sports.id, sports.name)
        .orderBy(desc(sql`SUM(${payments.amountCents})`)),

      // Recent transactions
      getDb()
        .select({
          id: payments.id,
          amountCents: payments.amountCents,
          paymentType: payments.paymentType,
          status: payments.status,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .leftJoin(registrations, eq(payments.registrationId, registrations.id))
        .leftJoin(teamRegistrations, eq(payments.teamRegistrationId, teamRegistrations.id))
        .innerJoin(seasons, sql`${seasons.id} = ${paymentSeasonId}`)
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(
          and(
            orgScope,
            eq(payments.status, "succeeded"),
            gte(payments.createdAt, start),
            lte(payments.createdAt, end)
          )
        )
        .orderBy(desc(payments.createdAt))
        .limit(10),

      // Previous period, for the comparison
      getDb()
        .select({
          total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
        })
        .from(payments)
        .leftJoin(registrations, eq(payments.registrationId, registrations.id))
        .leftJoin(teamRegistrations, eq(payments.teamRegistrationId, teamRegistrations.id))
        .innerJoin(seasons, sql`${seasons.id} = ${paymentSeasonId}`)
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(
          and(
            orgScope,
            eq(payments.status, "succeeded"),
            gte(payments.createdAt, prevStart),
            lte(payments.createdAt, prevEnd)
          )
        ),

      // Refunds summary
      getDb()
        .select({
          total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(payments)
        .leftJoin(registrations, eq(payments.registrationId, registrations.id))
        .leftJoin(teamRegistrations, eq(payments.teamRegistrationId, teamRegistrations.id))
        .innerJoin(seasons, sql`${seasons.id} = ${paymentSeasonId}`)
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(
          and(
            orgScope,
            eq(payments.paymentType, "refund"),
            gte(payments.createdAt, start),
            lte(payments.createdAt, end)
          )
        ),
    ]);

    const totalRevenue = totalRevenueResult[0];
    const prevRevenue = prevRevenueResult[0]?.total || 0;
    const revenueChange = prevRevenue > 0
      ? ((totalRevenue.total - prevRevenue) / prevRevenue) * 100
      : 0;

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
