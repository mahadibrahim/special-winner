/**
 * Task 4 of the 2026-09-06-camps-phase4 plan: the camp-group planner's two
 * endpoints —
 *
 *   GET  /api/admin/seasons/:id/pods            (planner bootstrap)
 *   POST /api/admin/seasons/:id/pod-placements  (season-locked full-replace publish)
 *
 * Modeled on tests/api/leagues/placement.test.ts (the Phase 2 template):
 * registrations are minted via direct DB insert (no Stripe in CI — see the
 * ci-api-tests-have-no-stripe precedent), fixtures anchor to `new Date()`,
 * and teardown is FK-ordered. Skill fixtures reuse EXISTING `skills` rows
 * from the shared curriculum seed rather than minting the full
 * domain/stage/skill chain; if the DB somehow has none, the avg-score
 * assertion is skipped (mirrors skill-summary-upsert.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { seasons, programs } from "@/lib/db/schema/programs";
import { teams, rosters, venues } from "@/lib/db/schema/teams";
import { sports, ageGroups } from "@/lib/db/schema/sports";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { playerSkillSummary } from "@/lib/db/schema/assessments";
import { skills } from "@/lib/db/schema/curriculum";
import { apiFetch, getAdminCookie, getCoachCookie } from "../setup/test-helpers";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";

let adminCookie: string;
let coachCookie: string;
let orgBSeasonId: string | null = null;
let leagueSeasonId: string; // same-org NON-camp season — must 404 on both endpoints

const createdTeamIds: string[] = [];
const createdRegistrationIds: string[] = [];
const createdFamilyMemberIds: string[] = [];
const createdUserIds: string[] = [];
const createdSeasonIds: string[] = [];
const createdProgramIds: string[] = [];
const createdSportIds: string[] = [];
const createdAgeGroupIds: string[] = [];
const createdVenueIds: string[] = [];

/** Wraps createAdminOrgGameContext and tracks every id it mints (F1 pattern). */
async function mintSeason(
  opts: Parameters<typeof createAdminOrgGameContext>[0] = { programType: "camp" },
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

async function seedRegistration(
  targetSeasonId: string,
  opts: {
    status?: "confirmed" | "waitlisted" | "pending" | "cancelled";
    birthDate?: string | null;
  } = {},
): Promise<{ registrationId: string; familyMemberId: string }> {
  const db = getDb();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const [user] = await db
    .insert(users)
    .values({
      email: `pods-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Parent",
      lastName: `Pods${suffix}`,
    })
    .returning();
  createdUserIds.push(user.id);

  const [member] = await db
    .insert(familyMembers)
    .values({
      parentUserId: user.id,
      firstName: "Camper",
      lastName: `Pods${suffix}`,
      birthDate: opts.birthDate === undefined ? "2018-06-01" : opts.birthDate,
    })
    .returning();
  createdFamilyMemberIds.push(member.id);

  const [reg] = await db
    .insert(registrations)
    .values({
      seasonId: targetSeasonId,
      familyMemberId: member.id,
      registeredByUserId: user.id,
      status: opts.status ?? "confirmed",
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

async function getPods(targetSeasonId: string, cookie: string | undefined = adminCookie) {
  return apiFetch(`/api/admin/seasons/${targetSeasonId}/pods`, { cookie });
}

async function publishPods(
  targetSeasonId: string,
  body: Record<string, unknown>,
  cookie: string | undefined = adminCookie,
) {
  return apiFetch(`/api/admin/seasons/${targetSeasonId}/pod-placements`, {
    method: "POST",
    cookie,
    body: JSON.stringify(body),
  });
}

async function rosterRowsForRegistrations(registrationIds: string[]) {
  if (registrationIds.length === 0) return [];
  return getDb().select().from(rosters).where(inArray(rosters.registrationId, registrationIds));
}

beforeAll(async () => {
  adminCookie = await getAdminCookie();
  coachCookie = await getCoachCookie();

  const leagueCtx = await mintSeason({ programType: "league", audienceType: "parents" });
  leagueSeasonId = leagueCtx.seasonId;

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
  // FK-safe order, mirroring placement.test.ts. playerSkillSummary cascades
  // off familyMembers, rosters cascade off both teams and registrations —
  // the explicit deletes are defense-in-depth.
  if (createdFamilyMemberIds.length > 0) {
    await db
      .delete(playerSkillSummary)
      .where(inArray(playerSkillSummary.familyMemberId, createdFamilyMemberIds));
  }
  if (createdTeamIds.length > 0) {
    await db.delete(rosters).where(inArray(rosters.teamId, createdTeamIds));
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

describe("GET /api/admin/seasons/:id/pods", () => {
  it("401s for an unauthenticated caller", async () => {
    const ctx = await mintSeason({ programType: "camp", audienceType: "parents" });
    const res = await getPods(ctx.seasonId, "");
    expect(res.status).toBe(401);
  });

  it("403s for a non-admin (coach) caller", async () => {
    const ctx = await mintSeason({ programType: "camp", audienceType: "parents" });
    const res = await getPods(ctx.seasonId, coachCookie);
    expect(res.status).toBe(403);
  });

  it("404s for a season belonging to another org", async () => {
    const res = await getPods(orgBSeasonId as string);
    expect(res.status).toBe(404);
  });

  it("404s for a same-org season that is not a camp", async () => {
    const res = await getPods(leagueSeasonId);
    expect(res.status).toBe(404);
  });

  it(
    "returns season/candidates/pods: skillScore averaged in one grouped query vs null when " +
      "never assessed, cancelled regs excluded, published roster membership on pods",
    async () => {
      const db = getDb();
      const ctx = await mintSeason({ programType: "camp", audienceType: "parents" });

      const assessed = await seedRegistration(ctx.seasonId, { birthDate: "2017-03-15" });
      const unassessed = await seedRegistration(ctx.seasonId, { birthDate: "2019-09-01" });
      const cancelled = await seedRegistration(ctx.seasonId, { status: "cancelled" });

      // Seed skill summaries for the assessed camper from EXISTING skills
      // rows (shared curriculum seed) — levels 2 and 4 across two skills
      // (avg 3), or a single level-3 row when only one skill exists.
      const skillRows = await db
        .select({ id: skills.id })
        .from(skills)
        .orderBy(asc(skills.createdAt))
        .limit(2);
      let expectedAvg: number | null = null;
      if (skillRows.length > 0) {
        const levels = skillRows.length >= 2 ? [2, 4] : [3];
        const now = new Date();
        await db.insert(playerSkillSummary).values(
          skillRows.slice(0, levels.length).map((s, i) => ({
            familyMemberId: assessed.familyMemberId,
            skillId: s.id,
            currentLevel: levels[i],
            highestLevel: levels[i],
            firstAssessedAt: now,
            lastAssessedAt: now,
          })),
        );
        expectedAvg = levels.reduce((a, b) => a + b, 0) / levels.length;
      } else {
        console.warn("No skills rows in DB — skipping the avg skillScore assertion.");
      }

      // Publish the unassessed camper onto the home group directly (DB
      // insert, not the endpoint under test) — must show up in that pod's
      // memberRegistrationIds.
      await db.insert(rosters).values({
        teamId: ctx.homeTeamId,
        registrationId: unassessed.registrationId,
        status: "active",
      });

      const res = await getPods(ctx.seasonId);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.season.id).toBe(ctx.seasonId);
      expect(body.season.programType).toBe("camp");
      expect(body.season.formationStrategy).toBeNull(); // Task 1: null until first publish
      expect(typeof body.season.name).toBe("string");

      const candidateIds = body.candidates.map((c: any) => c.registrationId);
      expect(candidateIds).toContain(assessed.registrationId);
      expect(candidateIds).toContain(unassessed.registrationId);
      expect(candidateIds).not.toContain(cancelled.registrationId);

      const assessedRow = body.candidates.find(
        (c: any) => c.registrationId === assessed.registrationId,
      );
      const unassessedRow = body.candidates.find(
        (c: any) => c.registrationId === unassessed.registrationId,
      );
      expect(assessedRow.familyMemberId).toBe(assessed.familyMemberId);
      expect(assessedRow.birthDate).toBe("2017-03-15");
      expect(assessedRow.childName).toMatch(/^Camper Pods/);
      if (expectedAvg !== null) {
        expect(assessedRow.skillScore).toBeCloseTo(expectedAvg, 5);
      }
      expect(unassessedRow.skillScore).toBeNull();

      const homePod = body.pods.find((p: any) => p.teamId === ctx.homeTeamId);
      const awayPod = body.pods.find((p: any) => p.teamId === ctx.awayTeamId);
      expect(homePod).toBeTruthy();
      expect(awayPod).toBeTruthy();
      expect(homePod.memberRegistrationIds).toContain(unassessed.registrationId);
      expect(awayPod.memberRegistrationIds).toEqual([]);
      expect(typeof homePod.name).toBe("string");
      expect("maxRosterSize" in homePod).toBe(true);
    },
  );
});

describe("POST /api/admin/seasons/:id/pod-placements", () => {
  it("401s for an unauthenticated caller", async () => {
    const ctx = await mintSeason({ programType: "camp", audienceType: "parents" });
    const res = await publishPods(ctx.seasonId, { placements: [], formationStrategy: "age" }, "");
    expect(res.status).toBe(401);
  });

  it("403s for a non-admin (coach) caller", async () => {
    const ctx = await mintSeason({ programType: "camp", audienceType: "parents" });
    const res = await publishPods(
      ctx.seasonId,
      { placements: [], formationStrategy: "age" },
      coachCookie,
    );
    expect(res.status).toBe(403);
  });

  it("404s for a season belonging to another org", async () => {
    const res = await publishPods(orgBSeasonId as string, {
      placements: [],
      formationStrategy: "age",
    });
    expect(res.status).toBe(404);
  });

  it("404s for a same-org season that is not a camp", async () => {
    const res = await publishPods(leagueSeasonId, { placements: [], formationStrategy: "age" });
    expect(res.status).toBe(404);
  });

  it("422s an invalid formationStrategy", async () => {
    const ctx = await mintSeason({ programType: "camp", audienceType: "parents" });
    const res = await publishPods(ctx.seasonId, { placements: [], formationStrategy: "vibes" });
    expect(res.status).toBe(422);
  });

  it("publishes 4 campers into 2 camp groups, persists the strategy, and full-replaces on republish", async () => {
    const db = getDb();
    const ctx = await mintSeason({ programType: "camp", audienceType: "parents" });
    const regs = await Promise.all([
      seedRegistration(ctx.seasonId),
      seedRegistration(ctx.seasonId),
      seedRegistration(ctx.seasonId),
      seedRegistration(ctx.seasonId),
    ]);

    // ---- Publish 1: 2 + 2 across the two groups ----
    const res1 = await publishPods(ctx.seasonId, {
      placements: [
        { registrationId: regs[0].registrationId, teamId: ctx.homeTeamId },
        { registrationId: regs[1].registrationId, teamId: ctx.homeTeamId },
        { registrationId: regs[2].registrationId, teamId: ctx.awayTeamId },
        { registrationId: regs[3].registrationId, teamId: ctx.awayTeamId },
      ],
      formationStrategy: "age",
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.published).toBe(4);

    const rows1 = await rosterRowsForRegistrations(regs.map((r) => r.registrationId));
    expect(rows1).toHaveLength(4);
    for (const row of rows1) expect(row.status).toBe("active");
    expect(rows1.find((r) => r.registrationId === regs[0].registrationId)?.teamId).toBe(
      ctx.homeTeamId,
    );

    const [afterFirst] = await db
      .select({ formationStrategy: seasons.formationStrategy })
      .from(seasons)
      .where(eq(seasons.id, ctx.seasonId));
    expect(afterFirst.formationStrategy).toBe("age");

    // ---- Publish 2: move camper 0 to the other group — full replace, so
    // the old row must be GONE (not coexisting) and the strategy updated. ----
    const res2 = await publishPods(ctx.seasonId, {
      placements: [
        { registrationId: regs[0].registrationId, teamId: ctx.awayTeamId },
        { registrationId: regs[1].registrationId, teamId: ctx.homeTeamId },
        { registrationId: regs[2].registrationId, teamId: ctx.awayTeamId },
        { registrationId: regs[3].registrationId, teamId: ctx.awayTeamId },
      ],
      formationStrategy: "manual",
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.published).toBe(4);

    const rows2 = await rosterRowsForRegistrations(regs.map((r) => r.registrationId));
    expect(rows2).toHaveLength(4); // full replace — no duplicate rows
    const movedRows = rows2.filter((r) => r.registrationId === regs[0].registrationId);
    expect(movedRows).toHaveLength(1);
    expect(movedRows[0].teamId).toBe(ctx.awayTeamId);

    const [afterSecond] = await db
      .select({ formationStrategy: seasons.formationStrategy })
      .from(seasons)
      .where(eq(seasons.id, ctx.seasonId));
    expect(afterSecond.formationStrategy).toBe("manual");
  });

  it("rejects a registration from another season with 422 and writes NOTHING (even valid rows)", async () => {
    const ctxA = await mintSeason({ programType: "camp", audienceType: "parents" });
    const ctxB = await mintSeason({ programType: "camp", audienceType: "parents" });
    const validReg = await seedRegistration(ctxA.seasonId);
    const foreignReg = await seedRegistration(ctxB.seasonId);

    const res = await publishPods(ctxA.seasonId, {
      placements: [
        { registrationId: validReg.registrationId, teamId: ctxA.homeTeamId },
        { registrationId: foreignReg.registrationId, teamId: ctxA.homeTeamId },
      ],
      formationStrategy: "age",
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors.some((e: any) => e.registrationId === foreignReg.registrationId)).toBe(true);

    const rows = await rosterRowsForRegistrations([
      validReg.registrationId,
      foreignReg.registrationId,
    ]);
    expect(rows).toHaveLength(0);

    // Strategy is not persisted on a rejected publish either.
    const [seasonRow] = await getDb()
      .select({ formationStrategy: seasons.formationStrategy })
      .from(seasons)
      .where(eq(seasons.id, ctxA.seasonId));
    expect(seasonRow.formationStrategy).toBeNull();
  });

  it("rejects a teamId that does not belong to this season", async () => {
    const ctxA = await mintSeason({ programType: "camp", audienceType: "parents" });
    const ctxB = await mintSeason({ programType: "camp", audienceType: "parents" });
    const reg = await seedRegistration(ctxA.seasonId);

    const res = await publishPods(ctxA.seasonId, {
      placements: [{ registrationId: reg.registrationId, teamId: ctxB.homeTeamId }],
      formationStrategy: "manual",
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors[0].registrationId).toBe(reg.registrationId);

    const rows = await rosterRowsForRegistrations([reg.registrationId]);
    expect(rows).toHaveLength(0);
  });

  it("rejects a non-confirmed registration", async () => {
    const ctx = await mintSeason({ programType: "camp", audienceType: "parents" });
    const reg = await seedRegistration(ctx.seasonId, { status: "waitlisted" });

    const res = await publishPods(ctx.seasonId, {
      placements: [{ registrationId: reg.registrationId, teamId: ctx.homeTeamId }],
      formationStrategy: "age",
    });
    expect(res.status).toBe(422);
    const rows = await rosterRowsForRegistrations([reg.registrationId]);
    expect(rows).toHaveLength(0);
  });

  it("rejects a duplicate registrationId within the batch", async () => {
    const ctx = await mintSeason({ programType: "camp", audienceType: "parents" });
    const reg = await seedRegistration(ctx.seasonId);

    const res = await publishPods(ctx.seasonId, {
      placements: [
        { registrationId: reg.registrationId, teamId: ctx.homeTeamId },
        { registrationId: reg.registrationId, teamId: ctx.awayTeamId },
      ],
      formationStrategy: "manual",
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors.some((e: any) => /duplicate/i.test(e.reason))).toBe(true);

    const rows = await rosterRowsForRegistrations([reg.registrationId]);
    expect(rows).toHaveLength(0);
  });

  it("rejects a batch that overfills a capped camp group, all-or-nothing", async () => {
    const ctx = await mintSeason({ programType: "camp", audienceType: "parents" });

    // Scaffold one cap-1 group through the existing endpoint — also pins the
    // camp naming convention: "<program name> Group N", never "Team".
    const scaffoldRes = await apiFetch(`/api/admin/seasons/${ctx.seasonId}/teams/scaffold`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        count: 1,
        maxRosterSize: 1,
        namePrefix: "Sunny Camp",
        nameNoun: "Group",
      }),
    });
    expect(scaffoldRes.status).toBe(201);
    const { createdTeamIds: podIds } = await scaffoldRes.json();
    createdTeamIds.push(...podIds);
    const cappedPodId = podIds[0];

    const [podRow] = await getDb().select().from(teams).where(eq(teams.id, cappedPodId));
    expect(podRow.name).toMatch(/^Sunny Camp Group \d+$/);

    const reg1 = await seedRegistration(ctx.seasonId);
    const reg2 = await seedRegistration(ctx.seasonId);

    const res = await publishPods(ctx.seasonId, {
      placements: [
        { registrationId: reg1.registrationId, teamId: cappedPodId },
        { registrationId: reg2.registrationId, teamId: cappedPodId },
      ],
      formationStrategy: "manual",
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors.length).toBeGreaterThan(0);

    const rows = await rosterRowsForRegistrations([reg1.registrationId, reg2.registrationId]);
    expect(rows).toHaveLength(0);
  });
});
