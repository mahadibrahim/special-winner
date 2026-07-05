// Pure diff helper for the idempotent curriculum loader (Task 8).
//
// Everything here operates entirely in "content space" -- natural keys
// (slugs/names/titles) only, never database uuids. This is what makes
// `planUpserts` a pure, DB-free function that unit tests can exercise
// directly: the CLI (scripts/curriculum-load.ts) is responsible for
// reading the live database and translating rows back into this same
// content shape (resolving sportId -> sport slug, domainId -> domain name,
// stageId -> stage slug, etc.) before calling `planUpserts`, and for
// resolving slugs -> uuids when it actually writes.
//
// Table naming: the eight keys below (domains, stages, skills, activities,
// templates, prompts, resources, principles) name the *content* group, not
// always the literal DB table -- `templates` corresponds to
// `practice_templates` (fed by `CurriculumContent.sessionPlans`), and
// `prompts`/`resources`/`principles` correspond to `coach_prompts`/
// `coach_resources`/`coaching_principles` (fed by `CurriculumContent.coachGuidance`).

import type {
  ActivityContent,
  CurriculumContent,
  DomainContent,
  SessionPlanContent,
  SkillContent,
  StageContent,
} from "./content/types";

/** Rows currently in the database, translated back into content shape. */
export interface ExistingRows {
  domains: DomainContent[];
  stages: StageContent[];
  skills: SkillContent[];
  activities: ActivityContent[];
  templates: SessionPlanContent[];
  prompts: Record<string, unknown>[];
  resources: Record<string, unknown>[];
  principles: Record<string, unknown>[];
}

/** Per-table diff result. `rows` is the full authoritative content-shaped
 * row set for this table (adds + updates + unchanged combined) -- this is
 * what the CLI writes when applying the plan. */
export interface TableReport<T> {
  adds: number;
  updates: number;
  unchanged: number;
  rows: T[];
}

export interface UpsertPlan {
  domains: TableReport<DomainContent>;
  stages: TableReport<StageContent>;
  skills: TableReport<SkillContent>;
  activities: TableReport<ActivityContent>;
  templates: TableReport<SessionPlanContent>;
  prompts: TableReport<Record<string, unknown>>;
  resources: TableReport<Record<string, unknown>>;
  principles: TableReport<Record<string, unknown>>;
}

// Natural-key extractors -- mirror the Task 1 unique indexes exactly.
const keyForDomain = (d: DomainContent): string => d.name;
const keyForStage = (s: StageContent): string => s.slug;
const keyForSkill = (s: SkillContent): string => `${s.sport}::${s.slug}`;
const keyForActivity = (a: ActivityContent): string => `${a.sport}::${a.slug}`;
const keyForTemplate = (p: SessionPlanContent): string => `${p.sport}::${p.name}`;
// Exported (unlike the other keyFor* extractors above) so
// scripts/curriculum-load.ts's foreign-org ownership check can compute the
// exact same natural key it uses to look up existing rows -- keeping the
// key derivation in one place avoids the two drifting apart.
export const keyForPrompt = (p: Record<string, unknown>): string => String(p.content ?? "");
export const keyForResource = (r: Record<string, unknown>): string => String(r.title ?? "");
const keyForPrinciple = (p: Record<string, unknown>): string => String(p.title ?? "");

// ---------------------------------------------------------------------------
// Write-path defaults -- SINGLE SOURCE OF TRUTH shared with
// scripts/curriculum-load.ts's apply* functions.
//
// Several optional `*Content` fields back NOT NULL DB columns that carry a
// column default (e.g. `skills.assessment_method DEFAULT 'observation'`).
// When authored content omits one of these fields, the write path applies
// the same default below at insert time, so the row that lands in the DB
// always has a concrete value -- never `undefined`/absent. `readExistingRows`
// (scripts/curriculum-load.ts) then reads that concrete value back.
//
// If the comparator below didn't ALSO fill in these defaults before
// deep-comparing, a content object that omits (say) `isCore` would forever
// diff as "changed" against the DB row that has `isCore: false` materialized
// -- a phantom perpetual "update" on every re-run. `normalize*ForCompare`
// below fixes that by applying the exact same defaults to both sides of the
// diff. Keep this object and scripts/curriculum-load.ts's apply* functions
// in lockstep: if a DB column's default ever changes, update it here once.
export const SKILL_DEFAULTS = {
  assessmentMethod: "observation",
  isCore: false,
  sortOrder: 0,
} as const;

