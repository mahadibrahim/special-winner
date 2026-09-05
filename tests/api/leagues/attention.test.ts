/**
 * Task P5 of the 2026-09-05-league-ops-phase2 plan: season readiness
 * visibility — the org-wide "needs your attention" feed gains two new kinds,
 * `teams_coachless` and `players_unplaced`, scoped to youth league seasons
 * (programs.audienceType='parents' AND programs.programType='league') whose
 * status is in ('forming', 'open', 'active').
 *
 * Fixture recipe mirrors tests/api/leagues/placement.test.ts:
 * createAdminOrgGameContext gives a fresh season + 2 teams inside the seeded
 * admin's org, then confirmed registrations are minted directly via DB
 * insert (no Stripe in CI — ci-api-tests-have-no-stripe precedent).
 * createAdminOrgGameContext's season defaults to status 'draft', so every
 * test here bumps it into the scanned window explicitly.
 *
 * F1 fix (post-review): the live feed already carries a large ambient
 * backlog of qualifying seasons in this shared org — measured at 255
 * players_unplaced / 9 teams_coachless rows before this fix — so each kind
 * is now capped to its top 10 (by count DESC) with a "+ N more" summary
 * row when truncated. That ambient backlog also means a test fixture with
 * a small count (e.g. 1-2) has no reliable chance of ranking in the top 10
 * out of hundreds of rows, so:
 *   - the "happy path" identity-based assertions below give their fixture
 *     season a count comfortably above every ambient value observed
 *     (max 5 for coachless; unplaced counts sampled were all 2) so it's
 *     virtually certain to rank inside the cap regardless of ambient noise.
 *   - the new cap-enforcement test (F1) avoids identity/ranking assumptions
 *     entirely — it checks the cap's arithmetic (detail-row count + parsed
 *     remainder) is internally consistent before vs. after minting N more
 *     qualifying seasons, which holds regardless of how much ambient data
 *     already exists.
 *
 * F2 fix (post-review): every fixture this file mints — including every
 * `createAdminOrgGameContext` call's season/program/sport/ageGroup/venue,
 * not just the registrations/familyMembers/users tracked previously — is
 * torn down in `afterAll` so this suite stops adding to that ambient
 * backlog on every run.
 */
import { describe, it, expect, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { seasons, programs } from "@/lib/db/schema/programs";
import { teams, rosters, venues } from "@/lib/db/schema/teams";
import { sports, ageGroups } from "@/lib/db/schema/sports";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";

let adminCookie: string;

const createdRegistrationIds: string[] = [];
const createdFamilyMemberIds: string[] = [];
const createdUserIds: string[] = [];
const createdTeamIds: string[] = [];
const createdSeasonIds: string[] = [];
const createdProgramIds: string[] = [];
const createdSportIds: string[] = [];
const createdAgeGroupIds: string[] = [];
const createdVenueIds: string[] = [];

async function seedRegistration(
  targetSeasonId: string,
  status: "confirmed" | "waitlisted" | "pending" | "cancelled" = "confirmed",
): Promise<{ registrationId: string; familyMemberId: string }> {
  const db = getDb();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const [user] = await db
    .insert(users)
    .values({
      email: `attention-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Parent",
      lastName: `Attention${suffix}`,
    })
    .returning();
  createdUserIds.push(user.id);

  const [member] = await db
    .insert(familyMembers)
    .values({
      parentUserId: user.id,
      firstName: "Kid",
      lastName: `Attention${suffix}`,
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

async function setSeasonStatus(seasonId: string, status: "forming" | "open" | "active" | "draft") {
  await getDb().update(seasons).set({ status }).where(eq(seasons.id, seasonId));
}

async function setTeamCoach(teamId: string, coachUserId: string) {
  await getDb().update(teams).set({ coachUserId }).where(eq(teams.id, teamId));
}

async function makeCoachUser(): Promise<string> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const [user] = await getDb()
    .insert(users)
    .values({
      email: `attention-coach-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Coach",
      lastName: `Attention${suffix}`,
    })
    .returning();
  createdUserIds.push(user.id);
  return user.id;
}

/**
 * Adds `count` more coachless teams directly onto a season (no game/venue
 * needed — the teams_coachless query only joins `teams`). Used to push a
 * test fixture's own coachless count comfortably above ambient noise.
 */
async function addCoachlessTeams(seasonId: string, count: number): Promise<void> {
  const db = getDb();
  for (let i = 0; i < count; i++) {
    const [team] = await db
      .insert(teams)
      .values({ seasonId, name: `Extra-${Date.now()}-${i}-${Math.floor(Math.random() * 1e6)}` })
      .returning();
    createdTeamIds.push(team.id);
  }
}

/**
 * Wraps createAdminOrgGameContext and tracks every id it mints (season,
 * program, sport, ageGroup, venue, both teams) for F2 cleanup — the helper
 * itself only returns {seasonId, programId, ...}, not sportId/ageGroupId,
 * so those are fetched with one follow-up read each (mirrors
 * tests/e2e/league-placement.spec.ts's beforeAll).
 */
async function mintSeason(opts: {
  audienceType: "parents" | "players";
}): Promise<Awaited<ReturnType<typeof createAdminOrgGameContext>>> {
  const ctx = await createAdminOrgGameContext({ programType: "league", audienceType: opts.audienceType });
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
 * Mints a minimal season on an already-tracked program, with no teams,
 * venue, or game — everything the players_unplaced query needs is a
 * qualifying season plus a confirmed, unrostered registration. Used by the
 * cap-enforcement test to cheaply mint many qualifying seasons.
 */
async function mintLeanUnplacedSeason(programId: string): Promise<string> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const [season] = await getDb()
    .insert(seasons)
    .values({
      programId,
      name: `Lean ${stamp}`,
      slug: `lean-${stamp}`,
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 60 * 86400 * 1000).toISOString().split("T")[0],
      priceCents: 10000,
      status: "active",
    })
    .returning();
  createdSeasonIds.push(season.id);
  await seedRegistration(season.id, "confirmed");
  return season.id;
}

