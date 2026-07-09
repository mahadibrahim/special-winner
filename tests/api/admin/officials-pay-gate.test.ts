import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { games } from "@/lib/db/schema/teams";
import { users } from "@/lib/db/schema/users";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

/**
 * Task 7: server-side pay gate. Payable ⇔ games.status === "completed".
 * The admin PATCH endpoint must reject a paymentStatus: "paid" transition
 * on any game that isn't closed out yet, while still allowing every other
 * field update (fee, position, notes, unpaid) regardless of game status.
 *
 * We create our own scheduled game (rather than reusing a seeded one) so
 * the initial "not completed" state is guaranteed, then flip it to
 * "completed" via a direct DB update to exercise the unblocked path.
 */
describe("officials pay gate (server-side close-out enforcement)", () => {
  let adminCookie: string;
  let gameId: string;
  let officialId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    const seasonsRes = await apiFetch("/api/admin/seasons", {
      cookie: adminCookie,
    });
    const seasonsJson = await expectJson(seasonsRes, 200);
    const season =
      seasonsJson.seasons.find((s: any) => s.status === "open") ??
      seasonsJson.seasons[0];
    if (!season) throw new Error("No season seeded for pay-gate test");

    const teamsRes = await apiFetch("/api/admin/teams", { cookie: adminCookie });
    const teamsJson = await expectJson(teamsRes, 200);
    if (teamsJson.teams.length < 2)
      throw new Error("Need at least two teams seeded for pay-gate test");

    // Create a fresh game — starts "scheduled" (not payable).
    const gameRes = await apiFetch("/api/admin/games", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        seasonId: season.id,
        homeTeamId: teamsJson.teams[0].id,
        awayTeamId: teamsJson.teams[1].id,
        scheduledAt: "2026-09-20T10:00:00Z",
        durationMinutes: 60,
      }),
    });
    const gameJson = await expectJson(gameRes, 201);
    gameId = gameJson.game.id;
    expect(gameJson.game.status).toBe("scheduled");

    // Assign an official to the fresh game.
    const db = getDb();
    const [someUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "parent@test.aspiresports.com"));
    if (!someUser) throw new Error("Fixture user parent@test.aspiresports.com not found");

    const assignRes = await apiFetch(`/api/admin/games/${gameId}/officials`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ userId: someUser.id, feeCents: 3000 }),
    });
    const assignJson = await expectJson(assignRes, 200);
    officialId = assignJson.official.id;
  });

  afterAll(async () => {
    await apiFetch(`/api/admin/games?id=${gameId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    resetCookies();
  });

  it("rejects marking paid on a game that isn't closed out (400)", async () => {
    const res = await apiFetch(
      `/api/admin/games/${gameId}/officials/${officialId}`,
      {
        method: "PATCH",
        cookie: adminCookie,
        body: JSON.stringify({ paymentStatus: "paid" }),
      },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/close(d|ing)? out/i);
  });

  it("still allows a non-payment field update on a non-completed game", async () => {
    const res = await apiFetch(
      `/api/admin/games/${gameId}/officials/${officialId}`,
      {
        method: "PATCH",
        cookie: adminCookie,
        body: JSON.stringify({ feeCents: 4200 }),
      },
    );
    const json = await expectJson(res, 200);
    expect(json.official.feeCents).toBe(4200);
  });

  it("allows marking paid once the game is closed out (completed)", async () => {
    await getDb()
      .update(games)
      .set({ status: "completed" })
      .where(eq(games.id, gameId));

    const res = await apiFetch(
      `/api/admin/games/${gameId}/officials/${officialId}`,
      {
        method: "PATCH",
        cookie: adminCookie,
        body: JSON.stringify({ paymentStatus: "paid" }),
      },
    );
    const json = await expectJson(res, 200);
    expect(json.official.paymentStatus).toBe("paid");
  });
});
