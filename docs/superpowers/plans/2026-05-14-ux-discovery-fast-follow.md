# UX Discovery — Fast-Follow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the production-readiness gaps from the UX discovery branch's final review — real `?age=` filtering, eliminate fetch-to-self in the index pages, add a sitemap, and browser-verify the footer fix — so the branch can merge to `main` (= prod).

**Architecture:** Four tasks. FF-1 mirrors the already-shipped `?type=` param pattern for age bands. FF-2 extracts the public-filters DB query into a shared lib module so `/sports` and `/locations` index pages query the DB directly instead of HTTP-fetching their own API. FF-3 adds `@astrojs/sitemap`. FF-4 is browser verification of the footer grid fix. No schema changes.

**Tech Stack:** Astro 5 (`output: 'server'`), React 19 islands, Drizzle ORM, Tailwind CSS 4, Playwright/Vitest.

**Context:** Continues the work in `docs/superpowers/plans/2026-05-14-ux-discovery-conversion.md`. The final whole-implementation review flagged: (a) `/youth` age-band buttons all link to the same unfiltered URL; (b) `/sports` + `/locations` index pages `fetch()` their own `/api/public/filters` endpoint; (c) no `@astrojs/sitemap`; (d) the footer grid fix was math-verified but not browser-verified. The user explicitly scoped all four into this fast-follow and chose "wire up real `?age=` filtering" for the age bands.

Key facts confirmed during planning:
- `/api/public/filters` (`src/pages/api/public/filters.ts`) is NOT tenant-scoped — it runs two plain global Drizzle `selectDistinct` queries. So extracting them into a shared helper is safe and introduces no scoping concerns.
- `programs-catalog.tsx` already has `activeAgeBand` state and an `ageBands` array with keys `"4-8"`, `"9-12"`, `"13-18"`. `?age=` just needs the same wiring `?type=` got in the prior plan's Task 5.
- `astro.config.mjs` has no `site` set; `@astrojs/sitemap` requires it. `PUBLIC_APP_URL` is the project's existing base-URL env var (in `.env.example`, set in Netlify build envs).

---

## File Structure

- Modify: `src/pages/programs/index.astro` — parse `?age=`, pass `initialAgeBand`.
- Modify: `src/components/programs/programs-catalog.tsx` — `initialAgeBand` prop, init `activeAgeBand` from it.
- Modify: `src/pages/youth.astro` — give the three age-band links distinct `&age=` hrefs, remove the now-resolved TODO.
- Create: `src/lib/programs/public-filters.ts` — `getPublicSports()` + `getPublicLocations()`, the queries extracted from `filters.ts`.
- Modify: `src/pages/api/public/filters.ts` — call the shared helpers instead of inlining the queries.
- Modify: `src/pages/sports/index.astro` — call `getPublicSports()` directly; drop the `fetch`.
- Modify: `src/pages/locations/index.astro` — call `getPublicLocations()` directly; drop the `fetch`.
- Modify: `astro.config.mjs` — add `site` + `@astrojs/sitemap`.
- Modify: `package.json` / `package-lock.json` — `@astrojs/sitemap` dependency (via `npm install`).

---

### Task FF-1: Wire up real `?age=` filtering

**Files:**
- Modify: `src/pages/programs/index.astro`
- Modify: `src/components/programs/programs-catalog.tsx`
- Modify: `src/pages/youth.astro`

