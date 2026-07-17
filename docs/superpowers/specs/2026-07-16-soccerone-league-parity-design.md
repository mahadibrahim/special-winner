# SoccerOne league funnel — parity with Aspire

**Date:** 2026-07-16
**Status:** Draft — awaiting approval
**Branch:** `worktree-soccerone-league-parity`

## Why

Both brands serve the **same 13 league seasons from the same org**. `gosoccerone.com`
maps to `aspire-sports` in prod; the `soccerone` org is vestigial (0 seasons). This is
the documented design — see the header of `src/lib/organization/soccerone-routing.ts`:
*"SoccerOne is a brand skin, not a tenant... Single-org cutover, 2026-06-11."*

Aspire's league flow has been through several conversion rounds. SoccerOne's was
hand-rolled separately and got none of them. Identical inventory, two templates, one of
which converts. This spec closes that gap.

### Verified against prod (read-only), 2026-07-16

| Fact | Value |
| --- | --- |
| `gosoccerone.com` → org | `aspire-sports` |
| Live seasons | 13, all `status='open'`, term `fall-2026` |
| `division_gender` populated | 13 / 13 |
| `skill_level` populated | 10 / 13 (the three 30+/40+ age divisions are null by design) |
| `teams` / `games` on live seasons | 0 / 0 |
| Future terms | `winter-1-2627`, `winter-2-2027`, `spring-2027` — 22 seasons each, **all `draft`** |
| Fall registration closes | 2026-09-03 |

> **Staging is misconfigured and must not be used to validate this work.** Staging maps
> `gosoccerone.com` to a separate `soccerone` org carrying 8 fixture seasons with
> `skill_level`/`division_gender` null — the retired Phase-1 two-org model. Any
> conclusion drawn from the SoccerOne page on staging or local is measuring an org that
> serves no prod traffic. **Fixing the staging domain mapping is a prerequisite for
> meaningful QA** (see Task 0).

## The decisions in plain English

Read this before the technical sections. Approved by the owner 2026-07-16.

**1. How season pages get their web addresses.** The SoccerOne site works off a fixed
list of ten known pages (home, leagues, rent, pickup…). Season pages like
`/leagues/fall-2026` don't fit that list, because seasons never stop coming — winter,
spring, next fall. Adding each one by hand means a developer and a deploy for every
season, forever. Instead we add **one rule**: "anything shaped like `/leagues/<something>`
is a season page." Written once, works for every season we ever run. The catch: that
list also sends stale links back to the right place, and it's built so those two
directions can never disagree. The new rule must keep that guarantee — hence the
round-trip test.

**2. What gets reused vs. rebuilt.** Aspire's pages are cream; SoccerOne's are
near-black. Dropping Aspire's visual pieces onto SoccerOne makes them unreadable (this
has already caused one production incident). But underneath the visuals is *reasoning*
with no colour: how to bundle seasons into a term, which season counts as "current",
how to compute a league table. **Reuse all the reasoning; rebuild only the appearance.**
Standing rule: if the reasoning needs to change, change the one shared copy so both
brands get it. Never fork — forking is how these two sites drifted apart to begin with.

**3. The "email me when it opens" box.** This is not a port. **Aspire's version doesn't
work**: the link points at a spot on the page that doesn't exist, and the button sends
the wrong kind of request, so it errors. Copying it would ship the same broken thing to
a second brand. Build one that works, use it in both. It covers three moments — an
upcoming season, a search with no results, and a division that isn't open yet. All three
are people saying they want to pay you at a time when you can't take their money.

**4. Why staging gets fixed first (Task 0).** The test environment still believes
SoccerOne is a separate business with its own leagues. The real site knows it's the same
business wearing a different jacket — that changed in June 2026; staging never got the
memo. So the SoccerOne page on staging shows fake leagues from a dead account. **This
fooled the author of this spec for half a day** and produced a wrong recommendation.
Until it's fixed, we cannot check our own work before customers see it.

