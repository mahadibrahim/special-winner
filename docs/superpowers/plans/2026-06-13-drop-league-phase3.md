# The Drop League — Phase 3 Implementation Plan (teams, weigh-ins, scoring engine, matches, standings)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** The competitive core of the Drop League — operator-assigned **teams**, weekly **weigh-in** entry, the **bonus-goal scoring engine** (brief §6) that turns weigh-in data into match results, **match** entry that runs the engine, and a **standings/league-table** computation. The scoring engine is a **pure, exhaustively unit-tested function** — its correctness decides real results.

**Architecture:** New tables (`drop_teams`, `drop_weigh_ins`, `drop_matches`, `drop_food_diary`; `dropTeamId` on `drop_players`). A pure engine `src/lib/drop-league/scoring.ts` computes a team's Drop Goals for a week from its players' weigh-in + season-to-date state. Coach endpoints record weigh-ins and match pitch scores; the match endpoint invokes the engine, persists the final result, and advances per-player milestone/hat-trick/weeks-lost state. Standings are a query over matches per division.

**Tech Stack:** Astro 5 SSR, Drizzle, Zod, Vitest. Weight is sensitive health data — same handling as P1 (never on public/non-coach responses).

**Brief:** `docs/drop-league-brief.md` §3 (teams of 6-8, weight carry-forward), §5 (match format), §6 (scoring — THE spec below), §7 (weigh-in protocol).

