# Phase 3 — Season-Level Session-Plan Sequencing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins compose ordered "curriculum sequences" of practice templates, attach one to a season with a simple weekly recurrence, and every coached team in that season receives dated draft `session_plans` — pushing philosophy-aligned plans to coaches instead of waiting for them to pull.

**Architecture:** Two new tables (`curriculum_sequences`, `curriculum_sequence_entries`) layered on the existing `practice_templates` library, plus a nullable `curriculumSequenceId` pointer on `seasons`. Draft generation is a pure function (`src/lib/curriculum/sequence-instantiation.ts`) invoked by a thin admin endpoint at attach time; generated drafts are ordinary `session_plans` rows — indistinguishable from coach-created ones, so the whole existing coach edit/complete flow works unchanged. The coach practices overview derives a "Week N of M" progress strip by matching team plans' `templateId` against the attached sequence's entries.

**Tech Stack:** Existing stack only — Astro 5 + React 19, Drizzle/Postgres, Lucia auth, zod, Vitest, Playwright. No new dependencies (timezone math uses the built-in `Intl` API).

**Spec:** `docs/superpowers/plans/2026-07-06-coach-lifecycle-and-delivery-ops.md`, section "Phase 3 — Season-level session-plan sequencing (push, not pull)".

## Global Constraints

Copied from the program plan — every task's requirements implicitly include these:

- Schema changes go through `npm run db:generate` → commit migration → `db:migrate`; never `db:push` against remote DBs. Write migrations idempotently (`ADD COLUMN IF NOT EXISTS`, `DO $$ ... duplicate_object` guard).
- Every admin API endpoint validates tenant ownership via `requireSameOrg*` helpers (`src/lib/auth/require-resource-ownership.ts`).
- New tables follow the curriculum convention: nullable `organizationId` where NULL = global default, org rows override.
- Any `findFirst`/`.limit(1)` gets an explicit `orderBy` (shared CI database hazard). Exception: primary-key `eq` lookups return at most one row by construction (the existing `loadTemplateForOrg` pattern).
- All coach/admin pages are SSR (no `prerender = true`); UI states use `ErrorBanner` / `EmptyState` / `LoadingSkeleton` primitives from `src/components/ui/`.
- New timestamps in UTC, displayed in org timezone (`organizations.timezone`, default `America/New_York`).
- E2E specs run post-merge only (`test-full`) — grep `tests/e2e/` for affected surfaces before merging route changes (done in Task 10).
- This phase runs in a worktree (≥3 tasks, subagent-driven). Create it via `superpowers:using-git-worktrees` BEFORE the first edit. **Every subagent dispatch must use absolute worktree paths** — subagents otherwise pin to the main checkout and commits drift to `main`.
- Scope explicitly OUT (do not build): auto-sync with `games`/venue scheduling; per-player differentiation within a plan; camp daily-theme scheduling; regeneration when rosters change.

## Context for the implementer (read once, zero-context primer)

- **`practice_templates`** (`src/lib/db/schema/practice-planning.ts`): the reusable session library. Columns you'll consume: `id`, `organizationId` (null = global), `sportId`, `stageId`, `name`, `totalDurationMinutes`, `structure` (jsonb array of `{name, type, durationMinutes, description?, activitySuggestions?, coachingScript?}`), `equipmentNeeded` (jsonb string[]), `focusSkillIds` (uuid[]). Natural key: unique `(sportId, name)`.
- **`session_plans`** (same file): per-team dated practice plans. `teamId` NOT NULL, `templateId` nullable (FK `set null`), `coachUserId` NOT NULL, `title`, `scheduledDate` (timestamp, UTC), `durationMinutes`, `status` enum (`draft|planned|in_progress|completed|cancelled`), `segments` jsonb (`{order, name, type, durationMinutes, activityId?, activityName?, notes?}[]`), `objectives` jsonb string[], `equipmentNeeded`, `focusSkillIds`, `preSessionNotes`. **This table is NOT modified in this phase** — generated drafts must be indistinguishable from coach-created plans.
- **`seasons`** (`src/lib/db/schema/programs.ts`): has `startDate`/`endDate` as `date` columns (Drizzle returns them as `"YYYY-MM-DD"` strings). Tenant chain: seasons → programs → locations → organizations.
- **`teams`** (`src/lib/db/schema/teams.ts`): `seasonId` NOT NULL, `coachUserId` **nullable**, `assistantCoachUserId` nullable.
- **Auth:** `requireOrgAdminAccess(context)` from `@/lib/auth` returns `{ authorized: true, organizationId, roles }` or `{ authorized: false, response }`. Tenant helpers (`requireSameOrgSeason`, `requireSameOrgSport`, `ownershipDeniedResponse`) live in `src/lib/auth/require-resource-ownership.ts` and return 404 for cross-tenant ids (deliberately conflated with "not found").
- **Coach access model:** coach endpoints (see `src/pages/api/coach/sessions/index.ts`) authorize by `teams.coachUserId === user.id OR teams.assistantCoachUserId === user.id` — no org pivot.
- **Admin curriculum CRUD pattern to mirror:** `src/pages/api/admin/curriculum/templates/index.ts` and `[id].ts` (org-or-global read scoping, super_admin-only mutation of global rows, zod validation, 23503/23505 error mapping).
- **Content-as-code:** curriculum content lives in `src/lib/curriculum/content/` keyed by natural keys (never uuids) and is loaded per-org by `scripts/curriculum-load.ts` (`applyTemplates` upserts `practice_templates` on the `(sportId, name)` natural key). `src/lib/db/seed-curriculum.ts` seeds only reference tables (stages/domains/skills) and never touches templates — which is why the reference sequences seed in Task 9 extends `scripts/curriculum-load.ts`, not `seed-curriculum.ts`.
- **Tests:** `tests/unit/` = pure functions, run `npm run test:unit` (no server). `tests/api/` = HTTP against a running dev server, run `npm run test:api` (start the server first with `E2E_TEST_ENDPOINTS=yes npm run dev:bws` — without that flag the `/api/test/org-fixtures` endpoint 404s). Test admin account: `admin@test.aspiresports.com` / `TestAdmin123!` (helpers handle sign-in). Coach: `coach@test.aspiresports.com` / `TestCoach123!` via `getCoachCookie()`.
- **Migrations:** latest committed migration on `main` at plan-writing time is `0062_spotty_next_avengers.sql`. **Migrations 0063 and 0064 exist on a parallel in-flight branch (Phase 1).** See Task 1 Step 4.

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/db/schema/curriculum-sequences.ts` | Create | `curriculum_sequences` + `curriculum_sequence_entries` tables, enum, relations, types |
| `src/lib/db/schema/programs.ts` | Modify | nullable `curriculumSequenceId` column on `seasons` |
| `src/lib/db/schema/index.ts` | Modify | export the new schema module |
| `src/lib/db/migrations/NNNN_curriculum_sequences.sql` | Create (generated, then hand-idempotized) | DDL |
| `src/lib/curriculum/sequence-instantiation.ts` | Create | pure functions: date generation, draft building, progress computation |
| `src/lib/curriculum/sequence-ownership.ts` | Create | `loadSequenceForOrg` tenant helper shared by the sequence endpoints |
| `src/pages/api/admin/curriculum/sequences/index.ts` | Create | GET list / POST create |
| `src/pages/api/admin/curriculum/sequences/[id].ts` | Create | GET detail / PUT update / DELETE |
| `src/pages/api/admin/curriculum/sequences/[id]/entries.ts` | Create | PUT replace-all ordered entries |
| `src/pages/api/admin/curriculum/sequences/[id]/attach.ts` | Create | POST attach-to-season + generate drafts |
| `src/pages/api/admin/curriculum/sequences/[id]/detach.ts` | Create | POST detach (drafts untouched) |
| `src/pages/api/admin/curriculum/templates/[id].ts` | Modify | DELETE 23503 message now mentions sequences |
| `src/pages/admin/curriculum/sequences.astro` | Create | SSR admin page shell |
| `src/components/admin/sequence-editor.tsx` | Create | admin authoring UI (list/create/entries/attach) |
| `src/components/admin/curriculum-manager.tsx` | Modify | add "Sequences" section card |
| `src/pages/api/coach/sessions/index.ts` | Modify | add `sequenceProgress` to GET response |
| `src/components/coach/practices-overview.tsx` | Modify | sequence-progress strip |
| `src/lib/curriculum/content/types.ts` | Modify | `SequenceContent` / `SequenceEntryContent` types |
| `src/lib/curriculum/content/sequences.ts` | Create | `REFERENCE_SEQUENCES` + `validateSequences` |
| `scripts/curriculum-load.ts` | Modify | `applySequences` loader step |
| `tests/unit/sequence-instantiation.test.ts` | Create | unit tests for the pure functions |
| `tests/unit/curriculum-sequences-content.test.ts` | Create | reference-sequence content validation |
| `tests/api/admin/curriculum-sequences.test.ts` | Create | CRUD + tenancy + attach/detach API tests |

---

### Task 1: Schema — sequences tables, seasons pointer, idempotent migration

**Files:**
- Create: `src/lib/db/schema/curriculum-sequences.ts`
- Modify: `src/lib/db/schema/programs.ts` (seasons table, after the `settings` column, ~line 137)
- Modify: `src/lib/db/schema/index.ts` (after the `./practice-planning` export, line 15)
- Create: `src/lib/db/migrations/NNNN_curriculum_sequences.sql` (via `db:generate`, then hand-edited)

**Interfaces:**
- Consumes: existing tables `organizations`, `sports`, `developmentStages`, `practiceTemplates`.
- Produces (later tasks import these from `@/lib/db/schema`): `curriculumSequences`, `curriculumSequenceEntries`, `curriculumProgramTypeEnum`, types `CurriculumSequence`, `NewCurriculumSequence`, `CurriculumSequenceEntry`, `NewCurriculumSequenceEntry`; column `seasons.curriculumSequenceId: string | null`.

- [ ] **Step 1: Write the schema module**

Create `src/lib/db/schema/curriculum-sequences.ts`:

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { sports } from "./sports";
import { developmentStages } from "./curriculum";
import { practiceTemplates } from "./practice-planning";

// Which delivery format a sequence is authored for. Deliberately a NEW enum
// (not the existing `program_type` on programs) — that one has no 'class'
// value and carries 'tournament'/'training' which make no sense here.
export const curriculumProgramTypeEnum = pgEnum("curriculum_program_type", [
  "league",
  "class",
  "camp",
  "clinic",
]);

// An ordered season-long arc of practice templates ("Week 1: dribbling,
// Week 2: passing, …"). null organizationId = global default, org rows
// override — same convention as practice_templates.
export const curriculumSequences = pgTable(
  "curriculum_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }), // null = global sequence
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "cascade" }),
    developmentStageId: uuid("development_stage_id")
      .notNull()
      .references(() => developmentStages.id, { onDelete: "restrict" }),
    programType: curriculumProgramTypeEnum("program_type")
      .default("league")
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Natural key for the idempotent curriculum loader (Task 9), mirroring
    // practice_templates_sport_name_uniq.
    uniqueIndex("curriculum_sequences_sport_name_uniq").on(
      table.sportId,
      table.name,
    ),
    index("curriculum_sequences_org_idx").on(table.organizationId),
  ],
);

export const curriculumSequenceEntries = pgTable(
  "curriculum_sequence_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => curriculumSequences.id, { onDelete: "cascade" }),
    position: integer("position").notNull(), // 1..N — entry N maps to the Nth practice date
    // restrict (not cascade): deleting a template that a sequence still uses
    // must fail loudly; the admin removes it from the sequence first. The
    // templates DELETE endpoint maps the 23503 to a friendly 400 (Task 5).
    templateId: uuid("template_id")
      .notNull()
      .references(() => practiceTemplates.id, { onDelete: "restrict" }),
    objectives: jsonb("objectives").$type<string[]>(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("curriculum_sequence_entries_seq_position_uniq").on(
      table.sequenceId,
      table.position,
    ),
  ],
);

// Relations
export const curriculumSequencesRelations = relations(
  curriculumSequences,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [curriculumSequences.organizationId],
      references: [organizations.id],
    }),
    sport: one(sports, {
      fields: [curriculumSequences.sportId],
      references: [sports.id],
    }),
    stage: one(developmentStages, {
      fields: [curriculumSequences.developmentStageId],
      references: [developmentStages.id],
    }),
    entries: many(curriculumSequenceEntries),
  }),
);

export const curriculumSequenceEntriesRelations = relations(
  curriculumSequenceEntries,
  ({ one }) => ({
    sequence: one(curriculumSequences, {
      fields: [curriculumSequenceEntries.sequenceId],
      references: [curriculumSequences.id],
    }),
    template: one(practiceTemplates, {
      fields: [curriculumSequenceEntries.templateId],
      references: [practiceTemplates.id],
    }),
  }),
);

// Type exports
export type CurriculumSequence = typeof curriculumSequences.$inferSelect;
export type NewCurriculumSequence = typeof curriculumSequences.$inferInsert;
export type CurriculumSequenceEntry =
  typeof curriculumSequenceEntries.$inferSelect;
export type NewCurriculumSequenceEntry =
  typeof curriculumSequenceEntries.$inferInsert;
```

- [ ] **Step 2: Add the seasons column and the schema export**

In `src/lib/db/schema/programs.ts`, inside the `seasons` table definition, insert directly above the line `settings: jsonb("settings"),` (~line 137):

```typescript
    // Phase 3 (curriculum sequencing): optional pointer to the curriculum
    // sequence attached to this season. Declared WITHOUT .references() to
    // avoid a circular module import (programs -> curriculum-sequences ->
    // practice-planning -> teams -> programs); the FK constraint
    // (ON DELETE SET NULL) is added by hand in the migration instead, so
    // deleting a sequence nulls this pointer while generated drafts —
    // which have no FK to sequences at all — are untouched.
    curriculumSequenceId: uuid("curriculum_sequence_id"),
```

In `src/lib/db/schema/index.ts`, after `export * from "./practice-planning";` (line 15), add:

```typescript
export * from "./curriculum-sequences";
```

- [ ] **Step 3: Type-check to verify the schema compiles**

Run: `npx tsc --noEmit`
Expected: zero errors (the pre-existing baseline is zero — keep it that way).

- [ ] **Step 4: Generate the migration — CHECK NUMBERING FIRST**

