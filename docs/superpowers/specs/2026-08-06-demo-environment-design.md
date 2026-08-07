# Demo Environment for Partner-Org Demo — Design

**Date:** 2026-08-06 (demo is 2026-08-07)
**Branch:** `feat/demo-day-environment`
**Status:** Approved by owner in brainstorming session

## Goal

Make the existing staging environment (`aspire-sports-staging` Netlify site + staging
Railway Postgres) look like a real, operating league business for a live demo to a
prospective partner org. The demo shows the coach portal, parent portal, referee app,
standings, and admin reports — surfaces that prove the platform is built to scale.
Presented on a laptop (parent/admin) plus a phone in hand (coach/ref, which are
phone-first).

Demo runs under **Aspire branding** in the existing `aspire-sports` staging org. No
new org, no domain mapping, no deploys — staging already serves `main`'s code.

## Non-goals

- No changes to app code, schema, or anything that deploys. Data + docs only.
- No fictional-partner or white-label org.
- No prod involvement. Prod data and prod Stripe are untouched.

## Why the e2e seed is not a threat (verified)

The owner's concern was the e2e seed overwriting demo data. Verified facts:

1. **CI never touches staging's DB anymore.** Every DB-touching CI job spins up a
   throwaway Postgres service container (see the header comment in
   `.github/workflows/ci.yml`). No workflow invokes `db:seed:e2e` — the only path to
   staging is a *manual local* run.
2. **The e2e seed only mutates its own fixtures.** All of its `db.delete(...)` calls
   are scoped to its own slug/email-pinned entities (`e2e-*` seasons,
   `@test.aspiresports.com` users, its training game). It never truncates or deletes
   broadly. Realistic-slugged demo data survives even an accidental run.

Protection is therefore: (a) demo entities use distinct realistic slugs that cannot
collide with `e2e-*` fixtures; (b) runbook rule — nobody runs `npm run db:seed:e2e`
against staging or merges to `main` between seeding and the demo.

One caveat: the demo seed closes/hides the `e2e-*` seasons from public browse. An
accidental e2e seed run would re-open them (it updates its own seasons). The morning-of
re-run of the demo seed re-hides them.

## Component 1: `scripts/seed-demo-day.ts`

A branch-local seed script (repo convention: one-off scripts live on their branch and
are deleted after use). Modeled on `src/lib/db/seeds/seed-e2e-tests.ts` patterns.

**Safety properties:**

- **Staging-guarded**: refuses to run unless `DATABASE_URL` contains "staging"
  (same guard style as the e2e seed; no `ALLOW_*` bypass — this script has no reason
  to ever run elsewhere).
- **Idempotent**: pinned by slug/email with upserts, safe to re-run.
- **Now-anchored**: all dates computed relative to run time (never fixed UTC
  timestamps — known time-of-day-lottery hazard in this repo). Re-running the
  morning of the demo re-anchors "today's game" and "today's session" to demo day.
- **Multi-tenant hygiene**: every lookup that picks one row from a possible set uses
  an explicit `orderBy` (shared-DB hazard), and all entities pin to the resolved
  `aspire-sports` org.

**Data it creates (all inside the `aspire-sports` staging org):**

1. **Catalog with history and future**
   - Programs: youth soccer + flag football (realistic names, real-sounding copy).
   - 2–3 completed past seasons (e.g. Fall 2025, Winter 2026, Spring 2026):
     registration closed, all games played.
   - One **current mid-season** (registration closed, ~half the games played) — the
     demo's centerpiece.
   - One **upcoming season, registration open** (e.g. Fall 2026) — shows the funnel
     is live; also the target if a live registration is demoed with a test card.
2. **Teams, games, scores, standings**
   - 6–8 teams per season with plausible fictional rosters (realistic kid names,
     ages consistent with age groups).
   - Past seasons: full round-robin of games with entered scores.
   - Current season: several completed weeks with scores, plus upcoming games this
     week including one on demo day.
   - **Standings are derived, not seeded** — the standings pages compute from game
     scores. Verification confirms they populate.
