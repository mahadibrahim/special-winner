/**
 * Task 6 regression against a real DB: getRefereeMatchDetail's
 * activeSuspensions filtering. The unit-test mock in
 * tests/unit/referee/referee-queries.test.ts covers data-flow shape
 * (home/away/TBD), but can't validate the actual SQL WHERE filtering since
 * it mocks @/lib/db wholesale. This test self-seeds real suspensions rows
 * of every status plus one on an unrelated team, and asserts the real
 * query only surfaces active/season/permanent rows for THIS game's teams.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { gameOfficials, gameIncidents } from "@/lib/db/schema/teams";
import { suspensions } from "@/lib/db/schema/suspensions";
import { hashPassword } from "@/lib/auth/password";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { getRefereeMatchDetail } from "@/lib/referee/referee-queries";

describe("getRefereeMatchDetail — activeSuspensions filtering (real DB)", () => {
  let gameId: string;
  let refUserId: string;
  let homeTeamId: string;
  let awayTeamId: string;

  beforeAll(async () => {
    const ctx = await createAdminOrgGameContext();
    gameId = ctx.gameId;
    homeTeamId = ctx.homeTeamId;
    awayTeamId = ctx.awayTeamId;

    // A second, unrelated context — its team must never leak into this
    // game's activeSuspensions.
    const otherCtx = await createAdminOrgGameContext();

    const db = getDb();
    const email = `fresh-referee-detail-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const passwordHash = await hashPassword("TestFreshReferee123!");
    const [refUser] = await db
      .insert(users)
      .values({ email, passwordHash, firstName: "Fresh", lastName: "Referee", emailVerified: true })
      .returning();
    refUserId = refUser.id;
    await db.insert(gameOfficials).values({ gameId, userId: refUserId, position: "referee" });

    // One ejection incident per suspension row (gameIncidentId is notNull + FK restrict).
    async function seedSuspension(teamId: string, status: (typeof suspensions.$inferInsert)["status"]) {
      const [incident] = await db
        .insert(gameIncidents)
        .values({ gameId, type: "ejection", side: "home", player: `Fixture ${status}`, description: "fixture" })
        .returning();
      await db.insert(suspensions).values({
        organizationId: ctx.organizationId,
        teamId,
        personName: `Fixture ${status}`,
        gameIncidentId: incident.id,
        reason: "fixture",
        status,
      });
    }

    await seedSuspension(homeTeamId, "active");
    await seedSuspension(awayTeamId, "season");
    await seedSuspension(homeTeamId, "permanent");
    await seedSuspension(homeTeamId, "served");
    await seedSuspension(awayTeamId, "appealed");

    // Unrelated team, active status — must not appear either.
    const [otherIncident] = await db
      .insert(gameIncidents)
      .values({ gameId: otherCtx.gameId, type: "ejection", side: "home", player: "Unrelated Fixture", description: "fixture" })
      .returning();
    await db.insert(suspensions).values({
      organizationId: otherCtx.organizationId,
      teamId: otherCtx.homeTeamId,
      personName: "Unrelated Fixture",
      gameIncidentId: otherIncident.id,
      reason: "fixture",
      status: "active",
    });
  });

  it("surfaces only active/season/permanent suspensions for this game's own teams", async () => {
    const detail = await getRefereeMatchDetail(refUserId, gameId);
    expect(detail).not.toBeNull();
    const statuses = detail!.activeSuspensions.map((s) => s.status).sort();
    expect(statuses).toEqual(["active", "permanent", "season"]);

    const names = detail!.activeSuspensions.map((s) => s.personName);
    expect(names).toContain("Fixture active");
    expect(names).toContain("Fixture season");
    expect(names).toContain("Fixture permanent");
    expect(names).not.toContain("Fixture served");
    expect(names).not.toContain("Fixture appealed");
    expect(names).not.toContain("Unrelated Fixture");

    const teamIds = new Set(detail!.activeSuspensions.map((s) => s.teamId));
    expect(teamIds.has(homeTeamId) || teamIds.has(awayTeamId)).toBe(true);
    for (const id of teamIds) {
      expect([homeTeamId, awayTeamId]).toContain(id);
    }
  });
});
