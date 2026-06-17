# Adult Soccer League Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deep, sport-specific Adult Soccer experience — an evergreen landing page (`/adult/leagues/soccer`) that always points to the current registering term, and per-term season pages (`/adult/leagues/soccer/<term>`) with a tabbed, filterable divisions finder, schedule, standings, rules, and FAQ.

**Architecture:** Two SSR Astro pages built on `BaseLayout`. Division/term metadata is added as additive nullable columns on `seasons` and surfaced through the existing `/api/public/seasons` endpoint. All interactive filtering happens in one React island (`DivisionsFinder`) backed by pure, unit-tested helpers. Evergreen copy (skill levels, rules, FAQ, format facts) lives in a typed content module sourced from `docs/sports/adult-soccer-leagues.md`.

**Tech Stack:** Astro 5 (SSR), React 19 islands, Drizzle ORM + Postgres, Tailwind 4 (editorial cream tokens), Vitest (unit + API), Playwright (E2E).

**Source of truth for all product facts:** `docs/sports/adult-soccer-leagues.md`.

**Decisions locked from the spec's open items:**
- Term modeling = `term_slug` + `term_label` columns on `seasons` (no new table).
- Hero "Register" CTAs scroll to the Divisions finder (the division chooser); per-row Register deep-links to the wizard for that season.
- Full ruleset PDF is deferred — the Rules tab links to the on-page rules + a placeholder `#` until the asset exists.

---

## File Structure

**Create:**
- `src/lib/leagues/adult-soccer-content.ts` — typed evergreen content (skill levels, rules, FAQ, format facts).
- `src/lib/leagues/division-filters.ts` — pure `filterDivisions()` + facet types.
- `src/lib/leagues/terms.ts` — pure `groupByTerm()` + `resolveCurrentTerm()`.
- `src/components/leagues/divisions-finder.tsx` — `"use client"` finder island (ladder + chips + rows).
- `src/components/leagues/season-tabs.tsx` — `"use client"` tabbed body wrapping the finder + static panels.
- `src/components/leagues/level-ladder.tsx` — `"use client"` A/B/C/D ladder (shared by finder + landing).
- `src/pages/adult/leagues/soccer/index.astro` — landing page.
- `src/pages/adult/leagues/soccer/[term].astro` — season page.
- `src/lib/db/migrations/0052_*.sql` — generated migration (made idempotent).
- `tests/unit/division-filters.test.ts`, `tests/unit/terms.test.ts`, `tests/unit/adult-soccer-content.test.ts`
- `tests/api/public-seasons-divisions.test.ts`
- `tests/e2e/adult-soccer-season.spec.ts`

**Modify:**
- `src/lib/db/schema/programs.ts` — add division/term columns to `seasons`.
- `src/pages/api/public/seasons.ts` — accept `term` filter; return new fields.
- `src/pages/adult/leagues.astro` — add a "Soccer league details →" entry into the soccer landing.
- `src/lib/db/seeds/seed-e2e-tests.ts` — backfill division metadata on the soccer fixtures (for E2E + API tests).

---

## Task 1: Add division & term columns to the `seasons` schema

**Files:**
- Modify: `src/lib/db/schema/programs.ts` (seasons table, after `scheduleNotes`)
- Create: `src/lib/db/migrations/0052_*.sql` (generated)

- [ ] **Step 1: Add the columns to the Drizzle schema**

In `src/lib/db/schema/programs.ts`, inside the `seasons` `pgTable({...})` column object, immediately after the `scheduleNotes: text("schedule_notes"),` line, add:

```ts
    // Division & term metadata for the sport-specific league pages.
    // All nullable / additive — legacy seasons (youth catalog, etc.) leave
    // these null and are unaffected. Populated for adult-league seasons.
    termSlug: varchar("term_slug", { length: 64 }),   // 'fall-2026'
    termLabel: varchar("term_label", { length: 64 }), // 'Fall 2026'
    divisionGender: varchar("division_gender", { length: 10 }), // 'coed' | 'mens' | 'womens'
    skillLevel: varchar("skill_level", { length: 8 }), // 'a' | 'b' | 'c' | 'd' | 'open'
    dayOfWeek: varchar("day_of_week", { length: 3 }), // 'mon'..'sun'
    startTime: time("start_time"), // 18:00
    endTime: time("end_time"),     // 20:00
```

- [ ] **Step 2: Ensure `time` is imported**

At the top of `src/lib/db/schema/programs.ts`, confirm `time` is in the `drizzle-orm/pg-core` import list. If absent, add it:

```ts
import { /* …existing… */ time } from "drizzle-orm/pg-core";
```

- [ ] **Step 3: Add an index for term lookups**

In the `seasons` table's index array (the `(table) => [ ... ]` argument), add:

```ts
    index("seasons_term_idx").on(table.termSlug),
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: a new file `src/lib/db/migrations/0052_*.sql` is created containing `ALTER TABLE "seasons" ADD COLUMN ...` statements and the new index.

- [ ] **Step 5: Make the migration idempotent**

Edit the generated `0052_*.sql` so every column add uses `ADD COLUMN IF NOT EXISTS` and the index uses `CREATE INDEX IF NOT EXISTS` (per CLAUDE.md, to survive a drifted DB):

```sql
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "term_slug" varchar(64);
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "term_label" varchar(64);
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "division_gender" varchar(10);
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "skill_level" varchar(8);
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "day_of_week" varchar(3);
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "start_time" time;
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "end_time" time;
CREATE INDEX IF NOT EXISTS "seasons_term_idx" ON "seasons" ("term_slug");
```

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema/programs.ts src/lib/db/migrations/0052_*.sql src/lib/db/migrations/meta
git commit -m "feat(leagues): add division & term metadata columns to seasons"
```

---

## Task 2: Evergreen content module

