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
