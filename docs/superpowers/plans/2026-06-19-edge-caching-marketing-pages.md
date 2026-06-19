# Edge-caching anonymous marketing pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve anonymous marketing-page HTML from Netlify's CDN edge (skipping the SSR function on cache hits) without ever caching or leaking authenticated state.

**Architecture:** A small frontmatter helper sets `Netlify-CDN-Cache-Control` on a page's GET response. `BaseLayout` detects that header and renders the nav in "auth-unknown" mode (the existing prerender code path), so the cached HTML contains no per-user data and is identical for every visitor. Auth resolves client-side via the already-`client:idle` `<Navigation>` fetch to `/api/auth/me`.

**Tech Stack:** Astro 5 (`output: "server"`), `@astrojs/netlify@6.6.3`, Vitest (unit + API integration), TypeScript.

**Design spec:** `docs/superpowers/specs/2026-06-19-edge-caching-marketing-pages-design.md`

## Global Constraints

- Edge cache directive (exact): `Netlify-CDN-Cache-Control: public, s-maxage=60, stale-while-revalidate=86400`.
- Browser directive (exact): `Cache-Control: public, max-age=0, must-revalidate`.
- Cache headers are set **only on GET** requests, and **only after** a page's request-time data fetches succeed (call the helper last in frontmatter) so error responses are never cached.
- No `astro.config` / adapter-mode change. No `Vary` header. No infra change.
- Unit tests import via the `@/` alias (matches existing `tests/unit/*`).
- API integration tests hit the running dev server over HTTP; base URL from `process.env.TEST_BASE_URL ?? "http://localhost:4321"`.
- `/soccerone/*` paths 301-redirect on non-SoccerOne hosts, so SoccerOne pages cannot be exercised by `tests/api` on `localhost`; their verification is manual on a Netlify deploy-preview.
- Excluded from caching (do NOT add the helper): `/soccerone/memberships`, `/soccerone/join`, and all middleware-gated/auth pages.

---

### Task 1: `setMarketingEdgeCache` helper

**Files:**
- Create: `src/lib/http/edge-cache.ts`
- Test: `tests/unit/http/edge-cache.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `setMarketingEdgeCache(ctx: { request: Request; response: ResponseInit & { headers: Headers } }): void` — sets the two cache headers on GET, no-op otherwise. Accepts both the page `Astro` global and an `APIContext` (structural type).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/http/edge-cache.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { setMarketingEdgeCache } from "@/lib/http/edge-cache";

function ctx(method: string) {
  return {
    request: new Request("https://example.test/", { method }),
    response: { headers: new Headers() },
  };
}

describe("setMarketingEdgeCache", () => {
  it("sets edge and browser cache directives on GET", () => {
    const c = ctx("GET");
    setMarketingEdgeCache(c);
    expect(c.response.headers.get("Netlify-CDN-Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=86400",
    );
    expect(c.response.headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate",
    );
  });

  it("is a no-op for non-GET requests", () => {
    const c = ctx("POST");
    setMarketingEdgeCache(c);
    expect(c.response.headers.get("Netlify-CDN-Cache-Control")).toBeNull();
    expect(c.response.headers.get("Cache-Control")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/http/edge-cache.test.ts`
Expected: FAIL — cannot resolve `@/lib/http/edge-cache`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/http/edge-cache.ts`:

```ts
// Structural type so the helper accepts both the page `Astro` global
// (AstroGlobal) and an APIContext — both expose `request` + `response`.
type EdgeCacheContext = {
  request: Request;
  response: ResponseInit & { headers: Headers };
};

/**
 * Opt a public, user-invariant marketing page into Netlify edge caching.
 *
 * Call at the END of a page's frontmatter, after all request-time data
 * fetches have succeeded — so a failed render never sets a cache header and
 * we never cache an error response.
 *
 * `Netlify-CDN-Cache-Control` drives Netlify's CDN only; the browser is told
 * to always revalidate, and it revalidates against the edge (instant on a
 * hit). Mirrors the pattern used by src/pages/api/public/* routes. Setting
 * this header also signals BaseLayout to render the nav user-invariant (see
 * resolveNavUser), guaranteeing no per-user data is baked into a cached page.
 */
