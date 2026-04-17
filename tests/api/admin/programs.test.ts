import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  testSlug,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/programs";

describe("Admin Programs CRUD API", () => {
  let adminCookie: string;
  let createdProgramId: string;
  let sportId: string;
  let locationId: string;
  const slug = testSlug("prog");

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    // Fetch existing sports and locations to get valid foreign key IDs
    const [sportsRes, locationsRes] = await Promise.all([
      apiFetch("/api/admin/sports", { method: "GET", cookie: adminCookie }),
      apiFetch("/api/admin/locations", { method: "GET", cookie: adminCookie }),
    ]);

    const sportsJson = await sportsRes.json();
    const locationsJson = await locationsRes.json();

    expect(sportsJson.sports.length).toBeGreaterThan(0);
    expect(locationsJson.locations.length).toBeGreaterThan(0);

    sportId = sportsJson.sports[0].id;
    locationId = locationsJson.locations[0].id;
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- POST (Create) ----

  describe("POST - Create program", () => {
    it("creates a program with valid data (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: "Test Program",
          slug,
          sportId,
          locationId,
          programType: "league",
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.program).toBeDefined();
      expect(json.program.name).toBe("Test Program");
      expect(json.program.slug).toBe(slug);
      expect(json.program.programType).toBe("league");
      expect(json.program.id).toBeDefined();

      createdProgramId = json.program.id;
    });
  });

  // ---- GET (List) ----

  describe("GET - List programs", () => {
    it("returns array of programs including the created one (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.programs)).toBe(true);

      const found = json.programs.find(
        (p: any) => p.id === createdProgramId
      );
      expect(found).toBeDefined();
      expect(found.name).toBe("Test Program");
      expect(found.slug).toBe(slug);
      expect(found.sport).toBeDefined();
      expect(found.location).toBeDefined();
    });
  });

  // ---- PUT (Update) ----

  describe("PUT - Update program", () => {
    it("updates program type to camp (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: createdProgramId,
          name: "Test Program",
          slug,
          sportId,
          locationId,
          programType: "camp",
        }),
      });

      const json = await expectJson(res, 200);
      expect(json.program).toBeDefined();
      expect(json.program.programType).toBe("camp");
      expect(json.program.id).toBe(createdProgramId);
    });
  });

  // ---- DELETE ----

  describe("DELETE - Delete program", () => {
    it("deletes the test program (200)", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?id=${createdProgramId}`,
        {
          method: "DELETE",
          cookie: adminCookie,
        }
      );

      const json = await expectJson(res, 200);
      expect(json.success).toBe(true);
    });
  });

  // ---- Auth ----

  describe("Auth - Unauthenticated requests", () => {
    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        // no cookie
      });

      expect(res.status).toBe(401);
    });
  });
});
