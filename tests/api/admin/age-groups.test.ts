import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  testSlug,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/age-groups";

describe("Admin Age Groups CRUD API", () => {
  let adminCookie: string;
  let createdAgeGroupId: string;
  const uniqueName = `Test-AG-${Date.now()}`;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- POST (Create) ----

  describe("POST - Create age group", () => {
    it("creates an age group with valid data (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: uniqueName,
          minAge: 6,
          maxAge: 8,
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.ageGroup).toBeDefined();
      expect(json.ageGroup.name).toBe(uniqueName);
      expect(json.ageGroup.minAge).toBe(6);
      expect(json.ageGroup.maxAge).toBe(8);
      expect(json.ageGroup.id).toBeDefined();

      createdAgeGroupId = json.ageGroup.id;
    });

    it("rejects minAge >= maxAge (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: `Test-AG-bad-${Date.now()}`,
          minAge: 10,
          maxAge: 5,
        }),
      });

      const json = await expectJson(res, 400);
      expect(json.error).toBeDefined();
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        // no cookie
        body: JSON.stringify({
          name: `Test-AG-unauth-${Date.now()}`,
          minAge: 4,
          maxAge: 6,
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- GET (List) ----

  describe("GET - List age groups", () => {
    it("returns array of age groups including the test one (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.ageGroups)).toBe(true);

      const found = json.ageGroups.find(
        (ag: any) => ag.id === createdAgeGroupId
      );
      expect(found).toBeDefined();
      expect(found.name).toBe(uniqueName);
    });
  });

  // ---- PUT (Update) ----

  describe("PUT - Update age group", () => {
    it("updates age group maxAge (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: createdAgeGroupId,
          name: uniqueName,
          minAge: 6,
          maxAge: 10,
        }),
      });

      const json = await expectJson(res, 200);
      expect(json.ageGroup).toBeDefined();
      expect(json.ageGroup.maxAge).toBe(10);
      expect(json.ageGroup.minAge).toBe(6);
      expect(json.ageGroup.id).toBe(createdAgeGroupId);
    });
  });

  // ---- DELETE ----

  describe("DELETE - Delete age group", () => {
    it("deletes the test age group (200)", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?id=${createdAgeGroupId}`,
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