**5. What we're deliberately not touching.** The winter/spring seasons (66 of them) sit
in `draft`. The site correctly refuses to show drafts — they carry prices and dates that
haven't been announced. Flipping them is **one field per season and an owner decision**,
not a code change. But it's what makes the "Upcoming" tab worth having, and fall
registration closes 2026-09-03; after that the page needs somewhere to send people.
Also untouched: the leftover empty `soccerone` org in prod, and exact per-division game
times.

## The gap, precisely

Aspire asks five questions in sequence; SoccerOne asks two:

```
Aspire      /  →  /adult/leagues  →  /adult/leagues/soccer  →  /[term]  →  /register/{id}
                  (which sport?)     (which season?)           (which     (pay)
                                                                division?)

SoccerOne   /  →  /leagues ─────────────────────────────────────────────→  /register/{id}
                  (everything at once: all terms, all divisions, flat)
```

SoccerOne does **not** need the sport tier — it is a single-sport brand. The one
structural gap is the **season tier**: where off-season interest capture, the
"Now Registering" guardrail, and past-season proof live.

The craft worth preserving is in the guardrails, not the components:
`partitionTerms` deliberately rejects `resolveCurrentTerm`'s fallback so a `forming`
season can never be labelled "Now Registering"; `statusRank` makes the hero advertise
the most convertible status; empty terms redirect rather than dead-end. These are
properties of *having tiers*. They cannot be bolted onto a flat catalog.

## Design decisions

### 1. Routing — `/leagues/{term}` (the load-bearing decision)

`SOCCERONE_MARKETING_REWRITES` is an **exact-match `Record<string, string>`**. Term
slugs are dynamic (`fall-2026`, `winter-1-2627`, …), so a table entry cannot express
the new route. Three functions in `soccerone-routing.ts` are affected, and the inverse
map `SOCCERONE_LONG_TO_SHORT` is *derived* from the table — so a naive addition breaks
the "cannot drift apart" invariant the file guarantees.

**Decision:** keep the exact-match table as the source of truth for static marketing
roots, and add **one dynamic prefix rule** alongside it, expressed as a pure function
so it stays unit-testable with no dev server:

- `rewriteSoccerOnePath("/leagues/fall-2026")` → `/soccerone/leagues/fall-2026`
- `getSoccerOneCanonicalRedirect("/soccerone/leagues/fall-2026")` → `/leagues/fall-2026`

Constraints to honour:
- The rule must match **only** `/leagues/<single-segment>` — not `/leagues/a/b`, not
  `/leagues` itself (already in the table).
- Long→short and short→long must remain exact inverses (add a unit test asserting
  round-trip for both the static table and the dynamic rule).
- `getAspireToSoccerOneRedirect` already handles any `/soccerone/*` prefix, so the
  Aspire-host → canonical 301 needs no change.
- The rewrite uses `next()` (no middleware re-run), so no redirect↔rewrite loop —
  preserve that ordering: canonical-redirect check **before** the short-form rewrite.

