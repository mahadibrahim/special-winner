import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";

const LIST_ENDPOINT = "/api/public/seasons";

describe("Public Seasons API", () => {
  // ---- GET /api/public/seasons ----

  describe("GET /api/public/seasons", () => {
    it("returns seasons array without auth (200)", async () => {
      const res = await apiFetch(LIST_ENDPOINT, { method: "GET" });

      const json = await expectJson(res, 200);
      expect(json.seasons).toBeDefined();
      expect(Array.isArray(json.seasons)).toBe(true);
    });

    it("filters by status=open — all returned seasons have status open", async () => {
      const res = await apiFetch(`${LIST_ENDPOINT}?status=open`, {
        method: "GET",
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.seasons)).toBe(true);

      for (const season of json.seasons) {
        expect(season.status).toBe("open");
      }
    });

    it("returns season data with sport, location, and price fields", async () => {
      const res = await apiFetch(LIST_ENDPOINT, { method: "GET" });

      const json = await expectJson(res, 200);
      expect(json.seasons.length).toBeGreaterThan(0);

      const season = json.seasons[0];
      // Core fields
      expect(season.id).toBeDefined();
      expect(season.name).toBeDefined();
      expect(typeof season.price).toBe("number");

      // Nested sport object
      expect(season.sport).toBeDefined();
      expect(season.sport.id).toBeDefined();
      expect(season.sport.name).toBeDefined();

      // Nested location object
      expect(season.location).toBeDefined();
      expect(season.location.id).toBeDefined();
      expect(season.location.name).toBeDefined();
    });
  });

  // ---- GET /api/public/seasons/:id ----

  describe("GET /api/public/seasons/:id", () => {
    it("returns a single season by valid ID (200)", async () => {
      // First get a season from the list
      const listRes = await apiFetch(LIST_ENDPOINT, { method: "GET" });
      const listJson = await expectJson(listRes, 200);
      expect(listJson.seasons.length).toBeGreaterThan(0);

      const seasonId = listJson.seasons[0].id;

      // Fetch the individual season
      const res = await apiFetch(`${LIST_ENDPOINT}/${seasonId}`, {
        method: "GET",
      });

      const json = await expectJson(res, 200);
      expect(json.season).toBeDefined();
      expect(json.season.id).toBe(seasonId);
      expect(json.season.name).toBeDefined();
      expect(typeof json.season.price).toBe("number");
      expect(json.season.spotsLeft).toBeDefined();
      expect(json.season.sport).toBeDefined();
      expect(json.season.location).toBeDefined();
    });

    it("returns 404 for invalid UUID", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      const res = await apiFetch(`${LIST_ENDPOINT}/${fakeId}`, {
        method: "GET",
      });

      const json = await expectJson(res, 404);
      expect(json.error).toBeDefined();
    });
  });
});
