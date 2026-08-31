import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, sports, locations, ageGroups } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { createRegistration, RegistrationError } from "@/lib/registrations/create-registration";
import { resolvePerson } from "@/lib/registrations/resolve-person";
import { getPostHogServer } from "@/lib/posthog-server";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { fireRegistrationCreatedConversion } from "@/lib/analytics/server-conversions";
import { recordConsent, recordDefaultMediaAuth } from "@/lib/consents/record";
import { recordLiabilityWaiver } from "@/lib/consents/liability";
import { wizardWaiverAssentText } from "@/lib/registrations/waiver-text";

// waiverSignedBy is only required when the client actually claims the
// waiver was signed at checkout time (v2 solo checkout defers waiver
// signing to a post-payment completion step — mirrors guest-checkout.ts).
const createRegistrationSchema = z
  .object({
    seasonId: z.string().uuid("Invalid season ID"),
    familyMemberId: z.string().uuid("Invalid family member ID").optional(),
    registerSelf: z.boolean().optional(),
    registrationType: z.enum(["full", "deposit"]),
    waiverSigned: z.boolean(),
    waiverSignedBy: z.string().min(1, "Waiver signature required").optional(),
    notes: z.string().optional(),
    lookingForTeam: z.boolean().optional(),
    teamToken: z.string().max(64).optional(),
    mediaAuthOptOuts: z
      .array(z.enum(["internal", "promotional", "public"]))
      .optional(),
  })
  .refine(
    (v) => Boolean(v.familyMemberId) !== Boolean(v.registerSelf),
    { message: "Provide exactly one of familyMemberId or registerSelf:true" },
  )
  .superRefine((d, ctx) => {
    if (d.waiverSigned && !d.waiverSignedBy?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["waiverSignedBy"],
        message: "Signature required when signing the waiver",
      });
    }
  });

