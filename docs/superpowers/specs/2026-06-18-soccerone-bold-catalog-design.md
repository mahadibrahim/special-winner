# SoccerOne — Bold-Catalog Back-Port Design

**Date:** 2026-06-18
**Status:** Approved design → ready for implementation plan
**Author:** brainstormed with Mahad (visual companion walkthrough)

## Summary

Apply the patterns proven in the Aspire Sports landing redesign to SoccerOne's core
pages — **without** rebuilding what already works or breaking the dark/loud brand
identity. SoccerOne is a brand skin (dark `#0a0a0d` ground, lime `#a3e635` accent,
Anton/DM Sans/JetBrains Mono) on the shared Aspire web-app, served on
`gosoccerone.com` via middleware host rewrites. All affected pages are SSR
(`prerender = false`) and must stay that way — prerendering bypasses the brand
middleware.

The guiding principle from the walkthrough: **borrow the structure and mechanics,
not the palette.** SoccerOne stays monochrome lime; the transferable wins are
motion, live status, instant filtering, pricing clarity, and honest data.

Six work items, sequenced as walked through. Each is independently shippable.

---

## What we are NOT doing

- **Not** rebuilding the home hero — it is already a full-bleed video hero richer
  than Aspire's `HubHero`. Only three targeted tweaks (below).
