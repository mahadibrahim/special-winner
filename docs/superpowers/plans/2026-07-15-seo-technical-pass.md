# Technical SEO Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the on-site technical-SEO gaps for both brands — emit canonical URLs, add Organization / BreadcrumbList / SportsEvent JSON-LD, flip `about.astro` to SSR, and sweep meta/titles — so both sites rank better on local + long-tail soccer queries.

**Architecture:** All head/meta is centralized in `src/layouts/BaseLayout.astro`; structured data is rendered per-page via `<script type="application/ld+json">` (existing pattern). New pure helpers live in `src/lib/seo/*` and are unit-tested (mirroring `tests/unit/og.test.ts`). The SoccerOne canonical reverse-map reuses the existing `getSoccerOneCanonicalRedirect()` (built from `SOCCERONE_MARKETING_REWRITES`) so the two directions can never drift.

**Tech Stack:** Astro 5 (`output: 'server'`, SSR default), TypeScript, Vitest (unit), Netlify adapter.

## Global Constraints

- **JSON-LD policy:** NO `AggregateRating` / `Review` markup (repo policy — see comment in `src/lib/seo/soccerone-jsonld.ts`). No fabricated data: do not invent `sameAs` social URLs, street addresses, or geo coordinates that don't already exist in the codebase.
- **No visible copy changes:** titles and `<meta name="description">` may be edited; visible headings / hero / body copy must NOT change in this pass.
- **SoccerOne canonical form:** every canonical, breadcrumb `item`, and Event `offers.url` for SoccerOne must use the **short public path** on host `https://www.gosoccerone.com` (never the long-form `/soccerone/*`).
- **BrandId type:** `import type { BrandId } from "@/lib/branding/themes"` (`"aspire" | "soccerone"`).
- **Aspire canonical origin:** `import.meta.env.PUBLIC_APP_URL || "https://aspiresportsohio.com"` (already computed as `PRERENDER_ORIGIN` in BaseLayout).
- **SoccerOne canonical origin:** `https://www.gosoccerone.com` (via `originForBrand("soccerone")`).
- Keep `npx tsc --noEmit` at zero errors; `npm run build` must pass.

---

## File Structure

- Create: `src/lib/seo/canonical.ts` — `resolveCanonicalUrl(brandId, pathname, aspireOrigin)`. Pure.
- Create: `src/lib/seo/breadcrumbs.ts` — `breadcrumbJsonLd(items)`. Pure.
- Create: `src/lib/seo/events.ts` — `seasonsToSportsEvents(seasons, origin)`. Pure.
- Create: `src/lib/seo/aspire-jsonld.ts` — `ASPIRE_ORG_JSONLD` constant (extracted from `about.astro`).
- Create tests: `tests/unit/canonical.test.ts`, `tests/unit/breadcrumbs.test.ts`, `tests/unit/events.test.ts`.
- Modify: `src/layouts/BaseLayout.astro` — emit `<link rel="canonical">`, add `canonical?` prop, point `og:url` at the canonical.
- Modify: `src/pages/about.astro` — remove `prerender`, use shared `ASPIRE_ORG_JSONLD`.
- Modify: `src/pages/index.astro` — render `ASPIRE_ORG_JSONLD`.
- Modify: `src/pages/sports/[slug].astro`, `src/pages/locations/[slug].astro` — add breadcrumbs.
- Modify: SoccerOne subpages (`worthington`, `downtown`, `leagues`, `pickup`, `memberships`, `rent`) — add breadcrumbs.
- Modify: `src/pages/soccerone/leagues.astro` — render SportsEvent JSON-LD.
- Modify (meta sweep): marketing pages missing a unique title/description.

---

### Task 1: Canonical URL resolver

**Files:**
- Create: `src/lib/seo/canonical.ts`
- Test: `tests/unit/canonical.test.ts`