export function setMarketingEdgeCache(ctx: EdgeCacheContext): void {
  if (ctx.request.method !== "GET") return;
  ctx.response.headers.set(
    "Cache-Control",
    "public, max-age=0, must-revalidate",
  );
  ctx.response.headers.set(
    "Netlify-CDN-Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=86400",
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/http/edge-cache.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/http/edge-cache.ts tests/unit/http/edge-cache.test.ts
git commit -m "feat(perf): add setMarketingEdgeCache header helper"
```

---

### Task 2: `resolveNavUser` helper + wire into BaseLayout

**Files:**
- Create: `src/lib/branding/nav-user.ts`
- Test: `tests/unit/branding/nav-user.test.ts`
- Modify: `src/layouts/BaseLayout.astro` (imports near line 13; `navUser` derivation at lines 72-81)

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `resolveNavUser(opts: { isPrerendered: boolean; edgeCached: boolean; user: NavUser | null }): NavUser | null | undefined` where `type NavUser = { id: string; email: string; firstName: string; lastName: string }`. Returns `undefined` when prerendered OR edge-cached (nav fetches auth client-side), `null` when anonymous, else the user object. BaseLayout passes `edgeCached: Astro.response.headers.has("Netlify-CDN-Cache-Control")`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/branding/nav-user.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveNavUser } from "@/lib/branding/nav-user";

const user = { id: "u1", email: "a@b.com", firstName: "Ada", lastName: "Lovelace" };

describe("resolveNavUser", () => {
  it("returns undefined when prerendered (auth resolved client-side)", () => {
    expect(resolveNavUser({ isPrerendered: true, edgeCached: false, user })).toBeUndefined();
  });

  it("returns undefined when edge-cached, even with a user present", () => {
    expect(resolveNavUser({ isPrerendered: false, edgeCached: true, user })).toBeUndefined();
  });

  it("returns null for an anonymous, non-cached request", () => {
    expect(resolveNavUser({ isPrerendered: false, edgeCached: false, user: null })).toBeNull();
  });

  it("returns the user object for an authed, non-cached request", () => {
    expect(resolveNavUser({ isPrerendered: false, edgeCached: false, user })).toEqual(user);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/branding/nav-user.test.ts`
Expected: FAIL — cannot resolve `@/lib/branding/nav-user`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/branding/nav-user.ts`:

```ts
export type NavUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

/**
 * Decide what user state BaseLayout embeds into the nav island.
 *
 * - `undefined` → "auth unknown, resolve client-side": Navigation fetches
 *   /api/auth/me itself. Used for prerendered pages AND edge-cached pages,
 *   so the rendered HTML carries no per-user data and is safe to cache and
 *   serve to every visitor.
 * - `null` → known-anonymous (SSR, not cached).
 * - object → known-authed (SSR, not cached).
 */
export function resolveNavUser(opts: {
  isPrerendered: boolean;
  edgeCached: boolean;
  user: NavUser | null;
}): NavUser | null | undefined {
  if (opts.isPrerendered || opts.edgeCached) return undefined;
  if (!opts.user) return null;
  return {
    id: opts.user.id,
    email: opts.user.email,
    firstName: opts.user.firstName,
    lastName: opts.user.lastName,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/branding/nav-user.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire BaseLayout to use the helper**

In `src/layouts/BaseLayout.astro`, add the import alongside the other `@/lib` imports (near line 13, after the `getBrandTheme` import):

```ts
import { resolveNavUser } from '@/lib/branding/nav-user';
```

Replace the existing `navUser` derivation (currently lines 72-81):

```ts
const navUser = Astro.isPrerendered
  ? undefined
  : Astro.locals.user
    ? {
        id: Astro.locals.user.id,
        email: Astro.locals.user.email,
        firstName: Astro.locals.user.firstName,
        lastName: Astro.locals.user.lastName,
      }
    : null;
```

with:

```ts
// `navUser` is undefined when the page is prerendered OR opted into edge
// caching (setMarketingEdgeCache sets Netlify-CDN-Cache-Control before this
// layout renders). Undefined => Navigation resolves auth client-side, so the
// cached HTML carries no per-user data. See resolveNavUser.
const navUser = resolveNavUser({
  isPrerendered: Astro.isPrerendered,
  edgeCached: Astro.response.headers.has("Netlify-CDN-Cache-Control"),
  user: Astro.locals.user,
});
```

- [ ] **Step 6: Verify types + unit suite**

Run: `npx tsc --noEmit`
Expected: exit 0 (no errors).
Run: `npx vitest run tests/unit/branding tests/unit/http`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/branding/nav-user.ts tests/unit/branding/nav-user.test.ts src/layouts/BaseLayout.astro
git commit -m "feat(perf): BaseLayout renders nav user-invariant when edge-cached"
```

---

### Task 3: Opt in Aspire marketing pages + integration tests

**Files:**
- Modify (add helper import + call at end of frontmatter):
  - `src/pages/index.astro`
  - `src/pages/youth.astro`
  - `src/pages/youth/leagues.astro`
  - `src/pages/youth/camps.astro`
  - `src/pages/adult.astro`
  - `src/pages/adult/leagues.astro`
  - `src/pages/adult/pickup.astro`
  - `src/pages/adult/tournaments.astro`
  - `src/pages/locations/index.astro`
  - `src/pages/sports/index.astro`
- Test: `tests/api/edge-cache-headers.test.ts`

**Interfaces:**
- Consumes: `setMarketingEdgeCache` (Task 1), and the BaseLayout invariance wiring (Task 2).
- Produces: marketing GET responses carrying `Netlify-CDN-Cache-Control`, with no per-user data in the HTML.

- [ ] **Step 1: Write the failing integration test**

Create `tests/api/edge-cache-headers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getAuthCookie } from "./setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const EDGE = "public, s-maxage=60, stale-while-revalidate=86400";

const MARKETING_PATHS = [
  "/",
  "/youth",
  "/youth/leagues",
  "/youth/camps",
  "/adult",
  "/adult/leagues",
  "/adult/pickup",
  "/adult/tournaments",
  "/locations",
  "/sports",
];

describe("edge-cache headers on Aspire marketing pages", () => {
  it.each(MARKETING_PATHS)("sets Netlify-CDN-Cache-Control on GET %s", async (path) => {
    const res = await fetch(`${BASE}${path}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("netlify-cdn-cache-control")).toBe(EDGE);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
  });

  it("does NOT set the edge header on a non-opted-in page (/signin)", async () => {
    const res = await fetch(`${BASE}/signin`);
    expect(res.headers.get("netlify-cdn-cache-control")).toBeNull();
  });

  it("does not bake the user's email into HTML for an authenticated request", async () => {
    const email = "parent@test.aspiresports.com";
    const cookie = await getAuthCookie(email, "TestParent123!");
    const res = await fetch(`${BASE}/`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("netlify-cdn-cache-control")).toBe(EDGE);
    const html = await res.text();
    expect(html).not.toContain(email);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Start the dev server first (separate shell): `npm run dev` (or `npm run dev:bws`).
Run: `npx vitest run tests/api/edge-cache-headers.test.ts`
Expected: FAIL — `netlify-cdn-cache-control` is `null` (pages not opted in yet); the authed test fails because `/` currently embeds the email.

- [ ] **Step 3: Opt each Aspire page in**

For EACH of the 10 files listed above:
1. Add the import to the page frontmatter's import block:

```ts
import { setMarketingEdgeCache } from '@/lib/http/edge-cache';
```

2. Add this as the **last statement of the frontmatter** (the `---` block), after every `await` data fetch in that page:

```ts
setMarketingEdgeCache(Astro);
```

Placement rationale: calling it last means a throwing data fetch above it skips the header, so error responses are never cached. For static pages with no data fetch, "last statement" is simply the end of the frontmatter.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/edge-cache-headers.test.ts`
Expected: PASS (all parametrized paths + negative control + authed-invariance).

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro src/pages/youth.astro src/pages/youth/leagues.astro \
  src/pages/youth/camps.astro src/pages/adult.astro src/pages/adult/leagues.astro \
  src/pages/adult/pickup.astro src/pages/adult/tournaments.astro \
  src/pages/locations/index.astro src/pages/sports/index.astro \
  tests/api/edge-cache-headers.test.ts
git commit -m "feat(perf): edge-cache Aspire marketing pages"
```

---

### Task 4: Opt in SoccerOne marketing pages

**Files:**
- Modify (add helper import + call at end of frontmatter):
  - `src/pages/soccerone/index.astro`
  - `src/pages/soccerone/leagues.astro`
  - `src/pages/soccerone/pickup.astro`
  - `src/pages/soccerone/rent.astro`
  - `src/pages/soccerone/sponsors.astro`
  - `src/pages/soccerone/downtown/index.astro`
  - `src/pages/soccerone/worthington/index.astro`

**Interfaces:**
- Consumes: `setMarketingEdgeCache` (Task 1), BaseLayout wiring (Task 2).
- Produces: edge-cache headers on the SoccerOne marketing surface (verified manually — these paths 301-redirect on non-SoccerOne hosts, so `tests/api` on localhost can't render them).

**Do NOT modify** `src/pages/soccerone/memberships.astro` or `src/pages/soccerone/join.astro` — they are user-variant and excluded by the spec.

- [ ] **Step 1: Opt each SoccerOne page in**

For EACH of the 7 files listed above, add the import to the frontmatter import block:

```ts
import { setMarketingEdgeCache } from '@/lib/http/edge-cache';
```

and add as the **last statement of the frontmatter**, after every `await`:

```ts
setMarketingEdgeCache(Astro);
```

- [ ] **Step 2: Verify build + types**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `./scripts/with-bws.sh npm run build` (or `npm run build` with `DATABASE_URL` set)
Expected: `Server built` with no errors.

- [ ] **Step 3: Confirm excluded pages were left alone**

Run: `grep -L setMarketingEdgeCache src/pages/soccerone/memberships.astro src/pages/soccerone/join.astro`
Expected: both files listed (i.e. neither contains the helper call).

- [ ] **Step 4: Commit**

```bash
git add src/pages/soccerone/index.astro src/pages/soccerone/leagues.astro \
  src/pages/soccerone/pickup.astro src/pages/soccerone/rent.astro \
  src/pages/soccerone/sponsors.astro src/pages/soccerone/downtown/index.astro \
  src/pages/soccerone/worthington/index.astro
git commit -m "feat(perf): edge-cache SoccerOne marketing pages"
```

---

### Task 5: Full verification + spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-06-19-edge-caching-marketing-pages-design.md` (status line)

- [ ] **Step 1: Run the full unit suite**

Run: `npx vitest run tests/unit`
Expected: PASS (includes the new `http` + `branding` tests).

- [ ] **Step 2: Run the edge-cache API tests against a running dev server**

With the dev server up: `npx vitest run tests/api/edge-cache-headers.test.ts`
Expected: PASS.

- [ ] **Step 3: Build + type check**

Run: `npx tsc --noEmit` → exit 0.
Run: `./scripts/with-bws.sh npm run build` → `Server built`, no errors.

- [ ] **Step 4: Record the manual deploy-preview checklist**

These checks can only be done on a Netlify deploy-preview (edge behavior is not exercised by `npm run dev`). Add nothing to code; perform after the branch deploys a preview:
1. `curl -sI https://<preview>/` → shows `netlify-cdn-cache-control: public, s-maxage=60, stale-while-revalidate=86400`.
2. Repeat the request → response carries a Netlify cache `HIT` indicator.
3. On a SoccerOne preview host, `curl -sI https://<soccerone-preview>/sponsors` → same edge header (confirms the rewrite + cache compose).
4. Load a cached page while logged in → nav still resolves to the account (client-side fetch); `curl` of the anonymous page HTML does not contain a known test email.

- [ ] **Step 5: Flip the spec status and commit**

In the spec, change `**Status:** Approved (design); pending implementation plan` to `**Status:** Implemented`.

```bash
git add docs/superpowers/specs/2026-06-19-edge-caching-marketing-pages-design.md
git commit -m "docs(perf): mark edge-caching spec implemented"
```

---

## Self-Review

**Spec coverage:**
- Helper mechanism (spec Component 1) → Task 1. ✓
- BaseLayout invariance (spec Component 2) → Task 2. ✓
- Per-page opt-in, included list (spec Component 3 + Pages) → Tasks 3 (Aspire) + 4 (SoccerOne). ✓
- Excluded pages → Task 4 leaves them untouched + Step 3 asserts it. ✓
- Correctness edges (GET-only, errors-not-cached) → Task 1 helper + frontmatter placement instructions in Tasks 3/4. ✓
- Freshness `s-maxage=60` → encoded in the helper constant (Task 1). ✓
- Testing (unit, authed-invariance, deploy-preview manual) → Tasks 1/2 (unit), Task 3 (API incl. authed), Task 5 Step 4 (manual). ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; commands have expected output. ✓

**Type consistency:** `setMarketingEdgeCache(ctx)` signature identical in Task 1 def and Task 3/4 usage (`setMarketingEdgeCache(Astro)`); `resolveNavUser` signature and `NavUser` type identical between Task 2 definition and BaseLayout usage. ✓