- **Not** introducing per-card color palettes (Aspire's rainbow aurora). SoccerOne's
  locked design system says lime is THE accent; navy is Downtown-only.
- **Not** undoing the home "By the Numbers" stats or the leagues featured-CTA — both
  are already factual/live; no invented counts to remove.
- **Not** forcing SoccerOne's pages onto Aspire's cream-themed landing components.
  We reuse the **brand-agnostic logic** (event bus, hooks, pricing/level helpers,
  rate-card fetch) and build SoccerOne-skinned presentational shells.

---

## Architecture

### Reuse vs. build

**Reuse directly (already brand-agnostic, pure):**
- `src/lib/landing/finder-filter.ts` — the `aspire:finder-filter` event bus +
  `dispatchFinderFilter` / `onFinderFilter` (5s hydration replay buffer).
- `src/lib/hooks/use-finder-filter.ts` — `useFinderFilter` subscription hook.
- `src/lib/landing/pickup-pricing.ts` — `pricingTiers()` + `RateCardCents`.
- `src/lib/landing/skill-levels.ts` — tier enum + display labels.
- The `drop_in_rate_card` fetch pattern (SSR, per-org).

**Build SoccerOne-skinned (new, in `src/components/soccerone/`):**
- Presentational shells that consume the shared logic but render in the dark/lime
  identity. These do not share markup with Aspire's `src/components/landing/*`
  components — the visual languages are too different to make one component serve both.

### Data dependencies (verified present)

The public seasons API (`src/pages/api/public/seasons.ts`) already returns and/or
filters on every field the finder needs:
- `location` (`slug`, `name`) + `?location=` filter
- `divisionGender` (`coed` | `mens` | `womens`)
- `skillLevel` (`a`|`b`|`c`|`d`|`open`)
- `dayOfWeek` (`mon`..`sun`) + `startTime`
- `?audience=youth|adult` filter (powers the Youth-card fix)

**Open implementation detail:** the Division filter chip. `divisionGender` cleanly
covers Coed / Men's / Women's, but the marketing labels also include "Premier" and
"Corporate," which are not `divisionGender` values (Premier ≈ a `skillLevel` tier;
Corporate ≈ a program/audience distinction). The plan must resolve the chip taxonomy
against the **actual SoccerOne catalog** — derive chips from the distinct values
present rather than hard-coding. Do not ship a "Premier" chip that maps to nothing.

---

## Work items

### 1. Home hero — three tweaks (no rebuild)

File: `src/pages/soccerone/index.astro` (hero section).

- **Headline:** replace `INDOOR / SOCCER.` with **`YOUR GAME. / ANY NIGHT.`**
  (Anton, lime second line). Player-first, makes a promise.
- **Drop the eyebrow:** remove the `COLUMBUS, OHIO` pre-headline label. Fold the
  location into the subhead, lime-accented: "Four indoor fields across **Worthington
  & Downtown Columbus**. Leagues, pickup, and rentals — every night, year-round."
- **Facility cards become finder launchpads:** the two facility cards stay the hero's
  anchor (prominent, as today). Add **Leagues / Pickup / Rent** quick-links inside each
  card. Clicking one fires `dispatchFinderFilter({ sport/format, location })` scoped to
  that site + format, scrolls to the relevant finder, no reload.

### 2. Home "How You Play" cards — live doors

File: `src/pages/soccerone/index.astro` (`.play-section`).

- **Stay monochrome lime** — no per-card palette. Differentiate by icon, number,
  live copy.
- **Add aurora drift + hover lift** — slow breathing lime gradient, 4px hover lift,
  arrow slide. All motion gated behind `@media (prefers-reduced-motion: reduce)`.
- **Add live status pulse dots** — replace static detail rows with real signals
  ("6 divisions now registering", "next run tonight 8pm", "3 slots open this week",
  "fall clinics open") pulled from live data. Highest-value functional change here.
- Cards: Adult Leagues (featured) · Drop-In Pickup · Field Rentals · Youth Programs.
- Carries the content fixes from item 6 (season copy + youth link).

### 3. Smart leagues finder — instant, multi-axis

File: `src/pages/soccerone/leagues.astro` + new island
`src/components/soccerone/SoccerOneLeaguesFinder.tsx`.

- **Replace `?facility=` tabs** (full page reload) with a client-side finder island.
  Seasons are SSR-fetched and passed as props; filtering happens client-side, instant.
- **Three filter axes:** Location (`location.slug`), Division (see open detail above),
  Night (`dayOfWeek`). No skill-level chip — that's served by item 5.
- **Hero deep-link pre-fill:** island subscribes via `useFinderFilter`; arriving from
  a hero quick-link lands pre-filtered and scrolled, with a dismissible "arrived from"
  banner.
- **Smart empty state:** when filters match nothing, offer the interest list rather
  than a dead end.
- **Keep** the existing data-driven featured-CTA (first open season).

### 4. Pricing clarity band

New: `src/components/soccerone/SoccerOnePricingBand.astro`.
Placements: **Pickup page** (replaces the run-on sentence — core) + **Home** near the
memberships callout. **Rentals** (member vs non-member, two tiers) as a fast-follow reuse.

- **Headline:** **"Same run. Pick your price."** ("one price" was rejected as
  inaccurate — there are four prices; the *session* is the constant, not the price.)
- **Four tiers:** At the door **$17** · Book online **$15** · Member **$12** (best value,
  "Save $5 vs the door") · **Founder FREE** (its own 4th tile — loudest membership nudge).
- **Live data:** door / online / member figures bind to `drop_in_rate_card` via
  `pricingTiers()`. No literals in markup.
- Footer nudge: "Members play cheapest, every time."

### 5. "What level am I?" explainer

New: `src/components/soccerone/SoccerOneLevels.astro`.
Placement: **Pickup page, above the finder.** (Leagues-mapping is an optional later add.)

- **Lime intensity ladder** (not Aspire's green/amber/red): fill-bars + background
  brightness climb with level. Monochrome-safe, reads as progression.
- **Three tiers, welcoming voice:** Recreational — "Just here to play"; Intermediate —
  "Competitive, still friendly"; Advanced — "High-level run."
- Tier badges match the level tags on session cards in the finder for visual continuity.

### 6. Honest, data-driven content

Cleanup pass across the SoccerOne pages.

- **Error — season copy:** `index.astro:335` "8-week seasons with playoffs" →
  **"7-game season"**, no playoffs (SoccerOne leagues have neither 8 weeks nor playoffs).
- **Error — youth link:** Youth Programs card `href="/leagues"` →
  **`/leagues?audience=youth`** (the API already supports the `audience=youth` filter;
  the leagues finder reads it to pre-filter to youth).
- **Drift — pickup price:** hard-coded "From $12/game" in 3 spots (index card,
  pickup body, pickup meta description) → live from `drop_in_rate_card`.
- **Drift — rental price:** "From $80/hr" literal → live rate where a single number
  exists, otherwise evergreen phrasing ("by the hour").
- **Drift — band figures:** the item-4 band binds to the rate card, not literals.
- **Approach:** live-bind where a single canonical number exists; evergreen phrasing
  where a range or future change is likely.

---

## Brand & technical guardrails

- Monochrome lime throughout; navy reserved for Downtown accents only.
- All animation gated behind `prefers-reduced-motion: reduce`.
- Video heroes keep `aria-hidden` on the video; no autoplay audio.
- Every affected page stays SSR (`prerender = false`).
- Reuse the shared event bus / hooks / helpers; don't fork their logic.

## Sequencing

Ship in walkthrough order (1→6); each is independently deployable. Items 1 and 2 are
home-page edits and can land together. Item 3 (finder island) is the largest. Items 4
and 5 are new components consumed by the pickup page. Item 6 threads through 2, 3, and 4
and should be verified as those land.

## Success criteria

- Hero, cards, and finder render correctly in SoccerOne's dark/lime skin with no
  regression to the cream Aspire brand.
- Leagues finder filters instantly across Location/Division/Night with zero page reloads;
  hero quick-links land pre-filtered.
- Pricing band figures match the live rate card.
- No hard-coded prices or factual errors remain in the audited spots.
- All motion respects reduced-motion; all pages remain SSR.
