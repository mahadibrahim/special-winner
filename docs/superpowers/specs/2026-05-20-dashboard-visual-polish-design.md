# Dashboard visual polish — design

**Date:** 2026-05-20
**Branch:** `feat/dashboard-visual-polish` (off `feat/transactional-email-overhaul`)
**Builds on:** `2026-05-19-dual-persona-dashboard-design.md`

## Problem

The dual-persona dashboard (`/dashboard/play`, `/dashboard/family`) has sound
information architecture — four urgency-ordered sections — but the visual
execution drifted off the editorial design system (`docs/design-system.md`):

- **Off-system color.** Cards use cold-gray `border-stone-*` borders and
  `bg-white` against the warm cream page; status pills use the `-100/-900`
  scale instead of the design-system badge recipe; the family phone-verify
  banner is fully blue — a hue the design system explicitly forbids.
- **No card uniformity.** Roughly eight ad-hoc card recipes across the
  components — radii `lg`/`xl`/`2xl`, backgrounds `paper`/`cream-2`/`white`/
  gradient, borders `stone-100`/`stone-200`/`border`. Some section content is
  bare rows, some bordered boxes.
- **Numbered section headers.** `DashboardSection` renders `1 · / 2 · / 3 ·`;
  `PlayAttention` hardcodes `1 ·`. Reads like a form wizard, not a dashboard.
- **Emoji icons.** `📍 ⏳ 💳` (PlayAttention) and `📘 ⚽ 🛍️ 💬` (family Explore)
  — inconsistent across platforms, not editorial.
- **Thin cards.** Cards under-describe. A game shows "Field 1" with no venue
  and no wayfinding.

## Goals

- Every surface on both dashboards matches the editorial design system.
- One card treatment, used everywhere — visual uniformity.
- A visible, learnable system for telling event/membership **types** apart.
- Cards carry the essentials (where, when, what state, what to do); detail
  pages carry the rest.

## Scope

A **visual + layout** pass over the dual-persona dashboard. The information
architecture, persona routing, and the four-section skeleton from the
dual-persona spec are unchanged. One small **data-layer** addition is in
scope (venue info — see Data layer). Out of scope below.

## Decisions (settled in brainstorming; mockups reviewed and approved)

1. **Layout C — contained panels.** Each section is one bordered panel.
2. **No numbered headers** — editorial label + accent icon instead.
3. **One card primitive** — the typed card, used across both dashboards.
4. **Two-axis card model** — *type* (icon + hue + eyebrow) and *status*
   (badge) are independent and never bleed into each other.
5. **Bolder color**, drawn entirely from the design-system palette.
6. **Venue + Directions** on every game / pickup / class / rental card.
7. **lucide icons**, no emoji.

## The visual system

### Layout — contained panels

Each of the four dashboard sections is a single bordered **panel**: `bg-paper`,
`border-border`, ~15px radius. A panel has:

- a **header row** — an accent icon tile + the editorial tiny-caps section
  label + an optional item count, on a faint accent tint;
- a **body** — a vertical stack of cards.

No section numbers. Section accent: *Needs your attention* → ochre;
*What's coming up* and *What you're part of* → neutral (primary icon);
*Explore* → sage.

### Axis 1 — Type (what kind of thing it is)

Fixed mapping, all four hues are existing design-system tokens:

| Type | Hue token | lucide icon | Eyebrow label |
|------|-----------|-------------|---------------|
| League game / tournament | `primary` | `trophy` | "League game" / "Tournament" |
| Pickup / drop-in game | `navy` | `users` | "Pickup game" |
| Class / clinic / camp | `ochre` | `graduation-cap` | "Class / clinic" |
| Field rental | `sage` | `flag` | "Field rental" |

Tournament reuses the league-game hue; camp reuses the class hue — four hues
total, no palette sprawl. Type drives four things on a card: a 4px left
edge, the icon-tile fill, the eyebrow color, and a faint (~8%) type-tinted
card background.

