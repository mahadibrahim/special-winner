/**
 * Task 8 of the 2026-09-06-camps-phase4 plan: the org-wide "needs your
 * attention" feed gains a `camp_groups_unformed` kind — camp seasons
 * (programs.programType='camp', programs.audienceType='parents', status in
 * the readiness window) with confirmed registrations not yet published onto
 * any camp group (pod). Mirrors tests/api/leagues/attention.test.ts (the
 * players_unplaced template) but scoped to camps and linking to the pods
 * planner (`/admin/seasons/:id/pods`) instead of the league placement
 * planner.
 *
 * Fixtures: createAdminOrgGameContext({ programType: "camp" }) mints a fresh
 * camp season + 2 teams (camp groups) inside the seeded admin's org;
 * confirmed registrations are minted directly via DB insert (no Stripe in
 * CI — ci-api-tests-have-no-stripe precedent). Everything minted is torn
 * down in afterAll.
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
      email: `camp-attention-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Parent",
      lastName: `CampAttention${suffix}`,
    })
    .returning();
  createdUserIds.push(user.id);

  const [member] = await db
    .insert(familyMembers)
    .values({
      parentUserId: user.id,
      firstName: "Camper",
      lastName: `CampAttention${suffix}`,
      birthDate: "2017-06-01",
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

/**
 * Wraps createAdminOrgGameContext and tracks every id it mints (season,
 * program, sport, ageGroup, venue, both teams/pods) for cleanup.
 */
async function mintCampSeason(): Promise<Awaited<ReturnType<typeof createAdminOrgGameContext>>> {
  const ctx = await createAdminOrgGameContext({ programType: "camp", audienceType: "parents" });
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

async function getAttentionFeedItems() {
  const res = await apiFetch("/api/admin/attention", { cookie: adminCookie });
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.items as Array<{ id: string; kind: string; text: string; href?: string }>;
}

afterAll(async () => {
  const db = getDb();
  // FK-safe order, mirrors tests/api/leagues/attention.test.ts.
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

describe("GET /api/admin/attention — camp-group readiness (camp_groups_unformed)", () => {
  it("401s for an unauthenticated caller", async () => {
    const res = await apiFetch("/api/admin/attention", { cookie: "" });
    expect(res.status).toBe(401);
  });

  it(
    "a camp season with confirmed, unrostered registrations surfaces camp_groups_unformed " +
      "with the correct count and the pods planner href",
    async () => {
      adminCookie = await getAdminCookie();

      const ctx = await mintCampSeason();
      await setSeasonStatus(ctx.seasonId, "active");

      // 5 confirmed, unrostered registrations — comfortably above the
      // single ambient unplaced camper the e2e seed's own "Test Summer
      // Camp" fixture carries, so this fixture reliably ranks inside the
      // top-10 cap.
      await Promise.all(Array.from({ length: 5 }, () => seedRegistration(ctx.seasonId, "confirmed")));

      const items = await getAttentionFeedItems();

      const unformed = items.find(
        (it) =>
          it.kind === "camp_groups_unformed" && it.href === `/admin/seasons/${ctx.seasonId}/pods`,
      );
      expect(unformed).toBeTruthy();
      expect(unformed!.text).toMatch(/5 campers not in a camp group$/);
    },
  );

  it("a fully-placed camp season (every confirmed registration on a camp group) contributes nothing", async () => {
    adminCookie = await getAdminCookie();

    const ctx = await mintCampSeason();
    await setSeasonStatus(ctx.seasonId, "open");

    const reg = await seedRegistration(ctx.seasonId, "confirmed");
    await getDb().insert(rosters).values({
      teamId: ctx.homeTeamId,
      registrationId: reg.registrationId,
      status: "active",
    });

    const items = await getAttentionFeedItems();

    expect(
      items.some((it) => it.kind === "camp_groups_unformed" && it.id.includes(ctx.seasonId)),
    ).toBe(false);
  });

  it("a youth league season (programType='league') with the same unplaced-registration shape does not surface as camp_groups_unformed", async () => {
    adminCookie = await getAdminCookie();

    const ctx = await createAdminOrgGameContext({ programType: "league", audienceType: "parents" });
    createdSeasonIds.push(ctx.seasonId);
    createdProgramIds.push(ctx.programId);
    createdVenueIds.push(ctx.venueId);
    createdTeamIds.push(ctx.homeTeamId, ctx.awayTeamId);
    await setSeasonStatus(ctx.seasonId, "active");
    await seedRegistration(ctx.seasonId, "confirmed");

    const items = await getAttentionFeedItems();

    expect(
      items.some((it) => it.kind === "camp_groups_unformed" && it.id.includes(ctx.seasonId)),
    ).toBe(false);
  });
});
