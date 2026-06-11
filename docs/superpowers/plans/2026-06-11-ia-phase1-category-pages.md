# Public IA Redesign — Phase 1: Category Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five additive category pages (`/adult/leagues`, `/adult/pickup`, `/adult/tournaments`, `/youth/leagues`, `/youth/camps`) that reuse the existing finder components, per the approved spec `docs/superpowers/specs/2026-06-11-public-ia-redesign-design.md`.

**Architecture:** Each category page is an SSR Astro page (hero + canonical + cross-audience link) hosting one React island. A new `CategoryFinder` island fetches `/api/public/seasons?status=open`, scopes by audience + program types via new pure helpers in `src/lib/programs/category-pages.ts`, optionally adds an Age chip row (youth), sorts by registration deadline, and delegates rendering to the existing `SeasonsFinderSection`. A thin `PickupPageFinder` island does the same for `/adult/pickup` over the existing `PickupFinderSection`. Empty catalog → `CategoryEmptyState` newsletter capture posting to the existing `/api/public/newsletter`. **Nothing existing changes behavior** — no nav edits, no redirects, no schema changes (those are Phases 2–3).

**Tech Stack:** Astro 5 SSR pages, React 19 islands, existing `/api/public/seasons` + `/api/dropin/sessions` + `/api/public/newsletter` endpoints, Vitest (unit), Playwright (e2e).

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/programs/category-pages.ts` (create) | Pure helpers: audience/type scoping, age-band overlap, deadline sort, age-band chip constants. Unit-testable, no React. |
| `tests/unit/category-pages.test.ts` (create) | Unit tests for the helpers. |
| `src/components/landing/category-finder.tsx` (create) | Top-level island for seasons-backed category pages. Fetch → scope → sort → optional Age chips → `SeasonsFinderSection`. |
| `src/components/landing/pickup-page-finder.tsx` (create) | Top-level island for `/adult/pickup`. Fetch drop-ins → adult filter → `PickupFinderSection`. |
| `src/pages/adult/leagues.astro`, `src/pages/adult/tournaments.astro`, `src/pages/adult/pickup.astro`, `src/pages/youth/leagues.astro`, `src/pages/youth/camps.astro` (create) | The five category pages. |
| `src/components/landing/youth-finder.tsx` (modify) | Delete its private `inBand` copy; import the shared helper (DRY). |
| `tests/e2e/category-pages.spec.ts` (create) | Playwright coverage of the new routes. |

Notes that bind every task:

- **Routing:** `src/pages/adult.astro` and `src/pages/adult/leagues.astro` coexist in Astro — `/adult` and `/adult/leagues` are separate routes. Same for `youth`.
- **SSR:** no `prerender` flag on the new pages, matching `src/pages/adult.astro` (multi-tenant host-scoped endpoints; see its header comment).
- **Program-type sets** (from `PROGRAM_TYPE_LABELS` in `seasons-finder-section.tsx`): adult leagues `["league"]`; adult tournaments `["tournament"]`; youth leagues & classes `["league", "training", "clinic"]`; youth camps `["camp"]`.
- **Repo conventions:** `useHydrationBeacon()` in every top-level island; `waitForHydration(page)` before any e2e interaction; element clicks over keypresses.

---

### Task 1: Branch setup + commit the spec

The main checkout currently sits on `chore/nav-cta-relabel`. Per repo branch hygiene, do not build on it and do not switch it off a branch with an open PR.

**Files:**
- Commit (already written, untracked): `docs/superpowers/specs/2026-06-11-public-ia-redesign-design.md`

- [ ] **Step 1: Check whether the current branch's PR is still open**

Run: `git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app branch --show-current && gh pr list --head chore/nav-cta-relabel --state open`

- [ ] **Step 2: Create the working branch from origin/main**

If Step 1 showed **no open PR** (merged/closed), switch the main checkout:

```bash
git fetch origin
git switch -c feat/ia-category-pages origin/main
```

If there **is** an open PR, create a worktree instead (sandbox note: worktree creation needs `dangerouslyDisableSandbox` per `env-git-worktree-sigbus` memory; worktrees lack `node_modules`/`.env`, so run test commands from the main checkout or lean on CI):

```bash
git worktree add .claude/worktrees/ia-category-pages -b feat/ia-category-pages origin/main
```

All subsequent paths are relative to whichever checkout holds `feat/ia-category-pages`.

- [ ] **Step 3: Commit the spec**

The spec file was written in the main checkout; if using a worktree, copy it in first.

```bash
git add docs/superpowers/specs/2026-06-11-public-ia-redesign-design.md docs/superpowers/plans/2026-06-11-ia-phase1-category-pages.md
git commit -m "docs: public IA redesign spec + phase 1 plan"
```

### Task 2: Category-page helpers (pure lib)

**Files:**
- Create: `src/lib/programs/category-pages.ts`
- Test: `tests/unit/category-pages.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/category-pages.test.ts
import { describe, expect, it } from "vitest"
import type { ApiSeason } from "@/components/landing/adult-finder"
import {
  AGE_BAND_CHIPS,
  byRegistrationCloses,
  inAgeBand,
  scopeSeasons,
} from "@/lib/programs/category-pages"

