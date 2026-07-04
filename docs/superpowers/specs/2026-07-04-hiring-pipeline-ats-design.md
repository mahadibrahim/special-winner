# Hiring Pipeline (Coach/Ref ATS) — Design

**Date:** 2026-07-04
**Status:** Approved (user, 2026-07-04)
**Owner surface:** `/careers` (Aspire brand) → `job_applications` table → Notion "Hiring Pipeline" database

## Purpose

Aspire needs referees for the Fall 2026 adult leagues (start Sep 14) and a coach
pipeline for the 2027 youth launch. Candidates apply on the site; applications
land in a Notion board where staff move them through hiring stages. Our
database is the source of truth; Notion is the working pipeline view.

## Decisions (locked)

- **Approach A**: DB-first, Notion as a synced view. A Notion outage can never
  lose an application or error the applicant.
- **Roles**: one form, role selector — `referee` | `coach` | `staff`.
- **Resume upload**: optional in v1 (PDF ≤ 5 MB → R2). Field hides when R2 env
  is absent.
- **Placement**: Aspire site only (`/careers`). SoccerOne links to it
  ("Join the crew →" in footer/join page). No SoccerOne-hosted form in v1, so
  no Turnstile allowlist change is needed.
- **No status sync-back** from Notion. `job_applications.status` exists only so
  the admin fallback list can archive rows; Notion owns pipeline state.

## Data flow

```
/careers (React form, Turnstile)
  → POST /api/public/careers/apply
      1. zod validation
      2. Turnstile verify (src/lib/auth/turnstile.ts)
      3. rate limit 5/min/IP (src/lib/auth/rate-limit.ts, mirrors corporate-inquiry)
      4. optional resume: multipart file on the same request, server-side put
         to R2 via src/lib/storage/r2.ts (the check-in photo-upload pattern —
         NOT the media-jobs presign flow); PDF-only + 5 MB enforced
         server-side → resumeUrl
      5. INSERT job_applications  ← source of truth; success from here on
      6. best-effort: create Notion page (notionPageId/notionSyncedAt on success)
      7. best-effort: Resend email notification to hello@ (fromForBrand)
  → success screen
cron (existing pattern): retry rows where notionSyncedAt IS NULL AND createdAt > -30d
```

Failures: Turnstile → inline error; rate limit → 429 + retry-after; DB down →
"please email us" error (sponsor-inquiry pattern); Notion/Resend down →
applicant still sees success, row flagged unsynced / error logged. Duplicate
applications are allowed.

## Schema (additive migration via db:generate)

`job_applications`
- `id` uuid PK, `organizationId` FK, `brand` text
- `role` enum: `referee` | `coach` | `staff`
- `firstName`, `lastName`, `email`, `phone` (phone optional)
- `preferredLocation` text (worthington | downtown | either)
- `certifications` text (free text: ref grade, coaching badges)
- `experience` text
- `availability` text[] (weeknights, weekends, mornings)
- `resumeUrl` text nullable
- `source` text nullable ("how did you hear about us")
- `status` text default `new` (admin-list archiving only)
- `notionPageId` text nullable, `notionSyncedAt` timestamp nullable
- `createdAt` timestamp

## Notion integration

- One-time setup: create a **"Hiring Pipeline"** database in the user's Notion
  workspace (via the Notion connection, with user go-ahead): board view grouped
  by **Status** (New → Screening → Interview → Offer → Hired / Rejected);
  properties: Role (select), Facility (select), Email, Phone, Certifications,
  Availability (multi-select), Resume (url), Applied (date), Source. Card body
  carries the experience blurb.
- App-side: official `@notionhq/client`; new lib `src/lib/notion/ats.ts` with a
  pure payload builder (unit-testable) + a thin client wrapper.
- Env (feature-gated per repo convention — missing env = sync inert, app fine):
  - `NOTION_API_KEY` — internal integration token, minted by the user at
    notion.so/my-integrations, stored in Bitwarden; the database must be shared
    with the integration.
  - `NOTION_ATS_DATABASE_ID`

## Pages & components

- `src/pages/careers.astro` — `prerender = true` (static marketing shell: no
  locals/searchParams/DB at request time; the client:load form is not a reason
  to avoid prerendering, per the prerender policy in CLAUDE.md). Editorial
  cream design system, BaseLayout.
- `src/components/careers/application-form.tsx` — react-hook-form + zod,
  `useHydrationBeacon()`, Turnstile widget, ErrorBanner/sonner per UI rules.
  Mobile-first, ~90-second completion target.
- `src/pages/admin/applications.astro` + minimal list component — read-only,
  tenant-scoped via `requireSameOrg*`, shows all fields + Notion sync state.
  EmptyState/LoadingSkeleton primitives.
- SoccerOne: add "Join the crew →" link (footer + /join page) pointing to the
  Aspire `/careers` URL.

## Testing

- Unit: zod schema; Notion payload builder (pure).
- API (`tests/api/careers/apply.test.ts`): happy path inserts + returns 200
  with Notion env absent (CI mode); rate limiting; validation errors.
  Turnstile note: `verifyTurnstile` fails OPEN in dev/CI when no secret is
  set, so submissions pass in tests without a token; the rejection path
  (fail-closed in prod, invalid token) is covered by unit tests on the
  existing pure helper, not the API suite.
- E2E (post-merge suite): fill form → success screen, click-driven,
  waitForHydration.
- Seed: nothing required (applications are created by tests themselves).

## Out of scope (v1)

Status sync-back from Notion, applicant accounts, interview scheduling, offer
letters, multi-step applications, SoccerOne-hosted form.

## Rollout

1. Ship code (Notion env absent → form works, rows stored, email sent).
2. User mints Notion integration token; I create the Hiring Pipeline database
   and share instructions; env vars added to Bitwarden + Netlify.
3. Backfill: one-off retry pass syncs any rows submitted before env was set
   (the cron does this automatically).
