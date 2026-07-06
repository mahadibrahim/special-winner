# Coach Lifecycle & Delivery Operations — Program Plan

> **For agentic workers:** This is a PROGRAM plan — phases scoped for sequencing and design, not task-level execution. Before executing any phase, write a dated task-level implementation plan for that phase via `superpowers:writing-plans` (bite-sized TDD tasks), referencing this doc as the spec. Do not implement directly from this document.

**Goal:** Close the operational gaps between the curriculum system (content, session plans, assessment loop — all live) and the human workflows that deliver it: hiring a coach, clearing and onboarding them, putting philosophy-aligned plans in their hands on a schedule, and keeping the assessment loop honest.

**Architecture:** Four independent phases layered onto existing systems — the ATS (`job_applications`), the coach surface (`/coach/**`), the curriculum library (`practice_templates`, `session_plans`), and the assessment loop (`player_assessments` → snapshots → parent radar). Each phase ships standalone value; ordering reflects risk (child-safety compliance first) and dependency (sequencing before cadence enforcement is optional but natural).

**Tech Stack:** Existing stack only — Astro 5 + React 19, Drizzle/Postgres, Lucia auth, Resend. No new services.

## Global Constraints

- Schema changes go through `npm run db:generate` → commit migration → `db:migrate`; never `db:push` against remote DBs. Write migrations idempotently (`ADD COLUMN IF NOT EXISTS`, `DO $$ ... duplicate_object` guard).
- Every admin API endpoint validates tenant ownership via `requireSameOrg*` helpers (`src/lib/auth/require-resource-ownership.ts`). Coach endpoints use `requireCoachAccess*` helpers scoped to team assignments.
- New tables follow the curriculum convention: nullable `organizationId` where NULL = global default, org rows override.
- Any `findFirst`/`.limit(1)` gets an explicit `orderBy` (shared CI database hazard).
- All coach/admin pages are SSR (no `prerender = true`); UI states use `ErrorBanner` / `EmptyState` / `LoadingSkeleton` primitives.
- New timestamps in UTC, displayed in org timezone.
- E2E specs run post-merge only — grep `tests/e2e/` for affected surfaces before merging route changes.
- Each phase's implementation runs in a worktree (≥3 tasks, subagent-driven).

## Background: current state (assessed 2026-07-06)

**Working today:**
- `/coach/**` surface: rosters, attendance, practice planner (templates + activity library → dated `session_plans` with post-session reflections), 1–5 skill assessments, coach notes (`visibleToParent` flag), standings/scores, parent messaging, JIT prompts.
- Assessment write → `player_assessments` → `recomputePlayerSnapshots()` → `assessment_snapshots` / `player_skill_summary` / `player_achievements` → parent development page with domain radar. End-to-end, tenant-scoped.
- Deep session-plan content (`src/lib/curriculum/content/*/session-plans.ts`): minute-by-minute scripts, equipment, progressions, troubleshooting. Written philosophy in `src/data/coaching-philosophy.ts`, surfaced at `/coach/resources`.
- ATS intake: `/careers` form → `job_applications` (Postgres source of truth) → Notion board + Resend notification. Admin read-only list at `/admin/applications`.

**Gaps this program closes:**
1. No path from hired applicant → coach user account; pipeline stages live only in Notion, never synced back. No hiring criteria/rubric.
2. Zero compliance tracking: no SafeSport, background check, CPR, or concussion-cert records anywhere in schema (free text on the application only). Coach role manual (`docs/operations/artifacts/manuals/role.coach.md`) is an unwritten stub. No onboarding checklist.
3. No season-level curriculum sequencing — plans are pulled by coach initiative, never pushed. A new hire can run a season without touching the library.
4. No assessment quality controls: `assessmentFrequency` on domains is decorative; no staleness visibility for admins, no inter-coach calibration guidance, no coach-quality rubric.