**Files:**
- Create: `src/lib/leagues/adult-soccer-content.ts`
- Test: `tests/unit/adult-soccer-content.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/adult-soccer-content.test.ts
import { describe, it, expect } from "vitest";
import { SKILL_LEVELS, FORMAT_FACTS, RULE_SECTIONS, FAQ } from "@/lib/leagues/adult-soccer-content";

describe("adult-soccer-content", () => {
  it("defines the four skill levels A–D in order with bar counts", () => {
    expect(SKILL_LEVELS.map((l) => l.key)).toEqual(["a", "b", "c", "d"]);
    expect(SKILL_LEVELS.map((l) => l.bars)).toEqual([4, 3, 2, 1]);
    for (const l of SKILL_LEVELS) expect(l.description.length).toBeGreaterThan(10);
  });
  it("states 7-game season, no playoffs", () => {
    const joined = FORMAT_FACTS.join(" ").toLowerCase();
    expect(joined).toContain("7-game");
    expect(joined).toContain("no playoffs");
  });
  it("has rule sections and FAQ entries", () => {
    expect(RULE_SECTIONS.length).toBeGreaterThanOrEqual(4);
    expect(FAQ.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/adult-soccer-content.test.ts`
Expected: FAIL (cannot find module `@/lib/leagues/adult-soccer-content`).

- [ ] **Step 3: Implement the content module**

```ts
// src/lib/leagues/adult-soccer-content.ts
// Evergreen copy for the Adult Soccer league pages.
// Source of truth: docs/sports/adult-soccer-leagues.md (the published League Guide).

export type SkillLevel = {
  key: "a" | "b" | "c" | "d";
  label: string;
  bars: 1 | 2 | 3 | 4;
  description: string;
};

export const SKILL_LEVELS: SkillLevel[] = [
  { key: "a", label: "Elite", bars: 4, description: "Highest level, very competitive. Played in college or at a premier level for most of your life." },
  { key: "b", label: "Competitive", bars: 3, description: "Moderately competitive. Played in high school or at a select / club level." },
  { key: "c", label: "Rec +", bars: 2, description: "Recreational with some soccer experience — you've played at some point in your life." },
  { key: "d", label: "Beginner", bars: 1, description: "Recreational, little or no experience — new to the game or just getting back into it." },
];

export const FORMAT_FACTS: string[] = [
  "7v7 on the field",
  "7-game season, no playoffs",
  "50 min per game, two halves",
  "Roster up to 14 (7 to play)",
  "Certified referees every match",
  "Walled-arena rules (no offside, the wall is in play)",
];

export type RuleSection = { title: string; items: string[] };

export const RULE_SECTIONS: RuleSection[] = [
  { title: "The game", items: [
    "7v7 including goalkeeper · two 24-min running-clock halves",
    "No offside · all restarts direct, taken within 5 sec",
    "No GK punts (punt = free kick at top of arc)",
    "Free substitution on the fly",
    "Three-line violation · play off the wall · ceiling restart",
  ]},
  { title: "Coed rules", items: [
    "Min. 2 female field players (1 to start); keeper gender-neutral",
    "Females may sub for males, not vice-versa",
    "Safety rule on driving the ball above the waist near a female player",
  ]},
  { title: "Conduct & safety", items: [
    "No slide tackling (GK exception in the box)",
    "Penalty box: yellow = 2 min, red = 5 min + 1-game suspension",
    "Zero tolerance — violent conduct = ejection",
    "Shin guards required · flat / turf shoes only, no cleats",
  ]},
  { title: "Roster & standings", items: [
    "Roster up to 14 (7 to play) · locks after game 3",
    "3 pts win / 1 draw / 0 loss · tiebreak: H2H → goal differential → fewest conceded",
    "Mercy rule: max 5-goal differential recorded",
    "$200 non-refundable deposit · paid in full by game 1",
  ]},
];

export type FaqEntry = { q: string; a: string };

export const FAQ: FaqEntry[] = [
  { q: "Don't have a team?", a: "Register solo in any D or Open division — we place free agents on balanced teams by skill and schedule." },
  { q: "How do I pay?", a: "A $200 non-refundable deposit holds your spot; the balance is due in full by game 1. Early-bird team pricing is $1,000 through the early-bird deadline." },
  { q: "Indoor vs outdoor?", a: "Indoor walled 7v7 — faster, no offside, and the wall keeps the ball in play. Games run rain or shine." },
  { q: "Roster size?", a: "Up to 14 on a roster, 7 on the field. Free substitution on the fly; the roster locks after game 3." },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/adult-soccer-content.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leagues/adult-soccer-content.ts tests/unit/adult-soccer-content.test.ts
git commit -m "feat(leagues): adult-soccer evergreen content module"
```

---

## Task 3: `division-filters.ts` — pure filter logic

**Files:**
- Create: `src/lib/leagues/division-filters.ts`
- Test: `tests/unit/division-filters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/division-filters.test.ts
import { describe, it, expect } from "vitest";
import { filterDivisions, type Division, type DivisionFilters } from "@/lib/leagues/division-filters";

const D = (over: Partial<Division>): Division => ({
  id: "x", name: "Coed C", level: "c", gender: "coed", day: "tue",
  venueSlug: "worthington", venueName: "Worthington", time: "6–8 PM",
  status: "open", spotsLabel: "open", seasonId: "s1", signupModes: ["individual", "team"],
  ...over,
});

const ALL: Division[] = [
  D({ id: "1", level: "b", gender: "coed", day: "mon", venueSlug: "worthington" }),
  D({ id: "2", level: "c", gender: "mens", day: "wed", venueSlug: "worthington" }),
  D({ id: "3", level: "d", gender: "coed", day: "sun", venueSlug: "downtown" }),
  D({ id: "4", level: "open", gender: "womens", day: "wed", venueSlug: "worthington" }),
];

const EMPTY: DivisionFilters = { level: null, gender: null, day: null, venue: null };

describe("filterDivisions", () => {
  it("returns all with no filters", () => {
    expect(filterDivisions(ALL, EMPTY)).toHaveLength(4);
  });
  it("filters by gender", () => {
    expect(filterDivisions(ALL, { ...EMPTY, gender: "mens" }).map((d) => d.id)).toEqual(["2"]);
  });
  it("filters by day and venue together (AND)", () => {
    expect(filterDivisions(ALL, { ...EMPTY, day: "wed", venue: "worthington" }).map((d) => d.id)).toEqual(["2", "4"]);
  });
  it("an explicit level never matches an 'open' division unless level is open", () => {
    expect(filterDivisions(ALL, { ...EMPTY, level: "b" }).map((d) => d.id)).toEqual(["1"]);
  });
  it("'open' divisions are returned for any explicit level filter (all levels welcome)", () => {
    // Product rule: Open divisions accept all levels, so they show under any level filter.
    expect(filterDivisions(ALL, { ...EMPTY, level: "d" }).map((d) => d.id)).toEqual(["3", "4"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/division-filters.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/leagues/division-filters.ts
export type DivisionLevel = "a" | "b" | "c" | "d" | "open";
export type DivisionGender = "coed" | "mens" | "womens";
export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type Division = {
  id: string;
  seasonId: string;
  name: string;
  level: DivisionLevel;
  gender: DivisionGender;
  day: DayKey | null;
  time: string | null;
  venueSlug: string;
  venueName: string;
  status: "open" | "forming" | "active" | "completed";
  spotsLabel: string;
  signupModes: string[];
};

export type DivisionFilters = {
  level: Exclude<DivisionLevel, "open"> | null;
  gender: DivisionGender | null;
  day: DayKey | null;
  venue: string | null;
};

export function filterDivisions(divisions: Division[], f: DivisionFilters): Division[] {
  return divisions.filter((d) => {
    // 'open' divisions accept all levels, so they pass any level filter.
    if (f.level && d.level !== f.level && d.level !== "open") return false;
    if (f.gender && d.gender !== f.gender) return false;
    if (f.day && d.day !== f.day) return false;
    if (f.venue && d.venueSlug !== f.venue) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/division-filters.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leagues/division-filters.ts tests/unit/division-filters.test.ts
git commit -m "feat(leagues): pure division filter logic"
```

