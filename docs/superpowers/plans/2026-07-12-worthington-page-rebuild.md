# Worthington Location Page Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. The visual spec is the approved mockup at `docs/design/2026-07-12-worthington-mockup-v2.html` — its markup/CSS is the verbatim design source (minus the mockup-only review bar, annotation chrome, and removed/unchanged notes). This plan pins the data bindings, facts, and constraints the mockup can't carry.

**Goal:** Rebuild `src/pages/soccerone/worthington/index.astro` per approved mockup v2 — shrunk real-footage hero with priority CTAs, honest two-state "What's Happening", real venue specs (no FIFA language), media strip, live-bound fall pricing block, Good to Know, yard-sign directional map, signup strip — and sweep the now-false "3 fields"/FIFA claims sitewide.

**Architecture:** SSR page (prerender=false, `setMarketingEdgeCache` after fetches). Season data via the org-scoped `/api/public/seasons?location=soccerone-worthington` (same fetch pattern + `.localhost` port-pin as `src/pages/soccerone/index.astro:16-40`). The What's-Happening toggle is a plain inline `<script>` (no island). `HomeSignupStrip` island reused. Assets already staged in `public/media/soccerone/` (hero mp4 2.9MB, poster, reel, 4 stills).

## Global Constraints

- NO eyebrow/kicker text (docs/design-system.md); bare `.kicker-bar` only. No section numerals anywhere.
- NO "FIFA-approved" language anywhere on SoccerOne surfaces after this branch.
- Worthington facts (source `aspire-sports-ops/marketing/data/soccerone-venue.md` + founder decisions): **2 soccer fields, 110×60 ft, fully boarded, sand-filled turf (no rubber crumb), intense 6v6 / comfortable 7v7; dedicated futsal courts (say "futsal courts" or "2+", never an exact count), opening September; open late — games as late as 1am; real halftime (two 24-min halves); post-game ref rating; newest venue in Columbus (2026); youth leagues Sat & Sun mornings; plenty of free parking.**
- Fall league facts: Sep 14 – Nov 8, 7 games/7 weeks, no playoffs, 6–11pm slots; night map per `operations/decisions/2026-07-11-worthington-fall-division-nights.md` (Sun 30+/40+ + Men's 30+; Mon Men's C/D; Tue Co-Ed C/D + futsal Co-Ed; Wed Women's Open + Co-Ed B; Thu open pickup + futsal Men's; Fri/Sat pickup/rentals/events, youth Sat AM). These 13 division seasons EXIST in the prod catalog with `dayOfWeek`/`startTime`.
- Live-data honesty: registration CTAs render only when an open season exists; deadline text from `registrationCloses` (nullable ISO instant → format `timeZone: 'America/New_York'`); prices from season `price`/`teamPrice`/`deposit`. The **$1,000 early-bird (thru Aug 3)** is NOT in the catalog — render it as a static row **date-gated** (compute "today" in America/New_York; hide from Aug 4). Never render "$null".
- Production `SoccerOneHeader`/`SoccerOneFooter` structure untouched; copy-only correction of "3 Fields" strings inside them is in scope (Task 4).
- Header/nav/footer field-count sweep replaces "3 fields" claims with "2 fields + futsal courts" phrasing (or drops counts) — never "3".
- Commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Branch `feat/worthington-page` is stacked on `fix/tenant-seo` (PR #376); merge `origin/main` once #376 lands, before opening the PR.

---

### Task 1 (controller, DONE): media assets staged
`public/media/soccerone/`: `worthington-hero.mp4` (1080p 6.5s muted loop), `worthington-hero-poster.jpg`, `worthington-reel.mp4` (portrait 9:16), `still-entrance.jpg`, `still-lockers.jpg`, `still-party.jpg`, `still-action.jpg`. Committed with plan + mockup.

### Task 2: Hero + frontmatter (season fetch) + fake-schedule deletion
**Files:** `src/pages/soccerone/worthington/index.astro`
- Frontmatter: port `fetchOpenSeasons` from `src/pages/soccerone/index.astro:16-40` but with `url.searchParams.set('location', 'soccerone-worthington')`; fetch adult + youth. Compute: `featured` (first open adult), `featuredCloses` (tz-explicit), `earlyBirdActive` (today in America/New_York ≤ 2026-08-03), team/solo/deposit price strings from featured (guard each field).
- Replace the current `f-hero` content with the mockup's hero: breadcrumb, H1, sub (venue facts), 3-tier CTA row — primary "Register for Fall Leagues →" (gated on `featured`; note line: early-bird text when `earlyBirdActive`, always "CLOSES {featuredCloses}" when present), secondary "Play Pickup" → `/pickup?facility=worthington`, tertiary "Classes & Camps — LAUNCHING 2027 · GET NOTIFIED" → `/join?src=worthington-classes`. Fact line incl. **PLENTY OF FREE PARKING**. Hero background: `<video autoplay muted loop playsinline preload="metadata" poster="/media/soccerone/worthington-hero-poster.jpg"><source src="/media/soccerone/worthington-hero.mp4" .../>` with the mockup's overlay gradient; hero min-height ~55vh.
- DELETE the entire fabricated "This Week's Schedule" scoreboard section + its CSS (incl. the "Academy — Coming 2027" cells and `section-num-sm` styles).
- Register CTA carries `data-so-register-cta` + dataset attrs and the analytics `<script>` (port from `src/pages/soccerone/index.astro` bottom, verbatim pattern).

### Task 3: What's Happening + The Building + media strip
**Files:** same page.
- What's Happening per mockup: NOW·SUMMER cards (pickup → live link only, youth weekend mornings, rentals, fall registration card gated on `featured` with real closes date) + THE FALL RHYTHM list. Fall rows derived LIVE: group the fetched adult seasons by `dayOfWeek`, render day → joined division `name`s (+ static Thu pickup / Fri·Sat open-play rows which aren't seasons). Hide the fall tab entirely if no seasons carry `dayOfWeek`. Toggle via small inline `<script>` (class flip, mockup behavior).
- The Building: spec cards (2 fields 110×60 / 2+ futsal Sept / 1AM open late / 2026 newest) + differentiator list (sand infill, boarded, real halftime, ref rating, spectator room) + the field-dimension SVG figure — all verbatim from mockup.
- Media strip: mockup grid; tall tile is a `<video muted loop playsinline preload="none" poster>` for the portrait reel (click-to-play via tiny inline script or just autoplay muted on visible — keep simple: `autoplay muted loop` is fine), stills as `<img loading="lazy" alt="...">` with real alt text (entrance, lockers, party room, game action). No sky-blue asset-slot labels — those were mockup annotations.

