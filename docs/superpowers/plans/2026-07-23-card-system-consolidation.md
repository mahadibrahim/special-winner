# Card System Consolidation (Wave B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every league card shows the same information in the same order, aligned in every grid, with the venue linking to its location page — per the approved proposal (artifact "Funnel Friction & Card System — Fix Proposal" v2, §02 + Wave B list) and the card-inventory audit.

**Architecture:** One canonical Aspire card (`ProgramCardV2` absorbs `PickupCard` as a variant) with a fixed row contract; one grid/scroll-row container primitive; one measured skeleton; one SoccerOne dark card primitive (brand-separate — cream tokens invert on navy; "one behavior contract, two token-appropriate renderers"). The Aspire division LIST (`DivisionsFinder`) stays a list by design.

**Base:** origin/main e4d2ca46.

## Global Constraints

- **Worktree:** `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/card-system`, branch `feat/card-system-consolidation`. HARD DIRECTORY RULE for all dispatches: prefix every command with `cd <worktree> && `; two wrong-checkout incidents already occurred this project.
- **Canonical field set (the user's explicit requirement):** every program/season card renders the SAME rows in the SAME order: (1) media band, (2) title (clamped 2 lines, min-height), (3) meta row A: venue **as a link to `/locations/{location.slug}`** · age · format, (4) meta row B: day + time, (5) meta row C: start date, (6) fixed-height chip slot (early-bird deadline chip when active, empty otherwise), (7) price band pinned bottom, (8) CTA band. Free-text `scheduleNotes` come OFF the card (they remain in `LeagueContextRail` on the register page — verify, don't remove there).
- **Venue link interaction:** nested anchor with its own hit area inside the card (`e.stopPropagation()` or sibling-anchor layout so card CTA and venue link don't conflict); `data-testid="card-venue-link"`. When a location has no page (missing slug), render plain text — never a dead link.
- **Load-bearing contracts (do not break):** `?mode=individual` / `?mode=team` href shapes from cards; `data-testid="division-rows"` and `result-count` (DivisionsFinder — untouched anyway); tests may grep for headings, run affected specs.
- **SoccerOne brand separation:** no shared component parameterized by brand colors; SoccerOne primitive keeps `--so-*` tokens and its own breakpoints. The consolidation there is the THREE hand-rolled card idioms (leagues LeagueCard, pickup GameCard, membership tier) converging on one dark primitive with shared badge/status/price-row sub-parts.
- **Both-brand visual verification is mandatory before the PR** (memory: verify in a browser, not just tests — greps can't see contrast/alignment).
- **No new analytics events; no server changes.** Data needed (location.slug) is already in every season payload (verified in the public seasons API).
- Audit of record (file:line for everything): the card-inventory report — key facts inline per task below.

## Task 1: Canonical card contract in `ProgramCardV2`

**Files:** `src/components/programs/program-card-v2.tsx` (title clamp exists at :238 `line-clamp-2 min-h-[2.5rem]`; conditional stack :243-283 is the raggedness source); Test: `tests/unit/` snapshot-free assertions where extractable + e2e greps.

- Restructure the body to the canonical rows (Global Constraints). Meta rows A-C always render (data always exists: location.name/slug, dayOfWeek+times, startDate; format/age from ageGroup + program fields — when a season genuinely lacks a field render an em-dash placeholder, never omit the row). Chip slot: fixed height (`min-h`), contains early-bird chip when `earlyBirdActive`/deadline, else empty. `scheduleNotes` and the deadline text line are REMOVED from the card (deadline info lives in the chip). Price band + CTA unchanged in content, pinned via flex column (`mt-auto` exists — verify).
- Venue link per Global Constraints.
- Grid parents already use items-stretch? Verify each call site's grid gets uniform heights with `h-full` (already `flex flex-col h-full` per audit).

## Task 2: Merge `PickupCard` into the canonical card

**Files:** `src/components/programs/program-card-v2.tsx` (+`variant="pickup"` or extracted `CardShell`), `src/components/landing/pickup-card.tsx` (deleted or reduced to a thin wrapper), `src/components/landing/pickup-finder-section.tsx` (call site).
- Audit facts: PickupCard self-documents as a visual sibling; drift = media h-20 vs h-28, no title clamp. Pickup anatomy: day headline, time, venue(→link now), skill badge (in the chip slot), price, spots/waitlist CTA. Same shell/rows; body fields map onto the canonical rows (row B = time window, row C = date, chip = skill badge).
- Preserve the Book/waitlist CTA behavior exactly.

## Task 3: One skeleton + one container primitive

**Files:** new `src/components/programs/program-card-skeleton.tsx`; `src/components/landing/seasons-finder-section.tsx:193-200` + `src/components/landing/homepage-programs-preview.tsx:211-218` (duplicated `h-[320px] animate-pulse` blocks); `src/components/programs/programs-catalog.tsx` (3 container regimes: grid :479, fixed-width scroll row :438-444).
- Skeleton mirrors the canonical card's structure (media band + title lines + 3 meta rows + chip + price/CTA bands) so height derives from the same classes — not a hardcoded guess.
- Container primitive: `CardGrid({ layout: "grid" | "scroll-row" })` (or two tiny components) — the 3-up grid and the fixed-width scroll row become the only two container modes; all call sites migrate (finders, homepage, catalog incl. featured rows).

## Task 4: SoccerOne dark card primitive

**Files:** new `src/components/soccerone/SoCard.tsx` (name per file conventions — check sibling naming) + `SoccerOneLeaguesFinder.tsx` (LeagueCard), `PickupGames.tsx` (GameCard), `MembershipTiersLive.tsx`/`MembershipTier.tsx` (tier card) migrate; per-file `<style>` blocks deduplicate into the primitive's own style (keep `--so-*` tokens + 1100px/768px breakpoints).
- Same canonical row ORDER for the league card content (venue link included → `/locations/{slug}` — CHECK: do SoccerOne location pages exist at that route for SoccerOne-brand locations? The route is brand-shared; verify a SoccerOne location slug renders there — if the page 404s or renders Aspire-branded for SoccerOne venues, render plain text on SoccerOne cards and note it in the PR instead of linking wrong).
- Membership tier keeps its pricing-plan anatomy (different content contract) but consumes the shared shell/badge/price-row sub-parts.
- No clamp/min-height regressions: add the same reserved-height discipline (`.lc-name` etc. currently unclamped per audit).

## Task 5: Verification + PR (controller-run)

- tsc, unit, build. Playwright: `register-flow`, `adult-soccer-season` (division rows untouched — regression only), any spec grepping card markup (audit says only loose selectors + the dead `data-testid="program-card"` alternative — add that testid to the canonical card while at it, making the dead selector live).
- **Browser pass on BOTH brands** (dev server; check 4321 owner first — another session may hold it; use an alternate port): /programs, /adult/leagues, homepage, /adult/pickup (Aspire) and /soccerone/leagues, /soccerone/pickup, /soccerone/memberships (SoccerOne) — screenshot-level check: aligned rows, venue links work, no token inversion, no console errors.
- Final whole-branch review (opus). PR: include before/after screenshots if feasible; body flags the SoccerOne-location-link decision and preserved contracts.

## Self-Review Notes

- Proposal coverage: canonical field set + location link (user's two requirements) → Task 1; six Wave B bullets → Tasks 1-4 (+ cream-tile wrapper folded into Task 2's shell extraction if natural, else dropped as optional).
- Load-bearing: `?mode=` hrefs (Tasks 1-2 must not touch CTA href logic), division-list testids (untouched).
- Risk: Task 4 is the widest (3 SoccerOne surfaces + CSS dedup) — keep it mechanical; the membership tier migration is the most likely to be judged out-of-family mid-task → implementer may propose shell-only adoption there (acceptable).