---

## Task 4: `terms.ts` — group seasons & resolve current term

**Files:**
- Create: `src/lib/leagues/terms.ts`
- Test: `tests/unit/terms.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/terms.test.ts
import { describe, it, expect } from "vitest";
import { groupByTerm, resolveCurrentTerm, type TermSeason } from "@/lib/leagues/terms";

const S = (over: Partial<TermSeason>): TermSeason => ({
  id: "s", termSlug: "fall-2026", termLabel: "Fall 2026",
  status: "open", startDate: "2026-09-14", ...over,
});

describe("terms", () => {
  it("groups seasons by termSlug preserving label", () => {
    const groups = groupByTerm([S({ id: "a" }), S({ id: "b" }), S({ id: "c", termSlug: "summer-2026", termLabel: "Summer 2026", status: "completed", startDate: "2026-06-01" })]);
    expect(groups.map((g) => g.slug)).toEqual(["fall-2026", "summer-2026"]);
    expect(groups[0].seasons).toHaveLength(2);
  });
  it("resolveCurrentTerm picks the earliest-starting term with an open season", () => {
    const t = resolveCurrentTerm([
      S({ id: "a", termSlug: "winter-2027", termLabel: "Winter 2027", status: "forming", startDate: "2027-01-05" }),
      S({ id: "b", termSlug: "fall-2026", termLabel: "Fall 2026", status: "open", startDate: "2026-09-14" }),
    ]);
    expect(t?.slug).toBe("fall-2026");
  });
  it("falls back to earliest forming term when nothing is open", () => {
    const t = resolveCurrentTerm([S({ id: "a", status: "forming" })]);
    expect(t?.slug).toBe("fall-2026");
  });
  it("returns null for an empty list", () => {
    expect(resolveCurrentTerm([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/terms.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/leagues/terms.ts
export type TermSeason = {
  id: string;
  termSlug: string | null;
  termLabel: string | null;
  status: "open" | "forming" | "active" | "completed";
  startDate: string; // ISO date
};

export type TermGroup<T extends TermSeason = TermSeason> = {
  slug: string;
  label: string;
  earliestStart: string;
  hasOpen: boolean;
  seasons: T[];
};

export function groupByTerm<T extends TermSeason>(seasons: T[]): TermGroup<T>[] {
  const map = new Map<string, TermGroup<T>>();
  for (const s of seasons) {
    if (!s.termSlug) continue;
    const g = map.get(s.termSlug);
    if (g) {
      g.seasons.push(s);
      if (s.startDate < g.earliestStart) g.earliestStart = s.startDate;
      if (s.status === "open") g.hasOpen = true;
    } else {
      map.set(s.termSlug, {
        slug: s.termSlug,
        label: s.termLabel ?? s.termSlug,
        earliestStart: s.startDate,
        hasOpen: s.status === "open",
        seasons: [s],
      });
    }
  }
  return [...map.values()].sort((a, b) => a.earliestStart.localeCompare(b.earliestStart));
}

// Current term = earliest-starting term that has an open season; if none are
// open, the earliest term overall (e.g. a forming term). Null if no terms.
export function resolveCurrentTerm<T extends TermSeason>(seasons: T[]): TermGroup<T> | null {
  const groups = groupByTerm(seasons);
  if (groups.length === 0) return null;
  const open = groups.filter((g) => g.hasOpen);
  return (open.length > 0 ? open : groups)[0];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/terms.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leagues/terms.ts tests/unit/terms.test.ts
git commit -m "feat(leagues): term grouping + current-term resolution"
```

---

## Task 5: Surface division/term fields in the public seasons API

**Files:**
- Modify: `src/pages/api/public/seasons.ts`
- Test: `tests/api/public-seasons-divisions.test.ts`

- [ ] **Step 1: Add the `term` filter**

In `src/pages/api/public/seasons.ts`, after the line `const audience = url.searchParams.get("audience");` add:

```ts
  const term = url.searchParams.get("term");
```

Then, inside the `try` block after the `sportSlug` condition (around the `if (sportSlug) { ... }` block), add:

```ts
    if (term) {
      conditions.push(eq(seasons.termSlug, term));
    }
```

- [ ] **Step 2: Return the new fields**

In the `formatted = rows.map((r) => { ... return { ... } })` object, after the `scheduleNotes: r.season.scheduleNotes,` line add:

```ts
        termSlug: r.season.termSlug,
        termLabel: r.season.termLabel,
        divisionGender: r.season.divisionGender,
        skillLevel: r.season.skillLevel,
        dayOfWeek: r.season.dayOfWeek,
        startTime: r.season.startTime,
        endTime: r.season.endTime,
```

