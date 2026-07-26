/**
 * Public pickup checkout — quote + checkout for a manual/pickup product on a
 * team store (Phase 3b fast-follow 3.6).
 *
 * Covers: quote for a pickup line (no shipping address needed, shippingCents
 * === 0, subtotal = server price × qty), quote 422 when required
 * personalization is left blank, checkout happy path (200 with a Checkout
 * Session url, or 503 when Stripe isn't configured — see
 * ci-api-tests-have-no-stripe), and tenant isolation (an Org B store id via
 * Org A's request context → 404).
 *
 * Mirrors tests/api/admin/merch-stores.test.ts and
 * tests/api/admin/merch-store-products.test.ts for fixture setup and the
 * Org B tenant-isolation pattern (org context resolves from the request
 * host, so an Org B store must be inserted directly via the db).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, getAdminCookie, expectJson, testSlug } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { merchStores, merchProducts, merchVariants, merchOrders, merchOrderItems } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

let adminCookie: string;
let storeId: string;
let variantId: string;

// Org B fixtures for tenant isolation — created directly via the db since
// org context resolves from the request host, not the caller (same
// rationale as merch-stores.test.ts / merch-store-products.test.ts).
let orgBId: string;
let orgBStoreId: string;
let orgBProductId: string;

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
      name: testSlug("Pickup Checkout Fixture Store"),
      visibility: "unlisted",
      pickupLocation: "Front desk, 123 Test St, Columbus OH",
      active: true,
    }),
  });
  const storeJson = await expectJson(storeRes, 201);
  storeId = storeJson.store.id;
  createdStoreIds.push(storeId);

  const productRes = await apiFetch("/api/admin/merch/store-products", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      storeId,
      name: testSlug("Pickup Fixture Jersey"),
      category: "jersey",
      priceCents: 3000,
      sizes: ["M", "L"],
      personalization: { name: true, number: true },
      active: true,
    }),
  });
  const productJson = await expectJson(productRes, 201);
  createdProductIds.push(productJson.productId);

  const productsList = await expectJson(
    await apiFetch(`/api/admin/merch/store-products?storeId=${storeId}`, { cookie: adminCookie }),
    200,
  );
  const created = productsList.products.find((p: { id: string }) => p.id === productJson.productId);
  expect(created).toBeTruthy();
  expect(created.variants.length).toBeGreaterThan(0);
  variantId = created.variants[0].id;

  // Org B fixtures for tenant isolation.
  const orgBFixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
  if (orgBFixtureRes.status !== 200) {
    throw new Error(
      `Could not load Org B fixtures (status ${orgBFixtureRes.status}). ` +
        "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
    );
  }
  const orgBFixtures = await orgBFixtureRes.json();
  orgBId = orgBFixtures.org.id as string;
  expect(orgBId).toBeTruthy();

  const [orgBStore] = await getDb().insert(merchStores).values({
    organizationId: orgBId,
    scope: "general",
    name: "Org B Pickup Fixture Store",
    slug: testSlug("orgb-pickup-fixture-store"),
    visibility: "public",
  }).returning();
  orgBStoreId = orgBStore.id;

  const [orgBProduct] = await getDb().insert(merchProducts).values({
    organizationId: orgBId,
    storeId: orgBStoreId,
    source: "manual",
    fulfillmentType: "pickup",
    name: "Org B Pickup Fixture Product",
    slug: testSlug("orgb-pickup-fixture-product"),
    category: "jersey",
  }).returning();
  orgBProductId = orgBProduct.id;
});

afterAll(async () => {
  const db = getDb();

  // Checkout may have created pending orders that FK-block store/product
  // deletion — delete order items + orders for these stores first.
  const allStoreIds = [...createdStoreIds, orgBStoreId].filter(Boolean);
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
  if (orgBProductId) {
    await db.delete(merchProducts).where(eq(merchProducts.id, orgBProductId));
  }
  if (createdStoreIds.length) {
    await db.delete(merchStores).where(inArray(merchStores.id, createdStoreIds));
  }
  if (orgBStoreId) {
    await db.delete(merchStores).where(eq(merchStores.id, orgBStoreId));
  }
});

describe("POST /api/merch/quote — pickup", () => {
  it("quotes a pickup line with no address and filled personalization → shippingCents 0, subtotal = price × qty", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({
        storeId,
        items: [
          { variantId, quantity: 2, personalization: { name: "Test Player", number: "7" } },
        ],
      }),
    });
    const json = await expectJson(res, 200);
    expect(json.shippingCents).toBe(0);
    expect(json.subtotalCents).toBe(3000 * 2);
    expect(json.totalBeforeTaxCents).toBe(json.subtotalCents);
  });

  it("422s when a required personalization field is left blank", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({
        storeId,
        items: [
          { variantId, quantity: 1, personalization: { name: "Test Player" } }, // number missing
        ],
      }),
    });
    expect(res.status).toBe(422);
  });

  it("tenant isolation: quoting against an Org B store id via Org A context → 404", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({
        storeId: orgBStoreId,
        items: [{ variantId, quantity: 1, personalization: { name: "x", number: "1" } }],
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/merch/checkout — pickup", () => {
  it("starts checkout for a pickup order with no address (200 with a url, or 503 when Stripe isn't configured)", async () => {
    const res = await apiFetch("/api/merch/checkout", {
      method: "POST",
      body: JSON.stringify({
        storeId,
        email: `pickup-checkout-${Date.now()}@test.aspiresports.com`,
        name: "Test Buyer",
        items: [
          { variantId, quantity: 1, personalization: { name: "Test Player", number: "9" } },
        ],
      }),
    });
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      const json = await res.json();
      expect(typeof json.url).toBe("string");
    }
  });

  it("tenant isolation: checkout against an Org B store id via Org A context → 404 (or 503 pre-empted by the Stripe-unconfigured guard, same CI reality as the happy-path test above)", async () => {
    // checkout.ts checks `if (!stripe)` and returns 503 before it resolves
    // org/store — on a Stripe-less CI run that guard fires first for every
    // request, so the tenant-mismatch 404 can only be observed when Stripe
    // is configured. Accept both; when Stripe IS configured this must be 404.
    const res = await apiFetch("/api/merch/checkout", {
      method: "POST",
      body: JSON.stringify({
        storeId: orgBStoreId,
        email: "orgb-checkout@test.aspiresports.com",
        name: "Test Buyer",
        items: [{ variantId, quantity: 1, personalization: { name: "x", number: "1" } }],
      }),
    });
    expect([404, 503]).toContain(res.status);
  });
});
