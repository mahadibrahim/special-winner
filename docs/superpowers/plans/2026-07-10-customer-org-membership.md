# Customer Org Membership + Directory Tenant Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every organic customer a durable org-membership record (`user_organization_access`) and stop the admin user directory from leaking all parents platform-wide, before a second real tenant onboards.

**Architecture:** `user_organization_access` (uoa) becomes the source of truth for "customer of this org" — the model the codebase already chose (invite, hire, walk-up flows all write it). We add write hooks at the two organic entry points (season registrations via the shared `createRegistration` helper; drop-in bookings at their four insert sites), a one-shot idempotent SQL backfill migration derived from historical registrations and bookings, and narrow the directory GET's global-scope branch to true super_admins only. `requireUserInOrg` needs no change — once customers have uoa rows, the role-assignment membership gate accepts them.

**Tech Stack:** Astro API routes, Drizzle ORM, PostgreSQL (Railway staging/prod), Vitest API tests against a running dev server.

## Global Constraints

- Never run `db:push` against remote DBs; the backfill ships as a committed migration applied by `migrate-prod.yml` / `Migrate staging database` on merge.
- Membership grants are **best-effort**: a uoa failure must never fail a registration/booking (match the `resolvePerson` parent-role pattern: try/catch + `console.error`).
- Multi-tenant determinism rule: any `findFirst`/`.limit(1)` needs explicit `orderBy` (not needed for existence checks that don't care which row).
- Dev server for tests: `E2E_TEST_ENDPOINTS=yes R2_MOCK=1 ./scripts/with-bws.sh npm run dev`; test runs via `TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run <file>`.
- The uoa unique constraint `(user_id, organization_id, location_id)` does NOT dedupe NULL-location rows (Postgres NULLs are distinct), so the helper is select-then-insert; the rare double-submit race produces a harmless duplicate row.
- **Non-goals:** re-scoping the global `parent` role (deferred deeper cleanup); refactoring `add-walkup-to-pickup.ts`'s existing inline uoa insert (works, is tenant-scoped, only fires for brand-new stub users).

---

### Task 1: `ensureCustomerOrgMembership` helper

**Files:**
- Create: `src/lib/organization/ensure-membership.ts`
- Test: `tests/api/organization/ensure-membership.test.ts`

**Interfaces:**
- Produces: `ensureCustomerOrgMembership(db: Database, userId: string, organizationId: string): Promise<void>` — idempotent; inserts a uoa row with `role: "parent"`, `acceptedAt: now` iff none exists for (user, org). `Database` accepts both the top-level db handle and a transaction handle (same union used in `add-walkup-to-pickup.ts:39-41`).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/organization/ensure-membership.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { organizations, userOrganizationAccess } from "@/lib/db/schema/organizations";
import { and, eq } from "drizzle-orm";
import { ensureCustomerOrgMembership } from "@/lib/organization/ensure-membership";

const suffix = Math.random().toString(36).slice(2, 10);
const email = `ensure-membership-${suffix}@test.example`;

describe("ensureCustomerOrgMembership", () => {
  let userId: string;
  let orgId: string;

  beforeAll(async () => {
    const db = getDb();
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .limit(1);
    if (!org) throw new Error("aspire-sports org not seeded — run npm run db:seed:e2e");
    orgId = org.id;

    const [u] = await db
      .insert(users)
      .values({ email, passwordHash: "x", firstName: "Ensure", lastName: "Member" })
      .returning();
    userId = u.id;
  });

  afterAll(async () => {
    // Deleting the user cascades the uoa rows.
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("creates a parent-role access row, and is idempotent", async () => {
    const db = getDb();
    await ensureCustomerOrgMembership(db, userId, orgId);
    await ensureCustomerOrgMembership(db, userId, orgId); // second call: no dup

    const rows = await db
      .select()
      .from(userOrganizationAccess)
      .where(and(
        eq(userOrganizationAccess.userId, userId),
        eq(userOrganizationAccess.organizationId, orgId),
      ));
    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe("parent");
    expect(rows[0].acceptedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/organization/ensure-membership.test.ts`
Expected: FAIL — cannot resolve `@/lib/organization/ensure-membership`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/organization/ensure-membership.ts
import { and, eq } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Database = Db | Tx;

/**
 * Record that a user is a customer of an organization. Idempotent.
 *
 * user_organization_access is the source of truth for "belongs to this org"
 * (admin directory visibility + the role-assignment membership gate). Organic
 * flows — season registration, drop-in booking — call this so self-signed-up
 * customers are visible to their org, matching what invite/hire/walk-up
 * already do.
 *
 * Note: the (user_id, organization_id, location_id) unique constraint does
 * not dedupe NULL-location rows, hence select-then-insert. A concurrent
 * double-submit can produce a duplicate row; membership checks use
 * existence-only queries, so duplicates are harmless.
 */
export async function ensureCustomerOrgMembership(
  db: Database,
  userId: string,
  organizationId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: userOrganizationAccess.id })
    .from(userOrganizationAccess)
    .where(and(
      eq(userOrganizationAccess.userId, userId),
      eq(userOrganizationAccess.organizationId, organizationId),
    ))
    .limit(1);
  if (existing) return;

  await db.insert(userOrganizationAccess).values({
    userId,
    organizationId,
    role: "parent",
    acceptedAt: new Date(),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/organization/ensure-membership.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/organization/ensure-membership.ts tests/api/organization/ensure-membership.test.ts
git commit -m "feat(org): ensureCustomerOrgMembership helper for organic customer membership"
```

---

### Task 2: Grant membership on season registration

**Files:**
- Modify: `src/lib/registrations/create-registration.ts` (org resolution hoisted to ~line 190; two later teamToken-guarded org lookups removed at ~307-313 and ~341-349)
- Test: `tests/api/registrations-membership.test.ts`

**Interfaces:**
- Consumes: `ensureCustomerOrgMembership` from Task 1.
- Produces: every request that passes the season open/closed gates in `createRegistration` grants (user, org) membership — covering the created, resumed, waitlisted, and already-registered outcomes.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/registrations-membership.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAuthCookie, apiFetch } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { seasons, registrations } from "@/lib/db/schema";
import { organizations, userOrganizationAccess } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { and, eq } from "drizzle-orm";

const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";
const SELF_EMAIL = "adult-self@test.aspiresports.com";

describe("registration grants org membership", () => {
  let seasonId: string;
  let orgId: string;
  let selfUserId: string;
  let cookie: string;
  let createdRegistrationId: string | null = null;

  beforeAll(async () => {
    const db = getDb();
    const [season] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.slug, ADULT_OPEN_SEASON_SLUG))
      .limit(1);
    if (!season) throw new Error("adult open season not seeded — run npm run db:seed:e2e");
    seasonId = season.id;

    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .limit(1);
    orgId = org.id;

    const [self] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, SELF_EMAIL))
      .limit(1);
    selfUserId = self.id;

    // Make the assertion meaningful on a shared staging DB: start from a
    // clean slate for this (user, org) pair.
    await db.delete(userOrganizationAccess).where(and(
      eq(userOrganizationAccess.userId, selfUserId),
      eq(userOrganizationAccess.organizationId, orgId),
    ));

    cookie = await getAuthCookie(SELF_EMAIL, "TestParent123!");
  });

  afterAll(async () => {
    // Remove only the registration this run created (resumed = pre-existing).
    if (createdRegistrationId) {
      await getDb().delete(registrations).where(eq(registrations.id, createdRegistrationId));
    }
  });

  it("POST /api/registrations creates a user_organization_access row for the registrant", async () => {
    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        seasonId,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Adult Self",
      }),
    });
    expect([200, 201]).toContain(res.status);
    const body = await res.json();
    if (body.registration?.id && body.kind !== "resumed") {
      createdRegistrationId = body.registration.id;
    }

    const rows = await getDb()
      .select()
      .from(userOrganizationAccess)
      .where(and(
        eq(userOrganizationAccess.userId, selfUserId),
        eq(userOrganizationAccess.organizationId, orgId),
      ));
    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe("parent");
  });
});
```

Note for implementer: confirm the exact request body of `POST /api/registrations` for the self path against `tests/api/registrations-self.test.ts` (lines 75+) and adjust the payload/response-shape assertions to match — the membership assertion (uoa row exists) is the point of the test and must stay as written.

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/registrations-membership.test.ts`
Expected: FAIL on `expect(rows.length).toBe(1)` — got 0 (no grant exists yet).

