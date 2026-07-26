/**
 * Admin store CRUD — org-scoped merch stores (Phase 3b, Task 4.1).
 *
 * Covers: auth gate, general/team store creation, unlisted stores getting a
 * shareToken, tenant isolation (cross-org id → 404), and DELETE being
 * blocked (409) when the store has orders vs. allowed (200) when empty.
 *
 * Org B's id comes from GET /api/test/org-fixtures?slug=orgb (only enabled
 * with E2E_TEST_ENDPOINTS=yes) — same pattern as admin-tenant-scoping.test.ts.
 * We can't sign in "as" an Org B admin against localhost (org context here
 * resolves from the request host, not the caller — see
 * admin-tenant-scoping.test.ts), so the Org B fixture store is inserted
 * directly via the db, mirroring venue-hold-visibility.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, getAdminCookie, expectJson, testSlug } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { merchStores, merchOrders } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

let adminCookie: string;
let adminUserId: string;
let teamId: string;

// Tracks every store we create so afterAll can sweep them off the shared
// staging db even if an assertion fails mid-test.
const createdStoreIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(async () => {
  adminCookie = await getAdminCookie();

  const me = await (await apiFetch("/api/auth/me", { cookie: adminCookie })).json();
  adminUserId = me.user?.id;
  expect(adminUserId).toBeTruthy();

  const list = await expectJson(
    await apiFetch("/api/admin/merch/stores", { cookie: adminCookie }),
    200,
  );
  expect(Array.isArray(list.teams)).toBe(true);
  expect(list.teams.length).toBeGreaterThan(0);
  teamId = list.teams[0].id;
});

afterAll(async () => {
  const db = getDb();
  if (createdOrderIds.length) {
    await db.delete(merchOrders).where(inArray(merchOrders.id, createdOrderIds));
  }
  if (createdStoreIds.length) {
    await db.delete(merchStores).where(inArray(merchStores.id, createdStoreIds));
  }
});

describe("/api/admin/merch/stores — auth gate", () => {
  it("GET unauth → 401", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/stores`)).status).toBe(401);
  });
  it("POST unauth → 401", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/stores`, { method: "POST" })).status).toBe(401);
  });
  it("PUT unauth → 401", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/stores`, { method: "PUT" })).status).toBe(401);
  });
  it("DELETE unauth → 401", async () => {
    expect(
      (await fetch(`${BASE}/api/admin/merch/stores?id=00000000-0000-0000-0000-000000000000`, {
        method: "DELETE",
      })).status,
    ).toBe(401);
  });
});

describe("/api/admin/merch/stores — create", () => {
  it("creates a team store (scope='team')", async () => {
    const res = await apiFetch("/api/admin/merch/stores", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        scope: "team",
        teamId,
        name: testSlug("Team Store"),
        visibility: "public",
        active: true,
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.store.id).toBeTruthy();
    expect(json.store.scope).toBe("team");
    expect(json.store.teamId).toBe(teamId);
    expect(json.store.shareToken).toBeNull();
    createdStoreIds.push(json.store.id);
  });

  it("rejects scope='team' without a teamId (400)", async () => {
    const res = await apiFetch("/api/admin/merch/stores", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        scope: "team",
        name: testSlug("Team Store No Id"),
        visibility: "public",
        active: true,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects scope='team' with a foreign teamId (404, not another org's team)", async () => {
    const res = await apiFetch("/api/admin/merch/stores", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        scope: "team",
        teamId: "99999999-9999-4999-8999-999999999999",
        name: testSlug("Team Store Bad Team"),
        visibility: "public",
        active: true,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("an unlisted store auto-generates a shareToken", async () => {
    const res = await apiFetch("/api/admin/merch/stores", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        scope: "team",
        teamId,
        name: testSlug("Unlisted Team Store"),
        visibility: "unlisted",
        active: true,
      }),
    });
    const json = await expectJson(res, 201);
    expect(typeof json.store.shareToken).toBe("string");
    expect(json.store.shareToken.length).toBeGreaterThan(0);
    createdStoreIds.push(json.store.id);
  });

  it("derives a slug from the name when none is given", async () => {
    const name = `Slug Derive ${Date.now()}`;
    const res = await apiFetch("/api/admin/merch/stores", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ scope: "team", teamId, name, visibility: "public", active: true }),
    });
    const json = await expectJson(res, 201);
    expect(json.store.slug).toContain("slug-derive");
    createdStoreIds.push(json.store.id);
  });

  it("rejects a second general store for the org (409)", async () => {
    // Whether or not a general store already exists from prior runs, the
    // first create here either succeeds (and we track it for cleanup) or
    // the org already has one — either way, a second attempt must 409.
    const first = await apiFetch("/api/admin/merch/stores", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        scope: "general",
        name: testSlug("General Store"),
        visibility: "public",
        active: true,
      }),
    });
    if (first.status === 201) {
      const json = await first.json();
      createdStoreIds.push(json.store.id);
    } else {
      expect(first.status).toBe(409);
    }

    const second = await apiFetch("/api/admin/merch/stores", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        scope: "general",
        name: testSlug("Second General Store"),
        visibility: "public",
        active: true,
      }),
    });
    expect(second.status).toBe(409);
  });
});

describe("/api/admin/merch/stores — update", () => {
  let storeId: string;

  beforeAll(async () => {
    const res = await apiFetch("/api/admin/merch/stores", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        scope: "team",
        teamId,
        name: testSlug("Update Target Store"),
        visibility: "public",
        active: true,
      }),
    });
    const json = await expectJson(res, 201);
    storeId = json.store.id;
    createdStoreIds.push(storeId);
  });

  it("updates name/visibility and toggling to unlisted assigns a shareToken", async () => {
    const res = await apiFetch("/api/admin/merch/stores", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        id: storeId,
        scope: "team",
        teamId,
        name: "Renamed Store",
        visibility: "unlisted",
        active: true,
      }),
    });
    const json = await expectJson(res, 200);
    expect(json.store.name).toBe("Renamed Store");
    expect(typeof json.store.shareToken).toBe("string");
  });

  it("toggling back to public clears the shareToken", async () => {
    const res = await apiFetch("/api/admin/merch/stores", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        id: storeId,
        scope: "team",
        teamId,
        name: "Renamed Store",
        visibility: "public",
        active: true,
      }),
    });
    const json = await expectJson(res, 200);
    expect(json.store.shareToken).toBeNull();
  });
});

describe("/api/admin/merch/stores — tenant isolation", () => {
  let orgBStoreId: string;

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
    // so we can't create this via the API as an Org B admin — insert
    // directly, same rationale as admin-tenant-scoping.test.ts.
    const [row] = await getDb().insert(merchStores).values({
      organizationId: orgBId,
      scope: "general",
      name: "Org B Fixture Store",
      slug: testSlug("orgb-fixture-store"),
      visibility: "public",
    }).returning();
    orgBStoreId = row.id;
  });

  afterAll(async () => {
    await getDb().delete(merchStores).where(eq(merchStores.id, orgBStoreId));
  });

  it("PUT with an Org B store id via Org A context → 404", async () => {
    const res = await apiFetch("/api/admin/merch/stores", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        id: orgBStoreId,
        scope: "general",
        name: "Hacked Store",
        visibility: "public",
        active: true,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE with an Org B store id via Org A context → 404", async () => {
    const res = await apiFetch(`/api/admin/merch/stores?id=${orgBStoreId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    expect(res.status).toBe(404);
  });
});

describe("/api/admin/merch/stores — delete", () => {
  it("blocks deletion (409) when the store has orders, then allows it once orders are gone", async () => {
    const createRes = await apiFetch("/api/admin/merch/stores", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        scope: "team",
        teamId,
        name: testSlug("Store With Orders"),
        visibility: "public",
        active: true,
      }),
    });
    const created = await expectJson(createRes, 201);
    const storeId = created.store.id;
    createdStoreIds.push(storeId);

    const [order] = await getDb().insert(merchOrders).values({
      organizationId: E2E_ORG_ID,
      storeId,
      userId: adminUserId,
      email: "orders-fixture@test.aspiresports.com",
      shippingAddress: {
        name: "Test Buyer",
        address1: "123 Test St",
        city: "Columbus",
        state: "OH",
        zip: "43085",
        country: "US",
      },
      subtotalCents: 1000,
      shippingCents: 500,
      totalCents: 1500,
    }).returning();
    createdOrderIds.push(order.id);

    const blockedRes = await apiFetch(`/api/admin/merch/stores?id=${storeId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    const blockedJson = await expectJson(blockedRes, 409);
    expect(blockedJson.error).toMatch(/deactivate/i);

    // Remove the order, then the empty store must delete cleanly.
    await getDb().delete(merchOrders).where(eq(merchOrders.id, order.id));
    createdOrderIds.splice(createdOrderIds.indexOf(order.id), 1);

    const okRes = await apiFetch(`/api/admin/merch/stores?id=${storeId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    const okJson = await expectJson(okRes, 200);
    expect(okJson.success).toBe(true);
    createdStoreIds.splice(createdStoreIds.indexOf(storeId), 1);
  });

  it("deletes an empty store with no orders (200)", async () => {
    const createRes = await apiFetch("/api/admin/merch/stores", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        scope: "team",
        teamId,
        name: testSlug("Empty Store"),
        visibility: "public",
        active: true,
      }),
    });
    const created = await expectJson(createRes, 201);
    const storeId = created.store.id;

    const res = await apiFetch(`/api/admin/merch/stores?id=${storeId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.success).toBe(true);
  });
});
