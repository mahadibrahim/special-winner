import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { seasons, programs, sports, locations, ageGroups, registrations, organizations } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const organization = locals.organization;
    if (!organization) {
      return new Response(JSON.stringify({ error: "Season not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Season ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get season with related data, enforcing tenant scope via org join
    const [result] = await db
      .select({
        season: seasons,
        program: programs,
        sport: sports,
        location: locations,
        ageGroup: ageGroups,
      })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      // NEW: enforce active org + matching tenant
      .innerJoin(
        organizations,
        and(
          eq(organizations.id, sports.organizationId),
          eq(organizations.status, "active"),
          eq(organizations.id, organization.id),
        ),
      )
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
      .where(eq(seasons.id, id));

    if (!result) {
      return new Response(JSON.stringify({ error: "Season not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get registration count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(registrations)
      .where(
        and(
          eq(registrations.seasonId, id),
          sql`${registrations.status} IN ('pending', 'confirmed')`
        )
      );

    const registeredCount = countResult?.count || 0;
    const spotsLeft = result.season.maxParticipants
      ? Math.max(0, result.season.maxParticipants - registeredCount)
      : null;

    const formatted = {
      id: result.season.id,
      name: result.season.name,
      slug: result.season.slug,
      startDate: result.season.startDate,
      endDate: result.season.endDate,
      registrationOpens: result.season.registrationOpens,
      registrationCloses: result.season.registrationCloses,
      maxParticipants: result.season.maxParticipants,
      registeredCount,
      spotsLeft,
      price: result.season.priceCents / 100,
      priceCents: result.season.priceCents,
      deposit: result.season.depositCents ? result.season.depositCents / 100 : null,
      depositCents: result.season.depositCents,
      allowDeposit: result.season.allowDeposit,
      status: result.season.status,
      scheduleNotes: result.season.scheduleNotes,
      program: {
        id: result.program.id,
        name: result.program.name,
        slug: result.program.slug,
        description: result.program.description,
        programType: result.program.programType,
      },
      sport: {
        id: result.sport.id,
        name: result.sport.name,
        slug: result.sport.slug,
        icon: result.sport.icon,
        color: result.sport.color,
      },
      location: {
        id: result.location.id,
        name: result.location.name,
        slug: result.location.slug,
        address: result.location.addressLine1,
        city: result.location.city,
        state: result.location.state,
      },
      ageGroup: result.ageGroup
        ? {
            id: result.ageGroup.id,
            name: result.ageGroup.name,
            minAge: result.ageGroup.minAge,
            maxAge: result.ageGroup.maxAge,
          }
        : null,
    };

    return new Response(JSON.stringify({ season: formatted }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching season:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