### Axis 2 — Status (what state it's in)

Always a badge pill, in the design-system badge recipe
(`bg-X-500/10 text-X-700 border-X-500/20`):

- confirmed / home → emerald
- action needed / hold expiring → amber
- pending / waitlisted → neutral cream

Status never colors the card body; type never appears as a badge.

### Card anatomy

`[ icon tile ] [ eyebrow · title · when · venue+directions ] [ status badge / action ]`

- **Hero variant** for the single "next" item in a section — larger icon
  tile, Newsreader (`font-display`) title.
- **Venue line** on every game / pickup / class / rental card: a map-pin,
  `Field N · <venue name>`, and a **Directions** chip linking to Google Maps.
- Row titles stay IBM Plex Sans; only hero titles use the serif.

### Color, icons, borders

- Borders → `border-border`. Surfaces → `bg-paper` / `bg-cream-2`. No
  `stone-*`, no `bg-white`, no blue anywhere.
- All icons lucide (the repo already uses `lucide-react`). No emoji.
- The four type hues already exist as tokens; the four faint type **tints**
  are added once (see Architecture) and reused.

## Architecture — where the code changes

**Shared**

- `DashboardSection.astro` — becomes the **panel**: drop the `index` prop;
  render an icon + label header and a slotted body. Add an `icon` prop.
- `src/lib/dashboard/card-types.ts` (new) — the single source of truth
  mapping each type to `{ hue, tintClass, icon, eyebrow }`.
- A shared typed-card component under `src/components/dashboard/shell/` — the
  primitive the Play components and the re-skinned family components compose.
- Design tokens — add the four faint type tints to `globals.css` /
  the Tailwind theme alongside the existing `primary/navy/ochre/sage`.

**Play dashboard — full redesign onto the card system**

`PlayAttention`, `PlayUpcoming`, `PlayMembership`, `PlayExplore`,
`MyDropInBookings`, `MyFieldRentals`.

**Family dashboard**

`family.astro` — panels, the Explore grid, and replacing the blue
phone-verify banner with the ochre attention treatment. The deep components
(`children-overview`, `coach-notes`, `payments-summary`, `announcements`)
are re-skinned to the same card and panel visual language — design-system
color, uniform card chrome, lucide icons. **Their feature logic and existing
data wiring are not changed** — visual only.

The four-hue **type system** applies to *event* cards — games, pickups,
classes, rentals. *Entity* cards (a child, a coach note, an announcement, a
registration) use the same card primitive in its **neutral** form. So
`children-overview` and friends adopt the card chrome but not a type hue;
event sub-rows inside them may carry their type hue where one applies.

## Data layer (in scope, minimal)

`/api/dashboard/play/games` returns, per game, the venue **name**, **address**,
and a Google Maps **directions URL**, so the game card can render the venue
line. Drop-in sessions already expose `session.venueName` and field rentals
expose `venueName`; an address field is added to those payloads where missing
so the Directions chip works everywhere. Exact venue-table fields are
confirmed in the plan.

## Out of scope

- Wiring the still-mock family cards (`CoachNotes`, `PaymentsSummary`) to
  real data — a separate content task.
- The `/account/*` relocation described in the dual-persona spec.
- Any IA change — the four sections and persona routing stay as built.

## States

Keep the repo primitives — `ErrorBanner`, `EmptyState`, `LoadingSkeleton` —
restyled to sit inside panels. Section 1 stays hidden when empty; sections 2
and 3 show per-cluster `EmptyState`; section 4 is always shown.

## Testing

- Build + manual review of both dashboards across all three personas
  (parent-only, player-only, both).
- An API test for the `/api/dashboard/play/games` venue fields, including
  tenant-scoping.
- The existing dual-persona E2E (persona routing, tabs, `aspire_dash`
  cookie) must still pass.

## Open items carried into the plan

- Exact venue-table fields available for the address / Directions URL.
- Whether the typed card is one component with variants or a small family.