**Explicitly out of program scope:**
- First-class class/camp/clinic delivery unit (today everything hangs off team-in-a-season; acceptable proxy until the 2027 kids-classes push — revisit then).
- Full ATS pipeline management in-app (interview scheduling, offer letters, applicant accounts — Notion keeps those).
- Payroll/scheduling of coach shifts (ops catalog territory, separate effort).
- Curriculum content coverage (Discovery/Competitive/Refinement stages, baseball activities) — owned by the curriculum refinery's `DIRECTIVES.md`, not this program.

---

## Phase 1 — Coach compliance & the hire→account handoff

**Why first:** child-safety/legal exposure. There is currently no system of record proving a coach on the floor is cleared to be there, and the ATS dead-ends at "application received."

**Scope (in):**
- `coach_credentials` table: `userId`, `organizationId` (nullable), `credentialType` enum (`safesport`, `background_check`, `cpr_first_aid`, `concussion_protocol`, `coaching_license`, `other`), `status` enum (`pending`, `valid`, `expired`, `rejected`), `issuedAt`, `expiresAt`, `documentKey` (R2, reuse resume-upload plumbing from `src/pages/api/public/careers/apply.ts`), `verifiedByUserId`, `notes`, timestamps. Unique on (`userId`, `organizationId`, `credentialType`).
- Required-credential set: hardcoded constant per role for now (SafeSport + background check + CPR/first-aid + concussion, per `docs/research/03-effective-coaching-practices.md`). A `credential_requirements` table is YAGNI until a second org wants a different set.
- Hire handoff: `hired` value added to `job_applications.status`; admin action on `/admin/applications` — "Mark hired" → creates `users` row (or links existing by email), assigns org-scoped `coach` role via `userRoles`, sends invite email (reuse password-reset token flow), stamps `job_applications.hiredUserId`. Application's free-text `certifications` shown on the new coach's credential page as a starting reference.
- Admin compliance view: `/admin/coaches` grid — coaches × credential types, status color, expiring-within-60-days warnings. Endpoint `api/admin/coaches/credentials` (list + upsert + verify), tenant-scoped.
- Soft gate: assigning a coach to a team (`teams.coachUserId` / `assistantCoachUserId` writes) surfaces a non-blocking warning listing missing/expired credentials. Blocking is a later decision — don't strand ops during rollout.

**Scope (out):** automated background-check vendor integration; Notion status sync-back beyond `hired`; credential self-service upload by coaches (admin-entered v1).

**Files (expected):** create `src/lib/db/schema/coach-credentials.ts` + migration; modify `src/lib/db/schema/job-applications.ts` (status enum + `hiredUserId`); create `src/pages/api/admin/coaches/credentials/*.ts`, `src/pages/admin/coaches.astro`, `src/components/admin/coach-credentials-grid.tsx`; modify `src/components/admin/applications-list.tsx` (hire action) + `src/pages/api/admin/applications/[id]/hire.ts`; invite-email template alongside existing Resend templates.

**Acceptance:** an admin can mark an application hired and the applicant receives a working invite that lands them in `/coach` with a coach role; the compliance grid shows every coach's credential state; a team assignment to an uncleared coach shows the warning; API tests cover tenant isolation (org A admin cannot read org B credentials) and the hire flow; `tests/api/` green.

---

## Phase 2 — Coach onboarding: manual + in-product checklist

**Why:** the coach manual is an explicit stub, onboarding is tribal knowledge, and Phase 1 creates brand-new coach accounts that land on a dashboard with no "start here."

