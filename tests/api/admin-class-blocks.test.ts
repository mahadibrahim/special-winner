/**
 * Admin class-block window CRUD — `/api/admin/classes/blocks` (+ `[id]`),
 * Task 10 of the class purchase ladder.
 *
 * Mirrors tests/api/admin-class-packs.test.ts's shape (Task 9): unauthenticated
 * 401, cross-org 404 via a nonexistent uuid, delete-with-grants 409. Blocks
 * have no Stripe objects (priced dynamically at purchase), so create/edit
 * need no Stripe gate — every test here runs unconditionally. Adds the
 * block-specific validation: endDate >= startDate (422) and overlapping
 * ACTIVE windows (422 `overlapping_block`), excluding self on update.
 *
 * Fixtures are self-cleaning: every block and grant this file creates is
 * deleted in `afterAll` — the shared staging DB accumulates rows across runs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classBlocks, classCreditGrants } from "@/lib/db/schema/classes";
import { resolveClassTestFixtures, createTestChild } from "../utils/classes-helpers";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

const RUN = `${Date.now()}`;
const NONEXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

let organizationId: string;
let parentUserId: string;
let cookie: string;

const createdBlockIds: string[] = [];
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
  if (createdBlockIds.length > 0) {
    await db.delete(classBlocks).where(inArray(classBlocks.id, createdBlockIds));
  }
});

/** Creates a block directly via DB, far enough in the future (and narrow
 *  enough) that it can't collide with another test's window by accident. */
async function createBlockViaDb(
  name: string,
  startDate: string,
  endDate: string,
  active = true,
): Promise<string> {
  const [row] = await getDb()
    .insert(classBlocks)
    .values({ organizationId, name, startDate, endDate, active })
    .returning({ id: classBlocks.id });
  createdBlockIds.push(row.id);
  return row.id;
}

describe("GET /api/admin/classes/blocks", () => {
  it("401 without auth", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/blocks`);
    expect(res.status).toBe(401);
  });

  it("lists blocks for the active org", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/blocks`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.blocks)).toBe(true);
  });
});

describe("POST /api/admin/classes/blocks", () => {
  it("401 without auth", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope", startDate: "2030-01-01", endDate: "2030-02-01", active: true }),
    });
    expect(res.status).toBe(401);
  });

  it("422 on invalid input (missing name)", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ startDate: "2030-01-01", endDate: "2030-02-01" }),
    });
    expect(res.status).toBe(422);
  });

  it("422 when endDate is before startDate", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: `Test Block Bad Dates ${RUN}`,
        startDate: "2030-03-01",
        endDate: "2030-02-01",
        active: true,
      }),
    });
    expect(res.status).toBe(422);
  });

  it("creates a block", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: `Test Block Create ${RUN}`,
        startDate: "2031-01-15",
        endDate: "2031-03-15",
        active: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    createdBlockIds.push(body.block.id);
    expect(body.block.name).toBe(`Test Block Create ${RUN}`);
    expect(body.block.startDate).toBe("2031-01-15");
    expect(body.block.endDate).toBe("2031-03-15");
    expect(body.block.active).toBe(true);
  });

  it("422s (overlapping_block) when it overlaps an existing ACTIVE block", async () => {
    await createBlockViaDb(`Test Block Overlap Base ${RUN}`, "2032-01-01", "2032-02-01", true);

    const res = await fetch(`${BASE}/api/admin/classes/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: `Test Block Overlap New ${RUN}`,
        startDate: "2032-01-15",
        endDate: "2032-02-15",
        active: true,
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("overlapping_block");
  });

  it("does NOT reject an overlap with an INACTIVE block", async () => {
    await createBlockViaDb(`Test Block Inactive Base ${RUN}`, "2033-01-01", "2033-02-01", false);

    const res = await fetch(`${BASE}/api/admin/classes/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: `Test Block Over Inactive ${RUN}`,
        startDate: "2033-01-15",
        endDate: "2033-02-15",
        active: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    createdBlockIds.push(body.block.id);
  });
});

