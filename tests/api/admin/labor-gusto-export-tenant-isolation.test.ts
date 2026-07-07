/**
 * Tenant-isolation test for GET /api/admin/labor/gusto-export (task 10 of
 * docs/superpowers/plans/2026-07-07-gusto-export.md). Mirrors the
 * cross-tenant attack pattern in
 * tests/api/admin/suspensions-tenant-isolation.test.ts:
 *
 *   Org A ("aspire-sports") — default context on localhost, queried as
 *     the seeded super_admin.
 *   Org B ("orgb")          — resource ids discovered via
 *     GET /api/test/org-fixtures?slug=orgb (E2E_TEST_ENDPOINTS=yes).
 *
 * Both the hours and referee-fees flavors are org-scoped independently
 * (time_entries.organizationId directly; game_officials via
 * games -> seasons -> programs -> locations.organizationId), so both get
 * their own leak check.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { teams, games, gameOfficials } from "@/lib/db/schema/teams";
import { hashPassword } from "@/lib/auth/password";
import { eq } from "drizzle-orm";

const ENDPOINT = "/api/admin/labor/gusto-export";
const DATE = "2031-05-09";

function parseCsv(body: string): string[][] {
  return body
    .trim()
    .split("\n")
    .map((line) => line.split(","));
}

describe("GET /api/admin/labor/gusto-export — tenant isolation", () => {
  let adminCookie: string; // Org A super_admin

  let orgBHoursUserId: string;
  let orgBHoursEmail: string;

  let orgBTeamHomeId: string;
  let orgBTeamAwayId: string;
  let orgBGameId: string;
  let orgBRefUserId: string;
  let orgBRefEmail: string;

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
    expect(fixtures.org?.id).toBeTruthy();
    expect(fixtures.venueId).toBeTruthy();
    expect(fixtures.seasonId).toBeTruthy();

    const db = getDb();
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    // --- Org B hours fixture ---
    orgBHoursEmail = `gusto-orgb-hours-${stamp}@example.com`;
    const [orgBHoursUser] = await db
      .insert(users)
      .values({
        email: orgBHoursEmail,
        passwordHash: await hashPassword("NotLoggedInAs123!"),
        firstName: "OrgBHours",
        lastName: stamp,
        emailVerified: true,
      })
      .returning();
    orgBHoursUserId = orgBHoursUser.id;

    await db.insert(timeEntries).values({
      organizationId: fixtures.org.id,
      userId: orgBHoursUserId,
      venueId: fixtures.venueId,
      role: "coach",
      clockInAt: new Date(`${DATE}T15:00:00Z`),
      clockOutAt: new Date(`${DATE}T16:00:00Z`),
      flaggedOutOfRange: false,
    });

    // --- Org B referee fixture ---
    const [orgBTeamHome] = await db
      .insert(teams)
      .values({ seasonId: fixtures.seasonId, name: `Org B Isolation Home ${stamp}` })
      .returning();
    const [orgBTeamAway] = await db
      .insert(teams)
      .values({ seasonId: fixtures.seasonId, name: `Org B Isolation Away ${stamp}` })
      .returning();
    orgBTeamHomeId = orgBTeamHome.id;
    orgBTeamAwayId = orgBTeamAway.id;

    const [orgBGame] = await db
      .insert(games)
      .values({
        seasonId: fixtures.seasonId,
        homeTeamId: orgBTeamHomeId,
        awayTeamId: orgBTeamAwayId,
        venueId: fixtures.venueId,
        scheduledAt: new Date(`${DATE}T18:00:00Z`),
        status: "scheduled",
      })
      .returning();
    orgBGameId = orgBGame.id;

    orgBRefEmail = `gusto-orgb-ref-${stamp}@example.com`;
    const [orgBRefUser] = await db
      .insert(users)
      .values({
        email: orgBRefEmail,
        passwordHash: await hashPassword("NotLoggedInAs123!"),
        firstName: "OrgBRef",
        lastName: stamp,
        emailVerified: true,
      })
      .returning();
    orgBRefUserId = orgBRefUser.id;

    await db.insert(gameOfficials).values({
      gameId: orgBGameId,
      userId: orgBRefUserId,
      feeCents: 4000,
      paymentStatus: "unpaid",
    });
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(gameOfficials).where(eq(gameOfficials.gameId, orgBGameId));
    await db.delete(games).where(eq(games.id, orgBGameId));
    await db.delete(teams).where(eq(teams.id, orgBTeamHomeId));
    await db.delete(teams).where(eq(teams.id, orgBTeamAwayId));
    await db.delete(timeEntries).where(eq(timeEntries.userId, orgBHoursUserId));
    await db.delete(users).where(eq(users.id, orgBHoursUserId));
    await db.delete(users).where(eq(users.id, orgBRefUserId));
  });

  it("Org A admin's hours export never contains the Org B time_entries row", async () => {
    const res = await apiFetch(`${ENDPOINT}?kind=hours&from=${DATE}&to=${DATE}`, {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const rows = parseCsv(await res.text());
    const leaked = rows.find((r) => r[2] === orgBHoursEmail);
    expect(leaked).toBeUndefined();
  });

  it("Org A admin's referee export never contains the Org B game_officials row", async () => {
    const res = await apiFetch(
      `${ENDPOINT}?kind=referee&from=${DATE}&to=${DATE}&includePaid=1`,
      { cookie: adminCookie },
    );
    expect(res.status).toBe(200);
    const rows = parseCsv(await res.text());
    const leaked = rows.find((r) => r[2] === orgBRefEmail);
    expect(leaked).toBeUndefined();
  });
});