export const ACTIVITY_DEFAULTS = {
  indoorSuitable: true,
  featured: false,
} as const;

export const TEMPLATE_DEFAULTS = {
  isDefault: false,
} as const;

export const PROMPT_DEFAULTS = {
  priority: 0,
  frequency: "random",
  isQuestionBased: false,
  active: true,
} as const;

export const RESOURCE_DEFAULTS = {
  featured: false,
  active: true,
} as const;

export const PRINCIPLE_DEFAULTS = {
  sortOrder: 0,
  active: true,
} as const;

/** Fills in the same defaults the write path applies for optional fields
 * backed by NOT NULL DB columns, so a content object that omits them
 * compares equal to the DB row it produced. Also doubles as the "DB
 * round-trip" simulation tests use (see simulateApplied in
 * tests/unit/curriculum/load-helpers.test.ts). */
export function normalizeSkillForCompare(s: SkillContent): SkillContent {
  return {
    ...s,
    assessmentMethod: s.assessmentMethod ?? SKILL_DEFAULTS.assessmentMethod,
    isCore: s.isCore ?? SKILL_DEFAULTS.isCore,
    sortOrder: s.sortOrder ?? SKILL_DEFAULTS.sortOrder,
  };
}

export function normalizeActivityForCompare(a: ActivityContent): ActivityContent {
  return {
    ...a,
    indoorSuitable: a.indoorSuitable ?? ACTIVITY_DEFAULTS.indoorSuitable,
    featured: a.featured ?? ACTIVITY_DEFAULTS.featured,
  };
}

export function normalizeTemplateForCompare(t: SessionPlanContent): SessionPlanContent {
  return {
    ...t,
    isDefault: t.isDefault ?? TEMPLATE_DEFAULTS.isDefault,
  };
}

export function normalizePromptForCompare(
  p: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...p,
    priority: (p.priority as number | undefined) ?? PROMPT_DEFAULTS.priority,
    frequency: (p.frequency as string | undefined) ?? PROMPT_DEFAULTS.frequency,
    isQuestionBased:
      (p.isQuestionBased as boolean | undefined) ?? PROMPT_DEFAULTS.isQuestionBased,
    active: (p.active as boolean | undefined) ?? PROMPT_DEFAULTS.active,
  };
}

export function normalizeResourceForCompare(
  r: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...r,
    featured: (r.featured as boolean | undefined) ?? RESOURCE_DEFAULTS.featured,
    active: (r.active as boolean | undefined) ?? RESOURCE_DEFAULTS.active,
  };
}

export function normalizePrincipleForCompare(
  p: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...p,
    sortOrder: (p.sortOrder as number | undefined) ?? PRINCIPLE_DEFAULTS.sortOrder,
    active: (p.active as boolean | undefined) ?? PRINCIPLE_DEFAULTS.active,
  };
}

/**
 * Deep-equality check over "writable columns" -- i.e. the content shape
 * itself, since ExistingRows is already restricted to the fields the
 * loader writes (no ids, no timestamps, no organizationId). Normalizes
 * through JSON round-tripping first so that `undefined` fields (present in
 * one side but absent in the other) don't cause false "changed" results,
 * and so key order never matters.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  const na = a === undefined ? null : JSON.parse(JSON.stringify(a));
  const nb = b === undefined ? null : JSON.parse(JSON.stringify(b));
  return jsonDeepEqual(na, nb);
}

function jsonDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => jsonDeepEqual(item, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>).sort();
    const bKeys = Object.keys(b as Record<string, unknown>).sort();
    if (aKeys.length !== bKeys.length) return false;
    if (!aKeys.every((k, i) => k === bKeys[i])) return false;
    return aKeys.every((k) =>
      jsonDeepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

function diffTable<T>(
  contentRows: T[],
  existingRows: T[],
  keyOf: (row: T) => string,
  // Applied to BOTH sides before the deep-equal check (never touches
  // `rows`, which stays the raw authored content -- see TableReport's
  // doc comment). Defaults to the identity function for tables that have
  // no optional-field-with-DB-default problem (domains, stages).
  normalize: (row: T) => T = (row) => row,
): TableReport<T> {
  const existingByKey = new Map<string, T>();
  for (const row of existingRows) {
    existingByKey.set(keyOf(row), row);
  }

  let adds = 0;
  let updates = 0;
  let unchanged = 0;
  for (const row of contentRows) {
    const existing = existingByKey.get(keyOf(row));
    if (!existing) {
      adds++;
    } else if (deepEqual(normalize(row), normalize(existing))) {
      unchanged++;
    } else {
      updates++;
    }
  }

  return { adds, updates, unchanged, rows: contentRows };
}

/**
 * Pure diff of the authored curriculum content against a snapshot of what
 * currently exists in the database (already translated into content
 * shape). Never mutates anything and never touches a database -- see the
 * module header for how the CLI uses this.
 */
