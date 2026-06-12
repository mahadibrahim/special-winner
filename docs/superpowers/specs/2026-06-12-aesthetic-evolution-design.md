# Aesthetic Evolution + Growth Surfaces — design spec

**Date:** 2026-06-12
**Status:** draft — pending founder review
**Builds on:** `docs/superpowers/specs/2026-06-11-public-ia-redesign-design.md` (IA shipped in PRs #171/#172/#174)

## Context

With the IA settled, the founder's verdict on the public surfaces: structurally correct, aesthetically skeletal — and the messaging indexes on operational tablestakes (venues, refs, fees) instead of why people actually sign up. Separately, three growth gaps: no blog (SEO), no surface for urgent announcements, no email-capture incentive.

Settled in brainstorm (founder decisions, 2026-06-12):

1. **Direction: athletic energy through type, color, and graded imagery, with booking-utility information discipline.** Not the "editorial magazine" feel — the founder explicitly disclaims it ("people booking sports leagues aren't looking for a magazine").
2. **Evolution, not reskin.** Existing tokens (cream/ink/navy/primary-orange/ochre/sage/emerald) and fonts (Newsreader/IBM Plex) stay. Email templates, dashboard, admin, checkout: untouched. This is page-level expression on the public marketing surfaces only.
3. **Benefit-led messaging.** Lead: fun · development · fitness. Operational proof (fair refs, two venues, no hidden fees) demotes to supporting copy. Stat boxes of tablestakes are banned.
4. **Stock imagery now, real imagery later** — made cohesive by a mandatory brand grade (below). Some stock video acceptable later; launch with stills.
5. **Voice:** home h1 = **"The best part of your week happens here."** Hero CTAs = **"For Kids"** / **"For Adults"**.
6. **No geographic chrome in heroes.** "Columbus, Ohio" and service-area copy exist for SEO only: page titles/descriptions, footer, `/locations` pages, body copy where natural — never hero badges.
7. **Two-customer rule:** audience-pure one click deep; mixed surfaces only where both customers genuinely stand — home and `/programs`. `/programs` is the catch-all explore catalog (Airbnb-style; already has audience/type/age filter logic) and joins this redesign's scope.
8. **Announcement = hero-docked "Next up" card**, not a top bar (banner-blind). Admin-set, expiry-aware, hides cleanly when empty.

## The image system: one grade makes stock owned

Every photographic image on the public surfaces passes through the same treatment:

```
grayscale(1) contrast(1.08) brightness(.96)
+ overlay: linear-gradient(135deg, rgba(29,45,68,.78), rgba(232,78,27,.32)) @ multiply
(+ optional rgba(232,78,27,.12) @ screen for warmth)
```

Navy→orange duotone wash. Youth-context images may use the emerald variant (`rgba(14,82,60,.74)` start). Implementation: a `GradedImage` component (Astro or React) wrapping `<img>`/`<Image>` with the overlay, so the grade is a one-line opt-in and trivially removable per-image when real photography arrives.

Sourcing: curated free-license images (Unsplash/Pexels), **downloaded and self-hosted** under `public/images/stock/` (no hotlinking in prod), with a `docs/design-system.md` addendum listing each file's source URL for license traceability. Founder reviews the curated set before merge.

## Design-language extensions (added to docs/design-system.md)

- **Graded imagery** (above) — photography never appears ungraded on marketing pages.
- **Accent roles:** orange = adult/primary CTA energy; emerald = youth; ochre = tertiary highlights. Pops are encouraged on marketing surfaces (chips, border-tops, badges) — the "single hot-spot" restraint rule relaxes on the public site only.
- **Benefit trio** pattern: three columns, colored border-top (orange/emerald/ochre), italic serif benefit headline + one supporting sentence. Replaces stat/proof boxes.
- **Audience badge** chips on mixed-surface cards: orange "Adult", emerald "Youth", navy "Pickup".
- **Next-up card** pattern (announcement): paper card, pulse dot, serif title, mono deadline line, accent link.
- What stays: editorial section labels, rules, serif headlines, cream/paper layering.

## Page specs

### Home (`/`)

Per the approved full-page mockup:

1. **Hero** — full-bleed graded photo, h1 "The best part of your week happens here." + one supporting sentence (benefit-led, operations as the quiet second clause), CTAs **For Kids** → `/youth/leagues` (emerald) and **For Adults** → `/adult/leagues` (orange). No location chip. Hero hosts the **Next-up card** (right-docked desktop, below-CTA mobile); when no active announcement, the hero composition reflows full-width.
2. **Benefit trio** — "Actually fun" / "You'll get better" / "Fitness that sticks" (copy per mockup, refinable in implementation).
3. **Open now strip** — 3 soonest-deadline programs across both audiences (existing seasons API, deadline sort), cards with graded thumb, audience badge, name, mono day·venue·price line, deadline accent. "All programs →" → `/programs`.
4. **Blog teaser** — "From the sideline": latest 2 posts, graded thumb + serif title + mono meta (read time, audience tag). Renders only when posts exist.
5. **Capture band** — navy, inline (no popup): incentive copy + email input → existing `/api/public/newsletter` (`source: "home-incentive"`). See Capture section.
6. **Cut from home:** StatsSection (tablestakes), WhyAspire (superseded by benefit trio). **Keep:** FAQSection (SEO), Footer. Testimonials/Partners keep their render-only-with-content behavior.

### Hubs (`/adult`, `/youth`)

Same structure as today (hero + doors), elevated: graded hero image per audience (youth = emerald grade), benefit-led hero copy, doors get graded thumbs + accent treatment, audience-scoped Next-up card when an active announcement targets that audience. Still one screen, still zero islands (announcement renders server-side).

### `/programs` (explore catalog)

Reskin to the new card language (graded thumbs, audience badges, mono info lines) and align its filter chips with the category pages' chip style. Keep its query-param contract (`?audience=`, `?type=`, `?age=`) — it's the nav CTA and "All programs" target. No logic changes beyond presentation unless the existing catalog component fights the card swap.

### Category pages (light touch)

Inherit automatically where they share components (ProgramCardV2 gains the graded-thumb/badge treatment). Hero polish deferred unless trivial.

## Announcement system ("Next up")

- **Data:** single-slot per org — `announcement` JSON on the existing org settings (`{ title, detail, linkUrl, linkLabel, audience: "all"|"adult"|"youth", expiresAt }`). No new table; one active announcement is a deliberate constraint (it's a spotlight, not a feed).
- **Admin:** small form on an existing `/admin` settings surface (title, detail, link, audience, expiry). Clearing or expiry hides it everywhere instantly.
- **Render:** server-side in hero compositions on home + hubs (audience-filtered). No client fetch, no layout shift, hides cleanly.

## Blog

- Astro **content collection** (`src/content/blog/`), markdown with frontmatter (`title, description, publishDate, audience: parent|player|all, heroImage?, draft`).
- Routes: `/blog` (listing, new card language) + `/blog/[slug]` (prerendered article layout — this is where the editorial typography earns its keep), RSS feed.
- Listing AND posts both prerendered (content lives in the repo, so every merge rebuilds them) → auto-included in the sitemap; no `SSR_PUBLIC_PAGES` change needed.
- Authoring: markdown in repo; Claude drafts from playbooks/voice doc, founder reviews — same review gate as all public copy. Launch with 3–4 seed posts (e.g., first co-ed season guide, picking an age group, pickup etiquette, what "well-run league" means).

## Email-capture incentive

- **Mechanics verified:** full discount-code stack already exists (`discount_codes` schema with fixed/percentage types + usage tracking, applied in checkout, input field in the registration payment step). The incentive is campaign configuration, not new code paths.
- **Flow:** capture band → `/api/public/newsletter` (`source: "home-incentive"`) → welcome email (existing Resend welcome series) delivers a fixed-amount code.
- **Founder decisions needed:** amount ($15 is a placeholder), single shared campaign code vs per-signup codes (shared code is the v1 — per-signup uniqueness is a later hardening), and whether the incentive copy appears in the hub capture surfaces too.
- **Placement:** inline band on home only at launch (no modal — popups on current traffic burn trust). Exit-intent/modal variants only if data later argues for them.

## What does not change

Tokens, fonts, email templates, dashboard, admin (beyond the announcement form), checkout/registration flows, SoccerOne tree, nav structure (IA is settled), category-page logic, APIs (one exception: home's strip may want a `limit` param on the seasons endpoint — prefer client-side slice instead).

## Rollout (PR-sized slices, in order)

1. **Foundation:** `GradedImage` + curated self-hosted stock set + design-system doc addendum.
2. **Home page** rebuild on the approved composition (incl. capture band wired to existing newsletter endpoint; incentive copy behind the founder's amount decision).
3. **Announcement system** (org-settings field + admin form + hero cards on home/hubs).
4. **Hubs** elevation.
5. **`/programs`** reskin.
6. **Blog** foundation + seed posts (drafts gated on founder review).
7. **Discount campaign** config + welcome-email update (founder sets amount).

Each slice independently shippable and reversible; measurement via the existing IA funnel (insight `1Gk9pMh8`) plus newsletter-signup source counts.

## Out of scope

Real photography/video shoots; SoccerOne aesthetics; email template redesign; multi-brand theme refactor (this work should *feed* it — the graded-image and accent-role patterns become brand-profile tokens later); testimonials content; modal/exit-intent capture.
