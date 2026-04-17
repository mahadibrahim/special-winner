import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
  testSlug,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/discount-codes";

describe("Admin Discount Codes CRUD API", () => {
  let adminCookie: string;
  let createdDiscountCodeId: string;
  const uniqueCode = testSlug("DISC").toUpperCase();

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- POST (Create) ----

  describe("POST - Create discount code", () => {
    it("creates a percentage discount code (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          code: uniqueCode,
          discountType: "percentage",
          discountValue: 10,
          maxUses: 100,
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.discountCode).toBeDefined();
      expect(json.discountCode.code).toBe(uniqueCode);
      expect(json.discountCode.discountType).toBe("percentage");
      expect(json.discountCode.discountValue).toBe(10);
      expect(json.discountCode.maxUses).toBe(100);
      expect(json.discountCode.id).toBeDefined();

      createdDiscountCodeId = json.discountCode.id;
    });

    it("rejects duplicate code within same organization (409)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          code: uniqueCode,
          discountType: "percentage",
          discountValue: 15,
        }),
      });

      const json = await expectJson(res, 409);
      expect(json.error).toContain("already exists");
    });

    it("rejects missing code (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          discountType: "percentage",
          discountValue: 10,
        }),
      });

      const json = await expectJson(res, 400);
      expect(json.error).toBe("Validation failed");
      expect(json.details).toBeDefined();
    });
  });

  // ---- GET (List) ----

  describe("GET - List discount codes", () => {
    it("returns array of discount codes including the test one (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.discountCodes)).toBe(true);

      const found = json.discountCodes.find(
        (dc: any) => dc.id === createdDiscountCodeId
      );
      expect(found).toBeDefined();
      expect(found.code).toBe(uniqueCode);
    });
  });

  // ---- DELETE ----

  describe("DELETE - Delete discount code", () => {
    it("deletes the test discount code (200)", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?id=${createdDiscountCodeId}`,
        {
          method: "DELETE",
          cookie: adminCookie,
        }
      );

      const json = await expectJson(res, 200);
      expect(json.success).toBe(true);
    });

    it("returns 404 for already-deleted discount code", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?id=${createdDiscountCodeId}`,
        {
          method: "DELETE",
          cookie: adminCookie,
        }
      );

      const json = await expectJson(res, 404);
      expect(json.error).toBe("Discount code not found");
    });
  });

  // ---- Unauthenticated ----

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated POST (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          code: "UNAUTH",
          discountType: "percentage",
          discountValue: 5,
        }),
      });

      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated GET (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });
});
