# Phase 1 — Domain Plumbing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `www.gosoccerone.com` serve the SoccerOne marketing tree from the same Astro app, while keeping Aspire's site byte-identical for every non-SoccerOne request.

**Architecture:** A new pure module (`src/lib/organization/soccerone-routing.ts`) owns the SoccerOne hostname/path constants and three pure functions (`rewriteSoccerOnePath`, `getAspireToSoccerOneRedirect`, `isUnmappedSoccerOneHost`). The middleware calls those functions after the existing org resolution — three additive branches, all guarded so the Aspire code path is untouched. A branch-specific provisioning script creates the SoccerOne org row + locations + venues + `domain_mappings` rows. A separate ops checklist guides the founder through Netlify alias + DNS + SSL.

**Tech Stack:** Astro 5 middleware (`context.rewrite()` / `context.redirect()`), Drizzle ORM, Vitest unit tests, Netlify domain aliases.

**Spec:** [`docs/superpowers/specs/2026-05-22-soccerone-gosoccerone-domain-design.md`](../specs/2026-05-22-soccerone-gosoccerone-domain-design.md), §6 (Phase 1).

---

## Why this is safe to ship to live Aspire

The governing safety principle from the spec (§4): for any non-SoccerOne request, the executed code path must be functionally identical to today. Every change in this plan respects that:

- The new routing functions return `null` for any non-SoccerOne host — the middleware's existing flow is unchanged when those are `null`.
- The `BaseLayout` GTM conditional defaults to Aspire's existing container ID; the SoccerOne branch only fires when the resolved org's slug matches.
- The provisioning script runs only when explicitly invoked; merging the PR does not create the SoccerOne org row in prod.
- The `domain_mappings` rows are inserted with `status: 'pending'` and flipped to `ssl_active` only after Netlify SSL is confirmed (a separate ops step). Until that flip, the resolver does not match the SoccerOne hostnames, so the rewrite branch in middleware does not fire.

**Sequencing for prod:** PR merges → no behavior change. Founder runs the provisioning script against staging → tests via `soccerone.aspiresports.com` subdomain (the resolver matches the org by slug, no domain mapping required for that subdomain). Founder configures Netlify alias + DNS at registrar. Once SSL is active, founder runs the provisioning script against prod (idempotent), then flips the `domain_mappings.status` to `ssl_active`. Only then does `www.gosoccerone.com` serve real content.

---

## File Structure

**Create** (new files):

| Path | Purpose |
|---|---|
| `src/lib/organization/soccerone-routing.ts` | Pure constants + functions: `SOCCERONE_HOSTS`, `SOCCERONE_MARKETING_REWRITES`, `rewriteSoccerOnePath()`, `getAspireToSoccerOneRedirect()`, `isUnmappedSoccerOneHost()`. The single source of truth for "what's a SoccerOne host" and "what does it rewrite to." |
| `tests/unit/organization/soccerone-routing.test.ts` | Vitest unit tests covering every entry in the rewrite table, every path that should pass through unchanged, the redirect canonicalization, and the unmapped-host detection. |
| `scripts/seed-soccerone-org.ts` | Branch-specific provisioning: idempotently creates the SoccerOne org, its locations (Downtown + Worthington), venues, and `domain_mappings` rows. Hard-guarded against prod by default; opt-in with `--prod`. |
| `docs/ops/soccerone-launch-checklist.md` | Step-by-step the founder follows to take gosoccerone.com live: staging verification → Netlify alias → DNS → SSL → prod provisioning → domain-mapping flip. |

**Modify** (existing files):

| Path | Change |
|---|---|
| `src/middleware.ts` | After `resolveOrganizationFromHost()` returns, call the three pure functions. If any matches, return the appropriate `rewrite()` / `redirect()` / `Response` before the existing auth-gate logic runs. Aspire's path: every function returns `null` → behavior unchanged. |
| `src/layouts/BaseLayout.astro` | GTM container ID selected by `Astro.locals.organization?.slug`. Default = current hardcoded Aspire container. SoccerOne branch reads from `import.meta.env.PUBLIC_GTM_CONTAINER_SOCCERONE`; falls back to Aspire's container if unset. |
| `src/pages/soccerone/index.astro` | Flip `export const prerender = true;` → `false`. The middleware rewrite is a request-time operation and cannot target a prerendered route. The other `soccerone/*` pages are already SSR (verified in spec); only this file needs flipping. |
| `.env.example` | Add `PUBLIC_GTM_CONTAINER_SOCCERONE=` placeholder with a comment. |

---

## Pre-flight (Task 1 handles this)

The Phase 0 worktree at `/Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone` is now on the merged `feat/soccerone-gosoccerone` branch. We reuse it: fetch latest main, create a new branch `feat/soccerone-phase1-domain-plumbing` off `origin/main`, do not switch the main checkout off whatever branch the founder has.

---

## Task 1: Worktree + branch off latest main

**Files:** none modified.

- [ ] **Step 1: Confirm starting state.**

  ```bash
  WT=/Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone
  git -C "$WT" branch --show-current
  git -C "$WT" status --short
  ```
  Expected: branch is `feat/soccerone-gosoccerone`; working tree clean.

- [ ] **Step 2: Fetch latest main.**

  ```bash
  git -C "$WT" fetch origin main
  git -C "$WT" log --oneline origin/main -5
  ```
  Expected: the merge commit of PR #124 (Phase 0) is at the top.

- [ ] **Step 3: Create the Phase 1 branch off origin/main.**

  ```bash
  git -C "$WT" checkout -b feat/soccerone-phase1-domain-plumbing origin/main
  git -C "$WT" branch --show-current
  git -C "$WT" log --oneline -3
  ```
  Expected: branch is `feat/soccerone-phase1-domain-plumbing`; tip is the Phase 0 merge commit.

- [ ] **Step 4: Re-run e2e seed to refresh the test DB to current main's schema.**

  ```bash
  cd "$WT"
  export $(grep -E "^DATABASE_URL=" .env | xargs)
  npm run db:migrate 2>&1 | tail -5
  npm run db:seed:e2e 2>&1 | tail -10
  ```
  Expected: migrations clean; seed completes idempotently.

- [ ] **Step 5: Verify dev server can come up.** From a separate terminal (or via `run_in_background: true`):

  ```bash
  cd "$WT"
  R2_MOCK=1 CRON_SECRET=test DISABLE_RATE_LIMIT=1 npm run dev
  ```
  Wait until you see `Local: http://localhost:4321/`. In another shell, `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/api/test/org-fixtures?slug=orgb` should return 200. Then leave the dev server running for subsequent tasks.

