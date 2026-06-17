# Live League Standings — Design Spec

**Date:** 2026-06-17
**Status:** Design validated in brainstorming (visual companion). Pending spec review → implementation plan.
**Builds on:** the adult-soccer league pages (`/adult/leagues/soccer/<term>`) shipped in PRs #224/#225. The Standings tab there is currently a hardcoded pre-season placeholder.

## Goal

Surface **live league standings and recent results** on the public league pages, computed from real game data, for any sport. Today there is no public standings for regular (non-drop-in) leagues — only coach/player dashboards (which read a drift-prone cache) and a drop-in-only public endpoint.

## Scope decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Data source | **Compute on-the-fly from the `games` table** (status `completed`). Single source of truth; sidesteps the referee-vs-cache sync bug entirely. The denormalized `standings` cache is left as-is (still used by coach/dashboard) and is **not** read or written by this feature. |
| Sport coverage | **Sport-agnostic engine** (a per-sport rules config) with the **public display wired into the soccer season page only** for now. Other sports light up as their pages get built. |
| Tab content | Per-division **ranked table** + **recent-results feed**, with a **division selector**. |
| Fixture generation | **Out of scope.** Games are created via existing admin flows; standings render once a season has completed games (pre-season shows the empty state). |

## Architecture

### A. Standings engine (pure, sport-agnostic) — `src/lib/leagues/standings.ts`

```ts
type TiebreakerKey = "headToHead" | "goalDiff" | "fewestConceded" | "wins" | "scored";
type StandingsRules = {
  pointsWin: number; pointsDraw: number; pointsLoss: number;
  allowDraws: boolean;
  tiebreakers: TiebreakerKey[];
  mercyGoalCap?: number; // cap a single game's goal margin when accumulating GF/GA
};
```

- `SPORT_RULES: Record<string, StandingsRules>` keyed by sport slug. **soccer** = `{ pointsWin: 3, pointsDraw: 1, pointsLoss: 0, allowDraws: true, tiebreakers: ["headToHead","goalDiff","fewestConceded","wins","scored"], mercyGoalCap: 5 }`. A `DEFAULT_RULES` (win/loss, no draws, tiebreak by `["goalDiff","wins","scored"]`) covers sports not yet configured.
- `computeStandings(teams, games, rules)` → ranked `StandingRow[]`:
  `{ teamId, teamName, played, won, drawn, lost, goalsFor, goalsAgainst, goalDiff, points }`.
  - Considers only `status === "completed"` games with both scores non-null.
  - Applies `mercyGoalCap` when accumulating GF/GA (a 10–0 contributes as 5–0).
  - Sorts by `points` desc, then the configured tiebreaker chain; `headToHead` is computed from the games among the tied group.
- Generalizes the existing drop-in `computeStandings` (`src/lib/drop-league/standings.ts`) to regular `games` + configurable rules. Pure and unit-tested; no DB access.

### B. Public endpoint — `src/pages/api/public/league-standings.ts`

`GET /api/public/league-standings?seasonId=<divisionSeasonId>`:

- Tenant-scoped exactly like `/api/public/seasons` (`eq(organizations.id, organization.id)`, active org, `isTest` excluded). Resolve the season → its program → sport slug → `SPORT_RULES[slug] ?? DEFAULT_RULES`.
- Load the division-season's `teams` and its `games`; call `computeStandings`.
- Return `{ season: { id, name, status, startDate }, rules: { allowDraws }, standings: StandingRow[], results: ResultRow[] }` where `results` = completed games newest-first: `{ id, playedAt, homeTeam, awayTeam, homeScore, awayScore }`.
- Cache `Cache-Control: public, max-age=60, s-maxage=60` (live data; short). Returns empty `standings`/`results` (200) when no completed games or on error (never 500s), consistent with the other public endpoints.

### C. Standings tab UI — rewrite the placeholder in `src/components/leagues/season-tabs.tsx`

The season page already passes `divisions` (each carries its `seasonId` + label/level/gender). The tab:

