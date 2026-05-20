# Post-review follow-ups

Tracking doc for the codebase-review remediation. The P0/P1/P2 clusters
shipped as nine PRs (#90–#98); this file records what is **deferred** —
items that need founder input, a dedicated design pass, or are sweeps
too large for a drive-by fix.

## What shipped

| PR | Cluster | Tier |
|----|---------|------|
| #90 | Cross-org tenant scoping (reports, games, media, skill-levels) | P0 |
| #91 | Money-path transactions (Stripe webhooks, walk-up registration) | P0 |
| #92 | Missing env vars in `.env.example` | P0 |
| #93 | People-model `resolvePerson()` adoption | P0 |
| #94 | Public-endpoint bot/abuse protections | P1 |
| #95 | Internal-job auth + coach-resource stored XSS | P1 |
| #96 | Schema-hardening migration `0031` | P2 |
| #97 | Admin list N+1 fixes | P2 |
| #98 | Post-launch cleanup (stale TODOs, markers, one-off seeds) | P2 |

## Resolved open questions

- **`registrations (family_member_id, season_id)` uniqueness** — shipped
  in #96 as a *partial* unique index excluding `cancelled`/`refunded`
  rows, so a member can re-register after cancelling. Confirm this
  matches intended product behavior.
- **`attendance.event_date` → `timestamptz`** — shipped in #96; no query
  depended on naive-timestamp semantics (UTC-everywhere per CLAUDE.md).
- **`about.astro` Mustache markers** — the placeholder "Next milestone"
  timeline entry was deleted in #98. If you want a live third milestone,
  add a real entry to the timeline array.
- **`day0` seed scripts** — confirmed merged + unreferenced; deleted in #98.

## Needs founder input

- **CI failure notifications** — `.github/workflows/{ci,migrate-prod,migrate-staging,schema-drift}.yml`
  run silently. Wiring failure alerts needs a Slack webhook URL or a
  PagerDuty integration — founder picks the channel.
- **`migrate-prod.yml` environment gating** — adding `environment: production`
  with required reviewers needs the founder to create the GitHub
  environment and assign reviewers.

## Needs a dedicated design pass

- **Oversized files** — too large for a drive-by; each needs its own
  plan session: `registration-wizard.tsx` (1,219 lines, 52 hooks),
  `soccerone/index.astro` (1,652), `worthington/index.astro` (1,152),
  `activity-editor.tsx` (861), `dashboard/full-schedule.tsx` (828),
  `coach/practice-planner.tsx` (807), `kiosk/WalkInWizard.tsx` (802),
  `template-editor.tsx` (723), `seasons-list.tsx` (709).
- **Test coverage gaps** — each needs a thoughtful test-design pass:
  `/api/webhooks/stripe-connect.ts`, the `/api/cron/*` endpoints
  (`expire-pending-{claims,rentals}`, `cleanup-self-service-tokens`,
  `day-before-reminders`, `media-unconfirmed-reminders`,
  `recompute-media-bursts`, `tick-activity-tracker`), and a magic-link
  integration spec.
- **Skipped E2E / API specs** — investigate and either re-enable or
  delete with a reason: `admin-dashboard.spec.ts:85,237,243,249`
  (4 reports/program-create specs), `customer-journey/season-signup.spec.ts:109`
  (empty "steps 4–11" placeholder — the headline customer flow has no
  E2E), `admin-overhaul/super-admin.spec.ts:43,75` (conditional skips
  that should never fire post-seed), `api/admin/curriculum-tenant.test.ts:93,112,192`
  (three `ctx.skip()` calls).

## Systemic non-adoption (each is a sweep, not a fix)

These need a "we agree to converge on pattern X" decision before a
mechanical sweep is worthwhile:

- ~40 admin endpoints roll their own `row.organizationId !== orgContext.organizationId`
  checks instead of the `requireSameOrg*` helpers.
- ~25 admin mutations have no zod validation.
- ~44 components inline `bg-red-50` error styling instead of `ErrorBanner`.
- ~732 raw `new Response(JSON.stringify(...))` calls instead of a shared
  JSON-response helper.