- [ ] **Step 6: Move this plan into the worktree (if not already there).**

  The plan file may have been written to the worktree directly during planning. Verify:
  ```bash
  ls "$WT/docs/superpowers/plans/2026-05-23-soccerone-phase1-domain-plumbing.md"
  ```
  If missing, copy from wherever it was authored.

- [ ] **Step 7: Commit the plan.**

  ```bash
  git -C "$WT" add docs/superpowers/plans/2026-05-23-soccerone-phase1-domain-plumbing.md
  git -C "$WT" commit -m "$(cat <<'EOF'
  docs(plan): Phase 1 — domain plumbing for gosoccerone.com

  Implementation plan for spec §6: middleware host-rewrite + reverse 301
  + unmapped-host guard, SoccerOne org provisioning script, per-brand
  GTM, and ops launch checklist.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: Shared routing module + unit tests

**Files:**
- Create: `src/lib/organization/soccerone-routing.ts`
- Create: `tests/unit/organization/soccerone-routing.test.ts`

This module is the single source of truth for: which hostnames are SoccerOne, which marketing-root paths rewrite into the `soccerone/*` subtree, and how to canonicalize an Aspire-host `/soccerone/*` URL into its `gosoccerone.com` form. It exports only pure functions so it can be unit-tested without the dev server.

- [ ] **Step 1: Write the failing test.**

  ```typescript
  // tests/unit/organization/soccerone-routing.test.ts
  import { describe, it, expect } from "vitest";
  import {
    SOCCERONE_HOSTS,
    SOCCERONE_MARKETING_REWRITES,
    SOCCERONE_CANONICAL_HOST,
    rewriteSoccerOnePath,
    getAspireToSoccerOneRedirect,
    isUnmappedSoccerOneHost,
  } from "@/lib/organization/soccerone-routing";

  describe("soccerone-routing — constants", () => {
    it("recognizes both apex and www as SoccerOne hosts", () => {
      expect(SOCCERONE_HOSTS).toContain("gosoccerone.com");
      expect(SOCCERONE_HOSTS).toContain("www.gosoccerone.com");
    });

    it("canonical host is www (per spec §6.1e — www-canonical, apex redirects to it)", () => {
      expect(SOCCERONE_CANONICAL_HOST).toBe("www.gosoccerone.com");
    });

    it("rewrite table maps every marketing root the spec lists", () => {
      // Spec §6.1b — these paths and only these paths rewrite.
      const expected: Record<string, string> = {
        "/": "/soccerone",
        "/leagues": "/soccerone/leagues",
        "/rent": "/soccerone/rent",
        "/pickup": "/soccerone/pickup",
        "/memberships": "/soccerone/memberships",
        "/downtown": "/soccerone/downtown",
        "/worthington": "/soccerone/worthington",
      };
      expect(SOCCERONE_MARKETING_REWRITES).toEqual(expected);
    });
  });

  describe("rewriteSoccerOnePath()", () => {
    it.each([
      ["/", "/soccerone"],
      ["/leagues", "/soccerone/leagues"],
      ["/rent", "/soccerone/rent"],
      ["/pickup", "/soccerone/pickup"],
      ["/memberships", "/soccerone/memberships"],
      ["/downtown", "/soccerone/downtown"],
      ["/worthington", "/soccerone/worthington"],
    ])("rewrites %s → %s", (input, expected) => {
      expect(rewriteSoccerOnePath(input)).toBe(expected);
    });

    it.each([
      "/register",
      "/rentals",
      "/dropin",
      "/signin",
      "/dashboard",
      "/api/public/seasons",
      "/leagues/extra",       // anything beyond an exact marketing-root must NOT rewrite
      "/leaguesx",            // prefix-but-not-exact must NOT rewrite
      "/soccerone",           // already inside soccerone/* — must NOT double-rewrite
      "/soccerone/leagues",
      "/static/foo.png",
      "/about",               // Aspire's about page is NOT a SoccerOne marketing root
    ])("returns null for non-marketing path %s", (input) => {
      expect(rewriteSoccerOnePath(input)).toBeNull();
    });

    it("query string and hash are preserved by the caller, not the function (function takes pathname only)", () => {
      // rewriteSoccerOnePath only sees the pathname; the middleware composes the URL.
      expect(rewriteSoccerOnePath("/leagues")).toBe("/soccerone/leagues");
    });
  });

  describe("getAspireToSoccerOneRedirect()", () => {
    it("returns the canonical gosoccerone.com URL for /soccerone roots", () => {
      const url = getAspireToSoccerOneRedirect("/soccerone");
      expect(url).toBe("https://www.gosoccerone.com/");
    });

    it.each([
      ["/soccerone/leagues", "https://www.gosoccerone.com/leagues"],
      ["/soccerone/rent", "https://www.gosoccerone.com/rent"],
      ["/soccerone/pickup", "https://www.gosoccerone.com/pickup"],
      ["/soccerone/memberships", "https://www.gosoccerone.com/memberships"],
      ["/soccerone/downtown", "https://www.gosoccerone.com/downtown"],
      ["/soccerone/worthington", "https://www.gosoccerone.com/worthington"],
    ])("maps %s → %s", (input, expected) => {
      expect(getAspireToSoccerOneRedirect(input)).toBe(expected);
    });

    it.each([
      "/about",
      "/leagues",
      "/register",
      "/api/public/seasons",
      "/soccerone-other",     // not the soccerone/ subtree
    ])("returns null for non-soccerone path %s", (input) => {
      expect(getAspireToSoccerOneRedirect(input)).toBeNull();
    });
  });

  describe("isUnmappedSoccerOneHost()", () => {
    it("returns true when the host is a SoccerOne domain but the resolved org's slug is not 'soccerone'", () => {
      expect(isUnmappedSoccerOneHost("gosoccerone.com", null)).toBe(true);
      expect(isUnmappedSoccerOneHost("www.gosoccerone.com", null)).toBe(true);
      expect(isUnmappedSoccerOneHost("gosoccerone.com", "aspire-sports")).toBe(true);
      expect(isUnmappedSoccerOneHost("www.gosoccerone.com", "orgb")).toBe(true);
    });

    it("returns false when the SoccerOne host resolves to the SoccerOne org", () => {
      expect(isUnmappedSoccerOneHost("gosoccerone.com", "soccerone")).toBe(false);
      expect(isUnmappedSoccerOneHost("www.gosoccerone.com", "soccerone")).toBe(false);
    });

    it("returns false for non-SoccerOne hosts regardless of resolved org", () => {
      expect(isUnmappedSoccerOneHost("aspiresports.com", null)).toBe(false);
      expect(isUnmappedSoccerOneHost("localhost", "aspire-sports")).toBe(false);
      expect(isUnmappedSoccerOneHost("powell.aspiresports.com", null)).toBe(false);
    });

    it("normalizes the hostname (strips port, lowercases)", () => {
      expect(isUnmappedSoccerOneHost("Gosoccerone.com:443", null)).toBe(true);
      expect(isUnmappedSoccerOneHost("WWW.GoSoccerOne.com", "soccerone")).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run the test; verify it fails.**

  ```bash
  npx vitest run tests/unit/organization/soccerone-routing.test.ts
  ```
  Expected: failure — the module does not exist yet.

- [ ] **Step 3: Implement the module.**

  ```typescript
  // src/lib/organization/soccerone-routing.ts
  /**
   * SoccerOne routing — the single source of truth for "what's a SoccerOne
   * host" and "what does it rewrite to."
   *
   * Phase 1 of the SoccerOne / gosoccerone.com project. Spec §6.
   *
   * All functions are pure (no DB, no I/O) so they can be unit-tested without
   * the dev server. The middleware composes their outputs into real
   * `context.rewrite()` / `context.redirect()` calls.
   */

  /** Hostnames that should resolve to the SoccerOne tenant. */
  export const SOCCERONE_HOSTS: readonly string[] = [
    "gosoccerone.com",
    "www.gosoccerone.com",
  ] as const;

  /** Canonical SoccerOne host (apex 308-redirects to this). */
  export const SOCCERONE_CANONICAL_HOST = "www.gosoccerone.com" as const;

  /** Org slug that identifies the SoccerOne tenant in the `organizations` table. */
  export const SOCCERONE_ORG_SLUG = "soccerone" as const;

  /**
   * Marketing-root paths on a SoccerOne host that get rewritten into the
   * `soccerone/*` subtree. Exact-match only — anything not in this table
   * passes through unchanged (shared routes like /register, /rentals,
   * /dropin, /signin, /dashboard, /api/* are NOT rewritten).
   */
  export const SOCCERONE_MARKETING_REWRITES: Readonly<Record<string, string>> = {
    "/": "/soccerone",
    "/leagues": "/soccerone/leagues",
    "/rent": "/soccerone/rent",
    "/pickup": "/soccerone/pickup",
    "/memberships": "/soccerone/memberships",
    "/downtown": "/soccerone/downtown",
    "/worthington": "/soccerone/worthington",
  } as const;

  function normalizeHost(host: string): string {
    return host.split(":")[0].toLowerCase();
  }

  /**
   * If the pathname is a SoccerOne marketing root, return the path inside
   * `src/pages/soccerone/*` that should render it. Otherwise null.
   *
   * Caller responsibility: gate this on the resolved org being SoccerOne
   * (so non-SoccerOne hosts hitting the same path are unaffected).
   */
  export function rewriteSoccerOnePath(pathname: string): string | null {
    return SOCCERONE_MARKETING_REWRITES[pathname] ?? null;
  }

  /**
   * If the pathname is `/soccerone` or `/soccerone/<something>`, return the
   * canonical `https://www.gosoccerone.com/<...>` URL for a 301 redirect from
   * the Aspire host. Otherwise null.
   *
   * Caller responsibility: gate this on the request host being an Aspire host
   * (so SoccerOne-host requests to /soccerone/* aren't redirected to
   * themselves).
   */
  export function getAspireToSoccerOneRedirect(pathname: string): string | null {
    if (pathname === "/soccerone") {
      return `https://${SOCCERONE_CANONICAL_HOST}/`;
    }
    if (pathname.startsWith("/soccerone/")) {
      const suffix = pathname.slice("/soccerone".length); // includes the leading "/"
      return `https://${SOCCERONE_CANONICAL_HOST}${suffix}`;
    }
    return null;
  }

  /**
   * True if the request host is a known SoccerOne domain but the resolver
   * returned a different org (or nothing). This catches the case where the
   * SoccerOne `domain_mappings` row is missing or `status` ≠ `ssl_active`
   * — the resolver falls back to the default org (Aspire) and silently
   * serves Aspire content on the SoccerOne domain. The middleware uses this
   * to serve a 404 / holding page instead.
   */
  export function isUnmappedSoccerOneHost(
    host: string,
    resolvedOrgSlug: string | null | undefined,
  ): boolean {
    const normalized = normalizeHost(host);
    if (!SOCCERONE_HOSTS.includes(normalized)) return false;
    return resolvedOrgSlug !== SOCCERONE_ORG_SLUG;
  }
  ```

- [ ] **Step 4: Run the test; verify it passes.**

  ```bash
  npx vitest run tests/unit/organization/soccerone-routing.test.ts
  ```
  Expected: all assertions pass.

- [ ] **Step 5: Type check.**

  ```bash
  npx tsc --noEmit 2>&1 | grep -v "(progress\.tsx|separator\.tsx|r2\.ts)" | tail -10
  ```
  Expected: zero errors from the new module. The three pre-existing main-baseline errors (`progress.tsx`, `separator.tsx`, `r2.ts`) are not our concern.

- [ ] **Step 6: Commit.**

  ```bash
  git -C "$WT" add src/lib/organization/soccerone-routing.ts tests/unit/organization/soccerone-routing.test.ts
  git -C "$WT" commit -m "$(cat <<'EOF'
  feat(routing): pure soccerone-routing module + unit tests

  Single source of truth for SoccerOne hostnames, marketing path
  rewrites, Aspire→SoccerOne canonical redirects, and unmapped-host
  detection. Pure functions (no DB, no I/O) — unit-tested in isolation
  because Node fetch strips Host so integration testing of host-based
  routing isn't viable in Vitest (see Phase 0 learnings).

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: Middleware integration (rewrite + reverse 301 + unmapped guard)

