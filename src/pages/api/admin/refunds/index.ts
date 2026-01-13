import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { isAdmin } from "@/lib/auth/roles";

// GET - List all refund requests (pending, processed, denied)
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check admin access
    const adminAccess = await isAdmin(user.id);
    if (!adminAccess) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get filter from query params
    const status = url.searchParams.get("status"); // pending_approval, approved, denied, processed, all

    // Build query
    let query = db
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
      .innerJoin(users, eq(registrations.registeredByUserId, users.id))
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
