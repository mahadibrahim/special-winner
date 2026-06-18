# Adult & Youth Sitemap — Bold-Catalog Redesign

**Date:** 2026-06-18
**Status:** Approved (design)
**Author:** brainstormed with founder

## Goal

Bring the rest of the adult and youth pathway up to the "bold catalog" design
language already shipped on `/adult/leagues` and `/adult/leagues/soccer`, for
visual consistency and an overall level-up. Six pages are in scope; the soccer
subtree is already done and is the reference, not a target.

## Pages in scope

| Page | Archetype | Notes |
|---|---|---|
| `/adult` | Hub | Video hero + colored animated category cards |
| `/youth` | Hub | Same, brighter youth palette, two doors |
| `/adult/pickup` | Category | Full template incl. skill-level explainer + pricing band |
| `/adult/tournaments` | Category | Hero + tiles + existing tournament finder |
| `/youth/leagues` | Category | Hero + tiles + existing finder (keeps age chips) |
| `/youth/camps` | Category | Hero + tiles + existing camp finder |

Already done (reference only): `/adult/leagues`, `/adult/leagues/soccer`,
`/adult/leagues/soccer/[term]`.

## Design language (the shared system)

Carried from `/adult/leagues`:

- **Full-bleed video/photo hero** with layered `oklch` dark-blue gradient
  overlays. Stock footage/photos (Pexels/Unsplash), per the approach already on
  `/adult/leagues`. Always include a `poster` fallback image.
- Tighter editorial layout: `pt-16 px-9`, `max-w-[1080px]`, large display
  headline (`clamp(2.5rem,6vw,4rem)`, `tracking-tight`).
- `font-mono` micro-labels (tracking-widest uppercase) used only for real
  information (live status, facts) — never decorative.
- **No eyebrow/kicker text.** Strip the existing orange "Audience · Central
  Ohio" breadcrumb eyebrows from every page in scope. Keep only
  information-carrying labels like `● Now registering`. (See memory:
  no-eyebrow-text.)
- Respect `prefers-reduced-motion: reduce` — disable all looping animation.

### Archetype A — Category pages

Structure: **video hero with sport/format tiles → [page-specific bands] →
existing finder island → `CTABanner`**.

- **Hero tiles** represent the sports/formats available on that page. Each tile
  has a state: `live` (colored background, clickable) or `coming_soon` (dimmed,
  bordered, non-clickable "notify me"). Mirrors the `/adult/leagues` tiles.
- **Tile click behavior:**
  - If the sport has a dedicated sub-landing page (e.g. leagues → soccer), the
    tile **links** to it.
  - If it does not (e.g. pickup soccer today), the tile **smooth-scrolls to the
    finder and pre-applies that sport's filter**. One page, no new routes.
  - When pickup/tournament sub-pages are built later, their tiles flip from
    scroll-filter to link — no other change.
- **Tile content** is curated per page (a small typed array, like
  `/adult/leagues` today), so editorial control stays in the page. Live counts
  may be layered in later but are not required for v1.
- Keep the existing finder islands (`CategoryFinder` /
  `pickup-page-finder.tsx`) and their filters (incl. youth age chips) unchanged
  below the hero.
- Reuse `trackCatalogSportTileClicked` analytics on the tiles.

### Archetype B — Hub pages

Structure: **video hero (headline + subhead, hub-level copy) → colored animated
category cards**.

- Copy speaks to the whole hub, not one category. Adult headline: **"Three ways
  to play. One standard."** Youth gets an equivalent hub-level line.
- **Category cards** replace the current plain cream door cards. Each card:
  - Owns a **per-category palette** (Leagues = warm orange, Pickup = cool blue,
    Tournaments = violet; youth picks two bright palettes).
  - Has a slow looping **aurora gradient** (`drift` keyframes) and a **pulsing
    live dot** on active categories' status labels.
  - On hover: lifts, aurora speeds up, arrow slides. Cards link into the
    category pages and keep the existing `data-landing-cta` analytics + the
    legacy hash-anchor redirect scripts.

