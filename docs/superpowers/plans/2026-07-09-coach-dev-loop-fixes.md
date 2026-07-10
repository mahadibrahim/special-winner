# Coach Development-Loop Fixes (D3–D6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Fix the verified coach development-loop defects: make the assessment write pipeline atomic and duplicate-proof (D5), unbreak the assessment entry dead-end (D3), fix practice-tool papercuts (D4), and close tenancy/validation gaps across the coach APIs (D6).

## Architecture

Astro 5 SSR app with React 19 islands; API routes live in `src/pages/api/**` and return JSON. PostgreSQL via Drizzle ORM (`getDb()` from `@/lib/db`); auth is Lucia session-based with role helpers in `src/lib/auth/roles.ts` (`requireCoachAccess`, `requireCoachPortalAccess` — the latter also resolves `organizationId`). Curriculum tables (`skills`, `activities`, `practice_templates`) carry a nullable `organizationId` where NULL means "global seed"; the admin endpoints already scope reads with `or(eq(...organizationId, auth.organizationId), isNull(...organizationId))` and coach endpoints must now do the same.

## Tech Stack

- Astro 5 (SSR, Netlify), React 19, TypeScript (strict; `npx tsc --noEmit` must stay at zero errors)
- Drizzle ORM + postgres-js, PostgreSQL (Railway); migrations via `drizzle-kit generate` + `scripts/db-migrate.ts`
- Zod for request validation; sonner for toasts; shared UI primitives in `src/components/ui/`
- Vitest: API tests in `tests/api/**` hit a running dev server over HTTP; unit tests in `tests/unit/**`

## Global Constraints

