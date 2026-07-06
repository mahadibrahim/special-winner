import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  curriculumSequenceEntries,
  practiceTemplates,
  seasons,
  sessionPlans,
  teams,
} from "@/lib/db/schema";
import { organizations } from "@/lib/db/schema/organizations";
import { eq, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgSeason,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { loadSequenceForOrg } from "@/lib/curriculum/sequence-ownership";
import {
  generatePracticeDates,
  buildDraftSessionPlans,
  type TemplateForBuild,
} from "@/lib/curriculum/sequence-instantiation";

const attachSchema = z.object({
  seasonId: z.string().uuid(),
  weekday: z.number().int().min(0).max(6), // 0=Sunday … 6=Saturday
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)"),
  count: z.number().int().min(1).max(52),
});

/**
 * POST - attach the sequence to a season and generate draft session_plans
 * for every coached team in it: entry N → Nth practice date.
 *
 * Idempotent by design: existing (team, template, scheduledDate) triples are
 * skipped, so re-running after adding a team generates only that team's
 * drafts. Attaching does not mutate the sequence itself, so global
 * (org-null) sequences are attachable by any org admin — mirrors how global
 * templates are usable by everyone.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Sequence ID required" }), {
        status: 400,
      });
    }

    const sequence = await loadSequenceForOrg(auth.organizationId, id);
    if (!sequence) return ownershipDeniedResponse();

    const body = await context.request.json();
    const result = attachSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }
    const data = result.data;

    const seasonCheck = await requireSameOrgSeason(
      auth.organizationId,
      data.seasonId,
    );
    if (!seasonCheck.ok) return ownershipDeniedResponse();

    const db = getDb();

    // PK lookup — no orderBy needed on limit(1).
    const [season] = await db
      .select({ id: seasons.id, endDate: seasons.endDate })
      .from(seasons)
      .where(eq(seasons.id, data.seasonId))
      .limit(1);

    const entryRows = await db
      .select()
      .from(curriculumSequenceEntries)
      .where(eq(curriculumSequenceEntries.sequenceId, sequence.id))
      .orderBy(asc(curriculumSequenceEntries.position));
    if (entryRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Sequence has no entries — add entries before attaching" }),
        { status: 400 },
      );
    }

    const templateRows = await db
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

    // Practice times are org-local wall times; resolve via the org's zone.
    const [org] = await db
      .select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, auth.organizationId))
      .limit(1);
    const timezone = org?.timezone ?? "America/New_York";

    const { dates, truncatedBySeasonEnd } = generatePracticeDates(
      {
        startDate: data.startDate,
        weekday: data.weekday,
        timeOfDay: data.timeOfDay,
        count: Math.min(data.count, entryRows.length),
        timezone,
      },
      season.endDate, // date column → "YYYY-MM-DD" string
    );

    const seasonTeams = await db
      .select({ id: teams.id, coachUserId: teams.coachUserId })
      .from(teams)
      .where(eq(teams.seasonId, data.seasonId));
    const teamsWithCoach = seasonTeams.filter((t) => t.coachUserId !== null);
    const teamsWithoutCoach = seasonTeams
      .filter((t) => t.coachUserId === null)
      .map((t) => t.id);

    // Existing (team, template, date) triples make re-attach idempotent.
    const existingPlans = teamsWithCoach.length
      ? await db
          .select({
            teamId: sessionPlans.teamId,
            templateId: sessionPlans.templateId,
            scheduledDate: sessionPlans.scheduledDate,
          })
          .from(sessionPlans)
          .where(inArray(sessionPlans.teamId, teamsWithCoach.map((t) => t.id)))
      : [];
    const existingKeys = new Set(
      existingPlans.map(
        (p) => `${p.teamId}::${p.templateId}::${p.scheduledDate.getTime()}`,
      ),
    );

    const results: { teamId: string; created: number; skippedExisting: number }[] = [];
    for (const team of teamsWithCoach) {
      const drafts = buildDraftSessionPlans({
        teamId: team.id,
        coachUserId: team.coachUserId!,
        entries: entryRows.map((e) => ({
          position: e.position,
          templateId: e.templateId,
          objectives: e.objectives,
          notes: e.notes,
        })),
        templatesById,
        dates,
      });
      const fresh = drafts.filter(
        (d) =>
          !existingKeys.has(
            `${d.teamId}::${d.templateId}::${d.scheduledDate.getTime()}`,
          ),
      );
      if (fresh.length > 0) {
        await db.insert(sessionPlans).values(fresh);
      }
      results.push({
        teamId: team.id,
        created: fresh.length,
        skippedExisting: drafts.length - fresh.length,
      });
    }

    await db
      .update(seasons)
      .set({ curriculumSequenceId: sequence.id, updatedAt: new Date() })
      .where(eq(seasons.id, data.seasonId));

    return new Response(
      JSON.stringify({
        attached: true,
        seasonId: data.seasonId,
        results,
        teamsWithoutCoach,
        truncatedBySeasonEnd,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error attaching sequence:", error);
    return new Response(JSON.stringify({ error: "Failed to attach sequence" }), {
      status: 500,
    });
  }
};
