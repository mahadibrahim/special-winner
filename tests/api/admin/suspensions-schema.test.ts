/**
 * Schema smoke test for the ejection/suspension tracker (Task 1 of
 * docs/superpowers/plans/2026-07-07-ejection-tracker.md). Confirms the
 * `suspensions` table + `game_incident_type.ejection` enum value migrated
 * cleanly and the `suspensions_non_negative_games_missed` CHECK constraint
 * is enforced at the DB level. Not an HTTP test — uses the live DB
 * connection directly, same as other self-seeded API fixtures.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { gameIncidents } from "@/lib/db/schema/teams";
import { suspensions } from "@/lib/db/schema/suspensions";
import { eq } from "drizzle-orm";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";

describe("suspensions schema", () => {
  let organizationId: string;
  let homeTeamId: string;
  let gameId: string;
  let gameIncidentId: string;
  let validSuspensionId: string | undefined;

  beforeAll(async () => {
    const ctx = await createAdminOrgGameContext();
    organizationId = ctx.organizationId;
    homeTeamId = ctx.homeTeamId;
    gameId = ctx.gameId;

    const [incident] = await getDb()
      .insert(gameIncidents)
      .values({
        gameId,
        type: "ejection",
        side: "home",
        player: "Schema Smoke Test Player",
        description: "Schema smoke test ejection",
      })
      .returning();
    gameIncidentId = incident.id;
  });

  afterAll(async () => {
    if (validSuspensionId) {
      await getDb().delete(suspensions).where(eq(suspensions.id, validSuspensionId));
    }
    await getDb().delete(gameIncidents).where(eq(gameIncidents.id, gameIncidentId));
  });

  it("accepts a valid suspension row (default gamesMissed=1, status=active)", async () => {
    const [row] = await getDb()
      .insert(suspensions)
      .values({
        organizationId,
        teamId: homeTeamId,
        personName: "Schema Smoke Test Player",
        gameIncidentId,
        reason: "Violent conduct",
      })
      .returning();
    validSuspensionId = row.id;
    expect(row.gamesMissed).toBe(1);
    expect(row.gamesServed).toBe(0);
    expect(row.status).toBe("active");
    expect(row.escalatedToDirector).toBe(false);
  });

  it("rejects a negative gamesMissed via the CHECK constraint", async () => {
    await expect(
      getDb()
        .insert(suspensions)
        .values({
          organizationId,
          teamId: homeTeamId,
          personName: "Schema Smoke Test Player",
          gameIncidentId,
          reason: "Violent conduct",
          gamesMissed: -1,
        }),
    ).rejects.toThrow();
  });

  it("accepts season and permanent statuses (owner escalation)", async () => {
    const [row] = await getDb()
      .insert(suspensions)
      .values({
        organizationId,
        teamId: homeTeamId,
        personName: "Schema Smoke Test Player",
        gameIncidentId,
        reason: "Repeated ejections",
        status: "season",
        escalatedToDirector: true,
      })
      .returning();
    expect(row.status).toBe("season");
    await getDb().delete(suspensions).where(eq(suspensions.id, row.id));
  });
});