- **Branch:** all work on `fix/coach-dev-loop` off `main`. Commit after every task, conventional messages, each commit message ends with the trailer line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (use `git commit -m "<subject>" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`).
- **Worktree:** all work happens in `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/coach-dev-loop` (already on `fix/coach-dev-loop`). Use absolute paths; do NOT cd to the main checkout.
- **Dev server for API tests:** start once in the background before any API-test step, FROM THE WORKTREE: `R2_MOCK=1 CRON_SECRET=testsecret ./scripts/with-bws.sh npm run dev` (listens on `http://localhost:4321`). Run API tests with `CRON_SECRET=testsecret TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api <file>`. Per `CLAUDE.md`, a mismatched `CRON_SECRET` between server and test shell manifests as spurious 401s — always match them.
- **Test conventions:** copy `tests/api/coach/attendance.test.ts` / `tests/api/coach/assessments.test.ts` exactly — helpers from `../setup/test-helpers` (`getCoachCookie`, `getParentCookie`, `apiFetch`, `expectJson`, `resetCookies`); test accounts `coach@test.aspiresports.com` / `TestCoach123!` and `parent@test.aspiresports.com` / `TestParent123!`. If fixtures are missing (no roster), run `npm run db:seed:e2e` first. API test files may also import `getDb()` directly (see `tests/api/coach/assessment-snapshots.test.ts`).
- **Migrations:** idempotent SQL (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$;` — see `0073_charming_karen_page.sql` for the in-repo convention comment). Generate with `npm run db:generate` (updates `meta/_journal.json` + snapshot), then hand-edit the SQL. **Never `npm run db:push`.** Apply locally with `./scripts/with-bws.sh npm run db:migrate`.
- **Query discipline:** any `findFirst` / `.limit(1)` MUST carry an explicit `orderBy` (shared CI DB has accumulated rows; see `CLAUDE.md` "Multi-tenant query hazards").
- **UI:** use `ErrorBanner` / `EmptyState` / `LoadingSkeleton` from `@/components/ui/*` for persistent states; `toast.error(...)` from `sonner` (import `{ toast } from "sonner"`; `<AppToaster>` is already mounted in `BaseLayout.astro:114`) for transient action failures.
- **Out of scope:** DO NOT touch `src/pages/api/coach/games/**` (score/standings endpoint — removed in Plan 3). Do not merge the PR.

---

## Task 1 — D5: `player_skill_summary` unique index migration + atomic upsert

The summary write in `POST /api/coach/assessments` is read-then-insert with no unique constraint (`src/pages/api/coach/assessments/index.ts:278-320`), so concurrent posts create duplicate `(family_member_id, skill_id)` rows.

**Files**
- Modify: `src/lib/db/schema/assessments.ts` (lines 122–138, `playerSkillSummary` table)
- Create: `src/lib/db/migrations/0075_*.sql` (generated, then hand-edited) + auto-updated `src/lib/db/migrations/meta/_journal.json` and snapshot
- Modify: `src/pages/api/coach/assessments/index.ts` (lines 277–320 → single upsert; also line 13 imports)
- Test: `tests/api/coach/skill-summary-upsert.test.ts` (create)

**Interfaces**
- Consumes: `playerSkillSummary` table (`src/lib/db/schema/assessments.ts`), `getDb(): Database` (`src/lib/db/index.ts:66`)
- Produces: DB unique index `player_skill_summary_member_skill_uniq` on `(family_member_id, skill_id)`; `POST /api/coach/assessments` → unchanged response contract (`201 { assessment }`)

**Steps**

- [ ] Confirm the branch: `git branch --show-current` → `fix/coach-dev-loop` (the worktree is already on it)
- [ ] Write the failing test `tests/api/coach/skill-summary-upsert.test.ts`:

```ts
/**
 * D5: player_skill_summary must be unique per (family_member_id, skill_id).
 * Before migration 0075 the duplicate insert below succeeds (test fails);
 * after it, the second insert violates the unique index.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asc, and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { playerSkillSummary } from "@/lib/db/schema/assessments";
import { familyMembers } from "@/lib/db/schema/registrations";
import { skills } from "@/lib/db/schema/curriculum";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("player_skill_summary uniqueness (D5)", () => {
  let coachCookie: string;
  let playerId: string;
  let sportId: string;
  let skillId: string | null = null;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();

    const playersRes = await apiFetch("/api/coach/players", {
      method: "GET",
      cookie: coachCookie,
    });
    const playersJson = await expectJson(playersRes, 200);
    const player = playersJson.players.find((p: any) => p.team?.sport?.id);
    expect(player).toBeDefined();
    playerId = player.id;
    sportId = player.team.sport.id;

    const skillsRes = await apiFetch(`/api/coach/skills?sportId=${sportId}`, {
      method: "GET",
      cookie: coachCookie,
    });
    const skillsJson = await expectJson(skillsRes, 200);
    if (skillsJson.skills?.length > 0) {
      skillId = skillsJson.skills[0].id;
    }
  });

  afterAll(() => {
    resetCookies();
  });

  it("DB rejects a duplicate (family_member_id, skill_id) summary row", async () => {
    if (!skillId) {
      console.warn("Skipping: no skills loaded for coach's sport");
      return;
    }
    const db = getDb();
    const now = new Date();
    const insertedIds: string[] = [];
    let firstError: unknown = null;
    let secondError: unknown = null;

    const values = {
      familyMemberId: playerId,
      skillId,
      currentLevel: 3,
      highestLevel: 3,
      assessmentCount: 1,
      trend: "new" as const,
      firstAssessedAt: now,
      lastAssessedAt: now,
    };

    try {
      const [row] = await db.insert(playerSkillSummary).values(values).returning({ id: playerSkillSummary.id });
      insertedIds.push(row.id);
    } catch (e) {
      firstError = e;
    }
    try {
      const [row] = await db.insert(playerSkillSummary).values(values).returning({ id: playerSkillSummary.id });
      insertedIds.push(row.id);
    } catch (e) {
      secondError = e;
    }

    // Cleanup only what this test inserted.
    for (const id of insertedIds) {
      await db.delete(playerSkillSummary).where(eq(playerSkillSummary.id, id));
    }

    // At least one of the two inserts must have hit the unique index.
    expect(firstError !== null || secondError !== null).toBe(true);
  });

  it("posting the same skill twice yields exactly one summary row", async () => {
    if (!skillId) {
      console.warn("Skipping: no skills loaded for coach's sport");
      return;
    }
    for (const level of [2, 4]) {
      const res = await apiFetch("/api/coach/assessments", {
        method: "POST",
        cookie: coachCookie,
        body: JSON.stringify({ familyMemberId: playerId, skillId, level }),
      });
      await expectJson(res, 201);
    }

    const detailRes = await apiFetch(`/api/coach/players/${playerId}/assessments`, {
      method: "GET",
      cookie: coachCookie,
    });
    const detail = await expectJson(detailRes, 200);
    const matching = detail.summaries.filter((s: any) => s.skillId === skillId);
    expect(matching.length).toBe(1);
    expect(matching[0].currentLevel).toBe(4);
    expect(matching[0].highestLevel).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] Run it and confirm the first `it` fails (duplicate insert currently succeeds): `CRON_SECRET=testsecret TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/coach/skill-summary-upsert.test.ts` — expect `expect(firstError !== null || secondError !== null).toBe(true)` to fail with `false`.
- [ ] In `src/lib/db/schema/assessments.ts`, convert `playerSkillSummary` (lines 122–138) to the two-argument form with a unique index (mirror the `assessmentSnapshots` pattern at lines 88–119; `uniqueIndex` is already imported at line 10):

```ts
// Player Skill Summary (current state per skill for quick lookups)
export const playerSkillSummary = pgTable(
  "player_skill_summary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    currentLevel: integer("current_level").notNull(), // Most recent assessment level
    highestLevel: integer("highest_level").notNull(), // Best level achieved
    assessmentCount: integer("assessment_count").default(1).notNull(),
    trend: trendDirectionEnum("trend").default("new").notNull(),
    firstAssessedAt: timestamp("first_assessed_at").notNull(),
    lastAssessedAt: timestamp("last_assessed_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Natural key for the assessment-write upsert (D5): one summary row per
    // family member × skill. Migration 0075 dedupes pre-existing rows.
    uniqueIndex("player_skill_summary_member_skill_uniq").on(
      table.familyMemberId,
      table.skillId,
    ),
  ],
);
```

- [ ] Run `npm run db:generate` — it creates `src/lib/db/migrations/0075_<name>.sql`, a snapshot, and a `_journal.json` entry. Then **hand-edit the generated SQL** (drizzle emits a bare `CREATE UNIQUE INDEX`, which fails on duplicates and is not idempotent) to exactly:

```sql
-- Idempotent (0023/0024/0044/0070/0073 convention). Dedupe existing rows
-- before creating the unique index: for each (family_member_id, skill_id)
-- pair keep the most recently updated row (ties broken by larger id) and
-- delete the rest — race-created duplicates otherwise abort index creation.
DELETE FROM "player_skill_summary" a
USING "player_skill_summary" b
WHERE a.family_member_id = b.family_member_id
  AND a.skill_id = b.skill_id
  AND (a.updated_at < b.updated_at
    OR (a.updated_at = b.updated_at AND a.id < b.id));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "player_skill_summary_member_skill_uniq" ON "player_skill_summary" USING btree ("family_member_id","skill_id");
```

- [ ] Apply it: `./scripts/with-bws.sh npm run db:migrate`. Confirm output shows the migration applied without error.
- [ ] In `src/pages/api/coach/assessments/index.ts`, add `sql` to the drizzle import (line 13): `import { eq, and, desc, inArray, sql } from "drizzle-orm";` and replace the whole read-then-insert block (lines 277–320, from `// Update or create player skill summary` through the closing `}` of the `else` branch) with a single upsert:

```ts
    // Upsert the player skill summary (unique on family_member_id + skill_id,
    // migration 0075). In DO UPDATE, table-qualified columns refer to the
    // existing row, so trend/highest/count derive from prior state atomically.
    const now = new Date();
    await getDb()
      .insert(playerSkillSummary)
      .values({
        familyMemberId,
        skillId,
        currentLevel: level,
        highestLevel: level,
        assessmentCount: 1,
        trend: "new",
        firstAssessedAt: now,
        lastAssessedAt: now,
      })
      .onConflictDoUpdate({
        target: [playerSkillSummary.familyMemberId, playerSkillSummary.skillId],
        set: {
          currentLevel: level,
          highestLevel: sql`GREATEST(${playerSkillSummary.highestLevel}, ${level})`,
          assessmentCount: sql`${playerSkillSummary.assessmentCount} + 1`,
          trend: sql`CASE
            WHEN ${level} > ${playerSkillSummary.currentLevel} THEN 'improving'::trend_direction
            WHEN ${level} < ${playerSkillSummary.currentLevel} THEN 'declining'::trend_direction
            ELSE 'stable'::trend_direction
          END`,
          lastAssessedAt: now,
          updatedAt: now,
        },
      });
```

- [ ] Run the test file again — both tests pass. Run `npx tsc --noEmit` — zero errors.
- [ ] Commit: `git add -A && git commit -m "fix(coach): dedupe player_skill_summary and upsert atomically" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 2 — D5: validate `seasonId` and make the assessment write one transaction

`seasonId` is never validated (`src/pages/api/coach/assessments/index.ts:22`, inserted bare at line 257), and a failed `recomputePlayerSnapshots` is swallowed (lines 268–275) while the coach still gets 201 — silently stale radar data. The "must never fail the assessment write" comment is obsolete.

**Files**
- Modify: `src/lib/curriculum/snapshots.ts` (lines 93–102: signature)
- Modify: `src/pages/api/coach/assessments/index.ts` (POST handler, lines 155–333)
- Test: `tests/api/coach/assessment-season-validation.test.ts` (create)

**Interfaces**
- Consumes: `recomputePlayerSnapshots(db, familyMemberId, seasonId)` (`src/lib/curriculum/snapshots.ts:93`); `teams.seasonId` (`src/lib/db/schema/teams.ts`); `requireCoachAccess(context)` → `{ authorized: true; user; teamIds: string[] }` (`src/lib/auth/roles.ts:275`)
- Produces: new signature `recomputePlayerSnapshots(db: SnapshotDb, familyMemberId: string, seasonId: string | null): Promise<{ domainsWritten: number }>` where `export type SnapshotDb = Database | Parameters<Parameters<Database["transaction"]>[0]>[0]`; `POST /api/coach/assessments` → `400 { error }` on invalid seasonId, `500` (rolled back) if snapshot recompute fails.

**Steps**

- [ ] Write the failing test `tests/api/coach/assessment-season-validation.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("POST /api/coach/assessments seasonId validation (D5)", () => {
  let coachCookie: string;
  let playerId: string;
  let skillId: string | null = null;
  let realSeasonId: string | undefined;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const playersRes = await apiFetch("/api/coach/players", {
      method: "GET",
      cookie: coachCookie,
    });
    const playersJson = await expectJson(playersRes, 200);
    const player = playersJson.players.find((p: any) => p.team?.sport?.id);
    expect(player).toBeDefined();
    playerId = player.id;
    realSeasonId = player.team?.season?.id;

    const skillsRes = await apiFetch(
      `/api/coach/skills?sportId=${player.team.sport.id}`,
      { method: "GET", cookie: coachCookie }
    );
    const skillsJson = await expectJson(skillsRes, 200);
    if (skillsJson.skills?.length > 0) skillId = skillsJson.skills[0].id;
  });

  afterAll(() => resetCookies());

  it("rejects a seasonId that no coach team plays in (400)", async () => {
    if (!skillId) return console.warn("Skipping: no skills loaded");
    const res = await apiFetch("/api/coach/assessments", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        familyMemberId: playerId,
        skillId,
        level: 3,
        seasonId: randomUUID(),
      }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts the coach team's real seasonId (201)", async () => {
    if (!skillId || !realSeasonId) return console.warn("Skipping: fixtures missing");
    const res = await apiFetch("/api/coach/assessments", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        familyMemberId: playerId,
        skillId,
        level: 3,
        seasonId: realSeasonId,
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.assessment.seasonId).toBe(realSeasonId);
  });

  it("still accepts an assessment without seasonId (201)", async () => {
    if (!skillId) return console.warn("Skipping: no skills loaded");
    const res = await apiFetch("/api/coach/assessments", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ familyMemberId: playerId, skillId, level: 3 }),
    });
    await expectJson(res, 201);
  });
});
```

- [ ] Run it — the first test fails (bogus seasonId currently returns 201, or 500 on FK violation, not 400).
- [ ] In `src/lib/curriculum/snapshots.ts`, widen the executor type. Replace lines 93–97 (`export async function recomputePlayerSnapshots(db: Database, ...`) with:

```ts
/**
 * Executor type: a plain Database or an open drizzle transaction. When a tx
 * is passed, the internal `transaction()` call below opens a SAVEPOINT, so
 * the caller's transaction still rolls everything back on error.
 */
export type SnapshotDb =
  | Database
  | Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function recomputePlayerSnapshots(
  db: SnapshotDb,
  familyMemberId: string,
  seasonId: string | null,
): Promise<{ domainsWritten: number }> {
  if (seasonId === null) {
    return { domainsWritten: 0 };
  }

  return (db as Database).transaction(async (tx) => {
```

(The `as Database` cast avoids a union-call type error; `PgTransaction.transaction` has the same runtime signature and creates a savepoint. Keep the rest of the function body unchanged.)
- [ ] Rewrite the POST handler in `src/pages/api/coach/assessments/index.ts`. Update imports: line 3–12 schema import gains `teams`; line 13 becomes `import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";`. Then, inside POST:
  1. After the `isPlayerOnCoachTeam` check (line 201–207), insert the seasonId validation:

```ts
    // seasonId must be a season one of this coach's teams plays in — an
    // arbitrary (even cross-org) season id would otherwise be written bare.
    if (seasonId) {
      const [seasonTeam] = await db
        .select({ id: teams.id })
        .from(teams)
        .where(and(inArray(teams.id, auth.teamIds), eq(teams.seasonId, seasonId)))
        .orderBy(asc(teams.id))
        .limit(1);

      if (!seasonTeam) {
        return new Response(
          JSON.stringify({ error: "Invalid seasonId - not a season your teams play in" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }
```

  2. Replace everything from the previous-assessment lookup (line 236) through the summary upsert (end of the Task 1 block) with one transaction. Also add the missing `desc(playerAssessments.id)` tiebreak (limit(1) orderBy rule):

```ts
    // Assessment insert + snapshot recompute + summary upsert are ONE unit.
    // If the snapshot recompute throws, everything rolls back and the coach
    // gets a 500 they can retry — a failed write beats a silently stale radar.
    const newAssessment = await db.transaction(async (tx) => {
      const [previousAssessment] = await tx
        .select({ level: playerAssessments.level })
        .from(playerAssessments)
        .where(
          and(
            eq(playerAssessments.familyMemberId, familyMemberId),
            eq(playerAssessments.skillId, skillId)
          )
        )
        .orderBy(desc(playerAssessments.assessedAt), desc(playerAssessments.id))
        .limit(1);

      const previousLevel = previousAssessment?.level ?? null;

      const [created] = await tx
        .insert(playerAssessments)
        .values({
          familyMemberId,
          skillId,
          teamId: teamId || null,
          seasonId: seasonId || null,
          coachUserId: auth.user.id,
          level,
          previousLevel,
          observationContext,
          notes: notes || null,
          strengths: strengths || null,
          areasForImprovement: areasForImprovement || null,
        })
        .returning();

      await recomputePlayerSnapshots(tx, familyMemberId, seasonId ?? null);

      const now = new Date();
      await tx
        .insert(playerSkillSummary)
        .values({
          familyMemberId,
          skillId,
          currentLevel: level,
          highestLevel: level,
          assessmentCount: 1,
          trend: "new",
          firstAssessedAt: now,
          lastAssessedAt: now,
        })
        .onConflictDoUpdate({
          target: [playerSkillSummary.familyMemberId, playerSkillSummary.skillId],
          set: {
            currentLevel: level,
            highestLevel: sql`GREATEST(${playerSkillSummary.highestLevel}, ${level})`,
            assessmentCount: sql`${playerSkillSummary.assessmentCount} + 1`,
            trend: sql`CASE
              WHEN ${level} > ${playerSkillSummary.currentLevel} THEN 'improving'::trend_direction
              WHEN ${level} < ${playerSkillSummary.currentLevel} THEN 'declining'::trend_direction
              ELSE 'stable'::trend_direction
            END`,
            lastAssessedAt: now,
            updatedAt: now,
          },
        });

      return created;
    });
```

  Delete the old try/catch around `recomputePlayerSnapshots` (lines 268–275) and its obsolete comment entirely. The final `return new Response(JSON.stringify({ assessment: newAssessment }), { status: 201, ... })` stays.
- [ ] Run the new test file (all pass) plus the two existing regression suites: `tests/api/coach/assessments.test.ts`, `tests/api/coach/assessment-snapshots.test.ts`, and Task 1's `skill-summary-upsert.test.ts`. Run `npx tsc --noEmit`.
- [ ] Commit: `git add -A && git commit -m "fix(coach): validate seasonId and make assessment write transactional" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 3 — D3: return the player's real teams and consume them in the detail page

`coach-assessments-overview.tsx:498` navigates to `/coach/assess/${player.id}` with no params and `assessment-nudge-card.tsx:88` passes `?teamId=` only; `player-assessment-detail.tsx:240-244` then builds `teams = teamId && sportId ? [{ id: teamId, name: "Current Team", sport: { id: sportId, name: "Sport" } }] : []` — so the assessment modal gets an empty (or placeholder-named) team list and `/api/coach/skills` never fires. There is no endpoint returning a single player's teams (`src/pages/api/coach/players/[playerId]/` has only `assessments.ts` and `notes.ts`), so add `teams` to the existing `GET /api/coach/players/[playerId]/assessments` response the page already calls.

**Files**
- Modify: `src/pages/api/coach/players/[playerId]/assessments.ts` (imports lines 1–13; response lines 187–199)
- Modify: `src/components/coach/player-assessment-detail.tsx` (lines 122–126 props, 228–244 state/stub, 251–294 fetch/refresh)
- Test: `tests/api/coach/player-teams.test.ts` (create)

**Interfaces**
- Consumes: `requireCoachAccessToPlayer(context, playerId)` → `{ authorized: true; user; teamIds }` (`src/lib/auth/roles.ts:301`); joins `rosters → registrations → teams → seasons → programs → sports`
- Produces: `GET /api/coach/players/[playerId]/assessments` response gains `teams: Array<{ id: string; name: string; sport: { id: string; name: string }; season: { id: string; name: string } }>`; `PlayerAssessmentDetail` passes real teams to `PlayerAssessmentForm` (props `teams: Team[]`, `player-assessment-form.tsx:64-85`), with the `teamId` query param demoted to a preselect hint.

**Steps**

- [ ] Write the failing test `tests/api/coach/player-teams.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("GET /api/coach/players/[playerId]/assessments teams payload (D3)", () => {
  let coachCookie: string;
  let playerId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const playersRes = await apiFetch("/api/coach/players", {
      method: "GET",
      cookie: coachCookie,
    });
    const playersJson = await expectJson(playersRes, 200);
    expect(playersJson.players.length).toBeGreaterThan(0);
    playerId = playersJson.players[0].id;
  });

  afterAll(() => resetCookies());

  it("includes the player's coach-visible teams with real names", async () => {
    const res = await apiFetch(`/api/coach/players/${playerId}/assessments`, {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.teams)).toBe(true);
    expect(json.teams.length).toBeGreaterThan(0);
    for (const team of json.teams) {
      expect(team.id).toBeTruthy();
      expect(team.name).toBeTruthy();
      expect(team.name).not.toBe("Current Team");
      expect(team.sport?.id).toBeTruthy();
      expect(team.sport?.name).toBeTruthy();
      expect(team.sport?.name).not.toBe("Sport");
    }
  });
});
```

- [ ] Run it — fails (`json.teams` is `undefined`).
- [ ] In `src/pages/api/coach/players/[playerId]/assessments.ts`: extend the schema import (lines 3–10) to `import { playerAssessments, playerSkillSummary, skills, skillDomains, developmentStages, familyMembers, rosters, registrations, teams, seasons, programs, sports } from "@/lib/db/schema";` and line 12 to `import { eq, and, desc, inArray } from "drizzle-orm";`. After the snapshots block (line 185) and before the response, add:

```ts
    // Teams this player is rostered on that the caller coaches — gives the
    // assessment form real team + sport context (D3: it previously received
    // an empty list or "Current Team"/"Sport" placeholders from query params).
    const teamRows = auth.teamIds.length
      ? await getDb()
          .select({
            id: teams.id,
            name: teams.name,
            sport: { id: sports.id, name: sports.name },
            season: { id: seasons.id, name: seasons.name },
          })
          .from(rosters)
          .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
          .innerJoin(teams, eq(rosters.teamId, teams.id))
          .innerJoin(seasons, eq(teams.seasonId, seasons.id))
          .innerJoin(programs, eq(seasons.programId, programs.id))
          .innerJoin(sports, eq(programs.sportId, sports.id))
          .where(
            and(
              inArray(rosters.teamId, auth.teamIds),
              eq(registrations.familyMemberId, playerId)
            )
          )
      : [];
    const playerTeams = Array.from(new Map(teamRows.map((t) => [t.id, t])).values());
```

and add `teams: playerTeams,` to the response object (after `snapshots,` at line 193).
- [ ] In `src/components/coach/player-assessment-detail.tsx`:
  1. Add an interface near the other interfaces (after `SnapshotDomain`, line 121):

```ts
interface PlayerTeam {
  id: string
  name: string
  sport: { id: string; name: string }
  season?: { id: string; name: string } | null
}
```

  2. Delete the stub at lines 239–244 (`// Create a minimal team object...` through the `: []`) and replace with state (next to the other `useState` calls, line ~232): `const [teams, setTeams] = useState<PlayerTeam[]>([])`. Keep the component's `teamId`/`sportId` props (the astro page `src/pages/coach/assess/[playerId].astro:30-35` still passes them; `sportId` is now unused — stop destructuring it but leave it in `PlayerAssessmentDetailProps` so the astro page compiles, with a comment `// sportId prop retained for URL compat; teams now come from the API`).
  3. In `fetchData` (after `setSnapshots(data.snapshots || [])`, line 268) and identically in `refreshData` (after line 289), add:

```ts
        const fetchedTeams: PlayerTeam[] = data.teams || []
        // ?teamId= is a preselect hint only: the form defaults to teams[0].
        if (teamId) {
          fetchedTeams.sort((a, b) => (a.id === teamId ? -1 : b.id === teamId ? 1 : 0))
        }
        setTeams(fetchedTeams)
```

  The `<PlayerAssessmentForm ... teams={teams} ...>` usage at line 535 now receives real data unchanged.
- [ ] Run the test file (passes) and `npx tsc --noEmit` (zero errors).
- [ ] Commit: `git add -A && git commit -m "fix(coach): return real player teams for assessment entry" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 4 — D3: distinguish fetch failure from empty in the assessment form; no silent no-op submit

`player-assessment-form.tsx:196-197` logs fetch errors to console only, so a failed `/api/coach/skills` fetch renders "No skills found — Try adjusting your filters"; `handleSubmit` (line 226) silently returns when `!selectedSkill || !selectedTeam`.

**Files**
- Modify: `src/components/coach/player-assessment-form.tsx` (lines 141–143 state, 169–201 `fetchSkillsData`, 224–227 submit guard, 536–562 submit row, 638–647 list branch)
- Test: verification via `npx tsc --noEmit` and `npm run build` (no React component test infra exists in `tests/unit` — pure-function tests only)

**Interfaces**
- Consumes: `ErrorBanner({ message, onDismiss?, className? })` from `@/components/ui/error-banner` (`src/components/ui/error-banner.tsx:19`)
- Produces: no API changes; form disables submit when `!selectedSkill || !selectedTeam`

**Steps**

- [ ] Add the import at the top: `import { ErrorBanner } from "@/components/ui/error-banner";`
- [ ] Add state next to `error`/`success` (line ~142): `const [fetchError, setFetchError] = useState<string | null>(null);`
- [ ] Replace `fetchSkillsData` (lines 169–201) — current version treats each `!res.ok` as an empty success — with:

```ts
  const fetchSkillsData = async () => {
    if (!selectedTeam?.sport?.id) return;

    setIsLoadingSkills(true);
    setFetchError(null);
    try {
      const [domainsRes, stagesRes, skillsRes] = await Promise.all([
        fetch("/api/coach/skills/domains"),
        fetch("/api/coach/skills/stages"),
        fetch(`/api/coach/skills?sportId=${selectedTeam.sport.id}`),
      ]);

      if (!domainsRes.ok || !stagesRes.ok || !skillsRes.ok) {
        throw new Error("Failed to load skills library");
      }

      const [domainsData, stagesData, skillsData] = await Promise.all([
        domainsRes.json(),
        stagesRes.json(),
        skillsRes.json(),
      ]);

      setDomains(domainsData.domains || []);
      setStages(stagesData.stages || []);
      setSkills(skillsData.skills || []);
    } catch (err) {
      console.error("Error fetching skills data:", err);
      setFetchError("Could not load the skills library. Check your connection and try again.");
    } finally {
      setIsLoadingSkills(false);
    }
  };
```

- [ ] In the skills-list render (lines 638–647), insert a `fetchError` branch between the loading spinner and the empty state, so "No skills found" only shows for a genuinely empty successful response:

```tsx
                {isLoadingSkills ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
                  </div>
                ) : fetchError ? (
                  <div className="py-8 space-y-3 max-w-md mx-auto text-center">
                    <ErrorBanner message={fetchError} className="text-left" />
                    <Button type="button" variant="outline" onClick={fetchSkillsData}>
                      Retry
                    </Button>
                  </div>
                ) : filteredSkills.length === 0 ? (
```

(rest of the ternary unchanged.)
- [ ] Change the submit guard (line 226) from a silent return to a defensive guard with a visible reason, and disable the button. Guard: `if (!selectedSkill || !selectedTeam) return; // button is disabled in these states; belt-and-braces`. Button (line 545–548) becomes:

```tsx
                  <Button
                    type="submit"
                    disabled={isSubmitting || !selectedSkill || !selectedTeam}
                    className="bg-emerald-600 hover:bg-emerald-700 text-ink"
                  >
```

and directly above the submit row (before `{error && ...}` at line 537) add:

```tsx
                  {!selectedTeam && (
                    <p className="text-sm text-amber-500">
                      No team available — this player is not on any of your teams.
                    </p>
                  )}
```

- [ ] Verify: `npx tsc --noEmit` (zero errors), then `npm run build` succeeds.
- [ ] Commit: `git add -A && git commit -m "fix(coach): surface skills fetch errors and disable invalid assessment submit" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 5 — D4: practice planner sends `status`; API honors it

`practice-planner.tsx:257` takes `handleSave(status)` but the POST body (272–282) never includes it; `src/pages/api/coach/sessions/index.ts:352` hardcodes `status: "draft"`, so "Save Session Plan" (which passes `"planned"`, line 676) silently saves a draft.

**Files**
- Modify: `src/pages/api/coach/sessions/index.ts` (schema lines 17–40; insert line 352)
- Modify: `src/components/coach/practice-planner.tsx` (line 272–282 POST body)
- Test: `tests/api/coach/sessions-validation.test.ts` (create; Task 9 extends this file)

**Interfaces**
- Consumes: `createSessionSchema` (zod, `sessions/index.ts:17`); `sessionStatusEnum` values `["draft","planned","in_progress","completed","cancelled"]` (`src/lib/db/schema/practice-planning.ts:21-27`)
- Produces: `POST /api/coach/sessions` accepts `status?: "draft" | "planned"` (default `"draft"`) and returns `201 { session: { status, ... } }` reflecting it

**Steps**

- [ ] Write the failing test `tests/api/coach/sessions-validation.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Coach sessions validation (D4/D6)", () => {
  let coachCookie: string;
  let teamId: string;
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const teamsRes = await apiFetch("/api/coach/teams", {
      method: "GET",
      cookie: coachCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    expect(teamsJson.teams.length).toBeGreaterThan(0);
    teamId = teamsJson.teams[0].id;
  });

  afterAll(async () => {
    for (const id of createdSessionIds) {
      await apiFetch(`/api/coach/sessions/${id}`, {
        method: "DELETE",
        cookie: coachCookie,
      });
    }
    resetCookies();
  });

  it("honors status: planned on create", async () => {
    const res = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Status test session",
        scheduledDate: new Date("2026-08-01T17:00:00Z").toISOString(),
        durationMinutes: 60,
        status: "planned",
      }),
    });
    const json = await expectJson(res, 201);
    createdSessionIds.push(json.session.id);
    expect(json.session.status).toBe("planned");
  });

  it("rejects a status outside draft|planned (400)", async () => {
    const res = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Bad status session",
        scheduledDate: new Date("2026-08-01T17:00:00Z").toISOString(),
        durationMinutes: 60,
        status: "completed",
      }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] Run it — first test fails (`session.status` is `"draft"`); second fails too (unknown keys are stripped, 201).
