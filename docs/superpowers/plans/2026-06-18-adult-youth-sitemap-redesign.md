# Adult & Youth Sitemap Bold-Catalog Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll the bold-catalog design language (video heroes, sport/format tiles, colored animated hub cards) from `/adult/leagues` across the remaining adult/youth pathway — six pages — with shared, reusable components.

**Architecture:** Extract three reusable Astro components (`CategoryHero`, `HubHero`, `CategoryCard`) plus two pickup-only bands, backed by small pure helper modules (tile config, skill-level display, pricing tiers, a cross-island finder-filter event). The existing finder islands (`SeasonsFinderSection`, `PickupFinderSection`) are kept and extended to react to a hero-tile filter event. Pages are SSR (unchanged); only their hero/markup changes.

**Tech Stack:** Astro 5, React 19 islands, Tailwind 4, Vitest (unit + API), Playwright (e2e). Spec: `docs/superpowers/specs/2026-06-18-adult-youth-sitemap-redesign-design.md`.

---

## Conventions for this plan

- Run all commands from the worktree root.
- Unit tests live in `tests/unit/` (Vitest, no server/DB). Run a single file with `npx vitest run tests/unit/<file>`.
- Astro pages/components are not unit-tested in this repo — they're verified by `npx tsc --noEmit`, `npm run build`, and Playwright. Each page/component task ends with a type-check + commit; a final phase runs the full build + e2e.
- Reference the design language already in `src/pages/adult/leagues.astro` (tiles, oklch overlays, `font-mono` labels) and keep class names consistent with it.

---

## Phase 1 — Pure helper modules (TDD)

### Task 1: Hero tile config types

**Files:**
- Create: `src/lib/landing/hero-tiles.ts`
- Test: `tests/unit/hero-tiles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/hero-tiles.test.ts
import { describe, it, expect } from "vitest"
import { tileLinksOut, type HeroTile } from "@/lib/landing/hero-tiles"

const base: HeroTile = {
  label: "Soccer", key: "soccer", state: "live",
  statusLabel: "● Now registering", meta: "3 sessions", color: "oklch(0.66 0.21 35)",
}

describe("tileLinksOut", () => {
  it("links out when a live tile has an href", () => {
    expect(tileLinksOut({ ...base, href: "/adult/leagues/soccer" })).toBe(true)
  })
  it("scroll-filters (no link) when a live tile has no href", () => {
    expect(tileLinksOut({ ...base, href: null })).toBe(false)
    expect(tileLinksOut(base)).toBe(false)
  })
  it("never links out for a coming_soon tile", () => {
    expect(tileLinksOut({ ...base, state: "coming_soon", href: "/x" })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/hero-tiles.test.ts`
Expected: FAIL — cannot find module `@/lib/landing/hero-tiles`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/landing/hero-tiles.ts
export type TileState = "live" | "coming_soon"

export interface HeroTile {
  /** Display name, e.g. "Soccer". */
  label: string
  /** Sport slug (seasons pages) or sport word (pickup) the finder filters on. */
  key: string
  state: TileState
  /** Micro-label above the name, e.g. "● Now registering" or "Coming soon". */
  statusLabel: string
  /** Sub-line, e.g. "3 sessions · 2 venues" or "Interested? Notify me". */
  meta: string
  /** Background for live tiles (oklch/hex). Ignored for coming_soon. */
  color?: string
  /** When set, a live tile links here instead of scroll-filtering the finder. */
  href?: string | null
}

