/**
 * Admin Lulu print-on-demand book support (merch Lulu POD books, Task 9).
 *
 * Covers: creating a lulu_pod book product (one variant, server-derived
 * luluPodPackageId), 422s for missing lulu fields / cross-org asset keys,
 * book-upload presign under merch-books/ (PDF-only), and the cost-preview
 * endpoint (mock print + Mail shipping costs).
 *
 * Mirrors the admin-auth pattern (getAdminCookie) from
 * tests/api/admin/merch-store-products.test.ts and the direct-db store
 * fixture (scope: "team") from tests/api/merch/lulu-quote.test.ts — the
 * shared E2E DB enforces one "general" store per org, so fixture stores use
 * "team" scope.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchStores, merchProducts, merchVariants } from "@/lib/db/schema";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { apiFetch, getAdminCookie, expectJson, testSlug } from "../setup/test-helpers";

let adminCookie: string;
let storeId: string;

const bookBody = (storeId: string, over: Record<string, unknown> = {}) => ({
  storeId, name: testSlug("Print Guide"), category: "other", priceCents: 1500,
  fulfillmentType: "lulu_pod", sizes: [],
  luluFormat: "6x9_bw", luluPageCount: 40,
  luluInteriorAssetKey: `merch-books/${E2E_ORG_ID}/i.pdf`,
  luluCoverAssetKey: `merch-books/${E2E_ORG_ID}/c.pdf`,
  ...over,
});

beforeAll(async () => {
  adminCookie = await getAdminCookie();

  const [store] = await getDb().insert(merchStores).values({
    // team (not general): the shared E2E DB enforces one general store per
    // org (uq_merch_stores_one_general) — see lulu-quote.test.ts.
    organizationId: E2E_ORG_ID, scope: "team", name: testSlug("Lulu Products Fixture Store"),
    slug: testSlug("lulu-products-fixture-store"), visibility: "public", active: true,
  }).returning();
  storeId = store.id;
});

afterAll(async () => {
  await getDb().delete(merchStores).where(eq(merchStores.id, storeId)); // cascades products/variants
});

describe("admin lulu_pod products", () => {
  it("creates a book product with one variant and a derived package id", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "POST", cookie: adminCookie, body: JSON.stringify(bookBody(storeId)),
    });
    const { productId } = await expectJson(res, 201);
    const [p] = await getDb().select().from(merchProducts).where(eq(merchProducts.id, productId));
    expect(p.luluPodPackageId).toBe("0600X0900BWSTDPB060UW444MXX");
    expect(p.luluPageCount).toBe(40);
    const variants = await getDb().select().from(merchVariants).where(eq(merchVariants.productId, productId));
    expect(variants).toHaveLength(1);
    expect(variants[0].retailPriceCents).toBe(1500);
  });

  it("422s a book missing any lulu field", async () => {
    for (const missing of ["luluFormat", "luluPageCount", "luluInteriorAssetKey", "luluCoverAssetKey"]) {
      const res = await apiFetch("/api/admin/merch/store-products", {
        method: "POST", cookie: adminCookie,
        body: JSON.stringify(bookBody(storeId, { [missing]: undefined })),
      });
      expect(res.status, `missing ${missing}`).toBe(422);
    }
  });

  it("422s asset keys outside the org's book namespace", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "POST", cookie: adminCookie,
      body: JSON.stringify(bookBody(storeId, { luluInteriorAssetKey: "merch-books/other-org/i.pdf" })),
    });
    await expectJson(res, 422);
  });

  it("book upload URLs are minted under merch-books/ and PDF-only", async () => {
    const ok = await apiFetch("/api/admin/merch/digital-asset-url", {
      method: "POST", cookie: adminCookie,
      body: JSON.stringify({ filename: "interior.pdf", contentType: "application/pdf", kind: "book" }),
    });
    const { key } = await expectJson(ok, 200);
    expect(key).toMatch(new RegExp(`^merch-books/${E2E_ORG_ID}/`));

    const bad = await apiFetch("/api/admin/merch/digital-asset-url", {
      method: "POST", cookie: adminCookie,
      body: JSON.stringify({ filename: "cover.png", contentType: "image/png", kind: "book" }),
    });
    expect(bad.status).toBe(400);
  });

  it("cost preview returns mock print + Mail shipping costs", async () => {
    const res = await apiFetch("/api/admin/merch/lulu-cost-preview", {
      method: "POST", cookie: adminCookie,
      body: JSON.stringify({ luluFormat: "6x9_bw", pageCount: 40 }),
    });
    const json = await expectJson(res, 200);
    expect(json.printCents).toBe(700);
    expect(json.mailShippingCents).toBe(399);
  });
});
