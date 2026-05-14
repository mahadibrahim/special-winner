# /youth Landing Page Redesign — Design Spec

**Date:** 2026-05-14
**Status:** Approved — ready for implementation
**Implementation skill:** `frontend-design` (the path established by the `/adult` redesign — not `writing-plans`)
**Sibling spec:** `docs/superpowers/specs/2026-05-14-adult-landing-redesign-design.md`

## Problem

Like `/adult` before its redesign, `/youth` is a marketing page that *points* visitors at things rather than letting them act in place. Its format tiles, its age quick-filter row, and its hero CTA all link out to `/programs?audience=youth…` — the old catalog. A parent has to leave the page to find and register for a program.

## Goal

`/youth` becomes a self-sufficient finder: a parent lands, drills down to what fits their kid, and registers — without navigating away.

## Approved design

### Organizing axis: age-led

Adult's finder is organized by **format** (League / Pickup / Tournament) because that is how adults think about playing. Parents think differently — *"what's right for my kid's age"* comes before *"leagues vs. camps"*. So the youth finder's primary cut is the **age band**, and program format is demoted to a filter within each section.

This keeps youth structurally consistent with adult — hero → sticky section-nav → three stacked sections → social proof — only the sections are age bands instead of formats.

### Page structure (top to bottom)

1. **Hero** — keeps the existing warm green treatment and the headline "Sports your kid will actually look forward to." The **time-bound kicker is removed** (no "Now enrolling · Summer 2026") in favor of an evergreen kicker — "Youth Sports · Central Ohio". The single "Browse youth programs" CTA becomes **three jump-links** — *Ages 4–8 ↓ · Ages 9–12 ↓ · Ages 13–18 ↓* — that smooth-scroll to the matching section.
2. **Sticky section-nav** — a slim bar (`Ages 4–8 · Ages 9–12 · Ages 13–18`) that sticks below the global site header on scroll and highlights the section in view. Horizontal scroll strip on mobile. Reuses the `section-nav.tsx` component built for `/adult` as-is.
3. **Three stacked age sections** — Ages 4–8, Ages 9–12, Ages 13–18 (details below). Each is part of one client-side island; each has a contextual chip-filter row, a results grid, a "Show more" pager, and its own loading/empty state.
4. **WhyAspire** — reuse the existing component, unchanged.
5. **Parent FAQ** — reuse the existing `FAQSection` component, unchanged.
6. **CTA banner** — reuse the existing `CTABanner` component, unchanged.

