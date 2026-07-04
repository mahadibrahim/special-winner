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
const keyForPrompt = (p: Record<string, unknown>): string => String(p.content ?? "");
const keyForResource = (r: Record<string, unknown>): string => String(r.title ?? "");
const keyForPrinciple = (p: Record<string, unknown>): string => String(p.title ?? "");

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
    } else if (deepEqual(row, existing)) {
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
    skills: diffTable(content.skills, existing.skills, keyForSkill),
    activities: diffTable(content.activities, existing.activities, keyForActivity),
    templates: diffTable(content.sessionPlans, existing.templates, keyForTemplate),
    prompts: diffTable(content.coachGuidance.prompts, existing.prompts, keyForPrompt),
    resources: diffTable(content.coachGuidance.resources, existing.resources, keyForResource),
    principles: diffTable(content.coachGuidance.principles, existing.principles, keyForPrinciple),
  };
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