- [ ] **Step 3: Write the API test**

```ts
// tests/api/public-seasons-divisions.test.ts
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/public/seasons division metadata", () => {
  it("returns division/term fields and filters by term", async () => {
    const res = await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult&term=fall-2026`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.seasons)).toBe(true);
    // Every returned season carries the new keys (may be null on legacy rows,
    // but the term filter guarantees these are adult-soccer Fall rows).
    for (const s of body.seasons) {
      expect(s).toHaveProperty("termSlug", "fall-2026");
      expect(s).toHaveProperty("skillLevel");
      expect(s).toHaveProperty("divisionGender");
      expect(s).toHaveProperty("dayOfWeek");
    }
  });
});
```

- [ ] **Step 4: Run it (dev server + seed must be up)**

Run (with `npm run dev` running and `npm run db:seed:e2e` applied — see Task 6):
`TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public-seasons-divisions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/public/seasons.ts tests/api/public-seasons-divisions.test.ts
git commit -m "feat(api): surface division & term metadata on public seasons"
```

---

## Task 6: Backfill division metadata on the soccer E2E fixtures

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts` (the SoccerOne / adult-soccer season inserts)

- [ ] **Step 1: Locate the adult-soccer season fixtures**

Run: `grep -n "Adult Co" src/lib/db/seeds/seed-e2e-tests.ts; grep -n "soccer" src/lib/db/seeds/seed-e2e-tests.ts | head`
Expected: the line(s) inserting the SoccerOne adult coed season (`priceCents: 18000` per the source-of-truth research).

- [ ] **Step 2: Add division/term fields to at least two soccer season inserts**

On the existing adult-soccer season insert object(s), add the new fields so the finder has data to render and tests have rows to assert. Example for the existing "Adult Co-Ed" season — extend its insert values with:

```ts
        termSlug: "fall-2026",
        termLabel: "Fall 2026",
        divisionGender: "coed",
        skillLevel: "c",
        dayOfWeek: "tue",
        startTime: "18:00",
        endTime: "20:00",
        status: "open",
```

Add a second contrasting fixture (duplicate the insert with new id/slug/name) for a different facet so filters are exercised:

```ts
        // second division so the finder filters have >1 row
        name: "Fall 2026 — Men's D",
        slug: "fall-2026-mens-d",
        termSlug: "fall-2026",
        termLabel: "Fall 2026",
        divisionGender: "mens",
        skillLevel: "d",
        dayOfWeek: "mon",
        startTime: "20:00",
        endTime: "22:00",
        status: "open",
```

- [ ] **Step 3: Re-seed**

Run: `npm run db:seed:e2e`
Expected: completes without error (idempotent upsert).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "test(leagues): seed adult-soccer division metadata for Fall 2026"
```

---

## Task 7: `LevelLadder` component (shared)

**Files:**
- Create: `src/components/leagues/level-ladder.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/components/leagues/level-ladder.tsx
"use client";
import { SKILL_LEVELS, type SkillLevel } from "@/lib/leagues/adult-soccer-content";
import { cn } from "@/lib/utils";

const TIER_TEXT: Record<SkillLevel["key"], string> = {
  a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage",
};

function Bars({ filled, className }: { filled: number; className?: string }) {
  const heights = [6, 10, 14, 18];
  return (
    <span className={cn("inline-flex items-end gap-0.5 h-[18px]", className)}>
      {heights.map((h, i) => (
        <i key={i} style={{ height: h }}
           className={cn("w-1 rounded-sm block", i < filled ? "bg-current" : "bg-cream-3")} />
      ))}
    </span>
  );
}

export function LevelLadder({
  selected, onSelect,
}: { selected?: SkillLevel["key"] | null; onSelect?: (k: SkillLevel["key"]) => void }) {
  const interactive = typeof onSelect === "function";
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      {SKILL_LEVELS.map((lvl) => (
        <button
          key={lvl.key}
          type="button"
          aria-pressed={interactive ? selected === lvl.key : undefined}
          onClick={interactive ? () => onSelect!(lvl.key) : undefined}
          className={cn(
            "text-left bg-paper border border-cream-3 rounded-xl p-3 transition",
            TIER_TEXT[lvl.key],
            interactive && "cursor-pointer hover:border-ink-muted",
            interactive && selected === lvl.key && "border-ink shadow-[inset_0_0_0_2px] shadow-ink",
          )}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Bars filled={lvl.bars} />
            <span className="font-display italic text-xl">{lvl.key.toUpperCase()}</span>
            <span className="ml-auto font-mono text-[9px] tracking-widest uppercase">{lvl.label}</span>
          </div>
          <p className="text-[11.5px] leading-snug text-ink-2">{lvl.description}</p>
        </button>
      ))}
    </div>
  );
}

export { Bars };
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors. (If `cn` is not at `@/lib/utils`, run `grep -rn "export.*function cn" src/lib` and fix the import path.)

- [ ] **Step 3: Commit**

```bash
git add src/components/leagues/level-ladder.tsx
git commit -m "feat(leagues): shared A/B/C/D level ladder component"
```

---

## Task 8: `DivisionsFinder` island

**Files:**
- Create: `src/components/leagues/divisions-finder.tsx`

- [ ] **Step 1: Implement the finder**

