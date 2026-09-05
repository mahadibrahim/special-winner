/**
 * Task P2 of the 2026-09-05-league-ops-phase2 plan: bulk team scaffolding
 * onto an EXISTING season (POST /api/admin/seasons/:id/teams/scaffold).
 * Previously teams could only be scaffolded at season-creation time; this
 * endpoint reuses the same `bulkCreateTeams` helper (extended with an
 * optional `maxRosterSize`/`namePrefix`) so a season that already went live
 * with zero teams (the 2026-27 catalog's 88-seasons-0-teams gap) can be
 * backfilled.
 *
 * Task P3 extends this file with the placement planner GET
 * (/api/admin/seasons/:id/placement) and the transactional batch-publish
 * POST (/api/admin/seasons/:id/placements) suites below.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { seasons, programs } from "@/lib/db/schema/programs";
import { teams, rosters, venues } from "@/lib/db/schema/teams";
import { sports, ageGroups } from "@/lib/db/schema/sports";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { apiFetch, getAdminCookie, getCoachCookie } from "../setup/test-helpers";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { ageOnDate } from "@/lib/classes/book-child";

let adminCookie: string;
let coachCookie: string;
let seasonId: string;
let orgBSeasonId: string | null = null;

const createdTeamIds: string[] = [];

// P3 fixture cleanup — registrations must be deleted BEFORE the family
// members/users they reference (registrations.familyMemberId/registeredByUserId
// are ON DELETE RESTRICT, not cascade). Rosters cascade off registrations, so
// they never need explicit cleanup here.
const createdRegistrationIds: string[] = [];
const createdFamilyMemberIds: string[] = [];
const createdUserIds: string[] = [];

// F1 fix (post-review): every `createAdminOrgGameContext` call (~12 across
// this file) mints a full season+program+sport+ageGroup+venue fixture set
// that afterAll previously never deleted — only registrations/familyMembers/
// users and scaffolded teams were cleaned up. Mirrors the tracking +
// FK-ordered teardown pattern from tests/api/leagues/attention.test.ts.
const createdSeasonIds: string[] = [];
const createdProgramIds: string[] = [];
const createdSportIds: string[] = [];
const createdAgeGroupIds: string[] = [];
const createdVenueIds: string[] = [];

/**
 * Wraps createAdminOrgGameContext and tracks every id it mints (season,
 * program, sport, ageGroup, venue, both teams) for F1 cleanup — the helper
 * itself only returns {seasonId, programId, ...}, not sportId/ageGroupId, so
 * those are fetched with one follow-up read each (mirrors attention.test.ts).
 */
async function mintSeason(
  opts: Parameters<typeof createAdminOrgGameContext>[0] = {},
): Promise<Awaited<ReturnType<typeof createAdminOrgGameContext>>> {
  const ctx = await createAdminOrgGameContext(opts);
  createdSeasonIds.push(ctx.seasonId);
  createdProgramIds.push(ctx.programId);
  createdVenueIds.push(ctx.venueId);
  createdTeamIds.push(ctx.homeTeamId, ctx.awayTeamId);

  const db = getDb();
  const [programRow] = await db
    .select({ sportId: programs.sportId })
    .from(programs)
    .where(eq(programs.id, ctx.programId));
  if (programRow?.sportId) createdSportIds.push(programRow.sportId);

  const [seasonRow] = await db
    .select({ ageGroupId: seasons.ageGroupId })
    .from(seasons)
    .where(eq(seasons.id, ctx.seasonId));
  if (seasonRow?.ageGroupId) createdAgeGroupIds.push(seasonRow.ageGroupId);

  return ctx;
}

/**
 * Seeds a family + registration directly via DB insert (no Stripe available
 * in CI — see ci-api-tests-have-no-stripe precedent) against an existing
 * season. Defaults to `confirmed`, the only status placements can be
 * published from.
 */