- [ ] **Step 3: Implement — hoist org resolution and grant membership**

In `src/lib/registrations/create-registration.ts`:

3a. Add import:

```typescript
import { ensureCustomerOrgMembership } from "@/lib/organization/ensure-membership";
```

3b. Immediately after the `isRegistrationClosed` gate (after ~line 188), insert:

```typescript
  // Resolve the owning org once — used by the membership grant below and the
  // team-linkage / invitee lookups later.
  const [orgRow] = await db
    .select({ organizationId: locations.organizationId })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(seasons.id, seasonId));
  const organizationId = orgRow?.organizationId ?? null;

  // Any account that reaches a valid, open season is a customer of this org.
  // Membership drives the admin directory and the role-assignment gate.
  // Best-effort: a grant failure must never break registration.
  if (organizationId) {
    try {
      await ensureCustomerOrgMembership(db, user.id, organizationId);
    } catch (err) {
      console.error("[createRegistration] org membership grant failed:", err);
    }
  }
```

3c. In the waitlist branch (~lines 307-313), delete the local org lookup and use the hoisted value:

```typescript
      if (input.teamToken) {
        await linkRegistrationToTeam({
          db,
          teamToken: input.teamToken,
          registrationId: waitlisted.id,
          organizationId,
          user,
          registrantEmail: user.email,
        });
      }
```

