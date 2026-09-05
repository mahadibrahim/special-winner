/**
 * Task P2 of the 2026-09-05-league-ops-phase2 plan: bulk team scaffolding
 * onto an EXISTING season (POST /api/admin/seasons/:id/teams/scaffold).
 * Previously teams could only be scaffolded at season-creation time; this
 * endpoint reuses the same `bulkCreateTeams` helper (extended with an
 * optional `maxRosterSize`/`namePrefix`) so a season that already went live
 * with zero teams (the 2026-27 catalog's 88-seasons-0-teams gap) can be
 * backfilled.
 *
 * P3 will extend this same file with the placement/publish suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teams } from "@/lib/db/schema/teams";
import { apiFetch, getAdminCookie, getCoachCookie } from "../setup/test-helpers";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";

let adminCookie: string;
let coachCookie: string;
let seasonId: string;
let orgBSeasonId: string | null = null;

const createdTeamIds: string[] = [];

async function scaffoldTeams(
  targetSeasonId: string,
  body: Record<string, unknown>,
  cookie: string | undefined = adminCookie,
) {
  return apiFetch(`/api/admin/seasons/${targetSeasonId}/teams/scaffold`, {
    method: "POST",
    cookie,
    body: JSON.stringify(body),
  });
}

async function countTeamsForSeason(targetSeasonId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.seasonId, targetSeasonId));
  return rows.length;
}

beforeAll(async () => {
  adminCookie = await getAdminCookie();
  coachCookie = await getCoachCookie();

  // Fresh league season inside the seeded admin's org. This helper also
  // creates 2 teams (home/away) as part of a game fixture — the assertions
  // below diff against a `before` count rather than assuming 0.
  const ctx = await createAdminOrgGameContext({
    programType: "league",
    audienceType: "parents",
  });
  seasonId = ctx.seasonId;

  const orgBFixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
  if (orgBFixtureRes.status !== 200) {
    throw new Error(
      `Could not load Org B fixtures (status ${orgBFixtureRes.status}). ` +
        "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
    );
  }
  const orgBFixtures = await orgBFixtureRes.json();
  orgBSeasonId = orgBFixtures.seasonId ?? null;
  if (!orgBSeasonId) {
    throw new Error(
      "Org B fixture has no seasonId — needed for the cross-org 404 case. Run npm run db:seed:e2e.",
    );
  }
});

afterAll(async () => {
  if (createdTeamIds.length > 0) {
    await getDb().delete(teams).where(inArray(teams.id, createdTeamIds));
  }
});

describe("POST /api/admin/seasons/:id/teams/scaffold", () => {
  it("401s for an unauthenticated caller", async () => {
    // Passing `undefined` explicitly would trigger the default parameter
    // (falling back to adminCookie) — use "" so apiFetch omits the Cookie
    // header entirely.
    const res = await scaffoldTeams(seasonId, { count: 3, maxRosterSize: 12 }, "");
    expect(res.status).toBe(401);
  });

  it("403s for a non-admin (coach) caller", async () => {
    const res = await scaffoldTeams(seasonId, { count: 3, maxRosterSize: 12 }, coachCookie);
    expect(res.status).toBe(403);
  });

  it("404s for a season belonging to another org", async () => {
    const res = await scaffoldTeams(orgBSeasonId as string, { count: 3, maxRosterSize: 12 });
    expect(res.status).toBe(404);
  });

  it("422s when count is outside the 1-26 bound", async () => {
    const tooLow = await scaffoldTeams(seasonId, { count: 0, maxRosterSize: 12 });
    expect(tooLow.status).toBe(422);

    const tooHigh = await scaffoldTeams(seasonId, { count: 27, maxRosterSize: 12 });
    expect(tooHigh.status).toBe(422);
  });

  it("creates N teams with the roster cap set; a second call ADDS more (documented semantics)", async () => {
    const before = await countTeamsForSeason(seasonId);

    const res1 = await scaffoldTeams(seasonId, {
      count: 3,
      maxRosterSize: 14,
      namePrefix: `Scaffold-${Date.now()}`,
    });
    expect(res1.status).toBe(201);
    const body1 = await res1.json();
    expect(body1.createdTeamIds).toHaveLength(3);
    expect(body1.totalTeams).toBe(before + 3);
    createdTeamIds.push(...body1.createdTeamIds);

    const inserted1 = await getDb()
      .select()
      .from(teams)
      .where(inArray(teams.id, body1.createdTeamIds));
    expect(inserted1).toHaveLength(3);
    for (const t of inserted1) {
      expect(t.maxRosterSize).toBe(14);
      expect(t.name).toMatch(/Team \d+$/);
    }

    // Second call on the SAME season adds more teams rather than replacing —
    // this matches the pre-existing scaffold-at-creation semantics.
    const res2 = await scaffoldTeams(seasonId, {
      count: 2,
      maxRosterSize: null,
      namePrefix: `Scaffold2-${Date.now()}`,
    });
    expect(res2.status).toBe(201);
    const body2 = await res2.json();
    expect(body2.createdTeamIds).toHaveLength(2);
    expect(body2.totalTeams).toBe(before + 3 + 2);
    createdTeamIds.push(...body2.createdTeamIds);

    const inserted2 = await getDb()
      .select()
      .from(teams)
      .where(inArray(teams.id, body2.createdTeamIds));
    for (const t of inserted2) {
      expect(t.maxRosterSize).toBeNull();
    }
  });

  it("uses the program/age-group name convention when namePrefix is omitted", async () => {
    const res = await scaffoldTeams(seasonId, { count: 1, maxRosterSize: null });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.createdTeamIds).toHaveLength(1);
    createdTeamIds.push(...body.createdTeamIds);

    const [row] = await getDb()
      .select()
      .from(teams)
      .where(eq(teams.id, body.createdTeamIds[0]));
    expect(row.name).toMatch(/^Test Program .* Team 1$/);
  });
});
