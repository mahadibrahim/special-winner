/**
 * GET /api/admin/labor/gusto-export — hours + referee CSV flavors
 * (docs/superpowers/plans/2026-07-07-gusto-export.md, tasks 5-9).
 *
 * All fixtures self-seed via createAdminOrgGameContext (same helper
 * suspensions/referee tests use) so this suite works against both a
 * fresh CI seed and the accumulated staging DB. Each sub-suite uses a
 * unique far-future calendar date (deterministic per describe block, not
 * random) so repeated local runs and other suites never collide on the
 * (org, date-range) the endpoint scopes by — the endpoint is genuinely
 * org-wide for a super_admin, so any other fixture sharing the same date
 * would otherwise leak into these assertions.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  getCoachCookie,
  getParentCookie,
  getAuthCookie,
  apiFetch,
} from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { users, userRoles, roles } from "@/lib/db/schema/users";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { gameOfficials } from "@/lib/db/schema/teams";
import { organizations } from "@/lib/db/schema/organizations";
import { payrollExports } from "@/lib/db/schema/payroll";
import { hashPassword } from "@/lib/auth/password";
import { and, desc, eq } from "drizzle-orm";

const ENDPOINT = "/api/admin/labor/gusto-export";

function parseCsv(body: string): string[][] {
  return body
    .trim()
    .split("\n")
    .map((line) => line.split(","));
}

describe("GET /api/admin/labor/gusto-export", () => {
  let adminCookie: string;
  let coachCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    coachCookie = await getCoachCookie();
  });

  // ---- Auth + validation (task 5) ------------------------------------

  describe("auth + validation", () => {
    it("rejects unauthenticated requests (401)", async () => {
      const res = await apiFetch(`${ENDPOINT}?kind=hours&from=2026-01-01&to=2026-01-01`);
      expect(res.status).toBe(401);
    });

    it("rejects a coach (not admin) (403)", async () => {
      const res = await apiFetch(`${ENDPOINT}?kind=hours&from=2026-01-01&to=2026-01-01`, {
        cookie: coachCookie,
      });
      expect(res.status).toBe(403);
    });

    it("rejects a parent (403)", async () => {
      const parentCookie = await getParentCookie();
      const res = await apiFetch(`${ENDPOINT}?kind=hours&from=2026-01-01&to=2026-01-01`, {
        cookie: parentCookie,
      });
      expect(res.status).toBe(403);
    });

    it("400s on a missing/invalid kind", async () => {
      const res = await apiFetch(`${ENDPOINT}?from=2026-01-01&to=2026-01-01`, {
        cookie: adminCookie,
      });
      expect(res.status).toBe(400);

      const res2 = await apiFetch(`${ENDPOINT}?kind=bogus&from=2026-01-01&to=2026-01-01`, {
        cookie: adminCookie,
      });
      expect(res2.status).toBe(400);
    });

    it("400s on a missing/malformed from or to", async () => {
      const res = await apiFetch(`${ENDPOINT}?kind=hours&to=2026-01-01`, {
        cookie: adminCookie,
      });
      expect(res.status).toBe(400);

      const res2 = await apiFetch(`${ENDPOINT}?kind=hours&from=not-a-date&to=2026-01-01`, {
        cookie: adminCookie,
      });
      expect(res2.status).toBe(400);
    });

    it("400s when 'to' is before 'from'", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?kind=hours&from=2026-06-01&to=2026-01-01`,
        { cookie: adminCookie },
      );
      expect(res.status).toBe(400);
    });
  });

  // ---- Hours happy path (task 6) --------------------------------------

  describe("hours happy path", () => {
    const DATE = "2031-02-11";
    let fixtureUserId: string;
    let fixtureEmail: string;

    beforeAll(async () => {
      const db = getDb();
      const ctx = await createAdminOrgGameContext();
      const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      fixtureEmail = `gusto-hours-fixture-${stamp}@example.com`;

      const [fixtureUser] = await db
        .insert(users)
        .values({
          email: fixtureEmail,
          passwordHash: await hashPassword("NotLoggedInAs123!"),
          firstName: "HoursFixture",
          lastName: stamp,
          emailVerified: true,
        })
        .returning();
      fixtureUserId = fixtureUser.id;

      // 2 closed (non-flagged) + 1 closed-and-flagged + 1 open shift, all
      // on DATE, in mid-UTC-day hours so the local calendar day is DATE
      // regardless of the org's timezone offset.
      await db.insert(timeEntries).values([
        {
          organizationId: ctx.organizationId,
          userId: fixtureUserId,
          venueId: ctx.venueId,
          role: "coach",
          clockInAt: new Date(`${DATE}T15:00:00Z`),
          clockOutAt: new Date(`${DATE}T16:00:00Z`), // 1h
          flaggedOutOfRange: false,
        },
        {
          organizationId: ctx.organizationId,
          userId: fixtureUserId,
          venueId: ctx.venueId,
          role: "coach",
          clockInAt: new Date(`${DATE}T17:00:00Z`),
          clockOutAt: new Date(`${DATE}T18:30:00Z`), // 1.5h
          flaggedOutOfRange: false,
        },
        {
          organizationId: ctx.organizationId,
          userId: fixtureUserId,
          venueId: ctx.venueId,
          role: "coach",
          clockInAt: new Date(`${DATE}T19:00:00Z`),
          clockOutAt: new Date(`${DATE}T19:30:00Z`), // 0.5h, flagged
          flaggedOutOfRange: true,
          flagReason: "out_of_range",
        },
        {
          organizationId: ctx.organizationId,
          userId: fixtureUserId,
          venueId: ctx.venueId,
          role: "coach",
          clockInAt: new Date(`${DATE}T20:00:00Z`),
          clockOutAt: null, // still open
          flaggedOutOfRange: false,
        },
      ]);
    });

    afterAll(async () => {
      const db = getDb();
      await db.delete(timeEntries).where(eq(timeEntries.userId, fixtureUserId));
      await db.delete(users).where(eq(users.id, fixtureUserId));
    });

    it("sums closed (incl. flagged) shifts, excludes the open shift from the sum, and writes an audit row", async () => {
      const res = await apiFetch(`${ENDPOINT}?kind=hours&from=${DATE}&to=${DATE}`, {
        cookie: adminCookie,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toContain("gusto-hours");

      const body = await res.text();
      const rows = parseCsv(body);
      expect(rows[0]).toEqual([
        "employee_first_name",
        "employee_last_name",
        "employee_email",
        "role",
        "hours",
        "flagged_shift_count",
        "open_shift_count",
      ]);

      const fixtureRow = rows.find((r) => r[2] === fixtureEmail);
      expect(fixtureRow).toBeTruthy();
      expect(fixtureRow![3]).toBe("coach");
      expect(fixtureRow![4]).toBe("3"); // 1 + 1.5 + 0.5
      expect(fixtureRow![5]).toBe("1"); // flagged_shift_count
      expect(fixtureRow![6]).toBe("1"); // open_shift_count

      const db = getDb();
      const [auditRow] = await db
        .select()
        .from(payrollExports)
        .where(eq(payrollExports.kind, "hours"))
        .orderBy(desc(payrollExports.createdAt))
        .limit(1);
      expect(auditRow).toBeTruthy();
      expect(auditRow.rowCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ---- Referee happy path (task 7) ------------------------------------

  describe("referee happy path", () => {
    const DATE = "2031-03-15";
    let unpaidRefEmail: string;
    let paidRefEmail: string;

    beforeAll(async () => {
      const db = getDb();
      const ctx = await createAdminOrgGameContext({
        scheduledAt: new Date(`${DATE}T18:00:00Z`),
      });

      const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      unpaidRefEmail = `gusto-ref-unpaid-${stamp}@example.com`;
      paidRefEmail = `gusto-ref-paid-${stamp}@example.com`;

      const [unpaidRef] = await db
        .insert(users)
        .values({
          email: unpaidRefEmail,
          passwordHash: await hashPassword("NotLoggedInAs123!"),
          firstName: "Unpaid",
          lastName: `Ref${stamp}`,
          emailVerified: true,
        })
        .returning();
      const [paidRef] = await db
        .insert(users)
        .values({
          email: paidRefEmail,
          passwordHash: await hashPassword("NotLoggedInAs123!"),
          firstName: "Paid",
          lastName: `Ref${stamp}`,
          emailVerified: true,
        })
        .returning();

      await db.insert(gameOfficials).values([
        {
          gameId: ctx.gameId,
          userId: unpaidRef.id,
          feeCents: 5000,
          paymentStatus: "unpaid",
        },
        {
          gameId: ctx.gameId,
          userId: paidRef.id,
          feeCents: 3000,
          paymentStatus: "paid",
        },
      ]);
    });

    it("defaults to unpaid-only, one line per match, with the real team matchup and dollar fee", async () => {
      const res = await apiFetch(`${ENDPOINT}?kind=referee&from=${DATE}&to=${DATE}`, {
        cookie: adminCookie,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toContain("gusto-referee-fees");

      const body = await res.text();
      const rows = parseCsv(body);
      expect(rows[0]).toEqual([
        "referee_first_name",
        "referee_last_name",
        "referee_email",
        "game_date",
        "matchup",
        "fee_dollars",
        "payment_status",
      ]);

      const unpaidRow = rows.find((r) => r[2] === unpaidRefEmail);
      const paidRow = rows.find((r) => r[2] === paidRefEmail);
      expect(unpaidRow).toBeTruthy();
      expect(paidRow).toBeUndefined(); // excluded by default

      expect(unpaidRow![5]).toBe("50.00");
      expect(unpaidRow![6]).toBe("unpaid");
      expect(unpaidRow![4]).toContain(" vs ");
      expect(unpaidRow![4]).not.toContain("TBD"); // real team names, both sides set

      const db = getDb();
      const [auditRow] = await db
        .select()
        .from(payrollExports)
        .where(eq(payrollExports.kind, "referee_fees"))
        .orderBy(desc(payrollExports.createdAt))
        .limit(1);
      expect(auditRow).toBeTruthy();
    });

    it("includePaid=1 includes the already-paid row too", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?kind=referee&from=${DATE}&to=${DATE}&includePaid=1`,
        { cookie: adminCookie },
      );
      const body = await res.text();
      const rows = parseCsv(body);
      const unpaidRow = rows.find((r) => r[2] === unpaidRefEmail);
      const paidRow = rows.find((r) => r[2] === paidRefEmail);
      expect(unpaidRow).toBeTruthy();
      expect(paidRow).toBeTruthy();
      expect(paidRow![5]).toBe("30.00");
      expect(paidRow![6]).toBe("paid");
    });
  });

  // ---- Empty period, graceful (task 8) --------------------------------

  describe("empty period (graceful)", () => {
    it("hours: 200 header-only CSV for a period with no matching time_entries", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?kind=hours&from=2099-01-01&to=2099-01-02`,
        { cookie: adminCookie },
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(parseCsv(body)).toHaveLength(1); // header only

      const db = getDb();
      const [auditRow] = await db
        .select()
        .from(payrollExports)
        .where(eq(payrollExports.kind, "hours"))
        .orderBy(desc(payrollExports.createdAt))
        .limit(1);
      expect(auditRow).toBeTruthy();
    });

    it("referee: 200 header-only CSV for a period with no matching games", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?kind=referee&from=2099-01-01&to=2099-01-02`,
        { cookie: adminCookie },
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(parseCsv(body)).toHaveLength(1); // header only
    });
  });

  // ---- location_admin scoping (task 9) ---------------------------------
  //
  // isAdminForOrg only lets a location_admin pass auth when their userRoles
  // row is org-scoped (scopeType='organization') — see src/lib/auth/roles.ts.
  // getLocationIdsForUser then expands that org-scoped row to every
  // location in the org, so a location_admin who legitimately clears the
  // admin gate always sees the full org (same breadth as super_admin,
  // narrower only in that it can never cross an org boundary). There is no
  // fixture in this codebase for a location_admin scoped to a strict
  // subset of one org's locations (confirmed: seed-e2e-tests.ts only ever
  // inserts scopeType='organization' for the location_admin role). This
  // test therefore exercises the real, reachable code path: a location_admin
  // gets 200 (not 403) and sees the same-org fixture data a super_admin
  // would, proving the getLocationIdsForUser branch doesn't wrongly
  // exclude legitimate in-org rows.
  describe("location_admin scoping", () => {
    const DATE = "2031-04-20";
    let locationAdminCookie: string;
    let fixtureUserId: string;
    let fixtureEmail: string;
    let seededRoleUserId: string;

    beforeAll(async () => {
      const db = getDb();
      const ctx = await createAdminOrgGameContext();

      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, "aspire-sports"))
        .orderBy(desc(organizations.createdAt))
        .limit(1);
      if (!org) throw new Error("e2e seed invariant violated: org 'aspire-sports' not found");

      const [locationAdminRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, "location_admin"))
        .limit(1);
      if (!locationAdminRole) {
        throw new Error("e2e seed invariant violated: 'location_admin' role not found");
      }

      const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const locationAdminEmail = `gusto-location-admin-${stamp}@example.com`;
      const locationAdminPassword = "GustoLocationAdmin123!";
      const [locationAdminUser] = await db
        .insert(users)
        .values({
          email: locationAdminEmail,
          passwordHash: await hashPassword(locationAdminPassword),
          firstName: "GustoLocationAdmin",
          lastName: stamp,
          emailVerified: true,
        })
        .returning();
      seededRoleUserId = locationAdminUser.id;

      await db.insert(userRoles).values({
        userId: locationAdminUser.id,
        roleId: locationAdminRole.id,
        scopeType: "organization",
        scopeId: org.id,
      });

      locationAdminCookie = await getAuthCookie(locationAdminEmail, locationAdminPassword);

      const fixtureStamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      fixtureEmail = `gusto-loc-scope-fixture-${fixtureStamp}@example.com`;
      const [fixtureUser] = await db
        .insert(users)
        .values({
          email: fixtureEmail,
          passwordHash: await hashPassword("NotLoggedInAs123!"),
          firstName: "LocScopeFixture",
          lastName: fixtureStamp,
          emailVerified: true,
        })
        .returning();
      fixtureUserId = fixtureUser.id;

      await db.insert(timeEntries).values({
        organizationId: ctx.organizationId,
        userId: fixtureUserId,
        venueId: ctx.venueId,
        role: "venue_manager",
        clockInAt: new Date(`${DATE}T15:00:00Z`),
        clockOutAt: new Date(`${DATE}T16:00:00Z`),
        flaggedOutOfRange: false,
      });
    });

    afterAll(async () => {
      const db = getDb();
      await db.delete(timeEntries).where(eq(timeEntries.userId, fixtureUserId));
      await db.delete(users).where(eq(users.id, fixtureUserId));
      await db.delete(userRoles).where(eq(userRoles.userId, seededRoleUserId));
      await db.delete(users).where(eq(users.id, seededRoleUserId));
    });

    it("a location_admin gets 200 (not 403) and sees the same-org fixture row", async () => {
      const res = await apiFetch(`${ENDPOINT}?kind=hours&from=${DATE}&to=${DATE}`, {
        cookie: locationAdminCookie,
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      const rows = parseCsv(body);
      const fixtureRow = rows.find((r) => r[2] === fixtureEmail);
      expect(fixtureRow).toBeTruthy();
      expect(fixtureRow![3]).toBe("venue_manager");
      expect(fixtureRow![4]).toBe("1");
    });
  });
});