- **Division selector** — chips built from `divisions`, reusing the tier bar-icon from the finder. Defaults to the first division. (When only one division exists, still show it.)
- On select, fetch `/api/public/league-standings?seasonId=<division.seasonId>` (client-side) with a `LoadingSkeleton`.
- **Ranked table**: Pos / Team / P / W / D / L / GF / GA / GD / Pts. The **D column is hidden when `rules.allowDraws` is false**. Leader row subtly emphasized; tabular figures; tiebreaker note in a legend.
- **Recent results**: completed games grouped/listed newest-first, winner emphasized, score chip.
- **States**: no completed games → the existing "Standings begin Week 1 — `<startDate>`" empty state; in-progress/completed → the live/final table. Fetch failure → `ErrorBanner`.
- A small "Live · updated as scores come in" affordance when the season is `active`.

Extract the table + results into a focused `StandingsPanel` component (keeps `season-tabs.tsx` from growing unwieldy).

## Data flow

1. Visitor opens the Standings tab → picks a division.
2. Client GETs `/api/public/league-standings?seasonId=<id>`.
3. Endpoint resolves sport rules, computes standings + results live from `games`/`teams`, returns JSON.
4. Tab renders the table + results, or the empty state if no completed games.

## Standings rules (soccer, from the canonical doc)

`docs/sports/adult-soccer-leagues.md`: 3 pts win / 1 draw / 0 loss; tiebreak head-to-head → goal differential → fewest conceded → most wins → most scored; mercy rule caps a recorded game margin at 5. These map directly onto `SPORT_RULES.soccer`.

## Error / loading / empty handling

- Loading → `LoadingSkeleton` rows in the table area.
- API failure → `ErrorBanner`; the page never blocks (endpoint returns 200 + empty on error).
- No completed games (pre-season / newly active) → `EmptyState` with the Week-1 date.

## Testing

- **Unit** (`tests/unit/standings.test.ts`): `computeStandings` — points math, draws vs no-draws sport, mercy cap, ranking, and each tiebreaker incl. head-to-head; `SPORT_RULES.soccer` shape.
- **API** (`tests/api/public-league-standings.test.ts`): seeded division with completed games returns a ranked table (length ≥ 2) + results; the leader has the most points. **Non-vacuous** (assert ≥1 row).
- **E2E** (`tests/e2e/...` `@critical`): on a season with completed games, the Standings tab shows a table with the expected leader; switching divisions updates it. Tagged `@critical` so the PR gate runs it (per the #224/#225 lesson that `test-full` only runs post-merge).

## Data dependency

Standings only render for a season that has **completed games with scores** — and the existing seeded soccer term (Fall 2026) is `status: "open"` (registration, no games), which must stay that way for the #224/#225 finder/landing tests. So the plan adds a **separate in-progress term** under the **Aspire-org** adult-soccer program (where both brand hosts resolve — see #225): e.g. a `status: "active"` "Summer 2026" division with ~4 `teams` and ~6 `completed` `games` (deterministic scores). This:

- gives the standings API/E2E a live table to assert against (`/adult/leagues/soccer/summer-2026`), and
- leaves Fall 2026 as the `open` registration term (its Standings tab correctly shows the pre-season empty state).

Game rows set `seasonId` (the division-season), `homeTeamId`/`awayTeamId`, `status: "completed"`, `homeScore`/`awayScore`, and `scheduledAt`. Teams set `seasonId` + `name` (+ optional `division` label).

## Out of scope (follow-ups)

- Fixture generation (round-robin scheduler).
- Repairing/deprecating the denormalized `standings` cache + the referee→cache sync gap (display no longer depends on it; the cache cleanup is its own task).
- Standings display for non-soccer sports' public pages (engine is ready; surfaces light up with those pages).
- Player/team profile links from the table.

## Open items to confirm in planning

- Head-to-head tiebreaker exact rule for 3+ way ties (mini-league among tied teams vs pairwise) — pick one and document.
- Whether the division selector should deep-link (`?division=`) for shareable standings URLs (nice-to-have; default no).