// GET - List registrations for current user
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const selfOnly = url.searchParams.get("self") === "true";

    const db = getDb();

    const whereClause = selfOnly
      ? and(
          eq(registrations.registeredByUserId, user.id),
          eq(familyMembers.selfUserId, user.id),
        )
      : eq(registrations.registeredByUserId, user.id);

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
      .where(whereClause)
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
      // birthDate may be null for adult self-registration: the v2 (adult-locked)
      // flow defers DOB (and the waiver) to the post-payment completion step,
      // exactly like the guest path. Requiring it here forced returning users
      // through a "Complete your profile" wall before payment — a bounce driver
      // for the very audience ads re-engage. resolvePerson accepts null, and
      // POST /api/registrations/[id]/complete backfills users.birthDate + the
      // self family_member once the waiver is signed.
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
      const brand = brandFromHost(request.headers.get("host") ?? "");
      const result = await createRegistration({
        db,
        user: { id: user.id, email: user.email, firstName: user.firstName },
        familyMember,
        seasonId: data.seasonId,
        registrationType: data.registrationType,
        waiverSigned: data.waiverSigned,
        waiverSignedBy: data.waiverSignedBy ?? "",
        notes: data.notes,
        lookingForTeam: data.registerSelf ? (data.lookingForTeam ?? false) : false,
        teamToken: data.teamToken ?? null,
        brand,
      });

      if (result.kind !== "resumed" && data.waiverSigned) {
        // organizationId was already resolved inside createRegistration —
        // thread it through instead of re-querying the same season→org join.
        const baseConsent = {
          db,
          familyMemberId: familyMember.id,
          registrationId: result.registration.id,
          organizationId: result.organizationId,
          signedByUserId: user.id,
          signedByName: data.waiverSignedBy ?? "",
          ipAddress: clientAddress ?? null,
          userAgent: userAgent ?? null,
        };
        // ANNUAL WAIVER, write side. `waiverOnFile` means the row was stamped
        // from an existing signature, so per createRegistration's caller
        // contract nothing is appended to the liability log here — that branch
        // is a READ. Only a genuinely fresh signature writes.
        //
        // The org-less case (a season whose location carries no organization)
        // can't go through the org-scoped helper at all; it keeps the legacy
        // `recordConsent` write so the audit row still exists.
        const liabilityWrite = result.waiverOnFile
          ? Promise.resolve()
          : result.organizationId
            ? recordLiabilityWaiver(
                {
                  familyMemberId: familyMember.id,
                  organizationId: result.organizationId,
                  registrationId: result.registration.id,
                  signedByUserId: user.id,
                  signedByName: data.waiverSignedBy ?? "",
                  consentVariant: data.registerSelf ? "adult" : "guardian",
                  // The exact words waiver-step.tsx put on screen for THIS
                  // variant — body sentence + checkbox label — not the generic
                  // adult label. This endpoint is the authed path, which never
                  // renders the guest+child checkbox variant.
                  consentText: wizardWaiverAssentText({
                    variant: data.registerSelf ? "adult" : "guardian",
                    participantName:
                      `${familyMember.firstName} ${familyMember.lastName}`.trim(),
                  }),
                  ipAddress: clientAddress ?? null,
                  userAgent: userAgent ?? null,
                },
                db,
              )
            : recordConsent({ ...baseConsent, type: "liability" });

        // These are independent inserts (different consent rows, no shared
        // uniqueness constraint) — run them concurrently.
        await Promise.all([
          liabilityWrite,
          recordDefaultMediaAuth({
            ...baseConsent,
            optOutScopes: data.mediaAuthOptOuts ?? [],
          }),
          ...(data.registerSelf
            ? [recordConsent({ ...baseConsent, type: "age_confirmation" })]
            : []),
        ]);
      }

      const posthog = getPostHogServer();
      const phSessionId = request.headers.get("X-PostHog-Session-Id") || undefined;
      if (result.kind === "waitlisted") {
        posthog.capture({ distinctId: user.id, event: "registration_waitlisted", properties: { $session_id: phSessionId, season_id: data.seasonId, registration_type: data.registrationType } });
      } else if (result.kind !== "resumed") {
        posthog.capture({ distinctId: user.id, event: "registration_created", properties: { $session_id: phSessionId, season_id: data.seasonId, registration_type: data.registrationType, requires_payment: result.requiresPayment, amount_due_cents: result.amountDueCents } });
      }

      // Meta CompleteRegistration — once per new registration row (resumed
      // drafts excluded), event_id = registration id.
      if (result.kind !== "resumed") {
        fireRegistrationCreatedConversion({
          request,
          registrationId: result.registration.id,
          brand,
          email: user.email,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          userId: user.id,
          seasonId: data.seasonId,
        });
      }

      const status = result.kind === "resumed" ? 200 : 201;
      return new Response(
        JSON.stringify({
          registration: result.registration,
          requiresPayment: result.requiresPayment,
          amountDueCents: result.amountDueCents,
          // Whether the participant's ANNUAL waiver already covers this row
          // (the confirm screen's completion form drops the release when it
          // does), and when it runs out. `waiverValidUntil` is null whenever
          // there is no consents row to read an expiry from — never a signal
          // that the participant is uncovered.
          waiverOnFile: result.waiverOnFile,
          waiverValidUntil: result.waiverValidUntil?.toISOString() ?? null,
          ...(result.kind === "resumed" ? { resumed: true } : {}),
          ...(result.kind === "waitlisted"
            ? { message: "Added to waitlist - season is at capacity" }
            : {}),
        }),
        { status, headers: { "Content-Type": "application/json" } },
      );
    } catch (err) {
      if (err instanceof RegistrationError) {
        return new Response(
          JSON.stringify(
            err.code
              ? { error: err.message, code: err.code }
              : { error: err.message },
          ),
          {
            status: err.status,
            headers: { "Content-Type": "application/json" },
          },
        );
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
