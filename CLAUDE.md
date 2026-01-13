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
- `AUTH_SECRET` - 32+ character secret for sessions
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `PUBLIC_APP_URL` - Base URL for the app

## Conventions

- React components use `"use client"` directive for client-side interactivity
- UI components in `src/components/ui/` follow shadcn/ui patterns with `cn()` utility
- Forms use react-hook-form with zod validation
- Toast notifications via sonner
- All timestamps stored in UTC, displayed in organization's timezone
