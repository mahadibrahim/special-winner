# Location pages, venue-first — design

**Date:** 2026-07-21
**Approved direction:** Option A (venue-first) — owner-approved in session, with fact corrections.
**Visual proposal:** https://claude.ai/code/artifact/0d115059-a768-42da-9b34-68385935dbb0

## Goal

Rebuild `/locations` (index) and `/locations/[slug]` (venue pages) from abstract
audience-marketing pages into venue-first pages modeled on the SoccerOne
Worthington page structure, wired to live season data so program content cannot
go stale. Retarget every CTA at the converting funnels (league term pages,
youth pages, rentals) instead of `/programs`.

## Verified venue facts (owner-corrected)

These are the ONLY facility claims the pages may make. Anything else currently
on the page (e.g. "3 indoor turf fields", concession/cafe mentions) is wrong
and must not survive the rebuild.

### Worthington (`/locations/worthington`)
- Address: 535 Lakeview Plaza Blvd, Suite B, Worthington, OH 43085 (from `locations` table — source of truth)
- Fields: **2 indoor turf fields** (110×60, boarded) — NOT 3
- **Futsal court coming** (September 2026) — present as "coming", not as existing
- Free on-site parking; directions: I-270 exit 23 → US-23 north → Campus View Blvd east → Lakeview Plaza
- Indoor, year-round, no weather cancellations
- Programming: adult co-ed leagues (weeknights/Sun), youth programs U6–U18, field rentals
- **No concessions/cafe** — remove the live `{{TBD — concession / cafe details…}}` placeholder; do not mention concessions at all

### Downtown Columbus / OSU (`/locations/downtown`)
- **1 field** ("Downtown field is fine" — owner)
- Address/city from `locations` table (verify the row is populated before launch)
- Programming: pickup (drop-in) hub + field rentals; no league seasons today —
  the template's league sections must auto-hide

## Architecture

One SSR template serves both venues (existing `[slug].astro` route, rebuilt).
Keep `setMarketingEdgeCache`, canonical tags, and the LocalBusiness/NAP JSON-LD
from the SEO pass (PR #407/#408).

### Data sources
| Content | Source | Freshness |
|---|---|---|
| Name, address, city/state | `locations` table via `getPublicLocations` / location lookup | live |
| "What's happening" cards, season pricing band | `/api/public/seasons?location=<slug>` (same early-bird-aware fields as division rows) | live |
| Pickup/rentals presence | existing dropin/rental availability helpers (as used by `/adult/pickup`, rentals pages) | live |
| Facility specs, directions, features | new `src/lib/locations/venue-facts.ts` — one curated record per slug | curated, single file |
| Photos | existing `/media/soccerone/still-*.jpg` facility stills (brand-neutral shots of the shared building) + hero still | static |

`venue-facts.ts` is the single place a human edits facility claims. Shape per
venue: `{ specs: [{n, label}], features: string[], directions: string[],
parkingNote, hours, photoSet, comingSoon?: string[] }`. Unknown slug → facts
sections render nothing (page still works from DB + seasons data).

### Page structure — `/locations/[slug]` (top to bottom)
1. **Hero** — facility photo background with ink wash, "Aspire in *Worthington.*",
   one-line identity, audience CTAs (adult → current-term league page,
   youth → `/youth`), facts ticker strip (address · hours · free parking · indoor year-round).
2. **What's happening** — live cards. Adult leagues card renders only when the
   venue has open/forming seasons (shows division count, nights, `$X/player`,
   registration-close date; links to the term page). Youth card when youth
   programs exist. Pickup + rentals cards when the venue offers them
   (Downtown leads with these). Empty states are omitted, never placeholdered.
3. **The facility** — spec tiles from `venue-facts` (Worthington: `2` turf
   fields · `110×60` boarded · `Year-round` indoor · `Free` parking) + feature
   bullets + optional "Coming soon: futsal court (Sept 2026)" chip.
4. **Inside the building** — photo strip (3 stills).
5. **Season pricing band** — only while a term is open: heading with kickoff
   date, price rows (solo / team, early-bird-aware, from the seasons API),
   Register CTA → term page. Auto-hides when nothing is open.
6. **Good to know** — rewritten FAQ: parking, ages, come-alone/solo, indoor
   year-round. The stale "address publishes once partnership terms finalize"
   answer is deleted.
7. **Getting here** — address, hours, step directions, parking note,
   "Open in Google Maps" link (maps.google.com/?q=<encoded address>), stylized
   inline map graphic (static SVG per venue in `venue-facts`).
8. **Bottom CTA band** — "Ready to play at <venue>?" with the same audience CTAs.

### Page structure — `/locations` (index)
- Headline + one-liner.
- One rich card per venue: photo, name, mono address/highlights line, live
  chips (`● 7 programs open` from seasons count, audience/facility chips from
  `venue-facts`), CTAs: primary → the venue's dominant funnel (Worthington:
  current adult term page; Downtown: pickup), secondary → venue page.
