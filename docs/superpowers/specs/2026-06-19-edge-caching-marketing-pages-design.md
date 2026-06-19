# Edge-caching anonymous marketing pages — design

**Date:** 2026-06-19
**Status:** Approved (design); pending implementation plan
**Branch:** `perf/defer-hydration`

## Problem

The app is Astro 5 `output: "server"` on Netlify Functions. Every non-prerendered
page is a function invocation that runs the full middleware chain (org + brand
resolution, optional session validation) and the page's own request-time DB
queries before a byte renders. The public marketing pages — the conversion
funnel for both the Aspire and SoccerOne brands — render HTML that is identical
for every logged-out visitor of a given host, yet each visit pays a cold-start +
DB round-trip. This is the dominant, easily-removed latency on the marketing
surface.

We want Netlify's CDN to serve the rendered HTML of these pages from the edge so
that the vast majority of (anonymous) requests never invoke the function, while
keeping content acceptably fresh and never leaking or mis-rendering authenticated
state.

## Goals

- Anonymous visits to public marketing pages are served from Netlify's edge cache
  (no function invocation) on cache hits.
- Admin edits to marketing content (site announcement banner, season lists,
  drop-in/pickup pricing) propagate to logged-out visitors within ~1 minute.
- Zero risk of serving one user's authenticated render to another visitor, and
  zero risk of baking PII (email/name) into a cached page.
- Works *with* the existing SoccerOne host-rewrite architecture (the public URL
  differs from the page file path).
- Minimal, uniform change: no `astro.config` / adapter-mode changes, no infra
  changes.

## Non-goals

- Caching authenticated pages (`/dashboard`, `/admin`, `/account`, etc.).
- Caching user-variant marketing pages (`/soccerone/memberships`,
  `/soccerone/join`) in v1 — see Excluded pages.
- Any Railway / database connection-pooler work (tracked separately).
- Cache *invalidation* hooks on content edits — the 60s `s-maxage` window is the
  freshness mechanism; we are not building tag-based purging (the adapter does
  not support `Netlify-Cache-Tag` at v6.6.3 anyway).

## Background / key facts (from investigation)

- **Adapter:** `@astrojs/netlify@6.6.3`. It honors `Cache-Control`,
  `CDN-Cache-Control`, and `Netlify-CDN-Cache-Control` response headers set from
  page frontmatter via `Astro.response.headers.set(...)`. The existing
  `src/pages/api/public/*` routes already cache this way successfully **without**
  `cacheOnDemandPages` enabled, proving per-response headers are honored as-is.
- **Netlify CDN behavior:** cache key = full request URL including host (and query
  string); the Cookie header is **not** part of the key. Netlify automatically
  skips caching any response carrying a `Set-Cookie` header.
- **The blocker:** `src/layouts/BaseLayout.astro` computes `navUser` from
  `Astro.locals.user` and passes it as `initialUser` to `<Navigation>`, baking
  auth state into the HTML. The same URL therefore renders different HTML for
  anonymous vs. authenticated requests. Since the cache key ignores cookies, a
  naive cache could hand a logged-in user a cached anonymous page (broken nav),
  or — worse — cache an authenticated render containing PII and serve it to
  others.
- **Existing precedent:** `BaseLayout` already renders the nav in "auth unknown,
  resolve client-side" mode for prerendered pages (`Astro.isPrerendered ?
  undefined : ...` at line 72), where `<Navigation>` fetches `/api/auth/me`
  itself. `<Navigation>` is hydrated `client:idle` (per the hydration-deferral
  work on this branch).
- **Session cookie:** Lucia default name `auth_session`.

## Approach (chosen: A — make the HTML user-invariant, then cache for all)

Rather than gate caching on cookie presence (rejected Approach B — fragile,
because Netlify's cache key ignores cookies so authed users can still hit the
anon cache entry), we make the cached HTML contain **no per-user data at all**.
Then it is identical for every visitor and safe to cache and serve to everyone
unconditionally. Auth resolves client-side through the existing nav fetch.

### Component 1 — cache-header helper

New module `src/lib/http/edge-cache.ts`:

```ts
/**
 * Opt a public, user-invariant marketing page into Netlify edge caching.
 * Call at the END of a page's frontmatter, after all request-time data
 * fetches have succeeded — so a failed render never sets a cache header and
 * we never cache an error response.
 *
 * Sets the edge cache via `Netlify-CDN-Cache-Control` (drives Netlify's CDN
 * only) while telling browsers to always revalidate (`Cache-Control:
 * max-age=0, must-revalidate`) — the browser revalidates against the edge,
 * which answers instantly on a hit. Mirrors the pattern already used by
 * src/pages/api/public/* routes.
 */
// Structural type so the helper accepts both the page `Astro` global
// (AstroGlobal) and an APIContext — both expose `request` + `response`.
type EdgeCacheContext = {
  request: Request;
  response: ResponseInit & { headers: Headers };
};