/** Minimal ApiSeason factory — only the fields the helpers read, the rest stubbed. */
function makeSeason(over: {
  id: string
  programType: string
  audienceType: string
  minAge?: number
  maxAge?: number
  registrationCloses?: string | null
  startDate?: string
}): ApiSeason {
  return {
    id: over.id,
    name: over.id,
    slug: over.id,
    startDate: over.startDate ?? "2026-09-01",
    endDate: "2026-11-01",
    price: 100,
    teamPrice: null,
    scheduleNotes: null,
    registeredCount: 0,
    maxParticipants: null,
    pricingMode: "individual",
    registrationCloses: over.registrationCloses ?? null,
    program: {
      id: "p",
      name: "p",
      slug: "p",
      programType: over.programType,
      audienceType: over.audienceType,
    },
    sport: { id: "s", name: "Soccer", slug: "soccer", icon: null, color: null },
    location: { id: "l", name: "Downtown", slug: "downtown", city: null, state: null },
    ageGroup:
      over.minAge !== undefined && over.maxAge !== undefined
        ? { id: "a", name: "band", minAge: over.minAge, maxAge: over.maxAge }
        : null,
  } as ApiSeason
}

describe("scopeSeasons", () => {
  const seasons = [
    makeSeason({ id: "adult-league", programType: "league", audienceType: "adult" }),
    makeSeason({ id: "adult-tourney", programType: "tournament", audienceType: "adult" }),
    makeSeason({ id: "youth-league", programType: "league", audienceType: "youth", minAge: 6, maxAge: 8 }),
    makeSeason({ id: "youth-camp", programType: "camp", audienceType: "youth", minAge: 6, maxAge: 12 }),
  ]

  it("filters by audience AND program type", () => {
    expect(scopeSeasons(seasons, "adult", ["league"]).map((s) => s.id)).toEqual(["adult-league"])
  })

  it("accepts multiple program types (youth leagues & classes)", () => {
    expect(scopeSeasons(seasons, "youth", ["league", "training", "clinic"]).map((s) => s.id)).toEqual([
      "youth-league",
    ])
  })

  it("returns empty for a type with no inventory", () => {
    expect(scopeSeasons(seasons, "adult", ["camp"])).toEqual([])
  })
})

describe("inAgeBand", () => {
  it("matches on range overlap", () => {
    const u8 = makeSeason({ id: "u8", programType: "league", audienceType: "youth", minAge: 6, maxAge: 8 })
    expect(inAgeBand(u8, 4, 8)).toBe(true)
    expect(inAgeBand(u8, 9, 12)).toBe(false)
  })

  it("a season without an age group matches every band", () => {
    const open = makeSeason({ id: "open", programType: "league", audienceType: "youth" })
    for (const band of AGE_BAND_CHIPS) expect(inAgeBand(open, band.min, band.max)).toBe(true)
  })
})