**Rejected:** enumerating term slugs in the table (requires a code change per season —
exactly the kind of drift the file's header warns about).

### 2. Component split — share logic, re-skin shells

Per `docs/design-system-soccerone.md` and the BrandTheme inversion hazard, the
cream-idiom components go illegible on `--so-ink`. But their **logic is brand-neutral
and gets reused as-is**:

| Reuse unchanged (pure) | Re-skin (SoccerOne shell) |
| --- | --- |
| `partitionTerms`, `groupByTerm`, `resolveCurrentTerm` (`lib/leagues/terms.ts`) | `SoccerOneSeasonTabs` ← `season-tabs.tsx` |
| `filterDivisions`, `groupDivisionsByDay` (`lib/leagues/division-filters.ts`) | `SoccerOneLevelLadder` (make the existing `SoccerOneLeagueLevels.astro` interactive) |
| `computeStandings`, `rulesForSport` (`lib/leagues/standings.ts`) | `SoccerOneStandingsPanel` ← `standings-panel.tsx` |
| `RULE_SECTIONS`, `FAQ`, `SKILL_LEVELS`, `FORMAT_FACTS` (`lib/leagues/adult-soccer-content.ts`) | Schedule table (small — inline in the tabs component) |
| `formatDaySchedule` (`lib/time/format-date.ts`) | |

No new business logic. If a behaviour needs to change, change the shared pure function
so **both** brands get it.

### 3. Interest capture — build once, not a port

This is **not** a parity gap. Aspire's version is broken:

- `divisions-finder.tsx:85` → `href="#interest"`; **no `id="interest"` exists in the repo.**
- `registerHref()` returns `/api/public/season-interest?seasonId={id}` as an `<a href>`
  (a GET). `api/public/season-interest.ts` exports **POST only** and requires
  `{ seasonId, email }` in a JSON body → every "Notify me" click 405s.
- `division_register_clicked` fires with `mode: "interest"` before the dead navigation,
  so analytics show intent that structurally cannot convert.
- SoccerOne's empty state promises an email capture and renders only `[Clear filters]`.

**Decision:** one shared `InterestCapture` component (email field + POST to the existing
endpoint + success/error state), with a brand-neutral core and per-brand styling. It
serves three slots on each brand:
1. the **Upcoming** term tab,
2. the finder's **no-results** state,
3. any `forming` division's CTA (replacing `registerHref`'s dead GET).

Porting Aspire's current version would ship a dead link to a second brand.

### 4. Bug fixes (shared code — both brands benefit)

| Bug | Fix | Impact |
| --- | --- | --- |
| `filterSeasons` exact-matches level, hiding `open` divisions | mirror `filterDivisions`: `open` passes any level filter | `Fall 2026 — Women's Open` (`skill_level='open'`) currently vanishes from gosoccerone.com when any level chip is tapped |
| Venue pages drop location context | `worthington/index.astro:580`, `downtown/index.astro:566` → `/leagues?location=<slug>` | Finder already reads `?location=`, seeds the filter, and renders the "Showing leagues at X / clear ✕" chip. **Zero producers exist today.** Sibling `/pickup?facility=` and `/rent?facility=` already do this |
| `[term].astro:74-75` hero CTAs are inert (`href="#main-content"`) | carry solo/team intent into `ChooseMode` | Aspire-side; the fork it promises isn't honoured until two tiers later |
| Hero "Now Registering" banner untracked (`soccer/index.astro:42-47`) | add `trackLandingCtaClicked` | Aspire-side; tier4→5 conversion is undercounted with no visible split vs its Overview-tab twin |
| `program-card-v2` emits `?mode=individual`; `/register/[seasonId]` never reads it | read it or stop emitting it | Aspire-side; decide which at implementation |

### 5. Analytics

