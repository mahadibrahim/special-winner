# SoccerOne Bold-Catalog Back-Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Aspire landing-redesign patterns (motion, live status, instant filtering, pricing clarity, honest data) to SoccerOne's core pages without breaking its dark/lime identity.

**Architecture:** SoccerOne is a brand skin on the shared Aspire web-app (host-rewrite middleware, SSR pages under `src/pages/soccerone/`, dark `#0a0a0d`/lime `#a3e635` theme via global `--so-*` CSS vars). We reuse the brand-agnostic shared logic (`finder-filter` event bus, `useFinderFilter`, `pricingTiers`, `SKILL_LEVEL_TIERS`, the `drop_in_rate_card` SSR fetch) and build SoccerOne-skinned presentational shells in `src/components/soccerone/`. Pure logic is TDD'd with Vitest unit tests; rendered pages/islands are verified with `npm run build`, `npx tsc --noEmit`, and Playwright e2e (driven on `soccerone.localhost`).

**Tech Stack:** Astro 5 (SSR, `prerender = false`), React 19 islands, Tailwind 4 + scoped CSS using `--so-*` vars, Drizzle, Vitest (`tests/unit`, `tests/api`), Playwright (`tests/e2e`).

**Reference design:** `docs/superpowers/specs/2026-06-18-soccerone-bold-catalog-design.md`. Read it before starting.

**Phase map (each phase is an independently shippable PR; implement in order):**
- **Phase 0 — Shared foundation:** extend `FinderFilterDetail` with an optional `location` field (backward-compatible; Aspire ignores it).
- **Phase 1 — Smart leagues finder** (spec item 3): pure filter/chip helpers + `SoccerOneLeaguesFinder` island replacing the `?facility=` tabs.
- **Phase 2 — Home page** (spec items 1, 2, and the home-page parts of 6): hero headline + eyebrow drop + facility launchpad; live play cards; season-copy / youth-link / price fixes.
- **Phase 3 — Pickup page** (spec items 4, 5, and pickup parts of 6): pricing band + level-ladder explainer; bind prices to the rate card.

**Conventions for every task:** work in this worktree (`feat/soccerone-bold-catalog`). Run unit tests with `npm run test:unit -- <file>` (Vitest). Keep all SoccerOne pages `prerender = false`. Gate every animation behind `@media (prefers-reduced-motion: reduce)`. Use existing `--so-*` vars, never raw hex (except where the file already does).

---

## Phase 0 — Shared foundation

### Task 0.1: Extend `FinderFilterDetail` with optional `location`

The hero launchpad (Phase 2) and the leagues finder (Phase 1) need to carry a location alongside the existing `key`. Adding an optional field is backward-compatible — Aspire's existing dispatch/subscribe sites compile and run unchanged.

**Files:**
- Modify: `src/lib/landing/finder-filter.ts:4-9`
- Test: `tests/unit/landing/finder-filter.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/landing/finder-filter.test.ts
import { describe, it, expect, vi, afterEach } from "vitest"
import { dispatchFinderFilter, onFinderFilter, type FinderFilterDetail } from "@/lib/landing/finder-filter"

describe("finder-filter event bus", () => {
  afterEach(() => vi.restoreAllMocks())

  it("carries an optional location through dispatch → subscribe", () => {
    // jsdom provides window; scrollIntoView is not implemented, so stub getElementById
    vi.spyOn(document, "getElementById").mockReturnValue({
      scrollIntoView: () => {},
    } as unknown as HTMLElement)

    const received: FinderFilterDetail[] = []
    const off = onFinderFilter((d) => received.push(d))
    dispatchFinderFilter({ key: "leagues", sectionId: "finder", location: "worthington" })
    off()

    expect(received).toHaveLength(1)
    expect(received[0].location).toBe("worthington")
    expect(received[0].key).toBe("leagues")
  })

  it("location is optional (existing two-field callers still type-check)", () => {
    const d: FinderFilterDetail = { key: "soccer", sectionId: "sessions" }
    expect(d.location).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/landing/finder-filter.test.ts`
Expected: FAIL — `location` is not a known property of `FinderFilterDetail`.

- [ ] **Step 3: Add the optional field**

In `src/lib/landing/finder-filter.ts`, change the interface:

```ts
export interface FinderFilterDetail {
  /** Sport slug (seasons) or sport/format word (pickup, SoccerOne) to filter to. */
  key: string
  /** Id of the finder <section> to scroll to and that should react. */
  sectionId: string
  /** Optional location slug (e.g. "worthington" | "downtown"). SoccerOne hero
   *  launchpad sets this; finders that don't filter by location ignore it. */
  location?: string
}
```

No other changes — `dispatchFinderFilter` already forwards the whole `detail` object via the CustomEvent.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/landing/finder-filter.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → 0 errors.
```bash
git add src/lib/landing/finder-filter.ts tests/unit/landing/finder-filter.test.ts
git commit -m "feat(landing): optional location on FinderFilterDetail"
```

---

## Phase 1 — Smart leagues finder

Replaces the `?facility=` reload tabs in `src/pages/soccerone/leagues.astro` with a client-side island that filters across Location / Division / Night instantly, reacts to hero deep-links, and offers the interest list on an empty result. The featured CTA stays server-rendered above the island.

### Task 1.1: Pure season-filter + chip-derivation helpers

All filtering logic lives in a pure, unit-tested module so the island stays thin. Chips are **derived from the seasons present** (never hard-coded) — this resolves the spec's open "Premier/Corporate" question: we show only chips that match real data.

