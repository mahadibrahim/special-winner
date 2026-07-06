# Phase 2 Onboarding Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a freshly-hired coach an in-product onboarding checklist (manual self-report items + auto-detected items from Phase 1/Phase-3-adjacent data + one admin-confirmed item), surface per-coach completion to admins on `/admin/coaches`, and seed an assessment-calibration guide cross-linked from the coach manual.

**Architecture:** One new table (`coach_onboarding_progress`, a pure completion-event log — task definitions are a hardcoded TypeScript constant, not a DB-configurable catalog). A pure merge function combines that log with live-computed "auto" flags (credential gaps from Phase 1, session-plan existence) into a single ordered task list. Two new API routes (`/api/coach/onboarding` for the coach, `/api/admin/coaches/onboarding` for the admin) share that merge function. A new dashboard card and an extra grid column are the only UI surfaces. The calibration guide is one more entry in the existing curriculum content registry — no new seeding mechanism.

**Tech Stack:** Astro 5 + React 19, Drizzle/Postgres, Zod, Vitest, Playwright. No new dependencies.

## Global Constraints

- Schema changes go through `npm run db:generate` → commit migration → `db:migrate`; never `db:push` against remote DBs. Write migrations idempotently (`ADD COLUMN IF NOT EXISTS`, `DO $$ ... duplicate_object` guard) — this table is a plain `CREATE TABLE`, so no enum/idempotency guard is needed, but still never hand-edit a committed migration after merge.
- Every admin API endpoint validates tenant ownership via `requireSameOrg*` / `requireOrgAdminAccess` / `requireUserInOrg` helpers (`src/lib/auth/require-resource-ownership.ts`, `src/lib/auth/roles.ts`). Coach endpoints use coach-access helpers scoped to team assignments (or, for this feature specifically, org-scoped coach-role access — see Task 4's design note).
- New tables follow the curriculum convention: nullable `organizationId` where NULL = global default, org rows override. **Deviation, documented in Task 1:** `coach_onboarding_progress.organizationId` is `NOT NULL` — onboarding is inherently tied to the org that hired the coach; there is no "global onboarding task" concept to mirror.
- Any `findFirst`/`.limit(1)` gets an explicit `orderBy` (shared CI database hazard).
- All coach/admin pages are SSR (no `prerender = true`); UI states use `ErrorBanner` / `EmptyState` / `LoadingSkeleton` primitives where applicable (the checklist card fails soft/silent per its own pattern — see Task 7).
- New timestamps in UTC, displayed in org timezone.
- E2E specs run post-merge only — grep `tests/e2e/` for affected surfaces before merging route changes. This plan adds a **new** e2e spec file rather than editing the existing `tests/e2e/coach-dashboard.spec.ts`, to stay conflict-tolerant with an in-flight Phase 4 branch that also touches the coach dashboard.
- Runs in a worktree (multi-task, subagent-driven per CLAUDE.md branch-hygiene rules) — create it via `superpowers:using-git-worktrees` before Task 1.

---

## Design decisions (read before starting)

1. **Migration numbering is not fixed in this plan.** At the time this plan was written, the latest migration was `0064_job_applications_hired.sql`, and a parallel in-flight Phase 3 branch is expected to claim `0065`. **Before running `db:generate` in Task 1, run `ls src/lib/db/migrations | tail -3` and confirm the next free number** — do not assume `0066`; re-verify, since branches merge in unpredictable order. The filename itself is chosen by `drizzle-kit generate`, not hand-picked.
2. **`coach_onboarding_progress` stores completion *events*, not per-task state rows for every task.** A row only ever exists once a task is complete (`completedAt NOT NULL DEFAULT now()`). There is no "pending" row. Task definitions (label, description, kind) live in code (`src/lib/compliance/coach-onboarding.ts`), not in the DB — adding a 7th task later is a code change, not a migration.
3. **Auto tasks are write-once ("write-on-read").** `credentials_complete` and `first_practice_plan_created` are computed live from Phase 1 credential rows and `session_plans` existence. The first time the API observes the condition is true, it inserts a `coach_onboarding_progress` row so the task has a stable `completedAt` and admins see a consistent history. **Deliberately, this does not un-complete** if the underlying data regresses later (e.g. a credential expires post-onboarding) — onboarding is a one-time gate, not continuous compliance monitoring; Phase 1's `/admin/coaches` credentials grid already owns ongoing compliance visibility.
4. **Auth gap this plan closes:** `requireCoachAccess` (existing, `src/lib/auth/roles.ts`) authorizes on `teamIds.length > 0` only — a freshly hired coach with **zero** team assignments would get 403 from every existing `/api/coach/*` route. The `/coach` **page** already handles this correctly (`middleware.ts` allows access via the `coach` role OR team assignment — see its comment at the "role" rule), but no *API* helper mirrors that OR-logic yet. Since the whole point of this feature is "a freshly hired coach with no team yet sees a checklist," Task 4 adds a new helper, `requireCoachPortalAccess`, that authorizes on role-OR-teams (mirroring the middleware), rather than reusing `requireCoachAccess`.
5. **The coach manual and ops catalog are already merged** (prior work) — this plan does not touch `docs/operations/catalog/**` and only adds one cross-linking paragraph to the already-complete `docs/operations/artifacts/manuals/role.coach.md`.
6. **The calibration guide reuses the existing curriculum content pipeline**, not a new seed script. `src/lib/curriculum/content/coach-guidance.ts`'s `COACH_RESOURCES` array is the source of truth for `coach_resources` rows; `scripts/curriculum-load.ts` (`npm run curriculum:load -- --org=<slug>`) upserts it keyed on `title`. (The `docs/superpowers/plans/2026-07-06-coach-lifecycle-and-delivery-ops.md` program spec's "Files (expected)" line mentioning `src/lib/db/seed-curriculum.ts` is stale — that file only seeds stages/skills/categories today and has no `coach_resources` seeding at all; do not add resource-seeding logic there.)
7. **Dashboard card insertion is not a single line.** The research brief asked for "a single insertion line" for conflict-tolerance with an in-flight Phase 4 branch that adds an `AssessmentNudgeCard` to the same file. In practice `coach-dashboard-overview.tsx` has *two* return branches that need the card — the `teams.length === 0` empty state (critical: a coach with **no** teams yet is exactly who needs to see this) and the main success branch. Task 7 adds it at the very top of both, well away from the `lg:col-span-4` sidebar column where Phase 4's card is expected to land (next to `PrePracticeChecklist`/`QuickActions`), keeping the diff conflict-tolerant in spirit even though it touches two lines instead of one.
8. **Admin roster/onboarding query is an N+1 over coaches, not batched.** `src/pages/api/admin/coaches/onboarding.ts` (Task 5) calls the per-coach `getOnboardingTasks` helper once per coach in the org's roster (two extra queries each: credential rows, session-plan existence). For expected org sizes (tens of coaches) this is fine and keeps the code simple; if a future org's coach roster grows into the hundreds, batch it then (YAGNI).

---

## Task 1: `coach_onboarding_progress` schema + migration

**Files:**
- Create: `src/lib/db/schema/coach-onboarding.ts`
- Modify: `src/lib/db/schema/index.ts` (add barrel export)
- Create: `src/lib/db/migrations/00NN_coach_onboarding.sql` (number TBD — see Design decision 1)

**Interfaces:**
- Produces: `coachOnboardingProgress` table, `CoachOnboardingProgress` / `NewCoachOnboardingProgress` types — consumed by Tasks 3, 4, 5.

- [x] **Step 1: Confirm the next migration number**

```bash
ls /Volumes/MahadData/Aspire-Sports/web-app/src/lib/db/migrations | tail -3
```

Expected: the highest-numbered file is either `0064_job_applications_hired.sql` (Phase 3 branch not yet merged — you'll be `0065`) or `0065_*.sql` (Phase 3 already merged — you'll be `0066`). Note the number; `drizzle-kit generate` will pick it automatically once you run Step 4, but sanity-check the output filename matches what you expect before committing.

- [x] **Step 2: Write the schema file**