- [ ] In `src/pages/api/coach/sessions/index.ts`, add to `createSessionSchema` (after `durationMinutes` at line 22): `status: z.enum(["draft", "planned"]).default("draft"),` and change line 352 from `status: "draft",` to `status: data.status,`.
- [ ] In `practice-planner.tsx`, add `status,` to the POST body object (after `preSessionNotes: preSessionNotes || undefined,` at line 281).
- [ ] Run the test file — both pass. `npx tsc --noEmit` clean.
- [ ] Commit: `git add -A && git commit -m "fix(coach): honor requested session status on save" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 6 — D4: session-detail action errors via toast, `canStart` fix, pluralization

`session-detail.tsx:250` renders a full-page error whenever `error` is set; the action handlers (167, 194, 218, 236) `setError` on failure, nuking the page (including typed reflection text). `session-detail.tsx:269-270` blocks starting past-dated planned sessions. `session-timeline.tsx:289` and `practices-overview.tsx:430` render "1 segments".

**Files**
- Modify: `src/components/coach/session-detail.tsx` (imports; lines 165–171, 192–198, 216–222, 234–240 catch blocks; 269–270)
- Modify: `src/components/coach/session-timeline.tsx` (line 289)
- Modify: `src/components/coach/practices-overview.tsx` (line 430)
- Test: verification via `npx tsc --noEmit` + `npm run build` (UI-only; no component test infra)

**Interfaces**
- Consumes: `toast.error(message: string)` from `sonner` (repo convention, e.g. `src/components/admin/broadcast-composer.tsx:8`); `<AppToaster client:load />` already mounted in `src/layouts/BaseLayout.astro:114`
- Produces: no API changes

**Steps**

- [ ] In `session-detail.tsx` add `import { toast } from "sonner"` after the `lucide-react` import block.
- [ ] Replace the four action catch bodies so `setError` is only used by the initial load (`fetchSession`, line 140 — leave that one alone):
  - `handleSaveSegments` (line 165–168): `catch (err) { console.error("Error saving session:", err); toast.error(err instanceof Error ? err.message : "Failed to save session") }`
  - `handleStatusChange` (line 192–195): `catch (err) { console.error("Error updating status:", err); toast.error(err instanceof Error ? err.message : "Failed to update status") }`
  - `handleSaveReflection` (line 216–219): `catch (err) { console.error("Error saving reflection:", err); toast.error(err instanceof Error ? err.message : "Failed to save reflection") }`
  - `handleDelete` (line 234–237): `catch (err) { console.error("Error deleting session:", err); toast.error(err instanceof Error ? err.message : "Failed to delete session") }`
- [ ] Replace lines 269–270:

```ts
  const isPast = new Date(session.scheduledDate) < new Date()
  const canStart = session.status === "planned" && !isPast
