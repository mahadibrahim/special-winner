# Prod-purge receipt — 2026-05-16

After the admin-overhaul merge (PR #56), the production database was found to be ~90% test/zombie data. Pre-launch with no real customer data to protect, so we did a hard reset to a clean baseline.

## Keep-set (preserved)

- **Organization** (1 row): `caf5eac4-28ed-459a-8bdd-04c572d052d3` — *Aspire Sports*
- **Locations** (2 rows):
  - `18762139-8a91-4c12-bbfa-346c61e1106c` — *Aspire Sports — Downtown / OSU*
  - `2a1693fe-3adc-41f5-90e2-03278decbd6d` — *Aspire Sports — Worthington*
- **Users** (2 rows):
  - `mahad.ibrahim@gmail.com` (founder, super_admin)
  - `alexis.santos@icloud.com`
- **Reference data** (untouched): `roles`, `skill_*`, `development_stages`, `coaching_principles`, `resource_templates`, `drop_in_rate_card`, `field_rental_rate_card`

## Rows deleted (per table, in topological FK order)

| Table | Rows |
| --- | --- |
| activity_completions | 6,185 |
| media_assets | 1,064 |
| media_audit_log | 681 |
| seasons | 341 |
| shoot_sessions | 311 |
| teams | 310 |
| programs | 289 |
| age_groups | 212 |
| sports | 212 |
| consents | 197 |
| organizations | 163 |
| locations | 157 |
| venues | 155 |
| games | 155 |
| users | 150 |
| curriculum_reviews | 93 |
| family_members | 82 |
| coach_prompts | 82 |
| registrations | 74 |
| user_roles | 55 |
| conversations | 42 |
| conversation_messages | 42 |
| sessions | 41 |
| broadcast_log | 39 |
| email_logs | 35 |
| drop_in_bookings | 35 |
| payments | 25 |
| drop_in_sessions | 25 |
| venue_role_assignments | 20 |
| coach_resources | 19 |
| magic_links | 10 |
| bookable_resources | 4 |
| team_registrations | 2 |
| domain_mappings, email_verification_tokens, phone_opt_ins, product_variants, products, user_nudge_state | 1 each |
| checklist_submissions | 5 |
| **Total** | **~11,300 rows** |

All deletes ran inside a single transaction (rollback-on-error). Reference tables (roles, skill_*, etc.) were skipped.

## Security finding noted during the audit (not yet addressed)

Four `@gmail.com` accounts with random first/last names and Gmail-dot-trick email patterns (`agivob.a.re.s.a.8.5@gmail.com`, `el.ik.a.p.aq.i3.5@gmail.com`, `tidufal.6.3.8@gmail.com`, `w.ub.o.t.uj.o.j.iq.4.5@gmail.com`) signed up on prod between May 5 and May 14 with valid-format phone numbers and 30-day sessions. None completed email or phone verification, none had Stripe customers. Signup cadence: 1–5 days apart, ongoing.

**Interpretation:** automated bot signups reaching `/signup` with no CAPTCHA / rate-limit / dot-trick normalization catching them.

**Follow-ups for a separate PR (not blocking this purge):**

1. CAPTCHA (Turnstile or reCAPTCHA) on `/signup`.
2. Gmail dot-trick normalization at signup uniqueness check (`agivob.a.re.s.a.8.5@gmail.com` and `agivobaresa85@gmail.com` resolve to the same inbox).
3. TTL on unverified accounts (cron deletes `WHERE email_verified=false AND created_at < NOW() - INTERVAL '7 days'`).
4. Short session lifetime (1–2 hours) until email verified — currently 30 days.

These four user rows were deleted as part of the purge — the evidence above is preserved in this receipt for context.

## Reproducibility

The one-off purge script (`scripts/admin-overhaul-prod-purge.ts`) is removed from the working tree per repo convention but preserved in git history at the parent commit of the deletion. The audit script (`scripts/admin-overhaul-audit.ts`) was enhanced with test-pattern detection queries in this PR and stays as general-purpose tooling for future investigations.
