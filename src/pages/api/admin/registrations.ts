import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, sports, users } from "@/lib/db/schema";
import { locations } from "@/lib/db/schema/organizations";
import { eq, and, desc, or, ilike, sql } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";

// GET - List all registrations with filters
export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const db = getDb();

    const url = new URL(context.request.url);
    const status = url.searchParams.get("status");
    const paymentStatus = url.searchParams.get("paymentStatus");
    const seasonId = url.searchParams.get("seasonId");
    const search = url.searchParams.get("search");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Build conditions — always scope to caller's org via locations join
    const conditions = [eq(locations.organizationId, orgContext.organizationId)];

    if (status && status !== "all") {
      conditions.push(eq(registrations.status, status as any));
    }

    if (paymentStatus && paymentStatus !== "all") {
      conditions.push(eq(registrations.paymentStatus, paymentStatus as any));
    }

    if (seasonId) {
      conditions.push(eq(registrations.seasonId, seasonId));
    }

    // Search on player name or parent name/email — in the WHERE clause,
    // not post-fetch: filtering in JS after LIMIT both wasted the fetch
    // and silently dropped matches beyond the first page.
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(familyMembers.firstName, pattern),
          ilike(familyMembers.lastName, pattern),
          ilike(users.email, pattern),
          ilike(users.firstName, pattern),
          ilike(users.lastName, pattern),
        )!,
      );
    }

    // Registration listing and summary counts are independent of each
    // other — run in parallel.
    const [registrationData, summaryResult] = await Promise.all([
      getDb()
        .select({
          id: registrations.id,
          status: registrations.status,
          paymentStatus: registrations.paymentStatus,
          amountPaidCents: registrations.amountPaidCents,
          amountDueCents: registrations.amountDueCents,
          registrationType: registrations.registrationType,
          waiverSigned: registrations.waiverSigned,
          ageReviewNeeded: registrations.ageReviewNeeded,
          waitlistPosition: registrations.waitlistPosition,
          createdAt: registrations.createdAt,
          cancelledAt: registrations.cancelledAt,
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
          sport: {
            id: sports.id,
            name: sports.name,
          },
          registeredBy: {
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        })
        .from(registrations)
        .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
        .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .innerJoin(sports, eq(programs.sportId, sports.id))
        .innerJoin(users, eq(registrations.registeredByUserId, users.id))
        .where(and(...conditions))
        .orderBy(desc(registrations.createdAt))
        .limit(limit)
        .offset(offset),

      // Summary counts — also org-scoped
      getDb()
        .select({
          total: sql<number>`COUNT(*)`,
          confirmed: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'confirmed')`,
          pending: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'pending')`,
          waitlisted: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'waitlisted')`,
          cancelled: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'cancelled')`,
          paid: sql<number>`COUNT(*) FILTER (WHERE ${registrations.paymentStatus} = 'paid')`,
          unpaid: sql<number>`COUNT(*) FILTER (WHERE ${registrations.paymentStatus} = 'unpaid')`,
          partial: sql<number>`COUNT(*) FILTER (WHERE ${registrations.paymentStatus} = 'deposit_paid')`,
        })
        .from(registrations)
        .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(eq(locations.organizationId, orgContext.organizationId)),
    ]);

    return new Response(
      JSON.stringify({
        registrations: registrationData,
        summary: summaryResult[0],
        pagination: {
          limit,
          offset,
          hasMore: registrationData.length === limit,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching registrations:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch registrations" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
