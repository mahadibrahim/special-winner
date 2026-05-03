import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, sports, locations, ageGroups } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { createRegistration, RegistrationError } from "@/lib/registrations/create-registration";
import { resolvePerson } from "@/lib/registrations/resolve-person";
import { getPostHogServer } from "@/lib/posthog-server";
import { recordConsent, recordDefaultMediaAuth } from "@/lib/consents/record";

const createRegistrationSchema = z
  .object({
    seasonId: z.string().uuid("Invalid season ID"),
    familyMemberId: z.string().uuid("Invalid family member ID").optional(),
    registerSelf: z.boolean().optional(),
    registrationType: z.enum(["full", "deposit"]),
    waiverSigned: z.boolean(),
    waiverSignedBy: z.string().min(1, "Waiver signature required"),
    notes: z.string().optional(),
    lookingForTeam: z.boolean().optional(),
    mediaAuthOptOuts: z
      .array(z.enum(["internal", "promotional", "public"]))
      .optional(),
  })
  .refine(
    (v) => Boolean(v.familyMemberId) !== Boolean(v.registerSelf),
    { message: "Provide exactly one of familyMemberId or registerSelf:true" },
  );

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
export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();
    const userAgent = request.headers.get("user-agent");
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

    let familyMember;
    if (data.registerSelf) {
      if (!user.birthDate) {
        return new Response(
          JSON.stringify({ error: "Profile birthDate required for self registration" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      familyMember = await resolvePerson(db, {
        kind: "self",
        user: {
          id: user.id,
          firstName: user.firstName ?? "",
          lastName: user.lastName ?? "",
          birthDate: user.birthDate,
        },
      });
    } else {
      const [fm] = await db
        .select()
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.id, data.familyMemberId!),
            eq(familyMembers.parentUserId, user.id),
          ),
        );
      if (!fm) {
        return new Response(JSON.stringify({ error: "Family member not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      familyMember = fm;
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
        lookingForTeam: data.registerSelf ? (data.lookingForTeam ?? false) : false,
      });

      if (result.kind !== "resumed" && data.waiverSigned) {
        const [orgRow] = await db
          .select({ organizationId: locations.organizationId })
          .from(seasons)
          .innerJoin(programs, eq(seasons.programId, programs.id))
          .innerJoin(locations, eq(programs.locationId, locations.id))
          .where(eq(seasons.id, data.seasonId));
        const organizationId = orgRow?.organizationId ?? null;
        const baseConsent = {
          db,
          familyMemberId: familyMember.id,
          registrationId: result.registration.id,
          organizationId,
          signedByUserId: user.id,
          signedByName: data.waiverSignedBy,
          ipAddress: clientAddress ?? null,
          userAgent: userAgent ?? null,
        };
        await recordConsent({ ...baseConsent, type: "liability" });
        await recordDefaultMediaAuth({
          ...baseConsent,
          optOutScopes: data.mediaAuthOptOuts ?? [],
        });
        if (data.registerSelf) {
          await recordConsent({ ...baseConsent, type: "age_confirmation" });
        }
      }

      const posthog = getPostHogServer();
      const phSessionId = request.headers.get("X-PostHog-Session-Id") || undefined;
      if (result.kind === "waitlisted") {
        posthog.capture({ distinctId: user.id, event: "registration_waitlisted", properties: { $session_id: phSessionId, season_id: data.seasonId, registration_type: data.registrationType } });
      } else if (result.kind !== "resumed") {
        posthog.capture({ distinctId: user.id, event: "registration_created", properties: { $session_id: phSessionId, season_id: data.seasonId, registration_type: data.registrationType, requires_payment: result.requiresPayment, amount_due_cents: result.amountDueCents } });
      }

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