This mirrors EXACTLY the `?type=` / `initialType` wiring already present in these two files (shipped in the prior plan's Task 5). Read how `initialType` flows end-to-end and replicate it for `initialAgeBand`.

- [ ] **Step 1: Parse `?age=` in `src/pages/programs/index.astro`**

In the frontmatter, directly after the existing `?type=` parsing block (the one that defines `rawType` / `VALID_TYPES` / `programType`), add:

```typescript
// Age-band preselect from query param: ?age=4-8|9-12|13-18 (youth catalog only)
const rawAge = Astro.url.searchParams.get("age");
const VALID_AGE_BANDS = ["4-8", "9-12", "13-18"] as const;
const ageBand =
  rawAge && (VALID_AGE_BANDS as readonly string[]).includes(rawAge)
    ? (rawAge as (typeof VALID_AGE_BANDS)[number])
    : null;
```

Then update the `<ProgramsCatalog ... />` element to pass the new prop alongside the existing ones:

```astro
      <ProgramsCatalog client:load initialAudience={audience} initialType={programType} initialAgeBand={ageBand} />
```

- [ ] **Step 2: Add `initialAgeBand` to `ProgramsCatalog`**

In `src/components/programs/programs-catalog.tsx`:

Update the `Props` interface — it currently has `initialAudience` and `initialType`. Add a third line:

```tsx
  initialAgeBand?: string | null
```

Update the component signature to destructure it (it currently destructures `{ initialAudience, initialType }`):

```tsx
export default function ProgramsCatalog({ initialAudience, initialType, initialAgeBand }: Props) {
```

Find the existing `activeAgeBand` state declaration. It currently is:

```tsx
  const [activeAgeBand, setActiveAgeBand] = useState<string | null>(null)
```

Change its initializer to read from the prop:

```tsx
  const [activeAgeBand, setActiveAgeBand] = useState<string | null>(initialAgeBand ?? null)
```

That is the ONLY change needed in the component body — `activeAgeBand` is already wired into the `filtered` useMemo (guarded by `audience === "youth"`) and into the pagination-reset `useEffect` dependency array. Do NOT add new filter logic; it already exists. Verify by reading the file that `activeAgeBand` is already consumed in both places (it is — confirm, don't re-add).

- [ ] **Step 3: Give the `/youth` age-band links real hrefs**

In `src/pages/youth.astro`, find the `ageBands` array. It currently has a TODO comment above it and three entries all pointing at `/programs?audience=youth`. Replace the comment + array with:

```typescript
const ageBands = [
  { label: "Ages 4–8", href: "/programs?audience=youth&age=4-8" },
  { label: "Ages 9–12", href: "/programs?audience=youth&age=9-12" },
  { label: "Ages 13–18", href: "/programs?audience=youth&age=13-18" },
];
```

(The TODO comment that FF added — `// TODO: these all link to the unfiltered youth catalog ...` — is now resolved; remove it entirely.)

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS (the `Astro.request.headers` prerender warnings are known pre-existing noise).

- [ ] **Step 5: Visual check**

If a browser is available: `npm run dev`, open `http://localhost:4321/programs?audience=youth&age=9-12` — confirm the catalog loads with the 9–12 age band pre-selected (only 9–12 programs shown, the age chip active). Open `http://localhost:4321/youth` and confirm the three age-band pills now point at distinct `&age=` URLs. If no browser, say so — tsc + build is the hard gate.

- [ ] **Step 6: Commit**

```bash
git add src/pages/programs/index.astro src/components/programs/programs-catalog.tsx src/pages/youth.astro
git commit -m "feat(programs): real ?age= band filtering on the youth catalog"
```

---

### Task FF-2: Extract public-filters query into a shared helper; drop fetch-to-self

**Files:**
- Create: `src/lib/programs/public-filters.ts`
- Modify: `src/pages/api/public/filters.ts`
- Modify: `src/pages/sports/index.astro`
- Modify: `src/pages/locations/index.astro`

`/sports` and `/locations` index pages currently `fetch()` their own `/api/public/filters` endpoint server-side — an unnecessary HTTP round-trip with a cold-start failure mode. The endpoint's two queries are plain global Drizzle queries (no tenant scoping). Extract them into a shared lib module that both the API route and the two pages import.

- [ ] **Step 1: Create the shared helper**

Create `src/lib/programs/public-filters.ts` with EXACTLY this content (the two query bodies are lifted verbatim from `src/pages/api/public/filters.ts`):

```typescript
/**
 * Shared public-filter queries — the sports and locations that have at least
 * one open/active, non-test season attached. Used by the public filters API
 * route AND by the /sports and /locations index pages so neither has to make
 * an HTTP round-trip to itself.
 *
 * These are intentionally global (not tenant-scoped) — they mirror exactly
 * what /api/public/filters has always returned.
 */
import { db } from "@/lib/db";
import { sports, locations, programs, seasons } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export interface PublicSport {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
}

export interface PublicLocation {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  state: string | null;
  latitude: string | null;
  longitude: string | null;
  sortOrder: number | null;
}

/** Sports with at least one open/active, non-test season. Empty array on DB error. */
export async function getPublicSports(): Promise<PublicSport[]> {
  try {
    if (!db) throw new Error("No DB");
    return await db
      .selectDistinct({
        id: sports.id,
        name: sports.name,
        slug: sports.slug,
        icon: sports.icon,
        color: sports.color,
      })
      .from(sports)
      .innerJoin(programs, eq(programs.sportId, sports.id))
      .innerJoin(seasons, eq(seasons.programId, programs.id))
      .where(
        and(
          eq(programs.active, true),
          eq(programs.isTest, false),
          eq(seasons.isTest, false),
          sql`${seasons.status} IN ('open', 'active')`,
        ),
      );
  } catch (err) {
    console.error("getPublicSports failed:", err);
    return [];
  }
}

/** Locations with at least one open/active, non-test season. Empty array on DB error. */
export async function getPublicLocations(): Promise<PublicLocation[]> {
  try {
    if (!db) throw new Error("No DB");
    return await db
      .selectDistinct({
        id: locations.id,
        name: locations.name,
        slug: locations.slug,
        description: locations.description,
        city: locations.city,
        state: locations.state,
        latitude: locations.latitude,
        longitude: locations.longitude,
        sortOrder: locations.sortOrder,
      })
      .from(locations)
      .innerJoin(programs, eq(programs.locationId, locations.id))
      .innerJoin(seasons, eq(seasons.programId, programs.id))
      .where(
        and(
          eq(locations.active, true),
          eq(programs.active, true),
          eq(programs.isTest, false),
          eq(seasons.isTest, false),
          sql`${seasons.status} IN ('open', 'active')`,
        ),
      )
      .orderBy(locations.sortOrder, locations.name);
  } catch (err) {
    console.error("getPublicLocations failed:", err);
    return [];
  }
}
```

- [ ] **Step 2: Rewrite `src/pages/api/public/filters.ts` to use the helpers**

Replace the ENTIRE contents of `src/pages/api/public/filters.ts` with:

```typescript
import type { APIRoute } from "astro";
import { getPublicSports, getPublicLocations } from "@/lib/programs/public-filters";

/**
 * Public filter options for the homepage / programs directory.
 *
 * Returns sports + locations that have at least one open or active season
 * attached, so the filter UI never shows a venue with nothing to register
 * for. The queries live in @/lib/programs/public-filters so the /sports and
 * /locations index pages can call them directly without an HTTP round-trip.
 */
export const GET: APIRoute = async () => {
  const [sports, locations] = await Promise.all([
    getPublicSports(),
    getPublicLocations(),
  ]);

  return new Response(JSON.stringify({ sports, locations }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

Note: the helpers already swallow DB errors and return `[]`, so the route no longer needs its own try/catch — the response shape (`{ sports: [...], locations: [...] }`) is unchanged, and the empty-array fallback behavior is preserved.

- [ ] **Step 3: Rewrite `src/pages/sports/index.astro` frontmatter to call the helper directly**

In `src/pages/sports/index.astro`, replace the frontmatter (everything between the `---` fences) with:

```astro
---
// SSR — queries the public sports list directly via the shared helper.
// New page default per CLAUDE.md.
import BaseLayout from "@/layouts/BaseLayout.astro";
import { getPublicSports } from "@/lib/programs/public-filters";

const sports = await getPublicSports();
---
```

Leave the entire template (the markup after the closing `---`) UNCHANGED — it already maps over a `sports` variable with `{ id, name, slug, icon }` fields, and `PublicSport` provides exactly those (plus `color`, which the template ignores). The empty-state branch (`sports.length === 0`) still works because `getPublicSports()` returns `[]` on error.

- [ ] **Step 4: Rewrite `src/pages/locations/index.astro` frontmatter to call the helper directly**

In `src/pages/locations/index.astro`, replace the frontmatter (everything between the `---` fences) with:

```astro
---
// SSR — queries the public locations list directly via the shared helper.
// New page default per CLAUDE.md.
import BaseLayout from "@/layouts/BaseLayout.astro";
import { getPublicLocations } from "@/lib/programs/public-filters";

const locations = await getPublicLocations();
---
```

Leave the entire template UNCHANGED — it maps over a `locations` variable using `{ id, name, slug, city, state }`, all of which `PublicLocation` provides. The empty-state branch still works.

- [ ] **Step 5: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. Confirm there are no remaining references to the old inline query in `filters.ts` and no `fetch(`...`/api/public/filters`)` calls left in the two index pages — grep to be sure:
```bash
grep -rn "api/public/filters" src/pages/sports/index.astro src/pages/locations/index.astro
```
Expected: zero hits.

- [ ] **Step 6: Verify the API route still works**

If a browser/curl is available: `npm run dev`, then `curl -s http://localhost:4321/api/public/filters | head -c 200` — confirm it still returns `{"sports":[...],"locations":[...]}`. Open `http://localhost:4321/sports` and `http://localhost:4321/locations` — confirm they still render. If no dev server, say so — tsc + build + the grep are the gate.

- [ ] **Step 7: Commit**

```bash
git add src/lib/programs/public-filters.ts src/pages/api/public/filters.ts src/pages/sports/index.astro src/pages/locations/index.astro
git commit -m "refactor(programs): shared public-filters helper, drop fetch-to-self in index pages"
```

---

### Task FF-3: Add `@astrojs/sitemap`

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm install`)
- Modify: `astro.config.mjs`

The nav + footer rework was SEO-motivated; a sitemap is foundational. The user has signed off on this dependency install. `@astrojs/sitemap` requires `site` to be set in the Astro config; drive it from the existing `PUBLIC_APP_URL` env var with a localhost fallback (mirrors how `.env.example` defaults it).

- [ ] **Step 1: Install the integration**

Run: `npm install @astrojs/sitemap`
This adds `@astrojs/sitemap` to `package.json` dependencies and updates `package-lock.json`.

- [ ] **Step 2: Configure `astro.config.mjs`**

Replace the entire contents of `astro.config.mjs` with:

```javascript
// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// `site` is required by @astrojs/sitemap to emit absolute URLs. Driven by
// PUBLIC_APP_URL (set per-environment in Netlify build env; defaults to
// localhost for local/CI builds, same as .env.example).
const site = process.env.PUBLIC_APP_URL || 'http://localhost:4321';

// https://astro.build/config
export default defineConfig({
  site,
  integrations: [react(), sitemap()],
  adapter: netlify(),
  output: 'server',

  vite: {
    plugins: [tailwindcss()]
  }
});
```

- [ ] **Step 3: Build and verify the sitemap is emitted**

Run: `npm run build`
Expected: PASS. After the build, confirm the sitemap files were generated:
```bash
ls dist/sitemap*.xml
```
Expected: `dist/sitemap-index.xml` and `dist/sitemap-0.xml` exist. Then:
```bash
grep -o '<loc>[^<]*</loc>' dist/sitemap-0.xml | head -20
```
Expected: a list of `<loc>` URLs for the static-path pages (`/`, `/youth`, `/adult`, `/shop`, `/sports`, `/locations`, `/about`, `/programs`, etc.), all prefixed with the `site` value. NOTE: `@astrojs/sitemap` with `output: 'server'` includes pages with statically-known routes; dynamic `[slug]` routes are omitted by default — that is acceptable for this task (a `customPages` enhancement for slug routes is a future follow-up, not in scope here). If ZERO pages appear, or the build fails, STOP and report — that's a real problem.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json astro.config.mjs
git commit -m "feat(seo): add @astrojs/sitemap with PUBLIC_APP_URL-driven site"
```

---

### Task FF-4: Browser-verify the footer grid fix and the new pages

**Files:** none — verification only.

The footer grid fix (`lg:grid-cols-[repeat(16,minmax(0,1fr))]`) from the main plan was math-verified but never browser-verified. This task confirms it renders correctly and spot-checks the new pages.

- [ ] **Step 1: Start the dev server**

Run `npm run dev` (background). Wait until `http://localhost:4321` responds.

- [ ] **Step 2: Verify the footer**

Open `http://localhost:4321/` in a browser. Scroll to the footer. Confirm:
- At desktop width (≥1024px): the brand/newsletter column + all six link columns (Youth, Adult, Sports, Aspire, Support, Connect) sit on a SINGLE row — no wrap to a second row.
- Narrow the window below 1024px: columns reflow to the `md:grid-cols-2` / `grid-cols-1` responsive layout cleanly — no overflow, no overlap.

- [ ] **Step 3: Spot-check the new pages**

In the browser, load each and confirm it renders without console errors and the layout is intact:
- `/youth` — green hero, 5 format tiles, 3 age-band pills (now with distinct `&age=` hrefs)
- `/adult` — dark/orange hero, 2 CTAs, 3 format tiles
- `/shop` — coming-soon placeholder
- `/sports` — sports list
- `/locations` — locations list
- `/programs?audience=youth&age=9-12` — catalog with the 9–12 age band pre-applied

- [ ] **Step 4: Report findings**

This task makes no commits. Report exactly what was observed for the footer and each page. If ANYTHING renders broken, report it as BLOCKED with specifics — do not paper over it. If a browser genuinely cannot be run in the execution environment, report that explicitly as a NEEDS_CONTEXT so the controller can route the verification to the user.

---

## Self-Review

**Spec coverage:** All four user-scoped items map to tasks — age-band filtering (FF-1), fetch-to-self → direct db (FF-2), `@astrojs/sitemap` (FF-3), footer browser-verification (FF-4).

**Placeholder scan:** No TBDs. FF-1 Step 2 says "verify by reading the file that `activeAgeBand` is already consumed" rather than reproducing the catalog's entire filter useMemo — that is intentional: the consuming logic already exists and shipped in the prior plan; re-pasting it would risk a divergent duplicate. The instruction to locate-and-confirm (not re-add) is the correct guidance. FF-2's query bodies are reproduced in full from the current `filters.ts`. FF-3's full config file is provided.

**Type consistency:** `initialAgeBand?: string | null` (FF-1) matches the `ageBand` value (`string | null`) passed from the Astro page. `PublicSport` / `PublicLocation` (FF-2) are supersets of the `Sport` / `Location` interfaces the index page templates already declare — the templates are left untouched and remain valid. `getPublicSports` / `getPublicLocations` return `Promise<PublicSport[]>` / `Promise<PublicLocation[]>`, consumed with `await` in both the API route and the pages.

**Scope:** Focused — four targeted closes, no new features. The `customPages` sitemap enhancement for `[slug]` routes is explicitly deferred and called out in FF-3.
