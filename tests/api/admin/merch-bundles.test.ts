/**
 * Admin bundle CRUD — curated multi-product bundles scoped to a store
 * (Phase 3d, Task 4.1).
 *
 * Covers: auth gate, creating a bundle with same-fulfillment components,
 * mixed-fulfillment components → 422, a component product from another
 * store → 422, tenant isolation (cross-org store/bundle id → 404), slug
 * uniqueness, and DELETE cascading to merch_bundle_items.
 *
 * Mirrors tests/api/admin/merch-store-products.test.ts for the fixture
 * pattern (team store via POST /api/admin/merch/stores, org fixtures via
 * /api/test/org-fixtures for tenant isolation).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, getAdminCookie, expectJson, testSlug } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { merchStores, merchProducts, merchBundles, merchBundleItems } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

let adminCookie: string;
let storeId: string;
let pickupProductAId: string;
let pickupProductBId: string;
let selfShippedProductId: string;

const createdStoreIds: string[] = [];
const createdProductIds: string[] = [];
const createdBundleIds: string[] = [];

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
      name: testSlug("Bundles Fixture Store"),
      visibility: "public",
      active: true,
    }),
  });
  const storeJson = await expectJson(storeRes, 201);
  storeId = storeJson.store.id;
  createdStoreIds.push(storeId);

  // Two pickup products (same fulfillment type) + one self_shipped product,
  // all in this store — used to build the same-fulfillment and
  // mixed-fulfillment component fixtures below.
  const productA = await apiFetch("/api/admin/merch/store-products", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      storeId,
      name: testSlug("Bundle Component A"),
      priceCents: 1000,
      sizes: ["M"],
      active: true,
    }),
  });
  const productAJson = await expectJson(productA, 201);
  pickupProductAId = productAJson.productId;
  createdProductIds.push(pickupProductAId);

  const productB = await apiFetch("/api/admin/merch/store-products", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      storeId,
      name: testSlug("Bundle Component B"),
      priceCents: 1500,
      sizes: ["M"],
      active: true,
    }),
  });
  const productBJson = await expectJson(productB, 201);
  pickupProductBId = productBJson.productId;
  createdProductIds.push(pickupProductBId);

  const selfShipped = await apiFetch("/api/admin/merch/store-products", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      storeId,
      name: testSlug("Bundle Component Self Shipped"),
      priceCents: 2000,
      fulfillmentType: "self_shipped",
      sizes: ["M"],
      variantWeights: [{ size: "M", weightOz: 10 }],
      active: true,
    }),
  });
  const selfShippedJson = await expectJson(selfShipped, 201);
  selfShippedProductId = selfShippedJson.productId;
  createdProductIds.push(selfShippedProductId);
});

afterAll(async () => {
  const db = getDb();
  if (createdBundleIds.length) {
    await db.delete(merchBundles).where(inArray(merchBundles.id, createdBundleIds));
  }
  if (createdProductIds.length) {
    await db.delete(merchProducts).where(inArray(merchProducts.id, createdProductIds));
  }
  if (createdStoreIds.length) {
    await db.delete(merchStores).where(inArray(merchStores.id, createdStoreIds));
  }
});

describe("/api/admin/merch/bundles — auth gate", () => {
  it("GET unauth → 401", async () => {
    expect(
      (await fetch(`${BASE}/api/admin/merch/bundles?storeId=00000000-0000-0000-0000-000000000000`)).status,
    ).toBe(401);
  });
  it("POST unauth → 401", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/bundles`, { method: "POST" })).status).toBe(401);
  });
  it("PUT unauth → 401", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/bundles`, { method: "PUT" })).status).toBe(401);
  });
  it("DELETE unauth → 401", async () => {
    expect(
      (await fetch(`${BASE}/api/admin/merch/bundles?id=00000000-0000-0000-0000-000000000000`, {
        method: "DELETE",
      })).status,
    ).toBe(401);
  });
});

describe("/api/admin/merch/bundles — create + read", () => {
  it("GET with an invalid storeId → 400", async () => {
    const res = await apiFetch("/api/admin/merch/bundles?storeId=not-a-uuid", { cookie: adminCookie });
    expect(res.status).toBe(400);
  });

  it("GET with an unknown storeId → 404", async () => {
    const res = await apiFetch(
      "/api/admin/merch/bundles?storeId=00000000-0000-0000-0000-000000000000",
      { cookie: adminCookie },
    );
    expect(res.status).toBe(404);
  });

  it("creates a bundle with two same-fulfillment components", async () => {
    const res = await apiFetch("/api/admin/merch/bundles", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Fixture Bundle"),
        discountType: "percent",
        discountValue: 10,
        active: true,
        components: [
          { productId: pickupProductAId, quantity: 1 },
          { productId: pickupProductBId, label: "Second item", quantity: 2 },
        ],
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.bundleId).toBeTruthy();
    createdBundleIds.push(json.bundleId);

    const [bundle] = await getDb().select().from(merchBundles).where(eq(merchBundles.id, json.bundleId));
    expect(bundle.fulfillmentType).toBe("pickup");
    expect(bundle.discountType).toBe("percent");
    expect(bundle.discountValue).toBe(10);

    const items = await getDb().select().from(merchBundleItems).where(eq(merchBundleItems.bundleId, json.bundleId));
    expect(items).toHaveLength(2);
    const itemB = items.find((i) => i.productId === pickupProductBId);
    expect(itemB?.label).toBe("Second item");
    expect(itemB?.quantity).toBe(2);

    const list = await expectJson(
      await apiFetch(`/api/admin/merch/bundles?storeId=${storeId}`, { cookie: adminCookie }),
      200,
    );
    const created = list.bundles.find((b: { id: string }) => b.id === json.bundleId);
    expect(created).toBeTruthy();
    expect(created.items).toHaveLength(2);
    expect(Array.isArray(list.products)).toBe(true);
    expect(list.products.some((p: { id: string }) => p.id === pickupProductAId)).toBe(true);
  });

  it("rejects creation against an unknown storeId (404)", async () => {
    const res = await apiFetch("/api/admin/merch/bundles", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId: "00000000-0000-0000-0000-000000000000",
        name: testSlug("Orphan Bundle"),
        discountType: "percent",
        discountValue: 10,
        components: [{ productId: pickupProductAId }],
      }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a discountValue out of range for percent (>100) → 400", async () => {
    const res = await apiFetch("/api/admin/merch/bundles", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Bad Percent Bundle"),
        discountType: "percent",
        discountValue: 150,
        components: [{ productId: pickupProductAId }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a negative discountValue for fixed → 400", async () => {
    const res = await apiFetch("/api/admin/merch/bundles", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Bad Fixed Bundle"),
        discountType: "fixed",
        discountValue: -100,
        components: [{ productId: pickupProductAId }],
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("/api/admin/merch/bundles — component validation", () => {
  it("rejects mixed-fulfillment components → 422", async () => {
    const res = await apiFetch("/api/admin/merch/bundles", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Mixed Fulfillment Bundle"),
        discountType: "percent",
        discountValue: 10,
        components: [
          { productId: pickupProductAId },
          { productId: selfShippedProductId },
        ],
      }),
    });
    expect(res.status).toBe(422);
  });

  it("rejects a component product that isn't in this store → 422", async () => {
    const otherStoreRes = await apiFetch("/api/admin/merch/stores", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        scope: "team",
        teamId: (
          await expectJson(await apiFetch("/api/admin/merch/stores", { cookie: adminCookie }), 200)
        ).teams[0].id,
        name: testSlug("Other Store For Bundle Test"),
        visibility: "public",
        active: true,
      }),
    });
    const otherStoreJson = await expectJson(otherStoreRes, 201);
    createdStoreIds.push(otherStoreJson.store.id);

    const otherProductRes = await apiFetch("/api/admin/merch/store-products", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId: otherStoreJson.store.id,
        name: testSlug("Other Store Product"),
        priceCents: 1000,
        sizes: ["M"],
        active: true,
      }),
    });
    const otherProductJson = await expectJson(otherProductRes, 201);
    createdProductIds.push(otherProductJson.productId);

    const res = await apiFetch("/api/admin/merch/bundles", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Cross Store Bundle"),
        discountType: "percent",
        discountValue: 10,
        components: [
          { productId: pickupProductAId },
          { productId: otherProductJson.productId },
        ],
      }),
    });
    expect(res.status).toBe(422);
  });
});

describe("/api/admin/merch/bundles — slug uniqueness", () => {
  it("two bundles with the same name in the same store get distinct slugs", async () => {
    const name = testSlug("Duplicate Name Bundle");
    const res1 = await apiFetch("/api/admin/merch/bundles", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name,
        discountType: "percent",
        discountValue: 5,
        components: [{ productId: pickupProductAId }],
      }),
    });
    const json1 = await expectJson(res1, 201);
    createdBundleIds.push(json1.bundleId);

    const res2 = await apiFetch("/api/admin/merch/bundles", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name,
        discountType: "percent",
        discountValue: 5,
        components: [{ productId: pickupProductAId }],
      }),
    });
    const json2 = await expectJson(res2, 201);
    createdBundleIds.push(json2.bundleId);

    const [b1] = await getDb().select().from(merchBundles).where(eq(merchBundles.id, json1.bundleId));
    const [b2] = await getDb().select().from(merchBundles).where(eq(merchBundles.id, json2.bundleId));
    expect(b1.slug).not.toBe(b2.slug);
  });
});

describe("/api/admin/merch/bundles — update", () => {
  let bundleId: string;

  beforeAll(async () => {
    const res = await apiFetch("/api/admin/merch/bundles", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Update Target Bundle"),
        discountType: "percent",
        discountValue: 5,
        components: [{ productId: pickupProductAId }],
      }),
    });
    const json = await expectJson(res, 201);
    bundleId = json.bundleId;
    createdBundleIds.push(bundleId);
  });

  it("replaces the component set and discount on update", async () => {
    const res = await apiFetch("/api/admin/merch/bundles", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        id: bundleId,
        storeId,
        name: "Update Target Bundle",
        discountType: "fixed",
        discountValue: 500,
        active: true,
        components: [
          { productId: pickupProductAId },
          { productId: pickupProductBId, quantity: 3 },
        ],
      }),
    });
    await expectJson(res, 200);

    const [bundle] = await getDb().select().from(merchBundles).where(eq(merchBundles.id, bundleId));
    expect(bundle.discountType).toBe("fixed");
    expect(bundle.discountValue).toBe(500);

    const items = await getDb().select().from(merchBundleItems).where(eq(merchBundleItems.bundleId, bundleId));
    expect(items).toHaveLength(2);
    const itemB = items.find((i) => i.productId === pickupProductBId);
    expect(itemB?.quantity).toBe(3);
  });
});

describe("/api/admin/merch/bundles — delete cascades", () => {
  it("deleting a bundle removes its bundle_items", async () => {
    const res = await apiFetch("/api/admin/merch/bundles", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId,
        name: testSlug("Delete Target Bundle"),
        discountType: "percent",
        discountValue: 5,
        components: [{ productId: pickupProductAId }],
      }),
    });
    const created = await expectJson(res, 201);
    const bundleId = created.bundleId;

    const deleteRes = await apiFetch(`/api/admin/merch/bundles?id=${bundleId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    const deleteJson = await expectJson(deleteRes, 200);
    expect(deleteJson.success).toBe(true);

    const items = await getDb().select().from(merchBundleItems).where(eq(merchBundleItems.bundleId, bundleId));
    expect(items).toHaveLength(0);
  });
});

describe("/api/admin/merch/bundles — tenant isolation", () => {
  let orgBStoreId: string;
  let orgBProductId: string;
  let orgBBundleId: string;

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
    // so these fixtures are inserted directly, same rationale as
    // merch-store-products.test.ts.
    const [store] = await getDb().insert(merchStores).values({
      organizationId: orgBId,
      scope: "general",
      name: "Org B Fixture Store",
      slug: testSlug("orgb-fixture-store-bundles"),
      visibility: "public",
    }).returning();
    orgBStoreId = store.id;

    const [product] = await getDb().insert(merchProducts).values({
      organizationId: orgBId,
      storeId: orgBStoreId,
      source: "manual",
      fulfillmentType: "pickup",
      name: "Org B Fixture Product",
      slug: testSlug("orgb-fixture-product-bundles"),
      category: "jersey",
    }).returning();
    orgBProductId = product.id;

    const [bundle] = await getDb().insert(merchBundles).values({
      organizationId: orgBId,
      storeId: orgBStoreId,
      name: "Org B Fixture Bundle",
      slug: testSlug("orgb-fixture-bundle"),
      discountType: "percent",
      discountValue: 10,
      fulfillmentType: "pickup",
    }).returning();
    orgBBundleId = bundle.id;

    await getDb().insert(merchBundleItems).values({
      bundleId: orgBBundleId,
      productId: orgBProductId,
      quantity: 1,
      sortOrder: 0,
    });
  });

  afterAll(async () => {
    await getDb().delete(merchBundles).where(eq(merchBundles.id, orgBBundleId));
    await getDb().delete(merchProducts).where(eq(merchProducts.id, orgBProductId));
    await getDb().delete(merchStores).where(eq(merchStores.id, orgBStoreId));
  });

  it("GET with an Org B storeId via Org A context → 404", async () => {
    const res = await apiFetch(`/api/admin/merch/bundles?storeId=${orgBStoreId}`, { cookie: adminCookie });
    expect(res.status).toBe(404);
  });

  it("POST scoped to an Org B storeId via Org A context → 404", async () => {
    const res = await apiFetch("/api/admin/merch/bundles", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        storeId: orgBStoreId,
        name: testSlug("Hacked Bundle"),
        discountType: "percent",
        discountValue: 10,
        components: [{ productId: orgBProductId }],
      }),
    });
    expect(res.status).toBe(404);
  });

  it("PUT with an Org B bundle id via Org A context → 404", async () => {
    const res = await apiFetch("/api/admin/merch/bundles", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        id: orgBBundleId,
        storeId: orgBStoreId,
        name: "Hacked Bundle",
        discountType: "percent",
        discountValue: 10,
        components: [{ productId: orgBProductId }],
      }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE with an Org B bundle id via Org A context → 404", async () => {
    const res = await apiFetch(`/api/admin/merch/bundles?id=${orgBBundleId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    expect(res.status).toBe(404);
  });
});
