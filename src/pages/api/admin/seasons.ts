import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { seasons, programs, sports, locations, ageGroups, teams, venues, seasonInterest } from "@/lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  requireSameOrgProgram,
  requireSameOrgSeason,
  requireSameOrgVenue,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { bulkCreateTeams, cloneSeasonTeams } from "@/lib/seasons/scaffold";

/** Extract the PG error code from a Drizzle-wrapped or raw pg error. */
function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

class ScaffoldError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const scaffoldSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("empty") }),
  z.object({ type: z.literal("clone"), sourceSeasonId: z.string().uuid() }),
  z.object({ type: z.literal("bulk"), count: z.number().int().min(0).max(50) }),
]);

const seasonSchema = z.object({
  programId: z.string().uuid("Invalid program"),
  ageGroupId: z.string().uuid().optional().nullable(),
  venueId: z.string().uuid().optional().nullable(),
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  registrationOpens: z.string().optional().nullable(),
  registrationCloses: z.string().optional().nullable(),
  maxParticipants: z.number().int().positive().optional().nullable(),
  priceCents: z.number().int().min(0, "Price must be positive"),
  teamPriceCents: z.number().int().min(0).optional().nullable(),
  signupModes: z.array(z.enum(["individual", "team"])).min(1, "At least one signup mode is required").default(["individual"]),
  depositCents: z.number().int().min(0).optional().nullable(),
  allowDeposit: z.boolean().default(true),
  status: z.enum(["draft", "forming", "open", "closed", "active", "completed", "cancelled"]).default("draft"),
  scheduleNotes: z.string().optional().nullable(),
  scaffold: scaffoldSchema.optional(),
}).refine(
  (data) => !data.signupModes.includes("team") || (data.teamPriceCents != null && data.teamPriceCents > 0),
  { message: "Team price is required when team signup is enabled", path: ["teamPriceCents"] },
);

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  // Hide test/E2E fixtures by default (e.g. walk-up registration season picker).
  // Explicit admin views (`/admin/seasons` page itself) opt in via `include_test=1`.
  const includeTest = new URL(context.request.url).searchParams.get("include_test") === "1";

  try {
    const whereClauses = [eq(locations.organizationId, orgContext.organizationId)];
    if (!includeTest) {
      whereClauses.push(eq(seasons.isTest, false));
      whereClauses.push(eq(programs.isTest, false));
    }

    const allSeasons = await getDb()
      .select({
        id: seasons.id,
        name: seasons.name,
        slug: seasons.slug,
        startDate: seasons.startDate,
        endDate: seasons.endDate,
        registrationOpens: seasons.registrationOpens,
        registrationCloses: seasons.registrationCloses,
        maxParticipants: seasons.maxParticipants,
        priceCents: seasons.priceCents,
        teamPriceCents: seasons.teamPriceCents,
        signupModes: seasons.signupModes,
        depositCents: seasons.depositCents,
        allowDeposit: seasons.allowDeposit,
        status: seasons.status,
        scheduleNotes: seasons.scheduleNotes,
        createdAt: seasons.createdAt,
        program: {
          id: programs.id,
          name: programs.name,
          slug: programs.slug,
        },
        sport: {
          id: sports.id,
          name: sports.name,
          icon: sports.icon,
          color: sports.color,
        },
        location: {
          id: locations.id,
          name: locations.name,
        },
        ageGroup: {
          id: ageGroups.id,
          name: ageGroups.name,
          minAge: ageGroups.minAge,
          maxAge: ageGroups.maxAge,
        },
      })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
      .where(and(...whereClauses))
      .orderBy(asc(seasons.startDate));

    // Per-season interest counts (forming demand signal). One grouped query.
    const interestRows = await getDb()
      .select({
        seasonId: seasonInterest.seasonId,
        count: sql<number>`count(*)::int`,
      })
      .from(seasonInterest)
      .where(eq(seasonInterest.organizationId, orgContext.organizationId))
      .groupBy(seasonInterest.seasonId);
    const interestMap = new Map(interestRows.map((r) => [r.seasonId, r.count]));

    const seasonsWithInterest = allSeasons.map((s) => ({
      ...s,
      interestCount: interestMap.get(s.id) ?? 0,
    }));

    return new Response(JSON.stringify({ seasons: seasonsWithInterest }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching seasons:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch seasons" }), { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = seasonSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const data = result.data;

    // Verify program belongs to caller's org
    const programCheck = await requireSameOrgProgram(orgContext.organizationId, data.programId);
    if (!programCheck.ok) return ownershipDeniedResponse();

    // Verify venue (if any) belongs to caller's org
    if (data.venueId) {
      const venueCheck = await requireSameOrgVenue(orgContext.organizationId, data.venueId);
      if (!venueCheck.ok) return ownershipDeniedResponse();
    }

    // Need program details for team name prefix
    const [program] = await getDb()
      .select({ id: programs.id, name: programs.name, locationId: programs.locationId })
      .from(programs)
      .where(eq(programs.id, data.programId))
      .limit(1);

    if (!program) {
      return new Response(JSON.stringify({ error: "Program not found" }), { status: 400 });
    }

    let ageGroupName: string | null = null;
    if (data.ageGroupId) {
      const [ag] = await getDb()
        .select({ name: ageGroups.name })
        .from(ageGroups)
        .where(
          and(
            eq(ageGroups.id, data.ageGroupId),
            eq(ageGroups.organizationId, orgContext.organizationId),
          ),
        )
        .limit(1);
      if (!ag) return ownershipDeniedResponse();
      ageGroupName = ag.name;
    }

    const result2 = await getDb().transaction(async (tx) => {
      const [newSeason] = await tx
        .insert(seasons)
        .values({
          programId: data.programId,
          ageGroupId: data.ageGroupId || null,
          venueId: data.venueId || null,
          name: data.name,
          slug: data.slug,
          startDate: data.startDate,
          endDate: data.endDate,
          registrationOpens: data.registrationOpens ? new Date(data.registrationOpens) : null,
          registrationCloses: data.registrationCloses ? new Date(data.registrationCloses) : null,
          maxParticipants: data.maxParticipants || null,
          priceCents: data.priceCents,
          teamPriceCents: data.teamPriceCents ?? null,
          signupModes: data.signupModes,
          // Keep legacy pricing_mode synced with signupModes for any caller
          // still reading it; remove once all callsites use signupModes.
          pricingMode:
            data.signupModes.includes("team") && !data.signupModes.includes("individual")
              ? "per_team"
              : "per_individual",
          depositCents: data.depositCents || null,
          allowDeposit: data.allowDeposit,
          status: data.status,
          scheduleNotes: data.scheduleNotes || null,
        })
        .returning();

      if (data.venueId) {
        const [venue] = await tx
          .select({ locationId: venues.locationId })
          .from(venues)
          .where(eq(venues.id, data.venueId))
          .limit(1);

        if (!venue) {
          throw new ScaffoldError(400, "Venue not found");
        }
        if (venue.locationId !== program.locationId) {
          throw new ScaffoldError(400, "Venue does not belong to the program's location");
        }
      }

      const scaffold = data.scaffold ?? { type: "empty" as const };
      let createdTeams: typeof teams.$inferSelect[] = [];

      if (scaffold.type === "bulk") {
        createdTeams = await bulkCreateTeams(tx, {
          targetSeasonId: newSeason.id,
          count: scaffold.count,
          programName: program.name,
          ageGroupName,
        });
      }
      if (scaffold.type === "clone") {
        // Validate source belongs to the same program AND caller's org
        const [source] = await tx
          .select({
            id: seasons.id,
            programId: seasons.programId,
            organizationId: locations.organizationId,
          })
          .from(seasons)
          .innerJoin(programs, eq(seasons.programId, programs.id))
          .innerJoin(locations, eq(programs.locationId, locations.id))
          .where(eq(seasons.id, scaffold.sourceSeasonId))
          .limit(1);

        if (!source || source.organizationId !== orgContext.organizationId) {
          throw new ScaffoldError(400, "Source season not found");
        }
        if (source.programId !== data.programId) {
          throw new ScaffoldError(400, "Source season belongs to a different program");
        }

        createdTeams = await cloneSeasonTeams(tx, {
          sourceSeasonId: scaffold.sourceSeasonId,
          targetSeasonId: newSeason.id,
        });
      }

      return { season: newSeason, teams: createdTeams };
    });

    return new Response(JSON.stringify(result2), { status: 201 });
  } catch (error: any) {
    console.error("Error creating season:", error);
    if (error instanceof ScaffoldError) {
      return new Response(JSON.stringify({ error: error.message }), { status: error.status });
    }
    if (getDbErrorCode(error) === "23505") {
      return new Response(JSON.stringify({ error: "A season with this slug already exists for this program" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to create season" }), { status: 500 });
  }
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Season ID is required" }), { status: 400 });
    }

    // Verify the existing season belongs to caller's org
    const existing = await requireSameOrgSeason(orgContext.organizationId, id);
    if (!existing.ok) return ownershipDeniedResponse();

    const result = seasonSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const validData = result.data;

    // Verify the (possibly different) target program & venue still belong to caller's org
    const programCheck = await requireSameOrgProgram(orgContext.organizationId, validData.programId);
    if (!programCheck.ok) return ownershipDeniedResponse();
    if (validData.venueId) {
      const venueCheck = await requireSameOrgVenue(orgContext.organizationId, validData.venueId);
      if (!venueCheck.ok) return ownershipDeniedResponse();
    }

    const [updatedSeason] = await getDb()
      .update(seasons)
      .set({
        programId: validData.programId,
        ageGroupId: validData.ageGroupId || null,
        venueId: validData.venueId || null,
        name: validData.name,
        slug: validData.slug,
        startDate: validData.startDate,
        endDate: validData.endDate,
        registrationOpens: validData.registrationOpens ? new Date(validData.registrationOpens) : null,
        registrationCloses: validData.registrationCloses ? new Date(validData.registrationCloses) : null,
        maxParticipants: validData.maxParticipants || null,
        priceCents: validData.priceCents,
        teamPriceCents: validData.teamPriceCents ?? null,
        signupModes: validData.signupModes,
        // Keep legacy pricing_mode synced with signupModes
        pricingMode:
          validData.signupModes.includes("team") && !validData.signupModes.includes("individual")
            ? "per_team"
            : "per_individual",
        depositCents: validData.depositCents || null,
        allowDeposit: validData.allowDeposit,
        status: validData.status,
        scheduleNotes: validData.scheduleNotes || null,
        updatedAt: new Date(),
      })
      .where(eq(seasons.id, id))
      .returning();

    if (!updatedSeason) {
      return new Response(JSON.stringify({ error: "Season not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ season: updatedSeason }), { status: 200 });
  } catch (error: any) {
    console.error("Error updating season:", error);
    return new Response(JSON.stringify({ error: "Failed to update season" }), { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Season ID is required" }), { status: 400 });
    }

    const existing = await requireSameOrgSeason(orgContext.organizationId, id);
    if (!existing.ok) return ownershipDeniedResponse();

    await getDb().delete(seasons).where(eq(seasons.id, id));
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("Error deleting season:", error);
    if (getDbErrorCode(error) === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete season that has registrations" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete season" }), { status: 500 });
  }
};
