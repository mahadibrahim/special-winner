/**
 * Integration: admin block endpoints — preview, list, create, tenancy.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { getAdminCookie, getParentCookie, apiFetch } from "../../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID, resolveE2ELocationId } from "@/lib/db/seeds/seed-e2e-tests";

let admin: string;
let parent: string;
let E2E_LOCATION_ID: string;
const blocks: string[] = [];

const pattern = {
  timeZone: "America/New_York",
  firstDate: "2042-01-07",
  lastDate: "2042-01-28",
  days: [{ weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [E2E_RENTAL_VENUE_ID] }],
};

const body = (over: Record<string, unknown> = {}) => ({
  locationId: E2E_LOCATION_ID,
  brand: "soccerone",
  label: `Endpoint Block ${Math.random().toString(36).slice(2, 8)}`,
  renterName: "Endpoint Tester",
  renterEmail: "endpoint-tester@test.aspiresports.com",
  partySize: 12,
  pattern,
  excludedKeys: [],
  sessionOverrides: {},
  extraSessions: [],
  discount: { kind: "percent", value: 10 },
  depositPct: 25,
  mode: "draft",
  ...over,
});

beforeAll(async () => {
  admin = await getAdminCookie();
  parent = await getParentCookie();
  E2E_LOCATION_ID = await resolveE2ELocationId();
});

afterAll(async () => {
  const db = getDb();
  if (blocks.length) {
    await db.delete(fieldRentals).where(inArray(fieldRentals.blockId, blocks));
    await db.delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, blocks));
  }
});

describe("POST /api/admin/rentals/blocks/generate-preview", () => {
  it("prices the generated sessions without persisting anything", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks/generate-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body()),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessions).toHaveLength(4);
    expect(json.subtotalCents).toBe(4 * 26000);
    expect(json.totalCents).toBe(93600);
    expect(json.depositDueCents).toBe(23400);
    expect(json.balanceDueAt).toBeTruthy();
    expect(json.sessions[0].venueName).toBeTruthy();
  });

  it("rejects a non-admin", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks/generate-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: parent },
      body: JSON.stringify(body()),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("rejects a location from another org", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks/generate-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body({ locationId: "00000000-0000-0000-0000-000000000000" })),
    });
    expect([403, 404]).toContain(res.status);
  });

  it("rejects a malformed pattern", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks/generate-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body({ pattern: { ...pattern, firstDate: "nope" } })),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/rentals/blocks", () => {
  it("creates a draft block", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body()),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    blocks.push(json.blockId);
    expect(json.blockId).toBeTruthy();
    expect(json.sessionIds).toEqual([]);
  });

  it("returns 409 with the conflicting session keys", async () => {
    const p = { ...pattern, firstDate: "2042-02-04", lastDate: "2042-02-25" };
    const first = await apiFetch("/api/admin/rentals/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body({ pattern: p, mode: "send_deposit" })),
    });
    expect(first.status).toBe(200);
    blocks.push((await first.json()).blockId);

    const second = await apiFetch("/api/admin/rentals/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body({ pattern: p, mode: "send_deposit" })),
    });
    expect(second.status).toBe(409);
    const json = await second.json();
    expect(json.conflicts.length).toBeGreaterThan(0);
  });

  it("rejects a non-admin", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: parent },
      body: JSON.stringify(body()),
    });
    expect([401, 403]).toContain(res.status);
  });
});

describe("GET /api/admin/rentals/blocks", () => {
  it("lists blocks for the admin's org", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks", { headers: { Cookie: admin } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.blocks)).toBe(true);
    if (json.blocks.length) {
      expect(json.blocks[0]).toHaveProperty("sessionCount");
      expect(json.blocks[0]).toHaveProperty("overdue");
    }
  });

  it("filters by status", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks?status=draft", { headers: { Cookie: admin } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.blocks.every((b: { status: string }) => b.status === "draft")).toBe(true);
  });
});
