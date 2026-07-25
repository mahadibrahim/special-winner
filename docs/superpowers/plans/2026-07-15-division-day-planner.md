# Division Day Planner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins assign each division a day-of-week (balanced across days per venue), backfill existing divisions from their start date, and present divisions grouped by day on the public league pages.

**Architecture:** Reuse the existing `seasons.dayOfWeek` column (no schema change). A pure `balanceDays()` function computes assignments; a tenant-scoped batch API persists them; a program-level admin planner drives it. A shared `groupDivisionsByDay()` helper powers competitor-style day-section grouping on the SoccerOne finder and the Aspire adult soccer page. A one-time SQL migration backfills null days.

**Tech Stack:** Astro 5, React 19, Drizzle ORM (Postgres), Vitest (unit + API), Playwright (e2e), Tailwind 4.

## Global Constraints

- Card-display half is already shipped (`e0b96d44`); do not re-do it.
- No schema change. Only `seasons.dayOfWeek` is written.
- Day slugs are the 3-char lowercase set `mon,tue,wed,thu,fri,sat,sun`. Canonical order `WEEK_ORDER = [mon,tue,wed,thu,fri,sat,sun]`.
- Admin API endpoints MUST validate tenant ownership via `requireSameOrg*` (`src/lib/auth/require-resource-ownership.ts`). Never skip.
- Migrations go through `db:generate` → commit the SQL → `db:migrate`. Never `db:push` to staging/prod. Write idempotently.
- Any `findFirst`/`.limit(1)` needs an explicit `orderBy` (multi-tenant CI hazard).
- Deferred / out of scope: time-of-day slots, `venueResourceId`/field assignment, `resource_blocks`, game generation.

---

### Task 1: `balanceDays()` pure function

