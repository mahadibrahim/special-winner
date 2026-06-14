# The Drop League — Phase 4 Implementation Plan (user-facing: landing, standings, player dashboard, food diary)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** The customer-facing surfaces that close out the Drop League build — the marketing **landing page**, the public **standings/scoreboard**, the authenticated **player dashboard** (their own weight progress, milestones, team standing), and **food-diary submission**. No schema changes (all tables exist from P1-P3).

**Architecture:** Public Astro pages (SSR, BaseLayout) read open Drop seasons + standings server-side (the `leagues.astro` pattern). A public standings endpoint exposes the league table (team-level: W/D/L/Pts + Bonus Goals + Total Goals — **never player weights**). The player dashboard is auth-gated and reads the logged-in user's OWN data via `/api/drop/me` (a player may see their own weight; no one else's). Food-diary submission is an authed player action.

**Tech Stack:** Astro 5 SSR, React 19, Tailwind, Drizzle, Zod, Vitest. Brand tone per `docs/drop-league-brief.md` §10/§13 (tagline "Score goals. Make friends. Drop pounds."; never failing/broken/patient framing; in-program language: Drop Goals, Drop Day, Big Drop). Privacy: weight/BMI never on public or other-player surfaces.

**Reference patterns (read in each task):** `src/pages/drop-league/register.astro` (P1 — brand + SSR data + the registration link target), `src/pages/soccerone/leagues.astro` (SSR DB query in frontmatter), `src/components/programs/season-interest-form.tsx` (client form idiom), `src/lib/drop-league/standings.ts` (P3 standings helper), `src/pages/api/public/drop-seasons.ts` (P1 public endpoint pattern), `src/lib/auth` (how to get `locals.user`).

**Phasing:** P1 registration · P2 billing · P3 scoring core · **P4 (this) user-facing — closes the build.**

---

## Task 1: Public standings endpoint + division-aware standings data
**Files:** Create `src/pages/api/public/drop-standings.ts` (+ test `tests/api/public/drop-standings.test.ts`).
- [ ] `GET ?dropSeasonId=` (or `?division=mens|womens` resolving the current open/active season for that division). Tenant via `locals.organization`. Load the season's `dropTeams` + `status='final'` `dropMatches`, run `computeStandings` (from `@/lib/drop-league/standings`), return `{ standings: [{ teamId, teamName, played, won, drawn, lost, points, bonusGoals, totalGoals }] }`. **No weights, no player data.** `Cache-Control: public, max-age=120`. Mirror the auth-free `drop-seasons.ts` public pattern. Test: returns 200 + array shape; never includes a weight field. Commit `feat(drop): public standings endpoint`.

## Task 2: The Drop League landing page
**Files:** Create `src/pages/drop-league/index.astro`; Create `src/components/drop-league/drop-scoring-explainer.tsx` (a small visual match-card mockup: "Pitch goals + Drop Goals = Final"); optionally `src/components/drop-league/drop-standings-table.tsx` (renders standings with a Men's/Women's toggle).
- [ ] SSR page (`prerender = false`), BaseLayout, Aspire brand. In frontmatter query open Drop seasons per division (`dropSeasons` where org + `status IN ('open','active')`), and (if an active season exists) its standings. Sections per brief §10: **hero** (tagline "Score goals. Make friends. Drop pounds." + subhead "The only soccer league where the scales are part of the game." + CTA "Find your division" → `/drop-league/register`); **the concept** (two columns — how it works / who it's for, BMI 27.5+, men's Mon / women's Wed, all skill levels); **the scoring** (the dual-score explainer component); **divisions** (side-by-side Men's/Women's cards — current season dates + a Register CTA, or "Opening soon"); **standings** (the league table if a season is active, with the division toggle); **FAQ** (BMI requirement, missing a week, no experience needed, what the fee covers, no mid-season join); **footer disclaimer** "Drop League is operated by Aspire Sports. Not affiliated with Man V Fat Ltd." Build to verify. Commit `feat(drop): Drop League landing page`.

## Task 3: Player dashboard + `/api/drop/me`
**Files:** Create `src/pages/api/drop/me.ts` (+ test); Create `src/pages/drop-league/dashboard.astro`; Create `src/components/drop-league/drop-dashboard.tsx`.
- [ ] `GET /api/drop/me`: require `locals.user` (401 else). Find the user's `dropPlayers` row(s) (by `userId`). Return THAT player's: division, season name, their weigh-in history (`dropWeighIns` — weekNumber + weightG + deltas; **the player's own weight, OK to return to themselves**), derived stats (total lost = seasonStart − current, % lost, milestone flags, hat-tricks), their team name + the team's standing row. Return `{ player: {...}, weighIns: [...], stats: {...}, team: {...}, standing: {...} }`. If the user has no Drop player → `{ player: null }`.
- [ ] Dashboard page (`prerender = false`, BaseLayout, auth via middleware `/drop-league/dashboard` — confirm middleware gates it or the page checks `Astro.locals.user` and redirects to `/signin`). Mounts `<DropDashboard client:load>` which fetches `/api/drop/me` and renders: a weight-progress view (a simple inline SVG sparkline OR a週-by-week list of weight + delta — do NOT add a charting dependency), milestone badges (5% / 10% "Big Drop", hat-tricks), current team standing, and the food-diary widget (Task 4). `useHydrationBeacon()`. Tone: celebratory, never clinical. Commit `feat(drop): player dashboard + /api/drop/me`.

## Task 4: Food-diary submission
**Files:** Create `src/pages/api/drop/food-diary.ts` (+ test); add a widget to `drop-dashboard.tsx`.
- [ ] `POST /api/drop/food-diary` `{ weekNumber }`: require `locals.user`; resolve the user's `dropPlayers` row; upsert `dropFoodDiary` on (dropPlayerId, weekNumber) with `submitted: true` (coach confirms separately — `coachConfirmed` stays false until a coach marks it; the scoring engine requires coachConfirmed). Idempotent. Return `{ ok: true }`. (A coach-confirm endpoint is admin follow-up; not in P4.)
- [ ] Add a "Submit this week's food diary" control to the dashboard widget that POSTs for the current week and shows submitted/pending state. Commit `feat(drop): food-diary submission`.

## Final verification
- `npx tsc --noEmit` (ignore `'X 3'` iCloud noise) zero new errors; any unit/api tests pass.
- Push, open PR, **wait for CI green** (build is the key gate for the new pages). PR body: note the Drop League is now end-to-end (registration → billing → weigh-ins/scoring → player dashboard + public landing/standings); coach-confirm-food-diary + coach dashboard UI + email/SMS nudges + weight carry-forward automation remain as operational follow-ups.

## Spec coverage (P4 slice)
Covers brief §10 (landing page), §11 player dashboard + food-diary submission + division selector + league-table display. Deferred (operational/non-blocking): coach dashboard UI, coach food-diary confirmation, email/SMS session-reminder nudges, automatic season weight carry-forward, the public scoreboard "total pounds dropped" social-proof stats (needs season-1 data + consent).