(Items 4–6 are the youth equivalent of adult's "keep social proof" decision.)

### The three age sections

All three are backed by the **same single fetch** — `/api/public/seasons?status=open`, filtered to youth audience (`deriveAudience(s) === "youth"`), then split into age bands by each season's `ageGroup` min/max range, **reusing the catalog's existing 4–8 / 9–12 / 13–18 bucketing logic** (`programs-catalog.tsx`):
- **4–8** — `ageGroup.maxAge <= 8`
- **9–12** — `ageGroup.minAge >= 9 && ageGroup.maxAge <= 12`
- **13–18** — `ageGroup.minAge >= 13`

For each section:
- **Card:** `ProgramCardV2`.
- **Filters:** Format · Sport · Venue. **Format** is the meaningful one here (Leagues / Classes / Camps / Clinics / Tournaments — i.e. the `programType` values `league` / `training` / `camp` / `clinic` / `tournament`); age is already the section cut. Sport and Venue mirror the adult sections. Every chip group auto-hides when it has ≤1 option (so a soccer-only catalog shows just Format + Venue).
- **Register:** card CTA → `/register/{id}` or `/register/team/{id}` (the card already routes both).
- **Section descriptors:** 4–8 "first touch & fundamentals", 9–12 "skill building", 13–18 "competitive" (final copy is the founder's call; these are the working values).

**Edge cases** (user-confirmed acceptable, low-likelihood):
- A season whose `ageGroup` spans bands (e.g. ages 6–14) appears in *every* band it overlaps.
- A season with no `ageGroup` at all is included in **all three** bands, so it is never hidden — it reads as "applies to any age".

### Architecture

- **One fetch, three sections.** A single `/api/public/seasons` fetch, split client-side by age band. (Adult needed two fetches because Pickup came from the drop-in subsystem; youth has no pickup, so it is simpler.)
- **`/youth.astro` stays SSR** (no `prerender` flag) — consistent with the current page and with `/adult`.
- **Heavy reuse of the `/adult` finder components:**
  - `section-nav.tsx` — reused as-is (it is already props-driven).
  - `filter-chips.tsx` — reused as-is.
  - `seasons-finder-section.tsx` — **generalized** to optionally render a **Format** filter chip. This is backward-compatible with `/adult`: adult's Leagues and Tournaments sections are each already pre-filtered to a single `programType`, so the Format chip auto-hides there (≤1 option) and adult's behavior is unchanged. Youth's age sections contain mixed program types, so the Format chip shows.
  - A new orchestrator island, `youth-finder.tsx` (the youth counterpart of `adult-finder.tsx`): one fetch, scroll-spy, renders the sticky nav + three age sections wrapped in a `<div>` so the sticky nav releases after the last section.
- **`youth.astro` is rewritten:** hero (evergreen kicker + three age jump-links) + `<YouthFinder client:load />` + `WhyAspire` + `FAQSection` + `CTABanner`. The existing hero analytics script (`data-landing-cta` → `track()`) is preserved and the smooth-scroll delegated-anchor script from `/adult` is added.
- The current `/youth` page's `FormatTiles` usage, age quick-filter row, and `FeaturedProgramsRow` usage are **removed** — the three age sections replace them. `FormatTiles` and `FeaturedProgramsRow` components are **not deleted** (nothing else uses them after this, but deletion is a separate cleanup decision, out of scope here).

### Decisions made during brainstorming

1. **Age-led, not format-led.** Parents shop by their kid's age first. Rejected: a direct format-led copy of adult (five stacked sections — too long), and format-led-but-grouped (editorial grouping judgment with no clear winner).
2. **Three age sections** — 4–8 / 9–12 / 13–18, matching the catalog's existing age bands.
3. **Format demoted to a filter chip** within each age section.
4. **Keep social proof** — WhyAspire + Parent FAQ + CTA banner stay below the finder.
5. **Evergreen hero copy** — the "Now enrolling · Summer 2026" kicker is removed (same principle applied to `/adult`).
6. **Edge cases accepted as-is** — span-bands seasons appear in each overlapping band; no-`ageGroup` seasons fall to an "All ages" catch. User confirmed these are low-likelihood and acceptable.
7. **Implementation via `frontend-design`** — consistent with how `/adult` was built.

## Non-goals

- No changes to `/programs`, `/dropin`, or `/adult` *behavior*. The one shared-code change — generalizing `seasons-finder-section.tsx` to support a Format chip — is backward-compatible and leaves adult's rendered output unchanged.
- No schema changes. No new API endpoints — `/api/public/seasons` already provides everything; filtering and age-bucketing are client-side, matching the catalog and the adult finder.
- No new card component — reuse `ProgramCardV2`.
- `FormatTiles` / `FeaturedProgramsRow` are not deleted in this work.

## Testing

- **Playwright E2E** (`tests/e2e/`): `/youth` loads; the three age sections render; hero jump-links scroll to the right section; the sticky section-nav appears on scroll and releases after the last section; a Format filter chip in a section narrows that section's results; each section's empty state renders when its band has no programs. Top-level island calls `useHydrationBeacon()`; tests use `waitForHydration` before interacting.
- **Build + type check:** `npm run build` and `npx tsc --noEmit` clean. `/youth` stays SSR. Confirm the `seasons-finder-section.tsx` generalization does not regress `/adult` (build + a visual check of `/adult`'s Leagues/Tournaments sections — the Format chip must stay auto-hidden there).
- **Browser verification** of the final `/youth` page (the three sections, sticky-nav behavior, a filter, mobile reflow) before the work is called done — as was done for `/adult`.

## Open follow-ups (out of scope)

- This redesign makes the `/youth` hero kicker evergreen. The `/programs` header and the shared `CTABanner` component still carry time-bound "Summer 2026" copy — the same evergreen-copy principle applies, but updating them is a separate small pass.