**Migrations 0063 and 0064 exist on a parallel in-flight branch (Phase 1 of this program).** Before generating:

1. Run `ls src/lib/db/migrations/*.sql | tail -3` and check the current highest number **at implementation time**.
2. If Phase 1 has merged to `main` since this plan was written, **rebase this worktree's branch onto latest `main` first** (`git fetch origin && git rebase origin/main`) so `db:generate` numbers the new migration after Phase 1's 0063/0064 rather than colliding with them.
3. Then run: `npm run db:generate`

Expected: a new file `src/lib/db/migrations/NNNN_<random_name>.sql` (NNNN = highest existing + 1) plus an updated `src/lib/db/migrations/meta/_journal.json` entry.

- [ ] **Step 5: Rewrite the generated migration idempotently and add the hand-written seasons FK**

Replace the generated SQL file's entire contents with the following (pattern from `0023`/`0024`; keep the generated filename). Drizzle will have generated non-idempotent `CREATE TYPE`/`CREATE TABLE`/`ALTER TABLE` statements and it will NOT have generated the `seasons` FK (the column has no `.references()` in the schema — see Step 2 comment):

```sql
DO $$ BEGIN CREATE TYPE "public"."curriculum_program_type" AS ENUM('league', 'class', 'camp', 'clinic'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"sport_id" uuid NOT NULL,
	"development_stage_id" uuid NOT NULL,
	"program_type" "curriculum_program_type" DEFAULT 'league' NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_sequence_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"template_id" uuid NOT NULL,
	"objectives" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "curriculum_sequence_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_sequences" ADD CONSTRAINT "curriculum_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_sequences" ADD CONSTRAINT "curriculum_sequences_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_sequences" ADD CONSTRAINT "curriculum_sequences_development_stage_id_development_stages_id_fk" FOREIGN KEY ("development_stage_id") REFERENCES "public"."development_stages"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_sequence_entries" ADD CONSTRAINT "curriculum_sequence_entries_sequence_id_curriculum_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."curriculum_sequences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_sequence_entries" ADD CONSTRAINT "curriculum_sequence_entries_template_id_practice_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."practice_templates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
-- HAND-WRITTEN (drizzle does not know about this FK — seasons.curriculum_sequence_id
-- is declared without .references() in programs.ts to break a circular module
-- import). ON DELETE SET NULL: deleting a sequence detaches it from seasons;
-- generated drafts have no FK to sequences and are untouched by design.
DO $$ BEGIN
 ALTER TABLE "seasons" ADD CONSTRAINT "seasons_curriculum_sequence_id_curriculum_sequences_id_fk" FOREIGN KEY ("curriculum_sequence_id") REFERENCES "public"."curriculum_sequences"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_sequences_sport_name_uniq" ON "curriculum_sequences" USING btree ("sport_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curriculum_sequences_org_idx" ON "curriculum_sequences" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_sequence_entries_seq_position_uniq" ON "curriculum_sequence_entries" USING btree ("sequence_id","position");
```

Compare against what drizzle generated before overwriting — if drizzle emitted anything extra (e.g. it detected unrelated drift), STOP and investigate rather than deleting statements you don't understand.

- [ ] **Step 6: Apply to the staging database (dev server DB)**

The API tests in Tasks 4–6 hit the dev server, which points at the staging Railway DB — the new tables must exist there.

Run: `./scripts/with-bws.sh npm run db:migrate`
Expected: migration applies cleanly, output ends without error. Re-run it once more to prove idempotency: second run must also succeed (all guards no-op).

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema/curriculum-sequences.ts src/lib/db/schema/programs.ts src/lib/db/schema/index.ts src/lib/db/migrations/
git commit -m "feat(curriculum): curriculum_sequences schema + seasons pointer (Phase 3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 2: Pure date generation — `generatePracticeDates` (DST-safe)

**Files:**
- Create: `src/lib/curriculum/sequence-instantiation.ts`
- Test: `tests/unit/sequence-instantiation.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (pure, no DB).
- Produces (Task 6 endpoint and Task 3 both build on these exact signatures):
  - `interface RecurrenceInput { startDate: string; weekday: number; count: number; timeOfDay: string; timezone: string }`
  - `generatePracticeDates(recurrence: RecurrenceInput, seasonEndDate?: string): { dates: Date[]; truncatedBySeasonEnd: boolean }`
  - `zonedDateTimeToUtc(dateISO: string, timeHHMM: string, timeZone: string): Date`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/sequence-instantiation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  generatePracticeDates,
  zonedDateTimeToUtc,
} from "@/lib/curriculum/sequence-instantiation";

// 2026 DST facts (America/New_York): spring forward Sun 2026-03-08 (EST→EDT),
// fall back Sun 2026-11-01 (EDT→EST). 2026-03-01 and 2026-10-25 are Sundays.

describe("zonedDateTimeToUtc", () => {
  it("converts an EST wall time to the correct UTC instant", () => {
    expect(
      zonedDateTimeToUtc("2026-03-01", "09:00", "America/New_York").toISOString(),
    ).toBe("2026-03-01T14:00:00.000Z"); // UTC-5
  });

  it("converts an EDT wall time to the correct UTC instant", () => {
    expect(
      zonedDateTimeToUtc("2026-03-08", "09:00", "America/New_York").toISOString(),
    ).toBe("2026-03-08T13:00:00.000Z"); // UTC-4 (DST began 2am that morning)
  });
});

describe("generatePracticeDates", () => {
  const base = {
    startDate: "2026-03-01", // a Sunday
    weekday: 0, // Sunday
    timeOfDay: "09:00",
    timezone: "America/New_York",
  };

  it("keeps the local wall-clock time across a spring-forward DST boundary", () => {
    const { dates, truncatedBySeasonEnd } = generatePracticeDates({
      ...base,
      count: 3,
    });
    expect(truncatedBySeasonEnd).toBe(false);
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-03-01T14:00:00.000Z", // EST, UTC-5
      "2026-03-08T13:00:00.000Z", // EDT, UTC-4 — naive +7*24h math would say 14:00Z
      "2026-03-15T13:00:00.000Z",
    ]);
  });

  it("keeps the local wall-clock time across a fall-back DST boundary", () => {
    const { dates } = generatePracticeDates({
      ...base,
      startDate: "2026-10-25", // a Sunday, still EDT
      count: 2,
    });
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-10-25T13:00:00.000Z", // EDT
      "2026-11-01T14:00:00.000Z", // EST — fell back that morning
    ]);
  });

  it("advances startDate forward to the requested weekday when they disagree", () => {
    const { dates } = generatePracticeDates({
      ...base,
      startDate: "2026-03-02", // a Monday
      weekday: 3, // Wednesday
      count: 1,
    });
    expect(dates[0].toISOString()).toBe("2026-03-04T14:00:00.000Z");
  });

  it("truncates when count asks for more weeks than the season has left", () => {
    const { dates, truncatedBySeasonEnd } = generatePracticeDates(
      { ...base, count: 5 },
      "2026-03-10", // season ends before the 3rd Sunday
    );
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-03-01T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
    ]);
    expect(truncatedBySeasonEnd).toBe(true);
  });

  it("allows a practice ON the season end date (inclusive)", () => {
    const { dates, truncatedBySeasonEnd } = generatePracticeDates(
      { ...base, count: 2 },
      "2026-03-08",
    );
    expect(dates).toHaveLength(2);
    expect(truncatedBySeasonEnd).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/sequence-instantiation.test.ts`
Expected: FAIL — `Cannot find module '@/lib/curriculum/sequence-instantiation'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `src/lib/curriculum/sequence-instantiation.ts`:

```typescript
/**
 * Pure functions for instantiating a curriculum sequence into dated draft
 * session_plans (Phase 3). No DB access anywhere in this module — the thin
 * attach endpoint (api/admin/curriculum/sequences/[id]/attach.ts) queries
 * rows and feeds them in, which is what makes this unit-testable.
 *
 * Timezone handling: practice times are org-local wall-clock times
 * ("Saturdays 9am") but session_plans.scheduledDate stores UTC instants.
 * Weekly repetition must repeat the WALL TIME, not the UTC instant —
 * naive `+7 * 24h` drifts by an hour across DST boundaries. We resolve
 * each local date+time to UTC individually via Intl (no tz library needed).
 */

export interface RecurrenceInput {
  /** "YYYY-MM-DD", org-local. First candidate date; advanced forward to
   * `weekday` when it doesn't already fall on it. */
  startDate: string;
  /** 0 (Sunday) … 6 (Saturday) — matches JS Date#getUTCDay. */
  weekday: number;
  /** Requested number of practices. Callers cap it at the sequence's entry
   * count before calling (the attach endpoint does `Math.min(count, entries.length)`). */
  count: number;
  /** "HH:MM" 24-hour, org-local wall time. */
  timeOfDay: string;
  /** IANA zone, e.g. "America/New_York" (organizations.timezone). */
  timezone: string;
}

export interface GeneratedDates {
  /** UTC instants, ascending, one per practice. */
  dates: Date[];
  /** true when seasonEndDate cut generation short of `count`. */
  truncatedBySeasonEnd: boolean;
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24, // some ICU builds emit "24" for midnight
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** Resolve a zone-local calendar date + wall time to a UTC instant. */
export function zonedDateTimeToUtc(
  dateISO: string,
  timeHHMM: string,
  timeZone: string,
): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  // Two-pass offset resolution: guess with the offset at the naive instant,
  // then re-resolve at the corrected instant — handles DST-boundary days.
  const guessOffset = tzOffsetMs(new Date(naiveUtc), timeZone);
  const finalOffset = tzOffsetMs(new Date(naiveUtc - guessOffset), timeZone);
  return new Date(naiveUtc - finalOffset);
}

