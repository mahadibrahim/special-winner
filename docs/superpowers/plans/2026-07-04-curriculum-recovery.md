# Curriculum Recovery & Development Loop Activation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the recovered ~45k-line curriculum library into permanent content-as-code, load it safely into staging/prod, build the assessment-snapshot pipeline, and ship the domain spider chart — per `docs/superpowers/specs/2026-07-04-curriculum-recovery-design.md`.

**Architecture:** Recovered seeds (git-history extraction at `.superpowers/curriculum-recovery/seeds/`) are consolidated into typed modules under `src/lib/curriculum/content/` (v2 canonical, gen-1 fills gaps, upgrade payloads folded by slug). A permanent idempotent loader upserts by natural key (enabled by a new unique-index migration). A new snapshot compute runs on assessment writes and feeds a hand-rolled SVG radar on the parent and coach surfaces.

**Tech Stack:** Drizzle/Postgres, Astro 5 + React 19, Vitest, hand-rolled SVG (no chart dependency).

## Global Constraints

- Branch `feat/curriculum-recovery` (spec already committed there). Work in a worktree for subagent execution.
- Recovered source files: `.superpowers/curriculum-recovery/seeds/` (35 files, names flattened: `curriculum-v2__soccer-skills.ts` etc.) and `.superpowers/curriculum-recovery/scripts/curriculum-day0-seed.ts`. These are REFERENCE MATERIAL — never import them from src/; content is re-authored into the new modules.
- Schema changes ONLY via `npm run db:generate` → commit the migration. NEVER `db:push`. Never touch any database from implementer subagents — the controller runs all loads/API tests.
- Multi-tenant rule: every `.limit(1)`/`findFirst`-style lookup gets an explicit `orderBy` (CLAUDE.md).
- `npx tsc --noEmit` clean before every commit; conventional commits ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Content counts (from the 2026-07-04 analysis, used as test assertions): v2 skills 13 soccer / 13 basketball / 13 hockey (each 5 technical, 3 tactical, 2 physical, 3 psychological); v2 activities 9 soccer / 5 basketball; v2 soccer session plans 4; gen-1 activities 49 soccer / 49 basketball; gen-1 session templates 15; gen-1 skills 23.
- Unit test command: `npx vitest run tests/unit/curriculum`. Do not run API tests, dev servers, builds, or `npm run db:seed:e2e` in implementer subagents.

---

### Task 1: Unique-index migration + structure type widening

**Files:**
- Modify: `src/lib/db/schema/curriculum.ts` (skills table)
- Modify: `src/lib/db/schema/practice-planning.ts` (activities, practiceTemplates)
- Modify: `src/lib/db/schema/coach-guidance.ts` (coachPrompts, coachResources, coachingPrinciples)
- Modify: `src/lib/db/schema/assessments.ts` (assessmentSnapshots)
- Create (generated): `src/lib/db/migrations/NNNN_*.sql` + hand-edited dedupe preamble

**Interfaces:**
- Produces: DB uniqueness the loader (Task 8) and snapshot upsert (Task 9) rely on:
  - `skills`: unique `(sport_id, slug)` — named index `skills_sport_slug_uniq`
  - `activities`: unique `(sport_id, slug)` — `activities_sport_slug_uniq`
  - `practice_templates`: unique `(sport_id, name)` — `practice_templates_sport_name_uniq`
  - `coach_resources`: unique `(title)`; `coaching_principles`: unique `(title)`; `coach_prompts`: unique on its human-identifying natural key — read `src/lib/db/schema/coach-guidance.ts:54-84` first; if `title` is nullable there, use the always-present text column (e.g. `promptText`/`body` — whatever the column is actually named) and document the choice in a comment in the schema file.
  - `assessment_snapshots`: unique `(family_member_id, season_id, domain_id)` — `assessment_snapshots_member_season_domain_uniq`
  - `practiceTemplates.structure` jsonb `$type` gains `coachingScript?: string` per segment.

- [ ] **Step 1: Widen the structure type**

In `src/lib/db/schema/practice-planning.ts`, find the `structure` jsonb on `practiceTemplates` (around line 61) and add `coachingScript?: string` to the segment object type:

```ts
structure: jsonb("structure").$type<
  {
    name: string;
    type: string;
    durationMinutes: number;
    description?: string;
    activitySuggestions?: string[];
    // v2 session plans script the coaching per segment (see
    // docs/curriculum/content-architecture.md "Script the Coaching")
    coachingScript?: string;
  }[]
>(),
```

