import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, getMediaStaffCookie, apiFetch, expectJson } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { mediaDoNotPublish } from "@/lib/db/schema/media-do-not-publish";
import { shootSessions } from "@/lib/db/schema/media";
import { setDoNotPublish } from "@/lib/consents/do-not-publish";
import { eq } from "drizzle-orm";

/**
 * Task 8 — dedicated tenant-isolation coverage for the media individual
 * opt-out (product-backlog build #3). Mirrors
 * tests/api/staff/incidents-tenant-isolation.test.ts: Org A ("aspire-sports",
 * the default host-resolved org on localhost) vs. Org B ("orgb", resource
 * ids self-seeded directly since Org B has no family_member fixtures in the
 * e2e seed).
 *
 * Covers ground the Task 3 cross-org 404 test doesn't: DELETE (not just
 * PUT), the admin list endpoint never leaking Org B's flagged individual,
 * and the Task 6 photographer reference list staying org-scoped.
 */
describe("Media do-not-publish — tenant isolation", () => {
  let adminCookie: string; // Org A admin
  let mediaCookie: string; // Org A media_staff
  let adminUserId: string;
  let mediaStaffUserId: string;

  let orgAFamilyMemberId: string;
  let orgARegistrationId: string;
  let orgASessionId: string;

  let orgBFamilyMemberId: string;
  let orgBRegistrationId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    mediaCookie = await getMediaStaffCookie();

    const meAdmin = await apiFetch("/api/auth/me", { method: "GET", cookie: adminCookie });
    adminUserId = (await expectJson(meAdmin, 200)).user.id;
    const meMedia = await apiFetch("/api/auth/me", { method: "GET", cookie: mediaCookie });
    mediaStaffUserId = (await expectJson(meMedia, 200)).user.id;

    const fixturesA = await apiFetch("/api/test/org-fixtures?slug=aspire-sports");
    const fixturesAJson = await expectJson(fixturesA, 200);
    expect(fixturesAJson.seasonId).toBeTruthy();

    const fixturesB = await apiFetch("/api/test/org-fixtures?slug=orgb");
    if (fixturesB.status !== 200) {
      throw new Error(
        `Could not load Org B fixtures (status ${fixturesB.status}). ` +
          "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
      );
    }
    const fixturesBJson = await fixturesB.json();
    expect(fixturesBJson.seasonId).toBeTruthy();

    const db = getDb();

    // Org A: an ordinary (not-yet-opted-out) family_member with a shoot
    // session assigned to Org A's media_staff account.
    const [fmA] = await db
      .insert(familyMembers)
      .values({
        parentUserId: adminUserId,
        firstName: "OrgA",
        lastName: `TenantIsolation-${Date.now()}`,
        birthDate: "2016-01-01",
      })
      .returning();
    orgAFamilyMemberId = fmA.id;
    const [regA] = await db
      .insert(registrations)
      .values({
        seasonId: fixturesAJson.seasonId,
        familyMemberId: fmA.id,
        registeredByUserId: adminUserId,
        amountDueCents: 0,
      })
      .returning();
    orgARegistrationId = regA.id;

    const createSession = await apiFetch("/api/admin/media/shoots", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        assignedUserId: mediaStaffUserId,
        sessionType: "game",
        scheduledStart: new Date(Date.now() + 5 * 86400_000).toISOString(),
        scheduledEnd: new Date(Date.now() + 5 * 86400_000 + 2 * 3600_000).toISOString(),
      }),
    });
    orgASessionId = (await expectJson(createSession, 201)).session.id;

    // Org B: a family_member with an ACTIVE opt-out, inserted directly
    // (simulates a real Org B admin having set it — no Org B admin session
    // is available in this test suite).
    const [fmB] = await db
      .insert(familyMembers)
      .values({
        parentUserId: adminUserId,
        firstName: "OrgB",
        lastName: `TenantIsolation-${Date.now()}`,
        birthDate: "2016-01-01",
      })
      .returning();
    orgBFamilyMemberId = fmB.id;
    const [regB] = await db
      .insert(registrations)
      .values({
        seasonId: fixturesBJson.seasonId,
        familyMemberId: fmB.id,
        registeredByUserId: adminUserId,
        amountDueCents: 0,
      })
      .returning();
    orgBRegistrationId = regB.id;

    await setDoNotPublish({
      db,
      organizationId: fixturesBJson.org.id,
      familyMemberId: fmB.id,
      reason: "Org B tenant-isolation fixture",
      setByUserId: adminUserId,
    });
  });

  afterAll(async () => {
    const db = getDb();
    if (orgASessionId) await db.delete(shootSessions).where(eq(shootSessions.id, orgASessionId));
    for (const fmId of [orgAFamilyMemberId, orgBFamilyMemberId]) {
      if (fmId) await db.delete(mediaDoNotPublish).where(eq(mediaDoNotPublish.familyMemberId, fmId));
    }
    if (orgARegistrationId) await db.delete(registrations).where(eq(registrations.id, orgARegistrationId));
    if (orgBRegistrationId) await db.delete(registrations).where(eq(registrations.id, orgBRegistrationId));
    if (orgAFamilyMemberId) await db.delete(familyMembers).where(eq(familyMembers.id, orgAFamilyMemberId));
    if (orgBFamilyMemberId) await db.delete(familyMembers).where(eq(familyMembers.id, orgBFamilyMemberId));
  });

  it("Org A admin PUT against Org B's family_member 404s (can't set)", async () => {
    const res = await apiFetch(
      `/api/admin/compliance/family-members/${orgBFamilyMemberId}/do-not-publish`,
      {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({ reason: "Cross-org set attempt" }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("Org A admin DELETE against Org B's family_member 404s (can't clear)", async () => {
    const res = await apiFetch(
      `/api/admin/compliance/family-members/${orgBFamilyMemberId}/do-not-publish`,
      { method: "DELETE", cookie: adminCookie },
    );
    expect(res.status).toBe(404);

    // Confirm Org B's flag survived the attempted cross-org clear.
    const db = getDb();
    const [row] = await db
      .select()
      .from(mediaDoNotPublish)
      .where(eq(mediaDoNotPublish.familyMemberId, orgBFamilyMemberId));
    expect(row?.active).toBe(true);
  });

  it("Org A admin's compliance list never contains Org B's opted-out individual", async () => {
    const res = await apiFetch("/api/admin/compliance/family-members", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    const found = json.familyMembers.find((m: { id: string }) => m.id === orgBFamilyMemberId);
    expect(found).toBeUndefined();
  });

  it("Org A's photographer reference list never contains Org B's opted-out individual", async () => {
    const res = await apiFetch(`/api/media/jobs/${orgASessionId}/do-not-publish`, {
      method: "GET",
      cookie: mediaCookie,
    });
    const json = await expectJson(res, 200);
    const found = json.doNotPublish.find(
      (m: { familyMemberId: string }) => m.familyMemberId === orgBFamilyMemberId,
    );
    expect(found).toBeUndefined();
  });
});
