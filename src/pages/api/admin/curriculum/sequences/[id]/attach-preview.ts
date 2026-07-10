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
import { programs } from "@/lib/db/schema/programs";
import { sequenceAttachments } from "@/lib/db/schema/blueprint";
import { eq, and, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgSeason,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { loadSequenceForOrg } from "@/lib/curriculum/sequence-ownership";
import {
  generatePracticeDates,
  type TemplateForBuild,
} from "@/lib/curriculum/sequence-instantiation";
import { evaluateAttachSafety } from "@/lib/curriculum/distribution-safety";
import { groupNoun } from "@/lib/programs/group-noun";

const previewQuerySchema = z.object({
  seasonId: z.string().uuid(),
  weekday: z.coerce.number().int().min(0).max(6),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)"),
  count: z.coerce.number().int().min(1).max(52),
});

/**
 * GET - read-only preview of what a POST .../attach with the same
 * parameters would do. Same query shape as the POST body (carried as
 * searchParams here), same safety re-check, same idempotency accounting —
 * nothing is written. See "Distribution" (Preview step) in
 * docs/superpowers/specs/2026-07-10-program-blueprint-design.md.
 *
 * One group (coached team) per row: the generated dates, which of those
 * dates already have *some* session for that team (`conflicts` — any
 * existing session_plans row that day, not necessarily from this sequence),
 * and how many sessions this sequence has already distributed to that team
 * for this season (`alreadyDistributed` — session_plans rows carrying a
 * sequenceAttachmentId from a prior sequence_attachments row for this
 * sequence+season).
 */
export const GET: APIRoute = async (context) => {
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

    const url = new URL(context.request.url);
    const result = previewQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    );
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
      .select({ id: seasons.id, endDate: seasons.endDate, programId: seasons.programId })
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

    // Same safety evaluation the POST runs — preview surfaces the same
    // blocks read-only, before a director confirms.
    const safety = await evaluateAttachSafety(data.seasonId, entryRows, templatesById);

    const [program] = await db
      .select({ programType: programs.programType })
      .from(programs)
      .where(eq(programs.id, season.programId))
      .limit(1);
    const noun = groupNoun(program?.programType ?? "league");

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
    const dateIsoList = dates.map((d) => d.toISOString());
    const dateIsoSet = new Set(dateIsoList);

    const seasonTeams = await db
      .select({ id: teams.id, name: teams.name, coachUserId: teams.coachUserId })
      .from(teams)
      .where(eq(teams.seasonId, data.seasonId));
    const teamsWithCoach = seasonTeams.filter((t) => t.coachUserId !== null);
    const teamIds = teamsWithCoach.map((t) => t.id);

    // Conflicts: any existing session_plans row for the team that lands on
    // one of the candidate dates, regardless of template/sequence origin.
    const existingSessions = teamIds.length
      ? await db
          .select({ teamId: sessionPlans.teamId, scheduledDate: sessionPlans.scheduledDate })
          .from(sessionPlans)
          .where(inArray(sessionPlans.teamId, teamIds))
      : [];
    const conflictsByTeam = new Map<string, Set<string>>();
    for (const row of existingSessions) {
      const iso = row.scheduledDate.toISOString();
      if (!dateIsoSet.has(iso)) continue;
      if (!conflictsByTeam.has(row.teamId)) conflictsByTeam.set(row.teamId, new Set());
      conflictsByTeam.get(row.teamId)!.add(iso);
    }

    // Already distributed: sessions carrying a sequenceAttachmentId from a
    // PRIOR sequence_attachments row for this sequence + season (a previous
    // successful distribution run, potentially more than one over time).
    // Defensive read: the inner join means an attachment row with zero
    // session_plans rows is never counted as "prior" — the crash-safe
    // write path in attach.ts can no longer create one going forward, but
    // a historical zero-session row (pre-fix, or from the old
    // insert-then-delete cleanup racing a crash) has no "already
    // distributed" meaning and must not surface as one.
    const priorAttachments = await db
      .selectDistinct({ id: sequenceAttachments.id })
      .from(sequenceAttachments)
      .innerJoin(
        sessionPlans,
        eq(sessionPlans.sequenceAttachmentId, sequenceAttachments.id),
      )
      .where(
        and(
          eq(sequenceAttachments.sequenceId, sequence.id),
          eq(sequenceAttachments.seasonId, data.seasonId),
        ),
      );
    const priorAttachmentIds = priorAttachments.map((a) => a.id);
    const alreadyDistributedByTeam = new Map<string, number>();
    if (priorAttachmentIds.length > 0 && teamIds.length > 0) {
      const distributedRows = await db
        .select({ teamId: sessionPlans.teamId })
        .from(sessionPlans)
        .where(
          and(
            inArray(sessionPlans.teamId, teamIds),
            inArray(sessionPlans.sequenceAttachmentId, priorAttachmentIds),
          ),
        );
      for (const row of distributedRows) {
        alreadyDistributedByTeam.set(
          row.teamId,
          (alreadyDistributedByTeam.get(row.teamId) ?? 0) + 1,
        );
      }
    }

    const groups = teamsWithCoach.map((team) => {
      const conflicts = [...(conflictsByTeam.get(team.id) ?? new Set<string>())].sort();
      return {
        teamId: team.id,
        groupLabel: team.name,
        noun,
        dates: dateIsoList,
        conflicts,
        alreadyDistributed: alreadyDistributedByTeam.get(team.id) ?? 0,
        truncated: truncatedBySeasonEnd,
      };
    });

    const summary = {
      groupCount: groups.length,
      sessionCount: groups.length * dateIsoList.length,
      conflictCount: groups.reduce((sum, g) => sum + g.conflicts.length, 0),
    };

    return new Response(
      JSON.stringify({
        groups,
        summary,
        safety: { blocks: safety.blocks, bandKnown: safety.bandKnown },
        truncatedBySeasonEnd,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error previewing sequence attach:", error);
    return new Response(JSON.stringify({ error: "Failed to preview attach" }), {
      status: 500,
    });
  }
};
