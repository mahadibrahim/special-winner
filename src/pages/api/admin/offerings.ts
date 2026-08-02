import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { programs, seasons } from "@/lib/db/schema";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import { requireAdminScopedAccess } from "@/lib/auth/admin-api-token";
import {
  requireSameOrgLocation,
  requireSameOrgSport,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { seasonSchema } from "@/pages/api/admin/seasons";

// offeringSchema validates the top-level shape. The season half is kept as
// z.record(z.string(), z.any()) because seasonSchema is a ZodEffects object
// (it has .refine() calls) and cannot be decomposed via .shape or .innerType.
// We call seasonSchema.safeParse() with a placeholder programId before the
// transaction (to catch bad-season requests early) and again inside it with
// the real programId (authoritative).
const offeringSchema = z.object({
  programType: z.enum(["camp", "tournament", "league"]),
  locationId: z.string().uuid(),
  sportId: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  audienceType: z.string().max(20).optional(),
  season: z.record(z.string(), z.any()),
});

class OfferingError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminScopedAccess(context, "catalog:write");
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const parsed = offeringSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }
    const data = parsed.data;

    // Verify location and sport belong to the caller's org.
    const locationCheck = await requireSameOrgLocation(
      auth.organizationId,
      data.locationId,
    );
    if (!locationCheck.ok) return ownershipDeniedResponse();

    const sportCheck = await requireSameOrgSport(
      auth.organizationId,
      data.sportId,
    );
    if (!sportCheck.ok) return ownershipDeniedResponse();

    // Pre-validate the season payload before opening a transaction, so a
    // bad-season request doesn't insert-then-rollback a program row.
    const preSeasonCheck = seasonSchema.safeParse({
      ...data.season,
      programId: "00000000-0000-0000-0000-000000000000", // placeholder to satisfy required field
    });
    if (!preSeasonCheck.success) {
      return new Response(
        JSON.stringify({
          error: "Season validation failed",
          details: preSeasonCheck.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const result = await getDb().transaction(async (tx) => {
      // 1. Create the program.
      const [program] = await tx
        .insert(programs)
        .values({
          locationId: data.locationId,
          sportId: data.sportId,
          name: data.name,
          slug: data.slug,
          programType: data.programType,
          // Fallback default: leagues default to "adults", everything else to "parents".
          // The authoritative youth/adult signal on the catalog is the season's own
          // minAge/maxAge (emitted by the public seasons API); this is a program-level
          // fallback for when age bounds are unset.
          audienceType:
            data.audienceType ??
            (data.programType === "league" ? "adults" : "parents"),
          active: true,
        })
        .returning();

      // 2. Re-validate the season with the real programId (authoritative).
      //    seasonSchema is a ZodEffects (has .refine()); must use safeParse.
      const seasonParsed = seasonSchema.safeParse({
        ...data.season,
        programId: program.id,
      });
      if (!seasonParsed.success) {
        throw new OfferingError(
          400,
          "Season validation failed",
          seasonParsed.error.flatten().fieldErrors,
        );
      }
      const s = seasonParsed.data;

      // 3. Insert the first season.
      const [season] = await tx
        .insert(seasons)
        .values({
          programId: program.id,
          name: s.name,
          slug: s.slug,
          startDate: s.startDate,
          endDate: s.endDate,
          registrationOpens: s.registrationOpens
            ? new Date(s.registrationOpens)
            : null,
          registrationCloses: s.registrationCloses
            ? new Date(s.registrationCloses)
            : null,
          maxParticipants: s.maxParticipants ?? null,
          priceCents: s.priceCents,
          teamPriceCents: s.teamPriceCents ?? null,
          halfDayPriceCents: s.halfDayPriceCents ?? null,
          minAge: s.minAge ?? null,
          maxAge: s.maxAge ?? null,
          signupModes: s.signupModes,
          // Keep legacy pricingMode in sync with signupModes.
          pricingMode:
            s.signupModes.includes("team") &&
            !s.signupModes.includes("individual")
              ? "per_team"
              : "per_individual",
          depositCents: s.depositCents ?? null,
          allowDeposit: s.allowDeposit,
          status: s.status,
          scheduleNotes: s.scheduleNotes ?? null,
          termSlug: s.termSlug ?? null,
          termLabel: s.termLabel ?? null,
          divisionGender: s.divisionGender ?? null,
          skillLevel: s.skillLevel ?? null,
          dayOfWeek: s.dayOfWeek ?? null,
          startTime: s.startTime ?? null,
          endTime: s.endTime ?? null,
        })
        .returning();

      return { program, season };
    });

    return new Response(
      JSON.stringify({
        program: { id: result.program.id },
        season: { id: result.season.id, status: result.season.status },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    if (error instanceof OfferingError) {
      return new Response(
        JSON.stringify({ error: error.message, details: error.details }),
        { status: error.status },
      );
    }
    console.error("Error creating offering:", error);
    const pgCode = error?.code ?? error?.cause?.code;
    if (pgCode === "23505") {
      return new Response(
        JSON.stringify({
          error:
            "A program or season with this slug already exists at this location",
        }),
        { status: 409 },
      );
    }
    return new Response(
      JSON.stringify({ error: "Failed to create offering" }),
      { status: 500 },
    );
  }
};