- [ ] **Step 2: Add `.unique()`/uniqueIndex to the five schemas**

Use Drizzle's table-level `uniqueIndex` (mirror how `src/lib/db/schema/ops-pings.ts` declares `ops_pings_kind_event_uniq`) with the exact index names from the Interfaces block. For `skills` and `activities` the second table argument already exists or must be added — read each file first and follow its existing style.

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: new `NNNN_*.sql` containing only `CREATE UNIQUE INDEX` statements.

- [ ] **Step 4: Prepend defensive dedupe to the migration**

Hand-edit the generated SQL: before each `CREATE UNIQUE INDEX`, delete duplicate rows keeping the oldest (`created_at` asc). Pattern (repeat per table with its key columns):

```sql
DELETE FROM "skills" a USING "skills" b
  WHERE a.sport_id = b.sport_id AND a.slug = b.slug
    AND a.created_at > b.created_at;
```

For `assessment_snapshots` use `(family_member_id, season_id, domain_id)`. Tables are empty on staging today, so this is pure defense for prod/CI drift.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/db/schema/ src/lib/db/migrations/
git commit -m "feat(curriculum): natural-key unique indexes + session structure coachingScript

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Content types, reference data, registry skeleton

**Files:**
- Create: `src/lib/curriculum/content/types.ts`
- Create: `src/lib/curriculum/content/reference.ts`
- Create: `src/lib/curriculum/content/index.ts`
- Test: `tests/unit/curriculum/registry.test.ts`

**Interfaces:**
- Consumes: schema `$type` shapes in `src/lib/db/schema/curriculum.ts:66-140` (skills) and `practice-planning.ts:81-218` (activities incl. `comprehensiveGuide`).
- Produces (used verbatim by Tasks 3–8):

```ts
// types.ts — every content item is keyed by slug; loaders resolve slugs → uuids.
export type DomainName = "technical" | "tactical" | "physical" | "psychological";

export interface DomainContent {
  name: DomainName;
  displayName: string;
  description: string;
  weightInOverall: string; // decimal as string, e.g. "0.25"
  sortOrder: number;
}

export interface StageContent {
  slug: string;
  name: string;
  ageMin: number;
  ageMax: number;
  description: string;
  sortOrder: number;
}

export interface SkillContent {
  slug: string;
  name: string;
  sport: string;                    // sport slug: "soccer" | "basketball" | "hockey" | "baseball"
  domain: DomainName;
  stage: string;                    // StageContent.slug
  description?: string;
  introductionAge?: number;
  assessmentMethod?: "observation" | "test" | "game" | "self_report";
  progressionLevels?: { 1: string; 2: string; 3: string; 4: string; 5: string };
  observableBehaviors?: string[];
  commonMistakes?: string[];
  coachingTips?: string[];
  tags?: string[];
  comprehensiveGuide?: unknown;     // matches skills.comprehensiveGuide $type; copy verbatim from source
  isCore?: boolean;
  sortOrder?: number;
}

export interface ActivityContent {
  slug: string;
  name: string;
  sport: string;
  activityType: string;             // matches activityTypeEnum values in practice-planning.ts
  difficulty: "beginner" | "intermediate" | "advanced";
  minPlayers: number;
  maxPlayers?: number;
  durationMinutes: number;
  skillsDeveloped?: string[];       // SKILL SLUGS — loader resolves to uuids
  setupInstructions?: string;
  howToPlay: string;
  coachingPoints?: string[];
  questionsToAsk?: string[];
  commonMistakes?: string[];
  variations?: { name: string; description: string; difficulty: string }[];
  makeEasier?: string;
  makeHarder?: string;
  equipmentNeeded?: string[];
  spaceRequired?: string;
  indoorSuitable?: boolean;
  appropriateStages?: string[];     // STAGE SLUGS — loader resolves
  tags?: string[];
  comprehensiveGuide?: unknown;     // matches activities.comprehensiveGuide $type
}

export interface SessionPlanContent {
  name: string;
  sport: string;
  stage?: string;
  durationMinutes: number;
  structure: {
    name: string; type: string; durationMinutes: number;
    description?: string; activitySuggestions?: string[]; coachingScript?: string;
  }[];
  coachingNotes?: string;
}

export interface CoachGuidanceContent {
  prompts: Record<string, unknown>[];     // rows shaped for coachPrompts insert (minus ids/org)
  resources: Record<string, unknown>[];
  principles: Record<string, unknown>[];
}

export interface CurriculumContent {
  domains: DomainContent[];
  stages: StageContent[];
  skills: SkillContent[];
  activities: ActivityContent[];
  sessionPlans: SessionPlanContent[];
  coachGuidance: CoachGuidanceContent;
}
```

