import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { selfServiceTokens } from "@/lib/db/schema/self-service-tokens";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { randomUUID } from "node:crypto";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

describe("POST /api/cron/cleanup-self-service-tokens", () => {
  it("deletes tokens older than 30 days and leaves newer ones alone", async () => {
    // 31 days ago — past the grace period, should be deleted
    const oldToken = randomUUID();
    const [oldRow] = await getDb()
      .insert(selfServiceTokens)
      .values({
        token: oldToken,
        kind: "field_rental",
        targetId: randomUUID(),
        organizationId: E2E_ORG_ID,
        sentVia: "kiosk_search",
        expiresAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      })
      .returning();

    expect(oldRow).toBeDefined();
    const oldId = oldRow!.id;

    // 5 days ago — within the 30-day grace, should NOT be deleted
    const recentToken = randomUUID();
    const [recentRow] = await getDb()
      .insert(selfServiceTokens)
      .values({
        token: recentToken,
        kind: "field_rental",
        targetId: randomUUID(),
        organizationId: E2E_ORG_ID,
        sentVia: "kiosk_search",
        expiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      })
      .returning();

    expect(recentRow).toBeDefined();
    const recentId = recentRow!.id;

    // In the future — not yet expired, should NOT be deleted
    const futureToken = randomUUID();
    const [futureRow] = await getDb()
      .insert(selfServiceTokens)
      .values({
        token: futureToken,
        kind: "field_rental",
        targetId: randomUUID(),
        organizationId: E2E_ORG_ID,
        sentVia: "kiosk_search",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();

    expect(futureRow).toBeDefined();
    const futureId = futureRow!.id;

    // POST the cron route with the correct secret
    const res = await fetch(
      `${BASE_URL}/api/cron/cleanup-self-service-tokens`,
      {
        method: "POST",
        headers: {
          "x-cron-secret": CRON_SECRET,
          Origin: BASE_URL,
        },
      },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBeGreaterThanOrEqual(1);

    // 31-day-old row should be gone
    const [deletedRow] = await getDb()
      .select()
      .from(selfServiceTokens)
      .where(eq(selfServiceTokens.id, oldId));
    expect(deletedRow).toBeUndefined();

    // 5-day-old row should still exist
    const [survivingRow] = await getDb()
      .select()
      .from(selfServiceTokens)
      .where(eq(selfServiceTokens.id, recentId));
    expect(survivingRow).toBeDefined();

    // Future row should still exist
    const [futureSurvivingRow] = await getDb()
      .select()
      .from(selfServiceTokens)
      .where(eq(selfServiceTokens.id, futureId));
    expect(futureSurvivingRow).toBeDefined();

    // Clean up surviving rows
    await getDb()
      .delete(selfServiceTokens)
      .where(eq(selfServiceTokens.id, recentId));
    await getDb()
      .delete(selfServiceTokens)
      .where(eq(selfServiceTokens.id, futureId));
  });

  it("returns 401 when x-cron-secret header is missing", async () => {
    const res = await fetch(
      `${BASE_URL}/api/cron/cleanup-self-service-tokens`,
      {
        method: "POST",
        headers: {
          Origin: BASE_URL,
        },
      },
    );

    expect(res.status).toBe(401);
  });

  it("returns 401 when x-cron-secret header is wrong", async () => {
    const res = await fetch(
      `${BASE_URL}/api/cron/cleanup-self-service-tokens`,
      {
        method: "POST",
        headers: {
          "x-cron-secret": "nope",
          Origin: BASE_URL,
        },
      },
    );

    expect(res.status).toBe(401);
  });
});
