# Youth soccer leagues — two-path page (design)

**Date:** 2026-08-18 · **Status:** approved by owner ("We can proceed to build")
**Mockup (source of truth):** `2026-08-18-youth-leagues-two-path-mockup.html`
**Supersedes** the leagues portion of the band-grammar recompose built earlier
on `youth-leagues-v2` (commit e07391ec) — that shipped composition is the
starting point; this spec is the owner-directed iteration of it.

## Goal

The leagues page must sell the product the way Arena Sports' youth page does:
name it in the hero (indoor youth soccer leagues), split it into the two
player types up front, publish the commitment facts parents decide on, give
club teams a real path, and put booking links directly on the page — fewest
clicks possible.

## Owner decisions (this iteration)

1. **Soccer-focused.** No multi-sport picker composition. The page is the
   youth *soccer* leagues page. Futsal survives as its own page and a quiet
   crosslink; basketball interest routes to the calendar notify capture.
2. **Routing.** The composition lives at `/youth/leagues/soccer` (the shared
   `youth-sport-league-page.astro` body, so futsal inherits the same shape
   with its own hero copy). `/youth/leagues` 302-redirects to
   `/youth/leagues/soccer` "for now" — temporary by intent; the URL stays
   reserved for a future multi-sport picker when a second league sport is
   real. All inbound links to `/youth/leagues` keep working via the redirect.
3. **League-type labels.** *Competitive* and *Developmental* — never "Winter"
   as a type name. Winter is the season competitive leagues run in
   (**Nov – late March**, owner-corrected). Maps 1:1 to the existing
   `competitive*/developmental` season-level vocabulary in the catalog.
4. **Two types, two audiences:** Competitive = club teams entering whole
   teams (site team-registration flow — the captain reserve + roster-split
   the adult side proved; season carries `teamPriceCents`). Developmental =
   individual players; we build the teams.
