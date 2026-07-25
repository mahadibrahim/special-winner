# Technical SEO Pass — Aspire Sports & SoccerOne

**Date:** 2026-07-15
**Branch:** `feat/seo-technical-pass` (off `feat/link-preview-og-cards`)
**Status:** Design — approved for spec

## Goal

Raise organic search visibility for both brands on **local + long-tail soccer
intent** — e.g. "indoor soccer Columbus", "indoor soccer Worthington", "adult
soccer league Columbus", "futsal Columbus", "soccer leagues near me". This is an
**on-site technical + structured-data + meta** pass only. No visible marketing
copy is rewritten in this pass, and no off-site work (Google Business Profile,
backlinks, reviews) is in scope.

### Explicit expectation-setting

Ranking for the bare head term **"soccer"** (national SERP dominated by
MLS/FIFA/Wikipedia) is **not** an achievable outcome of on-site work and is a
non-goal. The winnable targets are geo-qualified and long-tail queries where
these sites have genuine relevance. SoccerOne is already keyword-dense for
indoor soccer; this pass removes the *technical* ceilings (duplicate content,
missing structured data) that hold both sites back regardless of copy.

## Current state (audit summary)

The platform is a multi-tenant Astro 5 app (`output: 'server'`, SSR default,
Netlify). Brand is resolved from the request host in middleware →
`Astro.locals.brandId` → `getBrandTheme()`. `src/layouts/BaseLayout.astro` is the
single head/meta component (title, description, Open Graph, Twitter cards; OG
share cards landed in `c2efc76d`).

**Confirmed gaps this pass addresses:**

1. **No `<link rel="canonical">` anywhere.** Only `og:url` is emitted. SoccerOne
   serves identical content under two path forms — the short public path
   (`gosoccerone.com/pickup`, via `SOCCERONE_MARKETING_REWRITES`) and the
   underlying `/soccerone/pickup` — creating a real duplicate-content risk.
2. **Aspire homepage has no Organization/LocalBusiness JSON-LD.** Only
   `about.astro` carries `SportsOrganization` markup, and it is rendered in the
   body slot, not `<head>`.
3. **No `BreadcrumbList` and no `Event`/`SportsEvent` JSON-LD** anywhere, despite
   request-time season data being available (see §Event schema).
4. **`about.astro` is the lone prerendered marketing page** (`prerender = true`),
   so its canonical/OG origin bakes to the `PUBLIC_APP_URL` fallback rather than
   the live request host.

**What already exists and is NOT re-done:** per-page titles/descriptions,
host-aware dynamic `sitemap.xml`/`robots.txt` (`src/lib/seo/tenant-seo.ts`,
`@astrojs/sitemap`), SoccerOne `SportsActivityLocation` + venue JSON-LD
(`src/lib/seo/soccerone-jsonld.ts`), `FAQPage` schema on `sports/[slug]` and
`locations/[slug]`, and the brand OG share cards.

## Work items

### 1. Canonical URLs (highest value)

Emit `<link rel="canonical" href="...">` from `BaseLayout.astro`.

- **Origin:** reuse the existing OG origin resolver (`resolveOgOrigin` in
  `src/lib/branding/og.ts`) — SSR uses the real request origin; the prerender
  fallback path is eliminated for marketing pages once `about.astro` goes SSR
  (§5).
- **Path — SoccerOne reverse map (critical):** canonical must always emit the
  **short public-path form** so Google collapses `/soccerone/pickup` →
  `gosoccerone.com/pickup`. Add a reverse lookup derived from
  `SOCCERONE_MARKETING_REWRITES` (`src/lib/organization/soccerone-routing.ts`)
  so it stays in sync with the forward map. On SoccerOne hosts, map the rendered
  `/soccerone/*` pathname back to its short form before building the canonical;
  a `/soccerone/*` path with no reverse entry falls back to itself (safe
  default) and is flagged for review.
- **Normalization:** strip query strings and trailing slashes consistently
  (root stays `/`). Canonical for `/pickup?audience=youth` is
  `https://gosoccerone.com/pickup`.
- **Override:** add an optional `canonical?: string` prop to `BaseLayout` for the
  rare page needing an explicit override.
- **Coherence:** canonical URLs and sitemap URLs must agree (both short-form for
  SoccerOne) — see §7.

### 2. Organization / LocalBusiness JSON-LD on both homepages

- Extract Aspire's `SportsOrganization` markup out of `about.astro` into a shared
  `src/lib/seo/aspire-jsonld.ts` (mirroring `soccerone-jsonld.ts`). Include:
  `@type: SportsOrganization`, name, url, logo, `sameAs` (social profiles),
  `foundingDate`, and venue `SportsActivityLocation` sub-entities with
  `PostalAddress` + geo + `OpeningHoursSpecification`.
- Render it via `<Fragment slot="head">` on the Aspire homepage (`index.astro`),
  and keep `about.astro` rendering the same shared constant (moved to `<head>`
  slot for consistency).
- **SoccerOne:** already has homepage Organization-level markup — verify parity
  only (ensure `logo`, `sameAs`, and `url` are present; no new entity needed).
- **Policy:** NO `AggregateRating`/`Review` markup (existing repo policy, see
  the comment in `soccerone-jsonld.ts`).

### 3. BreadcrumbList JSON-LD on nested pages

Emit `BreadcrumbList` via `slot="head"` on:

- `src/pages/sports/[slug].astro` (Home → Sports → {Sport})
- `src/pages/locations/[slug].astro` (Home → Locations → {Location})
- SoccerOne sub-pages: `worthington`, `downtown`, `leagues`, `pickup`,
  `memberships`, `rent` (Home → {Page}), using **short-form** URLs for `item`.