**Files:**
- Modify: `src/middleware.ts`

The middleware already resolves the org and sets `context.locals.organization`. Insert the three SoccerOne branches immediately after that block — before the existing auth/redirect gates run, so the rewrite target is what the gates see.

- [ ] **Step 1: Read `src/middleware.ts` in full first.** Identify the section where `context.locals.organization` is set (around line 82–85 per the spec). That's where the new branches slot in.

- [ ] **Step 2: Add the imports at the top of `src/middleware.ts`.**

  ```typescript
  import {
    SOCCERONE_HOSTS,
    SOCCERONE_ORG_SLUG,
    rewriteSoccerOnePath,
    getAspireToSoccerOneRedirect,
    isUnmappedSoccerOneHost,
  } from "./lib/organization/soccerone-routing";
  ```

  Add a single import line that pulls all of them, matching the existing import style of the file. If the file uses path aliases (`@/lib/...`), use that form instead — match the existing convention.

- [ ] **Step 3: Insert the three SoccerOne branches immediately after `context.locals.organization` is set.**

  The insertion point is right after the line that sets `context.locals.organization = resolved.organization;` (and the early-out at line 71 sets it to `null`). After org resolution but before the path-prefix auth gates.

  ```typescript
  // ---------------------------------------------------------------------
  // SoccerOne routing (Phase 1).
  //
  // Three branches, each returns a Response directly. For any non-SoccerOne
  // request, all three are null/false and we fall through to the existing
  // Aspire middleware logic — byte-identical behavior.
  // ---------------------------------------------------------------------
  const host = context.request.headers.get("host") ?? "";
  const url = new URL(context.request.url);
  const orgSlug = context.locals.organization?.slug ?? null;

  // Branch 1 — Unmapped SoccerOne host guard.
  // If the request host is a SoccerOne domain but the resolver returned
  // something other than the SoccerOne org (default fallback to Aspire, or
  // null), DO NOT serve Aspire content silently. Serve a 404 instead.
  if (isUnmappedSoccerOneHost(host, orgSlug)) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Branch 2 — Aspire-host /soccerone/* → 301 to canonical gosoccerone.com.
  // Avoids duplicate-content SEO split. The /soccerone/* page files exist
  // as the rewrite target for Branch 3, not as a public surface on Aspire.
  if (
    orgSlug !== SOCCERONE_ORG_SLUG &&
    !SOCCERONE_HOSTS.includes(host.split(":")[0].toLowerCase())
  ) {
    const target = getAspireToSoccerOneRedirect(url.pathname);
    if (target) {
      return context.redirect(target, 301);
    }
  }

  // Branch 3 — SoccerOne-host marketing root → rewrite into soccerone/* subtree.
  // Only fires when the resolved org IS SoccerOne, so shared routes
  // (/register, /rentals, /dropin, /api/*) pass through unchanged and the
  // resolver scopes them.
  if (orgSlug === SOCCERONE_ORG_SLUG) {
    const rewriteTarget = rewriteSoccerOnePath(url.pathname);
    if (rewriteTarget) {
      // Compose the full URL for context.rewrite() — preserve query + hash.
      const targetUrl = new URL(rewriteTarget + url.search + url.hash, url);
      return context.rewrite(targetUrl);
    }
  }
  ```

  Place the block between the existing `context.locals.organization` assignment and the auth-gate redirects. Confirm by reading `src/middleware.ts` after editing that no existing logic was displaced.

