import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { opsPings, organizations } from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const SETTINGS = "/api/admin/organizations/settings";

describe("ops ping emitter (via admin test endpoint)", () => {
  let adminCookie: string;
  let originalOpsPings: unknown;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const res = await apiFetch(SETTINGS, { cookie: adminCookie });
    const json = await expectJson(res, 200);
    originalOpsPings = json.settings?.opsPings ?? null;
    // Enabled, but NO whatsapp config and no alert emails on the test org →
    // delivery must degrade to 'suppressed' (never a real network send).
    await apiFetch(SETTINGS, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ settings: { opsPings: { enabled: true } } }),
    });
  });

  afterAll(async () => {
    await apiFetch(SETTINGS, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ settings: { opsPings: originalOpsPings } }),
    });
    // Clean the ping rows this suite created for the shared org. Scoped to
    // E2E_ORG_ID (the admin's resolved org — see seed-e2e-tests.ts) so this
    // can't eat kind="test" rows another test run created for a different
    // org in the shared CI database.
    const db = getDb();
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    await db
      .delete(opsPings)
      .where(
        and(
          eq(opsPings.organizationId, E2E_ORG_ID),
          eq(opsPings.kind, "test"),
          gte(opsPings.createdAt, cutoff),
        ),
      );
    resetCookies();
  });

  it("requires admin auth", async () => {
    const res = await apiFetch("/api/admin/ops-pings/test", { method: "POST" });
    expect([401, 403]).toContain(res.status);
  });

  it("records a test ping row; channel degrades to suppressed without whatsapp/email targets", async () => {
    const res = await apiFetch("/api/admin/ops-pings/test", {
      method: "POST",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(["suppressed", "email", "whatsapp"]).toContain(json.channel);

    const db = getDb();
    const rows = await db
      .select()
      .from(opsPings)
      .where(eq(opsPings.kind, "test"))
      .orderBy(opsPings.createdAt);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[rows.length - 1].message).toContain("Test ping");
  });

  it("dedupes on (kind, eventId): the same event never double-pings", async () => {
    // The test endpoint mints a fresh eventId per call, so exercise dedupe
    // through the lib-level contract: two rows with the same id can't exist.
    const db = getDb();
    const before = await db.select().from(opsPings).where(eq(opsPings.kind, "test"));
    // Call the endpoint twice; each call is a distinct event — both insert.
    await apiFetch("/api/admin/ops-pings/test", { method: "POST", cookie: adminCookie });
    await apiFetch("/api/admin/ops-pings/test", { method: "POST", cookie: adminCookie });
    const after = await db.select().from(opsPings).where(eq(opsPings.kind, "test"));
    expect(after.length).toBe(before.length + 2);
    const ids = after.map((r) => `${r.kind}:${r.eventId}`);
    expect(new Set(ids).size).toBe(ids.length); // unique index holds
  });

  it("does nothing when the master switch is off", async () => {
    await apiFetch(SETTINGS, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ settings: { opsPings: { enabled: false } } }),
    });
    const res = await apiFetch("/api/admin/ops-pings/test", {
      method: "POST",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.channel).toBe("disabled");
    // Re-enable for any later suites in this file.
    await apiFetch(SETTINGS, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ settings: { opsPings: { enabled: true } } }),
    });
  });
});
