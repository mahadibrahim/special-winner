import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  getCoachCookie,
  getParentCookie,
  apiFetch,
  expectJson,
} from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { incidents } from "@/lib/db/schema/incidents";
import { eq } from "drizzle-orm";

describe("GET /api/admin/incidents", () => {
  let adminCookie: string;
  let coachCookie: string;
  let venueId: string;
  let fixtureIncidentId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    coachCookie = await getCoachCookie();

    const venuesRes = await apiFetch("/api/admin/venues", {
      method: "GET",
      cookie: adminCookie,
    });
    const venuesJson = await expectJson(venuesRes, 200);
    expect(venuesJson.venues.length).toBeGreaterThan(0);
    venueId = venuesJson.venues[0].id;

    const createRes = await apiFetch("/api/staff/incidents", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        venueId,
        incidentType: "altercation",
        occurredAt: new Date().toISOString(),
        peopleInvolved: "Two parents in the parking lot",
        firstResponderName: "Venue Manager Test",
        immediateCareGiven: "N/A — de-escalated verbally",
        emergencyServicesCalled: false,
        suspectedConcussion: false,
        parentNotifiedOnsite: false,
        subject: { subjectType: "bystander", freeTextName: "Admin List Fixture" },
      }),
    });
    const createJson = await expectJson(createRes, 201);
    fixtureIncidentId = createJson.incident.id;
  });

  afterAll(async () => {
    await getDb().delete(incidents).where(eq(incidents.id, fixtureIncidentId));
  });

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch("/api/admin/incidents", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("rejects a parent (403)", async () => {
    const parentCookie = await getParentCookie();
    const res = await apiFetch("/api/admin/incidents", {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("lists the org's incidents, including the fixture", async () => {
    const res = await apiFetch("/api/admin/incidents", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.incidents)).toBe(true);
    const found = json.incidents.find((i: { id: string }) => i.id === fixtureIncidentId);
    expect(found).toBeDefined();
    expect(found.subjectFreeTextName).toBe("Admin List Fixture");
  });

  it("filters by status=open and includes the fixture", async () => {
    const res = await apiFetch("/api/admin/incidents?status=open", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.incidents.every((i: { status: string }) => i.status === "open")).toBe(true);
    const found = json.incidents.find((i: { id: string }) => i.id === fixtureIncidentId);
    expect(found).toBeDefined();
  });

  it("filters by status=closed and excludes the fixture", async () => {
    const res = await apiFetch("/api/admin/incidents?status=closed", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    const found = json.incidents.find((i: { id: string }) => i.id === fixtureIncidentId);
    expect(found).toBeUndefined();
  });

  it("returns 400 for an invalid status filter", async () => {
    const res = await apiFetch("/api/admin/incidents?status=bogus", {
      method: "GET",
      cookie: adminCookie,
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/incidents/[id]", () => {
  let adminCookie: string;
  let coachCookie: string;
  let venueId: string;
  let fixtureIncidentId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    coachCookie = await getCoachCookie();

    const venuesRes = await apiFetch("/api/admin/venues", {
      method: "GET",
      cookie: adminCookie,
    });
    const venuesJson = await expectJson(venuesRes, 200);
    venueId = venuesJson.venues[0].id;

    const createRes = await apiFetch("/api/staff/incidents", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        venueId,
        incidentType: "medical_event",
        occurredAt: new Date().toISOString(),
        peopleInvolved: "One player felt dizzy",
        firstResponderName: "Venue Manager Test",
        immediateCareGiven: "Sat player down, gave water",
        emergencyServicesCalled: false,
        suspectedConcussion: false,
        parentNotifiedOnsite: true,
        subject: { subjectType: "bystander", freeTextName: "Admin Detail Fixture" },
      }),
    });
    const createJson = await expectJson(createRes, 201);
    fixtureIncidentId = createJson.incident.id;
  });

  afterAll(async () => {
    await getDb().delete(incidents).where(eq(incidents.id, fixtureIncidentId));
  });

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(`/api/admin/incidents/${fixtureIncidentId}`, {
      method: "GET",
    });
    expect(res.status).toBe(401);
  });

  it("returns the incident detail", async () => {
    const res = await apiFetch(`/api/admin/incidents/${fixtureIncidentId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.incident.id).toBe(fixtureIncidentId);
    expect(json.incident.subjectFreeTextName).toBe("Admin Detail Fixture");
    expect(json.incident.venueName).toBeTruthy();
  });

  it("returns 404 for an unknown id", async () => {
    const res = await apiFetch(
      "/api/admin/incidents/00000000-0000-4000-8000-000000000000",
      { method: "GET", cookie: adminCookie },
    );
    expect(res.status).toBe(404);
  });
});
