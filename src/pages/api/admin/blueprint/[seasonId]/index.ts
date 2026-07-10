/**
 * Program Blueprint workspace bootstrap (T6). See "The Blueprint workspace"
 * in docs/superpowers/specs/2026-07-10-program-blueprint-design.md.
 *
 * GET returns everything the blueprint island needs in one call: the
 * program/season header, the effective age band + stage labels guardrails
 * key off, the arc's slots (sequence entries) with LIVE guardrails
 * evaluated against the season's REAL effective band (richer than the
 * proxy check entries.ts runs at write time — see below), and the template
 * rail.
 *
 * --- Sequence-discovery design decision ---
 * The spec's "Data" section already added `seasons.curriculum_sequence_id`
 * (nullable, set by the attach POST / cleared by detach) as the season's
 * link to its distributed sequence. Rather than inventing a second,
 * parallel "which sequence is this season composing" pointer, the
 * blueprint reuses that SAME column for the pre-distribution composition
 * phase too: POST (below) sets it directly, without running the full
 * attach flow (which requires weekday/startDate/timeOfDay and immediately
 * generates sessions for every coached group — wrong for "just pick/create
 * a sequence to start composing"). This is safe because the column is only
 * a "which sequence is this season currently working with" pointer, not a
 * lineage record — historical distributed sessions carry their own lineage
 * via `sequence_attachment_id` / `sequence_attachments` regardless of what
 * this pointer currently holds (see detach.ts's docstring: "Already-
 * generated draft session_plans are intentionally left alone"). Switching
 * it pre- or post-distribution never mutates or orphans a single
 * session_plans row.
 *
 * When the pointer is null, GET also returns `candidateSequences` (org +
 * global sequences matching the program's sport) so the island can offer
 * "pick an existing one" alongside "create new" (via the EXISTING
 * `POST /api/admin/curriculum/sequences`, reused unchanged — see the
 * island's header comment for the exact two-call flow).
 *
 * --- Guardrail re-evaluation note ---
 * Slots here show guardrails evaluated against the season's REAL effective
 * band (resolveEffectiveSeasonBand), not the sequence's own stage the way
 * entries.ts's write-time check does. The two can disagree by design (see
 * blueprint-attach.test.ts): a template can pass entries.ts's proxy check
 * (sequence pinned to an older stage) and still show BLOCK here once
 * evaluated against a younger season's real band — that's exactly the gap
 * the distribution-time re-check (attach.ts) exists to close, and this
 * view surfaces it earlier, before the director ever tries to distribute.
 *
 * --- WARN tier is evaluated here, not reused from buildGuardrailActivityInput ---
 * `buildGuardrailActivityInput` (guardrails.ts) always returns
 * `appropriateStages: null` — by design, per its own docstring: "Templates
 * carry no stage tagging of their own... warn tier doesn't apply at the
 * template level, only the safety block tier." entries.ts's own comment
 * confirms this is deliberate: "warn-tier stage skew is evaluated by the
 * blueprint UI/attach re-check, not here." So this endpoint — the
 * "blueprint UI" side of that split — resolves each entry's
 * `activitySuggestions` strings against the REAL `CURRICULUM_CONTENT`
 * activities (same match rule as `resolveSuggestionSkillSlugs`) and builds
 * a SEPARATE warn-only `GuardrailActivityInput` per matched activity,
 * carrying its real `appropriateStages` and `skills: []` (empty on
 * purpose — the BLOCK tier for this entry is already fully covered by the
 * `buildGuardrailActivityInput` input alongside it; giving the warn-only
 * inputs skills would double-count the same blocks).
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { eq, and, or, isNull, inArray, asc } from "drizzle-orm";
import { z } from "zod";
import {
  seasons,
  programs,
  curriculumSequences,
  curriculumSequenceEntries,
  practiceTemplates,
  developmentStages,
  skills,
  users,
} from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { blueprintWarningDismissals } from "@/lib/db/schema/blueprint";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgSeason,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { loadSequenceForOrg } from "@/lib/curriculum/sequence-ownership";
import { resolveEffectiveSeasonBand } from "@/lib/curriculum/distribution-safety";
import {
  mapAgeBandToStages,
  evaluateGuardrails,
  buildGuardrailActivityInput,
  type GuardrailBlock,
  type GuardrailWarn,
  type GuardrailActivityInput,
} from "@/lib/curriculum/guardrails";
import { STAGES } from "@/lib/curriculum/content/reference";
import { CURRICULUM_CONTENT } from "@/lib/curriculum/content";
import { groupNoun } from "@/lib/programs/group-noun";

function stageDisplayName(slug: string): string {
  return STAGES.find((s) => s.slug === slug)?.name ?? slug;
}

/**
 * Warn-only activity inputs for one template's `activitySuggestions` — see
 * the "WARN tier" module docstring above for why this can't just reuse
 * `buildGuardrailActivityInput`. Matches suggestion strings against
 * `CURRICULUM_CONTENT.activities` case-insensitively by slug or name (same
 * rule as `resolveSuggestionSkillSlugs`), carrying each matched activity's
 * real `appropriateStages` with `skills: []` so it can never contribute a
 * duplicate BLOCK (that's already covered by the paired
 * `buildGuardrailActivityInput` input for this same template).
 */