5. **Commitment facts** (Arena-copy placeholders, owner: "copy Arena for
   now. We can adjust later") — single authored constant, one edit to
   change: 1 game/week · no required practices · 6–10 games/season ·
   45–50 min games (varies by league) · Sat & Sun 7am–8pm · indoor.
6. **Scarcity is a theme:** top deadline banner, "claim your winter spot —
   divisions fill fast" strip in the competitive card, per-division
   "N team spots left" (only when capacity is real — honest counts, never
   decorative).
7. **Direct booking everywhere:** division rows with Book/Enter-team
   buttons inside the two type cards, and the full division table in the
   red band's sheet. The table replaces the card-grid finder on this page.
8. **Age lookup is available, not prominent:** one compact row at the top of
   the booking sheet (month/year born → group), filtering the table rows.
   The full 14-band ladder leaves this page.
9. **Full-width text (standing rule, owner):** no max-width measure caps on
   ledes/subheads/notes — paragraphs span the content column. Amend
   `docs/adult-design-reference.md` §2 and `docs/design-system.md` accordingly.
10. **Venues:** commitment band "Where" fact renders horizontally with links
    to both location pages; "Where you'll play" section keeps the venue
    cards. Highway access claim ("easy on and off I-270 and I-71") goes into
    `venue-facts.ts` — the only facility-claims source.

## Page composition (top → bottom)

1. **Deadline banner** — full-width brand-red bar above the hero: live term
   facts (name, start, registration deadline) from the catalog + authored
   copy shell + "Claim your spot →" CTA to `#open`. Renders only when an
   open term exists (replaces the old in-hero now-registering banner;
   `data-testid="now-registering"` moves here).
2. **Hero** — emerald-graded photo, "Indoor youth soccer leagues." (futsal:
   its sport name), subhead naming both paths, then the two in-hero path
   tiles (royal club / emerald individual → `#types`). Crosslink line:
   commitment one-liner + "Also at Aspire: youth futsal →".
3. **Jump bar** — League types · Book now · The commitment · Club teams ·
   League info · Venues · Calendar · FAQs.
4. **League types** (`#types`) — two toned cards (royal Competitive /
   emerald Developmental) with kicker (season window), body, scarcity strip
   (competitive only), and **inline division rows** (top ~3 open divisions
   each, live) with direct Book/Enter-team buttons; "All divisions ↓" link
   to `#open`.
5. **Book** (`#open`) — red flood "Every open division." + live one-liner;
   overlapping paper sheet contains: age-lookup row → filter chips
   (All / Competitive / Developmental / age buckets) → **division table**
   (one row per open division: age group + level badge, season name +
   spots-left, day & start, price with per-team/per-kid unit, CTA). Team
   seasons show "Enter team →" (royal), individual "Book →" (red).
6. **The commitment** (`#commitment`) — paper facts band, the six authored
   facts; "Where" fact links both venues; footnote covers schedule delivery
   + move notifications + highways.
7. **Club teams** (`#teams`) — "Bringing a whole team?" split: promise
   bullets (fee-splitting, schedule before week 1, weekends only) + navy
   card ("Spots go fast. Claim yours.") with Enter-team CTA and an email
   fallback.
8. **League info** (`#info`) — resource cards. Ships with the two real
   ones: Schedules & standings (term pages), Refund policy. Rules &
   regulations and Reschedules & weather are **held back until owner
   supplies content** — no stub pages, no invented policy.
9. **Venues** (`#venues`) — "Where you'll play." two venue cards from
   `venue-facts`, highway line in the lede.
10. **How it works** (`#how`, unlabeled in jump bar is fine) — numbered navy
    band, 3 parent steps (unchanged copy).
11. **Calendar** (`#calendar`) — existing SeasonCalendarBand island; term
    cells labeled competitive/developmental; notify capture (also the
    basketball-interest target).
12. **FAQ** (`#faq`) — existing five questions. Club-team FAQs (team entry
    mechanics, mid-season joins) deferred pending owner policy.
13. **Close** — navy band, two CTAs (Book now → `#open`, Competitive team
    entry → `#teams`).

## Data & implementation contracts

- **Everything priced/dated is live catalog data.** Mockup figures ($1,150,
  $195, Nov 8, "3 team spots left") are samples. Prices come from
  `teamPriceCents` / individual price on seasons; spots-left only when the
  season surfaces capacity. Never author dollar figures.
- **Division table + inline rows** = new compact variant of the youth
  finder (same `/api/public/seasons` data + `filterYouthSeasons`), rendered
  as rows. Competitive/developmental badge derives from the season's level
  vocabulary. Keep the empty state = banded notify capture.
- **Age lookup row** reuses `resolveAgeGroup` + the `aspire:finder-filter`
  event; it filters table rows (sets the age filter the chips also use).
- **Deadline banner** is server-rendered from the same term fetch the page
  already does (crawlable link into the term funnel — preserve the SEO role
  and analytics of the old banner; keep `trackLandingCtaClicked`).
- **Edge cache** contract unchanged: `setMarketingEdgeCache` only after a
  successful catalog fetch.
- **LEAGUE_KINDS** relabel (Competitive/Developmental, Nov–late Mar) — its
  other consumers (`/youth` hub, classes cross-promo) get the same corrected
  vocabulary; check them when editing.
- **Copy constants** for facts/banner shell live in one authored block in
  `src/lib/youth/` (owner edits in one place).
- **`/youth/leagues` redirect**: 302 in the page frontmatter (SSR), keeping
  the canonical on `/youth/leagues/soccer`.

## Testing

- Rewrite `tests/e2e/youth-leagues.spec.ts`: ladder-band tests (14
  `data-age-band`s) are obsolete on this page → replace with lookup-row
  filtering tests; banner testid moves to the top banner; unknown-sport
  redirect now lands on `/youth/leagues/soccer` (via `/youth/leagues`).
- `tests/e2e/category-pages.spec.ts` `/youth/leagues` test asserts the
  redirect + soccer page renders.
- Keep the "no format claims" guard test; 45–50 min game length is a fact,
  not a format claim (it's authored, allowed).
- Post-merge `test-full` hang (6h install-deps stall, 2026-08-18): CI
  hardening (job + step `timeout-minutes`) rides in this PR.

## Out of scope (tracked, not built now)

- Rules & regulations page, reschedule/weather policy, club-team FAQ
  answers — all owner-content-blocked.
- Classes rate card (#565), sport-scoped classes URLs (#564), camps/hub
  recompose — later Phase 2 queue items.
