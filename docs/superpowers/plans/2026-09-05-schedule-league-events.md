# Family Schedule League Events + Suppression-Key Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** League games appear on the family schedule (dashboard schedule page + child-profile schedule tab), and class-projection suppression keys on template *id* instead of template *name*.

**Architecture:** Extend the pure helper module (`src/lib/dashboard/schedule-events.ts`) with a league-game mapper and an id-based suppression key; extend `GET /api/dashboard/schedule` with the child→registration→roster→game join (mirroring the proven adult path in `src/lib/dashboard/play-teams.ts` + `src/pages/api/dashboard/play/games.ts`); surface game status in the UI. **Games only — no practice events.** Practices have no dated parent-visible data anywhere (`session_plans` is coach curriculum; `attendance.eventType` is retrospective; `resource_blocks.sourceType="practice"` is reserved/unwritten). Do not fabricate them.

**Tech Stack:** Astro 5 SSR API routes, React 19 islands, Drizzle, Vitest, Playwright.

## Global Constraints

- No schema changes/migrations. Everything needed exists (`games.scheduledAt/durationMinutes/venueId/fieldNumber/status`, `rosters`, `registrations.familyMemberId`).
- All `FamilyScheduleEvent` changes are ADDITIVE (new optional `status` field; existing fields untouched) — the child-profile schedule tab consumes the same endpoint.
- Tenant scoping: the league leg must scope games to `locals.organization` via `games → seasons → programs → locations.organizationId` (join shape: `src/pages/api/admin/games.ts:64-70`) — do NOT copy `play/games.ts`'s omission of the org filter.
- Sibling attribution: two siblings can sit on one team — carry `familyMemberId` through the `registrations → rosters` hops; a game row fans out to one event per rostered child.
- Batched queries only (`inArray`), no per-child loops; opponent team names + venues resolved in two batched lookups like `play/games.ts`.
- Pure helpers stay pure: no DB, no `Date.now()` — `from`/`now` always a parameter.
- E2E: `waitForHydration` before interactions; element clicks; testids for new UI states.
- Dev server env recipe: `./scripts/with-bws.sh env R2_MOCK=1 CRON_SECRET=<x> E2E_TEST_ENDPOINTS=yes npm run dev -- --port 4331`; test processes need `./scripts/with-bws.sh env ...` for DATABASE_URL; **bws flattens args via `sh -c` — no inline `bash -c`/`node -e` scripts**.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility | Fate |
|---|---|---|
| `src/lib/dashboard/schedule-events.ts` | suppression key → template id; new `buildLeagueGameEvents`; optional `status` on `FamilyScheduleEvent` | modify (Tasks 1, 2) |
| `tests/unit/dashboard/schedule-events.test.ts` | id-key + league-mapper cases | modify (Tasks 1, 2) |
| `src/pages/api/dashboard/schedule.ts` | league leg queries + merge | modify (Task 3) |
| `tests/api/dashboard-schedule.test.ts` | game fixture + assertions | modify (Task 3) |
| `src/components/dashboard/full-schedule.tsx` | map `status`; postponed/cancelled chip | modify (Task 4) |
| `src/components/dashboard/child-profile.tsx` | verify game rows render sanely in Schedule tab (type label not hardcoded "class") | verify/modify (Task 4) |
| `tests/e2e/classes-dashboard.spec.ts` | league-game-on-schedule scenario | modify (Task 4) |

---

### Task 1: Suppression key on template id

`buildClassScheduleEvents` suppresses projected occurrences within 24h of a booked session keyed on `childId::templateName` — a template rename between materialization and now desyncs booked vs projected for ~8 days (duplicate rows). Sessions carry the template id; key on it.

**Files:**
- Modify: `src/lib/dashboard/schedule-events.ts`, `src/pages/api/dashboard/schedule.ts` (selects gain the id columns), `tests/unit/dashboard/schedule-events.test.ts`

**Interfaces:**
- `bookedSessions` items gain `templateId: string | null` (from `dropInSessions.classSlotTemplateId` — verify the exact column name in `src/lib/db/schema/drop-in.ts`; it exists per the class-session materializer).
- `enrollments` items gain `templateId: string` (from `classSlotTemplates.id`, already joined).
- Suppression key becomes `` `${childId}::${templateId ?? templateName}` `` on BOTH sides (a null session template id falls back to name so legacy rows still suppress).

- [ ] **Step 1: Failing unit test** — in `schedule-events.test.ts`, add: booked session with `templateId: "t1"` but a DIFFERENT display name than the enrollment (renamed template), enrollment `templateId: "t1"` — projected occurrence within 24h must be suppressed (fails today because names differ). Second case: both `templateId: null`/missing → falls back to name matching (existing behavior preserved).
- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/unit/dashboard/schedule-events.test.ts`).
- [ ] **Step 3: Implement** — add the fields to the input interfaces, switch the key builder, update existing fixtures minimally (add `templateId` where the test intent needs it; leave name-fallback cases without it).
- [ ] **Step 4: Run → PASS**; `npx tsc --noEmit` (endpoint now must supply the new fields — update its two selects in the same commit).
- [ ] **Step 5: Commit** — `fix(dashboard): schedule suppression keys on template id, name as fallback`

### Task 2: Pure league-game mapper + status field

**Files:**
- Modify: `src/lib/dashboard/schedule-events.ts`, `tests/unit/dashboard/schedule-events.test.ts`

**Interfaces (produced — Task 3 consumes verbatim):**
```ts
// FamilyScheduleEvent gains:
status?: "scheduled" | "in_progress" | "completed" | "postponed" | "cancelled";