3. **Referee history** — `demo.ref` user: officiating assignments across dozens of
   past games spanning seasons, ratings/feedback history (feeds the referee-ratings
   admin report), plus an upcoming assignment on demo day so `/referee` opens onto
   a live day of work.
4. **Coach history** — `demo.coach` user: assigned teams; past sessions with
   attendance, player assessments, and glows-&-grows notes across seasons; an
   upcoming session on demo day ready to run live in `/coach`.
5. **Parent story** — `demo.parent` user: a kid rostered on a current-season team,
   registrations + paid payment rows across multiple seasons (feeds revenue +
   registrations reports), coach notes visible on the dashboard, upcoming game
   showing.
6. **Admin reports fed**: registrations + revenue (from the demo registrations and
   payment rows), referee ratings (from ref feedback), NPS (a handful of seeded
   responses), payroll (minimum: renders non-empty; seed whatever pay records the
   page reads).
7. **Junk tidy**: close the `e2e-*` seasons (registration closed / not publicly
   browsable) so the public catalog shows only the realistic seasons.
8. **Accounts**: `demo.admin@aspiresportsohio.com`, `demo.coach@…`,
   `demo.parent@…`, `demo.ref@…` — on the real brand domain so they look right on a
   projector; the `demo.` local-part prefix keeps them distinct from real users and
   from the `@test.aspiresports.com` e2e fixtures. Staging sends no real mail, so
   nothing can actually be delivered to these addresses. One shared memorable
   password, documented in the runbook.

**Payments note:** seeded "paid" registrations are DB rows only (no real Stripe
objects) — fine for reports and dashboards. The one *live* payment in the demo (if
shown) goes through staging's Stripe test mode with card 4242. Staging has no
`MESSAGING_LIVE`, so nothing emails or texts anyone.

## Component 2: Verification walkthrough (tonight, after seeding)

Browser walkthrough of every demo surface on the real staging URL — not greps, not
tests (rendering/contrast/empty-states are only visible in a browser):

- Public: home, program catalog, season pages, standings pages (confirm they
  derive from seeded scores).
- `demo.parent`: dashboard, kid's team, coach notes, payment history.
- `demo.coach`: schedule, roster, today's session, past assessments (check on
  phone-sized viewport; real phone check morning-of).
- `demo.ref`: today's assignment, history (same phone treatment).
- `demo.admin`: dashboard, registrations list, all five reports (registrations,
  revenue, referee-ratings, NPS, payroll).
- Anything broken or empty gets fixed in the seed and re-run (idempotent).

## Component 3: Demo runbook — `docs/demo/partner-demo-runbook.md`

One page: tab order for the demo arc, accounts table with the password, Stripe test
card 4242 line, the morning-of re-seed command, and the don't-touch rules (no
`db:seed:e2e` against staging, no merging to `main`, no other sessions mutating
staging until the demo is done).

## Risks

- **Staging site serves `main`** — any merge to `main` before the demo redeploys
  staging. Mitigation: freeze merges until after the demo (runbook rule).
- **Shared staging DB with other local sessions** — another Claude/dev session could
  mutate staging concurrently. Mitigation: runbook rule + morning-of re-seed.
- **Unknown page-level empty-state dependencies** (e.g. payroll may read pay
  structures that are hard to fabricate). Mitigation: the verification walkthrough
  is the safety net; worst case a thin surface is dropped from the demo script
  rather than shown empty.
- **Time**: this is an evening's work. The e2e seed provides copyable patterns for
  every entity type involved (teams, games, officials, sessions, assessments,
  feedback), which is what makes the timeline credible.

## Success criteria

Every surface in the demo arc renders with believable, internally consistent data
(names, dates, scores, standings, histories all agree), on the staging URL, on both
laptop and phone, with a runbook the owner can follow cold tomorrow.