```tsx
// src/components/leagues/divisions-finder.tsx
"use client";
import { useState } from "react";
import { filterDivisions, type Division, type DivisionFilters, type DayKey, type DivisionGender } from "@/lib/leagues/division-filters";
import { LevelLadder, Bars } from "@/components/leagues/level-ladder";
import { cn } from "@/lib/utils";

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" }, { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" }, { key: "fri", label: "Fri" }, { key: "sun", label: "Sun" },
];
const GENDERS: { key: DivisionGender; label: string }[] = [
  { key: "coed", label: "Coed" }, { key: "mens", label: "Men's" }, { key: "womens", label: "Women's" },
];
const BARS_FOR: Record<string, number> = { a: 4, b: 3, c: 2, d: 1, open: 4 };
const TIER_TEXT: Record<string, string> = { a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage", open: "text-navy" };

function registerHref(d: Division): string {
  if (d.status === "forming") return `/api/public/season-interest?seasonId=${d.seasonId}`;
  return d.signupModes.includes("team") ? `/register/team/${d.seasonId}` : `/register/${d.seasonId}`;
}

export function DivisionsFinder({ divisions, venues }: {
  divisions: Division[];
  venues: { slug: string; label: string }[];
}) {
  const [f, setF] = useState<DivisionFilters>({ level: null, gender: null, day: null, venue: null });
  const results = filterDivisions(divisions, f);
  const toggle = <K extends keyof DivisionFilters>(k: K, v: DivisionFilters[K]) =>
    setF((prev) => ({ ...prev, [k]: prev[k] === v ? null : v }));
  const clear = () => setF({ level: null, gender: null, day: null, venue: null });

  const chip = (active: boolean) =>
    cn("font-sans font-semibold text-[11px] px-2.5 py-1.5 rounded-full border cursor-pointer",
      active ? "bg-ink text-cream border-ink" : "bg-paper text-ink-muted border-cream-3");

  return (
    <div>
      <div className="mb-4">
        <LevelLadder selected={f.level} onSelect={(k) => k !== "open" && toggle("level", k as DivisionFilters["level"])} />
      </div>

      <div className="flex flex-wrap gap-4 items-center p-3 bg-cream-2 rounded-xl">
        <FilterGroup label="Format">
          {GENDERS.map((g) => (
            <button key={g.key} className={chip(f.gender === g.key)} onClick={() => toggle("gender", g.key)}>{g.label}</button>
          ))}
        </FilterGroup>
        <FilterGroup label="Night">
          {DAYS.map((d) => (
            <button key={d.key} className={chip(f.day === d.key)} onClick={() => toggle("day", d.key)}>{d.label}</button>
          ))}
        </FilterGroup>
        <FilterGroup label="Venue">
          {venues.map((v) => (
            <button key={v.slug} className={chip(f.venue === v.slug)} onClick={() => toggle("venue", v.slug)}>{v.label}</button>
          ))}
        </FilterGroup>
      </div>

      <p className="font-mono text-[11px] text-ink-muted my-3">
        <span data-testid="result-count">{results.length}</span> divisions open
        <button className="text-primary ml-2" onClick={clear}>· clear filters</button>
      </p>

      {results.length === 0 ? (
        <div className="p-7 text-center text-ink-muted text-sm border border-dashed border-cream-3 rounded-xl">
          No divisions match those filters — try clearing one.{" "}
          <a className="text-primary font-semibold" href="#interest">Join the interest list →</a>
        </div>
      ) : (
        <div className="border-t border-cream-3" data-testid="division-rows">
          {results.map((d) => (
            <div key={d.id} className="grid grid-cols-[30px_1.6fr_1.2fr_0.9fr_0.8fr_auto] items-center gap-3.5 py-3 px-2 border-b border-cream-2 hover:bg-paper">
              <Bars filled={BARS_FOR[d.level]} className={TIER_TEXT[d.level]} />
              <div>
                <div className="font-display font-semibold text-base">{d.name}</div>
                <div className="font-mono text-[10.5px] tracking-wide uppercase text-ink-muted mt-0.5">
                  {d.gender === "mens" ? "Men's" : d.gender === "womens" ? "Women's" : "Coed"} · Level {d.level.toUpperCase()}
                </div>
              </div>
              <div className="text-[13px] text-ink-2">{d.day ? <b className="text-ink">{labelDay(d.day)}</b> : null} {d.time ? `· ${d.time}` : ""}</div>
              <div className="text-xs text-ink-muted">{d.venueName}</div>
              <div className={cn("font-mono text-[11px] font-semibold", d.status === "forming" ? "text-ochre" : "text-sage")}>{d.spotsLabel}</div>
              <a href={registerHref(d)}
                 className={cn("font-sans font-semibold text-xs px-3.5 py-2 rounded-md whitespace-nowrap",
                   d.status === "forming" ? "text-primary border border-primary" : "text-cream bg-primary")}>
                {d.status === "forming" ? "Notify me" : "Register →"}
              </a>
            </div>
          ))}
        </div>
      )}
      <p className="font-mono text-[10px] tracking-wide uppercase text-ink-muted mt-3.5">
        Age divisions · 30+ and 40+ also available at Worthington
      </p>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[9px] tracking-widest uppercase text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

function labelDay(d: string) {
  return ({ mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" } as Record<string, string>)[d] ?? d;
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/leagues/divisions-finder.tsx
git commit -m "feat(leagues): interactive divisions finder island"
```

---

## Task 9: `SeasonTabs` island (tabbed body)