**Files:**
- Create: `src/lib/soccerone/leagues-finder.ts`
- Test: `tests/unit/soccerone/leagues-finder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/soccerone/leagues-finder.test.ts
import { describe, it, expect } from "vitest"
import {
  deriveLocationChips, deriveDivisionChips, deriveNightChips,
  filterSeasons, NIGHT_LABELS, type FinderSeason, type FinderFilters,
} from "@/lib/soccerone/leagues-finder"

const seasons: FinderSeason[] = [
  { id: "1", divisionGender: "coed",   dayOfWeek: "mon", location: { slug: "worthington", name: "Worthington" } },
  { id: "2", divisionGender: "womens", dayOfWeek: "thu", location: { slug: "worthington", name: "Worthington" } },
  { id: "3", divisionGender: "coed",   dayOfWeek: "tue", location: { slug: "downtown",    name: "Downtown" } },
  { id: "4", divisionGender: null,     dayOfWeek: null,  location: { slug: "downtown",    name: "Downtown" } },
]

describe("leagues-finder helpers", () => {
  it("derives location chips from distinct slugs present, ordered by first appearance", () => {
    expect(deriveLocationChips(seasons)).toEqual([
      { value: "worthington", label: "Worthington" },
      { value: "downtown", label: "Downtown" },
    ])
  })

  it("derives division chips only for divisionGender values present (no empty chips)", () => {
    expect(deriveDivisionChips(seasons)).toEqual([
      { value: "coed", label: "Coed" },
      { value: "womens", label: "Women's" },
    ])
  })

  it("derives night chips in week order from days present", () => {
    expect(deriveNightChips(seasons)).toEqual([
      { value: "mon", label: NIGHT_LABELS.mon },
      { value: "tue", label: NIGHT_LABELS.tue },
      { value: "thu", label: NIGHT_LABELS.thu },
    ])
  })

  it("filters by location AND division AND night; 'all' is a wildcard", () => {
    const f: FinderFilters = { location: "worthington", division: "coed", night: "all" }
    expect(filterSeasons(seasons, f).map((s) => s.id)).toEqual(["1"])
  })

  it("returns everything when all filters are 'all'", () => {
    const f: FinderFilters = { location: "all", division: "all", night: "all" }
    expect(filterSeasons(seasons, f)).toHaveLength(4)
  })

  it("seasons with null division/day are excluded only when that axis is filtered", () => {
    expect(filterSeasons(seasons, { location: "downtown", division: "all", night: "all" }).map(s => s.id)).toEqual(["3", "4"])
    expect(filterSeasons(seasons, { location: "downtown", division: "coed", night: "all" }).map(s => s.id)).toEqual(["3"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/soccerone/leagues-finder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

```ts
// src/lib/soccerone/leagues-finder.ts

export interface FinderSeason {
  id: string
  divisionGender: string | null   // 'coed' | 'mens' | 'womens'
  dayOfWeek: string | null         // 'mon'..'sun'
  location: { slug: string; name: string }
  // Presentational fields (name, status, price, etc.) ride along untyped on the
  // real payload; the finder only filters on the four fields above.
  [extra: string]: unknown
}

export interface FinderFilters {
  location: string  // slug | "all"
  division: string  // divisionGender | "all"
  night: string     // dayOfWeek | "all"
}

export interface Chip { value: string; label: string }

const DIVISION_LABELS: Record<string, string> = {
  coed: "Coed", mens: "Men's", womens: "Women's",
}

export const NIGHT_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
}

const WEEK_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

export function deriveLocationChips(seasons: FinderSeason[]): Chip[] {
  const seen = new Map<string, string>()
  for (const s of seasons) {
    if (!seen.has(s.location.slug)) seen.set(s.location.slug, s.location.name)
  }
  return [...seen].map(([value, label]) => ({ value, label }))
}

export function deriveDivisionChips(seasons: FinderSeason[]): Chip[] {
  const seen: string[] = []
  for (const s of seasons) {
    if (s.divisionGender && !seen.includes(s.divisionGender)) seen.push(s.divisionGender)
  }
  return seen.map((value) => ({ value, label: DIVISION_LABELS[value] ?? value }))
}

export function deriveNightChips(seasons: FinderSeason[]): Chip[] {
  const present = new Set(seasons.map((s) => s.dayOfWeek).filter(Boolean) as string[])
  return WEEK_ORDER.filter((d) => present.has(d)).map((value) => ({ value, label: NIGHT_LABELS[value] }))
}