```

with (a coach can start a planned session whenever they open it):

```ts
  const canStart = session.status === "planned"
```

(`isPast` has no other references — delete it.)
- [ ] Pluralize `session-timeline.tsx:289`: `{segments.length} {segments.length === 1 ? "segment" : "segments"}` and `practices-overview.tsx:430`: `<span>{segmentCount} {segmentCount === 1 ? "segment" : "segments"}</span>`.
- [ ] Verify `npx tsc --noEmit` (zero errors) and `npm run build`.
- [ ] Commit: `git add -A && git commit -m "fix(coach): toast action errors, allow starting past planned sessions, fix segment plurals" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 7 — D6: org-scope coach curriculum reads; clamp query limits; reject invalid dates

`GET /api/coach/skills` has no coach gate and no org scoping (`skills.organizationId` exists, `src/lib/db/schema/curriculum.ts:71`); same for `/api/coach/activities` (line 83 conditions; unscoped `sports` list at 136–141) and `/api/coach/templates` (line 44; sports list 93–99). `parseInt(searchParams.get("limit"))` is unclamped in six coach endpoints. `new Date(startDate)` at `sessions/index.ts:126` accepts garbage (Invalid Date → 500). `skills/index.ts:101-114` exports dead `getDomains`/`getStages` (verified: zero importers).

