/**
 * Cross-org venue reference tests for programs.
 *
 * Tests the full surface introduced in the cross-org venue feature:
 *   1. GET /api/admin/venues?scope=all — super_admin sees all orgs' venues
 *   2. GET /api/admin/venues?scope=all — location_admin gets 403
 *   3. Super-admin can create a program with a venue_id from another org
 *   4. Location-admin cannot use a cross-org venue_id (gets 404)
 *
 * Relies on Org B fixture data (seeded by seed-e2e-tests.ts):
 *   GET /api/test/org-fixtures?slug=orgb  (only enabled when DISABLE_RATE_LIMIT=1)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAuthCookie,
  getAdminCookie,
  apiFetch,
  expectJson,
  testSlug,
  resetCookies,
} from "../setup/test-helpers";

// ---- State -----------------------------------------------------------------

let superAdminCookie: string; // Org A super_admin
let locationAdminCookie: string; // Org B location_admin

// Org B resource IDs
let orgBVenueId: string;

// Org A resource IDs (needed to create a valid program)
let orgALocationId: string;
let orgASportId: string;

// Track programs created during tests so we can clean up
const createdProgramIds: string[] = [];

// ---- Setup -----------------------------------------------------------------

beforeAll(async () => {
  [superAdminCookie, locationAdminCookie] = await Promise.all([
    getAdminCookie(), // admin@test.aspiresports.com — super_admin
    getAuthCookie("admin-orgb@test.aspiresports.com", "TestAdmin123!"),
  ]);

  // Fetch Org B fixtures
  const orgBFixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
  if (orgBFixtureRes.status !== 200) {
    throw new Error(
      `Could not load Org B fixtures (status ${orgBFixtureRes.status}). ` +
        "Ensure DISABLE_RATE_LIMIT=1 is set and the e2e seed has been run.",
    );
  }
  const orgBFixtures = await orgBFixtureRes.json();
  orgBVenueId = orgBFixtures.venueId;
  expect(orgBVenueId).toBeTruthy();

  // Fetch Org A resources
  const [sportsRes, locationsRes] = await Promise.all([
    apiFetch("/api/admin/sports", { method: "GET", cookie: superAdminCookie }),
    apiFetch("/api/admin/locations", { method: "GET", cookie: superAdminCookie }),
  ]);
  const { sports } = await sportsRes.json();
  const { locations } = await locationsRes.json();
  expect(sports.length).toBeGreaterThan(0);
  expect(locations.length).toBeGreaterThan(0);
  orgASportId = sports[0].id;
  orgALocationId = locations[0].id;
});

afterAll(async () => {
  // Best-effort cleanup: delete any programs created during tests
  for (const id of createdProgramIds) {
    await apiFetch(`/api/admin/programs?id=${id}`, {
      method: "DELETE",
      cookie: superAdminCookie,
    }).catch(() => null);
  }
  resetCookies();
});

// ============================================================================
// 1. GET /api/admin/venues?scope=all
// ============================================================================

describe("GET /api/admin/venues?scope=all — super_admin sees cross-org venues", () => {
  it("returns 200 with venues from all orgs (including Org B)", async () => {
    const res = await apiFetch("/api/admin/venues?scope=all", {
      method: "GET",
      cookie: superAdminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.venues)).toBe(true);
    expect(json.venues.length).toBeGreaterThan(0);

    // Each venue should have organizationName and organizationSlug
    for (const v of json.venues) {
      expect(v.organizationName).toBeTruthy();
      expect(v.organizationSlug).toBeTruthy();
    }

    // Org B venue must appear
    const found = json.venues.find((v: any) => v.id === orgBVenueId);
    expect(found).toBeDefined();
    expect(found.organizationName).toBeTruthy();
  });

  it("includes venues from multiple different organizations", async () => {
    const res = await apiFetch("/api/admin/venues?scope=all", {
      method: "GET",
      cookie: superAdminCookie,
    });
    const json = await expectJson(res, 200);
    const orgSlugs = new Set((json.venues as any[]).map((v: any) => v.organizationSlug));
    // There should be at least 2 orgs (Org A + Org B from the seed)
    expect(orgSlugs.size).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// 2. GET /api/admin/venues?scope=all — location_admin gets 403
// ============================================================================

describe("GET /api/admin/venues?scope=all — location_admin is denied", () => {
  it("returns 403 for a location_admin user", async () => {
    const res = await apiFetch("/api/admin/venues?scope=all", {
      method: "GET",
      cookie: locationAdminCookie,
    });
    const json = await expectJson(res, 403);
    expect(json.error).toMatch(/super_admin/i);
  });

  it("location_admin can still list venues (no scope param) — no organizationName in response", async () => {
    const res = await apiFetch("/api/admin/venues", {
      method: "GET",
      cookie: locationAdminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.venues)).toBe(true);
    // Default (same-org) response should NOT include organizationName/Slug
    for (const v of json.venues as any[]) {
      expect(v.organizationName).toBeUndefined();
      expect(v.organizationSlug).toBeUndefined();
    }
  });
});

// ============================================================================
// 3. Super-admin creates a program with a cross-org venue_id
// ============================================================================

describe("POST /api/admin/programs — super_admin with cross-org venueId", () => {
  it("creates a program with Org B's venueId (201)", async () => {
    const slug = testSlug("xorg-venue-prog");
    const res = await apiFetch("/api/admin/programs", {
      method: "POST",
      cookie: superAdminCookie,
      body: JSON.stringify({
        name: "Cross-Org Venue Program",
        slug,
        locationId: orgALocationId,
        sportId: orgASportId,
        venueId: orgBVenueId,
        programType: "league",
        active: true,
      }),
    });

    const json = await expectJson(res, 201);
    expect(json.program).toBeDefined();
    expect(json.program.venueId).toBe(orgBVenueId);
    createdProgramIds.push(json.program.id);
  });

  it("creates a program with no venueId (null) and it persists as null (201)", async () => {
    const slug = testSlug("no-venue-prog");
    const res = await apiFetch("/api/admin/programs", {
      method: "POST",
      cookie: superAdminCookie,
      body: JSON.stringify({
        name: "No Venue Program",
        slug,
        locationId: orgALocationId,
        sportId: orgASportId,
        venueId: null,
        programType: "camp",
        active: true,
      }),
    });

    const json = await expectJson(res, 201);
    expect(json.program).toBeDefined();
    expect(json.program.venueId).toBeNull();
    createdProgramIds.push(json.program.id);
  });

  it("GET list returns the program with the cross-org venue attached", async () => {
    // Find the program we just created by checking venueId
    const res = await apiFetch("/api/admin/programs", {
      method: "GET",
      cookie: superAdminCookie,
    });
    const json = await expectJson(res, 200);
    const withVenue = (json.programs as any[]).find((p: any) => p.venueId === orgBVenueId);
    expect(withVenue).toBeDefined();
    expect(withVenue.venue).toBeDefined();
    expect(withVenue.venue.id).toBe(orgBVenueId);
  });
});

// ============================================================================
// 4. Location-admin cannot use a cross-org venueId
// ============================================================================

describe("POST /api/admin/programs — location_admin blocked from cross-org venueId", () => {
  it("returns 404 when location_admin submits a venueId from another org", async () => {
    // The admin-orgb user on localhost resolves to Org A's org context.
    // Org A location + Org A sport + Org B venueId → venueId ownership check
    // against Org A fails → 404.
    const res = await apiFetch("/api/admin/programs", {
      method: "POST",
      cookie: locationAdminCookie,
      body: JSON.stringify({
        name: "Sneaky Cross-Org Venue Program",
        slug: testSlug("sneaky-xorg"),
        locationId: orgALocationId,
        sportId: orgASportId,
        venueId: orgBVenueId,  // Org B venue, but caller is in Org A context
        programType: "league",
        active: true,
      }),
    });

    // The cross-org venue fails the same-org ownership check → 404
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });
});
