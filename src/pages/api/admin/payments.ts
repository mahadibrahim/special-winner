import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { payments, registrations, familyMembers, seasons, programs, users } from "@/lib/db/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

// GET - List all payments with filters
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const db = getDb();

    const url = new URL(context.request.url);
    const status = url.searchParams.get("status");
    const paymentType = url.searchParams.get("paymentType");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Build conditions
    const conditions = [];

    if (status && status !== "all") {
      conditions.push(eq(payments.status, status as any));
    }

    if (paymentType && paymentType !== "all") {
      conditions.push(eq(payments.paymentType, paymentType as any));
    }

    if (startDate) {
      conditions.push(gte(payments.createdAt, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(payments.createdAt, new Date(endDate)));
    }

    // Get payments with related data
    const paymentData = await getDb()
      .select({
        id: payments.id,
        amountCents: payments.amountCents,
        paymentType: payments.paymentType,
        status: payments.status,
        stripePaymentIntentId: payments.stripePaymentIntentId,
        createdAt: payments.createdAt,
        registration: {
          id: registrations.id,
          status: registrations.status,
        },
        familyMember: {
          id: familyMembers.id,
          firstName: familyMembers.firstName,
          lastName: familyMembers.lastName,
        },
        season: {
          id: seasons.id,
          name: seasons.name,
        },
        program: {
          id: programs.id,
          name: programs.name,
        },
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(payments)
      .innerJoin(registrations, eq(payments.registrationId, registrations.id))
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(users, eq(payments.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset);

    // Get summary
    const summaryResult = await getDb()
      .select({
        totalPayments: sql<number>`COUNT(*)`,
        totalRevenue: sql<number>`COALESCE(SUM(${payments.amountCents}) FILTER (WHERE ${payments.status} = 'succeeded' AND ${payments.paymentType} != 'refund'), 0)`,
        totalRefunds: sql<number>`COALESCE(SUM(${payments.amountCents}) FILTER (WHERE ${payments.paymentType} = 'refund'), 0)`,
        pendingPayments: sql<number>`COUNT(*) FILTER (WHERE ${payments.status} = 'pending')`,
        succeededPayments: sql<number>`COUNT(*) FILTER (WHERE ${payments.status} = 'succeeded')`,
        failedPayments: sql<number>`COUNT(*) FILTER (WHERE ${payments.status} = 'failed')`,
      })
      .from(payments);

    return new Response(
      JSON.stringify({
        payments: paymentData,
        summary: summaryResult[0],
        pagination: {
          limit,
          offset,
          hasMore: paymentData.length === limit,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching payments:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch payments" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
