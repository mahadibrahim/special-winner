# Link-preview share cards + Open Graph meta tags

**Date:** 2026-07-15
**Status:** Approved design, pre-implementation
**Scope:** `src/lib/branding/themes.ts`, `src/layouts/BaseLayout.astro`, one new build script, two committed PNGs.

## Problem

Links to `aspiresportsohio.com` and `gosoccerone.com` shared via iMessage, WhatsApp,
or social render as a bare title + URL with no image. Root cause:

- `BaseLayout.astro` emits `og:title`, `og:description`, `og:type` and an `og:image`
  **only when a page passes an `ogImage` prop — and no page anywhere passes one.**
- There is no `twitter:card`, `og:url`, `og:site_name`, image dimensions, or
  absolute-URL handling. iMessage and WhatsApp key their large rich preview off an
  **absolute** `og:image` URL, which never exists today.
- There are no share-image assets in `/public`.

## Goal

Every link from either domain unfurls with that brand's polished share card plus a
correct title/description, on iMessage, WhatsApp, and Twitter/X — with no per-page work
required. Pages retain the ability to override `ogImage`/`title`/`description` later.

Non-goals: dynamic per-page generated images (explicitly deferred — a future layer can
slot in behind the same `ogImage` prop). No schema, no new routes.

## Design

### 1. Share-card assets — `scripts/generate-og-cards.ts`

A committed, re-runnable Node script using the already-installed `sharp` (0.34.5).
It composites two `1200×630` PNGs (the standard OG size; renders cleanly at the small
dimensions iMessage/WhatsApp display) into `public/og/`:

- **Aspire** → `public/og/aspire-share.png`
  - Background: `public/images/coaching-hero.jpg`, cover-cropped to 1200×630.
  - Overlay: left-to-right / bottom dark gradient for text legibility.
  - Foreground: Aspire logo (`public/images/logo.svg` white/knockout variant, or
    `logo-black.png` recolored) + tagline **"Evidence-based youth & adult sports · Central Ohio."**
- **SoccerOne** → `public/og/soccerone-share.png`
  - Background: `public/media/soccerone/still-action.jpg`, cover-cropped to 1200×630.
  - Overlay: dark gradient.
  - Foreground: SoccerOne wordmark (`public/images/soccerone-wordmark.png`) + tagline
    **"Indoor soccer in Columbus · Leagues · Pickup · Field rentals."**

Text/gradient are drawn as an SVG overlay rasterized and composited by sharp — fully
deterministic, no browser/screenshot dependency (avoids the fixed-viewport hazard).

**Output PNGs are committed to git.** Production serves them as plain static files; there
is no runtime image generation. The script is re-run only to change a card.

Checkpoint: after generation, the two rendered PNGs are shown to the owner for visual
approval **before** the meta-tag wiring lands.

### 2. Per-brand theme config — `src/lib/branding/themes.ts`

Add three fields to `BrandTheme`:

- `ogImage: string` — path to the committed card (`/og/aspire-share.png`, `/og/soccerone-share.png`).
- `ogImageAlt: string` — alt text for `og:image:alt` / accessibility.
- `canonicalOrigin: string` — `https://www.aspiresportsohio.com` /
  `https://www.gosoccerone.com`. Used **only** as the absolute-URL base for prerendered
  pages (see §3).

### 3. `BaseLayout.astro` head — the fix

- Default the `ogImage` prop to `theme.ogImage` (was `undefined`).
- Resolve an absolute base origin:
  - **SSR page** (`!Astro.isPrerendered`): use `Astro.url.origin` — the real request host,
    correct for both `aspiresportsohio.com` and `gosoccerone.com`.
  - **Prerendered page** (always brand = aspire; `site:` is unset so `Astro.url.origin`
    would be `localhost` at build): use `theme.canonicalOrigin`.
- Build `ogImageUrl = new URL(ogImage, baseOrigin).href` and `pageUrl` from the same base +
  `Astro.url.pathname`.
- Emit in `<head>`:
  - `og:url` = pageUrl
  - `og:site_name` = `theme.displayName`
  - `og:image` = ogImageUrl, `og:image:secure_url` = ogImageUrl
  - `og:image:width` = `1200`, `og:image:height` = `630`
  - `og:image:type` = `image/png`
  - `og:image:alt` = `theme.ogImageAlt` (or page override)
  - `twitter:card` = `summary_large_image`
  - `twitter:title` = brandedTitle, `twitter:description` = description, `twitter:image` = ogImageUrl

Existing `og:title`/`og:description`/`og:type` and the `brandedTitle` logic are unchanged.

## Data flow

`middleware.brandFromHost(host)` → `Astro.locals.brandId` → `getBrandTheme()` → `theme.ogImage`
/ `theme.canonicalOrigin`. SoccerOne marketing pages are already SSR-only (per the
"SoccerOne rewrite requires SSR" invariant), so they always hit the SSR branch and resolve
`gosoccerone.com` from the request. Prerendered pages are always Aspire, so the aspire
canonical origin is always correct for them.

## Error / edge handling

- A page that passes its own `ogImage` still wins over the brand default (prop default only
  fills the gap).
- Relative `ogImage` overrides are resolved against the same base origin, so page overrides
  also get absolute URLs.
- If a photo asset is missing at build time, the generate script fails loudly (does not emit a
  blank card).

## Testing

- Unit test the absolute-URL resolver (SSR origin vs prerender canonical; relative vs already-absolute
  `ogImage`) in `tests/unit/`.
- Manual: `npm run build`, then check emitted `<head>` of an Aspire and a SoccerOne page for the
  full tag set with absolute URLs; validate the unfurl with a preview debugger
  (opengraph.xyz / Facebook Sharing Debugger) against the committed PNG.

## Rollout order

1. Write + run `generate-og-cards.ts`; commit the two PNGs. **Show PNGs to owner for approval.**
2. On approval, add theme fields + BaseLayout meta tags + unit test.
3. `npm run build` + `npx tsc --noEmit`; verify head output; push.
