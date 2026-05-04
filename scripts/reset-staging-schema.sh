#!/usr/bin/env bash
# scripts/reset-staging-schema.sh
#
# Drops and recreates the `public` schema on the staging database, then
# runs the standard Drizzle migration sequence.
#
# Hard guards (both must pass or the script aborts):
#   1. EITHER $DATABASE_URL contains the substring "staging" (lean local
#      use case where the user named their DB sensibly), OR
#      $STAGING_DB_CONFIRMED=yes is set (CI use case — Railway's public-
#      proxy hostnames like viaduct.proxy.rlwy.net don't contain
#      "staging" so the workflow opts in via this env flag instead).
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

if [[ "$DATABASE_URL" != *staging* && "${STAGING_DB_CONFIRMED:-}" != "yes" ]]; then
  echo "ERROR: DATABASE_URL does not contain 'staging' AND" >&2
  echo "       STAGING_DB_CONFIRMED is not set to 'yes'." >&2
  echo "       At least one must be true. If you're running this against a" >&2
  echo "       Railway-hosted staging DB whose public-proxy hostname does" >&2
  echo "       not contain 'staging', set STAGING_DB_CONFIRMED=yes to opt in." >&2
  exit 2
fi

if [[ "${ALLOW_DESTRUCTIVE_RESET:-}" != "yes" ]]; then
  echo "ERROR: ALLOW_DESTRUCTIVE_RESET must be set to 'yes'." >&2
  echo "       This is a destructive operation. Re-run with:" >&2
  echo "         ALLOW_DESTRUCTIVE_RESET=yes $0" >&2
  exit 3
fi

echo "[reset-staging-schema] dropping + recreating public + drizzle schemas..."
# Drop BOTH the application schema AND drizzle's migration-tracking schema.
# Drizzle stores its `__drizzle_migrations` table in a separate `drizzle`
# schema; if we don't wipe it, db:migrate sees "all 17 migrations applied"
# and skips creating any tables, leaving public empty.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public; DROP SCHEMA IF EXISTS drizzle CASCADE;"

echo "[reset-staging-schema] bootstrapping drizzle migration tracking..."
npm run db:migrate:bootstrap

echo "[reset-staging-schema] applying migrations..."
npm run db:migrate

echo "[reset-staging-schema] done."
