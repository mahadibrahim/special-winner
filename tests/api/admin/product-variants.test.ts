import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  testSlug,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/product-variants";

describe("Admin Product Variants CRUD API", () => {
  let adminCookie: string;
  let parentProductId: string;
  let createdVariantId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    const res = await apiFetch("/api/admin/products", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        name: "Variant Parent",
        slug: testSlug("p-variant"),
        category: "jersey",
        basePriceCents: 2000,
      }),
    });
    const json = await expectJson(res, 201);
    parentProductId = json.product.id;
  });

  afterAll(async () => {
    // Best-effort cleanup of the parent product (cascades variants).
    if (parentProductId) {
      await apiFetch(`/api/admin/products?id=${parentProductId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    }
    resetCookies();
  });

  describe("POST - Create variant", () => {
    it("creates a variant with valid data (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          productId: parentProductId,
          size: "YM",
          color: "red",
          priceOverrideCents: 2200,
          active: true,
          sortOrder: 0,
        }),
      });
      const json = await expectJson(res, 201);
      expect(json.variant.id).toBeDefined();
      expect(json.variant.productId).toBe(parentProductId);
      expect(json.variant.size).toBe("YM");
      expect(json.variant.color).toBe("red");
      createdVariantId = json.variant.id;
    });

    it("rejects missing size (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          productId: parentProductId,
          color: "blue",
        }),
      });
      await expectJson(res, 400);
    });

    it("rejects duplicate variant (same productId + size + color) (409)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          productId: parentProductId,
          size: "YM",
          color: "red",
        }),
      });
      await expectJson(res, 409);
    });

    it("rejects variant for productId not owned by this org (404)", async () => {
      // Using a well-formed but non-existent product id simulates "belongs to
      // another org" — the ownership check returns 404 in both cases.
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          productId: "00000000-0000-0000-0000-000000000000",
          size: "YL",
          color: "red",
        }),
      });
      await expectJson(res, 404);
    });

    it("requires auth (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          productId: parentProductId,
          size: "YS",
        }),
      });
      await expectJson(res, 401);
    });
  });

  describe("GET - List variants", () => {
    it("lists variants for a product (200)", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?productId=${parentProductId}`,
        { cookie: adminCookie },
      );
      const json = await expectJson(res, 200);
      expect(Array.isArray(json.variants)).toBe(true);
      expect(json.variants.some((v: any) => v.id === createdVariantId)).toBe(
        true,
      );
    });

    it("returns 400 when productId query is missing", async () => {
      const res = await apiFetch(ENDPOINT, { cookie: adminCookie });
      await expectJson(res, 400);
    });
  });

  describe("PUT - Update variant", () => {
    it("updates a variant (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: createdVariantId,
          productId: parentProductId,
          size: "YM",
          color: "red",
          priceOverrideCents: 2400,
          active: true,
          sortOrder: 1,
        }),
      });
      const json = await expectJson(res, 200);
      expect(json.variant.priceOverrideCents).toBe(2400);
      expect(json.variant.sortOrder).toBe(1);
    });

    it("returns 404 for unknown variant id", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000000",
          productId: parentProductId,
          size: "AL",
        }),
      });
      await expectJson(res, 404);
    });
  });

  describe("DELETE - Delete variant", () => {
    it("deletes a variant (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?id=${createdVariantId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      await expectJson(res, 200);
    });
  });
});
