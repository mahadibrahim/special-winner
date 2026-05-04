# Staging Environment Foundation — Design

**Date:** 2026-05-03
**Status:** Draft (Project A of 3)
**Sequence:** Project A foundation → Project B test fixture ownership → Project C code cleanup. A blocks B and C.

---

## 1. Goal

Stop running CI tests against the production-bound database. Stand up a dedicated **staging Railway Postgres** + **staging Netlify site** so:

- Every CI run starts against a clean DB schema (no accumulated test residue, no fixture-rotation flakes).
- The team has a stable URL pointing at recent `main` for stakeholder demos and manual QA without touching production.
- Production deploys remain gated on `v*` tags via the existing GitHub Actions workflow — no behavior change for prod.

The motivating pain: as of 2026-05-03, the `main` branch has 5 `test-api` failures and 4 Playwright failures that nobody noticed because recent CI runs happened to land on lucky shared-DB state. Tests are not honest signals today. Before taking real payments we need a CI signal we can trust.

## 2. Non-goals

- **Stakeholder demo polish** (custom domain, bespoke seeded demo data) — staging URL is `<site>.netlify.app`, no decoration.
- **Per-PR ephemeral environments** — Railway's PR-environments feature is overkill for our team size and ~3× the cost.
- **Multi-region failover** — staging is single-region us-west.
- **Rewriting the broken tests themselves** — that's Project B, separate spec.
- **Cleaning up dead code surfaces** (legacy `parental_consent_*` columns, the 1168-line `registration-wizard.tsx`, unused `paymentPlans` tables) — that's Project C.

## 3. Architecture

```
                      ┌──────────────────────────────────────┐
                      │     GitHub: mahadibrahim/aspire     │
                      └─────────────┬───────────────┬────────┘
                                    │               │
              push to main / PR     │               │   push of v* tag
                                    ▼               ▼
                ┌──────────────────────────┐   ┌──────────────────────────┐
                │  GH Actions: ci.yml      │   │  GH Actions: deploy.yml  │
                │  • db-setup (drop+migr)  │   │  • db:migrate to PROD    │
                │  • build                 │   │  • build                 │
                │  • test-api → STAGING DB │   │  • Netlify API → PROD    │
                │  • test  → STAGING DB    │   │                          │
                └─────────────┬────────────┘   └──────────────┬───────────┘
                              │                                │
                              ▼                                ▼
              ┌──────────────────────────────┐   ┌──────────────────────────────┐
              │  Railway: STAGING Postgres   │   │  Railway: PROD Postgres      │
              │  STAGING_DATABASE_URL        │   │  DATABASE_URL                │
              │  • dropped+recreated each    │   │  • migrations only           │
              │    db-setup run              │   │  • never touched by CI       │
              └──────────────────────────────┘   └──────────────────────────────┘
                              │                                │
                              ▼                                ▼
              ┌──────────────────────────────┐   ┌──────────────────────────────┐
              │  Netlify: STAGING site       │   │  Netlify: PROD site          │
              │  aspire-sports-staging.      │   │  aspiresportsohio.com etc.   │
              │  netlify.app                 │   │                              │
              │  • Auto-deploys main         │   │  • Disconnected from Git     │
              │  • Points at staging DB      │   │  • Deploys via Actions only  │
              │  • Stripe TEST mode          │   │  • Stripe LIVE mode          │
              └──────────────────────────────┘   └──────────────────────────────┘
```

### 3.1 Two databases, separated by env var

- **Production**: `DATABASE_URL` (existing) — never touched by CI.
- **Staging**: `STAGING_DATABASE_URL` (new) — used by CI + the staging Netlify site. Schema dropped+recreated at start of each `db-setup` run.

Both live on Railway; both run the same Postgres major version.

### 3.2 Two Netlify sites, separated by Git connection

- **Production site** (existing): Disconnect Git auto-deploy in Netlify dashboard. Continues to deploy only via GH Actions on `v*` tags.
- **Staging site** (new): `aspire-sports-staging.netlify.app`. Connected to Git, auto-deploys every push to `main`. Points at staging DB + Stripe test mode.

