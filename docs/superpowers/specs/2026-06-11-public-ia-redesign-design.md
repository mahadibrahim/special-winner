# Public site IA redesign — design spec

**Date:** 2026-06-11
**Status:** draft — pending founder review
**Trigger:** product-designer review of the live site + fall/winter catalog landing the week of 2026-06-15

## Context

A product designer reviewed the live Aspire site and gave three pieces of feedback: (1) merge Sports/Adult/Youth into one browse surface with audience views (Airbnb-style), (2) the section-scroll layout on `/adult` and `/youth` won't scale as the card count grows, (3) consider splitting the marketing site from the booking site.

Two facts shape the response:

- **Aspire is a league brand, not a venue brand.** It will outgrow the current facility partner. Venue must therefore be a *filter*, never the page hierarchy. (SoccerOne is the opposite — a venue brand — and its existing facility-first IA is correct and untouched by this spec.)
- **The fall/winter catalog lands within a week of this spec.** The scale problem the designer flagged stops being theoretical, and category landing pages need lead time to rank for local search (stated leverage #1 in the business plan).

## Research basis (competitor analysis, 2026-06-11)

**Sofive (sofive.com — venue brand, 22 centers).** Audience-first nav (`ADULT ▾ / YOUTH ▾` dropdowns of activity pages). Activity × location URL matrix (`/adult-soccer-leagues/brooklyn`) — the strongest local-SEO machine observed. Location hub pages act as full per-venue catalogs. Weaknesses: hard handoff to `webapp.sofive.com` at the moment of commitment, zero pricing anywhere on the marketing site, sparse matrix cells 404.

**Heyday Athletic (heydayathletic.com — league brand, owns no venues).** Venue is a filter inside the league finder; region is the operational partition. Finder defaults to open registrations — their best trick. Sign-up mode (Individual / Small Group / Full Team) is first-class IA. Weaknesses: nav items that are homepage anchor links, a LeagueLab platform split that requires an illustrated "how to sign up" manual, thin shell sport pages, a 5-way regional login dropdown.

**Adopted:** audience-first nav split; audience × activity URL matrix; location hubs as catalogs; open-registrations-first sorting; price + day + deadline on every program card.

**Rejected:** marketing/booking site split (both comps pay a visible conversion tax at the seam; Astro already separates static marketing from SSR app internally — this also closes the designer's question 3 with a **no**); hidden pricing; nav-as-anchor-links; sport tiles as a top-level axis; age bands as pages.

## Target IA

```
/                      home — marketing + two audience CTAs
/adult                 thin hub: one screen, hero + 3 doors (URL unchanged)
/adult/leagues         category page · chips: Sport · Venue · Day
/adult/pickup          drop-in sessions (existing checkout unchanged)
/adult/tournaments     category page
/youth                 thin hub: one screen, parent-first hero + doors (URL unchanged)
/youth/leagues         leagues & classes · chips: Age (first) · Sport · Venue
/youth/camps           category page · chips: Age (first) · Sport · Venue
/locations             venue hubs as per-venue catalogs
/about /shop           unchanged
/sports                retired from nav; 301s (see Redirects)
```

### Principles

1. **Audience is answered exactly once, in the nav.** Category pages are audience-scoped URLs — no Adults/Kids tabs to build or maintain. Cross-audience links ("Looking for youth leagues?") where useful.
2. **Venue is always a filter chip, never hierarchy.** Adding venue #3 costs a chip option and a `/locations` card, not an IA change.
3. **Sport is a chip.** `/sports` leaves the nav.
4. **Registration stays native.** No booking subdomain, no platform handoff. Price, day, and deadline render on the card.
5. **Nav labels are real links; dropdowns are accelerators.** `Adult` and `Youth` link to the hubs; hover/tap reveals direct category links. Every destination is reachable through visible links (no hidden-state navigation). Mobile drawer flattens the dropdowns into grouped links.

## Page specs

**Home.** Stays the marketing page. Adds two audience CTAs in the hero ("Find your league" → `/adult/leagues`; "Sign your kid up" → `/youth`). Copy remains evergreen. No other changes.

**Hubs (`/adult`, `/youth`).** Today's long finder pages slim to one screen, no scroll: audience hero (adult = social proof register, youth = parent-trust register) + category doors. Existing trust content (youth FAQ, adult testimonials) moves to the relevant category pages or stays on the hub below the fold only if it fits one screen — implementation decides, bias to cutting.

**Category pages.** SSR pages reusing the existing finder island (`AdultFinder`/`YouthFinder` internals), scoped per page via props rather than section nav. Defaults: open registrations sorted first; chips auto-hide at ≤1 option (existing behavior). Cards show price, day(s), registration deadline. Empty state = newsletter capture (PR #154 pattern). Youth pages pin **Age** as the first chip — the age-band *sections* on today's `/youth` become a filter, because age-band pages multiply (3 bands × N activities) while activity pages stay flat as sports are added.

**Category set rule.** Launch only category pages that have inventory once the fall/winter catalog is seeded. If youth classes inventory is thin, classes fold into `/youth/leagues` (page title "Leagues & Classes"); split later if the catalog warrants it.

**`/locations`.** Already close to target. Each venue page should present everything offered at that venue (Sofive's location-hub pattern); link venue cards from category-page chips where natural.

**Navigation component.** Desktop: `Adult ▾ | Youth ▾ | Locations | Shop | About`. `Sports` removed. Dropdown contents: Adult → Leagues, Pickup, Tournaments; Youth → Leagues & Classes, Camps.

## Redirects

| From | To | Type |
|---|---|---|
| `/sports` | `/` | 301 |
| `/sports/[slug]` | `/adult/leagues?sport=[slug]` | 301 (adult is the launch audience; revisit if Search Console shows youth-intent queries) |
| `/adult#leagues`-style section anchors | `/adult/leagues` etc. | client-side or 301 |

No other URLs change. Nothing 404s.

## What does not change

SoccerOne tree (`/soccerone/**`) and its nav; registration wizard; checkout/payments; dashboard; admin; middleware; auth; DB schema (zero migrations); `/api/public/seasons` and `/api/dropin/sessions` (existing filter params suffice).

## Rollout — three PRs, each reversible, one commit per PR

1. **Phase 1 — additive (now).** Ship the category pages (per the category set rule) on new routes. No nav changes, nothing existing moves. Smoke in prod.
2. **Phase 2 — swap (after the fall/winter catalog is seeded).** Slim hubs, nav dropdowns, `/sports` removed from nav, section-anchor redirects. Reversible by reverting one PR.
3. **Phase 3 — retire (after ~a week of funnel data).** Home audience CTAs; `/sports` 301s; update `sitemap.xml`.

## Measurement

Existing events `landing_hero_cta_click` and `adult_section_nav_click` already capture the entry clicks. After Phase 3, define a PostHog funnel: home pageview → category pageview → `/register/**` pageview → `registration_created`. Baseline (30 days pre-change, test accounts filtered): ~25–30 unique visitors/week, 5 registrations/month, most registrations arriving via direct shared links.

## Expected impact (honest)

This is **foundation, not a lever**: ~80% confidence the IA shape is right; low confidence (~20–30%) it independently moves registrations within 12 months at current traffic. Its value is (1) SEO lead time — category pages must exist months before they rank for "adult soccer league columbus"-class queries, (2) moving the IA while the catalog is small instead of at 16 leagues, (3) providing the shared category-page chassis the post-SoccerOne multi-brand theming refactor needs. Growth work (founders' teams, GBP, tournament, coach pool) outranks this; it proceeds now because the catalog expansion is imminent and Phase 1 is cheap.

## Out of scope

Multi-brand theme-driven refactor (separate, post-SoccerOne-launch effort); SoccerOne nav changes; any marketing/booking site split (rejected above); membership/booking flows.