**Files:**
- Create: `src/components/leagues/season-tabs.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/leagues/season-tabs.tsx
"use client";
import { useState } from "react";
import { DivisionsFinder } from "@/components/leagues/divisions-finder";
import type { Division } from "@/lib/leagues/division-filters";
import { RULE_SECTIONS, FAQ } from "@/lib/leagues/adult-soccer-content";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { cn } from "@/lib/utils";

type Tab = "divisions" | "schedule" | "standings" | "rules" | "faq";
const TABS: { key: Tab; label: string }[] = [
  { key: "divisions", label: "Divisions & Times" }, { key: "schedule", label: "Schedule" },
  { key: "standings", label: "Standings" }, { key: "rules", label: "Rules" }, { key: "faq", label: "FAQ" },
];

export function SeasonTabs({ divisions, venues, weekStart, scheduleNote }: {
  divisions: Division[];
  venues: { slug: string; label: string }[];
  weekStart: string;       // e.g. "Sep 14"
  scheduleNote: string;    // venue/day summary
}) {
  useHydrationBeacon();
  const [tab, setTab] = useState<Tab>("divisions");
  return (
    <div>
      <div className="bg-navy-deep px-9">
        <div className="max-w-[1080px] mx-auto flex gap-0.5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              aria-selected={tab === t.key}
              className={cn("font-mono text-xs tracking-wider uppercase px-4 py-3.5 cursor-pointer relative top-px",
                tab === t.key ? "bg-cream text-ink rounded-t-lg" : "text-cream/70")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-cream min-h-[340px] px-9 py-6">
        <div className="max-w-[1080px] mx-auto">
          {tab === "divisions" && (
            <>
              <h2 className="font-display font-semibold text-2xl">Find your level &amp; register</h2>
              <p className="text-ink-muted text-[13px] mt-0.5 mb-4">Pick your level, then narrow by format, night, or venue. Open divisions register on the spot.</p>
              <DivisionsFinder divisions={divisions} venues={venues} />
            </>
          )}
          {tab === "schedule" && (
            <>
              <h2 className="font-display font-semibold text-2xl">When games run</h2>
              <p className="text-ink-muted text-[13px] mt-0.5 mb-4">{scheduleNote}</p>
              <ScheduleTable divisions={divisions} />
            </>
          )}
          {tab === "standings" && (
            <>
              <h2 className="font-display font-semibold text-2xl">Standings &amp; results</h2>
              <p className="text-ink-muted text-[13px] mt-0.5 mb-4">Live once the season kicks off. Past seasons keep their final tables.</p>
              <div className="text-center py-10 border border-dashed border-cream-3 rounded-xl bg-paper">
                <div className="font-display font-semibold text-xl text-ink-2">Standings begin Week 1 — {weekStart}</div>
                <div className="text-[13px] text-ink-muted mt-1.5">Scores and the league table appear here weekly once games start.</div>
              </div>
            </>
          )}
          {tab === "rules" && (
            <>
              <h2 className="font-display font-semibold text-2xl">Rules &amp; regulations</h2>
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-ink-2 my-4">
                <strong>Walled-arena 7v7.</strong> All Aspire fields have boards — no offside, the wall is in play.
              </div>
              <div className="grid md:grid-cols-2 gap-x-7 gap-y-3.5">
                {RULE_SECTIONS.map((s) => (
                  <div key={s.title}>
                    <h3 className="font-mono text-[13px] tracking-wider uppercase text-primary mb-2 pb-1.5 border-b border-cream-3">{s.title}</h3>
                    <ul className="space-y-1">
                      {s.items.map((it) => <li key={it} className="text-[12.5px] text-ink-2 leading-snug pl-4 relative before:content-['›'] before:absolute before:left-0 before:text-primary before:font-bold">{it}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
              <a href="#" className="inline-block mt-4 font-semibold text-xs text-primary">Download the full ruleset (PDF) →</a>
            </>
          )}
          {tab === "faq" && (
            <>
              <h2 className="font-display font-semibold text-2xl">Common questions</h2>
              <div className="grid md:grid-cols-2 gap-x-7 gap-y-3.5 mt-4">
                {FAQ.map((e) => (
                  <div key={e.q}>
                    <h3 className="font-mono text-[13px] tracking-wider uppercase text-primary mb-2 pb-1.5 border-b border-cream-3">{e.q}</h3>
                    <p className="text-[12.5px] text-ink-2 leading-snug">{e.a}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ScheduleTable({ divisions }: { divisions: Division[] }) {
  // Group open divisions by day for a compact weekly view.
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const byDay = order
    .map((day) => ({ day, items: divisions.filter((d) => d.day === day) }))
    .filter((r) => r.items.length > 0);
  if (byDay.length === 0) return <p className="text-ink-muted text-sm">Schedule posts once divisions are set.</p>;
  return (
    <table className="w-full text-[13px] border-collapse">
      <thead><tr><th className="text-left font-mono text-[10px] tracking-widest uppercase text-ink-muted py-2 px-2.5 border-b border-cream-3">Night</th><th className="text-left font-mono text-[10px] tracking-widest uppercase text-ink-muted py-2 px-2.5 border-b border-cream-3">Divisions</th></tr></thead>
      <tbody>
        {byDay.map((r) => (
          <tr key={r.day}>
            <td className="py-2.5 px-2.5 border-b border-cream-2 font-semibold text-ink uppercase">{r.day}</td>
            <td className="py-2.5 px-2.5 border-b border-cream-2 text-ink-2">{r.items.map((d) => `${d.name}${d.time ? ` (${d.time})` : ""}`).join(" · ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Verify `useHydrationBeacon` path**

Run: `grep -rn "useHydrationBeacon" src/lib/hooks/`
Expected: confirms `@/lib/hooks/use-hydration-beacon`. If different, fix the import.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/leagues/season-tabs.tsx
git commit -m "feat(leagues): tabbed season body island"
```

---

## Task 10: Season page (`/adult/leagues/soccer/[term].astro`)

**Files:**
- Create: `src/pages/adult/leagues/soccer/[term].astro`

- [ ] **Step 1: Implement the page**

```astro
---
// Per-term Adult Soccer season page. SSR: reads live seasons + per-host brand.
export const prerender = false;
import BaseLayout from "@/layouts/BaseLayout.astro";
import { SeasonTabs } from "@/components/leagues/season-tabs";
import type { Division } from "@/lib/leagues/division-filters";
import { FORMAT_FACTS } from "@/lib/leagues/adult-soccer-content";

const { term } = Astro.params;
const origin = Astro.url.origin;
const res = await fetch(`${origin}/api/public/seasons?sport=soccer&audience=adult&term=${term}`, {
  headers: { cookie: Astro.request.headers.get("cookie") ?? "" },
});
const data = res.ok ? await res.json() : { seasons: [] };
const seasons: any[] = data.seasons ?? [];

if (seasons.length === 0) {
  return Astro.redirect("/adult/leagues/soccer");
}

const termLabel = seasons[0].termLabel ?? "This season";
const statusRank = (s: string) => (s === "open" ? 0 : s === "active" ? 1 : s === "forming" ? 2 : 3);
const heroStatus = [...seasons].sort((a, b) => statusRank(a.status) - statusRank(b.status))[0].status;
const startDate = seasons.map((s) => s.startDate).sort()[0];
const endDate = seasons.map((s) => s.endDate).sort().at(-1);

const venuesMap = new Map<string, string>();
for (const s of seasons) venuesMap.set(s.location.slug, s.location.name);
const venues = [...venuesMap].map(([slug, label]) => ({ slug, label }));

const divisions: Division[] = seasons.map((s) => ({
  id: s.id,
  seasonId: s.id,
  name: s.name,
  level: (s.skillLevel ?? "open") as Division["level"],
  gender: (s.divisionGender ?? "coed") as Division["gender"],
  day: s.dayOfWeek ?? null,
  time: s.startTime && s.endTime ? `${fmtTime(s.startTime)}–${fmtTime(s.endTime)}` : null,
  venueSlug: s.location.slug,
  venueName: s.location.name,
  status: s.status,
  spotsLabel: s.status === "forming" ? "forming" : s.spotsLeft != null ? `${s.spotsLeft} left` : "open",
  signupModes: s.signupModes ?? ["individual"],
}));

function fmtTime(t: string) {
  // "18:00" -> "6 PM"
  const [h] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${ampm}`;
}
const STATUS_LABEL: Record<string, string> = { open: "Registration Open", active: "In Progress", forming: "Forming", completed: "Complete" };
const heroPhoto = "https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&w=1600&q=60";
---

