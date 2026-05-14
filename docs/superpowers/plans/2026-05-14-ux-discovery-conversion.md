# UX Discovery & Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the site's discovery/wayfinding so an adult player and a parent each immediately see the path that's theirs — via explicit `Youth`/`Adult` nav, dedicated landing pages, a unified program card, and dead-code cleanup.

**Architecture:** Two phases, each independently shippable. Phase 1 unifies `ProgramCardV2` and deletes an orphaned card-component chain (no new routes — verifiable on existing pages). Phase 2 adds `/youth`, `/adult`, `/shop`, `/sports`, `/locations` pages, rebuilds the nav + footer, adds a `?type=` catalog filter param, and instruments conversion events. No schema changes, no middleware changes, no new dependencies.

**Tech Stack:** Astro 5 (SSR + selective prerender), React 19 islands, Tailwind CSS 4, Vitest (unit + API), Playwright (E2E), PostHog (analytics, globally available as `window.posthog`).

**Source spec:** `docs/superpowers/specs/2026-05-14-ux-discovery-conversion-design.md`

---

## File Structure

**Phase 1 — Card + cleanup**
- Modify: `src/lib/programs/derive.ts` — evolve `deriveDeadline` to return `{ label, urgent } | null`.
- Test: `tests/unit/derive-deadline.test.ts` — new unit test for `deriveDeadline`.
- Modify: `src/components/programs/program-card-v2.tsx` — media slot, sport-color fallback, sport label + status pill overlay, `h-full` equal-height, normalized content contract, conditional-urgency deadline, one-badge cap, pinned CTA band.
- Modify: `src/components/homepage-programs-preview.tsx` — loading-skeleton height match.
- Delete: `src/components/page.tsx`, `src/components/programs-directory.tsx`, `src/components/program-card.tsx` — orphaned chain.

**Phase 2 — Nav + landing + plumbing**
- Create: `src/components/landing/format-tiles.astro` — the "Section 2" format tile grid, props-driven, used by both landing pages.
- Create: `src/components/landing/featured-programs-row.tsx` — audience-filtered `ProgramCardV2` row (React island, client-fetches `/api/public/seasons`).
- Create: `src/pages/youth.astro` — youth landing page.
- Create: `src/pages/adult.astro` — adult landing page.
- Create: `src/pages/shop.astro` — `noindex` "coming soon" placeholder.
- Create: `src/pages/sports/index.astro` — sports index (sanity-check addition; nav target).
- Create: `src/pages/locations/index.astro` — locations index (sanity-check addition; nav target).
- Modify: `src/pages/programs/index.astro` — parse `?type=`, pass `initialType`.
- Modify: `src/components/programs/programs-catalog.tsx` — `initialType` prop, `activeType` state + filter + removable pill.
- Modify: `src/components/navigation.tsx` — flat header nav link set.
- Modify: `src/components/footer.tsx` — audience-organized sitemap block.
- Modify: `src/components/marketing/dual-cta-hero.tsx` — re-point hero CTAs to `/youth` / `/adult`.
- Create: `tests/e2e/landing-pages.spec.ts` — E2E for `/youth`, `/adult`, `/shop`, nav links.

---

## PHASE 1 — Card + cleanup

### Task 1: Evolve `deriveDeadline` for conditional urgency

**Files:**
- Modify: `src/lib/programs/derive.ts` (current `deriveDeadline` is the last function in the file, ~lines 132-137)
- Test: `tests/unit/derive-deadline.test.ts` (create)

The current `deriveDeadline` returns `string | null` (`"Closes Jun 1"`). The card needs to know whether the deadline is *near* (≤7 days out) so it can apply an urgent accent. Change the return type to `{ label: string; urgent: boolean } | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/derive-deadline.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { deriveDeadline, type SeasonForDerive } from "@/lib/programs/derive";

function seasonWith(registrationCloses: string | null): SeasonForDerive {
  return {
    startDate: "2026-06-01",
    endDate: "2026-08-01",
    registeredCount: 0,
    maxParticipants: null,
    pricingMode: "per_individual",
    registrationCloses,
    program: { programType: "league", audienceType: "parents" },
    ageGroup: null,
  };
}

describe("deriveDeadline", () => {
  afterEach(() => vi.useRealTimers());

  it("returns null when there is no registrationCloses date", () => {
    expect(deriveDeadline(seasonWith(null))).toBeNull();
  });

  it("returns a non-urgent label when the deadline is far off", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    const result = deriveDeadline(seasonWith("2026-06-15"));
    expect(result).toEqual({ label: "Closes Jun 15", urgent: false });
  });

  it("marks the deadline urgent when it is 7 or fewer days away", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));
    const result = deriveDeadline(seasonWith("2026-06-15"));
    expect(result?.urgent).toBe(true);
    expect(result?.label).toBe("Closes Jun 15");
  });

  it("is not urgent exactly 8 days out", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T12:00:00Z"));
    expect(deriveDeadline(seasonWith("2026-06-15"))?.urgent).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/derive-deadline.test.ts`
Expected: FAIL — current `deriveDeadline` returns a string, so `toEqual({ label, urgent })` fails.

- [ ] **Step 3: Rewrite `deriveDeadline` in `src/lib/programs/derive.ts`**

Replace the existing `deriveDeadline` function (the last function in the file) with:

```typescript
/** Format a deadline for display with a near-deadline urgency flag.
 *  `urgent` is true when the deadline is 7 or fewer days away. */
export function deriveDeadline(
  s: SeasonForDerive,
): { label: string; urgent: boolean } | null {
  if (!s.registrationCloses) return null;
  const d = new Date(s.registrationCloses);
  const label = `Closes ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntil = Math.ceil((d.getTime() - Date.now()) / msPerDay);
  return { label, urgent: daysUntil <= 7 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/derive-deadline.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Type-check (catches the card's now-stale usage early)**

Run: `npx tsc --noEmit`
Expected: ONE error in `src/components/programs/program-card-v2.tsx` — `deriveDeadline` result used as a string. That is fixed in Task 2. Note it and continue.

- [ ] **Step 6: Commit**

```bash
git add src/lib/programs/derive.ts tests/unit/derive-deadline.test.ts
git commit -m "feat(programs): deriveDeadline returns near-deadline urgency flag"
```

---

### Task 2: Refactor `ProgramCardV2` to the unified card

**Files:**
- Modify: `src/components/programs/program-card-v2.tsx` (full rewrite of the returned JSX + the imports/derive block)
- Test: covered by Task 17 E2E + `npm run build`; this is a visual component with no unit-test harness in the repo.

This is the largest task. The card gains: a media slot (branded sport-color block fallback — no photos exist pre-launch) with the sport label + status pill overlaid; `h-full` flex column with the price/CTA pinned to a consistent bottom band; a normalized content contract (location · age always renders, schedule always renders); the conditional-urgency deadline from Task 1; and a hard cap of one format badge. The dual-mode vs single-mode CTA logic is **preserved as-is** — that is registration-flow surface and out of scope.

- [ ] **Step 1: Replace the file contents**

Overwrite `src/components/programs/program-card-v2.tsx` with:

```tsx
"use client"

import { Calendar, MapPin, ArrowRight, User, Users, Clock } from "lucide-react"
import {
  deriveStatusPill,
  deriveIndividualUnit,
  deriveDuration,
  deriveDeadline,
  isDualMode,
  isTeamOnly,
  type SeasonForDerive,
} from "@/lib/programs/derive"

interface Season extends SeasonForDerive {
  id: string
  name: string
  slug: string
  price: number
  teamPrice: number | null
  scheduleNotes: string | null
  sport: { name: string; slug: string; icon: string | null; color: string | null }
  location: { name: string; slug: string; city: string | null }
  ageGroup: { name: string; minAge: number; maxAge: number } | null
}

/**
 * Card heading rule: a generic season name ("Summer 2026") is prefixed with
 * the program name so adult visitors scanning many cards can tell leagues
 * apart. Specific names ("Memorial Day Premier — Summer 2026") are used as-is.
 */
function isGenericSeasonName(name: string): boolean {
  return /^(Spring|Summer|Fall|Winter)\s+\d{4}(\s*[—\-(].{0,30})?$/i.test(name.trim())
}

// Branded fallback colors for the media slot when a sport has no color set
// and no photo exists. Pre-launch every card renders this fallback.
const SPORT_FALLBACK_COLORS: Record<string, string> = {
  soccer: "#16a34a",
  basketball: "#f97316",
  baseball: "#dc2626",
  football: "#a16207",
  hockey: "#0ea5e9",
}

const STATUS_PILL_STYLES: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700",
  filling: "bg-amber-100 text-amber-800",
  last: "bg-orange-100 text-orange-800",
}

export default function ProgramCardV2({ season }: { season: Season }) {
  const status = deriveStatusPill(season)
  const indivUnit = deriveIndividualUnit(season)
  const duration = deriveDuration(season)
  const deadline = deriveDeadline(season)
  const dual = isDualMode(season)
  const teamOnly = isTeamOnly(season)

  const programName = (season.program as { name?: string }).name ?? ""
  const headingName =
    isGenericSeasonName(season.name) && programName
      ? `${programName} — ${season.name}`
      : season.name

  // Normalized content contract — every line always resolves.
  const venueLabel = season.location.name.replace(/^Soccer One\s+/i, "")
  const audienceLabel = season.ageGroup
    ? season.ageGroup.name
    : season.program.audienceType === "adults"
      ? "Adult"
      : "All ages"
  const scheduleLabel =
    season.scheduleNotes ?? `${duration}`
  const sportColor =
    season.sport.color ?? SPORT_FALLBACK_COLORS[season.sport.slug] ?? "#52525b"

  // One format badge, hard cap. Priority: dual > team-only > non-league type.
  let formatBadge: string | null = null
  if (dual) formatBadge = "Solo or team"
  else if (teamOnly) formatBadge = "Team only"
  else if (season.program.programType !== "league")
    formatBadge =
      season.program.programType.charAt(0).toUpperCase() +
      season.program.programType.slice(1)

  const headlinePrice = teamOnly && season.teamPrice != null ? season.teamPrice : season.price
  const headlineUnit = teamOnly ? "per team" : indivUnit

  return (
    <div className="group h-full flex flex-col bg-paper border border-border rounded-2xl overflow-hidden transition-all hover:border-primary/40 hover:-translate-y-0.5">
      {/* Media slot — sport-color fallback block. Photo support drops in here
          later with no structural change. */}
      <div
        className="relative h-28 flex-shrink-0"
        style={{
          background: `linear-gradient(135deg, ${sportColor}, ${sportColor}cc)`,
        }}
      >
        <span className="absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-wide text-white/90">
          {season.sport.icon ? `${season.sport.icon} ` : ""}
          {season.sport.name}
        </span>
        <span
          className={`absolute top-2 right-2 inline-flex items-center text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full ${STATUS_PILL_STYLES[status.tone]}`}
        >
          {status.label}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4">
        {/* 1 · What — heading, reserved 2-line height */}
        <h3 className="font-display text-base leading-tight text-ink line-clamp-2 min-h-[2.5rem]">
          {headingName}
        </h3>

        {/* 2 · Who — location · age, always one line */}
        <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-2">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">
            {venueLabel} · {audienceLabel}
          </span>
        </div>

        {/* 3 · When it runs — schedule, always resolves */}
        <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-1">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{scheduleLabel}</span>
        </div>

        {/* 4 · When to act — deadline, conditional urgency */}
        {deadline && (
          <div
            className={`flex items-center gap-1.5 text-xs mt-1 ${
              deadline.urgent ? "text-primary font-semibold" : "text-ink-faint"
            }`}
          >
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{deadline.label}</span>
          </div>
        )}

        {/* Format badge — at most one */}
        {formatBadge && (
          <div className="mt-2">
            <span className="inline-flex items-center font-semibold tracking-wide uppercase text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">
              {formatBadge}
            </span>
          </div>
        )}

        {/* Spacer pushes price + CTA to a consistent bottom band */}
        <div className="flex-1 min-h-[0.75rem]" />

        {/* 5 · How much + CTA — dual-mode keeps two actions; preserved as-is */}
        <div className="pt-3 border-t border-border">
          {dual && season.teamPrice != null ? (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="font-display text-lg text-ink leading-none">
                    ${season.price.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-ink-muted mt-1 uppercase tracking-wide font-semibold">
                    {indivUnit}
                  </div>
                </div>
                <div className="border-l border-border pl-3">
                  <div className="font-display text-lg text-ink leading-none">
                    ${season.teamPrice.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-ink-muted mt-1 uppercase tracking-wide font-semibold">
                    per team
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`/register/${season.id}?mode=individual`}
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wide uppercase border border-ink text-ink hover:bg-ink hover:text-cream px-3 py-2 rounded-md transition-colors"
                >
                  <User className="w-3.5 h-3.5" />
                  Sign up solo
                </a>
                <a
                  href={`/register/team/${season.id}`}
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wide uppercase bg-ink text-cream hover:bg-primary px-3 py-2 rounded-md transition-colors"
                >
                  <Users className="w-3.5 h-3.5" />
                  Bring a team
                </a>
              </div>
            </>
          ) : (
            <div className="flex items-end justify-between">
              <div>
                <div className="font-display text-lg text-ink leading-none">
                  ${headlinePrice.toLocaleString()}
                </div>
                <div className="text-[11px] text-ink-muted mt-1">{headlineUnit}</div>
              </div>
              <a
                href={teamOnly ? `/register/team/${season.id}` : `/register/${season.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase bg-ink text-cream px-3 py-2 rounded-md group-hover:bg-primary transition-colors"
              >
                {teamOnly ? "Register team" : "Register"}
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS — zero errors. The `deriveDeadline` usage now matches the Task 1 signature.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS — build completes. (Prerender warnings about `Astro.request.headers` are pre-existing noise per CLAUDE.md.)

- [ ] **Step 4: Visual check**

Start the dev server (`npm run dev`) and open `http://localhost:4321/programs`. Confirm: every card in the grid is the same height; each card has the colored media header with the sport label + status pill; the price/CTA sits in a bottom band aligned across cards. Open `http://localhost:4321/` and confirm the homepage program rows render the same card without overflow.

- [ ] **Step 5: Commit**

```bash
git add src/components/programs/program-card-v2.tsx
git commit -m "feat(programs): unify ProgramCardV2 — media slot, equal height, normalized contract"
```

---

### Task 3: Match the homepage loading skeleton to the new card height

**Files:**
- Modify: `src/components/homepage-programs-preview.tsx` (the loading-state block, ~lines 95-108)

The refactored card is taller (media slot + body). The loading skeleton is a fixed `h-[200px]` — bump it so the section doesn't jump when data resolves.

- [ ] **Step 1: Update the skeleton height**

In `src/components/homepage-programs-preview.tsx`, find the loading-state skeleton card:

```tsx
                <div
                  key={i}
                  className="bg-paper border border-border rounded-2xl p-5 h-[200px] animate-pulse"
                  aria-hidden="true"
                />
```

Replace `h-[200px]` with `h-[320px]`:

```tsx
                <div
                  key={i}
                  className="bg-paper border border-border rounded-2xl h-[320px] animate-pulse"
                  aria-hidden="true"
                />
```

(Also drop `p-5` — the new card has no outer padding; the media slot goes edge-to-edge.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/homepage-programs-preview.tsx
git commit -m "fix(homepage): match program skeleton height to unified card"
```

---

### Task 4: Delete the orphaned card-component chain

**Files:**
- Delete: `src/components/page.tsx`
- Delete: `src/components/programs-directory.tsx`
- Delete: `src/components/program-card.tsx`

Confirmed during spec sanity-check: `page.tsx` is imported nowhere; `programs-directory.tsx` is only imported by `page.tsx`; `program-card.tsx` is only imported by `programs-directory.tsx`. The live `/programs` page uses `programs-catalog.tsx` → `ProgramCardV2`.

- [ ] **Step 1: Re-confirm nothing imports the chain**

Run:
```bash
grep -rn "components/page\"\|components/programs-directory\|components/program-card\"\|ProgramsDirectory" src
```
Expected: only matches *inside* the three files being deleted (their own imports of each other). If anything else references them, STOP and reassess.

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/page.tsx src/components/programs-directory.tsx src/components/program-card.tsx
```

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS — zero errors, build succeeds. Nothing referenced the deleted files.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete orphaned ProgramsDirectory/ProgramCard component chain"
```

**Phase 1 is now shippable** — the card is unified and dead code is gone, all on existing routes.

---

## PHASE 2 — Nav + landing + plumbing

### Task 5: Add `?type=` filter param to the programs catalog

**Files:**
- Modify: `src/pages/programs/index.astro` (frontmatter — add `?type=` parsing alongside the existing `?audience=`)
- Modify: `src/components/programs/programs-catalog.tsx` (add `initialType` prop, `activeType` state, filter line, removable pill)
- Test: covered by Task 17 E2E.

The landing-page format tiles link to `/programs?audience=youth&type=camp` etc. The catalog already reads `?audience=`; this mirrors that for `?type=`.

- [ ] **Step 1: Parse `?type=` in `src/pages/programs/index.astro`**

In the frontmatter, after the existing `audience` block, add:

```typescript
// Program-type preselect from query param: ?type=league|camp|clinic|tournament|training
const rawType = Astro.url.searchParams.get("type");
const VALID_TYPES = ["league", "camp", "clinic", "tournament", "training"] as const;
const programType =
  rawType && (VALID_TYPES as readonly string[]).includes(rawType)
    ? (rawType as (typeof VALID_TYPES)[number])
    : null;
```

Then update the `ProgramsCatalog` usage at the bottom of the file:

```astro
      <ProgramsCatalog client:load initialAudience={audience} initialType={programType} />
```

- [ ] **Step 2: Add `initialType` to `ProgramsCatalog` props and state**

In `src/components/programs/programs-catalog.tsx`, update the `Props` interface:

```tsx
interface Props {
  initialAudience?: Audience | null
  initialType?: string | null
}
```

Update the component signature:

```tsx
export default function ProgramsCatalog({ initialAudience, initialType }: Props) {
```

Add `activeType` state next to the other `active*` state declarations:

```tsx
  const [activeType, setActiveType] = useState<string | null>(initialType ?? null)
```

- [ ] **Step 3: Apply the filter and reset pagination on it**

In the `filtered` `useMemo`, add a filter line alongside the existing chip filters:

```tsx
      if (activeType && s.program.programType !== activeType) return false
```

Add `activeType` to the `filtered` `useMemo` dependency array, and to the pagination-reset `useEffect` dependency array (the one that calls `setVisibleCount(12)`).

- [ ] **Step 4: Render a removable "Showing: X" pill**

Directly inside the returned JSX, immediately before the `{/* Step 1: Audience segmenter */}` block, add:

```tsx
      {activeType && (
        <div className="mb-4 flex justify-center">
          <button
            type="button"
            onClick={() => setActiveType(null)}
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide bg-ink text-cream px-3 py-1.5 rounded-full"
          >
            Showing: {activeType.charAt(0).toUpperCase() + activeType.slice(1)}
            <span aria-hidden="true">✕</span>
            <span className="sr-only">Clear program type filter</span>
          </button>
        </div>
      )}
```

- [ ] **Step 5: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 6: Visual check**

Open `http://localhost:4321/programs?audience=youth&type=camp`. Confirm only camp-type programs show and the "Showing: Camp ✕" pill appears; clicking it clears the filter.

- [ ] **Step 7: Commit**

```bash
git add src/pages/programs/index.astro src/components/programs/programs-catalog.tsx
git commit -m "feat(programs): catalog accepts ?type= filter param"
```

---

### Task 6: Create the `FormatTiles` component

**Files:**
- Create: `src/components/landing/format-tiles.astro`

A props-driven grid of format tiles — the "heart of the page" Section 2 on both landing pages. Plain `.astro` (just links, no state). Each tile fires a PostHog event on click (instrumentation added in Task 16; the markup includes the hook now).

- [ ] **Step 1: Create the component**

Create `src/components/landing/format-tiles.astro`:

```astro
---
// Format tiles — the primary in-page self-segmentation on the landing pages.
// Each tile links to a destination (catalog pre-filtered by ?type=, or /dropin
// for adult pick-up). `accent` controls the hover/border color per audience.
interface Tile {
  label: string;
  sub: string;
  href: string;
}
interface Props {
  heading: string;
  tiles: Tile[];
  accent: "green" | "orange";
}
const { heading, tiles, accent } = Astro.props;

const accentClasses =
  accent === "green"
    ? "hover:border-emerald-500 hover:bg-emerald-50"
    : "hover:border-orange-500 hover:bg-orange-50";
---

<section class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
  <p class="text-center text-sm font-semibold tracking-[0.15em] uppercase text-ink-muted mb-6">
    {heading}
  </p>
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
    {
      tiles.map((tile) => (
        <a
          href={tile.href}
          data-format-tile={tile.label}
          class={`flex flex-col items-center text-center gap-1 p-4 rounded-xl border-2 border-border bg-paper transition-colors ${accentClasses}`}
        >
          <span class="font-display text-base text-ink">{tile.label}</span>
          <span class="text-xs text-ink-muted">{tile.sub}</span>
        </a>
      ))
    }
  </div>
</section>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/format-tiles.astro
git commit -m "feat(landing): add FormatTiles section component"
```

---

### Task 7: Create the `FeaturedProgramsRow` component

**Files:**
- Create: `src/components/landing/featured-programs-row.tsx`

A React island that client-fetches open seasons, filters to one audience, and renders up to 6 in a `ProgramCardV2` scroll row. Mirrors the fetch pattern in `homepage-programs-preview.tsx`. Renders nothing if there is no matching inventory (the landing page still has the format tiles + CTA).

- [ ] **Step 1: Create the component**

Create `src/components/landing/featured-programs-row.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import ProgramCardV2 from "@/components/programs/program-card-v2"
import { deriveAudience, type SeasonForDerive } from "@/lib/programs/derive"

interface ApiSeason extends SeasonForDerive {
  id: string
  name: string
  slug: string
  price: number
  teamPrice: number | null
  scheduleNotes: string | null
  status: string
  sport: { id: string; name: string; slug: string; icon: string | null; color: string | null }
  location: { id: string; name: string; slug: string; city: string | null; state: string | null }
  ageGroup: { id: string; name: string; minAge: number; maxAge: number } | null
}

const ROW_LIMIT = 6

export default function FeaturedProgramsRow({
  audience,
}: {
  audience: "youth" | "adult"
}) {
  const [seasons, setSeasons] = useState<ApiSeason[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/public/seasons?status=open")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { seasons: ApiSeason[] }) => {
        if (!cancelled) setSeasons(j.seasons)
      })
      .catch(() => {
        // Silent — row hides itself if no data.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const matching = seasons
    .filter((s) => deriveAudience(s) === audience)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, ROW_LIMIT)

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-3 px-4 sm:px-6 lg:px-8">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex-none w-[300px] h-[320px] bg-paper border border-border rounded-2xl animate-pulse"
            aria-hidden="true"
          />
        ))}
      </div>
    )
  }

  if (matching.length === 0) return null

  return (
    <div className="flex gap-4 overflow-x-auto pb-3 px-4 sm:px-6 lg:px-8 snap-x snap-mandatory">
      {matching.map((s) => (
        <div key={s.id} className="flex-none w-[300px] sm:w-[320px] snap-start">
          <ProgramCardV2 season={s} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/featured-programs-row.tsx
git commit -m "feat(landing): add FeaturedProgramsRow component"
```

---

### Task 8: Create the `/youth` landing page

**Files:**
- Create: `src/pages/youth.astro`

SSR (no `prerender` flag — new page default). Reuses `WhyAspire`, `FAQSection`, `CTABanner`. Copy is taken from the approved design mockups; the founder may revise before launch.

- [ ] **Step 1: Create the page**

Create `src/pages/youth.astro`:

```astro
---
// SSR — reuses request-scoped section components. No request-state reads in
// this frontmatter, but new pages default to SSR per CLAUDE.md prerender policy.
import BaseLayout from "@/layouts/BaseLayout.astro";
import FormatTiles from "@/components/landing/format-tiles.astro";
import FeaturedProgramsRow from "@/components/landing/featured-programs-row.tsx";
import WhyAspire from "@/components/why-aspire";
import FAQSection from "@/components/faq-section";
import CTABanner from "@/components/cta-banner";

const formatTiles = [
  { label: "Leagues", sub: "Season play", href: "/programs?audience=youth&type=league" },
  { label: "Classes", sub: "Weekly skills", href: "/programs?audience=youth&type=training" },
  { label: "Camps", sub: "School breaks", href: "/programs?audience=youth&type=camp" },
  { label: "Clinics", sub: "One-day focus", href: "/programs?audience=youth&type=clinic" },
  { label: "Tournaments", sub: "Compete", href: "/programs?audience=youth&type=tournament" },
];

const ageBands = [
  { label: "Ages 4–8", href: "/programs?audience=youth" },
  { label: "Ages 9–12", href: "/programs?audience=youth" },
  { label: "Ages 13–18", href: "/programs?audience=youth" },
];
---

<BaseLayout
  title="Youth Sports Programs — Aspire Sports"
  description="Leagues, classes, camps, clinics and tournaments for kids in central Ohio. Real coaches, real development — Aspire Sports."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/youth`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    {/* Hero — reassurance, warm/green */}
    <section class="bg-gradient-to-br from-emerald-600 to-emerald-400 text-white pt-28 pb-16">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <p class="text-[11px] font-semibold tracking-[0.15em] uppercase text-white/85 mb-4">
          Now enrolling · Summer 2026
        </p>
        <h1
          class="font-display max-w-3xl"
          style="font-size: clamp(2.25rem, 6vw, 4.5rem); line-height: 1.05; letter-spacing: -0.03em;"
        >
          Sports your kid will actually look forward to.
        </h1>
        <p class="mt-6 text-lg text-white/90 max-w-2xl">
          Real coaches, real development — built on the Double-Goal Coach and ELM
          frameworks. Programs for every age and every level.
        </p>
        <div class="mt-8">
          <a
            href="/programs?audience=youth"
            data-landing-cta="youth-hero"
            class="inline-flex items-center gap-2 bg-ink text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase hover:bg-primary transition-colors"
            style="letter-spacing: 0.08em;"
          >
            Browse youth programs →
          </a>
        </div>
      </div>
    </section>

    {/* Section 2 — the heart: format tiles */}
    <FormatTiles
      heading="What kind of program?"
      tiles={formatTiles}
      accent="green"
    />

    {/* Secondary age quick-filter row */}
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 flex flex-wrap items-center justify-center gap-2">
      <span class="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mr-1">
        By age:
      </span>
      {
        ageBands.map((band) => (
          <a
            href={band.href}
            class="text-xs border border-border rounded-full px-3 py-1.5 text-ink-2 hover:border-ink-muted transition-colors"
          >
            {band.label}
          </a>
        ))
      }
    </div>

    {/* Why parents trust Aspire */}
    <WhyAspire client:visible />

    {/* Featured youth programs */}
    <section class="bg-cream py-14">
      <div class="max-w-[1400px] mx-auto">
        <div class="px-4 sm:px-6 lg:px-8 mb-6">
          <h2 class="font-display text-2xl text-ink">Open youth programs</h2>
        </div>
        <FeaturedProgramsRow audience="youth" client:visible />
      </div>
    </section>

    {/* Parent FAQ */}
    <FAQSection client:visible />

    {/* CTA banner */}
    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS — `/youth` appears in the build output.

- [ ] **Step 3: Visual check**

Open `http://localhost:4321/youth`. Confirm: green hero renders, the five format tiles link to the right `?type=` URLs, the age row renders, `WhyAspire`/FAQ/CTA sections render, the featured row shows cards (or nothing if no youth inventory).

- [ ] **Step 4: Commit**

```bash
git add src/pages/youth.astro
git commit -m "feat(landing): add /youth landing page"
```

---

### Task 9: Create the `/adult` landing page

**Files:**
- Create: `src/pages/adult.astro`

SSR. Dark/orange hero, two CTAs, three format tiles (Leagues / Pick-up → `/dropin` / Tournaments). Reuses `Testimonials`, `CTABanner`.

- [ ] **Step 1: Create the page**

Create `src/pages/adult.astro`:

```astro
---
// SSR — reuses request-scoped section components. New page default per
// CLAUDE.md prerender policy.
import BaseLayout from "@/layouts/BaseLayout.astro";
import FormatTiles from "@/components/landing/format-tiles.astro";
import FeaturedProgramsRow from "@/components/landing/featured-programs-row.tsx";
import Testimonials from "@/components/testimonials";
import CTABanner from "@/components/cta-banner";

const formatTiles = [
  { label: "Leagues", sub: "Season · solo or team", href: "/programs?audience=adult&type=league" },
  { label: "Pick-up", sub: "Show up & play", href: "/dropin" },
  { label: "Tournaments", sub: "One-day events", href: "/programs?audience=adult&type=tournament" },
];
---

<BaseLayout
  title="Adult Sports Leagues — Aspire Sports"
  description="Adult sports leagues, pick-up, and tournaments in central Ohio. Sign up solo, with friends, or as a full team — Aspire Sports."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/adult`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    {/* Hero — energy + credibility, dark/orange */}
    <section class="bg-gradient-to-br from-ink to-zinc-700 text-cream pt-28 pb-16">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <p class="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange mb-4">
          Founding season · Summer 2026
        </p>
        <h1
          class="font-display max-w-3xl"
          style="font-size: clamp(2.25rem, 6vw, 4.5rem); line-height: 1.05; letter-spacing: -0.03em;"
        >
          The league you'll build your week around.
        </h1>
        <p class="mt-6 text-lg text-cream/85 max-w-2xl">
          Fair refs, reliable communication, and a post-game scene worth staying
          for. Sign up solo, bring friends, or register a full team.
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
          <a
            href="/programs?audience=adult"
            data-landing-cta="adult-hero-browse"
            class="inline-flex items-center gap-2 bg-primary text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase hover:bg-primary/90 transition-colors"
            style="letter-spacing: 0.08em;"
          >
            Browse adult leagues →
          </a>
          <a
            href="/programs?audience=team"
            data-landing-cta="adult-hero-team"
            class="inline-flex items-center gap-2 border border-cream text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase hover:bg-cream hover:text-ink transition-colors"
            style="letter-spacing: 0.08em;"
          >
            Register a team
          </a>
        </div>
      </div>
    </section>

    {/* Section 2 — the heart: format tiles */}
    <FormatTiles
      heading="How do you want to play?"
      tiles={formatTiles}
      accent="orange"
    />

    {/* Featured adult leagues */}
    <section class="bg-cream py-14">
      <div class="max-w-[1400px] mx-auto">
        <div class="px-4 sm:px-6 lg:px-8 mb-6">
          <h2 class="font-display text-2xl text-ink">Open adult leagues</h2>
        </div>
        <FeaturedProgramsRow audience="adult" client:visible />
      </div>
    </section>

    {/* Testimonials — captain voice */}
    <Testimonials client:visible />

    {/* CTA banner */}
    <CTABanner client:visible />
  </main>
</BaseLayout>
```

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS — `/adult` appears in the build output.

- [ ] **Step 3: Visual check**

Open `http://localhost:4321/adult`. Confirm: dark/orange hero with two CTAs, three format tiles (Pick-up links to `/dropin`), testimonials + CTA render, featured row shows adult inventory or nothing.

- [ ] **Step 4: Commit**

```bash
git add src/pages/adult.astro
git commit -m "feat(landing): add /adult landing page"
```

---

### Task 10: Create the `/shop` placeholder page

**Files:**
- Create: `src/pages/shop.astro`

A "coming soon" placeholder. `prerender = true` (no request-state reads). Emits `<meta name="robots" content="noindex">` so a thin placeholder does not dilute SEO — flip to indexed when the real Printful store ships.

- [ ] **Step 1: Create the page**

Create `src/pages/shop.astro`:

```astro
---
// Static placeholder. noindex until the real Printful store ships — a thin
// "coming soon" page should not be crawled/indexed.
export const prerender = true;
import BaseLayout from "@/layouts/BaseLayout.astro";
---

<BaseLayout
  title="Shop — Aspire Sports"
  description="Aspire Sports gear and merchandise — coming soon."
>
  <Fragment slot="head">
    <meta name="robots" content="noindex" />
  </Fragment>

  <main id="main-content" class="flex-1 flex items-center justify-center py-32">
    <div class="text-center max-w-md px-6">
      <p class="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary mb-4">
        Aspire Sports Shop
      </p>
      <h1 class="font-display text-4xl text-ink mb-4">Gear is coming soon.</h1>
      <p class="text-ink-muted mb-8">
        We're putting together Aspire Sports gear and team merchandise. Check
        back after the season-one launch.
      </p>
      <a
        href="/programs"
        class="inline-flex items-center gap-2 bg-ink text-cream px-6 py-3 text-sm font-medium tracking-wide uppercase hover:bg-primary transition-colors"
      >
        Browse programs instead →
      </a>
    </div>
  </main>
</BaseLayout>
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS — `/shop` in the build output.

- [ ] **Step 3: Verify the noindex meta**

Run `npm run dev`, then:
```bash
curl -s http://localhost:4321/shop | grep -o '<meta name="robots" content="noindex">'
```
Expected: prints `<meta name="robots" content="noindex">`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/shop.astro
git commit -m "feat(shop): add noindex /shop coming-soon placeholder"
```

---

### Task 11: Create the `/sports` index page

**Files:**
- Create: `src/pages/sports/index.astro`

Sanity-check addition — the nav links to `/sports` but only `/sports/[slug].astro` exists today. This is a minimal index listing the sports, server-fetched from the existing `/api/public/filters` endpoint (same source the footer uses).

- [ ] **Step 1: Create the page**

Create `src/pages/sports/index.astro`:

```astro
---
// SSR — fetches the live sport list. New page default per CLAUDE.md.
import BaseLayout from "@/layouts/BaseLayout.astro";

interface Sport {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

let sports: Sport[] = [];
try {
  const res = await fetch(`${Astro.url.origin}/api/public/filters`);
  if (res.ok) {
    const data = (await res.json()) as { sports?: Sport[] };
    sports = data.sports ?? [];
  }
} catch {
  // Silent — page renders the empty state below.
}
---

<BaseLayout
  title="Sports — Aspire Sports"
  description="Every sport Aspire Sports runs in central Ohio — leagues, classes, camps, clinics and tournaments."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/sports`} />
  </Fragment>

  <main id="main-content" class="flex-1 pt-28 pb-16">
    <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
      <h1 class="font-display text-ink mb-3" style="font-size: clamp(2rem, 5vw, 3.5rem); letter-spacing: -0.025em;">
        Our sports
      </h1>
      <p class="text-lg text-ink-muted max-w-2xl mb-10">
        Browse programs by sport across all Aspire Sports locations.
      </p>

      {
        sports.length === 0 ? (
          <p class="text-ink-muted">Sports are being scheduled — check back soon.</p>
        ) : (
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {sports.map((sport) => (
              <a
                href={`/sports/${sport.slug}`}
                class="flex items-center gap-3 p-5 rounded-xl border border-border bg-paper hover:border-primary/40 transition-colors"
              >
                {sport.icon && <span class="text-2xl">{sport.icon}</span>}
                <span class="font-display text-lg text-ink">{sport.name}</span>
              </a>
            ))}
          </div>
        )
      }
    </div>
  </main>
</BaseLayout>
```

- [ ] **Step 2: Build and visual check**

Run: `npx tsc --noEmit && npm run build`, then open `http://localhost:4321/sports`.
Expected: PASS; the page lists sports linking to `/sports/<slug>`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/sports/index.astro
git commit -m "feat(sports): add /sports index page (nav target)"
```

---

### Task 12: Create the `/locations` index page

**Files:**
- Create: `src/pages/locations/index.astro`

Sanity-check addition — same gap as `/sports`. Minimal index, server-fetched from `/api/public/filters`.

- [ ] **Step 1: Create the page**

Create `src/pages/locations/index.astro`:

```astro
---
// SSR — fetches the live location list. New page default per CLAUDE.md.
import BaseLayout from "@/layouts/BaseLayout.astro";

interface Location {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
}

let locations: Location[] = [];
try {
  const res = await fetch(`${Astro.url.origin}/api/public/filters`);
  if (res.ok) {
    const data = (await res.json()) as { locations?: Location[] };
    locations = data.locations ?? [];
  }
} catch {
  // Silent — page renders the empty state below.
}
---

<BaseLayout
  title="Locations — Aspire Sports"
  description="Aspire Sports venues across central Ohio. Find programs near you."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/locations`} />
  </Fragment>

  <main id="main-content" class="flex-1 pt-28 pb-16">
    <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
      <h1 class="font-display text-ink mb-3" style="font-size: clamp(2rem, 5vw, 3.5rem); letter-spacing: -0.025em;">
        Our locations
      </h1>
      <p class="text-lg text-ink-muted max-w-2xl mb-10">
        Aspire Sports runs programs across central Ohio. Pick a venue to see
        what's on.
      </p>

      {
        locations.length === 0 ? (
          <p class="text-ink-muted">Locations are being finalized — check back soon.</p>
        ) : (
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {locations.map((loc) => (
              <a
                href={`/locations/${loc.slug}`}
                class="block p-6 rounded-xl border border-border bg-paper hover:border-primary/40 transition-colors"
              >
                <div class="font-display text-xl text-ink">{loc.name}</div>
                {(loc.city || loc.state) && (
                  <div class="text-sm text-ink-muted mt-1">
                    {[loc.city, loc.state].filter(Boolean).join(", ")}
                  </div>
                )}
              </a>
            ))}
          </div>
        )
      }
    </div>
  </main>
</BaseLayout>
```

- [ ] **Step 2: Build and visual check**

Run: `npx tsc --noEmit && npm run build`, then open `http://localhost:4321/locations`.
Expected: PASS; the page lists locations linking to `/locations/<slug>`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/locations/index.astro
git commit -m "feat(locations): add /locations index page (nav target)"
```

---

### Task 13: Update the header navigation

**Files:**
- Modify: `src/components/navigation.tsx` (the `navLinks` array, ~lines 56-60)

Replace the current `Programs / Guides / About` link set with the flat `Youth · Adult · Sports · Locations · Shop · About` set. The array drives both desktop and mobile menus, so this one change updates both.

- [ ] **Step 1: Replace the `navLinks` array**

In `src/components/navigation.tsx`, find:

```tsx
  const navLinks = [
    { href: "/programs", label: "Programs" },
    { href: "/guides", label: "Guides" },
    { href: "/about", label: "About" },
  ]
```

Replace with:

```tsx
  const navLinks = [
    { href: "/youth", label: "Youth" },
    { href: "/adult", label: "Adult" },
    { href: "/sports", label: "Sports" },
    { href: "/locations", label: "Locations" },
    { href: "/shop", label: "Shop" },
    { href: "/about", label: "About" },
  ]
```

- [ ] **Step 2: Build and visual check**

Run: `npm run build`, then open `http://localhost:4321/`.
Expected: PASS; the desktop header shows the six links; the mobile sheet shows the same six. Each navigates to a real page (no 404s — `/youth`, `/adult`, `/shop`, `/sports`, `/locations` all exist after Tasks 8–12).

- [ ] **Step 3: Commit**

```bash
git add src/components/navigation.tsx
git commit -m "feat(nav): flat audience-led header — Youth/Adult/Sports/Locations/Shop/About"
```

---

### Task 14: Rebuild the footer sitemap block

**Files:**
- Modify: `src/components/footer.tsx` (the `programLinks` / `resourceLinks` / `supportLinks` arrays, ~lines 7-29)

The footer is the SEO long-tail surface. Replace the three ad-hoc link arrays with four audience/category-organized columns: Youth, Adult, Sports, Locations. Keep `supportLinks` as a separate legal/support column (do not remove — it carries terms/privacy/refund links). The `locations` state is already fetched dynamically; this task only changes the static link arrays. Sport links use the existing `?sport=` convention already present in the file.

- [ ] **Step 1: Replace the link arrays**

In `src/components/footer.tsx`, find the three arrays:

```tsx
const programLinks = [
  { label: "Soccer", href: "/programs?sport=soccer" },
  { label: "Basketball", href: "/programs?sport=basketball" },
  { label: "Baseball", href: "/programs?sport=baseball" },
  { label: "Football", href: "/programs?sport=football" },
  { label: "View All Programs", href: "/programs" },
]

const resourceLinks = [
  { label: "Coaching guides", href: "/guides" },
  { label: "Our philosophy", href: "/about" },
  { label: "For coaches", href: "/coach" },
]
```

Replace **both** with four new arrays (leave `supportLinks` untouched, immediately below):

```tsx
const youthLinks = [
  { label: "Youth programs", href: "/youth" },
  { label: "Leagues", href: "/programs?audience=youth&type=league" },
  { label: "Classes", href: "/programs?audience=youth&type=training" },
  { label: "Camps", href: "/programs?audience=youth&type=camp" },
  { label: "Clinics", href: "/programs?audience=youth&type=clinic" },
  { label: "Coaching guides", href: "/guides" },
]

const adultLinks = [
  { label: "Adult leagues", href: "/adult" },
  { label: "Leagues", href: "/programs?audience=adult&type=league" },
  { label: "Pick-up", href: "/dropin" },
  { label: "Tournaments", href: "/programs?audience=adult&type=tournament" },
  { label: "Register a team", href: "/programs?audience=team" },
]

const sportLinks = [
  { label: "Soccer", href: "/sports/soccer" },
  { label: "Basketball", href: "/sports/basketball" },
  { label: "Baseball", href: "/sports/baseball" },
  { label: "Hockey", href: "/sports/hockey" },
  { label: "All sports", href: "/sports" },
]

const orgLinks = [
  { label: "All locations", href: "/locations" },
  { label: "Our philosophy", href: "/about" },
  { label: "For coaches", href: "/coach" },
  { label: "Shop", href: "/shop" },
]
```

- [ ] **Step 2: Update the footer JSX to render the four columns**

In `src/components/footer.tsx`, find the footer-grid block that currently maps `programLinks` and `resourceLinks` into columns. Replace those two rendered columns with four columns rendering `youthLinks`, `adultLinks`, `sportLinks`, and `orgLinks`. Use the existing column markup pattern in the file — same heading style, same `<a>` list style — just four headings: "Youth", "Adult", "Sports", "Aspire". Keep the brand/newsletter column and the `supportLinks` column exactly as they are.

For each of the four columns, follow this structure (matching the file's existing link-list styling — copy the class names from the column being replaced):

```tsx
            <div>
              <h4 class="...existing heading classes...">Youth</h4>
              <ul class="...existing list classes...">
                {youthLinks.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="...existing link classes...">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
```

Repeat for `adultLinks` ("Adult"), `sportLinks` ("Sports"), `orgLinks` ("Aspire"). Adjust the grid column spans so all columns fit (the grid is `lg:grid-cols-12`; the brand column is `lg:col-span-4`, leaving 8 — give each of the four link columns + the support column appropriate spans, e.g. brand `col-span-4`, then five columns sharing the rest, or wrap to a second row — match what looks right in the existing responsive grid).

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS — no references to the removed `programLinks` / `resourceLinks` remain.

- [ ] **Step 4: Visual check**

Open `http://localhost:4321/` and scroll to the footer. Confirm four link columns (Youth, Adult, Sports, Aspire) plus the support column, all links resolve.

- [ ] **Step 5: Commit**

```bash
git add src/components/footer.tsx
git commit -m "feat(footer): audience-organized sitemap block for SEO internal linking"
```

---

### Task 15: Re-point the homepage hero CTAs to the landing pages

**Files:**
- Modify: `src/components/marketing/dual-cta-hero.tsx` (the two `<a>` hrefs, ~lines 78 and 87)

The homepage `DualCtaHero` currently links straight to `/programs?audience=…`. Now that dedicated landing pages exist, the hero should route through them.

- [ ] **Step 1: Update the two hrefs**

In `src/components/marketing/dual-cta-hero.tsx`, change:

```tsx
              href="/programs?audience=youth"
```
to:
```tsx
              href="/youth"
```

and:

```tsx
              href="/programs?audience=adult"
```
to:
```tsx
              href="/adult"
```

- [ ] **Step 2: Build and visual check**

Run: `npm run build`, then open `http://localhost:4321/` and click both hero CTAs.
Expected: PASS; "Browse youth programs" → `/youth`, "Browse adult leagues" → `/adult`.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketing/dual-cta-hero.tsx
git commit -m "feat(homepage): route dual-CTA hero through /youth and /adult landing pages"
```

---

### Task 16: Add named conversion events to landing CTAs and format tiles

**Files:**
- Create: `src/lib/analytics/track.ts` — tiny typed wrapper over `window.posthog.capture`.
- Modify: `src/components/landing/format-tiles.astro` — fire an event on tile click.
- Modify: `src/pages/youth.astro` and `src/pages/adult.astro` — fire an event on hero CTA click.

PostHog autocapture is on, but named funnel events are best practice for a conversion-focused change — they survive markup changes and are queryable without CSS-selector archaeology. `window.posthog` is globally installed (with a noop fallback when there is no API key), so calls are always safe.

- [ ] **Step 1: Create the typed tracking helper**

Create `src/lib/analytics/track.ts`:

```typescript
/**
 * Thin typed wrapper over PostHog's global capture. `window.posthog` is
 * installed by src/components/posthog.astro with a noop fallback when no API
 * key is configured, so these calls are always safe to make client-side.
 */
type PosthogLike = { capture: (event: string, props?: Record<string, unknown>) => void };

export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const ph = (window as unknown as { posthog?: PosthogLike }).posthog;
  ph?.capture(event, props);
}
```

- [ ] **Step 2: Fire a tile-click event from `FormatTiles`**

In `src/components/landing/format-tiles.astro`, add an inline script at the end of the file (after the closing `</section>`). It binds to the `data-format-tile` attribute already present on each tile:

```astro
<script>
  import { track } from "@/lib/analytics/track";
  document.querySelectorAll<HTMLAnchorElement>("[data-format-tile]").forEach((el) => {
    el.addEventListener("click", () => {
      track("landing_format_tile_click", {
        format: el.dataset.formatTile,
        href: el.getAttribute("href"),
      });
    });
  });
</script>
```

- [ ] **Step 3: Fire a hero-CTA event from the landing pages**

In `src/pages/youth.astro`, add before `</BaseLayout>`:

```astro
<script>
  import { track } from "@/lib/analytics/track";
  document.querySelectorAll<HTMLAnchorElement>("[data-landing-cta]").forEach((el) => {
    el.addEventListener("click", () => {
      track("landing_hero_cta_click", { cta: el.dataset.landingCta });
    });
  });
</script>
```

Add the identical block to `src/pages/adult.astro` before its `</BaseLayout>`. (The `data-landing-cta` attributes are already on the hero `<a>` tags from Tasks 8 and 9.)

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 5: Verify events fire**

Run `npm run dev`, open `http://localhost:4321/youth` with the browser devtools console open, click a format tile and the hero CTA. With a PostHog key configured you'll see network calls to the PostHog host; without one the noop fallback swallows them silently and nothing errors. Confirm **no console errors** either way.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/track.ts src/components/landing/format-tiles.astro src/pages/youth.astro src/pages/adult.astro
git commit -m "feat(analytics): named conversion events on landing CTAs and format tiles"
```

---

### Task 17: E2E tests for the new pages and nav

**Files:**
- Create: `tests/e2e/landing-pages.spec.ts`

Covers: `/youth` and `/adult` load and their hero CTAs + format tiles navigate correctly; the header nav exposes the six links; `/shop` returns 200 and is `noindex`. Follows the repo's Playwright conventions (`waitUntil: "domcontentloaded"` is safe here; these pages have no `mock-r2` images).

- [ ] **Step 1: Write the test file**

Create `tests/e2e/landing-pages.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Discovery landing pages", () => {
  test("/youth loads with hero CTA and five format tiles", async ({ page }) => {
    await page.goto("/youth", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /look forward to/i }),
    ).toBeVisible();

    const tiles = page.locator("[data-format-tile]");
    await expect(tiles).toHaveCount(5);

    await expect(
      page.locator('[data-format-tile="Camps"]'),
    ).toHaveAttribute("href", "/programs?audience=youth&type=camp");

    await page.locator('[data-landing-cta="youth-hero"]').click();
    await expect(page).toHaveURL(/\/programs\?audience=youth/);
  });

  test("/adult loads with two hero CTAs and a pick-up tile to /dropin", async ({ page }) => {
    await page.goto("/adult", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /build your week around/i }),
    ).toBeVisible();

    const tiles = page.locator("[data-format-tile]");
    await expect(tiles).toHaveCount(3);
    await expect(
      page.locator('[data-format-tile="Pick-up"]'),
    ).toHaveAttribute("href", "/dropin");

    await page.locator('[data-landing-cta="adult-hero-team"]').click();
    await expect(page).toHaveURL(/\/programs\?audience=team/);
  });

  test("header nav exposes the six audience-led links", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const nav = page.locator("nav").first();
    for (const label of ["Youth", "Adult", "Sports", "Locations", "Shop", "About"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("/shop returns 200 and is noindex", async ({ page }) => {
    const response = await page.goto("/shop", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
  });
});
```

- [ ] **Step 2: Run the E2E suite for this file**

Start the dev server (`npm run dev`), then run:
```bash
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/landing-pages.spec.ts
```
Expected: PASS — all 4 tests green.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/landing-pages.spec.ts
git commit -m "test(e2e): landing pages, audience-led nav, /shop noindex"
```

---

### Task 18: Full pre-push verification

**Files:** none — verification only.

Per `CLAUDE.md`'s pre-push checklist for major work (new pages + new E2E flows).

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS — `/youth`, `/adult`, `/shop`, `/sports`, `/locations` all in the output. Prerender `Astro.request.headers` warnings are pre-existing noise.

- [ ] **Step 3: Unit tests**

Run: `npx vitest run tests/unit/`
Expected: PASS — including the new `derive-deadline.test.ts`.

- [ ] **Step 4: API tests** (dev server must be running)

Run: `CRON_SECRET=<same-as-dev-server> TEST_BASE_URL=http://localhost:4321 npm run test:api`
Expected: PASS — no regressions (this change touches no API routes, but run it to confirm).

- [ ] **Step 5: Full E2E suite** (dev server must be running)

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test`
Expected: PASS — the new `landing-pages.spec.ts` plus no regressions in existing specs (the homepage program rows and `/programs` still render the refactored card).

- [ ] **Step 6: No migration needed — confirm**

This plan touches no files under `src/lib/db/schema/`. Confirm `git diff --name-only origin/main...HEAD` lists no schema files, so `db:generate` is not required.

- [ ] **Step 7: Push and confirm CI green**

```bash
git push -u origin HEAD
```
Then watch the CI workflow on the resulting commit. A push is not "done" until CI is green on origin.

---

## Self-Review

**Spec coverage** — every spec section maps to a task:
- Decision 1 (no persistence) — honored by absence; nav is static (Task 13), no cookie/middleware anywhere.
- Decision 2 + 3 (explicit nav + landing pages; homepage keeps hero) — Tasks 8, 9, 13, 15.
- Decision 4 (two SEO surfaces) — header Task 13, footer Task 14.
- Decision 5 (`/shop` noindex placeholder) — Task 10.
- Decision 6 + 7 (unified card, media slot + sport-color fallback) — Task 2.
- Decision 8 (deadline over fill bar, conditional urgency) — Tasks 1 + 2.
- Decision 9 + 10 (format-led Section 2; "Classes" → `training`) — Tasks 6, 8 (`type=training`).
- Architecture A (card) — Tasks 1–3. Architecture B (nav + landing) — Tasks 6–15. Architecture C (`?type=` plumbing) — Task 5. Architecture D (orphan cleanup) — Task 4.
- Rollout phasing — Phase 1 = Tasks 1–4 (shippable); Phase 2 = Tasks 5–18.
- Testing section — Tasks 17 + 18.
- Sanity-check additions beyond the spec: `/sports` + `/locations` index pages (Tasks 11, 12 — nav targets that would otherwise 404), named conversion events (Task 16 — the spec's stated goal is conversion).

**Placeholder scan** — Task 14 Step 2 intentionally references "the file's existing column markup pattern" rather than reproducing the full footer JSX, because the exact class strings must be copied from the live file to stay consistent with its editorial styling; the structure to produce is shown explicitly. All code-producing steps include complete code. Landing-page copy is real (from the approved mockups), not `{{TBD}}` — the founder may revise but the plan ships working pages.

**Type consistency** — `deriveDeadline` returns `{ label, urgent } | null` in Task 1 and is consumed that way in Task 2. `ProgramCardV2`'s `Season` interface in Task 2 is the type `FeaturedProgramsRow` (Task 7) and `programs-catalog.tsx` already satisfy. `initialType: string | null` prop (Task 5) matches the `programType` string passed from `programs/index.astro`. `track(event, props)` (Task 16) is used with that signature in all three call sites.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-14-ux-discovery-conversion.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
