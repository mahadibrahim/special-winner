# Camps (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give camps the structure the coach→activity pipeline needs — dated camp day-sessions on the venue board with working check-in, camp groups (pods) formed per the owner's per-camp strategy (age-banded / skill-based / manual), coach staffing + glows + assessments for camp children, and daily camp curriculum arcs — per spec `docs/superpowers/specs/2026-09-05-coach-activity-pipeline-scoping.md` §3 Phase 4 and owner decisions §6.1/6.6.

**Architecture (three keystone decisions — read before any task):**

1. **Camp day-sessions are `drop_in_sessions` rows** with a new `kind='camp'` and a new nullable `campSeasonId` FK to `seasons`. The venue command center's camp branch is ALREADY fully wired (colors/icon/walk-in picker/`"camp"→"drop_in_session"` roster mapping in `ActivityDetailPanel.tsx:92`) and only starved of data — this decision lights it all up. Check-in reuses the `drop_in_booking` path verbatim.
2. **Camp pods are ordinary `teams` rows under the camp season; campers attach via `rosters`.** Camp kids — unlike class kids — have real `registrations` rows, so the spec §2 objection to "shadow teams" (class children lack registrations) does not apply. This reuses: the Phase 2 placement machinery (`draftPlacements`, `bulkCreateTeams`, season FOR-UPDATE lock), curriculum distribution (`attach.ts` targets `teams`), `session_plans.teamId NOT NULL` (no dual-anchor needed), coach reach branch 1 (`isPlayerOnCoachTeam` via rosters), and `groupNoun()` which already renders `"camp" → "camp group"`. **No new `coaching_assignment_kind` is added** — `camp_group` is unnecessary under this design; record that as a deliberate deviation from the spec's §2 sketch (the spec's §3 Phase 4 wording "camp groups (pods)" does not mandate a table).
3. **Day-session staffing reuses `kind='class_session'` assignments** — they target `drop_in_sessions` rows generically (`assertTargetBelongsToOrg` checks `dropInSessions.organizationId`; `canCoachReachFamilyMember` branch 3 joins confirmed bookings to `class_session` assignments). Camp day-session staffing, coach reach for booked campers, and the session-staffing admin endpoints all work with zero auth changes. Default propagation (owner decision §6.1): materialization staffs each new day-session with the union of the season's pod coaches; per-day overrides use the existing `PUT /api/admin/classes/sessions/[id]/coaches`.

**Tech stack:** Astro 5 + React 19 islands, Drizzle/Postgres, Vitest + Playwright.

## Global Constraints

- **Migrations idempotent FROM THE START** (0146 staging-journal incident): every statement `IF NOT EXISTS` / `DO $$ … EXCEPTION WHEN duplicate_object THEN null; END $$`. Enum `ADD VALUE` lives in its own migration with NO use of the new value in that same file (55P04).
- **Never change an index without renaming it** — `db-migrate-bootstrap.ts` verifies index migrations by name only.
- **Season-lock discipline (Phase 2 invariant):** every writer that adds `rosters` rows MUST `SELECT … FOR UPDATE` the season row inside the same transaction before insert.
- **Tenant scoping:** all admin endpoints validate org ownership via `requireSameOrg*` helpers; every polymorphic-target read joins back to the target table's `organizationId` (defense-in-depth — `coaching_assignments.targetId` has no FK).
- **Session+staffing atomicity (classes invariant, copied):** a materialized day-session and its propagated staffing insert commit or roll back TOGETHER in one transaction — a session that survives a failed coach-copy stays unstaffed forever.
- **`findFirst`/`.limit(1)` always carry `orderBy`** (shared CI DB has many matching rows).
- **Test fixtures anchor to `new Date()` / relative dates, never fixed calendar dates** (time-of-day/rollover lottery), except pure unit tests of date math which pass explicit instants.
- **No `Date.now()` randomness in pure libs** — pod formation must be pure + deterministic (sort inputs by id; mirror `draft-placements.ts`).
- **Playwright:** `waitForHydration(page)` before interactions; hydration-beacon on new `client:load` islands; new e2e specs run POST-MERGE only (`test-full`) — they must pass first try.
- **Dev server for this phase: port 4333** (`./scripts/with-bws.sh env R2_MOCK=1 CRON_SECRET=camps-cron E2E_TEST_ENDPOINTS=yes npm run dev -- --port 4333`). File-based scripts only through bws. Subagents: FOREGROUND test runs only; never kill/start servers; absolute worktree paths (`/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/camps-phase4`).
- Vocabulary: user-facing copy says **"camp group"** (via `groupNoun`), never "pod" or "team", and never raw ids/jargon.

