# Manual Gusto Payroll CSV Export — Implementation Plan (product-backlog build #6, last of six)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Admin-triggered CSV download the payroll office hand-uploads into Gusto (NOT a live API integration). Two flavors: hourly W-2 labor (coach/venue_manager) summed from `time_entries`, and per-match 1099 referee stipends from `game_officials.feeCents`. Degrades gracefully — `time_entries` is empty in prod until build #5 part 2 ships, so tests self-seed it.

**Architecture:** Read-only `GET /api/admin/labor/gusto-export`, org+location scoped (`requireOrgAdminAccess` / `getLocationIdsForUser`, same shape as `/api/admin/incidents`). Pure libs do the work (unit-testable without a DB): `resolvePayPeriodBoundsUtc` (org-tz bounds via `tzDayBoundsUtc`), `aggregateHourlyLabor` (sum closed shifts per user+role), `buildGustoHoursCsv`/`buildGustoRefereeCsv` (over existing `toCsvRow`). New `payroll_exports` audit table (migration 0072). UI at new `/admin/reports/payroll` (build #5's `/admin/labor` page not shipped yet).

## Owner decisions surfaced (do NOT resolve — put in PR body)
1. **Pay-rate gap:** no staff hourly rate stored anywhere (grep-confirmed). Recommendation: **hours-only export, no rate table** — Gusto's Smart Import multiplies hours × the rate it already holds per employee. Referees unaffected (`feeCents` is a stored dollar fee). Owner confirms employees have rates in Gusto; if not, a small `staff_pay_rates` table is a separable follow-up.
2. **Exact Gusto column template:** Smart Import auto-matches columns; contractor/1099 is a separate import surface (validated). Column labels here are best-effort — owner pulls their account's real templates to confirm.

## Global Constraints
- Tenant-scope via `requireOrgAdminAccess`; location_admin via `getLocationIdsForUser`.
- Every `.limit(1)` gets explicit `orderBy`.
- Pay-period bounds in the ORG's timezone via `resolvePayPeriodBoundsUtc`/`tzDayBoundsUtc` — never raw UTC date math.
- Never hard-fail on empty: no rows → 200 + header-only CSV.
- Flagged hourly shifts INCLUDED in sum + counted separately; open shifts EXCLUDED from sum but counted on audit row.
- CI-robust self-seeding fixtures (find-or-create by marker); explicit orderBy.
- Schema → db:generate → review → commit → db:migrate (never db:push remote).
- Pre-push: catalog:validate → db:seed:e2e → test:api (matched CRON_SECRET) → test:unit → build → typecheck.

## Tasks (full spec in the plan agent's output — see the 13 tasks)
1. Schema + migration 0072: `payroll_exports` audit table (`src/lib/db/schema/payroll.ts`, export from index).
2. Unit `resolvePayPeriodBoundsUtc` (`src/lib/payroll/pay-period.ts`) — DST-correct per-boundary delegation; tests incl. spring-forward week, to<from throws.
3. Unit `aggregateHourlyLabor` (`src/lib/payroll/aggregate-hours.ts`) — group by (userId, role), flagged included + counted, deterministic sort.
4. Unit Gusto CSV builders (`src/lib/payroll/gusto-csv.ts` + `referee-lines.ts`) — header-only on empty, RFC-4180 quoting via toCsvRow, feeCents→dollars.
5. API scaffold `GET /api/admin/labor/gusto-export` — auth + validation; referee org-scoping via games→seasons→programs→locations.organizationId chain (games has no orgId; venue left-joined for name/location scope). Tests: 401/403/400.
6. API hours happy path — self-seed time_entries (2 closed + 1 flagged + 1 open); assert sum, flagged_shift_count, open excluded, audit row.
7. API referee happy path — self-seed game_officials; fee "50.00", unpaid-only default, includePaid override, one-line-per-match, audit row.
8. API empty-period graceful (both flavors + empty location scope).
9. API location_admin scoping.
10. Tenant-isolation dedicated file (Org B never leaks; afterAll cleanup).
11. Admin UI `/admin/reports/payroll` — date inputs + kind toggle + `<a download>` link (registrations-list.tsx pattern); nav entry in Reports section.
12. Route-coverage guard.
13. Pre-push checklist.

**BUILD NOTE (controller): the referee `matchup` column is a placeholder ("Game <date>") in the plan draft because teams aren't joined. Wire REAL home/away team names if `games` has homeTeamId/awayTeamId + a teams table with names; if that join isn't clean, DROP the matchup column rather than ship a useless placeholder value.**

**Task count: 13.**