Add a small `breadcrumbJsonLd(items)` helper in `src/lib/seo/` so pages pass a
list of `{name, url}` rather than hand-authoring the JSON.

### 4. Event / SportsEvent JSON-LD for leagues & seasons

Data source confirmed: `/api/public/seasons` returns per-season `name`,
`startDate`, `endDate`, `registrationCloses`, `price`, `teamPrice`, and
`location` (`name`, `city`, `state`). The SoccerOne leagues page
(`src/pages/soccerone/leagues.astro`) already fetches this **server-side**.

- Add a `seasonsToSportsEvents(seasons, origin)` helper in `src/lib/seo/` that
  maps published, non-`forming`, not-yet-started seasons to `SportsEvent`
  objects: `name`, `sport`, `startDate`, `endDate`, `location` (`Place` with
  `PostalAddress` from the venue), and `offers` (`Offer` with `price`,
  `priceCurrency: "USD"`, `availability`, `validThrough` = `registrationCloses`,
  `url` = the register URL).
- Render as an array (or `ItemList` of events) via `slot="head"` on
  `soccerone/leagues.astro`.
- **Aspire:** its league pages (`adult/leagues.astro`, `youth/leagues.astro`,
  `leagues.astro`) fetch season data **client-side** via `CategoryFinder`, so
  Event schema is **best-effort**: add a lightweight server-side seasons fetch to
  the Aspire leagues page(s) to power the JSON-LD, OR defer Aspire Event schema
  if the fetch adds meaningful request cost. Decide during planning; SoccerOne
  Event schema is the committed deliverable, Aspire Event schema is stretch.
- **Guard:** only emit events with a valid future `startDate` and a real price;
  never emit `SportsEvent` for `forming`/interest-only seasons (mirrors the
  existing register-CTA filter in `leagues.astro`).

### 5. `about.astro` → SSR

Remove `export const prerender = true;` from `src/pages/about.astro` so its
canonical and OG origins resolve to the live request host like every other
marketing page. Verify it still builds and that the shared Organization JSON-LD
(§2) renders correctly under SSR.

### 6. Meta / title hygiene sweep

Audit every marketing page (both brands) for:

- A unique `<title>` ≤ ~60 chars.
- A present, keyword-bearing `description` ≤ ~155 chars (fill any gaps).
- No two pages sharing an identical title/description.

**Meta only** — no visible headings, hero, or body copy changed. Aspire is
multi-sport; do not over-claim "indoor soccer" where the page isn't about it.

### 7. Sitemap coherence

- Confirm sitemap URLs match canonicals (both short-form for SoccerOne; Aspire
  absolute URLs on the Aspire origin).
- Confirm no valuable page is excluded and no private prefix leaked.
- (Optional, low priority) evaluate adding `lastmod` — currently deliberately
  omitted; leave as-is unless trivially correct.

## Architecture & interfaces

New/changed modules, each with one clear purpose:

- `src/lib/seo/canonical.ts` (new) — `resolveCanonical({ origin, brandId, pathname })`
  → absolute canonical URL. Owns the SoccerOne reverse-map + normalization. Pure,
  unit-testable.
- `src/lib/organization/soccerone-routing.ts` (edit) — export a
  `soccerOneShortPath(pathname)` reverse lookup derived from
  `SOCCERONE_MARKETING_REWRITES` (single source of truth for both directions).
- `src/lib/seo/aspire-jsonld.ts` (new) — `ASPIRE_ORG_JSONLD` constant (+ venue
  sub-entities), mirroring `soccerone-jsonld.ts`.
- `src/lib/seo/breadcrumbs.ts` (new) — `breadcrumbJsonLd(items)` helper.
- `src/lib/seo/events.ts` (new) — `seasonsToSportsEvents(seasons, origin)` helper.
- `src/layouts/BaseLayout.astro` (edit) — emit `<link rel="canonical">`; add
  optional `canonical` prop.
- Page edits: `index.astro` (org JSON-LD), `about.astro` (SSR + shared org
  JSON-LD), `sports/[slug].astro` & `locations/[slug].astro` (breadcrumbs),
  `soccerone/*` sub-pages (breadcrumbs), `soccerone/leagues.astro` (events),
  plus meta/title fills across marketing pages.

## Testing

- **Unit** (`tests/unit/`): `resolveCanonical` — SoccerOne reverse-map
  (`/soccerone/pickup` → `https://gosoccerone.com/pickup`), query/trailing-slash
  normalization, Aspire pass-through, unknown `/soccerone/*` fallback. Plus
  `seasonsToSportsEvents` shape/guard tests (skips forming/past/priceless).
- **JSON-LD validity:** assert each generated block is valid JSON and carries the
  expected `@type`/required fields.
- **Build:** `npm run build` — catches SSR/prerender regressions from the
  `about.astro` flip and any head-slot issues.
- **Type check:** `npx tsc --noEmit` stays at zero errors.

## Non-goals

- Visible marketing copy / headline / hero rewrites.
- New landing pages (e.g. a dedicated "indoor soccer Columbus" page) or expanded
  FAQ/guide content.
- Off-site SEO: Google Business Profile, reviews, backlinks, local citations.
  (A short list of the highest-leverage off-site items will be appended to the
  final summary for the owner, but no work is done on them here.)
- `AggregateRating`/`Review` schema (existing policy).
- Sitemap `lastmod`/priority changes beyond coherence checks.