3d. In the normal path (~lines 340-349), delete this block entirely (the hoisted `const organizationId` replaces it):

```typescript
  // Resolve the org once (used for both team-member linkage and invitee lookup).
  let organizationId: string | null = null;
  if (input.teamToken) {
    const [orgRow] = await db
      .select({ organizationId: locations.organizationId })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(eq(seasons.id, seasonId));
    organizationId = orgRow?.organizationId ?? null;
  }
```

- [ ] **Step 4: Run the new test and the neighboring registration suites**

Run: `TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/registrations-membership.test.ts tests/api/registrations-self.test.ts tests/api/registrations-early-bird.test.ts tests/api/registrations-closed-season.test.ts tests/api/team-linkage.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registrations/create-registration.ts tests/api/registrations-membership.test.ts
git commit -m "feat(registrations): grant org membership to organic registrants"
```

---

### Task 3: Grant membership on drop-in bookings

**Files:**
- Modify: `src/lib/dropin/booking.ts` (`createConfirmedBookingFreePath`, after its `insert(dropInBookings)`)
- Modify: `src/lib/stripe/handle-dropin-checkout-complete.ts` (after its `insert(dropInBookings)`)
- Modify: `src/lib/stripe/handle-dropin-walkup-payment.ts` (after its `insert(dropInBookings)`)
- Modify: `src/pages/api/kiosk/[locationSlug]/walkin/start.ts` (after its `insert(dropInBookings)`)
- Test: extend `tests/api/organization/ensure-membership.test.ts` is NOT enough — add an HTTP-level test to whichever existing drop-in suite exercises the free/self-serve booking path (`tests/api/dropin/` or `tests/api/pickup-add.test.ts`; pattern-match the fixture setup already used there).

**Interfaces:**
- Consumes: `ensureCustomerOrgMembership(db, userId, organizationId)` from Task 1.
- Produces: every drop-in booking insert site grants membership for the booking user in the session's org.

- [ ] **Step 1: Locate each `insert(dropInBookings)` call and identify the in-scope user id + session org id**

Run: `grep -n "insert(dropInBookings)" -B5 -A15 src/lib/dropin/booking.ts src/lib/stripe/handle-dropin-checkout-complete.ts src/lib/stripe/handle-dropin-walkup-payment.ts src/pages/api/kiosk/*/walkin/start.ts`
The session row (`dropInSessions`) carries `organizationId`; each insert site has the user id in scope (booking.userId). Walk-up-originated inserts that already went through `addWalkUpToPickup` (which writes uoa for new stub users) still get the call — it's idempotent.

- [ ] **Step 2: Write the failing HTTP test**