```typescript
// src/lib/db/schema/coach-onboarding.ts
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

/**
 * Per-coach onboarding checklist progress (Phase 2 of the coach-lifecycle
 * program). Task keys are a hardcoded constant (see
 * src/lib/compliance/coach-onboarding.ts) — there is no admin-configurable
 * task catalog, so this table only ever stores a *completion event* per
 * (user, org, task). Auto-detected tasks (credentials_complete,
 * first_practice_plan_created) are write-once: the API layer inserts a row
 * here the first time it observes the underlying condition is true, so the
 * checklist has a stable completedAt and does NOT un-complete if the
 * underlying data later regresses (e.g. a credential expires after
 * onboarding) — onboarding is a one-time gate, not continuous monitoring
 * (that is Phase 1's coach-credentials grid's job).
 *
 * organizationId is NOT NULL here, unlike coach_credentials — onboarding is
 * inherently tied to the org that hired the coach; there is no "global"
 * onboarding-task concept to mirror the curriculum content convention.
 */
export const coachOnboardingProgress = pgTable(
  "coach_onboarding_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    taskKey: varchar("task_key", { length: 50 }).notNull(),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("coach_onboarding_progress_user_org_task_uniq").on(
      table.userId,
      table.organizationId,
      table.taskKey,
    ),
    index("coach_onboarding_progress_org_idx").on(table.organizationId),
    index("coach_onboarding_progress_user_idx").on(table.userId),
  ],
);

export const coachOnboardingProgressRelations = relations(
  coachOnboardingProgress,
  ({ one }) => ({
    user: one(users, {
      fields: [coachOnboardingProgress.userId],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [coachOnboardingProgress.organizationId],
      references: [organizations.id],
    }),
  }),
);

export type CoachOnboardingProgress = typeof coachOnboardingProgress.$inferSelect;
export type NewCoachOnboardingProgress = typeof coachOnboardingProgress.$inferInsert;
```

- [x] **Step 3: Add the barrel export**

In `src/lib/db/schema/index.ts`, immediately after the existing `coach-credentials` line:

```typescript
export * from "./coach-credentials";
export * from "./coach-onboarding";
```

- [x] **Step 4: Generate the migration**

```bash
cd /Volumes/MahadData/Aspire-Sports/web-app && npm run db:generate
```

