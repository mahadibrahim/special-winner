/**
 * Task 3: the atomic referee close-out endpoint
 * (POST /api/referee/matches/[gameId]/close-out).
 *
 * Collapses today's three finish endpoints (report / ejections / check-out)
 * into ONE atomic transaction: score + None-gated cards/injuries/ejections +
 * opportunistic check-out. Modeled on
 * tests/api/referee/report-preserves-ejections.test.ts — no role gate
 * applies to /api/referee/**; the sole authorization is
 * requireAssignedOfficial (a gameOfficials row for gameId+userId), so a
 * plain freshly-created user works as "the referee".
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { gameOfficials, gameIncidents, games } from "@/lib/db/schema/teams";
import { suspensions } from "@/lib/db/schema/suspensions";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { hashPassword } from "@/lib/auth/password";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { getAuthCookie, apiFetch, expectJson } from "../setup/test-helpers";

const REF_PASSWORD = "TestCloseOutReferee123!";

async function seedAssignedReferee(gameId: string): Promise<string> {
  const db = getDb();
  const email = `close-out-referee-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await hashPassword(REF_PASSWORD);
  const [refUser] = await db
    .insert(users)
    .values({ email, passwordHash, firstName: "CloseOut", lastName: "Referee", emailVerified: true })
    .returning();
  await db.insert(gameOfficials).values({ gameId, userId: refUser.id, position: "referee" });
  return getAuthCookie(email, REF_PASSWORD);
}

describe("POST /api/referee/matches/[gameId]/close-out", () => {
  let gameId: string;
  let homeTeamId: string;
  let awayTeamId: string;
  let organizationId: string;
  let venueId: string;
  let cookie: string;

  const clean = () => ({
    homeScore: 2,
    awayScore: 1,
    cards: [] as unknown[],
    injuries: [] as unknown[],
    ejections: [] as unknown[],
    noCards: true,
    noInjuries: true,
    noEjections: true,
    refereeNotes: null as string | null,
  });

  const post = (body: unknown) =>
    apiFetch(`/api/referee/matches/${gameId}/close-out`, {
      method: "POST",
      cookie,
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    const ctx = await createAdminOrgGameContext();
    gameId = ctx.gameId;
    homeTeamId = ctx.homeTeamId;
    awayTeamId = ctx.awayTeamId;
    organizationId = ctx.organizationId;
    venueId = ctx.venueId;
    cookie = await seedAssignedReferee(gameId);
  });

  it("rejects a missing score (400)", async () => {
    const res = await post({ ...clean(), homeScore: undefined });
    expect(res.status).toBe(400);
  });

  it("rejects a negative score (400)", async () => {
    const res = await post({ ...clean(), awayScore: -1 });
    expect(res.status).toBe(400);
  });

  it("rejects a section that is empty and not acknowledged (400)", async () => {
    const res = await post({ ...clean(), noCards: false }); // cards empty AND noCards false
    expect(res.status).toBe(400);
  });

  it("rejects a section that has entries but is also marked None (400)", async () => {
    const res = await post({
      ...clean(),
      cards: [{ type: "yellow_card", side: "home", player: "7" }],
      noCards: true,
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unanswered injuries section the same way (400)", async () => {
    const res = await post({ ...clean(), noInjuries: false });
    expect(res.status).toBe(400);
  });

  it("rejects an unanswered ejections section the same way (400)", async () => {
    const res = await post({ ...clean(), noEjections: false });
    expect(res.status).toBe(400);
  });

  it("404s for a caller who is not an assigned official on this game", async () => {
    const otherCtx = await createAdminOrgGameContext();
    const otherCookie = await seedAssignedReferee(otherCtx.gameId); // assigned to a DIFFERENT game
    const res = await apiFetch(`/api/referee/matches/${gameId}/close-out`, {
      method: "POST",
      cookie: otherCookie,
      body: JSON.stringify(clean()),
    });
    expect(res.status).toBe(404);
  });

  it("accepts a clean game with all sections acknowledged None (200) and marks it completed", async () => {
    const res = await post(clean());
    await expectJson(res, 200);

    const [row] = await getDb()
      .select({ status: games.status, homeScore: games.homeScore, awayScore: games.awayScore })
      .from(games)
      .where(eq(games.id, gameId));
    expect(row.status).toBe("completed");
    expect(row.homeScore).toBe(2);
    expect(row.awayScore).toBe(1);
  });

  it("records cards and injuries as incidents", async () => {
    const body = {
      ...clean(),
      cards: [{ type: "yellow_card", side: "home", player: "7", minute: 12 }],
      injuries: [{ side: "away", player: "3", minute: 20, description: "Ankle" }],
      noCards: false,
      noInjuries: false,
    };
    const res = await post(body);
    await expectJson(res, 200);

    const rows = await getDb()
      .select({ type: gameIncidents.type, side: gameIncidents.side })
      .from(gameIncidents)
      .where(eq(gameIncidents.gameId, gameId));
    expect(rows.some((r) => r.type === "yellow_card" && r.side === "home")).toBe(true);
    expect(rows.some((r) => r.type === "injury" && r.side === "away")).toBe(true);
  });

  it("a later resubmit replaces cards/injuries (delete-all-reinsert) but never touches ejections", async () => {
    // First submit: one card, no ejections yet.
    await post({
      ...clean(),
      cards: [{ type: "yellow_card", side: "home", player: "A" }],
      noCards: false,
    });

    // Second submit: a NEW ejection, plus different cards.
    const ej = {
      side: "home",
      player: "9",
      reason: "Violent conduct",
      carriesSuspension: true,
      gamesMissed: 1,
      escalatedToDirector: false,
    };
    const res2 = await post({
      ...clean(),
      cards: [{ type: "red_card", side: "away", player: "B" }],
      noCards: false,
      ejections: [ej],
      noEjections: false,
    });
    await expectJson(res2, 200);

    let rows = await getDb()
      .select({ id: gameIncidents.id, type: gameIncidents.type, side: gameIncidents.side })
      .from(gameIncidents)
      .where(eq(gameIncidents.gameId, gameId));
    expect(rows.some((r) => r.type === "yellow_card")).toBe(false); // replaced away
    expect(rows.some((r) => r.type === "red_card" && r.side === "away")).toBe(true);
    const ejectionRow = rows.find((r) => r.type === "ejection");
    expect(ejectionRow).toBeDefined();

    // Third submit: a routine correction, ejections resent empty (client
    // never resends already-recorded ejections) — the ejection must survive.
    const res3 = await post({ ...clean(), homeScore: 3 });
    await expectJson(res3, 200);

    rows = await getDb()
      .select({ id: gameIncidents.id, type: gameIncidents.type, side: gameIncidents.side })
      .from(gameIncidents)
      .where(eq(gameIncidents.gameId, gameId));
    expect(rows.find((r) => r.id === ejectionRow!.id && r.type === "ejection")).toBeDefined();
    expect(rows.some((r) => r.type === "red_card")).toBe(false); // replaced away
  });

  it("creates exactly one suspension for an ejection and does not double-create on resubmit", async () => {
    const fresh = await createAdminOrgGameContext();
    const freshCookie = await seedAssignedReferee(fresh.gameId);
    const post2 = (body: unknown) =>
      apiFetch(`/api/referee/matches/${fresh.gameId}/close-out`, {
        method: "POST",
        cookie: freshCookie,
        body: JSON.stringify(body),
      });

    const ej = {
      side: "home",
      player: "9",
      reason: "Violent conduct",
      carriesSuspension: true,
      gamesMissed: 1,
      escalatedToDirector: false,
    };

    const res1 = await post2({ ...clean(), noEjections: false, ejections: [ej] });
    await expectJson(res1, 200);

    // Resubmit: already-recorded ejection is NOT resent (empty array). The
    // None-gate answers "any NEW ejections THIS submission?" — none, so
    // noEjections: true (not a claim that the game had zero ejections ever).
    const res2 = await post2({ ...clean(), noEjections: true, ejections: [] });
    await expectJson(res2, 200);

    const count = await getDb()
      .select({ id: suspensions.id })
      .from(suspensions)
      .innerJoin(gameIncidents, eq(suspensions.gameIncidentId, gameIncidents.id))
      .where(eq(gameIncidents.gameId, fresh.gameId));
    expect(count.length).toBe(1);
  });

  it("rejects an ejection carrying a suspension for a TBD (null) team side", async () => {
    const tbdCtx = await createAdminOrgGameContext();
    // Force the away team to a TBD (null) slot directly in the DB.
    await getDb().update(games).set({ awayTeamId: null }).where(eq(games.id, tbdCtx.gameId));
    const tbdCookie = await seedAssignedReferee(tbdCtx.gameId);

    const ej = {
      side: "away",
      player: "9",
      reason: "Violent conduct",
      carriesSuspension: true,
      gamesMissed: 1,
      escalatedToDirector: false,
    };
    const res = await apiFetch(`/api/referee/matches/${tbdCtx.gameId}/close-out`, {
      method: "POST",
      cookie: tbdCookie,
      body: JSON.stringify({ ...clean(), noEjections: false, ejections: [ej] }),
    });
    expect(res.status).toBe(400);
  });

  it("is opportunistic about check-out: clocks out an open check-in if one exists", async () => {
    const ctx = await createAdminOrgGameContext();
    const ctxCookie = await seedAssignedReferee(ctx.gameId);

    // Find the userId behind ctxCookie by checking gameOfficials for this game.
    const [official] = await getDb()
      .select({ userId: gameOfficials.userId })
      .from(gameOfficials)
      .where(eq(gameOfficials.gameId, ctx.gameId));

    const [entry] = await getDb()
      .insert(timeEntries)
      .values({
        organizationId: ctx.organizationId,
        userId: official.userId,
        venueId: ctx.venueId,
        role: "referee",
        gameId: ctx.gameId,
        clockInAt: new Date(),
      })
      .returning();
    expect(entry.clockOutAt).toBeNull();

    const res = await apiFetch(`/api/referee/matches/${ctx.gameId}/close-out`, {
      method: "POST",
      cookie: ctxCookie,
      body: JSON.stringify(clean()),
    });
    await expectJson(res, 200);

    const [updated] = await getDb()
      .select({ clockOutAt: timeEntries.clockOutAt })
      .from(timeEntries)
      .where(eq(timeEntries.id, entry.id));
    expect(updated.clockOutAt).not.toBeNull();
  });

  it("does not error when there is no open check-in to close out", async () => {
    const ctx = await createAdminOrgGameContext();
    const ctxCookie = await seedAssignedReferee(ctx.gameId);
    const res = await apiFetch(`/api/referee/matches/${ctx.gameId}/close-out`, {
      method: "POST",
      cookie: ctxCookie,
      body: JSON.stringify(clean()),
    });
    expect(res.status).toBe(200);

    const rows = await getDb()
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(eq(timeEntries.gameId, ctx.gameId), isNull(timeEntries.clockOutAt)));
    expect(rows.length).toBe(0);
  });
});
