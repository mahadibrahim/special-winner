# League Ops Phase 2: Roster Auto-Placement + Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can scaffold teams onto the existing 2026-27 seasons, auto-draft balanced rosters from confirmed registrations, review/adjust, and publish in one batch — plus org-wide visibility of coachless teams and unplaced players. (Spec: `docs/superpowers/specs/2026-09-05-coach-activity-pipeline-scoping.md` §3 Phase 2, §6 decisions 5/7.)

**Architecture:** ZERO schema changes. The draft never touches the DB — it follows the division-day-planner precedent exactly (compute + hold client-side, publish as one validated transactional batch). Placement = a pure balancing helper shared by server and client; publish = a batch endpoint that closes today's season-wide-duplicate gap in-transaction and fires ONE Telegram group sync per affected team. "Developmental" cannot be a data gate (all 20 youth seasons carry `skillLevel: NULL`) — the planner is per-season admin opt-in, which satisfies decision 5's "competitive stays hand-picked" operationally; a data backfill remains an owner task.

**Tech Stack:** Astro 5 SSR, React 19 islands, Drizzle, Vitest, Playwright.

## Global Constraints

- **No schema changes, no migrations.** If a task appears to need one, stop — the design is wrong.
- **Never persist draft placements as roster rows.** `rosters.status='inactive'` leaks (parent dashboard `play-teams.ts:24-28` ignores status; `get-coach-teams.ts:21` playerCount; `venue-rosters.ts:37`) and roster POST fires Telegram sync. Draft lives client-side only.
- Publish is **all-or-nothing transactional**: any invalid assignment (cross-season reg, over-cap team, already-rostered-in-season, non-confirmed reg) rejects the whole batch with a per-assignment error list. The season-wide duplicate check MUST be inside the transaction (no DB constraint exists — `rosters` unique is (teamId, registrationId) only).
- Telegram: **one** `triggerTeamGroupSync(teamId)` per affected team after commit, not per row (mirror `rosters.ts:198`'s fire-and-forget style).
- Youth league seasons = `programs.audienceType='parents' AND programs.programType='league'`, org-scoped via `programs → locations.organizationId`. Do NOT gate on `skillLevel` (NULL in the wild); do NOT hard-block competitive — the surface is opt-in.
- Balancing helper is PURE and deterministic (no Date.now/randomness; mirror `balance-days.ts`'s style: sorted inputs, greedy least-loaded, first-minimum tie-break, `tests/unit/` coverage).
- Admin endpoints: `requireSuperAdminAccess` + org context + four-table tenant join (`teams → seasons → programs → locations`), matching `rosters.ts` precedent. `.limit(1)` needs orderBy or a uniqueness comment.
- E2E: `waitForHydration`, element clicks, testids, `useHydrationBeacon` on new client:load islands; FK-safe fixture cleanup; no shared-mutable fixtures across describes (the #626 lesson).
- **Write the (single) new migration idempotently — N/A here (none), but if any task drifts into one, the answer is redesign, not migrate.**
- Dev env: server via `./scripts/with-bws.sh env R2_MOCK=1 CRON_SECRET=<x> E2E_TEST_ENDPOINTS=yes npm run dev -- --port 4331`; bws mangles inline scripts — file-based only; FOREGROUND test runs; never kill/start servers from subagents; the bws-wrapped server can die silently (exit 1, no signal) — if the probe fails, report BLOCKED, don't self-serve.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility | Fate |
|---|---|---|
| `src/lib/leagues/draft-placements.ts` | pure balancer: unplaced regs + teams → proposed assignments + leftovers | create (P1) |
| `tests/unit/leagues/draft-placements.test.ts` | balancing rules pinned | create (P1) |
| `src/pages/api/admin/seasons/[id]/teams/scaffold.ts` | bulk-create teams on an EXISTING season | create (P2) |
| `src/pages/api/admin/seasons/[id]/placement.ts` | GET planner data (teams+counts+caps+coach, unplaced confirmed regs w/ age/gender) | create (P3) |
| `src/pages/api/admin/seasons/[id]/placements.ts` | POST batch publish (transactional, validated) | create (P3) |
| `tests/api/leagues/placement.test.ts` | scaffold + planner-data + publish coverage | create (P2/P3) |
| `src/components/admin/placement/placement-planner.tsx` | island: load → auto-draft (client-side via P1 helper) → adjust → publish | create (P4) |
| `src/pages/admin/seasons/[id]/placement.astro` | route page (day-planner precedent) | create (P4) |
| `src/pages/admin/seasons/[id].astro` | hub teams panel: readiness chips + "Place players →" deep link | modify (P4/P5) |
| `src/lib/admin/attention-feed.ts` + its API/UI consumers | new kinds: `teams_coachless`, `players_unplaced` | modify (P5) |
| `tests/e2e/league-placement.spec.ts` | scaffold → auto-draft → adjust → publish → roster visible | create (P4) |

---

### P1: Pure placement balancer

**Files:** Create `src/lib/leagues/draft-placements.ts`, `tests/unit/leagues/draft-placements.test.ts`.

**Interface (produced — P3/P4 consume verbatim):**
```ts
export interface PlacementRegistration {
  registrationId: string; familyMemberId: string;
  birthDate: string | null;   // ISO date or null (adult self rows)
  gender: string | null;
}
export interface PlacementTeam {
  teamId: string; name: string;
  currentCount: number;                 // published roster rows
  maxRosterSize: number | null;         // null = uncapped
}
export interface DraftPlacementResult {
  assignments: Array<{ registrationId: string; teamId: string }>;
  unplaced: string[];                   // registrationIds that fit nowhere (all teams at cap)
}
export function draftPlacements(regs: PlacementRegistration[], teams: PlacementTeam[]): DraftPlacementResult;
```
Rules the unit tests pin: deterministic (inputs sorted by id before processing); greedy least-loaded team (currentCount + already-drafted), first-minimum tie-break by teamId `localeCompare`; a team at `maxRosterSize` receives nothing; when EVERY team is capped out, remaining regs land in `unplaced` (never silently dropped); secondary gender spread — among least-loaded ties, prefer the team with fewer of the registration's gender (null gender ignores the rule); empty teams array → all unplaced; regs with null birthDate place normally (age is season-homogeneous — the season IS the division).

- [ ] Failing unit tests (cases above: balance across 3 teams; cap respected; all-capped → unplaced; determinism (same input twice → identical output); gender spread tie-break; empty-teams edge) → `npx vitest run tests/unit/leagues/draft-placements.test.ts` → FAIL → implement (mirror `src/lib/scheduling/balance-days.ts` style) → PASS → `npx tsc --noEmit` → commit `feat(leagues): pure roster placement balancer`.

### P2: Team scaffold for existing seasons

**Files:** Create `src/pages/api/admin/seasons/[id]/teams/scaffold.ts`; extend `tests/api/leagues/placement.test.ts` (new file, scaffold suite).

`POST` body `{ count: number (1-26), maxRosterSize: number | null, namePrefix?: string }`. Guards: `requireSuperAdminAccess` + season belongs to org (seasons→programs→locations join — copy the shape from `src/pages/api/admin/games.ts:64-70`). Reuse `bulkCreateTeams` (`src/lib/seasons/scaffold.ts:37-58`) BUT it doesn't set maxRosterSize — extend it with an optional `maxRosterSize` param (defaulted null, so the existing season-create caller is unchanged) rather than duplicating. Names: reuse its `"{program} {ageGroup} Team {i}"` convention; `namePrefix` overrides the program/ageGroup part. Idempotency note: scaffolding twice ADDS more teams (matches existing scaffold semantics) — return the created team ids and current total so the UI can warn.

- [ ] Failing API tests: 401 anon / 403 non-admin; cross-org season 404; creates N teams with the cap set; second call adds more (documented semantics); response carries `createdTeamIds` + `totalTeams`. Command: `./scripts/with-bws.sh env TEST_BASE_URL=http://localhost:4331 CRON_SECRET=classes-dash-cron npx vitest run tests/api/leagues/ --config vitest.config.ts --project api` → FAIL → implement → PASS + tsc → commit `feat(admin): scaffold teams onto existing seasons`.

### P3: Planner data + batch publish endpoints

**Files:** Create `src/pages/api/admin/seasons/[id]/placement.ts` (GET), `src/pages/api/admin/seasons/[id]/placements.ts` (POST); extend `tests/api/leagues/placement.test.ts`.

- **GET placement**: org-guarded; returns `{ season: {id, name, ageGroupName, divisionGender, skillLevel, audienceType}, teams: PlacementTeam[] (+ coachUserId, coachName|null), unplaced: PlacementRegistration[] (+ childName, age — compute age from birthDate like the admin roster does) }`. Unplaced = confirmed regs of the season minus any rostered-in-season (the `rosters.ts:83-96` subtraction, but in SQL via `NOT IN` subquery — batched, no JS filtering).
- **POST placements**: body `{ assignments: [{registrationId, teamId}] }` (max 500). In ONE transaction: load season's teams + their counts + all season-rostered registrationIds; validate every assignment (team belongs to season; reg belongs to season AND status confirmed; reg not already rostered in season NOR duplicated within the batch; per-team final count ≤ maxRosterSize where set). ANY failure → 422 with `{ errors: [{registrationId, reason}] }`, nothing written. Success → insert all roster rows (`status: 'active'`, matching roster-manager), commit, then one `triggerTeamGroupSync` per distinct teamId (fire-and-forget, after commit). Returns per-team new counts.

- [ ] Failing API tests: happy path publishes 4 regs across 2 teams (+ Telegram sync spy? — the sync is fire-and-forget HTTP-side; assert via rosters rows only); over-cap batch → 422 all-or-nothing (no partial rows); already-rostered reg → 422; cross-season reg → 422; duplicate within batch → 422; cross-org season 404; waitlisted reg → 422. → implement → PASS + tsc → commit `feat(admin): placement planner data + transactional batch publish`.

### P4: Placement planner UI + route + e2e

**Files:** Create `src/components/admin/placement/placement-planner.tsx`, `src/pages/admin/seasons/[id]/placement.astro`; modify `src/pages/admin/seasons/[id].astro` (teams panel deep link "Place players →"); create `tests/e2e/league-placement.spec.ts`.

Island (day-planner pattern, `day-planner.tsx` is the reference): loads GET placement; "Auto-draft" button runs `draftPlacements` CLIENT-SIDE (import the pure helper) over unplaced+teams and holds assignments in local state (nothing persists); per-registration team `<select>` for manual adjustment; per-team column view with live counts vs caps and coach name (or "No coach" chip); unplaceable rows flagged; "Publish placements" → POST batch → success toast + reload; 422 → `ErrorBanner` listing per-reg reasons, draft preserved. Warn banner when the season looks competitive (`skillLevel` starts with "competitive") — soft, per decision 5. Testids: `placement-planner`, `auto-draft`, `placement-row`, `publish-placements`, `team-column`. `useHydrationBeacon()`.

- [ ] Failing e2e (`league-placement.spec.ts`, own throwaway fixtures: youth league program+season+age group via direct inserts — recipe from `tests/utils/admin-org-game-context.ts` and the catalog seed's shapes; 2 scaffolded teams via the P2 endpoint; 4 confirmed registrations with children): admin opens `/admin/seasons/<id>/placement`, auto-drafts, sees 4 rows assigned 2+2, moves one via select, publishes, success; reopen → 4 now-placed players gone from unplaced, team counts 3+1; roster-manager for a team shows the players. FK-safe cleanup (rosters → teams → registrations → familyMembers → season...). → implement → PASS + regression (`tests/e2e/parent-dashboard.spec.ts` untouched-surface sanity) + tsc → commit `feat(admin): roster placement planner (draft client-side, publish batch)`.

### P5: Readiness visibility

**Files:** Modify `src/pages/admin/seasons/[id].astro` (teams panel chips), `src/lib/admin/attention-feed.ts` + `src/pages/api/admin/attention/index.ts` + its badge/UI consumers (`src/lib/admin/nav-badges.ts`, wherever AttentionKind renders); extend `tests/api/leagues/placement.test.ts` (attention cases) or the attention feed's existing test file if one exists (grep first).

- Season hub teams panel: chips "N unplaced" (confirmed minus rostered) and "M teams without a coach" (`teams.coachUserId IS NULL` — the legacy column IS the team-coach source today) + the P4 deep link.
- Attention feed: new kinds `teams_coachless` and `players_unplaced`, computed org-wide for youth league seasons with status in (forming, open, active) — one feed row per season, linking to the season hub/placement page. Mirror the existing `season_capacity` implementation shape exactly (`attention-feed.ts:20-23` + its query section). Cap the scan (the org has ~88 seasons; one grouped query per kind, no per-season loops).

- [ ] Failing API test: seed a season with a coachless team + 2 unplaced confirmed regs → attention feed contains both kinds with correct counts; a fully-staffed, fully-placed season contributes nothing. → implement → PASS + tsc + affected e2e (`dashboard-persona`? no — admin nav badge smoke via existing admin specs if any exist; grep) → commit `feat(admin): season readiness — coachless + unplaced attention`.

### P6: Ship gate + final review + PR

- [ ] Suites: `tests/unit/leagues/` + `tests/api/leagues/` + `tests/e2e/league-placement.spec.ts` + regression `tests/e2e/coach-classes.spec.ts` (staffing surfaces share the hub) + `parent-dashboard`; `./scripts/with-bws.sh npm run build`; `npx tsc --noEmit`.
- [ ] Final whole-branch review (most capable model), one fix wave, scoped re-review.
- [ ] Browser smoke: placement planner end-to-end on a fixture season.
- [ ] Push, PR referencing spec #623 Phase 2; note the owner data task (backfill `skillLevel` on youth seasons when the developmental/competitive split becomes real).

## Deliberately out of scope

- Persisted drafts / a placement-drafts table (client-side per the day-planner precedent; revisit only if admins demand resumable drafts).
- Team-coach staffing migration onto `coaching_assignments` kind='team' (teams keep the legacy columns; Phase 5 territory).
- Friend/buddy requests, skill-based placement (no data exists), waitlist auto-promotion, game scheduling.
- Backfilling `skillLevel` on the 2026-27 catalog (owner/data task — flagged in the PR).
- The racy count-then-insert in the single-row roster POST (pre-existing; our batch endpoint does its own transactional check).