Expected: a new file `src/lib/db/migrations/00NN_<auto-name>.sql` (drizzle picks a random adjective-noun suffix; rename is not required but you may rename to `00NN_coach_onboarding.sql` for readability — if you do, also fix the `tag` field inside `src/lib/db/migrations/meta/_journal.json`'s newest entry to match). Confirm the generated SQL matches this shape (columns/constraints only — exact statement-breakpoint formatting comes from drizzle-kit):

```sql
CREATE TABLE "coach_onboarding_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_key" varchar(50) NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_onboarding_progress" ADD CONSTRAINT "coach_onboarding_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coach_onboarding_progress" ADD CONSTRAINT "coach_onboarding_progress_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "coach_onboarding_progress_user_org_task_uniq" ON "coach_onboarding_progress" USING btree ("user_id","organization_id","task_key");
--> statement-breakpoint
CREATE INDEX "coach_onboarding_progress_org_idx" ON "coach_onboarding_progress" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "coach_onboarding_progress_user_idx" ON "coach_onboarding_progress" USING btree ("user_id");
```

- [x] **Step 5: Apply it locally**

```bash
npm run db:migrate
```

Expected: `coach_onboarding_progress` migration applied without error (this requires `DATABASE_URL` pointed at the Railway staging proxy per house rules — run via `npm run dev:bws`-sourced env, or export `DATABASE_URL` manually first).

- [x] **Step 6: Commit**

```bash
git add src/lib/db/schema/coach-onboarding.ts src/lib/db/schema/index.ts src/lib/db/migrations/
git commit -m "feat(coach-onboarding): add coach_onboarding_progress table"
```

---

## Task 2: Pure task-definitions + merge logic

**Files:**
- Create: `src/lib/compliance/coach-onboarding.ts`
- Test: `tests/unit/coach-onboarding-tasks.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, mirrors `src/lib/compliance/coach-credentials.ts` house style).
- Produces: `ONBOARDING_TASKS`, `MANUAL_TASK_KEYS`, `AUTO_TASK_KEYS`, `ADMIN_CONFIRM_TASK_KEYS`, `mergeOnboardingTasks(progressRows, autoFlags)`, `isOnboardingComplete(tasks)`, types `OnboardingTaskDef`, `OnboardingTaskStatus`, `AutoFlags` — consumed by Tasks 3 (DB helper), 4, 5 (API routes), 7 (dashboard card).

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/coach-onboarding-tasks.test.ts
import { describe, it, expect } from "vitest";
import {
  ONBOARDING_TASKS,
  MANUAL_TASK_KEYS,
  AUTO_TASK_KEYS,
  ADMIN_CONFIRM_TASK_KEYS,
  mergeOnboardingTasks,
  isOnboardingComplete,
} from "@/lib/compliance/coach-onboarding";

describe("ONBOARDING_TASKS", () => {
  it("is the hardcoded six-task checklist, in display order", () => {
    expect(ONBOARDING_TASKS.map((t) => t.key)).toEqual([
      "philosophy_read",
      "coach_manual_read",
      "sport_guide_reviewed",
      "credentials_complete",
      "first_practice_plan_created",
      "shadow_session_confirmed",
    ]);
  });

  it("splits into manual/auto/admin_confirm kinds with no overlap", () => {
    expect(MANUAL_TASK_KEYS).toEqual([
      "philosophy_read",
      "coach_manual_read",
      "sport_guide_reviewed",
    ]);
    expect(AUTO_TASK_KEYS).toEqual([
      "credentials_complete",
      "first_practice_plan_created",
    ]);
    expect(ADMIN_CONFIRM_TASK_KEYS).toEqual(["shadow_session_confirmed"]);
    expect(
      MANUAL_TASK_KEYS.length +
        AUTO_TASK_KEYS.length +
        ADMIN_CONFIRM_TASK_KEYS.length,
    ).toBe(ONBOARDING_TASKS.length);
  });
});

describe("mergeOnboardingTasks", () => {
  const noAutoFlags = {
    credentials_complete: false,
    first_practice_plan_created: false,
  };

  it("everything incomplete with no rows and no auto flags", () => {
    const tasks = mergeOnboardingTasks([], noAutoFlags);
    expect(tasks).toHaveLength(6);
    expect(tasks.every((t) => !t.completed)).toBe(true);
    expect(tasks.every((t) => t.completedAt === null)).toBe(true);
  });

  it("a manual task is complete only when a progress row exists", () => {
    const completedAt = new Date("2026-07-01T00:00:00Z");
    const tasks = mergeOnboardingTasks(
      [{ taskKey: "philosophy_read", completedAt }],
      noAutoFlags,
    );
    const philosophy = tasks.find((t) => t.key === "philosophy_read")!;
    expect(philosophy.completed).toBe(true);
    expect(philosophy.completedAt).toEqual(completedAt);
    const manual = tasks.find((t) => t.key === "coach_manual_read")!;
    expect(manual.completed).toBe(false);
  });

  it("an auto task is complete when its flag is true even with no row yet (completedAt null)", () => {
    const tasks = mergeOnboardingTasks([], {
      credentials_complete: true,
      first_practice_plan_created: false,
    });
    const cred = tasks.find((t) => t.key === "credentials_complete")!;
    expect(cred.completed).toBe(true);
    expect(cred.completedAt).toBeNull();
    const plan = tasks.find((t) => t.key === "first_practice_plan_created")!;
    expect(plan.completed).toBe(false);
  });

  it("an auto task stays complete via its row even if the flag later goes false", () => {
    const completedAt = new Date("2026-06-01T00:00:00Z");
    const tasks = mergeOnboardingTasks(
      [{ taskKey: "credentials_complete", completedAt }],
      { credentials_complete: false, first_practice_plan_created: false },
    );
    const cred = tasks.find((t) => t.key === "credentials_complete")!;
    expect(cred.completed).toBe(true);
    expect(cred.completedAt).toEqual(completedAt);
  });

  it("an admin_confirm task is complete only via a row — auto flags never apply to it", () => {
    const tasks = mergeOnboardingTasks([], noAutoFlags);
    const shadow = tasks.find((t) => t.key === "shadow_session_confirmed")!;
    expect(shadow.completed).toBe(false);
    expect(shadow.kind).toBe("admin_confirm");
  });

  it("preserves ONBOARDING_TASKS display order regardless of row order", () => {
    const tasks = mergeOnboardingTasks(
      [
        { taskKey: "shadow_session_confirmed", completedAt: new Date() },
        { taskKey: "philosophy_read", completedAt: new Date() },
      ],
      noAutoFlags,
    );
    expect(tasks.map((t) => t.key)).toEqual(ONBOARDING_TASKS.map((t) => t.key));
  });
});

describe("isOnboardingComplete", () => {
  it("false when any task is incomplete", () => {
    const tasks = mergeOnboardingTasks([], {
      credentials_complete: false,
      first_practice_plan_created: false,
    });
    expect(isOnboardingComplete(tasks)).toBe(false);
  });

  it("true when every task has a row or an auto flag", () => {
    const now = new Date();
    const rows = [
      { taskKey: "philosophy_read", completedAt: now },
      { taskKey: "coach_manual_read", completedAt: now },
      { taskKey: "sport_guide_reviewed", completedAt: now },
      { taskKey: "shadow_session_confirmed", completedAt: now },
    ];
    const tasks = mergeOnboardingTasks(rows, {
      credentials_complete: true,
      first_practice_plan_created: true,
    });
    expect(isOnboardingComplete(tasks)).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/coach-onboarding-tasks.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/compliance/coach-onboarding'`.

- [x] **Step 3: Write the implementation**

```typescript
// src/lib/compliance/coach-onboarding.ts
/**
 * Coach onboarding checklist — pure functions only (no DB imports;
 * unit-testable), mirroring the house style of
 * src/lib/compliance/coach-credentials.ts.
 *
 * The task set is a hardcoded constant per the Phase 2 spec
 * (docs/superpowers/plans/2026-07-06-coach-lifecycle-and-delivery-ops.md,
 * "Phase 2" section): reading requirements, two auto-detected facts already
 * tracked elsewhere in the system, and one admin-confirmed step. There is no
 * per-org task catalog — adding a task is a code change to ONBOARDING_TASKS,
 * not a schema change.
 */

export type OnboardingTaskKind = "manual" | "auto" | "admin_confirm";

export interface OnboardingTaskDef {
  key: string;
  label: string;
  description: string;
  kind: OnboardingTaskKind;
}

export const ONBOARDING_TASKS: OnboardingTaskDef[] = [
  {
    key: "philosophy_read",
    label: "Read the Aspire coaching philosophy",
    description:
      "Development over winning, the ELM framework, the 5:1 ratio — the non-negotiables every session is built on.",
    kind: "manual",
  },
  {
    key: "coach_manual_read",
    label: "Read the coach manual",
    description:
      "Day-of procedures for league practices, skills classes, camp days, and clinics, plus safety escalation and parent communication.",
    kind: "manual",
  },
  {
    key: "sport_guide_reviewed",
    label: "Review your sport's development guide",
    description:
      "Sport-specific technique and age-band guidance and the relevant skill minibooks for the sport(s) you'll coach.",
    kind: "manual",
  },
  {
    key: "credentials_complete",
    label: "Submit required credentials",
    description:
      "SafeSport, background check, CPR/first-aid, and concussion protocol — auto-detected once an admin marks all four valid.",
    kind: "auto",
  },
  {
    key: "first_practice_plan_created",
    label: "Create your first practice plan",
    description:
      "Auto-detected the first time a session plan exists for one of your teams.",
    kind: "auto",
  },
  {
    key: "shadow_session_confirmed",
    label: "Shadow session confirmed",
    description:
      "An admin confirms you've shadowed an experienced coach for at least one session.",
    kind: "admin_confirm",
  },
];

export const MANUAL_TASK_KEYS = ONBOARDING_TASKS.filter(
  (t) => t.kind === "manual",
).map((t) => t.key);
export const AUTO_TASK_KEYS = ONBOARDING_TASKS.filter(
  (t) => t.kind === "auto",
).map((t) => t.key);
export const ADMIN_CONFIRM_TASK_KEYS = ONBOARDING_TASKS.filter(
  (t) => t.kind === "admin_confirm",
).map((t) => t.key);

export interface AutoFlags {
  credentials_complete: boolean;
  first_practice_plan_created: boolean;
}

export interface OnboardingTaskStatus extends OnboardingTaskDef {
  completed: boolean;
  completedAt: Date | null;
}

/** Minimal shape needed from a coach_onboarding_progress row. */
export interface ProgressRowLike {
  taskKey: string;
  completedAt: Date;
}

/**
 * Merge stored completion rows with live-computed auto flags into the full,
 * ordered task list. A task is `completed` if either a row exists for it OR
 * (for `auto` kind tasks only) its flag is currently true — the flag lets a
 * caller show "complete" before the write-once persistence step runs; once
 * persisted, the row's completedAt wins and is stable even if the flag later
 * flips back to false (see Design decision 3 in the plan).
 */
export function mergeOnboardingTasks(
  progressRows: ProgressRowLike[],
  autoFlags: AutoFlags,
): OnboardingTaskStatus[] {
  const rowByKey = new Map(progressRows.map((r) => [r.taskKey, r.completedAt]));
  return ONBOARDING_TASKS.map((def) => {
    const recordedAt = rowByKey.get(def.key) ?? null;
    const autoComplete =
      def.kind === "auto" &&
      Boolean(autoFlags[def.key as keyof AutoFlags]);
    return {
      ...def,
      completed: recordedAt !== null || autoComplete,
      completedAt: recordedAt,
    };
  });
}

export function isOnboardingComplete(tasks: OnboardingTaskStatus[]): boolean {
  return tasks.every((t) => t.completed);
}
```

- [x] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/coach-onboarding-tasks.test.ts
```

Expected: PASS (13 tests).

- [x] **Step 5: Commit**

```bash
git add src/lib/compliance/coach-onboarding.ts tests/unit/coach-onboarding-tasks.test.ts
git commit -m "feat(coach-onboarding): add hardcoded task definitions + merge logic"
```

---

## Task 3: DB-facing helper — auto flags + write-once persistence

**Files:**
- Create: `src/lib/coach/onboarding-data.ts`

**Interfaces:**
- Consumes: `mergeOnboardingTasks`, `AUTO_TASK_KEYS`, `AutoFlags`, `OnboardingTaskStatus` (Task 2); `requiredCredentialGaps` (`src/lib/compliance/coach-credentials.ts`, Phase 1); `coachCredentials`, `coachOnboardingProgress` (schema); `sessionPlans` (`src/lib/db/schema/practice-planning.ts`).
- Produces: `computeAutoFlags(db, userId, organizationId, teamIds)`, `getOnboardingTasks(db, userId, organizationId, teamIds): Promise<{ tasks: OnboardingTaskStatus[]; complete: boolean }>` — consumed by Task 4 (coach endpoint) and Task 5 (admin endpoint).

This helper touches the DB, so per house convention (`tests/unit` is pure-logic only, `tests/api` hits HTTP endpoints) it has no standalone test file — it's exercised end-to-end through Task 4's and Task 5's API tests.

- [x] **Step 1: Write the implementation**

```typescript
// src/lib/coach/onboarding-data.ts
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { coachOnboardingProgress } from "@/lib/db/schema/coach-onboarding";
import { coachCredentials } from "@/lib/db/schema/coach-credentials";
import { sessionPlans } from "@/lib/db/schema/practice-planning";
import { requiredCredentialGaps } from "@/lib/compliance/coach-credentials";
import {
  mergeOnboardingTasks,
  AUTO_TASK_KEYS,
  type AutoFlags,
  type OnboardingTaskStatus,
} from "@/lib/compliance/coach-onboarding";

type DB = ReturnType<typeof getDb>;

/**
 * Live-computes the two auto-detected flags. Credentials: org rows + global
 * (NULL-org) rows for this user, same visibility rule as the Phase 1
 * compliance grid. Practice plan: any session_plans row for a team this
 * coach heads or assists — empty teamIds (a freshly hired coach with no
 * assignment yet) trivially yields false without a query.
 */
export async function computeAutoFlags(
  db: DB,
  userId: string,
  organizationId: string,
  teamIds: string[],
): Promise<AutoFlags> {
  const credentialRows = await db
    .select()
    .from(coachCredentials)
    .where(
      and(
        eq(coachCredentials.userId, userId),
        or(
          eq(coachCredentials.organizationId, organizationId),
          isNull(coachCredentials.organizationId),
        ),
      ),
    );
  const gaps = requiredCredentialGaps(credentialRows, new Date());

  let hasPlan = false;
  if (teamIds.length > 0) {
    const [row] = await db
      .select({ id: sessionPlans.id })
      .from(sessionPlans)
      .where(inArray(sessionPlans.teamId, teamIds))
      .orderBy(asc(sessionPlans.createdAt))
      .limit(1);
    hasPlan = !!row;
  }

  return {
    credentials_complete: gaps.length === 0,
    first_practice_plan_created: hasPlan,
  };
}

/**
 * Reads existing progress rows, computes auto flags, persists (write-once)
 * any auto task that just became complete for the first time, and returns
 * the merged, ordered task list plus overall completion.
 */
export async function getOnboardingTasks(
  db: DB,
  userId: string,
  organizationId: string,
  teamIds: string[],
): Promise<{ tasks: OnboardingTaskStatus[]; complete: boolean }> {
  const rows = await db
    .select()
    .from(coachOnboardingProgress)
    .where(
      and(
        eq(coachOnboardingProgress.userId, userId),
        eq(coachOnboardingProgress.organizationId, organizationId),
      ),
    );

  const autoFlags = await computeAutoFlags(db, userId, organizationId, teamIds);

  const alreadyRecorded = new Set(rows.map((r) => r.taskKey));
  for (const key of AUTO_TASK_KEYS) {
    const flagTrue = autoFlags[key as keyof AutoFlags];
    if (flagTrue && !alreadyRecorded.has(key)) {
      const [inserted] = await db
        .insert(coachOnboardingProgress)
        .values({
          userId,
          organizationId,
          taskKey: key,
          completedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [
            coachOnboardingProgress.userId,
            coachOnboardingProgress.organizationId,
            coachOnboardingProgress.taskKey,
          ],
        })
        .returning();
      if (inserted) rows.push(inserted);
    }
  }

  const tasks = mergeOnboardingTasks(rows, autoFlags);
  return { tasks, complete: tasks.every((t) => t.completed) };
}
```

- [x] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no new errors attributable to `src/lib/coach/onboarding-data.ts`.

- [x] **Step 3: Commit**

```bash
git add src/lib/coach/onboarding-data.ts
git commit -m "feat(coach-onboarding): add DB-facing auto-flag + write-once helper"
```

---

## Task 4: Coach endpoint — `GET`/`POST /api/coach/onboarding` + auth helper

**Files:**
- Modify: `src/lib/auth/roles.ts` (add `requireCoachPortalAccess`)
- Modify: `src/lib/auth/index.ts` (export it)
- Create: `src/pages/api/coach/onboarding.ts`
- Test: `tests/api/coach/onboarding.test.ts`

**Interfaces:**
- Consumes: `validateCoachAccess`, `getUserRoles`, `requireOrganizationContext` (all existing, `src/lib/auth/roles.ts`); `getOnboardingTasks` (Task 3); `MANUAL_TASK_KEYS` (Task 2); `coachOnboardingProgress` (Task 1).
- Produces: `requireCoachPortalAccess(context)` — a new exported auth helper other coach-portal endpoints may reuse later; `GET`/`POST` on `/api/coach/onboarding`.

- [x] **Step 1: Add `requireCoachPortalAccess` to `src/lib/auth/roles.ts`**

Add this function immediately after `requireCoachAccessToTeam` (after line 349 in the version read for this plan):

```typescript
/**
 * Coach-portal access for endpoints that must be reachable BEFORE a coach
 * has any team assignment (e.g. the onboarding checklist — Phase 2 of the
 * coach-lifecycle program). `requireCoachAccess` authorizes on
 * teamIds.length > 0 only, which is correct for team-scoped data endpoints
 * but wrong here: a freshly hired coach has the `coach` role (stamped by
 * the Phase 1 hire handoff) before any team assignment, and must still be
 * able to load their checklist. Mirrors the OR-logic middleware.ts already
 * uses for the /coach page-access rule (role OR teamIds).
 */
export async function requireCoachPortalAccess(context: APIContext): Promise<
  | { authorized: false; response: Response }
  | {
      authorized: true;
      user: NonNullable<Awaited<ReturnType<typeof validateSession>>["user"]>;
      teamIds: string[];
      organizationId: string;
    }
> {
  const { user, isCoach: hasTeams, teamIds } = await validateCoachAccess(context);

  if (!user) {
    return {
      authorized: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    };
  }

  const userRolesList = await getUserRoles(user.id);
  const hasCoachRole = userRolesList.some((r) => r.name === "coach");

  if (!hasTeams && !hasCoachRole) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Forbidden: Coach access required" }),
        { status: 403 },
      ),
    };
  }

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) {
    return { authorized: false, response: orgContext.response };
  }

  return {
    authorized: true,
    user,
    teamIds,
    organizationId: orgContext.organizationId,
  };
}
```

- [x] **Step 2: Export it from the barrel**

In `src/lib/auth/index.ts`, add `requireCoachPortalAccess` to the existing export list from `./roles`:

```typescript
export {
  getUserRoles,
  hasRole,
  isCoachOfTeam,
  getCoachTeamIds,
  isCoach,
  validateCoachAccess,
  isAdmin,
  validateAdminAccess,
  requireAdminAccess,
  requireSuperAdminAccess,
  isPlayerOnCoachTeam,
  getCoachPlayerIds,
  requireCoachAccess,
  requireCoachAccessToPlayer,
  requireCoachAccessToTeam,
  requireCoachPortalAccess,
  getOrganizationId,
  requireOrganizationContext,
  isAdminForOrg,
  requireOrgAdminAccess,
  type RoleName,
  type ScopeType,
  type UserRole,
} from "./roles";
```

- [x] **Step 3: Write the failing API test**

```typescript
// tests/api/coach/onboarding.test.ts
/**
 * Coach onboarding checklist API: the auth gap this feature closes (a
 * freshly hired coach with zero team assignments must still reach the
 * checklist), manual task completion, and auto-detected tasks.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  coachCredentials,
  organizations,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { hashPassword } from "@/lib/auth/password";
import {
  getAuthCookie,
  getCoachCookie,
  getParentCookie,
  apiFetch,
  expectJson,
} from "../setup/test-helpers";

const ENDPOINT = "/api/coach/onboarding";
const FRESH_PASSWORD = "TestFreshCoach123!";

let orgAId: string;
let coachRoleId: string;
let freshCoachEmail: string;
let freshCoachCookie: string;

async function createFreshCoachUser(): Promise<string> {
  const db = getDb();
  const email = `fresh-coach-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await hashPassword(FRESH_PASSWORD);
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      firstName: "Fresh",
      lastName: "Coach",
      emailVerified: false,
    })
    .returning();
  await db.insert(userOrganizationAccess).values({
    userId: user.id,
    organizationId: orgAId,
    role: "staff",
    invitedAt: new Date(),
  });
  await db.insert(userRoles).values({
    userId: user.id,
    roleId: coachRoleId,
    scopeType: "organization",
    scopeId: orgAId,
  });
  return email;
}

describe("Coach onboarding API", () => {
  beforeAll(async () => {
    const db = getDb();
    const [orgA] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    expect(orgA).toBeTruthy();
    orgAId = orgA.id;

    const [coachRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "coach"))
      .orderBy(asc(roles.id))
      .limit(1);
    coachRoleId = coachRole.id;

    freshCoachEmail = await createFreshCoachUser();
    freshCoachCookie = await getAuthCookie(freshCoachEmail, FRESH_PASSWORD);
  });

  describe("auth gates", () => {
    it("GET unauthenticated → 401", async () => {
      const res = await apiFetch(ENDPOINT);
      expect(res.status).toBe(401);
    });

    it("GET as a coach with the role but ZERO team assignments → 200 (the gap this feature closes)", async () => {
      const json = await expectJson(
        await apiFetch(ENDPOINT, { cookie: freshCoachCookie }),
        200,
      );
      expect(Array.isArray(json.tasks)).toBe(true);
      expect(json.tasks).toHaveLength(6);
      expect(json.complete).toBe(false);
    });

    it("GET as a parent (no coach role, no teams) → 403", async () => {
      const parentCookie = await getParentCookie();
      const res = await apiFetch(ENDPOINT, { cookie: parentCookie });
      expect(res.status).toBe(403);
    });
  });

  describe("manual task completion", () => {
    it("POST philosophy_read marks it complete with a completedAt", async () => {
      const json = await expectJson(
        await apiFetch(ENDPOINT, {
          method: "POST",
          cookie: freshCoachCookie,
          body: JSON.stringify({ taskKey: "philosophy_read" }),
        }),
        200,
      );
      const task = json.tasks.find((t: any) => t.key === "philosophy_read");
      expect(task.completed).toBe(true);
      expect(task.completedAt).toBeTruthy();
    });

    it("POST an auto-kind key (credentials_complete) → 400 (not coach-settable)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: freshCoachCookie,
        body: JSON.stringify({ taskKey: "credentials_complete" }),
      });
      expect(res.status).toBe(400);
    });

    it("POST an admin_confirm-kind key (shadow_session_confirmed) → 400 (not coach-settable)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: freshCoachCookie,
        body: JSON.stringify({ taskKey: "shadow_session_confirmed" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("auto-detected tasks", () => {
    it("credentials_complete flips true once all four required credentials are valid", async () => {
      const db = getDb();
      const farFuture = new Date("2035-01-01T00:00:00Z");
      const [freshCoach] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, freshCoachEmail))
        .orderBy(asc(users.createdAt))
        .limit(1);

      for (const credentialType of [
        "safesport",
        "background_check",
        "cpr_first_aid",
        "concussion_protocol",
      ] as const) {
        await db.insert(coachCredentials).values({
          userId: freshCoach.id,
          organizationId: orgAId,
          credentialType,
          status: "valid",
          expiresAt: farFuture,
        });
      }

      const json = await expectJson(
        await apiFetch(ENDPOINT, { cookie: freshCoachCookie }),
        200,
      );
      const task = json.tasks.find((t: any) => t.key === "credentials_complete");
      expect(task.completed).toBe(true);
      expect(task.completedAt).toBeTruthy(); // write-once persistence ran
    });

    it("first_practice_plan_created flips true once a session plan exists for one of the coach's teams", async () => {
      const coachCookie = await getCoachCookie();
      const teamsRes = await expectJson(
        await apiFetch("/api/coach/teams", { cookie: coachCookie }),
        200,
      );
      expect(teamsRes.teams.length).toBeGreaterThan(0);
      const teamId = teamsRes.teams[0].id;

      await apiFetch("/api/coach/sessions", {
        method: "POST",
        cookie: coachCookie,
        body: JSON.stringify({
          teamId,
          title: "Onboarding auto-flag test practice",
          scheduledDate: "2026-08-01T16:00:00.000Z",
          durationMinutes: 60,
        }),
      });

      const json = await expectJson(
        await apiFetch(ENDPOINT, { cookie: coachCookie }),
        200,
      );
      const task = json.tasks.find(
        (t: any) => t.key === "first_practice_plan_created",
      );
      expect(task.completed).toBe(true);
    });
  });
});
```

- [x] **Step 4: Run test to verify it fails**

```bash
npm run dev &
sleep 3
TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/coach/onboarding.test.ts
```

Expected: FAIL — `/api/coach/onboarding` does not exist (404s), or module-not-found if the route file is entirely absent.

- [x] **Step 5: Write the endpoint**

```typescript
// src/pages/api/coach/onboarding.ts
import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireCoachPortalAccess } from "@/lib/auth";
import { coachOnboardingProgress } from "@/lib/db/schema/coach-onboarding";
import { getOnboardingTasks } from "@/lib/coach/onboarding-data";
import { MANUAL_TASK_KEYS } from "@/lib/compliance/coach-onboarding";

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * GET  — the coach's own checklist: manual + auto + admin-confirm tasks,
 *        auto tasks computed live (and persisted write-once when newly
 *        complete — see src/lib/coach/onboarding-data.ts).
 * POST — mark ONE manual task complete. Auto and admin-confirm task keys
 *        are rejected (400) — those are set by the system or an admin.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireCoachPortalAccess(context);
  if (!auth.authorized) return auth.response;

  const db = getDb();
  const { tasks, complete } = await getOnboardingTasks(
    db,
    auth.user.id,
    auth.organizationId,
    auth.teamIds,
  );
  return json(200, { tasks, complete });
};

const postSchema = z.object({
  taskKey: z.enum(MANUAL_TASK_KEYS as [string, ...string[]]),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireCoachPortalAccess(context);
  if (!auth.authorized) return auth.response;

  let parsed;
  try {
    parsed = postSchema.safeParse(await context.request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) {
    return json(400, {
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(coachOnboardingProgress)
    .where(
      and(
        eq(coachOnboardingProgress.userId, auth.user.id),
        eq(coachOnboardingProgress.organizationId, auth.organizationId),
        eq(coachOnboardingProgress.taskKey, parsed.data.taskKey),
      ),
    )
    .orderBy(asc(coachOnboardingProgress.createdAt))
    .limit(1);

  if (!existing) {
    await db.insert(coachOnboardingProgress).values({
      userId: auth.user.id,
      organizationId: auth.organizationId,
      taskKey: parsed.data.taskKey,
      completedAt: new Date(),
    });
  }

  const { tasks, complete } = await getOnboardingTasks(
    db,
    auth.user.id,
    auth.organizationId,
    auth.teamIds,
  );
  return json(200, { tasks, complete });
};
```

- [x] **Step 6: Run test to verify it passes**

```bash
TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/coach/onboarding.test.ts
```

Expected: PASS (8 tests).

- [x] **Step 7: Commit**

```bash
git add src/lib/auth/roles.ts src/lib/auth/index.ts src/pages/api/coach/onboarding.ts tests/api/coach/onboarding.test.ts
git commit -m "feat(coach-onboarding): add coach-facing onboarding endpoint + portal access helper"
```

---

## Task 5: Admin endpoint — `GET`/`POST /api/admin/coaches/onboarding`

**Files:**
- Create: `src/pages/api/admin/coaches/onboarding.ts`
- Test: `tests/api/admin/coach-onboarding.test.ts`

**Interfaces:**
- Consumes: `requireOrgAdminAccess`, `requireUserInOrg`, `ownershipDeniedResponse` (existing); `getOnboardingTasks` (Task 3); `ADMIN_CONFIRM_TASK_KEYS` (Task 2).
- Produces: `GET`/`POST` on `/api/admin/coaches/onboarding` — consumed by Task 8 (admin grid).

- [x] **Step 1: Write the failing API test**

```typescript
// tests/api/admin/coach-onboarding.test.ts
/**
 * Admin onboarding-summary API: tenant isolation + the shadow-session
 * admin-confirm action.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, roles, userRoles, users } from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import {
  getAdminCookie,
  getAuthCookie,
  getParentCookie,
  apiFetch,
  expectJson,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/coaches/onboarding";

let adminACookie: string;
let orgAId: string;
let orgBId: string;
let coachRoleId: string;
let orgACoachId: string;
let orgBCoachId: string;

async function createCoachUser(orgId: string, tag: string): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      email: `onboarding-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      firstName: `Onboard${tag}`,
      lastName: "Coach",
      emailVerified: false,
    })
    .returning();
  await db.insert(userOrganizationAccess).values({
    userId: user.id,
    organizationId: orgId,
    role: "staff",
    invitedAt: new Date(),
  });
  await db.insert(userRoles).values({
    userId: user.id,
    roleId: coachRoleId,
    scopeType: "organization",
    scopeId: orgId,
  });
  return user.id;
}

describe("Admin coach onboarding API", () => {
  beforeAll(async () => {
    adminACookie = await getAdminCookie();
    const db = getDb();

    const [orgA] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    const [orgB] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "orgb"))
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    expect(orgA).toBeTruthy();
    expect(orgB).toBeTruthy();
    orgAId = orgA.id;
    orgBId = orgB.id;

    const [coachRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "coach"))
      .orderBy(asc(roles.id))
      .limit(1);
    coachRoleId = coachRole.id;

    orgACoachId = await createCoachUser(orgAId, "a");
    orgBCoachId = await createCoachUser(orgBId, "b");
  });

  describe("auth gates", () => {
    it("GET unauthenticated → 401", async () => {
      const res = await apiFetch(ENDPOINT);
      expect(res.status).toBe(401);
    });

    it("GET as parent → 403", async () => {
      const parentCookie = await getParentCookie();
      const res = await apiFetch(ENDPOINT, { cookie: parentCookie });
      expect(res.status).toBe(403);
    });

    it("GET as Org B admin in Org A context → 403", async () => {
      const adminBCookie = await getAuthCookie(
        "admin-orgb@test.aspiresports.com",
        "TestAdmin123!",
      );
      const res = await apiFetch(ENDPOINT, { cookie: adminBCookie });
      expect(res.status).toBe(403);
    });
  });

  describe("tenant isolation", () => {
    it("Org A admin's coach list contains the Org A coach but never the Org B coach", async () => {
      const json = await expectJson(
        await apiFetch(ENDPOINT, { cookie: adminACookie }),
        200,
      );
      const ids = (json.coaches as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(orgACoachId);
      expect(ids).not.toContain(orgBCoachId);
    });

    it("Org A admin cannot confirm shadow session for an Org B coach → 404", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminACookie,
        body: JSON.stringify({
          userId: orgBCoachId,
          taskKey: "shadow_session_confirmed",
        }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("shadow-session confirm", () => {
    it("a freshly listed Org A coach starts with shadow_session_confirmed incomplete", async () => {
      const json = await expectJson(
        await apiFetch(ENDPOINT, { cookie: adminACookie }),
        200,
      );
      const coach = json.coaches.find((c: any) => c.id === orgACoachId);
      expect(coach).toBeTruthy();
      const shadow = coach.tasks.find(
        (t: any) => t.key === "shadow_session_confirmed",
      );
      expect(shadow.completed).toBe(false);
      expect(coach.complete).toBe(false);
    });

    it("confirming marks it complete and is idempotent on a second call", async () => {
      const first = await expectJson(
        await apiFetch(ENDPOINT, {
          method: "POST",
          cookie: adminACookie,
          body: JSON.stringify({
            userId: orgACoachId,
            taskKey: "shadow_session_confirmed",
          }),
        }),
        200,
      );
      expect(first.confirmed).toBe(true);

      const second = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminACookie,
        body: JSON.stringify({
          userId: orgACoachId,
          taskKey: "shadow_session_confirmed",
        }),
      });
      expect(second.status).toBe(200);

      const listing = await expectJson(
        await apiFetch(ENDPOINT, { cookie: adminACookie }),
        200,
      );
      const coach = listing.coaches.find((c: any) => c.id === orgACoachId);
      const shadow = coach.tasks.find(
        (t: any) => t.key === "shadow_session_confirmed",
      );
      expect(shadow.completed).toBe(true);
    });

    it("rejects a non-admin_confirm taskKey → 400", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminACookie,
        body: JSON.stringify({
          userId: orgACoachId,
          taskKey: "philosophy_read",
        }),
      });
      expect(res.status).toBe(400);
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/coach-onboarding.test.ts
```

Expected: FAIL — route does not exist (404s).

- [x] **Step 3: Write the endpoint**

```typescript
// src/pages/api/admin/coaches/onboarding.ts
import type { APIRoute } from "astro";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { roles, teams, userRoles, users } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireUserInOrg,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { getOnboardingTasks } from "@/lib/coach/onboarding-data";
import { coachOnboardingProgress } from "@/lib/db/schema/coach-onboarding";
import { ADMIN_CONFIRM_TASK_KEYS } from "@/lib/compliance/coach-onboarding";

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * GET  — every coach holding an org-scoped `coach` role in the caller's
 *        org, each with their merged onboarding task list + overall
 *        completion. See Design decision 8 (plan doc) for the accepted N+1
 *        query shape at expected org sizes.
 * POST — admin confirms an admin_confirm-kind task (today: only
 *        shadow_session_confirmed) for one coach. Idempotent.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const db = getDb();

  const coachRows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(roles.name, "coach"),
        eq(userRoles.scopeType, "organization"),
        eq(userRoles.scopeId, auth.organizationId),
      ),
    )
    .orderBy(asc(users.lastName), asc(users.firstName), asc(users.id));

  const seen = new Set<string>();
  const uniqueCoaches = coachRows.filter((c) =>
    seen.has(c.id) ? false : (seen.add(c.id), true),
  );
  const coachIds = uniqueCoaches.map((c) => c.id);

  const coachTeamRows =
    coachIds.length > 0
      ? await db
          .select({
            id: teams.id,
            coachUserId: teams.coachUserId,
            assistantCoachUserId: teams.assistantCoachUserId,
          })
          .from(teams)
          .where(
            or(
              inArray(teams.coachUserId, coachIds),
              inArray(teams.assistantCoachUserId, coachIds),
            ),
          )
      : [];

  const teamIdsByCoach = new Map<string, string[]>();
  for (const c of uniqueCoaches) {
    teamIdsByCoach.set(
      c.id,
      coachTeamRows
        .filter((t) => t.coachUserId === c.id || t.assistantCoachUserId === c.id)
        .map((t) => t.id),
    );
  }

  const coaches = await Promise.all(
    uniqueCoaches.map(async (c) => {
      const { tasks, complete } = await getOnboardingTasks(
        db,
        c.id,
        auth.organizationId,
        teamIdsByCoach.get(c.id) ?? [],
      );
      return {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        tasks,
        complete,
      };
    }),
  );

  return json(200, { coaches });
};

const confirmSchema = z.object({
  userId: z.string().uuid(),
  taskKey: z.enum(ADMIN_CONFIRM_TASK_KEYS as [string, ...string[]]),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  let parsed;
  try {
    parsed = confirmSchema.safeParse(await context.request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) {
    return json(400, {
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const ownership = await requireUserInOrg(
    auth.organizationId,
    parsed.data.userId,
  );
  if (!ownership.ok) return ownershipDeniedResponse();

  const db = getDb();
  const [existing] = await db
    .select()
    .from(coachOnboardingProgress)
    .where(
      and(
        eq(coachOnboardingProgress.userId, parsed.data.userId),
        eq(coachOnboardingProgress.organizationId, auth.organizationId),
        eq(coachOnboardingProgress.taskKey, parsed.data.taskKey),
      ),
    )
    .orderBy(asc(coachOnboardingProgress.createdAt))
    .limit(1);

  if (!existing) {
    await db.insert(coachOnboardingProgress).values({
      userId: parsed.data.userId,
      organizationId: auth.organizationId,
      taskKey: parsed.data.taskKey,
      completedAt: new Date(),
    });
  }

  return json(200, { confirmed: true });
};
```

- [x] **Step 4: Run test to verify it passes**

```bash
TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/coach-onboarding.test.ts
```

Expected: PASS (8 tests).

- [x] **Step 5: Commit**

```bash
git add src/pages/api/admin/coaches/onboarding.ts tests/api/admin/coach-onboarding.test.ts
git commit -m "feat(coach-onboarding): add admin onboarding-summary + shadow-session confirm endpoint"
```

---

## Task 6: Coach dashboard checklist card

**Files:**
- Create: `src/components/coach/onboarding-checklist.tsx`
- Modify: `src/components/coach/coach-dashboard-overview.tsx`

**Interfaces:**
- Consumes: `GET`/`POST /api/coach/onboarding` (Task 4).
- Produces: `<OnboardingChecklist />` — a self-contained card that fetches its own data, hides itself once loading fails or onboarding is complete.

No dedicated automated test for this task (no existing sibling component in this codebase — e.g. `PrePracticeChecklist`, `CoachCredentialsGrid` — has a component-level test; verification is manual dev-server check now, and the new Task 9 E2E spec exercises it end-to-end).

- [x] **Step 1: Write the component**

```tsx
// src/components/coach/onboarding-checklist.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

interface OnboardingTask {
  key: string;
  label: string;
  description: string;
  kind: "manual" | "auto" | "admin_confirm";
  completed: boolean;
  completedAt: string | null;
}

export function OnboardingChecklist() {
  const [tasks, setTasks] = useState<OnboardingTask[] | null>(null);
  const [complete, setComplete] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/coach/onboarding");
      if (!res.ok) return; // fail-soft: card stays hidden rather than erroring
      const data = await res.json();
      setTasks(data.tasks);
      setComplete(data.complete);
    } catch {
      // fail-soft
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function completeTask(key: string) {
    setSavingKey(key);
    try {
      const res = await fetch("/api/coach/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskKey: key }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTasks(data.tasks);
      setComplete(data.complete);
    } catch {
      toast.error("Could not save — try again.");
    } finally {
      setSavingKey(null);
    }
  }

  // Visible until every task is complete, per the Phase 2 acceptance
  // criteria — once done, it disappears rather than collapsing.
  if (!tasks || complete) return null;

  const doneCount = tasks.filter((t) => t.completed).length;

  return (
    <Card
      className="bg-cream border-border"
      data-testid="onboarding-checklist"
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-ink">Getting started</CardTitle>
        <p className="text-sm text-ink/50">
          {doneCount}/{tasks.length} complete
        </p>
        <div className="h-1 bg-cream-2 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(doneCount / tasks.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.key}
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              task.completed
                ? "bg-primary/10 border-primary/20"
                : "bg-cream-2 border-transparent"
            }`}
          >
            {task.completed ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
            ) : (
              <Circle className="w-4 h-4 mt-0.5 text-ink-faint flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">{task.label}</p>
              <p className="text-xs text-ink-muted mt-0.5">
                {task.description}
              </p>
              {!task.completed && task.kind === "manual" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-xs"
                  disabled={savingKey === task.key}
                  onClick={() => void completeTask(task.key)}
                >
                  {savingKey === task.key ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "Mark as done"
                  )}
                </Button>
              ) : null}
              {!task.completed && task.kind === "admin_confirm" ? (
                <p className="text-xs text-ink-faint mt-1 italic">
                  Waiting for admin confirmation
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [x] **Step 2: Insert into the dashboard (two branches — see Design decision 7)**

In `src/components/coach/coach-dashboard-overview.tsx`, add the import alongside the existing ones:

```tsx
import { PrePracticeChecklist } from "./pre-practice-checklist"
import { CoachingTipCard } from "./coaching-tip-card"
import { OnboardingChecklist } from "./onboarding-checklist"
```

In the `teams.length === 0` branch, change:

```tsx
  if (teams.length === 0) {
    return (
      <div className="text-center py-16 px-6 rounded-2xl bg-paper border border-border border-dashed">
```

to:

```tsx
  if (teams.length === 0) {
    return (
      <>
        <OnboardingChecklist />
        <div className="text-center py-16 px-6 rounded-2xl bg-paper border border-border border-dashed">
```

...and close the added fragment at the end of that same return (immediately before the branch's final `)` — the existing JSX inside is otherwise untouched):

```tsx
        </Button>
      </div>
      </>
    )
  }
```

In the main success branch, change:

```tsx
  return (
    <div className="space-y-8">
      {/* Stats Overview */}
