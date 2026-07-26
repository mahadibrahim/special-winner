/**
 * Bundle explosion wired into /api/merch/quote + /api/merch/checkout
 * (merch Phase 3d, Task 2.2).
 *
 * The admin bundle CRUD endpoint doesn't exist yet (Slice 4) — the bundle
 * and its slots are inserted directly via the db, mirroring the fixture
 * pattern in tests/api/merch/pickup-checkout.test.ts and
 * tests/api/admin/merch-store-products.test.ts.
 *
 * Validation errors (off-bundle variant, missing slot selection) are
 * exercised against /api/merch/quote rather than /api/merch/checkout:
 * checkout.ts returns 503 "Checkout unavailable" before it even parses the
 * body when Stripe isn't configured (see ci-api-tests-have-no-stripe), which
 * would make those assertions non-deterministic on CI. quote.ts has no such
 * gate, so explodeBundles' validation runs unconditionally there.
 *
 * The happy-path checkout assertion (bundle_id/bundle_name persisted, exact
 * discounted total) can only run when Stripe IS configured — and separately,
 * these fixtures are self_shipped, so the shipping step 503s when the
 * shipping provider (Shippo) isn't configured either. Both gates are
 * accepted as [200, 503] per the existing pickup-checkout.test.ts pattern.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, getAdminCookie, expectJson, testSlug } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import {
  merchStores,
  merchProducts,
  merchVariants,
  merchBundles,
  merchBundleItems,
  merchOrders,
  merchOrderItems,
} from "@/lib/db/schema";
import { eq, inArray, desc } from "drizzle-orm";

let adminCookie: string;
let storeId: string;
let organizationId: string;

let productAId: string;
let productBId: string;
let variantA: string;
let variantB: string;

let bundleId: string;
let bundleName: string;
let slotAId: string;
let slotBId: string;

const createdStoreIds: string[] = [];
const createdProductIds: string[] = [];
const createdBundleIds: string[] = [];

const address = {
  name: "Test Buyer",
  address1: "123 Test St",
  city: "Columbus",
  state: "OH",
  zip: "43215",
  country: "US",
};

beforeAll(async () => {
  adminCookie = await getAdminCookie();

  const list = await expectJson(
    await apiFetch("/api/admin/merch/stores", { cookie: adminCookie }),
    200,
  );
  const teamId = list.teams[0].id;

  const storeRes = await apiFetch("/api/admin/merch/stores", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      scope: "team",
      teamId,
      name: testSlug("Bundle Checkout Fixture Store"),
      visibility: "unlisted",
      active: true,
    }),
  });
  const storeJson = await expectJson(storeRes, 201);
  storeId = storeJson.store.id;
  createdStoreIds.push(storeId);

  const [storeRow] = await getDb().select().from(merchStores).where(eq(merchStores.id, storeId));
  organizationId = storeRow.organizationId;

  // Two self_shipped products, each with a single "OS" variant, so we can
  // build a 2-slot bundle with a real weight on every component (weights are
  // required for self_shipped products; see merch-store-products.test.ts).
  const productARes = await apiFetch("/api/admin/merch/store-products", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      storeId,
      name: testSlug("Bundle Fixture Jersey"),
      category: "jersey",
      priceCents: 3000,
      fulfillmentType: "self_shipped",
      sizes: ["OS"],
      variantWeights: [{ size: "OS", weightOz: 16 }],
      active: true,
    }),
  });
  const productAJson = await expectJson(productARes, 201);
  productAId = productAJson.productId;
  createdProductIds.push(productAId);

  const productBRes = await apiFetch("/api/admin/merch/store-products", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      storeId,
      name: testSlug("Bundle Fixture Shorts"),
      category: "shorts",
      priceCents: 2000,
      fulfillmentType: "self_shipped",
      sizes: ["OS"],
      variantWeights: [{ size: "OS", weightOz: 12 }],
      active: true,
    }),
  });
  const productBJson = await expectJson(productBRes, 201);
  productBId = productBJson.productId;
  createdProductIds.push(productBId);

  const productsList = await expectJson(
    await apiFetch(`/api/admin/merch/store-products?storeId=${storeId}`, { cookie: adminCookie }),
    200,
  );
  const createdA = productsList.products.find((p: { id: string }) => p.id === productAId);
  const createdB = productsList.products.find((p: { id: string }) => p.id === productBId);
  variantA = createdA.variants[0].id;
  variantB = createdB.variants[0].id;

  // Bundle + slots — direct db insert (no admin CRUD endpoint yet, Slice 4).
  bundleName = testSlug("Jersey + Shorts Bundle");
  const [bundle] = await getDb().insert(merchBundles).values({
    organizationId,
    storeId,
    name: bundleName,
    slug: testSlug("jersey-shorts-bundle"),
    discountType: "percent",
    discountValue: 10,
    fulfillmentType: "self_shipped",
    active: true,
  }).returning();
  bundleId = bundle.id;
  createdBundleIds.push(bundleId);

  const [slotA, slotB] = await getDb().insert(merchBundleItems).values([
    { bundleId, productId: productAId, quantity: 1, sortOrder: 0 },
    { bundleId, productId: productBId, quantity: 1, sortOrder: 1 },
  ]).returning();
  slotAId = slotA.id;
  slotBId = slotB.id;
});

afterAll(async () => {
  const db = getDb();

  if (createdBundleIds.length) {
    // merch_bundle_items cascades on bundle delete
    await db.delete(merchBundles).where(inArray(merchBundles.id, createdBundleIds));
  }

  const allStoreIds = [...createdStoreIds];
  if (allStoreIds.length) {
    const orders = await db.select({ id: merchOrders.id }).from(merchOrders)
      .where(inArray(merchOrders.storeId, allStoreIds));
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length) {
      await db.delete(merchOrderItems).where(inArray(merchOrderItems.orderId, orderIds));
      await db.delete(merchOrders).where(inArray(merchOrders.id, orderIds));
    }
  }

  if (createdProductIds.length) {
    await db.delete(merchProducts).where(inArray(merchProducts.id, createdProductIds));
  }
  if (createdStoreIds.length) {
    await db.delete(merchStores).where(inArray(merchStores.id, createdStoreIds));
  }
});

describe("POST /api/merch/quote — bundles", () => {
  it("valid selection: 10% off (3000 + 2000) = 4500, or 503 when the shipping provider isn't configured", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({
        storeId,
        address,
        items: [],
        bundles: [{
          bundleId,
          selections: [
            { slotId: slotAId, variantId: variantA },
            { slotId: slotBId, variantId: variantB },
          ],
          quantity: 1,
        }],
      }),
    });
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      const json = await res.json();
      expect(json.subtotalCents).toBe(4500); // round((3000+2000) * 0.9)
      expect(json.items).toHaveLength(2);
      expect(json.items.every((it: { bundleId: string | null }) => it.bundleId === bundleId)).toBe(true);
      const sum = json.items.reduce(
        (s: number, it: { unitPriceCents: number; quantity: number }) => s + it.unitPriceCents * it.quantity,
        0,
      );
      expect(sum).toBe(4500);
    }
  });

  it("422s when a selection uses a variant that doesn't belong to that slot's product (off-bundle)", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({
        storeId,
        address,
        items: [],
        bundles: [{
          bundleId,
          selections: [
            { slotId: slotAId, variantId: variantB }, // shorts variant offered for the jersey slot
            { slotId: slotBId, variantId: variantB },
          ],
          quantity: 1,
        }],
      }),
    });
    expect(res.status).toBe(422);
  });

  it("422s when a slot is missing a selection", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({
        storeId,
        address,
        items: [],
        bundles: [{
          bundleId,
          selections: [{ slotId: slotAId, variantId: variantA }], // slotB never selected
          quantity: 1,
        }],
      }),
    });
    expect(res.status).toBe(422);
  });

  it("404s for a bundle id that doesn't belong to this store", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({
        storeId,
        address,
        items: [],
        bundles: [{
          bundleId: "00000000-0000-0000-0000-000000000000",
          selections: [
            { slotId: slotAId, variantId: variantA },
            { slotId: slotBId, variantId: variantB },
          ],
          quantity: 1,
        }],
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/merch/checkout — bundles", () => {
  it("starts checkout for a valid bundle selection and persists bundle_id/bundle_name on the exploded order lines (200 with a url, or 503 when Stripe/shipping isn't configured)", async () => {
    const email = `bundle-checkout-${Date.now()}@test.aspiresports.com`;
    const res = await apiFetch("/api/merch/checkout", {
      method: "POST",
      body: JSON.stringify({
        storeId,
        email,
        name: "Test Buyer",
        address,
        items: [],
        bundles: [{
          bundleId,
          selections: [
            { slotId: slotAId, variantId: variantA },
            { slotId: slotBId, variantId: variantB },
          ],
          quantity: 1,
        }],
      }),
    });
    expect([200, 503]).toContain(res.status);
    if (res.status !== 200) return;

    const json = await res.json();
    expect(typeof json.url).toBe("string");

    const [order] = await getDb().select().from(merchOrders)
      .where(eq(merchOrders.storeId, storeId))
      .orderBy(desc(merchOrders.createdAt))
      .limit(1);
    expect(order).toBeTruthy();
    expect(order.email).toBe(email);
    expect(order.subtotalCents).toBe(4500);

    const items = await getDb().select().from(merchOrderItems).where(eq(merchOrderItems.orderId, order.id));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.bundleId).toBe(bundleId);
      expect(item.bundleName).toBe(bundleName);
    }
    const sum = items.reduce((s, it) => s + it.unitPriceCents * it.quantity, 0);
    expect(sum).toBe(4500);
  });
});