export function setMarketingEdgeCache(ctx: EdgeCacheContext): void {
  if (ctx.request.method !== "GET") return;
  ctx.response.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  ctx.response.headers.set(
    "Netlify-CDN-Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=86400",
  );
}
```

- `s-maxage=60` → content propagates within ~1 minute of an admin edit (chosen
  freshness window).
- `stale-while-revalidate=86400` → the edge always serves an instant response and
  refreshes in the background; if the origin is unavailable it can serve stale up
  to a day rather than failing.

### Component 2 — self-consistent invariance in BaseLayout

Change the `navUser` derivation in `src/layouts/BaseLayout.astro` so that the
presence of the edge-cache header automatically strips per-user data from the
HTML:

```ts
const navUser =
  (Astro.isPrerendered ||
    Astro.response.headers.has("Netlify-CDN-Cache-Control"))
    ? undefined            // resolve auth client-side via /api/auth/me
    : Astro.locals.user
      ? { id, email, firstName, lastName }
      : null;
```

Because a page calls the helper in its frontmatter *before* `<BaseLayout>`
renders, BaseLayout observes the header and drops `initialUser`. This makes the
opt-in a single touchpoint (the helper call) and makes it **physically
impossible** to cache a page that still has a user baked in.

### Component 3 — per-page opt-in

Each cacheable page adds one line at the end of its frontmatter:

```ts
setMarketingEdgeCache(Astro);
```

## Pages

### Included (v1)

Aspire: `/`, `/youth`, `/youth/leagues`, `/youth/camps`, `/adult`,
`/adult/leagues`, `/adult/pickup`, `/adult/tournaments`, `/locations`, `/sports`.

SoccerOne: `/soccerone` (index), `/soccerone/leagues`, `/soccerone/pickup`,
`/soccerone/rent`, `/soccerone/sponsors`, `/soccerone/downtown`,
`/soccerone/worthington`.

All of these read only host-derived data at request time (org announcements,
season/venue/sport lists, drop-in rate cards), which is anonymous-invariant and
already keyed per-host in the cache. `?audience` (leagues) and `?facility`
(pickup) variants are part of the cache key automatically.

### Excluded (v1), with reason

- `/soccerone/memberships` — reads `Astro.locals.user` to render an auth-gated
  CTA (`authed` prop to `MembershipTiersLive`); genuinely user-variant.
- `/soccerone/join` — conversion form entry; reads `?src` attribution + brandId.
- All middleware-gated surfaces (`/dashboard`, `/admin`, `/coach`, `/account`,
  `/messages`, `/media`) and auth pages — never marketing, never cached.

Both excluded SoccerOne pages can be migrated later using the same client-fetch
trick if desired; out of scope here.

## Correctness / edge cases

- **Only GET.** Helper early-returns on non-GET. (Marketing pages are GET; this is
  belt-and-suspenders.)
- **Errors not cached.** Helper is called last in frontmatter, so if an earlier
  DB fetch throws, the header is never set and Netlify will not cache the 5xx.
- **Set-Cookie bypass.** If a request triggers a Lucia session refresh
  (`session.fresh`), the response carries `Set-Cookie` and Netlify skips caching
  it — a free extra guard against caching an authed response.
- **No `Vary: Cookie`.** Unnecessary because the HTML is user-invariant; relying
  on `Vary: Cookie` would also be ineffective on Netlify and would shatter the
  cache per-session.
- **SoccerOne rewrite.** Caching happens on the response for the public URL
  (e.g. `/sponsors`), which the function produced via the internal rewrite to
  `/soccerone/sponsors`. The cache key is the public URL + host, so this is
  transparent to the rewrite.
- **Cost shift for authed users.** Logged-in users now perform one small
  `/api/auth/me` fetch on these pages (previously skipped on SSR pages, but
  already the behavior on prerendered pages). Negligible versus skipping a full
  page-render function invocation; anonymous funnel traffic — the conversion
  target — is the big win.

## Testing

- **Unit** (`tests/unit/`): `setMarketingEdgeCache` sets exactly the two headers
  and only for GET; is a no-op for POST.
- **Unit/component:** assert BaseLayout's `navUser` derivation returns `undefined`
  when `Netlify-CDN-Cache-Control` is present on the response (extract the
  derivation into a tiny pure helper if needed to test without rendering).
- **Build + types:** `npm run build` and `npx tsc --noEmit` clean.
- **Deploy-preview (manual — the only place edge behavior is real):**
  1. `curl -I` a marketing page → shows `Netlify-CDN-Cache-Control` and
     `Cache-Control: max-age=0, must-revalidate`.
  2. Second request → Netlify cache `HIT` header.
  3. Logged-in user loads the page → nav still resolves to their account
     (client-side fetch), proving invariance didn't break authed UX.
  4. `grep` the cached anonymous HTML for a known test-account email → absent,
     proving no PII is baked in.

## Rollout / reversibility

Fully reversible and incremental. The change is one helper, one BaseLayout line,
and one call per page; reverting a page is deleting its one-line call, and
disabling the feature entirely is removing the header (the BaseLayout guard then
no-ops). Ship the helper + BaseLayout change + a couple of pages first, verify on
a deploy preview, then fan out to the rest.

## Open questions

None blocking. Future work (not in this spec): convert the two excluded SoccerOne
pages; consider tag-based invalidation if the adapter gains `Netlify-Cache-Tag`
support; revisit the Railway connection pooler for the authenticated surface.
