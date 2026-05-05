# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aspire Sports is a multi-tenant sports management platform for youth sports organizations. It handles program registration, payments, team management, and scheduling. Built to replace third-party SaaS like LeagueApps.

## Architectural Summary

Key patterns established across the codebase — follow these when adding new pages or endpoints:

- **BaseLayout**: All pages use `src/layouts/BaseLayout.astro` as the html/head/body wrapper. It injects GTM, the Navigation component (which fetches auth state client-side via `/api/auth/me`), the global stylesheet, and the skip-nav link. Never write a bare `<html>` page; always extend BaseLayout.
- **Middleware auth gates**: Auth and role enforcement live in `src/middleware.ts` as route-prefix rules (e.g. `/admin` → requires admin role, `/dashboard` → requires any auth). Pages do not repeat redirect boilerplate — the middleware handles it.
- **Tenant-scoped admin endpoints**: Every admin API endpoint that reads or mutates org-owned data must validate tenant ownership via the `requireSameOrg*` helpers in `src/lib/auth/require-resource-ownership.ts`. Never skip this check on admin endpoints.
- **Decomposed registration wizard**: The registration flow is split into focused step components under `src/components/registration/` (`who-step.tsx`, `waiver-step.tsx`, `payment-step.tsx`, etc.) orchestrated by `registration-wizard.tsx`. New step logic goes into its own file.
- **Error/loading/empty UI**: Use shared primitives (`ErrorBanner`, `EmptyState`, `LoadingSkeleton`) from `src/components/ui/` rather than rolling per-component styles. See the UI feedback primitives section below.

## Commands

```bash
# Development (requires .env with DATABASE_URL)
npm run dev              # Start dev server at localhost:4321

# Database
npm run db:push          # Push schema changes to database
npm run db:generate      # Generate migrations
npm run db:studio        # Open Drizzle Studio
npm run db:seed          # Seed database with test data

# Build
npm run build            # Production build
npm run preview          # Preview production build
```

## Architecture

### Tech Stack
- **Framework**: Astro 5 with React 19 for interactive components
- **Database**: PostgreSQL (Railway) with Drizzle ORM
- **Auth**: Lucia Auth v3 with session-based authentication
- **Payments**: Stripe (direct payments + Connect for franchises)
- **Styling**: Tailwind CSS 4
- **Deployment**: Netlify (SSR with Netlify Functions)

### Multi-Tenant Structure
Organizations can have multiple locations. Domain routing resolves the current organization:
- Custom domains: `aspiresportsohio.com`
- Subdomains: `powell.aspiresports.com`
- Resolution happens in middleware via `lib/organization/domain-resolver.ts`

### Key Directories

```
src/
├── lib/
│   ├── db/schema/       # Drizzle table definitions
│   ├── auth/            # Lucia auth setup, password utils
│   ├── organization/    # Multi-tenant context, domain resolver
│   └── stripe/          # Stripe client, Connect integration
├── components/
│   ├── ui/              # shadcn/ui components
│   ├── admin/           # Admin dashboard components
│   ├── dashboard/       # Parent dashboard components
│   └── registration/    # Registration wizard
├── pages/
│   ├── api/             # API routes (Netlify Functions)
│   │   ├── auth/        # signin, signup, signout
│   │   ├── admin/       # Admin CRUD endpoints
│   │   └── public/      # Public data endpoints
│   ├── admin/           # Admin pages
│   └── dashboard/       # Parent dashboard pages
└── middleware.ts        # Auth + organization resolution
```

### Database Schema Modules
- `users.ts` - Users, sessions, roles, password reset tokens
- `organizations.ts` - Organizations, locations, domain mappings, features/settings
- `programs.ts` - Sports, programs, seasons, age groups
- `registrations.ts` - Family members, registrations
- `payments.ts` - Payments, payment plans, scheduled payments
- `teams.ts` - Teams, rosters, games, venues, standings

