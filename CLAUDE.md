# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aspire Sports is a multi-tenant sports management platform for youth sports organizations. It handles program registration, payments, team management, and scheduling. Built to replace third-party SaaS like LeagueApps.

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

## Testing

```bash
npm run test:api          # Run API integration tests (Vitest)
npm run test:api:watch    # Watch mode
npm test                  # Run E2E tests (Playwright)
```

- API tests live in `tests/api/` — hit the running dev server over HTTP (start `npm run dev` first)
- Test accounts: admin/coach/parent `@test.aspiresports.com` / `Test{Role}123!`; media staff/editor use `TestMedia123!`
- E2E seed data comes from `src/lib/db/seeds/seed-e2e-tests.ts` via `npm run db:seed:e2e`

### Playwright conventions

- Pages driven by e2e tests should have their top-level `client:load` React component call `useHydrationBeacon()` from `@/lib/hooks/use-hydration-beacon`. It sets `data-hydrated="true"` on `<html>` once `useEffect` runs.
- In the test, call `await waitForHydration(page)` from `tests/utils/test-helpers.ts` **before** any click or keypress. CI's headless Chromium hydrates slower than local headed runs — interactions that land on un-hydrated DOM silently drop (clicks don't fire, window `keydown` listeners aren't attached yet).
- Prefer element clicks over `page.keyboard.press(...)` for keyboard shortcuts tied to `window.addEventListener("keydown", ...)`. Element clicks go through React's synthetic event system and are reliable even mid-hydration; window-level keys need the listener to already be attached.
- If `page.goto()` hangs on a page that has broken images (e.g. `mock-r2.local` URLs when `R2_MOCK=1`), use `waitUntil: "domcontentloaded"` instead of the default `"load"`.

## Pre-push checklist (major work — schema changes, new endpoints, new E2E flows)

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