**Interfaces:**
- Consumes: `originForBrand`, `getSoccerOneCanonicalRedirect` from `src/lib/organization/soccerone-routing.ts`; `BrandId` from `src/lib/branding/themes.ts`.
- Produces: `resolveCanonicalUrl(brandId: BrandId | null | undefined, pathname: string, aspireOrigin: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/canonical.test.ts
import { describe, it, expect } from "vitest";
import { resolveCanonicalUrl } from "@/lib/seo/canonical";

const ASPIRE = "https://aspiresportsohio.com";

describe("resolveCanonicalUrl", () => {
  it("builds an Aspire canonical on the Aspire origin", () => {
    expect(resolveCanonicalUrl("aspire", "/youth", ASPIRE)).toBe(
      "https://aspiresportsohio.com/youth",
    );
  });

  it("keeps the root path as '/'", () => {
    expect(resolveCanonicalUrl("aspire", "/", ASPIRE)).toBe(
      "https://aspiresportsohio.com/",
    );
  });

  it("strips a trailing slash from non-root paths", () => {
    expect(resolveCanonicalUrl("aspire", "/youth/leagues/", ASPIRE)).toBe(
      "https://aspiresportsohio.com/youth/leagues",
    );
  });

  it("collapses SoccerOne long-form to the short public path on the SoccerOne host", () => {
    expect(resolveCanonicalUrl("soccerone", "/soccerone/leagues", ASPIRE)).toBe(
      "https://www.gosoccerone.com/leagues",
    );
  });

  it("maps the SoccerOne long-form root to the SoccerOne root", () => {
    expect(resolveCanonicalUrl("soccerone", "/soccerone", ASPIRE)).toBe(
      "https://www.gosoccerone.com/",
    );
  });

  it("falls back to the rendered path for an unmapped SoccerOne path", () => {
    expect(resolveCanonicalUrl("soccerone", "/register/abc", ASPIRE)).toBe(
      "https://www.gosoccerone.com/register/abc",
    );
  });

  it("treats a null brand as Aspire", () => {
    expect(resolveCanonicalUrl(null, "/about", ASPIRE)).toBe(
      "https://aspiresportsohio.com/about",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/canonical.test.ts`
Expected: FAIL — cannot resolve `@/lib/seo/canonical`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/seo/canonical.ts
import type { BrandId } from "@/lib/branding/themes";
import {
  originForBrand,
  getSoccerOneCanonicalRedirect,
} from "@/lib/organization/soccerone-routing";

/**
 * Absolute canonical URL for the current page.
 *
 * Origin is the brand's *canonical* host (not the raw request host): SoccerOne
 * → https://www.gosoccerone.com, Aspire → `aspireOrigin`
 * (PUBLIC_APP_URL). Using the canonical host means preview/branch deploys and
 * apex-vs-www variants all point search engines at the production URL.
 *
 * Path: on SoccerOne hosts the middleware rewrites the short public path
 * (/leagues) into the long-form /soccerone/leagues via next(), so the rendered
 * page observes the long form. `getSoccerOneCanonicalRedirect` (built from
 * SOCCERONE_MARKETING_REWRITES) maps it back to the short public path — the URL
 * we actually want indexed. Unmapped paths (shared routes like /register/*)
 * fall back to the rendered path unchanged.
 */
export function resolveCanonicalUrl(
  brandId: BrandId | null | undefined,
  pathname: string,
  aspireOrigin: string,
): string {
  const origin = originForBrand(brandId) ?? aspireOrigin;
  const shortPath =
    brandId === "soccerone"
      ? getSoccerOneCanonicalRedirect(pathname) ?? pathname
      : pathname;
  return origin + normalizePath(shortPath);
}