describe("PUT /api/admin/classes/blocks/[id]", () => {
  it("401 without auth", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/blocks/${NONEXISTENT_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X", startDate: "2030-01-01", endDate: "2030-02-01", active: true }),
    });
    expect(res.status).toBe(401);
  });

  it("404 on a block id outside the active org", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/blocks/${NONEXISTENT_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: "X", startDate: "2030-01-01", endDate: "2030-02-01", active: true }),
    });
    expect(res.status).toBe(404);
  });

  it("edits a block's fields", async () => {
    const blockId = await createBlockViaDb(`Test Block Edit ${RUN}`, "2034-01-01", "2034-02-01", true);

    const res = await fetch(`${BASE}/api/admin/classes/blocks/${blockId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: `Test Block Edit Renamed ${RUN}`,
        startDate: "2034-01-01",
        endDate: "2034-02-10",
        active: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.block.name).toBe(`Test Block Edit Renamed ${RUN}`);
    expect(body.block.endDate).toBe("2034-02-10");
  });

  it("excludes self from the overlap check (no-op save of its own window)", async () => {
    const blockId = await createBlockViaDb(`Test Block SelfOverlap ${RUN}`, "2035-01-01", "2035-02-01", true);

    const res = await fetch(`${BASE}/api/admin/classes/blocks/${blockId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: `Test Block SelfOverlap ${RUN}`,
        startDate: "2035-01-01",
        endDate: "2035-02-01",
        active: true,
      }),
    });
    expect(res.status).toBe(200);
  });

  it("422s (overlapping_block) when edited to overlap ANOTHER active block", async () => {
    await createBlockViaDb(`Test Block OverlapEdit Base ${RUN}`, "2036-01-01", "2036-02-01", true);
    const movingId = await createBlockViaDb(`Test Block OverlapEdit Moving ${RUN}`, "2036-06-01", "2036-07-01", true);

    const res = await fetch(`${BASE}/api/admin/classes/blocks/${movingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: `Test Block OverlapEdit Moving ${RUN}`,
        startDate: "2036-01-15",
        endDate: "2036-02-15",
        active: true,
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("overlapping_block");
  });
});

describe("DELETE /api/admin/classes/blocks/[id]", () => {
  it("401 without auth", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/blocks/${NONEXISTENT_UUID}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("404 on a block id outside the active org", async () => {
    const res = await fetch(`${BASE}/api/admin/classes/blocks/${NONEXISTENT_UUID}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(404);
  });

  it("hard-deletes an unreferenced block", async () => {
    const blockId = await createBlockViaDb(`Test Block Delete ${RUN}`, "2037-01-01", "2037-02-01", true);
    const res = await fetch(`${BASE}/api/admin/classes/blocks/${blockId}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    createdBlockIds.splice(createdBlockIds.indexOf(blockId), 1);

    const [row] = await getDb().select().from(classBlocks).where(eq(classBlocks.id, blockId));
    expect(row).toBeUndefined();
  });

  it("409s when a credit grant references the block — deactivate instead", async () => {
    const blockId = await createBlockViaDb(`Test Block Grants ${RUN}`, "2038-01-01", "2038-02-01", true);
    const childId = await createTestChild(parentUserId, `BlockDelete-${RUN}`);
    const checkoutSessionId = `cs_test_admin_block_delete_${RUN}`;
    createdCheckoutSessionIds.push(checkoutSessionId);

    await getDb()
      .insert(classCreditGrants)
      .values({
        organizationId,
        familyMemberId: childId,
        source: "block",
        blockId,
        sessionsGranted: 8,
        pricePaidCents: 20_000,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        stripeCheckoutSessionId: checkoutSessionId,
      });

    const res = await fetch(`${BASE}/api/admin/classes/blocks/${blockId}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(409);

    const [row] = await getDb().select().from(classBlocks).where(eq(classBlocks.id, blockId));
    expect(row).toBeTruthy();
  });
});
