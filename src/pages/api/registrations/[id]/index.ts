import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  seasons,
  programs,
  sports,
  locations,
  ageGroups,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Registration ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [row] = await getDb()
      .select({
        registration: registrations,
        familyMember: familyMembers,
        season: seasons,
        program: programs,
        sport: sports,
        location: locations,
        ageGroup: ageGroups,
      })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
      .where(
        and(
          eq(registrations.id, id),
          eq(registrations.registeredByUserId, user.id),
        ),
      );

    if (!row) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const formatted = {
      id: row.registration.id,
      status: row.registration.status,
      paymentStatus: row.registration.paymentStatus,
      amountPaidCents: row.registration.amountPaidCents,
      amountDueCents: row.registration.amountDueCents,
      registrationType: row.registration.registrationType,
      waiverSigned: row.registration.waiverSigned,
      notes: row.registration.notes,
      createdAt: row.registration.createdAt,
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
        scheduleNotes: row.season.scheduleNotes,
        priceCents: row.season.priceCents,
        depositCents: row.season.depositCents,
      },
      program: {
        id: row.program.id,
        name: row.program.name,
        slug: row.program.slug,
        description: row.program.description,
        programType: row.program.programType,
      },
      sport: {
        id: row.sport.id,
        name: row.sport.name,
        slug: row.sport.slug,
        icon: row.sport.icon,
        color: row.sport.color,
      },
      location: {
        id: row.location.id,
        name: row.location.name,
        addressLine1: row.location.addressLine1,
        addressLine2: row.location.addressLine2,
        city: row.location.city,
        state: row.location.state,
        postalCode: row.location.postalCode,
        phone: row.location.phone,
        email: row.location.email,
      },
      ageGroup: row.ageGroup
        ? {
            id: row.ageGroup.id,
            name: row.ageGroup.name,
            minAge: row.ageGroup.minAge,
            maxAge: row.ageGroup.maxAge,
          }
        : null,
    };

    return new Response(JSON.stringify({ registration: formatted }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching registration:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