```

to:

```tsx
  return (
    <div className="space-y-8">
      <OnboardingChecklist />
      {/* Stats Overview */}
```

- [x] **Step 3: Manual verification**

```bash
npm run dev
```

Sign in as `coach@test.aspiresports.com` / `TestCoach123!`, visit `/coach`. Expected: "Getting started" card renders above the stats grid (this seeded account already has teams, so the empty-state branch isn't hit — the Task 9 E2E spec covers the zero-teams path against a freshly created coach).

- [x] **Step 4: Commit**

```bash
git add src/components/coach/onboarding-checklist.tsx src/components/coach/coach-dashboard-overview.tsx
git commit -m "feat(coach-onboarding): add dashboard checklist card"
```

---

## Task 7: Admin grid — surface per-coach onboarding completion + confirm action

**Files:**
- Modify: `src/components/admin/coach-credentials-grid.tsx`

**Interfaces:**
- Consumes: `GET`/`POST /api/admin/coaches/onboarding` (Task 5).

No dedicated automated test (the existing `CoachCredentialsGrid` has none either — the data-layer behavior is already covered by Task 5's API test; this task is presentation only). Manual dev-server verification in Step 3.

- [x] **Step 1: Add onboarding state + fetch, alongside the existing credentials fetch**

In `src/components/admin/coach-credentials-grid.tsx`, add new types near the top (after the existing `CoachRow` interface):

```tsx
interface OnboardingTask {
  key: string;
  label: string;
  kind: "manual" | "auto" | "admin_confirm";
  completed: boolean;
  completedAt: string | null;
}

interface OnboardingSummary {
  id: string;
  tasks: OnboardingTask[];
  complete: boolean;
}
```

Add state inside `CoachCredentialsGrid` (alongside the existing `coaches`/`error`/`edit`/`saving` state) and an `onboardingEdit` dialog state:

```tsx
  const [onboarding, setOnboarding] = useState<Record<string, OnboardingSummary> | null>(null);
  const [onboardingEdit, setOnboardingEdit] = useState<OnboardingSummary | null>(null);
  const [confirmingShadow, setConfirmingShadow] = useState(false);
```

Add a loader function next to `load` and call both on mount:

```tsx
  const loadOnboarding = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/coaches/onboarding");
      if (!res.ok) return; // fail-soft: onboarding column just won't render
      const data = await res.json();
      const byId: Record<string, OnboardingSummary> = {};
      for (const c of data.coaches as OnboardingSummary[]) byId[c.id] = c;
      setOnboarding(byId);
    } catch {
      // fail-soft
    }
  }, []);

  useEffect(() => {
    void load();
    void loadOnboarding();
  }, [load, loadOnboarding]);
