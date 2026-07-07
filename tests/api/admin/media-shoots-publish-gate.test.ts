import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, getMediaStaffCookie, apiFetch, expectJson } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { mediaAssets, mediaTags, mediaAuditLog, shootSessions } from "@/lib/db/schema/media";
import { mediaDoNotPublish } from "@/lib/db/schema/media-do-not-publish";
import { setDoNotPublish } from "@/lib/consents/do-not-publish";
import { eq, and, desc } from "drizzle-orm";

/**
 * End-to-end (real DB, real dev server) coverage of Task 5's publish-gate
 * surfacing for the individual opt-out. This dev server does not set
 * MEDIA_AUTH_HARD_BLOCK, so it exercises the soft-warn branch — the
 * hard-block 422 branch is covered by the mocked unit test in
 * tests/unit/media/shoots-publish-gate.test.ts (MEDIA_AUTH_HARD_BLOCK is a
 * static per-process env read; flipping it here would require a second
 * dev server instance).
 */
describe("Publish gate — individual opt-out surfacing (soft-warn, real DB)", () => {
  const ENDPOINT = "/api/admin/media/shoots";

  let adminCookie: string;
  let adminUserId: string;
  let mediaStaffUserId: string;
  let familyMemberId: string;
  let registrationId: string;
  let sessionId: string;
  let assetId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const mediaCookie = await getMediaStaffCookie();

    const meAdmin = await apiFetch("/api/auth/me", { method: "GET", cookie: adminCookie });
    adminUserId = (await expectJson(meAdmin, 200)).user.id;

    const meMedia = await apiFetch("/api/auth/me", { method: "GET", cookie: mediaCookie });
    mediaStaffUserId = (await expectJson(meMedia, 200)).user.id;

    const fixturesA = await apiFetch("/api/test/org-fixtures?slug=aspire-sports");
    const fixturesAJson = await expectJson(fixturesA, 200);
    expect(fixturesAJson.seasonId).toBeTruthy();
    expect(fixturesAJson.org.id).toBeTruthy();

    const db = getDb();

    const [fm] = await db
      .insert(familyMembers)
      .values({
        parentUserId: adminUserId,
        firstName: "OptOut",
        lastName: `PublishGate-${Date.now()}`,
        birthDate: "2016-01-01",
      })
      .returning();
    familyMemberId = fm.id;

    const [reg] = await db
      .insert(registrations)
      .values({
        seasonId: fixturesAJson.seasonId,
        familyMemberId: fm.id,
        registeredByUserId: adminUserId,
        amountDueCents: 0,
      })
      .returning();
    registrationId = reg.id;

    // Mark the individual do-not-publish — no consent is ever granted for
    // this family_member, so they'll also land in `missing`. The point of
    // this test is that both blockers are captured distinctly.
    await setDoNotPublish({
      db,
      organizationId: fixturesAJson.org.id,
      familyMemberId: fm.id,
      reason: "Publish-gate integration test",
      setByUserId: adminUserId,
    });

    // Create the shoot session via the real endpoint (exercises the normal
    // create path) and directly seed a face-tagged asset — Task 5 is about
    // the PATCH publish-gate behavior, not the tagging UI.
    const scheduledStart = new Date(Date.now() + 7 * 86400_000).toISOString();
    const scheduledEnd = new Date(Date.now() + 7 * 86400_000 + 2 * 3600_000).toISOString();
    const createRes = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        assignedUserId: mediaStaffUserId,
        sessionType: "game",
        scheduledStart,
        scheduledEnd,
        rateType: "per_game",
        rateCents: 5000,
      }),
    });
    const createJson = await expectJson(createRes, 201);
    sessionId = createJson.session.id;

    const [asset] = await db
      .insert(mediaAssets)
      .values({
        shootSessionId: sessionId,
        organizationId: fixturesAJson.org.id,
        assetType: "photo",
        storageKey: `test/publish-gate/${sessionId}.jpg`,
        originalFilename: "publish-gate-test.jpg",
        status: "tagged",
      })
      .returning();
    assetId = asset.id;

    await db.insert(mediaTags).values({
      mediaAssetId: assetId,
      familyMemberId: fm.id,
      tagScope: "player",
      source: "manual_admin",
      taggedByUserId: adminUserId,
    });
  });

  afterAll(async () => {
    const db = getDb();
    if (assetId) await db.delete(mediaTags).where(eq(mediaTags.mediaAssetId, assetId));
    if (assetId) await db.delete(mediaAssets).where(eq(mediaAssets.id, assetId));
    if (sessionId) await db.delete(shootSessions).where(eq(shootSessions.id, sessionId));
    if (familyMemberId) {
      await db.delete(mediaDoNotPublish).where(eq(mediaDoNotPublish.familyMemberId, familyMemberId));
    }
    if (registrationId) await db.delete(registrations).where(eq(registrations.id, registrationId));
    if (familyMemberId) await db.delete(familyMembers).where(eq(familyMembers.id, familyMemberId));
  });

  it("PATCH to published still succeeds (soft-warn) and the audit log distinguishes missing vs. opted-out", async () => {
    const res = await apiFetch(`${ENDPOINT}/${sessionId}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ status: "published" }),
    });
    const json = await expectJson(res, 200);
    expect(json.session.status).toBe("published");

    const db = getDb();
    const [auditRow] = await db
      .select()
      .from(mediaAuditLog)
      .where(
        and(
          eq(mediaAuditLog.entityType, "session"),
          eq(mediaAuditLog.entityId, sessionId),
          eq(mediaAuditLog.action, "publish"),
        ),
      )
      .orderBy(desc(mediaAuditLog.createdAt))
      .limit(1);

    expect(auditRow).toBeDefined();
    const diff = auditRow.diff as {
      softWarn: string;
      missing: Array<{ familyMemberId: string }>;
      doNotPublish: Array<{ familyMemberId: string; reason: string | null }>;
    };
    expect(diff.softWarn).toBe("missing_media_auth_consent_or_do_not_publish");
    expect(diff.missing.some((m) => m.familyMemberId === familyMemberId)).toBe(true);
    const optOutEntry = diff.doNotPublish.find((m) => m.familyMemberId === familyMemberId);
    expect(optOutEntry).toBeDefined();
    expect(optOutEntry?.reason).toBe("Publish-gate integration test");
  });
});