export function buildLeagueGameEvents(input: {
  games: Array<{
    gameId: string;
    scheduledAt: Date;
    durationMinutes: number | null;
    status: "scheduled" | "in_progress" | "completed" | "postponed" | "cancelled";
    fieldNumber: string | null;
    childId: string;
    childName: string;
    teamName: string;          // the child's team
    opponentName: string | null; // null = TBD fixture
    venueName: string | null;
    venueAddress: string | null;
  }>;
}): FamilyScheduleEvent[];
```
- Mapping rules the unit tests pin: `type: "game"`; `id: \`game-<gameId>-<childId>\`` (one event per rostered child); `title: opponentName ? \`<teamName> vs <opponentName>\` : \`<teamName> — opponent TBD\``; `endsAt` from `durationMinutes` (null → null); `location` = venueName + (fieldNumber ? \` · Field <fieldNumber>\` : "") ; `projected: false`; `bookingId: null`; `status` passed through; output sorted by `startsAt`.

- [ ] **Step 1: Failing unit tests** — cases: full mapping incl. field number suffix; TBD opponent title; null duration → null endsAt; two children same game → two events with distinct ids; sort.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Keep it a separate exported function — do not thread games through `buildClassScheduleEvents`.
- [ ] **Step 4: Run → PASS. Commit** — `feat(dashboard): pure league-game → schedule-event mapper with status`

### Task 3: League leg in `GET /api/dashboard/schedule`

**Files:**
- Modify: `src/pages/api/dashboard/schedule.ts`, `tests/api/dashboard-schedule.test.ts`

Join path (survey-verified): children (already fetched, `parentUserId = user.id`) → `registrations.familyMemberId IN childIds` → `rosters.registrationId IN regIds` (carry the registrationId→childId map; NO roster-status filter, matching `play-teams.ts:24`) → `games` where `(homeTeamId IN teamIds OR awayTeamId IN teamIds) AND scheduledAt > now` — ALL statuses included, cancelled and postponed too: the honest calendar shows a cancelled game with its status chip (Task 4) rather than silently dropping it. Org-scope the games query via `seasons → programs → locations.organizationId = locals.organization.id` (join shape from `src/pages/api/admin/games.ts:64-70`). Then two batched lookups: opponent/own team names from `teams`, venue name+address from `venues` (nullable venueId). A game where BOTH teams contain the caller's children (rare intra-family matchup) emits per child with their own team as `teamName`.

- [ ] **Step 1: Failing API test** — extend `tests/api/dashboard-schedule.test.ts`: mint (direct DB insert, mirroring the file's existing fixture style) a team + opponent team on the seeded season, a confirmed `registrations` row for the test child, a `rosters` row linking them, and one future `games` row (+ one `status: "postponed"` future game). Assert: both games appear as `type: "game"` events attributed to the child; titles carry team + opponent; the postponed one has `status: "postponed"`; class events still present; a second user sees none of them. Clean up all inserted rows in `afterAll` (delete order: games → rosters → registrations → teams).
- [ ] **Step 2: Run → FAIL** (`TEST_BASE_URL=http://localhost:4331 CRON_SECRET=<x> npx vitest run tests/api/dashboard-schedule.test.ts --config vitest.config.ts --project api`).
- [ ] **Step 3: Implement** — queries + `buildLeagueGameEvents` + merge with class events, single sort by `startsAt` before responding.
- [ ] **Step 4: Run → PASS**; `npx tsc --noEmit`. **Commit** — `feat(dashboard): family schedule includes league games for rostered children`

### Task 4: UI status chip + consumer verification + e2e

**Files:**
- Modify: `src/components/dashboard/full-schedule.tsx`, `tests/e2e/classes-dashboard.spec.ts`
- Verify/modify: `src/components/dashboard/child-profile.tsx`

- [ ] **Step 1: Failing e2e** — extend the schedule suite in `classes-dashboard.spec.ts`: fixture adds a roster+future game for the throwaway family (recipe from Task 3's API test); assert the schedule list shows a row with the "Game" badge and the team-vs-opponent title, and a postponed game shows `data-testid="status-chip"` with "Postponed".
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — map `status` through the component's event mapping; render a muted chip for `postponed`/`cancelled` (reuse the existing "planned" chip styling; `completed`/`in_progress`/`scheduled` render nothing). Check `child-profile.tsx`'s Schedule tab: it consumes the same endpoint filtered by child — confirm game rows render with a correct type label (not hardcoded "Class"); fix the label if hardcoded.
- [ ] **Step 4: Run → PASS** + regression `./scripts/with-bws.sh env PLAYWRIGHT_BASE_URL=http://localhost:4331 npx playwright test tests/e2e/classes-dashboard.spec.ts tests/e2e/parent-dashboard.spec.ts --workers=1`; `npx tsc --noEmit`. **Commit** — `feat(dashboard): schedule surfaces game status; child profile renders game rows`

### Task 5: Ship gate

- [ ] `npx vitest run tests/unit/dashboard/`; API: dashboard-schedule + classes suites; e2e: classes-dashboard + parent-dashboard + dashboard-persona; `./scripts/with-bws.sh npm run build`; `npx tsc --noEmit`.
- [ ] Final whole-branch review; fix wave if needed.
- [ ] Push, PR against main.

## Deliberately out of scope

- Practice events (no data exists — do not fake).
- A fixture/round-robin generator for youth games (separate product decision; deferred since the day-planner plan).
- Rendering games on the family-page Upcoming Events card (separate surface, reads `/api/registrations`).
- Any restyle (Broadsheet wave owns it).
