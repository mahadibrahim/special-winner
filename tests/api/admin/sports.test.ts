import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  testSlug,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/sports";

describe("Admin Sports CRUD API", () => {
  let adminCookie: string;
  let createdSportId: string;
  const slug = testSlug("sport");

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- POST (Create) ----

  describe("POST - Create sport", () => {
    it("creates a sport with valid data (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: "Test Sport",
          slug,
          icon: "basketball",
          color: "#ff5500",
          active: true,
          sortOrder: 10,
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.sport).toBeDefined();
      expect(json.sport.name).toBe("Test Sport");
      expect(json.sport.slug).toBe(slug);
      expect(json.sport.icon).toBe("basketball");
      expect(json.sport.color).toBe("#ff5500");
      expect(json.sport.active).toBe(true);
      expect(json.sport.sortOrder).toBe(10);
      expect(json.sport.id).toBeDefined();

      createdSportId = json.sport.id;
    });

    it("rejects missing name (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          slug: testSlug("sport"),
        }),
      });

      const json = await expectJson(res, 400);
      expect(json.error).toBe("Validation failed");
      expect(json.details).toBeDefined();
    });

    it("rejects invalid slug format (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: "Bad Slug Sport",
          slug: "INVALID SLUG!!!",
        }),
      });

      const json = await expectJson(res, 400);
      expect(json.error).toBe("Validation failed");
      expect(json.details).toBeDefined();
    });

    it("rejects duplicate slug (409)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: "Duplicate Sport",
          slug, // same slug as the already-created sport
        }),
      });

      const json = await expectJson(res, 409);
      expect(json.error).toBe("A sport with this slug already exists");
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        // no cookie
        body: JSON.stringify({
          name: "Unauth Sport",
          slug: testSlug("sport"),
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- GET (List) ----

  describe("GET - List sports", () => {
    it("returns array of sports including the test one", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.sports)).toBe(true);

      const found = json.sports.find(
        (s: any) => s.id === createdSportId
      );
      expect(found).toBeDefined();
      expect(found.name).toBe("Test Sport");
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

  describe("PUT - Update sport", () => {
    it("updates sport name (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: createdSportId,
          name: "Updated Sport Name",
          slug,
          active: true,
          sortOrder: 20,
        }),
      });

      const json = await expectJson(res, 200);
      expect(json.sport).toBeDefined();
      expect(json.sport.name).toBe("Updated Sport Name");
      expect(json.sport.sortOrder).toBe(20);
      expect(json.sport.id).toBe(createdSportId);
    });

    it("returns 404 for nonexistent ID", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: fakeId,
          name: "Ghost Sport",
          slug: testSlug("sport"),
        }),
      });

      const json = await expectJson(res, 404);
      expect(json.error).toBe("Sport not found");
    });
  });

  // ---- DELETE ----

  describe("DELETE - Delete sport", () => {
    it("deletes the test sport (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?id=${createdSportId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.success).toBe(true);
    });

    it("returns 404 for already-deleted sport", async () => {
      const res = await apiFetch(`${ENDPOINT}?id=${createdSportId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 404);
      expect(json.error).toBe("Sport not found");
    });
  });
});