**Files:**
- Create: `src/lib/scheduling/balance-days.ts`
- Test: `tests/unit/balance-days.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type DayKey = "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun";
  interface BalanceInput { id: string; dayOfWeek: DayKey | null }
  type BalanceMode = "fill-empty" | "rebalance";
  function balanceDays(
    divisions: BalanceInput[],
    openDays: DayKey[],
    opts?: { mode?: BalanceMode },
  ): Map<string, DayKey>   // divisionId -> assigned day
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/balance-days.test.ts
import { describe, it, expect } from "vitest";
import { balanceDays } from "@/lib/scheduling/balance-days";

const days = ["mon","tue","wed"] as const;

describe("balanceDays", () => {
  it("spreads unassigned divisions evenly across open days", () => {
    const d = [{id:"a",dayOfWeek:null},{id:"b",dayOfWeek:null},{id:"c",dayOfWeek:null}];
    const m = balanceDays(d, [...days]);
    expect(new Set(m.values())).toEqual(new Set(["mon","tue","wed"]));
  });

  it("fill-empty leaves already-assigned divisions on their day", () => {
    const d = [{id:"a",dayOfWeek:"tue" as const},{id:"b",dayOfWeek:null},{id:"c",dayOfWeek:null}];
    const m = balanceDays(d, [...days], { mode: "fill-empty" });
    expect(m.get("a")).toBe("tue");
    // b,c go to the least-loaded days (mon, wed), avoiding piling onto tue
    expect(new Set([m.get("b"),m.get("c")])).toEqual(new Set(["mon","wed"]));
  });

  it("rebalance ignores existing days and redistributes evenly", () => {
    const d = [{id:"a",dayOfWeek:"tue" as const},{id:"b",dayOfWeek:"tue" as const},{id:"c",dayOfWeek:"tue" as const}];
    const m = balanceDays(d, [...days], { mode: "rebalance" });
    expect(new Set(m.values())).toEqual(new Set(["mon","tue","wed"]));
  });

  it("is deterministic by id ordering", () => {
    const d = [{id:"c",dayOfWeek:null},{id:"a",dayOfWeek:null},{id:"b",dayOfWeek:null}];
    expect(balanceDays(d,[...days])).toEqual(balanceDays([...d].reverse(),[...days]));
  });

  it("returns an empty map when there are no open days", () => {
    expect(balanceDays([{id:"a",dayOfWeek:null}], []).size).toBe(0);
  });

  it("handles zero divisions", () => {
    expect(balanceDays([], [...days]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/balance-days.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/scheduling/balance-days.ts
export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export interface BalanceInput { id: string; dayOfWeek: DayKey | null }
export type BalanceMode = "fill-empty" | "rebalance";

/**
 * Assign each division a day, spreading them across `openDays` to keep per-day
 * counts as even as possible. Pure + deterministic (ties broken by id).
 * Days-only capacity planning; time-of-day and fields are out of scope.
 */
export function balanceDays(
  divisions: BalanceInput[],
  openDays: DayKey[],
  opts: { mode?: BalanceMode } = {},
): Map<string, DayKey> {
  const mode = opts.mode ?? "fill-empty";
  const result = new Map<string, DayKey>();
  if (openDays.length === 0) return result;

  const load = new Map<DayKey, number>(openDays.map((d) => [d, 0]));
  const sorted = [...divisions].sort((a, b) => a.id.localeCompare(b.id));

  // In fill-empty, pin already-assigned divisions (only if their day is open)
  // and seed the load counts so new divisions avoid piling onto them.
  const toPlace: BalanceInput[] = [];
  for (const d of sorted) {
    if (mode === "fill-empty" && d.dayOfWeek && load.has(d.dayOfWeek)) {
      result.set(d.id, d.dayOfWeek);
      load.set(d.dayOfWeek, (load.get(d.dayOfWeek) ?? 0) + 1);
    } else {
      toPlace.push(d);
    }
  }

  // Greedily place each remaining division on the least-loaded open day,
  // breaking ties by WEEK_ORDER position (openDays is caller-ordered).
  for (const d of toPlace) {
    let best = openDays[0];
    for (const day of openDays) {
      if ((load.get(day) ?? 0) < (load.get(best) ?? 0)) best = day;
    }
    result.set(d.id, best);
    load.set(best, (load.get(best) ?? 0) + 1);
  }
  return result;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/balance-days.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduling/balance-days.ts tests/unit/balance-days.test.ts
git commit -m "feat(scheduling): balanceDays — spread divisions across open days"
```

---

### Task 2: `groupDivisionsByDay()` helper + refactor ScheduleTable

**Files:**
- Modify: `src/lib/leagues/division-filters.ts` (add `WEEK_ORDER`, `DAY_LABEL`, `groupDivisionsByDay`)
- Modify: `src/components/leagues/season-tabs.tsx` (`ScheduleTable` consumes the helper)
- Test: `tests/unit/group-divisions-by-day.test.ts`

**Interfaces:**
- Consumes: `Division` type (already in `division-filters.ts`, has `day: DayKey | null`).
- Produces:
  ```ts
  const WEEK_ORDER: DayKey[]  // [mon..sun]
  interface DayGroup { day: DayKey | null; label: string; items: Division[] }
  function groupDivisionsByDay(divisions: Division[]): DayGroup[]
  ```
  Ordered by `WEEK_ORDER`; empty days omitted; `null`-day divisions in a trailing group with `day: null, label: "Day TBD"`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/group-divisions-by-day.test.ts
import { describe, it, expect } from "vitest";
import { groupDivisionsByDay } from "@/lib/leagues/division-filters";
import type { Division } from "@/lib/leagues/division-filters";

const div = (id: string, day: Division["day"]): Division => ({
  id, seasonId: id, name: id, level: "open", gender: "coed", day, time: null,
  venueSlug: "v", venueName: "V", status: "open", spotsLabel: "", signupModes: [],
});

