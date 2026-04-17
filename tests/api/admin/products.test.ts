import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  testSlug,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/products";

describe("Admin Products CRUD API", () => {
  let adminCookie: string;
  let createdId: string;
  const slug = testSlug("product");

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  describe("POST - Create product", () => {
    it("creates a product with valid data (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: "U10 Game Jersey",
          slug,
          description: "Team jersey for U10",
          category: "jersey",
          basePriceCents: 2500,
          images: [{ url: "https://example.com/jersey.jpg", alt: "Jersey" }],
          availablePostRegistration: true,
          active: true,
          sortOrder: 0,
        }),
      });
      const json = await expectJson(res, 201);
      expect(json.product.id).toBeDefined();
      expect(json.product.name).toBe("U10 Game Jersey");
      expect(json.product.category).toBe("jersey");
      expect(json.product.basePriceCents).toBe(2500);
      createdId = json.product.id;
    });

    it("rejects missing name (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ slug: testSlug("p"), category: "jersey", basePriceCents: 100 }),
      });
      await expectJson(res, 400);
    });

    it("rejects invalid category (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: "Bad cat",
          slug: testSlug("p"),
          category: "not_a_real_category",
          basePriceCents: 100,
        }),
      });
      await expectJson(res, 400);
    });

    it("rejects duplicate slug in org (409)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: "Dup",
          slug,
          category: "jersey",
          basePriceCents: 100,
        }),
      });
      await expectJson(res, 409);
    });

    it("requires auth (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ name: "x", slug: testSlug("p"), category: "jersey", basePriceCents: 1 }),
      });
      await expectJson(res, 401);
    });
  });

  describe("GET - List products", () => {
    it("lists products for this org (200)", async () => {
      const res = await apiFetch(ENDPOINT, { cookie: adminCookie });
      const json = await expectJson(res, 200);
      expect(Array.isArray(json.products)).toBe(true);
      expect(json.products.some((p: any) => p.id === createdId)).toBe(true);
    });
  });

  describe("PUT - Update product", () => {
    it("updates a product (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: createdId,
          name: "U10 Game Jersey v2",
          slug,
          category: "jersey",
          basePriceCents: 2700,
          active: true,
          sortOrder: 1,
          availablePostRegistration: true,
        }),
      });
      const json = await expectJson(res, 200);
      expect(json.product.name).toBe("U10 Game Jersey v2");
      expect(json.product.basePriceCents).toBe(2700);
    });

    it("returns 404 for missing id", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000000",
          name: "x",
          slug: testSlug("p"),
          category: "jersey",
          basePriceCents: 100,
        }),
      });
      await expectJson(res, 404);
    });
  });

  describe("DELETE - Delete product", () => {
    it("deletes a product (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?id=${createdId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      await expectJson(res, 200);
    });
  });
});