---

### Task 1: Schema + migrations 0148/0149

**Files:**
- Modify: `src/lib/db/schema/drop-in.ts` (kind enum + `campSeasonId` + partial unique index + paymentMethod enum)
- Modify: `src/lib/db/schema/programs.ts` (seasons `formationStrategy`)
- Create: `src/lib/db/migrations/0148_camp_enum_values.sql` (via `db:generate`, then hand-guard; rename tag freely)
- Create: `src/lib/db/migrations/0149_camp_sessions_columns.sql` (same)
- Test: `tests/unit/db/camp-schema.test.ts`

**Interfaces (produces):**
- `dropInSessionKindEnum` = `["pickup", "class", "camp"]`
- `dropInPaymentMethodEnum` gains `"registration"` (booking paid via the camp registration, not at session level)
- `dropInSessions.campSeasonId: uuid → seasons.id` (SET NULL), nullable; partial unique index `drop_in_sessions_one_per_camp_day` on `(camp_season_id, starts_at)` WHERE `camp_season_id IS NOT NULL` (the materialization idempotency arbiter, mirroring `drop_in_sessions_one_per_template_start`)
- `seasons.formationStrategy: varchar(16)` nullable — values `'age' | 'skill' | 'manual'`, camps only, null = not chosen yet (admin UI defaults the picker to `'age'`)

**Steps:**