In the existing drop-in booking suite (implementer: follow that file's existing fixture setup for creating/finding an open session), add:

```typescript
it("booking a drop-in session grants org membership", async () => {
  // ...existing fixture: signed-in user cookie + open session id + session's orgId...
  // Pre-clean the (user, org) uoa pair as in tests/api/registrations-membership.test.ts.
  const res = await apiFetch(BOOKING_ENDPOINT, {
    method: "POST",
    cookie: userCookie,
    body: JSON.stringify(bookingPayload),
  });
  expect(res.ok).toBe(true);

  const rows = await getDb()
    .select()
    .from(userOrganizationAccess)
    .where(and(
      eq(userOrganizationAccess.userId, bookingUserId),
      eq(userOrganizationAccess.organizationId, sessionOrgId),
    ));
  expect(rows.length).toBe(1);
});
```

Run it; expected: FAIL with 0 rows.

- [ ] **Step 3: Add the grant at each insert site**

Identical pattern at all four sites, immediately after the booking insert (using each file's in-scope db handle, user id, and session org id):

```typescript
  // Booking a session makes this user a customer of the org (directory
  // visibility + role-assignment gate). Best-effort — never fail the booking.
  try {
    await ensureCustomerOrgMembership(db, userId, session.organizationId);
  } catch (err) {
    console.error("[dropin] org membership grant failed:", err);
  }
```

plus the import in each file:

```typescript
import { ensureCustomerOrgMembership } from "@/lib/organization/ensure-membership";
```

- [ ] **Step 4: Run the drop-in suites**

Run: `TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/dropin tests/api/pickup-add.test.ts tests/api/kiosk`
Expected: all PASS, including the new test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dropin/booking.ts src/lib/stripe/handle-dropin-checkout-complete.ts src/lib/stripe/handle-dropin-walkup-payment.ts "src/pages/api/kiosk/[locationSlug]/walkin/start.ts" tests/api/
git commit -m "feat(dropin): grant org membership on drop-in bookings"
```

---

### Task 4: Backfill migration for historical customers

**Files:**
- Create: `src/lib/db/migrations/0082_backfill_customer_org_membership.sql`
- Modify: `src/lib/db/migrations/meta/_journal.json` (append entry idx 82)

**Interfaces:**
- Produces: every historical organic customer (registration creators + drop-in bookers) has a uoa row in the org(s) they transacted with. Task 5's directory narrowing depends on this landing in the SAME PR (order of tasks within the deploy doesn't matter — migrations run before/independent of traffic shifting, and both changes ship atomically on merge).

- [ ] **Step 1: Verify snake_case column names against schema files**

Run: `grep -n "registered_by_user_id\|season_id\|program_id\|location_id\|organization_id\|user_id\|session_id" src/lib/db/schema/registrations.ts src/lib/db/schema/drop-in.ts | head -20`
Adjust the SQL below if any name differs.

- [ ] **Step 2: Write the migration**

```sql
-- 0082: Backfill org membership for organic customers.
-- user_organization_access is the source of truth for "customer of this org"
-- (admin directory + role-assignment gate), but self-signed-up customers never
-- got a row — only invite/hire/walk-up flows wrote one. Derive membership from
-- historical transactions. Idempotent: NOT EXISTS guards re-runs.

-- Season registrations: registrant -> season -> program -> location -> org
INSERT INTO "user_organization_access" ("user_id", "organization_id", "role", "accepted_at")
SELECT DISTINCT r."registered_by_user_id", l."organization_id", 'parent'::"org_access_role", now()
FROM "registrations" r
JOIN "seasons" s ON s."id" = r."season_id"
JOIN "programs" p ON p."id" = s."program_id"
JOIN "locations" l ON l."id" = p."location_id"
WHERE r."registered_by_user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "user_organization_access" uoa
    WHERE uoa."user_id" = r."registered_by_user_id"
      AND uoa."organization_id" = l."organization_id"
  );
--> statement-breakpoint
-- Drop-in bookings: booker -> session -> org
INSERT INTO "user_organization_access" ("user_id", "organization_id", "role", "accepted_at")
SELECT DISTINCT b."user_id", ds."organization_id", 'parent'::"org_access_role", now()
FROM "drop_in_bookings" b
JOIN "drop_in_sessions" ds ON ds."id" = b."session_id"
WHERE b."user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "user_organization_access" uoa
    WHERE uoa."user_id" = b."user_id"
      AND uoa."organization_id" = ds."organization_id"
  );
