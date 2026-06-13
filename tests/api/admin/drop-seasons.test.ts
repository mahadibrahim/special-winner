import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  testSlug,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/drop-seasons";

describe("Admin Drop Seasons API", () => {
  let adminCookie: string;
  let createdSeasonId: string;
  const slug = testSlug("drop-season");

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- Auth ----

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated GET (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        // no cookie
      });

      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          division: "mens",
          name: "Test Drop Mon",
          slug: testSlug("unauthed"),
          startDate: "2026-09-14",
          endDate: "2026-12-14",
          status: "draft",
        }),
        // no cookie
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- POST (Create) ----

  describe("POST - Create drop season", () => {
    it("creates a mens drop season with draft status (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          division: "mens",
          name: "Test Drop Mon",
          slug,
          startDate: "2026-09-14",
          endDate: "2026-12-14",
          status: "draft",
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.season).toBeDefined();
      expect(json.season.name).toBe("Test Drop Mon");
      expect(json.season.slug).toBe(slug);
      expect(json.season.division).toBe("mens");
      expect(json.season.startDate).toBe("2026-09-14");
      expect(json.season.endDate).toBe("2026-12-14");
      expect(json.season.status).toBe("draft");
      expect(json.season.id).toBeDefined();
      // sessionDay defaults to 1 (Monday) for mens when not supplied
      expect(json.season.sessionDay).toBe(1);

      createdSeasonId = json.season.id;
    });

    it("defaults sessionDay to 3 (Wednesday) for womens division (201)", async () => {
      const wSlug = testSlug("drop-womens");
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          division: "womens",
          name: "Test Drop Wed",
          slug: wSlug,
          startDate: "2026-09-16",
          endDate: "2026-12-16",
          status: "draft",
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.season.division).toBe("womens");
      expect(json.season.sessionDay).toBe(3);
    });

    it("rejects invalid division (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          division: "mixed", // invalid
          name: "Bad Division",
          slug: testSlug("bad-div"),
          startDate: "2026-09-14",
          endDate: "2026-12-14",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects duplicate slug within the same org (409)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          division: "mens",
          name: "Duplicate Slug",
          slug, // same slug as the created season above
          startDate: "2026-09-14",
          endDate: "2026-12-14",
          status: "draft",
        }),
      });

      expect(res.status).toBe(409);
    });
  });

  // ---- GET (List) ----

  describe("GET - List drop seasons", () => {
    it("returns array of seasons including the test one, with playerCount (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.seasons)).toBe(true);

      const found = json.seasons.find((s: any) => s.id === createdSeasonId);
      expect(found).toBeDefined();
      expect(found.name).toBe("Test Drop Mon");
      expect(found.slug).toBe(slug);
      expect(found.division).toBe("mens");
      // playerCount must be present and numeric
      expect(typeof found.playerCount).toBe("number");
      expect(found.playerCount).toBe(0);
    });
  });
});