**Files**
- Create: `src/lib/http/clamp-limit.ts`
- Test (unit): `tests/unit/http/clamp-limit.test.ts` (create)
- Modify: `src/pages/api/coach/skills/index.ts` (full GET; delete lines 100–114)
- Modify: `src/pages/api/coach/activities/index.ts` (lines 8–46, 83, 123, 136–141)
- Modify: `src/pages/api/coach/templates/index.ts` (lines 8–44, 93–99)
- Modify: `src/pages/api/coach/assessments/index.ts` (line 44), `src/pages/api/coach/players/[playerId]/assessments.ts` (line 53), `src/pages/api/coach/sessions/index.ts` (lines 60, 125–131), `src/pages/api/coach/resources/index.ts` (lines 27–28), `src/pages/api/coach/prompts/index.ts` (line 23)
- Test (API): `tests/api/coach/tenancy-scoping.test.ts` (create)

**Interfaces**
- Consumes: `requireCoachPortalAccess(context)` → `{ authorized: true; user; teamIds: string[]; organizationId: string }` (`src/lib/auth/roles.ts:361`); `or(eq(x.organizationId, orgId), isNull(x.organizationId))` scoping pattern from `src/pages/api/admin/curriculum/activities/index.ts:72-77`; `sports.organizationId` (`src/lib/db/schema/sports.ts:20`)
- Produces: `export function clampLimit(raw: string | null, fallback: number, max?: number): number`; coach curriculum GETs return 403 for non-coaches and only org-or-global rows

**Steps**

- [ ] Write the failing unit test `tests/unit/http/clamp-limit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clampLimit } from "@/lib/http/clamp-limit";

describe("clampLimit", () => {
  it("returns the fallback for null", () => expect(clampLimit(null, 20)).toBe(20));
  it("returns the fallback for NaN", () => expect(clampLimit("abc", 20)).toBe(20));
  it("clamps to max 100 by default", () => expect(clampLimit("9999", 20)).toBe(100));
  it("clamps to min 1", () => expect(clampLimit("0", 20)).toBe(1));
  it("clamps negatives to 1", () => expect(clampLimit("-5", 20)).toBe(1));
  it("passes through in-range values", () => expect(clampLimit("50", 20)).toBe(50));
  it("respects a custom max", () => expect(clampLimit("50", 5, 10)).toBe(10));
});
```

Run `npx vitest run --config vitest.config.ts --project unit tests/unit/http/clamp-limit.test.ts` — fails (module missing).
- [ ] Create `src/lib/http/clamp-limit.ts`:

```ts
/**
 * Clamp a user-supplied ?limit= query param to [1, max], falling back to
 * `fallback` when absent or non-numeric. Every coach endpoint that paginates
 * must use this — unclamped parseInt() lets a caller demand the whole table.
 */
export function clampLimit(raw: string | null, fallback: number, max = 100): number {
  const n = raw === null ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 1), max);
}
```

Re-run the unit test — passes.
- [ ] Write the failing API test `tests/api/coach/tenancy-scoping.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  getParentCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Coach curriculum read scoping (D6)", () => {
  let coachCookie: string;
  let parentCookie: string;
  let sportId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    parentCookie = await getParentCookie();
    const playersRes = await apiFetch("/api/coach/players", {
      method: "GET",
      cookie: coachCookie,
    });
    const playersJson = await expectJson(playersRes, 200);
    const player = playersJson.players.find((p: any) => p.team?.sport?.id);
    expect(player).toBeDefined();
    sportId = player.team.sport.id;
  });

  afterAll(() => resetCookies());

  it("rejects a non-coach on GET /api/coach/skills (403)", async () => {
    const res = await apiFetch(`/api/coach/skills?sportId=${sportId}`, {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("rejects a non-coach on GET /api/coach/activities (403)", async () => {
    const res = await apiFetch("/api/coach/activities", {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("rejects a non-coach on GET /api/coach/templates (403)", async () => {
    const res = await apiFetch("/api/coach/templates", {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("still serves skills to a coach (200)", async () => {
    const res = await apiFetch(`/api/coach/skills?sportId=${sportId}`, {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.skills)).toBe(true);
  });

  it("rejects an invalid startDate on GET /api/coach/sessions (400)", async () => {
    const res = await apiFetch("/api/coach/sessions?startDate=not-a-date", {
      method: "GET",
      cookie: coachCookie,
    });
    expect(res.status).toBe(400);
  });
});
```