/** A live tile links out only when it has an href; otherwise it scroll-filters. */
export function tileLinksOut(tile: HeroTile): boolean {
  return tile.state === "live" && Boolean(tile.href)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/hero-tiles.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/hero-tiles.ts tests/unit/hero-tiles.test.ts
git commit -m "feat(landing): hero tile config types + tileLinksOut helper"
```

---

### Task 2: Skill-level display map + tier content

**Files:**
- Create: `src/lib/landing/skill-levels.ts`
- Test: `tests/unit/skill-levels.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/skill-levels.test.ts
import { describe, it, expect } from "vitest"
import { skillLevelDisplay, SKILL_LEVEL_TIERS } from "@/lib/landing/skill-levels"

describe("skillLevelDisplay", () => {
  it("maps the three real DB enum values to display labels", () => {
    expect(skillLevelDisplay("recreational").label).toBe("Recreational")
    expect(skillLevelDisplay("intermediate").label).toBe("Intermediate")
    expect(skillLevelDisplay("advanced").label).toBe("Advanced")
  })
  it("renders all_levels as 'All levels'", () => {
    expect(skillLevelDisplay("all_levels").label).toBe("All levels")
  })
  it("falls back to all_levels for unknown values", () => {
    expect(skillLevelDisplay("bogus").label).toBe("All levels")
  })
})

describe("SKILL_LEVEL_TIERS", () => {
  it("explains exactly the three real tiers, in order, excluding all_levels", () => {
    expect(SKILL_LEVEL_TIERS.map((t) => t.level)).toEqual([
      "recreational", "intermediate", "advanced",
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/skill-levels.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/landing/skill-levels.ts
export type SkillLevel = "recreational" | "intermediate" | "advanced" | "all_levels"

export interface SkillLevelDisplay {
  label: string
  /** Tailwind badge classes — green / amber / rose / neutral. */
  badgeClass: string
}

const MAP: Record<SkillLevel, SkillLevelDisplay> = {
  recreational: { label: "Recreational", badgeClass: "bg-emerald-100 text-emerald-800" },
  intermediate: { label: "Intermediate", badgeClass: "bg-amber-100 text-amber-800" },
  advanced: { label: "Advanced", badgeClass: "bg-rose-100 text-rose-800" },
  all_levels: { label: "All levels", badgeClass: "bg-zinc-100 text-zinc-700" },
}

export function skillLevelDisplay(level: string): SkillLevelDisplay {
  return MAP[level as SkillLevel] ?? MAP.all_levels
}

/** Content for the "Find your level" explainer — the three real tiers only. */
export const SKILL_LEVEL_TIERS: ReadonlyArray<{
  level: Exclude<SkillLevel, "all_levels">
  display: SkillLevelDisplay
  headline: string
  blurb: string
}> = [
  {
    level: "recreational", display: MAP.recreational,
    headline: "Just here to play",
    blurb: "Relaxed, social, all-levels welcome. New to the sport or shaking off the rust — start here.",
  },
  {
    level: "intermediate", display: MAP.intermediate,
    headline: "Competitive but friendly",
    blurb: "You know the game and want a real run, without it getting heated. The default for most players.",
  },
  {
    level: "advanced", display: MAP.advanced,
    headline: "High-level run",
    blurb: "Fast, physical, experienced players. Former club/college and serious weekend ballers.",
  },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/skill-levels.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/skill-levels.ts tests/unit/skill-levels.test.ts
git commit -m "feat(landing): skill-level display map + tier explainer content"
```

---

### Task 3: Pickup pricing tiers

**Files:**
- Create: `src/lib/landing/pickup-pricing.ts`
- Test: `tests/unit/pickup-pricing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/pickup-pricing.test.ts
import { describe, it, expect } from "vitest"
import { pricingTiers, WALK_IN_RATE_CENTS } from "@/lib/landing/pickup-pricing"

describe("pricingTiers", () => {
  const rate = { defaultSessionRateCents: 1500, defaultMemberRateCents: 1200 }

  it("produces walk-in / online / member with whole-dollar labels", () => {
    const tiers = pricingTiers(rate)
    expect(tiers.map((t) => [t.label, t.amountLabel])).toEqual([
      ["Walk-in", "$17"],
      ["Book online", "$15"],
      ["Member", "$12"],
    ])
  })
  it("marks member as best and shows savings vs walk-in", () => {
    const member = pricingTiers(rate).find((t) => t.label === "Member")!
    expect(member.best).toBe(true)
    expect(member.note).toBe("Save $5 →")
  })
  it("defaults the walk-in figure to WALK_IN_RATE_CENTS", () => {
    expect(WALK_IN_RATE_CENTS).toBe(1700)
    expect(pricingTiers(rate)[0].amountLabel).toBe("$17")
  })
  it("omits the savings note when member is not cheaper", () => {
    const tiers = pricingTiers({ defaultSessionRateCents: 1700, defaultMemberRateCents: 1700 })
    expect(tiers.find((t) => t.label === "Member")!.note).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/pickup-pricing.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/landing/pickup-pricing.ts
export interface PricingTier {
  amountLabel: string   // "$17"
  label: string         // "Walk-in"
  best?: boolean
  note?: string         // "Save $5 →"
}

export interface RateCardCents {
  defaultSessionRateCents: number
  defaultMemberRateCents: number
}

/**
 * Walk-in price is display copy until the walk-in pricing enforcement spec
 * lands and adds a real per-org rate. See
 * docs/superpowers/specs/2026-06-18-adult-youth-sitemap-redesign-design.md
 * (Out of scope / follow-ups).
 */
export const WALK_IN_RATE_CENTS = 1700

function dollars(cents: number): string {
  return `$${Math.round(cents / 100)}`
}

export function pricingTiers(
  rate: RateCardCents,
  walkInCents: number = WALK_IN_RATE_CENTS,
): PricingTier[] {
  const save = walkInCents - rate.defaultMemberRateCents
  return [
    { amountLabel: dollars(walkInCents), label: "Walk-in" },
    { amountLabel: dollars(rate.defaultSessionRateCents), label: "Book online" },
    {
      amountLabel: dollars(rate.defaultMemberRateCents),
      label: "Member",
      best: true,
      note: save > 0 ? `Save ${dollars(save)} →` : undefined,
    },
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/pickup-pricing.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/pickup-pricing.ts tests/unit/pickup-pricing.test.ts
git commit -m "feat(landing): pickup pricing-tier helper (walk-in copy + live rate card)"
```

---

### Task 4: Cross-island finder-filter event + React hook

**Files:**
- Create: `src/lib/landing/finder-filter.ts`
- Create: `src/lib/hooks/use-finder-filter.ts`

No unit test — this is DOM event plumbing, exercised by the Playwright e2e in Task 14. Verified here by type-check.

- [ ] **Step 1: Write the event module**

```ts
// src/lib/landing/finder-filter.ts
export const FINDER_FILTER_EVENT = "aspire:finder-filter"

export interface FinderFilterDetail {
  /** Sport slug (seasons) or sport word (pickup) to filter to. */
  key: string
  /** Id of the finder <section> to scroll to and that should react. */
  sectionId: string
}

/** Fired by a hero tile: notify the finder island, then scroll to it. */
export function dispatchFinderFilter(detail: FinderFilterDetail): void {
  window.dispatchEvent(new CustomEvent<FinderFilterDetail>(FINDER_FILTER_EVENT, { detail }))
  document
    .getElementById(detail.sectionId)
    ?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/** Subscribe to tile filter events. Returns an unsubscribe fn. */
export function onFinderFilter(cb: (detail: FinderFilterDetail) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<FinderFilterDetail>).detail)
  window.addEventListener(FINDER_FILTER_EVENT, handler)
  return () => window.removeEventListener(FINDER_FILTER_EVENT, handler)
}
```

- [ ] **Step 2: Write the React hook**

```ts
// src/lib/hooks/use-finder-filter.ts
"use client"
import { useEffect, useRef } from "react"
import { onFinderFilter, type FinderFilterDetail } from "@/lib/landing/finder-filter"

/**
 * Run `cb` whenever a hero tile dispatches a finder-filter event. The callback
 * is held in a ref so the window listener is attached once, not re-subscribed
 * on every render (the caller need not memoize `cb`).
 */
export function useFinderFilter(cb: (detail: FinderFilterDetail) => void): void {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => onFinderFilter((detail) => ref.current(detail)), [])
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/landing/finder-filter.ts src/lib/hooks/use-finder-filter.ts
git commit -m "feat(landing): cross-island finder-filter event + useFinderFilter hook"
```

---

## Phase 2 — Wire the finder islands to react to tile filters

### Task 5: SeasonsFinderSection reacts to a tile filter (by sport slug)

**Files:**
- Modify: `src/components/landing/seasons-finder-section.tsx`

- [ ] **Step 1: Import the hook**

At the top of `src/components/landing/seasons-finder-section.tsx`, add to the imports (after the existing `useEffect, useMemo, useState` import line):

```ts
import { useFinderFilter } from "@/lib/hooks/use-finder-filter"
```

- [ ] **Step 2: Apply incoming tile events to the Sport filter**

Immediately after the existing `const [visible, setVisible] = useState(PAGE_SIZE)` line (around line 92), add:

```ts
  // A hero tile elsewhere on the page can pre-apply this section's Sport
  // filter. The section's Sport chips key on `sport.slug`, and category-page
  // tiles carry the matching slug, so we set activeSport directly.
  useFinderFilter((detail) => {
    if (detail.sectionId === id) setActiveSport(detail.key)
  })
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/seasons-finder-section.tsx
git commit -m "feat(landing): seasons finder reacts to hero-tile sport filter"
```

---

### Task 6: PickupFinderSection reacts to a tile filter (by label substring)

**Files:**
- Modify: `src/components/landing/pickup-finder-section.tsx`

Pickup sessions carry a free-text `sportOrClassLabel` (no slug), so the tile key is matched case-insensitively as a substring, via a separate external-filter state that ANDs with the chips.

- [ ] **Step 1: Import the hook**

Add to the imports at the top of `src/components/landing/pickup-finder-section.tsx`:

```ts
import { useFinderFilter } from "@/lib/hooks/use-finder-filter"
```

- [ ] **Step 2: Add external-filter state + subscription**

After the existing `const [visible, setVisible] = useState(PAGE_SIZE)` line (around line 70), add:

```ts
  // Hero tile → sport filter. Pickup labels are free text ("Coed 7v7 Soccer"),
  // so we match the tile's sport word as a case-insensitive substring rather
  // than an exact chip value.
  const [externalSportKey, setExternalSportKey] = useState<string | null>(null)
  useFinderFilter((detail) => {
    if (detail.sectionId === id) setExternalSportKey(detail.key)
  })
```

- [ ] **Step 3: Reset pagination when the external filter changes**

Change the existing effect (around line 72):

```ts
  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [activeDate, activeSport, activeSkill, activeVenue])
```

to include `externalSportKey`:

```ts
  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [activeDate, activeSport, activeSkill, activeVenue, externalSportKey])
```

- [ ] **Step 4: Apply the external filter in the predicate**

In the `filtered` useMemo (around lines 93-101), add the external-key check as the first predicate and include it in the dep array:

```ts
  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (externalSportKey && !s.sportOrClassLabel.toLowerCase().includes(externalSportKey.toLowerCase())) return false
      if (activeDate && dateBucket(s.startsAt) !== activeDate) return false
      if (activeSport && s.sportOrClassLabel !== activeSport) return false
      if (activeSkill && s.skillLevel !== activeSkill) return false
      if (activeVenue && s.venueName !== activeVenue) return false
      return true
    })
  }, [sessions, activeDate, activeSport, activeSkill, activeVenue, externalSportKey])
```

- [ ] **Step 5: Clear the external filter when "Clear filters" runs**

Update `clearFilters` (around line 103) and `hasActiveFilters` (around line 109):

```ts
  const clearFilters = () => {
    setActiveDate(null)
    setActiveSport(null)
    setActiveSkill(null)
    setActiveVenue(null)
    setExternalSportKey(null)
  }
  const hasActiveFilters =
    activeDate !== null || activeSport !== null || activeSkill !== null ||
    activeVenue !== null || externalSportKey !== null
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/pickup-finder-section.tsx
git commit -m "feat(landing): pickup finder reacts to hero-tile sport filter"
```

---

## Phase 3 — Reusable Astro components

### Task 7: CategoryHero component (video hero + tiles)

**Files:**
- Create: `src/components/landing/category-hero.astro`

- [ ] **Step 1: Write the component**

```astro
---
// src/components/landing/category-hero.astro
// Reusable bold-catalog hero for category pages (pickup, tournaments,
// youth/leagues, youth/camps). Mirrors the hero on /adult/leagues: full-bleed
// video, layered oklch overlay, display headline, sport/format tiles, and an
// optional cross-link. Live tiles either link out (when `href` is set) or
// scroll-and-filter the finder section identified by `finderId`.
import { tileLinksOut, type HeroTile } from "@/lib/landing/hero-tiles"

interface Props {
  title: string
  subhead: string
  /** mp4 sources, highest quality first. */
  videoSources: string[]
  poster: string
  tiles: HeroTile[]
  /** Finder <section> id the tiles scroll to / filter (e.g. "sessions"). */
  finderId: string
  crosslink?: { prompt: string; href: string; label: string }
}
const { title, subhead, videoSources, poster, tiles, finderId, crosslink } = Astro.props
---

<section class="relative text-cream pt-16 px-9 pb-8 overflow-hidden">
  <video autoplay muted loop playsinline class="absolute inset-0 w-full h-full object-cover z-0" poster={poster}>
    {videoSources.map((src) => <source src={src} type="video/mp4" />)}
  </video>
  <div class="absolute inset-0 z-[1]" style="background:linear-gradient(180deg,oklch(0.18 0.07 262/0.45),oklch(0.18 0.07 262/0.82)),linear-gradient(100deg,oklch(0.18 0.07 262/0.7),oklch(0.18 0.07 262/0.25))"></div>
  <div class="relative z-[2] max-w-[1080px] mx-auto">
    <h1 class="font-display font-semibold tracking-tight" style="font-size:clamp(2.5rem,6vw,4rem);line-height:.95">{title}</h1>
    <p class="mt-3 text-base text-cream/90 max-w-[520px]">{subhead}</p>

    <div class="grid sm:grid-cols-3 gap-3 mt-6">
      {tiles.map((t) =>
        tileLinksOut(t) ? (
          <a href={t.href} data-sport-tile data-sport={t.key} data-state="live" class="relative rounded-2xl p-4 text-ink overflow-hidden" style={`background:${t.color}`}>
            <div class="font-mono text-[9px] tracking-widest uppercase opacity-80">{t.statusLabel}</div>
            <div class="font-display font-semibold text-2xl mt-1.5">{t.label}</div>
            <div class="font-mono text-xs">{t.meta}</div>
            <span class="absolute right-4 bottom-4 font-semibold text-lg">→</span>
          </a>
        ) : t.state === "live" ? (
          <button type="button" data-sport-tile data-sport={t.key} data-state="live" data-finder={finderId} class="relative text-left rounded-2xl p-4 text-ink overflow-hidden cursor-pointer" style={`background:${t.color}`}>
            <div class="font-mono text-[9px] tracking-widest uppercase opacity-80">{t.statusLabel}</div>
            <div class="font-display font-semibold text-2xl mt-1.5">{t.label}</div>
            <div class="font-mono text-xs">{t.meta}</div>
            <span class="absolute right-4 bottom-4 font-semibold text-lg">→</span>
          </button>
        ) : (
          <div data-sport-tile data-sport={t.key} data-state="coming_soon" class="rounded-2xl p-4 border border-cream/25 text-cream/80" style="background:oklch(0.2 0.06 262/0.7)">
            <div class="font-mono text-[9px] tracking-widest uppercase opacity-80">{t.statusLabel}</div>
            <div class="font-display font-semibold text-2xl mt-1.5">{t.label}</div>
            <div class="font-mono text-xs">{t.meta}</div>
          </div>
        ),
      )}
    </div>

    {crosslink && (
      <p class="mt-5 text-sm text-cream/70">
        {crosslink.prompt}{" "}
        <a href={crosslink.href} class="underline underline-offset-2 hover:text-cream transition-colors">{crosslink.label}</a>
      </p>
    )}
  </div>
</section>

<script>
  import { trackCatalogSportTileClicked } from "@/lib/analytics/events"
  import { dispatchFinderFilter } from "@/lib/landing/finder-filter"

  document.querySelectorAll<HTMLElement>("[data-sport-tile]").forEach((el) => {
    el.addEventListener("click", () => {
      const state = (el.dataset.state as "live" | "coming_soon") ?? "live"
      trackCatalogSportTileClicked({ sport: el.dataset.sport ?? "", state })
      // A live tile with a data-finder attr (no href) scroll-filters the finder.
      const finderId = el.dataset.finder
      if (state === "live" && finderId) {
        dispatchFinderFilter({ key: el.dataset.sport ?? "", sectionId: finderId })
      }
    })
  })
</script>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (Astro `.astro` files are type-checked via the build in Task 15; `tsc` covers the imported TS.)

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/category-hero.astro
git commit -m "feat(landing): reusable CategoryHero (video hero + sport tiles)"
```

---

### Task 8: HubHero + CategoryCard components

**Files:**
- Create: `src/components/landing/hub-hero.astro`
- Create: `src/components/landing/category-card.astro`

- [ ] **Step 1: Write HubHero**

```astro
---
// src/components/landing/hub-hero.astro
// Bold-catalog hero for the audience hubs (/adult, /youth). Video bg + display
// headline + subhead. No eyebrow (project preference). Hub cards render below
// via <CategoryCard> in the page.
interface Props {
  title: string
  subhead: string
  videoSources: string[]
  poster: string
}
const { title, subhead, videoSources, poster } = Astro.props
---

<section class="relative text-cream pt-[76px] px-9 pb-11 overflow-hidden" style="background:#0f1530">
  <video autoplay muted loop playsinline class="absolute inset-0 w-full h-full object-cover z-0 opacity-55" poster={poster}>
    {videoSources.map((src) => <source src={src} type="video/mp4" />)}
  </video>
  <div class="absolute inset-0 z-[1]" style="background:linear-gradient(180deg,oklch(0.18 0.07 262/0.55),oklch(0.18 0.07 262/0.86))"></div>
  <div class="relative z-[2] max-w-[1080px] mx-auto">
    <h1 class="font-display font-semibold tracking-tight" style="font-size:clamp(2.5rem,6.5vw,4.5rem);line-height:.95;max-width:15ch">{title}</h1>
    <p class="mt-4 text-lg text-cream/90 max-w-[560px]">{subhead}</p>
  </div>
</section>
```

- [ ] **Step 2: Write CategoryCard**

```astro
---
// src/components/landing/category-card.astro
// Colored, animated hub door card. Each category owns a palette ("leagues" |
// "pickup" | "tournaments" | "youth-a" | "youth-b"); a slow aurora gradient
// drifts behind it and the arrow slides on hover. Honors prefers-reduced-motion.
interface Props {
  href: string
  cta: string                 // analytics id, e.g. "adult-hub-leagues"
  palette: "leagues" | "pickup" | "tournaments" | "youth-a" | "youth-b"
  title: string
  blurb: string
  statusLabel: string
  /** Pulsing live dot next to the status label (active categories). */
  live?: boolean
  ctaLabel: string            // e.g. "Browse leagues"
}
const { href, cta, palette, title, blurb, statusLabel, live = false, ctaLabel } = Astro.props
---

<a href={href} data-landing-cta={cta} class={`door door-${palette} relative rounded-[22px] overflow-hidden min-h-[250px] flex flex-col justify-end p-6 text-cream no-underline`} style="isolation:isolate">
  <div class="aurora absolute inset-[-40%] z-0" style="filter:blur(8px);opacity:.95"></div>
  <div class="absolute inset-0 z-[1]" style="background:linear-gradient(180deg,transparent,oklch(0.16 0.06 280/0.55))"></div>
  <div class="relative z-[2]">
    <div class="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.18em] uppercase opacity-95">
      {live && <span class="dot inline-block w-[7px] h-[7px] rounded-full bg-cream"></span>}
      {statusLabel}
    </div>
    <h2 class="font-display font-semibold text-[28px] mt-2">{title}</h2>
    <p class="text-[13px] text-cream/90 mt-1.5 max-w-[30ch]">{blurb}</p>
    <span class="go inline-flex items-center gap-2 mt-4 text-xs font-bold tracking-wide">{ctaLabel} <span class="arrow">→</span></span>
  </div>
</a>

<style>
  .door { transition: transform .2s ease, box-shadow .2s ease; }
  .door:hover { transform: translateY(-4px); box-shadow: 0 18px 40px oklch(0.18 0.07 262/0.35); }
  .door .arrow { transition: transform .2s ease; }
  .door:hover .go .arrow { transform: translateX(6px); }
  .aurora { animation: drift 14s ease-in-out infinite; }
  .door:hover .aurora { animation-duration: 6s; }
  .dot { animation: pulse 2s infinite; }

  .door-leagues .aurora { background:
    radial-gradient(60% 60% at 20% 20%, oklch(0.72 0.2 40), transparent 60%),
    radial-gradient(70% 70% at 80% 75%, oklch(0.6 0.22 25), transparent 60%),
    linear-gradient(135deg, oklch(0.62 0.2 35), oklch(0.45 0.16 20)); }
  .door-pickup .aurora { background:
    radial-gradient(60% 60% at 25% 25%, oklch(0.74 0.15 200), transparent 60%),
    radial-gradient(70% 70% at 80% 80%, oklch(0.55 0.16 250), transparent 60%),
    linear-gradient(135deg, oklch(0.6 0.14 220), oklch(0.42 0.13 250)); }
  .door-tournaments .aurora { background:
    radial-gradient(60% 60% at 30% 20%, oklch(0.68 0.2 320), transparent 60%),
    radial-gradient(70% 70% at 75% 80%, oklch(0.5 0.2 295), transparent 60%),
    linear-gradient(135deg, oklch(0.58 0.2 310), oklch(0.4 0.16 290)); }
  .door-youth-a .aurora { background:
    radial-gradient(60% 60% at 22% 22%, oklch(0.8 0.18 145), transparent 60%),
    radial-gradient(70% 70% at 80% 78%, oklch(0.66 0.18 170), transparent 60%),
    linear-gradient(135deg, oklch(0.7 0.17 150), oklch(0.5 0.15 175)); }
  .door-youth-b .aurora { background:
    radial-gradient(60% 60% at 25% 20%, oklch(0.82 0.17 85), transparent 60%),
    radial-gradient(70% 70% at 78% 80%, oklch(0.7 0.19 55), transparent 60%),
    linear-gradient(135deg, oklch(0.76 0.18 70), oklch(0.58 0.16 45)); }

  @keyframes drift {
    0% { transform: translate(0,0) scale(1.05); }
    33% { transform: translate(3%,-4%) scale(1.12); }
    66% { transform: translate(-3%,3%) scale(1.08); }
    100% { transform: translate(0,0) scale(1.05); }
  }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(244,239,227,.6); }
    70% { box-shadow: 0 0 0 7px rgba(244,239,227,0); }
    100% { box-shadow: 0 0 0 0 rgba(244,239,227,0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .aurora, .dot { animation: none !important; }
  }
</style>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/hub-hero.astro src/components/landing/category-card.astro
git commit -m "feat(landing): HubHero + animated CategoryCard components"
```

---

### Task 9: Pickup pricing band + skill-level explainer components

**Files:**
- Create: `src/components/landing/pickup-pricing-band.astro`
- Create: `src/components/landing/pickup-levels.astro`

- [ ] **Step 1: Write the pricing band**

```astro
---
// src/components/landing/pickup-pricing-band.astro
import { pricingTiers, type RateCardCents } from "@/lib/landing/pickup-pricing"
interface Props { rate: RateCardCents }
const { rate } = Astro.props
const tiers = pricingTiers(rate)
---

<section class="bg-ink text-cream">
  <div class="max-w-[1080px] mx-auto px-9 py-7 flex items-center gap-7 flex-wrap">
    <div class="flex-1 min-w-[220px]">
      <h3 class="font-display font-semibold text-xl">One price, three ways to pay.</h3>
      <p class="text-[13px] text-cream/65 mt-1">Same session — you choose how you book. Members play cheapest, every time.</p>
    </div>
    <div class="flex gap-2.5">
      {tiers.map((t) => (
        <div class={`rounded-2xl px-4 py-3.5 text-center min-w-[118px] ${t.best ? "text-ink" : "border border-cream/20"}`} style={t.best ? "background:oklch(0.66 0.21 35)" : ""}>
          <div class="font-bold text-[26px]">{t.amountLabel}</div>
          <div class="text-[10px] tracking-[0.12em] uppercase mt-1 opacity-80">{t.label}</div>
          {t.note && <div class="text-[10px] font-bold mt-1.5">{t.note}</div>}
        </div>
      ))}
    </div>
  </div>
</section>
```

- [ ] **Step 2: Write the skill-level explainer**

```astro
---
// src/components/landing/pickup-levels.astro
import { SKILL_LEVEL_TIERS } from "@/lib/landing/skill-levels"
---

<section class="max-w-[1080px] mx-auto px-9 pt-12 pb-3">
  <h2 class="font-display font-semibold text-[28px] text-ink">Find your level</h2>
  <p class="text-ink-muted mt-1.5 text-sm">Every session is tagged so you know what you're walking into. Show up where you'll have the best time.</p>
  <div class="grid sm:grid-cols-3 gap-3.5 mt-5">
    {SKILL_LEVEL_TIERS.map((t) => (
      <div class="border border-border rounded-2xl p-5 bg-paper">
        <span class={`inline-block text-[10px] font-bold tracking-wide uppercase px-2.5 py-1 rounded-full ${t.display.badgeClass}`}>{t.display.label}</span>
        <h3 class="font-display font-semibold text-[18px] mt-2.5 text-ink">{t.headline}</h3>
        <p class="text-[13px] text-ink-muted mt-1.5 leading-relaxed">{t.blurb}</p>
      </div>
    ))}
  </div>
</section>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/pickup-pricing-band.astro src/components/landing/pickup-levels.astro
git commit -m "feat(landing): pickup pricing band + skill-level explainer"
```

---

## Phase 4 — Pages

### Task 10: Redesign `/adult/pickup` (full template)

**Files:**
- Modify: `src/pages/adult/pickup.astro` (full replacement)

The page fetches the org drop-in rate card server-side for the pricing band, renders the new `CategoryHero` + pricing band + skill explainer, then the existing `PickupPageFinder` island (finder section id is `"sessions"`).

- [ ] **Step 1: Replace the page**

```astro
---
// src/pages/adult/pickup.astro
// SSR — /api/dropin/sessions is org-scoped via the request host. The pricing
// band reads the org drop-in rate card server-side (falls back to enum
// defaults if unset). Bold-catalog redesign — see
// docs/superpowers/specs/2026-06-18-adult-youth-sitemap-redesign-design.md
import { eq } from "drizzle-orm"
import BaseLayout from "@/layouts/BaseLayout.astro"
import CategoryHero from "@/components/landing/category-hero.astro"
import PickupPricingBand from "@/components/landing/pickup-pricing-band.astro"
import PickupLevels from "@/components/landing/pickup-levels.astro"
import PickupPageFinder from "@/components/landing/pickup-page-finder.tsx"
import CTABanner from "@/components/cta-banner"
import { getDb } from "@/lib/db"
import { dropInRateCard } from "@/lib/db/schema/drop-in"
import type { HeroTile } from "@/lib/landing/hero-tiles"

const orgId = Astro.locals.organization?.id ?? null
let rate = { defaultSessionRateCents: 1500, defaultMemberRateCents: 1200 }
if (orgId) {
  const [card] = await getDb()
    .select({
      defaultSessionRateCents: dropInRateCard.defaultSessionRateCents,
      defaultMemberRateCents: dropInRateCard.defaultMemberRateCents,
    })
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, orgId))
    .limit(1)
  if (card) rate = card
}

const tiles: HeroTile[] = [
  { label: "Soccer", key: "soccer", state: "live", statusLabel: "● Open this week", meta: "Sessions most nights", color: "oklch(0.66 0.21 35)" },
  { label: "Basketball", key: "basketball", state: "coming_soon", statusLabel: "Coming soon", meta: "Interested? Notify me" },
  { label: "Volleyball", key: "volleyball", state: "coming_soon", statusLabel: "Coming soon", meta: "Interested? Notify me" },
]
---

<BaseLayout
  title="Pickup — Aspire Sports"
  description="Drop-in pickup sessions in Columbus and central Ohio. Pay per session, show up and play — no season commitment."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/adult/pickup`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <CategoryHero
      title="Pickup."
      subhead="No season, no roster, no pressure — pay per session, show up, and play. Pick a sport to see what's open."
      videoSources={[
        "https://videos.pexels.com/video-files/6077723/6077723-hd_1920_1080_25fps.mp4",
        "https://videos.pexels.com/video-files/6077723/6077723-sd_640_360_25fps.mp4",
      ]}
      poster="https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&w=1600&q=60"
      tiles={tiles}
      finderId="sessions"
      crosslink={{ prompt: "Ready for a season?", href: "/adult/leagues", label: "Adult leagues →" }}
    />

    <PickupPricingBand rate={rate} />
    <PickupLevels />

    <PickupPageFinder client:load />

    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/adult/pickup.astro
git commit -m "feat(pickup): bold-catalog hero + pricing band + skill levels"
```

---

### Task 11: Redesign `/adult/tournaments` and the youth category pages

**Files:**
- Modify: `src/pages/adult/tournaments.astro`
- Modify: `src/pages/youth/leagues.astro`
- Modify: `src/pages/youth/camps.astro`

These three keep their `CategoryFinder` island (no pricing/skill bands) and swap the flat hero for `CategoryHero`. Their finder section id equals the `sectionId` they already pass to `CategoryFinder`.

- [ ] **Step 1: Replace `/adult/tournaments`**

```astro
---
// src/pages/adult/tournaments.astro
// SSR — the island fetches host-scoped public endpoints client-side.
import BaseLayout from "@/layouts/BaseLayout.astro"
import CategoryHero from "@/components/landing/category-hero.astro"
import CategoryFinder from "@/components/landing/category-finder.tsx"
import CTABanner from "@/components/cta-banner"
import type { HeroTile } from "@/lib/landing/hero-tiles"

const tiles: HeroTile[] = [
  { label: "Soccer", key: "soccer", state: "live", statusLabel: "● One-day brackets", meta: "Open for registration", color: "oklch(0.66 0.21 35)" },
  { label: "Basketball", key: "basketball", state: "coming_soon", statusLabel: "Coming soon", meta: "Interested? Notify me" },
  { label: "Volleyball", key: "volleyball", state: "coming_soon", statusLabel: "Coming soon", meta: "Interested? Notify me" },
]
---

<BaseLayout
  title="Adult Tournaments — Aspire Sports"
  description="One-day adult sports tournaments in Columbus and central Ohio. Bring a full team or sign up solo and get placed."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/adult/tournaments`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <CategoryHero
      title="Adult tournaments."
      subhead="One-day events — a full bracket, fair refs, and a winner by sundown. Bring a team or sign up and get placed."
      videoSources={[
        "https://videos.pexels.com/video-files/6077723/6077723-hd_1920_1080_25fps.mp4",
        "https://videos.pexels.com/video-files/6077723/6077723-sd_640_360_25fps.mp4",
      ]}
      poster="https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&w=1600&q=60"
      tiles={tiles}
      finderId="adult-tournaments"
      crosslink={{ prompt: "Want season-long play instead?", href: "/adult/leagues", label: "Adult leagues →" }}
    />

    <CategoryFinder
      client:load
      audience="adult"
      programTypes={["tournament"]}
      title="Open now"
      descriptor="One-day brackets open for registration."
      sectionId="adult-tournaments"
    />

    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 2: Replace `/youth/leagues`**

```astro
---
// src/pages/youth/leagues.astro
// SSR — the island fetches host-scoped public endpoints client-side.
import BaseLayout from "@/layouts/BaseLayout.astro"
import CategoryHero from "@/components/landing/category-hero.astro"
import CategoryFinder from "@/components/landing/category-finder.tsx"
import CTABanner from "@/components/cta-banner"
import type { HeroTile } from "@/lib/landing/hero-tiles"

const tiles: HeroTile[] = [
  { label: "Soccer", key: "soccer", state: "live", statusLabel: "● Now enrolling", meta: "Leagues & classes", color: "oklch(0.66 0.21 35)" },
  { label: "Basketball", key: "basketball", state: "coming_soon", statusLabel: "Coming soon", meta: "Interested? Notify me" },
  { label: "Multi-sport", key: "multi-sport", state: "coming_soon", statusLabel: "Coming soon", meta: "Interested? Notify me" },
]
---

<BaseLayout
  title="Youth Leagues & Classes — Aspire Sports"
  description="Youth sports leagues and skill-building classes in Columbus and central Ohio. Vetted coaches, organized seasons, sorted by your kid's age."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/youth/leagues`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <CategoryHero
      title="Youth leagues & classes."
      subhead="Season leagues and skill-building classes with vetted coaches and tight logistics. Filter by your kid's age and go."
      videoSources={[
        "https://videos.pexels.com/video-files/6077723/6077723-hd_1920_1080_25fps.mp4",
        "https://videos.pexels.com/video-files/6077723/6077723-sd_640_360_25fps.mp4",
      ]}
      poster="https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&w=1600&q=60"
      tiles={tiles}
      finderId="youth-leagues"
      crosslink={{ prompt: "School breaks coming up?", href: "/youth/camps", label: "Youth camps →" }}
    />

    <CategoryFinder
      client:load
      audience="youth"
      programTypes={["league", "training", "clinic"]}
      title="Open now"
      descriptor="Use the age filter — every program shows its age range on the card."
      ageChips
      sectionId="youth-leagues"
    />

    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 3: Replace `/youth/camps`**

```astro
---
// src/pages/youth/camps.astro
// SSR — the island fetches host-scoped public endpoints client-side.
import BaseLayout from "@/layouts/BaseLayout.astro"
import CategoryHero from "@/components/landing/category-hero.astro"
import CategoryFinder from "@/components/landing/category-finder.tsx"
import CTABanner from "@/components/cta-banner"
import type { HeroTile } from "@/lib/landing/hero-tiles"

const tiles: HeroTile[] = [
  { label: "Soccer", key: "soccer", state: "live", statusLabel: "● Booking now", meta: "School-break & summer", color: "oklch(0.66 0.21 35)" },
  { label: "Multi-sport", key: "multi-sport", state: "coming_soon", statusLabel: "Coming soon", meta: "Interested? Notify me" },
  { label: "Basketball", key: "basketball", state: "coming_soon", statusLabel: "Coming soon", meta: "Interested? Notify me" },
]
---

<BaseLayout
  title="Youth Camps — Aspire Sports"
  description="Youth sports camps in Columbus and central Ohio — school-break and summer day camps, coached properly, organized tightly."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/youth/camps`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <CategoryHero
      title="Youth camps."
      subhead="Full days of play for school breaks and summer — real coaching, tight drop-off and pick-up logistics, zero chaos."
      videoSources={[
        "https://videos.pexels.com/video-files/6077723/6077723-hd_1920_1080_25fps.mp4",
        "https://videos.pexels.com/video-files/6077723/6077723-sd_640_360_25fps.mp4",
      ]}
      poster="https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&w=1600&q=60"
      tiles={tiles}
      finderId="youth-camps"
      crosslink={{ prompt: "Looking for a season instead?", href: "/youth/leagues", label: "Youth leagues & classes →" }}
    />

    <CategoryFinder
      client:load
      audience="youth"
      programTypes={["camp"]}
      title="Open now"
      descriptor="Filter by age and venue — every camp shows its dates on the card."
      ageChips
      sectionId="youth-camps"
    />

    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/adult/tournaments.astro src/pages/youth/leagues.astro src/pages/youth/camps.astro
git commit -m "feat(catalog): bold-catalog heroes for tournaments + youth category pages"
```

---

### Task 12: Redesign the `/adult` hub

**Files:**
- Modify: `src/pages/adult.astro` (replace the hero + doors sections; keep the `<script>` anchor-redirect + analytics intact)

- [ ] **Step 1: Replace the page**

```astro
---
// One-screen hub: video hero + colored animated category doors. Inventory
// lives on the category pages. Bold-catalog redesign — see
// docs/superpowers/specs/2026-06-18-adult-youth-sitemap-redesign-design.md
import BaseLayout from "@/layouts/BaseLayout.astro";
import HubHero from "@/components/landing/hub-hero.astro";
import CategoryCard from "@/components/landing/category-card.astro";
import NextUpCard from "@/components/marketing/next-up-card.astro";
import { getActiveSiteAnnouncement } from "@/lib/marketing/site-announcement";
const announcement = getActiveSiteAnnouncement(Astro.locals.organization, "adult");

const doors = [
  { href: "/adult/leagues", cta: "adult-hub-leagues", palette: "leagues" as const,
    title: "Leagues", blurb: "Season-long play. Build a team or join as a free agent.",
    statusLabel: "Now registering", live: true, ctaLabel: "Browse leagues" },
  { href: "/adult/pickup", cta: "adult-hub-pickup", palette: "pickup" as const,
    title: "Pickup", blurb: "Show up and play. Pay per session, no commitment.",
    statusLabel: "Open this week", live: true, ctaLabel: "Browse pickup" },
  { href: "/adult/tournaments", cta: "adult-hub-tournaments", palette: "tournaments" as const,
    title: "Tournaments", blurb: "Bring a team or get placed. A winner by sundown.",
    statusLabel: "One-day brackets", live: false, ctaLabel: "Browse tournaments" },
];
---

<BaseLayout
  title="Adult Sports Leagues — Aspire Sports"
  description="Adult sports leagues, pickup, and tournaments in central Ohio. Find a league, play pickup, or register for a tournament — Aspire Sports."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/adult`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <HubHero
      title="Three ways to play. One standard."
      subhead="Leagues, pickup, or tournaments — same fair refs, tight logistics, and post-game scene across all three. Pick your speed."
      videoSources={["https://videos.pexels.com/video-files/3196586/3196586-uhd_2560_1440_25fps.mp4"]}
      poster="https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1600&q=60"
    />

    {announcement && (
      <div class="max-w-[1080px] mx-auto px-9 pt-6">
        <NextUpCard announcement={announcement} />
      </div>
    )}

    <section class="max-w-[1080px] mx-auto px-9 pt-7 pb-16 grid grid-cols-1 md:grid-cols-3 gap-4">
      {doors.map((d) => (
        <CategoryCard
          href={d.href} cta={d.cta} palette={d.palette} title={d.title}
          blurb={d.blurb} statusLabel={d.statusLabel} live={d.live} ctaLabel={d.ctaLabel}
        />
      ))}
    </section>
  </main>
</BaseLayout>

<script>
  import { track } from "@/lib/analytics/track";

  // Legacy section anchors (pre-Phase-2 bookmarks) → category pages.
  const anchorMap: Record<string, string> = {
    leagues: "/adult/leagues",
    pickup: "/adult/pickup",
    tournaments: "/adult/tournaments",
  };
  const hash = location.hash.slice(1);
  if (Object.hasOwn(anchorMap, hash)) location.replace(anchorMap[hash]);

  document.querySelectorAll<HTMLAnchorElement>("[data-landing-cta]").forEach((el) => {
    el.addEventListener("click", () => {
      track("landing_hero_cta_click", { cta: el.dataset.landingCta });
    });
  });
</script>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/adult.astro
git commit -m "feat(adult-hub): video hero + colored animated category cards"
```

---

### Task 13: Redesign the `/youth` hub

**Files:**
- Modify: `src/pages/youth.astro` (replace hero + doors; keep `<script>` intact)

- [ ] **Step 1: Replace the page**

```astro
---
// One-screen hub: video hero + colored animated category doors. Inventory
// lives on the category pages. Bold-catalog redesign — see
// docs/superpowers/specs/2026-06-18-adult-youth-sitemap-redesign-design.md
import BaseLayout from "@/layouts/BaseLayout.astro";
import HubHero from "@/components/landing/hub-hero.astro";
import CategoryCard from "@/components/landing/category-card.astro";
import NextUpCard from "@/components/marketing/next-up-card.astro";
import { getActiveSiteAnnouncement } from "@/lib/marketing/site-announcement";
const announcement = getActiveSiteAnnouncement(Astro.locals.organization, "youth");

const doors = [
  { href: "/youth/leagues", cta: "youth-hub-leagues", palette: "youth-a" as const,
    title: "Leagues & Classes", blurb: "Season leagues and skill-building classes, filtered by your kid's age.",
    statusLabel: "Now enrolling", live: true, ctaLabel: "Browse leagues & classes" },
  { href: "/youth/camps", cta: "youth-hub-camps", palette: "youth-b" as const,
    title: "Camps", blurb: "School-break and summer day camps — real coaching, tight logistics.",
    statusLabel: "Booking now", live: true, ctaLabel: "Browse camps" },
];
---

<BaseLayout
  title="Youth Sports Programs — Aspire Sports"
  description="Leagues, classes, camps, clinics and tournaments for kids in central Ohio. Find the right program for your kid's age — Aspire Sports."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/youth`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <HubHero
      title="Sports your kid will actually look forward to."
      subhead="Real coaches, real development — built on the Double-Goal Coach and ELM frameworks. Find what fits your kid by age, format, sport, and venue."
      videoSources={["https://videos.pexels.com/video-files/3196586/3196586-uhd_2560_1440_25fps.mp4"]}
      poster="https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1600&q=60"
    />

    {announcement && (
      <div class="max-w-[1080px] mx-auto px-9 pt-6">
        <NextUpCard announcement={announcement} />
      </div>
    )}

    <section class="max-w-[1080px] mx-auto px-9 pt-7 pb-16 grid grid-cols-1 md:grid-cols-2 gap-4">
      {doors.map((d) => (
        <CategoryCard
          href={d.href} cta={d.cta} palette={d.palette} title={d.title}
          blurb={d.blurb} statusLabel={d.statusLabel} live={d.live} ctaLabel={d.ctaLabel}
        />
      ))}
    </section>
  </main>
</BaseLayout>

<script>
  import { track } from "@/lib/analytics/track";

  // Legacy age-band anchors (pre-Phase-2 bookmarks) → leagues category page.
  const anchorMap: Record<string, string> = {
    "ages-4-8": "/youth/leagues",
    "ages-9-12": "/youth/leagues",
    "ages-13-18": "/youth/leagues",
  };
  const hash = location.hash.slice(1);
  if (Object.hasOwn(anchorMap, hash)) location.replace(anchorMap[hash]);

  document.querySelectorAll<HTMLAnchorElement>("[data-landing-cta]").forEach((el) => {
    el.addEventListener("click", () => {
      track("landing_hero_cta_click", { cta: el.dataset.landingCta });
    });
  });
</script>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/youth.astro
git commit -m "feat(youth-hub): video hero + colored animated category cards"
```

---

## Phase 5 — Polish

### Task 14: Per-level color on the pickup card skill badge

**Files:**
- Modify: `src/components/landing/pickup-card.tsx:102-107`

The badge currently always uses `bg-primary/10 text-primary`. Color it by level using the shared map so the finder cards match the explainer.

- [ ] **Step 1: Import the display map**

Add to the imports at the top of `src/components/landing/pickup-card.tsx`:

```ts
import { skillLevelDisplay } from "@/lib/landing/skill-levels"
```

- [ ] **Step 2: Use the per-level classes + label**

Replace the skill badge block (lines 102-107):

```tsx
        {/* Skill badge — at most one, mirrors ProgramCardV2's format badge */}
        <div className="mt-2">
          <span className="inline-flex items-center font-semibold tracking-wide uppercase text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">
            {session.skillLevel.replace("_", " ")}
          </span>
        </div>
```

with:

```tsx
        {/* Skill badge — at most one, color-coded by level (see skill-levels.ts) */}
        <div className="mt-2">
          <span className={`inline-flex items-center font-semibold tracking-wide uppercase text-[10px] px-2 py-0.5 rounded ${skillLevelDisplay(session.skillLevel).badgeClass}`}>
            {skillLevelDisplay(session.skillLevel).label}
          </span>
        </div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/pickup-card.tsx
git commit -m "feat(pickup): color-code session skill badge by level"
```

---

## Phase 6 — Verification

### Task 15: E2E — pickup hero tile scroll-filters the finder

**Files:**
- Create: `tests/e2e/pickup-hero-tile.spec.ts`

Requires a running dev server (`npm run dev`) and the e2e seed. The soccer tile is a live, no-href tile, so clicking it dispatches the finder-filter event and scrolls to `#sessions`.

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/pickup-hero-tile.spec.ts
import { test, expect } from "@playwright/test"
import { waitForHydration } from "../utils/test-helpers"

test("@critical pickup soccer tile scroll-filters the finder", async ({ page }) => {
  await page.goto("/adult/pickup", { waitUntil: "domcontentloaded" })
  await waitForHydration(page)

  // The live Soccer tile is a button (no href) that filters the finder.
  const soccerTile = page.locator('[data-sport-tile][data-sport="soccer"][data-state="live"]')
  await expect(soccerTile).toBeVisible()
  await soccerTile.click()

  // Finder section scrolls into view.
  const finder = page.locator("#sessions")
  await expect(finder).toBeInViewport()
})
```

- [ ] **Step 2: Run it (dev server must be up)**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/pickup-hero-tile.spec.ts`
Expected: PASS. (If no soccer pickup session is seeded, the tile still scroll-filters — the assertion is on scroll/visibility, not on card count.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/pickup-hero-tile.spec.ts
git commit -m "test(e2e): pickup hero tile scroll-filters the finder"
```

---

### Task 16: Full unit suite + type-check + build

- [ ] **Step 1: Unit tests**

Run: `npx vitest run tests/unit/hero-tiles.test.ts tests/unit/skill-levels.test.ts tests/unit/pickup-pricing.test.ts`
Expected: all PASS.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds. The `Astro.request.headers is not available on prerendered pages` warnings are pre-existing noise (see CLAUDE.md) — ignore. Confirm no NEW errors and that all six redesigned routes compile.

- [ ] **Step 4: Manual smoke (optional, dev server up)**

Visit `/adult`, `/youth`, `/adult/pickup`, `/adult/tournaments`, `/youth/leagues`, `/youth/camps`. Confirm: video heroes render, no orange breadcrumb eyebrows remain, hub cards animate (and stop under OS "reduce motion"), pickup shows the pricing band + skill explainer, and clicking a live hero tile scrolls to the finder.

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore(catalog): redesign verification fixes"
```

---

## Self-review notes (coverage map)

- **Shared design language** → Tasks 7-9 (CategoryHero, HubHero, CategoryCard, bands); eyebrow removal is inherent to the full-page replacements in Tasks 10-13 (none reintroduce the orange breadcrumb); `prefers-reduced-motion` handled in CategoryCard (Task 8).
- **Category archetype (hero + tiles + finder, tile link vs scroll-filter)** → Tasks 5-7, 10-11.
- **Hub archetype (video hero + colored animated cards)** → Tasks 8, 12-13.
- **Pickup pricing band (live rate card + walk-in copy)** → Tasks 3, 9, 10.
- **Skill-level explainer + per-card badges (Recreational/Intermediate/Advanced + all_levels)** → Tasks 2, 9, 14.
- **Stock imagery, SSR unchanged, islands kept** → Tasks 10-13 (concrete Pexels/Unsplash URLs; pages stay SSR; `CategoryFinder`/`PickupPageFinder` retained).
- **Analytics intact** → `trackCatalogSportTileClicked` (Task 7), `landing_hero_cta_click` + legacy anchor redirects (Tasks 12-13).
- **Walk-in pricing enforcement** → intentionally out of scope; the walk-in figure is a `WALK_IN_RATE_CENTS` constant (Task 3) pending the follow-up spec.
```