export function filterSeasons(seasons: FinderSeason[], f: FinderFilters): FinderSeason[] {
  return seasons.filter((s) =>
    (f.location === "all" || s.location.slug === f.location) &&
    (f.division === "all" || s.divisionGender === f.division) &&
    (f.night === "all" || s.dayOfWeek === f.night),
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/soccerone/leagues-finder.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/soccerone/leagues-finder.ts tests/unit/soccerone/leagues-finder.test.ts
git commit -m "feat(soccerone): pure leagues finder filter + chip helpers"
```

### Task 1.2: `SoccerOneLeaguesFinder` island

A React island rendering the chip rows + filtered league-card grid + smart empty state, subscribing to hero deep-links. Reuses the league-card visual structure already in `leagues.astro` (now JSX). Card markup mirrors `leagues.astro:224-267`; reuse the same `--so-*` class names so the existing page `<style>` block styles it (move those rules into a shared stylesheet in Step 3 of Task 1.3, or keep the island's own scoped styles — see that task).

**Files:**
- Create: `src/components/soccerone/SoccerOneLeaguesFinder.tsx`
- Test: covered by the e2e in Task 1.4 (rendered-island behavior) + the unit tests in 1.1 (logic). No fabricated unit test for JSX markup.

- [ ] **Step 1: Implement the island**

```tsx
// src/components/soccerone/SoccerOneLeaguesFinder.tsx
import { useMemo, useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { useFinderFilter } from "@/lib/hooks/use-finder-filter"
import {
  deriveLocationChips, deriveDivisionChips, deriveNightChips, filterSeasons,
  type FinderSeason, type FinderFilters,
} from "@/lib/soccerone/leagues-finder"

const SECTION_ID = "leagues-finder"
const ALL: FinderFilters = { location: "all", division: "all", night: "all" }

export default function SoccerOneLeaguesFinder({ seasons }: { seasons: FinderSeason[] }) {
  useHydrationBeacon()
  const [filters, setFilters] = useState<FinderFilters>(ALL)
  const [arrivedFrom, setArrivedFrom] = useState<string | null>(null)

  // Hero deep-link: a launchpad quick-link dispatches { key, sectionId, location }.
  // Only react when this section is the target; pre-fill the location chip.
  useFinderFilter((detail) => {
    if (detail.sectionId !== SECTION_ID) return
    if (detail.location) {
      setFilters((f) => ({ ...f, location: detail.location! }))
      setArrivedFrom(detail.location!)
    }
  })

  const locationChips = useMemo(() => deriveLocationChips(seasons), [seasons])
  const divisionChips = useMemo(() => deriveDivisionChips(seasons), [seasons])
  const nightChips = useMemo(() => deriveNightChips(seasons), [seasons])
  const visible = useMemo(() => filterSeasons(seasons, filters), [seasons, filters])

  const set = (axis: keyof FinderFilters, value: string) =>
    setFilters((f) => ({ ...f, [axis]: f[axis] === value ? "all" : value }))

  return (
    <section id={SECTION_ID} className="so-finder" aria-label="Find a league">
      {arrivedFrom && (
        <div className="so-finder-arrived">
          Showing leagues at <strong>{locationChips.find(c => c.value === arrivedFrom)?.label ?? arrivedFrom}</strong>
          <button type="button" onClick={() => { setFilters(ALL); setArrivedFrom(null) }}>clear ✕</button>
        </div>
      )}

      <ChipRow label="Location" chips={locationChips} active={filters.location} onPick={(v) => set("location", v)} />
      <ChipRow label="Division" chips={divisionChips} active={filters.division} onPick={(v) => set("division", v)} />
      <ChipRow label="Night" chips={nightChips} active={filters.night} onPick={(v) => set("night", v)} />

      <p className="so-finder-count">
        <strong>{visible.length}</strong> of {seasons.length} leagues
        {(filters.location !== "all" || filters.division !== "all" || filters.night !== "all") && (
          <button type="button" className="so-finder-clear" onClick={() => { setFilters(ALL); setArrivedFrom(null) }}>clear filters</button>
        )}
      </p>

      {visible.length === 0 ? (
        <SoccerOneFinderEmpty />
      ) : (
        <div className="leagues-grid">
          {visible.map((s) => <LeagueCard key={s.id} season={s} />)}
        </div>
      )}
    </section>
  )
}

function ChipRow({ label, chips, active, onPick }: {
  label: string; chips: { value: string; label: string }[]; active: string; onPick: (v: string) => void
}) {
  if (chips.length === 0) return null
  return (
    <div className="so-finder-group">
      <span className="so-finder-glabel">{label}</span>
      <div className="so-finder-chips" role="group" aria-label={label}>
        <button type="button" className={`so-chip ${active === "all" ? "on" : ""}`} onClick={() => onPick("all")} aria-pressed={active === "all"}>All</button>
        {chips.map((c) => (
          <button key={c.value} type="button" className={`so-chip ${active === c.value ? "on" : ""}`}
            onClick={() => onPick(c.value)} aria-pressed={active === c.value}>{c.label}</button>
        ))}
      </div>
    </div>
  )
}

// Mirror of leagues.astro:224-267, as JSX. `season` carries the presentational
// fields (name, status, program, startDate, scheduleNotes, spotsLeft,
// maxParticipants, price, teamPrice) from /api/public/seasons.
function LeagueCard({ season }: { season: FinderSeason }) {
  const s = season as any
  const isDowntown = s.location.slug?.includes("downtown")
  const statusKey = s.status === "open" ? "open" : s.status === "filling" ? "filling" : "coming"
  const priceLabel = s.teamPrice ? `$${s.price}/player · $${s.teamPrice}/team` : `$${s.price}/player`
  return (
    <div className={`league-card ${isDowntown ? "league-card--downtown" : "league-card--active"}`}>
      <div className={`lc-location-badge ${isDowntown ? "lc-location-badge--downtown" : ""}`}>{s.location.name.toUpperCase()}</div>
      <div className="lc-top">
        <div className="lc-division"><span className="lc-div-label">PROGRAM</span><span className="lc-div-name">{s.program.name}</span></div>
        <span className={`lc-status lc-status--${statusKey}`}>{String(s.status).toUpperCase()}</span>
      </div>
      <h3 className="lc-name">{s.name}</h3>
      <div className="lc-details">
        {s.startDate && <div className="lc-detail-row"><span className="lcd-label">STARTS</span><span className="lcd-val">{new Date(s.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>}
        {s.scheduleNotes && <div className="lc-detail-row"><span className="lcd-label">SCHEDULE</span><span className="lcd-val">{s.scheduleNotes}</span></div>}
        <div className="lc-detail-row"><span className="lcd-label">SPOTS</span><span className="lcd-val">{s.spotsLeft != null ? `${s.spotsLeft} left of ${s.maxParticipants}` : "Open"}</span></div>
        <div className="lc-detail-row"><span className="lcd-label">PRICE</span><span className="lcd-val mono accent">{priceLabel}</span></div>
      </div>
      <a href={`/register/${s.id}`} className="lc-cta">Register Now →</a>
    </div>
  )
}

function SoccerOneFinderEmpty() {
  return (
    <div className="so-finder-empty">
      <p className="le-title">No leagues match</p>
      <p className="le-body">Try widening a filter — or leave your email and we'll tell you when a new season opens.</p>
      <a className="lc-cta" href="/leagues">Clear filters</a>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/soccerone/SoccerOneLeaguesFinder.tsx
git commit -m "feat(soccerone): leagues finder island (chips + grid + deep-link)"
```

### Task 1.3: Wire the island into `leagues.astro`

Remove the `?facility=` tab navigation and server-side location filter; fetch **all** adult seasons SSR and pass them to the island. Keep the featured CTA (server-rendered). Add the finder's chip/section CSS to the page `<style>`.

**Files:**
- Modify: `src/pages/soccerone/leagues.astro` (frontmatter `:8-58`, markup `:117-271`, add styles in `<style>`)

- [ ] **Step 1: Frontmatter — drop the facility filter, fetch all seasons, import the island**

Replace `leagues.astro:8-20` so it no longer reads `?facility=` or sets `locationSlug`, and remove `url.searchParams.set('location', ...)` at `:26`. Keep `audience=adult`. Add to the import block:
```astro
import SoccerOneLeaguesFinder from '@/components/soccerone/SoccerOneLeaguesFinder';
```
Keep `facilityLabel` only if still used in `<title>`; otherwise set title to `"Leagues — SoccerOne"`.

- [ ] **Step 2: Markup — replace the tab row + grid/empty block with the island**

Delete the `.facility-filter-row` block (`:117-137`) and the entire `{seasons.length === 0 ? (...) : (<div class="leagues-grid">...)}` block (`:191-271`). In their place, after the featured CTA, mount:
```astro
<SoccerOneLeaguesFinder client:load seasons={seasons} />
```
Keep the featured CTA (`:148-188`) and bottom CTA (`:277-290`) as-is.

- [ ] **Step 3: Styles — add finder chip/section rules to the `<style>` block**

The league-card rules already exist and are reused by the island. Append finder-specific rules (the empty-state `.le-*` rules already exist; add the new `.so-finder-*` + `.so-chip`):
```css
.so-finder { max-width: 1400px; margin: 0 auto; padding: 2rem; }
.so-finder-group { margin-bottom: 0.875rem; }
.so-finder-glabel { font-family: var(--so-font-mono); font-size: 0.55rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--so-lime-a50); display: block; margin-bottom: 0.5rem; }
.so-finder-chips { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.so-chip { font-family: var(--so-font-mono); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: #fff; background: var(--so-surface); border: 1px solid var(--so-lime-a15); border-radius: 99px; padding: 0.5rem 0.9rem; cursor: pointer; transition: all 0.14s; }
.so-chip:hover { border-color: var(--so-lime-a40); }
.so-chip.on { background: var(--so-lime); color: var(--so-ink); border-color: var(--so-lime); font-weight: 600; }
.so-finder-count { font-family: var(--so-font-mono); font-size: 0.8rem; color: var(--muted); margin: 1rem 0; }
.so-finder-count strong { color: var(--so-lime); }
.so-finder-clear, .so-finder-arrived button { background: none; border: none; color: var(--muted); text-decoration: underline; cursor: pointer; margin-left: 0.75rem; font-size: 0.8rem; }
.so-finder-arrived { display: flex; align-items: center; gap: 0.5rem; background: var(--so-lime-a08); border: 1px solid var(--so-lime-a30); border-radius: var(--so-radius-md); padding: 0.625rem 0.875rem; margin-bottom: 1rem; font-family: var(--so-font-mono); font-size: 0.75rem; color: var(--so-lime); }
.so-finder-arrived button { margin-left: auto; }
.so-finder-empty { padding: 3rem 0; text-align: center; }
```
The `.leagues-grid` rule already exists (`:463-467`) and is reused.

- [ ] **Step 4: Verify build + type-check**

Run: `npx tsc --noEmit` → 0 errors.
Run: `npm run build` → succeeds (the `Astro.request.headers` prerender warnings are expected noise per CLAUDE.md; this page stays SSR).

- [ ] **Step 5: Commit**

```bash
git add src/pages/soccerone/leagues.astro
git commit -m "feat(soccerone): leagues page uses live finder, drops facility tabs"
```

### Task 1.4: E2E — finder filters without reload

**Files:**
- Create: `tests/e2e/soccerone-leagues-finder.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/e2e/soccerone-leagues-finder.spec.ts
import { test, expect } from "@playwright/test"
import { waitForHydration } from "../utils/test-helpers"

// SoccerOne is resolved by host; soccerone.localhost is a valid dev host
// (see tests/unit/organization/soccerone-routing.test.ts).
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321").replace("localhost", "soccerone.localhost")

test("leagues finder filters by location without a page reload", async ({ page }) => {
  await page.goto(`${BASE}/leagues`, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)

  const finder = page.locator("#leagues-finder")
  await expect(finder).toBeVisible()

  // Capture a navigation sentinel: filtering must NOT reload.
  await page.evaluate(() => ((window as any).__noReload = true))

  const downtownChip = finder.getByRole("button", { name: /downtown/i }).first()
  // Only assert filtering when the catalog actually has a Downtown chip.
  if (await downtownChip.count()) {
    await downtownChip.click()
    await expect(page.locator(".so-finder-count strong")).toBeVisible()
    expect(await page.evaluate(() => (window as any).__noReload)).toBe(true)
  }
})
```

- [ ] **Step 2: Run it**

Pre-req: dev server running, e2e seed applied (`npm run db:seed:e2e`).
Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- soccerone-leagues-finder`
Expected: PASS (or the guarded branch no-ops if seed has no Downtown season — acceptable; the visible `#leagues-finder` assertion still runs).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/soccerone-leagues-finder.spec.ts
git commit -m "test(e2e): soccerone leagues finder filters without reload"
```

**Phase 1 done → shippable PR #1.** Run the full pre-push checklist (`npx tsc --noEmit`, `npm run build`, unit + the new e2e).

---

## Phase 2 — Home page (hero + play cards + content fixes)

File throughout: `src/pages/soccerone/index.astro`. Hero section `:33-116`; numbers `:121-156`; play section `:312-412`.

### Task 2.1: Hero — headline, drop eyebrow, fold location into subhead

**Files:** Modify `src/pages/soccerone/index.astro:56-70`.

- [ ] **Step 1: Edit the markup**

Remove the eyebrow block (`:56-59`, the `.hero-label` with "COLUMBUS, OHIO"). Change the headline (`:62-65`) and subhead (`:67-70`) to:
```astro
<h1 class="hero-headline">
  <span class="hero-line-1">YOUR GAME.</span>
  <span class="hero-line-2">ANY NIGHT.</span>
</h1>

<p class="hero-sub">
  Four indoor fields across <span class="hero-loc">Worthington &amp; Downtown Columbus</span>.<br />
  Leagues, pickup, and rentals — every night, year-round.
</p>
```
Add to `<style>`: `.hero-loc { color: var(--so-lime); font-weight: 500; }`. (`.hero-line-2` is already lime-styled in the existing hero CSS — verify and reuse.)

- [ ] **Step 2: Verify build**

Run: `npm run build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/soccerone/index.astro
git commit -m "feat(soccerone): hero headline 'Your game. Any night.', drop eyebrow"
```

### Task 2.2: Hero facility cards → finder launchpad quick-links

Each facility card gains Leagues / Pickup / Rent quick-links. Because the leagues finder lives on `/leagues` (a different page), these are **links with query params** that the finder reads on load — simplest correct behavior cross-page. (Same-page dispatch via `dispatchFinderFilter` is only needed when the finder is on the same page; here it is not, so plain links are the right tool and avoid a needless client island in the hero.)

The leagues finder must honor an initial location from the URL. Extend Task 1.2's island to read `?location=`:

**Files:**
- Modify: `src/components/soccerone/SoccerOneLeaguesFinder.tsx` (initial state)
- Modify: `src/pages/soccerone/index.astro` (facility cards `:73-100`)

- [ ] **Step 1: Island reads initial location from URL**

In `SoccerOneLeaguesFinder.tsx`, replace the initial `useState(ALL)` with a lazy initializer:
```tsx
const [filters, setFilters] = useState<FinderFilters>(() => {
  if (typeof window === "undefined") return ALL
  const loc = new URLSearchParams(window.location.search).get("location")
  return loc ? { ...ALL, location: loc } : ALL
})
```
Keep the `useFinderFilter` subscription (covers same-page dispatch from a future pickup finder).

- [ ] **Step 2: Add quick-links to each facility card in the hero**

Inside each `.hero-facility-btn` inner (Worthington `:74-86`, Downtown `:88-100`), after the `.hfb-features` line, add a quick-link row. The card itself stays a link to the facility page; the quick-links are nested anchors with `stopPropagation` not needed (they're separate `<a>` siblings, not nested in the outer `<a>` — restructure the card so the format links sit alongside, not inside, the outer anchor). Replace each facility `<a>...</a>` with:
```astro
<div class="hero-facility-card hero-facility-card--primary">
  <a href="/worthington" class="hfc-main">
    <div class="hfb-header"><span class="hfb-name">WORTHINGTON</span><span class="hfb-badge">3 FIELDS</span></div>
    <div class="hfb-address">535 Lakeview Plaza Blvd · 4pm–12am daily</div>
  </a>
  <div class="hfc-formats">
    <a href="/leagues?location=worthington" class="hfc-fmt">Leagues</a>
    <a href="/pickup?facility=worthington" class="hfc-fmt">Pickup</a>
    <a href="/rent?facility=worthington" class="hfc-fmt">Rent</a>
  </div>
</div>
```
Mirror for Downtown (`location=downtown`, `1 FIELD`, its address). Keep the existing `.hero-future-chip`.

Add styles:
```css
.hero-facility-card { background: rgba(255,255,255,0.05); border: 1px solid var(--so-lime-a15); border-radius: var(--so-radius-md); padding: 1rem 1.1rem; }
.hero-facility-card--primary { background: var(--so-lime-a08); border-color: var(--so-lime-a30); }
.hfc-main { display: block; text-decoration: none; color: #fff; }
.hfc-formats { display: flex; gap: 0.45rem; margin-top: 0.75rem; }
.hfc-fmt { flex: 1; text-align: center; font-family: var(--so-font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: #fff; background: rgba(0,0,0,0.35); border: 1px solid var(--so-lime-a15); border-radius: var(--so-radius-sm); padding: 0.55rem 0.4rem; text-decoration: none; transition: all 0.14s; }
.hfc-fmt:hover { background: var(--so-lime); color: var(--so-ink); border-color: var(--so-lime); font-weight: 600; }
```

- [ ] **Step 3: Verify build + type-check**

Run: `npx tsc --noEmit` → 0 errors. `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/soccerone/SoccerOneLeaguesFinder.tsx src/pages/soccerone/index.astro
git commit -m "feat(soccerone): hero facility cards launch into pre-filtered finder"
```

### Task 2.3: Play cards — monochrome aurora motion, hover, live pulse dots; content fixes

**Files:** Modify `src/pages/soccerone/index.astro` play section (`:312-412`) + `<style>`.

- [ ] **Step 1: Fix the content errors (spec item 6, home page)**

- Leagues card desc (`:335`): replace `Coed, Premier, and Women's divisions. 8-week seasons with playoffs.` with `Coed, Premier, and Women's divisions. 7-game seasons across both sites.` (per [[soccerone-league-format]] — 7 games, no playoffs).
- Youth card (`:392`): change `href="/leagues"` to `href="/leagues?audience=youth"`.
- Pickup card detail (`:363-365`): replace the hard-coded `From $12/game` value — see Task 3.3 for the rate-card-bound approach; for the home card use evergreen copy `Members from $12 · drop in any night` (no literal that rots independently of the band). Rentals card (`:385-387`): replace `$80/hr` with evergreen `By the hour · all 4 fields`.

- [ ] **Step 2: Add live status + motion to each card**

For each `.play-card`, add a status line and the aurora layer. Add inside each card (after `.pc-title`/desc), e.g. for Leagues:
```astro
<span class="pc-live"><span class="pc-dot"></span> Now registering</span>
```
Wrap each card's gradient in a `<span class="pc-aurora" aria-hidden="true"></span>` as the first child. (Live counts can be wired to real data later; ship with honest evergreen status strings: "Now registering", "Runs nightly", "Book by the hour", "Youth clinics open".)

Add styles (monochrome lime; gated motion):
```css
.play-card { position: relative; overflow: hidden; }
.pc-aurora { position: absolute; inset: -40%; z-index: 0; filter: blur(34px); opacity: 0.45;
  background: radial-gradient(circle at 30% 30%, rgba(163,230,53,0.5), transparent 55%),
              radial-gradient(circle at 70% 70%, rgba(163,230,53,0.2), transparent 60%);
  animation: pc-drift 14s ease-in-out infinite; }
.play-card > * { position: relative; z-index: 1; }
.play-card:hover { transform: translateY(-4px); }
.play-card:hover .pc-aurora { animation-duration: 6s; }
.pc-live { display: inline-flex; align-items: center; gap: 0.45rem; font-family: var(--so-font-mono); font-size: 0.62rem; letter-spacing: 0.04em; color: var(--so-lime); margin-top: 0.5rem; }
.pc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--so-lime); animation: pc-pulse 2s ease-in-out infinite; }
@keyframes pc-drift { 0%,100% { transform: translate(0,0) scale(1.05); } 50% { transform: translate(3%,-3%) scale(1.12); } }
@keyframes pc-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(163,230,53,0.5); } 50% { box-shadow: 0 0 0 7px rgba(163,230,53,0); } }
@media (prefers-reduced-motion: reduce) { .pc-aurora, .pc-dot { animation: none; } .play-card:hover { transform: none; } }
```
(If the existing `.play-card` already sets `transform`/`transition` on hover, merge rather than duplicate.)

- [ ] **Step 3: Verify build**

Run: `npm run build` → succeeds. Spot-check the file has no remaining `8-week`, `playoffs`, `$80/hr`, or `href="/leagues"` on the youth card:
Run: `grep -nE "8-week|playoff|\\$80/hr" src/pages/soccerone/index.astro` → no matches.

- [ ] **Step 4: Commit**

```bash
git add src/pages/soccerone/index.astro
git commit -m "feat(soccerone): live play cards (aurora+pulse), fix season copy & youth link"
```

**Phase 2 done → shippable PR #2.** Run the pre-push checklist.

---

## Phase 3 — Pickup page (pricing band + level ladder + price binding)

File: `src/pages/soccerone/pickup.astro`. The page already has a static "Skill Levels" guide (`:113+`) and a how-strip with the prose pricing (`:97`).

### Task 3.1: `SoccerOnePricingBand` component

Renders the four-tier band ("Same run. Pick your price.") using `pricingTiers()` for door/online/member, plus a SoccerOne-only Founder FREE tile.

**Files:**
- Create: `src/components/soccerone/SoccerOnePricingBand.astro`

- [ ] **Step 1: Implement**

```astro
---
// src/components/soccerone/SoccerOnePricingBand.astro
import { pricingTiers, type RateCardCents } from "@/lib/landing/pickup-pricing"
interface Props { rate: RateCardCents }
const { rate } = Astro.props
const tiers = pricingTiers(rate) // [walk-in, online, member(best, note)]
const [walkIn, online, member] = tiers
---
<section class="so-band" aria-label="Drop-in pricing">
  <div class="so-band-inner">
    <h2 class="so-band-h">Same run. <span class="lime">Pick your price.</span></h2>
    <p class="so-band-sub">Drop-in pickup every night across both sites. The more you commit, the less you pay.</p>
    <div class="so-band-tiers">
      <div class="so-tier"><span class="so-tier-lbl">At the door</span><span class="so-tier-amt">{walkIn.amountLabel}</span><span class="so-tier-desc">Walk up to the desk and pay per session.</span></div>
      <div class="so-tier"><span class="so-tier-lbl">Book online</span><span class="so-tier-amt">{online.amountLabel}</span><span class="so-tier-desc">Reserve ahead — skip the desk.</span></div>
      <div class={`so-tier ${member.best ? "so-tier--best" : ""}`}>
        {member.best && <span class="so-tier-ribbon">BEST VALUE</span>}
        <span class="so-tier-lbl">Member plan</span><span class="so-tier-amt">{member.amountLabel}</span>
        <span class="so-tier-desc">Monthly plan, every session discounted.</span>
        {member.note && <span class="so-tier-save">↓ {member.note}</span>}
      </div>
      <div class="so-tier so-tier--free">
        <span class="so-tier-ribbon">FOUNDERS</span>
        <span class="so-tier-lbl">Founder member</span><span class="so-tier-amt">FREE</span>
        <span class="so-tier-desc">Founding members play every drop-in free.</span>
      </div>
    </div>
    <p class="so-band-foot"><strong>Members play cheapest, every time.</strong></p>
  </div>
</section>

<style>
  .so-band { background: linear-gradient(135deg, var(--so-ink), var(--so-surface)); padding: 3rem 2rem; }
  .so-band-inner { max-width: 1100px; margin: 0 auto; }
  .so-band-h { font-family: var(--so-font-display); text-transform: uppercase; font-size: clamp(1.6rem, 4vw, 2.3rem); line-height: 1; margin-bottom: 0.4rem; color: #fff; }
  .so-band-h .lime { color: var(--so-lime); }
  .so-band-sub { color: var(--muted); font-size: 0.9rem; margin-bottom: 1.6rem; }
  .so-band-tiers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; }
  .so-tier { position: relative; background: rgba(0,0,0,0.35); border: 1px solid var(--so-lime-a15); border-radius: var(--so-radius-md); padding: 1.25rem 1.1rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .so-tier-lbl { font-family: var(--so-font-mono); font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .so-tier-amt { font-family: var(--so-font-display); font-size: 2.4rem; line-height: 0.9; color: #fff; }
  .so-tier-desc { font-size: 0.76rem; color: var(--muted); line-height: 1.4; }
  .so-tier--best { background: var(--so-lime-a08); border-color: var(--so-lime); }
  .so-tier--best .so-tier-amt, .so-tier--free .so-tier-amt { color: var(--so-lime); }
  .so-tier--free { background: var(--so-lime-a12); border-color: var(--so-lime); }
  .so-tier-ribbon { position: absolute; top: -1px; right: -1px; font-family: var(--so-font-mono); font-size: 0.55rem; letter-spacing: 0.08em; background: var(--so-lime); color: var(--so-ink); padding: 3px 9px; border-radius: 0 var(--so-radius-md) 0 var(--so-radius-md); font-weight: 600; }
  .so-tier-save { font-family: var(--so-font-mono); font-size: 0.66rem; color: var(--so-lime); }
  .so-band-foot { margin-top: 1.4rem; font-family: var(--so-font-mono); font-size: 0.72rem; color: var(--muted); text-align: center; }
  .so-band-foot strong { color: var(--so-lime); }
  @media (max-width: 720px) { .so-band-tiers { grid-template-columns: repeat(2, 1fr); } }
</style>
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → 0 errors.
```bash
git add src/components/soccerone/SoccerOnePricingBand.astro
git commit -m "feat(soccerone): pricing band component (rate-card bound)"
```

### Task 3.2: `SoccerOneLevels` — the intensity-ladder explainer

Reuses `SKILL_LEVEL_TIERS` content (the three real tiers, welcoming voice) with SoccerOne's monochrome intensity styling — replaces the existing static "Skill Levels" guide.

**Files:**
- Create: `src/components/soccerone/SoccerOneLevels.astro`

- [ ] **Step 1: Implement**

```astro
---
// src/components/soccerone/SoccerOneLevels.astro
import { SKILL_LEVEL_TIERS } from "@/lib/landing/skill-levels"
const bars: Record<string, number> = { recreational: 1, intermediate: 2, advanced: 3 }
---
<section class="so-levels" aria-label="Find your level">
  <h2 class="so-levels-h">Find your run.</h2>
  <p class="so-levels-sub">Every level plays at SoccerOne. Not sure where you fit? Start here.</p>
  <div class="so-levels-grid">
    {SKILL_LEVEL_TIERS.map((t) => (
      <div class={`so-lv so-lv--${bars[t.level]}`}>
        <div class="so-lv-bars">{[1,2,3].map((n) => <span class={`so-lv-bar ${n <= bars[t.level] ? "f" : ""}`}></span>)}</div>
        <span class="so-lv-tag">{t.display.label}</span>
        <h3 class="so-lv-name">{t.headline}</h3>
        <p class="so-lv-blurb">{t.blurb}</p>
      </div>
    ))}
  </div>
</section>

<style>
  .so-levels { max-width: 1100px; margin: 0 auto; padding: 3rem 2rem; }
  .so-levels-h { font-family: var(--so-font-display); text-transform: uppercase; font-size: 1.5rem; color: #fff; }
  .so-levels-sub { color: var(--muted); font-size: 0.9rem; margin-bottom: 1.4rem; }
  .so-levels-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
  .so-lv { border: 1px solid var(--so-lime-a15); border-radius: var(--so-radius-md); padding: 1.4rem 1.25rem; background: var(--so-surface); }
  .so-lv--1 { background: linear-gradient(160deg, var(--so-lime-a04), transparent); }
  .so-lv--2 { background: linear-gradient(160deg, var(--so-lime-a08), transparent); border-color: var(--so-lime-a30); }
  .so-lv--3 { background: linear-gradient(160deg, var(--so-lime-a12), transparent); border-color: var(--so-lime); }
  .so-lv-bars { display: flex; gap: 4px; margin-bottom: 1rem; }
  .so-lv-bar { width: 22px; height: 6px; border-radius: 2px; background: var(--so-lime-a15); }
  .so-lv-bar.f { background: var(--so-lime); }
  .so-lv-tag { font-family: var(--so-font-mono); font-size: 0.62rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--so-lime); }
  .so-lv-name { font-family: var(--so-font-display); text-transform: uppercase; font-size: 1.4rem; line-height: 1; margin: 0.6rem 0; color: #fff; }
  .so-lv-blurb { color: var(--muted); font-size: 0.82rem; line-height: 1.5; }
  @media (max-width: 680px) { .so-levels-grid { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → 0 errors.
```bash
git add src/components/soccerone/SoccerOneLevels.astro
git commit -m "feat(soccerone): level-ladder explainer (reuses SKILL_LEVEL_TIERS)"
```

### Task 3.3: Wire band + levels into `pickup.astro`, bind prices to the rate card

**Files:** Modify `src/pages/soccerone/pickup.astro` (frontmatter, markup `:82-180`, meta `:15`).

- [ ] **Step 1: Fetch the rate card SSR + import components**

In the frontmatter, add (mirrors `adult/pickup.astro:18-30`):
```astro
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInRateCard } from "@/lib/db/schema/drop-in";
import SoccerOnePricingBand from "@/components/soccerone/SoccerOnePricingBand.astro";
import SoccerOneLevels from "@/components/soccerone/SoccerOneLevels.astro";

const orgId = Astro.locals.organization?.id ?? null;
let rate = { defaultSessionRateCents: 1500, defaultMemberRateCents: 1200 };
if (orgId) {
  const [card] = await getDb()
    .select({ defaultSessionRateCents: dropInRateCard.defaultSessionRateCents, defaultMemberRateCents: dropInRateCard.defaultMemberRateCents })
    .from(dropInRateCard).where(eq(dropInRateCard.organizationId, orgId)).limit(1);
  if (card) rate = card;
}
```

- [ ] **Step 2: Replace the prose pricing + add the band, replace the static skill guide with the ladder**

- Replace the how-strip step 03 text (`:97`) with payment-method-only copy (no prices — the band owns prices): `Pay at the door, book online, or use a Member plan — Founder members play free`.
- Remove the `$15` quick-stat literal (`:62-64`) or bind it: simplest, change its label to `From {Math.round(rate.defaultMemberRateCents/100)}` with label `members`. (Keeps it honest + bound.)
- After the how-strip (`</div>` at `:105`), insert `<SoccerOnePricingBand rate={rate} />`.
- Replace the entire static "Skill levels guide" block (`:112` through its closing `</div>` for `.skill-guide`) with `<SoccerOneLevels />`, placed **above** `<PickupGames>` (move the `.pickup-games-wrap` below the levels). Per spec: levels above the finder.
- Meta description (`:15`): remove `From $12/session.` (drift) → end the sentence at `Multiple skill levels.`

- [ ] **Step 3: Verify build + no price literals remain**

Run: `npm run build` → succeeds.
Run: `grep -nE "\\$12/session|\\(\\$17\\)|\\(\\$15\\)|\\(\\$12\\)" src/pages/soccerone/pickup.astro` → no matches.
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/soccerone/pickup.astro
git commit -m "feat(soccerone): pickup pricing band + level ladder; bind prices to rate card"
```

### Task 3.4: E2E — pickup band renders rate-card figures

**Files:** Create `tests/e2e/soccerone-pickup-band.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test"
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321").replace("localhost", "soccerone.localhost")

test("pickup page shows the four-tier pricing band", async ({ page }) => {
  await page.goto(`${BASE}/pickup`, { waitUntil: "domcontentloaded" })
  const band = page.locator(".so-band")
  await expect(band).toBeVisible()
  await expect(band.getByText(/Pick your price/i)).toBeVisible()
  await expect(band.locator(".so-tier")).toHaveCount(4)
  await expect(band.getByText("FREE")).toBeVisible()
})
```

- [ ] **Step 2: Run it**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- soccerone-pickup-band`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/soccerone-pickup-band.spec.ts
git commit -m "test(e2e): soccerone pickup pricing band renders four tiers"
```

**Phase 3 done → shippable PR #3.** Run the full pre-push checklist.

---

## Out of scope / follow-ups
- Rentals pricing band (member vs non-member) — fast-follow reuse of `SoccerOnePricingBand` with two tiers.
- Wiring live counts ("6 divisions registering") into play-card / finder status strings — currently honest evergreen strings.
- Leagues-page level explainer mapping divisions to skill tiers.
- Real walk-in rate per org (the `$17` is still `WALK_IN_RATE_CENTS` display copy until the walk-in pricing enforcement spec lands).

## Self-review notes
- **Spec coverage:** item 1 → Tasks 2.1/2.2; item 2 → 2.3; item 3 → 1.1–1.4; item 4 → 3.1/3.3; item 5 → 3.2/3.3; item 6 → folded into 2.3 (home), 3.3 (pickup), and the finder's data-driven design (1.1).
- **Type consistency:** `FinderFilterDetail.location`, `FinderFilters {location,division,night}`, `FinderSeason`, and the chip/`filterSeasons` signatures are defined once in Task 0.1/1.1 and reused verbatim in 1.2 and 2.2.
- **Testing strategy:** pure logic is TDD'd (0.1, 1.1); rendered Astro/JSX is verified via `tsc`, `build`, and Playwright (1.4, 3.4) rather than fabricated markup unit tests.