```

- [ ] **Step 3: Append the journal entry**

In `src/lib/db/migrations/meta/_journal.json`, append after the idx-81 entry (set `when` to the current epoch-milliseconds, e.g. from `date +%s000`):

```json
    {
      "idx": 82,
      "version": "7",
      "when": <epoch-ms>,
      "tag": "0082_backfill_customer_org_membership",
      "breakpoints": true
    }
```

Check precedent first: `ls src/lib/db/migrations/meta/ | tail -5` — if hand-named migrations 0079/0081 have snapshot files, confirm whether a data-only migration needs one (it should not; drizzle-kit diffs against the highest snapshot, and this migration changes no schema).

- [ ] **Step 4: Run the migration against staging and verify**

Run: `./scripts/with-bws.sh npm run db:migrate`
Expected: applies 0082 without error.

Verify with a query (psql or a quick tsx script via with-bws): seeded organic users (e.g. `adult-self@test.aspiresports.com` if it has historical registrations) now have uoa rows; count of parents without uoa rows who have registrations = 0:

```sql
SELECT count(*) FROM registrations r
JOIN seasons s ON s.id = r.season_id
JOIN programs p ON p.id = s.program_id
JOIN locations l ON l.id = p.location_id
WHERE r.registered_by_user_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM user_organization_access uoa
  WHERE uoa.user_id = r.registered_by_user_id AND uoa.organization_id = l.organization_id);
-- expect 0
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/migrations/0082_backfill_customer_org_membership.sql src/lib/db/migrations/meta/_journal.json
git commit -m "feat(db): backfill customer org membership from registrations and bookings"
```

---

### Task 5: Narrow the directory's global-scope branch to super_admins

**Files:**
- Modify: `src/pages/api/admin/users.ts:66-91` (the `orgUserRoles` query in GET)
- Test: `tests/api/admin/users-directory.test.ts` (new describe block)

**Interfaces:**
- Consumes: uoa rows from Tasks 2-4 (org-A organic parents stay visible via the access-row branch once the global branch stops carrying them).
- Produces: GET `/api/admin/users` includes global-scope role holders only when the role is `super_admin`.

- [ ] **Step 1: Write the failing test**

Append to `tests/api/admin/users-directory.test.ts`:

```typescript
describe("Users directory: tenant isolation for global-role holders", () => {
  const isoSuffix = Math.random().toString(36).slice(2, 10);
  const otherOrgParentEmail = `iso-otherorg-${isoSuffix}@test.example`;
  const sameOrgParentEmail = `iso-sameorg-${isoSuffix}@test.example`;
  let adminCookie: string;
  let otherOrgParentId: string;
  let sameOrgParentId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const db = getDb();

    const [orgA] = await db.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.slug, "aspire-sports")).limit(1);
    const [orgB] = await db.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.slug, "orgb")).limit(1);
    const [parentRole] = await db.select({ id: roles.id }).from(roles)
      .where(eq(roles.name, "parent")).limit(1);

    // Fixture 1: a parent whose only org tie is Org B, but who carries the
    // legacy GLOBAL-scoped parent role (the resolvePerson grant).
    const [u1] = await db.insert(users)
      .values({ email: otherOrgParentEmail, passwordHash: "x", firstName: "Iso", lastName: "OtherOrg" })
      .returning();
    otherOrgParentId = u1.id;
    await db.insert(userRoles).values({ userId: u1.id, roleId: parentRole.id, scopeType: "global" });
    await db.insert(userOrganizationAccess).values({
      userId: u1.id, organizationId: orgB.id, role: "parent", acceptedAt: new Date(),
    });

    // Fixture 2: same shape but the access row is in Org A.
    const [u2] = await db.insert(users)
      .values({ email: sameOrgParentEmail, passwordHash: "x", firstName: "Iso", lastName: "SameOrg" })
      .returning();
    sameOrgParentId = u2.id;
    await db.insert(userRoles).values({ userId: u2.id, roleId: parentRole.id, scopeType: "global" });
    await db.insert(userOrganizationAccess).values({
      userId: u2.id, organizationId: orgA.id, role: "parent", acceptedAt: new Date(),
    });
  });

  afterAll(async () => {
    // Deleting users cascades roles + access rows.
    await getDb().delete(users).where(inArray(users.id, [otherOrgParentId, sameOrgParentId]));
  });

  it("a global-parent-role holder from another org is NOT in this org's directory", async () => {
    const res = await apiFetch(`${ENDPOINT}?search=${encodeURIComponent(otherOrgParentEmail)}`, {
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.users.find((u: any) => u.email === otherOrgParentEmail)).toBeUndefined();
  });

  it("a global-parent-role holder WITH an org access row IS in the directory", async () => {
    const res = await apiFetch(`${ENDPOINT}?search=${encodeURIComponent(sameOrgParentEmail)}`, {
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.users.find((u: any) => u.email === sameOrgParentEmail)).toBeDefined();
  });

  it("super_admins (global scope, no access row) remain visible", async () => {
    const res = await apiFetch(`${ENDPOINT}?search=admin@test.aspiresports.com`, {
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.users.find((u: any) => u.email === "admin@test.aspiresports.com")).toBeDefined();
  });
});
```

Also extend the file's imports: `organizations`, `userOrganizationAccess` from `@/lib/db/schema/organizations`; `roles` from `@/lib/db/schema`.

- [ ] **Step 2: Run to verify the isolation test fails**

Run: `TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/admin/users-directory.test.ts`
Expected: "NOT in this org's directory" FAILS (the global branch currently sweeps the user in); the other two PASS.

- [ ] **Step 3: Narrow the query**

In `src/pages/api/admin/users.ts`, inside GET, add below the `teamIdsQ` subquery (~line 60):

```typescript
    const superAdminRoleIdsQ = db2
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "super_admin"));
```

and change the global branch of the `orgUserRoles` query (line ~77) from:

```typescript
            eq(userRoles.scopeType, "global"),
