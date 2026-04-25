import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, sports, locations, ageGroups } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { createRegistration, RegistrationError } from "@/lib/registrations/create-registration";

const createRegistrationSchema = z.object({
  seasonId: z.string().uuid("Invalid season ID"),
  familyMemberId: z.string().uuid("Invalid family member ID"),
  registrationType: z.enum(["full", "deposit"]),
  waiverSigned: z.boolean(),
  waiverSignedBy: z.string().min(1, "Waiver signature required"),
  notes: z.string().optional(),
});

// GET - List registrations for current user
export const GET: APIRoute = async ({ locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    const userRegistrations = await getDb()
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
      .where(eq(registrations.registeredByUserId, user.id))
      .orderBy(desc(registrations.createdAt));

    const formatted = userRegistrations.map((r) => ({
      id: r.registration.id,
      status: r.registration.status,
      paymentStatus: r.registration.paymentStatus,
      amountPaidCents: r.registration.amountPaidCents,
      amountDueCents: r.registration.amountDueCents,
      registrationType: r.registration.registrationType,
      waiverSigned: r.registration.waiverSigned,
      createdAt: r.registration.createdAt,
      familyMember: {
        id: r.familyMember.id,
        firstName: r.familyMember.firstName,
        lastName: r.familyMember.lastName,
        birthDate: r.familyMember.birthDate,
      },
      season: {
        id: r.season.id,
        name: r.season.name,
        startDate: r.season.startDate,
        endDate: r.season.endDate,
        scheduleNotes: r.season.scheduleNotes,
      },
      program: {
        id: r.program.id,
        name: r.program.name,
        slug: r.program.slug,
      },
      sport: {
        id: r.sport.id,
        name: r.sport.name,
        icon: r.sport.icon,
        color: r.sport.color,
      },
      location: {
        id: r.location.id,
        name: r.location.name,
        city: r.location.city,
      },
      ageGroup: r.ageGroup
        ? {
            id: r.ageGroup.id,
            name: r.ageGroup.name,
            minAge: r.ageGroup.minAge,
            maxAge: r.ageGroup.maxAge,
          }
        : null,
    }));

    return new Response(JSON.stringify({ registrations: formatted }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching registrations:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// POST - Create new registration
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();
    const body = await request.json();
    const validation = createRegistrationSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const data = validation.data;

    const [familyMember] = await db
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.id, data.familyMemberId),
          eq(familyMembers.parentUserId, user.id),
        ),
      );
    if (!familyMember) {
      return new Response(JSON.stringify({ error: "Family member not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const result = await createRegistration({
        db,
        user: { id: user.id, email: user.email, firstName: user.firstName },
        familyMember,
        seasonId: data.seasonId,
        registrationType: data.registrationType,
        waiverSigned: data.waiverSigned,
        waiverSignedBy: data.waiverSignedBy,
        notes: data.notes,
      });

      const status = result.kind === "resumed" ? 200 : 201;
      return new Response(
        JSON.stringify({
          registration: result.registration,
          requiresPayment: result.requiresPayment,
          amountDueCents: result.amountDueCents,
          ...(result.kind === "resumed" ? { resumed: true } : {}),
          ...(result.kind === "waitlisted"
            ? { message: "Added to waitlist - season is at capacity" }
            : {}),
        }),
        { status, headers: { "Content-Type": "application/json" } },
      );
    } catch (err) {
      if (err instanceof RegistrationError) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: err.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw err;
    }
  } catch (error) {
    console.error("Error creating registration:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