### Authentication Flow
1. Middleware (`src/middleware.ts`) validates session cookie on every request
2. Protected routes (`/dashboard`, `/admin`, `/coach`) redirect to `/signin`
3. User/session available via `Astro.locals.user` and `Astro.locals.session`
4. Organization context available via `Astro.locals.organization`

### API Pattern
API routes are in `src/pages/api/`. They check `locals.user` for auth and return JSON:
```typescript
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  // ... handle request
};
```

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `PUBLIC_APP_URL` - Base URL for the app

## Conventions

- React components use `"use client"` directive for client-side interactivity
- UI components in `src/components/ui/` follow shadcn/ui patterns with `cn()` utility
- Forms use react-hook-form with zod validation
- Toast notifications via sonner
- All timestamps stored in UTC, displayed in organization's timezone

### Prerender policy

`export const prerender = true;` builds the page as static HTML at build time. Use it only for pages that meet **all** of these criteria:
- Don't depend on `Astro.locals.user` (anonymous content)
- Don't depend on `Astro.url.searchParams`, `Astro.cookies`, or `Astro.url.search` (request-time data)
- Don't query the DB at request time (or the query is purely for static SEO data)

**Default to SSR** (no prerender flag) for:
- Any page protected by middleware (`/dashboard/**`, `/admin/**`, `/coach/**`, `/account/**`, `/messages/**`, `/media/**`) — they need request-time user context
- Any page that reads `Astro.url.searchParams` or `Astro.url.search` (e.g. `?redirect=`, `?audience=`)
- Any page that personalizes copy by user state, even if the personalization happens in a React `client:load` component that reads from middleware-set locals
- Auth pages (`/signin`, `/signup`, `/forgot-password`) — middleware bounces already-authed users to `/dashboard` at request time

**Use `prerender = true`** on:
- Static marketing pages (`/about`, `/contact`, `/privacy`, `/terms`, `/refund-policy`)
- Print-only guides and minibooks under `/guides/**` and `/minibooks/**`
- Static error/info pages (`/auth/link-expired`) that don't branch on request state at the Astro layer — note: if the page reads `Astro.url.searchParams`, remove the flag
- Any other page where the rendered HTML is identical for every visitor

**Important — the Navigation component is not a reason to avoid prerendering.** `<Navigation client:load />` in `BaseLayout` fetches auth state client-side via `/api/auth/me`. It does not require Astro SSR on the enclosing page.

**Build warning note:** The middleware reads `context.request.headers` on every request, including during prerender simulation at build time. This causes Astro to emit `Astro.request.headers is not available on prerendered pages` warnings for every prerendered page. These warnings are a false positive — the middleware access is unavoidable given the `output: "server"` + selective prerender architecture. Treat them as noise; only investigate if a page itself reads `Astro.request.headers` in its frontmatter.

### UI feedback primitives

- **Inline state errors** (validation summary, API failures the user must address): use `<ErrorBanner message={...} />` from `@/components/ui/error-banner`. Don't roll per-form styling.
- **Action errors** (transient: save failed, network blip): use `toast.error(...)` from sonner.
- **Empty states**: use `<EmptyState title="..." description="..." />` from `@/components/ui/empty-state`.
- **Loading shimmer**: use `<LoadingSkeleton />` for generic placeholders; build domain-specific skeletons (e.g. `ProgramCardSkeleton`) only when the placeholder needs typed shape.

### People model

`family_members` rows represent **people** — either a dependent of a user (`parent_user_id` set, COPPA path) or the user themselves (`self_user_id` set, adult self path). Exactly one of the two is non-null per row, enforced by the `family_members_self_xor_parent` DB CHECK constraint. New code that creates `family_members` rows should use `resolvePerson()` in `src/lib/registrations/resolve-person.ts` rather than inserting directly — it handles dedupe (case-insensitive name+DOB for dependents, single-row-per-user for self) and avoids constraint races.

## Testing

```bash
npm run test:api          # Run API integration tests (Vitest)
npm run test:api:watch    # Watch mode
npm test                  # Run E2E tests (Playwright)
```

