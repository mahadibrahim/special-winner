# Adult 4v4 Flag Football — Landing Pages + Catalog Launch (Design)

**Date:** 2026-07-28
**Status:** Approved by owner (brainstorming session)
**Goal:** Launch adult 4v4 flag football at Worthington with real, sellable registrations for Winter 1, on pages that conform to the existing adult-league sport pattern and start outranking Stars Indoor Sports (starsindoorsports.com/flag-football) for Columbus flag-football searches.

## Background and rationale

- Stars Indoor Sports (6124 Busch Blvd, Columbus) runs indoor 6v6 flag on 185×84 ft fields ($1,050/team, $110 individual, Sundays, 8 games). Their page is dated but indexed and unchallenged locally.
- Our Worthington fields are 110×60 ft (~37×20 yd). Width caps the format: **4v4** is the right fit. Precedent: the NFL Blitz indoor rulebook specifies 4v4/3v3 on fields of max 25×20 yd — our fields *exceed* that spec, which becomes a marketing point, not an apology.
- Owner decisions from the session:
  - **Brand:** Aspire (`aspiresportsohio.com`). SoccerOne stays soccer-only.
  - **CTA state:** Sell registrations from day one (not interest capture).
  - **Divisions:** Men's + Coed.
  - **Term alignment:** Follow the soccer winter terms — Winter 1 (Nov 9, 2026 – Jan 17, 2027) first, Winter 2 (Jan 18 – Mar 20, 2027) shown as upcoming.
  - **Night:** Wednesdays (winter soccer occupies Mondays only at Worthington).
  - **Format:** 8 games, roster 6–10.
  - **Pricing:** $795/team · $105 individual · $200 non-refundable deposit (`per_team` pricing mode, team + individual signup modes). Early-bird, if used, is team-only per existing league policy.

## Pattern conformance (core constraint)

The site has an established adult-league sport pattern. This build follows it exactly; the only structural change is a **wholesale generalization** applied to soccer too, never a flag-only fork.

Pattern pieces reused as-is (already sport-generic):

- `/api/public/seasons?sport=<slug>&audience=adult` — data source
- `src/lib/leagues/terms.ts` — term partitioning (current/upcoming/past)
- Registration wizard — team + individual signup per season
- Analytics events (`trackLandingTabViewed`, `trackLandingCtaClicked`, `trackCatalogSportTileClicked`) — already parameterized by sport
- `/sports/[slug]` — auto-serves `/sports/flag-football` once the sport row exists

## 1. Routes

- `src/pages/adult/leagues/flag-football/index.astro` — landing page mirroring `adult/leagues/soccer/index.astro`: hero with keyword-targeted copy, "Now Registering" banner when a current term is open, format-facts line, tabbed body (Overview / This Season / Upcoming / Past). SSR, no prerender flag.
- `src/pages/adult/leagues/flag-football/[term].astro` — per-term division cards + registration CTAs, mirroring soccer's `[term].astro` (fetch with `sport=flag-football`; redirect to the landing page when the term has no seasons).
- **No** top-level `/flag-football` route.

Page title pattern: "Adult Flag Football Leagues — Indoor 4v4 in Columbus | Aspire Sports" (landing); `[term]` follows soccer's `${termLabel} Adult Flag Football` shape.

## 2. Content module

`src/lib/leagues/adult-flag-football-content.ts`, mirroring `adult-soccer-content.ts` slot for slot:

