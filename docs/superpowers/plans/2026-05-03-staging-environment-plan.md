# Staging Environment Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a dedicated staging Railway Postgres + staging Netlify site, point CI tests at staging with per-run schema reset, and keep production deploys gated on `v*` tags.

**Architecture:** Two databases (`DATABASE_URL` = prod, `STAGING_DATABASE_URL` = staging) and two Netlify sites (prod = tag-only via Actions; staging = main auto-deploy via Git). CI's `db-setup` job drops and recreates the public schema before applying migrations on every run, eliminating shared-state flakes. A shell script wraps the destructive reset with safety guards that refuse to run unless the connection string contains `staging` and an explicit env flag is set.

**Tech Stack:** GitHub Actions, Railway Postgres, Netlify, `psql`, Drizzle migrations. No app code or DB schema changes.

**Spec:** `docs/superpowers/specs/2026-05-03-staging-environment-design.md`.

**Branch:** Work on `feat/staging-environment` (already created and pushed; the spec lives there).

---

## File structure

| File | Responsibility | Type |
|---|---|---|
| `scripts/reset-staging-schema.sh` | Drops + recreates `public` schema, then runs migrations. Guards against running against prod. | Create |
| `scripts/provision-staging-db.sh` | Reference doc for one-time Railway provisioning. Not invoked by CI. | Create |
| `.github/workflows/ci.yml` | Point `db-setup` + `test` + `test-api` at `STAGING_DATABASE_URL`; add reset step; add concurrency. | Modify |
| `.github/workflows/deploy.yml` | Header comment confirming this workflow only touches prod. No behavior change. | Modify |
| `netlify.toml` | Remove `ignore = "exit 1"` line so the staging site can build. | Modify |

---

## User-side prerequisites (you do these — flagged so they can run in parallel with code review)

These five actions touch dashboards I can't access. They aren't blockers for landing the code, but the staging environment isn't usable until they're done. Order doesn't matter except where noted.

### U1 — Provision the staging Railway Postgres

```bash
railway login                                   # opens browser, logs in
cd /tmp && railway init aspire-sports-staging   # creates project (run from /tmp so you don't link the repo)
railway add --plugin postgresql                 # provisions Postgres
railway variables get DATABASE_URL               # prints the connection string
```