async function getAttentionFeedItems() {
  const res = await apiFetch("/api/admin/attention", { cookie: adminCookie });
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.items as Array<{ id: string; kind: string; text: string; href?: string }>;
}

afterAll(async () => {
  const db = getDb();
  // FK-safe order (rosters -> teams -> registrations -> familyMembers/users
  // -> seasons -> programs -> sports/ageGroups/venues). Rosters are also
  // cascade-deleted by both the team delete and the registration delete
  // below, so this line is defense-in-depth, not load-bearing.
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

describe("GET /api/admin/attention — season readiness (teams_coachless / players_unplaced)", () => {
  it("401s for an unauthenticated caller", async () => {
    const res = await apiFetch("/api/admin/attention", { cookie: "" });
    expect(res.status).toBe(401);
  });

  it(
    "a youth league season with coachless teams + unplaced confirmed regs surfaces both kinds " +
      "with correct counts and links",
    async () => {
      adminCookie = await getAdminCookie();

      const ctx = await mintSeason({ audienceType: "parents" });
      await setSeasonStatus(ctx.seasonId, "active");

      // Staff the away team, leave home coachless, then add 5 MORE
      // coachless teams (total 6) — comfortably above every ambient
      // coachless count observed live (max 5) so this fixture reliably
      // ranks inside the top-10 cap regardless of ambient noise.
      const coachUserId = await makeCoachUser();
      await setTeamCoach(ctx.awayTeamId, coachUserId);
      await addCoachlessTeams(ctx.seasonId, 5);

      // 25 confirmed, unrostered registrations — comfortably above every
      // ambient unplaced count sampled live (observed values were all 2),
      // for the same top-10-ranking reliability reason.
      await Promise.all(
        Array.from({ length: 25 }, () => seedRegistration(ctx.seasonId, "confirmed")),
      );

      const items = await getAttentionFeedItems();

      const coachless = items.find(
        (it) => it.kind === "teams_coachless" && it.href === `/admin/seasons/${ctx.seasonId}`,
      );
      expect(coachless).toBeTruthy();
      expect(coachless!.text).toMatch(/6 teams without a coach/);

      const unplaced = items.find(
        (it) =>
          it.kind === "players_unplaced" &&
          it.href === `/admin/seasons/${ctx.seasonId}/placement`,
      );
      expect(unplaced).toBeTruthy();
      expect(unplaced!.text).toMatch(/25 players unplaced/);
    },
  );

  it("a fully-staffed, fully-placed youth league season contributes nothing", async () => {
    adminCookie = await getAdminCookie();

    const ctx = await mintSeason({ audienceType: "parents" });
    await setSeasonStatus(ctx.seasonId, "open");

    const coachA = await makeCoachUser();
    const coachB = await makeCoachUser();
    await setTeamCoach(ctx.homeTeamId, coachA);
    await setTeamCoach(ctx.awayTeamId, coachB);

    const reg = await seedRegistration(ctx.seasonId, "confirmed");
    await getDb().insert(rosters).values({
      teamId: ctx.homeTeamId,
      registrationId: reg.registrationId,
      status: "active",
    });

    const items = await getAttentionFeedItems();

    // Absence assertions are unaffected by the top-10 cap: a row that
    // doesn't satisfy the WHERE/HAVING clauses at all is excluded
    // regardless of ranking, so no count-inflation is needed here.
    expect(items.some((it) => it.kind === "teams_coachless" && it.id.includes(ctx.seasonId))).toBe(
      false,
    );
    expect(items.some((it) => it.kind === "players_unplaced" && it.id.includes(ctx.seasonId))).toBe(
      false,
    );
  });

  it("an adult league season (audienceType='players') with the same gaps contributes nothing — youth-only scope", async () => {
    adminCookie = await getAdminCookie();

    const ctx = await mintSeason({ audienceType: "players" });
    await setSeasonStatus(ctx.seasonId, "active");
    // Deliberately leave both teams coachless and seed unplaced regs — this
    // season should still contribute nothing since it's an adult ("players")
    // audience, not youth ("parents").
    await seedRegistration(ctx.seasonId, "confirmed");
    await seedRegistration(ctx.seasonId, "confirmed");

    const items = await getAttentionFeedItems();

    expect(items.some((it) => it.kind === "teams_coachless" && it.id.includes(ctx.seasonId))).toBe(
      false,
    );
    expect(items.some((it) => it.kind === "players_unplaced" && it.id.includes(ctx.seasonId))).toBe(
      false,
    );
  });

  it("a youth league season stuck in 'draft' status (never bumped into the scan window) contributes nothing", async () => {
    adminCookie = await getAdminCookie();

    const ctx = await mintSeason({ audienceType: "parents" });
    // Status left at its default ('draft') — outside (forming, open, active).
    await seedRegistration(ctx.seasonId, "confirmed");

    const items = await getAttentionFeedItems();

    expect(items.some((it) => it.kind === "teams_coachless" && it.id.includes(ctx.seasonId))).toBe(
      false,
    );
    expect(items.some((it) => it.kind === "players_unplaced" && it.id.includes(ctx.seasonId))).toBe(
      false,
    );
  });

  describe("cap enforcement (F1) — each kind is bounded at 10 detail rows + 1 summary row", () => {
    it("minting more qualifying seasons past the cap keeps exactly 10 detail rows and grows the summary remainder by the exact number minted", async () => {
      adminCookie = await getAdminCookie();

      function parseTotal(
        items: Array<{ id: string; kind: string; text: string }>,
      ): { detailCount: number; total: number } {
        const detail = items.filter(
          (it) => it.kind === "players_unplaced" && it.id !== "unplaced-more",
        );
        const summary = items.find(
          (it) => it.kind === "players_unplaced" && it.id === "unplaced-more",
        );
        const remainder = summary ? Number(summary.text.match(/\+ (\d+)/)?.[1] ?? NaN) : 0;
        return { detailCount: detail.length, total: detail.length + remainder };
      }

      // Baseline BEFORE minting anything new — this org's shared dev/staging
      // database already carries a large ambient backlog (255
      // players_unplaced rows were observed live before this fix), so this
      // test doesn't assume a clean slate. It instead mints enough MORE
      // qualifying seasons to *guarantee* crossing the cap boundary (whether
      // the ambient count starts near 0 or already in the hundreds) and then
      // checks the cap's arithmetic is self-consistent — never which
      // specific seasons rank in the top 10 (that would be flaky given the
      // ambient noise).
      const before = parseTotal(await getAttentionFeedItems());
      const mintCount = Math.max(5, 12 - before.total);

      const shared = await mintSeason({ audienceType: "parents" });
      const mintedSeasonIds = await Promise.all(
        Array.from({ length: mintCount }, () => mintLeanUnplacedSeason(shared.programId)),
      );
      expect(mintedSeasonIds).toHaveLength(mintCount);

      const afterItems = await getAttentionFeedItems();
      const after = parseTotal(afterItems);

      expect(after.detailCount).toBe(10);
      expect(after.total).toBe(before.total + mintCount);

      const summary = afterItems.find(
        (it) => it.kind === "players_unplaced" && it.id === "unplaced-more",
      );
      expect(summary).toBeTruthy();
      expect(summary!.href).toBe("/admin/seasons");
      expect(summary!.text).toMatch(/^\+ \d+ more seasons? with unplaced players$/);
    });
  });
});