export function generatePracticeDates(
  recurrence: RecurrenceInput,
  /** "YYYY-MM-DD" — no practices are generated after this local date (inclusive allowed). */
  seasonEndDate?: string,
): GeneratedDates {
  const [y, m, d] = recurrence.startDate.split("-").map(Number);
  // Calendar-day arithmetic in UTC space — immune to the host machine's zone.
  const cursor = new Date(Date.UTC(y, m - 1, d));
  const advance = (recurrence.weekday - cursor.getUTCDay() + 7) % 7;
  cursor.setUTCDate(cursor.getUTCDate() + advance);

  const dates: Date[] = [];
  let truncatedBySeasonEnd = false;
  for (let i = 0; i < recurrence.count; i++) {
    const dateISO = cursor.toISOString().slice(0, 10);
    if (seasonEndDate && dateISO > seasonEndDate) {
      // ISO date strings compare correctly lexicographically.
      truncatedBySeasonEnd = true;
      break;
    }
    dates.push(
      zonedDateTimeToUtc(dateISO, recurrence.timeOfDay, recurrence.timezone),
    );
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return { dates, truncatedBySeasonEnd };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/sequence-instantiation.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/curriculum/sequence-instantiation.ts tests/unit/sequence-instantiation.test.ts
git commit -m "feat(curriculum): DST-safe practice date generation for sequences

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Pure draft building — `buildDraftSessionPlans`

**Files:**
- Modify: `src/lib/curriculum/sequence-instantiation.ts` (append)
- Test: `tests/unit/sequence-instantiation.test.ts` (append)

**Interfaces:**
- Consumes: `generatePracticeDates` output (`Date[]`).
- Produces (Task 6 inserts the return value into `session_plans` verbatim):
  - `interface SequenceEntryForBuild { position: number; templateId: string; objectives: string[] | null; notes: string | null }`
  - `interface TemplateForBuild { id: string; name: string; totalDurationMinutes: number; structure: TemplateSegment[] | null; equipmentNeeded: string[] | null; focusSkillIds: string[] | null }`
  - `buildDraftSessionPlans(input: BuildDraftsInput): DraftSessionPlan[]`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/sequence-instantiation.test.ts` (add `buildDraftSessionPlans` and the two input types to the existing import from `@/lib/curriculum/sequence-instantiation`):

```typescript
import {
  buildDraftSessionPlans,
  type SequenceEntryForBuild,
  type TemplateForBuild,
} from "@/lib/curriculum/sequence-instantiation";

describe("buildDraftSessionPlans", () => {
  const templateA: TemplateForBuild = {
    id: "tpl-a",
    name: "Dribbling Under Pressure",
    totalDurationMinutes: 60,
    structure: [
      { name: "Warmup", type: "warmup", durationMinutes: 10, description: "Free dribbling" },
      { name: "Main game", type: "technical", durationMinutes: 40 },
      { name: "Cooldown", type: "cooldown", durationMinutes: 10 },
    ],
    equipmentNeeded: ["cones", "balls"],
    focusSkillIds: ["skill-1"],
  };
  const templateB: TemplateForBuild = {
    id: "tpl-b",
    name: "First Passing Session",
    totalDurationMinutes: 45,
    structure: null,
    equipmentNeeded: null,
    focusSkillIds: null,
  };
  const entries: SequenceEntryForBuild[] = [
    { position: 2, templateId: "tpl-b", objectives: null, notes: null },
    { position: 1, templateId: "tpl-a", objectives: ["Keep the ball close"], notes: "Focus on the shy kids" },
  ];
  const templatesById = new Map([
    ["tpl-a", templateA],
    ["tpl-b", templateB],
  ]);
  const dates = [
    new Date("2026-09-05T13:00:00.000Z"),
    new Date("2026-09-12T13:00:00.000Z"),
  ];

  it("maps entry N (by position, regardless of input order) to the Nth date", () => {
    const plans = buildDraftSessionPlans({
      teamId: "team-1",
      coachUserId: "coach-1",
      entries,
      templatesById,
      dates,
    });
    expect(plans).toHaveLength(2);
    expect(plans[0].templateId).toBe("tpl-a");
    expect(plans[0].scheduledDate.toISOString()).toBe("2026-09-05T13:00:00.000Z");
    expect(plans[1].templateId).toBe("tpl-b");
    expect(plans[1].scheduledDate.toISOString()).toBe("2026-09-12T13:00:00.000Z");
  });

  it("builds draft rows carrying the template's content and the entry's coaching intent", () => {
    const [first] = buildDraftSessionPlans({
      teamId: "team-1",
      coachUserId: "coach-1",
      entries,
      templatesById,
      dates,
    });
    expect(first).toMatchObject({
      teamId: "team-1",
      coachUserId: "coach-1",
      title: "Week 1 of 2 — Dribbling Under Pressure",
      durationMinutes: 60,
      status: "draft",
      objectives: ["Keep the ball close"],
      equipmentNeeded: ["cones", "balls"],
      focusSkillIds: ["skill-1"],
      preSessionNotes: "Focus on the shy kids",
    });
    expect(first.segments).toEqual([
      { order: 1, name: "Warmup", type: "warmup", durationMinutes: 10, notes: "Free dribbling" },
      { order: 2, name: "Main game", type: "technical", durationMinutes: 40 },
      { order: 3, name: "Cooldown", type: "cooldown", durationMinutes: 10 },
    ]);
  });

  it("stops at the number of dates when fewer dates than entries (season-end truncation)", () => {
    const plans = buildDraftSessionPlans({
      teamId: "team-1",
      coachUserId: "coach-1",
      entries,
      templatesById,
      dates: [dates[0]],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe("Week 1 of 2 — Dribbling Under Pressure"); // "of 2": total reflects the full arc
  });

  it("handles a template without structure (empty segments, not null crash)", () => {
    const plans = buildDraftSessionPlans({
      teamId: "team-1",
      coachUserId: "coach-1",
      entries: [{ position: 1, templateId: "tpl-b", objectives: null, notes: null }],
      templatesById,
      dates: [dates[0]],
    });
    expect(plans[0].segments).toEqual([]);
    expect(plans[0].durationMinutes).toBe(45);
  });

  it("throws when an entry references a template not in the map", () => {
    expect(() =>
      buildDraftSessionPlans({
        teamId: "team-1",
        coachUserId: "coach-1",
        entries: [{ position: 1, templateId: "tpl-missing", objectives: null, notes: null }],
        templatesById,
        dates: [dates[0]],
      }),
    ).toThrow(/unknown template/);
  });
});
```

- [ ] **Step 2: Run tests to verify the new block fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/sequence-instantiation.test.ts`
Expected: FAIL — `buildDraftSessionPlans` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/curriculum/sequence-instantiation.ts`:

```typescript
// ---------------------------------------------------------------------------
// Draft building — entry N of the sequence → the Nth generated practice date.

export interface TemplateSegment {
  name: string;
  type: string;
  durationMinutes: number;
  description?: string;
  activitySuggestions?: string[];
  coachingScript?: string;
}

export interface SequenceEntryForBuild {
  position: number; // 1..N
  templateId: string;
  objectives: string[] | null;
  notes: string | null;
}

export interface TemplateForBuild {
  id: string;
  name: string;
  totalDurationMinutes: number;
  structure: TemplateSegment[] | null;
  equipmentNeeded: string[] | null;
  focusSkillIds: string[] | null;
}

export interface BuildDraftsInput {
  teamId: string;
  coachUserId: string;
  /** Entries in any order — sorted by `position` internally. */
  entries: SequenceEntryForBuild[];
  templatesById: Map<string, TemplateForBuild>;
  /** From generatePracticeDates. Sorted entry k → dates[k]; extra entries
   * beyond dates.length are dropped (season-end truncation). */
  dates: Date[];
}

/** Shape matches session_plans insert columns exactly (status always "draft"). */
export interface DraftSessionPlan {
  teamId: string;
  templateId: string;
  coachUserId: string;
  title: string;
  scheduledDate: Date;
  durationMinutes: number;
  status: "draft";
  segments: {
    order: number;
    name: string;
    type: string;
    durationMinutes: number;
    notes?: string;
  }[];
  focusSkillIds: string[] | null;
  objectives: string[] | null;
  equipmentNeeded: string[] | null;
  preSessionNotes: string | null;
}

export function buildDraftSessionPlans(
  input: BuildDraftsInput,
): DraftSessionPlan[] {
  const sorted = [...input.entries].sort((a, b) => a.position - b.position);
  const total = sorted.length;
  const n = Math.min(total, input.dates.length);
  const plans: DraftSessionPlan[] = [];
  for (let i = 0; i < n; i++) {
    const entry = sorted[i];
    const template = input.templatesById.get(entry.templateId);
    if (!template) {
      throw new Error(
        `Sequence entry at position ${entry.position} references unknown template ${entry.templateId}`,
      );
    }
    plans.push({
      teamId: input.teamId,
      templateId: template.id,
      coachUserId: input.coachUserId,
      // "Week i of total" over sorted index, not entry.position — positions
      // are 1..N by construction, but the index is what pairs with dates.
      title: `Week ${i + 1} of ${total} — ${template.name}`,
      scheduledDate: input.dates[i],
      durationMinutes: template.totalDurationMinutes,
      status: "draft",
      segments: (template.structure ?? []).map((s, idx) => ({
        order: idx + 1,
        name: s.name,
        type: s.type,
        durationMinutes: s.durationMinutes,
        ...(s.description ? { notes: s.description } : {}),
      })),
      focusSkillIds: template.focusSkillIds,
      objectives: entry.objectives,
      equipmentNeeded: template.equipmentNeeded,
      preSessionNotes: entry.notes,
    });
  }
  return plans;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/sequence-instantiation.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/curriculum/sequence-instantiation.ts tests/unit/sequence-instantiation.test.ts
git commit -m "feat(curriculum): pure draft session-plan builder for sequences

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 4: Admin API — ownership helper + sequences list/create

**Files:**
- Create: `src/lib/curriculum/sequence-ownership.ts`
- Create: `src/pages/api/admin/curriculum/sequences/index.ts`
- Test: `tests/api/admin/curriculum-sequences.test.ts` (created here; Tasks 5, 6, 8 append to it)

**Interfaces:**
- Consumes: `curriculumSequences`, `curriculumSequenceEntries` from Task 1; `requireOrgAdminAccess` from `@/lib/auth`; `requireSameOrgSport`, `ownershipDeniedResponse` from `@/lib/auth/require-resource-ownership`.
- Produces:
  - `loadSequenceForOrg(orgId: string, sequenceId: string): Promise<{ id: string; organizationId: string | null; sportId: string; developmentStageId: string; name: string } | null>` — used by Tasks 5 and 6.
  - `GET /api/admin/curriculum/sequences` → `{ sequences: [...], sports: [...], stages: [...] }` (each sequence row includes `entryCount`, joined `sport {id,name}` and `stage {id,name,slug}`).
  - `POST /api/admin/curriculum/sequences` body `{ sportId, developmentStageId, programType?, name, description? }` → 201 `{ sequence }`.

**API-test prerequisite:** the dev server must be running with `E2E_TEST_ENDPOINTS=yes` (e.g. `E2E_TEST_ENDPOINTS=yes npm run dev:bws`) and Task 1's migration applied to its DB. If `/api/test/org-fixtures` returns non-200, fix the env before chasing test failures.

- [ ] **Step 1: Write the failing API tests**

Create `tests/api/admin/curriculum-sequences.test.ts`:

```typescript
/**
 * Tenant-scoping + CRUD tests for the curriculum sequences endpoints (Phase 3).
 *
 * Mirrors tests/api/admin/curriculum-tenant.test.ts:
 *   - GET list: WHERE organizationId = caller's org OR organizationId IS NULL.
 *   - POST: forces organizationId = caller's org; sportId must belong to the
 *     caller's org (no pivot via a foreign sport).
 *   - GET/PUT/DELETE [id]: cross-tenant/unknown ids resolve to 404.
 *
 * development_stages is reference data seeded out-of-band; when the table is
 * empty the create tests are unreachable by API, so they runtime-skip
 * (same convention as curriculum-tenant.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  apiFetch,
  expectJson,
  getAdminCookie,
  getCoachCookie,
  testSlug,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/curriculum/sequences";

let adminCookie: string;
let orgASportId: string;
let orgBSportId: string;
let stageId: string | null = null;
let templateId: string | null = null;
let sequenceId: string | null = null;
const sequenceName = testSlug("sequence");

beforeAll(async () => {
  adminCookie = await getAdminCookie();

  // Org B fixtures — only available when E2E_TEST_ENDPOINTS=yes.
  const orgBRes = await apiFetch("/api/test/org-fixtures?slug=orgb", {
    method: "GET",
  });
  if (orgBRes.status !== 200) {
    throw new Error(
      `Could not load Org B fixtures (status ${orgBRes.status}) — set E2E_TEST_ENDPOINTS=yes and run npm run db:seed:e2e.`,
    );
  }
  orgBSportId = (await orgBRes.json()).sportId;

  const sportsRes = await apiFetch("/api/admin/sports", {
    method: "GET",
    cookie: adminCookie,
  });
  const sportsJson = await expectJson(sportsRes, 200);
  orgASportId = sportsJson.sports[0].id;

  // Stage reference data via the templates endpoint's reference lists.
  const tplRes = await apiFetch("/api/admin/curriculum/templates", {
    method: "GET",
    cookie: adminCookie,
  });
  const tplJson = await expectJson(tplRes, 200);
  stageId = tplJson.stages?.[0]?.id ?? null;

  if (stageId) {
    // A template owned by org A's sport, used as a sequence entry later.
    const createTpl = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        stageId,
        name: testSlug("seq-tpl"),
        totalDurationMinutes: 60,
        structure: [{ name: "Warmup", type: "warmup", durationMinutes: 10 }],
      }),
    });
    templateId = (await expectJson(createTpl, 201)).template.id;
  }
});

afterAll(() => {
  resetCookies();
});

describe("POST - create sequence", () => {
  it("creates a sequence scoped to the caller's org (201)", async () => {
    if (!stageId) return; // runtime skip: no development_stages seeded

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        developmentStageId: stageId,
        programType: "league",
        name: sequenceName,
        description: "Test sequence",
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.sequence.name).toBe(sequenceName);
    expect(json.sequence.organizationId).toBeTruthy();
    sequenceId = json.sequence.id;
  });

  it("rejects a sequence built on another org's sport (404)", async () => {
    if (!stageId) return;

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgBSportId,
        developmentStageId: stageId,
        name: testSlug("cross-tenant"),
      }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects invalid payloads (400)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(ENDPOINT, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });
});

describe("GET - list sequences", () => {
  it("returns only own-org or global sequences, with reference lists", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.sequences)).toBe(true);
    expect(Array.isArray(json.sports)).toBe(true);
    expect(Array.isArray(json.stages)).toBe(true);
    if (sequenceId) {
      const mine = json.sequences.find((s: any) => s.id === sequenceId);
      expect(mine).toBeDefined();
      expect(mine.entryCount).toBe(0);
      expect(mine.sport.id).toBe(orgASportId);
    }
    // No sequence in the list may belong to org B's sport.
    expect(json.sequences.some((s: any) => s.sportId === orgBSportId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

With the dev server up (`E2E_TEST_ENDPOINTS=yes npm run dev:bws` in another shell):

Run: `npm run test:api -- tests/api/admin/curriculum-sequences.test.ts`
Expected: FAIL — POST/GET return 404/405 (endpoint file does not exist yet).

- [ ] **Step 3: Write the ownership helper**

Create `src/lib/curriculum/sequence-ownership.ts`:

```typescript
import { getDb } from "@/lib/db";
import { eq, and, or, isNull } from "drizzle-orm";
import { curriculumSequences } from "@/lib/db/schema";

/**
 * Sequences with organizationId === null are global: every org admin can
 * read them (and attach them to their own seasons), but only super_admins
 * may mutate them — same model as practice templates. Cross-tenant ids
 * resolve to null; callers respond 404 via ownershipDeniedResponse()
 * (deliberately conflated with "not found", matching
 * src/lib/auth/require-resource-ownership.ts).
 *
 * No orderBy needed on the .limit(1): this is a primary-key eq lookup —
 * at most one row exists by construction.
 */
export async function loadSequenceForOrg(
  orgId: string,
  sequenceId: string,
): Promise<{
  id: string;
  organizationId: string | null;
  sportId: string;
  developmentStageId: string;
  name: string;
} | null> {
  const [row] = await getDb()
    .select({
      id: curriculumSequences.id,
      organizationId: curriculumSequences.organizationId,
      sportId: curriculumSequences.sportId,
      developmentStageId: curriculumSequences.developmentStageId,
      name: curriculumSequences.name,
    })
    .from(curriculumSequences)
    .where(
      and(
        eq(curriculumSequences.id, sequenceId),
        or(
          eq(curriculumSequences.organizationId, orgId),
          isNull(curriculumSequences.organizationId),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 4: Write the list/create endpoint**

Create `src/pages/api/admin/curriculum/sequences/index.ts`:

```typescript
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { curriculumSequences, developmentStages } from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { eq, and, or, isNull, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgSport,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

const sequenceSchema = z.object({
  sportId: z.string().uuid(),
  developmentStageId: z.string().uuid(),
  programType: z.enum(["league", "class", "camp", "clinic"]).default("league"),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
});

// GET - List sequences (caller's org + global), with reference lists
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const sportId = url.searchParams.get("sportId");

    const conditions = [
      or(
        eq(curriculumSequences.organizationId, auth.organizationId),
        isNull(curriculumSequences.organizationId),
      )!,
    ];
    if (sportId) conditions.push(eq(curriculumSequences.sportId, sportId));

    const sequencesList = await getDb()
      .select({
        id: curriculumSequences.id,
        organizationId: curriculumSequences.organizationId,
        sportId: curriculumSequences.sportId,
        developmentStageId: curriculumSequences.developmentStageId,
        programType: curriculumSequences.programType,
        name: curriculumSequences.name,
        description: curriculumSequences.description,
        createdAt: curriculumSequences.createdAt,
        entryCount: sql<number>`(
          select count(*)::int from curriculum_sequence_entries e
          where e.sequence_id = ${curriculumSequences.id}
        )`,
        sport: { id: sports.id, name: sports.name },
        stage: {
          id: developmentStages.id,
          name: developmentStages.name,
          slug: developmentStages.slug,
        },
      })
      .from(curriculumSequences)
      .innerJoin(sports, eq(curriculumSequences.sportId, sports.id))
      .innerJoin(
        developmentStages,
        eq(curriculumSequences.developmentStageId, developmentStages.id),
      )
      .where(and(...conditions))
      .orderBy(asc(curriculumSequences.name));

    const [sportsList, stagesList] = await Promise.all([
      getDb()
        .select({ id: sports.id, name: sports.name })
        .from(sports)
        .where(eq(sports.organizationId, auth.organizationId))
        .orderBy(asc(sports.name)),
      getDb()
        .select({
          id: developmentStages.id,
          name: developmentStages.name,
          slug: developmentStages.slug,
        })
        .from(developmentStages)
        .orderBy(asc(developmentStages.sortOrder)),
    ]);

    return new Response(
      JSON.stringify({
        sequences: sequencesList,
        sports: sportsList,
        stages: stagesList,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error fetching sequences:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch sequences" }), {
      status: 500,
    });
  }
};

// POST - Create a sequence scoped to the caller's org
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const result = sequenceSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const sportCheck = await requireSameOrgSport(
      auth.organizationId,
      result.data.sportId,
    );
    if (!sportCheck.ok) return ownershipDeniedResponse();

    const [newSequence] = await getDb()
      .insert(curriculumSequences)
      .values({ ...result.data, organizationId: auth.organizationId })
      .returning();

    return new Response(JSON.stringify({ sequence: newSequence }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating sequence:", error);
    if (error.code === "23505") {
      return new Response(
        JSON.stringify({ error: "A sequence with this name already exists for this sport" }),
        { status: 409 },
      );
    }
    if (error.code === "23503") {
      return new Response(
        JSON.stringify({ error: "Invalid sport or stage reference" }),
        { status: 400 },
      );
    }
    return new Response(JSON.stringify({ error: "Failed to create sequence" }), {
      status: 500,
    });
  }
};
```

Note: `getCoachCookie` is imported in the test file for Task 6's attach tests — TypeScript won't complain about an unused import in tests, but if the linter does, it lands in Task 6; leave the import in place.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:api -- tests/api/admin/curriculum-sequences.test.ts`
Expected: PASS (5 tests; create tests may runtime-skip if staging has no `development_stages` rows — staging normally has them).

- [ ] **Step 6: Commit**

```bash
git add src/lib/curriculum/sequence-ownership.ts src/pages/api/admin/curriculum/sequences/index.ts tests/api/admin/curriculum-sequences.test.ts
git commit -m "feat(curriculum): sequences list/create admin endpoint with tenant scoping

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 5: Admin API — sequence detail/update/delete + ordered entries

**Files:**
- Create: `src/pages/api/admin/curriculum/sequences/[id].ts`
- Create: `src/pages/api/admin/curriculum/sequences/[id]/entries.ts`
- Modify: `src/pages/api/admin/curriculum/templates/[id].ts` (DELETE error message, ~line 238)
- Test: `tests/api/admin/curriculum-sequences.test.ts` (append)

**Interfaces:**
- Consumes: `loadSequenceForOrg` (Task 4), Task 1 tables.
- Produces:
  - `GET /api/admin/curriculum/sequences/[id]` → `{ sequence, entries: [{ id, position, templateId, objectives, notes, template: { id, name, totalDurationMinutes } }] }` (entries ordered by position — Task 7's editor consumes this shape).
  - `PUT /api/admin/curriculum/sequences/[id]` body `{ name?, description?, programType?, developmentStageId? }` → `{ sequence }`.
  - `DELETE /api/admin/curriculum/sequences/[id]` → `{ success: true }` (entries cascade; season pointers null out via FK; drafts untouched).
  - `PUT /api/admin/curriculum/sequences/[id]/entries` body `{ entries: [{ templateId, objectives?, notes? }] }` (array order = position 1..N) → `{ entries }`.

- [ ] **Step 1: Write the failing API tests**

Append to `tests/api/admin/curriculum-sequences.test.ts`:

```typescript
describe("GET/PUT [id] - detail and update", () => {
  it("returns the sequence with ordered entries (200)", async () => {
    if (!sequenceId) return;
    const res = await apiFetch(`${ENDPOINT}/${sequenceId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.sequence.id).toBe(sequenceId);
    expect(Array.isArray(json.entries)).toBe(true);
  });

  it("404s for an unknown/cross-tenant id", async () => {
    const res = await apiFetch(
      `${ENDPOINT}/00000000-0000-4000-8000-000000000000`,
      { method: "GET", cookie: adminCookie },
    );
    expect(res.status).toBe(404);
  });

  it("updates name and description (200)", async () => {
    if (!sequenceId) return;
    const res = await apiFetch(`${ENDPOINT}/${sequenceId}`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({ description: "Updated description" }),
    });
    const json = await expectJson(res, 200);
    expect(json.sequence.description).toBe("Updated description");
  });
});

describe("PUT [id]/entries - replace ordered entries", () => {
  it("replaces entries, assigning positions from array order (200)", async () => {
    if (!sequenceId || !templateId) return;
    const res = await apiFetch(`${ENDPOINT}/${sequenceId}/entries`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        entries: [
          { templateId, objectives: ["Objective one"], notes: "Week 1 notes" },
          { templateId }, // same template twice is legal — positions differ
        ],
      }),
    });
    const json = await expectJson(res, 200);
    expect(json.entries).toHaveLength(2);
    expect(json.entries[0].position).toBe(1);
    expect(json.entries[0].objectives).toEqual(["Objective one"]);
    expect(json.entries[1].position).toBe(2);

    // Detail now reflects the entries, and list entryCount updates.
    const detail = await expectJson(
      await apiFetch(`${ENDPOINT}/${sequenceId}`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );
    expect(detail.entries).toHaveLength(2);
    expect(detail.entries[0].template.name).toBeTruthy();
  });

  it("rejects entries referencing an unknown template (400)", async () => {
    if (!sequenceId) return;
    const res = await apiFetch(`${ENDPOINT}/${sequenceId}/entries`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        entries: [{ templateId: "00000000-0000-4000-8000-000000000000" }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("blocks deleting a template that a sequence still references (400)", async () => {
    if (!sequenceId || !templateId) return;
    const res = await apiFetch(
      `/api/admin/curriculum/templates/${templateId}`,
      { method: "DELETE", cookie: adminCookie },
    );
    const json = await expectJson(res, 400);
    expect(json.error).toMatch(/sequence/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api -- tests/api/admin/curriculum-sequences.test.ts`
Expected: FAIL — the new `[id]` requests return 404/405 (no endpoint file).

- [ ] **Step 3: Write the detail/update/delete endpoint**

Create `src/pages/api/admin/curriculum/sequences/[id].ts`:

```typescript
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  curriculumSequences,
  curriculumSequenceEntries,
  practiceTemplates,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import { ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { loadSequenceForOrg } from "@/lib/curriculum/sequence-ownership";

const updateSequenceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  programType: z.enum(["league", "class", "camp", "clinic"]).optional(),
  developmentStageId: z.string().uuid().optional(),
  // sportId deliberately immutable: entries are templates of this sport;
  // changing sport would silently invalidate every entry.
});

// GET - sequence + ordered entries (with template summary for the editor)
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

    const ownership = await loadSequenceForOrg(auth.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const [sequence] = await getDb()
      .select()
      .from(curriculumSequences)
      .where(eq(curriculumSequences.id, id));

    const entries = await getDb()
      .select({
        id: curriculumSequenceEntries.id,
        position: curriculumSequenceEntries.position,
        templateId: curriculumSequenceEntries.templateId,
        objectives: curriculumSequenceEntries.objectives,
        notes: curriculumSequenceEntries.notes,
        template: {
          id: practiceTemplates.id,
          name: practiceTemplates.name,
          totalDurationMinutes: practiceTemplates.totalDurationMinutes,
        },
      })
      .from(curriculumSequenceEntries)
      .innerJoin(
        practiceTemplates,
        eq(curriculumSequenceEntries.templateId, practiceTemplates.id),
      )
      .where(eq(curriculumSequenceEntries.sequenceId, id))
      .orderBy(asc(curriculumSequenceEntries.position));

    return new Response(JSON.stringify({ sequence, entries }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching sequence:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch sequence" }), {
      status: 500,
    });
  }
};

// PUT - update sequence metadata
export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Sequence ID required" }), {
        status: 400,
      });
    }

    const ownership = await loadSequenceForOrg(auth.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (ownership.organizationId === null && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot edit global sequences" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await context.request.json();
    const result = updateSequenceSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const [updated] = await getDb()
      .update(curriculumSequences)
      .set({ ...result.data, updatedAt: new Date() })
      .where(eq(curriculumSequences.id, id))
      .returning();

    return new Response(JSON.stringify({ sequence: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating sequence:", error);
    if (error.code === "23505") {
      return new Response(
        JSON.stringify({ error: "A sequence with this name already exists for this sport" }),
        { status: 409 },
      );
    }
    if (error.code === "23503") {
      return new Response(JSON.stringify({ error: "Invalid stage reference" }), {
        status: 400,
      });
    }
    return new Response(JSON.stringify({ error: "Failed to update sequence" }), {
      status: 500,
    });
  }
};

// DELETE - delete sequence. Entries cascade; seasons.curriculum_sequence_id
// nulls out via its ON DELETE SET NULL FK; already-generated draft
// session_plans have no FK to sequences and are intentionally untouched
// (they belong to the coach — spec acceptance criterion).
export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Sequence ID required" }), {
        status: 400,
      });
    }

    const ownership = await loadSequenceForOrg(auth.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (ownership.organizationId === null && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot delete global sequences" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const [deleted] = await getDb()
      .delete(curriculumSequences)
      .where(eq(curriculumSequences.id, id))
      .returning();

    if (!deleted) {
      return new Response(JSON.stringify({ error: "Sequence not found" }), {
        status: 404,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error deleting sequence:", error);
    return new Response(JSON.stringify({ error: "Failed to delete sequence" }), {
      status: 500,
    });
  }
};
```

- [ ] **Step 4: Write the entries endpoint**

Create `src/pages/api/admin/curriculum/sequences/[id]/entries.ts`:

```typescript
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { curriculumSequenceEntries, practiceTemplates } from "@/lib/db/schema";
import { eq, and, or, isNull, inArray, asc } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import { ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { loadSequenceForOrg } from "@/lib/curriculum/sequence-ownership";

const entriesSchema = z.object({
  entries: z
    .array(
      z.object({
        templateId: z.string().uuid(),
        objectives: z.array(z.string()).optional(),
        notes: z.string().optional(),
      }),
    )
    .max(52),
});

// PUT - replace the full ordered entry list. Positions are assigned from
// array order (1..N) — the move-up/move-down UI just reorders the array and
// re-PUTs, which keeps ordering transactional and gap-free.
export const PUT: APIRoute = async (context) => {
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

    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (sequence.organizationId === null && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot edit global sequences" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await context.request.json();
    const result = entriesSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    // Every posted template must be visible to this org (own or global)
    // AND belong to the sequence's sport.
    const postedIds = [...new Set(result.data.entries.map((e) => e.templateId))];
    if (postedIds.length > 0) {
      const validTemplates = await getDb()
        .select({ id: practiceTemplates.id })
        .from(practiceTemplates)
        .where(
          and(
            inArray(practiceTemplates.id, postedIds),
            eq(practiceTemplates.sportId, sequence.sportId),
            or(
              eq(practiceTemplates.organizationId, auth.organizationId),
              isNull(practiceTemplates.organizationId),
            ),
          ),
        );
      const validIds = new Set(validTemplates.map((t) => t.id));
      const invalid = postedIds.filter((tid) => !validIds.has(tid));
      if (invalid.length > 0) {
        return new Response(
          JSON.stringify({
            error: "One or more templates were not found for this sequence's sport",
            details: { templateIds: invalid },
          }),
          { status: 400 },
        );
      }
    }

    const rows = result.data.entries.map((e, i) => ({
      sequenceId: id,
      position: i + 1,
      templateId: e.templateId,
      objectives: e.objectives ?? null,
      notes: e.notes ?? null,
    }));

    await getDb().transaction(async (tx) => {
      await tx
        .delete(curriculumSequenceEntries)
        .where(eq(curriculumSequenceEntries.sequenceId, id));
      if (rows.length > 0) {
        await tx.insert(curriculumSequenceEntries).values(rows);
      }
    });

    const entries = await getDb()
      .select()
      .from(curriculumSequenceEntries)
      .where(eq(curriculumSequenceEntries.sequenceId, id))
      .orderBy(asc(curriculumSequenceEntries.position));

    return new Response(JSON.stringify({ entries }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error replacing sequence entries:", error);
    return new Response(JSON.stringify({ error: "Failed to update entries" }), {
      status: 500,
    });
  }
};
```

- [ ] **Step 5: Update the templates DELETE error message**

In `src/pages/api/admin/curriculum/templates/[id].ts`, the DELETE handler's catch block (~line 236) currently returns `"Cannot delete template that is used in session plans"` on FK code `23503`. Since `session_plans.templateId` is `ON DELETE SET NULL`, the only restrict-FK on templates is now the sequence entries one. Replace that Response with:

```typescript
      return new Response(
        JSON.stringify({
          error:
            "Cannot delete template: it is used by a curriculum sequence — remove it from the sequence first",
        }),
        { status: 400 }
      );
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:api -- tests/api/admin/curriculum-sequences.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 7: Commit**

```bash
git add src/pages/api/admin/curriculum/sequences/ src/pages/api/admin/curriculum/templates/[id].ts tests/api/admin/curriculum-sequences.test.ts
git commit -m "feat(curriculum): sequence detail/update/delete + ordered entries endpoints

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 6: Attach/detach endpoints — the generation trigger

**Files:**
- Create: `src/pages/api/admin/curriculum/sequences/[id]/attach.ts`
- Create: `src/pages/api/admin/curriculum/sequences/[id]/detach.ts`
- Test: `tests/api/admin/curriculum-sequences.test.ts` (append)

**Interfaces:**
- Consumes: `loadSequenceForOrg` (Task 4); `generatePracticeDates`, `buildDraftSessionPlans`, `TemplateForBuild` (Tasks 2–3); `requireSameOrgSeason`.
- Produces:
  - `POST /api/admin/curriculum/sequences/[id]/attach` body `{ seasonId, weekday, startDate, timeOfDay, count }` → 200 `{ attached: true, seasonId, results: [{ teamId, created, skippedExisting }], teamsWithoutCoach: string[], truncatedBySeasonEnd: boolean }`. **Idempotent**: re-running skips existing `(team, template, date)` triples, so it also picks up teams created after the first attach.
  - `POST /api/admin/curriculum/sequences/[id]/detach` body `{ seasonId }` → 200 `{ detached: true }`. Drafts intentionally untouched.

- [ ] **Step 1: Write the failing API tests**

Append to `tests/api/admin/curriculum-sequences.test.ts`. This block builds its own program/season/team so it never mutates shared staging fixtures. Note: `getCoachCookie` was already imported in Task 4's setup.

```typescript
describe("attach / detach - draft generation", () => {
  let seasonId: string;
  let teamId: string;
  let coachUserId: string;
  let coachCookie: string;

  beforeAll(async () => {
    if (!sequenceId || !templateId) return;

    coachCookie = await getCoachCookie();
    const me = await expectJson(
      await apiFetch("/api/auth/me", { method: "GET", cookie: coachCookie }),
      200,
    );
    coachUserId = me.user.id;

    // Parent program: reuse an existing org-A program (same pattern as
    // tests/api/admin/seasons.test.ts).
    const programsJson = await expectJson(
      await apiFetch("/api/admin/programs", { method: "GET", cookie: adminCookie }),
      200,
    );
    const programId = programsJson.programs[0].id;

    const seasonJson = await expectJson(
      await apiFetch("/api/admin/seasons", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Sequence Attach Test Season",
          slug: testSlug("seq-season"),
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 15000,
          status: "draft",
        }),
      }),
      201,
    );
    seasonId = seasonJson.season.id;

    const teamJson = await expectJson(
      await apiFetch("/api/admin/teams", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          seasonId,
          name: testSlug("seq-team"),
          coachUserId,
        }),
      }),
      201,
    );
    teamId = teamJson.team.id;
  });

  // 2026-09-05 is a Saturday; org timezone default America/New_York (EDT, UTC-4).
  const recurrence = {
    weekday: 6,
    startDate: "2026-09-05",
    timeOfDay: "09:00",
    count: 2,
  };

  it("attaches and generates one dated draft per entry for the coached team", async () => {
    if (!sequenceId || !templateId) return;

    const res = await apiFetch(`${ENDPOINT}/${sequenceId}/attach`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ seasonId, ...recurrence }),
    });
    const json = await expectJson(res, 200);
    expect(json.attached).toBe(true);
    expect(json.truncatedBySeasonEnd).toBe(false);
    const teamResult = json.results.find((r: any) => r.teamId === teamId);
    expect(teamResult.created).toBe(2); // sequence has 2 entries (Task 5 test)

    // The coach sees them as ordinary drafts on their sessions endpoint.
    const sessions = await expectJson(
      await apiFetch(`/api/coach/sessions?teamId=${teamId}`, {
        method: "GET",
        cookie: coachCookie,
      }),
      200,
    );
    expect(sessions.sessions).toHaveLength(2);
    const sorted = [...sessions.sessions].sort(
      (a: any, b: any) =>
        new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
    );
    expect(sorted[0].status).toBe("draft");
    expect(sorted[0].title).toMatch(/^Week 1 of 2 — /);
    expect(new Date(sorted[0].scheduledDate).toISOString()).toBe(
      "2026-09-05T13:00:00.000Z", // 09:00 EDT
    );
    expect(sorted[1].title).toMatch(/^Week 2 of 2 — /);
  });

  it("is idempotent: re-attaching skips existing drafts", async () => {
    if (!sequenceId || !templateId) return;

    const json = await expectJson(
      await apiFetch(`${ENDPOINT}/${sequenceId}/attach`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ seasonId, ...recurrence }),
      }),
      200,
    );
    const teamResult = json.results.find((r: any) => r.teamId === teamId);
    expect(teamResult.created).toBe(0);
    expect(teamResult.skippedExisting).toBe(2);
  });

  it("404s attaching to an unknown/cross-tenant season", async () => {
    if (!sequenceId) return;
    const res = await apiFetch(`${ENDPOINT}/${sequenceId}/attach`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        seasonId: "00000000-0000-4000-8000-000000000000",
        ...recurrence,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("detaches without touching generated drafts", async () => {
    if (!sequenceId || !templateId) return;

    const res = await apiFetch(`${ENDPOINT}/${sequenceId}/detach`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ seasonId }),
    });
    const json = await expectJson(res, 200);
    expect(json.detached).toBe(true);

    const sessions = await expectJson(
      await apiFetch(`/api/coach/sessions?teamId=${teamId}`, {
        method: "GET",
        cookie: coachCookie,
      }),
      200,
    );
    expect(sessions.sessions).toHaveLength(2); // drafts are the coach's now
  });

  it("deleting the sequence also leaves generated drafts intact", async () => {
    if (!sequenceId || !templateId) return;

    // Re-attach so a season pointer exists at delete time (exercises the
    // ON DELETE SET NULL path too).
    await expectJson(
      await apiFetch(`${ENDPOINT}/${sequenceId}/attach`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ seasonId, ...recurrence }),
      }),
      200,
    );

    await expectJson(
      await apiFetch(`${ENDPOINT}/${sequenceId}`, {
        method: "DELETE",
        cookie: adminCookie,
      }),
      200,
    );
    sequenceId = null; // consumed — later blocks must not reuse it

    const sessions = await expectJson(
      await apiFetch(`/api/coach/sessions?teamId=${teamId}`, {
        method: "GET",
        cookie: coachCookie,
      }),
      200,
    );
    expect(sessions.sessions).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api -- tests/api/admin/curriculum-sequences.test.ts`
Expected: FAIL — attach/detach requests 404 (no endpoint files).

- [ ] **Step 3: Write the attach endpoint**

Create `src/pages/api/admin/curriculum/sequences/[id]/attach.ts`:

```typescript
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
```

- [ ] **Step 4: Write the detach endpoint**

Create `src/pages/api/admin/curriculum/sequences/[id]/detach.ts`:

```typescript
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgSeason,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { loadSequenceForOrg } from "@/lib/curriculum/sequence-ownership";

const detachSchema = z.object({ seasonId: z.string().uuid() });

/**
 * POST - detach the sequence from a season. Already-generated draft
 * session_plans are intentionally left alone — they belong to the coach
 * (spec acceptance criterion: "sequence deletion/detachment leaves
 * already-generated drafts intact").
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
    const result = detachSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const seasonCheck = await requireSameOrgSeason(
      auth.organizationId,
      result.data.seasonId,
    );
    if (!seasonCheck.ok) return ownershipDeniedResponse();

    // PK lookup — no orderBy needed on limit(1).
    const [season] = await getDb()
      .select({ curriculumSequenceId: seasons.curriculumSequenceId })
      .from(seasons)
      .where(eq(seasons.id, result.data.seasonId))
      .limit(1);

    if (season.curriculumSequenceId !== sequence.id) {
      return new Response(
        JSON.stringify({ error: "This sequence is not attached to that season" }),
        { status: 409 },
      );
    }

    await getDb()
      .update(seasons)
      .set({ curriculumSequenceId: null, updatedAt: new Date() })
      .where(eq(seasons.id, result.data.seasonId));

    return new Response(JSON.stringify({ detached: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error detaching sequence:", error);
    return new Response(JSON.stringify({ error: "Failed to detach sequence" }), {
      status: 500,
    });
  }
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:api -- tests/api/admin/curriculum-sequences.test.ts`
Expected: PASS (16 tests). If the DST assertion on `2026-09-05T13:00:00.000Z` fails with a 1-hour offset, check the test org's `organizations.timezone` on staging — the assertion assumes `America/New_York` (the column default).

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/admin/curriculum/sequences/ tests/api/admin/curriculum-sequences.test.ts
git commit -m "feat(curriculum): sequence attach/detach with idempotent draft generation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 7: Admin authoring UI — `/admin/curriculum/sequences`

**Files:**
- Create: `src/pages/admin/curriculum/sequences.astro`
- Create: `src/components/admin/sequence-editor.tsx`
- Modify: `src/components/admin/curriculum-manager.tsx` (add a "Sequences" section card)

**Interfaces:**
- Consumes: every endpoint from Tasks 4–6, plus existing `GET /api/admin/curriculum/templates?sportId=` (template options) and `GET /api/admin/seasons` (season options for the attach form).
- Produces: the page itself. No later task consumes it.

Design constraints honored: SSR page (no `prerender`), `ErrorBanner`/`EmptyState`/`LoadingSkeleton` primitives, move up/down ordering (no drag-drop dependency), `useHydrationBeacon` on the top-level `client:load` component (Playwright convention), toasts via sonner.

- [ ] **Step 1: Create the page shell**

Create `src/pages/admin/curriculum/sequences.astro` (mirrors `templates.astro`; middleware guarantees admin):

```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import { AdminLayout } from '../../../components/admin/admin-layout';
import { getPrimaryRoleName } from "@/lib/auth";
import { SequenceEditor } from '../../../components/admin/sequence-editor';

// Middleware guarantees user is an admin for /admin routes.
const user = Astro.locals.user!;
const primaryRole = getPrimaryRoleName(Astro.locals.userRoles);
---

<BaseLayout title="Curriculum Sequences — Aspire Sports Admin" navigation={false} footer={false}>
  <AdminLayout
    client:load
    role={primaryRole}
    currentPath="/admin/curriculum"
    user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}
  >
    <SequenceEditor client:load />
  </AdminLayout>
</BaseLayout>
```

- [ ] **Step 2: Write the editor component**

Create `src/components/admin/sequence-editor.tsx`:

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { toast } from "sonner"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { ArrowDown, ArrowUp, ChevronLeft, Plus, Trash2 } from "lucide-react"

interface RefItem {
  id: string
  name: string
}

interface StageRef extends RefItem {
  slug: string
}

interface SequenceListItem {
  id: string
  organizationId: string | null
  sportId: string
  developmentStageId: string
  programType: "league" | "class" | "camp" | "clinic"
  name: string
  description: string | null
  entryCount: number
  sport: RefItem
  stage: StageRef
}

// Editor-local entry shape: objectives edited as one-per-line text.
interface EditorEntry {
  templateId: string
  templateName: string
  objectives: string
  notes: string
}

interface SeasonOption {
  id: string
  name: string
  startDate: string
  endDate: string
}

const PROGRAM_TYPES = ["league", "class", "camp", "clinic"] as const
const WEEKDAYS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

export function SequenceEditor() {
  useHydrationBeacon()

  const [sequences, setSequences] = useState<SequenceListItem[]>([])
  const [sports, setSports] = useState<RefItem[]>([])
  const [stages, setStages] = useState<StageRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createSportId, setCreateSportId] = useState("")
  const [createStageId, setCreateStageId] = useState("")
  const [createProgramType, setCreateProgramType] = useState<string>("league")
  const [createDescription, setCreateDescription] = useState("")

  // Detail / entry editing
  const [selected, setSelected] = useState<SequenceListItem | null>(null)
  const [entries, setEntries] = useState<EditorEntry[]>([])
  const [templates, setTemplates] = useState<RefItem[]>([])
  const [addTemplateId, setAddTemplateId] = useState("")
  const [savingEntries, setSavingEntries] = useState(false)

  // Attach form
  const [seasons, setSeasons] = useState<SeasonOption[]>([])
  const [attachSeasonId, setAttachSeasonId] = useState("")
  const [attachWeekday, setAttachWeekday] = useState("6")
  const [attachStartDate, setAttachStartDate] = useState("")
  const [attachTime, setAttachTime] = useState("09:00")
  const [attaching, setAttaching] = useState(false)

  const fetchSequences = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/curriculum/sequences")
      if (!res.ok) throw new Error("Failed to load sequences")
      const data = await res.json()
      setSequences(data.sequences || [])
      setSports(data.sports || [])
      setStages(data.stages || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sequences")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSequences()
  }, [fetchSequences])

  async function openSequence(seq: SequenceListItem) {
    setSelected(seq)
    setAttachSeasonId("")
    const [detailRes, templatesRes, seasonsRes] = await Promise.all([
      fetch(`/api/admin/curriculum/sequences/${seq.id}`),
      fetch(`/api/admin/curriculum/templates?sportId=${seq.sportId}`),
      fetch("/api/admin/seasons"),
    ])
    if (!detailRes.ok) {
      toast.error("Failed to load sequence detail")
      setSelected(null)
      return
    }
    const detail = await detailRes.json()
    setEntries(
      (detail.entries || []).map((e: any) => ({
        templateId: e.templateId,
        templateName: e.template.name,
        objectives: (e.objectives || []).join("\n"),
        notes: e.notes || "",
      })),
    )
    if (templatesRes.ok) {
      const tpl = await templatesRes.json()
      setTemplates((tpl.templates || []).map((t: any) => ({ id: t.id, name: t.name })))
    }
    if (seasonsRes.ok) {
      const s = await seasonsRes.json()
      setSeasons(
        (s.seasons || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          startDate: row.startDate,
          endDate: row.endDate,
        })),
      )
    }
  }

  async function handleCreate() {
    if (!createName || !createSportId || !createStageId) {
      toast.error("Name, sport, and stage are required")
      return
    }
    const res = await fetch("/api/admin/curriculum/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createName,
        sportId: createSportId,
        developmentStageId: createStageId,
        programType: createProgramType,
        description: createDescription || undefined,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error || "Failed to create sequence")
      return
    }
    toast.success("Sequence created")
    setShowCreate(false)
    setCreateName("")
    setCreateDescription("")
    await fetchSequences()
  }

  function moveEntry(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= entries.length) return
    const next = [...entries]
    ;[next[index], next[target]] = [next[target], next[index]]
    setEntries(next)
  }

  function removeEntry(index: number) {
    setEntries(entries.filter((_, i) => i !== index))
  }

  function addEntry() {
    const template = templates.find((t) => t.id === addTemplateId)
    if (!template) return
    setEntries([
      ...entries,
      { templateId: template.id, templateName: template.name, objectives: "", notes: "" },
    ])
    setAddTemplateId("")
  }

  async function saveEntries() {
    if (!selected) return
    setSavingEntries(true)
    try {
      const res = await fetch(`/api/admin/curriculum/sequences/${selected.id}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: entries.map((e) => ({
            templateId: e.templateId,
            objectives: e.objectives
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
            notes: e.notes || undefined,
          })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error || "Failed to save entries")
        return
      }
      toast.success("Entries saved")
      await fetchSequences()
    } finally {
      setSavingEntries(false)
    }
  }

  async function handleAttach() {
    if (!selected || !attachSeasonId || !attachStartDate) {
      toast.error("Season and start date are required")
      return
    }
    if (entries.length === 0) {
      toast.error("Add entries (and save them) before attaching")
      return
    }
    setAttaching(true)
    try {
      const res = await fetch(`/api/admin/curriculum/sequences/${selected.id}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: attachSeasonId,
          weekday: Number(attachWeekday),
          startDate: attachStartDate,
          timeOfDay: attachTime,
          count: entries.length,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || "Failed to attach sequence")
        return
      }
      const created = (body.results || []).reduce(
        (sum: number, r: any) => sum + r.created,
        0,
      )
      let message = `Attached — ${created} draft plan${created === 1 ? "" : "s"} generated`
      if (body.teamsWithoutCoach?.length) {
        message += `; ${body.teamsWithoutCoach.length} team(s) skipped (no coach assigned)`
      }
      if (body.truncatedBySeasonEnd) {
        message += "; some weeks fell past the season end and were dropped"
      }
      toast.success(message)
    } finally {
      setAttaching(false)
    }
  }

  async function handleDetach() {
    if (!selected || !attachSeasonId) {
      toast.error("Pick the season to detach from")
      return
    }
    const res = await fetch(`/api/admin/curriculum/sequences/${selected.id}/detach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seasonId: attachSeasonId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(body.error || "Failed to detach sequence")
      return
    }
    toast.success("Detached — existing draft plans were left with their coaches")
  }

  async function handleDelete() {
    if (!selected) return
    if (!window.confirm(`Delete "${selected.name}"? Generated draft plans are kept.`)) return
    const res = await fetch(`/api/admin/curriculum/sequences/${selected.id}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error || "Failed to delete sequence")
      return
    }
    toast.success("Sequence deleted")
    setSelected(null)
    await fetchSequences()
  }

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorBanner message={error} />

  // ---- Detail view -------------------------------------------------------
  if (selected) {
    return (
      <div className="space-y-6" data-testid="sequence-detail">
        <div className="flex items-center justify-between">
          <div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink mb-2"
            >
              <ChevronLeft className="w-4 h-4" /> All sequences
            </button>
            <h1 className="text-2xl font-bold text-ink">{selected.name}</h1>
            <p className="text-sm text-ink-muted">
              {selected.sport.name} · {selected.stage.name} · {selected.programType}
            </p>
          </div>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </Button>
        </div>

        {/* Ordered entries */}
        <section className="p-4 rounded-xl bg-paper border border-border space-y-3">
          <h2 className="text-sm font-medium text-ink">Weekly entries (in order)</h2>
          {entries.length === 0 && (
            <EmptyState
              title="No entries yet"
              description="Add practice templates below — entry 1 becomes week 1, entry 2 week 2, and so on."
            />
          )}
          {entries.map((entry, index) => (
            <div
              key={`${entry.templateId}-${index}`}
              className="flex items-start gap-3 p-3 rounded-lg border border-border"
              data-testid="sequence-entry-row"
            >
              <Badge variant="outline" className="shrink-0 mt-1">
                Week {index + 1}
              </Badge>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="font-medium text-ink truncate">{entry.templateName}</p>
                <Textarea
                  placeholder="Objectives, one per line"
                  value={entry.objectives}
                  onChange={(e) => {
                    const next = [...entries]
                    next[index] = { ...entry, objectives: e.target.value }
                    setEntries(next)
                  }}
                  rows={2}
                />
                <Input
                  placeholder="Coach notes for this week"
                  value={entry.notes}
                  onChange={(e) => {
                    const next = [...entries]
                    next[index] = { ...entry, notes: e.target.value }
                    setEntries(next)
                  }}
                />
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => moveEntry(index, -1)}
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Move down"
                  disabled={index === entries.length - 1}
                  onClick={() => moveEntry(index, 1)}
                >
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Remove entry"
                  onClick={() => removeEntry(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <Select value={addTemplateId} onValueChange={setAddTemplateId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Add a practice template…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={addEntry} disabled={!addTemplateId}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
          <Button onClick={saveEntries} disabled={savingEntries}>
            {savingEntries ? "Saving…" : "Save entries"}
          </Button>
        </section>

        {/* Attach to season */}
        <section className="p-4 rounded-xl bg-paper border border-border space-y-3">
          <h2 className="text-sm font-medium text-ink">Attach to a season</h2>
          <p className="text-xs text-ink-muted">
            Generates one dated draft plan per entry for every coached team in the
            season (weekday + start date + weekly repeat). Coaches can edit or delete
            the drafts freely. Re-attaching is safe — existing drafts are skipped.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={attachSeasonId} onValueChange={setAttachSeasonId}>
              <SelectTrigger>
                <SelectValue placeholder="Season…" />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.startDate} → {s.endDate})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={attachWeekday} onValueChange={setAttachWeekday}>
              <SelectTrigger>
                <SelectValue placeholder="Weekday…" />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              aria-label="First practice date"
              value={attachStartDate}
              onChange={(e) => setAttachStartDate(e.target.value)}
            />
            <Input
              type="time"
              aria-label="Practice time"
              value={attachTime}
              onChange={(e) => setAttachTime(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAttach} disabled={attaching}>
              {attaching ? "Generating…" : `Attach & generate ${entries.length} weeks`}
            </Button>
            <Button variant="outline" onClick={handleDetach}>
              Detach
            </Button>
          </div>
        </section>
      </div>
    )
  }

  // ---- List view ---------------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1">Curriculum Sequences</h1>
          <p className="text-sm text-ink-muted">
            Order practice templates into a season-long arc, then attach it to a
            season to push dated draft plans to every coach.
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          <Plus className="w-4 h-4 mr-2" /> New sequence
        </Button>
      </div>

      {showCreate && (
        <section className="p-4 rounded-xl bg-paper border border-border space-y-3" data-testid="sequence-create-form">
          <Input
            placeholder="Sequence name (e.g. Soccer Fundamentals — 6-Week League Block)"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={createSportId} onValueChange={setCreateSportId}>
              <SelectTrigger>
                <SelectValue placeholder="Sport…" />
              </SelectTrigger>
              <SelectContent>
                {sports.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={createStageId} onValueChange={setCreateStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Stage…" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={createProgramType} onValueChange={setCreateProgramType}>
              <SelectTrigger>
                <SelectValue placeholder="Program type…" />
              </SelectTrigger>
              <SelectContent>
                {PROGRAM_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            placeholder="Description (optional)"
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
            rows={2}
          />
          <Button onClick={handleCreate}>Create</Button>
        </section>
      )}

      {sequences.length === 0 ? (
        <EmptyState
          title="No sequences yet"
          description="Create a sequence to order practice templates into a season plan."
        />
      ) : (
        <div className="space-y-2">
          {sequences.map((seq) => (
            <button
              key={seq.id}
              type="button"
              onClick={() => openSequence(seq)}
              className="w-full text-left p-4 rounded-xl bg-paper border border-border hover:border-primary/40 transition-colors"
              data-testid="sequence-card"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">{seq.name}</p>
                  <p className="text-xs text-ink-muted">
                    {seq.sport.name} · {seq.stage.name} · {seq.programType}
                    {seq.organizationId === null && " · global"}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {seq.entryCount} week{seq.entryCount === 1 ? "" : "s"}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add the Sequences card to the curriculum manager**

In `src/components/admin/curriculum-manager.tsx`:

1. Add `ListOrdered` to the existing `lucide-react` import list (ends ~line 19).
2. In the `sections` array (starts ~line 120), after the "Practice Templates" section object, append:

```typescript
    {
      title: "Sequences",
      description: "Order practice templates into season-long plans and push dated drafts to teams",
      icon: ListOrdered,
      href: "/admin/curriculum/sequences",
      color: "text-amber-600",
      bgColor: "bg-amber-500/10",
      stats: [],
      breakdown: [],
      breakdownLabel: "stage",
    },
```

- [ ] **Step 4: Verify by hand and type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

With the dev server running, open `http://localhost:4321/admin/curriculum` (sign in as `admin@test.aspiresports.com` / `TestAdmin123!`): the Sequences card appears and links to `/admin/curriculum/sequences`; create a sequence, add two template entries, reorder with the arrows, save, re-open — order persists.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/curriculum/sequences.astro src/components/admin/sequence-editor.tsx src/components/admin/curriculum-manager.tsx
git commit -m "feat(admin): curriculum sequence authoring UI (ordering + season attach)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 8: Coach surface — sequence-progress strip on the practices overview

**Files:**
- Modify: `src/lib/curriculum/sequence-instantiation.ts` (append `computeSequenceProgress`)
- Modify: `src/pages/api/coach/sessions/index.ts` (GET handler: add `sequenceProgress` to the response)
- Modify: `src/components/coach/practices-overview.tsx` (render the strip)
- Test: `tests/unit/sequence-instantiation.test.ts` (append), `tests/api/admin/curriculum-sequences.test.ts` (append one assertion block)

**Interfaces:**
- Consumes: Task 1 tables, Task 6's generated drafts (matched by `templateId` — generated drafts carry no special marker by design).
- Produces:
  - `computeSequenceProgress(sequenceTemplateIds: string[], teamPlans: TeamPlanForProgress[], now: Date): SequenceProgress`
  - `GET /api/coach/sessions` response gains `sequenceProgress: [{ teamId, teamName, sequenceName, totalWeeks, completedWeeks, currentWeek, nextPlan: { id, title, scheduledDate } | null }]`.

**Design note (spec left room here):** the spec forbids making generated drafts distinguishable, so progress cannot be stored — it is derived: a team plan counts toward the sequence when its `templateId` is one of the sequence's entry templates. A coach who deletes a generated draft or swaps its template simply drops it from the count; that's acceptable v1 behavior.

- [ ] **Step 1: Write the failing unit tests**

Append to `tests/unit/sequence-instantiation.test.ts` (extend the import with `computeSequenceProgress` and `type TeamPlanForProgress`):

```typescript
import {
  computeSequenceProgress,
  type TeamPlanForProgress,
} from "@/lib/curriculum/sequence-instantiation";

describe("computeSequenceProgress", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const templateIds = ["tpl-a", "tpl-b", "tpl-c"];
  const plan = (
    id: string,
    templateId: string | null,
    scheduledDate: string,
    status: string,
  ): TeamPlanForProgress => ({
    id,
    title: `Plan ${id}`,
    templateId,
    scheduledDate: new Date(scheduledDate),
    status,
  });

  it("is week 1 with nothing completed at season start", () => {
    const result = computeSequenceProgress(
      templateIds,
      [
        plan("1", "tpl-a", "2026-09-12T13:00:00.000Z", "draft"),
        plan("2", "tpl-b", "2026-09-19T13:00:00.000Z", "draft"),
        plan("3", "tpl-c", "2026-09-26T13:00:00.000Z", "draft"),
      ],
      now,
    );
    expect(result).toMatchObject({ totalWeeks: 3, completedWeeks: 0, currentWeek: 1 });
    expect(result.nextPlan?.id).toBe("1");
  });

  it("counts past or completed sequence plans as completed weeks", () => {
    const result = computeSequenceProgress(
      templateIds,
      [
        plan("1", "tpl-a", "2026-09-05T13:00:00.000Z", "completed"),
        plan("2", "tpl-b", "2026-09-08T13:00:00.000Z", "draft"), // past → counts
        plan("3", "tpl-c", "2026-09-19T13:00:00.000Z", "draft"),
      ],
      now,
    );
    expect(result).toMatchObject({ totalWeeks: 3, completedWeeks: 2, currentWeek: 3 });
    expect(result.nextPlan?.id).toBe("3");
  });

  it("ignores plans whose template is not part of the sequence", () => {
    const result = computeSequenceProgress(
      templateIds,
      [
        plan("x", null, "2026-09-05T13:00:00.000Z", "completed"),
        plan("y", "tpl-other", "2026-09-06T13:00:00.000Z", "completed"),
      ],
      now,
    );
    expect(result).toMatchObject({ totalWeeks: 3, completedWeeks: 0, currentWeek: 1 });
    expect(result.nextPlan).toBeNull();
  });

  it("clamps currentWeek to totalWeeks when everything is done", () => {
    const result = computeSequenceProgress(
      templateIds,
      [
        plan("1", "tpl-a", "2026-08-01T13:00:00.000Z", "completed"),
        plan("2", "tpl-b", "2026-08-08T13:00:00.000Z", "completed"),
        plan("3", "tpl-c", "2026-08-15T13:00:00.000Z", "completed"),
      ],
      now,
    );
    expect(result).toMatchObject({ totalWeeks: 3, completedWeeks: 3, currentWeek: 3 });
    expect(result.nextPlan).toBeNull();
  });

  it("skips cancelled plans when picking the next plan", () => {
    const result = computeSequenceProgress(
      templateIds,
      [
        plan("1", "tpl-a", "2026-09-12T13:00:00.000Z", "cancelled"),
        plan("2", "tpl-b", "2026-09-19T13:00:00.000Z", "draft"),
      ],
      now,
    );
    expect(result.nextPlan?.id).toBe("2");
  });
});
```

- [ ] **Step 2: Run tests to verify the new block fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/sequence-instantiation.test.ts`
Expected: FAIL — `computeSequenceProgress` is not exported.

- [ ] **Step 3: Implement `computeSequenceProgress`**

Append to `src/lib/curriculum/sequence-instantiation.ts`:

```typescript
// ---------------------------------------------------------------------------
// Coach-facing progress derivation ("Week 3 of 8"). Generated drafts are
// ordinary session_plans rows with no sequence marker (by design), so
// membership is inferred: a team plan counts toward the sequence when its
// templateId is one of the sequence's entry templates.

export interface TeamPlanForProgress {
  id: string;
  title: string;
  templateId: string | null;
  scheduledDate: Date;
  status: string;
}

export interface SequenceProgress {
  totalWeeks: number;
  /** Sequence-derived plans that are completed or already in the past. */
  completedWeeks: number;
  /** 1-based, clamped to totalWeeks. */
  currentWeek: number;
  /** Earliest upcoming, non-cancelled, non-completed sequence plan. */
  nextPlan: { id: string; title: string; scheduledDate: Date } | null;
}

export function computeSequenceProgress(
  sequenceTemplateIds: string[],
  teamPlans: TeamPlanForProgress[],
  now: Date,
): SequenceProgress {
  const totalWeeks = sequenceTemplateIds.length;
  const templateSet = new Set(sequenceTemplateIds);
  const matching = teamPlans.filter(
    (p) => p.templateId !== null && templateSet.has(p.templateId),
  );
  const completedWeeks = Math.min(
    matching.filter(
      (p) => p.status === "completed" || p.scheduledDate.getTime() < now.getTime(),
    ).length,
    totalWeeks,
  );
  const upcoming = matching
    .filter(
      (p) =>
        p.scheduledDate.getTime() >= now.getTime() &&
        p.status !== "completed" &&
        p.status !== "cancelled",
    )
    .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  return {
    totalWeeks,
    completedWeeks,
    currentWeek: totalWeeks === 0 ? 0 : Math.min(completedWeeks + 1, totalWeeks),
    nextPlan: upcoming[0]
      ? {
          id: upcoming[0].id,
          title: upcoming[0].title,
          scheduledDate: upcoming[0].scheduledDate,
        }
      : null,
  };
}
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/sequence-instantiation.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Extend `GET /api/coach/sessions`**

In `src/pages/api/coach/sessions/index.ts`:

1. Extend the drizzle-orm import (line 11) to include `inArray` and `asc`:

```typescript
import { eq, and, or, gte, lte, desc, asc, inArray, sql } from "drizzle-orm";
```

2. Extend the schema import (lines 3–9) with the sequence tables:

```typescript
import {
  sessionPlans,
  practiceTemplates,
  teams,
  seasons,
  programs,
  curriculumSequences,
  curriculumSequenceEntries,
} from "@/lib/db/schema";
```

3. Add below the other imports:

```typescript
import { computeSequenceProgress } from "@/lib/curriculum/sequence-instantiation";
```

4. In the GET handler, after the `sessions` query completes (after ~line 167) and before the final `return`, insert:

```typescript
    // Sequence progress for teams whose season carries an attached curriculum
    // sequence (Phase 3). Membership is derived by templateId match —
    // generated drafts are indistinguishable from coach-made plans by design.
    const seasonIds = [...new Set(coachTeams.map((t) => t.season.id))];
    const seasonSequences = await getDb()
      .select({
        seasonId: seasons.id,
        sequenceId: curriculumSequences.id,
        sequenceName: curriculumSequences.name,
      })
      .from(seasons)
      .innerJoin(
        curriculumSequences,
        eq(seasons.curriculumSequenceId, curriculumSequences.id),
      )
      .where(inArray(seasons.id, seasonIds));

    let sequenceProgress: {
      teamId: string;
      teamName: string;
      sequenceName: string;
      totalWeeks: number;
      completedWeeks: number;
      currentWeek: number;
      nextPlan: { id: string; title: string; scheduledDate: Date } | null;
    }[] = [];

    if (seasonSequences.length > 0) {
      const sequenceBySeason = new Map(seasonSequences.map((s) => [s.seasonId, s]));
      const sequenceIds = [...new Set(seasonSequences.map((s) => s.sequenceId))];
      const entryRows = await getDb()
        .select({
          sequenceId: curriculumSequenceEntries.sequenceId,
          templateId: curriculumSequenceEntries.templateId,
        })
        .from(curriculumSequenceEntries)
        .where(inArray(curriculumSequenceEntries.sequenceId, sequenceIds))
        .orderBy(asc(curriculumSequenceEntries.position));

      const teamsWithSequence = coachTeams.filter((t) =>
        sequenceBySeason.has(t.season.id),
      );
      const planRows = teamsWithSequence.length
        ? await getDb()
            .select({
              id: sessionPlans.id,
              teamId: sessionPlans.teamId,
              title: sessionPlans.title,
              templateId: sessionPlans.templateId,
              scheduledDate: sessionPlans.scheduledDate,
              status: sessionPlans.status,
            })
            .from(sessionPlans)
            .where(
              inArray(
                sessionPlans.teamId,
                teamsWithSequence.map((t) => t.id),
              ),
            )
        : [];

      const now = new Date();
      sequenceProgress = teamsWithSequence
        .map((team) => {
          const seq = sequenceBySeason.get(team.season.id)!;
          const templateIds = entryRows
            .filter((e) => e.sequenceId === seq.sequenceId)
            .map((e) => e.templateId);
          const progress = computeSequenceProgress(
            templateIds,
            planRows.filter((p) => p.teamId === team.id),
            now,
          );
          return {
            teamId: team.id,
            teamName: team.name,
            sequenceName: seq.sequenceName,
            ...progress,
          };
        })
        .filter((p) => p.totalWeeks > 0);
    }
```

5. Change the success response to include it:

```typescript
    return new Response(
      JSON.stringify({
        sessions,
        teams: coachTeams,
        sequenceProgress,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
```

- [ ] **Step 6: Add an API assertion for the progress payload**

Append inside the `describe("attach / detach - draft generation", ...)` block in `tests/api/admin/curriculum-sequences.test.ts`, directly after the first attach test (`it("attaches and generates …")`) so it runs while the season is still attached:

```typescript
  it("exposes sequence progress on the coach sessions endpoint", async () => {
    if (!sequenceId || !templateId) return;

    const sessions = await expectJson(
      await apiFetch(`/api/coach/sessions?teamId=${teamId}`, {
        method: "GET",
        cookie: coachCookie,
      }),
      200,
    );
    const progress = (sessions.sequenceProgress || []).find(
      (p: any) => p.teamId === teamId,
    );
    expect(progress).toBeDefined();
    expect(progress.totalWeeks).toBe(2);
    expect(progress.currentWeek).toBeGreaterThanOrEqual(1);
    expect(progress.sequenceName).toBe(sequenceName);
  });
```

Run: `npm run test:api -- tests/api/admin/curriculum-sequences.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 7: Render the strip in the practices overview**

In `src/components/coach/practices-overview.tsx`:

1. After the `SessionPlan` interface (~line 60), add:

```typescript
interface SequenceProgressItem {
  teamId: string
  teamName: string
  sequenceName: string
  totalWeeks: number
  completedWeeks: number
  currentWeek: number
  nextPlan: { id: string; title: string; scheduledDate: string } | null
}
```

2. In the component body, next to the other state (~line 100):

```typescript
  const [sequenceProgress, setSequenceProgress] = useState<SequenceProgressItem[]>([])
```

3. In `fetchData`, after `setTeams(data.teams || [])`:

```typescript
        setSequenceProgress(data.sequenceProgress || [])
```

4. In the JSX, between the Stats Cards grid and the Filters block, insert:

```tsx
      {/* Sequence progress (season plan pushed by the club) */}
      {sequenceProgress.length > 0 && (
        <section data-testid="sequence-progress" className="space-y-2">
          {sequenceProgress.map((p) => (
            <div key={p.teamId} className="p-4 rounded-xl bg-paper border border-border">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-sm font-medium text-ink truncate">
                  {p.teamName} — {p.sequenceName}
                </p>
                <span className="text-xs text-ink-muted shrink-0">
                  Week {p.currentWeek} of {p.totalWeeks}
                </span>
              </div>
              <div className="h-2 rounded-full bg-cream-2 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.round((p.completedWeeks / p.totalWeeks) * 100)}%` }}
                />
              </div>
              {p.nextPlan && (
                <a
                  href={`/coach/practices/${p.nextPlan.id}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Next: {p.nextPlan.title}
                  <ChevronRight className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </section>
      )}
```

(`ChevronRight` is already imported in this file.)

- [ ] **Step 8: Verify by hand and type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

With the dev server up, sign in as `coach@test.aspiresports.com` / `TestCoach123!` and open `/coach/practices`: if any of the coach's teams sits in a season with an attached sequence (Task 6's API test leaves one attached only transiently — re-attach via the admin UI if needed), the strip shows "Week N of M" with a working link to the next draft.

- [ ] **Step 9: Commit**

```bash
git add src/lib/curriculum/sequence-instantiation.ts tests/unit/sequence-instantiation.test.ts src/pages/api/coach/sessions/index.ts src/components/coach/practices-overview.tsx tests/api/admin/curriculum-sequences.test.ts
git commit -m "feat(coach): sequence progress strip on practices overview

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 9: Reference sequences — content file + loader step

**Files:**
- Modify: `src/lib/curriculum/content/types.ts` (append two interfaces)
- Create: `src/lib/curriculum/content/sequences.ts`
- Modify: `scripts/curriculum-load.ts` (add `applySequences` + wiring)
- Test: `tests/unit/curriculum-sequences-content.test.ts`

**Interfaces:**
- Consumes: `CURRICULUM_CONTENT` (`src/lib/curriculum/content/index.ts`), `curriculumSequences` / `curriculumSequenceEntries` (Task 1).
- Produces: `REFERENCE_SEQUENCES: SequenceContent[]`, `validateSequences(content: CurriculumContent, sequences: SequenceContent[]): string[]`, loader step `applySequences(db, orgId, sportMap, stageMap)`.

**Design note (spec left room here):** the program plan's file list says "extend `seed-curriculum.ts`", but that script seeds only reference tables (stages/domains/skills) and never touches `practice_templates` — sequence entries could not resolve their template FKs there. The mechanism that actually owns template rows is `scripts/curriculum-load.ts` (content-as-code loader, org-scoped, natural keys), so the reference sequences ship as a content file loaded by a new `applySequences` step. Sequences are deliberately NOT added to `CurriculumContent`/`planUpserts` — that diff machinery is exhaustively typed and extending it would balloon this task; `applySequences` does its own idempotent upsert on the `(sportId, name)` natural key and reports separately.

**Live sport/stage combos** (from `src/lib/curriculum/content/*/session-plans.ts` at plan-writing time): soccer fundamentals (6 plans), soccer skill-building (3), soccer development (2), basketball fundamentals (2), basketball skill-building (3), basketball development (2), hockey fundamentals (4) → **7 reference sequences**. Baseball has skills only (no session plans) — no sequence.

- [ ] **Step 1: Write the failing content-validation test**

Create `tests/unit/curriculum-sequences-content.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { CURRICULUM_CONTENT } from "@/lib/curriculum/content";
import {
  REFERENCE_SEQUENCES,
  validateSequences,
} from "@/lib/curriculum/content/sequences";

describe("reference curriculum sequences", () => {
  it("passes registry validation (all template names, sports, stages resolve)", () => {
    expect(validateSequences(CURRICULUM_CONTENT, REFERENCE_SEQUENCES)).toEqual([]);
  });

  it("covers every live sport/stage combo that has session plans", () => {
    const liveCombos = new Set(
      CURRICULUM_CONTENT.sessionPlans.map(
        (p) => `${p.sport}::${p.stage ?? "fundamentals"}`,
      ),
    );
    const coveredCombos = new Set(
      REFERENCE_SEQUENCES.map((s) => `${s.sport}::${s.stage}`),
    );
    for (const combo of liveCombos) {
      expect(
        coveredCombos.has(combo),
        `missing a reference sequence for ${combo}`,
      ).toBe(true);
    }
  });

  it("every sequence has at least two ordered entries", () => {
    for (const seq of REFERENCE_SEQUENCES) {
      expect(seq.entries.length, seq.name).toBeGreaterThanOrEqual(2);
    }
  });

  it("sequence names are unique per sport (loader natural key)", () => {
    const seen = new Set<string>();
    for (const seq of REFERENCE_SEQUENCES) {
      const key = `${seq.sport}::${seq.name}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/curriculum-sequences-content.test.ts`
Expected: FAIL — `Cannot find module '@/lib/curriculum/content/sequences'`.

- [ ] **Step 3: Add the content types**

Append to `src/lib/curriculum/content/types.ts`:

```typescript
export interface SequenceEntryContent {
  /** SessionPlanContent.name of the same sport — the loader resolves it to a
   * practice_templates row via the (sportId, name) natural key. */
  template: string;
  objectives?: string[];
  notes?: string;
}

export interface SequenceContent {
  /** Natural key with sport (curriculum_sequences_sport_name_uniq). */
  name: string;
  sport: string; // sport slug: "soccer" | "basketball" | "hockey"
  stage: string; // StageContent.slug
  programType: "league" | "class" | "camp" | "clinic";
  description: string;
  /** Array order = position 1..N (entry N → Nth practice date). */
  entries: SequenceEntryContent[];
}
```

- [ ] **Step 4: Write the reference sequences + validator**

Create `src/lib/curriculum/content/sequences.ts`:

```typescript
// Reference curriculum sequences — one per live sport/stage combo that has
// session-plan content (Phase 3 seed, so the sequencing feature isn't empty
// on ship). Entry order follows the pedagogical arc of the underlying
// session-plan content files; every `template` string must exactly match a
// SessionPlanContent.name of the same sport (validated by validateSequences
// and enforced at load time by the (sportId, name) template lookup).
//
// Deliberately NOT part of CURRICULUM_CONTENT/planUpserts — the loader's
// applySequences step (scripts/curriculum-load.ts) upserts these directly
// on the curriculum_sequences (sportId, name) natural key.

import type { CurriculumContent, SequenceContent } from "./types";

export const REFERENCE_SEQUENCES: SequenceContent[] = [
  {
    name: "Soccer Fundamentals — 6-Week League Block",
    sport: "soccer",
    stage: "fundamentals",
    programType: "league",
    description:
      "A six-week arc for ages 6–8: from first-day team building through ball mastery, dribbling, and first passing, ending with the pre-game routine before the season's first match.",
    entries: [
      {
        template: "First Day of Season - Getting Started Right",
        objectives: ["Learn every player's name", "Establish the fun-and-safe team culture"],
      },
      {
        template: "Ball Mastery Session - Individual Ball Control",
        objectives: ["Maximize individual touches", "Build comfort with the ball"],
      },
      {
        template: "Dribbling Adventures - Learning to Move with the Ball",
        objectives: ["Dribble with the ball close under light pressure"],
      },
      {
        template: "Ball Mastery Fun Session",
        objectives: ["Reinforce ball control through games"],
      },
      {
        template: "First Passing Session",
        objectives: ["Introduce inside-of-foot passing with a partner"],
      },
      {
        template: "Game Day Warmup - Pre-Game Routine",
        objectives: ["Rehearse the pre-game routine before the first match"],
        notes: "Schedule this the week of the first game.",
      },
    ],
  },
  {
    name: "Soccer Skill Building — 3-Week Technical Block",
    sport: "soccer",
    stage: "skill-building",
    programType: "league",
    description:
      "Three weeks for ages 9–10: receiving under pressure, attacking combinations, then defending principles.",
    entries: [
      {
        template: "Technical Skills: Receiving",
        objectives: ["Control with the first touch away from pressure"],
      },
      {
        template: "Attacking Combinations",
        objectives: ["Combine in pairs and threes to break lines"],
      },
      {
        template: "Defending Principles",
        objectives: ["Pressure, cover, and delay as a unit"],
      },
    ],
  },
  {
    name: "Soccer Development — 2-Week Tactical Block",
    sport: "soccer",
    stage: "development",
    programType: "league",
    description:
      "Two weeks for ages 11–12: building out from the back, then finishing.",
    entries: [
      {
        template: "Playing Out from the Back",
        objectives: ["Build attacks from the goalkeeper under pressure"],
      },
      {
        template: "Finishing Session",
        objectives: ["Finish from realistic game situations"],
      },
    ],
  },
  {
    name: "Basketball Fundamentals — 2-Week Intro Block",
    sport: "basketball",
    stage: "fundamentals",
    programType: "league",
    description:
      "Two weeks for ages 6–8: ball-handling basics through play, then shooting form.",
    entries: [
      {
        template: "Basketball Basics Fun",
        objectives: ["Build comfort dribbling and passing through games"],
      },
      {
        template: "Shooting Fundamentals",
        objectives: ["Learn basic shooting form with lots of successes"],
      },
    ],
  },
  {
    name: "Basketball Skill Building — 3-Week Block",
    sport: "basketball",
    stage: "skill-building",
    programType: "league",
    description:
      "Three weeks for ages 9–10: ball handling, team offense basics, then defense.",
    entries: [
      {
        template: "Ball Handling Development",
        objectives: ["Handle the ball with either hand under pressure"],
      },
      {
        template: "Team Offense Basics",
        objectives: ["Move without the ball; catch and face"],
      },
      {
        template: "Defense Development",
        objectives: ["Defensive stance, slides, and help positioning"],
      },
    ],
  },
  {
    name: "Basketball Development — 2-Week Block",
    sport: "basketball",
    stage: "development",
    programType: "league",
    description:
      "Two weeks for ages 11–12: transition offense, then advanced shooting.",
    entries: [
      {
        template: "Transition Offense",
        objectives: ["Convert stops into fast-break chances"],
      },
      {
        template: "Advanced Shooting",
        objectives: ["Shoot off the move and off the dribble"],
      },
    ],
  },
  {
    name: "Hockey Fundamentals — 4-Week Cross-Ice Block",
    sport: "hockey",
    stage: "fundamentals",
    programType: "league",
    description:
      "Four cross-ice weeks for ages 6–8: skating comfort, puck control, passing and support, then small-area games that put it all together.",
    entries: [
      {
        template: "First Skate Comfort - Cross-Ice Confidence Day",
        objectives: ["Build skating confidence and falling-safely habits"],
      },
      {
        template: "Puck Control Stations - Building Comfort with the Puck",
        objectives: ["Maximize puck touches at stations"],
      },
      {
        template: "Passing & Support - Moving the Puck as a Team",
        objectives: ["Pass and move to support the puck carrier"],
      },
      {
        template: "Small-Area Games Day - Everything Together",
        objectives: ["Apply skating, puck control, and passing in games"],
      },
    ],
  },
];

/**
 * Validates the reference sequences against the content registry. Returns
 * human-readable violation messages; empty means valid. Mirrors the style of
 * validateRegistry in ./index.ts.
 */
export function validateSequences(
  content: CurriculumContent,
  sequences: SequenceContent[],
): string[] {
  const violations: string[] = [];
  const stageSlugs = new Set(content.stages.map((s) => s.slug));
  const planNamesBySport = new Map<string, Set<string>>();
  for (const plan of content.sessionPlans) {
    if (!planNamesBySport.has(plan.sport)) {
      planNamesBySport.set(plan.sport, new Set());
    }
    planNamesBySport.get(plan.sport)!.add(plan.name);
  }

  const keySeen = new Set<string>();
  for (const seq of sequences) {
    const key = `${seq.sport}::${seq.name}`;
    if (keySeen.has(key)) {
      violations.push(`Duplicate sequence name "${seq.name}" for sport "${seq.sport}"`);
    }
    keySeen.add(key);

    if (!planNamesBySport.has(seq.sport)) {
      violations.push(
        `Sequence "${seq.name}" references sport "${seq.sport}" with no session plans`,
      );
    }
    if (!stageSlugs.has(seq.stage)) {
      violations.push(`Sequence "${seq.name}" references unknown stage "${seq.stage}"`);
    }
    if (seq.entries.length === 0) {
      violations.push(`Sequence "${seq.name}" has no entries`);
    }
    const sportPlans = planNamesBySport.get(seq.sport) ?? new Set<string>();
    for (const entry of seq.entries) {
      if (!sportPlans.has(entry.template)) {
        violations.push(
          `Sequence "${seq.name}" entry references unknown template "${entry.template}" (sport ${seq.sport})`,
        );
      }
    }
  }
  return violations;
}
```

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/curriculum-sequences-content.test.ts`
Expected: PASS (4 tests). If the coverage test fails, a session-plan content file gained a new sport/stage combo since this plan was written — add a reference sequence for it following the pattern above.

- [ ] **Step 6: Wire the loader**

In `scripts/curriculum-load.ts`:

1. Extend the schema imports at the top of the file with `curriculumSequences, curriculumSequenceEntries` (they live in the same `@/lib/db/schema`-style import block the script already uses for `practiceTemplates` — match its existing import path style exactly; the script imports directly from `../src/lib/db/schema` or similar).
2. Add to the content imports:

```typescript
import {
  REFERENCE_SEQUENCES,
  validateSequences,
} from "../src/lib/curriculum/content/sequences";
```

(Match the relative-path style of the file's existing `CURRICULUM_CONTENT` import.)

3. Add the apply function next to `applyTemplates` (~line 662):

```typescript
async function applySequences(
  db: DB,
  orgId: string,
  sportMap: SlugMap,
  stageMap: SlugMap,
): Promise<void> {
  for (const seq of REFERENCE_SEQUENCES) {
    const sportId = sportMap.get(seq.sport);
    if (!sportId) {
      throw new Error(`Cannot resolve sport for sequence "${seq.name}" (sport=${seq.sport})`);
    }
    const stageId = stageMap.get(seq.stage);
    if (!stageId) {
      throw new Error(`Cannot resolve stage "${seq.stage}" for sequence "${seq.name}"`);
    }

    // Resolve entry templates via the (sportId, name) natural key — the same
    // key applyTemplates upserts on, so a full run is always self-consistent.
    const templateNames = seq.entries.map((e) => e.template);
    const templateRows = await db
      .select({ id: practiceTemplates.id, name: practiceTemplates.name })
      .from(practiceTemplates)
      .where(
        and(
          eq(practiceTemplates.sportId, sportId),
          inArray(practiceTemplates.name, templateNames),
        ),
      );
    const templateIdByName = new Map(templateRows.map((t) => [t.name, t.id]));
    for (const name of templateNames) {
      if (!templateIdByName.has(name)) {
        throw new Error(
          `Sequence "${seq.name}": template "${name}" not found for sport ${seq.sport} — run order guarantees applyTemplates ran first, so this means a content mismatch`,
        );
      }
    }

    const set = {
      organizationId: orgId,
      developmentStageId: stageId,
      programType: seq.programType,
      description: seq.description,
      updatedAt: new Date(),
    };
    const [row] = await db
      .insert(curriculumSequences)
      .values({ sportId, name: seq.name, ...set })
      .onConflictDoUpdate({
        target: [curriculumSequences.sportId, curriculumSequences.name],
        set,
      })
      .returning({ id: curriculumSequences.id });

    // Entries are replaced wholesale — order in the content file is the
    // authoritative position 1..N.
    await db
      .delete(curriculumSequenceEntries)
      .where(eq(curriculumSequenceEntries.sequenceId, row.id));
    await db.insert(curriculumSequenceEntries).values(
      seq.entries.map((e, i) => ({
        sequenceId: row.id,
        position: i + 1,
        templateId: templateIdByName.get(e.template)!,
        objectives: e.objectives ?? null,
        notes: e.notes ?? null,
      })),
    );
  }
  console.log(
    `  curriculum_sequences: ${REFERENCE_SEQUENCES.length} upserted (entries replaced)`,
  );
}
```

(If `inArray` is not already imported from drizzle-orm in this script, add it to the existing drizzle import.)

4. In `main()`:
   - After the existing `validateRegistry` refusal block, add the same pattern for sequences:

```typescript
  const sequenceViolations = validateSequences(CURRICULUM_CONTENT, REFERENCE_SEQUENCES);
  if (sequenceViolations.length > 0) {
    console.error("REFUSED: reference sequences failed validation:");
    for (const v of sequenceViolations) console.error(`  - ${v}`);
    process.exit(2);
  }
```

   - Add sequence sports to the `sportSlugs` union:

```typescript
      ...REFERENCE_SEQUENCES.map((s) => s.sport),
```

   - After the `await applyTemplates(db, org.id, sportMap, stageMap);` call, add:

```typescript
  await applySequences(db, org.id, sportMap, stageMap);
```

- [ ] **Step 7: Dry-run the loader end to end against staging**

Run: `./scripts/with-bws.sh npx tsx scripts/curriculum-load.ts --dry-run` (check the script's `parseArgs` for the exact `--org` flag it requires — pass the same org slug used in previous loads, e.g. the one documented in the script header).
Expected: validation passes, report prints, exits 0 without writing.

Then a real run: `./scripts/with-bws.sh npx tsx scripts/curriculum-load.ts --org <same-org-slug>`
Expected: ends with `curriculum_sequences: 7 upserted (entries replaced)` then `Load complete.` Run it twice — second run must produce identical results (idempotent).

- [ ] **Step 8: Run all unit tests**

Run: `npm run test:unit`
Expected: PASS, including both new files.

- [ ] **Step 9: Commit**

```bash
git add src/lib/curriculum/content/types.ts src/lib/curriculum/content/sequences.ts scripts/curriculum-load.ts tests/unit/curriculum-sequences-content.test.ts
git commit -m "feat(curriculum): seed 7 reference sequences via the content loader

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Full verification, E2E accounting, ship

**Files:** none created; runs the full pre-push checklist (this phase touches schema + endpoints + a coach surface → "major work" per CLAUDE.md).

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Unit tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 3: Re-seed e2e fixtures, then run the full API suite**

With the dev server running (`E2E_TEST_ENDPOINTS=yes R2_MOCK=1 CRON_SECRET=<anything> npm run dev:bws`):

```bash
npm run db:seed:e2e
CRON_SECRET=<same-as-dev-server> TEST_BASE_URL=http://localhost:4321 npm run test:api
```

Expected: green, modulo the 2 known pre-existing staging data-state API failures (triage by file overlap: anything touching curriculum/sequences/sessions/seasons files is yours to fix; known-failure files unrelated to this branch are not).

- [ ] **Step 4: E2E accounting (post-merge `test-full` runs these, PRs do not)**

Run: `grep -rln "curriculum\|practices\|/coach" tests/e2e/`
At plan-writing time the only spec touching this surface is `tests/e2e/coach-dashboard.spec.ts`, whose "shows upcoming sessions or practices" test matches `text=/upcoming|schedule|session|practice/i` on `/coach` — unaffected by this phase (we changed `/coach/practices` and its API, not the dashboard copy). Verify no new specs appeared, then run the affected spec locally as insurance:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- coach-dashboard.spec.ts
```

Expected: PASS (modulo the 4 known pre-existing staging-data Playwright failures if they overlap — they should not for this spec).

- [ ] **Step 5: Production build**

Run: `./scripts/with-bws.sh npm run build`
Expected: build succeeds. The `Astro.request.headers … prerendered pages` warnings are known noise (see CLAUDE.md); anything else is yours.

- [ ] **Step 6: Migration hygiene re-check before PR**

Re-check `ls src/lib/db/migrations/*.sql | tail -3` against `origin/main` — if Phase 1's 0063/0064 merged while this phase was in flight, rebase, renumber this branch's migration to follow theirs (rename the file AND fix its `meta/_journal.json` entry), and re-run `./scripts/with-bws.sh npm run db:migrate` to confirm.

- [ ] **Step 7: Ship**

Invoke the `/ship` skill for the routine push automation, open the PR against `main`, and wait for CI to go green on the pushed commit — a push isn't "done" until then. After merge, watch the post-merge `test-full` job (coach-surface E2E only runs there).

PR body should note: schema migration included (two tables + seasons column, idempotent), reference-sequence seed requires a `curriculum-load` run per org (done for staging in Task 9; prod needs the same run post-merge — coordinate with the curriculum-refinery loop's conventions).

```bash
git push -u origin <branch>
gh pr create --title "Phase 3: season-level session-plan sequencing (push, not pull)" --body "..."
```

---

## Self-review (performed at plan-writing time)

- **Spec coverage:** tables exactly as specified (Task 1); admin authoring UI with move up/down, no drag-drop (Task 7); nullable `curriculumSequenceId` on seasons via the column-not-join-table YAGNI option the spec endorsed (Task 1); recurrence-input draft generation as a pure function in `src/lib/curriculum/sequence-instantiation.ts` with DST and count>weeks unit tests plus a thin endpoint trigger (Tasks 2, 3, 6); drafts are `status: 'draft'` with `templateId` set and segments copied (Task 3); coach practices overview shows assigned drafts (already listed — they're ordinary rows) + progress strip (Task 8); one reference sequence per live sport/stage combo (Task 9); deletion/detachment leaves drafts intact — enforced by construction (no FK from session_plans to sequences) and asserted by API tests (Task 6); tenant-scoping API tests (Tasks 4–6). Scope-out honored: no games/venue sync, no per-player differentiation, no camp day themes, no roster-change regeneration.
- **Placeholder scan:** every code step contains complete code; no TBD/TODO/"similar to Task N".
- **Type consistency:** `RecurrenceInput`/`GeneratedDates` (Task 2) consumed verbatim in Task 6; `SequenceEntryForBuild`/`TemplateForBuild`/`DraftSessionPlan` (Task 3) match the attach endpoint's select shapes and `session_plans` insert columns; `computeSequenceProgress` signature identical in Task 8's endpoint and unit tests; endpoint response field names (`entryCount`, `results[].created`, `teamsWithoutCoach`, `truncatedBySeasonEnd`, `sequenceProgress[].nextPlan`) match between endpoints, tests, and the two React components.

## Execution handoff

Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task with two-stage review between tasks (`superpowers:subagent-driven-development`). Remember: absolute worktree paths in every dispatch.

**2. Inline Execution** — execute tasks in one session with checkpoints (`superpowers:executing-plans`).
