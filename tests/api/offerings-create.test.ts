/**
 * POST /api/admin/offerings — combined program + season create.
 *
 * Follows the auth + seed-discovery pattern from tests/api/admin/programs.test.ts:
 *   - Sign in as the seeded Org A admin via getAdminCookie().
 *   - Discover a valid locationId/sportId by querying the admin list endpoints.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
} from "./setup/test-helpers";

let adminCookie: string;
let locationId: string;
let sportId: string;

beforeAll(async () => {
  adminCookie = await getAdminCookie();

  const [locationsRes, sportsRes] = await Promise.all([
    apiFetch("/api/admin/locations", { method: "GET", cookie: adminCookie }),
    apiFetch("/api/admin/sports", { method: "GET", cookie: adminCookie }),
  ]);

  const locationsJson = await locationsRes.json();
  const sportsJson = await sportsRes.json();

  expect(locationsJson.locations.length).toBeGreaterThan(0);
  expect(sportsJson.sports.length).toBeGreaterThan(0);

  locationId = locationsJson.locations[0].id;
  sportId = sportsJson.sports[0].id;
});

describe("POST /api/admin/offerings", () => {
  it("creates a published camp program + season in one call", async () => {
    const suffix = Date.now();
    const res = await apiFetch("/api/admin/offerings", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        programType: "camp",
        locationId,
        sportId,
        name: "Test Summer Camp",
        slug: `test-summer-camp-${suffix}`,
        season: {
          name: "Test Camp Week 1",
          slug: `test-camp-wk1-${suffix}`,
          startDate: "2026-07-06",
          endDate: "2026-07-10",
          priceCents: 37500,
          halfDayPriceCents: 20000,
          minAge: 5,
          maxAge: 12,
          status: "open",
        },
      }),
    });

    const body = await expectJson(res, 201);
    expect(body.program.id).toBeTruthy();
    expect(body.season.id).toBeTruthy();
    expect(body.season.status).toBe("open");
  });

  it("returns 400 when season validation fails (endDate before startDate age check)", async () => {
    const suffix = Date.now();
    const res = await apiFetch("/api/admin/offerings", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        programType: "camp",
        locationId,
        sportId,
        name: "Bad Camp",
        slug: `bad-camp-${suffix}`,
        season: {
          name: "Bad Season",
          slug: `bad-season-${suffix}`,
          startDate: "2026-07-06",
          endDate: "2026-07-10",
          priceCents: 10000,
          minAge: 12,
          maxAge: 5, // maxAge < minAge — should fail the refine
          status: "draft",
        },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when top-level fields are missing", async () => {
    const res = await apiFetch("/api/admin/offerings", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        // missing programType, locationId, sportId
        name: "Incomplete",
        slug: "incomplete",
        season: {},
      }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated request with 401", async () => {
    const res = await apiFetch("/api/admin/offerings", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });
});
