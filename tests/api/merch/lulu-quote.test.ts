/**
 * Lulu book quote (merch Lulu phase): POST /api/merch/quote for a books cart.
 * Requires the dev server to run with LULU_MOCK=1 (CI sets it; see ci.yml).
 *
 * Covers: a book line + address returns luluShippingOptions (5 mock levels,
 * cheapest MAIL selected by default); luluShippingLevel=EXPRESS re-prices
 * shippingCents; a book mixed with a pickup line 422s with the books-only
 * message; a book line without an address 422s.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchStores, merchProducts, merchVariants } from "@/lib/db/schema";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { apiFetch, expectJson, testSlug } from "../setup/test-helpers";

const address = { name: "Buyer", address1: "1 Test St", city: "Columbus", state: "OH", zip: "43085", country: "US" };

let storeId: string;
let bookVariantId: string;
let pickupVariantId: string;

beforeAll(async () => {
  const db = getDb();
  const [store] = await db.insert(merchStores).values({
    // team (not general): the e2e org already has its one general store
    // (uq_merch_stores_one_general enforces one-general-per-org) — mirrors
    // digital-download.test.ts's fixture-store scope.
    organizationId: E2E_ORG_ID, scope: "team", name: "Lulu Quote Test Store",
    slug: testSlug("lulu-quote"), visibility: "public", active: true,
  }).returning();
  storeId = store.id;

  const [book] = await db.insert(merchProducts).values({
    organizationId: E2E_ORG_ID, storeId, source: "manual", fulfillmentType: "lulu_pod",
    name: "Test Print Guide", slug: testSlug("print-guide"), category: "other",
    luluPodPackageId: "0600X0900BWSTDPB060UW444MXX", luluPageCount: 40,
    luluInteriorAssetKey: `merch-books/${E2E_ORG_ID}/interior.pdf`,
    luluCoverAssetKey: `merch-books/${E2E_ORG_ID}/cover.pdf`,
    active: true,
  }).returning();
  const [bv] = await db.insert(merchVariants).values({
    productId: book.id, name: "Test Print Guide", retailPriceCents: 1500, active: true,
  }).returning();
  bookVariantId = bv.id;

  const [pickup] = await db.insert(merchProducts).values({
    organizationId: E2E_ORG_ID, storeId, source: "manual", fulfillmentType: "pickup",
    name: "Test Tee", slug: testSlug("tee"), category: "t_shirt", active: true,
  }).returning();
  const [pv] = await db.insert(merchVariants).values({
    productId: pickup.id, name: "Test Tee / M", size: "M", retailPriceCents: 900, active: true,
  }).returning();
  pickupVariantId = pv.id;
});

afterAll(async () => {
  await getDb().delete(merchStores).where(eq(merchStores.id, storeId)); // cascades products/variants
});

describe("POST /api/merch/quote — lulu books", () => {
  it("returns live level options, cheapest selected by default", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({ storeId, address, items: [{ variantId: bookVariantId, quantity: 1 }] }),
    });
    const json = await expectJson(res, 200);
    expect(json.luluShippingOptions).toHaveLength(5);
    expect(json.luluShippingOptions[0]).toMatchObject({ level: "MAIL", amountCents: 399 });
    expect(json.luluShippingLevel).toBe("MAIL");
    expect(json.shippingCents).toBe(399);
    expect(json.subtotalCents).toBe(1500);
  });

  it("re-prices for an explicitly selected level", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({
        storeId, address, luluShippingLevel: "EXPRESS",
        items: [{ variantId: bookVariantId, quantity: 1 }],
      }),
    });
    const json = await expectJson(res, 200);
    expect(json.luluShippingLevel).toBe("EXPRESS");
    expect(json.shippingCents).toBe(2499);
  });

  it("422s a book mixed with another physical line", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({
        storeId, address,
        items: [{ variantId: bookVariantId, quantity: 1 }, { variantId: pickupVariantId, quantity: 1 }],
      }),
    });
    const json = await expectJson(res, 422);
    expect(json.error).toBe("Printed books ship separately — please order them on their own.");
  });

  it("422s a book cart without an address", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({ storeId, address: null, items: [{ variantId: bookVariantId, quantity: 1 }] }),
    });
    await expectJson(res, 422);
  });
});