**Critical**: confirm the connection string contains the substring `staging` (Railway's auto-generated host typically does, but verify). The reset script's safety guard depends on it. If the host doesn't contain `staging`, rename the project in the Railway dashboard.

Copy the printed URL — you'll paste it into U2.

### U2 — Add GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Name | Value |
|---|---|
| `STAGING_DATABASE_URL` | from U1 |
| `STAGING_STRIPE_WEBHOOK_SECRET` | from U6 |
| `STAGING_TELEGRAM_BOT_TOKEN` | from U5 |
| `STAGING_TELEGRAM_BOT_USERNAME` | from U5 |

(The CI workflow only references `STAGING_DATABASE_URL`. The other three are for the staging Netlify site env vars in U3 — you can skip them if you want to defer Telegram + Stripe-webhook on staging.)

### U3 — Create the staging Netlify site

Netlify dashboard → Add new site → Import an existing project → pick the same Git repo → name it `aspire-sports-staging` → production branch = `main`.

In Site settings → Environment variables, copy every var from the prod site, with these overrides:

| Var | Prod value | Staging value |
|---|---|---|
| `DATABASE_URL` | (prod URL) | (staging URL from U1) |
| `STRIPE_SECRET_KEY` | `sk_live_*` | `sk_test_*` |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_*` | `pk_test_*` |
| `STRIPE_WEBHOOK_SECRET` | (live mode) | from U6 |
| `PUBLIC_APP_URL` | `https://aspiresportsohio.com` (or whatever) | `https://aspire-sports-staging.netlify.app` |
| `TELEGRAM_BOT_TOKEN` | (live bot) | from U5 |
| `TELEGRAM_BOT_USERNAME` | (live bot) | from U5 |
| `GA4_MEASUREMENT_ID` | (set on prod) | leave **unset** |

Trigger a manual deploy to verify the site builds and serves.

### U4 — Disconnect the prod Netlify site from Git auto-deploy

Prod site → Site settings → Build & deploy → Continuous deployment → "Stop builds". Confirm. The prod site will only deploy via the GH Actions workflow (existing tag-only flow) from now on.

### U5 — Create the staging Telegram bot

Open Telegram → @BotFather → `/newbot` → name it `aspiresports_staging_bot` (or your preference, must end in `_bot`). Save the token + username for U2/U3.

### U6 — Create the staging Stripe webhook endpoint

Stripe Dashboard → switch to **test mode** (toggle top-left) → Developers → Webhooks → Add endpoint:
- URL: `https://aspire-sports-staging.netlify.app/api/webhooks/stripe`
- Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
- Save → reveal signing secret → save it for U2/U3.

---

## Task 1: Create the schema-reset script with safety guards

**Files:**
- Create: `scripts/reset-staging-schema.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# scripts/reset-staging-schema.sh
#
# Drops and recreates the `public` schema on the staging database, then
# runs the standard Drizzle migration sequence.
#
# Hard guards (both must pass or the script aborts):
#   1. $DATABASE_URL must contain the substring "staging" — this prevents
#      ever running against the production DB even if env vars get crossed.
#   2. $ALLOW_DESTRUCTIVE_RESET must equal "yes" — the CI workflow sets
#      this explicitly; humans running the script must opt in too.
#
# Usage (CI):
#   DATABASE_URL="$STAGING_DATABASE_URL" \
#     ALLOW_DESTRUCTIVE_RESET=yes \
#     ./scripts/reset-staging-schema.sh
#
# Usage (local, against your own staging DB):
#   DATABASE_URL="postgresql://...staging..." \
#     ALLOW_DESTRUCTIVE_RESET=yes \
#     ./scripts/reset-staging-schema.sh
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

if [[ "$DATABASE_URL" != *staging* ]]; then
  echo "ERROR: DATABASE_URL does not contain the substring 'staging'." >&2
  echo "       Refusing to drop the schema. This script will only run" >&2
  echo "       against a connection string that names a staging DB." >&2
  exit 2
fi

if [[ "${ALLOW_DESTRUCTIVE_RESET:-}" != "yes" ]]; then
  echo "ERROR: ALLOW_DESTRUCTIVE_RESET must be set to 'yes'." >&2
  echo "       This is a destructive operation. Re-run with:" >&2
  echo "         ALLOW_DESTRUCTIVE_RESET=yes $0" >&2
  exit 3
fi

echo "[reset-staging-schema] dropping + recreating public schema..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;"

echo "[reset-staging-schema] bootstrapping drizzle migration tracking..."
npm run db:migrate:bootstrap

echo "[reset-staging-schema] applying migrations..."
npm run db:migrate

echo "[reset-staging-schema] done."
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/reset-staging-schema.sh
```

- [ ] **Step 3: Verify it refuses to run against a non-staging URL**

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/prod_db" \
  ALLOW_DESTRUCTIVE_RESET=yes \
  ./scripts/reset-staging-schema.sh; echo "exit=$?"
```

Expected: `ERROR: DATABASE_URL does not contain the substring 'staging'.` then `exit=2`.

- [ ] **Step 4: Verify it refuses without the opt-in flag**

```bash
DATABASE_URL="postgresql://user:pass@host-staging-xyz:5432/db" \
  ./scripts/reset-staging-schema.sh; echo "exit=$?"
```

Expected: `ERROR: ALLOW_DESTRUCTIVE_RESET must be set to 'yes'.` then `exit=3`.

- [ ] **Step 5: Commit**

```bash
git add scripts/reset-staging-schema.sh
git commit -m "feat(scripts): reset-staging-schema.sh with prod safety guards"
```

---

## Task 2: Create the Railway provisioning reference script

**Files:**
- Create: `scripts/provision-staging-db.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# scripts/provision-staging-db.sh
#
# One-time provisioning of the staging Railway Postgres. NOT invoked by
# CI — kept in the repo for repeatability if we ever recreate staging.
#
# Prerequisites: Railway CLI installed (https://docs.railway.com/cli),
# logged in via `railway login`.
#
# Usage:
#   ./scripts/provision-staging-db.sh
#
# After this script completes:
#   1. Run `railway variables get DATABASE_URL` in the new project to print
#      the connection string.
#   2. Confirm the host contains the substring "staging" (rename the project
#      in the Railway dashboard if not — the reset script depends on it).
#   3. Add the connection string as the `STAGING_DATABASE_URL` GitHub
#      Actions secret.
set -euo pipefail

if ! command -v railway >/dev/null 2>&1; then
  echo "ERROR: Railway CLI not installed. See https://docs.railway.com/cli" >&2
  exit 1
fi

# Run from /tmp so we don't accidentally link the project to this repo.
cd /tmp

echo "[provision-staging-db] creating Railway project 'aspire-sports-staging'..."
railway init aspire-sports-staging

echo "[provision-staging-db] adding Postgres plugin..."
railway add --plugin postgresql

echo "[provision-staging-db] done."
echo
echo "Next steps:"
echo "  1. railway variables get DATABASE_URL  # copy the printed URL"
echo "  2. Verify the host contains 'staging'"
echo "  3. Add the URL as STAGING_DATABASE_URL in GitHub Actions secrets"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/provision-staging-db.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/provision-staging-db.sh
git commit -m "docs(scripts): provision-staging-db.sh — Railway one-time setup reference"
```

---

## Task 3: Update CI workflow to use staging DB + per-run reset + concurrency

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a workflow-level concurrency group**

Insert at the top of the file, between the `on:` block and the first `jobs:` line:

```yaml
# Serialize all CI runs through the staging DB so the schema-reset step
# in db-setup doesn't race when two PRs run concurrently. Newer queued
# runs wait; in-flight runs are NOT cancelled (cancel-in-progress: false).
concurrency:
  group: ci-staging-db
  cancel-in-progress: false
```

So the file's top section becomes:

```yaml
name: CI

on:
  push:
    branches: [main]
    paths-ignore:
      - 'docs/**'
      - '**/*.md'
      - '.gitignore'
      - 'LICENSE'
  pull_request:
    branches: [main]
    paths-ignore:
      - 'docs/**'
      - '**/*.md'
      - '.gitignore'
      - 'LICENSE'
  workflow_dispatch:

# Serialize all CI runs through the staging DB so the schema-reset step
# in db-setup doesn't race when two PRs run concurrently. Newer queued
# runs wait; in-flight runs are NOT cancelled (cancel-in-progress: false).
concurrency:
  group: ci-staging-db
  cancel-in-progress: false

jobs:
  build:
    ...
```

- [ ] **Step 2: Replace `DATABASE_URL` with `STAGING_DATABASE_URL` in the build job**

In the `build` job's `env:` block (currently at the `Build` step), change:

```yaml
DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

to:

```yaml
DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
```

- [ ] **Step 3: Replace the `db-setup` job body with reset + bootstrap + migrate**

Find the existing `db-setup:` job. Replace its `steps:` list with:

```yaml
  db-setup:
    if: github.event_name != 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install psql client
        run: sudo apt-get update && sudo apt-get install -y postgresql-client

      # Drop + recreate the public schema, then run bootstrap + migrate.
      # The script refuses to run against any URL not containing "staging".
      - name: Reset staging schema and apply migrations
        run: ./scripts/reset-staging-schema.sh
        env:
          DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
          ALLOW_DESTRUCTIVE_RESET: "yes"
```

(The previous `Bootstrap migration tracking` and `Apply migrations` named steps are subsumed by the reset script. The `NOTE:` comment about removed E2E seeding can be deleted as well.)

- [ ] **Step 4: Replace `DATABASE_URL` references in the `test` (Playwright) job**

In the `test` job's two env blocks (the `Run Playwright tests` step), change:

```yaml
DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

to:

```yaml
DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
```

- [ ] **Step 5: Replace `DATABASE_URL` references in the `test-api` job**

In the `test-api` job's two env blocks (the `Start dev server` step and the `Run API tests` step), change both:

```yaml
DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

to:

```yaml
DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
```

- [ ] **Step 6: Verify the file syntax**

```bash
# GitHub Actions doesn't ship a local validator, but yamllint catches
# basic issues. If yamllint isn't installed, skip — CI itself will catch
# bad YAML on push.
yamllint .github/workflows/ci.yml 2>&1 | head -10 || true
```

Expected: no output, or only stylistic warnings (not parse errors).

Also visually confirm: zero remaining occurrences of `secrets.DATABASE_URL` in the file:

```bash
grep -n "secrets.DATABASE_URL" .github/workflows/ci.yml
```

Expected: no output.

```bash
grep -n "secrets.STAGING_DATABASE_URL" .github/workflows/ci.yml | wc -l
```

Expected: `5` (build + reset + Playwright + dev-server + api-tests).

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: point all DB env vars at staging + add per-run schema reset"
```

---

## Task 4: Update `netlify.toml` to allow staging builds

**Files:**
- Modify: `netlify.toml`

- [ ] **Step 1: Read the current file**

```bash
head -50 netlify.toml
```

The `[build]` block currently contains:

```toml
[build]
  command = "npm run build"
  publish = "dist"

  # ============================================================
  # AUTO-DEPLOY DISABLED FOR COST CONTROL
  # ============================================================
  # ... (long comment block) ...
  ignore = "exit 1"
```

- [ ] **Step 2: Replace the comment block + `ignore` line with a new comment explaining the new model**

Use Edit on `netlify.toml`. Replace the entire comment block plus the `ignore = "exit 1"` line (everything between `publish = "dist"` and the next blank line / `[build.processing]`) with:

```toml
[build]
  command = "npm run build"
  publish = "dist"

  # ============================================================
  # DEPLOY MODEL (2026-05-03)
  # ============================================================
  # Two Netlify sites build from this repo:
  #   • aspire-sports-staging — auto-deploys every push to main.
  #     Points at STAGING_DATABASE_URL + Stripe test mode.
  #   • production site — disconnected from Git auto-deploy in the
  #     Netlify dashboard. Deploys only via .github/workflows/deploy.yml
  #     on v* tags, against DATABASE_URL (prod) + Stripe live mode.
  #
  # Branch deploys + deploy previews are still gated (see contexts
  # below) so we don't burn credits on feature-branch builds.
  # ============================================================
```

(No `ignore = "exit 1"` line. The two `[context.branch-deploy]` and `[context.deploy-preview]` blocks lower in the file stay as-is — they prevent staging from auto-building any non-main branch.)

- [ ] **Step 3: Verify**

```bash
grep -n "ignore" netlify.toml
```

Expected: no output. (No remaining `ignore` directives.)

```bash
grep -n "context.branch-deploy\|context.deploy-preview" netlify.toml
```

Expected: 2 lines — both context blocks still present.

- [ ] **Step 4: Commit**

```bash
git add netlify.toml
git commit -m "build(netlify): drop ignore directive — staging site needs to build"
```

---

## Task 5: Add a clarifying header to deploy.yml

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Read the current file's first few lines**

```bash
head -10 .github/workflows/deploy.yml
```

Currently begins with `name: Deploy to Netlify`.

- [ ] **Step 2: Insert a header comment above `name:`**

Use Edit on `.github/workflows/deploy.yml`. Replace:

```yaml
name: Deploy to Netlify
```

with:

```yaml
# This workflow EXCLUSIVELY deploys to PRODUCTION. It runs only on
# v* tags and writes to DATABASE_URL (prod) + the live Netlify site.
# Staging is auto-deployed from main by a separate Netlify site
# connected directly to Git (see netlify.toml header).

name: Deploy to Netlify
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "docs(deploy): clarify this workflow is prod-only"
```

---

## Task 6: Open the PR (code-only — manual user actions noted)

**Files:** none.

- [ ] **Step 1: Push the branch**

```bash
git push
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "infra(staging): dedicated Railway DB + Netlify site, CI off prod" --body "$(cat <<'EOF'
## Summary

Stops CI from running tests against the production DB. Stands up a staging Railway Postgres + staging Netlify site; CI's db-setup drops + recreates the public schema on every run, eliminating the shared-state flakes that have been intermittently breaking main for weeks.

Spec: \`docs/superpowers/specs/2026-05-03-staging-environment-design.md\`
Plan: \`docs/superpowers/plans/2026-05-03-staging-environment-plan.md\`

## What this PR does (code)

- New \`scripts/reset-staging-schema.sh\` — drops + recreates \`public\` schema, then runs \`db:migrate:bootstrap\` + \`db:migrate\`. Refuses to run unless \`DATABASE_URL\` contains \`staging\` AND \`ALLOW_DESTRUCTIVE_RESET=yes\` is set.
- New \`scripts/provision-staging-db.sh\` — reference doc for one-time Railway setup.
- \`ci.yml\` — all 5 \`secrets.DATABASE_URL\` refs flipped to \`secrets.STAGING_DATABASE_URL\`. New reset step at the top of \`db-setup\`. Workflow-level \`concurrency\` group serializes all CI runs through the staging DB.
- \`netlify.toml\` — \`ignore = "exit 1"\` removed so the staging site can build. New comment explains the two-site model.
- \`deploy.yml\` — header comment confirming this workflow is prod-only. No behavior change.

## Manual prerequisites for CI to pass on this PR

CI on this PR will fail at the \`db-setup\` step until these are done:

- [ ] U1: Provision staging Railway Postgres (\`./scripts/provision-staging-db.sh\`)
- [ ] U2: Add \`STAGING_DATABASE_URL\` to GitHub Actions secrets

The other manual steps (U3 staging Netlify site, U4 disconnect prod from Git, U5 staging Telegram bot, U6 staging Stripe webhook) are required for the staging site to be functional but aren't blockers for this PR's CI.

## Test plan

- [ ] U1 + U2 done before re-running CI on this PR
- [ ] CI's \`db-setup\` step logs include \`dropping + recreating public schema\` against a host containing \`staging\`
- [ ] All 17 migrations apply to the empty staging DB
- [ ] \`test-api\` and \`test\` jobs run against staging DB
- [ ] After merge, U3-U6 are completed and the staging site is reachable
- [ ] After U4, the next push to main does NOT trigger a prod deploy
- [ ] Cutting a \`v\` tag from main still triggers prod deploy via \`deploy.yml\`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the printed URL.

- [ ] **Step 3: Verify the branch pushed cleanly**

```bash
git log --oneline origin/main..HEAD
```

Expected: 5 commits — spec doc + 4 implementation commits.

---

## Post-merge verification (after U1-U6 are done and PR is merged)

These are not part of the implementation work — they're the cutover validation.

### V1: First CI run against staging

After U1 + U2 are done, push any small commit (or run `gh workflow run CI`) on `main` after merge. Watch:

```bash
gh run watch --exit-status
```

Confirm:
- `db-setup` logs show `dropping + recreating public schema...` followed by `applying migrations...`
- The host in the connection string (visible in any error message) contains `staging`, NOT the prod host
- All migrations apply (17 of them as of this writing)

### V2: Staging site reachable

```bash
curl -fsSI https://aspire-sports-staging.netlify.app/ | head -3
```

Expected: HTTP/2 200.

### V3: Walk a registration flow on staging

Sign up as a test parent on the staging site. Register for any open season using Stripe test card `4242 4242 4242 4242`. Confirm:
- Registration row appears in the staging DB (not prod): `psql "$STAGING_DATABASE_URL" -c "SELECT id, season_id, payment_status FROM registrations ORDER BY created_at DESC LIMIT 1"`
- Payment row appears: `... FROM payments ...`
- Email arrives at the test address

### V4: Prod deploy still works

Cut a tag from `main` after merge:

```bash
git tag v0.0.X-staging-cutover-test
git push origin v0.0.X-staging-cutover-test
```

(Or use `gh workflow run "Deploy to Netlify"` for a manual_dispatch run.)

Confirm `deploy.yml` runs migrations against PROD `DATABASE_URL` (not staging) and deploys the prod Netlify site. Staging site is unaffected.

---

## Self-Review

**1. Spec coverage:**

- §3.1 two databases → Tasks 1, 3 ✅
- §3.2 two Netlify sites → Tasks 4, U3, U4 ✅
- §3.3 per-run schema reset → Tasks 1, 3 ✅
- §3.4 staging Telegram bot → U5 (manual), U2/U3 (secret + env var) ✅
- §3.5 Stripe test mode on staging → U6 (manual), U2/U3 (secret + env var) ✅
- §3.6 other integration secrets → U3 env vars list (Resend reused, Twilio omitted, etc.) ✅
- §4.1 STAGING_DATABASE_URL secret → U2 ✅
- §4.2 staging Netlify site → U3 ✅
- §4.3 ci.yml changes → Task 3 ✅
- §4.4 netlify.toml changes → Task 4 ✅
- §4.5 deploy.yml header comment → Task 5 ✅
- §4.6 reset-staging-schema.sh → Task 1 ✅
- §4.7 provision-staging-db.sh → Task 2 ✅
- §5 manual user actions → U1-U6 ✅
- §6 cutover plan → Task 6 PR description + post-merge V1-V4 ✅
- §7 verification → V1-V4 ✅

All spec requirements have a corresponding task or manual action.

**2. Placeholder scan:**

- No "TBD" / "TODO" / "implement later" text.
- One `v0.0.X-staging-cutover-test` placeholder in V4 — that's an example tag name the user picks; not a placeholder for the agent.
- All shell scripts have complete code; all yaml edits show before+after; all commands have expected output.

**3. Type/name consistency:**

- `STAGING_DATABASE_URL` consistent across U1/U2/U3 and Tasks 1, 3.
- `STAGING_TELEGRAM_BOT_TOKEN` / `STAGING_TELEGRAM_BOT_USERNAME` consistent across U2/U5.
- `STAGING_STRIPE_WEBHOOK_SECRET` consistent across U2/U6.
- `ALLOW_DESTRUCTIVE_RESET=yes` consistent between Task 1 (script) and Task 3 (CI env).
- `aspire-sports-staging.netlify.app` consistent across U3, U6, V2.
- Concurrency group name `ci-staging-db` matches between spec §3.3 and Task 3 step 1.