```

to:

```typescript
            // Global scope counts only for actual super_admins (platform
            // owners are visible in every org's view). Other global-scoped
            // roles — the legacy parent grant — must NOT leak users across
            // tenants; customers appear via their user_organization_access
            // row instead (granted at registration/booking + 0082 backfill).
            and(
              eq(userRoles.scopeType, "global"),
              inArray(userRoles.roleId, superAdminRoleIdsQ),
            ),
```

Update the stale comment above the query (`- global-scoped (super-admins are visible...)`) to match.

- [ ] **Step 4: Run the directory + tenant-scoping + users suites**

Run: `TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/admin/users-directory.test.ts tests/api/admin/users.test.ts tests/api/admin-tenant-scoping.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/users.ts tests/api/admin/users-directory.test.ts
git commit -m "fix(admin): stop global parent roles leaking users into every org directory"
```

---

### Task 6: Full verification + PR

- [ ] **Step 1: Re-seed and run the full API suite** — `npm run db:seed:e2e` (via with-bws), then `CRON_SECRET=<match dev server> TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npm run test:api`. Known pre-existing staging failures (see memory: 2 API) are acceptable if unrelated by file-overlap; anything touching registrations, dropin, kiosk, admin/users must be green.
- [ ] **Step 2: Build** — `./scripts/with-bws.sh npm run build`. Expect success.
- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Expect zero errors.
- [ ] **Step 4: E2E grep** — `grep -rn "admin/users\|registrations\|dropin\|walkin" tests/e2e/ | grep -v node_modules` — confirm no post-merge spec asserts directory contents or booking flows in a way the changes break; update any that do.
- [ ] **Step 5: Push branch, open PR** describing: membership model, the two write hooks, backfill, directory narrowing, and the deferred parent-role re-scoping. CI green before merge.

---

## Self-Review Notes

- Spec coverage: follow-up 1 = Tasks 1-4 (hooks + backfill); follow-up 2 = Task 5; both verified in Task 6. ✓
- The Task 2 payload and Task 3 booking-endpoint fixtures are marked for pattern-matching against existing suites at execution time; the assertions (uoa row exists / absent) are fully specified. ✓
- Type consistency: `ensureCustomerOrgMembership(db, userId, organizationId)` used identically in Tasks 2, 3. ✓
- Ordering: Task 5 must not merge without Tasks 2-4 (parents would vanish from their own directory); single PR enforces this. ✓
