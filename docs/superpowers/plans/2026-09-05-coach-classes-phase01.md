# Coach → Classes Phase 0+1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coaches can be staffed onto class sessions (slot-level default that auto-propagates + per-session overrides + assistants), see their class rosters in the coach portal, and record glows/notes for class children — which parents then see through the existing dashboard surfaces untouched.

**Architecture:** Per the decided scoping spec (`docs/superpowers/specs/2026-09-05-coach-activity-pipeline-scoping.md` §6): a polymorphic `coaching_assignments` table (kinds `team`/`class_template`/`class_session`) is the single source of who coaches what; the class materializer copies template-level assignments onto each session it creates; `coach_notes` gains a dual anchor (nullable `teamId` XOR generic `activityKind`+`activityId`); one resolver (`getCoachGroups`) and one reach predicate (`canCoachReachFamilyMember`) gain class branches. Existing league coaching (teams.coachUserId columns) keeps working unchanged — the resolver reads both sources.

**Tech Stack:** Astro 5 SSR, React 19 islands, Drizzle/Postgres, Vitest, Playwright.

## Global Constraints

- **Schema changes go through `npm run db:generate`** → review the generated SQL → commit the migration. New enums in a NEW table's migration are fine; never `ALTER TYPE ... ADD VALUE` in a shared migration (55P04 hazard). `coach_notes` changes must be additive-safe: DROP NOT NULL + ADD COLUMN + ADD CONSTRAINT only.
- Tenant scoping: every new query filters `organizationId`; every admin endpoint validates ownership via the `requireSameOrg*` / `requireOrgAdminAccess` helpers (`src/lib/auth/require-resource-ownership.ts`, `src/lib/auth/roles.ts`).
- Polymorphic `targetId` carries **no DB FK** (established pattern: `self_service_tokens`, `feedback_requests`, `resource_blocks`); resolved by `kind` at the app layer; document this on the table.
- **Access model (spec §6.3):** WRITE requires an active assignment covering the child; READ of a child's development data is open to the org's coaching staff. New endpoints implement this; existing team endpoints are NOT refactored in this phase.
- **Reuse the glows language system** — `reinforcement.ts` is the single source of chip language; the class glows flow must not fork it.
- Parent dashboard surfaces are NOT modified — the win condition is that they light up on their own.
- `.limit(1)` needs orderBy (or a comment naming a unique constraint). E2E: `waitForHydration`, element clicks, testids, hydration beacon on new client:load islands.
- Dev env: server via `./scripts/with-bws.sh env R2_MOCK=1 CRON_SECRET=<x> E2E_TEST_ENDPOINTS=yes npm run dev -- --port 4331`; test processes need with-bws for DATABASE_URL; bws mangles inline `bash -c`/`node -e` — file-based scripts only. FOREGROUND test runs only.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility | Fate |
|---|---|---|
| `src/lib/db/schema/coaching.ts` | `coaching_assignments` table + enums + types | create (T1) |
| `src/lib/db/schema/teams.ts` | `coach_notes` dual anchor | modify (T1) |
| `src/lib/db/migrations/NNNN_*.sql` | generated migration | create (T1) |
| `src/lib/coach/coaching-assignments.ts` | assignment CRUD helpers + `setCoachesFor(kind,targetId,{lead,assistants})` | create (T2) |
| `src/lib/coach/get-coach-groups.ts` | unified "my groups" resolver (teams + class templates/sessions) | create (T2) |
| `src/lib/auth/roles.ts` | `canCoachReachFamilyMember` (roster OR class branches); `isOrgCoachingStaff` | modify (T2) |
| `src/lib/classes/materialize.ts` | copy template assignments → session assignments on materialization | modify (T3) |
| `src/pages/api/admin/classes/templates/[id]/coaches.ts` | GET/PUT template coach set (+applyToMaterialized) | create (T3) |
| `src/pages/api/admin/classes/sessions/[id]/coaches.ts` | GET/PUT per-session coach set | create (T3) |
| `src/lib/admin/coach-candidates.ts` | org coach-candidate list (extracted recipe from `src/pages/admin/teams/index.astro:34-95`) | create (T4) |
| `src/components/admin/classes/template-staffing.tsx` + wiring into `src/pages/admin/classes/[id].astro` | default-coach picker + future-session staffing list | create (T4) |
| `src/pages/api/coach/classes/index.ts`, `[templateId].ts` | coach's class groups + roster/session detail | create (T5) |
| `src/pages/coach/classes/index.astro`, `[templateId].astro` + `src/components/coach/classes/*` | coach portal pages | create (T5) |
| `src/pages/api/coach/class-sessions/[id]/glows.ts` | class-session glows bootstrap + batch write | create (T6) |
| `src/components/coach/classes/class-glows.tsx` | capture UI (reusing chip/reinforcement system) | create (T6) |
| `tests/…` | per task below | create/modify |