describe("byRegistrationCloses", () => {
  it("sorts soonest deadline first, no-deadline last, ties by startDate", () => {
    const sorted = [
      makeSeason({ id: "none", registrationCloses: null, startDate: "2026-08-01" }),
      makeSeason({ id: "late", registrationCloses: "2026-08-20", programType: "league", audienceType: "adult" }),
      makeSeason({ id: "soon", registrationCloses: "2026-07-01", programType: "league", audienceType: "adult" }),
      makeSeason({ id: "none-earlier", registrationCloses: null, startDate: "2026-07-15" }),
    ].sort(byRegistrationCloses)
    expect(sorted.map((s) => s.id)).toEqual(["soon", "late", "none-earlier", "none"])
  })
})
```

(The `makeSeason` calls in the sort test omit `programType`/`audienceType` for the two "none" rows — add `programType: "league", audienceType: "adult"` to them so the factory's required args are satisfied.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/category-pages.test.ts`
Expected: FAIL — cannot resolve `@/lib/programs/category-pages`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/programs/category-pages.ts
import { deriveAudience } from "@/lib/programs/derive"
import type { ApiSeason } from "@/components/landing/adult-finder"

/**
 * Pure helpers behind the audience-scoped category pages
 * (/adult/leagues, /youth/camps, …). See
 * docs/superpowers/specs/2026-06-11-public-ia-redesign-design.md.
 */

export type CategoryAudience = "adult" | "youth"

export interface AgeBandChip {
  value: string
  label: string
  min: number
  max: number
}

/** Same bands as the /youth finder sections — kept as chips here because on
 *  category pages age is a filter, not a page axis. */
export const AGE_BAND_CHIPS: AgeBandChip[] = [
  { value: "4-8", label: "Ages 4–8", min: 4, max: 8 },
  { value: "9-12", label: "Ages 9–12", min: 9, max: 12 },
  { value: "13-18", label: "Ages 13–18", min: 13, max: 18 },
]

/** A season belongs to a band if its age range overlaps the band's range.
 *  A season with no age group applies to any age — never hidden. */
export function inAgeBand(s: ApiSeason, min: number, max: number): boolean {
  if (!s.ageGroup) return true
  return s.ageGroup.minAge <= max && s.ageGroup.maxAge >= min
}

/** Audience + program-type scope for one category page. */
export function scopeSeasons(
  seasons: ApiSeason[],
  audience: CategoryAudience,
  programTypes: string[],
): ApiSeason[] {
  return seasons.filter(
    (s) => deriveAudience(s) === audience && programTypes.includes(s.program.programType),
  )
}

/** Soonest registration deadline first; seasons without a deadline last,
 *  ties broken by start date. Keeps "about to close" inventory on top. */
export function byRegistrationCloses(a: ApiSeason, b: ApiSeason): number {
  const aT = a.registrationCloses ? Date.parse(a.registrationCloses) : Number.POSITIVE_INFINITY
  const bT = b.registrationCloses ? Date.parse(b.registrationCloses) : Number.POSITIVE_INFINITY
  if (aT !== bT) return aT - bT
  return Date.parse(a.startDate) - Date.parse(b.startDate)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/category-pages.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/programs/category-pages.ts tests/unit/category-pages.test.ts
git commit -m "feat(ia): category-page scoping helpers"
```

### Task 3: ~~CategoryEmptyState~~ — SUPERSEDED, skip

Commit `8a2705ea` (merged to main 2026-06-11, after this plan was drafted) already added
`src/components/landing/empty-notify-form.tsx` and an `emptyCtaAudience` prop on
`SeasonsFinderSection`: when set, the "nothing open" empty state renders the email-capture
form with `source={'empty-finder-' + id}`. CategoryFinder reuses that instead of a new
component (see Task 4). No work in this task.

### Task 4: CategoryFinder island

**Files:**
- Create: `src/components/landing/category-finder.tsx`

- [ ] **Step 1: Write the island**

```tsx
// src/components/landing/category-finder.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import {
  AGE_BAND_CHIPS,
  byRegistrationCloses,
  inAgeBand,
  scopeSeasons,
  type CategoryAudience,
} from "@/lib/programs/category-pages"
import { SeasonsFinderSection } from "./seasons-finder-section"
import { FilterChips, type ChipOption } from "./filter-chips"
import type { ApiSeason } from "./adult-finder"

