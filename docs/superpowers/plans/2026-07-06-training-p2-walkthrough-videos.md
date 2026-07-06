# Phase 2 — Walkthrough Video & Screenshot Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/plans/2026-07-06-training-content-pipeline.md`, "Global Constraints", "Background", and "Phase 2 — Walkthrough video & screenshot pipeline". Phase 1 (deck generator) is merged to `main` (PR #318): `src/lib/ops-catalog/views/training-deck.ts` exists, screenshot slots expect `training/screenshots/<roleSlug>/<slug>.png` where `roleSlug` = `role.<id>` minus the `role.` prefix and `slug` = `act.<id>` minus the `act.` prefix (see `SCREENSHOT_RELATIVE_PREFIX` / `screenshotSlotHtml` in that file, and the `--embed` reader in `scripts/ops-catalog/index.ts`). Phase 3 (narration scripts) is out of scope here.

**Goal:** A separate, non-CI Playwright project that scripts six role-appropriate product tours, records a 1280×720 video + timestamped captions + per-step screenshots for each, and copies any step tagged with a real ops-catalog activity slug into Phase 1's deck screenshot slots — all runnable on demand via `npm run training:videos` against a locally running dev server.

**Architecture:** `training/lib/tour.ts` exports a small `Tour` class (`step()`/`finish()`) that only depends on `page.screenshot`/`page.waitForTimeout` (typed as a narrow `TourPage` subset of Playwright's `Page`), so its caption/screenshot/deck-slot-copy logic is unit-testable with a fake object — no browser needed. A separate `registerVideoCapture()` helper wires the one piece that genuinely needs a real Playwright `test`/`Page`: finalizing the video Playwright already records (`use.video: 'on'`) into `training/output/<workflow>/video.webm`. Six `*.walkthrough.ts` files under `training/walkthroughs/` each drive one real page flow, reusing `signIn`/`waitForHydration`/`TEST_USERS` from `tests/utils/test-helpers.ts` rather than duplicating them. `training/playwright.config.ts` is a wholly separate Playwright config (own `testDir`, own `testMatch`) that neither the root `playwright.config.ts` nor `npm test` ever discovers.

**Tech Stack:** Existing only — Playwright (`@playwright/test`, already a dev dependency), Vitest (unit project) for `tour.ts`'s tests, plain Node `fs`/`path`. No new dependencies, no schema migrations (the `referee` role-name enum value already exists in `src/lib/db/schema/users.ts`; this plan only seeds a `roles` row for it, which is a data write via the existing e2e seed script, not a migration).

## Global Constraints

Copied from the spec; every task's requirements implicitly include these:

- Walkthrough videos and screenshots are **build artifacts, not repo content**: output under `training/output/` (gitignored). Scripts, captions, and narration text ARE repo content.
- Walkthrough specs are **NOT tests**: a separate Playwright project/config so `npm test` and CI never run them; they run only via `npm run training:videos` against a locally running dev server (staging DB, seeded accounts).
- Walkthroughs must follow the repo's Playwright conventions (`waitForHydration`, element clicks over keydown, `domcontentloaded` when R2_MOCK images are present).
- Walkthroughs must be **read-mostly**: where a flow requires writes (submit application, record assessment), use dedicated `training+<role>@test.aspiresports.com` fixture data and clean up or make the write idempotent — never mutate the shared seeded accounts' core fixtures in ways that break the API test suite.
- Test/demo accounts and any fixture additions go through `src/lib/db/seeds/seed-e2e-tests.ts` (idempotent).
- Standard repo rules apply: `tsc --noEmit` zero errors; no tenant-scoping gaps introduced; migrations via `db:generate` (none expected — no schema changes, only new rows through the existing seed script).
- `training/playwright.config.ts`: separate project, `video: { mode: 'on', size: 1280x720 }`, screenshots on, base URL from `TRAINING_BASE_URL` (default `http://localhost:4321`), workers=1, NOT discovered by the main config.
- Acceptance: one command regenerates all six videos + screenshots against a running dev server; re-running `catalog:render --embed` after a video run produces decks with real screenshots; main `npm test` and CI are unaffected.

## Scouting Findings (read before touching code)

1. **The ops catalog does not model coach-lifecycle, hiring, or curriculum-sequencing features at all.** `docs/operations/catalog/activities/*.yaml` has 63 activities, all event-day-operations (check-in, scoring, facility, concessions, safety). Grepping for `role.coach` involvement turns up only event-day activities (`attendance_roster_confirm`, `team_check_in`, `score_reporting_final`, …) — none of them are the coach dashboard's roster/attendance/assessment/practice-planning features, which are a separate part of the product the catalog simply doesn't cover yet. Concretely: `act.attendance_roster_confirm` is a *platform-automated* 72h-before-kickoff SMS/email broadcast (`accountable: role.platform`), **not** the coach's manual attendance-tracker UI — using it as a deckSlug for `/coach/attendance/[teamId]` would be actively misleading. Consequence: `coach-core`, `coach-practices`, `admin-hire-compliance`, and `admin-sequencing` have **no legitimate deckSlug tags at all**. Only `referee-gameday` (`ref_check_in`, `score_reporting_final`) and `venue-manager` (`team_check_in`) get real catalog-activity tags.
2. **The referee role has never actually been seeded.** `role_name` (the Postgres enum backing `roles.name`) has included `"referee"` since it was written, but `src/lib/db/seeds/seed-e2e-tests.ts`'s role-creation block never inserts a `roles` row for it, and no user has ever been assigned it. `src/middleware.ts` gates `/referee/**` on `roles: ["referee", "super_admin"]` — so `/referee` has been unreachable by any seeded account in every environment that runs this seed script. This is a real, pre-existing gap this plan must close (Task 1), not a Phase-2-only fixture.
3. **The referee surface is real and fully drivable** — `/referee` (assignment list, `src/components/referee/referee-matches.tsx`), `/referee/matches/[gameId]` (score + incidents + submit, `src/components/referee/match-report.tsx`), `/referee/pay`. There is **no explicit "check-in" control** in the UI today (contrast with the Phase-1 deck's `PORTAL_PAGES` comment "Today's assigned matches — check in here" — that's aspirational copy, not a real button). `act.ref_check_in`'s SOP describes a physical sign-in at the event lead's station that isn't modeled in-app. The walkthrough uses the assignment list as the closest available illustration for that slug and says so in a comment, per the brief's "substitute honestly" instruction. `act.score_reporting_final` (final score attestation by the referee) is a clean, exact match for the "submit report" step.
4. **`POST /api/referee/matches/[gameId]/report` is fully idempotent** (`src/pages/api/referee/matches/[gameId]/report.ts`): it updates the `games` row in place and does delete-then-reinsert on `game_incidents`. Safe to actually submit on every walkthrough run.
5. **Nine leaf components the walkthroughs touch are missing `useHydrationBeacon()`** (confirmed by `grep -rl useHydrationBeacon src/components/` not matching them): `src/components/coach/practices-overview.tsx` (explicitly flagged in the brief), plus `roster-table.tsx`, `attendance-tracker.tsx`, `player-assessment-detail.tsx`, `session-detail.tsx`, `src/components/admin/applications-list.tsx`, `coach-credentials-grid.tsx`, `src/components/referee/referee-matches.tsx`, `match-report.tsx`. None of these routes are exercised by any existing Playwright spec with `waitForHydration()` — confirmed by grepping `tests/e2e/` for `coach/roster|coach/attendance|coach/assess|coach/practices|admin/applications|admin/coaches|/referee`: the only hit, `coach-dashboard.spec.ts`, visits *different* sibling routes (bare `/coach/attendance`, `/coach/teams/{id}` — which doesn't even exist; see Design Decision 6) without ever calling `waitForHydration`. Adding the beacon to all nine is safe and required for the walkthroughs to reliably click into hydrated pages.
6. **Attaching a curriculum sequence to a season is explicitly idempotent**, confirmed both in code comments and in the UI copy itself: `POST /api/admin/curriculum/sequences/[id]/attach.ts` doc comment ("Idempotent by design: existing (team, template, scheduledDate) triples are skipped") and `sequence-editor.tsx`'s own on-screen copy ("Re-attaching is safe — existing drafts are skipped."). Safe to actually submit on every run.
7. **"Mark hired" is NOT idempotent** (`src/pages/api/admin/applications/[id]/hire.ts` returns 409 once `hiredUserId` is set) — the seed fixture must reset the training applicant's `status`/`hiredUserId` on every `db:seed:e2e` run so the walkthrough can always click it.
8. **Coach credential edits are naturally idempotent** (`tests/api/admin/coach-credentials.test.ts`: "Still exactly one row for (user, org, type) — app-level upsert") and the applications list/coach grid API tests assert `>0`/scoped IDs, never an exact global count — safe to add new dedicated `training+coach@`/`training+applicant@` fixture rows without touching those tests.
9. **The local `main` checkout (this repo's actual working directory per the task instructions) is 15 commits behind `origin/main`** and does not yet have Phase 1's files on disk, even though the spec states Phase 1 is merged. A sibling worktree in this session happens to be checked out past that merge; Phase-1 file contents were read from there for research only. This plan's own file writes target the `main` checkout as instructed and do not depend on `main` having pulled — Task 1 onward assume the files this plan creates/modifies are being added on top of whatever `main` currently has, and the executor should `git pull`/rebase onto latest `main` before starting Task 1 so `src/lib/ops-catalog/views/training-deck.ts` and its screenshot-slot contract actually exist to build against.

## Design Decisions

**1. Write-safety policy: only submit a write when independently confirmed idempotent; everything else opens-the-UI-but-doesn't-submit.** Four writes are actually submitted, each because the target endpoint is provably safe to re-run (see Scouting Findings 4, 6, 7, 8): referee score report, sequence attach, application hire (paired with a seed-side reset), coach credential edit. Every other interactive control the walkthroughs touch — attendance status toggle, roster "add note", "New Assessment" modal, practice "Mark Complete"/reflection — is opened and interacted with for the camera (so the training video still shows the real UI) but the walkthrough stops short of the final Save/Submit click. This keeps re-running `npm run training:videos` any number of times safe without a DB reset in between, without inventing a reset-fixture for every single feature.

**2. `Tour.step()`'s `role` field is inert for `admin-hire-compliance` and `admin-sequencing`.** `role` only matters when a step supplies `deckSlug` (it picks the deck screenshot directory). Per Scouting Finding 1, neither of those two workflows has any legitimate deckSlug — so `role: "director"` is passed for labeling/consistency only and the deck-slot-copy branch never executes for them. This is called out in each of those walkthrough files' header comments so a future editor doesn't wonder why `role` is unused.

**3. `registerVideoCapture()` closes the page itself inside `test.afterEach`.** Playwright's `Video.path()` only resolves once the context/page that recorded it has closed — the standard pattern (used in Playwright's own docs/recipes for renaming recorded videos) is to call `page.close()` explicitly inside `afterEach` before reading `page.video()!.path()`, then copy the file to the desired location. `page.close()` is a safe no-op if the page happens to already be closed.

**4. `TourPage` is a narrow structural subset of Playwright's `Page`, not the full type.** `Pick<Page, "screenshot" | "waitForTimeout">` is all `Tour.step()` needs. This keeps the caption/screenshot/deck-copy logic (the thing the brief asks to unit test) exercisable with a two-method fake object — no real browser, no `@playwright/test` test runner — while a real Playwright `Page` still satisfies the type with zero casting.

**5. `npm run training:videos -- <name>` needs no wrapper script.** Playwright's CLI treats trailing positional args as substring/glob filters against test file paths relative to `testDir`. `playwright test --config training/playwright.config.ts coach-core` already matches only `training/walkthroughs/coach-core.walkthrough.ts` (and not `coach-practices.walkthrough.ts`, since "coach-core" isn't a substring of that filename) — so `"training:videos": "playwright test --config training/playwright.config.ts"` in `package.json` plus `npm run training:videos -- coach-core` is the complete "single workflow" form; no extra `scripts/*.mjs` needed.

**6. Not fixed as part of this plan (flagged for a separate change):** `tests/e2e/coach-dashboard.spec.ts`'s "can view team roster" / "shows player list in team" tests click `a[href*="/coach/teams/"]`, but `CoachTeams`/`coach-dashboard-overview.tsx` only ever render `href="/coach/roster/${teamId}"` — that selector's `count()` is always 0, so those two tests silently no-op today. This is pre-existing, unrelated to the training pipeline's file surface, and outside this plan's one-file-to-create-plus-listed-modifications scope; note it for a follow-up rather than touching that spec here.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/db/seeds/seed-e2e-tests.ts` | Modify | Add `role.referee` + `training+referee@…` account + a reset-each-run training match/assignment; a reset-each-run `training+applicant@…` job application; a `training+coach@…` account for the credentials demo; a `training+coach@…`-independent training curriculum sequence/template/entry. Export `TRAINING_USERS` for walkthroughs to import. |
| `tests/utils/test-helpers.ts` | Modify | `signIn()` redirects a `referee`-only account to `/referee` (mirrors the existing `coach`→`/coach` branch). |
| `src/components/coach/practices-overview.tsx` | Modify | Add `useHydrationBeacon()`. |
| `src/components/coach/roster-table.tsx` | Modify | Add `useHydrationBeacon()`. |
| `src/components/coach/attendance-tracker.tsx` | Modify | Add `useHydrationBeacon()`. |
| `src/components/coach/player-assessment-detail.tsx` | Modify | Add `useHydrationBeacon()`. |
| `src/components/coach/session-detail.tsx` | Modify | Add `useHydrationBeacon()`. |
| `src/components/admin/applications-list.tsx` | Modify | Add `useHydrationBeacon()`. |
| `src/components/admin/coach-credentials-grid.tsx` | Modify | Add `useHydrationBeacon()`. |
| `src/components/referee/referee-matches.tsx` | Modify | Add `useHydrationBeacon()`. |
| `src/components/referee/match-report.tsx` | Modify | Add `useHydrationBeacon()`. |
| `training/lib/tour.ts` | Create | `Tour` class (`step()`/`finish()`), `createTour()`, `registerVideoCapture()`. |
| `tests/unit/training/tour.test.ts` | Create | Unit tests for `Tour` against a fake `TourPage`. |
| `training/playwright.config.ts` | Create | Separate Playwright project for `*.walkthrough.ts`. |
| `training/walkthroughs/coach-core.walkthrough.ts` | Create | Roster → attendance → assessment tour. |
| `training/walkthroughs/coach-practices.walkthrough.ts` | Create | Practice sessions / sequence progress tour. |
| `training/walkthroughs/admin-hire-compliance.walkthrough.ts` | Create | Applications → mark hired → coach credentials tour. |
| `training/walkthroughs/admin-sequencing.walkthrough.ts` | Create | Curriculum sequence → attach to season tour. |
| `training/walkthroughs/referee-gameday.walkthrough.ts` | Create | Assignment list → score report tour. |
| `training/walkthroughs/venue-manager.walkthrough.ts` | Create | Command center → check-in → reports tour. |
| `training/README.md` | Create | Regen instructions, prerequisites, output layout. |
| `package.json` | Modify | Add `training:videos` script. |
| `.gitignore` | Modify | Ignore `training/output/`. |
| `training/output/**` | Generated | Build artifacts — never committed. |

---

### Task 1: Referee role + training referee fixture

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts`
- Modify: `tests/utils/test-helpers.ts`

**Interfaces:**
- Consumes: existing `roles`, `users`, `userRoles`, `games`, `gameOfficials`, `gameIncidents` schema exports (all re-exported from `../schema`); existing `org.id`, `season.id`, `team.id` locals already in scope inside `seedE2ETests()`.
- Produces: `export const TRAINING_USERS = { referee: { email, password }, coach: { email, password }, applicant: { email } }` from `seed-e2e-tests.ts` — later tasks (3, 11) import this instead of hardcoding credentials twice.

- [x] **Step 1: Add the exported `TRAINING_USERS` map near the other exported constants**

In `src/lib/db/seeds/seed-e2e-tests.ts`, immediately after the existing `export const E2E_RENTAL_VENUE_ID = "...";` block (around line 183), add:

```ts
/**
 * Phase 2 training-walkthrough fixture accounts. Kept fully separate from
 * TEST_USERS so re-running `npm run training:videos` (which writes through
 * some of these) never touches the shared coach@/admin@ accounts other
 * specs sign in as. See seedTrainingFixtures() below for what each writes.
 */
export const TRAINING_USERS = {
  referee: {
    email: "training+referee@test.aspiresports.com",
    password: "TestReferee123!",
  },
  coach: {
    email: "training+coach@test.aspiresports.com",
    password: "TestCoach123!",
  },
  applicant: {
    email: "training+applicant@test.aspiresports.com",
  },
};
```

- [x] **Step 2: Add `gameIncidents` and `jobApplications`/`practiceTemplates`/`curriculumSequences`/`curriculumSequenceEntries` to the existing schema imports**

Change:

```ts
import { rosters, games, gameOfficials } from "../schema";
```

to:

```ts
import {
  rosters,
  games,
  gameOfficials,
  gameIncidents,
  jobApplications,
  practiceTemplates,
  curriculumSequences,
  curriculumSequenceEntries,
} from "../schema";
```

(All are re-exported from the `../schema` barrel — confirmed via `export * from "./teams"` / `"./job-applications"` / `"./practice-planning"` / `"./curriculum-sequences"` in `src/lib/db/schema/index.ts`.)

- [x] **Step 3: Add the `seedTrainingFixtures` function**

Add this new function right before `async function seedE2ETests() {` (after `seedCurriculumRadarFixture`):

```ts
/**
 * Training walkthrough fixtures (Phase 2 — training video pipeline).
 *
 * The referee portal (`/referee/**`) has had no seeded fixture before this:
 * `role_name` has included "referee" as a valid enum value since it was
 * written, but no `roles` row for it was ever inserted, so `/referee/**`
 * (gated on that role by src/middleware.ts) has been unreachable by any
 * seeded account. This inserts it for the first time, plus a dedicated
 * referee test user and a training match reset to "not yet reported" on
 * every seed run so the referee-gameday walkthrough always sees a fresh
 * score-entry screen (score-report submission is idempotent, but the
 * "before" state — an unreported match — is not, since submitting flips it
 * to completed).
 */
async function seedTrainingFixtures(
  db: Database,
  orgId: string,
  seasonId: string,
  teamId: string,
) {
  // --- Referee role + dedicated referee test user -------------------------
  await db
    .insert(roles)
    .values({
      name: "referee",
      description: "Officiates assigned matches; enters final scores and incidents",
      permissions: ["games:read_assigned", "games:write_score"],
    })
    .onConflictDoNothing();

  const [refereeRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, "referee"))
    .limit(1);
  if (!refereeRole) throw new Error("e2e seed: failed to create/find the referee role");

  const refereePasswordHash = await hashPassword(TRAINING_USERS.referee.password);
  let [trainingReferee] = await db
    .select()
    .from(users)
    .where(eq(users.email, TRAINING_USERS.referee.email))
    .limit(1);
  if (!trainingReferee) {
    [trainingReferee] = await db
      .insert(users)
      .values({
        email: TRAINING_USERS.referee.email,
        passwordHash: refereePasswordHash,
        firstName: "Training",
        lastName: "Referee",
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({ passwordHash: refereePasswordHash, emailVerified: true })
      .where(eq(users.id, trainingReferee.id));
  }
  await db.delete(userRoles).where(eq(userRoles.userId, trainingReferee.id));
  await db.insert(userRoles).values({
    userId: trainingReferee.id,
    roleId: refereeRole.id,
    scopeType: "organization",
    scopeId: orgId,
  });
  console.log(`   ✓ Training referee: ${TRAINING_USERS.referee.email}`);

  // Dedicated training match — find-or-create by a marker in `notes` (games
  // has no natural unique key), reset to "scheduled"/unreported every run.
  const TRAINING_GAME_MARKER = "training-referee-gameday-fixture";
  let [trainingGame] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.notes, TRAINING_GAME_MARKER))
    .limit(1);
  const scheduledAt = new Date(Date.now() - 60 * 60 * 1000); // 1h ago — "to report"
  if (!trainingGame) {
    [trainingGame] = await db
      .insert(games)
      .values({
        seasonId,
        homeTeamId: teamId,
        scheduledAt,
        status: "scheduled",
        notes: TRAINING_GAME_MARKER,
      })
      .returning({ id: games.id });
  } else {
    await db
      .update(games)
      .set({
        status: "scheduled",
        scheduledAt,
        homeScore: null,
        awayScore: null,
        refereeNotes: null,
      })
      .where(eq(games.id, trainingGame.id));
    await db.delete(gameIncidents).where(eq(gameIncidents.gameId, trainingGame.id));
  }

  const [existingOfficial] = await db
    .select({ id: gameOfficials.id })
    .from(gameOfficials)
    .where(
      and(
        eq(gameOfficials.gameId, trainingGame.id),
        eq(gameOfficials.userId, trainingReferee.id),
      ),
    )
    .limit(1);
  if (!existingOfficial) {
    await db.insert(gameOfficials).values({
      gameId: trainingGame.id,
      userId: trainingReferee.id,
      position: "referee",
    });
  }
  console.log(`   ✓ Training referee-gameday fixture match reset (game ${trainingGame.id})`);
}
```

- [x] **Step 4: Call `seedTrainingFixtures` from `seedE2ETests`**

In `seedE2ETests()`, right after the existing:

```ts
  // Stage 15 — Curriculum development-radar fixture (Task 11).
  console.log("\n15. Setting up curriculum development-radar fixture...");
  await seedCurriculumRadarFixture(db, org.id);
```

add:

```ts

  // Stage 16 — Training walkthrough fixtures (Phase 2).
  console.log("\n16. Setting up training walkthrough fixtures...");
  await seedTrainingFixtures(db, org.id, season.id, team.id);
```

(`season` and `team` are the existing `e2e-test-spring-2026` / `"E2E Test Team"` locals already in scope at this point in the function — `team.coachUserId` is `coachUser.id`, which is why this same season/team pair is reused by Task 3's curriculum-sequence attach demo.)

- [x] **Step 5: Add the referee credential line to the printed summary**

Right after the existing `console.log(\`MediaEditor: ...\`);` line near the end of `seedE2ETests()`, add:

```ts
  console.log(`TrainingReferee: ${TRAINING_USERS.referee.email} / ${TRAINING_USERS.referee.password}`);
```

- [x] **Step 6: Redirect a referee-only account to `/referee` after sign-in**

In `tests/utils/test-helpers.ts`, change:

```ts
  const target =
    roles.includes("super_admin") || roles.includes("location_admin")
      ? "/admin"
      : roles.includes("coach")
        ? "/coach"
        : "/dashboard";
```

to:

```ts
  const target =
    roles.includes("super_admin") || roles.includes("location_admin")
      ? "/admin"
      : roles.includes("coach")
        ? "/coach"
        : roles.includes("referee")
          ? "/referee"
          : "/dashboard";
```

- [x] **Step 7: Run the seed and verify**

Run (against a real DB — staging via `dev:bws`, or set `ALLOW_E2E_SEED=yes` per the script's own guard):

```bash
npm run db:seed:e2e
```

Expected: the run completes with `✅ E2E test data seeded successfully!`, and the console shows lines `✓ Training referee: training+referee@test.aspiresports.com`, `✓ Training referee-gameday fixture match reset (game <uuid>)`, and the final credentials block includes `TrainingReferee: training+referee@test.aspiresports.com / TestReferee123!`. Re-run the same command a second time — it must succeed again with no duplicate-row errors (confirms the find-or-create/reset logic is idempotent).

- [x] **Step 8: Commit**

```bash
git add src/lib/db/seeds/seed-e2e-tests.ts tests/utils/test-helpers.ts
git commit -m "test(training): seed the referee role and a training-referee gameday fixture"
```

---

### Task 2: Hire + credentials training fixtures

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts`

**Interfaces:**
- Consumes: `TRAINING_USERS` from Task 1; `jobApplications`, `roles`, `users`, `userRoles` schema exports.
- Produces: nothing new exported — extends `seedTrainingFixtures` in place.

- [x] **Step 1: Extend `seedTrainingFixtures` with the applicant + credentials-coach fixtures**

Append to the body of `seedTrainingFixtures` (from Task 1), right before its closing `}`:

```ts

  // --- Admin hire/compliance fixtures --------------------------------------
  // Dedicated applicant, reset to un-hired on every seed run — the hire
  // endpoint 409s once hiredUserId is set, so "Mark hired" must always find
  // a fresh, un-hired row to click.
  let [trainingApplication] = await db
    .select({ id: jobApplications.id })
    .from(jobApplications)
    .where(eq(jobApplications.email, TRAINING_USERS.applicant.email))
    .limit(1);
  if (!trainingApplication) {
    [trainingApplication] = await db
      .insert(jobApplications)
      .values({
        organizationId: orgId,
        role: "coach",
        firstName: "Training",
        lastName: "Applicant",
        email: TRAINING_USERS.applicant.email,
        experience: "3 seasons coaching U10 rec soccer.",
        availability: ["weeknights", "weekends"],
        source: "training fixture",
        status: "new",
      })
      .returning({ id: jobApplications.id });
  } else {
    await db
      .update(jobApplications)
      .set({ status: "new", hiredUserId: null })
      .where(eq(jobApplications.id, trainingApplication.id));
  }
  console.log(`   ✓ Training applicant reset to un-hired: ${TRAINING_USERS.applicant.email}`);

  // Dedicated coach for the credentials-grid edit demo — kept separate from
  // coach@test.aspiresports.com so the walkthrough never writes credential
  // rows against the account other specs sign in as.
  const trainingCoachPasswordHash = await hashPassword(TRAINING_USERS.coach.password);
  let [trainingCoach] = await db
    .select()
    .from(users)
    .where(eq(users.email, TRAINING_USERS.coach.email))
    .limit(1);
  if (!trainingCoach) {
    [trainingCoach] = await db
      .insert(users)
      .values({
        email: TRAINING_USERS.coach.email,
        passwordHash: trainingCoachPasswordHash,
        firstName: "Training",
        lastName: "Coach",
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({ passwordHash: trainingCoachPasswordHash, emailVerified: true })
      .where(eq(users.id, trainingCoach.id));
  }
  const [coachRoleRow] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, "coach"))
    .limit(1);
  if (!coachRoleRow) throw new Error("e2e seed: coach role missing");
  await db.delete(userRoles).where(eq(userRoles.userId, trainingCoach.id));
  await db.insert(userRoles).values({
    userId: trainingCoach.id,
    roleId: coachRoleRow.id,
    scopeType: "organization",
    scopeId: orgId,
  });
  console.log(`   ✓ Training coach for credentials demo: ${TRAINING_USERS.coach.email}`);
```

- [x] **Step 2: Run the seed and verify**

```bash
npm run db:seed:e2e
```

Expected: new lines `✓ Training applicant reset to un-hired: training+applicant@test.aspiresports.com` and `✓ Training coach for credentials demo: training+coach@test.aspiresports.com`. Re-run again — still succeeds (idempotent).

- [x] **Step 3: Confirm the existing API tests still pass unaffected**

Run (dev server up, per `CLAUDE.md`'s pre-push checklist env):

```bash
CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api tests/api/admin/applications.test.ts tests/api/admin/coach-credentials.test.ts
```

Expected: both files still PASS — they assert `>0`/scoped IDs, never an exact global row count, so the two new fixture rows don't break them (confirmed in Scouting Finding 8 before writing this fixture).

- [x] **Step 4: Commit**

```bash
git add src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "test(training): seed hire-applicant and credentials-coach training fixtures"
```

---

### Task 3: Curriculum sequencing training fixture

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts`

**Interfaces:**
- Consumes: `practiceTemplates`, `curriculumSequences`, `curriculumSequenceEntries` schema exports (Task 1 import); `sports`, `developmentStages` already imported; `orgId` param already threaded through `seedTrainingFixtures`.
- Produces: a sequence named exactly `"Training Fixture Sequence"` for the `admin-sequencing` walkthrough (Task 10) to find via its `data-testid="sequence-card"` text.

- [x] **Step 1: Extend `seedTrainingFixtures` with the curriculum-sequence fixture**

Append to the body of `seedTrainingFixtures`, right before its closing `}` (after Task 2's block):

```ts

  // --- Curriculum sequencing fixture ---------------------------------------
  // A training practice template + a one-entry sequence, so the
  // admin-sequencing walkthrough has a real sequence to open and a real
  // (season, coached-team) pair to attach it to. Attaching is idempotent by
  // the endpoint's own design (skips existing draft session_plans — see
  // src/pages/api/admin/curriculum/sequences/[id]/attach.ts), so no reset is
  // needed between runs — only find-or-upsert.
  const [soccerSport] = await db
    .select({ id: sports.id })
    .from(sports)
    .where(and(eq(sports.organizationId, orgId), eq(sports.slug, "soccer")))
    .limit(1);
  if (!soccerSport) throw new Error("e2e seed: soccer sport missing for training sequence fixture");

  const [fundamentalsStage] = await db
    .select({ id: developmentStages.id })
    .from(developmentStages)
    .where(eq(developmentStages.slug, "fundamentals"))
    .limit(1);
  if (!fundamentalsStage) {
    throw new Error("e2e seed: 'fundamentals' stage missing for training sequence fixture");
  }

  const templateSet = {
    organizationId: orgId,
    sportId: soccerSport.id,
    stageId: fundamentalsStage.id,
    name: "Training Fixture Practice",
    description:
      "Seeded for the admin-sequencing training walkthrough — not a real curriculum template.",
    totalDurationMinutes: 60,
    structure: [
      { name: "Warm-up", type: "warmup", durationMinutes: 10 },
      { name: "Core skill work", type: "skill", durationMinutes: 40 },
      { name: "Cool-down", type: "cooldown", durationMinutes: 10 },
    ],
    updatedAt: new Date(),
  };
  const [trainingTemplate] = await db
    .insert(practiceTemplates)
    .values(templateSet)
    .onConflictDoUpdate({
      target: [practiceTemplates.sportId, practiceTemplates.name],
      set: templateSet,
    })
    .returning({ id: practiceTemplates.id });

  const sequenceSet = {
    organizationId: orgId,
    sportId: soccerSport.id,
    developmentStageId: fundamentalsStage.id,
    programType: "league" as const,
    name: "Training Fixture Sequence",
    description:
      "Seeded for the admin-sequencing training walkthrough — not a real curriculum sequence.",
    updatedAt: new Date(),
  };
  const [trainingSequence] = await db
    .insert(curriculumSequences)
    .values(sequenceSet)
    .onConflictDoUpdate({
      target: [curriculumSequences.sportId, curriculumSequences.name],
      set: sequenceSet,
    })
    .returning({ id: curriculumSequences.id });

  const [existingEntry] = await db
    .select({ id: curriculumSequenceEntries.id })
    .from(curriculumSequenceEntries)
    .where(
      and(
        eq(curriculumSequenceEntries.sequenceId, trainingSequence.id),
        eq(curriculumSequenceEntries.position, 1),
      ),
    )
    .limit(1);
  if (!existingEntry) {
    await db.insert(curriculumSequenceEntries).values({
      sequenceId: trainingSequence.id,
      position: 1,
      templateId: trainingTemplate.id,
      objectives: ["Demonstrate the sequencing walkthrough"],
    });
  }
  console.log(`   ✓ Training curriculum sequence: "${sequenceSet.name}" (1 entry)`);
```

- [x] **Step 2: Run the seed and verify**

```bash
npm run db:seed:e2e
```

Expected: `✓ Training curriculum sequence: "Training Fixture Sequence" (1 entry)`. Re-run again — still succeeds and still reports exactly 1 entry (the `existingEntry` guard prevents a duplicate position-1 row).

- [x] **Step 3: Commit**

```bash
git add src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "test(training): seed a training curriculum sequence fixture for the admin-sequencing walkthrough"
```

---

### Task 4: Add missing hydration beacons

**Files:**
- Modify: `src/components/coach/practices-overview.tsx`
- Modify: `src/components/coach/roster-table.tsx`
- Modify: `src/components/coach/attendance-tracker.tsx`
- Modify: `src/components/coach/player-assessment-detail.tsx`
- Modify: `src/components/coach/session-detail.tsx`
- Modify: `src/components/admin/applications-list.tsx`
- Modify: `src/components/admin/coach-credentials-grid.tsx`
- Modify: `src/components/referee/referee-matches.tsx`
- Modify: `src/components/referee/match-report.tsx`

**Interfaces:**
- Consumes: `useHydrationBeacon` from `@/lib/hooks/use-hydration-beacon` (existing hook, unchanged).
- Produces: `html[data-hydrated="true"]` fires on every page the six walkthroughs visit, so `waitForHydration(page)` (used throughout the walkthroughs, Tasks 6–12) reliably resolves instead of timing out.

Each edit is the same two-line mechanical change: add the import, call the hook as the first line of the component body. All nine are bundled into one task since none has its own test file and the "test" for each is the same shared verification step (7).

- [x] **Step 1: `practices-overview.tsx`**

```ts
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
```

and in `export default function PracticesOverview() {`:

```ts
export default function PracticesOverview() {
  useHydrationBeacon()

  const [sessions, setSessions] = useState<SessionPlan[]>([])
```

- [x] **Step 2: `roster-table.tsx`**

Add `import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"` near the top imports, and as the first line inside `export default function RosterTable({ teamId }: RosterTableProps) {`, add `useHydrationBeacon()`.

- [x] **Step 3: `attendance-tracker.tsx`**

Add `import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"`, and as the first line inside `export function AttendanceTracker({ teamId }: AttendanceTrackerProps) {`, add `useHydrationBeacon()`.

- [x] **Step 4: `player-assessment-detail.tsx`**

Add `import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"`, and as the first line inside `export default function PlayerAssessmentDetail({ ... }) {`, add `useHydrationBeacon()`.

- [x] **Step 5: `session-detail.tsx`**

Add `import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"`, and as the first line inside `export default function SessionDetail({ sessionId }: SessionDetailProps) {`, add `useHydrationBeacon()`.

- [x] **Step 6: `applications-list.tsx`, `coach-credentials-grid.tsx`, `referee-matches.tsx`, `match-report.tsx`**

Same pattern in each:
- `applications-list.tsx`: import the hook, call it first inside `export default function ApplicationsList() {`.
- `coach-credentials-grid.tsx`: import the hook, call it first inside `export default function CoachCredentialsGrid() {`.
- `referee-matches.tsx`: import the hook, call it first inside `export function RefereeMatches({ matches }: { matches: RefereeMatch[] }) {`.
- `match-report.tsx`: import the hook, call it first inside `export function MatchReport({ data }: { data: MatchReportData }) {`.

- [x] **Step 7: Verify no existing e2e spec regresses**

```bash
grep -rn "coach/roster\|coach/attendance\|coach/assess\|coach/practices\|admin/applications\|admin/coaches\|'/referee'\|\"/referee\"" tests/e2e/
```

Expected: only `tests/e2e/coach-dashboard.spec.ts` matches, and (already confirmed during scouting) none of its assertions visit `/coach/roster/[teamId]`, `/coach/attendance/[teamId]`, `/coach/practices/**`, `/admin/applications`, `/admin/coaches`, or `/referee/**`, nor does it call `waitForHydration()` on any route these nine components render — so this change cannot break it. If a new match ever appears here in the future, re-check it before merging.

- [x] **Step 8: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [x] **Step 9: Commit**

```bash
git add src/components/coach/practices-overview.tsx src/components/coach/roster-table.tsx \
  src/components/coach/attendance-tracker.tsx src/components/coach/player-assessment-detail.tsx \
  src/components/coach/session-detail.tsx src/components/admin/applications-list.tsx \
  src/components/admin/coach-credentials-grid.tsx src/components/referee/referee-matches.tsx \
  src/components/referee/match-report.tsx
git commit -m "fix(e2e): add useHydrationBeacon to coach/admin/referee pages the training walkthroughs drive"
```

---

### Task 5: `training/lib/tour.ts` — the `Tour` helper (TDD)

**Files:**
- Create: `training/lib/tour.ts`
- Test: `tests/unit/training/tour.test.ts`

**Interfaces:**
- Produces: `export type TourPage`, `export interface StepOptions { deckSlug?: string; pauseMs?: number }`, `export interface CaptionEntry { index: number; caption: string; timestampMs: number; screenshot: string; deckSlug?: string }`, `export interface TourOptions { workflow: string; role: string; rootDir?: string }`, `export class Tour { step(page: TourPage, caption: string, fn: () => Promise<void>, opts?: StepOptions): Promise<void>; finish(): Promise<void> }`, `export function createTour(opts: TourOptions): Tour`, `export function registerVideoCapture(testObj: typeof import("@playwright/test").test, workflow: string, rootDir?: string): void`. Tasks 6–12 (walkthroughs) rely on exactly these names/signatures.

- [x] **Step 1: Write the failing unit tests**

Create `tests/unit/training/tour.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTour } from "../../../training/lib/tour";

function fakePage() {
  const calls = { screenshot: [] as string[], waits: [] as number[] };
  return {
    calls,
    async screenshot({ path: p }: { path: string }) {
      calls.screenshot.push(p);
      await fs.writeFile(p, Buffer.from("fake-png-bytes"));
    },
    async waitForTimeout(ms: number) {
      calls.waits.push(ms);
    },
  };
}

describe("Tour", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "tour-test-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("writes one screenshot + one captions.json entry per step, in order", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "demo-workflow", role: "coach", rootDir });

    await tour.step(page, "Open the dashboard", async () => {});
    await tour.step(page, "Click the roster tab", async () => {});
    await tour.finish();

    const outputDir = path.join(rootDir, "output", "demo-workflow");
    const captions = JSON.parse(
      await fs.readFile(path.join(outputDir, "captions.json"), "utf8"),
    );

    expect(captions).toHaveLength(2);
    expect(captions[0]).toMatchObject({ index: 0, caption: "Open the dashboard" });
    expect(captions[1]).toMatchObject({ index: 1, caption: "Click the roster tab" });
    expect(captions[0].timestampMs).toBeLessThanOrEqual(captions[1].timestampMs);
    expect(page.calls.screenshot).toHaveLength(2);

    for (const c of captions) {
      const stat = await fs.stat(path.join(outputDir, c.screenshot));
      expect(stat.isFile()).toBe(true);
    }
  });

  it("pauses 400ms after a step by default, for watchability", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "demo-workflow", role: "coach", rootDir });
    await tour.step(page, "Step one", async () => {});
    expect(page.calls.waits).toEqual([400]);
  });

  it("respects a custom pauseMs override", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "demo-workflow", role: "coach", rootDir });
    await tour.step(page, "Step one", async () => {}, { pauseMs: 100 });
    expect(page.calls.waits).toEqual([100]);
  });

  it("copies the step screenshot into the deck screenshot slot when deckSlug is set", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "referee-gameday", role: "ref", rootDir });
    await tour.step(page, "Submit the match report", async () => {}, {
      deckSlug: "score_reporting_final",
    });

    const stat = await fs.stat(
      path.join(rootDir, "screenshots", "ref", "score_reporting_final.png"),
    );
    expect(stat.isFile()).toBe(true);
  });

  it("does not create a deck-slot directory when no step sets deckSlug", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "coach-core", role: "coach", rootDir });
    await tour.step(page, "View the roster", async () => {});
    await expect(fs.stat(path.join(rootDir, "screenshots", "coach"))).rejects.toThrow();
  });

  it("slugifies captions into zero-padded, filesystem-safe screenshot filenames", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "demo-workflow", role: "coach", rootDir });
    await tour.step(page, "Open the Coach's Dashboard!!", async () => {});

    const outputDir = path.join(rootDir, "output", "demo-workflow");
    const files = await fs.readdir(outputDir);
    expect(files).toContain("00-open-the-coach-s-dashboard.png");
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/training/tour.test.ts`
Expected: FAIL — `Cannot find module '../../../training/lib/tour'`.

- [x] **Step 3: Implement `training/lib/tour.ts`**

Create `training/lib/tour.ts`:

```ts
// Tiny helper for Phase 2 walkthrough scripts. Records a timestamped caption
// and a named screenshot for every `step()`, writes a `captions.json`
// sidecar per workflow, and — when a step is tagged with a real ops-catalog
// activity slug — copies that step's screenshot into the Phase 1 deck's
// screenshot slot (`training/screenshots/<role>/<slug>.png`; see
// src/lib/ops-catalog/views/training-deck.ts).
//
// Kept framework-light on purpose: `Tour.step()` only needs
// `page.screenshot`/`page.waitForTimeout`, expressed as the `TourPage`
// subset of Playwright's `Page`, so this logic is unit-testable with a
// plain fake object — no browser required. Real Playwright glue
// (`registerVideoCapture`) lives at the bottom, separate from the
// unit-tested `Tour` class.
import fs from "node:fs/promises";
import path from "node:path";
import type { test as PlaywrightTest, Page } from "@playwright/test";

export type TourPage = Pick<Page, "screenshot" | "waitForTimeout">;

export interface StepOptions {
  /** Catalog activity slug (act.<slug> minus the "act." prefix) this step
   * illustrates. When set, the step's screenshot is ALSO copied to
   * training/screenshots/<role>/<slug>.png so `catalog:render --embed`
   * picks it up. Most steps have no catalog counterpart (coach-lifecycle /
   * hiring / curriculum-sequencing features aren't modeled in the ops
   * catalog) and should leave this unset. */
  deckSlug?: string;
  /** Pause after the action completes, in ms. Default 400 — long enough to
   * read the resulting screen in the recorded video. */
  pauseMs?: number;
}

export interface CaptionEntry {
  index: number;
  caption: string;
  timestampMs: number;
  screenshot: string;
  deckSlug?: string;
}

export interface TourOptions {
  /** Workflow name — output lands in <rootDir>/output/<workflow>/. Should
   * match the walkthrough file's own name stem (by convention, not code). */
  workflow: string;
  /** Role slug for the deck screenshot directory (e.g. "coach", "ref",
   * "venue_manager", "director"). Only read when a step sets `deckSlug`. */
  role: string;
  /** Root directory for all training output. Defaults to <cwd>/training;
   * override in unit tests to avoid touching the real repo tree. */
  rootDir?: string;
}

function slugifyCaption(caption: string): string {
  return caption
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export class Tour {
  private readonly captions: CaptionEntry[] = [];
  private readonly startedAt = Date.now();
  private nextIndex = 0;

  constructor(private readonly opts: TourOptions) {}

  private root(): string {
    return this.opts.rootDir ?? path.join(process.cwd(), "training");
  }

  private outputDir(): string {
    return path.join(this.root(), "output", this.opts.workflow);
  }

  private deckScreenshotDir(): string {
    return path.join(this.root(), "screenshots", this.opts.role);
  }

  /** Runs `fn`, pauses briefly, saves a named screenshot, and records a
   * timestamped caption. Call once per visually distinct beat of the tour. */
  async step(
    page: TourPage,
    caption: string,
    fn: () => Promise<void>,
    stepOptions: StepOptions = {},
  ): Promise<void> {
    await fn();
    await page.waitForTimeout(stepOptions.pauseMs ?? 400);

    const index = this.nextIndex++;
    const filename = `${String(index).padStart(2, "0")}-${slugifyCaption(caption)}.png`;
    const outputDir = this.outputDir();
    await fs.mkdir(outputDir, { recursive: true });
    const screenshotPath = path.join(outputDir, filename);
    await page.screenshot({ path: screenshotPath });

    if (stepOptions.deckSlug) {
      const deckDir = this.deckScreenshotDir();
      await fs.mkdir(deckDir, { recursive: true });
      await fs.copyFile(screenshotPath, path.join(deckDir, `${stepOptions.deckSlug}.png`));
    }

    const entry: CaptionEntry = {
      index,
      caption,
      timestampMs: Date.now() - this.startedAt,
      screenshot: filename,
    };
    if (stepOptions.deckSlug) entry.deckSlug = stepOptions.deckSlug;
    this.captions.push(entry);
  }

  /** Writes captions.json. Call once at the end of the walkthrough. */
  async finish(): Promise<void> {
    const outputDir = this.outputDir();
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, "captions.json"),
      JSON.stringify(this.captions, null, 2) + "\n",
    );
  }
}

export function createTour(opts: TourOptions): Tour {
  return new Tour(opts);
}

/**
 * Registers a `test.afterEach` that finalizes the Playwright-recorded video
 * for every test in the file and copies it to
 * <rootDir>/output/<workflow>/video.webm. Closing the page here (rather
 * than relying on Playwright's own teardown) is required — `Video.path()`
 * only resolves once the page/context that recorded it has closed.
 */
export function registerVideoCapture(
  testObj: typeof PlaywrightTest,
  workflow: string,
  rootDir?: string,
): void {
  testObj.afterEach(async ({ page }) => {
    const video = page.video();
    await page.close();
    if (!video) return;
    const src = await video.path();
    const destDir = path.join(rootDir ?? path.join(process.cwd(), "training"), "output", workflow);
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(src, path.join(destDir, "video.webm"));
  });
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/training/tour.test.ts`
Expected: PASS — all 6 tests green.

- [x] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [x] **Step 6: Commit**

```bash
git add training/lib/tour.ts tests/unit/training/tour.test.ts
git commit -m "feat(training): add the Tour caption/screenshot helper with unit tests"
```

---

### Task 6: `training/playwright.config.ts` + npm script + `.gitignore`

**Files:**
- Create: `training/playwright.config.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `npm run training:videos` (all six) and `npm run training:videos -- <name>` (one), used by Tasks 7–12 and the final verification task (14).

- [x] **Step 1: Create `training/playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

// Phase 2 walkthrough project — deliberately separate from the root
// playwright.config.ts (testDir: './tests/e2e'). `npm test` never
// discovers this directory, and this config is only ever invoked
// explicitly via `npm run training:videos`. No `webServer` block: unlike
// the CI-facing e2e config, walkthroughs run against a dev server the
// operator already has running (see training/README.md).
export default defineConfig({
  testDir: "./training/walkthroughs",
  testMatch: /.*\.walkthrough\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 180 * 1000,
  use: {
    baseURL: process.env.TRAINING_BASE_URL || "http://localhost:4321",
    viewport: { width: 1280, height: 720 },
    video: { mode: "on", size: { width: 1280, height: 720 } },
    screenshot: "on",
    trace: "off",
  },
  projects: [
    {
      name: "training",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [x] **Step 2: Add the npm script**

In `package.json`, add next to the existing `"test:headed"` entry:

```json
    "training:videos": "playwright test --config training/playwright.config.ts",
```

- [x] **Step 3: Ignore the output directory**

In `.gitignore`, add a new section:

```gitignore

# Phase 2 training walkthrough output (video/screenshots/captions) —
# regenerated on demand via `npm run training:videos`, never committed.
training/output/
```

- [x] **Step 4: Verify the root config still doesn't discover this directory**

```bash
grep -n "testDir" playwright.config.ts
```

Expected: `testDir: './tests/e2e'` — unchanged, confirming `npm test`/CI never scans `training/`.

- [x] **Step 5: Verify the new config parses (no walkthrough files exist yet, so this should report zero tests, not an error)**

```bash
npx playwright test --config training/playwright.config.ts --list
```

Expected: exits 0 and reports "No tests found" (or similar) — confirms the config file itself is syntactically valid and points at the right directory before any walkthrough files exist.

- [x] **Step 6: Commit**

```bash
git add training/playwright.config.ts package.json .gitignore
git commit -m "chore(training): add the separate Playwright project for walkthrough videos"
```

---

### Task 7: `coach-core` walkthrough

**Files:**
- Create: `training/walkthroughs/coach-core.walkthrough.ts`

**Interfaces:**
- Consumes: `signIn`, `waitForHydration`, `TEST_USERS` from `../../tests/utils/test-helpers`; `createTour`, `registerVideoCapture` from `../lib/tour`.
- Produces: `training/output/coach-core/{video.webm,captions.json,*.png}` when run.

- [x] **Step 1: Create `training/walkthroughs/coach-core.walkthrough.ts`**

```ts
import { test } from "@playwright/test";
import { signIn, waitForHydration, TEST_USERS } from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * coach-core — roster review, attendance, and opening a player assessment.
 *
 * Read-mostly by design (see the Phase 2 plan's Design Decision 1): the
 * attendance-toggle, roster-note, and assessment steps open/interact with
 * their UI but stop short of clicking Save/Submit, so this walkthrough
 * never writes attendance records, roster notes, or assessment levels. That
 * specifically protects the curriculum-radar e2e fixture (Tommy assessed at
 * fixed levels 4/3/2/3 in seed-e2e-tests.ts's seedCurriculumRadarFixture) —
 * an accidental re-assessment here would silently break that spec.
 *
 * No step is tagged with a deckSlug: none of docs/operations/catalog's 63
 * activities cover coach roster/attendance/assessment UI (see the plan's
 * Scouting Finding 1).
 */
const WORKFLOW = "coach-core";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "coach" });

  await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);
  await waitForHydration(page);

  await tour.step(page, "Coach dashboard — today at a glance", async () => {
    await page.goto("/coach", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  await tour.step(page, "My teams", async () => {
    await page.goto("/coach/teams", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const rosterLink = page.locator('a[href^="/coach/roster/"]').first();
  if ((await rosterLink.count()) > 0) {
    await tour.step(page, "Open a team roster", async () => {
      await rosterLink.click();
      await waitForHydration(page);
    });

    const teamId = new URL(page.url()).pathname.split("/").pop()!;

    const addNoteButton = page.getByTitle("Add note").first();
    if ((await addNoteButton.count()) > 0) {
      await tour.step(page, "Open the add-note UI for a player (not submitted)", async () => {
        await addNoteButton.click();
      });
    }

    await tour.step(page, "Open the attendance tracker", async () => {
      await page.goto(`/coach/attendance/${teamId}`, { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
    });

    const presentButton = page.getByTitle("Present").first();
    if ((await presentButton.count()) > 0) {
      await tour.step(page, "Mark a player present (not saved)", async () => {
        await presentButton.click();
      });
    }
  }

  await tour.step(page, "Player assessments overview", async () => {
    await page.goto("/coach/assessments", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const playerHeading = page.getByRole("heading", { level: 3 }).first();
  if ((await playerHeading.count()) > 0) {
    await tour.step(page, "Open a player's assessment detail", async () => {
      await playerHeading.click();
      await waitForHydration(page);
    });

    const recordButton = page.getByRole("button", { name: /assessment/i }).first();
    if ((await recordButton.count()) > 0) {
      await tour.step(page, "Open the record-assessment form (not submitted)", async () => {
        await recordButton.click();
      });
    }
  }

  await tour.finish();
});
```

- [x] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [x] **Step 3: Run it against a live dev server**

With the dev server already running (`npm run dev:bws` or `npm run dev`) and seeded (`npm run db:seed:e2e`):

```bash
npm run training:videos -- coach-core
```

Expected: 1 passed. `training/output/coach-core/` contains `video.webm`, `captions.json`, and at least 5 numbered PNGs (dashboard, teams, roster, attendance, assessments — more if the conditional steps fired).

- [x] **Step 4: Commit**

```bash
git add training/walkthroughs/coach-core.walkthrough.ts
git commit -m "feat(training): add the coach-core walkthrough"
```

---

### Task 8: `coach-practices` walkthrough

**Files:**
- Create: `training/walkthroughs/coach-practices.walkthrough.ts`

**Interfaces:**
- Consumes: same shared helpers as Task 7.
- Produces: `training/output/coach-practices/**`.

- [x] **Step 1: Create `training/walkthroughs/coach-practices.walkthrough.ts`**

```ts
import { test } from "@playwright/test";
import { signIn, waitForHydration, TEST_USERS } from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * coach-practices — the practice-session list (including the sequence
 * progress bar the admin-sequencing walkthrough's attach step feeds), and a
 * single session's detail/reflection UI.
 *
 * Read-mostly: opens "Mark Complete"/reflection but does not submit it —
 * completing a session is a one-way state transition (not idempotent), and
 * the session this walkthrough opens is the same draft admin-sequencing's
 * attach step generates, so completing it here would make later re-runs of
 * both walkthroughs show a stale "already completed" state instead of a
 * fresh demo. No deckSlug: practice planning isn't an ops-catalog activity.
 */
const WORKFLOW = "coach-practices";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "coach" });

  await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);

  await tour.step(page, "Practice sessions — list and sequence progress", async () => {
    await page.goto("/coach/practices", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const sessionLink = page.locator('a[href^="/coach/practices/"]').first();
  if ((await sessionLink.count()) > 0) {
    await tour.step(page, "Open a practice session", async () => {
      await sessionLink.click();
      await waitForHydration(page);
    });

    const reflectionButton = page.getByRole("button", { name: /reflection/i }).first();
    if ((await reflectionButton.count()) > 0) {
      await tour.step(page, "Open the post-session reflection form (not saved)", async () => {
        await reflectionButton.click();
      });
    }
  }

  await tour.finish();
});
```

- [x] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [x] **Step 3: Run it against a live dev server**

```bash
npm run training:videos -- coach-practices
```

Expected: 1 passed. `training/output/coach-practices/` contains `video.webm`, `captions.json`, and at least 1 PNG (more if a session/reflection was found — run Task 10's admin-sequencing walkthrough first so a real draft session exists to open).

- [x] **Step 4: Commit**

```bash
git add training/walkthroughs/coach-practices.walkthrough.ts
git commit -m "feat(training): add the coach-practices walkthrough"
```

---

### Task 9: `admin-hire-compliance` walkthrough

**Files:**
- Create: `training/walkthroughs/admin-hire-compliance.walkthrough.ts`

**Interfaces:**
- Consumes: `signIn`, `waitForHydration`, `TEST_USERS` from `../../tests/utils/test-helpers`; `TRAINING_USERS` from `../../src/lib/db/seeds/seed-e2e-tests` (Task 1/2); `createTour`, `registerVideoCapture` from `../lib/tour`.
- Produces: `training/output/admin-hire-compliance/**`.

- [x] **Step 1: Create `training/walkthroughs/admin-hire-compliance.walkthrough.ts`**

```ts
import { test, expect } from "@playwright/test";
import { signIn, waitForHydration, TEST_USERS } from "../../tests/utils/test-helpers";
import { TRAINING_USERS } from "../../src/lib/db/seeds/seed-e2e-tests";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * admin-hire-compliance — the hiring pipeline fallback view and the coach
 * credential compliance grid.
 *
 * "Mark hired" and the credential edit are both real writes:
 *  - Mark hired targets training+applicant@test.aspiresports.com, which
 *    seed-e2e-tests.ts resets to un-hired on every `npm run db:seed:e2e`
 *    run (the hire endpoint 409s once already hired — re-run the seed
 *    before re-running this walkthrough).
 *  - The credential edit targets training+coach@…, never
 *    coach@test.aspiresports.com, and is naturally idempotent — POST
 *    /api/admin/coaches/credentials upserts one row per (user, org, type).
 * No ops-catalog activity covers hiring/credentials (coach-lifecycle
 * features, not modeled in the catalog) — no deckSlug tags. `role:
 * "director"` below is inert as a result (see Design Decision 2).
 */
const WORKFLOW = "admin-hire-compliance";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "director" });

  await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

  await tour.step(page, "Applications — hiring pipeline fallback view", async () => {
    await page.goto("/admin/applications", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const applicantRow = page.locator("tr", { hasText: TRAINING_USERS.applicant.email });
  await expect(applicantRow).toBeVisible({ timeout: 15_000 });

  await tour.step(page, "Mark the training applicant hired", async () => {
    await applicantRow.getByRole("button", { name: /mark hired/i }).click();
    await expect(applicantRow.getByText(/hired/i)).toBeVisible({ timeout: 10_000 });
  });

  await tour.step(page, "Coach compliance grid", async () => {
    await page.goto("/admin/coaches", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const trainingCoachRow = page.locator("tr", { hasText: TRAINING_USERS.coach.email });
  if ((await trainingCoachRow.count()) > 0) {
    await tour.step(page, "Open the SafeSport credential editor", async () => {
      await trainingCoachRow.getByRole("button").first().click();
    });

    await tour.step(page, "Record the credential as verified", async () => {
      await page.locator("#cred-status").click();
      await page.getByRole("option", { name: /valid \(verified\)/i }).click();
      await page.getByLabel("Issued").fill(new Date().toISOString().slice(0, 10));
      await page.getByRole("button", { name: /^save$/i }).click();
    });
  }

  await tour.finish();
});
```

- [x] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [x] **Step 3: Run it against a live dev server (re-seed first so the applicant is un-hired)**

```bash
npm run db:seed:e2e
npm run training:videos -- admin-hire-compliance
```

Expected: 1 passed. `training/output/admin-hire-compliance/` contains `video.webm`, `captions.json`, and 4–5 PNGs. Re-run `npm run db:seed:e2e` then the walkthrough again to confirm repeatability.

- [x] **Step 4: Commit**

```bash
git add training/walkthroughs/admin-hire-compliance.walkthrough.ts
git commit -m "feat(training): add the admin-hire-compliance walkthrough"
```

---

### Task 10: `admin-sequencing` walkthrough

**Files:**
- Create: `training/walkthroughs/admin-sequencing.walkthrough.ts`

**Interfaces:**
- Consumes: `signIn`, `TEST_USERS` from `../../tests/utils/test-helpers`; `createTour`, `registerVideoCapture` from `../lib/tour`.
- Produces: `training/output/admin-sequencing/**`; also, as a side effect of attaching, real draft `session_plans` for the coach's team in `e2e-test-spring-2026` — which is what Task 8's `coach-practices` walkthrough opens.

- [ ] **Step 1: Create `training/walkthroughs/admin-sequencing.walkthrough.ts`**

```ts
import { test, expect } from "@playwright/test";
import { signIn, waitForHydration, TEST_USERS } from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * admin-sequencing — open the curriculum sequence library, inspect the
 * training fixture sequence, and attach it to the seeded e2e season.
 * Attaching is safe to repeat: POST
 * /api/admin/curriculum/sequences/[id]/attach is idempotent by design
 * (skips already-created draft session_plans — confirmed both in that
 * endpoint's own doc comment and in sequence-editor.tsx's on-screen copy,
 * "Re-attaching is safe — existing drafts are skipped."). No ops-catalog
 * activity covers curriculum sequencing — no deckSlug tags; `role:
 * "director"` is inert as a result (see Design Decision 2).
 */
const WORKFLOW = "admin-sequencing";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "director" });

  await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

  await tour.step(page, "Curriculum sequence library", async () => {
    await page.goto("/admin/curriculum/sequences", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const trainingSequenceCard = page.locator('[data-testid="sequence-card"]', {
    hasText: "Training Fixture Sequence",
  });
  await expect(trainingSequenceCard).toBeVisible({ timeout: 15_000 });

  await tour.step(page, "Open the training fixture sequence", async () => {
    await trainingSequenceCard.click();
  });

  const attachSection = page.locator("section", { hasText: "Attach to a season" });
  await expect(attachSection).toBeVisible({ timeout: 10_000 });

  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await tour.step(page, "Choose the season and generate practice-plan drafts", async () => {
    await attachSection.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /E2E Test Spring 2026/i }).click();
    await attachSection.getByLabel("First practice date").fill(startDate);
    await attachSection.getByRole("button", { name: /attach & generate/i }).click();
    await expect(page.getByText(/attached/i)).toBeVisible({ timeout: 15_000 });
  });

  await tour.finish();
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run it against a live dev server**

```bash
npm run training:videos -- admin-sequencing
```

Expected: 1 passed. `training/output/admin-sequencing/` contains `video.webm`, `captions.json`, and 3 PNGs. Re-run it a second time without re-seeding — still passes (confirms the attach step's idempotency).

- [ ] **Step 4: Commit**

```bash
git add training/walkthroughs/admin-sequencing.walkthrough.ts
git commit -m "feat(training): add the admin-sequencing walkthrough"
```

---

### Task 11: `referee-gameday` walkthrough

**Files:**
- Create: `training/walkthroughs/referee-gameday.walkthrough.ts`

**Interfaces:**
- Consumes: `signIn`, `waitForHydration` from `../../tests/utils/test-helpers`; `TRAINING_USERS` from `../../src/lib/db/seeds/seed-e2e-tests` (Task 1); `createTour`, `registerVideoCapture` from `../lib/tour`.
- Produces: `training/output/referee-gameday/**`; `training/screenshots/ref/ref_check_in.png` and `training/screenshots/ref/score_reporting_final.png` (deck slots).

- [ ] **Step 1: Create `training/walkthroughs/referee-gameday.walkthrough.ts`**

```ts
import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../../tests/utils/test-helpers";
import { TRAINING_USERS } from "../../src/lib/db/seeds/seed-e2e-tests";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * referee-gameday — a referee's assignment list and final score reporting.
 *
 * Scouting note: the referee portal has no dedicated "check-in" control
 * today — /referee is a read-only list of assigned matches (see
 * src/components/referee/referee-matches.tsx). act.ref_check_in's SOP
 * describes a physical sign-in at the event lead's station, which isn't
 * modeled in the app yet; this walkthrough uses the assignment list as the
 * closest available illustration and tags it with that slug as an
 * approximation, flagged here rather than silently invented. "Submit
 * report" is an exact match for act.score_reporting_final and is a real
 * write — POST /api/referee/matches/[gameId]/report updates the game row
 * in place and replaces its incidents, so re-running this walkthrough is
 * safe (seed-e2e-tests.ts also resets the training match to unreported on
 * every `db:seed:e2e` run, so the "before" screen is always fresh).
 */
const WORKFLOW = "referee-gameday";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "ref" });

  await signIn(page, TRAINING_USERS.referee.email, TRAINING_USERS.referee.password);

  await tour.step(
    page,
    "My matches — the referee's assignment list",
    async () => {
      await page.goto("/referee", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
    },
    { deckSlug: "ref_check_in" },
  );

  const matchLink = page.locator('a[href^="/referee/matches/"]').first();
  await expect(matchLink).toBeVisible({ timeout: 15_000 });

  await tour.step(page, "Open the training fixture match", async () => {
    await matchLink.click();
    await waitForHydration(page);
  });

  await tour.step(
    page,
    "Enter the final score, log an incident, and submit the report",
    async () => {
      await page.getByLabel("Home score").fill("3");
      await page.getByLabel("Away score").fill("1");
      await page.getByRole("button", { name: /add/i }).click();
      const minuteInput = page.getByPlaceholder("min").first();
      if ((await minuteInput.count()) > 0) {
        await minuteInput.fill("62");
      }
      await page.getByRole("button", { name: /submit report/i }).click();
      await expect(page.getByText("Saved.")).toBeVisible({ timeout: 10_000 });
    },
    { deckSlug: "score_reporting_final" },
  );

  await tour.finish();
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run it against a live dev server**

```bash
npm run training:videos -- referee-gameday
```

Expected: 1 passed. `training/output/referee-gameday/` contains `video.webm`, `captions.json`, 3 PNGs. `training/screenshots/ref/ref_check_in.png` and `training/screenshots/ref/score_reporting_final.png` now exist. Re-run without re-seeding — still passes (the report endpoint is idempotent even though the match is now "completed").

- [ ] **Step 4: Commit**

```bash
git add training/walkthroughs/referee-gameday.walkthrough.ts
git commit -m "feat(training): add the referee-gameday walkthrough"
```

---

### Task 12: `venue-manager` walkthrough

**Files:**
- Create: `training/walkthroughs/venue-manager.walkthrough.ts`

**Interfaces:**
- Consumes: `signInAsAdmin`, `waitForHydration` from `../../tests/utils/test-helpers`; `createTour`, `registerVideoCapture` from `../lib/tour`.
- Produces: `training/output/venue-manager/**`; `training/screenshots/venue_manager/team_check_in.png` (deck slot).

- [ ] **Step 1: Create `training/walkthroughs/venue-manager.walkthrough.ts`**

```ts
import { test } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * venue-manager — the venue command center's event-day overview, the
 * check-in station, and end-of-day reports.
 *
 * act.team_check_in (role.venue_manager is "informed" on its escalation
 * path, and it's already the venue_manager tools entry in
 * src/lib/ops-catalog/views/training-deck.ts's PORTAL_PAGES for
 * /admin/venue/check-in) is the closest catalog match for the check-in
 * page and is tagged accordingly. The command-center tour itself has no
 * catalog counterpart (it's a cross-activity dashboard, not a single
 * tracked activity) so its steps are untagged.
 */
const WORKFLOW = "venue-manager";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "venue_manager" });

  await signInAsAdmin(page);

  await tour.step(page, "Venue command center — today's overview", async () => {
    await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const activityBlock = page.locator("[data-activity-block]").first();
  if ((await activityBlock.count()) > 0) {
    await tour.step(page, "Open an activity's roster panel", async () => {
      await activityBlock.click();
    });
  }

  await tour.step(
    page,
    "Player/team check-in station",
    async () => {
      await page.goto("/admin/venue/check-in", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
    },
    { deckSlug: "team_check_in" },
  );

  await tour.step(page, "End-of-day reports", async () => {
    await page.goto("/admin/venue/reports", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  await tour.finish();
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run it against a live dev server**

```bash
npm run training:videos -- venue-manager
```

Expected: 1 passed. `training/output/venue-manager/` contains `video.webm`, `captions.json`, 3–4 PNGs. `training/screenshots/venue_manager/team_check_in.png` now exists.

- [ ] **Step 4: Commit**

```bash
git add training/walkthroughs/venue-manager.walkthrough.ts
git commit -m "feat(training): add the venue-manager walkthrough"
```

---

### Task 13: `training/README.md`

**Files:**
- Create: `training/README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by code — the operator-facing entry point for regenerating all six videos.

- [ ] **Step 1: Write `training/README.md`**

```md
# Training walkthrough videos

Six scripted product tours, each recorded as a 1280×720 video with
timestamped captions and per-step screenshots. Regenerated on demand —
never committed, never run in CI.

## Prerequisites

1. A dev server running against a **staging** database (never prod — these
   walkthroughs write real rows, guarded by dedicated `training+<role>@…`
   fixtures, but only staging is safe to point at):
   ```bash
   npm run dev:bws
   ```
2. Seed data, including the training fixtures these walkthroughs depend on
   (referee role/account, training applicant, training coach, training
   curriculum sequence):
   ```bash
   npm run db:seed:e2e
   ```
   Re-run this before every regen — several walkthroughs (admin-hire-
   compliance's "mark hired", referee-gameday's score report) reset their
   fixture's "before" state on every seed run so the recorded video always
   shows the full flow rather than an already-completed one.

## Regenerating

```bash
npm run training:videos                      # all six
npm run training:videos -- coach-core        # just one, by file-name substring
```

`TRAINING_BASE_URL` overrides the default `http://localhost:4321` if the dev
server is on a different port/host.

## Output layout

```
training/output/<workflow>/
  video.webm       # 1280x720 recording of the whole tour
  captions.json    # [{ index, caption, timestampMs, screenshot, deckSlug? }, …]
  00-*.png          # per-step screenshots, one per tour.step() call
  01-*.png
  …
```

`training/output/` is gitignored — nothing here is repo content.

## Feeding the training decks

Steps tagged with a `deckSlug` (an ops-catalog activity id minus its `act.`
prefix) ALSO copy their screenshot to
`training/screenshots/<role>/<deckSlug>.png` — the exact path Phase 1's deck
generator reads in `--embed` mode. After a video regen:

```bash
npm run catalog:render -- --embed
```

produces `docs/operations/artifacts/training/role.<id>.deck.html` files with
real screenshots inlined wherever a walkthrough supplied one. Most
walkthrough steps have no catalog counterpart — see the plan's Scouting
Finding 1 — so only `referee-gameday` (2 slugs) and `venue-manager` (1 slug)
currently feed a deck slot.

## Workflows

| Workflow | Role | Signs in as | What it shows |
|---|---|---|---|
| `coach-core` | coach | `TEST_USERS.coach` | Roster → attendance → player assessment |
| `coach-practices` | coach | `TEST_USERS.coach` | Practice sessions, sequence progress, reflection |
| `admin-hire-compliance` | director | `TEST_USERS.admin` | Applications → mark hired → coach credentials |
| `admin-sequencing` | director | `TEST_USERS.admin` | Curriculum sequence → attach to a season |
| `referee-gameday` | ref | `TRAINING_USERS.referee` | Assigned matches → final score report |
| `venue-manager` | venue_manager | `TEST_USERS.admin` | Command center → check-in → reports |

`TEST_USERS`/`TRAINING_USERS` are defined in `tests/utils/test-helpers.ts`
and `src/lib/db/seeds/seed-e2e-tests.ts` respectively — walkthroughs import
them rather than hardcoding credentials.
```

- [ ] **Step 2: Commit**

```bash
git add training/README.md
git commit -m "docs(training): add the training walkthrough README"
```

---

### Task 14: End-to-end verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Confirm the main suite is unaffected**

```bash
npx tsc --noEmit
npx playwright test --config playwright.config.ts --list | tail -5
```

Expected: `tsc` reports 0 errors; the root config's test list contains no `training/` paths (it only ever scanned `tests/e2e/`, unchanged by this plan).

- [ ] **Step 2: Fresh seed, then the full pipeline in one shot**

With the dev server running (`npm run dev:bws`):

```bash
npm run db:seed:e2e
npm run training:videos
```

Expected: 6 passed, 0 failed.

- [ ] **Step 3: Verify every output directory has the full artifact set**

```bash
for w in coach-core coach-practices admin-hire-compliance admin-sequencing referee-gameday venue-manager; do
  echo "=== $w ==="
  ls training/output/"$w"
  test -f training/output/"$w"/video.webm && echo "video.webm: OK"
  test -f training/output/"$w"/captions.json && echo "captions.json: OK"
  count=$(ls training/output/"$w"/*.png 2>/dev/null | wc -l)
  echo "screenshots: $count"
  [ "$count" -ge 3 ] && echo ">= 3: OK" || echo "FAIL: fewer than 3 screenshots"
done
```

Expected: every workflow prints `video.webm: OK`, `captions.json: OK`, and `>= 3: OK`.

- [ ] **Step 4: Verify the deck slot pickup end-to-end**

```bash
ls training/screenshots/ref/ training/screenshots/venue_manager/
npm run catalog:render -- --embed
grep -c "data:image/png;base64" docs/operations/artifacts/training/role.ref.deck.html
grep -c "data:image/png;base64" docs/operations/artifacts/training/role.venue_manager.deck.html
```

Expected: `training/screenshots/ref/` contains `ref_check_in.png` and `score_reporting_final.png`; `training/screenshots/venue_manager/` contains `team_check_in.png`; both deck files' embedded-image counts are `>= 1` (each deck also inlines any pre-existing screenshots from earlier runs, so an exact count isn't asserted — just that embedding actually happened).

- [ ] **Step 5: Re-run the whole pipeline once more without re-seeding, to confirm repeatability**

```bash
npm run training:videos
```

Expected: 6 passed again — confirms every write each walkthrough performs (hire, credential edit, sequence attach, score report) is safe to run twice in a row without a DB reset in between, per Design Decision 1.

- [ ] **Step 6: Final commit (if Step 3–5 required any fixes, they've already been committed per-task; this step only applies if verification itself needed a follow-up patch)**

If all prior steps passed with no code changes, there is nothing to commit here — the plan is complete as of Task 13's commit. If a selector or fixture needed adjustment during verification, commit that fix now with a message describing what verification caught, e.g.:

```bash
git add -A
git commit -m "fix(training): correct <selector/fixture> found during end-to-end verification"
```

---

## Self-Review

**1. Spec coverage.** `training/playwright.config.ts` (Task 6) ✓. `training/lib/tour.ts` with `step()` recording captions/screenshots/pauses/deck-copy (Task 5) ✓. Six walkthroughs — coach-core (Task 7), coach-practices (Task 8), admin-hire-compliance (Task 9), admin-sequencing (Task 10), referee-gameday scouted honestly with a substitution noted (Task 11), venue-manager (Task 12) ✓. Output to `training/output/<workflow>/` gitignored (Task 6) ✓. `npm run training:videos` (+ single-workflow arg, Design Decision 5) ✓. Fixture hygiene per Global Constraints (Tasks 1–3, documented per-walkthrough) ✓. `training/README.md` (Task 13) ✓. Final verification task running the whole pipeline and checking `video.webm` + `captions.json` + `>=3` screenshots per output dir (Task 14) ✓.

**2. Placeholder scan.** No "TBD"/"implement later"/"add appropriate error handling" found — every step has literal code or an exact shell command with expected output. The one deliberately-conditional step content (Task 14 Step 6) is conditional on verification outcome, not a placeholder for undone work — it explicitly says "nothing to commit" is the expected/likely outcome.

**3. Type consistency.** `createTour(opts: TourOptions): Tour` / `Tour.step(page, caption, fn, opts?)` / `Tour.finish()` / `registerVideoCapture(testObj, workflow, rootDir?)` (Task 5) are used with exactly these names and argument orders in every walkthrough (Tasks 7–12) and in the unit test (Task 5 Step 1). `TRAINING_USERS.{referee,coach,applicant}` (Task 1 Step 1) matches every later import site's property names (`TRAINING_USERS.referee.email/.password` in Task 11, `TRAINING_USERS.coach.email` and `TRAINING_USERS.applicant.email` in Task 9). `seedTrainingFixtures(db, orgId, seasonId, teamId)`'s signature (fixed in Task 1 Step 3) is called with matching arg order in Task 1 Step 4 and never changed by Tasks 2–3 (they only append to its body, not its signature).
