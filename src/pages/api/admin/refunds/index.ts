import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, users, locations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireOrgAdminAccess } from "@/lib/auth";

// GET - List all refund requests (pending, processed, denied)
export const GET: APIRoute = async (context) => {
  // Verify admin access
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    // Get filter from query params
    const status = context.url.searchParams.get("status"); // pending_approval, approved, denied, processed, all

    // Build query - filter by organization through programs -> locations
    let query = getDb()
      .select({
        registration: registrations,
        familyMember: {
          id: familyMembers.id,
          firstName: familyMembers.firstName,
          lastName: familyMembers.lastName,
        },
        season: {
          id: seasons.id,
          name: seasons.name,
          startDate: seasons.startDate,
        },
        program: {
          id: programs.id,
          name: programs.name,
        },
        parent: {
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
      .innerJoin(users, eq(registrations.registeredByUserId, users.id))
      .where(eq(locations.organizationId, auth.organizationId))
      .orderBy(desc(registrations.cancelledAt));

    // Filter by refund status
    const results = await query;

    // Filter in JS since we need to check for non-null refundStatus
    let filteredResults = results.filter((r) => r.registration.refundStatus !== "none");

    if (status && status !== "all") {
      filteredResults = filteredResults.filter(
        (r) => r.registration.refundStatus === status
      );
    }

    // Format response
    const refundRequests = filteredResults.map((r) => ({
      id: r.registration.id,
      status: r.registration.status,
      refundStatus: r.registration.refundStatus,
      refundAmountCents: r.registration.refundAmountCents,
      amountPaidCents: r.registration.amountPaidCents,
      cancelledAt: r.registration.cancelledAt,
      cancelledReason: r.registration.cancelledReason,
      familyMember: r.familyMember,
      season: r.season,
      program: r.program,
      parent: r.parent,
    }));

    // Calculate summary
    const summary = {
      pending: results.filter((r) => r.registration.refundStatus === "pending_approval").length,
      approved: results.filter((r) => r.registration.refundStatus === "approved").length,
      processed: results.filter((r) => r.registration.refundStatus === "processed").length,
      denied: results.filter((r) => r.registration.refundStatus === "denied").length,
      totalPendingAmountCents: results
        .filter((r) => r.registration.refundStatus === "pending_approval")
        .reduce((sum, r) => sum + (r.registration.refundAmountCents || 0), 0),
    };

    return new Response(
      JSON.stringify({
        refundRequests,
        summary,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching refund requests:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
