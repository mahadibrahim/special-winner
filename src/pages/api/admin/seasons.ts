import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { seasons, programs, sports, locations, ageGroups, teams, venues, seasonInterest, curriculumSequenceEntries, practiceTemplates } from "@/lib/db/schema";
import { sequenceAttachments } from "@/lib/db/schema/blueprint";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgProgram,
  requireSameOrgSeason,
  requireSameOrgVenue,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { bulkCreateTeams, cloneSeasonTeams } from "@/lib/seasons/scaffold";
import { TIME_OF_DAY_PATTERN } from "@/lib/time/time-of-day";
import { evaluateAttachSafetyForBand } from "@/lib/curriculum/distribution-safety";
import type { TemplateForBuild } from "@/lib/curriculum/sequence-instantiation";

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

export const seasonSchema = z.object({
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
  halfDayPriceCents: z.number().int().min(0).optional().nullable(),
  minAge: z.number().int().min(0).optional().nullable(),
  maxAge: z.number().int().min(0).optional().nullable(),
  signupModes: z.array(z.enum(["individual", "team"])).min(1, "At least one signup mode is required").default(["individual"]),
  // Early-bird. Both prices share earlyBirdDeadline; each replaces its own list
  // price while the window is open. Aspire's leagues run a TEAM-only early-bird
  // (solo pays flat list price by policy), but the per-player field is supported
  // for camps/classes.
  earlyBirdDeadline: z.string().optional().nullable(),
  earlyBirdPriceCents: z.number().int().min(0).optional().nullable(),
  earlyBirdTeamPriceCents: z.number().int().min(0).optional().nullable(),
  depositCents: z.number().int().min(0).optional().nullable(),
  allowDeposit: z.boolean().default(true),
  status: z.enum(["draft", "forming", "open", "closed", "active", "completed", "cancelled"]).default("draft"),
  scheduleNotes: z.string().optional().nullable(),
  termSlug: z.string().max(64).optional().nullable(),
  termLabel: z.string().max(64).optional().nullable(),
  divisionGender: z.enum(["coed", "mens", "womens"]).optional().nullable(),
  skillLevel: z.enum(["a", "b", "c", "d", "open"]).optional().nullable(),
  dayOfWeek: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]).optional().nullable(),
  startTime: z.string().regex(TIME_OF_DAY_PATTERN, "Use HH:MM").optional().nullable(),
  endTime: z.string().regex(TIME_OF_DAY_PATTERN, "Use HH:MM").optional().nullable(),
  scaffold: scaffoldSchema.optional(),
}).refine(
  // Team seasons must carry a team price, but $0 is valid (free tournaments /
  // founder events). Requiring > 0 made any existing free team season
  // un-editable — the whole object re-validates on save, so even a
  // status-only change (e.g. cancelling) was rejected with "Validation failed".
  (data) => !data.signupModes.includes("team") || data.teamPriceCents != null,
  { message: "Team price is required when team signup is enabled (enter 0 for a free season)", path: ["teamPriceCents"] },
).refine(
  (data) => data.minAge == null || data.maxAge == null || data.maxAge >= data.minAge,
  { message: "Oldest age must be greater than or equal to youngest age", path: ["maxAge"] },
).refine(
  // An early-bird price must be a real discount. Reject at the write boundary:
  // a team price typo'd into the per-player field is exactly what billed solo
  // registrants $1,000 against a $120 list price (fixed in #392). The charge
  // path also ignores non-discounts defensively, but nothing should be able to
  // save one in the first place.
  (data) =>
    data.earlyBirdPriceCents == null ||
    data.earlyBirdPriceCents < data.priceCents,
  {
    message:
      "Early-bird player price must be LESS than the regular player price. To set an early-bird price for teams, use the team early-bird field.",
    path: ["earlyBirdPriceCents"],
  },
).refine(
  (data) =>
    data.earlyBirdTeamPriceCents == null ||
    data.teamPriceCents == null ||
    data.earlyBirdTeamPriceCents < data.teamPriceCents,
  {
    message: "Early-bird team price must be LESS than the regular team price",
    path: ["earlyBirdTeamPriceCents"],
  },
).refine(
  // A price without a deadline never activates; a deadline alone is harmless
  // but usually means the admin forgot the price.
  (data) =>
    (data.earlyBirdPriceCents == null && data.earlyBirdTeamPriceCents == null) ||
    data.earlyBirdDeadline != null,
  {
    message: "Set an early-bird deadline, or the early-bird price never applies",
    path: ["earlyBirdDeadline"],
  },
);

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  // Hide test/E2E fixtures by default (e.g. walk-up registration season picker).
  // Explicit admin views (`/admin/seasons` page itself) opt in via `include_test=1`.
  const includeTest = new URL(context.request.url).searchParams.get("include_test") === "1";

  try {
    const whereClauses = [eq(locations.organizationId, auth.organizationId)];
    if (!includeTest) {
      whereClauses.push(eq(seasons.isTest, false));
      whereClauses.push(eq(programs.isTest, false));
    }

    // The season listing and per-season interest counts are independent of
    // each other — run in parallel.
    const [allSeasons, interestRows] = await Promise.all([
      getDb()
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
          earlyBirdDeadline: seasons.earlyBirdDeadline,
          earlyBirdPriceCents: seasons.earlyBirdPriceCents,
          earlyBirdTeamPriceCents: seasons.earlyBirdTeamPriceCents,
          signupModes: seasons.signupModes,
          depositCents: seasons.depositCents,
          allowDeposit: seasons.allowDeposit,
          status: seasons.status,
          scheduleNotes: seasons.scheduleNotes,
          termSlug: seasons.termSlug,
          termLabel: seasons.termLabel,
          divisionGender: seasons.divisionGender,
          skillLevel: seasons.skillLevel,
          dayOfWeek: seasons.dayOfWeek,
          startTime: seasons.startTime,
          endTime: seasons.endTime,
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
        .orderBy(asc(seasons.startDate)),

      // Per-season interest counts (forming demand signal). One grouped query.
      getDb()
        .select({
          seasonId: seasonInterest.seasonId,
          count: sql<number>`count(*)::int`,
        })
        .from(seasonInterest)
        .where(eq(seasonInterest.organizationId, auth.organizationId))
        .groupBy(seasonInterest.seasonId),
    ]);
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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

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
    const programCheck = await requireSameOrgProgram(auth.organizationId, data.programId);
    if (!programCheck.ok) return ownershipDeniedResponse();

    // Verify venue (if any) belongs to caller's org
    if (data.venueId) {
      const venueCheck = await requireSameOrgVenue(auth.organizationId, data.venueId);
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
            eq(ageGroups.organizationId, auth.organizationId),
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
          earlyBirdDeadline: data.earlyBirdDeadline ? new Date(data.earlyBirdDeadline) : null,
          earlyBirdPriceCents: data.earlyBirdPriceCents ?? null,
          earlyBirdTeamPriceCents: data.earlyBirdTeamPriceCents ?? null,
          halfDayPriceCents: data.halfDayPriceCents ?? null,
          minAge: data.minAge ?? null,
          maxAge: data.maxAge ?? null,
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
          termSlug: data.termSlug || null,
          termLabel: data.termLabel || null,
          divisionGender: data.divisionGender || null,
          skillLevel: data.skillLevel || null,
          dayOfWeek: data.dayOfWeek || null,
          startTime: data.startTime || null,
          endTime: data.endTime || null,
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

        if (!source || source.organizationId !== auth.organizationId) {
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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Season ID is required" }), { status: 400 });
    }

    // Verify the existing season belongs to caller's org
    const existing = await requireSameOrgSeason(auth.organizationId, id);
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
    const programCheck = await requireSameOrgProgram(auth.organizationId, validData.programId);
    if (!programCheck.ok) return ownershipDeniedResponse();
    if (validData.venueId) {
      const venueCheck = await requireSameOrgVenue(auth.organizationId, validData.venueId);
      if (!venueCheck.ok) return ownershipDeniedResponse();
    }

    // Season band edits must not bypass the distribution safety lattice
    // (Program Blueprint review I1). A season's minAge/maxAge/ageGroupId
    // feed straight into resolveEffectiveSeasonBand — the same band the
    // attach POST re-checks at distribution time. Narrowing that band on a
    // season that ALREADY has a linked/distributed sequence can silently
    // make previously-safe content unsafe (e.g. a heading-content template
    // distributed to a 12-14 season, then the season is edited down to
    // U8) without ever going back through attach.ts's gate. Only runs the
    // re-check when a band-relevant field actually changed AND the season
    // has real linked content (seasons.curriculumSequenceId, or any
    // sequence_attachments row ever distributed to it) — band-widening and
    // unrelated edits (name, dates, price, etc.) skip this entirely and the
    // evaluation naturally passes anyway once it does run.
    const [currentSeasonBandRow] = await getDb()
      .select({
        minAge: seasons.minAge,
        maxAge: seasons.maxAge,
        ageGroupId: seasons.ageGroupId,
        curriculumSequenceId: seasons.curriculumSequenceId,
      })
      .from(seasons)
      .where(eq(seasons.id, id))
      .limit(1);

    const nextMinAge = validData.minAge ?? null;
    const nextMaxAge = validData.maxAge ?? null;
    const nextAgeGroupId = validData.ageGroupId ?? null;
    const bandFieldsChanged =
      !!currentSeasonBandRow &&
      (currentSeasonBandRow.minAge !== nextMinAge ||
        currentSeasonBandRow.maxAge !== nextMaxAge ||
        currentSeasonBandRow.ageGroupId !== nextAgeGroupId);

    if (currentSeasonBandRow && bandFieldsChanged) {
      let sequenceIdToCheck = currentSeasonBandRow.curriculumSequenceId;
      if (!sequenceIdToCheck) {
        // No live "composing" pointer, but a season can still carry
        // historical prescribed sessions from a sequence that was later
        // detached — those sessions are real and already generated, so a
        // band narrowing must be checked against whatever sequence
        // actually produced them too.
        const [attachmentRow] = await getDb()
          .select({ sequenceId: sequenceAttachments.sequenceId })
          .from(sequenceAttachments)
          .where(eq(sequenceAttachments.seasonId, id))
          .orderBy(asc(sequenceAttachments.distributedAt))
          .limit(1);
        sequenceIdToCheck = attachmentRow?.sequenceId ?? null;
      }

      if (sequenceIdToCheck) {
        let newAgeGroupMinAge: number | null = null;
        let newAgeGroupMaxAge: number | null = null;
        if (nextAgeGroupId) {
          const [ag] = await getDb()
            .select({ minAge: ageGroups.minAge, maxAge: ageGroups.maxAge })
            .from(ageGroups)
            .where(
              and(
                eq(ageGroups.id, nextAgeGroupId),
                eq(ageGroups.organizationId, auth.organizationId),
              ),
            )
            .limit(1);
          if (!ag) return ownershipDeniedResponse();
          newAgeGroupMinAge = ag.minAge;
          newAgeGroupMaxAge = ag.maxAge;
        }
        // Same fallback rule as resolveEffectiveSeasonBand: the season's own
        // field wins, falling back to the (new) age group's when null.
        const newBand = {
          minAge: nextMinAge ?? newAgeGroupMinAge,
          maxAge: nextMaxAge ?? newAgeGroupMaxAge,
        };

        const entryRows = await getDb()
          .select({ templateId: curriculumSequenceEntries.templateId })
          .from(curriculumSequenceEntries)
          .where(eq(curriculumSequenceEntries.sequenceId, sequenceIdToCheck));

        if (entryRows.length > 0) {
          const templateRows = await getDb()
            .select({
              id: practiceTemplates.id,
              name: practiceTemplates.name,
              totalDurationMinutes: practiceTemplates.totalDurationMinutes,
              structure: practiceTemplates.structure,
              equipmentNeeded: practiceTemplates.equipmentNeeded,
              focusSkillIds: practiceTemplates.focusSkillIds,
            })
            .from(practiceTemplates)
            .where(inArray(practiceTemplates.id, entryRows.map((e) => e.templateId)));
          const templatesById = new Map<string, TemplateForBuild>(
            templateRows.map((t) => [t.id, t]),
          );

          const safety = await evaluateAttachSafetyForBand(newBand, entryRows, templatesById);
          if (safety.blocks.length > 0) {
            return new Response(
              JSON.stringify({
                error:
                  "This age range change would violate a safety rule for content already planned or distributed to this season",
                blocks: safety.blocks,
              }),
              { status: 422, headers: { "Content-Type": "application/json" } },
            );
          }
        }
      }
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
        earlyBirdDeadline: validData.earlyBirdDeadline ? new Date(validData.earlyBirdDeadline) : null,
        earlyBirdPriceCents: validData.earlyBirdPriceCents ?? null,
        earlyBirdTeamPriceCents: validData.earlyBirdTeamPriceCents ?? null,
        halfDayPriceCents: validData.halfDayPriceCents ?? null,
        minAge: validData.minAge ?? null,
        maxAge: validData.maxAge ?? null,
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
        termSlug: validData.termSlug || null,
        termLabel: validData.termLabel || null,
        divisionGender: validData.divisionGender || null,
        skillLevel: validData.skillLevel || null,
        dayOfWeek: validData.dayOfWeek || null,
        startTime: validData.startTime || null,
        endTime: validData.endTime || null,
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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Season ID is required" }), { status: 400 });
    }

    const existing = await requireSameOrgSeason(auth.organizationId, id);
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