---

### Task 1: Schema — `coaching_assignments` + `coach_notes` dual anchor

**Files:** Create `src/lib/db/schema/coaching.ts`; modify `src/lib/db/schema/teams.ts` (coach_notes), `src/lib/db/schema/index.ts` (export); generate migration.

**Interfaces (produced — later tasks consume verbatim):**
```ts
// src/lib/db/schema/coaching.ts
export const coachingRoleEnum = pgEnum("coaching_role", ["lead", "assistant"]);
export const coachingAssignmentKindEnum = pgEnum("coaching_assignment_kind", [
  "team", "class_template", "class_session",
]);
export const coachingAssignments = pgTable("coaching_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  coachUserId: uuid("coach_user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: coachingRoleEnum("role").notNull().default("lead"),
  kind: coachingAssignmentKindEnum("kind").notNull(),
  targetId: uuid("target_id").notNull(), // polymorphic by kind — NO FK by design
  active: boolean("active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("coaching_assignments_coach_kind_target").on(t.coachUserId, t.kind, t.targetId),
  index("coaching_assignments_kind_target_idx").on(t.kind, t.targetId),
  index("coaching_assignments_coach_idx").on(t.coachUserId),
]);
```
`coach_notes` changes: `teamId` loses `.notNull()`; add `activityKind: varchar("activity_kind", { length: 32 })` (varchar not enum — kinds will grow with camps and enum-adds are 55P04-fraught; app-layer validated) and `activityId: uuid("activity_id")` (no FK — polymorphic); add CHECK `coach_notes_anchor_check`: `(team_id IS NOT NULL AND activity_kind IS NULL AND activity_id IS NULL) OR (team_id IS NULL AND activity_kind IS NOT NULL AND activity_id IS NOT NULL)`; add index on `(activity_kind, activity_id)`.

- [ ] **Step 1:** Write the schema changes. `npm run db:generate`; READ the generated SQL — confirm: new enums + table; `ALTER TABLE coach_notes ALTER COLUMN team_id DROP NOT NULL`, two ADD COLUMNs, ADD CONSTRAINT (Drizzle may not emit CHECKs — if absent, hand-append the `ALTER TABLE ... ADD CONSTRAINT coach_notes_anchor_check CHECK (...)` to the same migration file, idempotently guarded like migrations 0023/0024).
- [ ] **Step 2:** Migration applies cleanly to staging: `./scripts/with-bws.sh npm run db:migrate` (staging DATABASE_URL). `npx tsc --noEmit` clean.
- [ ] **Step 3:** Quick constraint test (API-test style, direct DB): insert coach_notes row with BOTH anchors → expect DB error; with team anchor only → ok; with activity anchor only → ok; duplicate assignment (same coach/kind/target) → unique violation. Put in `tests/api/coaching/assignments-schema.test.ts` (needs with-bws DATABASE_URL; cleanup deletes inserted rows).
- [ ] **Step 4:** Commit — `feat(coaching): coaching_assignments table + coach_notes dual anchor`

### Task 2: Resolvers — groups, reach, org-staff read

**Files:** Create `src/lib/coach/coaching-assignments.ts`, `src/lib/coach/get-coach-groups.ts`; modify `src/lib/auth/roles.ts`; tests `tests/api/coaching/resolvers.test.ts`.

**Interfaces (produced):**
```ts
// coaching-assignments.ts
export async function setCoachesFor(opts: {
  organizationId: string; kind: "class_template" | "class_session"; targetId: string;
  lead: string | null; assistants: string[]; // max 2 enforced here
  createdByUserId: string; dbOrTx?: DbClient;
}): Promise<void>; // declarative replace: deactivates rows not in the new set, upserts the rest
export async function getCoachesFor(kind: string, targetId: string):
  Promise<Array<{ coachUserId: string; role: "lead" | "assistant"; name: string }>>;

// get-coach-groups.ts
export interface CoachClassGroup {
  templateId: string; name: string; weekday: number; startTime: string;
  role: "lead" | "assistant"; sessionOnly: boolean; // true = substitute: session assignment(s) without a template assignment
}
export async function getCoachGroups(userId: string, organizationId: string): Promise<{
  teamIds: string[];            // existing team resolution, unchanged semantics
  classGroups: CoachClassGroup[];
}>;

// roles.ts additions
export async function canCoachReachFamilyMember(userId: string, familyMemberId: string, organizationId: string): Promise<boolean>;
// = isPlayerOnCoachTeam(existing roster branch)
//   OR active class_enrollments row whose slotTemplateId has an active class_template assignment for userId
//   OR confirmed dropInBookings row (familyMemberId) whose sessionId has an active class_session assignment for userId
export async function isOrgCoachingStaff(userId: string, organizationId: string): Promise<boolean>;
// coach role in org (mirror the role-resolution used by requireCoachPortalAccess) — the READ gate per spec §6.3
```

