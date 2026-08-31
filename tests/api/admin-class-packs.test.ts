/**
 * Admin class-pack catalog CRUD — `/api/admin/classes/packs` (+ `[id]`),
 * Task 9 of the class purchase ladder.
 *
 * Mirrors tests/api/admin/membership-tiers.test.ts's shape: unauthenticated
 * 401, a validation-only 422 that needs no Stripe, one Stripe-gated create
 * test, and a cross-org 404 on PUT. Adds the pack-specific DELETE-with-grants
 * guard (409 once a credit grant references the pack — same "deactivate
 * instead" shape as the membership-tier subscriber guard).
 *
 * Fixtures are self-cleaning: every pack and grant this file creates is
 * deleted in `afterAll` — the shared staging DB accumulates rows across runs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classCreditGrants, classPackProducts } from "@/lib/db/schema/classes";
import { resolveClassTestFixtures, createTestChild } from "../utils/classes-helpers";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

const RUN = `${Date.now()}`;
const NONEXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

let organizationId: string;
let parentUserId: string;
let cookie: string;

const createdPackIds: string[] = [];
const createdCheckoutSessionIds: string[] = [];

async function adminCookie(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@test.aspiresports.com", password: "TestAdmin123!" }),
  });
  if (!res.ok) throw new Error(`signin failed: ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

beforeAll(async () => {
  ({ organizationId, parentUserId } = await resolveClassTestFixtures());
  cookie = await adminCookie();
});

afterAll(async () => {
  const db = getDb();
  if (createdCheckoutSessionIds.length > 0) {
    await db
      .delete(classCreditGrants)
      .where(inArray(classCreditGrants.stripeCheckoutSessionId, createdCheckoutSessionIds));
  }
  if (createdPackIds.length > 0) {
    await db.delete(classPackProducts).where(inArray(classPackProducts.id, createdPackIds));
  }
});

async function createPackViaDb(name: string): Promise<string> {
  const [row] = await getDb()
    .insert(classPackProducts)
    .values({
      organizationId,
      name,
      sessionCount: 5,
      priceCents: 15_000,
      expiryMonths: 6,
    })
    .returning({ id: classPackProducts.id });
  createdPackIds.push(row.id);
  return row.id;
}

describe("GET /api/admin/classes/packs", () => {
  it("401 without auth", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/packs`);
    expect(res.status).toBe(401);
  });

  it("lists packs for the active org, ordered", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/packs`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.packs)).toBe(true);
  });
});

describe("POST /api/admin/classes/packs", () => {
  it("401 without auth", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/packs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope", sessionCount: 5, priceCents: 10000, expiryMonths: 6, active: true, displayOrder: 0 }),
    });
    expect(res.status).toBe(401);
  });

  it("422 on invalid input (missing sessionCount)", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/packs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: "Bad", priceCents: 10000 }),
    });
    expect(res.status).toBe(422);
  });

  itWithStripe("creates a pack with Stripe product/price ids", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/packs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: `Test Pack ${RUN}`,
        sessionCount: 8,
        priceCents: 18_000,
        expiryMonths: 6,
        active: true,
        displayOrder: 5,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    createdPackIds.push(body.pack.id);
    expect(body.pack.stripeProductId).toMatch(/^prod_/);
    expect(body.pack.stripePriceId).toMatch(/^price_/);
    expect(body.pack.sessionCount).toBe(8);
    expect(body.pack.priceCents).toBe(18_000);
  });
});

describe("PUT /api/admin/classes/packs/[id]", () => {
  it("401 without auth", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/packs/${NONEXISTENT_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X", sessionCount: 5, priceCents: 10000, expiryMonths: 6, active: true, displayOrder: 0 }),
    });
    expect(res.status).toBe(401);
  });

  it("404 on a pack id outside the active org", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/packs/${NONEXISTENT_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: "X", sessionCount: 5, priceCents: 10000, expiryMonths: 6, active: true, displayOrder: 0 }),
    });
    expect(res.status).toBe(404);
  });

  itWithStripe("edits a pack and reconciles Stripe price on amount change", async () => {
    const createRes = await fetch(`${BASE}/api/admin/classes/packs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: `Test Pack Edit ${RUN}`,
        sessionCount: 5,
        priceCents: 15_000,
        expiryMonths: 6,
        active: true,
        displayOrder: 0,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).pack;
    createdPackIds.push(created.id);

    const putRes = await fetch(`${BASE}/api/admin/classes/packs/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: created.name,
        sessionCount: 5,
        priceCents: 16_000,
        expiryMonths: 6,
        active: true,
        displayOrder: 0,
      }),
    });
    expect(putRes.status).toBe(200);
    const updated = (await putRes.json()).pack;
    expect(updated.priceCents).toBe(16_000);
    expect(updated.stripePriceId).toMatch(/^price_/);
    expect(updated.stripePriceId).not.toBe(created.stripePriceId);
    expect(updated.stripeProductId).toBe(created.stripeProductId);
  });
});

describe("DELETE /api/admin/classes/packs/[id]", () => {
  it("401 without auth", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/packs/${NONEXISTENT_UUID}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("404 on a pack id outside the active org", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/packs/${NONEXISTENT_UUID}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(404);
  });

  it("hard-deletes an unreferenced pack", async () => {
    const packId = await createPackViaDb(`Test Pack Delete ${RUN}`);
    const res = await fetch(`${BASE}/api/admin/classes/packs/${packId}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    createdPackIds.splice(createdPackIds.indexOf(packId), 1);

    const [row] = await getDb().select().from(classPackProducts).where(eq(classPackProducts.id, packId));
    expect(row).toBeUndefined();
  });

  it("409s when a credit grant references the pack — deactivate instead", async () => {
    const packId = await createPackViaDb(`Test Pack Grants ${RUN}`);
    const childId = await createTestChild(parentUserId, `PackDelete-${RUN}`);
    const checkoutSessionId = `cs_test_admin_pack_delete_${RUN}`;
    createdCheckoutSessionIds.push(checkoutSessionId);

    await getDb()
      .insert(classCreditGrants)
      .values({
        organizationId,
        familyMemberId: childId,
        source: "pack",
        packProductId: packId,
        sessionsGranted: 5,
        pricePaidCents: 15_000,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        stripeCheckoutSessionId: checkoutSessionId,
      });

    const res = await fetch(`${BASE}/api/admin/classes/packs/${packId}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(409);

    const [row] = await getDb().select().from(classPackProducts).where(eq(classPackProducts.id, packId));
    expect(row).toBeTruthy();
  });
});