## Pickup-specific elements

`/adult/pickup` is the fullest page and carries two extra bands between the hero
and the finder:

1. **Pricing band** (dark `ink` background): "One price, three ways to pay" with
   three tiers — **$17 walk-in / $15 online / $12 member** — member highlighted
   as the best deal to nudge membership. Online + member figures come from the
   org `drop_in_rate_card` (`defaultSessionRateCents` / `defaultMemberRateCents`,
   with per-session overrides where shown on cards). The **$17 walk-in figure is
   display copy for now** (a configurable constant) — it becomes real data when
   the walk-in pricing enforcement spec lands (see Follow-up). Session cards also
   show "online · member" pricing.

2. **Skill-level explainer** ("Find your level"): three color-coded tiers from
   the existing `drop_in_skill_level` enum — **Recreational / Intermediate /
   Advanced** (note: the DB value is `advanced`, not "competitive"). Sessions
   tagged `all_levels` render without a tier badge / as "All levels." Each
   open-session card in the finder also carries its skill-level badge
   (`pickup-card.tsx` already has skill level available). Placement is **both**
   the explainer section and per-card badges.

Tournaments and youth pages do **not** get the pricing/skill bands — they go
hero → finder.

## Implementation notes

- **Reusable components.** Factor the category hero into a single Astro
  component (e.g. `CategoryHero.astro`) taking `{ title, subhead, video, poster,
  tiles, crosslink }`, and the hub into `HubHero.astro` + an animated
  `CategoryCard.astro`. Avoid copy-pasting hero markup across six pages.
- **Rendering.** All six pages stay **SSR** (no `prerender`) — they already are,
  and the finder islands fetch host-scoped data client-side. Unchanged.
- **Keep islands.** Do not rewrite `CategoryFinder` / `pickup-page-finder`;
  the redesign is hero + (pickup) bands above them, plus wiring tile → finder
  filter/scroll.
- **Animations** live in a small shared stylesheet or scoped `<style>`; gate all
  looping motion behind `prefers-reduced-motion`.
- **Imagery** is stock (Pexels video + Unsplash poster), chosen per page to fit
  the sport/energy.

## Out of scope / follow-ups

- **Walk-in pricing enforcement** — separate spec, to be done next. Summary of
  decisions captured for that spec:
  - Add `drop_in_rate_card.default_walk_up_rate_cents` (e.g. 1700) +
    nullable per-session `drop_in_sessions.walk_up_rate_cents` (additive
    migration via `db:generate`).
  - Make `resolveRate()` channel-aware (`source: "online_booking" | "walk_up"`);
    only the non-member branch changes — non-member + walk_up → walk-up rate.
    Members keep member rate / allotment / unlimited on every channel.
  - Enforce at the two in-person server routes:
    `kiosk/[locationSlug]/walkin/payment.ts` and
    `admin/dropin/sessions/[id]/walk-up.ts`. Screens display the resolved amount
    read-only.
  - Expose the walk-up rate in the rate-card admin editor + per-session override.
  - **$17 is base + card surcharge** (mirrors current kiosk surcharge behavior),
    not all-in.
  - Once shipped, the pickup pricing band reads the real walk-in figure.
- **Sub-landing pages** for pickup/tournaments/youth sports (e.g.
  `/adult/pickup/soccer`) — built when those sports go live; tiles flip to links.
- **Legacy/adjacent pages** (`/leagues`, `/programs`, `/sports`) are not part of
  this pass.

## Success criteria

- All six pages use the shared bold-catalog hero language; no flat
  `from-ink to-zinc-700` heroes or orange breadcrumb eyebrows remain in scope.
- Category hero tiles scroll-and-filter (or link, where a sub-page exists).
- Hub cards are colored + animated and respect reduced-motion.
- `/adult/pickup` shows the pricing band and skill-level explainer + per-card
  badges, driven by real rate-card / skill-level data (walk-in figure is copy
  pending the follow-up spec).
- `npm run build` + `npx tsc --noEmit` clean; existing finder behavior and
  analytics intact.