- [ ] **Step 1 (failing tests):** `tests/api/coaching/resolvers.test.ts` — fixtures via `tests/utils/classes-helpers.ts` (template + child + enrollment) + direct assignment inserts: (a) template-lead coach reaches enrolled child, not an unenrolled one; (b) session-only substitute reaches a booked child of that session only, `sessionOnly: true` in groups; (c) ended enrollment → reach false; (d) `setCoachesFor` replace semantics (old lead deactivated, new set active, >2 assistants rejected); (e) `getCoachGroups` returns both a team (seeded coach fixture) and a class group.
- [ ] **Step 2:** Run → FAIL (modules missing). Implement. Batched queries; no per-group loops.
- [ ] **Step 3:** Green + `npx tsc --noEmit`. Commit — `feat(coaching): group resolver + class reach predicate + org-staff read gate`

### Task 3: Propagation + admin staffing endpoints

**Files:** Modify `src/lib/classes/materialize.ts`; create `src/pages/api/admin/classes/templates/[id]/coaches.ts`, `src/pages/api/admin/classes/sessions/[id]/coaches.ts`; tests `tests/api/coaching/staffing.test.ts` (+ extend `tests/api/classes/cron-materialize.test.ts`).

- Materializer: after each session insert, copy the template's ACTIVE assignments to `class_session` assignments (`onConflictDoNothing` on the unique). Idempotent across re-runs.
- `PUT /api/admin/classes/templates/[id]/coaches` body `{ lead: string|null, assistants: string[], applyToMaterialized?: boolean }` → `setCoachesFor(kind:'class_template')`; when `applyToMaterialized`, also replace coach sets on FUTURE scheduled sessions of the template that have NOT been individually overridden — track overrides via a `sessionStaffingOverridden` marker: simplest honest rule for Phase 1 is "applyToMaterialized replaces ALL future sessions' sets" and the UI warns; document the rule in the endpoint header. GET returns current sets (template + per-future-session).
- `PUT /api/admin/classes/sessions/[id]/coaches` body `{ lead, assistants }` → session-level replace.
- Both endpoints: org-admin gated, template/session ownership validated against `locals.organization` (mirror `templates/[id]/roster.ts`'s guards), coach ids validated as org coach candidates.

- [ ] **Step 1 (failing tests):** staffing.test.ts — PUT template coaches → GET reflects; materialize (call the cron endpoint like `cron-materialize.test.ts` does) → new sessions carry the set; PUT with `applyToMaterialized` → existing future session updated; per-session PUT overrides survive nothing else touching them; cross-org template id → 404; non-admin → 403.
- [ ] **Step 2:** Run → FAIL → implement → green + tsc + re-run `tests/api/classes/cron-materialize.test.ts` (must stay green).
- [ ] **Step 3:** Commit — `feat(coaching): staffing endpoints + materializer propagation`

### Task 4: Admin staffing UI

**Files:** Create `src/lib/admin/coach-candidates.ts` (extract the roles⋈userRoles⋈users recipe from `src/pages/admin/teams/index.astro:34-95` — leave that page untouched); create `src/components/admin/classes/template-staffing.tsx`; wire into `src/pages/admin/classes/[id].astro` (template detail page, alongside the roster panel).

Panel contents: current default lead + assistants (pickers from candidates), Save (PUT template coaches; checkbox "apply to already-scheduled sessions"); beneath, the future materialized sessions list (date, current lead/assistants, per-session Change action → PUT session coaches). Toasts via sonner; `ErrorBanner` for load failures; testids `staffing-panel`, `staffing-lead-select`, `staffing-save`, `session-staffing-row`, `session-staffing-change`.

- [ ] **Step 1 (failing e2e):** new `tests/e2e/coach-classes.spec.ts` — admin signs in (`admin@test.aspiresports.com`/`TestAdmin123!`), opens a fixture template's detail page, assigns the seeded coach (`coach@test.aspiresports.com`) as lead, saves, reloads, sees it persisted; overrides one session row. Fixture recipe: classes-helpers template + a couple of materialized sessions (insert dropInSessions directly with `classSlotTemplateId` set).
- [ ] **Step 2:** Run → FAIL → implement → green + `dashboard-persona`/existing admin classes specs unaffected (`tests/e2e/` grep for `/admin/classes` specs; run any).
- [ ] **Step 3:** Commit — `feat(admin): class template staffing panel`

### Task 5: Coach portal — My classes + class roster

**Files:** Create `src/pages/api/coach/classes/index.ts` (`getCoachGroups(...).classGroups` for the signed-in coach; 403 via `requireCoachPortalAccess` pattern), `src/pages/api/coach/classes/[templateId].ts` (gate: coach must hold an assignment on the template or one of its sessions, OR `isOrgCoachingStaff` for read; returns template info + active enrollments (child name, age, kitSize) + next N sessions with per-child booking + `checkedInAt`); create `src/pages/coach/classes/index.astro` + `[templateId].astro` + `src/components/coach/classes/my-classes.tsx`, `class-roster.tsx` (client:load, `useHydrationBeacon()`).

Navigation: add a "Classes" entry to the coach portal nav ONLY if a nav component exists (check `src/pages/coach/index.astro` / coach layout; otherwise link from the dashboard overview card area — implementer judgment, note in report).

- [ ] **Step 1 (failing e2e):** extend `coach-classes.spec.ts` — coach signs in, `/coach/classes` lists the assigned template (from Task 4 fixture), opens it, sees the enrolled child's name and the upcoming sessions. A coach with NO assignments sees the empty state (`EmptyState` primitive).
- [ ] **Step 2:** Run → FAIL → implement → green + tsc. Also API test additions in `tests/api/coaching/portal.test.ts`: 401 anon; assigned coach 200; unassigned org coach 200 (read-open per §6.3) but `writable: false` flag in response; parent role 403.
- [ ] **Step 3:** Commit — `feat(coach): class groups + roster in the coach portal`

### Task 6: Glows/notes for class children

**Files:** Create `src/pages/api/coach/class-sessions/[id]/glows.ts` — mirror the CONTRACT of `src/pages/api/coach/sessions/[id]/glows.ts` (read it fully first: GET bootstrap = roster + chip sets + existing notes; POST = whole-batch write) with: roster = confirmed `dropInBookings` of the session with non-null `familyMemberId` (join familyMembers for names); auth = active `class_session`/`class_template` assignment covering the session (write) — NOT org-read; notes written with `teamId: null, activityKind: 'class_session', activityId: sessionId`; same chip language source (`reinforcement.ts`), same `noteCategoryEnum` values, `visibleToParent: true` for glows (match the team flow's choice — read it). Create `src/components/coach/classes/class-glows.tsx` reusing the chip UI pieces from `src/components/coach/glows-grows-flow.tsx` (extract shared pieces only if imports force it — prefer composition over refactor); entry point: a "Glows & grows" action per upcoming/past session row on the Task 5 roster page.

- [ ] **Step 1 (failing API test):** `tests/api/coaching/class-glows.test.ts` — assigned coach POSTs a glow batch for a booked child → 200, coach_notes row exists with activity anchor + null teamId; unassigned coach → 403; child without booking in that session → rejected; GET bootstrap returns the roster + previously written notes.
- [ ] **Step 2:** Run → FAIL → implement → green.
- [ ] **Step 3 (the payoff e2e):** extend `coach-classes.spec.ts`: coach records a glow for the fixture child → sign in as the PARENT → `/dashboard/family` Recent Glows (and/or the child profile) shows it — parent surfaces untouched by this branch. This is the acceptance test for the whole phase.
- [ ] **Step 4:** Run → green + tsc → re-run `tests/e2e/coach-glows.spec.ts` (existing team glows flow must stay green).
- [ ] **Step 5:** Commit — `feat(coaching): glows and notes for class sessions, parent-visible`

### Task 7: Ship gate + final review + PR

- [ ] Suites: `tests/api/coaching/` + `tests/api/classes/` + `tests/e2e/coach-classes.spec.ts` + `tests/e2e/coach-glows.spec.ts` + `tests/e2e/classes-dashboard.spec.ts` (parent surfaces regression) + `dashboard-persona`; `./scripts/with-bws.sh npm run build`; `npx tsc --noEmit`; migration idempotency (re-run db:migrate).
- [ ] Final whole-branch review (most capable model) + one fix wave + scoped re-review.
- [ ] Browser smoke: admin staffing panel, coach portal, parent glow visibility.
- [ ] Push, PR: `feat: coach staffing + class coaching — glows/notes reach class parents (Phase 0+1)`; reference spec PR #623.

## Deliberately out of scope (later phases per spec §6.7)

- League auto-rostering (Phase 2). Player-centric monthly snapshots + parent reports (Phase 3). Camps (Phase 4). session_plans dual-anchor / field mode for classes (Phase 5). Assessments for class children (Phase 3 — glows/notes only in this phase). Refactoring existing team endpoints onto the new table.
