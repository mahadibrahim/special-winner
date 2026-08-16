# Youth Leagues Redesign — Design

**Date:** 2026-08-16
**Branch:** `youth-leagues-redesign`
**Status:** Design approved; two content inputs outstanding (see [Open items](#open-items))

## Why

Youth launch is being pulled forward, and the youth section never received the
structural work that adult did. Adult leagues grew a four-tier funnel — category
page, sport landing, season page, division page — with content modules, a level
explainer, and structured data. Youth still dead-ends at a card grid one level
in. A former professional player has been hired as Director of Coaching, and
nothing on the site surfaces that.

Three specific defects the owner named:

1. Youth has no page that explains the product — only inventory.
2. "Leagues & Classes" is one navigation item covering two different products.
3. Age-group leveling is never explained, and the club structure we are matching
   uses birth-year registration, which parents routinely get wrong.

## The gap, concretely

| Tier | Adult | Youth (today) |
|---|---|---|
| Category | `/adult/leagues` | `/youth/leagues` ✓ |
| Sport landing | `/adult/leagues/soccer` — `LandingTabs`, current/upcoming/past terms, `LevelLadder` | none |
| Season | `/adult/leagues/soccer/[term]` — deadline timeline, price board, `SeasonTabs`, standings, venues, division mesh | none |
| Division | `…/[term]/[division]` | none |
| Content module | `src/lib/leagues/adult-soccer-content.ts` | none |
| Structured data | FAQPage, SportsActivityLocation, BreadcrumbList, per-division SportsEvent | none |

`src/pages/youth/leagues.astro` is 140 lines rendering a hero, facts band,
how-it-works strip, finder, calendar band and FAQ. There is no page below it.
`src/pages/youth/camps.astro` is thinner still — hero, finder, CTA.

## Decisions

### 1. Structure: age-first ladder, gender as a filter

Age is the one attribute a parent knows with certainty. Gender preference is not
always fixed, and the youngest bands are coed-only, so a gender-first tree would
send a parent of a five-year-old down the track they would least expect.

Gender still needs a ranking surface, so it gets standalone landing pages rather
than a route inside the funnel (decision 5).

### 2. Leagues explain structure; classes and camps explain coaching

The Director of Coaching does **not** appear on league surfaces.

In a league the parent is buying a season of games — competition, a schedule,
referees, standings. The coach who matters to them is their kid's team coach, a
name they learn in week one. In classes and camps there is no season and no
team; the entire purchase is instruction, so the person who designs that
instruction is the product being sold.

The three-stage developmental pathway moves with him. Once format claims were
removed (decision 4), the stages stopped describing the game and started
describing what kids work on — that is curriculum, and it belongs where
curriculum is sold.

League pages are left as fast, factual surfaces answering four questions: which
group is my kid in, what is open, when, and where.

**Consequence:** `/youth/classes` and `/youth/camps` are promoted from
afterthoughts to primary surfaces. They now carry the strongest trust asset the
organization has.

### 3. The ladder is static reference, not live inventory

The age ladder renders as server-side HTML carrying **group name and birth year
only**. It never reads live season data, so it cannot go stale, needs no island,
and is fully crawlable.

Tapping a band filters the divisions list below it. When a band has nothing
open, that list renders the notify form instead of divisions — capture is
preserved without coupling authored content to inventory.

The ladder covers the **full club structure from the youngest band up**,
including bands with no inventory. Empty bands are the point: they show the
program is a pathway, not a one-off.

### 4. No format claims in v1

No roster size, ball size, field size, or game length anywhere — not on band
cards, not in the ladder, not in the pathway.

The same age group may play indoor 6v6 at one venue and outdoor 11v11 at
another, so any format authored against a *band* is wrong as soon as a second
season exists. `seasons` has no format column today (verified: no `format`,
`teamSize`, or `playerCount` field; `venues.indoor` is a boolean on the venue),
so anything shown would be hardcoded page copy that is expensive to correct.

If format is ever needed it belongs on the **division row**, sourced from a
nullable `format` column on `seasons`. That column is **not** added in v1. Add
it when a season genuinely needs to distinguish itself from another at the same
age.

### 5. URLs mirror adult; gender ranks via standalone landings

Adult occupies `/adult/leagues/soccer/[term]`. Putting `girls` in that same
segment makes a static route and a dynamic route share one slot, turning every
future term slug into a reserved word with a silent failure mode.

Youth therefore reuses adult's route shape exactly, so `SeasonTabs`,
breadcrumbs, JSON-LD and division links port with a `basePath` swap rather than
a rewrite. Gender gets its ranking surface as a standalone landing page,
following a pattern already shipped three times
(`/adult-soccer-leagues-columbus`, `/adult-flag-football-columbus`,
`/adult-soccer-leagues-[suburb]`).

### 6. Navigation splits into Leagues / Classes / Camps

`src/components/navigation.tsx` currently lists `Leagues & Classes` and `Camps`
under Youth. It becomes three items.

`/youth/leagues` today renders `programTypes={["league","training","clinic"]}`
— one finder serving two products. Leagues keeps `["league"]`; a new
`/youth/classes` takes `["training","clinic"]`. The leagues URL does not move,
so no redirects are required.

### 7. Products rotate by term, and the term page dresses itself

The two league products are not parallel audiences — they alternate with the
calendar:

| Term | Product | `signupModes` |
|---|---|---|
| Winter I / Winter II | Club teams, indoor, competitive conditions | `['team']` |
| Spring / Fall | Developmental — we build the teams and coach them | `['individual']` |

The product is already derivable from data. **No schema change is needed.** A
term page reads its own `signupModes` and renders the matching framing:

- `['team']` — divisions by level, dates, team fee, rules, field specs, roster
  rules. No coaching narrative; it is irrelevant to this buyer.
- `['individual']` — how teams get built, what a season looks like, age-band
  filter, register your kid.

Because offers rotate, **the ladder is the only permanent content** on the sport
landing page. That is what the page is about; inventory changes underneath it.

### 8. An evergreen club-entry page

Clubs book indoor winter time in the summer. Winter I registration opens in the
fall, so during the months a club director is actually shopping, the term page
either does not exist or carries no divisions — it cannot state level of play,
fee, rules or field, because none of it exists as data yet.

`/youth/leagues/soccer/team-entry` is live year-round and explains levels,
typical team fee, field specs, rules and roster policy, with interest capture
(`interest-capture.tsx`). When a club term is open it points at that term rather
than competing with it for the same query.

Parents do not need this — they decide a few weeks out, so a term page catches
them. This page exists specifically for the long-lead buyer.

### 9. Season and division pages are core scope

Adult's `[term].astro` is the highest-converting surface in that tree. Youth
gets the same tier rather than deferring it.

## Sitemap

| Route | Status | Notes |
|---|---|---|
| `/youth` | changed | Hub goes from 2 doors to 3 — Leagues, Classes, Camps |
| `/youth/leagues` | changed | Sheds `training`+`clinic`; leagues only |
| `/youth/classes` | new | Takes `training`+`clinic`; carries pathway + Director of Coaching |
| `/youth/camps` | changed | Gains pathway + Director of Coaching |
| `/youth/leagues/soccer` | new | Sport landing — ladder, divisions, the year |
| `/youth/leagues/soccer/team-entry` | new | Evergreen club-facing page |
| `/youth/leagues/soccer/[term]` | new | Season page, dual framing from `signupModes` |
| `/youth/leagues/soccer/[term]/[division]` | new | Division leaf |
| `/youth-soccer-leagues-columbus` | new | SEO landing |
| `/youth-girls-soccer-columbus` | new | Girls-soccer ranking asset |

## Page composition

### `/youth/leagues/soccer`

1. **Hero** — "Youth soccer at Aspire. Ages 4 to 19." Current term status.
2. **The ladder** *(new, permanent, static)* — full club structure, group +
   birth year. Copy explains that clubs group by birth year rather than school
   grade, so classmates can land in different groups. Tapping a band filters
   section 3.
3. **Open now** — `CategoryFinder`, filtered by the tapped band. Empty band
   renders `empty-notify-form` instead.
4. **The year** — `SeasonCalendarBand`, showing which term is which product.
   Primary content, not a footer band.
5. **Where you'll play** — venue cards → `/locations/[slug]`. Ported from
   adult's `[term].astro`, which added it after replays showed people leaving to
   research venues and not returning.
6. **Parent FAQs** + FAQPage JSON-LD — rewritten for youth: birth-year
   confusion, will my kid know anyone, siblings playing together, refunds.

### `/youth/classes` and `/youth/camps`

1. **Hero** — coaching, not competition.
2. **The pathway** *(new)* — three developmental stages, youngest through
   oldest. What kids work on at each stage.
3. **Director of Coaching** *(new)* — signature band directly under the
   pathway, since he authors it. Bio, playing career, method. Room for the
   Double-Goal Coach and ELM framing already referenced on `/youth`.
4. **Open now** — `CategoryFinder` over the relevant program types.
5. **How a session runs** + FAQs.

### `/youth/leagues/soccer/[term]`

Ported from `src/pages/adult/leagues/soccer/[term].astro`, which already
handles: live + completed season fetch (so a wrapped term stays indexed as a
standings archive rather than redirecting away), earliest-deadline aggregation
across divisions, early-bird-aware price board, `SeasonTabs`, per-division
crawlable links, and the venue section.

Youth-specific changes: framing switches on `signupModes`; the divisions finder
filters by age band rather than skill tier.

## Code changes beyond new pages

- **`src/lib/leagues/division-slug.ts`** — `GENDER_SLUG` covers
  `coed | mens | womens`; youth needs `boys | girls | coed`. `tierPart()` keys
  off `skillLevel` and a 30+ age qualifier; youth needs the age band. Most
  importantly `divisionNaming()` **hardcodes the word "Adult"** into every SEO
  title. Generalize with an audience parameter rather than forking the file.
- **`src/lib/leagues/youth-soccer-content.ts`** *(new)* — the youth counterpart
  to `adult-soccer-content.ts`. Holds age bands, pathway stages, rule sections
  and FAQ. Note `LevelLadder` imports `SKILL_LEVELS` directly from the adult
  module; the youth ladder is a separate component reading this one, not a reuse
  of `LevelLadder`.
- **`src/components/navigation.tsx`** — three youth items (lines ~116–129).
- **`src/pages/youth/leagues.astro`** — narrow `programTypes` to `["league"]`.
- **Shared season components** — `SeasonTabs`, `LandingTabs`, breadcrumb and
  JSON-LD helpers need a `basePath` / audience parameter so youth reuses rather
  than copies them.

## Out of scope for v1

- All format claims, and the `seasons.format` column that would back them.
- Live status on the ladder.
- A `/youth/leagues/soccer/girls` route — gender is a filter; the standalone
  landing page is the ranking asset.
- Sports other than soccer. Basketball and multi-sport stay "coming soon" tiles.

## Open items

Both are content inputs, not design questions. Neither blocks planning; both
block build.

1. **The pathway stage names.** Working placeholders are "First touch / The game
   opens up / The real thing." The Director of Coaching's name sits on this
   section — if he already uses language with parents, his words should win.
2. **The actual age bands and seasonal-year cutoff.** Design work assumed U6–U19
   against a 2027 seasonal year (group = 2027 − birth year), which is the club
   standard. Confirm the bands actually being run and the cutoff date. The
   ladder is static content, so wrong bands are worse than no bands.
   `age_groups` already has a `birthDateCutoff` column to hold this.

## Phasing

**Phase 1 — the league funnel.** `/youth/leagues/soccer` with the ladder,
divisions finder and the year; `[term]` and `[term]/[division]` pages; the
navigation split. `/youth/classes` ships here as a working finder page — the new
nav item links to it, so it cannot be a stub — but without the pathway or coach
content. This is where launch pressure sits and it ships on its own.

**Phase 2 — the coaching surfaces.** Pathway and Director of Coaching added to
`/youth/classes` and `/youth/camps`. Gated on open item 1.

**Phase 3 — long-lead and search.** `/youth/leagues/soccer/team-entry` and the
two SEO landing pages.

## Verification notes

- `src/pages/youth.astro` maps legacy age-band anchors (`#ages-4-8`,
  `#ages-9-12`, `#ages-13-18`) to `/youth/leagues`. Preserve or update that
  mapping — those are pre-Phase-2 bookmarks.
- Youth E2E specs run **post-merge only** via `test-full`, so they will not gate
  the PR. Grep `tests/e2e/` for specs touching `/youth/**` before merging and run
  the affected specs locally.
- Any `findFirst` / `.limit(1)` added on the youth path needs an explicit
  `orderBy` — the CI database accumulates orgs across runs.
- New pages are SSR (no `prerender`) — they read request-time organization
  context and live catalog data.
