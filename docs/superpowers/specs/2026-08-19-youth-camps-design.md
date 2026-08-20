# Youth camps — two-level page system (hub + camp-type detail pages)

**Date:** 2026-08-19
**Status:** Approved by owner ("build it") after live mockup review
**Mockups (design source of truth, reviewed live on :4455):**
- Hub: `docs/superpowers/specs/2026-08-19-youth-camps-mockup.html`
- Type page exemplar: `docs/superpowers/specs/2026-08-19-youth-camp-type-detail-mockup.html`

## Context

The last youth surface still on the pre-band-system design is `/youth/camps`.
The owner directed a rebuild reusing the leagues/classes band system with
camp-specific content and structure. Camps is a **coaching surface** like
classes — the Director of Coaching and YouthCoachSection ARE allowed here
(never on league pages).

Hard facts that shaped the design:
- **Prod catalog has zero camp seasons today** (all 23 youth seasons are
  leagues). The pages must be honest at launch: notify capture and an
  owner-authored calendar carry the conversion story until camps are seeded.
- **Arena Sports camps page is the benchmark family** — they list six camp
  types but publish **no dates, no prices, no camp-day detail**. Camp dates
  are the owner's named conversion lever; day-level specificity is our
  anti-Arena edge.

## Owner decisions (this session)

1. **Arena-style menu**: multiple named camp types, each with its own
   presence — not a leagues-style two-door split, not a single flow.
2. **The lineup (4 families)**: School's-out day camps · Summer day camp ·
   Soccer skills camps · Specialty camps (goalie, defender, striker,
   tryout-prep, etc. — announced through the year).
3. **Placeholder facts, owner tunes**: camp-day logistics (hours, drop-off,
   lunch, bring-list, ages, venue) ship as sensible placeholder values in
   **one constant file**; the owner edits real values there. (Same contract
   as the leagues commitment band.)
4. **Authored calendar + notify**: an owner-editable calendar band of planned
   windows (winter break, spring break, summer, specialty) with per-window
   "Get notified". Live catalog camps appear in the booking finder as they're
   seeded, no code change.
5. **Hero is year-round, not break-only**: "Camp, all year long." — camps run
   while school is in session too (standing copy ban: camps are NOT
   school-break-only).
