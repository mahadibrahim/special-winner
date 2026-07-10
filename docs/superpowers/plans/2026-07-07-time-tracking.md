# In-App Time Tracking + Geolocation Implementation Plan (product-backlog build #5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** In-app check-in/out time tracking with geolocation verification — coaches/venue managers clocked hourly, referees per-match — feeding a future Gusto export (#6). Avoids Homebase-style SaaS.

**Architecture:** New `time_entries` table (userId/venueId/role/optional gameId/clock times + lat-lng + geofence flag). Browser Geolocation API captured at the clock-in/out tap. Pure haversine distance vs. per-venue coordinates decides a *flag* — never a block. Clock-out closes the `act.staff_check_in_out` activity via the existing `markCompleteBySystemEvent` engine.

**Tech Stack:** Astro 5 + React 19, Drizzle/Postgres, browser Geolocation API, Vitest.

## Owner decisions — ANSWERED 2026-07-07 (supersedes the earlier provisional defaults)
1. **Location privacy/consent** — OWNER: geolocation is **NOT optional for employees; it is a condition of employment**. Employees get a **notice that location capture is a condition of employment** and may decline by quitting. This is table-stakes.
   → IMPLEMENTATION: consent screen is a **mandatory, versioned employment-condition acknowledgement** gating first clock-in (no ack → no clock-in). Location capture is **REQUIRED**: a clock-in with no location fix (permission denied / no GPS) is **BLOCKED** (422), not recorded-with-flag. The `flag_reason='missing_location'` value is retained in the schema only for admin-manual back-entries; the self-serve clock-in path never produces it. (Admin manual time-entry for genuine device failures = a noted follow-up, not built here.)
