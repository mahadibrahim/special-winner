#!/usr/bin/env bash
# scripts/with-bws.sh
#
# Run any command with Aspire's secrets injected from Bitwarden Secrets
# Manager. The BWS access token is read from the macOS login Keychain at
# runtime, exported only for the spawned process, and never written to disk.
#
# The token item is created once with:
#   security add-generic-password -a "BitWarden" -s "bws-aspire-local" -w
#
# Usage:
#   ./scripts/with-bws.sh npm run dev
#   ./scripts/with-bws.sh npm run test:api
set -euo pipefail

KEYCHAIN_ACCOUNT="BitWarden"
KEYCHAIN_SERVICE="bws-aspire-local"
PROJECT_ID="d5054128-d647-480c-bcfd-b46a00d295c7"

if ! command -v bws >/dev/null 2>&1; then
  echo "error: 'bws' CLI not found on PATH. Install Bitwarden Secrets Manager CLI first." >&2
  exit 1
fi

if (($# == 0)); then
  echo "usage: ./scripts/with-bws.sh <command> [args...]" >&2
  exit 64
fi

BWS_ACCESS_TOKEN="$(security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null)" || {
  echo "error: could not read BWS token from Keychain (account '$KEYCHAIN_ACCOUNT', service '$KEYCHAIN_SERVICE')." >&2
  echo "       store it with: security add-generic-password -a \"$KEYCHAIN_ACCOUNT\" -s \"$KEYCHAIN_SERVICE\" -w" >&2
  exit 1
}
export BWS_ACCESS_TOKEN

exec bws run --project-id "$PROJECT_ID" -- "$@"
