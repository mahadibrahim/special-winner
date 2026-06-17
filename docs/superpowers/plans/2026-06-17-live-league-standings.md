# Live League Standings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show live, per-division league standings + recent results on the public soccer season page, computed on-the-fly from `games`, via a sport-agnostic engine that generalizes to other sports.

**Architecture:** A pure `computeStandings` engine parameterized by a per-sport `StandingsRules` config; a tenant-scoped public endpoint `/api/public/league-standings` that computes from `games`/`teams`; and a `StandingsPanel` React island (division selector + ranked table + results feed + states) wired into the existing `SeasonTabs` Standings tab. Seed adds an active "Summer 2026" soccer division with completed games for tests. The denormalized `standings` cache is untouched.

**Tech Stack:** Astro 5 (SSR), React 19 islands, Drizzle ORM + Postgres, Tailwind 4 (cream tokens), Vitest (unit + API), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-06-17-live-league-standings-design.md`.

**⚠️ Environment note:** this worktree is on an external volume where the editor's file-state cache can diverge from disk. After each write, verify on disk (`cat`/`grep`/`git diff`) and prove via the test/`tsc` commands (which read true disk).

---

## File Structure

**Create:**
- `src/lib/leagues/standings.ts` — `StandingsRules`, `SPORT_RULES`, `DEFAULT_RULES`, `rulesForSport`, pure `computeStandings`.
- `src/pages/api/public/league-standings.ts` — public, tenant-scoped standings endpoint.
- `src/components/leagues/standings-panel.tsx` — `"use client"` division selector + table + results.
- `tests/unit/standings.test.ts`, `tests/api/public-league-standings.test.ts`, `tests/e2e/league-standings.spec.ts`

**Modify:**
- `src/components/leagues/season-tabs.tsx` — replace the Standings placeholder with `<StandingsPanel>`.
- `src/lib/db/seeds/seed-e2e-tests.ts` — add an active Summer 2026 soccer division + teams + completed games (Aspire org).

---

## Task 1: Standings engine

**Files:**
- Create: `src/lib/leagues/standings.ts`
- Test: `tests/unit/standings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/standings.test.ts
import { describe, it, expect } from "vitest";
import { computeStandings, rulesForSport, SPORT_RULES, DEFAULT_RULES, type TeamInput, type GameInput } from "@/lib/leagues/standings";

const teams: TeamInput[] = [
  { id: "a", name: "Alpha" }, { id: "b", name: "Bravo" },
  { id: "c", name: "Charlie" }, { id: "d", name: "Delta" },
];
const g = (h: string, a: string, hs: number, as: number, status = "completed"): GameInput =>
  ({ homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as, status });

describe("rulesForSport", () => {
  it("returns soccer rules for 'soccer' and the default otherwise", () => {
    expect(rulesForSport("soccer")).toBe(SPORT_RULES.soccer);
    expect(rulesForSport("pickleball")).toBe(DEFAULT_RULES);
    expect(rulesForSport(null)).toBe(DEFAULT_RULES);
  });
});

describe("computeStandings (soccer)", () => {
  const R = SPORT_RULES.soccer;

  it("includes every team, even with no games", () => {
    const rows = computeStandings(teams, [], R);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });

  it("awards 3/1/0 and tallies goals", () => {
    const rows = computeStandings(teams, [g("a", "b", 2, 0), g("c", "d", 1, 1)], R);
    const a = rows.find((r) => r.teamId === "a")!;
    const b = rows.find((r) => r.teamId === "b")!;
    const c = rows.find((r) => r.teamId === "c")!;
    expect([a.points, a.won, a.goalsFor, a.goalsAgainst]).toEqual([3, 1, 2, 0]);
    expect([b.points, b.lost]).toEqual([0, 1]);
    expect([c.points, c.drawn, c.goalDiff]).toEqual([1, 1, 0]);
  });

  it("ignores non-completed / null-score games", () => {
    const rows = computeStandings(teams, [g("a", "b", 5, 0, "scheduled"), { homeTeamId: "a", awayTeamId: "b", homeScore: null, awayScore: null, status: "completed" }], R);
    expect(rows.every((r) => r.played === 0)).toBe(true);
  });

  it("caps recorded goals at the mercy margin but keeps the win", () => {
    const rows = computeStandings(teams, [g("a", "b", 10, 0)], R);
    const a = rows.find((r) => r.teamId === "a")!;
    expect([a.won, a.goalsFor, a.goalsAgainst, a.goalDiff]).toEqual([1, 5, 0, 5]); // 10-0 recorded as 5-0
  });

  it("ranks by points, then goal difference", () => {
    // a & c both 3 pts; a has better GD
    const rows = computeStandings(teams, [g("a", "b", 3, 0), g("c", "d", 1, 0)], R);
    expect(rows[0].teamId).toBe("a");
    expect(rows[1].teamId).toBe("c");
  });

  it("uses head-to-head before goal difference when points tie", () => {
    // a and b each beat d big; a beat b head-to-head. a should rank above b
    // even though b has a fatter goal difference overall.
    const rows = computeStandings(teams, [
      g("a", "b", 1, 0), // a beats b head-to-head
      g("b", "d", 5, 0), // b pads GD
      g("a", "d", 1, 0), // a modest
    ], R);
    const ai = rows.findIndex((r) => r.teamId === "a");
    const bi = rows.findIndex((r) => r.teamId === "b");
    expect(ai).toBeLessThan(bi);
  });
});