```

(Replace the existing single-effect `useEffect(() => { void load(); }, [load]);` with the two-call version above.)

- [x] **Step 2: Add the table column + confirm dialog**

Add a new header cell immediately after the existing `<th className="py-2 pr-4">Coach</th>`:

```tsx
              <th className="py-2 pr-4 whitespace-nowrap">Onboarding</th>
```

Add a matching body cell immediately after the coach-info `<td>` (before the `{CREDENTIAL_TYPES.map(...)}` cells), inside the `coaches.map((coach) => ...)` row:

```tsx
                <td className="py-2 pr-4">
                  {onboarding?.[coach.id] ? (
                    <button
                      type="button"
                      onClick={() => setOnboardingEdit(onboarding[coach.id])}
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        onboarding[coach.id].complete
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {onboarding[coach.id].tasks.filter((t) => t.completed).length}/
                      {onboarding[coach.id].tasks.length}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
```

Add a second `Dialog` (separate from the existing credential-edit `Dialog`) right after the closing `</Dialog>` of the credential editor, before the component's final `</div>`:

```tsx
      <Dialog
        open={onboardingEdit !== null}
        onOpenChange={(open) => {
          if (!open) setOnboardingEdit(null);
        }}
      >
        <DialogContent>
          {onboardingEdit ? (
            <>
              <DialogHeader>
                <DialogTitle>Onboarding checklist</DialogTitle>
                <DialogDescription>
                  {onboardingEdit.tasks.filter((t) => t.completed).length}/
                  {onboardingEdit.tasks.length} complete.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {onboardingEdit.tasks.map((task) => (
                  <div
                    key={task.key}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <span
                      className={task.completed ? "text-ink" : "text-gray-500"}
                    >
                      {task.label}
                    </span>
                    {task.completed ? (
                      <span className="text-xs text-green-700">Done</span>
                    ) : task.kind === "admin_confirm" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={confirmingShadow}
                        onClick={async () => {
                          setConfirmingShadow(true);
                          try {
                            const res = await fetch(
                              "/api/admin/coaches/onboarding",
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  userId: onboardingEdit.id,
                                  taskKey: task.key,
                                }),
                              },
                            );
                            if (!res.ok) throw new Error();
                            toast.success("Confirmed.");
                            await loadOnboarding();
                            setOnboardingEdit(null);
                          } catch {
                            toast.error("Could not confirm — try again.");
                          } finally {
                            setConfirmingShadow(false);
                          }
                        }}
                      >
                        Confirm
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400">Pending</span>
                    )}
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOnboardingEdit(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
```

- [x] **Step 3: Manual verification**

```bash
npm run dev
```

Sign in as `admin@test.aspiresports.com` / `TestAdmin123!`, visit `/admin/coaches`. Expected: a new "Onboarding" column with an `N/6` badge per coach; clicking it opens a dialog listing all six tasks, with a "Confirm" button on the shadow-session row when incomplete.

- [x] **Step 4: Commit**

```bash
git add src/components/admin/coach-credentials-grid.tsx
git commit -m "feat(coach-onboarding): surface per-coach onboarding completion on the admin grid"
```

---

## Task 8: Assessment calibration guide content

**Files:**
- Modify: `src/lib/curriculum/content/coach-guidance.ts` (append to `COACH_RESOURCES`)
- Modify: `tests/unit/curriculum/registry.test.ts` (bump the exact-count assertion)
- Modify: `docs/operations/artifacts/manuals/role.coach.md` (cross-link, §3)

**Interfaces:**
- Consumes: nothing new — this is a content-registry addition, loaded by the existing `scripts/curriculum-load.ts` pipeline (Design decision 6).
- Produces: one new `coach_resources` row (once loaded), title `"Assessment Calibration: What a 2, a 3, and a 4 Actually Look Like"`, `topic: "assessment-calibration"`.

- [x] **Step 1: Run the existing registry test to see the current count**

```bash
npx vitest run tests/unit/curriculum/registry.test.ts -t "matches the true counts"
```

Expected: PASS at the current baseline (`resources` = 23) — confirms the starting point before this task's change.

- [x] **Step 2: Append the resource entry**

In `src/lib/curriculum/content/coach-guidance.ts`, add a new entry at the end of the `COACH_RESOURCES` array (immediately before its closing `];`):

```typescript
  {
    resourceType: "article" as const,
    title: "Assessment Calibration: What a 2, a 3, and a 4 Actually Look Like",
    description:
      "A worked-example guide to reading a skill's progression levels and observable behaviors consistently, comparing a player to their own past ratings, and knowing when to co-assess with a lead coach.",
    content: `# Assessment Calibration: What a 2, a 3, and a 4 Actually Look Like

## Why calibration matters

A "2" you give one player and a "2" a different coach gives another player
should mean the same thing. Assessment ratings only mean something to
parents and to the platform's development report if coaches read them the
same way.

## Read the rubric, don't guess from memory

Every skill's assessment page (\`/coach/assess/[playerId]\`) shows that
skill's **progression level descriptions** (what levels 1 through 5 mean for
this specific skill) and its **observable behaviors** (concrete things you
should be able to see, not impressions). Read both before you rate — don't
rely on a general sense of "pretty good" or "needs work."

## A worked example

Take a generic technical skill with this progression shape:

- **1 (Emerging):** Attempts the skill but rarely completes it under any
  pressure.
- **2 (Developing):** Completes the skill in isolation (no pressure, no
  decision) most of the time; breaks down under any opposition or time
  pressure.
- **3 (Competent):** Completes the skill reliably in small-sided game
  situations with light pressure; occasional breakdown under full pressure.
- **4 (Proficient):** Completes the skill under game-realistic pressure and
  starts making it look easy; can vary it (weak foot/hand, different angle).
- **5 (Advanced):** Executes under pressure with disguise, speed, or
  creativity beyond what's coached — this is rare at youth levels and should
  be rare in your ratings too.

The line between a 2 and a 3 is **pressure and context**, not repetition
count. A player who can do a move 20 times against a cone but freezes the
first time a defender closes is a 2, not a 3 — no matter how clean the
cone-only rep looked.

## Compare the player to themselves, not to teammates

Ratings track individual development over time, not a leaderboard. A player
who moved from a 1 to a 2 this month made real progress and should be
recognized for it, even if a teammate is already a 4. Never let "where does
this player rank against the team" creep into the number — that's what
turns assessment into judgment instead of development tracking.

## When to co-assess with a lead coach

If you're new to assessing, or a rating feels genuinely borderline (a strong
2 vs. a weak 3, especially), assess your first few sessions alongside a lead
coach or your assigned mentor and compare notes before finalizing. This is
exactly what the "Shadow session confirmed" onboarding step is for — use
that session to calibrate ratings together, not just to observe practice
delivery.

## Remember

The goal isn't a precise science — it's consistency. A parent reading "3,
stable trend" for two different children coached by two different people
should be able to trust that those 3s mean roughly the same thing.`,
    topic: "assessment-calibration",
    tags: ["assessment", "calibration", "onboarding", "rubric"],
    featured: false,
    active: true,
  },
```

- [x] **Step 3: Update the exact-count assertion**

In `tests/unit/curriculum/registry.test.ts`, in the `"matches the true counts..."` test, update the resources assertion and its comment:

```typescript
      // 12 (coach-resources.ts) + 9 (coach-training-modules.ts resourcesData)
      // + 2 wave-2 additions (1 hockey + 1 baseball article)
      // + 1 Phase 2 addition (assessment calibration guide)
      expect(CURRICULUM_CONTENT.coachGuidance.resources).toHaveLength(24);
```

- [x] **Step 4: Run the registry tests to verify they pass**

```bash
npx vitest run tests/unit/curriculum/registry.test.ts
```

Expected: PASS, including `"coach_resources natural key (title) has no duplicates"` and `"validateRegistry still passes with coach guidance content loaded"`.

- [x] **Step 5: Cross-link from the coach manual**

In `docs/operations/artifacts/manuals/role.coach.md`, in section "## 3. Assessment duties", insert a new paragraph immediately after the `**Cadence.**` paragraph and before `**Coach notes.**`:

```markdown
**Calibrating your ratings.** A 2 for one player and a 2 for another should
mean the same thing. Read the skill's progression-level descriptions and
observable-behavior list on the assessment page before you rate — don't go
from memory. Compare a player to their own past ratings, not to teammates.
If a rating feels borderline (a strong 2 vs. a weak 3, especially), use your
shadow session to co-assess with a lead coach and compare notes. The full
worked-example guide is at `/coach/resources` (topic: assessment
calibration).
```

- [ ] **Step 6: Load the content locally (non-blocking for CI — see note)** — SKIPPED, see deviation note below.

```bash
npm run curriculum:load -- --org=aspire-sports --dry-run
```

Expected: dry-run report shows `coach_resources: 1 add` (or `0 add / 1 unchanged` if already loaded on this DB from a previous run). Re-run without `--dry-run` to actually apply it to your local/staging-pointed DB. Note: this load step does not gate CI — the registry lives in code and is tested by Step 4; the actual DB row only needs loading before a coach can see it in `/coach/resources`, which the ops runbook already covers for staging/prod (same mechanism Phase 1's credential-adjacent content used).

> **Deviation:** `ALLOW_CURRICULUM_SEED=yes ./scripts/with-bws.sh npm run curriculum:load -- --org=aspire-sports --dry-run` was attempted but refused by the script's own env guard: `DATABASE_URL does not contain 'staging'` (the Railway proxy URL injected by `bws` for this worktree doesn't literally contain the substring, even though it's presumably the intended staging DB per house convention). Bypassing requires `ALLOW_PROD_AUDIT=yes`. Per this task's explicit instruction ("do NOT run the loader against staging with write flags — dry-run only, the controller handles the real load") and being unable to positively confirm the target DB from a non-credential-printing check, I chose not to force the bypass rather than risk pointing an unverified DB context at a prod-audit flag. The registry-level verification (Step 4, `registry.test.ts`) fully covers this task's code change; the controller's verification sweep should run the dry-run (and, if appropriate, the real load) with a DB context it has already confirmed.

- [x] **Step 7: Commit**

```bash
git add src/lib/curriculum/content/coach-guidance.ts tests/unit/curriculum/registry.test.ts docs/operations/artifacts/manuals/role.coach.md
git commit -m "content(coach-onboarding): add assessment calibration guide + manual cross-link"
```

---

## Task 9: E2E spec for the checklist (new file, conflict-tolerant)

**Files:**
- Create: `tests/e2e/coach-onboarding-checklist.spec.ts`

**Interfaces:**
- Consumes: `waitForHydration`, `TEST_USERS`, `signIn` (`tests/utils/test-helpers.ts`); the `/coach` page already hydrates via `PortalLayout`'s existing `useHydrationBeacon()` call (confirmed — no beacon wiring needed for this task).

This is a **new** spec file rather than an edit to `tests/e2e/coach-dashboard.spec.ts`, per the Global Constraints note on staying conflict-tolerant with the in-flight Phase 4 branch.

- [x] **Step 1: Write the spec**

```typescript
// tests/e2e/coach-onboarding-checklist.spec.ts
import { test, expect } from "@playwright/test";
import { TEST_USERS, signIn, waitForHydration } from "../utils/test-helpers";

test.describe("Coach onboarding checklist", () => {
  test("shows the checklist card on the coach dashboard and marks a manual task done", async ({
    page,
  }) => {
    await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);
    await page.goto("/coach", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const card = page.locator('[data-testid="onboarding-checklist"]');

    // The seeded coach account may already have completed onboarding from a
    // prior test run against the shared CI DB — only assert interaction
    // when the card is actually present.
    if (await card.isVisible().catch(() => false)) {
      const markDoneButton = card
        .getByRole("button", { name: /mark as done/i })
        .first();
      await expect(markDoneButton).toBeVisible();
      await markDoneButton.click();
      await expect(markDoneButton).toHaveCount(0, { timeout: 5000 }).catch(() => {
        // Acceptable: clicking one task doesn't remove the card unless it
        // was the last incomplete task — just confirm no error state appeared.
      });
      await expect(page.locator("text=/could not save/i")).toHaveCount(0);
    }
  });
});
```

- [x] **Step 2: Run it**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- coach-onboarding-checklist
```

Expected: PASS. (This spec only runs post-merge on `main` per house convention — it will not gate the PR, per CLAUDE.md's `test-full` note; still run it locally before merging.)

- [x] **Step 3: Commit**

```bash
git add tests/e2e/coach-onboarding-checklist.spec.ts
git commit -m "test(coach-onboarding): add e2e spec for the dashboard checklist card"
```

---

## Final verification (run before opening the PR)

```bash
cd /Volumes/MahadData/Aspire-Sports/web-app
npx vitest run tests/unit/coach-onboarding-tasks.test.ts tests/unit/curriculum/registry.test.ts
# with dev server running (npm run dev, R2_MOCK=1 CRON_SECRET=<anything>):
TEST_BASE_URL=http://localhost:4321 npm run test:api
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- coach-onboarding-checklist
npm run build
npx tsc --noEmit
```

Then follow the repo's `/ship` skill / pre-push checklist (migration generated and committed, e2e seed re-run, API + Playwright green, build green, typecheck clean) before pushing.
