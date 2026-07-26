/**
 * Admin manual-product CRUD scoped to a store (Phase 3b, Task 4.2).
 *
 * Covers: auth gate, creating a manual product with sizes + personalization
 * under a freshly-created store, tenant isolation (cross-org store id and
 * cross-org product id → 404), update replacing variants, and delete
 * cascading to merch_variants.
 *
 * Mirrors tests/api/admin/merch-stores.test.ts for the tenant-isolation
 * fixture pattern (Org B via /api/test/org-fixtures, direct db insert since
 * org context here resolves from the request host, not the caller).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, getAdminCookie, expectJson, testSlug } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { merchStores, merchProducts, merchVariants } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

let adminCookie: string;
let storeId: string;

const createdStoreIds: string[] = [];
const createdProductIds: string[] = [];

beforeAll(async () => {
  adminCookie = await getAdminCookie();

  const list = await expectJson(
    await apiFetch("/api/admin/merch/stores", { cookie: adminCookie }),
    200,
  );
  expect(Array.isArray(list.teams)).toBe(true);
  expect(list.teams.length).toBeGreaterThan(0);
  const teamId = list.teams[0].id;

  const storeRes = await apiFetch("/api/admin/merch/stores", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      scope: "team",
      teamId,
      name: testSlug("Store Products Fixture Store"),
      visibility: "public",
      active: true,
    }),
  });
  const storeJson = await expectJson(storeRes, 201);
  storeId = storeJson.store.id;
  createdStoreIds.push(storeId);
});

afterAll(async () => {
  const db = getDb();
  if (createdProductIds.length) {
    await db.delete(merchProducts).where(inArray(merchProducts.id, createdProductIds));
  }
  if (createdStoreIds.length) {
    await db.delete(merchStores).where(inArray(merchStores.id, createdStoreIds));
  }
});

describe("/api/admin/merch/store-products — auth gate", () => {
  it("GET unauth → 401", async () => {
    expect(
      (await fetch(`${BASE}/api/admin/merch/store-products?storeId=00000000-0000-0000-0000-000000000000`)).status,
    ).toBe(401);
  });
  it("POST unauth → 401", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/store-products`, { method: "POST" })).status).toBe(401);
  });
  it("PUT unauth → 401", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/store-products`, { method: "PUT" })).status).toBe(401);
  });
  it("DELETE unauth → 401", async () => {
    expect(
      (await fetch(`${BASE}/api/admin/merch/store-products?id=00000000-0000-0000-0000-000000000000`, {
        method: "DELETE",
      })).status,
    ).toBe(401);
  });
});

describe("/api/admin/merch/store-products — create + read", () => {
  it("GET with an invalid storeId → 400", async () => {
    const res = await apiFetch("/api/admin/merch/store-products?storeId=not-a-uuid", { cookie: adminCookie });
    expect(res.status).toBe(400);
  });

  it("GET with an unknown storeId → 404", async () => {
    const res = await apiFetch(
      "/api/admin/merch/store-products?storeId=00000000-0000-0000-0000-000000000000",
      { cookie: adminCookie },
    );
    expect(res.status).toBe(404);
  });

  it("creates a manual product with sizes + personalization under the store", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Fixture Jersey"),
        category: "jersey",
        priceCents: 2500,
        sizes: ["S", "M", "L"],
        personalization: { name: true, number: true },
        active: true,
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.productId).toBeTruthy();
    createdProductIds.push(json.productId);

    const list = await expectJson(
      await apiFetch(`/api/admin/merch/store-products?storeId=${storeId}`, { cookie: adminCookie }),
      200,
    );
    const created = list.products.find((p: { id: string }) => p.id === json.productId);
    expect(created).toBeTruthy();
    expect(created.storeId).toBe(storeId);
    expect(created.source).toBe("manual");
    expect(created.fulfillmentType).toBe("pickup");
    expect(created.printfulSyncProductId).toBeNull();
    expect(created.personalization).toEqual({ name: true, number: true });
    expect(created.variants).toHaveLength(3);
    expect(created.variants.map((v: { size: string }) => v.size).sort()).toEqual(["L", "M", "S"]);
    expect(created.variants.every((v: { retailPriceCents: number }) => v.retailPriceCents === 2500)).toBe(true);
  });

  it("rejects creation against an unknown storeId (404)", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId: "00000000-0000-0000-0000-000000000000",
        name: testSlug("Orphan Product"),
        priceCents: 1000,
        sizes: ["M"],
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe("/api/admin/merch/store-products — self-shipped fulfillment + weight", () => {
  it("creates a self_shipped product with per-size weights → persists fulfillment_type + variant weight_oz", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Self Shipped Hoodie"),
        category: "hoodie",
        priceCents: 4500,
        fulfillmentType: "self_shipped",
        sizes: ["S", "M"],
        variantWeights: [
          { size: "S", weightOz: 18, lengthIn: 12, widthIn: 10, heightIn: 2 },
          { size: "M", weightOz: 20 },
        ],
        active: true,
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.productId).toBeTruthy();
    createdProductIds.push(json.productId);

    const [product] = await getDb().select().from(merchProducts).where(eq(merchProducts.id, json.productId));
    expect(product.fulfillmentType).toBe("self_shipped");

    const variants = await getDb().select().from(merchVariants).where(eq(merchVariants.productId, json.productId));
    expect(variants).toHaveLength(2);
    const sVariant = variants.find((v) => v.size === "S");
    const mVariant = variants.find((v) => v.size === "M");
    expect(sVariant?.weightOz).toBe(18);
    expect(sVariant?.lengthIn).toBe(12);
    expect(sVariant?.widthIn).toBe(10);
    expect(sVariant?.heightIn).toBe(2);
    expect(mVariant?.weightOz).toBe(20);
  });

  it("rejects a self_shipped product missing weightOz for a size → 422", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Self Shipped Missing Weight"),
        priceCents: 3000,
        fulfillmentType: "self_shipped",
        sizes: ["S", "M"],
        variantWeights: [{ size: "S", weightOz: 18 }],
        active: true,
      }),
    });
    expect(res.status).toBe(422);
  });

  it("rejects a self_shipped product with no variantWeights at all → 422", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Self Shipped No Weights"),
        priceCents: 3000,
        fulfillmentType: "self_shipped",
        sizes: ["M"],
        active: true,
      }),
    });
    expect(res.status).toBe(422);
  });
});

describe("/api/admin/merch/store-products — update replaces variants", () => {
  let productId: string;

  beforeAll(async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Update Target Product"),
        priceCents: 1500,
        sizes: ["S", "M"],
      }),
    });
    const json = await expectJson(res, 201);
    productId = json.productId;
    createdProductIds.push(productId);
  });

  it("replaces the variant set and price on update", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        id: productId,
        storeId,
        name: "Update Target Product",
        priceCents: 3000,
        sizes: ["L", "XL"],
        active: true,
      }),
    });
    await expectJson(res, 200);

    const variants = await getDb().select().from(merchVariants).where(eq(merchVariants.productId, productId));
    expect(variants).toHaveLength(2);
    expect(variants.map((v) => v.size).sort()).toEqual(["L", "XL"]);
    expect(variants.every((v) => v.retailPriceCents === 3000)).toBe(true);
  });
});

describe("/api/admin/merch/store-products — delete cascades", () => {
  it("deleting a product removes its variants", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Delete Target Product"),
        priceCents: 1200,
        sizes: ["M"],
      }),
    });
    const created = await expectJson(res, 201);
    const productId = created.productId;

    const deleteRes = await apiFetch(`/api/admin/merch/store-products?id=${productId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    const deleteJson = await expectJson(deleteRes, 200);
    expect(deleteJson.success).toBe(true);

    const variants = await getDb().select().from(merchVariants).where(eq(merchVariants.productId, productId));
    expect(variants).toHaveLength(0);
  });
});

describe("/api/admin/merch/store-products — Printful-sourced products are guarded", () => {
  let printfulProductId: string;

  beforeAll(async () => {
    // uniquely fabricated (not real Printful ids) to avoid unique-constraint
    // collisions on the shared CI DB across parallel/repeated test runs
    const fakeSyncProductId = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const fakeSyncVariantId = `${Date.now()}${Math.floor(Math.random() * 1e6)}v`;

    const [store] = await getDb().select().from(merchStores).where(eq(merchStores.id, storeId)).limit(1);
    const [product] = await getDb().insert(merchProducts).values({
      organizationId: store.organizationId,
      storeId,
      source: "printful",
      fulfillmentType: "printful_pod",
      printfulSyncProductId: fakeSyncProductId,
      name: testSlug("Printful Fixture Product"),
      slug: testSlug("printful-fixture-product"),
      category: "jersey",
    }).returning();
    printfulProductId = product.id;
    createdProductIds.push(printfulProductId);

    await getDb().insert(merchVariants).values({
      productId: printfulProductId,
      printfulSyncVariantId: fakeSyncVariantId,
      printfulVariantId: 777777,
      name: "Printful Fixture Product / M",
      size: "M",
      color: null,
      sku: null,
      retailPriceCents: 2500,
      sortOrder: 0,
    });
  });

  it("GET does not list the Printful-sourced product", async () => {
    const list = await expectJson(
      await apiFetch(`/api/admin/merch/store-products?storeId=${storeId}`, { cookie: adminCookie }),
      200,
    );
    expect(list.products.find((p: { id: string }) => p.id === printfulProductId)).toBeUndefined();
  });

  it("PUT against a Printful-sourced product → 400", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        id: printfulProductId,
        storeId,
        name: "Hacked Printful Product",
        priceCents: 1000,
        sizes: ["M"],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE against a Printful-sourced product → 400", async () => {
    const res = await apiFetch(`/api/admin/merch/store-products?id=${printfulProductId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    expect(res.status).toBe(400);
  });
});

describe("/api/admin/merch/store-products — tenant isolation", () => {
  let orgBStoreId: string;
  let orgBProductId: string;

  beforeAll(async () => {
    const orgBFixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
    if (orgBFixtureRes.status !== 200) {
      throw new Error(
        `Could not load Org B fixtures (status ${orgBFixtureRes.status}). ` +
          "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
      );
    }
    const orgBFixtures = await orgBFixtureRes.json();
    const orgBId = orgBFixtures.org.id as string;
    expect(orgBId).toBeTruthy();

    // Org context here resolves from the request host (localhost → Org A),
    // so we can't create these via the API as an Org B admin — insert
    // directly, same rationale as merch-stores.test.ts.
    const [store] = await getDb().insert(merchStores).values({
      organizationId: orgBId,
      scope: "general",
      name: "Org B Fixture Store",
      slug: testSlug("orgb-fixture-store-products"),
      visibility: "public",
    }).returning();
    orgBStoreId = store.id;

    const [product] = await getDb().insert(merchProducts).values({
      organizationId: orgBId,
      storeId: orgBStoreId,
      source: "manual",
      fulfillmentType: "pickup",
      name: "Org B Fixture Product",
      slug: testSlug("orgb-fixture-product"),
      category: "jersey",
    }).returning();
    orgBProductId = product.id;
  });

  afterAll(async () => {
    await getDb().delete(merchProducts).where(eq(merchProducts.id, orgBProductId));
    await getDb().delete(merchStores).where(eq(merchStores.id, orgBStoreId));
  });

  it("GET with an Org B storeId via Org A context → 404", async () => {
    const res = await apiFetch(`/api/admin/merch/store-products?storeId=${orgBStoreId}`, { cookie: adminCookie });
    expect(res.status).toBe(404);
  });

  it("POST scoped to an Org B storeId via Org A context → 404", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId: orgBStoreId,
        name: testSlug("Hacked Product"),
        priceCents: 1000,
        sizes: ["M"],
      }),
    });
    expect(res.status).toBe(404);
  });

  it("PUT with an Org B product id via Org A context → 404", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        id: orgBProductId,
        storeId: orgBStoreId,
        name: "Hacked Product",
        priceCents: 1000,
        sizes: ["M"],
      }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE with an Org B product id via Org A context → 404", async () => {
    const res = await apiFetch(`/api/admin/merch/store-products?id=${orgBProductId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    expect(res.status).toBe(404);
  });
});