function buildWarnOnlyActivityInputs(
  structure: { activitySuggestions?: string[] }[] | null,
): GuardrailActivityInput[] {
  const suggestions = (structure ?? []).flatMap((seg) => seg.activitySuggestions ?? []);
  const normalized = new Set(
    suggestions.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0),
  );
  if (normalized.size === 0) return [];

  const matched: GuardrailActivityInput[] = [];
  for (const activity of CURRICULUM_CONTENT.activities) {
    const isMatch =
      normalized.has(activity.slug.toLowerCase()) || normalized.has(activity.name.toLowerCase());
    if (!isMatch) continue;
    matched.push({
      name: activity.name,
      appropriateStages: activity.appropriateStages ?? null,
      skills: [],
    });
  }
  return matched;
}

// GET - bootstrap the blueprint workspace for one season.
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const { seasonId } = context.params;
    if (!seasonId) {
      return new Response(JSON.stringify({ error: "Season ID required" }), {
        status: 400,
      });
    }

    const seasonCheck = await requireSameOrgSeason(auth.organizationId, seasonId);
    if (!seasonCheck.ok) return ownershipDeniedResponse();

    const db = getDb();

    const [row] = await db
      .select({
        seasonId: seasons.id,
        seasonName: seasons.name,
        startDate: seasons.startDate,
        endDate: seasons.endDate,
        curriculumSequenceId: seasons.curriculumSequenceId,
        programId: programs.id,
        programName: programs.name,
        programType: programs.programType,
        sportId: programs.sportId,
        sportName: sports.name,
      })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .where(eq(seasons.id, seasonId))
      .limit(1);

    if (!row) return ownershipDeniedResponse();

    const band = await resolveEffectiveSeasonBand(seasonId);
    const bandKnown = band.minAge !== null && band.maxAge !== null;
    const displayMin = band.minAge ?? band.maxAge;
    const displayMax = band.maxAge ?? band.minAge;
    const stageSlugs =
      displayMin !== null && displayMax !== null
        ? mapAgeBandToStages(displayMin, displayMax)
        : [];
    const stageLabels = stageSlugs.map(stageDisplayName);

    // Primary stage for the "create new sequence" default (island doesn't
    // need to re-derive this) — the youngest-sort-order stage in the band,
    // resolved to a real development_stages row id. Null when the band
    // maps to no seeded stage (empty reference table, or no band at all).
    let primaryStageId: string | null = null;
    if (stageSlugs.length > 0) {
      const [primaryStage] = await db
        .select({ id: developmentStages.id })
        .from(developmentStages)
        .where(eq(developmentStages.slug, stageSlugs[0]))
        .limit(1);
      primaryStageId = primaryStage?.id ?? null;
    }

    const noun = groupNoun(row.programType);

    // ---- Sequence discovery ----
    let sequence: { id: string; name: string; stageSlug: string } | null = null;
    let candidateSequences: { id: string; name: string; stage: string }[] = [];

    if (row.curriculumSequenceId) {
      const [seqRow] = await db
        .select({
          id: curriculumSequences.id,
          name: curriculumSequences.name,
          stageSlug: developmentStages.slug,
        })
        .from(curriculumSequences)
        .innerJoin(
          developmentStages,
          eq(curriculumSequences.developmentStageId, developmentStages.id),
        )
        .where(eq(curriculumSequences.id, row.curriculumSequenceId))
        .limit(1);
      sequence = seqRow ?? null;
    }

    if (!sequence) {
      const candidateRows = await db
        .select({
          id: curriculumSequences.id,
          name: curriculumSequences.name,
          stage: developmentStages.slug,
        })
        .from(curriculumSequences)
        .innerJoin(
          developmentStages,
          eq(curriculumSequences.developmentStageId, developmentStages.id),
        )
        .where(
          and(
            eq(curriculumSequences.sportId, row.sportId),
            or(
              eq(curriculumSequences.organizationId, auth.organizationId),
              isNull(curriculumSequences.organizationId),
            ),
          ),
        )
        .orderBy(asc(curriculumSequences.name));
      candidateSequences = candidateRows;
    }

    // ---- Slots (sequence entries) with live guardrails ----
    let slots: {
      entryId: string;
      order: number;
      template: { id: string; title: string; durationMinutes: number; focusSkillNames: string[] };
      guardrails: {
        blocks: GuardrailBlock[];
        warns: GuardrailWarn[];
        dismissed: boolean;
        dismissedBy: string | null;
        dismissedAt: string | null;
      };
    }[] = [];

    // ---- Template rail ----
    const templateRows = await db
      .select({
        id: practiceTemplates.id,
        title: practiceTemplates.name,
        durationMinutes: practiceTemplates.totalDurationMinutes,
        stageSlug: developmentStages.slug,
        focusSkillIds: practiceTemplates.focusSkillIds,
        structure: practiceTemplates.structure,
      })
      .from(practiceTemplates)
      .innerJoin(developmentStages, eq(practiceTemplates.stageId, developmentStages.id))
      .where(
        and(
          eq(practiceTemplates.sportId, row.sportId),
          eq(practiceTemplates.active, true),
          or(
            eq(practiceTemplates.organizationId, auth.organizationId),
            isNull(practiceTemplates.organizationId),
          ),
        ),
      )
      .orderBy(asc(practiceTemplates.name));

    let entryRows: {
      id: string;
      position: number;
      templateId: string;
      title: string;
      durationMinutes: number;
      focusSkillIds: string[] | null;
      structure: { activitySuggestions?: string[] }[] | null;
    }[] = [];
    if (sequence) {
      entryRows = await db
        .select({
          id: curriculumSequenceEntries.id,
          position: curriculumSequenceEntries.position,
          templateId: curriculumSequenceEntries.templateId,
          title: practiceTemplates.name,
          durationMinutes: practiceTemplates.totalDurationMinutes,
          focusSkillIds: practiceTemplates.focusSkillIds,
          structure: practiceTemplates.structure,
        })
        .from(curriculumSequenceEntries)
        .innerJoin(
          practiceTemplates,
          eq(curriculumSequenceEntries.templateId, practiceTemplates.id),
        )
        .where(eq(curriculumSequenceEntries.sequenceId, sequence.id))
        .orderBy(asc(curriculumSequenceEntries.position));
    }

    // One skills query covers both the rail and the entries' focus skills.
    const allSkillIds = [
      ...new Set([
        ...templateRows.flatMap((t) => t.focusSkillIds ?? []),
        ...entryRows.flatMap((e) => e.focusSkillIds ?? []),
      ]),
    ];
    const skillRows = allSkillIds.length
      ? await db
          .select({ id: skills.id, slug: skills.slug, name: skills.name })
          .from(skills)
          .where(inArray(skills.id, allSkillIds))
      : [];
    const skillsById = new Map(skillRows.map((s) => [s.id, s]));
    const skillNames = (ids: string[] | null): string[] =>
      (ids ?? []).map((id) => skillsById.get(id)?.name).filter((n): n is string => !!n);

    if (entryRows.length > 0 && sequence) {
      // Keyed by (sequenceId, templateId) — not entry.id — so a dismissal
      // survives the entries PUT's delete-reinsert-with-fresh-UUIDs
      // behavior on reorder/re-add (Task 7; see blueprint.ts's schema
      // docstring and migration 0079). Multiple entries in the same
      // sequence can reference the same template; they correctly share
      // one dismissed state.
      const templateIds = [...new Set(entryRows.map((e) => e.templateId))];
      const dismissalRows = await db
        .select({
          templateId: blueprintWarningDismissals.templateId,
          dismissedAt: blueprintWarningDismissals.dismissedAt,
          dismissedByFirstName: users.firstName,
        })
        .from(blueprintWarningDismissals)
        .innerJoin(users, eq(blueprintWarningDismissals.dismissedBy, users.id))
        .where(
          and(
            eq(blueprintWarningDismissals.sequenceId, sequence.id),
            inArray(blueprintWarningDismissals.templateId, templateIds),
          ),
        );
      const dismissalByTemplateId = new Map(
        dismissalRows.map((d) => [d.templateId, d]),
      );

      slots = entryRows.map((entry) => {
        const blockInput = buildGuardrailActivityInput(
          { name: entry.title, focusSkillIds: entry.focusSkillIds, structure: entry.structure },
          skillsById,
        );
        const warnInputs = buildWarnOnlyActivityInputs(entry.structure);
        const result = evaluateGuardrails({
          seasonMinAge: band.minAge,
          seasonMaxAge: band.maxAge,
          activities: [blockInput, ...warnInputs],
        });
        const dismissal = dismissalByTemplateId.get(entry.templateId);
        return {
          entryId: entry.id,
          order: entry.position,
          template: {
            id: entry.templateId,
            title: entry.title,
            durationMinutes: entry.durationMinutes,
            focusSkillNames: skillNames(entry.focusSkillIds),
          },
          guardrails: {
            blocks: result.blocks,
            warns: result.warns,
            dismissed: !!dismissal,
            dismissedBy: dismissal?.dismissedByFirstName ?? null,
            dismissedAt: dismissal ? dismissal.dismissedAt.toISOString() : null,
          },
        };
      });
    }

    const templates = templateRows.map((t) => ({
      id: t.id,
      title: t.title,
      durationMinutes: t.durationMinutes,
      stageSlug: t.stageSlug,
      focusSkillNames: skillNames(t.focusSkillIds),
    }));

    return new Response(
      JSON.stringify({
        program: {
          id: row.programId,
          name: row.programName,
          programType: row.programType,
          sportId: row.sportId,
          sportName: row.sportName,
        },
        season: {
          id: row.seasonId,
          name: row.seasonName,
          startDate: row.startDate,
          endDate: row.endDate,
          band: { minAge: band.minAge, maxAge: band.maxAge, known: bandKnown },
          stageLabels,
          // Raw slugs alongside the display labels — the island filters the
          // template rail by comparing a template's own stageSlug against
          // this set directly, rather than reverse-parsing display strings.
          stageSlugs,
          primaryStageId,
        },
        noun,
        sequence,
        candidateSequences,
        slots,
        templates,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error loading blueprint bootstrap:", error);
    return new Response(JSON.stringify({ error: "Failed to load blueprint" }), {
      status: 500,
    });
  }
};

const selectSequenceSchema = z.object({ sequenceId: z.string().uuid() });

/**
 * POST - link an existing sequence (already created via the standard
 * `POST /api/admin/curriculum/sequences`) to this season for blueprint
 * composition. See the sequence-discovery note above the GET handler for
 * why this sets the same `seasons.curriculum_sequence_id` column the
 * attach endpoint sets, without running the full attach flow.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const { seasonId } = context.params;
    if (!seasonId) {
      return new Response(JSON.stringify({ error: "Season ID required" }), {
        status: 400,
      });
    }

    const seasonCheck = await requireSameOrgSeason(auth.organizationId, seasonId);
    if (!seasonCheck.ok) return ownershipDeniedResponse();

    const body = await context.request.json();
    const result = selectSequenceSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const sequence = await loadSequenceForOrg(auth.organizationId, result.data.sequenceId);
    if (!sequence) return ownershipDeniedResponse();

    const db = getDb();
    const [program] = await db
      .select({ sportId: programs.sportId })
      .from(programs)
      .where(eq(programs.id, seasonCheck.row.programId))
      .limit(1);

    if (!program || program.sportId !== sequence.sportId) {
      return new Response(
        JSON.stringify({ error: "This sequence's sport does not match the program's sport" }),
        { status: 400 },
      );
    }

    await db
      .update(seasons)
      .set({ curriculumSequenceId: sequence.id, updatedAt: new Date() })
      .where(eq(seasons.id, seasonId));

    const [stage] = await db
      .select({ slug: developmentStages.slug })
      .from(developmentStages)
      .where(eq(developmentStages.id, sequence.developmentStageId))
      .limit(1);

    return new Response(
      JSON.stringify({
        sequence: { id: sequence.id, name: sequence.name, stageSlug: stage?.slug ?? "" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error linking sequence to season:", error);
    return new Response(JSON.stringify({ error: "Failed to link sequence" }), {
      status: 500,
    });
  }
};
