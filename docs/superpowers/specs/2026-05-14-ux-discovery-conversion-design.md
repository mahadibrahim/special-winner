# UX Discovery & Conversion — Design Spec

**Date:** 2026-05-14
**Status:** Approved — ready for implementation plan
**Scope:** Discovery / wayfinding only. Registration-flow streamlining is a deliberate fast-follow (separate spec).

## Problem

The site is visually attractive but, by the founder's read, will not convert well as constructed. Three concrete wayfinding failures:

1. **Audience confusion.** An adult looking to play and a parent booking for their kid are not cleanly separated. A visitor has to hunt for the path that's theirs.
2. **Inconsistent program cards.** Cards render at different shapes and sizes. Root cause: multiple card components exist (`program-card-v2.tsx` live; `program-card.tsx` orphaned), and `ProgramCardV2` itself has ragged heights — no `h-full`, optional content that comes and goes, rendered fixed-width in scroll rows but fluid in grids.
3. **Navigation has no audience awareness** and no SEO depth — `Programs / Guides / About` for everyone.

No analytics yet (pre-launch) — this is a gut-driven design pass, validated against UX best practice and the business context in the ops `CLAUDE.md`.

## Non-goals

- Registration wizard streamlining (step count, sticky order summary). Acknowledged real ("too many steps", "confusing what you're booking" — the Sofive lessons) but explicitly deferred to keep this spec shippable and because registration code is volatile (recent payment fixes).
- Any schema change. "Classes" maps to the existing `training` program type; no new enum value.
- Persistent audience state / cookies / modes — explicitly rejected during design (see Decision 1).

## Decisions made during brainstorming

1. **No persistence layer.** An early proposal for a cookie-driven audience "mode" with a nav switcher was rejected: a switcher taxes every *new* visitor with hidden state and only benefits returning ones. Wayfinding is solved with explicit, always-visible nav instead. No cookie, no middleware `locals.audience`, no switcher.
2. **Hybrid → resolved to explicit nav + dedicated landing pages.** `Youth` and `Adult` are plain top-level nav items going to dedicated `/youth` and `/adult` landing pages. The landing pages work standalone.
3. **Homepage keeps its dual-CTA hero** (`DualCtaHero`) — already a clean Youth/Adult splitter. Its two CTAs re-point from `/programs?audience=…` to `/youth` and `/adult`.
4. **Nav uses two SEO surfaces.** Curated flat header (~6 items), exhaustive internal-link map in the footer. No dropdowns (less prominent links, accessibility cost, mild hidden-state).
5. **Shop ships as a slot now.** A `/shop` "coming soon" placeholder, `noindex` until the real Printful store exists. Founder will build the store after registration is fully functional.
6. **One program card, normalized.** Keep `ProgramCardV2` as the single card; don't add a new component. Fix it via a normalized content contract (every field always resolves) rather than reserving empty space for missing data. Strict information hierarchy, hard cap of one format badge.
7. **Card calibration: "build B's structure, ship C's slot."** Add a sport indicator; add a media slot that falls back to a branded sport-color block when no photo exists (pre-launch has zero photos; photos drop in later with no rebuild).
8. **Scarcity → deadline.** Replace the fill-percentage bar with a registration-deadline line. A fill bar depends on registration counts that, pre-launch/early-season, actively deter ("2 of 25 filled" reads as dead). The deadline works from day one. Keep the status pill for genuinely earned scarcity states. Deadline uses *conditional urgency*: neutral text when far off, urgent accent when near.
9. **Landing-page Section 2 is format-led.** The primary in-page self-segmentation is by program format, not age or join-mode — format is the bigger product distinction.
10. **"Classes" → `training`.** The parent-facing word "Classes" maps to the existing `training` program type. No schema change.

## Architecture

Three work areas. No new shared infrastructure, no schema changes, no middleware changes.

### A. Program card — unify `ProgramCardV2`

`ProgramCardV2` (`src/components/programs/program-card-v2.tsx`) becomes the single, uniform card. It is already used by `homepage-programs-preview.tsx` and `programs-catalog.tsx` — those consumers are unchanged structurally.

