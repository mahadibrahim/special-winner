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
   uses birth-date registration, which parents routinely get wrong.

Two market facts shape the emphasis:

- **Nobody locally covers the youngest kids.** That is the wedge, not the
  on-ramp — copy and structure should not treat U6–U9 as a waiting room for
  real soccer.
- **Capacity favours going young.** Three boarded 110×60 turf fields (2 at
  Worthington, 1 at Downtown/OSU) across roughly 24 hours of weekend prime
  time. Small-sided pitches subdivide a 110×60 several times over and young
  games run shorter, so a field-hour sold to the youngest bands carries several
  times the teams of one sold to U14+.

Games are nevertheless offered at **every** age group; scheduling and capacity
get solved operationally rather than by narrowing the ladder.

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

The age ladder renders as server-side HTML carrying **group name and birth-date
range only**. It never reads live season data, so it cannot go stale, needs no
island, and is fully crawlable.

Tapping a band filters the divisions list below it. When a band has nothing
open, that list renders the notify form instead of divisions — capture is
preserved without coupling authored content to inventory.

The ladder covers **all fourteen groups, U6 through U19**, including bands with
no current inventory.

**Progressive-enhancement lookup.** A small "when was your kid born?" control
(month + year) sits above the table and highlights the matching row. This is
pure client-side date arithmetic against authored constants — it reads no
inventory, so it carries none of the staleness risk that ruled out a live
ladder. The static table renders and works with the control absent or JS off.

The lookup is justified by the 2026–27 rule change below: a birth *year* no
longer identifies a group, so a table alone asks every parent to do date
comparison in their head.

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

## Age groups — authoritative for 2026–27

**The system changed this season.** US Soccer mandated calendar-year grouping
from 2017 through 2025–26; that mandate was lifted in late 2024, and US Youth
Soccer, US Club Soccer and AYSO all moved to an **Aug 1 – Jul 31** seasonal-year
window beginning with 2026–27, to realign groups with school grade. We are
launching into the first season under the new rules.

| Group | Born between |
|---|---|
| U6 | Aug 1, 2020 – Jul 31, 2021 |
| U7 | Aug 1, 2019 – Jul 31, 2020 |
| U8 | Aug 1, 2018 – Jul 31, 2019 |
| U9 | Aug 1, 2017 – Jul 31, 2018 |
| U10 | Aug 1, 2016 – Jul 31, 2017 |
| U11 | Aug 1, 2015 – Jul 31, 2016 |
| U12 | Aug 1, 2014 – Jul 31, 2015 |
| U13 | Aug 1, 2013 – Jul 31, 2014 |
| U14 | Aug 1, 2012 – Jul 31, 2013 |
| U15 | Aug 1, 2011 – Jul 31, 2012 |
| U16 | Aug 1, 2010 – Jul 31, 2011 |
| U17 | Aug 1, 2009 – Jul 31, 2010 |
| U18 | Aug 1, 2008 – Jul 31, 2009 |
| U19 | Aug 1, 2007 – Jul 31, 2008 |

Verified against [US Club Soccer](https://usclubsoccer.org/registration-player-age-groups/)
and the [US Youth Soccer decision notice](https://www.usyouthsoccer.org/news/2025/06/10/updated-decision-on-age-group-formation/).

Two consequences for implementation:

1. **A birth year does not identify a group.** A player born in 2017 is U9 if
   born Aug–Dec and U10 if born Jan–Jul. Any lookup keyed on year alone is
   wrong half the time; the control takes month + year.
2. **These are authored constants, not derived.** Store them in
   `youth-soccer-content.ts` as explicit date ranges and roll them forward each
   seasonal year. Do not compute from `age_groups.minAge` / `maxAge`, which
   cannot express an Aug–Jul window. `age_groups.birthDateCutoff` can hold the
   Aug 1 boundary for any server-side validation that needs it.

**Framing opportunity.** Because the rule changed this season, many kids have
moved groups relative to last year — Aug–Dec births generally drop one, Jan–Jul
generally move up. The ladder should lead with that, not bury it. "The age
groups changed for 2026–27 — here's where your kid lands now" is a high-intent
question every local soccer parent has right now, and it is the same module
either way.

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

One remaining, and it gates Phase 2 only.

**The pathway stage names.** Working placeholders were "First touch / The game
opens up / The real thing." **Do not ship the last one.** If the youngest bands
are the wedge, a stage called "the real thing" tells the best customer their
kid is not yet playing real soccer. The Director of Coaching's name sits on this
section — if he already uses language with parents, his words should win, and
the naming should avoid implying the young end is preparatory.

Age bands are no longer open: see [Age groups](#age-groups--authoritative-for-202627).

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