/**
 * The island behind an audience-scoped category page (/adult/leagues,
 * /youth/camps, …). Fetches the open-seasons catalog once, scopes it to
 * this page's audience + program types, sorts soonest-deadline-first, and
 * renders the existing SeasonsFinderSection (which owns the Format/Sport/
 * Venue chips, pagination, and the empty states — including the
 * email-capture form via emptyCtaAudience when the whole catalog is empty).
 * Youth pages add an Age chip row above the section — on category pages age
 * is a filter, not a page axis.
 */

interface CategoryFinderProps {
  audience: CategoryAudience
  programTypes: string[]
  /** Section heading, e.g. "Open now". */
  title: string
  descriptor: string
  /** Show the Age chip row (youth pages). */
  ageChips?: boolean
  /** Section anchor id, e.g. "adult-leagues". Also drives the empty-state
   *  signup attribution: newsletter source = "empty-finder-<sectionId>". */
  sectionId: string
}

export default function CategoryFinder({
  audience,
  programTypes,
  title,
  descriptor,
  ageChips = false,
  sectionId,
}: CategoryFinderProps) {
  useHydrationBeacon()

  const [seasons, setSeasons] = useState<ApiSeason[]>([])
  const [loading, setLoading] = useState(true)
  const [activeBand, setActiveBand] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/public/seasons?status=open")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { seasons: ApiSeason[] }) => {
        if (!cancelled) setSeasons(j.seasons)
      })
      .catch(() => {
        // Silent — the empty state below covers the failure mode too.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const scoped = useMemo(
    () => [...scopeSeasons(seasons, audience, programTypes)].sort(byRegistrationCloses),
    [seasons, audience, programTypes],
  )

  const bandOptions: ChipOption[] = useMemo(
    () =>
      AGE_BAND_CHIPS.map((b) => ({
        value: b.value,
        label: b.label,
        count: scoped.filter((s) => inAgeBand(s, b.min, b.max)).length,
      })).filter((o) => o.count > 0),
    [scoped],
  )

  const visible = useMemo(() => {
    if (!ageChips || !activeBand) return scoped
    const band = AGE_BAND_CHIPS.find((b) => b.value === activeBand)
    if (!band) return scoped
    return scoped.filter((s) => inAgeBand(s, band.min, band.max))
  }, [scoped, ageChips, activeBand])

  return (
    <div>
      {ageChips && !loading && (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 -mb-4">
          <FilterChips label="Age" options={bandOptions} active={activeBand} onChange={setActiveBand} />
        </div>
      )}
      <SeasonsFinderSection
        id={sectionId}
        title={title}
        descriptor={descriptor}
        seasons={visible}
        loading={loading}
        emptyCtaAudience={audience === "youth" ? "parent" : "adult"}
      />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/category-finder.tsx
git commit -m "feat(ia): CategoryFinder island for audience-scoped category pages"
```

### Task 5: Adult seasons pages (/adult/leagues, /adult/tournaments)

**Files:**
- Create: `src/pages/adult/leagues.astro`
- Create: `src/pages/adult/tournaments.astro`

- [ ] **Step 1: Write /adult/leagues**

```astro
---
// SSR like /adult — the island fetches host-scoped public endpoints
// client-side; keep request-time rendering (no prerender flag).
import BaseLayout from "@/layouts/BaseLayout.astro";
import CategoryFinder from "@/components/landing/category-finder.tsx";
import CTABanner from "@/components/cta-banner";
---

<BaseLayout
  title="Adult Leagues — Aspire Sports"
  description="Adult sports leagues in Columbus and central Ohio. Organized seasons, fair refs, team and free-agent signup — find your league night."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/adult/leagues`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <section class="bg-gradient-to-br from-ink to-zinc-700 text-cream pt-28 pb-12">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <p class="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange mb-4">
          <a href="/adult" class="hover:underline">Adult Sports</a> · Central Ohio
        </p>
        <h1
          class="font-display max-w-3xl"
          style="font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.05; letter-spacing: -0.03em;"
        >
          Adult leagues.
        </h1>
        <p class="mt-4 text-lg text-cream/85 max-w-2xl">
          Season-long play with fair refs, reliable scheduling, and a post-game
          scene worth staying for. Sign up a full team or join as a free agent.
        </p>
        <p class="mt-3 text-sm text-cream/60">
          Looking for <a href="/youth/leagues" class="underline hover:text-cream">youth leagues</a>?
        </p>
      </div>
    </section>

    <CategoryFinder
      client:load
      audience="adult"
      programTypes={["league"]}
      title="Open now"
      descriptor="Sign up a full team or join as a free agent."
      sectionId="adult-leagues"
    />

    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 2: Write /adult/tournaments**

Same file shape; only the fields below differ:

```astro
---
// SSR like /adult — the island fetches host-scoped public endpoints
// client-side; keep request-time rendering (no prerender flag).
import BaseLayout from "@/layouts/BaseLayout.astro";
import CategoryFinder from "@/components/landing/category-finder.tsx";
import CTABanner from "@/components/cta-banner";
---

<BaseLayout
  title="Adult Tournaments — Aspire Sports"
  description="One-day adult sports tournaments in Columbus and central Ohio. Bring a full team or sign up solo and get placed."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/adult/tournaments`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <section class="bg-gradient-to-br from-ink to-zinc-700 text-cream pt-28 pb-12">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <p class="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange mb-4">
          <a href="/adult" class="hover:underline">Adult Sports</a> · Central Ohio
        </p>
        <h1
          class="font-display max-w-3xl"
          style="font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.05; letter-spacing: -0.03em;"
        >
          Adult tournaments.
        </h1>
        <p class="mt-4 text-lg text-cream/85 max-w-2xl">
          One-day events — a full bracket, fair refs, and a winner by sundown.
          Bring a team or sign up and get placed.
        </p>
        <p class="mt-3 text-sm text-cream/60">
          Want season-long play instead? <a href="/adult/leagues" class="underline hover:text-cream">Adult leagues</a>.
        </p>
      </div>
    </section>

    <CategoryFinder
      client:load
      audience="adult"
      programTypes={["tournament"]}
      title="Open now"
      descriptor="Bring a team or sign up and get placed."
      sectionId="adult-tournaments"
    />

    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 3: Smoke-check both routes**

With the dev server running (`npm run dev`):
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/adult/leagues && curl -s -o /dev/null -w " %{http_code}" http://localhost:4321/adult/tournaments`
Expected: `200 200`

- [ ] **Step 4: Commit**

```bash
git add src/pages/adult/leagues.astro src/pages/adult/tournaments.astro
git commit -m "feat(ia): /adult/leagues and /adult/tournaments category pages"
```

### Task 6: Pickup page (/adult/pickup)

**Files:**
- Create: `src/components/landing/pickup-page-finder.tsx`
- Create: `src/pages/adult/pickup.astro`

- [ ] **Step 1: Write the island**

The fetch + adult filter logic mirrors the Pickup half of `adult-finder.tsx` (`src/components/landing/adult-finder.tsx:92-110,140-142`):

```tsx
// src/components/landing/pickup-page-finder.tsx
"use client"

import { useEffect, useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import type { SessionCardData } from "@/components/dropin/SessionCard"
import { PickupFinderSection } from "./pickup-finder-section"

/**
 * The island behind /adult/pickup. Same data + adult filter as the Pickup
 * section of the /adult finder, without the section-nav/scroll-spy — this
 * page IS the section.
 */

interface DropInApiResponse {
  sessions: SessionCardData[]
  defaults: { defaultSessionRateCents: number; defaultMemberRateCents: number } | null
}

export default function PickupPageFinder() {
  useHydrationBeacon()

  const [sessions, setSessions] = useState<SessionCardData[]>([])
  const [defaultRate, setDefaultRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/dropin/sessions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: DropInApiResponse) => {
        if (cancelled) return
        setSessions(j.sessions)
        setDefaultRate(j.defaults?.defaultSessionRateCents ?? null)
      })
      .catch(() => {
        // Silent — the section renders its own empty state.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Adult / all-ages pickup only (the endpoint returns classes and youth too).
  const adultPickup = sessions.filter((s) => s.kind === "pickup" && s.audience !== "youth")

  return (
    <PickupFinderSection
      id="sessions"
      icon="🟢"
      title="Next two weeks"
      descriptor="Show up and play. No commitment."
      sessions={adultPickup}
      defaultSessionRateCents={defaultRate}
      loading={loading}
    />
  )
}
```

- [ ] **Step 2: Write the page**

```astro
---
// src/pages/adult/pickup.astro
// SSR — /api/dropin/sessions is org-scoped via the request host.
import BaseLayout from "@/layouts/BaseLayout.astro";
import PickupPageFinder from "@/components/landing/pickup-page-finder.tsx";
import CTABanner from "@/components/cta-banner";
---

<BaseLayout
  title="Pickup — Aspire Sports"
  description="Drop-in pickup sessions in Columbus and central Ohio. Pay per session, show up and play — no season commitment."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/adult/pickup`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <section class="bg-gradient-to-br from-ink to-zinc-700 text-cream pt-28 pb-12">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <p class="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange mb-4">
          <a href="/adult" class="hover:underline">Adult Sports</a> · Central Ohio
        </p>
        <h1
          class="font-display max-w-3xl"
          style="font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.05; letter-spacing: -0.03em;"
        >
          Pickup.
        </h1>
        <p class="mt-4 text-lg text-cream/85 max-w-2xl">
          No season commitment, no roster, no pressure — pay per session, show
          up, and play.
        </p>
        <p class="mt-3 text-sm text-cream/60">
          Ready for a season? <a href="/adult/leagues" class="underline hover:text-cream">Adult leagues</a>.
        </p>
      </div>
    </section>

    <PickupPageFinder client:load />

    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 3: Smoke-check the route**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/adult/pickup`
Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/pickup-page-finder.tsx src/pages/adult/pickup.astro
git commit -m "feat(ia): /adult/pickup category page"
```

### Task 7: Youth pages (/youth/leagues, /youth/camps) + DRY the band helper

**Files:**
- Create: `src/pages/youth/leagues.astro`
- Create: `src/pages/youth/camps.astro`
- Modify: `src/components/landing/youth-finder.tsx:60-66` (replace private `inBand` with the shared helper)

- [ ] **Step 1: Write /youth/leagues**

```astro
---
// SSR like /youth — the island fetches host-scoped public endpoints
// client-side; keep request-time rendering (no prerender flag).
import BaseLayout from "@/layouts/BaseLayout.astro";
import CategoryFinder from "@/components/landing/category-finder.tsx";
import CTABanner from "@/components/cta-banner";
---

<BaseLayout
  title="Youth Leagues & Classes — Aspire Sports"
  description="Youth sports leagues and skill-building classes in Columbus and central Ohio. Vetted coaches, organized seasons, sorted by your kid's age."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/youth/leagues`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <section class="bg-gradient-to-br from-ink to-zinc-700 text-cream pt-28 pb-12">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <p class="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange mb-4">
          <a href="/youth" class="hover:underline">Youth Sports</a> · Central Ohio
        </p>
        <h1
          class="font-display max-w-3xl"
          style="font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.05; letter-spacing: -0.03em;"
        >
          Youth leagues &amp; classes.
        </h1>
        <p class="mt-4 text-lg text-cream/85 max-w-2xl">
          Season leagues and skill-building classes with vetted coaches and
          tight logistics. Filter by your kid's age and go.
        </p>
        <p class="mt-3 text-sm text-cream/60">
          School breaks coming up? <a href="/youth/camps" class="underline hover:text-cream">Youth camps</a>.
        </p>
      </div>
    </section>

    <CategoryFinder
      client:load
      audience="youth"
      programTypes={["league", "training", "clinic"]}
      title="Open now"
      descriptor="Leagues, classes, and clinics — filter by age, sport, and venue."
      ageChips
      sectionId="youth-leagues"
    />

    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 2: Write /youth/camps**

Same shape; differing fields:

```astro
---
// SSR like /youth — the island fetches host-scoped public endpoints
// client-side; keep request-time rendering (no prerender flag).
import BaseLayout from "@/layouts/BaseLayout.astro";
import CategoryFinder from "@/components/landing/category-finder.tsx";
import CTABanner from "@/components/cta-banner";
---

<BaseLayout
  title="Youth Camps — Aspire Sports"
  description="Youth sports camps in Columbus and central Ohio — school-break and summer day camps, coached properly, organized tightly."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/youth/camps`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <section class="bg-gradient-to-br from-ink to-zinc-700 text-cream pt-28 pb-12">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <p class="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange mb-4">
          <a href="/youth" class="hover:underline">Youth Sports</a> · Central Ohio
        </p>
        <h1
          class="font-display max-w-3xl"
          style="font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.05; letter-spacing: -0.03em;"
        >
          Youth camps.
        </h1>
        <p class="mt-4 text-lg text-cream/85 max-w-2xl">
          Full days of play for school breaks and summer — real coaching,
          tight drop-off and pick-up logistics, zero chaos.
        </p>
        <p class="mt-3 text-sm text-cream/60">
          Looking for a season instead? <a href="/youth/leagues" class="underline hover:text-cream">Youth leagues &amp; classes</a>.
        </p>
      </div>
    </section>

    <CategoryFinder
      client:load
      audience="youth"
      programTypes={["camp"]}
      title="Open now"
      descriptor="School-break and summer camps, filterable by age and venue."
      ageChips
      sectionId="youth-camps"
    />

    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 3: DRY — point youth-finder at the shared band helper**

In `src/components/landing/youth-finder.tsx`: delete the private `inBand` function (lines 60–66) and its doc comment, add the import, and rename the one call site:

```tsx
import { inAgeBand } from "@/lib/programs/category-pages"
```

```tsx
          seasons={youthSeasons.filter((s) => inAgeBand(s, band.min, band.max))}
```

(Identical logic, now unit-tested in `tests/unit/category-pages.test.ts`.)

- [ ] **Step 4: Smoke-check routes + type-check**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/youth/leagues && curl -s -o /dev/null -w " %{http_code}" http://localhost:4321/youth/camps && npx tsc --noEmit`
Expected: `200 200`, 0 type errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/youth/leagues.astro src/pages/youth/camps.astro src/components/landing/youth-finder.tsx
git commit -m "feat(ia): /youth/leagues and /youth/camps category pages"
```

### Task 8: E2E coverage

**Files:**
- Create: `tests/e2e/category-pages.spec.ts`

Seed facts this spec relies on (`src/lib/db/seeds/seed-e2e-tests.ts`): an open adult league season "Adult Open Soccer 2026" and an open youth league season "E2E Test Spring 2026" exist; **no camp programs exist**, so `/youth/camps` deterministically renders the empty state with the `EmptyNotifyForm` capture.

- [ ] **Step 1: Write the spec**

```typescript
// tests/e2e/category-pages.spec.ts
import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

/**
 * Phase-1 category pages (/adult/leagues, /adult/pickup, /adult/tournaments,
 * /youth/leagues, /youth/camps): additive routes that scope the seasons
 * catalog by audience + program type. Heroes are server-rendered; the card
 * grid / empty state comes from the CategoryFinder island after hydration.
 */

test.describe("Category pages", () => {
  test("/adult/leagues — hero, cross-link, league card from the catalog", async ({ page }) => {
    await page.goto("/adult/leagues", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /adult leagues/i })).toBeVisible();
    await expect(page.locator('a[href="/youth/leagues"]')).toBeVisible();

    await waitForHydration(page);
    await expect(page.getByText(/Adult Open Soccer/).first()).toBeVisible();
  });

  test("/adult/leagues — venue chip filters the grid", async ({ page }) => {
    await page.goto("/adult/leagues", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.getByText(/Adult Open Soccer/).first()).toBeVisible();

    // Chip rows auto-hide when they have ≤1 option, so only assert behavior
    // when a Sport/Venue chip row is present: clicking "All" is always safe.
    const allChips = page.getByRole("button", { name: "All" });
    if ((await allChips.count()) > 0) {
      await allChips.first().click();
      await expect(page.getByText(/Adult Open Soccer/).first()).toBeVisible();
    }
  });

  test("/adult/tournaments — renders (cards or empty state)", async ({ page }) => {
    await page.goto("/adult/tournaments", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /adult tournaments/i })).toBeVisible();
    await waitForHydration(page);
  });

  test("/adult/pickup — hero and section render", async ({ page }) => {
    await page.goto("/adult/pickup", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^pickup\.?$/i })).toBeVisible();
    await expect(page.locator('a[href="/adult/leagues"]')).toBeVisible();
    await waitForHydration(page);
  });

  test("/youth/leagues — hero, youth card from the catalog", async ({ page }) => {
    await page.goto("/youth/leagues", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /youth leagues/i })).toBeVisible();
    await waitForHydration(page);
    await expect(page.getByText(/E2E Test Spring 2026/).first()).toBeVisible();
  });

  test("/youth/camps — empty catalog captures email", async ({ page }) => {
    await page.goto("/youth/camps", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Seed has no camp programs → empty state with EmptyNotifyForm renders.
    await expect(page.getByText(/nothing open right now/i)).toBeVisible();
    await page.getByLabel("Email address").fill("camps-waitlist-e2e@test.aspiresports.com");
    await page.getByRole("button", { name: /notify me/i }).click();
    await expect(page.getByText(/you're on the list/i)).toBeVisible();
  });
});
```

- [ ] **Step 2: Re-seed and run the spec**

With the dev server up:

```bash
npm run db:seed:e2e
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/category-pages.spec.ts
```

Expected: 6 passed. If a card-name assertion fails, check the actual rendered season names with `npx playwright test --headed` against the seeded DB before changing the assertion — the seed names above were read from `seed-e2e-tests.ts` at plan time.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/category-pages.spec.ts
git commit -m "test(ia): e2e coverage for phase-1 category pages"
```

### Task 9: Full verification + PR

- [ ] **Step 1: Run the pre-push checks**

```bash
npx tsc --noEmit                                        # expected: 0 errors
npm run build                                           # expected: success (prerender warnings are known noise)
npm run db:seed:e2e                                     # idempotent re-seed
CRON_SECRET=<same-as-dev-server> TEST_BASE_URL=http://localhost:4321 npm run test:api   # expected: all pass (no API changes — regression check)
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test      # expected: all pass, incl. category-pages.spec.ts
```

No schema files were touched, so no migration is needed (verify: `git diff origin/main --stat -- src/lib/db/schema/` is empty).

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/ia-category-pages
gh pr create --title "Public IA phase 1: audience-scoped category pages" --body "$(cat <<'EOF'
Phase 1 of the public IA redesign (spec: docs/superpowers/specs/2026-06-11-public-ia-redesign-design.md).

Adds five additive routes — /adult/leagues, /adult/pickup, /adult/tournaments, /youth/leagues, /youth/camps — reusing the existing finder components scoped per page. Age is a filter chip on youth pages. Empty catalogs capture email into newsletter_signups. No nav changes, no redirects, no schema changes (Phases 2–3).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI green on the pushed commit**

Run: `gh pr checks --watch`
Expected: all checks pass. The task is not done until CI is green (note: Netlify PR checks fail intentionally per repo memory — that one is expected).

---

## Self-review (done at plan time)

- **Spec coverage:** Phase 1 scope only — five category pages ✓, finder reuse ✓, Age-chip flip for youth ✓, deadline-first sort ✓, empty-state newsletter capture ✓, SSR policy ✓, no nav/redirect/schema changes ✓. Hub slimming, nav dropdowns, `/sports` retirement are Phases 2–3 by design.
- **Type consistency:** `CategoryFinder` props match all five page usages; `inAgeBand`/`scopeSeasons`/`byRegistrationCloses` signatures match tests and call sites; `ApiSeason` imported from its real home (`adult-finder.tsx`).
- **Placeholders:** none — every code step contains complete code; the one conditional instruction (worktree vs switch) has exact commands for both arms.
- **Amended at execution time:** Task 3 superseded by commit `8a2705ea` on main (EmptyNotifyForm + emptyCtaAudience); CategoryFinder passes `sectionId` + `emptyCtaAudience` instead of a bespoke empty state. Task 1 done by controller (branch `feat/ia-category-pages`, docs committed).