- API tests live in `tests/api/` — hit the running dev server over HTTP (start `npm run dev` first)
- Test accounts: admin/coach/parent `@test.aspiresports.com` / `Test{Role}123!`; media staff/editor use `TestMedia123!`
- E2E seed data comes from `src/lib/db/seeds/seed-e2e-tests.ts` via `npm run db:seed:e2e`

### Test directory layout

- `tests/api/` — Vitest API integration tests. Hit the running dev server over HTTP. Start `npm run dev` before running.
- `tests/unit/` — Vitest unit tests. No server, no DB required. Pure functions.
- `tests/e2e/` — Playwright end-to-end tests. Drive a real browser. Run with `npm test`.
- `tests/utils/` — Shared helpers (e.g., `waitForHydration`, `signIn`).

When adding a new test:
- Hits HTTP endpoints? → `tests/api/`
- Pure logic / parsers / helpers? → `tests/unit/`
- Drives a browser flow? → `tests/e2e/`

### Playwright conventions

- Pages driven by e2e tests should have their top-level `client:load` React component call `useHydrationBeacon()` from `@/lib/hooks/use-hydration-beacon`. It sets `data-hydrated="true"` on `<html>` once `useEffect` runs.
- In the test, call `await waitForHydration(page)` from `tests/utils/test-helpers.ts` (imported as `../utils/test-helpers` from within `tests/e2e/`) **before** any click or keypress. CI's headless Chromium hydrates slower than local headed runs — interactions that land on un-hydrated DOM silently drop (clicks don't fire, window `keydown` listeners aren't attached yet).
- Prefer element clicks over `page.keyboard.press(...)` for keyboard shortcuts tied to `window.addEventListener("keydown", ...)`. Element clicks go through React's synthetic event system and are reliable even mid-hydration; window-level keys need the listener to already be attached.
- If `page.goto()` hangs on a page that has broken images (e.g. `mock-r2.local` URLs when `R2_MOCK=1`), use `waitUntil: "domcontentloaded"` instead of the default `"load"`.

## Working style

Auto Mode is on by default — execute immediately on low-risk routine work (single-file edits, obvious bug fixes, doc tweaks, refactors confined to one component, anything reversible).

For non-trivial changes, state the plan in 1-2 sentences and wait for "go" before writing code:

- Multi-file refactors (>2 files affected)
- Schema changes or new Drizzle migrations
- New API routes / endpoints / pages
- Changes to shared infrastructure: middleware, auth, multi-tenancy, billing, Stripe Connect
- Multi-step planning docs, business strategy, or legal/agreement drafts

The pattern is a brief "here's what I'm about to do, confirm?" — not a full brainstorm, just enough framing to catch wrong-direction starts before they become rework.

## Branch hygiene

- **Confirm the branch before editing.** Run `git branch --show-current` at the start of any edit session — there have been incidents where the main repo got switched off an active feature branch mid-work, mixing edits across branches.
- **Use a worktree for ≥3-task plans or any subagent-driven implementation.** Branch drift during long multi-task sessions has required destructive cherry-pick recovery more than once. Create the worktree before the first edit, not after a problem surfaces. The `superpowers:using-git-worktrees` skill handles setup.
- **Never switch the main checkout off the user's active feature branch** to do unrelated work — open a worktree instead.

## Release process (auto-tag → deploy)

Every merge to `main` automatically tags + deploys to prod. No manual `git tag` ceremony required.

**Pipeline:**
1. PR merges to `main`
2. `.github/workflows/auto-tag.yml` bumps the patch version of the latest `v*` tag (e.g. v0.0.2 → v0.0.3) and pushes the new tag
3. The new tag triggers `.github/workflows/deploy.yml`, which runs migrations + builds + deploys to Netlify prod