export function planUpserts(content: CurriculumContent, existing: ExistingRows): UpsertPlan {
  return {
    domains: diffTable(content.domains, existing.domains, keyForDomain),
    stages: diffTable(content.stages, existing.stages, keyForStage),
    skills: diffTable(content.skills, existing.skills, keyForSkill, normalizeSkillForCompare),
    activities: diffTable(
      content.activities,
      existing.activities,
      keyForActivity,
      normalizeActivityForCompare,
    ),
    templates: diffTable(
      content.sessionPlans,
      existing.templates,
      keyForTemplate,
      normalizeTemplateForCompare,
    ),
    prompts: diffTable(
      content.coachGuidance.prompts,
      existing.prompts,
      keyForPrompt,
      normalizePromptForCompare,
    ),
    resources: diffTable(
      content.coachGuidance.resources,
      existing.resources,
      keyForResource,
      normalizeResourceForCompare,
    ),
    principles: diffTable(
      content.coachGuidance.principles,
      existing.principles,
      keyForPrinciple,
      normalizePrincipleForCompare,
    ),
  };
}

// ---------------------------------------------------------------------------
// Foreign-org guidance ownership guard (final review Finding 4).
//
// coach_prompts/coach_resources carry an `organizationId` column, but their
// natural key (content/title) is global, not org-scoped -- readExistingRows
// in scripts/curriculum-load.ts reads them unfiltered by org for exactly
// that reason. That means running the loader for a second org would, absent
// this guard, upsert-and-relabel rows that a *different* org's earlier run
// already created, silently stealing them. coaching_principles has no
// organizationId column at all, so this guard does not apply to it -- it is
// unconditionally global/shared and there is no "steal" to guard against.
//
// This is pure (DB-free) so it's unit testable: the CLI queries the existing
// organizationId for each natural key and passes it in as `rows`.
// ---------------------------------------------------------------------------

/** One existing row's natural key + the organizationId currently on it. */
export interface OwnershipRow {
  key: string;
  organizationId: string | null;
}

export interface OwnershipPartition {
  /** Natural keys whose existing row belongs to a different org and should
   * be skipped (not upserted) this run, unless `allowSteal` was set. */
  skipKeys: Set<string>;
  /** foreignOrgId -> count of keys found owned by that org, for the loud
   * warning the CLI prints before skipping. */
  foreignOrgCounts: Map<string, number>;
}

/**
 * Partitions existing rows' natural keys into "safe to write" vs. "owned by
 * a different org, skip unless allowSteal". Rows with `organizationId: null`
 * (true global rows with no owner yet) are always safe -- there is no other
 * org to steal from.
 */
export function partitionForeignOwnership(
  rows: OwnershipRow[],
  targetOrgId: string,
  allowSteal: boolean,
): OwnershipPartition {
  const skipKeys = new Set<string>();
  const foreignOrgCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.organizationId && row.organizationId !== targetOrgId) {
      foreignOrgCounts.set(
        row.organizationId,
        (foreignOrgCounts.get(row.organizationId) ?? 0) + 1,
      );
      if (!allowSteal) skipKeys.add(row.key);
    }
  }
  return { skipKeys, foreignOrgCounts };
}

/** Empty `ExistingRows` -- convenience for callers seeding a from-scratch plan. */
export function emptyExistingRows(): ExistingRows {
  return {
    domains: [],
    stages: [],
    skills: [],
    activities: [],
    templates: [],
    prompts: [],
    resources: [],
    principles: [],
  };
}