<BaseLayout
  title={`${termLabel} Adult Soccer Leagues — Aspire Sports`}
  description={`Register for ${termLabel} adult indoor 7v7 soccer leagues. ${FORMAT_FACTS.slice(0,3).join(" · ")}.`}
>
  <main id="main-content">
    <section
      class="relative text-cream pt-16 px-9 bg-cover bg-center"
      style={`background-image:linear-gradient(180deg,oklch(0.18 0.07 262/0.78),oklch(0.18 0.07 262/0.93)),linear-gradient(100deg,oklch(0.18 0.07 262/0.95),oklch(0.18 0.07 262/0.4)),url('${heroPhoto}')`}
    >
      <div class="max-w-[1080px] mx-auto pb-6">
        <span class="inline-flex items-center gap-1.5 bg-primary/20 border border-primary/60 text-primary-foreground rounded-full px-3 py-1.5 font-mono text-[10px] tracking-widest uppercase">
          {STATUS_LABEL[heroStatus] ?? heroStatus}
        </span>
        <h1 class="font-display font-semibold text-5xl md:text-6xl tracking-tight mt-3 mb-1.5">{termLabel} · Adult Soccer</h1>
        <p class="font-mono text-[12.5px] text-cream/85 mb-4">Indoor 7v7 · {startDate} – {endDate} · 7-game season, no playoffs · {venues.length} venues · {divisions.length} divisions</p>
        <div class="flex flex-wrap gap-3 items-center pb-1">
          <a href="#main-content" class="font-sans font-semibold text-[13px] bg-primary-bright text-ink px-5 py-3 rounded-md" data-testid="hero-register">Register a team →</a>
          <a href="#main-content" class="font-sans font-semibold text-[13px] border border-cream/40 text-cream px-5 py-3 rounded-md">Join solo</a>
        </div>
      </div>
    </section>

    <SeasonTabs
      client:load
      divisions={divisions}
      venues={venues}
      weekStart={startDate}
      scheduleNote="One game per week per team. Exact slots assigned after rosters lock."
    />
  </main>
</BaseLayout>
```

- [ ] **Step 2: Build to catch SSR/prerender issues**

Run: `npm run build`
Expected: builds without error (the `Astro.request.headers` warning for prerendered pages is expected noise per CLAUDE.md; this page is SSR so it's fine).

- [ ] **Step 3: Manually verify**

Run `npm run dev`, then load `http://localhost:4321/adult/leagues/soccer/fall-2026`.
Expected: hero renders with `Fall 2026 · Adult Soccer`, tabs switch, the finder lists the seeded divisions and filters work.

- [ ] **Step 4: Commit**

```bash
git add src/pages/adult/leagues/soccer/\[term\].astro
git commit -m "feat(leagues): per-term adult soccer season page"
```

---

## Task 11: Landing page (`/adult/leagues/soccer/index.astro`)

**Files:**
- Create: `src/pages/adult/leagues/soccer/index.astro`

- [ ] **Step 1: Implement**

```astro
---
// Evergreen Adult Soccer landing. SSR: resolves the current registering term.
export const prerender = false;
import BaseLayout from "@/layouts/BaseLayout.astro";
import { LevelLadder } from "@/components/leagues/level-ladder";
import { FORMAT_FACTS, RULE_SECTIONS } from "@/lib/leagues/adult-soccer-content";
import { resolveCurrentTerm, type TermSeason } from "@/lib/leagues/terms";

const origin = Astro.url.origin;
const res = await fetch(`${origin}/api/public/seasons?sport=soccer&audience=adult`, {
  headers: { cookie: Astro.request.headers.get("cookie") ?? "" },
});
const data = res.ok ? await res.json() : { seasons: [] };
const seasons: any[] = data.seasons ?? [];
const termSeasons: TermSeason[] = seasons
  .filter((s) => s.termSlug)
  .map((s) => ({ id: s.id, termSlug: s.termSlug, termLabel: s.termLabel, status: s.status, startDate: s.startDate }));
const current = resolveCurrentTerm(termSeasons);
const heroPhoto = "https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&w=1600&q=60";
---

<BaseLayout
  title="Adult Soccer Leagues — Aspire Sports"
  description="Coed, men's and women's indoor 7v7 soccer leagues in central Ohio. Rec to competitive, all skill levels."
>
  <main id="main-content">
    <section class="relative text-cream pt-16 px-9 bg-cover bg-center"
      style={`background-image:linear-gradient(180deg,oklch(0.18 0.07 262/0.8),oklch(0.18 0.07 262/0.94)),url('${heroPhoto}')`}>
      <div class="max-w-[1080px] mx-auto pb-8">
        {current && (
          <a href={`/adult/leagues/soccer/${current.slug}`} class="flex items-center justify-between gap-3 bg-primary text-cream rounded-lg px-4 py-3 mb-5" data-testid="now-registering">
            <span><span class="font-mono text-[10px] tracking-widest uppercase opacity-85">Now Registering</span><br/><span class="font-display font-semibold text-lg">{current.label}</span></span>
            <span class="font-mono text-[11px] tracking-wider uppercase bg-cream text-primary px-3 py-2 rounded">See season →</span>
          </a>
        )}
        <h1 class="font-display font-semibold text-5xl md:text-6xl tracking-tight mb-2">Adult soccer<br/>at Aspire.</h1>
        <p class="text-cream/85 max-w-md mb-2">Coed, men's &amp; women's 7v7. Rec to competitive, indoor, across central-Ohio venues.</p>
        <p class="font-mono text-[12px] text-cream/70 pb-1">{FORMAT_FACTS.slice(0, 4).join(" · ")}</p>
      </div>
    </section>

    <section class="bg-cream px-9 py-10">
      <div class="max-w-[1080px] mx-auto">
        <p class="font-mono text-[11px] tracking-widest uppercase text-ink-muted mb-3">Find your level</p>
        <LevelLadder client:visible />

        <p class="font-mono text-[11px] tracking-widest uppercase text-ink-muted mt-10 mb-3">How it works</p>
        <ul class="grid md:grid-cols-2 gap-x-8 gap-y-1.5">
          {FORMAT_FACTS.map((f) => <li class="text-ink-2 text-sm pl-4 relative before:content-['›'] before:absolute before:left-0 before:text-primary before:font-bold">{f}</li>)}
        </ul>

        <p class="font-mono text-[11px] tracking-widest uppercase text-ink-muted mt-10 mb-3">The rules, in brief</p>
        <div class="grid md:grid-cols-2 gap-x-8 gap-y-4">
          {RULE_SECTIONS.map((s) => (
            <div>
              <h3 class="font-display font-semibold text-lg mb-1">{s.title}</h3>
              <ul class="space-y-1">{s.items.slice(0,3).map((it) => <li class="text-[13px] text-ink-2 leading-snug">· {it}</li>)}</ul>
            </div>
          ))}
        </div>
        {current && (
          <div class="mt-10">
            <a href={`/adult/leagues/soccer/${current.slug}`} class="inline-flex bg-ink text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase">See {current.label} divisions →</a>
          </div>
        )}
      </div>
    </section>
  </main>
</BaseLayout>
```

