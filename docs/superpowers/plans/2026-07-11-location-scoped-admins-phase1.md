# Location-Scoped Admins (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `location_admin @ location` a first-class admin shape — assignable from the UI/invite with a location picker, accepted by the admin gate with a recorded location scope, barred from org-level configuration endpoints, and guarded against redundant role stacking.

**Architecture:** No schema change. Scope determines meaning: `location_admin@organization` = Organization Admin (all locations), `location_admin@location` = Location Admin (one location). `requireOrgAdminAccess` gains a location-scoped acceptance path and returns `locationScope: "all" | string[]`. A `requireOrgWideAdminAccess` wrapper protects org-level endpoints (settings/Stripe/sports/broadcasts/locations/organizations) per the "no access" decision. Phase 2 (per-location data isolation on all admin endpoints) is explicitly out of scope.

**Tech Stack:** Astro API routes, Drizzle, Lucia sessions, Vitest HTTP tests against the dev server.

## Global Constraints

- Dev server: `E2E_TEST_ENDPOINTS=yes R2_MOCK=1 ./scripts/with-bws.sh npm run dev` from the worktree; confirm it binds 4321 (kill orphans first — see the port-4322 incident).
- Tests: `TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run <files>`.
- TDD every task; known pre-existing staging failures are documented in [[staging-db-preexisting-test-failures]] — triage by file overlap.
- Phase 2 is out of scope: location-scoped admins still see org-wide data on location-owned endpoints (programs, registrations, payments); document this in the PR.

---

### Task 1: Gate — accept location-scoped location_admin, expose locationScope

**Files:**
- Modify: `src/lib/auth/roles.ts` (`requireOrgAdminAccess`, ~line 568)
- Test: `tests/api/admin/location-scoped-admin-gate.test.ts` (new)

**Interfaces:**
- Produces: `requireOrgAdminAccess` success result gains `locationScope: "all" | string[]` — `"all"` for global super_admin and org-scoped admins; an array of in-org location ids for location-scoped admins. Authorization now also succeeds when the caller holds `location_admin @ location` for ≥1 location belonging to the resolved org.

- [ ] **Step 1: Write the failing test.** Fixture (via DB, in `beforeAll`): create a user with `hashPassword("TestLocAdmin123!")` (import from `@/lib/auth/password`), a `location_admin` role row with `scopeType: "location"`, `scopeId` = an org-A location id (query `locations` by the aspire-sports org). Sign in via `getAuthCookie`. Assert:
  - `GET /api/admin/users` with that cookie → **200** (location-scoped admin passes the org gate).
  - A second user with `location_admin @ location` of an **orgb** location → **403** on org-A context (localhost).
  - Cleanup: delete both users in `afterAll` (cascades roles).
- [ ] **Step 2: Run — expect the first assertion to fail with 403** (today the gate only honors org-scoped admin rows).
- [ ] **Step 3: Implement.** In `requireOrgAdminAccess`, after the existing `isAdminForOrg` check fails, query the caller's `location_admin` rows with `scopeType="location"`, join `locations` on `scopeId` filtered to `organizationId` = resolved org. If ≥1 row: authorized with `locationScope` = those location ids. On the existing success path set `locationScope: "all"`. Update the return type. Update the stale comment in `isAdminForOrg` ("not a pattern used here") to point at the new path.
- [ ] **Step 4: Run the new test + `tests/api/admin-tenant-scoping.test.ts`** — all green (tenant-scoping proves org-scoped admins are unaffected).
- [ ] **Step 5: Commit** `feat(auth): accept location-scoped location_admin at the org admin gate`.

### Task 2: Org-level endpoints require org-wide admin

**Files:**
- Modify: `src/lib/auth/roles.ts` (add `requireOrgWideAdminAccess`)
- Modify: `src/pages/api/admin/sports.ts`, `broadcasts.ts`, `locations.ts`, `stripe-connect/*.ts`, `organizations/*.ts`, plus any settings endpoints found by `grep -rln "requireOrgAdminAccess" src/pages/api/admin | grep -E "settings|integration"` — swap `requireOrgAdminAccess` → `requireOrgWideAdminAccess`.
- Test: extend `tests/api/admin/location-scoped-admin-gate.test.ts`

**Interfaces:**
- Produces: `requireOrgWideAdminAccess(context)` — `requireOrgAdminAccess` + 403 `"Forbidden: requires organization-wide admin"` when `locationScope !== "all"`.

- [ ] **Step 1: Failing test.** Location-scoped admin cookie: `GET /api/admin/sports` → expect **403**; org-wide admin (seeded super admin) → **200**. Run: fails (both 200 today once Task 1 lands).
- [ ] **Step 2: Implement wrapper + swap the enumerated endpoints.**
- [ ] **Step 3: Run new test + tenant-scoping + `tests/api/admin/users.test.ts`** — green.
- [ ] **Step 4: Commit** `feat(auth): org-level admin endpoints require org-wide admin`.

### Task 3: Redundant-stacking guards in role assignment

**Files:**
- Modify: `src/pages/api/admin/users.ts` (POST)
- Test: extend `tests/api/admin-tenant-scoping.test.ts` §9f or new describe

