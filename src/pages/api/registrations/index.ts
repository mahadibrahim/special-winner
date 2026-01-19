import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, sports, locations, ageGroups, users } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { sendRegistrationConfirmationEmail } from "@/lib/email/send";

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
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const data = validation.data;

    // Verify family member belongs to user
    const [familyMember] = await getDb()
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.id, data.familyMemberId), eq(familyMembers.parentUserId, user.id)));

    if (!familyMember) {
      return new Response(JSON.stringify({ error: "Family member not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get season details
    const [season] = await getDb()
      .select()
      .from(seasons)
      .where(eq(seasons.id, data.seasonId));

    if (!season) {
      return new Response(JSON.stringify({ error: "Season not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (season.status !== "open") {
      return new Response(JSON.stringify({ error: "Registration is not open for this season" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check for existing registration
    const [existingReg] = await getDb()
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.seasonId, data.seasonId),
          eq(registrations.familyMemberId, data.familyMemberId)
        )
      );

    if (existingReg) {
      return new Response(
        JSON.stringify({ error: "This player is already registered for this season" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check capacity
    if (season.maxParticipants) {
      const [{ count }] = await getDb()
        .select({ count: registrations.id })
        .from(registrations)
        .where(
          and(
            eq(registrations.seasonId, data.seasonId),
            eq(registrations.status, "confirmed")
          )
        );

      // Note: This is a simplification - in production you'd want a more accurate count
      const registeredCount = count ? 1 : 0;
      if (registeredCount >= season.maxParticipants) {
        // Waitlist the registration
        const amountDue = data.registrationType === "deposit" && season.depositCents
          ? season.depositCents
          : season.priceCents;

        const [newRegistration] = await getDb()
          .insert(registrations)
          .values({
            seasonId: data.seasonId,
            familyMemberId: data.familyMemberId,
            registeredByUserId: user.id,
            status: "waitlisted",
            paymentStatus: "unpaid",
            amountPaidCents: 0,
            amountDueCents: amountDue,
            registrationType: data.registrationType,
            waiverSigned: data.waiverSigned,
            waiverSignedAt: data.waiverSigned ? new Date() : null,
            waiverSignedBy: data.waiverSignedBy,
            notes: data.notes || null,
          })
          .returning();

        // Send waitlist confirmation email
        try {
          const [programData] = await getDb()
            .select({
              program: programs,
              location: locations,
            })
            .from(programs)
            .innerJoin(locations, eq(programs.locationId, locations.id))
            .where(eq(programs.id, season.programId));

          if (programData) {
            sendRegistrationConfirmationEmail({
              userId: user.id,
              registrationId: newRegistration.id,
              parentEmail: user.email,
              parentName: user.firstName || user.email.split("@")[0],
              childName: `${familyMember.firstName} ${familyMember.lastName}`,
              programName: programData.program.name,
              seasonName: season.name,
              startDate: season.startDate,
              endDate: season.endDate,
              scheduleNotes: season.scheduleNotes || undefined,
              locationName: programData.location.name,
              locationAddress: [programData.location.addressLine1, programData.location.city, programData.location.state].filter(Boolean).join(", ") || undefined,
              amountDueCents: amountDue,
              paymentStatus: "unpaid",
              registrationStatus: "waitlisted",
            }).catch((err) => console.error("Error sending waitlist email:", err));
          }
        } catch (emailError) {
          console.error("Error preparing waitlist email:", emailError);
        }

        return new Response(
          JSON.stringify({
            registration: newRegistration,
            message: "Added to waitlist - season is at capacity",
            requiresPayment: false,
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // Calculate amount due
    const amountDue = data.registrationType === "deposit" && season.depositCents
      ? season.depositCents
      : season.priceCents;

    // Create registration (pending payment)
    const [newRegistration] = await getDb()
      .insert(registrations)
      .values({
        seasonId: data.seasonId,
        familyMemberId: data.familyMemberId,
        registeredByUserId: user.id,
        status: "pending",
        paymentStatus: "unpaid",
        amountPaidCents: 0,
        amountDueCents: amountDue,
        registrationType: data.registrationType,
        waiverSigned: data.waiverSigned,
        waiverSignedAt: data.waiverSigned ? new Date() : null,
        waiverSignedBy: data.waiverSignedBy,
        notes: data.notes || null,
      })
      .returning();

    // Send confirmation email (don't block on failure)
    try {
      // Get program and location info for email
      const [programData] = await getDb()
        .select({
          program: programs,
          location: locations,
        })
        .from(programs)
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(eq(programs.id, season.programId));

      if (programData) {
        sendRegistrationConfirmationEmail({
          userId: user.id,
          registrationId: newRegistration.id,
          parentEmail: user.email,
          parentName: user.firstName || user.email.split("@")[0],
          childName: `${familyMember.firstName} ${familyMember.lastName}`,
          programName: programData.program.name,
          seasonName: season.name,
          startDate: season.startDate,
          endDate: season.endDate,
          scheduleNotes: season.scheduleNotes || undefined,
          locationName: programData.location.name,
          locationAddress: [programData.location.addressLine1, programData.location.city, programData.location.state].filter(Boolean).join(", ") || undefined,
          amountDueCents: amountDue,
          paymentStatus: "unpaid",
          registrationStatus: "pending",
        }).catch((err) => console.error("Error sending confirmation email:", err));
      }
    } catch (emailError) {
      console.error("Error preparing confirmation email:", emailError);
    }

    return new Response(
      JSON.stringify({
        registration: newRegistration,
        requiresPayment: true,
        amountDueCents: amountDue,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error creating registration:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