2. **Geofence radius** — OWNER: **150m is fine so long as employees can't game the system.** → accuracy-aware 3-state geofence (prevents gaming without false-blocking on-site staff who have poor indoor GPS). Radius per-venue overridable via `venues.radius_m` (NULL → 150 constant).

   **The browser geolocation fix carries a `coords.accuracy` (meters, 1-σ). Capture it and store it** (schema add below). Decision, given `distanceM` (haversine venue↔fix) and `accuracyM`:
   - no fix (permission denied / unavailable) → **BLOCK 422** `missing_location` — condition of employment.
   - `accuracyM > MAX_TRUSTED_ACCURACY_M` (=200) → **BLOCK 422** `imprecise_location` — fix too coarse to verify presence; closes the "report a garbage accuracy so overlap always passes" spoof. UI: "enable precise/high-accuracy location."
   - `distanceM <= radius` → **inside**, clock in, not flagged.
   - `distanceM > radius` AND `distanceM - accuracyM <= radius` → **uncertain**: clock in but **FLAG** `out_of_range` (could be on-site with a fuzzy fix — don't strand them; surface for review).
   - `distanceM - accuracyM > radius` → **outside**: **BLOCK 422** `out_of_range` — clearly not on-site (couch clock-in). Can't game it.

   **Schema add (migration ~0073):** `time_entries.clock_in_accuracy_m` + `clock_out_accuracy_m` (integer, nullable); add `imprecise_location` to `labor_flag_reason` enum via `ALTER TYPE ... ADD VALUE IF NOT EXISTS`. `computeGeofenceFlag` (foundation Task 3) is superseded by a new `computeGeofenceDecision(...)` returning `{ state: 'inside'|'uncertain'|'outside'|'imprecise'|'no_fix', distanceM, flagged, flagReason, blocked }` — keep the old fn or fold it in; full unit-test matrix for every branch incl. the `distance - accuracy` boundary and the imprecise cap.

   **Honest limit (note in PR, not a blocker):** a rooted phone with a mock-GPS app can still spoof `coords` through any browser geofence; defeating that needs a native app + device attestation. This design blocks *casual* gaming (couch clock-in, garbage-accuracy trick), stores accuracy for audit, and flags borderline fixes — sufficient for a rec operator. Native hardening is a future follow-up if spoofing becomes real.

## Global Constraints
- Tenant-scope every endpoint via `requireSameOrg*` / `requireOrgAdminAccess`.
- Every `.limit(1)`/`findFirst` gets explicit `orderBy` (`asc(createdAt)` default).
- Schema: re-check latest migration number (`ls src/lib/db/migrations/*.sql | sort -V | tail -3` — ejection landed 0070, so this is **0071**) → `npm run db:generate` → review idempotency → commit → `db:migrate` (never `db:push` remote).
- **Never hard-block on geolocation.** Missing permission / GPS timeout / out-of-radius all insert the row + set a flag; never a 4xx for "not close enough".
- People model: every actor here is `users` (staff/referee), not `family_members`.
- CI-robust fixtures: every API test self-seeds venue/game/game_official/user by deterministic marker (find-or-create), like `tests/api/staff/incidents.test.ts`.
- Forms: react-hook-form + zod; `ErrorBanner`/`EmptyState`/`LoadingSkeleton`; `useHydrationBeacon()` on the `client:load` shift page.
- Ops catalog cached per-process — restart dev server after editing a catalog YAML; `npm run catalog:validate` must pass.
- Pre-push: `catalog:validate` → `db:seed:e2e` → `test:api` (matched `CRON_SECRET`) → `test:unit` → `build` → `typecheck`.

---

## FOUNDATION — safe to build regardless of owner answers (Tasks 1–6)

### Task 1: Schema + migration — venue coordinates, `time_entries`, `staff_location_consents`
Add to `venues` (`src/lib/db/schema/teams.ts`): `latitude`/`longitude` `decimal(10,6)` nullable, `radiusM` integer nullable. New `src/lib/db/schema/time-tracking.ts`: `laborRoleEnum` (coach/venue_manager/referee), `laborFlagReasonEnum` (missing_location/out_of_range), `timeEntries` table (org/user/venue/role/gameId-nullable/clockIn·Out At+Lat+Lng/clockInDistanceM/flaggedOutOfRange/flagReason/notes) with: partial unique index one-open-shift-per-user (`clockOutAt IS NULL AND gameId IS NULL`), partial unique index one-per-(gameId,userId), check `clock_out > clock_in`, check referee⇔gameId. `staffLocationConsents` (org/user/acknowledgedAt/noticeVersion, unique (userId,orgId)). Export from `schema/index.ts`. `db:generate`, review, `db:migrate`. tsc clean.

### Task 2: `haversineDistanceMeters` — pure fn + unit test
`src/lib/geo/haversine.ts`, great-circle, rounded meters. `tests/unit/geo/haversine.test.ts`: identical→0; 1° lat→~111km; symmetric; known short distance ±1m.

### Task 3: `computeGeofenceFlag` + unit tests
`src/lib/time-tracking/geofence.ts`, `DEFAULT_GEOFENCE_RADIUS_M = 150`. Venue no-coords→never flag; missing client loc→flagged `missing_location`, distance null; within radius→ok; outside→`out_of_range`; per-venue override honored.

### Task 4: `deriveLaborRole` + unit tests
`src/lib/time-tracking/derive-labor-role.ts` — location_admin→venue_manager, else coach→coach, else null. Precedence documented. Tests for each branch.

### Task 5: Ops catalog `system_event` wiring
Add `evt.staff_shift_clocked_out.yaml` + `evt.referee_check_in_recorded.yaml` (kind: system_event). Flip `act.staff_check_in_out.yaml` + `act.ref_check_in.yaml` to `tracking_method: system_event` with the new event refs. `catalog:validate` clean; restart dev server.

### Task 6: `closeStaffShiftActivitiesForVenueToday` bridge
`src/lib/activity-tracking/close-staff-shift.ts` — `activity_completions.gameId` is NOT NULL, so a shift's activity has one pending row per game at the venue; on clock-out close **every** game's row at that venue for "today" in org tz. Unit/integration test: 3 games today→3 closed; other venue/yesterday untouched.

---

## DECISION-DEPENDENT — hold until owner confirms privacy stance (Tasks 7–17)

### Task 7: consent endpoints
`POST/GET /api/staff/location-consent` — `requireStaffAccess`, upsert on unique index. Tests: 401/create/idempotent/GET-reflects.

### Task 8: `POST /api/staff/shifts/clock-in`
`requireStaffAccess`→`deriveLaborRole` (403 null)→zod `{venueId, lat?, lng?}`→`requireSameOrgVenue`→consent-check (409 `consent_required`)→`computeGeofenceFlag`→insert. 409 `already_clocked_in` on open-shift index violation. Missing/out-of-range still 201 + flagged. Self-seeded tests.

### Task 9: `POST /api/staff/shifts/clock-out`
Find open shift (`gameId IS NULL, clockOutAt IS NULL, orderBy asc(createdAt)`, 404 `no_open_shift`)→store coords→update→fire-and-forget `closeStaffShiftActivitiesForVenueToday`. Tests incl. N-games auto-complete + other-venue untouched.

### Task 10: `GET /api/staff/shifts/current`
Open shift or `{timeEntry:null}`. Tests 401/null/present.

### Task 11: Mobile page `/staff/shifts`
`src/components/staff/shift-clock.tsx` (`client:load`, `useHydrationBeacon`) + Astro page. Consent modal gate → venue picker → geolocation at tap (permission-denied → POST without coords) → clock-in/out state.

### Task 12: Referee endpoints `POST /api/referee/matches/[gameId]/check-in` + `check-out`
`requireAssignedOfficial` (from ejection build) + `requireSameOrgGame`, `role:referee`, gameId set, consent-gate + geofence, idempotent (409 dup), fire `markCompleteBySystemEvent(gameId,'evt.referee_check_in_recorded')`. Check-out sets clockOutAt only (no second completion — stipend locks on report). Tests incl. 403 not-assigned, cross-org 404.

### Task 13: Referee UI check-in/out controls
Extend the referee match surface, same geolocation pattern, gated to assigned match. Add `getRefereeCookie()` to `tests/api/setup/test-helpers.ts`.

### Task 14: `GET /api/admin/labor/time-entries`
`requireOrgAdminAccess`; super_admin whole-org, location_admin scoped via `getLocationIdsForUser`→venue locationId; `?venueId=&from=&to=&flaggedOnly=`; joins user/venue names; `orderBy desc(clockInAt)`. Read surface for #6. Tests 401/403/isolation/filters.

### Task 15: Admin page `/admin/labor`
`src/components/admin/labor/time-entries-list.tsx` + Astro — table + Flagged badge + venue/date filters, review-only.

### Task 16: Route-coverage guard
`/staff/shifts` already covered by `/^\/staff(\/|$)/`. Add `/admin/labor` to `tests/unit/portal/route-coverage.test.ts` allowlist with reason (or a real nav slot).

### Task 17: Tenant isolation + full pre-push checklist
`tests/api/staff/shifts-tenant-isolation.test.ts` (Org A coach vs Org B venue 404; admin list never leaks Org B). Then full checklist.

**Task count: 17.**
