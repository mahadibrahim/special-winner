/**
 * Task 5 regression: the defensive `type <> 'ejection'` guard on the bulk
 * delete in report.ts. Ejections are created via the additive
 * POST .../ejections endpoint and must survive a subsequent /report
 * resubmit (a routine score correction must never erase one) — see
 * docs/superpowers/plans/2026-07-07-ejection-tracker.md.
 *
 * No role gate applies to /api/referee/** (middleware's /referee role rule
 * only matches page paths, not /api/referee/**) — the sole authorization is
 * requireAssignedOfficial (a gameOfficials row for gameId+userId), so a
 * plain freshly-created user works as the "referee" here.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { gameOfficials, gameIncidents } from "@/lib/db/schema/teams";
import { hashPassword } from "@/lib/auth/password";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { getAuthCookie, apiFetch, expectJson } from "../setup/test-helpers";

const REF_PASSWORD = "TestFreshReferee123!";

describe("POST /api/referee/matches/[gameId]/report — preserves ejections", () => {
  let gameId: string;
  let refCookie: string;

  beforeAll(async () => {
    const ctx = await createAdminOrgGameContext();
    gameId = ctx.gameId;

    const db = getDb();
    const email = `fresh-referee-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const passwordHash = await hashPassword(REF_PASSWORD);
    const [refUser] = await db
      .insert(users)
      .values({ email, passwordHash, firstName: "Fresh", lastName: "Referee", emailVerified: true })
      .returning();
    await db.insert(gameOfficials).values({ gameId, userId: refUser.id, position: "referee" });

    refCookie = await getAuthCookie(email, REF_PASSWORD);
  });

  it("an ejection recorded via .../ejections survives a subsequent /report resubmit", async () => {
    const ejectRes = await apiFetch(`/api/referee/matches/${gameId}/ejections`, {
      method: "POST",
      cookie: refCookie,
      body: JSON.stringify({
        side: "home",
        player: "Regression Fixture Player",
        minute: 40,
        reason: "Serious foul play",
        carriesSuspension: true,
      }),
    });
    const ejectJson = await expectJson(ejectRes, 201);
    expect(ejectJson.incident.type).toBe("ejection");
    expect(ejectJson.suspension).toBeTruthy();

    // First /report submit — a routine score correction with an unrelated
    // yellow_card incident, no mention of the ejection.
    const reportRes1 = await apiFetch(`/api/referee/matches/${gameId}/report`, {
      method: "POST",
      cookie: refCookie,
      body: JSON.stringify({
        homeScore: 2,
        awayScore: 1,
        incidents: [{ type: "yellow_card", side: "away", player: "#9", minute: 10 }],
      }),
    });
    expect(reportRes1.status).toBe(200);

    let rows = await getDb()
      .select({ id: gameIncidents.id, type: gameIncidents.type })
      .from(gameIncidents)
      .where(eq(gameIncidents.gameId, gameId));
    expect(rows.find((r) => r.id === ejectJson.incident.id && r.type === "ejection")).toBeDefined();
    expect(rows.some((r) => r.type === "yellow_card")).toBe(true);

    // Second /report submit — a further correction, different incidents.
    const reportRes2 = await apiFetch(`/api/referee/matches/${gameId}/report`, {
      method: "POST",
      cookie: refCookie,
      body: JSON.stringify({ homeScore: 3, awayScore: 1, incidents: [] }),
    });
    expect(reportRes2.status).toBe(200);

    rows = await getDb()
      .select({ id: gameIncidents.id, type: gameIncidents.type })
      .from(gameIncidents)
      .where(eq(gameIncidents.gameId, gameId));
    // The ejection is still there...
    expect(rows.find((r) => r.id === ejectJson.incident.id && r.type === "ejection")).toBeDefined();
    // ...but the non-ejection incident from the prior submit was replaced away.
    expect(rows.some((r) => r.type === "yellow_card")).toBe(false);
    expect(rows.filter((r) => r.type !== "ejection").length).toBe(0);
  });

  it("rejects a bulk /report incident entry with type 'ejection' (400)", async () => {
    const res = await apiFetch(`/api/referee/matches/${gameId}/report`, {
      method: "POST",
      cookie: refCookie,
      body: JSON.stringify({
        homeScore: 1,
        awayScore: 0,
        incidents: [{ type: "ejection", side: "home", player: "Sneaky Bulk Entry" }],
      }),
    });
    expect(res.status).toBe(400);
  });
});