describe("groupDivisionsByDay", () => {
  it("orders groups by WEEK_ORDER and omits empty days", () => {
    const g = groupDivisionsByDay([div("a","wed"), div("b","mon")]);
    expect(g.map((x) => x.day)).toEqual(["mon","wed"]);
    expect(g[0].label).toBe("Mon");
  });
  it("puts null-day divisions in a trailing 'Day TBD' group", () => {
    const g = groupDivisionsByDay([div("a",null), div("b","tue")]);
    expect(g.map((x) => x.day)).toEqual(["tue", null]);
    expect(g[1].label).toBe("Day TBD");
  });
  it("groups multiple divisions under the same day", () => {
    const g = groupDivisionsByDay([div("a","mon"), div("b","mon")]);
    expect(g).toHaveLength(1);
    expect(g[0].items.map((d) => d.id)).toEqual(["a","b"]);
  });
  it("returns [] for no divisions", () => {
    expect(groupDivisionsByDay([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/group-divisions-by-day.test.ts`
Expected: FAIL (`groupDivisionsByDay` not exported).

- [ ] **Step 3: Implement the helper**

Add to `src/lib/leagues/division-filters.ts`:

```ts
export const WEEK_ORDER: DayKey[] = ["mon","tue","wed","thu","fri","sat","sun"];

const DAY_LABEL: Record<DayKey, string> = {
  mon:"Mon", tue:"Tue", wed:"Wed", thu:"Thu", fri:"Fri", sat:"Sat", sun:"Sun",
};

export interface DayGroup { day: DayKey | null; label: string; items: Division[] }

/** Group divisions into day-of-week sections (mon→sun), empty days omitted,
 *  null-day divisions collected into a trailing "Day TBD" group. */
export function groupDivisionsByDay(divisions: Division[]): DayGroup[] {
  const groups: DayGroup[] = WEEK_ORDER
    .map((day) => ({ day, label: DAY_LABEL[day], items: divisions.filter((d) => d.day === day) }))
    .filter((g) => g.items.length > 0);
  const tbd = divisions.filter((d) => d.day == null);
  if (tbd.length) groups.push({ day: null, label: "Day TBD", items: tbd });
  return groups;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/group-divisions-by-day.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Refactor ScheduleTable to consume the helper**

In `src/components/leagues/season-tabs.tsx` `ScheduleTable` (~lines 100–117), replace the inline `order.map(...).filter(...)` with `groupDivisionsByDay(divisions)`; render `g.label` per row instead of the raw day slug. Import `groupDivisionsByDay` from `@/lib/leagues/division-filters`. Uppercase styling on the label stays (label is already "Mon" etc.).

- [ ] **Step 6: Verify no regression + commit**

Run: `npx tsc --noEmit` (expect the pre-existing baseline only) and `npx vitest run tests/unit/group-divisions-by-day.test.ts`.

```bash
git add src/lib/leagues/division-filters.ts src/components/leagues/season-tabs.tsx tests/unit/group-divisions-by-day.test.ts
git commit -m "feat(leagues): groupDivisionsByDay helper; ScheduleTable reuses it"
```

---

### Task 3: Backfill migration

**Files:**
- Create (generated): `src/lib/db/migrations/NNNN_backfill_season_day_of_week.sql`

**Interfaces:** none (data migration).

- [ ] **Step 1: Author the migration SQL**

Create a new migration via the repo's generator, then replace/append its body with the idempotent backfill (day 0 = Sunday in Postgres `EXTRACT(DOW)`):

```sql
-- Backfill seasons.day_of_week from the start-date weekday where unset.
UPDATE seasons
SET day_of_week = (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[
      EXTRACT(DOW FROM start_date)::int + 1]
WHERE day_of_week IS NULL
  AND start_date IS NOT NULL;
```

Note: if `npm run db:generate` produces no file (no schema diff — expected, since there's no schema change), create the migration file by hand following the numbering of the latest file in `src/lib/db/migrations/`, and add its entry to the drizzle journal the same way sibling data-only migrations do (inspect the most recent migration + `meta/_journal.json` for the exact shape).

- [ ] **Step 2: Verify idempotency by reading the SQL**

Confirm the `WHERE day_of_week IS NULL` guard — re-running is a no-op and never overwrites an already-set day.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/migrations/
git commit -m "feat(db): backfill season day_of_week from start date"
```

---

### Task 4: Batch update API — `PATCH /api/admin/programs/[id]/division-days`

**Files:**
- Create: `src/pages/api/admin/programs/[id]/division-days.ts`
- Test: `tests/api/division-days.test.ts`

**Interfaces:**
- Consumes: `requireSameOrgProgram(orgId, programId)` → `{ ok, row }`; `locals.user`, `locals.organization`.
- Request body: `{ assignments: { seasonId: string; dayOfWeek: DayKey | null }[] }`.
- Response: `200 { updated: number }`; `401` unauth; `403`/`404` on org/program mismatch; `400` on invalid `dayOfWeek` or a `seasonId` not belonging to the program.

- [ ] **Step 1: Write the failing API test**

```ts
// tests/api/division-days.test.ts — hits the running dev server over HTTP.
// Mirrors the auth/setup pattern of a sibling admin test in tests/api/.
import { describe, it, expect } from "vitest";
// ... reuse the existing admin sign-in + org/program fixtures helper used by
// other tests/api/admin specs (see an existing admin test for the exact import).

describe("PATCH /api/admin/programs/[id]/division-days", () => {
  it("rejects unauthenticated", async () => {
    const res = await fetch(`${BASE}/api/admin/programs/${programId}/division-days`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ assignments: [] }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a season from another program (400)", async () => {
    const res = await adminFetch(`/api/admin/programs/${programId}/division-days`, {
      method: "PATCH",
      body: JSON.stringify({ assignments: [{ seasonId: foreignSeasonId, dayOfWeek: "mon" }] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid dayOfWeek (400)", async () => {
    const res = await adminFetch(`/api/admin/programs/${programId}/division-days`, {
      method: "PATCH",
      body: JSON.stringify({ assignments: [{ seasonId, dayOfWeek: "funday" }] }),
    });
    expect(res.status).toBe(400);
  });

  it("writes the day for valid assignments", async () => {
    const res = await adminFetch(`/api/admin/programs/${programId}/division-days`, {
      method: "PATCH",
      body: JSON.stringify({ assignments: [{ seasonId, dayOfWeek: "thu" }] }),
    });
    expect(res.status).toBe(200);
    // verify via the public seasons API or an admin read that dayOfWeek === "thu"
  });
});
```

(Match `BASE`, `adminFetch`, and fixture-id resolution to the conventions in an existing `tests/api/admin/*.test.ts` — reuse its sign-in helper rather than inventing one.)

- [ ] **Step 2: Run to verify it fails**

Start the dev server, then:
Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/division-days.test.ts`
Expected: FAIL (404 — route doesn't exist yet).

- [ ] **Step 3: Implement the endpoint**

```ts
// src/pages/api/admin/programs/[id]/division-days.ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { seasons } from "@/lib/db/schema/programs";
import { and, eq, inArray } from "drizzle-orm";
import { requireSameOrgProgram, ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";

const DAY = z.enum(["mon","tue","wed","thu","fri","sat","sun"]);
const bodySchema = z.object({
  assignments: z.array(z.object({
    seasonId: z.string().uuid(),
    dayOfWeek: DAY.nullable(),
  })).max(200),
});

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const orgId = locals.organization?.id;
  if (!orgId) return new Response(JSON.stringify({ error: "No org" }), { status: 400 });

  const owns = await requireSameOrgProgram(orgId, params.id!);
  if (!owns.ok) return ownershipDeniedResponse();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
  const { assignments } = parsed.data;
  if (assignments.length === 0) return new Response(JSON.stringify({ updated: 0 }), { status: 200 });

  const db = getDb();
  // Every seasonId must belong to THIS program (blocks cross-program/-org writes).
  const ids = assignments.map((a) => a.seasonId);
  const owned = await db.select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.programId, params.id!), inArray(seasons.id, ids)));
  const ownedSet = new Set(owned.map((r) => r.id));
  if (ownedSet.size !== new Set(ids).size)
    return new Response(JSON.stringify({ error: "Unknown season for program" }), { status: 400 });

  await db.transaction(async (tx) => {
    for (const a of assignments) {
      await tx.update(seasons).set({ dayOfWeek: a.dayOfWeek }).where(eq(seasons.id, a.seasonId));
    }
  });
  return new Response(JSON.stringify({ updated: assignments.length }), { status: 200 });
};
```

- [ ] **Step 4: Run to verify pass**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/division-days.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/programs/[id]/division-days.ts tests/api/division-days.test.ts
git commit -m "feat(api): batch division-day assignment (org-scoped)"
```

---

### Task 5: Program-level day planner (admin UI)

**Files:**
- Create: `src/pages/admin/programs/[id]/day-planner.astro` (SSR page shell; passes program + divisions + venues to the island)
- Create: `src/components/admin/day-planner/day-planner.tsx` (`client:load` island)
- Reuse: `balanceDays` (Task 1), `WEEK_ORDER`/`DAY_LABEL` (Task 2), `ErrorBanner`/`EmptyState`/`LoadingSkeleton`, `useHydrationBeacon`.

**Interfaces:**
- Consumes: `balanceDays(divisions, openDays, {mode})`; `PATCH /api/admin/programs/[id]/division-days`.
- The Astro shell resolves the program via the existing admin data path and its divisions (seasons) + venues; it passes them to the island as props (each division: `{ id, name, dayOfWeek, venueId }`, and `venues: { id, name, fieldCount }[]`).

- [ ] **Step 1: Build the Astro shell**

`src/pages/admin/programs/[id]/day-planner.astro` extends `BaseLayout`, is SSR (no `prerender`), loads the program + its seasons + venues (query filtered by `programId`; venues via the program's location), and renders `<DayPlanner client:load program={...} divisions={...} venues={...} />`. Guarded by middleware `/admin` role rule (no per-page redirect boilerplate).

- [ ] **Step 2: Build the island**

`day-planner.tsx` (`"use client"`, calls `useHydrationBeacon()`):
- Venue `<select>` (default: first venue). Per-cell soft capacity = the selected venue's `fieldCount`.
- Open-days toggles (Mon–Sun `WEEK_ORDER`, default all on).
- Board: one column per open day + an "Unassigned" tray. Each division renders as a card in its `dayOfWeek` column (filtered to the selected venue). Cards move between columns via a per-card day `<select>` (simplest reliable interaction; no DnD needed).
- Column header shows `label` + `N / fieldCount`; tint the count when `N > fieldCount` (warning class, never disables save).
- **Auto-balance** button → `balanceDays(divisionsForVenue, openDays, { mode })` where `mode` comes from a `fill-empty | rebalance` toggle; apply the returned map to local state.
- **Save** → `PATCH` with `{ assignments: divisionsForVenue.map(d => ({ seasonId: d.id, dayOfWeek: d.dayOfWeek })) }`; `toast.success` / `toast.error`; `ErrorBanner` for the failure summary. Nothing persists before Save.

- [ ] **Step 3: Manual verification**

Start the dev server, sign in as admin, open `/admin/programs/<id>/day-planner`, auto-balance, save, reload — days persist. (Follow the `verify` skill: drive the flow in a browser, both save + reload.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/programs/[id]/day-planner.astro src/components/admin/day-planner/day-planner.tsx
git commit -m "feat(admin): program-level division day planner"
```

- [ ] **Step 5: Link it from the program/seasons admin surface**

Add a "Plan days" link to the planner from the program's admin view (e.g. the program row/actions in the seasons admin surface). Commit:

```bash
git commit -am "feat(admin): link day planner from program actions"
```

---

### Task 6: Day-grouped presentation — SoccerOne finder

**Files:**
- Modify: `src/components/soccerone/SoccerOneLeaguesFinder.tsx`

**Interfaces:**
- Consumes: `groupDivisionsByDay` / `WEEK_ORDER` (Task 2). The finder holds `FinderSeason`-shaped rows; map the visible (post-filter) rows to the `Division`-ish `{ day }` shape the grouping needs, or add a local `groupSeasonsByDay(seasons)` mirroring the helper's ordering if the finder's row type differs enough. Prefer reusing `WEEK_ORDER` + the same null-TBD-last rule.

- [ ] **Step 1: Render day sections**

After the existing filters compute `visible`, group `visible` by `dayOfWeek` in `WEEK_ORDER` (null → trailing "Day TBD"), and render a `<section>` per group with a day header (name + count) above that group's existing `LeagueCard` grid. When the Night filter is active the grouping naturally collapses to one section — keep that working. Keep the empty-state and count line intact.

- [ ] **Step 2: Verify in browser (both brands) + commit**

Load the SoccerOne leagues page; confirm day headers render with cards beneath, filters still narrow correctly, and the SoccerOne (dark) theme styling holds. Per the "verify in a browser" rule, check rendering, not just types.

```bash
git commit -am "feat(soccerone): group league cards under day-of-week sections"
```

---

### Task 7: Day-grouped presentation — Aspire adult divisions tab

**Files:**
- Modify: `src/components/leagues/season-tabs.tsx` (the `divisions` tab)

**Interfaces:**
- Consumes: `groupDivisionsByDay` (Task 2).

- [ ] **Step 1: Group the divisions tab**

In the `tab === "divisions"` branch, render the (filtered) divisions grouped via `groupDivisionsByDay(...)` — a day header (label + count) above each day's division cards/rows — instead of a flat list. Keep any existing division filters applying before grouping.

- [ ] **Step 2: Verify in browser + commit**

Load `/adult/leagues/soccer/<term>`; confirm the divisions tab shows day sections and the schedule tab (already day-grouped via the shared helper) is unchanged.

```bash
git commit -am "feat(leagues): group adult soccer divisions under day sections"
```

---

### Task 8: E2E spec sweep + full verification

**Files:**
- Modify: any `tests/e2e/` specs that assert on the SoccerOne finder / adult soccer layout.

- [ ] **Step 1: Grep for affected specs**

Run: `grep -rln "leagues-finder\|SoccerOneLeaguesFinder\|adult/leagues/soccer\|season-tabs\|division" tests/e2e/`
Update any spec that asserts on the pre-grouping layout so it targets the new day sections. These run post-merge (`test-full`), so they won't gate the PR — update them now.

- [ ] **Step 2: Pre-push checklist**

- `npx tsc --noEmit` → only the known baseline.
- `npm run build` → succeeds (SSR/prerender correct on the new admin page).
- `npm run db:generate` → confirm no unexpected schema diff (backfill migration is data-only).
- Unit: `npx vitest run tests/unit/balance-days.test.ts tests/unit/group-divisions-by-day.test.ts tests/unit/format-date.test.ts`.
- API (dev server up): `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/division-days.test.ts`.

- [ ] **Step 3: Final commit (if the sweep changed specs)**

```bash
git commit -am "test(e2e): target day-grouped league layout"
```

---

## Self-Review

- **Spec coverage:** Component 1 → Task 3; Component 2 → Task 1; Component 3 → Task 4; Component 4 → Task 5; Component 5 → Tasks 2/6/7; testing → folded into each task + Task 8. Card display (Component 0) already shipped.
- **Type consistency:** `DayKey` and `WEEK_ORDER` are the single source; `balanceDays` uses `dayOfWeek`, matching the season column and the API body field; `groupDivisionsByDay` uses `Division.day`.
- **Placeholders:** none — algorithmic/data/API tasks carry full code; UI tasks specify files, props, interactions, and the exact API contract.