function normalizePath(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/canonical.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/canonical.ts tests/unit/canonical.test.ts
git commit -m "feat(seo): canonical URL resolver with SoccerOne short-path reverse map"
```

---

### Task 2: Emit canonical from BaseLayout (+ align og:url)

**Files:**
- Modify: `src/layouts/BaseLayout.astro`

**Interfaces:**
- Consumes: `resolveCanonicalUrl` from `src/lib/seo/canonical.ts` (Task 1).
- Produces: a `canonical?: string` prop on `BaseLayout`; a `<link rel="canonical">` in `<head>`.

- [ ] **Step 1: Add the import**

In the frontmatter import block of `src/layouts/BaseLayout.astro` (next to the existing `resolveOgOrigin` import), add:

```ts
import { resolveCanonicalUrl } from '@/lib/seo/canonical';
```

- [ ] **Step 2: Add the `canonical` prop to the `Props` interface**

In `interface Props { ... }`, add below `favicon?: string;`:

```ts
  /** Override the auto-derived canonical URL. Absolute URL. */
  canonical?: string;
```

- [ ] **Step 3: Destructure the prop and compute the canonical**

In the `const { ... } = Astro.props;` block, add `canonical,` to the destructure. Then, immediately after the existing `const ogUrl = toAbsoluteUrl(Astro.url.pathname, ogOrigin);` line, add:

```ts
// Canonical uses the brand's canonical host (not the raw request origin) so
// preview deploys / apex-vs-www / the SoccerOne long-form path all collapse to
// the one production URL we want indexed. og:url is aligned to it.
const canonicalUrl =
  canonical ?? resolveCanonicalUrl(theme.id, Astro.url.pathname, PRERENDER_ORIGIN);
```

- [ ] **Step 4: Replace the `og:url` value and add the canonical link**

Change the existing og:url meta from `content={ogUrl}` to `content={canonicalUrl}`:

```astro
    <meta property="og:url" content={canonicalUrl} />
```

Then delete the now-unused `const ogUrl = ...` line. Add a canonical `<link>` right before `<link rel="icon" ...>`:

```astro
    <link rel="canonical" href={canonicalUrl} />
```

- [ ] **Step 5: Verify build + types**

Run: `npx tsc --noEmit`
Expected: zero errors.
Run: `npm run build`
Expected: build succeeds (no `ogUrl is not defined` and no unused-var failure).

- [ ] **Step 6: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat(seo): emit rel=canonical from BaseLayout and align og:url to it"
```

---

### Task 3: Shared Aspire Organization JSON-LD + about.astro → SSR + homepage render

**Files:**
- Create: `src/lib/seo/aspire-jsonld.ts`
- Modify: `src/pages/about.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Produces: `ASPIRE_ORG_JSONLD` (a plain object) from `src/lib/seo/aspire-jsonld.ts`.

- [ ] **Step 1: Create the shared constant**

Copy the existing `orgSchema` object verbatim from `src/pages/about.astro` into the new file. Add a `logo` field pointing at the one real brand image asset that exists (`/og/aspire-share.jpg`) as an absolute URL. Do NOT add `sameAs` (no real social URLs exist in the repo).

```ts
// src/lib/seo/aspire-jsonld.ts
// JSON-LD Organization schema for the Aspire brand. Extracted from about.astro
// so the homepage and the about page share one source. `logo` uses the brand
// share card (the only committed brand image); swap to a dedicated square logo
// asset when one exists. Postal addresses intentionally omit streetAddress /
// geo until partner facility agreements are finalized — do not fabricate them.
//
// Policy: NO AggregateRating/Review markup.
export const ASPIRE_ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SportsOrganization",
  name: "Aspire Sports",
  url: "https://aspiresportsohio.com",
  logo: "https://aspiresportsohio.com/og/aspire-share.jpg",
  foundingDate: "2023",
  founder: {
    "@type": "Person",
    name: "Bashir Awl",
    jobTitle: "Founder",
  },
  areaServed: {
    "@type": "City",
    name: "Columbus",
    containedInPlace: {
      "@type": "State",
      name: "Ohio",
    },
  },
  sport: ["Soccer"],
  location: [
    {
      "@type": "Place",
      name: "Aspire Sports — Worthington",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Worthington",
        addressRegion: "OH",
        addressCountry: "US",
      },
    },
    {
      "@type": "Place",
      name: "Aspire Sports — Downtown / OSU",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Columbus",
        addressRegion: "OH",
        addressCountry: "US",
      },
    },
  ],
};
```

- [ ] **Step 2: Update about.astro to use the shared constant and go SSR**

In `src/pages/about.astro`: remove `export const prerender = true;` (line 2), delete the inline `const orgSchema = { ... };` block, and add an import. The frontmatter top becomes:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import { ASPIRE_ORG_JSONLD } from '@/lib/seo/aspire-jsonld';
---
```