**Interfaces:**
- Produces: POST rejects with 409 `"User is a platform super admin — additional roles are redundant"` when the TARGET holds global `super_admin`; rejects with 409 `"User is already an organization admin for this organization"` when assigning `location_admin @ location` to a target holding `location_admin @ organization` for the caller's org.

- [ ] **Step 1: Failing tests.** (a) assign `coach@organization` to the seeded super admin → expect 409 (today 201 — must clean up if it unexpectedly succeeds; use DELETE with returned userRole id in a finally). (b) assign `location_admin@location` (org-A location id) to a fixture user holding `location_admin@organization` (org A) → expect 409.
- [ ] **Step 2: Implement both guards** after the membership/global checks, before the duplicate check: query target's roles (join `roles` for names) once and branch.
- [ ] **Step 3: Run the file — green; whole tenant-scoping suite green.**
- [ ] **Step 4: Commit** `feat(admin): block redundant role stacking (super admin, org admin ⊃ location admin)`.

### Task 4: Role dialog + badges — Organization Admin vs Location Admin with picker

**Files:**
- Modify: `src/components/admin/users-list.tsx`
- Modify: `src/pages/api/admin/users.ts` (GET: enrich location-scoped roles with `locationName`)
- Test: extend `tests/api/admin/users-directory.test.ts` (GET enrichment); dialog behavior is covered by the API tests + manual verify (no component test infra)

**Interfaces:**
- Consumes: `GET /api/admin/locations` (existing) for the picker options.
- Produces: GET `/api/admin/users` role objects gain `locationName: string | null` (single `inArray` locations query for the page's location-scoped roleIds). Dialog sends `{roleName: "location_admin", scopeType: "organization"}` for Organization Admin or `{roleName: "location_admin", scopeType: "location", scopeId}` for Location Admin.

- [ ] **Step 1: Failing test** for GET enrichment: fixture user with location-scoped location_admin role → directory response includes `roles[0].locationName` = the location's name.
- [ ] **Step 2: Implement GET enrichment.**
- [ ] **Step 3: UI:** role select options become `super_admin` → "Super Admin", `org_admin` (maps to location_admin@organization) → "Organization Admin", `location_admin` → "Location Admin" (reveals a location Select fed by `/api/admin/locations`; Assign disabled until chosen), plus coach/parent/player/referee unchanged. Badge label: `location_admin` renders "Org Admin" when `scopeType === "organization"`, `"Location Admin · <locationName>"` when location-scoped. If the selected user's roles include global super_admin, replace the dialog body with a note ("Platform super admin — additional roles are redundant") and disable Assign.
- [ ] **Step 4: Manual verify via dev server** (role dialog on a fixture user: assign Location Admin with picker; badge shows location name; API tests from Tasks 1-3 stay green).
- [ ] **Step 5: Commit** `feat(admin): location picker + honest labels for admin role assignment`.

### Task 5: Invite flow — optional location for Location Admin

**Files:**
- Modify: `src/pages/api/admin/users/invite.ts` (schema: optional `locationId` UUID; when `roleName === "location_admin"` and `locationId` present, validate via `requireSameOrgLocation` then insert the role `scopeType: "location", scopeId: locationId`; other roles reject `locationId` with 400)
- Modify: `src/components/admin/users-list.tsx` (invite dialog: relabel "Location admin (front desk)" → "Organization admin (front desk)" for the org-scoped default, add "Location admin (single location)" option that reveals the same location picker)
- Test: extend `tests/api/admin/users.test.ts` invite coverage

**Interfaces:**
- Consumes: `requireSameOrgLocation` from `@/lib/auth/require-resource-ownership`; picker from Task 4.

- [ ] **Step 1: Failing test:** invite with `roleName: "location_admin", locationId: <org-A location>` → 201 and the created user's role row is `scopeType "location"` with that scopeId (query DB); invite with an orgb locationId → 404; `locationId` with `roleName: "coach"` → 400. Cleanup: delete invited users.
- [ ] **Step 2: Implement schema + validation + insert.**
- [ ] **Step 3: UI picker in invite dialog.**
- [ ] **Step 4: Run invite tests — green. Commit** `feat(admin): invite location-scoped location admins`.

### Task 6: Verification + PR

- [ ] Suites: gate test file, tenant-scoping, admin/users, users-directory, plus `npx tsc --noEmit`, `./scripts/with-bws.sh npm run build`.
- [ ] `grep -rn "admin" tests/e2e/` for specs asserting role labels or the role dialog (admin-dashboard asserts structure only — confirm nothing matches "Location Admin" text).
- [ ] Manual verify (dev server): assign + invite flows end-to-end; location-scoped admin signs in and can reach /admin/users but gets 403 UI state on Sports.
- [ ] PR: model table (scope determines meaning), the org-level "no access" decision, the explicit Phase 2 deferral (location admins still see org-wide data on location-owned endpoints), test evidence. CI green before merge.

## Self-Review Notes

- Decision coverage: Phase-1-only scope ✓ (Task 2 delivers the "no access" boundary; Phase 2 named as deferred); both user-reported issues addressed (picker: Tasks 4-5; stacking: Task 3).
- Type consistency: `locationScope: "all" | string[]` produced in Task 1, consumed in Task 2's wrapper; `requireSameOrgLocation(orgId, locationId)` exists today.
- Ordering: Task 2 depends on Task 1's return shape; Tasks 4-5 depend on Task 3's guards for dialog behavior. Single PR.
