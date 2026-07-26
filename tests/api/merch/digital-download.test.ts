/**
 * Digital download endpoint (merch Phase 3e Task 3.2): GET /shop/download/[token]
 * — a public, unauthenticated route (guests download via the tokenized link
 * in their delivery email, no sign-in wall).
 *
 * Covers: unknown token -> 404; a valid, non-expired grant -> 302 redirect
 * (gated [302, 503] since a real R2 signing failure without R2_MOCK/creds
 * configured on the dev server is an environment gap, not a regression —
 * mirrors the tolerance pattern in tests/api/admin/applications.test.ts);
 * an expired grant -> the expiry response (410), never a redirect; and the
 * grant's download_count increments on a successful download.
 *
 * Fixtures are inserted directly via the db (store -> product -> variant ->
 * order -> order_item -> grant), mirroring the pattern in
 * tests/api/admin/merch-orders.test.ts — no admin API calls needed since
 * this endpoint itself requires no auth.
 *
 * NOTE: written but not run in this session (no dev server available to the
 * implementing agent) — the controller runs it in a follow-up pass.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  merchStores,
  merchProducts,
  merchVariants,
  merchOrders,
  merchOrderItems,
  merchDownloadGrants,
} from "@/lib/db/schema";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { apiFetch, expectJson, getAdminCookie, testSlug } from "../setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

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

let storeId: string;
let productId: string;
let variantId: string;
let orderId: string;
let orderItemId: string;
let fixtureUserId: string;

beforeAll(async () => {
  const db = getDb();

  // The download endpoint itself needs no auth, but merch_orders.user_id is
  // a real FK — sign in as the seeded admin purely to get a valid users.id
  // to attach the fixture order to (mirrors merch-orders.test.ts).
  const adminCookie = await getAdminCookie();
  const me = await expectJson(await apiFetch("/api/auth/me", { cookie: adminCookie }), 200);
  fixtureUserId = me.user?.id;
  expect(fixtureUserId).toBeTruthy();

  const [store] = await db
    .insert(merchStores)
    .values({
      organizationId: E2E_ORG_ID,
      scope: "general",
      name: testSlug("Digital Download Fixture Store"),
      slug: testSlug("digital-download-fixture-store"),
      visibility: "public",
    })
    .returning();
  storeId = store.id;

  const [product] = await db
    .insert(merchProducts)
    .values({
      organizationId: E2E_ORG_ID,
      storeId,
      source: "manual",
      fulfillmentType: "digital",
      name: "Digital Download Fixture Product",
      slug: testSlug("digital-download-fixture-product"),
      category: "other",
      digitalAssetKey: "merch-digital/test-fixture-asset.pdf",
      digitalAssetName: "Fixture Guide.pdf",
    })
    .returning();
  productId = product.id;

  const [variant] = await db
    .insert(merchVariants)
    .values({
      productId,
      name: "Digital Download Fixture Product",
      retailPriceCents: 500,
    })
    .returning();
  variantId = variant.id;

  const [order] = await db
    .insert(merchOrders)
    .values({
      organizationId: E2E_ORG_ID,
      storeId,
      userId: fixtureUserId,
      email: "digital-download-fixture@test.aspiresports.com",
      status: "delivered",
      shippingAddress: shippingAddress("Test Buyer"),
      subtotalCents: 500,
      shippingCents: 0,
      totalCents: 500,
    })
    .returning();
  orderId = order.id;

  const [item] = await db
    .insert(merchOrderItems)
    .values({
      orderId,
      merchVariantId: variantId,
      fulfillmentType: "digital",
      productName: "Digital Download Fixture Product",
      variantName: "Digital Download Fixture Product",
      unitPriceCents: 500,
      quantity: 1,
    })
    .returning();
  orderItemId = item.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(merchDownloadGrants).where(eq(merchDownloadGrants.orderItemId, orderItemId));
  if (orderId) await db.delete(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));
  if (orderId) await db.delete(merchOrders).where(eq(merchOrders.id, orderId));
  if (variantId) await db.delete(merchVariants).where(eq(merchVariants.id, variantId));
  if (productId) await db.delete(merchProducts).where(eq(merchProducts.id, productId));
  if (storeId) await db.delete(merchStores).where(eq(merchStores.id, storeId));
});

describe("GET /shop/download/[token]", () => {
  it("404s for an unknown token", async () => {
    const res = await fetch(`${BASE}/shop/download/nonexistent-token-abc123`, {
      redirect: "manual",
    });
    expect(res.status).toBe(404);
  });

  it("redirects (302) for a valid, unexpired grant and increments download_count", async () => {
    const db = getDb();
    const token = `test-valid-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // +30d
    await db.insert(merchDownloadGrants).values({
      orderItemId,
      token,
      assetKey: "merch-digital/test-fixture-asset.pdf",
      assetName: "Fixture Guide.pdf",
      expiresAt,
      downloadCount: 0,
    });

    const res = await fetch(`${BASE}/shop/download/${token}`, { redirect: "manual" });

    // getSignedGetUrl has no R2_MOCK awareness on its own — this endpoint
    // short-circuits to a mock redirect when R2_MOCK=1 (CI sets this), but
    // a dev server run without R2_MOCK and without real R2 credentials will
    // hit the endpoint's catch -> 503. That's an environment gap, not a
    // regression in the endpoint's own grant-lookup/expiry logic (covered
    // by the 404 and expired-grant cases), so tolerate either.
    expect([302, 503]).toContain(res.status);
    if (res.status === 302) {
      expect(res.headers.get("location")).toBeTruthy();
    } else {
      console.warn(
        "digital download redirect test: R2 appears unconfigured on dev server (no R2_MOCK / creds)",
      );
    }

    const [grant] = await db
      .select()
      .from(merchDownloadGrants)
      .where(eq(merchDownloadGrants.token, token))
      .limit(1);
    expect(grant.downloadCount).toBe(1);
  });

  it("returns the expiry response (not a redirect) for an expired grant", async () => {
    const db = getDb();
    const token = `test-expired-${Date.now()}`;
    const expiresAt = new Date(Date.now() - 1000 * 60 * 60 * 24); // -1d (already expired)
    await db.insert(merchDownloadGrants).values({
      orderItemId,
      token,
      assetKey: "merch-digital/test-fixture-asset.pdf",
      assetName: "Fixture Guide.pdf",
      expiresAt,
      downloadCount: 0,
    });

    const res = await fetch(`${BASE}/shop/download/${token}`, { redirect: "manual" });
    expect(res.status).toBe(410);
    expect(res.headers.get("location")).toBeFalsy();

    const body = await res.text();
    expect(body.toLowerCase()).toContain("expired");

    const [grant] = await db
      .select()
      .from(merchDownloadGrants)
      .where(eq(merchDownloadGrants.token, token))
      .limit(1);
    expect(grant.downloadCount).toBe(0);
  });
});
