# Youth Leagues Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the youth soccer league funnel — a sport landing page with a U6–U19 age-group ladder, plus season and division pages — and split youth navigation into Leagues / Classes / Camps.

**Architecture:** Youth mirrors adult's existing route shape (`/youth/leagues/soccer/[term]/[division]`) so the season and division components are generalized with an `audience` parameter rather than duplicated. The age ladder is server-rendered static HTML carrying authored date ranges; a small inline script adds a month+year lookup and band filtering on top, reusing the existing `dispatchFinderFilter` event bus that hero tiles already use.

**Tech Stack:** Astro 5 (SSR, no prerender), React 19 islands, Tailwind CSS 4, Vitest for unit tests, Playwright for E2E.

## Global Constraints

- **Age groups are authored constants for the 2026–27 seasonal year (Aug 1 – Jul 31).** Never compute them from `age_groups.minAge`/`maxAge` — those cannot express an Aug–Jul window.
- **No format claims anywhere.** No roster size (6v6, 11v11), ball size, field size, or game length in any youth copy. This is a deliberate spec decision; `seasons` has no format column.
- **No `seasons` schema changes in this phase.** No migration is generated.
- **All new pages are SSR.** Never add `export const prerender = true` — they read request-time organization context.
- **The ladder never reads live inventory.** It is static HTML; only the divisions finder below it touches the catalog.
- **Director of Coaching and the developmental pathway do not appear on any league surface.** They belong to classes/camps in Phase 2.
- **Any new `findFirst` / `.limit(1)` needs an explicit `orderBy`** — the CI database accumulates rows across runs.
- Spec: `docs/superpowers/specs/2026-08-16-youth-leagues-redesign-design.md`

---

## File Structure

**Created:**
- `src/lib/leagues/youth-age-groups.ts` — the 14 authored groups + pure birth-date → group resolver
- `src/components/youth/age-group-ladder.astro` — static ladder table + lookup script
- `src/pages/youth/leagues/soccer/index.astro` — sport landing page
- `src/pages/youth/leagues/soccer/[term].astro` — season page, dual framing
- `src/pages/youth/leagues/soccer/[term]/[division].astro` — division leaf
- `src/pages/youth/classes.astro` — classes finder page
- `tests/unit/youth-age-groups.test.ts`
- `tests/unit/division-slug-youth.test.ts`
- `tests/e2e/youth-leagues.spec.ts`

**Modified:**
- `src/lib/landing/finder-filter.ts` — add optional `ageGroup` to the event detail
- `src/components/landing/category-finder.tsx` — honour `ageGroup` filter
- `src/lib/leagues/division-slug.ts` — youth genders, age-group tier, audience-aware naming
- `src/lib/leagues/division-page-data.ts` — accept an `audience` parameter
- `src/components/navigation.tsx:114-135` — three youth nav items
- `src/pages/youth/leagues.astro` — narrow `programTypes` to `["league"]`, link tile to the sport page
- `src/pages/youth.astro` — third door for Classes

---

### Task 1: Youth age-group constants and resolver

**Files:**
- Create: `src/lib/leagues/youth-age-groups.ts`
- Test: `tests/unit/youth-age-groups.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `YOUTH_AGE_GROUPS: YouthAgeGroup[]`, `resolveAgeGroup(birthMonth: number, birthYear: number): YouthAgeGroup | null`, `SEASONAL_YEAR_START: number`, `type YouthAgeGroup = { key: string; label: string; bornFrom: string; bornTo: string; rangeLabel: string }`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/youth-age-groups.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import {
  YOUTH_AGE_GROUPS,
  resolveAgeGroup,
} from "@/lib/leagues/youth-age-groups"

describe("YOUTH_AGE_GROUPS", () => {
  it("covers U6 through U19 with no gaps", () => {
    expect(YOUTH_AGE_GROUPS).toHaveLength(14)
    expect(YOUTH_AGE_GROUPS[0].key).toBe("u6")
    expect(YOUTH_AGE_GROUPS[13].key).toBe("u19")
  })

  it("uses the Aug 1 - Jul 31 window for the 2026-27 seasonal year", () => {
    const u10 = YOUTH_AGE_GROUPS.find((g) => g.key === "u10")!
    expect(u10.bornFrom).toBe("2016-08-01")
    expect(u10.bornTo).toBe("2017-07-31")
    expect(u10.label).toBe("U10")
  })

  it("gives every group a human range label", () => {
    const u6 = YOUTH_AGE_GROUPS.find((g) => g.key === "u6")!
    expect(u6.rangeLabel).toBe("Aug 1, 2020 – Jul 31, 2021")
  })
})

describe("resolveAgeGroup", () => {
  it("puts an Aug-Dec birthday in the group starting that year", () => {
    // Born Dec 2016 -> U10 (Aug 1 2016 - Jul 31 2017)
    expect(resolveAgeGroup(12, 2016)?.key).toBe("u10")
  })

  it("puts a Jan-Jul birthday in the group starting the previous year", () => {
    // Born Mar 2017 -> still U10
    expect(resolveAgeGroup(3, 2017)?.key).toBe("u10")
  })

  it("splits a single birth year across two groups", () => {
    // This is the whole point of the 2026-27 change.
    expect(resolveAgeGroup(9, 2017)?.key).toBe("u9")
    expect(resolveAgeGroup(3, 2017)?.key).toBe("u10")
  })

  it("resolves the youngest and oldest groups", () => {
    expect(resolveAgeGroup(8, 2020)?.key).toBe("u6")
    expect(resolveAgeGroup(7, 2008)?.key).toBe("u19")
  })

  it("returns null outside U6-U19", () => {
    expect(resolveAgeGroup(1, 2024)).toBeNull() // too young
    expect(resolveAgeGroup(1, 2000)).toBeNull() // too old
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/youth-age-groups.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/leagues/youth-age-groups"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/leagues/youth-age-groups.ts`:

