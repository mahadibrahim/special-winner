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
import { sequenceAttachments } from "@/lib/db/schema/blueprint";
import { eq, asc, inArray, sql } from "drizzle-orm";
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
import { evaluateAttachSafety } from "@/lib/curriculum/distribution-safety";

/**
 * Sentinel thrown INSIDE the anchoring transaction (see POST docstring)
 * when the arbiter index (migration 0078) reports zero inserted rows for
 * a team whose plan had fresh work — i.e. a concurrent request already
 * distributed every one of this team's (template, date) pairs between our
 * pre-check read and our insert. Never escapes the transaction as a 500:
 * caught in the handler and turned into an honest 200 "another distribution
 * just covered this" response with no attachment row left behind.
 */
class DistributionRaceLostError extends Error {}

const attachSchema = z.object({
  seasonId: z.string().uuid(),
  weekday: z.number().int().min(0).max(6), // 0=Sunday … 6=Saturday
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)"),
  count: z.number().int().min(1).max(52),
});

/**
 * POST - re-checks safety, then attaches the sequence to a season and
 * generates prescribed ("planned") session_plans for every coached team in
 * it: entry N → Nth practice date. This is the LAST safety gate (see
 * "Distribution" in docs/superpowers/specs/2026-07-10-program-blueprint-design.md)
 * — templates can change after a sequence was composed, so the BLOCK tier
 * is re-evaluated here against the season's REAL effective age band before
 * anything is written; any block 422s the whole request with zero writes.
 *
 * One `sequence_attachments` row anchors this distribution event (lineage
 * for the generated sessions' `sequenceAttachmentId`). The full generation
 * plan (every coached team's missing dates) is computed BEFORE any write:
 * if nothing is missing anywhere, we return without creating an attachment
 * row at all (no empty lineage rows from idempotent re-POSTs). Otherwise
 * the attachment row and the FIRST team WITH FRESH WORK's sessions are
 * inserted in ONE transaction — "first with fresh work", not simply
 * `teamPlans[0]` (oldest team by createdAt): an oldest team whose season
 * slot is already fully distributed has nothing to insert, and anchoring
 * on it would risk the transaction inserting zero rows for reasons that
 * have nothing to do with a race. This guarantees the anchoring
 * transaction always attempts at least one session insert, so a crash or
 * failure between "attachment exists" and "at least one session
 * references it" is impossible, and there is no insert-then-delete
 * cleanup path to get wrong. If that insert's arbiter
 * (onConflictDoNothing, migration 0078) still reports zero rows despite
 * the anchor team having fresh work, a concurrent request beat us to
 * every one of its (team, template, date) pairs — a sentinel
 * (`DistributionRaceLostError`) is thrown INSIDE the transaction so the
 * attachment row rolls back too, and the handler returns 200 with
 * `raceLost: true` and zero writes rather than a phantom empty attachment
 * row. The remaining plans (including any with no fresh work, which no-op
 * harmlessly) each get their own transaction after that (per-group
 * isolation: one team's insert failure is reported in its `results` row
 * and does not block the others or roll back the attachment, which by
 * then already has lineage from the anchor team).
 *
 * Idempotent by design: existing (team, template, scheduledDate) triples are
 * skipped, so re-running after adding a team generates only that team's
 * new sessions. A partial unique index on session_plans (team, template,
 * scheduledDate) WHERE sequence_attachment_id IS NOT NULL closes the
 * concurrent-double-POST gap the pre-check read can't (see migration
 * 0078) — `onConflictDoNothing` against that index means the reported
 * `created` count always reflects rows actually written, even when two
 * requests race. Attaching does not mutate the sequence itself, so global
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

    // Safety re-check FIRST, before anything is written -- distribution is
    // the last gate (see module docstring). Evaluated against the season's
    // REAL effective age band, not the sequence's stage proxy used at
    // entry-write time: templates can change after the sequence was
    // composed, and this is the last chance to catch it.
    const safety = await evaluateAttachSafety(data.seasonId, entryRows, templatesById);
    if (safety.blocks.length > 0) {
      return new Response(
        JSON.stringify({
          error: "One or more templates in this sequence contain safety-blocked skills for this season",
          blocks: safety.blocks,
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }

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

    // Deterministic order so "the anchor team" (the first with fresh work,
    // paired with the attachment insert in a single transaction, below) is
    // stable across runs rather than whatever order Postgres happens to
    // return.
    const seasonTeams = await db
      .select({ id: teams.id, coachUserId: teams.coachUserId })
      .from(teams)
      .where(eq(teams.seasonId, data.seasonId))
      .orderBy(asc(teams.createdAt));
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

    // The partial unique index this ON CONFLICT targets (migration 0078):
    // session_plans (team_id, template_id, scheduled_date) WHERE
    // sequence_attachment_id IS NOT NULL. Every row this endpoint inserts
    // carries a non-null sequenceAttachmentId, so it always matches the
    // arbiter -- this is what makes a concurrent double-POST's second
    // insert a no-op instead of a duplicate row.
    const prescribedDedupeTarget = {
      target: [
        sessionPlans.teamId,
        sessionPlans.templateId,
        sessionPlans.scheduledDate,
      ],
      where: sql`sequence_attachment_id IS NOT NULL`,
    };

    // Compute the full generation plan for every coached team BEFORE any
    // write. Nothing here needs the real attachment id yet -- only
    // (team, template, date) matters for the existing-key pre-check -- so
    // we can decide up front whether this run has anything to distribute
    // at all, and skip creating an attachment row entirely if not.
    const teamPlans = teamsWithCoach.map((team) => {
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
        status: "planned",
        sequenceAttachmentId: null,
      });
      const fresh = drafts.filter(
        (d) =>
          !existingKeys.has(
            `${d.teamId}::${d.templateId}::${d.scheduledDate.getTime()}`,
          ),
      );
      return { team, drafts, fresh };
    });
    const totalFresh = teamPlans.reduce((sum, p) => sum + p.fresh.length, 0);

    const results: {
      teamId: string;
      created: number;
      skippedExisting: number;
      error?: string;
    }[] = [];
    let attachmentId: string | null = null;

    if (totalFresh === 0) {
      // Nothing new anywhere -- an idempotent re-POST that generates
      // nothing shouldn't accumulate an empty attachment row, so none is
      // created (current behavior, kept).
      for (const plan of teamPlans) {
        results.push({
          teamId: plan.team.id,
          created: 0,
          skippedExisting: plan.drafts.length,
        });
      }
    } else {
      // Anchor on the FIRST team with fresh work, not teamPlans[0] (oldest
      // by createdAt) -- an oldest team whose slot is already fully
      // distributed has nothing to insert, and pairing the anchoring
      // transaction with a no-op team would leave it with zero attempted
      // writes for reasons unrelated to a race. totalFresh > 0 guarantees
      // at least one plan qualifies.
      const firstFreshIndex = teamPlans.findIndex((p) => p.fresh.length > 0);
      const firstPlan = teamPlans[firstFreshIndex];
      const restPlans = teamPlans.filter((_, i) => i !== firstFreshIndex);

      // Attachment row + anchor team's sessions in ONE transaction: if the
      // insert fails, both roll back together, so an attachment row can
      // never exist without at least one attempted write against it.
      try {
        attachmentId = await db.transaction(async (tx) => {
          const [attachment] = await tx
            .insert(sequenceAttachments)
            .values({
              sequenceId: sequence.id,
              seasonId: data.seasonId,
              distributedBy: auth.user.id,
            })
            .returning({ id: sequenceAttachments.id });

          const rows = firstPlan.fresh.map((d) => ({
            ...d,
            sequenceAttachmentId: attachment.id,
          }));
          const inserted = await tx
            .insert(sessionPlans)
            .values(rows)
            .onConflictDoNothing(prescribedDedupeTarget)
            .returning({ id: sessionPlans.id });

          if (inserted.length === 0) {
            // firstPlan.fresh.length > 0 by construction, so zero inserted
            // rows here means a concurrent request already won every one
            // of the anchor team's (template, date) pairs between our
            // pre-check read and this insert. Throwing inside the tx rolls
            // the attachment row back too -- no phantom empty attachment.
            throw new DistributionRaceLostError();
          }

          results.push({
            teamId: firstPlan.team.id,
            created: inserted.length,
            skippedExisting: firstPlan.drafts.length - inserted.length,
          });
          return attachment.id;
        });
      } catch (error) {
        if (error instanceof DistributionRaceLostError) {
          // Honest "another distribution just covered this" response:
          // zero writes, no attachment row, nothing to report per team.
          // Teams 2..n never ran in this path -- the winner owns those
          // pairs too and their inserts would conflict-skip anyway.
          return new Response(
            JSON.stringify({
              results: teamPlans.map((p) => ({ teamId: p.team.id, created: 0 })),
              attachmentId: null,
              raceLost: true,
              teamsWithoutCoach,
              truncatedBySeasonEnd,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        console.error(
          `Error generating sessions for team ${firstPlan.team.id}:`,
          error,
        );
        // The anchor team shares a transaction with the attachment insert
        // -- both rolled back together. There is no valid attachment row
        // left to anchor the remaining teams, so the whole run fails
        // rather than silently skipping the anchor.
        return new Response(
          JSON.stringify({ error: "Failed to attach sequence" }),
          { status: 500 },
        );
      }

      // Teams 2..n each in their own transaction -- per-group isolation:
      // one team's failure is reported in its own `results` row and does
      // not touch the others or the (already-committed) attachment row.
      for (const plan of restPlans) {
        try {
          if (plan.fresh.length > 0) {
            const rows = plan.fresh.map((d) => ({
              ...d,
              sequenceAttachmentId: attachmentId!,
            }));
            const inserted = await db.transaction(async (tx) =>
              tx
                .insert(sessionPlans)
                .values(rows)
                .onConflictDoNothing(prescribedDedupeTarget)
                .returning({ id: sessionPlans.id }),
            );
            results.push({
              teamId: plan.team.id,
              created: inserted.length,
              skippedExisting: plan.drafts.length - inserted.length,
            });
          } else {
            results.push({
              teamId: plan.team.id,
              created: 0,
              skippedExisting: plan.drafts.length,
            });
          }
        } catch (error) {
          console.error(
            `Error generating sessions for team ${plan.team.id}:`,
            error,
          );
          results.push({
            teamId: plan.team.id,
            created: 0,
            skippedExisting: 0,
            error: "Failed to generate sessions for this group",
          });
        }
      }
    }

    await db
      .update(seasons)
      .set({ curriculumSequenceId: sequence.id, updatedAt: new Date() })
      .where(eq(seasons.id, data.seasonId));

    return new Response(
      JSON.stringify({
        attached: true,
        seasonId: data.seasonId,
        attachmentId,
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
