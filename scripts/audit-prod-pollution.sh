#!/usr/bin/env bash
# scripts/audit-prod-pollution.sh
#
# READ-ONLY audit of test-pollution residue in the connected database.
# Prints counts of rows matching known test patterns, plus the baseline
# rows that should remain after cleanup (mahad user + aspire/soccerone
# orgs). NO DELETEs, NO UPDATEs — pure SELECT only.
#
# Usage:
#   DATABASE_URL="<prod connection string>" ./scripts/audit-prod-pollution.sh
#
# The DATABASE_URL must be passed in explicitly — the script does not
# read .env. This avoids any chance of running against the wrong DB
# by accident.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set. Pass it explicitly:" >&2
  echo "  DATABASE_URL='postgresql://...' $0" >&2
  exit 1
fi

# Refuse to run against staging — staging gets wiped every CI run, no
# pollution to audit there. This script is for prod only.
if [[ "$DATABASE_URL" == *staging* || "${STAGING_DB_CONFIRMED:-}" == "yes" ]]; then
  echo "ERROR: This script is for PROD audit only. The connection string" >&2
  echo "       looks like staging. Re-run against the prod DB." >&2
  exit 2
fi

# Display the host so the operator can visually confirm before reading
# query results. Strip credentials.
host=$(echo "$DATABASE_URL" | sed -E 's#^[a-z]+://[^@]+@([^/?]+).*#\1#')
echo "[audit] running against: $host"
echo "[audit] (read-only — no DELETE/UPDATE/INSERT will run)"
echo

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -A -F $'\t' <<'SQL'
\echo '═══════════════════════════════════════════════════════════════'
\echo 'BASELINE (these should remain after cleanup)'
\echo '═══════════════════════════════════════════════════════════════'
\echo
\echo '-- mahad user (real account):'
SELECT id, email, first_name, last_name, created_at
FROM users
WHERE email = 'mahad@gmail.com';

\echo
\echo '-- real orgs:'
SELECT id, slug, name, organization_type, status, created_at
FROM organizations
WHERE slug IN ('aspire-sports', 'soccerone');

\echo
\echo '═══════════════════════════════════════════════════════════════'
\echo 'POLLUTION COUNTS (test data accumulated since 2026-05-02 cleanup)'
\echo '═══════════════════════════════════════════════════════════════'
\echo
\echo '-- test-pattern users:'
SELECT
  COUNT(*) FILTER (WHERE email LIKE '%@test.aspiresports.com')                     AS test_aspiresports,
  COUNT(*) FILTER (WHERE email LIKE '%@example.com')                                AS example_com,
  COUNT(*) FILTER (WHERE email LIKE 'guest-%')                                      AS guest_prefix,
  COUNT(*) FILTER (WHERE email LIKE 'checkout-test-%')                              AS checkout_test_prefix,
  COUNT(*) FILTER (WHERE email LIKE 'e2e-%')                                        AS e2e_prefix,
  COUNT(*) FILTER (WHERE email = 'mahad@gmail.com')                                 AS mahad_real,
  COUNT(*)                                                                          AS total
FROM users;

\echo
\echo '-- family_members (test-pattern names):'
SELECT
  COUNT(*) FILTER (WHERE first_name LIKE 'Kid%' AND last_name LIKE 'TestCheckout')  AS kid_testcheckout,
  COUNT(*) FILTER (WHERE first_name = 'TestChild' AND last_name = 'ApiTest')        AS testchild_apitest,
  COUNT(*) FILTER (WHERE first_name = 'E2E' AND last_name = 'Kid')                  AS e2e_kid,
  COUNT(*) FILTER (WHERE first_name LIKE 'Kid%')                                    AS any_kid_prefix,
  COUNT(*)                                                                          AS total
FROM family_members;

\echo
\echo '-- registrations:'
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'pending')      AS pending,
  COUNT(*) FILTER (WHERE status = 'confirmed')    AS confirmed,
  COUNT(*) FILTER (WHERE status = 'cancelled')    AS cancelled,
  COUNT(*) FILTER (WHERE payment_status = 'paid')         AS paid,
  COUNT(*) FILTER (WHERE payment_status = 'unpaid')       AS unpaid,
  COUNT(*) FILTER (WHERE payment_status = 'deposit_paid') AS deposit_paid
FROM registrations;

\echo
\echo '-- registrations linked to test users:'
SELECT
  COUNT(*) FILTER (WHERE u.email LIKE '%@test.aspiresports.com')  AS via_test_aspire,
  COUNT(*) FILTER (WHERE u.email LIKE '%@example.com')             AS via_example_com,
  COUNT(*) FILTER (WHERE u.email LIKE 'guest-%')                   AS via_guest,
  COUNT(*) FILTER (WHERE u.email LIKE 'checkout-test-%')           AS via_checkout_test,
  COUNT(*)                                                         AS total_test_linked
FROM registrations r
JOIN users u ON r.registered_by_user_id = u.id
WHERE u.email LIKE '%@test.aspiresports.com'
   OR u.email LIKE '%@example.com'
   OR u.email LIKE 'guest-%'
   OR u.email LIKE 'checkout-test-%'
   OR u.email LIKE 'e2e-%';

\echo
\echo '-- payments:'
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'succeeded')    AS succeeded,
  COUNT(*) FILTER (WHERE payment_type = 'deposit') AS deposit_payments,
  COUNT(*) FILTER (WHERE payment_type = 'full')    AS full_payments,
  COUNT(*) FILTER (WHERE payment_type = 'balance') AS balance_payments
FROM payments;

\echo
\echo '-- consents (parental + waiver + media-auth rows):'
SELECT type, COUNT(*) AS rows
FROM consents
GROUP BY type
ORDER BY type;

\echo
\echo '-- email_logs (every email send):'
SELECT email_type, COUNT(*) AS rows
FROM email_logs
GROUP BY email_type
ORDER BY rows DESC
LIMIT 15;

\echo
\echo '-- magic_links:'
SELECT
  COUNT(*) FILTER (WHERE used_at IS NULL)  AS unused,
  COUNT(*) FILTER (WHERE used_at IS NOT NULL) AS used,
  COUNT(*)                                  AS total
FROM magic_links;

\echo
\echo '-- discount_usages:'
SELECT COUNT(*) FROM discount_usages;

\echo
\echo '-- sessions (Lucia auth — short-lived but accumulate):'
SELECT
  COUNT(*) FILTER (WHERE expires_at > NOW())  AS active,
  COUNT(*) FILTER (WHERE expires_at <= NOW()) AS expired,
  COUNT(*)                                     AS total
FROM sessions;

\echo
\echo '═══════════════════════════════════════════════════════════════'
\echo 'EXTRA ORGANIZATIONS (anything beyond aspire-sports + soccerone)'
\echo '═══════════════════════════════════════════════════════════════'
SELECT id, slug, name, organization_type, created_at
FROM organizations
WHERE slug NOT IN ('aspire-sports', 'soccerone')
ORDER BY created_at DESC;

\echo
\echo '═══════════════════════════════════════════════════════════════'
\echo 'SAMPLE OF MOST RECENT TEST USERS (last 10 to spot-check pattern)'
\echo '═══════════════════════════════════════════════════════════════'
SELECT id, email, first_name, last_name, created_at
FROM users
WHERE email != 'mahad@gmail.com'
ORDER BY created_at DESC
LIMIT 10;
SQL

echo
echo "[audit] done."