Add to the SoccerOne funnel (events already exist in `lib/analytics/events.ts`; the
components simply don't import them):

- `trackSeasonViewed` on the new season tier
- `trackDivisionFilterApplied` in `SoccerOneLeaguesFinder` (all four facets)
- Term-level CTA tracking on the SoccerOne home → `/leagues` handoff. Today, in the
  normal multi-division `heroMulti` state, **the homepage fires zero league events** —
  the funnel only becomes observable at `/leagues`.

## Invariants to preserve

These are shipped decisions. Do not regress them during the re-skin:

1. **Day on the card.** `LeagueCard` renders `DAY · {formatDaySchedule(...)}` →
   `"Wednesdays · 6–11pm"`. Shipped in `e0b96d44`. The day header groups; the card
   still states its own day and time. Where `start_time` is null it degrades to
   `"Mondays"` — **do not synthesise a time.** (League games run 6–11pm depending on
   day; per-division slot times are a later refinement, explicitly out of scope.)
2. **The banner is never a lie.** No "Now Registering" over a `forming` or past season.
   Banners vanish when nothing is open rather than going stale.
3. **No dead CTAs.** A `#` href or a dead button is worse than no button — the existing
   SoccerOne page comments say exactly this.
4. **The API never surfaces `draft`.** It carries unannounced pricing/dates. Do not
   relax `PUBLIC_STATUSES`.
5. **Brand-skinned booking stays SSR.** Prerendering bakes `data-brand="aspire"` at
   build time (`BaseLayout.astro:10`). The new season tier must not be prerendered.
6. **Waiver entity is per-brand.** `themes.ts` owns it; never hardcode a brand name in
   the React tree.

## Deviations discovered during implementation

1. **FAQ block:** Phase A is docs-only — `faq-block.astro` / `faqPageJsonLd` do not
   exist yet, and building them here would collide with that in-flight branch. The
   SoccerOne FAQ/Rules tabs render the shared content constants inline (exactly as
   Aspire's season-tabs does today). **Follow-up:** when Phase A lands, migrate BOTH
   brands' FAQ tabs onto `faq-block.astro` (noted in SoccerOneSeasonTabs.tsx).
2. **Hero dual-CTA mode carry:** at term level there is no single seasonId, so "carry
   solo/team intent into ChooseMode" is not implementable as stated — you pick a
   division before a mode. Implemented as: hero CTAs anchor to `#divisions` (a real
   anchor now, on both brands) + fire `trackLandingCtaClicked`. The mode hint IS
   carried where a specific season exists: `/register/[seasonId]` now reads
   `?mode=individual|team` (program-card-v2 already emits it), server truth
   (`canTeam`) still wins over the URL.
3. **Task 0 scope:** the staging two-org fixture architecture is deliberate (e2e
   determinism on a shared CI DB — the seed's own comments acknowledge prod is
   single-org). The misconfiguration fixed here is the fixture **data shape**: the
   SoccerOne fixture seasons now carry `divisionGender`/`skillLevel` matching what
   their names imply (incl. `Women's Open → 'open'` and `Co-Ed 30+ → null`, giving
   the two filter rules e2e coverage). The stale staging `gosoccerone.com →
   soccerone-org` domain_mappings rows are manual data, not seed-managed — they
   should additionally be repointed at the staging aspire org or deleted (one-time
   SQL, listed as a release step, not code).

### Post-ship reversal (2026-07-16, owner feedback)

Deferring the answer/SEO content was judged a mistake — "those tabs help SEO and
answer people's questions" — and the owner was right for a reason the deferral
analysis missed: **the tab panes are client-rendered, so non-default tabs aren't in
the crawlable HTML at all**, and a completed term used to redirect away, killing an
indexed URL. Shipped as a follow-up on the same branch:

- **Why-play band** on `/leagues` (shared `WHY_INDOOR` constants, SoccerOne skin,
  server-rendered — deliberately crawlable static HTML, not an island).
- **FAQPage JSON-LD** on the term page (hand-rolled, matching `sports/[slug]` /
  `locations/[slug]`; all three migrate to `faq-block.astro` when Phase A lands).
  This is the only crawlable copy of the FAQ answers.
- **Completed terms stay alive**: the term page now also fetches
  `?status=completed`, renders as an archive (tabs open on Standings, cards show
  "Season complete" with no register CTA, no SportsEvent markers), and
  `registerable` is open-status-only. Without this, `/leagues/fall-2026` — indexed
  today — would 302 to `/leagues` the day the season wraps.
- **Format facts in the term hero** ("Indoor 7v7 · … · 7-game season, no playoffs").

**Known residual:** Aspire's own `[term].astro` still redirects completed terms and
its tab panes have the same crawlability gap — it needs the identical treatment
before fall-2026 completes (early November 2026).

## Round 2 — structural parity (owner-approved 2026-07-16)

After seeing round 1 live, the owner's call: the two sites should share **page
anatomy**, not just capabilities. The term pages already match one-for-one; the
divergence is the catalog tier — Aspire's landing is a tabbed room-per-question
page, SoccerOne's `/leagues` stacked the same answers on one long scroll.

Restructure `/leagues` into Aspire's four-tab anatomy:

| Tab | Absorbs | Notes |
| --- | --- | --- |
| **Overview** | why-play cards + condensed rules + "find your level" pointer | Adult only — WHY_INDOOR copy (drinks etc.) is adult-voiced; youth skips this tab |
| **This Season** | featured banner + the finder (ladder, chips, day-grouped cards) | Cards stay cards (day-on-card, #406) — deliberate divergence from Aspire's rows |
| **Upcoming** | upcoming-terms band + interest capture | Count badge on the tab |
| **Past** | NEW — links completed terms to their archive pages | Empty state is a promise, per the banner-never-lies rule |

Constraints:
- **All panes render server-side** and toggle via `hidden` + a small inline
  script — crawlability is not given back (this makes SoccerOne's tabs *better*
  than Aspire's conditional-mount React tabs; port the pattern back to Aspire
  later).
- Initial tab is server-decided: `?location=` deep-links land on This Season
  (that's where the finder is); youth defaults to This Season; else Overview.
- `trackLandingTabViewed` fires on initial pane + every switch (Aspire parity).
- The ladder appears ONCE, in This Season as the filter — Overview points to it
  instead of duplicating it on the same page.
- e2e: `soccerone-leagues-finder.spec.ts` must select the This Season tab (or
  arrive via `?location=`) before driving chips — update in the same PR, runs
  post-merge only.

## Tasks

**Task 0 — unblock QA (prerequisite).** Fix the staging `domain_mappings` row so
`gosoccerone.com` → `aspire-sports`, matching prod and the single-org model. Without
this, nothing below can be verified before it ships.

1. Routing: dynamic `/leagues/{term}` rule + round-trip unit tests.
2. Shared `InterestCapture` component + wire the three slots on **both** brands; delete
   the dead `#interest` anchor and the GET-to-POST `registerHref` path.
3. `filterSeasons` open-level fix + unit test.
4. Venue page `?location=` hrefs (2 lines).
5. `SoccerOneSeasonTabs` shell: Divisions / Schedule / Standings / Rules / FAQ.
6. Interactive `SoccerOneLevelLadder`; drop the redundant flat Level chip row.
7. Rules + FAQ via Phase A's `faq-block.astro` (gives `FAQPage` JSON-LD free).
8. Analytics wiring (§5).
9. Aspire-side fixes from §4.

## Testing

- **Unit** (`tests/unit/`): routing round-trip (short↔long, static + dynamic);
  `filterSeasons` open-level; `partitionTerms` already covered — assert no regression.
- **API** (`tests/api/`): `season-interest` POST contract.
- **E2E** (`tests/e2e/`): SoccerOne specs run **post-merge only** (`test-full`), so they
  will not gate the PR — run affected specs locally before merge. Grep `tests/e2e/` for
  specs touching `/leagues` and update them for the new tier.
- **Browser, both brands.** Greps and `tsc` cannot see contrast or hydration. Verify the
  season tier renders legibly on `--so-ink` **and** that no Aspire page regressed.

## Out of scope

- Per-division slot times (the 6–11pm window is a later refinement).
- Moving the winter/spring terms from `draft` → `forming`. **This is a one-field admin
  action, not code — but it is what makes the Upcoming tab non-empty and the off-season
  demand capture pay off before 2026-09-03.** Flag to the owner; do not do it from here.
- Retiring the vestigial prod `soccerone` org (`active`, 0 seasons). It serves no
  traffic but anything resolving to it would render an empty catalog rather than
  failing loudly. Separate cleanup.
- Games/teams scheduling. Standings ships its designed pre-season state
  (*"Standings begin Week 1 — {date}"*) and fills in automatically once games exist;
  Schedule needs no games at all (it reads day/time off season rows).
