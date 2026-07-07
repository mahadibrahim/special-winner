/**
 * Tenant-isolation tests for incident reporting (Task 11 of the
 * incident-reporting plan). Mirrors the cross-tenant attack pattern in
 * tests/api/admin-tenant-scoping.test.ts:
 *
 *   Org A ("aspire-sports") — default context on localhost.
 *   Org B ("orgb")          — resource ids discovered via
 *     GET /api/test/org-fixtures?slug=orgb (E2E_TEST_ENDPOINTS=yes).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, getCoachCookie, apiFetch, expectJson } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { incidents } from "@/lib/db/schema/incidents";
import { users } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";

describe("Incident reporting — tenant isolation", () => {
  let adminCookie: string; // Org A super_admin
  let coachCookie: string; // Org A coach
  let orgBVenueId: string;
  let orgBIncidentId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    coachCookie = await getCoachCookie();

    const fixturesRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
    if (fixturesRes.status !== 200) {
      throw new Error(
        `Could not load Org B fixtures (status ${fixturesRes.status}). ` +
          "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
      );
    }
    const fixtures = await fixturesRes.json();
    orgBVenueId = fixtures.venueId;
    expect(orgBVenueId).toBeTruthy();

    // Directly insert an incident owned by Org B — this simulates a real
    // Org B incident existing, without needing an Org B staff session
    // (the seed doesn't ship a coach/location_admin scoped purely to a
    // single Org B venue for this path).
    const [orgBAdminUser] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin-orgb@test.aspiresports.com"))
      .limit(1);
    expect(orgBAdminUser).toBeDefined();

    const [orgBIncident] = await getDb()
      .insert(incidents)
      .values({
        organizationId: fixtures.org.id,
        venueId: orgBVenueId,
        reportedByUserId: orgBAdminUser.id,
        subjectType: "bystander",
        subjectFreeTextName: "Org B Isolation Fixture",
        incidentType: "other",
        occurredAt: new Date(),
        peopleInvolved: "Org B tenant-isolation fixture",
        firstResponderName: "Org B Fixture Responder",
        immediateCareGiven: "N/A",
        emergencyServicesCalled: false,
        suspectedConcussion: false,
        parentNotifiedOnsite: false,
      })
      .returning();
    orgBIncidentId = orgBIncident.id;
  });

  afterAll(async () => {
    await getDb().delete(incidents).where(eq(incidents.id, orgBIncidentId));
  });

  it("rejects a staff POST against another org's venue (404)", async () => {
    const res = await apiFetch("/api/staff/incidents", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        venueId: orgBVenueId,
        incidentType: "injury",
        occurredAt: new Date().toISOString(),
        peopleInvolved: "Cross-org attempt",
        firstResponderName: "Coach Test",
        immediateCareGiven: "N/A",
        emergencyServicesCalled: false,
        suspectedConcussion: false,
        parentNotifiedOnsite: false,
        subject: { subjectType: "bystander", freeTextName: "Cross Org Attempt" },
      }),
    });
    expect(res.status).toBe(404);
  });

  it("Org A admin's incident list never contains the Org B incident", async () => {
    const res = await apiFetch("/api/admin/incidents", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    const found = json.incidents.find((i: { id: string }) => i.id === orgBIncidentId);
    expect(found).toBeUndefined();
  });

  it("Org A admin 404s reading the Org B incident by id", async () => {
    const res = await apiFetch(`/api/admin/incidents/${orgBIncidentId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    expect(res.status).toBe(404);
  });
});
