import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { mediaAssets, shootSessions } from "@/lib/db/schema/media";
import { eq } from "drizzle-orm";
import { recomputeBurstsForSession } from "@/lib/media/burst-job";

describe("recomputeBurstsForSession", () => {
  let sessionId: string;

  beforeAll(async () => {
    const db = getDb();
    const orgRows = (await db.execute(
      `select id from organizations limit 1`
    )) as Array<{ id: string }>;
    const orgId = orgRows[0].id;

    const userRows = (await db.execute(
      `select id from users limit 1`
    )) as Array<{ id: string }>;
    const userId = userRows[0].id;

    const [s] = await db
      .insert(shootSessions)
      .values({
        organizationId: orgId,
        sessionType: "game",
        status: "uploaded",
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 60 * 60 * 1000),
        rateType: "per_game",
        rateCents: 0,
        payoutStatus: "unearned",
        assignedByUserId: userId,
        assignedUserId: userId,
      })
      .returning();
    sessionId = s.id;

    const base = new Date("2026-04-19T14:00:00.000Z");
    for (const [offset, fname] of [
      [0, "a.jpg"],
      [1000, "b.jpg"],
      [1800, "c.jpg"],
      [10_000, "d.jpg"],
    ] as const) {
      await db.insert(mediaAssets).values({
        shootSessionId: sessionId,
        organizationId: orgId,
        assetType: "photo",
        storageKey: `test/${fname}`,
        originalFilename: fname,
        fileSizeBytes: 1,
        mimeType: "image/jpeg",
        capturedAt: new Date(base.getTime() + offset),
        uploadedAt: new Date(),
        status: "uploaded",
      });
    }
  });

  it("assigns shared burst_group_id to neighbors within 2s", async () => {
    const { updated } = await recomputeBurstsForSession(sessionId);
    expect(updated).toBe(4);

    const assets = await getDb()
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.shootSessionId, sessionId));
    const byName = Object.fromEntries(
      assets.map((a) => [a.originalFilename, a.burstGroupId])
    );
    expect(byName["a.jpg"]).toBe(byName["b.jpg"]);
    expect(byName["b.jpg"]).toBe(byName["c.jpg"]);
    expect(byName["d.jpg"]).not.toBe(byName["a.jpg"]);
    expect(byName["a.jpg"]).toBeTruthy();
  });

  it("is idempotent (second run updates 0)", async () => {
    const { updated } = await recomputeBurstsForSession(sessionId);
    expect(updated).toBe(0);
  });
});