- [ ] **Step 4: Type check.**

  ```bash
  npx tsc --noEmit 2>&1 | grep -vE "(progress\.tsx|separator\.tsx|r2\.ts)" | tail -10
  ```
  Expected: 0 errors from `src/middleware.ts`. If `context.rewrite()` has a different signature in this Astro version (returns Promise vs. Response, takes URL vs. string), adjust accordingly — read the actual `astro` package's `APIContext` type if needed.

- [ ] **Step 5: Re-run the unit tests** (they don't touch middleware, but confirm the routing module is still passing):

  ```bash
  npx vitest run tests/unit/organization/soccerone-routing.test.ts
  ```
  Expected: green.

- [ ] **Step 6: Manual smoke check — Aspire's path is unchanged.**

  With the dev server running on the worktree:
  ```bash
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:4321/
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/programs
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/api/public/filters
  ```
  Expected: `200` / no redirect for `/`, `200` for `/programs`, `200` for filters. **No** 301 redirects. **No** 404s.

  ```bash
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:4321/soccerone
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:4321/soccerone/leagues
  ```
  Expected: `301 https://www.gosoccerone.com/` and `301 https://www.gosoccerone.com/leagues`. This is the reverse-redirect taking effect on the Aspire host.

- [ ] **Step 7: Commit.**

  ```bash
  git -C "$WT" add src/middleware.ts
  git -C "$WT" commit -m "$(cat <<'EOF'
  feat(middleware): wire SoccerOne routing — rewrite, reverse 301, unmapped guard

  Three additive branches after org resolution. For non-SoccerOne
  requests every branch is null/false and the Aspire middleware path
  is unchanged.

  - Unmapped SoccerOne host (domain in DNS but no domain_mappings or
    status pending) → 404, not silent Aspire content.
  - Aspire-host /soccerone/* → 301 to https://www.gosoccerone.com/<...>
    to avoid duplicate-content SEO split.
  - SoccerOne-host marketing root (/, /leagues, /rent, /pickup,
    /memberships, /downtown, /worthington) → rewrite into the
    soccerone/* subtree. Shared routes (/register, /rentals, /dropin,
    /api/*, /signin, /dashboard) pass through unchanged.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: Per-brand GTM + prerender flip

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/soccerone/index.astro` (flip `prerender = true` → `false`)
- Modify: `.env.example`

These ship together because they're small, both affect the SoccerOne marketing render path, and both must be in place before the rewrite branch in Task 3 has anything coherent to serve.

- [ ] **Step 1: Read `src/layouts/BaseLayout.astro` to find the GTM injection.**

  Identify where the GTM container ID is currently hardcoded. There are usually two spots: a `<script>` tag in `<head>` and a `<noscript>` iframe in `<body>`. Both need the brand-conditional.

- [ ] **Step 2: Add `PUBLIC_GTM_CONTAINER_SOCCERONE=` to `.env.example`.**

  ```
  # SoccerOne brand GTM container. Optional — falls back to the Aspire
  # container when unset. Set this once Marketing has provisioned a
  # SoccerOne-specific GTM container.
  PUBLIC_GTM_CONTAINER_SOCCERONE=
  ```

- [ ] **Step 3: Modify `src/layouts/BaseLayout.astro` to select the container by resolved org.**

  In the frontmatter (before the `<html>` element), add:

  ```astro
  ---
  // ... existing imports ...
  import { SOCCERONE_ORG_SLUG } from "@/lib/organization/soccerone-routing";

  // ... existing props destructuring ...

  // GTM container — per-brand. Aspire is the default (preserves byte-identical
  // behavior on every non-SoccerOne request). SoccerOne uses a separate
  // container when PUBLIC_GTM_CONTAINER_SOCCERONE is set; otherwise it also
  // falls back to Aspire's container.
  const ASPIRE_GTM_CONTAINER = "GTM-XXXXXXX"; // existing Aspire container id — keep whatever is currently hardcoded here
  const SOCCERONE_GTM_CONTAINER = import.meta.env.PUBLIC_GTM_CONTAINER_SOCCERONE || ASPIRE_GTM_CONTAINER;
  const gtmContainerId =
    Astro.locals.organization?.slug === SOCCERONE_ORG_SLUG
      ? SOCCERONE_GTM_CONTAINER
      : ASPIRE_GTM_CONTAINER;
  ---
  ```

  When you edit, **preserve the existing Aspire container ID byte-for-byte** in `ASPIRE_GTM_CONTAINER` — copy it from whatever is hardcoded today. Then replace every occurrence of that literal string in the template (the script tag and the noscript iframe) with `{gtmContainerId}`.

  Example (concrete spots in the template — adapt to whatever the file actually contains):
  ```astro
  <!-- before -->
  <script>(function(w,d,s,l,i){...})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX" ...></iframe></noscript>

  <!-- after -->
  <script set:html={`(function(w,d,s,l,i){...})(window,document,'script','dataLayer','${gtmContainerId}');`} />
  <noscript><iframe src={`https://www.googletagmanager.com/ns.html?id=${gtmContainerId}`} ...></iframe></noscript>
  ```

  If the script is currently a static literal that doesn't accept interpolation in Astro, use `set:html` with a template literal as shown. Confirm by reading the existing template structure first.

- [ ] **Step 4: Flip prerender in `src/pages/soccerone/index.astro`.**

  ```astro
  ---
  // before:
  // export const prerender = true;
  // after:
  export const prerender = false;
  // ...
  ---
  ```

  Confirm the other `soccerone/*` pages do not have `prerender = true` (spec says only `index.astro` currently does). Run:
  ```bash
  grep -l "prerender = true" $WT/src/pages/soccerone/*.astro $WT/src/pages/soccerone/**/*.astro
  ```
  Expected: empty output after the flip. If other files are listed, flip them too.

- [ ] **Step 5: Type check + build.**

  ```bash
  cd "$WT"
  npx tsc --noEmit 2>&1 | grep -vE "(progress\.tsx|separator\.tsx|r2\.ts)" | tail -10
  ```
  Expected: 0 errors from `BaseLayout.astro` and the soccerone pages.

  ```bash
  npm run build 2>&1 | tail -25
  ```
  Expected: build succeeds. Pay attention to any warning about prerender (the flip from true to false should silence any "prerendered page reads Astro.request.headers" false-positive warning that the spec mentions in CLAUDE.md).

- [ ] **Step 6: Manual smoke — Aspire still uses its own GTM.**

  With the dev server running:
  ```bash
  curl -s http://localhost:4321/ | grep -oE 'GTM-[A-Z0-9]+' | sort -u
  ```
  Expected: only the Aspire container ID appears (the existing one before this task). SoccerOne content is not yet reachable on localhost because the resolver hasn't been configured for it — that's verified in staging (per the ops checklist) via the subdomain or after the domain mapping is added in Task 5.

- [ ] **Step 7: Commit.**

  ```bash
  git -C "$WT" add src/layouts/BaseLayout.astro src/pages/soccerone/index.astro .env.example
  git -C "$WT" commit -m "$(cat <<'EOF'
  feat(brand): per-brand GTM + SSR for SoccerOne marketing root

  - BaseLayout selects the GTM container by resolved org slug. Aspire's
    container is the default (preserves byte-identical Aspire pages).
    SoccerOne uses PUBLIC_GTM_CONTAINER_SOCCERONE when set; falls back
    to the Aspire container otherwise.
  - soccerone/index.astro flips from prerender=true to false. The
    middleware host-rewrite is a request-time operation and cannot
    target a prerendered route.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: SoccerOne org provisioning script

**Files:**
- Create: `scripts/seed-soccerone-org.ts`

A branch-specific, idempotent script that creates the SoccerOne organization row + locations (Downtown + Worthington) + venues + `domain_mappings` rows. Hard-guarded against prod by default. Per CLAUDE.md "Database write surface," this is a one-off branch script — delete after the launch is confirmed stable.

- [ ] **Step 1: Read the existing `src/lib/db/seeds/seed-e2e-tests.ts` `orgb` setup** for the org/location/venue insert patterns. The SoccerOne script mirrors that shape, just with real names and the prod `domain_mappings` rows added.

- [ ] **Step 2: Write the script.**

  ```typescript
  // scripts/seed-soccerone-org.ts
  /**
   * One-off provisioning script: create the SoccerOne organization, its
   * locations, venues, and domain_mappings rows.
   *
   * Idempotent — safe to re-run. Each insert is "select-by-slug,
   * insert-if-missing." No deletes.
   *
   * Usage (staging):
   *   npx tsx scripts/seed-soccerone-org.ts
   *
   * Usage (prod):
   *   npx tsx scripts/seed-soccerone-org.ts --prod
   *
   * The `--prod` flag is required to target a prod DB. Without it, the
   * script refuses to run unless DATABASE_URL contains "staging" or
   * "switchyard" or "localhost".
   *
   * Per CLAUDE.md "Database write surface" — this is a branch-specific
   * one-off. Delete the file after the SoccerOne launch is confirmed
   * stable in prod.
   */
  import "dotenv/config";
  import { getDb } from "../src/lib/db";
  import {
    organizations,
    locations,
    domainMappings,
  } from "../src/lib/db/schema/organizations";
  import { venues } from "../src/lib/db/schema/teams";
  import { eq } from "drizzle-orm";

  const SAFE_HOST_FRAGMENTS = ["localhost", "switchyard", "staging"];
  const PROD_OPT_IN = process.argv.includes("--prod");

  function assertSafeTarget() {
    const url = process.env.DATABASE_URL ?? "";
    if (PROD_OPT_IN) {
      console.log("⚠️  --prod flag set; allowing potentially-prod DATABASE_URL.");
      return;
    }
    if (!SAFE_HOST_FRAGMENTS.some((frag) => url.includes(frag))) {
      console.error(
        "❌ DATABASE_URL does not look like a safe (staging/local) target.",
      );
      console.error(`   Got: ${url.replace(/:[^@]+@/, ":***@")}`);
      console.error("   Pass --prod to override.");
      process.exit(1);
    }
  }

  async function main() {
    assertSafeTarget();
    const db = getDb();
    if (!db) {
      throw new Error("Could not initialize DB client");
    }

    console.log("1. Creating SoccerOne organization...");
    let [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, "soccerone"))
      .limit(1);

    if (!org) {
      [org] = await db
        .insert(organizations)
        .values({
          name: "SoccerOne",
          slug: "soccerone",
          legalName: "SoccerOne LLC",
          status: "active",
          // IMPORTANT: NOT "headquarters" — Aspire is the HQ org. SoccerOne
          // is a partner/franchise tenant. The default-org resolver picks
          // the oldest HQ org, so SoccerOne being a non-HQ guarantees
          // Aspire stays the fallback default.
          organizationType: "franchise",
        })
        .returning();
      console.log(`   ✓ Created org ${org.id}`);
    } else {
      console.log(`   ✓ Org already exists: ${org.id}`);
    }

    console.log("\n2. Creating Downtown location...");
    let [downtown] = await db
      .select()
      .from(locations)
      .where(eq(locations.slug, "soccerone-downtown"))
      .limit(1);

    if (!downtown) {
      [downtown] = await db
        .insert(locations)
        .values({
          organizationId: org.id,
          name: "SoccerOne Downtown",
          slug: "soccerone-downtown",
          city: "Columbus",
          state: "OH",
          country: "US",
          timezone: "America/New_York",
          active: true,
        })
        .returning();
      console.log(`   ✓ Created location ${downtown.id}`);
    } else {
      console.log(`   ✓ Downtown location already exists: ${downtown.id}`);
    }

    console.log("\n3. Creating Worthington location...");
    let [worthington] = await db
      .select()
      .from(locations)
      .where(eq(locations.slug, "soccerone-worthington"))
      .limit(1);

    if (!worthington) {
      [worthington] = await db
        .insert(locations)
        .values({
          organizationId: org.id,
          name: "SoccerOne Worthington",
          slug: "soccerone-worthington",
          city: "Worthington",
          state: "OH",
          country: "US",
          timezone: "America/New_York",
          active: true,
        })
        .returning();
      console.log(`   ✓ Created location ${worthington.id}`);
    } else {
      console.log(`   ✓ Worthington location already exists: ${worthington.id}`);
    }

    console.log("\n4. Creating domain_mappings rows...");
    // Both rows are inserted with status='pending'. The founder flips them
    // to 'ssl_active' from the admin UI / DB after Netlify confirms SSL
    // for each hostname. Until then, the resolver does not match these
    // hostnames, so the middleware's SoccerOne branch does not fire on
    // gosoccerone.com — the unmapped-host guard returns 404 instead.
    for (const domain of ["gosoccerone.com", "www.gosoccerone.com"]) {
      const [existing] = await db
        .select()
        .from(domainMappings)
        .where(eq(domainMappings.domain, domain))
        .limit(1);

      if (!existing) {
        const [row] = await db
          .insert(domainMappings)
          .values({
            domain,
            organizationId: org.id,
            status: "pending",
          })
          .returning();
        console.log(`   ✓ Created domain_mapping ${domain} → ${row.id} (status: pending)`);
      } else {
        console.log(`   ✓ ${domain} already mapped (status: ${existing.status})`);
      }
    }

    console.log("\n✅ SoccerOne provisioning complete.");
    console.log("\nNext steps (see docs/ops/soccerone-launch-checklist.md):");
    console.log("  • Test routing via http://soccerone.aspiresports.com (subdomain resolver matches by org slug).");
    console.log("  • Add gosoccerone.com + www.gosoccerone.com as Netlify domain aliases.");
    console.log("  • Point DNS at the registrar.");
    console.log("  • Wait for Netlify SSL.");
    console.log("  • Flip domain_mappings.status to 'ssl_active' for both rows.");
  }

  main().catch((err) => {
    console.error("❌ provisioning failed:", err);
    process.exit(1);
  });
  ```

  If the `domainMappings` table actually requires additional columns (e.g. `isPrimary` flag, `addedAt`, etc.), check the schema in `src/lib/db/schema/organizations.ts` and populate them. The script must not crash on missing required fields.

- [ ] **Step 3: Dry-run against the staging/switchyard test DB.**

  ```bash
  cd "$WT"
  export $(grep -E "^DATABASE_URL=" .env | xargs)
  npx tsx scripts/seed-soccerone-org.ts 2>&1 | tail -30
  ```
  Expected: clean run, idempotent (re-running prints "already exists" for each step). Confirms the script works without crashing on the real schema.

- [ ] **Step 4: Verify the rows landed.**

  ```bash
  npx tsx -e "
    import postgres from 'postgres';
    const sql = postgres(process.env.DATABASE_URL!);
    (async () => {
      const orgs = await sql\`SELECT id, name, slug, status, organization_type FROM organizations WHERE slug = 'soccerone'\`;
      const locs = await sql\`SELECT name, slug, city FROM locations WHERE organization_id = \${orgs[0].id}\`;
      const doms = await sql\`SELECT domain, status FROM domain_mappings WHERE organization_id = \${orgs[0].id}\`;
      console.log('org:', orgs[0]);
      console.log('locations:', locs);
      console.log('domain_mappings:', doms);
      await sql.end();
    })();
  "
  ```
  Expected output: one SoccerOne org with `organizationType = 'franchise'`, two locations (downtown + worthington), two domain_mappings (gosoccerone.com + www.gosoccerone.com, status: pending).

- [ ] **Step 5: Commit.**

  ```bash
  git -C "$WT" add scripts/seed-soccerone-org.ts
  git -C "$WT" commit -m "$(cat <<'EOF'
  chore(seed): SoccerOne org provisioning script (branch-specific)

  Idempotent, hard-guarded against prod (requires --prod flag). Creates
  the SoccerOne org (slug: soccerone, organizationType: franchise — NOT
  headquarters, so it can't displace Aspire as the default-org
  fallback), its Downtown + Worthington locations, and two
  domain_mappings rows with status='pending' (founder flips to
  ssl_active after Netlify SSL confirms).

  Per CLAUDE.md "Database write surface" — branch-specific one-off.
  Delete after the SoccerOne launch is confirmed stable.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 6: Ops launch checklist

**Files:**
- Create: `docs/ops/soccerone-launch-checklist.md`

Documents the runtime steps the founder follows to take gosoccerone.com live. Not code — the engineer creates the doc, the founder executes it.

- [ ] **Step 1: Write the checklist.**

  ```markdown
  # SoccerOne launch checklist

  Step-by-step ops sequence to take `www.gosoccerone.com` from "code merged"
  to "real traffic served." Run in order — no step can be skipped without
  risking either silent Aspire content on the SoccerOne domain (the regression
  spec §4 forbids) or broken SoccerOne routing.

  ---

  ## Stage 1 — Code merged

  Pre-condition: this PR (Phase 1) is merged into `main`. The middleware
  knows how to rewrite SoccerOne marketing roots and 301 the Aspire-side
  /soccerone/* paths. But no `domain_mappings` rows exist in prod yet, so
  nothing actually serves SoccerOne content anywhere.

  At this point, `curl https://www.gosoccerone.com/` (if DNS pointed there)
  would hit Aspire's Netlify site and the **unmapped-host guard returns
  404** — by design. We don't want the unmapped host silently serving
  Aspire content.

  ## Stage 2 — Staging provisioning

  Goal: prove the SoccerOne tenant resolves and the marketing pages render,
  before touching DNS.

  - [ ] **Run the provisioning script against staging:**
    ```bash
    cd /path/to/web-app
    DATABASE_URL=<staging-url> npx tsx scripts/seed-soccerone-org.ts
    ```
    Expected: clean idempotent run, creating org / locations / domain_mappings.

  - [ ] **Test routing via subdomain on staging.** The resolver matches
    the org by slug for any `<slug>.<base-domain>` request — so we don't
    need DNS for `soccerone.aspiresports.com` until later. Visit:
    ```
    https://soccerone.<staging-host>/
    https://soccerone.<staging-host>/leagues
    https://soccerone.<staging-host>/rent
    https://soccerone.<staging-host>/pickup
    https://soccerone.<staging-host>/memberships
    ```
    Each should render the SoccerOne-branded marketing page. The
    `SoccerOneHeader` / `SoccerOneFooter` should appear; the Aspire
    navigation should NOT.

  - [ ] **Verify Aspire is untouched on staging.** From staging's main
    host (not the subdomain), check:
    ```
    https://<staging-host>/
    https://<staging-host>/programs
    https://<staging-host>/events
    https://<staging-host>/sports
    https://<staging-host>/locations
    ```
    Aspire pages should be byte-identical to pre-Phase-1.

  - [ ] **Verify the reverse 301 on Aspire:**
    ```bash
    curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
      https://<staging-host>/soccerone
    curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
      https://<staging-host>/soccerone/leagues
    ```
    Expected: `301 https://www.gosoccerone.com/` and
    `301 https://www.gosoccerone.com/leagues`.

  ## Stage 3 — Netlify domain aliases

  Goal: tell Netlify that `gosoccerone.com` + `www.gosoccerone.com` should
  serve from the production Aspire site.

  - [ ] **In the Netlify dashboard for the production site:**
    Settings → Domain management → Production domains → Add domain alias.
    Add `www.gosoccerone.com` first (canonical). Then `gosoccerone.com`
    (apex). Mark `www.gosoccerone.com` as the **primary alias** so Netlify
    301-redirects the apex to it.

  - [ ] **Confirm Netlify shows "DNS configuration: needs verification"**
    for each new alias. That's expected — we haven't configured DNS yet.

  ## Stage 4 — DNS

  Goal: route public DNS for `gosoccerone.com` (and `www`) to Netlify.

  - [ ] **At the domain registrar for `gosoccerone.com`:**
    - For `www`: add a `CNAME` record pointing to Netlify's edge
      hostname (Netlify shows the exact target — usually
      `<sitename>.netlify.app` or `apex-loadbalancer.netlify.com`).
    - For the apex (`@`): add an `ALIAS` / `ANAME` record pointing to
      the same Netlify target. If the registrar doesn't support
      ALIAS/ANAME, use the four `A` records Netlify provides.

  - [ ] **Wait for DNS propagation:** typically 5–30 minutes.
    Confirm with:
    ```bash
    dig +short www.gosoccerone.com
    dig +short gosoccerone.com
    ```
    Both should resolve to Netlify's edge.

  ## Stage 5 — SSL

  - [ ] **In Netlify dashboard:** the domain entries should auto-progress
    from "needs verification" → "DNS configured" → "Provisioning
    certificate" → "Certificate active." Wait until both show
    "Certificate active." Usually a few minutes after DNS propagates.

  ## Stage 6 — Prod provisioning

  Goal: insert the SoccerOne org row + locations + domain_mappings into
  prod. Until this runs, the prod DB has no SoccerOne tenant, and the
  unmapped-host guard returns 404 for `www.gosoccerone.com`.

  - [ ] **Run the provisioning script against prod** with the explicit
    opt-in flag:
    ```bash
    cd /path/to/web-app
    DATABASE_URL=<prod-url> npx tsx scripts/seed-soccerone-org.ts --prod
    ```
    Expected: same idempotent run as staging.

  ## Stage 7 — Flip domain_mappings to ssl_active

  Goal: tell the resolver that the hostnames are live.

  - [ ] **Via psql against prod** (or the admin UI when implemented):
    ```sql
    UPDATE domain_mappings
    SET status = 'ssl_active'
    WHERE domain IN ('gosoccerone.com', 'www.gosoccerone.com');
    ```
    From this moment on, `www.gosoccerone.com` resolves to the SoccerOne
    org in the middleware, and the rewrite branch serves the marketing
    pages.

  ## Stage 8 — Smoke test prod

  - [ ] **Visit `https://www.gosoccerone.com/`** — should render the
    SoccerOne home page (the video hero + two-facility selector).
  - [ ] **Visit `https://gosoccerone.com/`** — should 301 to
    `https://www.gosoccerone.com/`.
  - [ ] **Visit `https://www.gosoccerone.com/leagues`** etc. — each
    marketing root should render.
  - [ ] **Verify Aspire is untouched:** `https://aspiresports.com/` (or
    whatever the prod Aspire host is) should be byte-identical to
    pre-launch.
  - [ ] **Verify the reverse 301:** `https://<aspire-host>/soccerone`
    should 301 to `https://www.gosoccerone.com/`.

  ## Rollback

  If anything looks wrong in Stage 8:

  - **Quick rollback (preserves the org):** UPDATE the
    `domain_mappings.status` for both rows back to `pending`. The
    unmapped-host guard kicks in again and SoccerOne traffic gets a 404
    while you investigate. Aspire is unaffected.
  - **Full rollback:** in Netlify, remove the domain aliases. The DNS
    records can stay (harmless) or be removed. Aspire is unaffected.

  ## After-launch cleanup

  Once SoccerOne traffic is stable (say, 7 days):

  - [ ] **Delete the branch-specific provisioning script:**
    `git rm scripts/seed-soccerone-org.ts && git commit -m "chore: drop one-off SoccerOne provisioning script"`
    Per CLAUDE.md "Database write surface."
  ```

- [ ] **Step 2: Commit.**

  ```bash
  git -C "$WT" add docs/ops/soccerone-launch-checklist.md
  git -C "$WT" commit -m "$(cat <<'EOF'
  docs(ops): SoccerOne launch checklist

  Step-by-step the founder follows to take gosoccerone.com live:
  staging verification via subdomain → Netlify aliases → DNS → SSL →
  prod provisioning → domain_mappings flip → smoke test → rollback /
  cleanup guidance.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 7: Pre-push regression + open PR

**Files:** none modified.

- [ ] **Step 1: Re-run the unit suite.**

  ```bash
  cd "$WT"
  npx vitest run tests/unit/ 2>&1 | tail -15
  ```
  Expected: all tests pass, including the new soccerone-routing suite.

- [ ] **Step 2: Re-run the public API suite** (confirms Phase 0 didn't regress and the new middleware branches don't break it for default-host requests).

  ```bash
  CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/ 2>&1 | tail -15
  ```
  Expected: same 18+ tests pass.

- [ ] **Step 3: Type check + build.**

  ```bash
  npx tsc --noEmit 2>&1 | grep -vE "(progress\.tsx|separator\.tsx|r2\.ts)" | tail -10
  npm run build 2>&1 | tail -25
  ```
  Expected: 0 errors from Phase 1 files; build succeeds. The three pre-existing main-baseline errors (`progress.tsx`, `separator.tsx`, `r2.ts`) are not Phase 1's concern — leave them.

- [ ] **Step 4: Aspire-content regression smoke** (with SoccerOne org NOT yet seeded — the org will not be created in CI; the test DB only has it if you ran Task 5 against the local DB).

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/programs
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/api/public/filters
  # Reverse 301 still works:
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:4321/soccerone
  ```
  Expected: 200s for Aspire pages, 301 to canonical for `/soccerone`.

- [ ] **Step 5: Push and open PR.**

  ```bash
  git -C "$WT" push -u origin feat/soccerone-phase1-domain-plumbing 2>&1 | tail
  gh pr create --base main --head feat/soccerone-phase1-domain-plumbing \
    --title "Phase 1: domain plumbing for www.gosoccerone.com" \
    --body "$(cat <<'EOF'
  Phase 1 of the SoccerOne / gosoccerone.com project. Wires the middleware
  to serve the SoccerOne marketing tree on `www.gosoccerone.com` from the
  same Astro app, while keeping Aspire byte-identical for every
  non-SoccerOne request.

  Merging this PR is a **no-op for live Aspire** — no `domain_mappings`
  rows exist in prod, so all three SoccerOne middleware branches stay
  inactive. The follow-up ops sequence (see
  `docs/ops/soccerone-launch-checklist.md`) flips the domain to live.

  ## What changed

  - **`src/lib/organization/soccerone-routing.ts`** — pure module: hostnames,
    rewrite table, redirect canonicalization, unmapped-host detection.
  - **`src/middleware.ts`** — three additive branches after org resolution:
    (1) unmapped SoccerOne host → 404; (2) Aspire host `/soccerone/*` →
    301 to canonical gosoccerone.com; (3) SoccerOne host marketing root →
    rewrite into the `soccerone/*` subtree.
  - **`src/layouts/BaseLayout.astro`** — per-brand GTM. Aspire's container
    stays the default; SoccerOne uses `PUBLIC_GTM_CONTAINER_SOCCERONE`
    when set (falls back to Aspire's container otherwise).
  - **`src/pages/soccerone/index.astro`** — flipped from `prerender: true`
    to SSR (the middleware rewrite is a request-time op and can't target
    a prerendered route).
  - **`scripts/seed-soccerone-org.ts`** — idempotent provisioning script,
    `--prod` opt-in. Branch-specific; deleted post-launch.
  - **`docs/ops/soccerone-launch-checklist.md`** — full runbook for the
    founder.

  ## Test pattern note

  Per Phase 0's learning, Node `fetch` strips `Host`, so host-based
  middleware can't be exercised via Vitest HTTP tests. The rewrite logic
  lives in a pure module (`soccerone-routing.ts`) with comprehensive unit
  tests. Middleware integration is verified by reading the code and the
  manual smoke checks documented in the launch checklist.

  ## Reference docs

  - Spec: `docs/superpowers/specs/2026-05-22-soccerone-gosoccerone-domain-design.md` (§6)
  - Plan: `docs/superpowers/plans/2026-05-23-soccerone-phase1-domain-plumbing.md`

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```
  Expected: branch pushed; PR URL printed.

- [ ] **Step 6: Wait for CI green.** Per CLAUDE.md "A push isn't 'done' until CI is green on the resulting commit on origin." Don't declare complete on local-only verification.

---

## Acceptance

- [ ] Pure `soccerone-routing` module unit-tested (every entry in the rewrite table; every pass-through path; the redirect canonicalization; the unmapped-host detection with case + port normalization).
- [ ] Middleware integration: SoccerOne branches are gated such that for any non-SoccerOne request the executed code path is functionally identical to today (Aspire safety property).
- [ ] BaseLayout GTM defaults to Aspire's existing container; SoccerOne branch only fires for `slug === 'soccerone'`.
- [ ] `soccerone/index.astro` is SSR (no prerender) so middleware rewrite can target it.
- [ ] Provisioning script idempotent and prod-guarded.
- [ ] Launch checklist captures every runtime step from "code merged" to "live traffic" and rollback guidance.
- [ ] PR opens cleanly; CI green on the head commit on main.

---

## Out of scope (deferred to Phase 2)

- Wiring the marketing CTAs (leagues / rent / pickup / memberships) into the live booking flows — Phase 2.
- Membership subsystem (Stripe Subscriptions, dashboard pause/cancel) — Phase 3.

---

## Self-review

**Spec coverage** — every Phase 1 requirement in spec §6 maps to a task:

| Spec §6 sub-task | Task |
|---|---|
| 1a (org + domain_mappings) | Task 5 (provisioning script) + Task 6 (when to run it) |
| 1b (middleware host-rewrite) | Task 2 (rewrite module) + Task 3 (middleware) |
| 1c (Aspire-side reverse 301) | Task 2 + Task 3 |
| 1d (SSR for rewritten marketing pages) | Task 4 |
| 1e (Netlify + DNS + SSL) | Task 6 (ops checklist — not code) |
| 1f (per-brand GTM) | Task 4 |
| §12 unmapped-SoccerOne-host guard | Task 2 + Task 3 |

**Placeholder scan** — no "TBD" / "TODO" / "implement later" / "handle edge cases." Every step has either complete code or a complete bash command. The only deliberate abstraction is `GTM-XXXXXXX` in the BaseLayout snippet, which is explicit: "preserve the existing Aspire container ID byte-for-byte — copy from whatever is hardcoded today." That's a contextual instruction, not a placeholder.

**Type / name consistency** — `SOCCERONE_HOSTS`, `SOCCERONE_CANONICAL_HOST`, `SOCCERONE_ORG_SLUG`, `SOCCERONE_MARKETING_REWRITES`, `rewriteSoccerOnePath`, `getAspireToSoccerOneRedirect`, `isUnmappedSoccerOneHost` are used identically across Task 2 (where they're defined), Task 3 (where the middleware imports them), and Task 4 (where BaseLayout imports `SOCCERONE_ORG_SLUG`).

**Scope** — single Phase 1 plan, ~7 commits, one PR. Phase 2 + Phase 3 are separate plans.