**Scope (in):**
- Author `docs/operations/artifacts/manuals/role.coach.md` for real (replacing the stub; `role.coach.yaml` already declares `manual_target: hand_authored`). Content sources: `src/data/coaching-philosophy.ts` `programStructures` (ratios 1:4–1:6, class caps, camp schedules, equipment lists), the ops catalog's check-in/attendance/safety/equipment activities, and the philosophy doc. Sections: before-season, day-of for each program format (league practice, skills class, camp day, clinic), assessment duties, incident/safety escalation, parent communication.
- Extend the ops catalog with class/camp day-of activities: today only `act.walk_on_registration` carries `[drop_in, clinic]` tags. Add catalog entries (YAML) for class/camp session open, ratio check, and equipment setup/teardown keyed to the instructional formats.
- In-product onboarding checklist: `coach_onboarding_progress` table (`userId`, `organizationId`, `taskKey`, `completedAt`); task definitions hardcoded (read philosophy, read coach manual, review sport guide + relevant minibooks, credentials submitted [auto-checked from Phase 1 data], first practice plan created [auto-checked from `session_plans`], shadow session confirmed by admin). Checklist card on the coach dashboard (`coach/index.astro` / `coach-dashboard-overview`) until complete; admin sees per-coach completion on the Phase 1 `/admin/coaches` grid.
- Assessment calibration guide: a `coach_resources` entry + section in the manual — worked examples of what a 2 vs 3 vs 4 looks like per domain using existing `progressionLevels`/`observableBehaviors`, "compare player to self not peers," when to co-assess with a lead coach. (Content, cheap, pairs naturally with the manual; the *enforcement* side is Phase 4.)

**Scope (out):** LMS-style training modules with quizzes; coach-quality performance reviews (needs a season of data — revisit after Phase 4); certification expiry automation beyond Phase 1's grid.

**Files (expected):** replace `docs/operations/artifacts/manuals/role.coach.md`; add YAML under `docs/operations/catalog/`; create `src/lib/db/schema/coach-onboarding.ts` + migration; `src/pages/api/coach/onboarding.ts` (GET progress / POST complete-task), `src/components/coach/onboarding-checklist.tsx`; modify `src/components/coach/coach-dashboard-overview.tsx` and the Phase 1 admin grid; seed the calibration guide into `coach_resources` via `src/lib/db/seed-curriculum.ts`.

**Dependencies:** Phase 1 (credentials auto-check, admin grid slot). The manual + catalog work has no dependency and can start any time.

**Acceptance:** a freshly-invited coach sees the checklist, auto-items check themselves off from real data, admin can see who's onboarded; the manual exists with all program-format day-of sections; catalog validates (existing ops catalog checks pass); Playwright spec for the checklist interaction uses `waitForHydration`.

---

## Phase 3 — Season-level session-plan sequencing (push, not pull)

**Why:** this is the "plans that adhere to our philosophy" gap. The content is excellent but reaches players only if each coach independently seeks it out.

**Scope (in):**
- `curriculum_sequences` table: `organizationId` (nullable = global), `sportId`, `developmentStageId`, `programType` enum (`league`, `class`, `camp`, `clinic`), `name`, `description`; child `curriculum_sequence_entries`: `sequenceId`, `position` (1..N), `templateId` (FK `practice_templates`), `objectives[]`, `notes`. Unique (`sequenceId`, `position`).
- Admin authoring UI under the existing `/admin/curriculum` section: create a sequence, order template entries (list with move up/down — no drag-drop dependency).
- Season attachment: nullable `curriculumSequenceId` on `seasons` (or a join table if a season spans stages — decide in phase design; start with the column, YAGNI). When a team exists in a season with a sequence, generate **draft** `session_plans` for the team: entry N → Nth practice date. Practice dates: v1 derives them from a simple recurrence input at attach time (weekday + start date + count) rather than a full scheduling engine; generated plans are `status: 'draft'`, `templateId` set, segments copied from the template.
- Coach experience: `/coach/practices` shows the assigned draft for the next date ("Week 3 of 8 — Dribbling under pressure"); coach edits/adapts freely (plans are already per-team rows — natural copy-on-write). A sequence-progress strip on the practices overview.
- Seed: build one reference sequence per live sport/stage combo from existing content (`src/lib/curriculum/content/soccer/session-plans.ts` order is the obvious source) so the feature isn't empty on ship.

**Scope (out):** auto-sync with venue/game scheduling (`games` table) — recurrence input only; per-player differentiation within a plan; camp daily-theme scheduling (camps get a sequence like anything else; finer-grained day structure waits for the 2027 delivery-unit work); regeneration when rosters change (plans are team-level).