- `index.ts` exports `export const CURRICULUM_CONTENT: CurriculumContent` assembling all modules, plus `export function validateRegistry(c: CurriculumContent): string[]` returning human-readable violations (empty = valid).

- [ ] **Step 1: Write the failing registry test**

```ts
// tests/unit/curriculum/registry.test.ts
import { describe, expect, it } from "vitest";
import { CURRICULUM_CONTENT, validateRegistry } from "@/lib/curriculum/content";

describe("curriculum registry", () => {
  it("has the four weighted domains and at least four stages", () => {
    expect(CURRICULUM_CONTENT.domains.map((d) => d.name).sort()).toEqual([
      "physical", "psychological", "tactical", "technical",
    ]);
    const weightSum = CURRICULUM_CONTENT.domains
      .reduce((s, d) => s + parseFloat(d.weightInOverall), 0);
    expect(weightSum).toBeCloseTo(1.0, 2);
    expect(CURRICULUM_CONTENT.stages.length).toBeGreaterThanOrEqual(4);
  });

  it("validates: unique slugs, resolvable references", () => {
    expect(validateRegistry(CURRICULUM_CONTENT)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/curriculum/registry.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement types.ts, reference.ts, index.ts**

`reference.ts`: transcribe the domain rows (names, display names, descriptions, weights — equal 0.25 unless the source says otherwise) and development stages **from the still-in-repo `src/lib/db/seed-curriculum.ts`** (read it; it is the gen-0 source of truth for reference data). Keep stage slugs exactly as that file creates them — coach UI may reference them.

`validateRegistry` checks: skill slugs unique per sport; activity slugs unique per sport; every `SkillContent.domain` ∈ domains; every `SkillContent.stage` ∈ stage slugs; every `ActivityContent.skillsDeveloped` entry resolves to a skill slug of the same sport; every `appropriateStages` entry resolves; session plan sports valid. Skills/activities/sessionPlans start as empty arrays (Tasks 3–7 fill them); `coachGuidance` starts `{prompts:[],resources:[],principles:[]}`.

- [ ] **Step 4: Run tests** → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit** — `feat(curriculum): content types, reference data, registry skeleton`

---

### Task 3: Soccer skills content (v2 + upgrade passes folded by slug)

**Files:**
- Create: `src/lib/curriculum/content/soccer/skills.ts`
- Modify: `src/lib/curriculum/content/index.ts` (register)
- Test: extend `tests/unit/curriculum/registry.test.ts`

**Interfaces:**
- Consumes: `SkillContent` (Task 2). Sources: `.superpowers/curriculum-recovery/seeds/curriculum-v2__soccer-skills.ts` (13 skills, canonical) and `curriculum-v2__soccer-skills-upgrade.ts` + `-2/-3/-4` (comprehensiveGuide payloads keyed by hardcoded UUID + a human-readable name in each block).
- Produces: `export const SOCCER_SKILLS: SkillContent[]` (length 13, domain split 5/3/2/3).

- [ ] **Step 1: Extend the registry test (failing)**

```ts
it("soccer skills: 13 with the 5/3/2/3 domain split, all with comprehensive guides", () => {
  const s = CURRICULUM_CONTENT.skills.filter((k) => k.sport === "soccer");
  expect(s).toHaveLength(13);
  const byDomain = Object.fromEntries(
    (["technical", "tactical", "physical", "psychological"] as const)
      .map((d) => [d, s.filter((k) => k.domain === d).length]),
  );
  expect(byDomain).toEqual({ technical: 5, tactical: 3, physical: 2, psychological: 3 });
  expect(s.every((k) => k.comprehensiveGuide != null)).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL** (0 soccer skills).

- [ ] **Step 3: Author `soccer/skills.ts`**

Transcribe all 13 skills from `curriculum-v2__soccer-skills.ts` into `SkillContent` (slug/name/domain/stage/description/progressionLevels/observableBehaviors/commonMistakes/coachingTips/tags/comprehensiveGuide/introductionAge — copy content verbatim, adjusting only the container shape). Then fold the four upgrade files: each upgrade block names its target skill — match **by skill name (case-insensitive) or slug**, never by UUID; where an upgrade provides a richer `comprehensiveGuide` for a skill the v2 file also defines, THE UPGRADE WINS (it is the later pass). If an upgrade targets a skill name not among the 13 (i.e., a gen-0 skill like "Ball Mastery - Toe Taps"), add it as a new `SkillContent` — derive slug by kebab-casing the name, pick domain/stage from the upgrade payload's context or the nearest gen-0 definition in `src/lib/db/seed-curriculum.ts`. Update the count assertion if this yields >13 (adjust the test to the true number and note it in the report — the 13 is the v2 floor).

- [ ] **Step 4: Run tests** → PASS (`registry` + soccer assertions; `validateRegistry` still `[]`). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `feat(curriculum): soccer skills content (v2 + upgrade passes)`

---

### Task 4: Soccer activities + session plans

**Files:**
- Create: `src/lib/curriculum/content/soccer/activities.ts`, `src/lib/curriculum/content/soccer/session-plans.ts`
- Modify: `src/lib/curriculum/content/index.ts`
- Test: extend `tests/unit/curriculum/registry.test.ts`

**Interfaces:**
- Consumes: `ActivityContent`, `SessionPlanContent`; soccer skill slugs (Task 3). Sources: `curriculum-v2__soccer-fundamentals-activities.ts` (2) + `-2.ts` (3) + `curriculum-v2__soccer-skill-building-activities.ts` (4) — 9 canonical; `activities-soccer.ts` (49 gen-1); `curriculum-v2__soccer-session-plans.ts` (4); `session-plan-library.ts` (15 gen-1 templates, soccer subset fills gaps). SKIP `activities-soccer-enhanced.ts` and `activities-comprehensive-example.ts` (orphaned drafts, per analysis).
- Produces: `SOCCER_ACTIVITIES: ActivityContent[]`, `SOCCER_SESSION_PLANS: SessionPlanContent[]`.

- [ ] **Step 1: Extend registry test (failing)**

```ts
it("soccer activities: v2 canonical + gen-1 fill, deduped by slug", () => {
  const a = CURRICULUM_CONTENT.activities.filter((x) => x.sport === "soccer");
  expect(a.length).toBeGreaterThanOrEqual(50); // 9 v2 + 49 gen-1 − overlaps
  const slugs = a.map((x) => x.slug);
  expect(new Set(slugs).size).toBe(slugs.length);
  // v2 marker: the comprehensive-guide generation is present
  expect(a.filter((x) => x.comprehensiveGuide != null).length).toBeGreaterThanOrEqual(9);
});

it("soccer session plans: at least the 4 v2 plans, segments carry coaching scripts", () => {
  const p = CURRICULUM_CONTENT.sessionPlans.filter((x) => x.sport === "soccer");
  expect(p.length).toBeGreaterThanOrEqual(4);
  expect(p.some((x) => x.structure.some((seg) => seg.coachingScript))).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Author both modules**

Dedupe rule: v2 wins on slug collision; note the analysis found v2 dodged v1 slugs with `-v2` suffixes (e.g. `shark-attack-v2` vs `shark-attack`) — where BOTH exist, keep the v2 one and RENAME its slug to the clean form (`shark-attack`), dropping the v1 duplicate; document each such rename in a `// consolidation:` comment. `skillsDeveloped` in gen-1 files reference skill UUIDs or names — map to Task 3 slugs by name; drop references that resolve to no known skill (log them in a comment block at the top of the file). Session plans: v2's 4 plans verbatim (with `coachingScript` per segment); from `session-plan-library.ts` add only soccer templates that don't duplicate a v2 plan by name.

- [ ] **Step 4: Run tests** → PASS incl. `validateRegistry` (this is what catches broken skill references). tsc clean.

- [ ] **Step 5: Commit** — `feat(curriculum): soccer activities + session plans (v2 canonical, gen-1 fill)`

---

### Task 5: Basketball content

**Files:**
- Create: `src/lib/curriculum/content/basketball/{skills,activities,session-plans}.ts`
- Modify: `src/lib/curriculum/content/index.ts`
- Test: extend `tests/unit/curriculum/registry.test.ts`

**Interfaces:** same patterns as Tasks 3–4. Sources: `curriculum-v2__basketball-skills.ts` (13, 5/3/2/3), `curriculum-v2__basketball-skills-upgrade.ts` + `-2.ts` (fold by name/slug), `curriculum-v2__basketball-fundamentals-activities.ts` (5), `activities-basketball.ts` (49 gen-1), basketball subset of `session-plan-library.ts`.

- [ ] **Step 1: Failing assertions** — mirror Task 3/4's test blocks with sport `"basketball"`: 13+ skills at 5/3/2/3 (floor), ≥50 activities deduped, ≥1 session plan (gen-1 only — if the library has no basketball templates, assert ≥0 and note it).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Author the three modules** (same dedupe/fold rules as Tasks 3–4).
- [ ] **Step 4: Tests PASS + tsc clean.**
- [ ] **Step 5: Commit** — `feat(curriculum): basketball content`

---

### Task 6: Hockey + baseball skills

**Files:**
- Create: `src/lib/curriculum/content/hockey/skills.ts`, `src/lib/curriculum/content/baseball/skills.ts`
- Modify: `src/lib/curriculum/content/index.ts`
- Test: extend `tests/unit/curriculum/registry.test.ts`

**Interfaces:** Sources: `curriculum-v2__hockey-skills.ts` (13, 5/3/2/3); `curriculum-v2__baseball-skills-upgrade.ts` (baseball has ONLY an upgrade file — reconstruct full `SkillContent` rows from its payloads + any baseball rows in `src/lib/db/seed-curriculum.ts`; count = however many the sources define, assert the true number).

- [ ] **Step 1: Failing assertions** — hockey: exactly 13 at 5/3/2/3. Baseball: `expect(baseball.length).toBeGreaterThanOrEqual(1)` plus unique-slug/valid-domain checks via `validateRegistry`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Author both modules.** No hockey/baseball activities exist — do NOT invent any (Refinery backlog, per spec §8).
- [ ] **Step 4: Tests PASS + tsc clean.**
- [ ] **Step 5: Commit** — `feat(curriculum): hockey + baseball skills`

---

### Task 7: Coach guidance content

**Files:**
- Create: `src/lib/curriculum/content/coach-guidance.ts`
- Modify: `src/lib/curriculum/content/index.ts`
- Test: extend `tests/unit/curriculum/registry.test.ts`

**Interfaces:** Sources: `coach-prompts.ts`, `coach-resources.ts`, `coach-training-modules.ts` (recovered). Target tables (LIVE, currently empty — see `src/lib/db/schema/coach-guidance.ts` and consumers `src/pages/api/coach/prompts/index.ts`, `/prompts/principles.ts`, `/resources/index.ts`): shape each row to the CURRENT column names (read the schema first; do not assume the old seeds' field names survived — the analysis found no drift, but verify per-column as you transcribe).
- Produces: `COACH_GUIDANCE: CoachGuidanceContent` with non-empty prompts/resources/principles.

- [ ] **Step 1: Failing assertion** — `expect(CURRICULUM_CONTENT.coachGuidance.prompts.length).toBeGreaterThan(0)` (same for resources, principles).
- [ ] **Step 2–4: Author, tests PASS, tsc clean.**
- [ ] **Step 5: Commit** — `feat(curriculum): coach guidance content (prompts, resources, principles)`

---

### Task 8: The loader

**Files:**
- Create: `scripts/curriculum-load.ts`
- Create: `src/lib/curriculum/load-helpers.ts` (pure, unit-testable)
- Modify: `package.json` (script: `"curriculum:load": "tsx scripts/curriculum-load.ts"` — match how `db:migrate`/seed scripts are wired; read package.json first)
- Test: `tests/unit/curriculum/load-helpers.test.ts`

**Interfaces:**
- Consumes: `CURRICULUM_CONTENT`, `validateRegistry` (Task 2); unique indexes (Task 1).
- Produces:
  - `load-helpers.ts`: `planUpserts(content: CurriculumContent, existing: ExistingRows): UpsertPlan` — pure diff producing `{ table, adds: n, updates: n, unchanged: n, rows }` per table, where `ExistingRows` carries current rows keyed by natural key. This is what unit tests exercise.
  - `scripts/curriculum-load.ts` CLI: `--org <slug>` (required; resolves organization by slug), `--dry-run` (prints the report, writes nothing), env guards `ALLOW_CURRICULUM_SEED=yes` required always, plus `ALLOW_PROD_AUDIT=yes` when `DATABASE_URL` does not contain "staging" (mirror the guard style in the recovered `.superpowers/curriculum-recovery/scripts/curriculum-day0-seed.ts` and the repo's `src/lib/db/seeds/seed-e2e-tests.ts` staging check).

- [ ] **Step 1: Failing unit tests for the diff helper**

```ts
// tests/unit/curriculum/load-helpers.test.ts
import { describe, expect, it } from "vitest";
import { planUpserts } from "@/lib/curriculum/load-helpers";
import { CURRICULUM_CONTENT } from "@/lib/curriculum/content";

const EMPTY = { domains: [], stages: [], skills: [], activities: [], templates: [], prompts: [], resources: [], principles: [] };

describe("planUpserts", () => {
  it("plans pure adds against an empty database", () => {
    const plan = planUpserts(CURRICULUM_CONTENT, EMPTY);
    expect(plan.skills.adds).toBe(CURRICULUM_CONTENT.skills.length);
    expect(plan.skills.updates).toBe(0);
    expect(plan.domains.adds).toBe(4);
  });

  it("is idempotent: planning against its own output yields zero adds", () => {
    const first = planUpserts(CURRICULUM_CONTENT, EMPTY);
    const asExisting = simulateApplied(first); // helper in the test file: converts plan rows to ExistingRows
    const second = planUpserts(CURRICULUM_CONTENT, asExisting);
    expect(second.skills.adds).toBe(0);
    expect(second.activities.adds).toBe(0);
    expect(second.skills.unchanged).toBe(CURRICULUM_CONTENT.skills.length);
  });
});
```

Write `simulateApplied` in the test file (maps plan rows back to the ExistingRows shape by natural key with identical content hashes).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `load-helpers.ts` + the CLI**

Load order and resolution in the CLI: (1) `validateRegistry` — abort on violations; (2) upsert `skill_domains` (on name) + `development_stages` (on slug) — platform-wide; (3) resolve org by `--org` slug (`orderBy(asc(organizations.createdAt))`); (4) upsert `sports` per (org, slug) for every sport in the content (create if missing, mirroring how `src/lib/db/seed-curriculum.ts` creates sports — read it); (5) skills upsert `onConflictDoUpdate` on `(sport_id, slug)` (resolve domain/stage ids from step 2); (6) activities upsert on `(sport_id, slug)` with `skillsDeveloped` slugs → skill uuids, `appropriateStages` → stage uuids; (7) practice_templates on `(sport_id, name)`; (8) coach guidance on the Task 1 natural keys. Update comparison: `updates` only when content differs (deep-compare the writable columns), else `unchanged`. Dry-run prints a per-table report table and exits 0 without opening a write transaction.

- [ ] **Step 4: Tests PASS + tsc clean.** Do NOT run the CLI against any database.

- [ ] **Step 5: Commit** — `feat(curriculum): idempotent content loader with dry-run report`

---

### Task 9: Assessment snapshot pipeline

**Files:**
- Create: `src/lib/curriculum/snapshots.ts`
- Modify: `src/pages/api/coach/assessments/index.ts` (hook after the insert at line ~251)
- Test: `tests/unit/curriculum/snapshots.test.ts` (math), `tests/api/coach/assessment-snapshots.test.ts` (written, NOT run — controller runs it)

**Interfaces:**
- Consumes: `playerAssessments` (columns: familyMemberId, skillId, seasonId nullable, level 1–5, assessedAt — `src/lib/db/schema/assessments.ts:60-84`), `skills.domainId`, `assessmentSnapshots` + Task 1's unique index.
- Produces: `recomputePlayerSnapshots(db, familyMemberId: string, seasonId: string | null): Promise<{ domainsWritten: number }>` and pure `computeDomainAverages(rows: { skillId: string; domainId: string; level: number; assessedAt: Date }[]): Map<domainId, { average: number; skillCount: number; assessmentCount: number }>` — latest assessment per skill wins (max assessedAt), average across skills per domain, 2-decimal rounding.

- [ ] **Step 1: Failing math tests**

```ts
// tests/unit/curriculum/snapshots.test.ts
import { describe, expect, it } from "vitest";
import { computeDomainAverages } from "@/lib/curriculum/snapshots";

const d1 = "domain-1", d2 = "domain-2";
const at = (s: string) => new Date(s);

describe("computeDomainAverages", () => {
  it("uses only the latest assessment per skill", () => {
    const out = computeDomainAverages([
      { skillId: "s1", domainId: d1, level: 2, assessedAt: at("2026-06-01") },
      { skillId: "s1", domainId: d1, level: 4, assessedAt: at("2026-07-01") }, // latest wins
      { skillId: "s2", domainId: d1, level: 3, assessedAt: at("2026-06-15") },
    ]);
    expect(out.get(d1)).toEqual({ average: 3.5, skillCount: 2, assessmentCount: 3 });
  });

  it("keeps domains independent and rounds to 2dp", () => {
    const out = computeDomainAverages([
      { skillId: "a", domainId: d1, level: 5, assessedAt: at("2026-06-01") },
      { skillId: "b", domainId: d2, level: 2, assessedAt: at("2026-06-01") },
      { skillId: "c", domainId: d2, level: 3, assessedAt: at("2026-06-01") },
      { skillId: "d", domainId: d2, level: 3, assessedAt: at("2026-06-01") },
    ]);
    expect(out.get(d1)!.average).toBe(5);
    expect(out.get(d2)!.average).toBe(2.67);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

`recomputePlayerSnapshots`: select assessments joined to `skills` for domainId, filtered `eq(familyMemberId)` and (`eq(seasonId)` or `isNull` matching the argument); run `computeDomainAverages`; for each domain upsert `assessment_snapshots` `onConflictDoUpdate` on the Task 1 index — setting `previousAverageLevel` to the pre-update `averageLevel` (read the existing row first in the same transaction), `trend` = "up" | "down" | "steady" (|Δ| < 0.25) | "new" (no prior row). NOTE: `seasonId` is nullable on assessments but NOT NULL on snapshots — when seasonId is null, skip the snapshot write and return `{domainsWritten: 0}` (document this; assessments recorded without a season don't chart until backfilled).

Hook in the assessments POST: after the insert succeeds, `await recomputePlayerSnapshots(db, familyMemberId, seasonId ?? null)` in a try/catch that logs and never fails the request (mirror how `apply.ts` treats side effects).

API test (written only): POST an assessment as coach@test.aspiresports.com for a seeded player, then read `assessment_snapshots` via `getDb()` asserting a row with the right domain average and `trend: "new"`; POST a second higher assessment for the same skill → assert `trend: "up"` and `previousAverageLevel` set.

- [ ] **Step 4: Unit tests PASS + tsc clean.**
- [ ] **Step 5: Commit** — `feat(curriculum): assessment snapshot pipeline (compute on write)`

---

### Task 10: Domain radar (spider chart) + page integration

**Files:**
- Create: `src/components/development/domain-radar.tsx`
- Create: `src/lib/curriculum/radar-geometry.ts` (pure)
- Modify: the parent development surface — read `src/pages/dashboard/children/[id]/development.astro` and its component (`src/components/dashboard/development-report.tsx`) first, mount the radar above the existing domain cards
- Modify: coach assessment detail — read `src/pages/coach/assess/[playerId].astro` + its component, mount the radar in the player header area
- Test: `tests/unit/curriculum/radar-geometry.test.ts`

**Interfaces:**
- Consumes: snapshot rows (Task 9) — whatever API each page already uses to fetch domain data; extend those endpoints to include snapshots if they don't already (read `src/pages/api/dashboard/` + `/api/coach/players/[playerId]/assessments.ts` first and extend the existing payloads rather than adding new endpoints).
- Produces:

```ts
// radar-geometry.ts
export interface RadarAxis { label: string; current: number; previous?: number }
/** Points for an N-axis radar polygon on a viewBox of size `size`, values scaled 0..max. */
export function radarPoints(values: number[], max: number, size: number): [number, number][];
```

```tsx
// domain-radar.tsx — props
export interface DomainRadarProps {
  axes: RadarAxis[];   // one per domain, label = skill_domains display name
  max?: number;        // default 5
  size?: number;       // default 240 (viewBox units; scales via CSS)
}
```

- [ ] **Step 1: Failing geometry tests**

```ts
import { describe, expect, it } from "vitest";
import { radarPoints } from "@/lib/curriculum/radar-geometry";

describe("radarPoints", () => {
  it("places a full-scale 4-axis polygon at the cardinal points", () => {
    const pts = radarPoints([5, 5, 5, 5], 5, 200);
    // axis 0 points straight up from center (100,100)
    expect(pts[0][0]).toBeCloseTo(100, 5);
    expect(pts[0][1]).toBeCloseTo(0, 5);
    expect(pts).toHaveLength(4);
  });
  it("scales values linearly toward the center", () => {
    const pts = radarPoints([2.5, 0, 0, 0], 5, 200);
    expect(pts[0][1]).toBeCloseTo(50, 5); // halfway up
    expect(pts[1]).toEqual([100, 100]);   // zero sits at center
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement geometry + component**

`domain-radar.tsx`: pure SVG — concentric ring polygons at 1..max, axis spokes + labels, `previous` polygon (stroke only, dashed, muted) under `current` polygon (filled at ~25% opacity, 2px stroke). Colors via existing CSS tokens (`text-primary-orange`/ink tokens — read how `domain-progress-card.tsx` colors its SVG and reuse). Include an sr-only list: `${label}: ${current} of ${max}` per axis. Empty/insufficient data (fewer than 3 axes with values) → render the existing `EmptyState` with copy "No assessments yet — progress appears here after the first coach assessment."

Integrate into both pages per the Files block; if a page's data source lacks snapshots, extend its existing endpoint's payload (include `snapshots: { domain: string; averageLevel: number; previousAverageLevel: number | null }[]`).

- [ ] **Step 4: Unit tests PASS + tsc clean.** (Browser verification is the controller's, Task 11.)
- [ ] **Step 5: Commit** — `feat(development): domain radar on parent + coach surfaces`

---

### Task 11: E2E fixture + spec, then controller verification & rollout

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts` (minimal curriculum fixture)
- Create: `tests/e2e/development-radar.spec.ts`

- [ ] **Step 1: Seed fixture (implementer)** — idempotently ensure: the 4 domains + ≥1 stage exist (insert by name/slug, mirroring the loader's upsert semantics); one skill per domain for soccer (`e2e-<domain>-skill` slugs, isTest-neutral platform rows are fine — they're reference data); assessments for the existing seeded child player (Tommy — find him in the seed) across all four skills at levels 4/3/2/3 in the seeded season; then call `recomputePlayerSnapshots` from the seed so snapshots exist.

- [ ] **Step 2: E2E spec (implementer, not run)**

```ts
// tests/e2e/development-radar.spec.ts
import { test, expect } from "@playwright/test";
import { waitForHydration, signIn } from "../utils/test-helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

test("parent sees the domain radar on the child development page", async ({ page }) => {
  await signIn(page, "parent@test.aspiresports.com", "TestParent123!");
  await page.goto(`${BASE}/dashboard/family`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  // navigate to first child's development page via UI link
  await page.getByRole("link", { name: /development/i }).first().click();
  await expect(page.locator("svg[data-radar]")).toBeVisible({ timeout: 10_000 });
});
```

(Confirm `signIn` exists in `tests/utils/test-helpers.ts` — CLAUDE.md lists it; add `data-radar` attr to the component's root svg in Task 10 if not already there — it is required by this spec, so add it in Task 10.)

- [ ] **Step 3 (CONTROLLER ONLY): full verification + rollout sequence**

1. `npx tsc --noEmit`, full `npx vitest run tests/unit`, `./scripts/with-bws.sh npm run build`.
2. `./scripts/with-bws.sh npm run db:migrate` — staging (user-approved), then re-seed e2e.
3. Loader dry-run: `ALLOW_CURRICULUM_SEED=yes ./scripts/with-bws.sh npx tsx scripts/curriculum-load.ts --org aspire-sports --dry-run` → present report → load staging (drop `--dry-run`).
4. Dev server up; run API suites (`tests/api/coach/`, new snapshot test); verify coach portal shows curriculum content in browser; record an assessment as coach; verify parent radar renders.
5. Run the new e2e spec locally.
6. Spec §5 loop walk; fix breakages found.
7. PR → CI green → user merges → prod migration runs automatically; prod content load (`ALLOW_PROD_AUDIT=yes`, user-approved) → verify prod coach portal.

---

## Self-review notes

- Spec §1–§6 all covered (Tasks 2–7 = §1; 1+8 = §2; 9 = §3; 10 = §4; 11 = §5/§6). §7 exclusions respected (no achievements, no new comms). §8 untouched (separate spec).
- Counts are floors where upgrade-folding may add rows (Tasks 3, 6) — tests assert the verified v2 numbers as minimums and implementers adjust to true totals with a report note.
- Coach-prompts natural key deliberately resolved inside Task 1 against the real schema (analysis confirmed tables exist; column-level key choice needs the file open).