**Normalized content contract.** Every field always resolves to a displayable value — no optional slots that come and go:
- **Heading** — program/season name. Clamp 2 lines, reserve 2-line height so 1-line and 2-line headings align.
- **Who** — `Location · Age group`. Adult cards show "Adult" rather than a blank age. Always one line.
- **When it runs** — schedule. `scheduleNotes || formatDateRange(...)` — always a string.
- **When to act** — registration deadline, derived via `deriveDeadline`. Always shown. Neutral text when far off; urgent accent (color, "Closes in N days") when near.
- **Format badge** — at most ONE (e.g. "Solo or team", "Team only", "Camp", "Clinic"). Hard cap. No stacking.
- **How much** — price prominent, deposit as quiet secondary text.
- **Status pill** — only genuinely earned states (Open / Filling / Last spots / Waitlist) via `deriveStatusPill`. Overlaid on the media slot.
- **Media slot** — photo when one exists; branded sport-color block as the fallback. Sport label + status pill overlaid on it. The slot exists in the markup from day one even though pre-launch every card renders the fallback.

**Layout mechanics.** `h-full` flex column; a spacer pushes the price + CTA into a consistent bottom band; CTA pinned to bottom. Scroll-row fixed width (`w-[300px]`/`w-[320px]`) is retained — rails are intentional — but every card in a rail is now equal height too.

**Element budget:** media slot + 6 body elements + 1 optional format badge. Down from up-to-9 competing elements.

### B. Navigation + landing pages

**Header nav** (`src/components/navigation.tsx`) — flat, same for every visitor:
`Youth · Adult · Sports · Locations · Shop · About`
- `Youth` → `/youth`, `Adult` → `/adult`, `Sports` → `/sports`, `Locations` → `/locations`, `About` → `/about`.
- `Shop` → `/shop` (placeholder; see below).
- Existing auth CTAs (`Sign In` / `Get Started`, or `Dashboard` / `Sign out`) and `LocationSelector` are retained.
- Mobile sheet mirrors the same flat list.

**Footer** (`src/components/footer.tsx`) — gains an exhaustive sitemap block: Youth (programs, guides, sport-specific), Adult (leagues, team registration, how it works, drop-in), Sports (each sport individually), Locations (each location individually). Descriptive anchor text. This is the SEO long-tail surface.

**`/youth` landing page** — new route, SSR (middleware-gated content patterns; reads no request state itself but follows the SSR default for new pages). Emotional job: reassurance. Bright/green/warm hero treatment.
- **Hero** — kicker ("Now enrolling · Summer 2026"), kid-focused headline, sub-copy referencing the development frameworks, single primary CTA → `/programs?audience=youth`.
- **Section 2 — "What kind of program?"** (the heart). Five format tiles: Leagues / Classes / Camps / Clinics / Tournaments. Each → `/programs?audience=youth&type=<programType>` (`training` for Classes).
- **Secondary age quick-filter row** — small: `4–8 / 9–12 / 13–18`, each → `/programs?audience=youth` pre-filtered to the age band. Demoted, not headline.
- **Why parents trust Aspire** — 3 proof points (real coaches, safety/structure, the frameworks). Reuse `WhyAspire`.
- **Featured youth programs** — `ProgramCardV2` row.
- **Logistics strip** — locations, what a season looks like, how communication works.
- **Parent FAQ** — reuse `FAQSection`.
- **CTA banner** — reuse `CTABanner`.