**Files (expected):** create `src/lib/db/schema/curriculum-sequences.ts` + migration; `src/pages/api/admin/curriculum/sequences/*.ts`, `src/pages/admin/curriculum/sequences.astro`, `src/components/admin/sequence-editor.tsx`; modify `src/lib/db/schema/programs.ts` (seasons column); generation logic in `src/lib/curriculum/sequence-instantiation.ts` (pure function + endpoint trigger — unit-testable in `tests/unit/`); modify `src/components/coach/practices-overview.tsx`; extend `seed-curriculum.ts`.

**Dependencies:** none hard; ships independently of Phases 1–2.

**Acceptance:** admin builds a sequence, attaches it to a season, and a team in that season sees N dated draft plans; coach can open, edit, and complete them exactly like hand-made plans; sequence deletion/detachment leaves already-generated drafts intact (they're the coach's); unit tests on date generation (DST boundary, count > weeks available), API tests on tenant scoping.

---

## Phase 4 — Assessment cadence & quality visibility

**Why:** the loop works mechanically but nothing ensures it runs. An unassessed roster produces an empty parent radar and nobody notices. This phase makes non-use visible; it deliberately avoids punitive automation.

**Scope (in):**
- Staleness computation: `src/lib/curriculum/assessment-cadence.ts` — for each roster player × domain, days since last `player_assessments` row vs the domain's `assessmentFrequency` (already on `skill_domains`); returns fresh/due/overdue/never. Pure function over queried rows, unit-tested.
- Admin report: `/admin/curriculum/assessment-coverage` (or a card on the existing admin curriculum tracking view — decide in phase design): per team → % players assessed this period, per-coach rollup, "never assessed" flags. Endpoint `api/admin/curriculum/assessment-coverage.ts`, tenant-scoped.
- Coach nudges: reuse the existing `coach_prompts` JIT system — a dynamic prompt on the coach dashboard and post-practice context when players are due/overdue ("4 players on Tigers haven't been assessed in 5 weeks"), deep-linking to `assess/[playerId]`. Extends the existing `nav-badges` endpoint with a due-count.
- Distribution sanity (stretch, keep if cheap): per-coach level-distribution summary on the admin report (mean/spread by coach) to make "everyone's a 5" visible. No automated flagging verdicts — data display only.

**Scope (out):** blocking or auto-escalating enforcement; coach performance scoring; parent-facing "assessment overdue" messaging (never show parents staleness); changes to snapshot computation.

**Files (expected):** create `src/lib/curriculum/assessment-cadence.ts` + `tests/unit/assessment-cadence.test.ts`; `src/pages/api/admin/curriculum/assessment-coverage.ts`; admin page/component; modify `src/pages/api/coach/nav-badges.ts` and the dashboard prompt wiring; possibly seed a prompt row.

**Dependencies:** none hard. Pairs with Phase 2's calibration guide (guide tells coaches *how*, this shows *whether*).

**Acceptance:** admin can answer "which rosters have stale or missing assessments" in one screen; a coach with overdue players sees the nudge with a working deep link; cadence function unit tests cover never-assessed, exactly-at-threshold, and multi-domain frequency differences; no parent-visible changes.

---

## Sequencing & rollout

| Phase | Ships | Depends on | Risk it retires |
|---|---|---|---|
| 1. Compliance + hire handoff | schema, admin grid, invite flow | — | legal/child-safety exposure; ATS dead-end |
| 2. Onboarding manual + checklist | docs, catalog, small schema | Phase 1 (auto-checks) | tribal-knowledge onboarding; stub manual |
| 3. Sequencing | schema, admin authoring, plan generation | — | philosophy adherence left to coach initiative |
| 4. Assessment cadence | report + nudges | — (pairs with 2) | silent non-use of the assessment loop |

Phases 3 and 4 are independent of 1–2 and of each other — they can run in parallel worktrees if capacity allows. Phase 2's manual/catalog authoring is docs-only and can start immediately.

Each phase: write its dated implementation plan (`superpowers:writing-plans`) → execute subagent-driven in a worktree → `/ship` checklist (full pre-push checklist for Phases 1 and 3 — both carry schema changes) → PR → post-merge, watch `test-full` since coach-surface E2E specs only run there.
