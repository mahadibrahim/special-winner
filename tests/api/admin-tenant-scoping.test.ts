/**
 * Admin tenant-scoping isolation tests.
 *
 * Verifies that admin API endpoints enforce org ownership:
 *   - GET list endpoints return only the caller's org's data.
 *   - POST/PUT/DELETE endpoints reject cross-org resource IDs with 404.
 *   - organizations/index POST requires super_admin (location_admin gets 403).
 *   - conversations/[id]/reply derives senderType from real roles (no privilege
 *     escalation by a plain parent).
 *
 * Two orgs are needed:
 *   Org A ("aspire-sports") — seeded by seed-e2e-tests.ts, resolved as the
 *     default HQ org when requests hit localhost.
 *   Org B ("orgb")          — seeded by seed-e2e-tests.ts. Its resource IDs
 *     are discovered at test startup via the test-only endpoint
 *     GET /api/test/org-fixtures?slug=orgb (only enabled when
 *     E2E_TEST_ENDPOINTS=yes, i.e., the CI/test environment).
 *
 * Cross-tenant attack pattern tested here:
 *   Org A admin (super_admin) obtains Org B resource IDs, then submits them
 *   to Org A-scoped endpoints. Every write endpoint should return 404 (not
 *   found, hiding the existence of the cross-tenant resource). Every list
 *   endpoint should exclude Org B rows.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch, expectJson, testSlug } from "./setup/test-helpers";

// ---- Helpers ---------------------------------------------------------------

// Org A = default context when hitting localhost (HQ org)
function orgA(path: string, opts: RequestInit & { cookie?: string } = {}) {
  return apiFetch(path, opts);
}

// ---- State -----------------------------------------------------------------

let adminACookie: string; // super_admin, Org A context
let adminBCookie: string; // location_admin for Org B

// Org B resource IDs — fetched from /api/test/org-fixtures?slug=orgb
let orgBId: string;
let orgBSportId: string;
let orgBLocationId: string;
let orgBProgramId: string;
let orgBSeasonId: string;
let orgBVenueId: string;

// Org A resource IDs — fetched from standard admin endpoints
let orgASportId: string;
let orgALocationId: string;
let orgAProgramId: string;

beforeAll(async () => {
  // Sign in both admins
  [adminACookie, adminBCookie] = await Promise.all([
    getAuthCookie("admin@test.aspiresports.com", "TestAdmin123!"),
    getAuthCookie("admin-orgb@test.aspiresports.com", "TestAdmin123!"),
  ]);

  // Fetch Org B resource IDs via test-only fixture endpoint.
  // This endpoint is only enabled when E2E_TEST_ENDPOINTS=yes (CI/test env).
  const orgBFixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb", {
    method: "GET",
  });

  if (orgBFixtureRes.status !== 200) {
    throw new Error(
      `Could not load Org B fixtures (status ${orgBFixtureRes.status}). ` +
        "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
    );
  }

  const orgBFixtures = await orgBFixtureRes.json();
  orgBId = orgBFixtures.org.id;
  orgBSportId = orgBFixtures.sportId;
  orgBLocationId = orgBFixtures.locationId;
  orgBProgramId = orgBFixtures.programId;
  orgBSeasonId = orgBFixtures.seasonId;
  orgBVenueId = orgBFixtures.venueId;

  expect(orgBId).toBeTruthy();
  expect(orgBSportId).toBeTruthy();
  expect(orgBLocationId).toBeTruthy();
  expect(orgBProgramId).toBeTruthy();
  expect(orgBSeasonId).toBeTruthy();
  expect(orgBVenueId).toBeTruthy();

  // Fetch Org A resources via standard admin endpoints
  const [orgASportsRes, orgALocationsRes, orgAProgramsRes] = await Promise.all([
    orgA("/api/admin/sports", { method: "GET", cookie: adminACookie }),
    orgA("/api/admin/locations", { method: "GET", cookie: adminACookie }),
    orgA("/api/admin/programs", { method: "GET", cookie: adminACookie }),
  ]);
  const orgASports = (await orgASportsRes.json()).sports as any[];
  const orgALocations = (await orgALocationsRes.json()).locations as any[];
  const orgAPrograms = (await orgAProgramsRes.json()).programs as any[];

  expect(orgASports.length).toBeGreaterThan(0);
  expect(orgALocations.length).toBeGreaterThan(0);
  expect(orgAPrograms.length).toBeGreaterThan(0);

  orgASportId = orgASports[0].id;
  orgALocationId = orgALocations[0].id;
  orgAProgramId = orgAPrograms[0].id;
});

// ============================================================================
// 1. GET list isolation — admin sees only their own org's rows
// ============================================================================

describe("GET list scoping", () => {
  it("registrations: Org A admin sees no Org B data", async () => {
    const res = await orgA("/api/admin/registrations", {
      method: "GET",
      cookie: adminACookie,
    });
    const json = await expectJson(res, 200);
    // None of the registrations should reference a program from Org B
    const found = (json.registrations as any[]).find(
      (r) => r.program?.id === orgBProgramId,
    );
    expect(found).toBeUndefined();
  });

  it("payments: Org A admin sees no Org B payments", async () => {
    const res = await orgA("/api/admin/payments", {
      method: "GET",
      cookie: adminACookie,
    });
    const json = await expectJson(res, 200);
    const found = (json.payments as any[]).find(
      (p) => p.program?.id === orgBProgramId,
    );
    expect(found).toBeUndefined();
  });

  it("sports: Org A admin does not see Org B sports", async () => {
    const res = await orgA("/api/admin/sports", {
      method: "GET",
      cookie: adminACookie,
    });
    const json = await expectJson(res, 200);
    const ids = (json.sports as any[]).map((s: any) => s.id);
    expect(ids).not.toContain(orgBSportId);
  });

  it("programs: Org A admin does not see Org B programs", async () => {
    const res = await orgA("/api/admin/programs", {
      method: "GET",
      cookie: adminACookie,
    });
    const json = await expectJson(res, 200);
    const ids = (json.programs as any[]).map((p: any) => p.id);
    expect(ids).not.toContain(orgBProgramId);
  });

  it("venues: Org A admin does not see Org B venues", async () => {
    const res = await orgA("/api/admin/venues", {
      method: "GET",
      cookie: adminACookie,
    });
    const json = await expectJson(res, 200);
    const ids = (json.venues as any[]).map((v: any) => v.id);
    expect(ids).not.toContain(orgBVenueId);
  });

  it("seasons: Org A admin does not see Org B seasons", async () => {
    const res = await orgA("/api/admin/seasons?include_test=1", {
      method: "GET",
      cookie: adminACookie,
    });
    const json = await expectJson(res, 200);
    const ids = (json.seasons as any[]).map((s: any) => s.id);
    expect(ids).not.toContain(orgBSeasonId);
  });

  it("organizations list: super_admin sees all orgs; non-super_admin filtered", async () => {
    // super_admin can see all orgs (this is the correct behavior for org management)
    const superAdminRes = await orgA("/api/admin/organizations", {
      method: "GET",
      cookie: adminACookie,
    });
    const superAdminJson = await expectJson(superAdminRes, 200);
    const allIds = (superAdminJson.organizations as any[]).map((o: any) => o.id);
    // Super admin should see BOTH Org A and Org B
    expect(allIds).toContain(orgBId);

    // location_admin (adminBCookie) in this request context (Org A HQ) is NOT
    // a member of Org A — so they should see zero orgs in Org A's org list.
    // The endpoint filters by userOrganizationAccess for non-super_admins.
    const locAdminRes = await orgA("/api/admin/organizations", {
      method: "GET",
      cookie: adminBCookie,
    });
    const locAdminJson = await expectJson(locAdminRes, 200);
    const locAdminOrgIds = (locAdminJson.organizations as any[]).map((o: any) => o.id);
    // Org B admin should NOT see Org A via Org A's org list
    // (they have no userOrganizationAccess for Org A)
    expect(locAdminOrgIds).not.toContain(
      (superAdminJson.organizations as any[]).find((o: any) => o.slug === "aspire-sports")?.id,
    );
  });
});

// ============================================================================
// 2. Sports — cross-org write rejection (Org B sport ID via Org A context)
// ============================================================================

describe("sports: cross-org write rejection", () => {
  it("PUT with Org B sport id via Org A context → 404", async () => {
    const res = await orgA("/api/admin/sports", {
      method: "PUT",
      cookie: adminACookie,
      body: JSON.stringify({
        id: orgBSportId,
        name: "Hacked Sport Name",
        slug: testSlug("hacked-sport"),
        active: true,
        sortOrder: 0,
      }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });

  it("DELETE with Org B sport id via Org A context → 404", async () => {
    const res = await orgA(`/api/admin/sports?id=${orgBSportId}`, {
      method: "DELETE",
      cookie: adminACookie,
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });
});

// ============================================================================
// 3. Programs — cross-org write rejection
// ============================================================================

describe("programs: cross-org write rejection", () => {
  it("POST with Org B locationId via Org A context → 404", async () => {
    const res = await orgA("/api/admin/programs", {
      method: "POST",
      cookie: adminACookie,
      body: JSON.stringify({
        name: "Cross-Tenant Program",
        slug: testSlug("x-prog"),
        locationId: orgBLocationId,
        sportId: orgASportId,
        programType: "league",
        active: true,
      }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });

  it("PUT with Org B programId via Org A context → 404", async () => {
    const res = await orgA("/api/admin/programs", {
      method: "PUT",
      cookie: adminACookie,
      body: JSON.stringify({
        id: orgBProgramId,
        name: "Hacked Program",
        slug: testSlug("hacked-prog"),
        locationId: orgALocationId,
        sportId: orgASportId,
        programType: "league",
        active: true,
      }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });

  it("DELETE with Org B programId via Org A context → 404", async () => {
    const res = await orgA(`/api/admin/programs?id=${orgBProgramId}`, {
      method: "DELETE",
      cookie: adminACookie,
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });
});

// ============================================================================
// 4. Venues — cross-org write rejection
// ============================================================================

describe("venues: cross-org write rejection", () => {
  it("POST with Org B locationId via Org A context → 404", async () => {
    const res = await orgA("/api/admin/venues", {
      method: "POST",
      cookie: adminACookie,
      body: JSON.stringify({
        name: "Cross-Tenant Venue",
        locationId: orgBLocationId,
        fieldCount: 1,
        indoor: false,
        active: true,
      }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });

  it("PUT with Org B venueId via Org A context → 404", async () => {
    const res = await orgA("/api/admin/venues", {
      method: "PUT",
      cookie: adminACookie,
      body: JSON.stringify({
        id: orgBVenueId,
        name: "Hacked Venue",
        locationId: orgALocationId,
        fieldCount: 2,
        indoor: true,
        active: true,
      }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });

  it("DELETE with Org B venueId via Org A context → 404", async () => {
    const res = await orgA(`/api/admin/venues?id=${orgBVenueId}`, {
      method: "DELETE",
      cookie: adminACookie,
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });
});

// ============================================================================
// 5. Seasons — cross-org write rejection
// ============================================================================

describe("seasons: cross-org write rejection", () => {
  it("POST with Org B programId via Org A context → 404", async () => {
    const res = await orgA("/api/admin/seasons", {
      method: "POST",
      cookie: adminACookie,
      body: JSON.stringify({
        programId: orgBProgramId,
        name: "Cross-Tenant Season",
        slug: testSlug("x-season"),
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        priceCents: 10000,
        status: "draft",
      }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });

  it("PUT with Org B seasonId via Org A context → 404", async () => {
    const res = await orgA("/api/admin/seasons", {
      method: "PUT",
      cookie: adminACookie,
      body: JSON.stringify({
        id: orgBSeasonId,
        programId: orgAProgramId,
        name: "Hacked Season",
        slug: testSlug("hacked-season"),
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        priceCents: 0,
        status: "open",
      }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });

  it("DELETE with Org B seasonId via Org A context → 404", async () => {
    const res = await orgA(`/api/admin/seasons?id=${orgBSeasonId}`, {
      method: "DELETE",
      cookie: adminACookie,
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });
});

// ============================================================================
// 6. Walk-up registration — cross-org seasonId rejection
// ============================================================================

describe("walk-up-registration: cross-org seasonId rejection", () => {
  it("POST with Org B seasonId via Org A context → 404", async () => {
    const res = await orgA("/api/admin/walk-up-registration", {
      method: "POST",
      cookie: adminACookie,
      body: JSON.stringify({
        parent: {
          firstName: "Test",
          lastName: "Parent",
          email: "walkup-xorg@test.aspiresports.com",
          phone: "6145551234",
        },
        kid: {
          firstName: "Test",
          lastName: "Kid",
          birthDate: "2018-01-01",
          gender: "male",
        },
        seasonId: orgBSeasonId,
        paymentStatus: "unpaid",
        waiverSigned: false,
      }),
    });
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// 7. Re-registration campaign — cross-org seasonId rejection
// ============================================================================

describe("re-registration-campaign: cross-org seasonId rejection", () => {
  it("POST with Org B seasonId via Org A context → 404", async () => {
    const res = await orgA("/api/admin/re-registration-campaign", {
      method: "POST",
      cookie: adminACookie,
      body: JSON.stringify({
        seasonId: orgBSeasonId,
        dryRun: true,
      }),
    });
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// 8. Organizations — location_admin cannot create new orgs (403)
// ============================================================================

describe("organizations: role enforcement on POST", () => {
  it("location_admin POST → 403 (super_admin required)", async () => {
    // adminBCookie is a location_admin — should be denied
    const res = await orgA("/api/admin/organizations", {
      method: "POST",
      cookie: adminBCookie,
      body: JSON.stringify({
        name: "Sneaky New Org",
        slug: testSlug("sneaky-org"),
      }),
    });
    const json = await expectJson(res, 403);
    expect(json.error).toMatch(/super_admin/i);
  });

  it("super_admin POST → 201 (allowed)", async () => {
    const slug = testSlug("legit-test-org");
    const res = await orgA("/api/admin/organizations", {
      method: "POST",
      cookie: adminACookie,
      body: JSON.stringify({
        name: "Legit Test Org",
        slug,
        organizationType: "franchise",
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.organization).toBeDefined();
    expect(json.organization.slug).toBe(slug);
  });
});

// ============================================================================
// 9. Conversations reply — privilege escalation prevention
// ============================================================================

describe("conversation reply: role derivation", () => {
  it("unauthenticated reply → 401", async () => {
    const fakeConvId = "00000000-0000-0000-0000-000000000001";
    const res = await orgA(
      `/api/messaging/conversations/${fakeConvId}/reply`,
      {
        method: "POST",
        body: JSON.stringify({ body: "Hello" }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("parent user cannot reply (gets 403 or 404, never 200)", async () => {
    // Sign in as parent — they have parent role, NOT admin or coach
    const parentCookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!",
    );

    const fakeConvId = "00000000-0000-0000-0000-000000000002";
    const res = await orgA(
      `/api/messaging/conversations/${fakeConvId}/reply`,
      {
        method: "POST",
        cookie: parentCookie,
        body: JSON.stringify({ body: "Parent pretending to be admin" }),
      },
    );
    // Parent has no admin/coach role — should get 403 (no role) or 404
    // (conversation not found before role check). Never 200/201.
    expect([403, 404]).toContain(res.status);
  });
});

// ============================================================================
// 10. Same-org operations: legitimate flows still work (regression smoke)
// ============================================================================

describe("same-org operations: legitimate flows still work", () => {
  let createdSportId: string;

  it("Org A admin can create a sport (201)", async () => {
    const res = await orgA("/api/admin/sports", {
      method: "POST",
      cookie: adminACookie,
      body: JSON.stringify({
        name: "Tenant Scope Test Sport",
        slug: testSlug("ts-sport"),
        active: true,
        sortOrder: 99,
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.sport.id).toBeDefined();
    createdSportId = json.sport.id;
  });

  it("Org A admin can update their own sport (200)", async () => {
    const res = await orgA("/api/admin/sports", {
      method: "PUT",
      cookie: adminACookie,
      body: JSON.stringify({
        id: createdSportId,
        name: "Tenant Scope Test Sport Updated",
        slug: testSlug("ts-sport-upd"),
        active: true,
        sortOrder: 99,
      }),
    });
    const json = await expectJson(res, 200);
    expect(json.sport.name).toBe("Tenant Scope Test Sport Updated");
  });

  it("Org A admin can delete their own sport (200)", async () => {
    const res = await orgA(`/api/admin/sports?id=${createdSportId}`, {
      method: "DELETE",
      cookie: adminACookie,
    });
    const json = await expectJson(res, 200);
    expect(json.success).toBe(true);
  });
});