async function seedRegistration(
  targetSeasonId: string,
  status: "confirmed" | "waitlisted" | "pending" | "cancelled" = "confirmed",
): Promise<{ registrationId: string; familyMemberId: string }> {
  const db = getDb();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const [user] = await db
    .insert(users)
    .values({
      email: `placement-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Parent",
      lastName: `Placement${suffix}`,
    })
    .returning();
  createdUserIds.push(user.id);

  const [member] = await db
    .insert(familyMembers)
    .values({
      parentUserId: user.id,
      firstName: "Kid",
      lastName: `Placement${suffix}`,
      birthDate: "2015-06-01",
    })
    .returning();
  createdFamilyMemberIds.push(member.id);

  const [reg] = await db
    .insert(registrations)
    .values({
      seasonId: targetSeasonId,
      familyMemberId: member.id,
      registeredByUserId: user.id,
      status,
      paymentStatus: "paid",
      amountPaidCents: 10000,
      amountDueCents: 10000,
      registrationType: "full",
      waiverSigned: true,
    })
    .returning();
  createdRegistrationIds.push(reg.id);

  return { registrationId: reg.id, familyMemberId: member.id };
}

async function getPlacementData(targetSeasonId: string, cookie: string | undefined = adminCookie) {
  return apiFetch(`/api/admin/seasons/${targetSeasonId}/placement`, { cookie });
}

async function publishPlacements(
  targetSeasonId: string,
  assignments: Array<{ registrationId: string; teamId: string }>,
  cookie: string | undefined = adminCookie,
) {
  return apiFetch(`/api/admin/seasons/${targetSeasonId}/placements`, {
    method: "POST",
    cookie,
    body: JSON.stringify({ assignments }),
  });
}

async function rosterRowsForRegistrations(registrationIds: string[]) {
  if (registrationIds.length === 0) return [];
  return getDb().select().from(rosters).where(inArray(rosters.registrationId, registrationIds));
}

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
  const ctx = await mintSeason({
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
  const db = getDb();
  // FK-safe order (rosters -> teams -> registrations -> familyMembers/users
  // -> seasons -> programs -> sports/ageGroups/venues), mirroring
  // attention.test.ts's F2 teardown. Rosters are also cascade-deleted by
  // both the team delete and the registration delete below, so the explicit
  // roster delete here is defense-in-depth, not load-bearing.
  if (createdTeamIds.length > 0) {
    await db.delete(rosters).where(inArray(rosters.teamId, createdTeamIds));
  }
  if (createdTeamIds.length > 0) {
    await db.delete(teams).where(inArray(teams.id, createdTeamIds));
  }
  if (createdRegistrationIds.length > 0) {
    await db.delete(registrations).where(inArray(registrations.id, createdRegistrationIds));
  }
  if (createdFamilyMemberIds.length > 0) {
    await db.delete(familyMembers).where(inArray(familyMembers.id, createdFamilyMemberIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  if (createdSeasonIds.length > 0) {
    await db.delete(seasons).where(inArray(seasons.id, createdSeasonIds));
  }
  if (createdProgramIds.length > 0) {
    await db.delete(programs).where(inArray(programs.id, createdProgramIds));
  }
  if (createdSportIds.length > 0) {
    await db.delete(sports).where(inArray(sports.id, createdSportIds));
  }
  if (createdAgeGroupIds.length > 0) {
    await db.delete(ageGroups).where(inArray(ageGroups.id, createdAgeGroupIds));
  }
  if (createdVenueIds.length > 0) {
    await db.delete(venues).where(inArray(venues.id, createdVenueIds));
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

  it("with a namePrefix, creates N teams with that prefix and the roster cap set", async () => {
    const before = await countTeamsForSeason(seasonId);
    const prefix = `Scaffold-${Date.now()}`;

    const res = await scaffoldTeams(seasonId, {
      count: 3,
      maxRosterSize: 14,
      namePrefix: prefix,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.createdTeamIds).toHaveLength(3);
    expect(body.totalTeams).toBe(before + 3);
    createdTeamIds.push(...body.createdTeamIds);

    const inserted = await getDb()
      .select()
      .from(teams)
      .where(inArray(teams.id, body.createdTeamIds));
    expect(inserted).toHaveLength(3);
    for (const t of inserted) {
      expect(t.maxRosterSize).toBe(14);
      expect(t.name).toMatch(new RegExp(`^${prefix} Team \\d+$`));
    }
  });

  it(
    "under the default naming convention, a second call ADDS more teams and CONTINUES numbering " +
      "from the existing count (F1 fix) — names never collide across the two calls",
    async () => {
      const before = await countTeamsForSeason(seasonId);

      // Both calls omit namePrefix, exercising the "{program} {ageGroup} Team N"
      // default convention end to end.
      const res1 = await scaffoldTeams(seasonId, { count: 3, maxRosterSize: 14 });
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
        expect(t.name).toMatch(/^Test Program .* Team \d+$/);
      }
      // Numbers continue from `before` rather than restarting at 1.
      const numbers1 = inserted1
        .map((t) => Number(t.name.match(/Team (\d+)$/)?.[1]))
        .sort((a, b) => a - b);
      expect(numbers1).toEqual([before + 1, before + 2, before + 3]);

      // Second call on the SAME season, still no namePrefix — adds more teams
      // rather than replacing (documented semantics) and must continue
      // numbering from where the first call left off, not restart at 1.
      const res2 = await scaffoldTeams(seasonId, { count: 2, maxRosterSize: null });
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
      const numbers2 = inserted2
        .map((t) => Number(t.name.match(/Team (\d+)$/)?.[1]))
        .sort((a, b) => a - b);
      expect(numbers2).toEqual([before + 4, before + 5]);

      // No name collisions across the two batches (the bug F1 fixed: naming
      // used to restart at "Team 1" on every call regardless of existing
      // teams, so a second default-convention call would duplicate names).
      const allNames = [...inserted1, ...inserted2].map((t) => t.name);
      expect(new Set(allNames).size).toBe(allNames.length);
    },
  );
});

describe("GET /api/admin/seasons/:id/placement", () => {
  it("401s for an unauthenticated caller", async () => {
    const res = await getPlacementData(seasonId, "");
    expect(res.status).toBe(401);
  });

  it("403s for a non-admin (coach) caller", async () => {
    const res = await getPlacementData(seasonId, coachCookie);
    expect(res.status).toBe(403);
  });

  it("404s for a season belonging to another org", async () => {
    const res = await getPlacementData(orgBSeasonId as string);
    expect(res.status).toBe(404);
  });

  it("returns season/team/unplaced shape: teams with zero counts, unplaced with childName+age, rostered regs excluded", async () => {
    const ctx = await mintSeason({ programType: "league", audienceType: "parents" });

    const unplacedReg = await seedRegistration(ctx.seasonId, "confirmed");
    const rosteredReg = await seedRegistration(ctx.seasonId, "confirmed");

    // Publish the second registration onto the home team directly (DB
    // insert, not the endpoint under test) so it should NOT show up as
    // unplaced.
    await getDb().insert(rosters).values({
      teamId: ctx.homeTeamId,
      registrationId: rosteredReg.registrationId,
      status: "active",
    });

    const res = await getPlacementData(ctx.seasonId);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.season.id).toBe(ctx.seasonId);
    expect(typeof body.season.audienceType).toBe("string");

    const homeTeam = body.teams.find((t: any) => t.teamId === ctx.homeTeamId);
    const awayTeam = body.teams.find((t: any) => t.teamId === ctx.awayTeamId);
    expect(homeTeam).toBeTruthy();
    expect(awayTeam).toBeTruthy();
    expect(homeTeam.currentCount).toBe(1); // the directly-rostered registration
    expect(awayTeam.currentCount).toBe(0);
    expect(homeTeam.coachUserId).toBeNull();
    expect(homeTeam.coachName).toBeNull();

    const unplacedIds = body.unplaced.map((r: any) => r.registrationId);
    expect(unplacedIds).toContain(unplacedReg.registrationId);
    expect(unplacedIds).not.toContain(rosteredReg.registrationId);

    const row = body.unplaced.find((r: any) => r.registrationId === unplacedReg.registrationId);
    expect(row.childName).toMatch(/^Kid Placement/);
    expect(row.age).toBe(ageOnDate("2015-06-01", new Date()));
  });
});

describe("POST /api/admin/seasons/:id/placements", () => {
  it("401s for an unauthenticated caller", async () => {
    const ctx = await mintSeason({ programType: "league", audienceType: "parents" });
    const res = await publishPlacements(ctx.seasonId, [], "");
    expect(res.status).toBe(401);
  });

  it("403s for a non-admin (coach) caller", async () => {
    const ctx = await mintSeason({ programType: "league", audienceType: "parents" });
    const res = await publishPlacements(ctx.seasonId, [], coachCookie);
    expect(res.status).toBe(403);
  });

  it("404s for a season belonging to another org", async () => {
    const res = await publishPlacements(orgBSeasonId as string, []);
    expect(res.status).toBe(404);
  });

  it("happy path: publishes 4 registrations across 2 teams, writes active roster rows, and returns per-team counts", async () => {
    const ctx = await mintSeason({ programType: "league", audienceType: "parents" });
    const regs = await Promise.all([
      seedRegistration(ctx.seasonId),
      seedRegistration(ctx.seasonId),
      seedRegistration(ctx.seasonId),
      seedRegistration(ctx.seasonId),
    ]);

    const assignments = [
      { registrationId: regs[0].registrationId, teamId: ctx.homeTeamId },
      { registrationId: regs[1].registrationId, teamId: ctx.homeTeamId },
      { registrationId: regs[2].registrationId, teamId: ctx.awayTeamId },
      { registrationId: regs[3].registrationId, teamId: ctx.awayTeamId },
    ];

    const res = await publishPlacements(ctx.seasonId, assignments);
    expect(res.status).toBe(201);
    const body = await res.json();

    const homeCount = body.teams.find((t: any) => t.teamId === ctx.homeTeamId)?.newCount;
    const awayCount = body.teams.find((t: any) => t.teamId === ctx.awayTeamId)?.newCount;
    expect(homeCount).toBe(2);
    expect(awayCount).toBe(2);

    const rows = await rosterRowsForRegistrations(regs.map((r) => r.registrationId));
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.status).toBe("active");
    }
  });

  it("over-cap batch is rejected all-or-nothing: no rows written, even for assignments that would have fit", async () => {
    const ctx = await mintSeason({ programType: "league", audienceType: "parents" });
    const scaffoldRes = await scaffoldTeams(ctx.seasonId, { count: 1, maxRosterSize: 1 });
    expect(scaffoldRes.status).toBe(201);
    const { createdTeamIds: capTeamIds } = await scaffoldRes.json();
    createdTeamIds.push(...capTeamIds);
    const cappedTeamId = capTeamIds[0];

    const reg1 = await seedRegistration(ctx.seasonId);
    const reg2 = await seedRegistration(ctx.seasonId);

    const res = await publishPlacements(ctx.seasonId, [
      { registrationId: reg1.registrationId, teamId: cappedTeamId },
      { registrationId: reg2.registrationId, teamId: cappedTeamId },
    ]);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);

    const rows = await rosterRowsForRegistrations([reg1.registrationId, reg2.registrationId]);
    expect(rows).toHaveLength(0);
  });

  it("rejects a registration already rostered onto a team in this season", async () => {
    const ctx = await mintSeason({ programType: "league", audienceType: "parents" });
    const reg = await seedRegistration(ctx.seasonId);

    const first = await publishPlacements(ctx.seasonId, [
      { registrationId: reg.registrationId, teamId: ctx.homeTeamId },
    ]);
    expect(first.status).toBe(201);

    const second = await publishPlacements(ctx.seasonId, [
      { registrationId: reg.registrationId, teamId: ctx.awayTeamId },
    ]);
    expect(second.status).toBe(422);
    const body = await second.json();
    expect(body.errors[0].registrationId).toBe(reg.registrationId);
    expect(body.errors[0].reason).toMatch(/already rostered/i);

    // Still only the original placement — the rejected retry wrote nothing.
    const rows = await rosterRowsForRegistrations([reg.registrationId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].teamId).toBe(ctx.homeTeamId);
  });

  it("rejects a registration that belongs to a different season", async () => {
    const ctxA = await mintSeason({ programType: "league", audienceType: "parents" });
    const ctxB = await mintSeason({ programType: "league", audienceType: "parents" });
    const regFromB = await seedRegistration(ctxB.seasonId);

    const res = await publishPlacements(ctxA.seasonId, [
      { registrationId: regFromB.registrationId, teamId: ctxA.homeTeamId },
    ]);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors[0].registrationId).toBe(regFromB.registrationId);

    const rows = await rosterRowsForRegistrations([regFromB.registrationId]);
    expect(rows).toHaveLength(0);
  });

  it("rejects a batch with a duplicate registrationId targeting two teams", async () => {
    const ctx = await mintSeason({ programType: "league", audienceType: "parents" });
    const reg = await seedRegistration(ctx.seasonId);

    const res = await publishPlacements(ctx.seasonId, [
      { registrationId: reg.registrationId, teamId: ctx.homeTeamId },
      { registrationId: reg.registrationId, teamId: ctx.awayTeamId },
    ]);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors.some((e: any) => /duplicate/i.test(e.reason))).toBe(true);

    const rows = await rosterRowsForRegistrations([reg.registrationId]);
    expect(rows).toHaveLength(0);
  });

  it("rejects a waitlisted registration", async () => {
    const ctx = await mintSeason({ programType: "league", audienceType: "parents" });
    const reg = await seedRegistration(ctx.seasonId, "waitlisted");

    const res = await publishPlacements(ctx.seasonId, [
      { registrationId: reg.registrationId, teamId: ctx.homeTeamId },
    ]);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors[0].registrationId).toBe(reg.registrationId);

    const rows = await rosterRowsForRegistrations([reg.registrationId]);
    expect(rows).toHaveLength(0);
  });
});

describe("POST /api/admin/rosters (legacy single add) — shares the season placement lock", () => {
  // The lock itself is a shared-discipline guarantee: this endpoint, the
  // batch placement publish, and the team scaffold endpoint all take the
  // SAME `FOR UPDATE` lock on the season row, which is what rules the
  // overshoot race out — no concurrency test is needed to demonstrate that
  // (two truly concurrent requests would just serialize through the lock).
  // These two cases confirm this endpoint's own behavior is unchanged now
  // that its dupe check + cap check + insert run inside a transaction.
  it("happy path: adds a player to a team's roster", async () => {
    const ctx = await mintSeason({ programType: "league", audienceType: "parents" });
    const reg = await seedRegistration(ctx.seasonId);

    const res = await apiFetch("/api/admin/rosters", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ teamId: ctx.homeTeamId, registrationId: reg.registrationId }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.roster.teamId).toBe(ctx.homeTeamId);
    expect(body.roster.registrationId).toBe(reg.registrationId);
    expect(body.roster.status).toBe("active");

    const rows = await rosterRowsForRegistrations([reg.registrationId]);
    expect(rows).toHaveLength(1);
  });

  it("rejects (400) once the team's roster is at maxRosterSize, and writes nothing", async () => {
    const ctx = await mintSeason({ programType: "league", audienceType: "parents" });
    const scaffoldRes = await scaffoldTeams(ctx.seasonId, { count: 1, maxRosterSize: 1 });
    expect(scaffoldRes.status).toBe(201);
    const { createdTeamIds: capTeamIds } = await scaffoldRes.json();
    createdTeamIds.push(...capTeamIds);
    const cappedTeamId = capTeamIds[0];

    const reg1 = await seedRegistration(ctx.seasonId);
    const reg2 = await seedRegistration(ctx.seasonId);

    const first = await apiFetch("/api/admin/rosters", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ teamId: cappedTeamId, registrationId: reg1.registrationId }),
    });
    expect(first.status).toBe(201);

    const second = await apiFetch("/api/admin/rosters", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ teamId: cappedTeamId, registrationId: reg2.registrationId }),
    });
    expect(second.status).toBe(400);
    const body = await second.json();
    expect(body.error).toMatch(/roster is full/i);

    const rows = await rosterRowsForRegistrations([reg2.registrationId]);
    expect(rows).toHaveLength(0);
  });
});