- [ ] **Step 1: Schema edits.** In `drop-in.ts`: add `"camp"` to `dropInSessionKindEnum`; add `"registration"` to `dropInPaymentMethodEnum`; add to `dropInSessions`:
```ts
// Camp day-sessions: set when this session is a materialized day of a camp
// season (kind='camp'). Mirrors classSlotTemplateId for classes.
campSeasonId: uuid("camp_season_id").references(() => seasons.id, { onDelete: "set null" }),
```
plus the partial unique index in the table's index list:
```ts
uniqueIndex("drop_in_sessions_one_per_camp_day")
  .on(table.campSeasonId, table.startsAt)
  .where(sql`camp_season_id IS NOT NULL`),
```
(import `seasons` from `./programs` — check for import cycles; `classes.ts` already imports across schema modules, follow its pattern. If a cycle bites, declare without `.references()` and add the FK by hand in 0149, the `seasons.curriculumSequenceId` precedent.)
In `programs.ts` seasons table: `formationStrategy: varchar("formation_strategy", { length: 16 })` with a comment naming the three values and camps-only usage.
- [ ] **Step 2: Generate + hand-guard migrations.** `npm run db:generate` twice won't split the enum adds — instead generate once, then split by hand: 0148 contains ONLY the two guarded enum adds:
```sql
DO $$ BEGIN ALTER TYPE "drop_in_session_kind" ADD VALUE 'camp'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "drop_in_payment_method" ADD VALUE 'registration'; EXCEPTION WHEN duplicate_object THEN null; END $$;
```
0149 contains the columns/index/FK, all idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`, guarded `ADD CONSTRAINT`). Keep `meta/_journal.json` entries consistent (idx 148, 149). Follow 0146/0147's header-comment convention explaining why idempotent.
- [ ] **Step 3: Unit test** `tests/unit/db/camp-schema.test.ts`: assert `dropInSessionKindEnum.enumValues` contains `"camp"`, `dropInPaymentMethodEnum.enumValues` contains `"registration"`, and the seasons table exports `formationStrategy` (import the schema objects; no DB).
- [ ] **Step 4: Apply + idempotency check.** `./scripts/with-bws.sh npm run db:migrate` twice — second run must be a clean no-op.
- [ ] **Step 5: `npx tsc --noEmit`, run the unit test, commit** `feat(camps): kind='camp' day-sessions + formation strategy (migrations 0148/0149)`.

---

### Task 2: Camp day-session materialization + cron wiring

**Files:**
- Create: `src/lib/camps/materialize.ts`
- Modify: `src/pages/api/cron/materialize-class-sessions.ts` (call camp materializer too; response gains `camps` block)
- Test: `tests/unit/camps/materialize-dates.test.ts`, `tests/api/camps/materialize.test.ts`

**Interfaces:**
- Consumes: `zonedWallClockUtc` + `HORIZON_DAYS` from `src/lib/classes/materialize.ts` (import them; do not duplicate)
- Produces:
```ts
export interface CampMaterializeResult {
  sessionsCreated: number;
  autoBooked: number;
  skippedNoVenue: string[];   // season ids skipped for null venueId (surfaced by Task 8's attention feed)
  failed: number;
}
export function campDayInstants(season: { startDate: string; endDate: string; startTime: string | null; endTime: string | null }, timezone: string, from: Date, to: Date): Array<{ startsAt: Date; endsAt: Date }>;  // Mon–Fri only
export async function materializeCampSessions(now: Date): Promise<CampMaterializeResult>;
```

**Behavior spec:**
- Eligible seasons: `programs.programType='camp'`, `seasons.status IN ('forming','open','active')`, date range intersecting `[now, now + HORIZON_DAYS]`, `seasons.venueId IS NOT NULL` (null-venue camp seasons in range go to `skippedNoVenue`).
- `campDayInstants`: every Monday–Friday calendar day within `[startDate, endDate] ∩ [from, to]`, wall-clock times from `season.startTime`/`endTime` (defaults `09:00`/`15:00` when null) resolved via `zonedWallClockUtc` in the org's timezone.
- Insert per day (one `db.transaction` per session, matching classes Pass 1): `kind: 'camp'`, `campSeasonId`, `venueId: season.venueId`, `sportOrClassLabel: <program name>`, `capacity: season.maxParticipants ?? 200`, `audience: 'youth'`, `status: 'scheduled'`, `createdByUserId: null`. Idempotency: `onConflictDoNothing` against `drop_in_sessions_one_per_camp_day`. **In the SAME transaction**, propagate staffing: select the season's pod coaches (`teams WHERE seasonId = season.id` → non-null `coachUserId`/`assistantCoachUserId`, lead/assistant roles carried over, deduped, lead wins on conflict) and insert `coaching_assignments (kind='class_session', targetId=sessionId, organizationId, active=true)` rows with `onConflictDoNothing` on `(coachUserId, kind, targetId)`. Skipped (conflict = already materialized) days do NOT re-propagate — same "no later run revisits staffing" rule as classes; per-day overrides are the admin session-staffing endpoint's job.
- Pass 2 (auto-book, mirrors classes): for every `scheduled` camp session in the horizon (not just new ones), book every `confirmed` registration of its camp season that isn't already actively booked: `dropInBookings (sessionId, userId: registeredByUserId, familyMemberId, status:'confirmed', source:'auto_enrollment', paymentMethod:'registration', amountPaidCents: 0, brand: 'aspire', waiverSigned: false)`, `onConflictDoNothing` on the participant-per-session unique index. Cancelled registrations never book; capacity is NOT enforced for auto-booking (registration already gated it).
- Cron route runs classes first, then camps; response `{ classes: <existing result>, camps: <CampMaterializeResult> }` — keep the existing shape's fields intact for any monitors reading them.

**Steps:**

- [ ] **Step 1: Failing unit tests** for `campDayInstants` (pure): a Mon–Fri week yields 5 instants at the right UTC times for `America/New_York`; a range starting Saturday yields Mon-onward only; `from/to` clamps; null times default 09:00–15:00; DST-crossing week keeps 9am wall-clock.
- [ ] **Step 2: Implement `campDayInstants`**, run tests green.
- [ ] **Step 3: Implement `materializeCampSessions`** per the behavior spec. Model the query/transaction structure on `src/lib/classes/materialize.ts` (read it fully first).
- [ ] **Step 4: Wire the cron route** — add the camps call + response block to `materialize-class-sessions.ts`; keep `CRON_SECRET` gating untouched.
- [ ] **Step 5: API test** `tests/api/camps/materialize.test.ts` (server on 4333, CRON_SECRET=camps-cron): create a camp program + season anchored to now (starts yesterday, ends +6 days, weekday-spanning, with venue + startTime) via direct DB insert in the test (no admin endpoint yet), plus one confirmed registration for a seeded child; POST the cron; assert ≥1 `kind='camp'` session with `campSeasonId` exists, the child is auto-booked with `paymentMethod='registration'`, and a second POST creates nothing new (idempotent). Clean up created rows in `afterAll`.
- [ ] **Step 6: `npx tsc --noEmit`, commit** `feat(camps): materialize weekday camp day-sessions + auto-book registrants`.

---

### Task 3: Pod formation library (pure)

**Files:**
- Create: `src/lib/camps/form-pods.ts`
- Test: `tests/unit/camps/form-pods.test.ts`

**Interfaces (produces):**
```ts
export interface CampPodCandidate {
  registrationId: string;
  familyMemberId: string;
  birthDate: string | null;      // ISO date
  skillScore: number | null;     // avg playerSkillSummary.currentLevel; null = never assessed
  gender: string | null;
}
export interface CampPodDraft { teamId: string; registrationIds: string[] }
export function draftCampPods(
  candidates: CampPodCandidate[],
  pods: Array<{ teamId: string; maxRosterSize: number | null }>,
  strategy: "age" | "skill",
): { pods: CampPodDraft[]; unplaced: string[] };
```

**Behavior spec:** Pure + deterministic (no Date/randomness; sort inputs before processing — mirror `src/lib/leagues/draft-placements.ts`, read it first). Both strategies are *banded*: sort candidates by the strategy key, then fill pods **contiguously** in sorted order (pod 1 gets the youngest / least-skilled block, etc.), sizing bands as evenly as possible given caps.
- `age`: sort by `birthDate` descending (youngest first); null birthDates sort last.
- `skill`: sort by `skillScore` ascending; null scores sort last (they land in the final band — staff adjusts, per owner decision "staff-adjustable").
- Ties (equal key) break by `registrationId` asc. Pods process in `teamId` asc order. Candidates overflowing all caps → `unplaced` (never silently dropped). Conservation: every input registrationId appears exactly once across `pods[].registrationIds` + `unplaced`.

**Steps:**

- [ ] **Step 1: Failing unit tests**: 12 kids / 3 uncapped pods → 4-4-4 contiguous by DOB; age ordering (youngest in pod 1); skill ordering with nulls last; caps produce unplaced overflow; determinism (shuffled input → identical output); conservation invariant; zero pods → all unplaced.
- [ ] **Step 2: Implement, tests green, commit** `feat(camps): banded pod-formation draft library`.

---

### Task 4: Pods admin — planner page + publish endpoint

**Files:**
- Create: `src/pages/admin/seasons/[id]/pods.astro`
- Create: `src/components/admin/camps/pod-planner.tsx`
- Create: `src/pages/api/admin/seasons/[id]/pods.ts` (GET bootstrap)
- Create: `src/pages/api/admin/seasons/[id]/pod-placements.ts` (POST publish)
- Modify: `src/components/admin/seasons-list.tsx` (link "Camp groups" for `programType==='camp'` seasons — find where the placement link renders for leagues and mirror it)
- Test: `tests/api/camps/pod-placements.test.ts`

**Interfaces:**
- Consumes: `draftCampPods` (Task 3), `bulkCreateTeams(tx, { targetSeasonId, count, programName, ageGroupName, namePrefix, startIndex, maxRosterSize })` from `src/lib/seasons/scaffold.ts`, `requireSameOrg*` helpers, the FOR-UPDATE + all-or-nothing publish pattern from `src/pages/api/admin/seasons/[id]/placements.ts` (read it fully first — it is the template for the POST).
- Produces: GET returns `{ season: { id, name, formationStrategy, programType }, candidates: CampPodCandidate[], pods: Array<{ teamId, name, maxRosterSize, memberRegistrationIds: string[] }> }`; POST body `{ placements: Array<{ registrationId, teamId }>, formationStrategy: 'age'|'skill'|'manual' }`.

**Behavior spec:**
- GET (admin, same-org, season must be `programType='camp'` else 404): candidates = `confirmed` registrations of the season joined to `familyMembers` (birthDate, gender) with `skillScore` = avg of `playerSkillSummary.currentLevel` per familyMember (one grouped query, not N+1). Pods = season's teams + current published roster membership.
- Planner island (`pod-planner.tsx`, mirror `placement-planner.tsx`'s client-side-draft pattern — read it first): inline scaffold form on empty state (count → calls the existing scaffold endpoint `POST /api/admin/seasons/[id]/teams/scaffold` with `namePrefix` `"<program name> Group"`); "Auto-arrange" button runs `draftCampPods` client-side per the season's `formationStrategy` (picker for age/skill/manual, default `'age'`); staff drag/move adjustments stay client-side; Publish POSTs everything. Copy uses "camp group" language throughout, ages shown next to names ("Maya · 7"), never raw ids.
- POST publish (admin, same-org, camp season only): one transaction — `SELECT id FROM seasons WHERE id=$1 FOR UPDATE`, validate every registrationId belongs to this season + confirmed and every teamId belongs to this season, then delete-and-reinsert this season's camp `rosters` rows (full-replace, all-or-nothing; `rosters.registrationId` from the placement rows), and persist `formationStrategy` on the season. Any invalid row → 422, nothing written. Return `{ published: <count> }`.
- Middleware already gates `/admin/**`; the page needs no extra auth boilerplate. Page uses `useHydrationBeacon` (it will be e2e-driven in Task 9).

**Steps:**

- [ ] **Step 1: GET endpoint + failing API test** (camp season w/ 2 confirmed regs returns candidates with skillScore null vs computed; league season 404s; cross-org 404s).
- [ ] **Step 2: POST endpoint + API tests**: publish 4 kids into 2 scaffolded pods → rosters rows exist; republish moving a kid → old row gone, new row present (full replace); a registrationId from another season → 422 and zero writes; `formationStrategy` persisted.
- [ ] **Step 3: Planner island + page + seasons-list link.** Verify in the browser on port 4333 (scaffold → auto-arrange → drag → publish → reload shows published state).
- [ ] **Step 4: `npx tsc --noEmit`, commit** `feat(camps): camp-group planner + season-locked publish`.

---

### Task 5: Venue day view + check-in for camp sessions

**Files:**
- Modify: `src/lib/admin/venue-day-data.ts` (camp branch in `dropInBlocks`; delete the L15-17 "known gap" comment)
- Verify/modify: `src/lib/check-in/day-view.ts` (confirm camp sessions flow through `drop_in_session` events; fix if kind-filtered)
- Test: `tests/api/camps/venue-day-camp.test.ts`

**Behavior spec:**
- `dropInBlocks` mapping becomes three-way: `s.kind === "class" ? "class" : s.kind === "camp" ? "camp" : "drop_in"`. Camp block `title` = `sportOrClassLabel` (the program name), subtitle mirrors the class subtitle shape. Booking counts already flow (bookings query is kind-agnostic) — verify, don't rebuild.
- Everything downstream is already wired (`mapKind` in `build-today.ts:34`, `WalkInSessionPicker` `WALKIN_KINDS`, `ActivityDetailPanel` `"camp" → "drop_in_session"`, check-in `VALID_KINDS` includes `drop_in_booking`) — this task's job is the ONE mapping plus verification tests, not component work.
- `day-view.ts` `getVenueDayEvents`: read it; if its sessions query has no kind filter, camp sessions appear automatically — assert that in the test. If it filters kinds, add `'camp'`.

**Steps:**

- [ ] **Step 1: Failing API test**: with a materialized camp session today (insert directly, `kind='camp'` + booking for a child), `GET /api/admin/venue/today` (resolve the right query params from the endpoint) returns a `kind:"camp"` session with the right capacity counts; `GET /api/admin/check-in/event?kind=drop_in_session&id=<sessionId>` returns the camper roster with `familyMemberId`; `POST /api/admin/check-in/check-in {kind:"drop_in_booking", targetId}` stamps `checkedInAt` (and is idempotent on repeat).
- [ ] **Step 2: Implement the mapping, tests green.**
- [ ] **Step 3: Browser check on 4333**: venue command center for the camp venue/date shows the orange 🏕 camp block; open its detail panel → roster renders; check a camper in.
- [ ] **Step 4: `npx tsc --noEmit`, commit** `feat(camps): camp day-sessions on the venue board + check-in`.

---

### Task 6: Coach portal — camp days, glows, assessments

**Files:**
- Modify: `src/pages/api/coach/class-sessions/[id]/glows.ts` (accept `kind='camp'`; note anchor `activityKind: "camp_session"` for camp sessions)
- Modify: `src/lib/coach/get-coach-groups.ts` + `src/pages/api/coach/classes/index.ts` + `src/components/coach/classes/my-classes.tsx` (surface upcoming camp day-sessions the coach is staffed on)
- Modify: `src/pages/coach/classes/index.astro` only if the data threading requires it
- Test: `tests/api/coach/camp-glows.test.ts`

**Behavior spec:**
- Glows endpoint: `verifyClassSessionAccess` currently rejects `session.kind !== "class"` — accept `"camp"` too. Auth via `kind='class_session'` assignment on the session (template fallback is class-only; for camp sessions ALSO accept a lead/assistant pod coach: `teams WHERE seasonId = session.campSeasonId AND (coachUserId = me OR assistantCoachUserId = me)` — with the org re-check via the season→program→location join or `dropInSessions.organizationId`, matching the defense-in-depth convention). Note insert uses `activityKind: "camp_session"`, `activityId: sessionId` for camp sessions (varchar column, no migration; grep first for any consumer switching on `activityKind === 'class_session'` and widen it — parent surfaces read by `familyMemberId` and should be unaffected, but verify).
- "My groups": `getCoachGroups` gains `campSessions: Array<{ sessionId, label, startsAt, venueName }>` — upcoming (next 7 days) `kind='camp'` sessions where the coach holds an active `class_session` assignment OR pod-coaches a team of the session's `campSeasonId`. `my-classes.tsx` renders them in a "Camp days" section linking to the existing glows flow for that session (reuse the class-session glows UI route — find how class sessions link to glows from `my-classes`/`class-roster` and mirror). Camp children assessments need NO auth change (pod coach → branch 1 via rosters; day-staffed coach → branch 3 via bookings) — do not touch `roles.ts`.
- Empty states via `EmptyState`; copy says "camp day" / "camp group".

**Steps:**

- [ ] **Step 1: Failing API test** `camp-glows.test.ts`: seed camp session + booking + pod team with coach; pod coach GET glows bootstrap → roster contains the camper; POST a glow → `coach_notes` row with `activityKind='camp_session'` + null teamId; a coach with no assignment/pod → 403; org-B coach → 403/404.
- [ ] **Step 2: Implement glows widening + tests green.**
- [ ] **Step 3: `getCoachGroups` camp block + portal UI; browser check on 4333** (coach account sees "Camp days", opens one, records a glow; parent account's child page shows it).
- [ ] **Step 4: `npx tsc --noEmit`, commit** `feat(camps): coach camp days + glows + reach for campers`.

---

### Task 7: Daily curriculum arcs for camps

**Files:**
- Modify: `src/lib/curriculum/sequence-instantiation.ts` (`generatePracticeDates` interval + weekday mode; `buildDraftSessionPlans` arc-unit label)
- Modify: `src/pages/api/admin/curriculum/sequences/[id]/attach.ts` (camp seasons: daily Mon–Fri dates; `weekday` ignored)
- Modify: `src/lib/curriculum/content/sequences.ts` (+1 camp reference sequence)
- Test: extend `tests/unit/curriculum/` (instantiation tests live there — find the existing file for `generatePracticeDates` and extend it), `tests/api/camps/camp-attach.test.ts`

**Behavior spec:**
- `generatePracticeDates` gains an options arg `{ cadence?: "weekly" | "weekdaily" }` (default `"weekly"`, existing behavior byte-identical). `"weekdaily"`: successive Mon–Fri days from `startDate` (skip Sat/Sun), still clamped by `seasonEndDate`.
- `buildDraftSessionPlans` gains `{ arcUnit?: "Week" | "Day" }` (default `"Week"`): title becomes `` `${arcUnit} ${i+1} of ${total} — ${template.name}` `` — mirror of the UI's `arcUnitLabel` (`blueprint-workspace.tsx:246`).
- `attach.ts`: when the season's program is `programType='camp'`, use `cadence:"weekdaily"` + `arcUnit:"Day"`, ignore the body `weekday` (make it optional in the zod schema — required only for non-camp), and distribute to the season's teams exactly as today (pods ARE teams — zero targeting changes). Idempotency key/race handling untouched.
- Reference content: one camp sequence in `REFERENCE_SEQUENCES` — `programType: "camp"`, 5 entries (Day 1–5) reusing existing template names from the file (copy exact names from the league sequences; every `template:` string must match an existing template in the content set or the loader fails).
- Blueprint UI already handles camp labels (`arcUnitLabel`, `toSequenceProgramType`) — no component changes expected; verify in browser.

**Steps:**

- [ ] **Step 1: Failing unit tests**: `weekdaily` from a Wednesday start yields Wed, Thu, Fri, Mon…; season-end clamp; weekly default unchanged (regression assert on an existing case); `arcUnit:"Day"` titles.
- [ ] **Step 2: Implement instantiation changes, tests green.**
- [ ] **Step 3: `attach.ts` camp branch + API test** `camp-attach.test.ts`: camp season with 2 pods + the seeded camp sequence → attach with `count:5` → each pod's coach gets Day-titled `session_plans` on consecutive weekdays; re-attach → idempotent.
- [ ] **Step 4: Add the camp reference sequence; run the loader against staging** (`./scripts/with-bws.sh npx tsx scripts/curriculum-load.ts` — check the script's actual invocation first) or, if the loader is gated, verify via its dry-run/unit path.
- [ ] **Step 5: `npx tsc --noEmit`, commit** `feat(camps): daily camp curriculum arcs + reference camp sequence`.

---

### Task 8: Attention feed + e2e seed fixtures

**Files:**
- Modify: `src/lib/admin/attention-feed.ts` (new kind `camp_groups_unformed`)
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts` (camp fixtures)
- Test: extend the attention-feed API/unit tests (find existing coverage for `players_unplaced` and mirror it)

**Behavior spec:**
- `camp_groups_unformed`: camp seasons (`programs.program_type='camp'`, `audience_type='parents'`, status in `READINESS_SEASON_STATUSES`) having confirmed registrations not yet on any roster — copy the `players_unplaced` raw-SQL shape verbatim (COUNT(*) OVER() before LIMIT, `READINESS_ROW_CAP`, `-more` summary row), `href: /admin/seasons/${id}/pods`, text like `"<season>: N campers not in a camp group"`. Also fold `venueless` camp seasons in range into the same query? NO — keep one concern; `skippedNoVenue` surfacing is a follow-up issue, not this task.
- Seed fixtures (idempotent, anchored to `new Date()`): one camp program ("Test Summer Camp", `programType='camp'`, on the seeded org/location with a venue) + season (starts 2 days ago, ends +5 days, weekdays guaranteed in range, `startTime 09:00`/`endTime 15:00`, venueId set, status `active`, maxParticipants 24) + confirmed registrations for 2 seeded test children + 2 pre-scaffolded pods ("Test Summer Camp Group 1/2") with the kids published onto them + 1 additional confirmed registration left UNPLACED (feeds the attention item and Task 9's planner spec).

**Steps:**

- [ ] **Step 1: Attention query + test** (seeded unplaced camper produces the item with the pods href; a fully-placed camp season produces none).
- [ ] **Step 2: Seed additions; run `npm run db:seed:e2e`** against staging (idempotent — run twice).
- [ ] **Step 3: `npx tsc --noEmit`, commit** `feat(camps): camp-group readiness attention + e2e camp fixtures`.

---

### Task 9: E2E acceptance specs

**Files:**
- Create: `tests/e2e/camps.spec.ts`
- Test command: `./scripts/with-bws.sh env PLAYWRIGHT_BASE_URL=http://localhost:4333 npx playwright test tests/e2e/camps.spec.ts --workers=1`

**Specs (all `waitForHydration` before interaction; element clicks only; sign-in helpers from `tests/utils/test-helpers.ts`):**
1. **Admin forms camp groups:** admin → `/admin/seasons/<camp season>/pods` (resolve the seeded season id via an API call or nav from the seasons list) → sees the unplaced camper → Auto-arrange → Publish → success state; reload shows the camper placed.
2. **Venue board + check-in:** admin → venue command center on the camp venue for today → camp block visible → open detail → check a camper in → "Checked in" state renders.
3. **Coach camp day glow → parent:** materialize via cron endpoint (test calls it with CRON_SECRET), coach signs in → Camp days section → opens today's camp day → records a glow for a seeded child → parent signs in → child's page shows the glow. (Mirror the structure of the class-glows acceptance spec in `tests/e2e/coach-classes.spec.ts` — read it first.)

**Steps:**

- [ ] **Step 1: Write spec 1, run it, green.**
- [ ] **Step 2: Spec 2, green.**
- [ ] **Step 3: Spec 3, green.**
- [ ] **Step 4: Full local camp-surface e2e pass** (`camps.spec.ts` + `coach-classes.spec.ts` + `venue` specs if any touch the board — grep `tests/e2e/` for `venue`/`command` and run what exercises changed surfaces), commit `test(camps): e2e acceptance — pods, venue check-in, camp-day glows`.

---

## Ship gate (after final review)

Unit (`tests/unit/camps/ tests/unit/curriculum/ tests/unit/db/`), API (`tests/api/camps/ tests/api/coach/`), `db:migrate` ×2 clean, e2e (camps + coach-classes + parent-dashboard), `npx tsc --noEmit`, `npm run build` LAST (then restart the dev server — build poisons the live Vite cache). Then push, PR, follow-up issues (at minimum: surfacing `skippedNoVenue`, camp catalog data entry for the owner, half-day capacity semantics).
