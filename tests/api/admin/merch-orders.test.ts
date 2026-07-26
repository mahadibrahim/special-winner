/**
 * Admin order aggregation, CSV export, mark-collected — org-scoped merch
 * orders (Phase 3b, Task 4.4).
 *
 * Covers: auth gate, GET orders for a store (org-scoped, with items),
 * PATCH mark-collected (awaiting_pickup → collected), illegal transitions
 * (a non-awaiting_pickup order → 409), and tenant isolation (another org's
 * store/order via Org A context → 404).
 *
 * Mirrors the fixture/cleanup pattern in merch-stores.test.ts: Org B rows
 * are inserted directly via the db (we can't sign in "as" an Org B admin
 * against localhost — org context resolves from the request host).
 *
 * NOTE: written but not run in this session (no dev server available to
 * the implementing agent) — the controller runs it in a follow-up pass.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, getAdminCookie, expectJson, testSlug } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { merchStores, merchOrders, merchOrderItems, merchProducts, merchVariants } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

let adminCookie: string;
let adminUserId: string;
let teamId: string;
let storeId: string;
let fixtureVariantId: string;
let fixtureProductId: string;

const createdStoreIds: string[] = [];
const createdOrderIds: string[] = [];

function shippingAddress(name: string) {
  return {
    name,
    address1: "123 Test St",
    city: "Columbus",
    state: "OH",
    zip: "43085",
    country: "US",
  };
}

async function insertOrder(status: string, overrides: Partial<typeof merchOrders.$inferInsert> = {}) {
  const [order] = await getDb()
    .insert(merchOrders)
    .values({
      organizationId: E2E_ORG_ID,
      storeId,
      userId: adminUserId,
      email: "orders-fixture@test.aspiresports.com",
      status: status as never,
      shippingAddress: shippingAddress("Test Buyer"),
      subtotalCents: 1000,
      shippingCents: 500,
      totalCents: 1500,
      ...overrides,
    })
    .returning();
  createdOrderIds.push(order.id);
  return order;
}

beforeAll(async () => {
  adminCookie = await getAdminCookie();

  const me = await (await apiFetch("/api/auth/me", { cookie: adminCookie })).json();
  adminUserId = me.user?.id;
  expect(adminUserId).toBeTruthy();

  const list = await expectJson(
    await apiFetch("/api/admin/merch/stores", { cookie: adminCookie }),
    200,
  );
  expect(list.teams.length).toBeGreaterThan(0);
  teamId = list.teams[0].id;

  const storeRes = await apiFetch("/api/admin/merch/stores", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      scope: "team",
      teamId,
      name: testSlug("Orders Fixture Store"),
      visibility: "public",
      active: true,
    }),
  });
  const store = await expectJson(storeRes, 201);
  storeId = store.store.id;
  createdStoreIds.push(storeId);

  // Self-contained fixture for the GET-items test below: a throwaway manual
  // product + variant under this store, so the test never depends on the
  // shared staging catalog having any pre-existing merch_variants rows.
  // Mirrors the insert pattern in merch-store-products.test.ts (~line 244).
  const [product] = await getDb().insert(merchProducts).values({
    organizationId: E2E_ORG_ID,
    storeId,
    source: "manual",
    fulfillmentType: "pickup",
    name: "Orders Fixture Product",
    slug: testSlug("orders-fixture-product"),
    category: "jersey",
  }).returning();
  fixtureProductId = product.id;

  const [variant] = await getDb().insert(merchVariants).values({
    productId: fixtureProductId,
    name: "Orders Fixture Product / M",
    size: "M",
    retailPriceCents: 1000,
  }).returning();
  fixtureVariantId = variant.id;
});

afterAll(async () => {
  const db = getDb();
  if (createdOrderIds.length) {
    await db.delete(merchOrderItems).where(inArray(merchOrderItems.orderId, createdOrderIds));
    await db.delete(merchOrders).where(inArray(merchOrders.id, createdOrderIds));
  }
  // variant before product (FK), product before store (FK)
  if (fixtureVariantId) {
    await db.delete(merchVariants).where(eq(merchVariants.id, fixtureVariantId));
  }
  if (fixtureProductId) {
    await db.delete(merchProducts).where(eq(merchProducts.id, fixtureProductId));
  }
  if (createdStoreIds.length) {
    await db.delete(merchStores).where(inArray(merchStores.id, createdStoreIds));
  }
});

describe("/api/admin/merch/orders — auth gate", () => {
  it("GET unauth → 401", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/orders?storeId=${storeId}`)).status).toBe(401);
  });
  it("PATCH unauth → 401", async () => {
    expect(
      (await fetch(`${BASE}/api/admin/merch/orders`, { method: "PATCH" })).status,
    ).toBe(401);
  });
});

describe("/api/admin/merch/orders — GET", () => {
  it("rejects a missing/invalid storeId (400)", async () => {
    const res = await apiFetch("/api/admin/merch/orders", { cookie: adminCookie });
    expect(res.status).toBe(400);
  });

  it("lists orders + items for the store", async () => {
    const order = await insertOrder("awaiting_pickup");
    const [item] = await getDb()
      .insert(merchOrderItems)
      .values({
        orderId: order.id,
        merchVariantId: fixtureVariantId,
        productName: "Test Jersey",
        variantName: "Test Jersey / M",
        size: "M",
        personalization: { name: "Lee", number: "10" },
        unitPriceCents: 1000,
        quantity: 1,
      })
      .returning();
    expect(item.id).toBeTruthy();

    const res = await apiFetch(`/api/admin/merch/orders?storeId=${storeId}`, {
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    const found = json.orders.find((o: { id: string }) => o.id === order.id);
    expect(found).toBeTruthy();
    expect(found.items.length).toBeGreaterThan(0);
    expect(found.items[0].productName).toBe("Test Jersey");
  });
});

describe("/api/admin/merch/orders — PATCH mark-collected", () => {
  it("transitions awaiting_pickup → collected", async () => {
    const order = await insertOrder("awaiting_pickup");
    const res = await apiFetch("/api/admin/merch/orders", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ orderId: order.id, status: "collected" }),
    });
    const json = await expectJson(res, 200);
    expect(json.order.status).toBe("collected");
  });

  it("rejects an illegal transition (paid → collected) with 409", async () => {
    const order = await insertOrder("paid");
    const res = await apiFetch("/api/admin/merch/orders", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ orderId: order.id, status: "collected" }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects a bad orderId shape (400)", async () => {
    const res = await apiFetch("/api/admin/merch/orders", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ orderId: "not-a-uuid", status: "collected" }),
    });
    expect(res.status).toBe(400);
  });

  it("404s for a nonexistent orderId", async () => {
    const res = await apiFetch("/api/admin/merch/orders", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        orderId: "00000000-0000-0000-0000-000000000000",
        status: "collected",
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe("/api/admin/merch/orders — tenant isolation", () => {
  let orgBStoreId: string;
  let orgBOrderId: string;

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

    const [store] = await getDb()
      .insert(merchStores)
      .values({
        organizationId: orgBId,
        scope: "general",
        name: "Org B Orders Fixture Store",
        slug: testSlug("orgb-orders-fixture-store"),
        visibility: "public",
      })
      .returning();
    orgBStoreId = store.id;

    const [order] = await getDb()
      .insert(merchOrders)
      .values({
        organizationId: orgBId,
        storeId: orgBStoreId,
        userId: adminUserId,
        email: "orgb-orders-fixture@test.aspiresports.com",
        status: "awaiting_pickup",
        shippingAddress: shippingAddress("Org B Buyer"),
        subtotalCents: 1000,
        shippingCents: 500,
        totalCents: 1500,
      })
      .returning();
    orgBOrderId = order.id;
  });

  afterAll(async () => {
    await getDb().delete(merchOrders).where(eq(merchOrders.id, orgBOrderId));
    await getDb().delete(merchStores).where(eq(merchStores.id, orgBStoreId));
  });

  it("GET with an Org B storeId via Org A context → 404", async () => {
    const res = await apiFetch(`/api/admin/merch/orders?storeId=${orgBStoreId}`, {
      cookie: adminCookie,
    });
    expect(res.status).toBe(404);
  });

  it("PATCH with an Org B orderId via Org A context → 404", async () => {
    const res = await apiFetch("/api/admin/merch/orders", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ orderId: orgBOrderId, status: "collected" }),
    });
    expect(res.status).toBe(404);
  });
});