```typescript
// Authored youth age groups for the 2026-27 seasonal year.
//
// US Soccer mandated calendar-year grouping from 2017 through 2025-26. That
// mandate was lifted in late 2024, and US Youth Soccer, US Club Soccer and
// AYSO all moved to an Aug 1 - Jul 31 window beginning with 2026-27 to
// realign groups with school grade.
//
// These are AUTHORED CONSTANTS, deliberately not derived from
// age_groups.minAge/maxAge — an integer age range cannot express an Aug-Jul
// window. Roll SEASONAL_YEAR_START forward each seasonal year.
//
// Consequence worth remembering: a birth YEAR no longer identifies a group.
// Someone born in 2017 is U9 (Aug-Dec) or U10 (Jan-Jul).

export interface YouthAgeGroup {
  /** URL/filter key, e.g. "u10". */
  key: string
  /** Display name, e.g. "U10". */
  label: string
  /** ISO date, inclusive start of the birth window. */
  bornFrom: string
  /** ISO date, inclusive end of the birth window. */
  bornTo: string
  /** Human range, e.g. "Aug 1, 2016 – Jul 31, 2017". */
  rangeLabel: string
}

/** First calendar year of the seasonal year: 2026 for the 2026-27 season. */
export const SEASONAL_YEAR_START = 2026

const YOUNGEST = 6
const OLDEST = 19

function buildGroup(n: number): YouthAgeGroup {
  const fromYear = SEASONAL_YEAR_START - n
  const toYear = fromYear + 1
  return {
    key: `u${n}`,
    label: `U${n}`,
    bornFrom: `${fromYear}-08-01`,
    bornTo: `${toYear}-07-31`,
    rangeLabel: `Aug 1, ${fromYear} – Jul 31, ${toYear}`,
  }
}

/** U6 (youngest) first through U19 (oldest) — the order the ladder renders. */
export const YOUTH_AGE_GROUPS: YouthAgeGroup[] = Array.from(
  { length: OLDEST - YOUNGEST + 1 },
  (_, i) => buildGroup(YOUNGEST + i),
)

/**
 * Resolve a birthday to its age group. `birthMonth` is 1-12.
 *
 * A birthday in Aug-Dec belongs to the window starting that calendar year;
 * Jan-Jul belongs to the window that started the previous year.
 */
export function resolveAgeGroup(
  birthMonth: number,
  birthYear: number,
): YouthAgeGroup | null {
  if (birthMonth < 1 || birthMonth > 12) return null
  const windowStartYear = birthMonth >= 8 ? birthYear : birthYear - 1
  const n = SEASONAL_YEAR_START - windowStartYear
  return YOUTH_AGE_GROUPS.find((g) => g.key === `u${n}`) ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/youth-age-groups.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/leagues/youth-age-groups.ts tests/unit/youth-age-groups.test.ts
git commit -m "feat(youth): authored U6-U19 age groups on the 2026-27 Aug-Jul window"
```

---

### Task 2: Age-group filtering in the finder event bus

**Files:**
- Modify: `src/lib/landing/finder-filter.ts:4-12`
- Modify: `src/components/landing/category-finder.tsx`
- Test: `tests/unit/category-finder-age-group.test.ts`

**Interfaces:**
- Consumes: `YOUTH_AGE_GROUPS` from Task 1
- Produces: `FinderFilterDetail.ageGroup?: string`; `matchesAgeGroup(season: ApiSeason, groupLabel: string | null): boolean` exported from `src/lib/programs/category-pages.ts`

The ladder needs to filter the finder by age group. `dispatchFinderFilter` already
carries `key` (sport) and an optional `location`; `ageGroup` follows the same
optional-field pattern, so finders that don't care ignore it.

Matching is on `ageGroup.name` (the DB `age_groups.name` column holds `'U6'`,
`'U8'`, …) rather than on age arithmetic, because integer ages cannot round-trip
an Aug–Jul window.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/category-finder-age-group.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { matchesAgeGroup } from "@/lib/programs/category-pages"
import type { ApiSeason } from "@/lib/programs/api-season"

function season(ageGroupName: string | null): ApiSeason {
  return {
    ageGroup: ageGroupName
      ? { id: "ag-1", name: ageGroupName, minAge: 8, maxAge: 9 }
      : null,
  } as unknown as ApiSeason
}

