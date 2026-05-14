# /adult Landing Page Redesign — Design Spec

**Date:** 2026-05-14
**Status:** Approved — ready for implementation
**Implementation skill:** `frontend-design` (per explicit user request — not `writing-plans`)

## Problem

The current `/adult` landing page is a marketing page that *points* adults at things — its format tiles and hero CTAs send the visitor off to `/programs?audience=adult` or `/dropin` to actually find and register for something. An adult should not have to navigate away. There are exactly three things an adult can do — **join a league, play pickup, register for a tournament** — and the page should let them filter down to the specific one they want and act on it, all in place.

## Goal

`/adult` becomes a self-sufficient finder: the adult lands, sees all three options, drills down with filters, and registers/books — without leaving the page.

## Approved design

### Page structure (top to bottom)

1. **Hero** — keeps the existing dark/charcoal + orange-accent treatment and the headline "The league you'll build your week around." The **time-bound kicker is removed** (no "Founding season · Summer 2026") in favor of an evergreen kicker — "Adult Sports · Central Ohio". The two old CTAs ("Browse adult leagues" / "Register a team") become **three jump-links** — *Find a league ↓ · Play pickup ↓ · Tournaments ↓* — that smooth-scroll to the matching section.
2. **Sticky section-nav** — a slim bar (`⚽ Leagues · 🟢 Pickup · 🏆 Tournaments`) that sticks below the global site header on scroll and highlights the section currently in view. On mobile it is a horizontal scrollable strip. (Layout option "C — stacked + sticky section-nav", chosen over a tabbed switcher because all three options should be visible, and over plain stacked because the page is long.)
3. **Three stacked sections** — Leagues, Pickup, Tournaments (details below). Each is an independent client-side island: heading + one-line descriptor + open-count, a contextual chip-filter row, a results grid, a "Show more" pager, and its own loading/empty state.
4. **Testimonials** — reuse the existing `Testimonials` component, unchanged.
5. **CTA banner** — reuse the existing `CTABanner` component, unchanged.

### The three sections

**1 · Leagues**
- **Data:** `/api/public/seasons?status=open`, filtered to `program.programType === "league"` and adult audience (`deriveAudience(s) === "adult"`).
- **Card:** `ProgramCardV2` (the unified card). It already surfaces the team-vs-free-agent choice via its "Solo or team" badge and dual CTAs.
- **Filters:** Sport · Venue · Day (weekday/weekend bucket via `deriveDayBucket`).
- **No signup-mode filter** — every adult league supports both signing up a full team *and* joining as a free agent (space permitting), so a signup-mode filter would partition nothing. The choice is a card-level affordance, not a filter.
- **Copy note:** use "free agent" (the user's term) rather than "solo" for the individual-signup path in league-context copy.
- **Register:** card CTA → `/register/{id}` or `/register/team/{id}` (the card already routes both).

**2 · Pickup**
- **Data:** `/api/dropin/sessions` — a rolling next-14-days window, org-scoped via the request host. Filtered to `kind === "pickup"` and `audience` in `["adults", "all_ages"]`.
- **Card:** `SessionCard` (the existing drop-in card).
- **Filters:** Date · Sport (`sportOrClassLabel`) · Skill level · Venue.
- **Time-bound by nature:** unlike leagues/tournaments, pickup results are "what's on in the next two weeks," not a standing catalog. The section descriptor should make that explicit ("next 2 weeks · show up & play").
- **Book:** `SessionCard` → `/dropin/{id}` (the existing booking flow).

**3 · Tournaments**
- **Data:** the *same* `/api/public/seasons?status=open` fetch as Leagues, filtered to `program.programType === "tournament"` and adult audience.
- **Card:** `ProgramCardV2`.
- **Filters:** Sport · Venue · Date.
- **Register:** card CTA → `/register/{id}` or `/register/team/{id}`.

### Architecture

- **Two fetches, three sections.** Leagues + Tournaments share one `/api/public/seasons` fetch (split client-side by `programType`); Pickup is a separate `/api/dropin/sessions` fetch. A reasonable structure: one React island for the seasons-backed sections (or one per section sharing a fetched-once cache) and one for Pickup — the implementer should choose the cleanest decomposition, but must not fetch `/api/public/seasons` twice.
- **`/adult.astro` stays SSR** (no `prerender` flag) — consistent with the current page and required so the host org context is available for the client-side Pickup fetch.
- **Reuse, don't reinvent:** `ProgramCardV2`, `SessionCard`, and the existing chip-filter patterns from `programs-catalog.tsx` and `dropin/SessionList.tsx`. The editorial cream design system is unchanged throughout (`docs/design-system.md`).
- **Sticky section-nav** uses scroll-position observation to highlight the active section; jump-links use in-page anchors with smooth scroll.
- The existing `FormatTiles` usage and the `FeaturedProgramsRow` usage on `/adult` are **removed** — the three filterable sections replace them. (`FormatTiles` and `FeaturedProgramsRow` components are NOT deleted — `/youth` still uses them.)

### Decisions made during brainstorming

1. **Layout C** — stacked sections + sticky section-nav. Rejected: tabbed switcher (hides two-thirds), plain stacked (no fast navigation on a long page).
2. **Keep social proof** — Testimonials + CTA banner stay below the three sections. Only the format tiles + featured-leagues row are replaced.
3. **No signup-mode filter on Leagues** — every league supports both team and free-agent signup; the filter would partition nothing.
4. **Evergreen hero copy** — the time-bound "Founding season · Summer 2026" kicker is removed; the hero must not carry copy that goes stale.
5. **"Free agent"** is the user's term for individual league signup — prefer it over "solo" in league copy.
6. **Implementation via `frontend-design`** — the user explicitly asked for the `frontend-design` skill to build this, so the brainstorming flow transitions there rather than to `writing-plans`.

## Non-goals

- No changes to `/programs`, `/dropin`, or `/youth` — those standalone pages remain (other audiences and entry points still use them).
- No changes to the registration or drop-in booking flows themselves — this page routes *into* the existing flows.
- No schema changes. No new API endpoints — the two existing public endpoints (`/api/public/seasons`, `/api/dropin/sessions`) already provide everything; filtering is client-side, matching the existing catalog and `SessionList` patterns.
- No new card components — reuse `ProgramCardV2` and `SessionCard`.

## Testing

- **Playwright E2E** (`tests/e2e/`): `/adult` loads; the three sections render; hero jump-links scroll to the right section; the sticky section-nav appears on scroll; a filter chip in each section narrows that section's results; each section's empty state renders when its data source is empty. Top-level island components call `useHydrationBeacon()`; tests use `waitForHydration` before interacting (CLAUDE.md Playwright conventions).
- **Build + type check:** `npm run build` and `npx tsc --noEmit` clean. `/adult` stays SSR.
- No unit tests required — no new pure logic; filtering reuses existing derive helpers.
- Browser verification of the final page (footer/responsive behavior, sticky-nav behavior, the three sections at desktop + mobile widths) before the work is called done.

## Open follow-ups (out of scope)

- The `/youth` hero and `/programs` header still carry time-bound "Now enrolling · Summer 2026" kickers — the evergreen-copy principle applies to them too, but updating them is a separate small change, not part of this redesign.