- No map at index level (two venues; the address line carries geography).

### CTA targeting rules (applies to both levels)
- Adult league CTAs → `/adult/leagues/soccer/<current-term>` (resolve current
  open term server-side; fall back to `/adult/leagues/soccer`).
- Youth CTAs → `/youth` (until youth verticals get richer landers).
- Pickup → `/adult/pickup`; rentals → the rentals funnel.
- No CTA anywhere on these pages points at bare `/programs`.

## Out of scope
- SoccerOne pages (unchanged; they remain the brand-side venue pages).
- New photography (reusing existing stills; slots accept replacements later).
- A live map embed (static graphic + Google Maps link only — no external tiles).

## Error handling / edge cases
- Unknown slug → existing 404 behavior unchanged.
- Seasons API empty/failed → "What's happening" renders only the curated cards
  (pickup/rentals/youth) and the pricing band hides; page never shows an error
  for a data blip.
- Venue with no `venue-facts` entry → facts/photo sections omitted; DB-driven
  sections still render.

## Testing
- Playwright: rebuild/extend the existing location-page specs — verify
  (a) Worthington renders hero, live adult-league card with a `$/player`
  price, facility tiles reading "2" fields, and NO `{{`-style placeholder text
  anywhere; (b) Downtown renders pickup-first with league sections absent;
  (c) index cards link to venue pages and the primary CTAs.
  Grep `tests/e2e/` for specs touching `/locations` before merging (post-merge
  test-full risk) and update them with the new structure.
- Existing SEO assertions (canonical, JSON-LD) must keep passing.

## Rollout
- Single PR; docs-only spec commit precedes it. No schema changes, no
  migrations. Standard pre-push checklist (build, tsc, affected e2e specs).

---

## v2 addendum (owner direction, 2026-07-21 evening)

**Role clarification:** Aspire location pages are PROGRAM pages. Venue
operations content — hours, parking, field rentals — belongs to the venue
website (the SoccerOne pages for the same building). What remains must be
about programs, and "now vs. later" must be wired to live data, not curated.

### Remove
- Hours and parking everywhere: ticker items, "Free" parking spec tile,
  "Is there parking?" FAQ, Hours/Parking rows in Getting Here. Drop the
  `hours` and `parkingNote` fields from `venue-facts.ts` (this also retires
  the owner-unverified "Weeknights to 11 PM · weekend mornings" copy).
- Field rentals everywhere: `offerings.rentals`, the rentals card, "Book a
  field" CTAs, Downtown's "Hourly field rentals" spec tile.

### Add
1. **Line map** — inline SVG directional map (adapted from the SoccerOne
   yard-sign map for the same building, recolored to Aspire tokens) rendered
   in Getting Here alongside the existing text directions and Google Maps
   link. Per-venue: rendered only where a map is defined (Worthington now).
2. **Coming up strip ("later")** — below What's Happening: forming future
   terms grouped by term (label, division count, starts date), each linking
   to its term page (which carries interest capture). Data: the same seasons
   fetch; new pure helper `summarizeUpcomingTerms(seasons, excludeTermSlug)`
   → `Array<{ termSlug, termLabel, count, startDate }>` sorted by startDate.
3. **Wired pickup card** — the Drop-in pickup card fetches
   `/api/dropin/sessions?location=<slug>` (already supported); with upcoming
   sessions it shows the next session's day/time and session count this week;
   with none it says "Sessions post weekly — see the schedule". No static
   cadence claims (retires "pickup most nights").
4. **Stay-in-the-loop band** — on `/locations` and `/locations/[slug]`,
   above the footer: email capture posting to the existing newsletter API +
   "Join the WhatsApp group" button rendered ONLY when `JOIN_WHATSAPP_URL`
   (join-config) is not the REPLACE_ME placeholder, else a "More ways to
   follow →" link to `/join`. Note: the site footer already carries email
   capture on every page; this band is the location-page-level CTA the owner
   asked for.

### Unchanged
Live term-scoped league card + pricing band (#440), facility tiles minus
parking, photos, Good to Know minus the parking question, CTA targeting
rules, SEO blocks, placeholder ban.