Both sites build from the same `netlify.toml` in this repo. The `ignore = exit 1` line is removed so the staging site can actually build (the prod site no longer needs that gate because we're disconnecting it from Git auto-deploy entirely).

### 3.3 Per-run schema reset (the critical correctness piece)

In CI's `db-setup` job, the staging DB schema is dropped and recreated at the start of every run **before** migrations:

```bash
psql "$STAGING_DATABASE_URL" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
npm run db:migrate:bootstrap
npm run db:migrate
```

This guarantees every CI run starts from a clean schema with no rows, then re-applies all committed migrations. No test pollution, no fixture rotation, no shared-state coupling between runs.

**Concurrency note**: GitHub Actions' default behavior allows concurrent CI runs from different PRs. Two concurrent `db-setup` jobs would race on the schema reset. We add a `concurrency` block at the workflow level: `group: ci-staging-db`, `cancel-in-progress: false`, so all CI runs from any branch serialize through the staging DB. Total CI throughput drops slightly but correctness is preserved.

### 3.4 Telegram bot separation

Per the deferred-UAT memo: a separate BotFather bot for staging avoids accidental real Telegram sends from CI. Staging site uses `STAGING_TELEGRAM_BOT_TOKEN` + `STAGING_TELEGRAM_BOT_USERNAME`. CI tests should never hit real Telegram either — but if any do, they hit the staging bot, not the live one.

### 3.5 Stripe in test mode on staging

Staging site uses `STRIPE_SECRET_KEY=sk_test_*` and `STRIPE_PUBLISHABLE_KEY=pk_test_*`. CI inherits the same. No risk of test runs creating real payment intents in live Stripe.

The staging webhook endpoint (`/api/webhooks/stripe`) needs its own Stripe webhook signing secret (`STAGING_STRIPE_WEBHOOK_SECRET`) registered against the staging site's URL in Stripe Dashboard → Developers → Webhooks → test-mode endpoints.

### 3.6 Other integration secrets

| Service | Staging strategy |
|---|---|
| **Resend** | Reuse the same `RESEND_API_KEY`. From-address can stay `hello@aspiresportsohio.com` since Resend allows multiple destinations. Optionally add `RESEND_TEST_MODE=true` to suppress real sends from CI (not implemented this iteration; tests already mock email when needed). |
| **Telegram** | Separate bot token (above). |
| **Twilio** | Skip on staging — CI tests don't need real SMS. Leave `TWILIO_ACCOUNT_SID` etc. unset on staging site; the messaging gateway already soft-fails when Twilio creds are absent. |
| **PostHog** | Reuse same project token but set `STAGING=true` env var so events from staging can be filtered or routed to a separate analytics view. (Optional; can defer.) |
| **GA4 (Phase 1+2 work)** | Leave `GA4_MEASUREMENT_ID` unset on staging so server-side fire is a no-op. CI tests don't validate GA4 fire end-to-end. |
| **Cloudinary** | Reuse — uploads from staging are tagged for cleanup later via folder convention. |
| **R2** | Reuse `R2_MOCK=1` in CI (already set), point staging site at the dev R2 bucket. |

## 4. Components

### 4.1 New: `STAGING_DATABASE_URL` GitHub secret

Created via Railway dashboard (or CLI) when the staging Postgres is provisioned. Added to the GitHub repo's secrets. CI workflow reads it.

### 4.2 New: staging Netlify site

Created in the Netlify dashboard, linked to the same Git repo. Configured to auto-deploy from `main`. Build env vars set in Netlify dashboard → Site settings → Environment variables (mirrored to match prod's set, but pointing at staging DB + test-mode Stripe + staging Telegram bot).

### 4.3 Modified: `.github/workflows/ci.yml`

Three changes:
1. `db-setup` job env switches from `DATABASE_URL: ${{ secrets.DATABASE_URL }}` to `DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}` everywhere (the workflow uses `DATABASE_URL` as the variable name passed to scripts; we map the staging secret into that name).
2. New step at the top of `db-setup` that runs the `DROP SCHEMA` + `CREATE SCHEMA` reset via `scripts/reset-staging-schema.sh`.
3. Add `concurrency` block at workflow level: `group: ci-staging-db`, `cancel-in-progress: false`, so all CI runs serialize through the staging DB.

### 4.4 Modified: `netlify.toml`

Remove the `ignore = "exit 1"` line entirely. The prod site is disconnected from Git in the Netlify dashboard, so it never sees this file's `ignore` directive anymore. The staging site will see it; we want staging to actually build, so the gate comes off.

Keep the `[context.branch-deploy]` and `[context.deploy-preview]` blocks (they prevent accidental builds from feature branches and PRs against the staging site, saving credits).

### 4.5 Modified: `.github/workflows/deploy.yml`

No structural change. Still reads `DATABASE_URL` (= prod). Still triggers only on `v*` tags. The only update: a header comment confirming this workflow exclusively touches production.

### 4.6 New: `scripts/reset-staging-schema.sh`

A small standalone shell script the CI workflow calls. Wraps the `psql DROP SCHEMA + CREATE SCHEMA + migrate` sequence with explicit safety checks:
- Refuses to run if `$DATABASE_URL` lacks the substring `staging` (heuristic guard against running against prod).
- Refuses to run if `$ALLOW_DESTRUCTIVE_RESET` is unset (an env flag CI sets explicitly).

Belt-and-suspenders: this script *cannot* run against prod even if env vars get crossed.

### 4.7 New (one-off): `scripts/provision-staging-db.sh`

Documents the Railway CLI commands needed to provision the staging DB. Not run automatically — checked in for reference + future repeatability.

```bash
railway login
railway init --name aspire-sports-staging
railway add --plugin postgresql
railway variables get DATABASE_URL  # copy to GitHub secret as STAGING_DATABASE_URL
```

## 5. Manual user actions (sequenced)

These are the things only you can do (touching Railway / Netlify / GitHub dashboards):

1. **Railway**: Run `railway login`, then provision a new project + Postgres service (script above documents the exact commands). Copy the resulting connection string. Confirm the connection string contains the substring `staging` (rename the project if not, so the safety check in `reset-staging-schema.sh` fires correctly).
2. **GitHub**: Add `STAGING_DATABASE_URL` to the repo's Actions secrets (and any other staging-prefixed secrets we land on — `STAGING_STRIPE_WEBHOOK_SECRET`, `STAGING_TELEGRAM_BOT_TOKEN`, `STAGING_TELEGRAM_BOT_USERNAME`).
3. **Netlify**: Create the new staging site, link it to the repo, set the production branch to `main`, copy env vars from prod site (with the staging-specific overrides — staging DB URL, test-mode Stripe keys, staging Telegram bot, etc.). Disconnect the production site from Git auto-deploy (Site settings → Build & deploy → Continuous deployment → Stop builds).
4. **BotFather**: Create a new Telegram bot named `aspiresports_staging_bot` (or similar). Save the token + username for step 2.
5. **Stripe Dashboard**: In test mode, add a new webhook endpoint pointing at `https://aspire-sports-staging.netlify.app/api/webhooks/stripe`. Save the signing secret for step 2.

The Project A implementation plan will land all the *code* changes (CI workflow, scripts, netlify.toml). The plan will list the manual steps with their corresponding values, so you can run them in parallel with the code review.

## 6. Cutover plan

1. **Pre-cutover**: Provision staging Railway DB. Verify migrations apply cleanly via the new `scripts/reset-staging-schema.sh` run locally pointing at staging.
2. **Land the CI workflow change in a PR**. CI for that PR runs against staging DB for the first time. If the PR's CI is green, the new infra works.
3. **Provision staging Netlify site**. Verify it builds from `main` and the staging URL is reachable.
4. **Disconnect prod Netlify site from Git auto-deploy**. Confirm the next push to `main` deploys *only* to staging (existing tag-only Actions workflow continues to deploy prod on `v*` tags).
5. **Remove `ignore = exit 1` from `netlify.toml`** (committed in the same PR as the CI change). At this point prod is fully driven by Actions; staging is fully driven by Git auto-deploy.

Rollback: revert the CI workflow PR. CI immediately points back at `DATABASE_URL` (prod). Staging Netlify site stays up but stops auto-deploying — manually trigger or delete it. No data loss; production was never touched.

## 7. Verification

- **Phase A**: After provisioning the staging DB, manually run `./scripts/reset-staging-schema.sh` against `STAGING_DATABASE_URL` and confirm a fresh schema with all 17 migrations applied.
- **Phase B**: Open a small no-op PR (e.g. doc tweak). CI should run against staging DB. Capture the CI run log to confirm `[db-setup]` step logs `DROP SCHEMA` + `CREATE SCHEMA` + `migrations applied` against the staging hostname.
- **Phase C**: After the staging Netlify site is live, browse `aspire-sports-staging.netlify.app`, sign up as a test parent, walk through registration with a Stripe test card. Confirm a registration row lands in the staging DB, a payment row lands, an email arrives at the test address.
- **Phase D**: Cut a `v` tag from `main`. Confirm the GH Actions deploy workflow runs against `DATABASE_URL` (prod), and the staging site is unaffected.

## 8. What the test failures will look like *after* this lands

The 5 family-members test-api failures and 4 Playwright failures currently broken on main are caused by accumulated DB state in prod. After Project A:

- Family-members tests run against an empty schema → the assertion bug in the test (against legacy columns) becomes deterministic, fails every time. **That's actually good** — it surfaces the bug as a reliable signal instead of an intermittent one. Project B will fix the test (or the endpoint) properly.
- Media-tagger test runs against an empty schema → no fixture exists → fails deterministically. Project B will rewrite this test to seed its own fixture in `beforeAll`.
- Registration-adult specs were already fixed in the embedded-checkout PR; they'll continue to pass.

So immediately after Project A merges, CI will go from "intermittently broken" to "consistently red on the same set of tests". That's the necessary intermediate state before B + C land.

## 9. Files touched (Project A only)

### Modify (3)
- `.github/workflows/ci.yml` — point `db-setup` at `STAGING_DATABASE_URL`, add reset step, add concurrency group
- `.github/workflows/deploy.yml` — clarifying header comment only (no behavior change)
- `netlify.toml` — remove `ignore = "exit 1"` line

### Create (2)
- `scripts/reset-staging-schema.sh` — wraps `DROP SCHEMA + CREATE SCHEMA + migrate` with safety checks
- `scripts/provision-staging-db.sh` — documented one-shot Railway provisioning (reference, not invoked by CI)

### No code changes
- No app code changes. No DB schema changes. No env-var schema changes (staging just reuses the existing names with different values).

## 10. Costs

- **Railway staging Postgres**: ~$5/mo (smallest plan: 1GB RAM, 1GB storage). Schema drops every CI run keep it small.
- **Netlify staging site**: free (existing Netlify plan covers a second site under the same workspace; build minutes shared with prod, but staging only builds on `main` pushes).
- **GitHub Actions minutes**: unchanged (same number of CI runs; per-run runtime negligibly higher because of the schema-reset step).
- **Stripe test mode**: free.
- **BotFather bot**: free.

Total recurring: ~$5-10/mo.

## 11. Project B + C preview (not in this spec)

After Project A merges:

**Project B (Test fixture ownership)** rewrites the currently-failing tests so each one creates the fixtures it needs in `beforeAll`/`beforeEach`:
- `tests/api/parent/family-members.test.ts` — drop the legacy column assertions OR add the column updates back to the endpoint, whichever the team decides; either way, make the test authoritative against the actual contract.
- `tests/e2e/media-tagger.spec.ts` — seed the required `uploaded` shoot session + game in a `beforeAll`. Don't depend on residual DB state.
- Audit the rest of the e2e suite for similar assumptions.

**Project C (Code cleanup)**:
- Delete the dead `parental_consent_*` columns from `family_members` (Drizzle migration).
- Refactor `registration-wizard.tsx` (1168 lines, three near-identical handler bodies after the embedded-checkout PR; extract a shared `startEmbeddedPayment()` helper).
- Audit other places where API contract changes left silent regressions (the embedded-checkout review caught two; there are likely more).
- Decide: are `paymentPlans` + `scheduledPayments` tables ever shipping? If not, drop them.

Each gets its own spec → plan → PR.
