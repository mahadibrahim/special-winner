/**
 * Tenant-isolation test for the ejection/suspension tracker (Task 10 of
 * docs/superpowers/plans/2026-07-07-ejection-tracker.md). Mirrors the
 * cross-tenant attack pattern in tests/api/staff/incidents-tenant-isolation.test.ts:
 *
 *   Org A ("aspire-sports") — default context on localhost.
 *   Org B ("orgb")          — resource ids discovered via
 *     GET /api/test/org-fixtures?slug=orgb (E2E_TEST_ENDPOINTS=yes).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { teams, games, gameIncidents } from "@/lib/db/schema/teams";
import { suspensions } from "@/lib/db/schema/suspensions";
import { eq } from "drizzle-orm";

describe("Suspensions — tenant isolation", () => {
  let adminCookie: string; // Org A super_admin
  let orgBTeamId: string;
  let orgBGameId: string;
  let orgBIncidentId: string;
  let orgBSuspensionId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    const fixturesRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
    if (fixturesRes.status !== 200) {
      throw new Error(
        `Could not load Org B fixtures (status ${fixturesRes.status}). ` +
          "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
      );
    }
    const fixtures = await fixturesRes.json();
    expect(fixtures.seasonId).toBeTruthy();

    const db = getDb();
    const [orgBTeam] = await db
      .insert(teams)
      .values({ seasonId: fixtures.seasonId, name: `Org B Isolation Team ${Date.now()}` })
      .returning();
    orgBTeamId = orgBTeam.id;

    const [orgBGame] = await db
      .insert(games)
      .values({
        seasonId: fixtures.seasonId,
        homeTeamId: orgBTeamId,
        scheduledAt: new Date("2026-06-03T18:00:00Z"),
        status: "scheduled",
      })
      .returning();
    orgBGameId = orgBGame.id;

    const [orgBIncident] = await db
      .insert(gameIncidents)
      .values({
        gameId: orgBGameId,
        type: "ejection",
        side: "home",
        player: "Org B Isolation Fixture",
        description: "Org B tenant-isolation fixture",
      })
      .returning();
    orgBIncidentId = orgBIncident.id;

    const [orgBSuspension] = await db
      .insert(suspensions)
      .values({
        organizationId: fixtures.org.id,
        teamId: orgBTeamId,
        personName: "Org B Isolation Fixture",
        gameIncidentId: orgBIncidentId,
        reason: "Org B tenant-isolation fixture",
        status: "active",
      })
      .returning();
    orgBSuspensionId = orgBSuspension.id;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(suspensions).where(eq(suspensions.id, orgBSuspensionId));
    await db.delete(gameIncidents).where(eq(gameIncidents.id, orgBIncidentId));
    await db.delete(games).where(eq(games.id, orgBGameId));
    await db.delete(teams).where(eq(teams.id, orgBTeamId));
  });

  it("Org A admin's suspensions list never contains the Org B suspension", async () => {
    const res = await apiFetch("/api/admin/suspensions", { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);
    const found = json.suspensions.find((s: { id: string }) => s.id === orgBSuspensionId);
    expect(found).toBeUndefined();
  });

  it("Org A admin's teamId filter for the Org B team returns nothing (not a cross-org leak)", async () => {
    const res = await apiFetch(`/api/admin/suspensions?teamId=${orgBTeamId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.suspensions).toEqual([]);
  });
});