Change the render line from `set:html={JSON.stringify(orgSchema)}` to:

```astro
  <script type="application/ld+json" set:html={JSON.stringify(ASPIRE_ORG_JSONLD)} is:inline />
```

- [ ] **Step 3: Render the org schema on the Aspire homepage**

In `src/pages/index.astro`, add the import to the frontmatter:

```ts
import { ASPIRE_ORG_JSONLD } from '@/lib/seo/aspire-jsonld';
```

Add a `<Fragment slot="head">` inside `<BaseLayout ...>` (create it if the page has none; if the page already passes head content, append the script there):

```astro
  <Fragment slot="head">
    <script type="application/ld+json" set:html={JSON.stringify(ASPIRE_ORG_JSONLD)} is:inline />
  </Fragment>
```

- [ ] **Step 4: Verify build + no prerender warning regressions for about**

Run: `npx tsc --noEmit` → zero errors.
Run: `npm run build` → succeeds.
Confirm the build log now shows `about` rendered on-demand (SSR), not prerendered. (`about` no longer appears in the prerendered-routes list.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/aspire-jsonld.ts src/pages/about.astro src/pages/index.astro
git commit -m "feat(seo): share Aspire Organization JSON-LD, render on homepage, SSR about page"
```

---

### Task 4: BreadcrumbList helper + wire into nested pages

**Files:**
- Create: `src/lib/seo/breadcrumbs.ts`
- Test: `tests/unit/breadcrumbs.test.ts`
- Modify: `src/pages/sports/[slug].astro`, `src/pages/locations/[slug].astro`, and SoccerOne subpages.

**Interfaces:**
- Produces: `breadcrumbJsonLd(items: { name: string; url: string }[]): object`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/breadcrumbs.test.ts
import { describe, it, expect } from "vitest";
import { breadcrumbJsonLd } from "@/lib/seo/breadcrumbs";

describe("breadcrumbJsonLd", () => {
  it("builds a positioned BreadcrumbList", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", url: "https://aspiresportsohio.com/" },
      { name: "Sports", url: "https://aspiresportsohio.com/sports" },
      { name: "Soccer", url: "https://aspiresportsohio.com/sports/soccer" },
    ]);
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://aspiresportsohio.com/" },
        { "@type": "ListItem", position: 2, name: "Sports", item: "https://aspiresportsohio.com/sports" },
        { "@type": "ListItem", position: 3, name: "Soccer", item: "https://aspiresportsohio.com/sports/soccer" },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/breadcrumbs.test.ts`
Expected: FAIL — cannot resolve `@/lib/seo/breadcrumbs`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/seo/breadcrumbs.ts
export interface BreadcrumbItem {
  name: string;
  url: string;
}

/** Build a Schema.org BreadcrumbList from an ordered list of crumbs. */
export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/breadcrumbs.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire breadcrumbs into `sports/[slug].astro`**

In `src/pages/sports/[slug].astro` frontmatter, import the helper and the Aspire origin, then build the crumbs from the resolved sport. Add near the other schema consts:

```ts
import { breadcrumbJsonLd } from "@/lib/seo/breadcrumbs";
const ORIGIN = import.meta.env.PUBLIC_APP_URL || "https://aspiresportsohio.com";
const breadcrumbSchema = breadcrumbJsonLd([
  { name: "Home", url: `${ORIGIN}/` },
  { name: "Sports", url: `${ORIGIN}/sports` },
  { name: sport.name, url: `${ORIGIN}/sports/${sport.slug}` },
]);
```

(Use whatever the page already calls the resolved sport object/fields — it already renders `sportSchema` with the sport's name/slug; reuse those exact accessors.) Then, alongside the existing `<script type="application/ld+json" set:html={JSON.stringify(sportSchema)} />`, add:

```astro
  <script type="application/ld+json" set:html={JSON.stringify(breadcrumbSchema)} />
```

- [ ] **Step 6: Wire breadcrumbs into `locations/[slug].astro`**

Same pattern in `src/pages/locations/[slug].astro` (reuse the page's existing location object accessors used by `venueSchema`):

```ts
import { breadcrumbJsonLd } from "@/lib/seo/breadcrumbs";
const ORIGIN = import.meta.env.PUBLIC_APP_URL || "https://aspiresportsohio.com";
const breadcrumbSchema = breadcrumbJsonLd([
  { name: "Home", url: `${ORIGIN}/` },
  { name: "Locations", url: `${ORIGIN}/locations` },
  { name: location.name, url: `${ORIGIN}/locations/${location.slug}` },
]);
```

Add next to `venueSchema`:

```astro
  <script type="application/ld+json" set:html={JSON.stringify(breadcrumbSchema)} />
```

- [ ] **Step 7: Wire breadcrumbs into SoccerOne subpages (short-form URLs)**

For each of `src/pages/soccerone/{worthington/index,downtown/index,leagues,pickup,memberships,rent}.astro`, add to frontmatter:

```ts
import { breadcrumbJsonLd } from "@/lib/seo/breadcrumbs";
const SO = "https://www.gosoccerone.com";
```

Then a per-page crumb using the **short** path (examples — use the matching short path per file: `/worthington`, `/downtown`, `/leagues`, `/pickup`, `/memberships`, `/rent`):

```ts
// worthington/index.astro
const breadcrumbSchema = breadcrumbJsonLd([
  { name: "SoccerOne", url: `${SO}/` },
  { name: "Worthington", url: `${SO}/worthington` },
]);
```

Add inside the page's existing `<Fragment slot="head">`:

```astro
    <script type="application/ld+json" is:inline set:html={JSON.stringify(breadcrumbSchema)} />
```

- [ ] **Step 8: Verify build + types**

Run: `npx tsc --noEmit` → zero errors.
Run: `npm run build` → succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/lib/seo/breadcrumbs.ts tests/unit/breadcrumbs.test.ts "src/pages/sports/[slug].astro" "src/pages/locations/[slug].astro" src/pages/soccerone
git commit -m "feat(seo): BreadcrumbList JSON-LD on sport, location, and SoccerOne pages"
```

---

### Task 5: SportsEvent JSON-LD for SoccerOne leagues

**Files:**
- Create: `src/lib/seo/events.ts`
- Test: `tests/unit/events.test.ts`
- Modify: `src/pages/soccerone/leagues.astro`

**Interfaces:**
- Consumes: the season objects returned by `/api/public/seasons` (already fetched server-side in `leagues.astro` as `seasons`).
- Produces: `seasonsToSportsEvents(seasons: SeasonForEvent[], origin: string): object[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/events.test.ts
import { describe, it, expect } from "vitest";
import { seasonsToSportsEvents } from "@/lib/seo/events";

const base = {
  id: "s1",
  name: "Adult Coed — Sunday",
  startDate: "2026-09-06",
  endDate: "2026-11-01",
  registrationCloses: "2026-08-30",
  price: 95,
  sport: { name: "Soccer" },
  location: { name: "SoccerOne Worthington", city: "Worthington", state: "OH" },
};

describe("seasonsToSportsEvents", () => {
  it("maps a valid season to a SportsEvent with an Offer", () => {
    const [ev] = seasonsToSportsEvents([base], "https://www.gosoccerone.com");
    expect(ev).toMatchObject({
      "@type": "SportsEvent",
      name: "Adult Coed — Sunday",
      sport: "Soccer",
      startDate: "2026-09-06",
      endDate: "2026-11-01",
      location: {
        "@type": "Place",
        name: "SoccerOne Worthington",
        address: { addressLocality: "Worthington", addressRegion: "OH" },
      },
      offers: {
        "@type": "Offer",
        price: 95,
        priceCurrency: "USD",
        url: "https://www.gosoccerone.com/register/s1",
        validThrough: "2026-08-30",
      },
    });
  });

  it("skips seasons with no start date or no positive price", () => {
    expect(seasonsToSportsEvents([{ ...base, startDate: null }], "https://x")).toHaveLength(0);
    expect(seasonsToSportsEvents([{ ...base, price: 0 }], "https://x")).toHaveLength(0);
  });

  it("omits endDate and validThrough when absent", () => {
    const [ev] = seasonsToSportsEvents(
      [{ ...base, endDate: null, registrationCloses: null }],
      "https://x",
    );
    expect(ev).not.toHaveProperty("endDate");
    expect(ev.offers).not.toHaveProperty("validThrough");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/events.test.ts`
Expected: FAIL — cannot resolve `@/lib/seo/events`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/seo/events.ts
// Map public season rows (/api/public/seasons shape) to Schema.org SportsEvent
// objects for JSON-LD. Only emits events with a real future start date and a
// positive price — forming/interest seasons and priceless rows are skipped so
// Google never sees an "event" with no offer.
export interface SeasonForEvent {
  id: string;
  name: string;
  startDate: string | null;
  endDate?: string | null;
  registrationCloses?: string | null;
  price: number | null;
  sport?: { name?: string | null } | null;
  location?: { name?: string | null; city?: string | null; state?: string | null } | null;
}

export function seasonsToSportsEvents(seasons: SeasonForEvent[], origin: string) {
  return seasons
    .filter((s) => !!s.startDate && typeof s.price === "number" && s.price > 0)
    .map((s) => ({
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: s.name,
      sport: s.sport?.name ?? "Soccer",
      startDate: s.startDate as string,
      ...(s.endDate ? { endDate: s.endDate } : {}),
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "Place",
        name: s.location?.name ?? "SoccerOne",
        address: {
          "@type": "PostalAddress",
          addressLocality: s.location?.city ?? "Columbus",
          addressRegion: s.location?.state ?? "OH",
          addressCountry: "US",
        },
      },
      offers: {
        "@type": "Offer",
        price: s.price as number,
        priceCurrency: "USD",
        url: `${origin}/register/${s.id}`,
        availability: "https://schema.org/InStock",
        ...(s.registrationCloses ? { validThrough: s.registrationCloses } : {}),
      },
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/events.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into `soccerone/leagues.astro`**

The page already builds a filtered `seasons` array (excludes `interest` mode and past-start seasons). In the frontmatter, after those filters, add:

```ts
import { seasonsToSportsEvents } from "@/lib/seo/events";
const eventSchema = seasonsToSportsEvents(seasons, "https://www.gosoccerone.com");
```

Inside the existing `<Fragment slot="head">` in that file, add (only render when there is at least one event):

```astro
    {eventSchema.length > 0 && (
      <script type="application/ld+json" is:inline set:html={JSON.stringify(eventSchema)} />
    )}
```

- [ ] **Step 6: Verify build + types**

Run: `npx tsc --noEmit` → zero errors.
Run: `npm run build` → succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/seo/events.ts tests/unit/events.test.ts src/pages/soccerone/leagues.astro
git commit -m "feat(seo): SportsEvent JSON-LD for SoccerOne league seasons"
```

---

### Task 6: Meta / title hygiene sweep

**Files:**
- Modify: any marketing page missing a unique title or description (identified in Step 1).

- [ ] **Step 1: Audit titles and descriptions**

Run this to list every marketing page's `<BaseLayout>` title/description usage:

```bash
grep -rn 'title=' src/pages --include=*.astro | grep -v '/admin/\|/dashboard/\|/coach/\|/account/'
```

For each public marketing page, confirm: (a) it passes an explicit `title`, (b) it passes an explicit `description`. Flag any page that omits `description` (falls back to the brand default — acceptable but not ideal for unique pages) or shares an identical title with another page.

- [ ] **Step 2: Fill gaps (meta only)**

For each flagged page, add or tighten the `description` (≤ ~155 chars, keyword-bearing, geo-qualified where honest) and ensure the `title` is unique and ≤ ~60 chars. Do NOT touch visible headings/hero/body. Example shape (adjust per page — do not over-claim "indoor soccer" on multi-sport Aspire pages):

```astro
  description="Adult indoor soccer pickup in Columbus — drop in at SoccerOne Worthington & Downtown, nightly runs, no team needed."
```

Keep edits minimal: only pages that genuinely lack a description or collide with another page's title.

- [ ] **Step 3: Verify build**

Run: `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages
git commit -m "feat(seo): unique keyword-tuned titles/descriptions on marketing pages"
```

---

### Task 7: Verification — canonical + JSON-LD render correctly per host

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `npx vitest run tests/unit/`
Expected: all pass (including canonical, breadcrumbs, events, og).

- [ ] **Step 2: Type + build gate**

Run: `npx tsc --noEmit` → zero errors.
Run: `npm run build` → succeeds; `about` is no longer in the prerendered list.

- [ ] **Step 3: Live render check (both brands)**

Start the dev server with DB env: `npm run dev:bws` (separate shell). Then:

```bash
# Aspire homepage — canonical on the Aspire origin + Organization JSON-LD present
curl -s http://localhost:4321/ | grep -o '<link rel="canonical"[^>]*>'
curl -s http://localhost:4321/ | grep -c 'SportsOrganization'

# SoccerOne leagues via the SoccerOne host — canonical must be the SHORT form
curl -s -H 'Host: www.gosoccerone.com' http://localhost:4321/leagues | grep -o '<link rel="canonical"[^>]*>'
curl -s -H 'Host: www.gosoccerone.com' http://localhost:4321/leagues | grep -c 'SportsEvent'
```

Expected:
- Aspire `/` canonical → `https://aspiresportsohio.com/`; `SportsOrganization` count ≥ 1.
- SoccerOne `/leagues` canonical → `https://www.gosoccerone.com/leagues` (NOT `/soccerone/leagues`); `SportsEvent` count ≥ 1 when open seasons exist.

- [ ] **Step 4: Sitemap ↔ canonical coherence**

Confirm the SoccerOne sitemap lists the same short-form URLs the canonicals now emit (they are both derived from `SOCCERONE_MARKETING_REWRITES`, so this should hold by construction — verify, don't assume):

```bash
curl -s -H 'Host: www.gosoccerone.com' http://localhost:4321/sitemap.xml | grep -o 'https://[^<]*' | sort -u
```

Expected: entries are short-form (`https://www.gosoccerone.com/leagues`), never `/soccerone/leagues`. No canonical points at a URL absent from the sitemap.

- [ ] **Step 5: Validate JSON-LD**

Copy each rendered `application/ld+json` block into the Google Rich Results Test (or `https://validator.schema.org/`) and confirm zero errors for Organization, BreadcrumbList, and SportsEvent.

- [ ] **Step 6: Final commit (if any doc/notes)**

No code changes expected here. If verification surfaced a fix, commit it with a descriptive message.

---

## Off-site follow-ups (out of scope — for the owner)

Not implemented in this pass; hand to the owner as the highest-leverage non-code SEO work:
1. **Google Business Profile** for each venue (Worthington, Downtown) — the #1 local-pack ranking factor; keep NAP (name/address/phone) identical to the JSON-LD.
2. **Reviews** on the GBP listings (enables the rich-result stars we deliberately don't self-mark-up).
3. **Local citations / backlinks** — youth-sports directories, local league aggregators, partner venue sites.
4. A dedicated **"indoor soccer Columbus" landing page** + FAQ/guide content (deferred content track from the spec).