**Escape hatches:**
- `[skip release]` or `[no release]` in a commit message → auto-tag is skipped (use for docs-only / refactor commits where you don't want a deploy)
- To bump minor or major (e.g. v0.1.0): manually push the tag — `git tag -a v0.1.0 -m "minor bump for X"; git push origin v0.1.0`. Auto-tag resumes patch-bumping from there.
- The auto-tag workflow ignores commits that touch only `docs/**` or `**/*.md`.

**Rollback:** check out the previous green tag and re-tag patch+1 from it, or use Netlify's "instant rollback" UI on the prod site.

## Database write surface

After the launch transition, the only DB-writing scripts in this repo are:

- `scripts/db-migrate.ts` / `db-migrate-bootstrap.ts` — schema migrations, runs every deploy
- `src/lib/db/seeds/seed-e2e-tests.ts` — staging-only fixture seed; refuses to run unless `DATABASE_URL` contains "staging" or `ALLOW_E2E_SEED=yes` (CI sets the flag against the staging Railway proxy)
- `scripts/provision-staging-db.sh` / `reset-staging-schema.sh` — staging provisioning, hard-guarded against prod

One-time job scripts (launch catalog seed, season-opener, prod cleanup) were deleted post-launch — leaving destructive bulk scripts in the repo with prod credentials available is a footgun once the catalog expands beyond their allow-lists. If a real one-off ever comes up, write it as a new branch-specific script and delete it after the merge.

## Pre-push checklist (major work — schema changes, new endpoints, new E2E flows)

For routine pushes, invoke the `/ship` skill — it automates steps 1, 5, and 6 below plus env-var-drift and E2E-filter scans. Use this full checklist for major work that warrants the API + Playwright runs (steps 2–4 require a running dev server).

A push isn't "done" until CI is green on the resulting commit on origin. Don't declare a task complete on the merit of a green local run; wait for the CI workflow to finish.

CI has bitten us twice for the same reasons. Run this sequence locally before pushing anything that touches schema, admin endpoints, or Playwright flows. All steps are fast (under ~5 min combined):

1. **Generate migration if you touched `src/lib/db/schema/*`.** `npm run db:push` is great for iteration but does NOT produce a migration file — CI's `npm run db:migrate` will fail on the new schema. Run `npm run db:generate`, review the generated `src/lib/db/migrations/NNNN_*.sql`, and commit it. Phase 1 and Phase 2 both shipped this gap.
2. **Re-seed e2e data:** `npm run db:seed:e2e`. The seed is idempotent; re-run catches any new fixtures the tests depend on and surfaces seed errors early.
3. **Run API tests with CI-equivalent env:** from a shell with the dev server already up (ideally started with `R2_MOCK=1 CRON_SECRET=<anything>`):
   ```bash
   CRON_SECRET=<same-as-dev-server> TEST_BASE_URL=http://localhost:4321 npm run test:api
   ```
   Mismatched `CRON_SECRET` between dev server and test runtime manifests as spurious 401 cron failures — don't chase those down, just match them.
4. **Run Playwright:** `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test`. If new specs interact with `client:load` components, confirm they use `waitForHydration(page)` and click-driven interactions.
5. **Build:** `npm run build`. Catches SSR-vs-prerender mistakes (e.g. `Astro.request.headers` on a prerendered page) that don't fire in `npm run dev`.
6. **Type check:** `npx tsc --noEmit` should report zero errors. The previous ~5-error baseline (seed scripts + seasons API + test helpers) was cleared in commit 9ff35ef — keep it that way.

### Multi-tenant query hazards

The CI database is shared across runs and accumulates orgs, users, sessions, etc. Any query that picks "a" row from a set of possible matches (`findFirst`, `.limit(1)`) MUST have an explicit `orderBy` — otherwise it runs fine locally (one match) and silently picks the wrong row on CI (many matches). The domain resolver and super-admin org fallback already enforce this; new code should too. When in doubt, `orderBy: (t, { asc }) => asc(t.createdAt)` is a safe default for "give me the oldest matching row."

## Design System

See `docs/design-system.md` for the full editorial cream design system reference (colors, typography, components, layout patterns).

## Disabled Skills

Do not use these skills — they are not relevant to this project:
- clinical-research
- sentencing-data-analysis
- text-message-table
- fmv-food-service-analysis
- presentation-builder
- newsletter-builder