Run it — the parent-403 tests fail (skills currently 200 for any authed user; the parent account has no teams so activities/templates may already 403 — keep those as regression guards) and the startDate test fails (500).
- [ ] Rewrite `src/pages/api/coach/skills/index.ts` header + gating + scoping, and delete `getDomains`/`getStages` (lines 100–114, dead code — verified no importers):

```ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { skills, skillDomains, developmentStages } from "@/lib/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { requireCoachPortalAccess } from "@/lib/auth";

// GET - Get skills by sport and optionally by stage/domain
export const GET: APIRoute = async (context) => {
  try {
    const auth = await requireCoachPortalAccess(context);
    if (!auth.authorized) return auth.response;

    const db = getDb();
    const url = context.url;
```

(then the existing query-param reads and 400-on-missing-sportId, unchanged). Replace the conditions block (lines 33–36) with:

```ts
    const conditions = [
      eq(skills.sportId, sportId),
      eq(skills.active, true),
      // Tenant scoping: this org's skills + global seeds (organizationId IS
      // NULL) — mirrors the admin curriculum endpoints.
      or(eq(skills.organizationId, auth.organizationId), isNull(skills.organizationId))!,
    ];
```

The select/joins/orderBy and response stay as-is (drop the now-unused `sports` import).
- [ ] In `src/pages/api/coach/activities/index.ts`: change the signature to `async (context)` with `const url = context.url;`; replace the manual coach check (lines 8–36) with `const auth = await requireCoachPortalAccess(context); if (!auth.authorized) return auth.response;` (import from `@/lib/auth`; add `isNull` to the drizzle import; drop the now-unused `teams` import). Replace lines 45–46 with:

```ts
    const limit = clampLimit(url.searchParams.get("limit"), 50);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
```

(import `{ clampLimit } from "@/lib/http/clamp-limit"`). Change line 83 to include org scoping:

```ts
    const conditions = [
      eq(activities.active, true),
      or(
        eq(activities.organizationId, auth.organizationId),
        isNull(activities.organizationId)
      )!,
    ];
```

And scope the sports reference list (lines 136–141) to the org, like the admin counterpart (`admin/curriculum/activities/index.ts:136-140`):

```ts
    const sportsList = await getDb()
      .select({ id: sports.id, name: sports.name })
      .from(sports)
      .where(eq(sports.organizationId, auth.organizationId));
```

- [ ] In `src/pages/api/coach/templates/index.ts`: same treatment — `async (context)`, `requireCoachPortalAccess`, add `isNull` import, drop `teams` import; conditions (line 44) become:

```ts
    const conditions = [
      eq(practiceTemplates.active, true),
      or(
        eq(practiceTemplates.organizationId, auth.organizationId),
        isNull(practiceTemplates.organizationId)
      )!,
    ];
```

and the sports list (lines 94–99) gains `.where(eq(sports.organizationId, auth.organizationId))`.
- [ ] Apply `clampLimit` (import in each file) to the remaining reads:
  - `src/pages/api/coach/assessments/index.ts:44` → `const limit = clampLimit(context.url.searchParams.get("limit"), 50);`
  - `src/pages/api/coach/players/[playerId]/assessments.ts:53` → `const limit = clampLimit(context.url.searchParams.get("limit"), 100);`
  - `src/pages/api/coach/sessions/index.ts:60` → `const limit = clampLimit(url.searchParams.get("limit"), 20);`
  - `src/pages/api/coach/resources/index.ts:27-28` → `const limit = clampLimit(url.searchParams.get("limit"), 20);` and `const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);`
  - `src/pages/api/coach/prompts/index.ts:23` → `const limit = clampLimit(url.searchParams.get("limit"), 5, 25);`
- [ ] In `src/pages/api/coach/sessions/index.ts` replace lines 125–131 with invalid-date rejection:

```ts
    if (startDate) {
      const start = new Date(startDate);
      if (Number.isNaN(start.getTime())) {
        return new Response(JSON.stringify({ error: "Invalid startDate" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      conditions.push(gte(sessionPlans.scheduledDate, start));
    }

    if (endDate) {
      const end = new Date(endDate);
      if (Number.isNaN(end.getTime())) {
        return new Response(JSON.stringify({ error: "Invalid endDate" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      conditions.push(lte(sessionPlans.scheduledDate, end));
    }
```