- `FORMAT_FACTS`: 4v4 all-receiver format · 8-game season · roster 6–10 (4 to play) · 7-second pass clock · boarded climate-controlled turf, bigger than NFL Blitz indoor spec · certified refs.
- `RULE_SECTIONS` (NFL Blitz-style indoor kit): The game (no QB runs; handoffs/pitches/laterals behind the line only; 7-second pass clock; no diving; flag pulls, no contact). Coed rules (default for season one: at least 1 female player on the field at all times; females may sub for males, not vice-versa — mirroring the soccer coed convention scaled to 4v4; owner may adjust in the league guide before registration opens). Conduct & safety. Roster & standings ($200 non-refundable deposit · paid in full by game 1 · roster locks after game 3 — reuse soccer conventions where sensible).
- `FAQ`: no-team/free-agent path, payment/deposit, "why 4v4 instead of 6v6" (field-spec story vs Stars, without naming them), what to wear/bring, coed rules.
- `WHY_4V4` value props (replaces soccer's `WHY_INDOOR` slot): more touches — everyone's a receiver every play; faster games; boarded field, ball never dies; smaller roster = cheaper per player than any 6v6 league in town; year-round indoor.
- **Deviation (deliberate):** no `SKILL_LEVELS` / `LevelLadder` — season one divisions are Men's + Coed, not A–D tiers. The Overview renders a divisions explainer instead. Revisit tiers when demand supports them.
- Copy source of truth: new `docs/sports/adult-flag-football-leagues.md` league guide (analog of `docs/sports/adult-soccer-leagues.md`), including the finalized coed rule wording.

## 3. Component generalization (the wholesale update)

`src/components/leagues/soccer-landing-tabs.tsx` hardcodes soccer content imports and `sport: "soccer"` analytics. Generalize to `src/components/leagues/landing-tabs.tsx`:

- Props: sport slug (for analytics + CTA hrefs), content object (`whyProps`, `ruleSections`, optional ladder/divisions block, overview copy), plus the existing current/upcoming/past term props.
- **Update the soccer landing to use the generalized component.** Identical rendered UI for soccer; one code path for both sports. Delete the old component (no shim).
- Keep `useHydrationBeacon()` (component is `client:load` — e2e hydration convention).

## 4. Catalog rows (sell-now)

Created in the admin UI (no seed scripts, per repo policy):

- Sport: `flag-football` ("Flag Football").
- Program: "Adult 4v4 Flag Football League" — `programType: league`, `audienceType: adults`.
- Age group: one "Adult" row (18–99). Division identity comes from `divisionGender` on each season (`men` / `coed`), exactly as soccer does — no per-division age-group rows.
- Seasons (all: Worthington location, `dayOfWeek: wed`, `per_team`, teamPrice $795, price $105, deposit $200, allowDeposit, signupModes [team, individual], 8 games noted in scheduleNotes/name):
  - Winter 1 2026-27 — Men's (open) — term `winter-1-2627`, Nov 9 – Jan 17 window
  - Winter 1 2026-27 — Coed (open) — same term/window
  - Winter 2 2027 — Men's (upcoming) — term `winter-2-2027`, Jan 18 – Mar 20
  - Winter 2 2027 — Coed (upcoming) — same term/window
- Registration close date: owner sets in admin (soccer convention ≈ 11 days before start).
- **Verification task:** confirm the admin UI can create a new *sport* row. If it cannot, add that capability to the admin (small, conforming) rather than any one-off script.

## 5. SEO

- JSON-LD on the flag landing: `FAQPage` + `BreadcrumbList` + `SportsActivityLocation`, reusing the builder approach already on `/sports/[slug]`. **Applied to the soccer landing too** (wholesale, not flag-only).
- Sitemap: add `/adult/leagues/soccer` and `/adult/leagues/flag-football` to `ASPIRE_SSR_PUBLIC_PAGES` in `src/lib/seo/aspire-sitemap-pages.mjs` (neither is listed today).
- Meta description targets: "adult flag football league Columbus", "indoor flag football", "4v4 flag football", Worthington.

## 6. Site integration

- `/adult/leagues` hub: add a live Flag Football tile (style of the live Soccer tile; basketball/volleyball stay coming-soon). Wire `data-sport-tile` analytics.
- `/about`: correct "Flag football follows in 2027" copy (multiple occurrences) to reflect the Winter 1 launch.
- `/sports` index: no work — DB-driven, picks up the new sport automatically.

## 7. Testing

- Unit: content-module shape test in `tests/unit/` (sections non-empty, FAQ well-formed) matching whatever convention exists for soccer content (add for both if none).
- E2E hazard: grep `tests/e2e/` for specs exercising `/adult/leagues`, the soccer landing, and `data-testid="now-registering"` — the generalization touches soccer's page and full Playwright runs only post-merge. Update or run affected specs locally before merge.
- API: none needed (no API changes).
- Standard pre-push checklist applies; no schema changes anticipated (catalog rows are data, not schema).

## Out of scope

- Youth flag football (2027 per existing plan).
- Skill tiers / A–D ladder for flag.
- One-direction-per-possession format variant (kept in reserve for the narrow Downtown field; not needed at Worthington since fields exceed NFL Blitz two-end-zone spec).
- Downtown flag football.
- Any SoccerOne-side page beyond (optionally, later) a cross-link.
- Paid ads / GTM work for the launch.
