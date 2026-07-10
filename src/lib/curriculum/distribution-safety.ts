/**
 * Distribution-time BLOCK-tier safety re-check (Program Blueprint T4). See
 * "Distribution" in docs/superpowers/specs/2026-07-10-program-blueprint-design.md:
 *
 *   "The block is also enforced server-side in the sequence-entry write and
 *   re-checked at distribution (templates can change after composition;
 *   distribution is the last gate...)."
 *
 * Distinct from the proxy-band check entries.ts/templates/[id].ts run at
 * write time (which use the sequence's own development stage as a stand-in
 * for a season that doesn't exist yet): this evaluates against the REAL
 * season's effective age band, since that's the band that actually governs
 * who shows up to the generated sessions.
 *
 * Shared by both the attach POST (fails closed: any block -> 422, nothing
 * written) and the attach-preview GET (read-only: surfaces the same blocks
 * so a director sees them before confirming). Do not re-derive this
 * resolution at a new call site — import from here.
 */
import { getDb } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { seasons } from "@/lib/db/schema/programs";
import { ageGroups } from "@/lib/db/schema/sports";
import { skills } from "@/lib/db/schema/curriculum";
import {
  evaluateGuardrails,
  buildGuardrailActivityInput,
  buildWarnOnlyActivityInputs,
  type GuardrailBlock,
  type GuardrailWarn,
} from "./guardrails";
import type { TemplateForBuild } from "./sequence-instantiation";

export interface EffectiveSeasonBand {
  minAge: number | null;
  maxAge: number | null;
}

/**
 * Resolve a season's effective age band: the season's own `minAge`/`maxAge`
 * win; either bound falls back to its age group's when the season's own
 * field is null. Both unset (no season fields, no age group, or no age
 * group linked) resolves to `{ minAge: null, maxAge: null }` — "band
 * unknown" — which `evaluateGuardrails` treats as fail-closed for the BLOCK
 * tier (see guardrails.ts's fail-closed contract).
 */
export async function resolveEffectiveSeasonBand(
  seasonId: string,
): Promise<EffectiveSeasonBand> {
  const db = getDb();
  const [row] = await db
    .select({
      seasonMinAge: seasons.minAge,
      seasonMaxAge: seasons.maxAge,
      ageGroupMinAge: ageGroups.minAge,
      ageGroupMaxAge: ageGroups.maxAge,
    })
    .from(seasons)
    .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
    .where(eq(seasons.id, seasonId))
    .limit(1);

  if (!row) return { minAge: null, maxAge: null };
  return {
    minAge: row.seasonMinAge ?? row.ageGroupMinAge ?? null,
    maxAge: row.seasonMaxAge ?? row.ageGroupMaxAge ?? null,
  };
}

export interface AttachSafetyResult {
  blocks: GuardrailBlock[];
  /** WARN-tier (stage skew) findings, same resolution the blueprint
   * bootstrap uses (`buildWarnOnlyActivityInputs`) — non-gating, surfaced
   * for the attach-preview UI only. The POST attach endpoint ignores this
   * field; only `blocks` gates distribution. */
  warns: GuardrailWarn[];
  /** false when the effective band is unknown (both bounds null) — callers
   * show a "can't evaluate" notice; this does NOT mean blocks is
   * necessarily empty (fail-closed still fires — see guardrails.ts). */
  bandKnown: boolean;
}

/**
 * Evaluate the BLOCK-tier (and, for the preview UI, WARN-tier) guardrail
 * for a sequence's entries against a season's effective age band. One
 * BLOCK activity per distinct template referenced by the entries (repeats
 * collapse — the same template used twice in a sequence only needs
 * evaluating once); WARN inputs are resolved per distinct template too, via
 * the same `buildWarnOnlyActivityInputs` the blueprint bootstrap uses, so
 * distribution preview and the composition view never disagree on which
 * stage-skew warnings exist for a given template.
 */
export async function evaluateAttachSafety(
  seasonId: string,
  entryRows: { templateId: string }[],
  templatesById: Map<string, TemplateForBuild>,
): Promise<AttachSafetyResult> {
  const band = await resolveEffectiveSeasonBand(seasonId);
  return evaluateAttachSafetyForBand(band, entryRows, templatesById);
}

/**
 * Same evaluation as `evaluateAttachSafety`, but against a CALLER-SUPPLIED
 * band instead of one resolved from the season's row as it currently sits
 * in the DB. Exists for the season PUT endpoint (seasons.ts): when an edit
 * changes minAge/maxAge/ageGroupId on a season that already has a linked
 * sequence or distributed sessions, the re-check must run against the NEW
 * proposed band BEFORE it's written — `resolveEffectiveSeasonBand` can only
 * ever see the band that's currently persisted, so it can't be reused
 * as-is for a pre-write check. `evaluateAttachSafety` above is unchanged
 * (still the one attach.ts/attach-preview.ts call) and just delegates here
 * after resolving the real band the normal way.
 */
export async function evaluateAttachSafetyForBand(
  band: EffectiveSeasonBand,
  entryRows: { templateId: string }[],
  templatesById: Map<string, TemplateForBuild>,
): Promise<AttachSafetyResult> {
  const db = getDb();

  const uniqueTemplateIds = [...new Set(entryRows.map((e) => e.templateId))];

  const skillIds = [
    ...new Set(
      uniqueTemplateIds.flatMap((tid) => templatesById.get(tid)?.focusSkillIds ?? []),
    ),
  ];
  const skillRows = skillIds.length
    ? await db
        .select({ id: skills.id, slug: skills.slug, name: skills.name })
        .from(skills)
        .where(inArray(skills.id, skillIds))
    : [];
  const skillsById = new Map(skillRows.map((s) => [s.id, s]));

  const activities = uniqueTemplateIds.flatMap((tid) => {
    const template = templatesById.get(tid);
    const blockInput = buildGuardrailActivityInput(
      {
        name: template?.name ?? "Unknown template",
        focusSkillIds: template?.focusSkillIds ?? null,
        structure: template?.structure ?? null,
      },
      skillsById,
    );
    const warnInputs = buildWarnOnlyActivityInputs(template?.structure ?? null);
    return [blockInput, ...warnInputs];
  });

  const result = evaluateGuardrails({
    seasonMinAge: band.minAge,
    seasonMaxAge: band.maxAge,
    activities,
  });

  return { blocks: result.blocks, warns: result.warns, bandKnown: result.evaluable };
}
