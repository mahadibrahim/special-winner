import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  testSlug,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/locations";

describe("Admin Locations CRUD API", () => {
  let adminCookie: string;
  let createdLocationId: string;
  const slug = testSlug("loc");

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- POST (Create) ----

  describe("POST - Create location", () => {
    it("creates a location with valid data (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: "Test Location",
          slug,
          city: "Columbus",
          state: "OH",
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.location).toBeDefined();
      expect(json.location.name).toBe("Test Location");
      expect(json.location.slug).toBe(slug);
      expect(json.location.city).toBe("Columbus");
      expect(json.location.state).toBe("OH");
      expect(json.location.id).toBeDefined();

      createdLocationId = json.location.id;
    });
  });

  // ---- GET (List) ----

  describe("GET - List locations", () => {
    it("returns array of locations including the created one (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.locations)).toBe(true);

      const found = json.locations.find(
        (l: any) => l.id === createdLocationId
      );
      expect(found).toBeDefined();
      expect(found.name).toBe("Test Location");
      expect(found.slug).toBe(slug);
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        // no cookie
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- PUT (Update) ----

  describe("PUT - Update location", () => {
    it("updates location city (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: createdLocationId,
          name: "Test Location",
          slug,
          city: "Powell",
          state: "OH",
        }),
      });

      const json = await expectJson(res, 200);
      expect(json.location).toBeDefined();
      expect(json.location.city).toBe("Powell");
      expect(json.location.id).toBe(createdLocationId);
    });
  });

  // ---- DELETE ----

  describe("DELETE - Delete location", () => {
    it("deletes the test location (200)", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?id=${createdLocationId}`,
        {
          method: "DELETE",
          cookie: adminCookie,
        }
      );

      const json = await expectJson(res, 200);
      expect(json.success).toBe(true);
    });
  });
});