**Phasing:** P1 registration (merged #198) · P2 billing (merged #201) · **P3 (this) scoring core** · P4 player dashboard, food diary UI, nudges, landing, division selector.

---

## THE SCORING ENGINE SPEC (brief §6 — implement exactly; the worked example is the canonical test)

All weights in **grams** (integers). The engine computes Drop Goals for **one team, one week**. Input per player:

```typescript
export interface PlayerWeek {
  playerId: string;
  weekNumber: number;            // 1-based
  currentWeightG: number;
  priorWeekWeightG: number | null;   // null in week 1
  seasonStartWeightG: number;
  isMaintenance: boolean;        // has reached healthy BMI → maintenance scoring
  priorWeeksLost: number;        // count of EARLIER weeks this player lost (for hat-trick)
  hatTricksAwarded: number;      // hat-tricks already awarded this season (cap 4)
  fivePctAwarded: boolean;       // 5% milestone already awarded
  tenPctAwarded: boolean;        // 10% milestone already awarded
  foodDiarySubmitted: boolean;   // submitted + coach-confirmed this week
}
```

Per-player derivations (weekNumber > 1 unless noted):
- `lostVsPrior = priorWeekWeightG != null && currentWeightG < priorWeekWeightG`
- `gainedVsPriorAndStart = priorWeekWeightG != null && currentWeightG > priorWeekWeightG && currentWeightG > seasonStartWeightG`
- `pctLost = (seasonStartWeightG - currentWeightG) / seasonStartWeightG`

Rules (sum into a `TeamBonus` breakdown):
1. **Team weight-loss bonus.** Per player contribution: maintenance player who did NOT gain vs prior (`currentWeightG <= priorWeekWeightG`, or week 1) → **1.0**; non-maintenance player with `lostVsPrior` → **0.5**; else 0. `teamBonusGoals = min(sumOfContributions, floor(rosterSize / 2), 5)`.
2. **Hat-trick** (per player): if `lostVsPrior` and `(priorWeeksLost + 1) % 3 === 0` and `hatTricksAwarded < 4` → **+1** hatTrickGoal (and that player's hat-trick count increments — caller persists).
3. **5% milestone** (per player): if `!fivePctAwarded && pctLost >= 0.05` → **+3** (one-time; caller marks awarded).
4. **10% milestone** (per player): if `!tenPctAwarded && pctLost >= 0.10` → **+3** (one-time; caller marks awarded).
5. **Food diary** (team): `trackers = count(foodDiarySubmitted)`; `foodDiaryGoals = ceil(trackers / 3)` (the brief's "+1 per 1-3 players"). 0 if none.
6. **Weight-gain own goal** (per player): if `gainedVsPriorAndStart` → **−1** ownGoal.

`bonusGoalsTotal = teamBonusGoals + hatTrickGoals + (5%+10% milestone goals) + foodDiaryGoals − ownGoals`.

Engine output:
```typescript
export interface TeamBonus {
  teamBonusGoals: number; hatTrickGoals: number; milestoneGoals: number;
  foodDiaryGoals: number; ownGoals: number; bonusGoalsTotal: number;
  perPlayer: Array<{ playerId: string; lostVsPrior: boolean; hatTrickAwarded: boolean; fivePctNewlyAwarded: boolean; tenPctNewlyAwarded: boolean; ownGoal: boolean }>;
}
export function computeTeamBonus(players: PlayerWeek[]): TeamBonus
```
`finalScore(pitchScore, bonus) = pitchScore + bonus.bonusGoalsTotal`.

**CANONICAL TEST (brief §6 example) — must pass:** Team A, 6 players, pitch 2. 4 of 6 lost (each non-maintenance) → teamBonus 2.0 (4×0.5, cap floor(6/2)=3). One of those reaches 5% → +3 milestone. One player gained vs prior AND start → −1 own goal. No hat-tricks/food diary. ⇒ `bonusGoalsTotal = 2 + 3 − 1 = 4`; `finalScore(2, …) = 6`.

**Ambiguities to FLAG in the PR (founder confirm, don't block):** (a) fractional team bonus when an odd number lose (e.g. 3 lose → 1.5) — engine allows fractional; confirm whether to floor; (b) food-diary `ceil(trackers/3)` cap; (c) exact "maintained" definition for maintenance players. Implement as specified above; these are one-line tweaks once confirmed.

---

## Tasks

### Task 1: Schema — teams, weigh-ins, matches, food diary (+ `dropTeamId` on players); migration 0047
**Files:** Modify `src/lib/db/schema/drop-league.ts`.
- [ ] Add `dropTeamId uuid` (nullable, FK→`drop_teams` set null) to `dropPlayers`. Add tables:
  - `drop_teams` (id, dropSeasonId FK cascade, organizationId, name varchar, color varchar nullable, createdAt). index on dropSeasonId.
  - `drop_weigh_ins` (id, dropPlayerId FK cascade, dropSeasonId, weekNumber int, weighInDate date, weightG int, deltaVsPriorWeekG int nullable, deltaVsSeasonStartG int, recordedByUserId nullable, createdAt). **unique (dropPlayerId, weekNumber).** index dropPlayerId.
  - `drop_matches` (id, dropSeasonId FK cascade, organizationId, weekNumber int, homeTeamId FK, awayTeamId FK, homePitchScore int default 0, awayPitchScore int default 0, homeBonusGoals numeric(4,1) default 0, awayBonusGoals numeric(4,1) default 0, homeFinalScore numeric(4,1) default 0, awayFinalScore numeric(4,1) default 0, status enum ['scheduled','final'] default scheduled, playedAt timestamptz nullable, createdAt). index (dropSeasonId, weekNumber).
  - `drop_food_diary` (id, dropPlayerId FK cascade, weekNumber int, submitted bool default false, coachConfirmed bool default false, createdAt). unique (dropPlayerId, weekNumber).
  Plus `dropMatchStatusEnum`. Type exports for each.
- [ ] `npm run db:generate` → `0047_*.sql`; idempotent enum + `IF NOT EXISTS`; the `ALTER TABLE drop_players ADD COLUMN IF NOT EXISTS drop_team_id` must be present. tsc (ignore `'X 3'` noise). Two commits (schema, migration).

### Task 2: The scoring engine (exhaustive unit TDD) — `src/lib/drop-league/scoring.ts`
**Files:** Create `src/lib/drop-league/scoring.ts`, `tests/unit/drop-scoring.test.ts`.
- [ ] **TDD.** Write `tests/unit/drop-scoring.test.ts` FIRST, covering: the **canonical §6 example** (expect bonusGoalsTotal 4, finalScore(2) 6); team-bonus cap at `floor(roster/2)` and at 5; maintenance player = 1.0; hat-trick at 3rd week-lost + cap 4; 5% and 10% milestones one-time; food-diary `ceil(trackers/3)`; own goal only when gained vs BOTH prior and start; week-1 (no prior) yields no team bonus/own goals. Run → fail. Then implement `computeTeamBonus` + `finalScore` per the SPEC above. Run → all pass. Commit `feat(drop): bonus-goal scoring engine`.

### Task 3: Teams admin endpoint
**Files:** `src/pages/api/admin/drop-teams.ts` (+ test). Super-admin gated (mirror `drop-seasons.ts`). GET (teams for a dropSeasonId, with rosters), POST create team, POST assign player (`{ dropPlayerId, dropTeamId }` → set `dropPlayers.dropTeamId`, validate same season + org). Commit.

### Task 4: Coach weigh-in entry endpoint
**Files:** `src/pages/api/admin/drop-weigh-in.ts` (+ test). Admin/super-admin gated. POST `{ dropPlayerId, weekNumber, weightG }`: validate player in org; compute `deltaVsPriorWeekG` (vs the player's prior-week weigh-in if any) and `deltaVsSeasonStartG` (vs `dropPlayers.seasonStartWeightG`); upsert `drop_weigh_ins` on (player, week); also update `dropPlayers.currentWeightG`. Weight stays server-side (never returned to non-coach). Commit.

### Task 5: Match entry (runs the engine) — `src/pages/api/admin/drop-matches.ts`
**Files:** endpoint (+ test) + a helper `src/lib/drop-league/match-result.ts` that, given a match + week, loads each team's players' `PlayerWeek` data (from weigh-ins + season-to-date state) and calls `computeTeamBonus`. POST `{ dropMatchId, homePitchScore, awayPitchScore }`: build each team's `PlayerWeek[]`, run the engine for both teams, persist `homeBonusGoals/awayBonusGoals/homeFinalScore/awayFinalScore`, set status 'final', and **persist per-player state advances** (increment weeks-lost, hat-tricks, mark milestones — store these on `dropPlayers` via new counter columns OR derive from weigh-ins; SIMPLEST: add `weeksLost int default 0`, `hatTricksAwarded int default 0`, `fivePctAwarded bool`, `tenPctAwarded bool` to `dropPlayers` in Task 1 and update them here). Commit. *(Note: add those 4 counter columns to `dropPlayers` in Task 1's migration.)*

### Task 6: Standings / league table — `src/lib/drop-league/standings.ts` (+ unit test)
**Files:** pure helper computing per-team W/D/L/Pts (3/1/0 on `finalScore` comparison), plus Bonus Goals and Total Goals columns, per division, from final matches. Unit-test with a small fixture. A super-admin GET `/api/admin/drop-standings?dropSeasonId=` returns it. Commit.

## Final verification
- `npx tsc --noEmit` (ignore `'X 3'`) zero new errors; `npx vitest run tests/unit/drop-scoring.test.ts` + standings test pass.
- Push, open PR, **wait for CI green**. PR body: list the flagged scoring ambiguities for founder confirmation; note weight-carry-forward automation + coach/player UI are P3-follow/P4.

## Spec coverage (P3 slice)
Covers §3 teams + §5 match format + **§6 scoring** + §7 weigh-in capture + the league table (§11 "League table — extend"). Deferred to P4: coach dashboard UI, player health dashboard, food-diary submission UI (P3 has the table + the scoring input; the submission UI is P4), automatic season weight carry-forward (a season-transition job), email/SMS nudges, division selector polish.