- [ ] **Step 2: Build + manual check**

Run: `npm run build` (expected: success). Then `npm run dev` and load `http://localhost:4321/adult/leagues/soccer`.
Expected: "Now Registering — Fall 2026" banner links to the season page; level ladder + format facts + rules render.

- [ ] **Step 3: Commit**

```bash
git add src/pages/adult/leagues/soccer/index.astro
git commit -m "feat(leagues): adult soccer evergreen landing page"
```

---

## Task 12: Entry point from the adult-leagues catalog

**Files:**
- Modify: `src/pages/adult/leagues.astro`

- [ ] **Step 1: Add a soccer-details link**

Open `src/pages/adult/leagues.astro`, find the hero/intro block (the section before the `CategoryFinder` island). Add a prominent link into the soccer landing immediately after the page's intro paragraph:

```astro
<a href="/adult/leagues/soccer"
   class="inline-flex items-center gap-2 mt-4 text-primary font-medium hover:underline">
  Soccer league details — divisions, schedule &amp; rules →
</a>
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/pages/adult/leagues.astro
git commit -m "feat(leagues): link adult-leagues catalog into the soccer landing"
```

---

## Task 13: E2E — season page filter + register

**Files:**
- Create: `tests/e2e/adult-soccer-season.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/adult-soccer-season.spec.ts
import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

test("adult soccer season page: filter divisions and reach register", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/soccer/fall-2026`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // tabs + finder present
  await expect(page.getByRole("heading", { name: /Find your level/i })).toBeVisible();
  const rows = page.getByTestId("division-rows");
  await expect(rows).toBeVisible();

  // filter by Men's narrows the list
  const before = await page.getByTestId("result-count").innerText();
  await page.getByRole("button", { name: "Men's" }).click();
  const after = await page.getByTestId("result-count").innerText();
  expect(Number(after)).toBeLessThanOrEqual(Number(before));

  // a Register link points to the wizard
  const reg = page.getByRole("link", { name: /Register/i }).first();
  await expect(reg).toHaveAttribute("href", /\/register\//);
});

test("landing page points to the current term", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/soccer`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  const banner = page.getByTestId("now-registering");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("href", /\/adult\/leagues\/soccer\/fall-2026/);
});
```

- [ ] **Step 2: Run it (dev server + seed up)**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/adult-soccer-season.spec.ts`
Expected: PASS (2 tests). If the finder needs hydration, the `waitForHydration` (from `SeasonTabs`'s `useHydrationBeacon`) covers it.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/adult-soccer-season.spec.ts
git commit -m "test(leagues): e2e for season finder + landing pointer"
```

---

## Task 14: Pre-push verification

- [ ] **Step 1: Unit + types**

Run: `npx vitest run tests/unit/division-filters.test.ts tests/unit/terms.test.ts tests/unit/adult-soccer-content.test.ts && npx tsc --noEmit`
Expected: all pass, zero type errors.

- [ ] **Step 2: Migration + seed (CI-equivalent)**

Run: `npm run db:generate` (expected: no new migration — schema already captured) then `npm run db:seed:e2e` (expected: success).

- [ ] **Step 3: API + E2E against a running dev server**

With `npm run dev` up:
```bash
TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public-seasons-divisions.test.ts
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/adult-soccer-season.spec.ts
```
Expected: pass.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Push & open PR**

```bash
git push -u origin <branch>
gh pr create --fill
```
Then confirm CI is green on the resulting commit (per CLAUDE.md, the task isn't done until CI passes).

---

## Self-Review notes

- **Spec coverage:** routing (T10/T11/T12), two-page model (T10/T11), finder with level/format/day/venue (T3/T8), level ladder at-a-glance (T7), tabbed season page + states (T9/T10), bold palette + photo hero (T9/T10/T11), data model + API (T1/T5), content module/rules (T2), standings empty state (T9), analytics — **deferred** (see below), testing (T3/T4/T5/T13).
- **Analytics gap:** the spec lists PostHog events; they are intentionally NOT in this plan's tasks to keep the first ship focused on the IA/UX. Add a follow-up task to instrument `division_filter` / `division_register_click` once the page is live. Logged here so it isn't a silent omission.
- **Standings live table:** only the pre-season empty state is built now; the live table wiring to `teams`/`games` is a follow-up (the season is Fall 2026, not yet active).
