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
import { memberships } from "@/lib/db/schema/memberships";
import { locations } from "@/lib/db/schema/organizations";
import { eq, and, gte, lte, ne, sql, desc } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { periodBucket } from "@/lib/admin/report-period";

// Every query below resolves a payment's season either through its solo
// registration or through its team registration (captain deposit, backstop
// balance) — see #525. Orphaned rows (both ids NULL) stay excluded by the
// inner seasons join, matching the old behavior.
const paymentSeasonId = sql`COALESCE(${registrations.seasonId}, ${teamRegistrations.seasonId})`;

// A settled refund row (paymentType='refund', status='succeeded' — the
// deposit-refund executor in src/lib/payments/team-deposit-refund.ts is the
// first flow to actually insert one) must NOT be counted as revenue: it's
// money going back OUT, already surfaced separately via the dedicated
// "Refunds summary" query below (which filters TO paymentType='refund').
// Without this, a refund row would double as "revenue" here AND as a
// refund there, inflating totalRevenue/revenueByPeriod/revenueBySport and
// showing a nonsensical positive "Recent Transactions" entry for money that
// left, not arrived — recentTransactions here has no refund-aware
// rendering (contrast admin/payments.ts's payments-list.tsx, which renders
// refund rows with a "-" prefix; this dashboard's Recent Transactions card
// does not), so excluding is the consistent choice, not just netting.
const notARefund = ne(payments.paymentType, "refund");

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

    // Memberships are org-scoped through `memberships.organizationId`
    // directly, not through registrations/seasons/programs/locations — a
    // membership payment has no registrationId/teamRegistrationId, so it's
    // invisible to every inner-joined-on-seasons query above. Rather than
    // widen those joins (memberships have no sport/season), pull membership
    // revenue as a parallel summary and fold it into the totals + type
    // breakdown below. This is the smallest change that surfaces
    // month-2+ subscription revenue (see invoice-ledger.ts) without
    // touching revenueBySport or recentTransactions, which don't have a
    // membership-shaped analog.
    const membershipOrgScope = eq(memberships.organizationId, orgContext.organizationId);
    const membershipRevenueWhere = (rangeStart: Date, rangeEnd: Date) =>
      and(
        membershipOrgScope,
        eq(payments.paymentType, "membership"),
        eq(payments.status, "succeeded"),
        gte(payments.createdAt, rangeStart),
        lte(payments.createdAt, rangeEnd)
      );

    // All 10 queries below are independent of each other — run in parallel.
    const [
      totalRevenueResult,
      revenueByPeriodRows,
      revenueByType,
      revenueBySport,
      recentTransactions,
      prevRevenueResult,
      refundsResult,
      membershipRevenueResult,
      prevMembershipRevenueResult,
      membershipRevenueByPeriod,
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
            notARefund,
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
            notARefund,
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
            notARefund,
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
            notARefund,
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

      // Membership revenue, current period (see membershipRevenueWhere above).
      getDb()
        .select({
          total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(payments)
        .innerJoin(memberships, eq(payments.membershipId, memberships.id))
        .where(membershipRevenueWhere(start, end)),

      // Membership revenue, previous period — for the same comparison the
      // registration-revenue query above gets.
      getDb()
        .select({
          total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
        })
        .from(payments)
        .innerJoin(memberships, eq(payments.membershipId, memberships.id))
        .where(membershipRevenueWhere(prevStart, prevEnd)),

      // Membership revenue by period, bucketed the same way as
      // revenueByPeriodRows above — merged into it below so the "Revenue
      // Over Time" chart's bars aren't missing subscription revenue that
      // the Total Revenue card already counts.
      getDb()
        .select({
          period: periodExpr,
          revenue: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
          transactionCount: sql<number>`COUNT(*)`,
        })
        .from(payments)
        .innerJoin(memberships, eq(payments.membershipId, memberships.id))
        .where(membershipRevenueWhere(start, end))
        .groupBy(periodExpr)
        .orderBy(periodExpr),
    ]);

    // postgres.js returns SUM()/COUNT() aggregates as strings (Postgres
    // numeric/bigint have no safe native JS representation), while plain
    // integer columns (e.g. recentTransactions.amountCents) come back as
    // real numbers already. Every aggregate below gets coerced HERE, at the
    // API boundary, before any arithmetic touches it — `1 + "2"` is fine,
    // `"1" + "2"` silently concatenates, and the merge below adds two
    // aggregate sums together, so doing this after the merge would still
    // be broken for any bucket where either side came back as a string.
    const num = (v: unknown): number => Number(v) || 0;

    const totalRevenue = {
      total: num(totalRevenueResult[0]?.total),
      count: num(totalRevenueResult[0]?.count),
    };
    const membershipRevenue = {
      total: num(membershipRevenueResult[0]?.total),
      count: num(membershipRevenueResult[0]?.count),
    };
    const prevRevenue =
      num(prevRevenueResult[0]?.total) + num(prevMembershipRevenueResult[0]?.total);
    const refunds = {
      total: num(refundsResult[0]?.total),
      count: num(refundsResult[0]?.count),
    };

    // Merge membership-by-period rows into the registration-by-period rows,
    // summing when a period bucket appears in both (e.g. a month with both
    // registration and membership payments). Both sides are coerced to
    // numbers before the merge so `+=` adds instead of concatenating.
    const revenueByPeriodMap = new Map<
      string,
      { period: string; revenue: number; transactionCount: number }
    >();
    for (const row of revenueByPeriodRows) {
      revenueByPeriodMap.set(row.period, {
        period: row.period,
        revenue: num(row.revenue),
        transactionCount: num(row.transactionCount),
      });
    }
    for (const row of membershipRevenueByPeriod) {
      const revenue = num(row.revenue);
      const transactionCount = num(row.transactionCount);
      const existing = revenueByPeriodMap.get(row.period);
      if (existing) {
        existing.revenue += revenue;
        existing.transactionCount += transactionCount;
      } else {
        revenueByPeriodMap.set(row.period, { period: row.period, revenue, transactionCount });
      }
    }
    const revenueByPeriod = Array.from(revenueByPeriodMap.values()).sort((a, b) =>
      a.period.localeCompare(b.period)
    );

    const revenueByTypeNumeric = revenueByType.map((row) => ({
      paymentType: row.paymentType,
      revenue: num(row.revenue),
      count: num(row.count),
    }));

    const revenueBySportNumeric = revenueBySport.map((row) => ({
      sportId: row.sportId,
      sportName: row.sportName,
      revenue: num(row.revenue),
      registrations: num(row.registrations),
    }));

    const combinedTotal = totalRevenue.total + membershipRevenue.total;
    const combinedCount = totalRevenue.count + membershipRevenue.count;
    const revenueChange = prevRevenue > 0
      ? ((combinedTotal - prevRevenue) / prevRevenue) * 100
      : 0;

    // Membership revenue doesn't come out of the payment-type groupBy above
    // (it's excluded by the inner join on seasons), so append it as its own
    // row when there's any to show — same {paymentType, revenue, count}
    // shape the UI already renders per payment type.
    const revenueByTypeWithMembership =
      membershipRevenue.count > 0
        ? [
            ...revenueByTypeNumeric,
            {
              paymentType: "membership",
              revenue: membershipRevenue.total,
              count: membershipRevenue.count,
            },
          ]
        : revenueByTypeNumeric;

    return new Response(
      JSON.stringify({
        summary: {
          totalRevenue: combinedTotal,
          transactionCount: combinedCount,
          revenueChange: Math.round(revenueChange * 100) / 100,
          refunds,
        },
        revenueByPeriod,
        revenueByType: revenueByTypeWithMembership,
        revenueBySport: revenueBySportNumeric,
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
