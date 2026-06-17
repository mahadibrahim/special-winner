# League Lead-in Pages — Redesign Spec

**Date:** 2026-06-17
**Status:** Design validated in brainstorming (visual companion mockups approved). Pending spec review → implementation plan.
**Context:** The deep `/adult/leagues/soccer/<term>` season page looks great. The two pages that *lead into* it need work: the soccer **landing** (`/adult/leagues/soccer`) and the multi-sport **catalog** (`/adult/leagues`). Design is locked via mockups; refinements later.

## Goal

1. **Landing** — make it scale and sell: a **tabbed** structure (Overview · This Season · Upcoming · Past) so it never goes stale as terms accumulate, with a **bold, benefit-led Overview** ("why indoor soccer") instead of a static rules dump.
2. **Catalog** — give it the **bold** energy of the season page (video hero, big type, sport quick-entry tiles) and fix two concrete bugs (redundant card titles, "PER KID" on adult cards).

Both keep the existing fast path intact (someone who knows what they want can jump straight to a division/register).

## Part 1 — Landing (`/adult/leagues/soccer`)

SSR page; the interactive body becomes a `client:load` React island (the term grouping + tab switching are client-side and need `useHydrationBeacon` for E2E).

**Kept:** the compact photo hero + the orange **"Now Registering · <current term>"** banner that links to the current season page.

**New tabbed body** (`src/components/leagues/soccer-landing-tabs.tsx`):

- **Overview** (default) — the evergreen "home", now bold:
  - A **navy "Why indoor soccer" band**: eyebrow + display headline + lede + a **6-card value-prop grid** (faster/more goals · year-round weatherproof · free-agent placement · real competition w/ refs+standings+tiers · post-game scene · weeknights/2 venues), icon chips tinted with palette accents (orange/sage/ochre).
  - A **bold full-width current-season banner** at the band's foot (orange): `● Registration open · <term> · dates · N divisions · venues · early-bird ends <date> · See divisions & register →` (links to the current season page). *(Replaces a stat strip per review.)*
  - Below (cream): the **A/B/C/D level ladder** (shared `LevelLadder`) + **rules in brief** (from `adult-soccer-content`).
- **This Season** — the current open/active term as a featured card → season page; a brief "at a glance" of its divisions.
- **Upcoming** — **forming** terms, each a row with its registration-open date + "Notify me" (interest list → existing `/api/public/season-interest`). Empty state if none.
- **Past** — **completed** terms, each linking to its (archived) season page for final standings/results. Empty state ("Fall 2026 is the first") until one completes.

**Data:** fetch `/api/public/seasons?sport=soccer&audience=adult` (returns open/active/forming) for Overview/This Season/Upcoming, plus `&status=completed` for Past (see API change). Group by term with the existing `groupByTerm`/`resolveCurrentTerm` helpers (`@/lib/leagues/terms`); current term = the open/active group; upcoming = forming groups; past = completed groups. Evergreen copy from `@/lib/leagues/adult-soccer-content`.

## Part 2 — Catalog (`/adult/leagues`)

**Bold video hero** (mirrors the season page; replaces the dark empty-right editorial hero):
- A muted autoplay-loop **video background** with a navy scrim, a `stock video — swap for Aspire footage` affordance tag, and the **eyebrow line removed** (nav + logo make it redundant). Headline "Adult leagues." at display scale + the value subline. Placeholder clip: Pexels indoor-soccer `6077723` (hd source + sd fallback); real Aspire footage drops in later.
- **Sport quick-entry tiles** below the headline: a **live** tile per sport that has open adult seasons (e.g. **Soccer · ● Now registering · <term> · N divisions** → `/adult/leagues/soccer`), plus **"Coming soon"** tiles for not-yet-live sports (Basketball, Volleyball) — these are a small typed config for now (no data). This replaces the buried text link and makes the page feel intentional pre-multi-sport.

**"Open now" cards — fix two bugs:**
1. **Redundant title.** Cards currently render `program.name — season.name` → "Adult Men's 7v7 League — Fall 2026 — Men's D". Change the catalog card title to the **season name only** ("Fall 2026 — Men's D"), with **sport · gender** and **venue · level** as metadata. (Find the card component the catalog/`CategoryFinder` uses and adjust its title composition.)
2. **"PER KID" on adult cards.** The Downtown Adult Co-Ed card showed "$120 PER KID". Root cause was `program.audience_type='parents'` — **already fixed in prod data** (set to `adults`). Confirm the card's per-unit label derives from audience/age (so the data fix resolves it); if it keys on something stale, correct the label logic so adult leagues read **"per player"**.

## API change

`src/pages/api/public/seasons.ts` clamps status to `open|active|forming`. **Extend the allowlist to also permit an explicit `?status=completed`** so the landing's Past tab can fetch finished terms. (Completed seasons are public historical data; still tenant-scoped + `isTest` excluded.) No other status behavior changes.

## Design system

Reuse the established tokens + components: `LevelLadder`, the cream/navy/orange/ochre/sage palette, Newsreader/IBM Plex, the season page's hero/tab patterns. Tabs match the season-page tab bar. New value-prop + sport-tile styles live with their components.

## Error / loading / empty

- Landing tabs: `LoadingSkeleton` while seasons fetch; `ErrorBanner` on failure; per-tab `EmptyState` (no upcoming / no past / no open term → banner falls back to next forming term).
- Catalog: video has a poster fallback; if no open seasons, the "Open now" section shows an empty state and the Soccer tile reflects forming/none.

## Testing

- **Unit:** term-grouping for the tabs (current/upcoming/past partition from a mixed season list) — extends `tests/unit/terms.test.ts`; value-prop/sport-tile config shape.
- **API:** `/api/public/seasons?...&status=completed` returns completed seasons (and still excludes draft/closed).
- **E2E (`@critical`):** landing tab switching (Overview → This Season → Upcoming → Past) renders the right content; the catalog Soccer tile links to `/adult/leagues/soccer`; a catalog card title shows the season name without the program-name prefix. (Tag `@critical` so the PR gate runs it — per the #225 lesson.)

## Out of scope (follow-ups)

- Real Aspire video/photo (stock placeholders now).
- "Coming soon" sport interest capture wiring (tiles are static until those sports exist).
- The 30+/40+ age-division facet (still folds under "open" tier).
- PostHog instrumentation of these pages (separate, already-scoped analytics effort — still paused).

## Open items to confirm in planning

- Whether "Upcoming" should also surface **draft** future terms (Winter/Spring are currently `draft`, so they won't appear until flipped to `forming`). Spec assumes Upcoming = `forming` only; if the team wants future terms visible pre-forming, that's a small follow-up (a config-driven upcoming list or surfacing draft terms for this sport).
- Exact card component shared between `/adult/leagues` and other catalog surfaces — change the title composition without regressing `/programs` etc. (verify during planning).