- [ ] Run: the unit test, `tests/api/coach/tenancy-scoping.test.ts`, and regressions `tests/api/coach/assessments.test.ts` + `tests/api/coach/practices.test.ts` (skills/templates/activities consumers). `npx tsc --noEmit` clean.
- [ ] Commit: `git add -A && git commit -m "fix(coach): org-scope curriculum reads, clamp limits, reject invalid dates" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 8 — D6: validate prompt/resource/attendance writes

`POST /api/coach/prompts` (lines 103–134) destructures an unvalidated body and inserts — a bogus `promptId` FK-faults to 500. `POST /api/coach/resources` (lines 122–164) same, plus the view-insert + view-count increment are two unrelated writes. `POST /api/coach/attendance` bulk (lines 165–256) never checks that `rosterId`s belong to `teamId` and does delete-then-insert without a transaction; `PUT` (lines 259–300) has no zod at all.

**Files**
- Modify: `src/pages/api/coach/prompts/index.ts` (POST, lines 102–134; imports)
- Modify: `src/pages/api/coach/resources/index.ts` (POST, lines 122–164; imports)
- Modify: `src/pages/api/coach/attendance.ts` (POST both branches; PUT; imports line 4)
- Test: `tests/api/coach/post-validation.test.ts` (create)

**Interfaces**
- Consumes: `requireCoachPortalAccess(context)`; `coachPrompts`, `coachPromptDismissals` (`dismissType: varchar` with values 'temporary'|'permanent'|'helpful', `src/lib/db/schema/coach-guidance.ts:133-142`), `coachResources`, `coachResourceViews` (rating int 1–5, line 152); roster-membership check pattern from `src/pages/api/coach/players/[playerId]/notes.ts:117-127`
- Produces: `POST /api/coach/prompts` body `{ promptId: uuid, dismissType?: "temporary"|"permanent"|"helpful" }` → 400/404/200; `POST /api/coach/resources` body `{ resourceId: uuid, completed?: boolean, rating?: 1-5, notes?: string }` → 400/404/200; attendance bulk whole-batch 400 on foreign rosterIds; `PUT /api/coach/attendance` body `{ id: uuid, status: enum, notes?: string|null }`

**Steps**

- [ ] Write the failing test `tests/api/coach/post-validation.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Coach POST validation (D6)", () => {
  let coachCookie: string;
  let teamId: string;
  let rosterId: string | null = null;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const teamsRes = await apiFetch("/api/coach/teams", {
      method: "GET",
      cookie: coachCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    expect(teamsJson.teams.length).toBeGreaterThan(0);
    for (const team of teamsJson.teams) {
      const rosterRes = await apiFetch(`/api/coach/teams/${team.id}/roster`, {
        method: "GET",
        cookie: coachCookie,
      });
      const rosterJson = await rosterRes.json();
      if (rosterJson.roster?.length > 0) {
        teamId = team.id;
        rosterId = rosterJson.roster[0].id;
        break;
      }
    }
    if (!teamId) teamId = teamsJson.teams[0].id;
  });

  afterAll(() => resetCookies());

  it("404s dismissing a nonexistent prompt", async () => {
    const res = await apiFetch("/api/coach/prompts", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ promptId: randomUUID(), dismissType: "temporary" }),
    });
    expect(res.status).toBe(404);
  });

  it("400s a non-uuid promptId", async () => {
    const res = await apiFetch("/api/coach/prompts", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ promptId: "nope" }),
    });
    expect(res.status).toBe(400);
  });

  it("404s recording a view on a nonexistent resource", async () => {
    const res = await apiFetch("/api/coach/resources", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ resourceId: randomUUID() }),
    });
    expect(res.status).toBe(404);
  });

  it("400s an out-of-range resource rating", async () => {
    const res = await apiFetch("/api/coach/resources", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ resourceId: randomUUID(), rating: 9 }),
    });
    expect(res.status).toBe(400);
  });

  it("whole-batch rejects bulk attendance containing a foreign rosterId (400)", async () => {
    const res = await apiFetch("/api/coach/attendance", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        eventDate: new Date("2026-06-02T10:00:00Z").toISOString(),
        eventType: "practice",
        records: [
          ...(rosterId ? [{ rosterId, status: "present" }] : []),
          { rosterId: randomUUID(), status: "present" },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("400s a PUT with an invalid status", async () => {
    const res = await apiFetch("/api/coach/attendance", {
      method: "PUT",
      cookie: coachCookie,
      body: JSON.stringify({ id: randomUUID(), status: "vibing" }),
    });
    expect(res.status).toBe(400);
  });
});
```

Run — the 404 tests and bulk/PUT tests fail (currently 500s from FK/enum violations).
- [ ] Rewrite `POST` in `src/pages/api/coach/prompts/index.ts`. Add imports: `import { z } from "zod";`, extend the auth import to `import { validateSession, requireCoachPortalAccess } from "@/lib/auth";`, and add `asc` (already imported at line 6). Above the handler add:

```ts
const dismissPromptSchema = z.object({
  promptId: z.string().uuid(),
  dismissType: z.enum(["temporary", "permanent", "helpful"]).default("temporary"),
});
```

Handler:

```ts
// POST - Dismiss a prompt
export const POST: APIRoute = async (context) => {
  const auth = await requireCoachPortalAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    const body = await context.request.json();
    const validation = dismissPromptSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: validation.error.flatten().fieldErrors }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const { promptId, dismissType } = validation.data;

    const [prompt] = await db
      .select({ id: coachPrompts.id })
      .from(coachPrompts)
      .where(eq(coachPrompts.id, promptId))
      .orderBy(asc(coachPrompts.id))
      .limit(1);

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    await db.insert(coachPromptDismissals).values({
      coachUserId: auth.user.id,
      promptId,
      dismissType,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error dismissing prompt:", error);
    return new Response(JSON.stringify({ error: "Failed to dismiss prompt" }), { status: 500 });
  }
};
```

- [ ] Rewrite `POST` in `src/pages/api/coach/resources/index.ts` the same way (add `z` and `requireCoachPortalAccess` imports; `asc` already imported):

```ts
const recordResourceViewSchema = z.object({
  resourceId: z.string().uuid(),
  completed: z.boolean().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
});

// POST - Record resource view
export const POST: APIRoute = async (context) => {
  const auth = await requireCoachPortalAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    const body = await context.request.json();
    const validation = recordResourceViewSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: validation.error.flatten().fieldErrors }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const { resourceId, completed, rating, notes } = validation.data;

    const [resource] = await db
      .select({ id: coachResources.id })
      .from(coachResources)
      .where(eq(coachResources.id, resourceId))
      .orderBy(asc(coachResources.id))
      .limit(1);

    if (!resource) {
      return new Response(JSON.stringify({ error: "Resource not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    await db.transaction(async (tx) => {
      await tx.insert(coachResourceViews).values({
        coachUserId: auth.user.id,
        resourceId,
        completedAt: completed ? new Date() : null,
        rating: rating ?? null,
        notes: notes ?? null,
      });
      await tx
        .update(coachResources)
        .set({ viewCount: sql`${coachResources.viewCount} + 1` })
        .where(eq(coachResources.id, resourceId));
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error recording resource view:", error);
    return new Response(JSON.stringify({ error: "Failed to record view" }), { status: 500 });
  }
};
```

- [ ] In `src/pages/api/coach/attendance.ts`: change line 4 to `import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";`.
  1. **Bulk branch:** after the `requireCoachAccessToTeam` check (line 183), insert the whole-batch roster check (pattern copied from `players/[playerId]/notes.ts:117-127`):

```ts
      // Whole-batch integrity: every rosterId must belong to this team.
      const rosterIds = [...new Set(records.map((r) => r.rosterId))];
      if (rosterIds.length > 0) {
        const validRosters = await getDb()
          .select({ id: rosters.id })
          .from(rosters)
          .where(and(eq(rosters.teamId, teamId), inArray(rosters.id, rosterIds)));
        if (validRosters.length !== rosterIds.length) {
          return new Response(
            JSON.stringify({ error: "One or more rosterIds do not belong to this team" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }
```

  Then wrap the existing delete (lines 191–199) + insert (line 213) in a transaction (keep the `startOfDay`/`endOfDay` and `newRecords` construction above it):

```ts
      await getDb().transaction(async (tx) => {
        await tx
          .delete(attendance)
          .where(
            and(
              eq(attendance.teamId, teamId),
              sql`${attendance.eventDate} >= ${startOfDay} AND ${attendance.eventDate} <= ${endOfDay}`,
              eq(attendance.eventType, eventType)
            )
          );
        if (newRecords.length > 0) {
          await tx.insert(attendance).values(newRecords);
        }
      });
```

  2. **Single branch:** after its `requireCoachAccessToTeam` check (line 234), add:

```ts
      const [rosterEntry] = await getDb()
        .select({ id: rosters.id })
        .from(rosters)
        .where(and(eq(rosters.id, result.data.rosterId), eq(rosters.teamId, result.data.teamId)))
        .orderBy(asc(rosters.id))
        .limit(1);
      if (!rosterEntry) {
        return new Response(
          JSON.stringify({ error: "rosterId does not belong to this team" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
```

  3. **PUT:** add above the handlers:

```ts
const updateAttendanceSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["present", "absent", "late", "excused"]),
  notes: z.string().optional().nullable(),
});
```

  and replace lines 261–266 (`const { id, status, notes } = body; if (!id) ...`) with:

```ts
    const body = await context.request.json();
    const validation = updateAttendanceSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: validation.error.flatten().fieldErrors }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const { id, status, notes } = validation.data;
```

  (the update at lines 282–290 then writes `status` / `notes: notes ?? null` as before).
- [ ] Run `tests/api/coach/post-validation.test.ts` (all pass) and the regression suite `tests/api/coach/attendance.test.ts`. `npx tsc --noEmit` clean.
- [ ] Commit: `git add -A && git commit -m "fix(coach): validate prompt, resource, and attendance writes" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 9 — D6: session template/activity visibility + transactional usage writes

`POST /api/coach/sessions` blindly increments any `templateId`'s usage count (`sessions/index.ts:331-340`) before inserting. `PUT /api/coach/sessions/[id]` (`sessions/[id].ts:259-286`) accepts arbitrary `activityId`s, does an untransacted delete-then-insert of usage rows, and re-increments `activities.usageCount` on every save.

**Files**
- Modify: `src/pages/api/coach/sessions/index.ts` (POST handler, lines 276–372)
- Modify: `src/pages/api/coach/sessions/[id].ts` (PUT handler, lines 180–299; imports line 12)
- Test: extend `tests/api/coach/sessions-validation.test.ts` (from Task 5)

**Interfaces**
- Consumes: `requireCoachPortalAccess(context)` → `{ ...; organizationId }`; `practiceTemplates.organizationId`, `activities.organizationId` (both nullable = global; `src/lib/db/schema/practice-planning.ts:51,97`); `verifyCoachAccess(userId, sessionId)` (`sessions/[id].ts:44`)
- Produces: `POST /api/coach/sessions` → `404 { error: "Template not found" }` when `templateId` is not org-or-global visible; `PUT /api/coach/sessions/[id]` → `400` when a segment `activityId` is not org-or-global visible; usage-count increments only for newly added activities; usage rows + session update in one transaction

**Steps**

- [ ] Append failing tests to `tests/api/coach/sessions-validation.test.ts` (inside the existing `describe`, reusing `coachCookie`, `teamId`, `createdSessionIds`; add `import { randomUUID } from "node:crypto";` at the top):

```ts
  it("404s a create referencing an invisible/nonexistent template", async () => {
    const res = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        templateId: randomUUID(),
        title: "Bad template session",
        scheduledDate: new Date("2026-08-01T17:00:00Z").toISOString(),
        durationMinutes: 60,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("400s a PUT whose segments reference an invisible activity", async () => {
    const createRes = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Segment validation session",
        scheduledDate: new Date("2026-08-01T17:00:00Z").toISOString(),
        durationMinutes: 60,
      }),
    });
    const created = await expectJson(createRes, 201);
    createdSessionIds.push(created.session.id);

    const putRes = await apiFetch(`/api/coach/sessions/${created.session.id}`, {
      method: "PUT",
      cookie: coachCookie,
      body: JSON.stringify({
        segments: [
          {
            order: 0,
            name: "Warmup",
            type: "warmup",
            durationMinutes: 10,
            activityId: randomUUID(),
          },
        ],
      }),
    });
    expect(putRes.status).toBe(400);
  });
```

Run — both fail (currently 500 FK violations, and in the PUT case the session row is even updated before the failure).
- [ ] In `src/pages/api/coach/sessions/index.ts` POST: change the signature from `async ({ request, locals })` to `async (context)`, and replace the `locals.user` check with:

```ts
    const auth = await requireCoachPortalAccess(context);
    if (!auth.authorized) return auth.response;
```

(add `requireCoachPortalAccess` to the `@/lib/auth` import — create the import; the file currently has none — and `isNull` to the drizzle import at line 13). Use `context.request.json()` and replace both `user.id` references (team-ownership check lines 315–317 and the insert's `coachUserId` line 348) with `auth.user.id`. Replace the blind usage-increment block (lines 331–340) with:

```ts
    // Template must be visible to this coach's org (own org or global seed).
    if (data.templateId) {
      const [template] = await getDb()
        .select({ id: practiceTemplates.id })
        .from(practiceTemplates)
        .where(
          and(
            eq(practiceTemplates.id, data.templateId),
            or(
              isNull(practiceTemplates.organizationId),
              eq(practiceTemplates.organizationId, auth.organizationId)
            )
          )
        )
        .orderBy(asc(practiceTemplates.id))
        .limit(1);

      if (!template) {
        return new Response(JSON.stringify({ error: "Template not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      await getDb()
        .update(practiceTemplates)
        .set({
          usageCount: sql`${practiceTemplates.usageCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(practiceTemplates.id, data.templateId));
    }
```

- [ ] In `src/pages/api/coach/sessions/[id].ts` PUT: change line 12 to `import { eq, and, or, sql, inArray, isNull } from "drizzle-orm";`, add `import { requireCoachPortalAccess } from "@/lib/auth";`, change the signature from `async ({ params, request, locals })` to `async (context)` with `const { params } = context;`, and replace the `locals.user` check with `const auth = await requireCoachPortalAccess(context); if (!auth.authorized) return auth.response;` (then `verifyCoachAccess(auth.user.id, id)` and `context.request.json()`). After zod validation (line 226), add the activity-visibility check:

```ts
    // Segment activities must be org-or-global visible (same filter as the
    // coach activities list).
    const segmentActivityIds = [
      ...new Set(
        (data.segments ?? [])
          .map((s) => s.activityId)
          .filter((aid): aid is string => Boolean(aid))
      ),
    ];
    if (segmentActivityIds.length > 0) {
      const visibleActivities = await getDb()
        .select({ id: activities.id })
        .from(activities)
        .where(
          and(
            inArray(activities.id, segmentActivityIds),
            or(
              isNull(activities.organizationId),
              eq(activities.organizationId, auth.organizationId)
            )
          )
        );
      if (visibleActivities.length !== segmentActivityIds.length) {
        return new Response(
          JSON.stringify({ error: "One or more activities are not available to your organization" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }
```

Then replace the update + usage rebuild (lines 252–286) with a snapshot-then-transaction version:

```ts
    // Snapshot the previous usage set BEFORE mutating so usageCount is only
    // incremented for activities newly added by this save (it previously
    // re-incremented every activity on every save).
    const previousUsage = data.segments
      ? await getDb()
          .select({ activityId: sessionActivityUsage.activityId })
          .from(sessionActivityUsage)
          .where(eq(sessionActivityUsage.sessionPlanId, id))
      : [];
    const previousActivityIds = new Set(previousUsage.map((u) => u.activityId));

    const updatedSession = await getDb().transaction(async (tx) => {
      const [updated] = await tx
        .update(sessionPlans)
        .set(updateData)
        .where(eq(sessionPlans.id, id))
        .returning();

      if (data.segments) {
        await tx
          .delete(sessionActivityUsage)
          .where(eq(sessionActivityUsage.sessionPlanId, id));

        for (const segment of data.segments) {
          if (segment.activityId) {
            await tx.insert(sessionActivityUsage).values({
              sessionPlanId: id,
              activityId: segment.activityId,
              segmentOrder: segment.order,
              durationMinutes: segment.durationMinutes,
            });
          }
        }

        const newActivityIds = segmentActivityIds.filter(
          (aid) => !previousActivityIds.has(aid)
        );
        if (newActivityIds.length > 0) {
          await tx
            .update(activities)
            .set({
              usageCount: sql`${activities.usageCount} + 1`,
              updatedAt: new Date(),
            })
            .where(inArray(activities.id, newActivityIds));
        }
      }

      return updated;
    });
```

(the existing `return new Response(JSON.stringify({ session: updatedSession }), ...)` stays).
- [ ] Run `tests/api/coach/sessions-validation.test.ts` (all pass) and the regression suite `tests/api/coach/practices.test.ts`. `npx tsc --noEmit` clean.
- [ ] Commit: `git add -A && git commit -m "fix(coach): scope session templates/activities to org and make usage writes transactional" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 10 — Final gate: full verification + PR

**Files**
- No source changes (fixups only if the gate fails)

**Steps**

- [ ] `npm run build` — must succeed (use `./scripts/with-bws.sh npm run build` if env-dependent).
- [ ] `npx tsc --noEmit` — zero errors.
- [ ] `npx vitest run --config vitest.config.ts --project unit` — all unit tests pass.
- [ ] With the dev server still running (`R2_MOCK=1 CRON_SECRET=testsecret ./scripts/with-bws.sh npm run dev`): `CRON_SECRET=testsecret TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npm run test:api` — the full API suite passes (not just the new files; Task 7's gating changes touch endpoints other suites consume). Known pre-existing failures per memory: 2 API failures are staging data-state, not regressions — triage by whether the failing file overlaps this branch's changes.
- [ ] Push and open the PR (do NOT merge):

```bash
git push -u origin fix/coach-dev-loop
gh pr create --title "fix(coach): development-loop fixes (D3-D6)" --body "$(cat <<'EOF'
## Summary
Plan 1 of 3 for the coach fixing stage.

- **D5 assessment pipeline:** unique index + dedupe migration on player_skill_summary; summary write is now a single ON CONFLICT upsert; assessment insert + snapshot recompute + summary upsert run in ONE transaction (snapshot failure now rolls back and 500s instead of silently staling the radar); seasonId is validated against the coach's teams' seasons.
- **D3 assessment entry:** /api/coach/players/[playerId]/assessments now returns the player's real teams (with sport/season); the detail page feeds them to the form (query params are a preselect hint only); the form distinguishes fetch failure (ErrorBanner + Retry) from a genuinely empty skills list and disables submit instead of silently no-oping.
- **D4 practice tools:** planner sends status (draft|planned) and the API honors it; session-detail action failures use toast.error instead of nuking the page; canStart no longer blocks past-dated planned sessions; "1 segments" pluralization fixed.
- **D6 tenancy/validation:** coach skills/activities/templates gated by requireCoachPortalAccess and scoped org-or-global; limits clamped to [1,100]; invalid startDate/endDate rejected; prompts/resources/attendance writes zod-validated with existence/roster checks; session template + segment-activity visibility enforced; attendance bulk write and session usage rebuild are transactional; usageCount only increments for newly added activities.

Deliberately untouched: coach games score endpoint (removed in Plan 3).

## Test plan
- New API suites: skill-summary-upsert, assessment-season-validation, player-teams, sessions-validation, tenancy-scoping, post-validation (tests/api/coach/)
- New unit suite: clamp-limit (tests/unit/http/)
- Full gate: npm run build, npx tsc --noEmit, npm run test:api against local dev server

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] Report the PR URL. Do not merge.

---

### Critical Files for Implementation

- src/pages/api/coach/assessments/index.ts
- src/lib/curriculum/snapshots.ts
- src/lib/db/schema/assessments.ts
- src/pages/api/coach/sessions/[id].ts
- src/components/coach/player-assessment-detail.tsx
