import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  seasons,
  programs,
  sports,
  users,
  locations,
  payments,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";

/**
 * Admin detail view for a single registration. Returns the registration with
 * family member / season / program / sport / location / parent user, plus the
 * full payment history (most recent first).
 *
 * Tenant scoped: returns 404 if the row's program.location.organizationId does
 * not match the caller's org context — matches the list endpoint pattern.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Registration ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // The tenant-scoped row lookup and the payment history are independent
    // of each other at the query level (paymentHistory only filters on
    // `id`) — run in parallel, then apply the 404 gate after both resolve
    // and discard paymentHistory if the row turned out to be out of the
    // caller's org (no data leaks: it's never included in the 404 response).
    const [[row], paymentHistory] = await Promise.all([
      getDb()
        .select({
          registration: registrations,
          familyMember: familyMembers,
          season: seasons,
          program: programs,
          sport: sports,
          location: locations,
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
        .innerJoin(sports, eq(programs.sportId, sports.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .innerJoin(users, eq(registrations.registeredByUserId, users.id))
        .where(
          and(
            eq(registrations.id, id),
            eq(locations.organizationId, orgContext.organizationId),
          ),
        ),

      getDb()
        .select()
        .from(payments)
        .where(eq(payments.registrationId, id))
        .orderBy(desc(payments.createdAt)),
    ]);

    if (!row) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        registration: row.registration,
        familyMember: {
          id: row.familyMember.id,
          firstName: row.familyMember.firstName,
          lastName: row.familyMember.lastName,
          birthDate: row.familyMember.birthDate,
        },
        season: {
          id: row.season.id,
          name: row.season.name,
          startDate: row.season.startDate,
          endDate: row.season.endDate,
          priceCents: row.season.priceCents,
        },
        program: {
          id: row.program.id,
          name: row.program.name,
          slug: row.program.slug,
        },
        sport: {
          id: row.sport.id,
          name: row.sport.name,
          slug: row.sport.slug,
        },
        location: {
          id: row.location.id,
          name: row.location.name,
        },
        parent: row.parent,
        paymentHistory,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error fetching admin registration detail:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

/**
 * Hard-delete a registration row. Guarded: refuses when the row has paid
 * money that has not been refunded (`amountPaidCents > 0 && paymentStatus !=
 * 'refunded'`), unless `?force=true` is passed. The guard is there to stop
 * an admin from deleting a row that still has live Stripe money — the right
 * flow is refund first, then delete.
 */
export const DELETE: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Registration ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const force = new URL(context.request.url).searchParams.get("force") === "true";

  try {
    const [row] = await getDb()
      .select({
        registration: registrations,
      })
      .from(registrations)
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(
        and(
          eq(registrations.id, id),
          eq(locations.organizationId, orgContext.organizationId),
        ),
      );

    if (!row) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const amountPaid = row.registration.amountPaidCents ?? 0;
    const hasUnreturnedMoney =
      amountPaid > 0 && row.registration.paymentStatus !== "refunded";

    if (hasUnreturnedMoney && !force) {
      return new Response(
        JSON.stringify({
          error: "Refund the registration before deleting, or pass force=true",
          amountPaidCents: amountPaid,
          paymentStatus: row.registration.paymentStatus,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    await getDb().delete(registrations).where(eq(registrations.id, id));

    return new Response(
      JSON.stringify({ success: true, deletedId: id, forced: force }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error deleting registration:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
