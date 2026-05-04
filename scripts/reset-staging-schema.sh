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