**`/adult` landing page** — new route, SSR. Emotional job: energy + credibility. Dark/orange hero treatment.
- **Hero** — kicker ("Founding season · Summer 2026"), headline about the league you build your week around, sub-copy on well-run + post-game scene, two CTAs: primary → `/programs?audience=adult`, secondary "Register a team" → `/programs?audience=team` (the catalog's existing team segment).
- **Section 2 — "How do you want to play?"** (the heart). Three tiles: Leagues / Pick-up / Tournaments.
  - Leagues → `/programs?audience=adult&type=league`
  - Pick-up → `/dropin` (the separate drop-in subsystem — a deliberate cross-link out of the programs catalog)
  - Tournaments → `/programs?audience=adult&type=tournament`
- **The Aspire difference** — 3 proof points (well-run / fair refs / reliable comms, the social scene, neighborhood-anchored). Distinct content from the youth frameworks; reuse the `WhyAspire` shell or `StatsSection` as appropriate.
- **Featured adult leagues** — `ProgramCardV2` row.
- **How a season works** — schedule, format, what league night looks like.
- **Testimonials** — reuse `Testimonials` (captain voice).
- **CTA banner** — reuse `CTABanner`.

Join-mode (solo / friends / team) does not appear as a page section — it lives on the card's format badge and the "Register a team" hero CTA.

**`/shop` placeholder** — new route. A minimal "coming soon" page extending `BaseLayout`. Emits `<meta name="robots" content="noindex">` so a thin placeholder does not dilute SEO. Flips to indexed when the real Printful store ships.

### C. Catalog plumbing — `?type=` param

`/programs` (`src/pages/programs/index.astro` + `src/components/programs/programs-catalog.tsx`) already reads `?audience=`. Add a parallel `?type=` query param:
- The Astro page parses `?type=` and passes it as an `initialType` prop alongside `initialAudience`.
- `ProgramsCatalog` accepts `initialType` and pre-applies it to the existing programType filter (the catalog already filters by `program.programType` for the team segment — this generalizes that to a URL-driven initial value).
- Invalid/absent `type` → no pre-filter (current behavior).

### D. Dead-code cleanup

Delete the orphaned card chain — confirmed imported nowhere reachable:
- `src/components/page.tsx` — imported nowhere.
- `src/components/programs-directory.tsx` — only imported by `page.tsx`.
- `src/components/program-card.tsx` — only imported by `programs-directory.tsx`.

Zero render impact. (The `class="program-card"` strings in `src/pages/guides/*.astro` are unrelated CSS class names — left alone.)

## Rollout phasing

**Phase 1 — Card + cleanup.** Lowest risk, no new routes. Refactor `ProgramCardV2` to the normalized contract; delete the 3-file orphan chain. Verifiable immediately on the existing homepage and `/programs`.

**Phase 2 — Nav + landing pages + plumbing.** Build `/youth`, `/adult`, `/shop`; update `navigation.tsx` to the flat set; expand the footer sitemap; add the `?type=` param to `/programs`; re-point the homepage hero CTAs to `/youth` and `/adult`.

## Testing

Per the project `CLAUDE.md` conventions:

- **New pages default to SSR** — no `prerender` flag on `/youth`, `/adult`, `/shop` unless proven request-state-free; `/shop` may be `prerender = true` if it reads no request state (it does not), but must still emit the `noindex` meta.
- **Playwright E2E** (`tests/e2e/`):
  - `/youth` and `/adult` load, hero primary CTA navigates to the correct `/programs?audience=…` URL, Section 2 format tiles navigate to the correct `?type=` / `/dropin` destinations.
  - Top-level React components on the new pages call `useHydrationBeacon()`; tests call `waitForHydration(page)` before interaction.
  - Nav contains the six expected links; `/shop` returns 200.
- **Unit tests** (`tests/unit/`): `deriveDeadline` urgency-threshold boundaries (far vs. near vs. closed), if not already covered.
- **No schema change** → no migration, no `db:generate`.
- **Pre-push checklist:** `npm run build` (catches SSR/prerender mistakes), `npx tsc --noEmit` (zero errors), API + Playwright per the major-work checklist since new E2E flows are added.

## Open questions / follow-ups (out of scope here)

- Registration-flow streamlining (the Sofive lessons) — separate spec.
- Real program photography for the card media slot — operational, not engineering.
- Whether `/youth` and `/adult` warrant their own copy pass with the founder before launch — recommended, but copy is `{{TBD}}` placeholders this spec doesn't block on.
