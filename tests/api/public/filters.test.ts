import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";

/**
 * Tenant-isolation tests for GET /api/public/filters.
 *
 * Node.js fetch silently drops the Host header (it is a "forbidden header"
 * per the Fetch spec) so we cannot switch tenant context by header override in
 * integration tests. Instead we verify isolation by checking that Org A's
 * default-host response contains none of Org B's resource IDs or slugs, which
 * is the meaningful cross-tenant leak assertion.
 *
 * Org A ("aspire-sports") — seeded with an open/active soccer season that
 *   surfaces in public filters. Resolved as the default org on localhost.
 * Org B ("orgb")          — seeded with a draft basketball season. Because
 *   public filters only surfaces open/active seasons, Org B returns empty
 *   arrays when resolved — but Org B's sport/location IDs must not appear
 *   in Org A's response either.
 */
describe("GET /api/public/filters — tenant scoping", () => {
  let orgBSportSlug: string;
  let orgBLocationSlug: string;
  let orgBSportId: string;
  let orgBLocationId: string;

  beforeAll(async () => {
    const fixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
    const fixture = await fixtureRes.json();
    orgBSportSlug = fixture.sportSlug ?? "basketball";
    orgBLocationSlug = fixture.locationSlug ?? "orgb-hq";
    orgBSportId = fixture.sportId;
    orgBLocationId = fixture.locationId;
  });

  it("returns only Org A's sports and locations when called on the default host", async () => {
    const res = await apiFetch("/api/public/filters");
    const body = await expectJson(res, 200);
    const sportSlugs = body.sports.map((s: any) => s.slug);
    const sportIds = body.sports.map((s: any) => s.id);
    const locationSlugs = body.locations.map((l: any) => l.slug);
    const locationIds = body.locations.map((l: any) => l.id);

    // Org A's response must not include Org B's sport or location (by slug or ID)
    expect(sportSlugs).not.toContain(orgBSportSlug);
    expect(sportIds).not.toContain(orgBSportId);
    expect(locationSlugs).not.toContain(orgBLocationSlug);
    expect(locationIds).not.toContain(orgBLocationId);

    // Org A does have soccer — verify it's present (confirms the endpoint is
    // actually returning data, not silently emptying everything)
    expect(sportSlugs).toContain("soccer");
  });

  it("returns well-formed response (sports + locations arrays, status 200)", async () => {
    // Note: Node.js fetch drops the Host header (Fetch spec forbidden header),
    // so Host-based tenant switching is not testable in integration tests.
    // Cross-tenant isolation is verified above via ID/slug exclusion on Org A.
    const res = await apiFetch("/api/public/filters");
    const body = await expectJson(res, 200);
    expect(Array.isArray(body.sports)).toBe(true);
    expect(Array.isArray(body.locations)).toBe(true);

    // Each sport has required fields
    for (const sport of body.sports) {
      expect(sport).toHaveProperty("id");
      expect(sport).toHaveProperty("slug");
      expect(sport).toHaveProperty("name");
    }
    // Each location has required fields
    for (const location of body.locations) {
      expect(location).toHaveProperty("id");
      expect(location).toHaveProperty("slug");
      expect(location).toHaveProperty("name");
    }
  });

  it("returns 200 with arrays on any host (fail-soft shape)", async () => {
    // Even on an unknown host, the endpoint must return 200 with arrays.
    // Node.js drops the Host header so this effectively tests the default org.
    const res = await apiFetch("/api/public/filters");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.sports)).toBe(true);
    expect(Array.isArray(body.locations)).toBe(true);
  });
});