### Task 4: Fall pricing block, Good to Know, directions, signup, bottom CTA + sitewide sweep
**Files:** same page + sweep files.
- Fall block (lime): copy per mockup; price card LIVE: rows for team (early-bird row date-gated, labeled "Team — early-bird thru Aug 3"), team regular (`$${featured.teamPrice}`), solo (`$${featured.price}`), deposit (`$${featured.deposit}` if set); dock chip "OPEN · CLOSES {featuredCloses}"; whole block gated on `featured` (when null render nothing — the hero's pickup/rentals CTAs still stand).
- Good to Know per mockup (6 Q&As incl. plenty-of-parking phrasing; futsal = flat-soled shoes; classes/camps 2027 → join list).
- Getting Here: facts + corrected-geography SVG map from mockup (I-270 south, venue NE of Exit 23) + "Open in Google Maps" → `https://maps.google.com/?q=535+Lakeview+Plaza+Blvd,+Worthington,+OH+43085`.
- Mount `<HomeSignupStrip client:load />` before the bottom CTA strip; bottom CTA per mockup.
- SWEEP (copy-only): `src/pages/soccerone/index.astro:203` location line "3 fields" → "2 fields + futsal"; `pickup.astro:98` tab "WORTHINGTON · 3 FIELDS" → "WORTHINGTON · 2 FIELDS"; `memberships.astro:106` "3 fields — open now" → "2 fields + futsal courts"; `leagues.astro:74` description drop "(3 fields)"/"(1 field)"; `SoccerOneFooter.astro:41,75` "Worthington — 3 Fields" → "Worthington — 2 Fields + Futsal"; `rent.astro:14` fieldCount '3 fields' → '2 fields' and its description; any remaining "FIFA-approved" in `worthington/index.astro` body, `downtown/index.astro` body (copy-only there), `rent.astro`, signage-adjacent copy — grep `FIFA` across src/ and fix all SoccerOne-surface hits. Also grep `Skills Camp — Coming 2027|Academy — Coming 2027` (deleted with the schedule; ensure no stragglers).

### Task 5: e2e + verification + PR
- `tests/e2e/soccerone-worthington.spec.ts` (BASE convention from soccerone-pickup-band.spec.ts): unconditional — h1 WORTHINGTON, hero `<video>` with the poster attr, no "FIFA" text, no "typical week"/"Academy — Coming 2027", What's-Happening section + toggle buttons present, Building section shows "110 × 60", Getting Here map svg present, signup strip visible; conditional — if `[data-so-register-cta]` present its href matches `/register/`. Toggle click flips to the fall list (click-driven, waitForHydration first).
- Verification gate: tsc, full units, build, targeted e2e (worthington + home + brand-skin), live curl + browser drive incl. video elements, THEN merge `origin/main` (after #376 lands), re-verify, PR with body noting header/footer copy corrections and the early-bird date gate.

## Deferred
- Downtown page gets the same structural treatment in a follow-up (this branch only corrects its false copy).
- Exact futsal court count when the founder confirms.
- Media strip pipeline automation (pull from an R2 media library) once the asset volume justifies it.
