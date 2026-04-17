import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  testSlug,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/program-gear";

describe("Admin Program Gear Binding API", () => {
  let adminCookie: string;
  let productId: string;
  let programId: string;
  let seasonId: string;
  let programBindingId: string;
  let seasonBindingId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    // 1) Create a product for the caller's org.
    const productRes = await apiFetch("/api/admin/products", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        name: "Program Gear Test Jersey",
        slug: testSlug("p-progear"),
        category: "jersey",
        basePriceCents: 2000,
      }),
    });
    const productJson = await expectJson(productRes, 201);
    productId = productJson.product.id;

    // 2) Reuse an existing program + season from seeded data.
    const programsRes = await apiFetch("/api/admin/programs", {
      cookie: adminCookie,
    });
    const programsJson = await expectJson(programsRes, 200);
    expect(programsJson.programs.length).toBeGreaterThan(0);
    programId = programsJson.programs[0].id;

    const seasonsRes = await apiFetch(
      `/api/admin/seasons?programId=${programId}`,
      { cookie: adminCookie },
    );
    const seasonsJson = await expectJson(seasonsRes, 200);
    // If the program has no seasons yet, create one so we can bind to it.
    if (!seasonsJson.seasons || seasonsJson.seasons.length === 0) {
      const newSeasonRes = await apiFetch("/api/admin/seasons", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Program Gear Test Season",
          slug: testSlug("s-progear"),
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 15000,
          status: "draft",
        }),
      });
      const newSeasonJson = await expectJson(newSeasonRes, 201);
      seasonId = newSeasonJson.season.id;
    } else {
      seasonId = seasonsJson.seasons[0].id;
    }
  });

  afterAll(async () => {
    if (productId) {
      await apiFetch(`/api/admin/products?id=${productId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    }
    resetCookies();
  });

  describe("POST - Create binding", () => {
    it("creates a program binding (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          productId,
          programId,
          required: true,
          priceCents: 2000,
          sortOrder: 0,
        }),
      });
      const json = await expectJson(res, 201);
      expect(json.binding.id).toBeDefined();
      expect(json.binding.programId).toBe(programId);
      expect(json.binding.required).toBe(true);
      expect(json.binding.priceCents).toBe(2000);
      programBindingId = json.binding.id;
    });

    it("creates a season binding (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          productId,
          seasonId,
          required: false,
        }),
      });
      const json = await expectJson(res, 201);
      expect(json.binding.id).toBeDefined();
      expect(json.binding.seasonId).toBe(seasonId);
      seasonBindingId = json.binding.id;
    });

    it("rejects binding with BOTH programId and seasonId (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ productId, programId, seasonId }),
      });
      await expectJson(res, 400);
    });

    it("rejects binding with NEITHER programId nor seasonId (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ productId }),
      });
      await expectJson(res, 400);
    });

    it("rejects binding when productId is not owned by this org (404)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          productId: "00000000-0000-0000-0000-000000000000",
          programId,
        }),
      });
      await expectJson(res, 404);
    });

    it("rejects binding when programId is not owned by this org (404)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          productId,
          programId: "00000000-0000-0000-0000-000000000000",
        }),
      });
      await expectJson(res, 404);
    });

    it("requires auth (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ productId, programId }),
      });
      await expectJson(res, 401);
    });
  });

  describe("GET - List bindings", () => {
    it("lists bindings for a programId (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?programId=${programId}`, {
        cookie: adminCookie,
      });
      const json = await expectJson(res, 200);
      expect(Array.isArray(json.bindings)).toBe(true);
      expect(json.bindings.some((b: any) => b.id === programBindingId)).toBe(
        true,
      );
    });

    it("lists bindings for a seasonId (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?seasonId=${seasonId}`, {
        cookie: adminCookie,
      });
      const json = await expectJson(res, 200);
      expect(Array.isArray(json.bindings)).toBe(true);
      expect(json.bindings.some((b: any) => b.id === seasonBindingId)).toBe(
        true,
      );
    });

    it("returns 400 when neither programId nor seasonId is given", async () => {
      const res = await apiFetch(ENDPOINT, { cookie: adminCookie });
      await expectJson(res, 400);
    });
  });

  describe("PUT - Update binding", () => {
    it("updates a binding price (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: programBindingId,
          productId,
          programId,
          required: true,
          priceCents: 2500,
          sortOrder: 1,
        }),
      });
      const json = await expectJson(res, 200);
      expect(json.binding.priceCents).toBe(2500);
      expect(json.binding.sortOrder).toBe(1);
    });

    it("returns 404 for unknown binding id", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000000",
          productId,
          programId,
        }),
      });
      await expectJson(res, 404);
    });
  });

  describe("DELETE - Delete binding", () => {
    it("deletes a binding (200)", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?id=${programBindingId}`,
        { method: "DELETE", cookie: adminCookie },
      );
      await expectJson(res, 200);
    });
  });
});