6. **A detail page per camp type** ("Parents will want to know specifically
   what is happening at each camp"): hub bands are teasers linking to
   `/youth/camps/<type>` pages that carry the full story.
7. **Copy cleanup on the live site** may follow — align existing camp
   references (lede constant, cross-promo copy) with the year-round framing.

## Architecture

### Routes

| Route | File | Purpose |
|---|---|---|
| `/youth/camps` | `src/pages/youth/camps.astro` (rebuild) | Hub: menu of the four families + shared booking surface |
| `/youth/camps/[type]` | `src/pages/youth/camps/[type].astro` (new) | One detail page per family: `schools-out`, `summer`, `skills`, `specialty` |

`[type]` is a **registry-driven dynamic route** (`getStaticPaths`-style over
the registry at request time — SSR like the other youth pages, with
`setMarketingEdgeCache`). Unknown slugs 404.

### Content registry — ONE constant file

`src/lib/youth/camp-page-content.ts` holds everything the owner tunes:

- `CAMP_DAY_FACTS`: the shared logistics facts (hours 9:00–3:00, drop-off
  from 8:45, pick-up by 3:15, pack lunch + two snacks, bring list, venue
  Worthington Fieldhouse). **All placeholder values — owner edits here.**
- `CAMP_TYPES[]`: per family —
  - `slug`, `name`, `tone` (band tone: royal / emerald / red / navy)
  - `kicker` (when it runs), `agesLine` (placeholder)
  - hub band `body` + one-line `teaser` detail (label + text)
  - `windows[]` (planned windows, mono line)
  - detail-page content: hero sub, `schedule[]` (time / what / why rows —
    "the day" for schools-out & skills, "the week" for summer; specialty
    instead lists its named camps with blurbs), `whoCards[]`, `faqs[]`
  - `programSlugs[]` — catalog mapping (see below)
- `CAMP_CALENDAR[]`: the authored windows for the hub calendar band.
- The existing `CAMPS.lede` in `src/lib/youth/landing-content.ts` is updated
  to the approved year-round hero sub (copy-cleanup item; classes/hub
  cross-promos already read generalized copy and stay as-is unless drifted).

No dollar figures are invented anywhere. The mockups' sample prices were
review devices only; real pages render only live catalog prices. The
mockup `PLACEHOLDER` tags do not render on the real pages — values render
as normal copy and the constant is the tuning surface.

### Catalog mapping (no schema change)

The schema has `programType = "camp"` but no camp *family* field. Convention:
**one program per camp family** (e.g. a "Summer Day Camp" program whose
seasons are the weeks; specialty camps may be several programs). The registry
maps family → `programSlugs[]`.

`CategoryFinder` gains an **opt-in** `programSlugs?: string[]` prop that
filters client-side (where `programTypes` already filters), used only by the
type pages. Default behavior byte-identical — the adult surfaces and every
existing call site are untouched (standing owner mandate). Until the owner
creates the camp programs, the filter simply matches nothing and the finder
shows its empty-notify state — correct launch behavior. When seeding camps,
program slugs must match the registry (documented in the registry's comment).

### Hub page composition (mockup-verbatim except noted)

1. **Top banner** — brand-red, owner-editable copy ("Winter break camp dates
   announce soon…"), CTA anchors to `#calendar`. Static authored copy at
   launch (no live inventory to compute from); revisit to the leagues-style
   live deadline line when camps exist. **Gotcha:** first flow element under
   the fixed nav needs `pt-16 lg:pt-20` clearance.
2. **Hero** — navy-deep + youth-training photo + emerald grade.
   H1 "Camp, all year long." Sub = approved year-round lede. **Four tiles**
   (royal/emerald/red/navy) anchoring to the type bands; sized to sit
   4-across on desktop (`minmax(228px,1fr)`), 2×2 on tablet. Crosslinks to
   leagues + classes.
3. **SectionJumpBar** — The camps / The camp day / Coaching / Book & dates /
   Calendar / FAQs.
4. **Four camp-type bands** — full-bleed, alternating text/graphic sides,
   pitch-motif slot graphics until photos. Each: kicker (when), name, ages
   line, body, windows line, teaser detail row, CTAs: primary
   "Everything about X →" (type page), secondary "See dates" (`#open`) —
   specialty's secondary is "Get notified" (`#calendar`). Custom band markup
   on the page (the shipped `FeatureBand` doesn't carry windows/detail/dual
   CTAs; don't widen its Props for one page).
5. **"The camp day, up front"** — paper band, commitment-band grammar,
   renders `CAMP_DAY_FACTS` + the note that each card carries its own facts.
6. **YouthCoachSection** — shipped component, rendered as-is.
7. **Red flood + paper sheet** — "Book a camp." H2, mono liveline ("Live from
   the catalog — cards appear here the moment a camp opens"), sheet =
   `CategoryFinder` (`audience="youth"`, `programTypes={["camp"]}`,
   `cardVariant="youth-band"`, `headerHidden`, `sectionId="youth-camps"`,
   `ageChips`) in the classes-page overlap pattern (sheet surface, `-mt-[88px]`).
   Empty state = the shipped banded notify card — **`sectionId` stays
   `youth-camps`** so the e2e empty-notify capture id
   (`#empty-finder-youth-camps-email`) and signup attribution survive.
8. **Calendar band** — `CAMP_CALENDAR` cards (Winter break / Spring break /
   Summer / Skills & specialty), each "Get notified" anchoring to the notify
   capture in `#open`'s sheet (one email field on the page; no new API).
9. **FAQ** — `LandingFaq`, hub-level questions (ages, day shape, lunch,
   bring, soccer-only, never-played, specialty announcements, refunds).
10. **Cross-promos** — two `FeatureBand`s: leagues (emerald), classes (royal).
11. **Close** — navy, "The best week of their year.", CTAs Book (`#open`) /
    Get notified (`#calendar`).

### Type page composition (exemplar mockup, parameterized by registry)

1. **Hero** — type tone background w/ subtle pitch-motif, breadcrumb
   "← All camps", H1, ages+venue mono line, sub, CTAs (See dates & book →
   `#open`; What the day looks like → `#day`), windows line.
2. **Schedule** — "The day, hour by hour." (summer: "The week"; specialty:
   "The camps" — named camp list with blurbs instead of a timetable).
   Paper table rows: time / what / why.
3. **Who it's for** — three cards (ages, experience, the fit).
4. **Know before you book** — type-specific facts grid (defaults from
   `CAMP_DAY_FACTS`, overridable per type in the registry).
5. **Dates & booking** — red flood + sheet, `CategoryFinder` filtered by the
   type's `programSlugs` (`sectionId="youth-camps-<type>"` so each type page
   gets its own attribution), notify empty state.
6. **Type FAQ** — `LandingFaq`.
7. **The other camps** — three tiles linking to the sibling type pages.
8. **Close** — navy, type-appropriate copy, CTAs.

### SEO

- Canonicals on all five pages; titles/descriptions per page
  ("School's-Out Day Camps in Columbus & Worthington, Ohio — Aspire Sports").
- Add the four type URLs to `src/lib/seo/aspire-sitemap-pages.mjs`
  (sitemap + pages must stay in sync — division-slug precedent).
- `setMarketingEdgeCache` on all five pages.

### Analytics

- Keep the `data-youth-cta` click-tracking script pattern from classes on
  both page kinds (section CTAs, tiles, band links).

## Error handling

- Unknown `[type]` slug → `return Astro.rewrite("/404")` — the repo's
  unknown-slug convention (see `src/pages/adult-soccer-leagues-[suburb].astro`:
  dead URLs must 404, not redirect, so they fall out of the index).
- Finder API failure → CategoryFinder's own error/empty handling (shipped).
- No JS → pages are server-rendered content; the finder island degrades to
  its loading skeleton (existing behavior on classes/leagues).

## Testing

- **E2E**: `tests/e2e/category-pages.spec.ts` camps test exercises the
  empty-notify capture (`#empty-finder-youth-camps-email`) — must still pass
  against the rebuilt hub (sectionId preserved). Update selectors that
  referenced the old page structure. Add coverage: hub band link →
  `/youth/camps/schools-out` renders schedule + finder; unknown type 404s.
  **These specs run post-merge (`test-full`), not on the PR gate — run them
  locally before merge** (`PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test
  -- category-pages`).
- **Hydration**: any new `client:load` island page keeps `useHydrationBeacon`
  + `waitForHydration` in specs (CategoryFinder pages already comply via the
  shipped component).
- **Unit**: registry invariants (four slugs, tones valid, programSlugs
  non-overlapping) if a natural seam exists; otherwise skip — content
  constants don't need tests.
- `npx tsc --noEmit` zero errors; `npm run build` passes (SSR pages, no
  prerender flags).

## Out of scope

- Seeding actual camp programs/seasons (owner, in admin, post-merge).
- Live deadline-banner data (needs inventory; revisit after seeding).
- Camp photos (pitch-motif slot graphics until the shoot).
- Kit-size collection (separately queued).
- Any adult-surface or schema change.

## Open items for the owner (non-blocking)

- Tune every placeholder in `camp-page-content.ts` (ages, hours, lunch,
  bring list, windows, schedule times).
- Create the camp programs in admin with slugs matching the registry, then
  seed seasons (dates are the conversion lever).
- Decide single-day vs whole-break pricing when seeding (page supports both —
  cards render whatever the catalog says).
