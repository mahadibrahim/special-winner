import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, getParentCookie, apiFetch, expectJson } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { gameIncidents } from "@/lib/db/schema/teams";
import { suspensions } from "@/lib/db/schema/suspensions";
import { eq } from "drizzle-orm";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";

describe("GET /api/admin/suspensions", () => {
  let adminCookie: string;
  let homeTeamId: string;
  let awayTeamId: string;
  let fixtureSuspensionId: string;
  let fixtureIncidentId: string;
  const personName = `Suspensions Fixture Player ${Date.now()}`;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    const ctx = await createAdminOrgGameContext();
    homeTeamId = ctx.homeTeamId;
    awayTeamId = ctx.awayTeamId;

    const db = getDb();
    const [incident] = await db
      .insert(gameIncidents)
      .values({
        gameId: ctx.gameId,
        type: "ejection",
        side: "home",
        player: personName,
        minute: 55,
        description: "Fixture ejection for admin suspensions list test",
      })
      .returning();
    fixtureIncidentId = incident.id;

    const [suspension] = await db
      .insert(suspensions)
      .values({
        organizationId: ctx.organizationId,
        teamId: homeTeamId,
        personName,
        gameIncidentId: incident.id,
        reason: "Violent conduct — fixture",
        status: "active",
      })
      .returning();
    fixtureSuspensionId = suspension.id;
  });

  afterAll(async () => {
    await getDb().delete(suspensions).where(eq(suspensions.id, fixtureSuspensionId));
    await getDb().delete(gameIncidents).where(eq(gameIncidents.id, fixtureIncidentId));
  });

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch("/api/admin/suspensions", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("rejects a parent (403)", async () => {
    const parentCookie = await getParentCookie();
    const res = await apiFetch("/api/admin/suspensions", { method: "GET", cookie: parentCookie });
    expect(res.status).toBe(403);
  });

  it("lists the org's suspensions, including the fixture, with an ejectionCount", async () => {
    const res = await apiFetch("/api/admin/suspensions", { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.suspensions)).toBe(true);
    const found = json.suspensions.find((s: { id: string }) => s.id === fixtureSuspensionId);
    expect(found).toBeDefined();
    expect(found.personName).toBe(personName);
    expect(found.teamName).toBeTruthy();
    expect(found.status).toBe("active");
    expect(found.incidentGameId).toBeTruthy();
    expect(found.incidentSide).toBe("home");
    expect(found.incidentMinute).toBe(55);
    expect(found.ejectionCount).toBeGreaterThanOrEqual(1);
  });

  it("filters by status=active and includes the fixture", async () => {
    const res = await apiFetch("/api/admin/suspensions?status=active", { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);
    expect(json.suspensions.every((s: { status: string }) => s.status === "active")).toBe(true);
    const found = json.suspensions.find((s: { id: string }) => s.id === fixtureSuspensionId);
    expect(found).toBeDefined();
  });

  it("filters by status=served and excludes the fixture", async () => {
    const res = await apiFetch("/api/admin/suspensions?status=served", { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);
    const found = json.suspensions.find((s: { id: string }) => s.id === fixtureSuspensionId);
    expect(found).toBeUndefined();
  });

  it("filters by teamId=homeTeamId and includes the fixture", async () => {
    const res = await apiFetch(`/api/admin/suspensions?teamId=${homeTeamId}`, { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);
    const found = json.suspensions.find((s: { id: string }) => s.id === fixtureSuspensionId);
    expect(found).toBeDefined();
    expect(json.suspensions.every((s: { teamId: string }) => s.teamId === homeTeamId)).toBe(true);
  });

  it("filters by teamId=awayTeamId and excludes the fixture", async () => {
    const res = await apiFetch(`/api/admin/suspensions?teamId=${awayTeamId}`, { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);
    const found = json.suspensions.find((s: { id: string }) => s.id === fixtureSuspensionId);
    expect(found).toBeUndefined();
  });

  it("returns 400 for an invalid status filter", async () => {
    const res = await apiFetch("/api/admin/suspensions?status=bogus", { method: "GET", cookie: adminCookie });
    expect(res.status).toBe(400);
  });
});