describe("matchesAgeGroup", () => {
  it("matches a season whose age group name equals the filter", () => {
    expect(matchesAgeGroup(season("U10"), "U10")).toBe(true)
  })

  it("rejects a season in a different age group", () => {
    expect(matchesAgeGroup(season("U12"), "U10")).toBe(false)
  })

  it("is case-insensitive so admin-entered casing can't hide a division", () => {
    expect(matchesAgeGroup(season("u10"), "U10")).toBe(true)
  })

  it("keeps seasons with no age group — they apply to any age", () => {
    expect(matchesAgeGroup(season(null), "U10")).toBe(true)
  })

  it("matches everything when no filter is active", () => {
    expect(matchesAgeGroup(season("U12"), null)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/category-finder-age-group.test.ts`
Expected: FAIL — `matchesAgeGroup is not a function`

- [ ] **Step 3: Add the matcher**

Append to `src/lib/programs/category-pages.ts`:

```typescript
/** Match a season against a U-group filter (e.g. "U10").
 *
 *  Compares against age_groups.name rather than deriving from minAge/maxAge:
 *  the 2026-27 Aug-Jul windows can't be expressed as integer age ranges.
 *  A season with no age group applies to any age — never hidden, mirroring
 *  inAgeBand above. */
export function matchesAgeGroup(s: ApiSeason, groupLabel: string | null): boolean {
  if (!groupLabel) return true
  if (!s.ageGroup) return true
  return s.ageGroup.name.toLowerCase() === groupLabel.toLowerCase()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/category-finder-age-group.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Add `ageGroup` to the event detail**

In `src/lib/landing/finder-filter.ts`, extend the interface (leave everything else untouched):

```typescript
export interface FinderFilterDetail {
  /** Sport slug (seasons) or sport/format word (pickup, SoccerOne) to filter to. */
  key: string
  /** Id of the finder <section> to scroll to and that should react. */
  sectionId: string
  /** Optional location slug (e.g. "worthington" | "downtown"). SoccerOne hero
   *  launchpad sets this; finders that don't filter by location ignore it. */
  location?: string
  /** Optional youth age-group label (e.g. "U10"), set by the age ladder.
   *  Finders that don't filter by age group ignore it. */
  ageGroup?: string
}
```

- [ ] **Step 6: Wire the filter into CategoryFinder**

In `src/components/landing/category-finder.tsx`:

1. Add `matchesAgeGroup` to the existing import from `@/lib/programs/category-pages`.
2. Add `onFinderFilter` to the imports: `import { onFinderFilter } from "@/lib/landing/finder-filter"`.
3. Add state beside the existing `activeBand` state:

```typescript
const [activeAgeGroup, setActiveAgeGroup] = useState<string | null>(null)
```

4. Subscribe, gating on `sectionId` so another section's dispatch is a no-op:

```typescript
useEffect(() => {
  return onFinderFilter((detail) => {
    if (detail.sectionId !== sectionId) return
    setActiveAgeGroup(detail.ageGroup ?? null)
  })
}, [sectionId])
```

5. In the `useMemo` that scopes seasons, apply the matcher after the existing
   `scopeSeasons` / `inAgeBand` filtering:

```typescript
.filter((s) => matchesAgeGroup(s, activeAgeGroup))
```

   and add `activeAgeGroup` to that `useMemo` dependency array.

- [ ] **Step 7: Verify nothing regressed**

Run: `npx vitest run tests/unit/ && npx tsc --noEmit`
Expected: all unit tests PASS, zero TypeScript errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/landing/finder-filter.ts src/lib/programs/category-pages.ts src/components/landing/category-finder.tsx tests/unit/category-finder-age-group.test.ts
git commit -m "feat(youth): age-group filtering in the finder event bus"
```

---

### Task 3: The age-group ladder component

**Files:**
- Create: `src/components/youth/age-group-ladder.astro`

**Interfaces:**
- Consumes: `YOUTH_AGE_GROUPS`, `resolveAgeGroup` (Task 1); `dispatchFinderFilter` (Task 2)
- Produces: `<AgeGroupLadder finderId="youth-soccer-divisions" sportKey="soccer" />`

The table renders server-side so it is crawlable and correct with JS off. The
lookup and band filtering are progressive enhancement in an inline `<script>` —
no React island, because the whole point is that this content is static.

- [ ] **Step 1: Create the component**

Create `src/components/youth/age-group-ladder.astro`:

```astro
---
// Static U6-U19 age-group ladder. Server-rendered HTML — never reads live
// inventory, so it cannot go stale. The month+year lookup below is pure
// client-side date arithmetic against authored constants.
import { YOUTH_AGE_GROUPS } from "@/lib/leagues/youth-age-groups"

interface Props {
  /** Id of the divisions <section> a band click should filter and scroll to. */
  finderId: string
  /** Sport slug passed through on the filter event. */
  sportKey: string
}
const { finderId, sportKey } = Astro.props

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
// Birth years that can land inside U6-U19, newest first.
const YEARS = YOUTH_AGE_GROUPS.flatMap((g) => [
  Number(g.bornFrom.slice(0, 4)),
  Number(g.bornTo.slice(0, 4)),
])
const YEAR_OPTIONS = [...new Set(YEARS)].sort((a, b) => b - a)
---

<section class="bg-cream py-14 px-6" aria-labelledby="age-groups-heading" data-age-ladder data-finder={finderId} data-sport={sportKey}>
  <div class="max-w-[1080px] mx-auto">
    <h2 id="age-groups-heading" class="font-display text-3xl text-ink mb-2">Which group is my kid in?</h2>
    <p class="text-[14px] text-ink-2 max-w-[620px] mb-6">
      The age groups changed for the 2026&ndash;27 season. Groups now run
      <b class="text-ink">August 1 to July 31</b> instead of by calendar year, so
      kids born August through December generally moved down a group and those
      born January through July moved up. Find your kid&rsquo;s birthday below.
    </p>

    <div class="rounded-2xl border border-border bg-paper p-4 mb-7 max-w-[520px]">
      <label class="font-mono text-[10px] tracking-widest uppercase text-ink-2 block mb-2" for="age-lookup-month">
        When was your kid born?
      </label>
      <div class="flex gap-2">
        <select id="age-lookup-month" class="flex-1 rounded-lg border border-border bg-cream px-3 py-2 text-[14px]">
          <option value="">Month</option>
          {MONTHS.map((m, i) => <option value={i + 1}>{m}</option>)}
        </select>
        <select id="age-lookup-year" class="flex-1 rounded-lg border border-border bg-cream px-3 py-2 text-[14px]">
          <option value="">Year</option>
          {YEAR_OPTIONS.map((y) => <option value={y}>{y}</option>)}
        </select>
      </div>
      <p id="age-lookup-answer" class="text-[14px] text-ink mt-3 hidden" role="status" aria-live="polite"></p>
    </div>

    <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="list">
      {YOUTH_AGE_GROUPS.map((g) => (
        <li>
          <button
            type="button"
            data-age-band
            data-group={g.label}
            data-group-key={g.key}
            class="w-full text-left rounded-xl border border-border bg-paper px-4 py-3 transition hover:border-ink-muted"
          >
            <span class="block font-display text-xl text-ink">{g.label}</span>
            <span class="block font-mono text-[11px] text-ink-2 mt-0.5">Born {g.rangeLabel}</span>
          </button>
        </li>
      ))}
    </ul>
  </div>
</section>

<script>
  import { resolveAgeGroup } from "@/lib/leagues/youth-age-groups"
  import { dispatchFinderFilter } from "@/lib/landing/finder-filter"
  import { track } from "@/lib/analytics/track"

  const root = document.querySelector<HTMLElement>("[data-age-ladder]")
  if (root) {
    const finderId = root.dataset.finder ?? ""
    const sportKey = root.dataset.sport ?? ""
    const bands = [...root.querySelectorAll<HTMLButtonElement>("[data-age-band]")]

    function highlight(groupLabel: string | null) {
      for (const b of bands) {
        const on = groupLabel != null && b.dataset.group === groupLabel
        b.classList.toggle("border-ink", on)
        b.classList.toggle("bg-cream-2", on)
        b.setAttribute("aria-pressed", String(on))
      }
    }

    function filterTo(groupLabel: string) {
      highlight(groupLabel)
      dispatchFinderFilter({ key: sportKey, sectionId: finderId, ageGroup: groupLabel })
      track("youth_age_group_selected", { group: groupLabel })
    }

    for (const b of bands) {
      b.addEventListener("click", () => filterTo(b.dataset.group ?? ""))
    }

    const monthEl = document.getElementById("age-lookup-month") as HTMLSelectElement | null
    const yearEl = document.getElementById("age-lookup-year") as HTMLSelectElement | null
    const answerEl = document.getElementById("age-lookup-answer")

    function runLookup() {
      if (!monthEl || !yearEl || !answerEl) return
      const month = Number(monthEl.value)
      const year = Number(yearEl.value)
      if (!month || !year) return
      const group = resolveAgeGroup(month, year)
      answerEl.classList.remove("hidden")
      if (!group) {
        answerEl.textContent =
          "That birthday falls outside our U6–U19 groups for this season."
        highlight(null)
        return
      }
      answerEl.innerHTML =
        `Your kid plays <b>${group.label}</b> — born ${group.rangeLabel}.`
      highlight(group.label)
      track("youth_age_lookup_used", { group: group.label })
    }

    monthEl?.addEventListener("change", runLookup)
    yearEl?.addEventListener("change", runLookup)
  }
</script>
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add src/components/youth/age-group-ladder.astro
git commit -m "feat(youth): static U6-U19 age-group ladder with birth-date lookup"
```

---

### Task 4: The sport landing page

**Files:**
- Create: `src/pages/youth/leagues/soccer/index.astro`

**Interfaces:**
- Consumes: `AgeGroupLadder` (Task 3), existing `CategoryFinder`, `SeasonCalendarBand`, `LandingFaq`, `CTABanner`, `getVenueFacts`, `breadcrumbJsonLd`
- Produces: the route `/youth/leagues/soccer`

Note this creates `src/pages/youth/leagues/soccer/` as a directory, so
`src/pages/youth/leagues.astro` and `src/pages/youth/leagues/…` coexist — the
same arrangement adult already uses.

- [ ] **Step 1: Create the page**

Create `src/pages/youth/leagues/soccer/index.astro`:

```astro
---
// Youth soccer sport landing page. SSR — the islands fetch host-scoped public
// endpoints client-side.
//
// The ladder is the only permanent content here: the offers underneath rotate
// by term (club-entry in winter, developmental the rest of the year), so this
// page is *about* the age structure, not about any one season.
//
// No Director of Coaching and no developmental pathway on this page — those
// live on classes/camps, where coaching is the product being bought.
// See docs/superpowers/specs/2026-08-16-youth-leagues-redesign-design.md
import BaseLayout from "@/layouts/BaseLayout.astro"
import AgeGroupLadder from "@/components/youth/age-group-ladder.astro"
import CategoryFinder from "@/components/landing/category-finder.tsx"
import SeasonCalendarBand, { type CalendarTermConfig } from "@/components/landing/season-calendar-band.tsx"
import LandingFaq, { type LandingFaqItem } from "@/components/landing/landing-faq.tsx"
import CTABanner from "@/components/cta-banner"
import { getVenueFacts } from "@/lib/locations/venue-facts"
import { breadcrumbJsonLd } from "@/lib/seo/breadcrumbs"
import { setMarketingEdgeCache } from "@/lib/http/edge-cache"

const FINDER_ID = "youth-soccer-divisions"
setMarketingEdgeCache(Astro)

const calendarTerms: CalendarTermConfig[] = [
  { name: "Winter I", months: "Dec–Feb", match: "winter-i" },
  { name: "Winter II", months: "Feb–Apr", match: "winter-ii" },
  { name: "Spring", months: "Apr–Jun", match: "spring" },
  { name: "Fall", months: "Sep–Nov", match: "fall" },
]

const faqs: LandingFaqItem[] = [
  {
    question: "The age groups changed this year — where does my kid land now?",
    answer:
      "For the 2026–27 season, groups run August 1 to July 31 instead of by calendar year, matching the change US Youth Soccer, US Club Soccer and AYSO all made together. Kids born August through December generally moved down a group; kids born January through July generally moved up. Use the birthday lookup above and it will tell you exactly.",
  },
  {
    question: "What ages can play?",
    answer:
      "Every group from U6 through U19. We run games at every age group — the ladder above lists all fourteen with the birth dates that belong to each.",
  },
  {
    question: "What if my kid doesn't know anyone on the team?",
    answer:
      "Most kids arrive not knowing anyone. Registration is per player — we build the teams and introduce coaches before week 1, so nobody has to bring a group of friends to sign up.",
  },
  {
    question: "Can siblings play at the same time?",
    answer:
      "Siblings usually land in different age groups, and we schedule sibling divisions close together wherever the schedule allows. Tell us at registration and we'll do our best.",
  },
  {
    question: "When are games?",
    answer:
      "Games are on weekends. Your exact slot comes with the schedule before week 1.",
  },
  {
    question: "What's the refund policy?",
    answer:
      "Cancel 14 or more days before the season starts for a full refund. Inside 14 days, we review case by case — the default is a prorated credit toward a future season.",
    linkHref: "/refund-policy",
    linkLabel: "Read the full refund policy",
  },
]

const ORIGIN = import.meta.env.PUBLIC_APP_URL || "https://aspiresportsohio.com"
const breadcrumbSchema = breadcrumbJsonLd([
  { name: "Home", url: `${ORIGIN}/` },
  { name: "Youth", url: `${ORIGIN}/youth` },
  { name: "Youth Leagues", url: `${ORIGIN}/youth/leagues` },
  { name: "Soccer", url: `${ORIGIN}/youth/leagues/soccer` },
])
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
}

const venueSlugs = ["worthington", "downtown"]
---

<BaseLayout
  title="Youth Soccer Leagues — Aspire Sports"
  description="Youth soccer leagues in Columbus and central Ohio, U6 through U19. Find your kid's age group for the 2026–27 season and register."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/youth/leagues/soccer`} />
    <script type="application/ld+json" is:inline set:html={JSON.stringify(breadcrumbSchema)} />
    <script type="application/ld+json" is:inline set:html={JSON.stringify(faqSchema)} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <section class="relative text-cream pt-16 px-9 pb-10 bg-navy-deep">
      <div class="max-w-[1080px] mx-auto">
        <h1 class="font-display font-semibold tracking-tight" style="font-size:clamp(2.5rem,6vw,4rem);line-height:.95">
          Youth soccer<br />at Aspire.
        </h1>
        <p class="mt-3 text-base text-cream/90 max-w-[520px]">
          Every age group from U6 to U19, on boarded turf in central Ohio.
          Find your kid&rsquo;s group and see what&rsquo;s open.
        </p>
      </div>
    </section>

    <AgeGroupLadder finderId={FINDER_ID} sportKey="soccer" />

    <CategoryFinder
      client:load
      audience="youth"
      programTypes={["league"]}
      title="Open now"
      descriptor="Pick an age group above to filter, or browse everything open."
      sectionId={FINDER_ID}
    />

    <SeasonCalendarBand
      client:visible
      audience="youth"
      programTypes={["league"]}
      pageKey="youth-soccer"
      cardsSectionId={FINDER_ID}
      heading="The season calendar."
      descriptor="Seasons run back-to-back all year — leave your email and you'll hear the moment the next one opens."
      futureTerms={calendarTerms}
    />

    <section class="bg-cream-2 border-t border-ink/10 py-14 px-6" aria-label="Where you'll play">
      <div class="max-w-[1080px] mx-auto">
        <h2 class="font-display text-3xl text-ink mb-6">Where you'll play</h2>
        <div class="grid gap-5 md:grid-cols-2">
          {venueSlugs.map((slug) => {
            const vf = getVenueFacts(slug)
            return vf ? (
              <a href={`/locations/${slug}`} class="group rounded-2xl border border-border bg-paper overflow-hidden flex flex-col sm:flex-row">
                {vf.photos[0] && (
                  <img src={vf.photos[0].src} alt={vf.photos[0].alt} loading="lazy" class="sm:w-44 h-32 sm:h-auto object-cover" />
                )}
                <div class="p-5">
                  <div class="font-display text-xl text-ink group-hover:text-primary">{vf.name}</div>
                  <p class="text-[13px] text-ink-2 mt-1 max-w-sm">{vf.tagline}</p>
                  <span class="inline-block text-xs font-semibold text-primary mt-2.5">Venue details &amp; directions →</span>
                </div>
              </a>
            ) : null
          })}
        </div>
      </div>
    </section>

    <LandingFaq client:visible id="faq" heading="Parent FAQs" items={faqs} />

    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 2: Confirm `getVenueFacts` exposes `name` and `tagline`**

Run: `grep -n "name\|tagline" src/lib/locations/venue-facts.ts | head -10`
Expected: both fields present on the venue fact objects. If `name` is absent, use the venue slug capitalised via the existing field on that record instead — do not invent a new field.

- [ ] **Step 3: Build to catch SSR mistakes**

Run: `npm run build`
Expected: build succeeds. Ignore `Astro.request.headers is not available on prerendered pages` warnings — CLAUDE.md documents those as a known false positive.

- [ ] **Step 4: Commit**

```bash
git add src/pages/youth/leagues/soccer/index.astro
git commit -m "feat(youth): soccer sport landing page with age-group ladder"
```

---

### Task 5: Navigation split, classes page, and hub

**Files:**
- Modify: `src/components/navigation.tsx:114-122`
- Modify: `src/pages/youth/leagues.astro:115-123`
- Modify: `src/pages/youth.astro:13-25`
- Create: `src/pages/youth/classes.astro`

**Interfaces:**
- Consumes: existing `CategoryHero`, `CategoryFinder`, `CTABanner`, `CategoryCard`
- Produces: the route `/youth/classes`

- [ ] **Step 1: Create the classes page**

Create `src/pages/youth/classes.astro`:

```astro
---
// Youth classes — training and clinics, split out of /youth/leagues so each
// nav item maps to one product. The Director of Coaching and the
// developmental pathway land here in Phase 2.
import BaseLayout from "@/layouts/BaseLayout.astro"
import CategoryHero from "@/components/landing/category-hero.astro"
import CategoryFinder from "@/components/landing/category-finder.tsx"
import CTABanner from "@/components/cta-banner"
import type { HeroTile } from "@/lib/landing/hero-tiles"
import { setMarketingEdgeCache } from "@/lib/http/edge-cache"

const tiles: HeroTile[] = [
  { label: "Soccer", key: "soccer", state: "live", statusLabel: "● Now enrolling", meta: "Skills & clinics", color: "oklch(0.66 0.21 35)", fallbackHref: "/programs?audience=youth" },
  { label: "Basketball", key: "basketball", state: "coming_soon", statusLabel: "Coming soon", meta: "Interested? Notify me" },
  { label: "Multi-sport", key: "multi-sport", state: "coming_soon", statusLabel: "Coming soon", meta: "Interested? Notify me" },
]
setMarketingEdgeCache(Astro)
---

<BaseLayout
  title="Youth Classes & Clinics — Aspire Sports"
  description="Youth soccer skills classes and clinics in Columbus and central Ohio. Skill-building without a season commitment."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/youth/classes`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <CategoryHero
      title="Youth classes & clinics."
      subhead="Skill-building without a season commitment. Filter by your kid's age and go."
      videoSources={[
        "https://videos.pexels.com/video-files/6077723/6077723-hd_1920_1080_25fps.mp4",
        "https://videos.pexels.com/video-files/6077723/6077723-sd_640_360_25fps.mp4",
      ]}
      poster="https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&w=1600&q=60"
      tiles={tiles}
      finderId="youth-classes"
      crosslink={{ prompt: "Looking for a season instead?", href: "/youth/leagues", label: "Youth leagues →" }}
    />

    <CategoryFinder
      client:load
      audience="youth"
      programTypes={["training", "clinic"]}
      title="Open now"
      descriptor="Filter by age and venue — every class shows its dates on the card."
      ageChips
      sectionId="youth-classes"
    />

    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 2: Split the navigation**

In `src/components/navigation.tsx`, replace the Youth entry's `children` array (currently lines 118-121):

```typescript
      children: [
        { href: "/youth/leagues", label: "Leagues" },
        { href: "/youth/classes", label: "Classes" },
        { href: "/youth/camps", label: "Camps" },
      ],
```

- [ ] **Step 3: Narrow the leagues page and point its tile at the sport page**

In `src/pages/youth/leagues.astro`:

1. Change the `CategoryFinder` `programTypes` from `{["league", "training", "clinic"]}` to `{["league"]}`.
2. Change its `descriptor` to `"Season leagues, sorted by age group."`
3. In the `tiles` array, change the Soccer tile's `fallbackHref` to `"/youth/leagues/soccer"` and add `href: "/youth/leagues/soccer"` so the tile navigates to the new sport page instead of scroll-filtering.
4. Change the page `title` to `"Youth Leagues — Aspire Sports"` and drop "classes" from the meta `description`.

- [ ] **Step 4: Add the third hub door**

In `src/pages/youth.astro`, insert a Classes door into the `doors` array between the leagues and camps entries, and change the leagues entry's `title` to `"Leagues"` and its `blurb` to `"Season leagues for every age group, U6 through U19."`:

```typescript
  { href: "/youth/classes", cta: "youth-hub-classes", palette: "youth-b" as const,
    title: "Classes", blurb: "Skill-building classes and clinics — no season commitment.",
    statusLabel: "Now enrolling", live: true, ctaLabel: "Browse classes" },
```

Change the Camps entry's `palette` to `"youth-a" as const` so three doors don't
render two adjacent identical palettes, and change the grid on the `<section>`
from `md:grid-cols-2` to `md:grid-cols-3`.

- [ ] **Step 5: Build and type check**

Run: `npm run build && npx tsc --noEmit`
Expected: build succeeds, zero TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/components/navigation.tsx src/pages/youth.astro src/pages/youth/leagues.astro src/pages/youth/classes.astro
git commit -m "feat(youth): split nav into Leagues/Classes/Camps"
```

---

### Task 6: Youth-aware division slugs and naming

**Files:**
- Modify: `src/lib/leagues/division-slug.ts`
- Test: `tests/unit/division-slug-youth.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `divisionSlug(s, opts?: { ageGroupName?: string | null })`, `divisionNaming(s, sportName, termLabel, audience?: "adult" | "youth")`

Two defects block youth reuse: `GENDER_SLUG` has no boys/girls, and
`divisionNaming` hardcodes the word `"Adult"` into every SEO title.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/division-slug-youth.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { divisionSlug, divisionNaming } from "@/lib/leagues/division-slug"

const base = {
  id: "s-1",
  slug: "u10-girls",
  dayOfWeek: "sat",
  location: { slug: "worthington", name: "Worthington", state: "OH" },
}

describe("divisionSlug for youth", () => {
  it("builds a slug from age group and gender", () => {
    expect(
      divisionSlug({ ...base, divisionGender: "girls" }, { ageGroupName: "U10" }),
    ).toBe("u10-girls-saturday-worthington")
  })

  it("handles boys", () => {
    expect(
      divisionSlug({ ...base, divisionGender: "boys" }, { ageGroupName: "U12" }),
    ).toBe("u12-boys-saturday-worthington")
  })

  it("keeps coed spelled as co-ed, matching existing adult URLs", () => {
    expect(
      divisionSlug({ ...base, divisionGender: "coed" }, { ageGroupName: "U8" }),
    ).toBe("u8-co-ed-saturday-worthington")
  })

  it("leaves adult slugs byte-identical when no age group is passed", () => {
    expect(
      divisionSlug({
        ...base,
        slug: "co-ed-b",
        divisionGender: "coed",
        skillLevel: "b",
        dayOfWeek: "wed",
      }),
    ).toBe("co-ed-b-wednesday-worthington")
  })
})

describe("divisionNaming audience", () => {
  it("says Youth in a youth title", () => {
    const n = divisionNaming(
      { ...base, divisionGender: "girls" },
      "Soccer",
      "Winter I",
      "youth",
    )
    expect(n.title).toContain("Youth Soccer League")
    expect(n.title).not.toContain("Adult")
  })

  it("still says Adult by default", () => {
    const n = divisionNaming({ ...base, divisionGender: "coed" }, "Soccer", "Fall 2026")
    expect(n.title).toContain("Adult Soccer League")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/division-slug-youth.test.ts`
Expected: FAIL — girls/boys produce slugs missing the gender segment, and the youth title says "Adult"

- [ ] **Step 3: Implement**

In `src/lib/leagues/division-slug.ts`:

1. Extend the gender maps:

```typescript
const GENDER_SLUG: Record<string, string> = {
  coed: "co-ed", mens: "mens", womens: "womens", boys: "boys", girls: "girls",
};
const GENDER_LABEL: Record<string, string> = {
  coed: "Co-Ed", mens: "Men's", womens: "Women's", boys: "Boys", girls: "Girls",
};
```

2. Add an options parameter to `divisionSlug`, putting the age group ahead of the gender so youth URLs read `u10-girls-…`:

```typescript
export interface DivisionSlugOptions {
  /** Youth age group name, e.g. "U10". Omitted for adult. */
  ageGroupName?: string | null;
}

export function divisionSlug(
  s: SeasonForDivisionSlug,
  opts: DivisionSlugOptions = {},
): string {
  const parts = [
    opts.ageGroupName ? opts.ageGroupName.toLowerCase() : null,
    GENDER_SLUG[s.divisionGender ?? ""] ?? null,
    tierPart(s),
    s.dayOfWeek ? DAY_SLUG[s.dayOfWeek] ?? null : null,
    s.location.slug,
  ].filter(Boolean);
  if (parts.length < 2 && s.slug) return `${s.slug}-${s.location.slug}`;
  return parts.join("-");
}
```

3. Add the audience parameter to `divisionNaming`, defaulting to `"adult"` so no existing caller changes behaviour:

```typescript
export type DivisionAudience = "adult" | "youth";

export function divisionNaming(
  s: SeasonForDivisionSlug,
  sportName: string,
  termLabel: string,
  audience: DivisionAudience = "adult",
): DivisionNaming {
  const gender = GENDER_LABEL[s.divisionGender ?? ""] ?? "";
  const age = ageQualifier(s.minAge);
  const tier = age ?? (s.skillLevel && s.skillLevel !== "open" ? s.skillLevel.toUpperCase() : "");
  const label = [gender, tier].filter(Boolean).join(" ") || "Open";
  const day = s.dayOfWeek ? DAY_LABEL[s.dayOfWeek] ?? "" : "";
  const headline = [label, day].filter(Boolean).join(" ");
  const place = [s.location.name ?? s.location.slug, s.location.state ?? "OH"].filter(Boolean).join(", ");
  const audienceWord = audience === "youth" ? "Youth" : "Adult";
  const title = `${headline} ${audienceWord} ${sportName} League — ${place} | ${termLabel}`;
  return { label, headline, title };
}
```

4. `divisionSlugMap` calls `divisionSlug(s)` — give it the same options passthrough:

```typescript
export function divisionSlugMap<T extends SeasonForDivisionSlug>(
  seasonRows: T[],
  opts: DivisionSlugOptions = {},
): Map<string, T> {
```

   and inside, replace `divisionSlug(s)` with `divisionSlug(s, opts)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/`
Expected: PASS — including the adult byte-identical case, which guards existing indexed URLs

- [ ] **Step 5: Commit**

```bash
git add src/lib/leagues/division-slug.ts tests/unit/division-slug-youth.test.ts
git commit -m "feat(leagues): youth genders and audience-aware division naming"
```

---

### Task 7: Audience-aware division loader and the youth division page

**Files:**
- Modify: `src/lib/leagues/division-page-data.ts:46-60`, `:71`, `:106`
- Create: `src/pages/youth/leagues/soccer/[term]/[division].astro`

**Interfaces:**
- Consumes: `loadDivisionPage` (modified), `DivisionPageLayout`, `divisionNaming` (Task 6)
- Produces: the route `/youth/leagues/soccer/[term]/[division]`

`loadDivisionPage` currently hardcodes `audience=adult` in both fetch URLs.

- [ ] **Step 1: Add the audience parameter to the loader**

In `src/lib/leagues/division-page-data.ts`:

1. Import the audience type: add `type DivisionAudience` to the existing import from `./division-slug`.
2. Add `audience` to the options type with an adult default:

```typescript
export async function loadDivisionPage(opts: {
  origin: string;
  cookie: string;
  sportSlug: string;
  fallbackSportName: string;
  term: string | undefined;
  division: string | undefined;
  /** Defaults to "adult" so existing adult routes are unchanged. */
  audience?: DivisionAudience;
}): Promise<DivisionPageData | null> {
  const { origin, cookie, sportSlug, fallbackSportName, term, division } = opts;
  const audience = opts.audience ?? "adult";
```

3. Replace the hardcoded `audience=adult` in both fetch URLs with `audience=${audience}`.
4. Pass the age group into the slug map and the audience into naming:

```typescript
  const slugMap = divisionSlugMap(seasons, {});
```

   stays as-is for adult, but for youth the slug must include the age group.
   Since the age group differs per season, build the map with a per-row option
   by replacing the `divisionSlugMap(seasons)` call with:

```typescript
  const slugOptsFor = (s: any) =>
    audience === "youth" ? { ageGroupName: s.ageGroup?.name ?? null } : {};
  const slugMap = new Map<string, any>();
  for (const s of seasons) {
    let slug = divisionSlug(s, slugOptsFor(s));
    if (slugMap.has(slug)) slug = `${s.slug ?? s.id}-${s.location.slug}`;
    if (!slugMap.has(slug)) slugMap.set(slug, s);
  }
```

   and add `divisionSlug` to the import from `./division-slug`.
5. Pass `audience` as the fourth argument to both `divisionNaming` calls (line ~71 and inside the `siblings` map at ~106).

- [ ] **Step 2: Create the youth division page**

Create `src/pages/youth/leagues/soccer/[term]/[division].astro`:

```astro
---
// Per-division youth soccer page — one stable, crawlable URL per division
// (e.g. /youth/leagues/soccer/winter-i/u10-girls-saturday-worthington).
// Deliberately passes no format copy: youth divisions vary by venue and
// season, so format claims belong on the division row from real data, not
// authored here. See the spec's "No format claims in v1".
export const prerender = false;
import DivisionPageLayout from "@/components/leagues/DivisionPageLayout.astro";
import { loadDivisionPage } from "@/lib/leagues/division-page-data";

const { term, division } = Astro.params;
const data = await loadDivisionPage({
  origin: Astro.url.origin,
  cookie: Astro.request.headers.get("cookie") ?? "",
  sportSlug: "soccer",
  fallbackSportName: "Soccer",
  term,
  division,
  audience: "youth",
});
if (!data) {
  return Astro.redirect(`/youth/leagues/soccer/${term}`);
}
---

<DivisionPageLayout
  data={data}
  basePath="/youth/leagues/soccer"
  sportCrumb="Soccer"
  term={term ?? ""}
  division={division ?? ""}
  formatValue={null}
  gamesValue={null}
  formatFacts={[]}
  levelDescription={data.season.ageGroup?.name
    ? `${data.season.ageGroup.name} — born ${data.season.ageGroup.name === null ? "" : ""}`.trim()
    : null}
  descriptionFormatLine=""
/>
```

- [ ] **Step 3: Check `DivisionPageLayout` tolerates the nulls**

Run: `grep -n "formatValue\|gamesValue\|formatFacts\|levelDescription\|descriptionFormatLine" src/components/leagues/DivisionPageLayout.astro`
Expected: each prop is read. If any is typed non-nullable or rendered without a
guard, widen its type to allow `null` and wrap its render in a truthiness check.
Do not fabricate youth format copy to satisfy a non-null type.

Then simplify the `levelDescription` expression above to the age-group label
alone — the placeholder ternary in Step 2 exists only to show the prop position:

```astro
  levelDescription={data.season.ageGroup?.name ?? null}
```

- [ ] **Step 4: Verify adult routes are unchanged**

Run: `npx vitest run tests/unit/ && npm run build`
Expected: all unit tests PASS (including the adult byte-identical slug test from Task 6), build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/lib/leagues/division-page-data.ts src/pages/youth/leagues/soccer/
git commit -m "feat(youth): per-division youth soccer pages"
```

---

### Task 8: The season (term) page with dual framing

**Files:**
- Create: `src/pages/youth/leagues/soccer/[term].astro`

**Interfaces:**
- Consumes: `SeasonTabs`, `divisionSlugMap`/`divisionNaming` (Task 6), `getVenueFacts`, `breadcrumbJsonLd`, `seasonsToLeagueEvents`
- Produces: the route `/youth/leagues/soccer/[term]`

Framing switches on `signupModes`: a term whose divisions are team-only is club
entry; individual is developmental. Read this from data — never author which
term is which.

- [ ] **Step 1: Create the page**

Create `src/pages/youth/leagues/soccer/[term].astro`. Model it on
`src/pages/adult/leagues/soccer/[term].astro`, which already handles the live +
completed fetch, deadline aggregation and price board. Changes from that file:

```astro
---
// Per-term youth soccer season page.
//
// Youth runs two products that rotate by term: club team entry (winter,
// signupModes ['team']) and developmental (spring/fall, ['individual']).
// The framing below is DERIVED from signupModes — never author which term is
// which, or the page lies the first time a term changes shape.
export const prerender = false;
import BaseLayout from "@/layouts/BaseLayout.astro";
import { SeasonTabs } from "@/components/leagues/season-tabs";
import { getVenueFacts } from "@/lib/locations/venue-facts";
import type { Division } from "@/lib/leagues/division-filters";
import { divisionSlug, divisionNaming } from "@/lib/leagues/division-slug";
import { breadcrumbJsonLd } from "@/lib/seo/breadcrumbs";
import { seasonsToLeagueEvents } from "@/lib/seo/events";

const { term } = Astro.params;
const origin = Astro.url.origin;
const cookie = Astro.request.headers.get("cookie") ?? "";
// Live AND completed: without the completed fetch a wrapped term returns zero
// rows and redirects away, killing an indexed URL that should become the
// final-standings archive.
const [liveRes, doneRes] = await Promise.all([
  fetch(`${origin}/api/public/seasons?sport=soccer&audience=youth&term=${term}`, { headers: { cookie } }),
  fetch(`${origin}/api/public/seasons?sport=soccer&audience=youth&term=${term}&status=completed`, { headers: { cookie } }),
]);
const live: any[] = liveRes.ok ? ((await liveRes.json()).seasons ?? []) : [];
const done: any[] = doneRes.ok ? ((await doneRes.json()).seasons ?? []) : [];
const seasons: any[] = [...live, ...done];

if (seasons.length === 0) {
  return Astro.redirect("/youth/leagues/soccer");
}

const termLabel = seasons[0].termLabel ?? "This season";
const anyOpen = seasons.some((s) => s.status === "open");
const allCompleted = seasons.every((s) => s.status === "completed");

// ---- Product framing, derived ---------------------------------------------
// A term is club entry when every open division accepts teams and none accepts
// individuals. Anything else reads as developmental, which is the safer
// default: it never tells a parent they can't register their kid.
const openSeasons = seasons.filter((s) => s.status === "open");
const framingRows = openSeasons.length > 0 ? openSeasons : seasons;
const isClubEntry =
  framingRows.length > 0 &&
  framingRows.every((s) => {
    const modes: string[] = s.signupModes ?? ["individual"];
    return modes.includes("team") && !modes.includes("individual");
  });

const intro = isClubEntry
  ? "Indoor league play for club teams. Enter your roster, get a schedule, play competitive matches on boarded turf."
  : "We build the teams and coach them. Register your player and we'll place them, then send the schedule and coach introduction before week 1.";
const findHeading = isClubEntry ? "Divisions & levels" : "Find your kid's group & register";
const findSubcopy = isClubEntry
  ? "Pick the division that matches your team's level. Open divisions accept entries on the spot."
  : "Pick your kid's age group. Open divisions register on the spot.";

const startDate = seasons.map((s) => s.startDate).sort()[0];
const endDate = seasons.map((s) => s.endDate).sort().at(-1);

const venuesMap = new Map<string, string>();
for (const s of seasons) venuesMap.set(s.location.slug, s.location.name);
const venues = [...venuesMap].map(([slug, label]) => ({ slug, label }));

function fmtTime(t: string | null) {
  if (!t) return null;
  const [h] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${ampm}`;
}

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
  spotsLabel: s.status === "completed" ? "final" : s.status === "forming" ? "forming" : s.spotsLeft != null ? `${s.spotsLeft} left` : "open",
  signupModes: s.signupModes ?? ["individual"],
  price: (s.signupModes ?? ["individual"]).includes("individual") ? (s.effectivePrice ?? s.price ?? null) : null,
  teamTotal: (s.signupModes ?? []).includes("team") ? (s.effectiveTeamPrice ?? s.teamPrice ?? null) : null,
}));

const ORIGIN = import.meta.env.PUBLIC_APP_URL || "https://aspiresportsohio.com";
const eventSchema = seasonsToLeagueEvents(seasons, ORIGIN);

// Crawlable per-division links — the division rows live in a React island, so
// these server-rendered anchors are how a crawler reaches every division URL.
const divisionLinks = seasons.map((s) => ({
  slug: divisionSlug(s, { ageGroupName: s.ageGroup?.name ?? null }),
  ...divisionNaming(s, s.sport?.name ?? "Soccer", termLabel, "youth"),
  venueName: s.location.name,
}));

const breadcrumbSchema = breadcrumbJsonLd([
  { name: "Home", url: `${ORIGIN}/` },
  { name: "Youth Leagues", url: `${ORIGIN}/youth/leagues` },
  { name: "Soccer", url: `${ORIGIN}/youth/leagues/soccer` },
  { name: termLabel, url: `${ORIGIN}/youth/leagues/soccer/${term}` },
]);

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
---

<BaseLayout
  title={`${termLabel} Youth Soccer Leagues — Aspire Sports`}
  description={`Register for ${termLabel} youth soccer at Aspire Sports in central Ohio.`}
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/youth/leagues/soccer/${term}`} />
    <script type="application/ld+json" is:inline set:html={JSON.stringify(breadcrumbSchema)} />
    {eventSchema.length > 0 && (
      <script type="application/ld+json" is:inline set:html={JSON.stringify(eventSchema)} />
    )}
  </Fragment>

  <main id="main-content">
    <section class="text-cream pt-12 px-6 sm:px-9 pb-8 bg-navy-deep">
      <div class="max-w-[1080px] mx-auto">
        <h1 class="font-display font-semibold text-[42px] leading-[1.05] sm:text-5xl tracking-tight mb-2">
          {termLabel} · Youth Soccer
        </h1>
        <p class="text-sm text-cream/85 mb-3">
          <b class="font-semibold text-cream">{fmtShort(startDate)} – {fmtShort(endDate)}</b>
          {venues.length === 1 ? ` · ${venues[0].label}` : ` · ${venues.length} venues`}
        </p>
        <p class="text-[15px] text-cream/90 max-w-[560px]">{intro}</p>
        {anyOpen && (
          <a href="#divisions" class="inline-flex items-center gap-2 font-sans font-semibold text-[15px] bg-primary text-cream px-4 py-3 rounded-xl mt-5" data-testid="hero-register">
            {isClubEntry ? "See divisions & enter" : "Find your kid's group"} <span aria-hidden="true">↓</span>
          </a>
        )}
      </div>
    </section>

    <div id="divisions">
      <SeasonTabs
        client:load
        sport="soccer"
        divisions={divisions}
        venues={venues}
        weekStart={startDate}
        scheduleNote="One game per week per team. Exact slots assigned after rosters lock."
        term={term ?? ""}
        ruleSections={[]}
        faq={[]}
        findHeading={findHeading}
        findSubcopy={findSubcopy}
        initialTab={allCompleted ? "standings" : "divisions"}
      />
    </div>

    {divisionLinks.length > 0 && (
      <section class="bg-cream py-10 px-6" aria-label="Division guides">
        <div class="max-w-[1080px] mx-auto">
          <h2 class="font-display text-2xl text-ink mb-4">Division guides</h2>
          <ul class="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-[14px]">
            {divisionLinks.map((d) => (
              <li>
                <a href={`/youth/leagues/soccer/${term}/${d.slug}`} class="text-ink-2 hover:text-primary">
                  {d.headline} · {d.venueName}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    )}

    {venues.length > 0 && (
      <section class="bg-cream-2 border-t border-ink/10 py-14 px-6" aria-label="Where you'll play">
        <div class="max-w-[1080px] mx-auto">
          <h2 class="font-display text-3xl text-ink mb-6">Where you'll play</h2>
          <div class="grid gap-5 md:grid-cols-2">
            {venues.map(({ slug, label }) => {
              const vf = getVenueFacts(slug);
              return (
                <a href={`/locations/${slug}`} class="group rounded-2xl border border-border bg-paper overflow-hidden flex flex-col sm:flex-row">
                  {vf?.photos[0] && (
                    <img src={vf.photos[0].src} alt={vf.photos[0].alt} loading="lazy" class="sm:w-44 h-32 sm:h-auto object-cover" />
                  )}
                  <div class="p-5">
                    <div class="font-display text-xl text-ink group-hover:text-primary">{label}</div>
                    {vf && <p class="text-[13px] text-ink-2 mt-1 max-w-sm">{vf.tagline}</p>}
                    <span class="inline-block text-xs font-semibold text-primary mt-2.5">Venue details &amp; directions →</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>
    )}
  </main>
</BaseLayout>
```

- [ ] **Step 2: Confirm `SeasonTabs` accepts empty rules and FAQ**

Run: `grep -n "ruleSections\|faq\|arenaNote\|playLine\|footnote" src/components/leagues/season-tabs.tsx | head -20`
Expected: `ruleSections` and `faq` are used. If either is required non-empty or
renders an always-visible tab, make the tab conditional on a non-empty array
rather than authoring youth rules copy here — rules are not in Phase 1 scope.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/pages/youth/leagues/soccer/\[term\].astro
git commit -m "feat(youth): season page with club/developmental framing from signupModes"
```

---

### Task 9: E2E coverage and full verification

**Files:**
- Create: `tests/e2e/youth-leagues.spec.ts`

**Interfaces:**
- Consumes: everything above; `waitForHydration` from `tests/utils/test-helpers`

Youth E2E runs post-merge only via `test-full`, so these will not gate the PR —
run them locally before merging.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/youth-leagues.spec.ts`:

```typescript
import { test, expect } from "@playwright/test"
import { waitForHydration } from "../utils/test-helpers"

test.describe("youth soccer landing", () => {
  test("renders all 14 age groups as static HTML", async ({ page }) => {
    // JS disabled would be ideal; instead assert before hydration completes
    // that the bands are already in the DOM — they are server-rendered.
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    const bands = page.locator("[data-age-band]")
    await expect(bands).toHaveCount(14)
    await expect(bands.first()).toContainText("U6")
    await expect(bands.last()).toContainText("U19")
  })

  test("birthday lookup resolves a group", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await page.selectOption("#age-lookup-month", "3")
    await page.selectOption("#age-lookup-year", "2017")
    await expect(page.locator("#age-lookup-answer")).toContainText("U10")
  })

  test("a birthday in the same year but after August resolves one group younger", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await page.selectOption("#age-lookup-month", "9")
    await page.selectOption("#age-lookup-year", "2017")
    await expect(page.locator("#age-lookup-answer")).toContainText("U9")
  })

  test("shows no format claims", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    const body = await page.locator("main").innerText()
    expect(body).not.toMatch(/\d+v\d+/)
    expect(body).not.toMatch(/size [345] ball/i)
  })
})

test.describe("youth navigation", () => {
  test("exposes Leagues, Classes and Camps", async ({ page }) => {
    await page.goto("/youth", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    for (const href of ["/youth/leagues", "/youth/classes", "/youth/camps"]) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible()
    }
  })

  test("classes page loads its own finder", async ({ page }) => {
    await page.goto("/youth/classes", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("#youth-classes")).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the new spec against a local dev server**

With `npm run dev` already running:

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- tests/e2e/youth-leagues.spec.ts`
Expected: all 6 PASS. If the lookup tests fail on timing, confirm the page's
top-level island uses `client:load` and that `waitForHydration` is called before
the first `selectOption`.

- [ ] **Step 3: Check for existing youth E2E specs this change breaks**

Run: `grep -rln "youth" tests/e2e/`
Expected: a list. Open each hit and update any assertion that depends on
"Leagues & Classes" as a nav label, or on `/youth/leagues` listing training and
clinic programs. Those are real breakages introduced by Task 5 — fix them here.

- [ ] **Step 4: Full pre-push sweep**

Run each and confirm clean:

```bash
npx tsc --noEmit
npx vitest run tests/unit/
npm run build
```

Expected: zero TypeScript errors, all unit tests pass, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/youth-leagues.spec.ts
git commit -m "test(youth): e2e coverage for the age ladder and nav split"
```

---

## Self-Review

**Spec coverage.** Every Phase 1 item maps to a task: sport landing page (4),
static ladder with all 14 groups (1, 3), lookup (1, 3), divisions finder
filtered by band (2, 3), the year band (4), term page with dual framing (8),
division pages (6, 7), nav split (5), `/youth/classes` as a working finder
page (5). Deliberately absent and correct: pathway, Director of Coaching,
team-entry page and SEO landings are Phases 2–3; format claims and the
`seasons.format` column are out of scope entirely.

**Known soft spots, flagged rather than hidden.** Three steps ask the
implementer to verify a prop contract before using it — `getVenueFacts` fields
(Task 4 Step 2), `DivisionPageLayout` nullability (Task 7 Step 3), and
`SeasonTabs` empty rules/FAQ (Task 8 Step 2). Each states what to do if the
contract does not hold, and each says explicitly not to fabricate youth copy to
satisfy a type. These are genuine unknowns in existing components, not
placeholders.

**Type consistency.** `YouthAgeGroup.key` is lowercase (`"u10"`) and used in
URLs and slugs; `.label` is uppercase (`"U10"`) and used for display, the
`ageGroup` event field, and `matchesAgeGroup` comparison against
`age_groups.name`. The ladder dispatches `.label`; `matchesAgeGroup` lowercases
both sides so admin-entered casing cannot hide a division.

**Backward compatibility.** `divisionSlug` and `divisionNaming` both default to
adult behaviour, and Task 6 Step 1 includes an explicit byte-identical
regression test for an existing adult slug, since those URLs are indexed.