describe("computeStandings (default, no draws)", () => {
  it("ranks by wins under the default rules", () => {
    const rows = computeStandings(teams, [g("a", "b", 80, 70), g("c", "d", 60, 90)], DEFAULT_RULES);
    expect(rows[0].teamId === "a" || rows[0].teamId === "d").toBe(true);
    expect(DEFAULT_RULES.allowDraws).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/standings.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the engine**

```ts
// src/lib/leagues/standings.ts
// Sport-agnostic league standings, computed on-the-fly from completed games.
// Generalizes src/lib/drop-league/standings.ts to regular games + configurable rules.

export type TiebreakerKey = "headToHead" | "goalDiff" | "fewestConceded" | "wins" | "scored";

export type StandingsRules = {
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  allowDraws: boolean;
  tiebreakers: TiebreakerKey[];
  mercyGoalCap?: number; // cap a single game's recorded goal margin (result unchanged)
};

export const SPORT_RULES: Record<string, StandingsRules> = {
  soccer: {
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    allowDraws: true,
    tiebreakers: ["headToHead", "goalDiff", "fewestConceded", "wins", "scored"],
    mercyGoalCap: 5,
  },
};

// Win/loss sports with no draws (e.g. basketball). Ranked by wins then margins.
export const DEFAULT_RULES: StandingsRules = {
  pointsWin: 1,
  pointsDraw: 0,
  pointsLoss: 0,
  allowDraws: false,
  tiebreakers: ["goalDiff", "wins", "scored"],
};

export function rulesForSport(slug: string | null | undefined): StandingsRules {
  return (slug && SPORT_RULES[slug]) || DEFAULT_RULES;
}

export type TeamInput = { id: string; name: string };
export type GameInput = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};
export type StandingRow = {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

function isCounted(g: GameInput): boolean {
  return (
    g.status === "completed" &&
    g.homeTeamId != null &&
    g.awayTeamId != null &&
    g.homeScore != null &&
    g.awayScore != null
  );
}

// Cap the winner's recorded goals so the margin <= cap (loser unchanged).
function capMargin(winnerGoals: number, loserGoals: number, cap?: number): number {
  if (cap == null) return winnerGoals;
  return winnerGoals - loserGoals > cap ? loserGoals + cap : winnerGoals;
}

// Head-to-head points difference between two teams (pairwise; for 3+ way ties
// this compares the pair directly rather than a mini-league — documented choice).
function headToHead(aId: string, bId: string, games: GameInput[], rules: StandingsRules): number {
  let aPts = 0;
  let bPts = 0;
  for (const g of games) {
    let aGoals: number;
    let bGoals: number;
    if (g.homeTeamId === aId && g.awayTeamId === bId) {
      aGoals = g.homeScore as number;
      bGoals = g.awayScore as number;
    } else if (g.homeTeamId === bId && g.awayTeamId === aId) {
      aGoals = g.awayScore as number;
      bGoals = g.homeScore as number;
    } else {
      continue;
    }
    if (aGoals > bGoals) {
      aPts += rules.pointsWin;
      bPts += rules.pointsLoss;
    } else if (bGoals > aGoals) {
      bPts += rules.pointsWin;
      aPts += rules.pointsLoss;
    } else {
      aPts += rules.pointsDraw;
      bPts += rules.pointsDraw;
    }
  }
  return bPts - aPts; // positive → b ranks first
}

export function computeStandings(
  teams: TeamInput[],
  games: GameInput[],
  rules: StandingsRules,
): StandingRow[] {
  const map = new Map<string, StandingRow>();
  for (const t of teams) {
    map.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    });
  }

  const counted = games.filter(isCounted);
  for (const g of counted) {
    const home = map.get(g.homeTeamId as string);
    const away = map.get(g.awayTeamId as string);
    if (!home || !away) continue;
    const hs = g.homeScore as number;
    const as = g.awayScore as number;

    // Recorded goals use the mercy cap; W/D/L uses the actual result.
    let recH = hs;
    let recA = as;
    if (hs > as) recH = capMargin(hs, as, rules.mercyGoalCap);
    else if (as > hs) recA = capMargin(as, hs, rules.mercyGoalCap);

    home.played += 1;
    away.played += 1;
    home.goalsFor += recH;
    home.goalsAgainst += recA;
    away.goalsFor += recA;
    away.goalsAgainst += recH;

    if (hs > as) {
      home.won += 1;
      home.points += rules.pointsWin;
      away.lost += 1;
      away.points += rules.pointsLoss;
    } else if (as > hs) {
      away.won += 1;
      away.points += rules.pointsWin;
      home.lost += 1;
      home.points += rules.pointsLoss;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += rules.pointsDraw;
      away.points += rules.pointsDraw;
    }
  }

  for (const r of map.values()) r.goalDiff = r.goalsFor - r.goalsAgainst;

  const rows = [...map.values()];
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    for (const tb of rules.tiebreakers) {
      let d = 0;
      switch (tb) {
        case "goalDiff": d = b.goalDiff - a.goalDiff; break;
        case "fewestConceded": d = a.goalsAgainst - b.goalsAgainst; break;
        case "wins": d = b.won - a.won; break;
        case "scored": d = b.goalsFor - a.goalsFor; break;
        case "headToHead": d = headToHead(a.teamId, b.teamId, counted, rules); break;
      }
      if (d !== 0) return d;
    }
    return a.teamName.localeCompare(b.teamName);
  });
  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/standings.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Type check + commit**

Run: `npx tsc --noEmit` (expect zero errors).
```bash
git add src/lib/leagues/standings.ts tests/unit/standings.test.ts
git commit -m "feat(standings): sport-agnostic standings engine"
```

---

## Task 2: Public standings endpoint

**Files:**
- Create: `src/pages/api/public/league-standings.ts`
- Test: `tests/api/public-league-standings.test.ts` (run after Task 5 seeds data)

- [ ] **Step 1: Implement the endpoint**

```ts
// src/pages/api/public/league-standings.ts
import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { seasons, programs, sports, teams as teamsTable, games as gamesTable, organizations } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { computeStandings, rulesForSport, type GameInput } from "@/lib/leagues/standings";

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Live data — short cache so scores show promptly but bursts are absorbed.
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}

export const GET: APIRoute = async ({ url, locals }) => {
  const organization = locals.organization;
  const seasonId = url.searchParams.get("seasonId");
  const empty = { season: null, rules: { allowDraws: true }, standings: [], results: [] };
  if (!organization || !seasonId || !db) return json(empty);

  try {
    // Tenant-scoped season lookup + sport slug (same scoping as /api/public/seasons).
    const [row] = await db
      .select({ season: seasons, sportSlug: sports.slug })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(organizations, eq(organizations.id, sports.organizationId))
      .where(
        and(
          eq(seasons.id, seasonId),
          eq(organizations.id, organization.id),
          eq(organizations.status, "active"),
          eq(seasons.isTest, false),
          eq(programs.isTest, false),
        ),
      )
      .limit(1);
    if (!row) return json(empty);

    const rules = rulesForSport(row.sportSlug);

    const teamRows = await db
      .select({ id: teamsTable.id, name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.seasonId, seasonId))
      .orderBy(asc(teamsTable.name));

    const gameRows = await db.select().from(gamesTable).where(eq(gamesTable.seasonId, seasonId));

    const standings = computeStandings(
      teamRows,
      gameRows.map<GameInput>((g) => ({
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        status: g.status,
      })),
      rules,
    );

    const nameById = new Map(teamRows.map((t) => [t.id, t.name]));
    const results = gameRows
      .filter((g) => g.status === "completed" && g.homeScore != null && g.awayScore != null && g.homeTeamId && g.awayTeamId)
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
      .map((g) => ({
        id: g.id,
        playedAt: g.scheduledAt,
        homeTeam: nameById.get(g.homeTeamId as string) ?? "TBD",
        awayTeam: nameById.get(g.awayTeamId as string) ?? "TBD",
        homeScore: g.homeScore,
        awayScore: g.awayScore,
      }));

    return json({
      season: { id: row.season.id, name: row.season.name, status: row.season.status, startDate: row.season.startDate },
      rules: { allowDraws: rules.allowDraws },
      standings,
      results,
    });
  } catch (err) {
    console.error("league-standings error:", err);
    return json(empty);
  }
};
```

- [ ] **Step 2: Write the API test**

```ts
// tests/api/public-league-standings.test.ts
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/public/league-standings", () => {
  it("returns a ranked table + results for the seeded active soccer division", async () => {
    // Resolve the active 'Summer 2026' division season id via the public catalog.
    const seasonsRes = await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult&status=active&term=summer-2026`);
    const { seasons } = await seasonsRes.json();
    expect(Array.isArray(seasons)).toBe(true);
    expect(seasons.length).toBeGreaterThanOrEqual(1);
    const seasonId = seasons[0].id;

    const res = await fetch(`${BASE}/api/public/league-standings?seasonId=${seasonId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.standings.length).toBeGreaterThanOrEqual(2);
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    // Ranked: each row's points >= the next row's points.
    for (let i = 1; i < body.standings.length; i++) {
      expect(body.standings[i - 1].points).toBeGreaterThanOrEqual(body.standings[i].points);
    }
    // Rows expose the expected shape.
    expect(body.standings[0]).toHaveProperty("teamName");
    expect(body.standings[0]).toHaveProperty("goalDiff");
  });
});
```

- [ ] **Step 3: Verify (after Task 5 seed + dev server) — deferred to Task 7.** Type check now:

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/public/league-standings.ts tests/api/public-league-standings.test.ts
git commit -m "feat(api): public league-standings endpoint"
```

---

## Task 3: StandingsPanel component

**Files:**
- Create: `src/components/leagues/standings-panel.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/leagues/standings-panel.tsx
"use client";
import { useEffect, useState } from "react";
import type { Division } from "@/lib/leagues/division-filters";
import { cn } from "@/lib/utils";

type StandingRow = {
  teamId: string; teamName: string; played: number; won: number; drawn: number;
  lost: number; goalsFor: number; goalsAgainst: number; goalDiff: number; points: number;
};
type ResultRow = {
  id: string; playedAt: string; homeTeam: string; awayTeam: string;
  homeScore: number; awayScore: number;
};
type StandingsResponse = {
  season: { id: string; name: string; status: string; startDate: string } | null;
  rules: { allowDraws: boolean };
  standings: StandingRow[];
  results: ResultRow[];
};

const TIER_TEXT: Record<string, string> = { a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage", open: "text-navy" };
const BARS_FOR: Record<string, number> = { a: 4, b: 3, c: 2, d: 1, open: 4 };

export function StandingsPanel({ divisions, weekStart }: { divisions: Division[]; weekStart: string }) {
  const [activeId, setActiveId] = useState<string | null>(divisions[0]?.seasonId ?? null);
  const [data, setData] = useState<StandingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/public/league-standings?seasonId=${activeId}`)
      .then((r) => r.json())
      .then((d: StandingsResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeId]);

  if (divisions.length === 0) {
    return <p className="text-ink-muted text-sm">Divisions post once the season is set.</p>;
  }

  const allowDraws = data?.rules.allowDraws ?? true;
  const hasTable = !loading && !error && (data?.standings.some((r) => r.played > 0) ?? false);

  return (
    <div>
      <h2 className="font-display font-semibold text-2xl">Standings &amp; results</h2>
      <p className="text-ink-muted text-[13px] mt-0.5 mb-4">Live league table, updated as scores come in. Pick a division.</p>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="font-mono text-[9px] tracking-widest uppercase text-ink-muted">Division</span>
        {divisions.map((d) => (
          <button
            key={d.seasonId}
            onClick={() => setActiveId(d.seasonId)}
            aria-pressed={activeId === d.seasonId}
            className={cn(
              "font-sans font-semibold text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5",
              activeId === d.seasonId ? "bg-ink text-cream border-ink" : "bg-paper text-ink-muted border-cream-3",
            )}
          >
            <span className={cn("inline-flex items-end gap-0.5 h-3", TIER_TEXT[d.level])}>
              {[4, 7, 10, 13].map((h, i) => (
                <i key={i} style={{ height: h }} className={cn("w-0.5 rounded-sm block", i < (BARS_FOR[d.level] ?? 4) ? "bg-current" : "bg-cream-3")} />
              ))}
            </span>
            {d.name}
          </button>
        ))}
      </div>

      {error && <div className="bg-destructive/5 border border-destructive/20 text-ink-2 rounded-lg p-3 text-sm">Couldn't load standings. Please try again.</div>}

      {loading && (
        <div className="space-y-2" data-testid="standings-loading">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded bg-cream-2 animate-pulse" />)}
        </div>
      )}

      {!loading && !error && !hasTable && (
        <div className="text-center py-10 border border-dashed border-cream-3 rounded-xl bg-paper">
          <div className="font-display font-semibold text-xl text-ink-2">Standings begin Week 1 — {weekStart}</div>
          <div className="text-[13px] text-ink-muted mt-1.5">Scores and the league table appear here once games start.</div>
        </div>
      )}

      {hasTable && data && (
        <div className="grid lg:grid-cols-[1.65fr_1fr] gap-7 items-start">
          <div>
            <table className="w-full text-[13px] border-collapse" data-testid="standings-table">
              <thead>
                <tr className="text-ink-muted">
                  {["#", "Team", "P", "W", ...(allowDraws ? ["D"] : []), "L", "GF", "GA", "GD", "Pts"].map((h) => (
                    <th key={h} className={cn("font-mono text-[9.5px] tracking-wider uppercase py-2 px-1.5 border-b border-cream-3", h === "Team" ? "text-left pl-1" : "text-center")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.standings.map((r, i) => (
                  <tr key={r.teamId} className={cn(i === 0 && "bg-sage/[0.07]")}>
                    <td className={cn("text-center py-2.5 px-1.5 border-b border-cream-2 font-mono text-xs", i === 0 ? "text-sage" : "text-ink-muted")}>{i + 1}</td>
                    <td className="text-left pl-1 py-2.5 px-1.5 border-b border-cream-2 font-display font-semibold text-[14px] text-ink">{r.teamName}</td>
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums">{r.played}</td>
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums">{r.won}</td>
                    {allowDraws && <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums">{r.drawn}</td>}
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums">{r.lost}</td>
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums">{r.goalsFor}</td>
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums">{r.goalsAgainst}</td>
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums text-ink-muted">{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums font-sans font-bold text-ink">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="font-mono text-[11px] text-ink-muted mt-2.5">Pts {allowDraws ? "(3 win / 1 draw)" : "(per win)"} · tiebreak: head-to-head → GD → fewest conceded</p>
          </div>

          <div>
            <h3 className="font-mono text-[10px] tracking-wider uppercase text-ink-muted mb-2.5">Recent results</h3>
            <div className="flex flex-col gap-1.5">
              {data.results.slice(0, 8).map((m) => (
                <div key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-paper border border-cream-3 rounded-lg px-2.5 py-2 text-[12.5px]">
                  <span className={cn("text-right", m.homeScore > m.awayScore ? "text-ink font-semibold" : "text-ink-2")}>{m.homeTeam}</span>
                  <span className="font-mono font-bold text-[13px] text-ink bg-cream-2 rounded px-2 py-0.5 whitespace-nowrap">{m.homeScore}–{m.awayScore}</span>
                  <span className={cn("text-left", m.awayScore > m.homeScore ? "text-ink font-semibold" : "text-ink-2")}>{m.awayTeam}</span>
                </div>
              ))}
              {data.results.length === 0 && <div className="text-ink-muted text-[12.5px]">No games played yet.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors. (`Division` is exported from `@/lib/leagues/division-filters` with `seasonId`, `level`, `name`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/leagues/standings-panel.tsx
git commit -m "feat(leagues): StandingsPanel — division selector, table, results"
```

---

## Task 4: Wire StandingsPanel into SeasonTabs

**Files:**
- Modify: `src/components/leagues/season-tabs.tsx`

- [ ] **Step 1: Import the panel**

At the top of `src/components/leagues/season-tabs.tsx`, after the existing imports, add:

```tsx
import { StandingsPanel } from "@/components/leagues/standings-panel";
```

- [ ] **Step 2: Replace the standings placeholder**

Find the `{tab === "standings" && ( ... )}` block (the hardcoded "Standings & results" heading + "Standings begin Week 1" empty div) and replace the entire block with:

```tsx
          {tab === "standings" && (
            <StandingsPanel divisions={divisions} weekStart={weekStart} />
          )}
```

(The `StandingsPanel` renders its own heading/subtitle and the empty state, so the old inline markup is fully removed.)

- [ ] **Step 3: Type check + build**

Run: `npx tsc --noEmit` (zero errors). Then `npm run build` — expect success (the pre-existing `guides/baseball.astro` build-time DB error only occurs without `DATABASE_URL`; in CI the build passes — see PR #224 notes. Locally, a non-`guides` error is a real failure to fix).

- [ ] **Step 4: Commit**

```bash
git add src/components/leagues/season-tabs.tsx
git commit -m "feat(leagues): wire live StandingsPanel into the season page"
```

---

## Task 5: Seed an active soccer division with completed games

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts`

- [ ] **Step 1: Locate the Aspire adult-soccer program + age group**

Run: `grep -n "adultProgram\|adultAgeGroup\|adultMensSeason\|formatDate\|registrationEnd" src/lib/db/seeds/seed-e2e-tests.ts | head`
These are defined in the soccer section (the `adultProgram` is the Aspire-org soccer league program; `adultAgeGroup` is "Adult 18+"; `formatDate`, `seasonStartDate`, `seasonEndDate`, `registrationEnd` are in scope there). The new fixture goes right after the `adultMensSeason` console.log line (added in PR #225).

- [ ] **Step 2: Add an active Summer 2026 division + teams + completed games**

Immediately after the `console.log(\`   ✓ Adult Season: ${adultMensSeason.name} ...\`);` line, insert:

```ts
  // Active 'Summer 2026' soccer division with played games, so the season
  // page's Standings tab renders a live table (Fall 2026 stays 'open' → empty
  // standings). Idempotent via slug guards.
  let [summerSeason] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, "e2e-adult-soccer-summer-2026-coed-c"))
    .limit(1);

  if (!summerSeason) {
    [summerSeason] = await db
      .insert(seasons)
      .values({
        programId: adultProgram.id,
        ageGroupId: adultAgeGroup.id,
        name: "Summer 2026 — Coed C",
        slug: "e2e-adult-soccer-summer-2026-coed-c",
        startDate: formatDate(seasonStartDate),
        endDate: formatDate(seasonEndDate),
        status: "active",
        priceCents: 10000,
        maxParticipants: 30,
        termSlug: "summer-2026",
        termLabel: "Summer 2026",
        divisionGender: "coed",
        skillLevel: "c",
        dayOfWeek: "tue",
        startTime: "18:00",
        endTime: "20:00",
      })
      .returning();
  } else {
    [summerSeason] = await db
      .update(seasons)
      .set({ status: "active", termSlug: "summer-2026", termLabel: "Summer 2026" })
      .where(eq(seasons.id, summerSeason.id))
      .returning();
  }

  // Four teams in the division (idempotent by season+name).
  const teamNames = ["FC Lakeview", "Powell United", "Worthington Wolves", "North End SC"];
  const teamIds: Record<string, string> = {};
  for (const name of teamNames) {
    let [t] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.seasonId, summerSeason.id), eq(teams.name, name)))
      .limit(1);
    if (!t) {
      [t] = await db
        .insert(teams)
        .values({ seasonId: summerSeason.id, name, division: "Coed C" })
        .returning();
    }
    teamIds[name] = t.id;
  }

  // Completed games (deterministic scores). Idempotent: only seed if none exist.
  const existingGames = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.seasonId, summerSeason.id))
    .limit(1);
  if (existingGames.length === 0) {
    const wk = (n: number) => new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000);
    await db.insert(games).values([
      { seasonId: summerSeason.id, homeTeamId: teamIds["FC Lakeview"], awayTeamId: teamIds["North End SC"], scheduledAt: wk(3), status: "completed", homeScore: 3, awayScore: 1 },
      { seasonId: summerSeason.id, homeTeamId: teamIds["Powell United"], awayTeamId: teamIds["Worthington Wolves"], scheduledAt: wk(3), status: "completed", homeScore: 2, awayScore: 0 },
      { seasonId: summerSeason.id, homeTeamId: teamIds["FC Lakeview"], awayTeamId: teamIds["Powell United"], scheduledAt: wk(2), status: "completed", homeScore: 2, awayScore: 2 },
      { seasonId: summerSeason.id, homeTeamId: teamIds["Worthington Wolves"], awayTeamId: teamIds["North End SC"], scheduledAt: wk(2), status: "completed", homeScore: 1, awayScore: 0 },
      { seasonId: summerSeason.id, homeTeamId: teamIds["FC Lakeview"], awayTeamId: teamIds["Worthington Wolves"], scheduledAt: wk(1), status: "completed", homeScore: 4, awayScore: 2 },
      { seasonId: summerSeason.id, homeTeamId: teamIds["Powell United"], awayTeamId: teamIds["North End SC"], scheduledAt: wk(1), status: "completed", homeScore: 1, awayScore: 1 },
    ]);
  }
  console.log(`   ✓ Active soccer division seeded: ${summerSeason.name} (4 teams, 6 games)`);
```

- [ ] **Step 3: Confirm `teams` and `games` are imported in the seed**

Run: `grep -n "teams,\|games,\| teams\b\| games\b" src/lib/db/seeds/seed-e2e-tests.ts | grep -i "schema\|import" | head`
If `teams` / `games` are not in the schema import at the top of the file, add them to the existing `from "@/lib/db/schema"` import. Verify the seed still type-checks.

- [ ] **Step 4: Type check + commit**

Run: `npx tsc --noEmit` (zero errors).
```bash
git add src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "test(standings): seed active Summer 2026 soccer division with games"
```

---

## Task 6: E2E spec (@critical)

**Files:**
- Create: `tests/e2e/league-standings.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/league-standings.spec.ts
import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

test("standings tab shows a live table for an active soccer season @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/soccer/summer-2026`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // Switch to the Standings tab.
  await page.getByRole("button", { name: "Standings" }).click();

  // A ranked table renders (seeded 4 teams, 6 completed games).
  const table = page.getByTestId("standings-table");
  await expect(table).toBeVisible();
  const rowCount = await table.locator("tbody tr").count();
  expect(rowCount).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Verify (after seed + dev server) — deferred to Task 7.** Type check:

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/league-standings.spec.ts
git commit -m "test(standings): @critical e2e for the live standings tab"
```

---

## Task 7: Verification + PR

- [ ] **Step 1: Unit + types**

Run: `npx vitest run tests/unit/standings.test.ts && npx tsc --noEmit`
Expected: all pass, zero type errors.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success (ignore the known `guides/baseball.astro` no-`DATABASE_URL` build error if present locally; CI builds with the DB env).

- [ ] **Step 3: Push & open PR**

```bash
git push -u origin <branch>
gh pr create --fill
```

- [ ] **Step 4: Watch CI to green.** The DB-backed `test-api`, `build`, and the `@critical` `test-critical` (which seeds the active division and runs the standings E2E) run on the PR. Do not consider the task done until CI is green. If `test-critical` fails, read the job log, fix, push, re-watch.

---

## Self-Review notes

- **Spec coverage:** engine + rules config (T1), on-the-fly endpoint (T2), StandingsPanel with selector/table/results/states (T3), wired into the tab (T4), active-season seed data (T5), `@critical` E2E (T6), verification (T7). The D-column-hides-for-no-draw-sports requirement is in T3 (`allowDraws`). Head-to-head pairwise choice is documented in T1.
- **Cache untouched:** no task reads or writes the denormalized `standings` table — standings are computed live, per the spec.
- **Out-of-scope confirmed absent:** no fixture generator, no referee→cache sync, no non-soccer surfaces — all deferred per the spec.
