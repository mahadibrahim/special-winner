import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { mediaDoNotPublish } from "@/lib/db/schema/media-do-not-publish";
import { eq } from "drizzle-orm";

/**
 * Admin toggle for the media individual opt-out (product-backlog build #3).
 * Self-seeds a deterministic family_member + registration in Org A
 * ("aspire-sports", the default host-resolved org on localhost) rather than
 * relying on ambient seed data, per the CI-robust-fixtures lesson from
 * build #1 (its tests assumed ambient staging data and broke on a fresh
 * CI DB).
 */
describe("Admin media do-not-publish toggle", () => {
  const ENDPOINT = (id: string) => `/api/admin/compliance/family-members/${id}/do-not-publish`;

  let adminCookie: string;
  let familyMemberId: string;
  let registrationId: string;
  let orgBFamilyMemberId: string;
  let orgBRegistrationId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    const me = await apiFetch("/api/auth/me", { method: "GET", cookie: adminCookie });
    const meJson = await expectJson(me, 200);
    const adminUserId: string = meJson.user.id;

    const fixturesA = await apiFetch("/api/test/org-fixtures?slug=aspire-sports");
    const fixturesAJson = await expectJson(fixturesA, 200);
    expect(fixturesAJson.seasonId).toBeTruthy();

    const db = getDb();
    const [fm] = await db
      .insert(familyMembers)
      .values({
        parentUserId: adminUserId,
        firstName: "OptOut",
        lastName: `ComplianceTest-${Date.now()}`,
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

    // Org B has no family_member/registration fixtures in the e2e seed
    // (unlike Org A), so self-seed one directly — mirrors
    // tests/api/staff/incidents-tenant-isolation.test.ts inserting an Org B
    // incident directly rather than requiring a real Org B staff session.
    const fixturesB = await apiFetch("/api/test/org-fixtures?slug=orgb");
    if (fixturesB.status !== 200) {
      throw new Error(
        `Could not load Org B fixtures (status ${fixturesB.status}). ` +
          "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
      );
    }
    const fixturesBJson = await fixturesB.json();
    expect(fixturesBJson.seasonId).toBeTruthy();

    const [orgBFm] = await db
      .insert(familyMembers)
      .values({
        parentUserId: adminUserId,
        firstName: "OptOut",
        lastName: `OrgBIsolation-${Date.now()}`,
        birthDate: "2016-01-01",
      })
      .returning();
    orgBFamilyMemberId = orgBFm.id;

    const [orgBReg] = await db
      .insert(registrations)
      .values({
        seasonId: fixturesBJson.seasonId,
        familyMemberId: orgBFm.id,
        registeredByUserId: adminUserId,
        amountDueCents: 0,
      })
      .returning();
    orgBRegistrationId = orgBReg.id;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(mediaDoNotPublish).where(eq(mediaDoNotPublish.familyMemberId, familyMemberId));
    await db.delete(registrations).where(eq(registrations.id, registrationId));
    await db.delete(familyMembers).where(eq(familyMembers.id, familyMemberId));

    await db.delete(mediaDoNotPublish).where(eq(mediaDoNotPublish.familyMemberId, orgBFamilyMemberId));
    await db.delete(registrations).where(eq(registrations.id, orgBRegistrationId));
    await db.delete(familyMembers).where(eq(familyMembers.id, orgBFamilyMemberId));
  });

  it("rejects unauthenticated PUT (401)", async () => {
    const res = await apiFetch(ENDPOINT(familyMemberId), { method: "PUT", body: JSON.stringify({}) });
    expect(res.status).toBe(401);
  });

  it("PUT sets the opt-out flag (200)", async () => {
    const res = await apiFetch(ENDPOINT(familyMemberId), {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({ reason: "Custody dispute — do not feature" }),
    });
    const json = await expectJson(res, 200);
    expect(json.doNotPublish).toEqual({
      active: true,
      reason: "Custody dispute — do not feature",
    });
  });

  it("GET /api/admin/compliance/family-members reflects the active opt-out", async () => {
    const res = await apiFetch(
      `/api/admin/compliance/family-members?search=ComplianceTest`,
      { method: "GET", cookie: adminCookie },
    );
    const json = await expectJson(res, 200);
    const found = json.familyMembers.find((m: { id: string }) => m.id === familyMemberId);
    expect(found).toBeDefined();
    expect(found.doNotPublish).toEqual({
      active: true,
      reason: "Custody dispute — do not feature",
    });
  });

  it("PUT again updates the reason in place (still one active row)", async () => {
    const res = await apiFetch(ENDPOINT(familyMemberId), {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({ reason: "Updated reason" }),
    });
    const json = await expectJson(res, 200);
    expect(json.doNotPublish).toEqual({ active: true, reason: "Updated reason" });

    const db = getDb();
    const activeRows = await db
      .select()
      .from(mediaDoNotPublish)
      .where(eq(mediaDoNotPublish.familyMemberId, familyMemberId));
    expect(activeRows.filter((r) => r.active).length).toBe(1);
  });

  it("DELETE clears the opt-out flag (200)", async () => {
    const res = await apiFetch(ENDPOINT(familyMemberId), {
      method: "DELETE",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.doNotPublish).toEqual({ active: false });
  });

  it("GET reflects the cleared state", async () => {
    const res = await apiFetch(
      `/api/admin/compliance/family-members?search=ComplianceTest`,
      { method: "GET", cookie: adminCookie },
    );
    const json = await expectJson(res, 200);
    const found = json.familyMembers.find((m: { id: string }) => m.id === familyMemberId);
    expect(found).toBeDefined();
    expect(found.doNotPublish).toEqual({ active: false });
  });

  it("rejects a cross-org family_member with 404", async () => {
    const res = await apiFetch(ENDPOINT(orgBFamilyMemberId), {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({ reason: "Cross-org attempt" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a nonexistent family_member with 404", async () => {
    const res = await apiFetch(ENDPOINT("00000000-0000-4000-8000-000000000000"), {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});
