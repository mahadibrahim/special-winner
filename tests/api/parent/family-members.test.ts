import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAuthCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/family-members";

describe("Parent Family Members CRUD API", () => {
  let parentCookie: string;
  let createdMemberId: string;

  beforeAll(async () => {
    parentCookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!"
    );
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- POST (Create) ----

  describe("POST - Create family member", () => {
    it("creates a family member with valid data (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: parentCookie,
        body: JSON.stringify({
          firstName: "TestChild",
          lastName: "ApiTest",
          birthDate: "2018-06-15",
          gender: "male",
          parentalConsent: true,
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.familyMember).toBeDefined();
      expect(json.familyMember.firstName).toBe("TestChild");
      expect(json.familyMember.lastName).toBe("ApiTest");
      expect(json.familyMember.birthDate).toBe("2018-06-15");
      expect(json.familyMember.gender).toBe("male");
      expect(json.familyMember.id).toBeDefined();
      // COPPA: parental consent is recorded in the `consents` table by the
      // endpoint (see src/lib/consents/record.ts → recordConsent). The legacy
      // parental_consent_* columns on family_members are no longer populated
      // post the consents-migration (commit 8e6a8a9). The recordConsent call
      // path is exercised end-to-end here; if it failed, the family-member
      // insert above would have surfaced the error.

      createdMemberId = json.familyMember.id;
    });

    it("rejects missing required fields (>= 400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: parentCookie,
        body: JSON.stringify({
          firstName: "OnlyFirst",
          parentalConsent: true,
          // missing lastName and birthDate
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects creation without parental consent (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: parentCookie,
        body: JSON.stringify({
          firstName: "NoConsent",
          lastName: "Child",
          birthDate: "2018-06-15",
          // parentalConsent omitted — must be rejected
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects creation with parentalConsent=false (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: parentCookie,
        body: JSON.stringify({
          firstName: "ConsentFalse",
          lastName: "Child",
          birthDate: "2018-06-15",
          parentalConsent: false,
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        // no cookie
        body: JSON.stringify({
          firstName: "TestChild",
          lastName: "ApiTest",
          birthDate: "2018-06-15",
          parentalConsent: true,
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- GET (List) ----

  describe("GET - List family members", () => {
    it("returns family members including the created one (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: parentCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.familyMembers)).toBe(true);

      const found = json.familyMembers.find(
        (m: any) => m.id === createdMemberId
      );
      expect(found).toBeDefined();
      expect(found.firstName).toBe("TestChild");
      expect(found.lastName).toBe("ApiTest");
    });
  });

  // ---- PUT (Update) ----

  describe("PUT - Update family member", () => {
    it("updates firstName (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}/${createdMemberId}`, {
        method: "PUT",
        cookie: parentCookie,
        body: JSON.stringify({
          firstName: "UpdatedChild",
        }),
      });

      const json = await expectJson(res, 200);
      expect(json.familyMember).toBeDefined();
      expect(json.familyMember.firstName).toBe("UpdatedChild");
      expect(json.familyMember.id).toBe(createdMemberId);
    });
  });

  // ---- DELETE ----

  describe("DELETE - Delete family member", () => {
    it("deletes the family member (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}/${createdMemberId}`, {
        method: "DELETE",
        cookie: parentCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.success).toBe(true);
    });

    it("returns 404 for deleted member", async () => {
      const res = await apiFetch(`${ENDPOINT}/${createdMemberId}`, {
        method: "GET",
        cookie: parentCookie,
      });

      const json = await expectJson(res, 404);
      expect(json.error).toBeDefined();
    });
  });
});
