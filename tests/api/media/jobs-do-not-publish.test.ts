import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  getMediaStaffCookie,
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { mediaDoNotPublish } from "@/lib/db/schema/media-do-not-publish";
import { shootSessions } from "@/lib/db/schema/media";
import { setDoNotPublish } from "@/lib/consents/do-not-publish";
import { eq } from "drizzle-orm";

/**
 * The photographer "do not feature these people" reference list
 * (product-backlog build #3, Task 6). Self-seeds a deterministic Org A
 * family_member with an active opt-out, plus a shoot session assigned to
 * the media_staff test account.
 */
describe("GET /api/media/jobs/:id/do-not-publish", () => {
  let adminCookie: string;
  let mediaCookie: string;
  let coachCookie: string;
  let adminUserId: string;
  let mediaStaffUserId: string;
  let sessionId: string;
  let familyMemberId: string;
  let registrationId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    mediaCookie = await getMediaStaffCookie();
    coachCookie = await getCoachCookie();

    const meAdmin = await apiFetch("/api/auth/me", { method: "GET", cookie: adminCookie });
    adminUserId = (await expectJson(meAdmin, 200)).user.id;

    const meMedia = await apiFetch("/api/auth/me", { method: "GET", cookie: mediaCookie });
    mediaStaffUserId = (await expectJson(meMedia, 200)).user.id;

    const fixturesA = await apiFetch("/api/test/org-fixtures?slug=aspire-sports");
    const fixturesAJson = await expectJson(fixturesA, 200);
    expect(fixturesAJson.seasonId).toBeTruthy();

    const db = getDb();
    const [fm] = await db
      .insert(familyMembers)
      .values({
        parentUserId: adminUserId,
        firstName: "OptOut",
        lastName: `PhotographerList-${Date.now()}`,
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

    await setDoNotPublish({
      db,
      organizationId: fixturesAJson.org.id,
      familyMemberId: fm.id,
      reason: "Photographer reference list test",
      setByUserId: adminUserId,
    });

    const create = await apiFetch("/api/admin/media/shoots", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        assignedUserId: mediaStaffUserId,
        sessionType: "game",
        scheduledStart: new Date(Date.now() + 4 * 86400_000).toISOString(),
        scheduledEnd: new Date(Date.now() + 4 * 86400_000 + 2 * 3600_000).toISOString(),
      }),
    });
    sessionId = (await expectJson(create, 201)).session.id;
  });

  afterAll(async () => {
    resetCookies();
    const db = getDb();
    if (sessionId) await db.delete(shootSessions).where(eq(shootSessions.id, sessionId));
    if (familyMemberId) {
      await db.delete(mediaDoNotPublish).where(eq(mediaDoNotPublish.familyMemberId, familyMemberId));
    }
    if (registrationId) await db.delete(registrations).where(eq(registrations.id, registrationId));
    if (familyMemberId) await db.delete(familyMembers).where(eq(familyMembers.id, familyMemberId));
  });

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(`/api/media/jobs/${sessionId}/do-not-publish`, { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("rejects a user with no media_staff role / not assigned (403)", async () => {
    const res = await apiFetch(`/api/media/jobs/${sessionId}/do-not-publish`, {
      method: "GET",
      cookie: coachCookie,
    });
    expect(res.status).toBe(403);
  });

  it("returns the org's active opt-out list to the assigned photographer", async () => {
    const res = await apiFetch(`/api/media/jobs/${sessionId}/do-not-publish`, {
      method: "GET",
      cookie: mediaCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.doNotPublish)).toBe(true);
    const entry = json.doNotPublish.find((m: { familyMemberId: string }) => m.familyMemberId === familyMemberId);
    expect(entry).toBeDefined();
    expect(entry.reason).toBe("Photographer reference list test");
  });
});
