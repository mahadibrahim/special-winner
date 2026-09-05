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
 */
import { describe, it, expect, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { seasons } from "@/lib/db/schema/programs";
import { teams, rosters } from "@/lib/db/schema/teams";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";

let adminCookie: string;

const createdRegistrationIds: string[] = [];
const createdFamilyMemberIds: string[] = [];
const createdUserIds: string[] = [];

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

async function getAttentionFeedItems() {
  const res = await apiFetch("/api/admin/attention", { cookie: adminCookie });
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.items as Array<{ id: string; kind: string; text: string; href?: string }>;
}

afterAll(async () => {
  const db = getDb();
  // FK-safe order, mirrors placement.test.ts: registrations before the
  // family members/users they reference (RESTRICT, not cascade).
  if (createdRegistrationIds.length > 0) {
    await db.delete(registrations).where(inArray(registrations.id, createdRegistrationIds));
  }
  if (createdFamilyMemberIds.length > 0) {
    await db.delete(familyMembers).where(inArray(familyMembers.id, createdFamilyMemberIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
});

describe("GET /api/admin/attention — season readiness (teams_coachless / players_unplaced)", () => {
  it("401s for an unauthenticated caller", async () => {
    const res = await apiFetch("/api/admin/attention", { cookie: "" });
    expect(res.status).toBe(401);
  });

  it(
    "a youth league season with 1 coachless team + 2 unplaced confirmed regs surfaces both kinds " +
      "with correct counts and links",
    async () => {
      adminCookie = await getAdminCookie();

      const ctx = await createAdminOrgGameContext({ programType: "league", audienceType: "parents" });
      await setSeasonStatus(ctx.seasonId, "active");

      // Staff the away team so exactly one team (home) is coachless.
      const coachUserId = await makeCoachUser();
      await setTeamCoach(ctx.awayTeamId, coachUserId);

      // Two confirmed, unrostered registrations — neither team receives a
      // roster row, so both count as unplaced.
      await seedRegistration(ctx.seasonId, "confirmed");
      await seedRegistration(ctx.seasonId, "confirmed");

      const items = await getAttentionFeedItems();

      const coachless = items.find(
        (it) => it.kind === "teams_coachless" && it.href === `/admin/seasons/${ctx.seasonId}`,
      );
      expect(coachless).toBeTruthy();
      expect(coachless!.text).toMatch(/1/);

      const unplaced = items.find(
        (it) =>
          it.kind === "players_unplaced" &&
          it.href === `/admin/seasons/${ctx.seasonId}/placement`,
      );
      expect(unplaced).toBeTruthy();
      expect(unplaced!.text).toMatch(/2/);
    },
  );

  it("a fully-staffed, fully-placed youth league season contributes nothing", async () => {
    adminCookie = await getAdminCookie();

    const ctx = await createAdminOrgGameContext({ programType: "league", audienceType: "parents" });
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

    expect(items.some((it) => it.kind === "teams_coachless" && it.id.includes(ctx.seasonId))).toBe(
      false,
    );
    expect(items.some((it) => it.kind === "players_unplaced" && it.id.includes(ctx.seasonId))).toBe(
      false,
    );
  });

  it("an adult league season (audienceType='players') with the same gaps contributes nothing — youth-only scope", async () => {
    adminCookie = await getAdminCookie();

    const ctx = await createAdminOrgGameContext({ programType: "league", audienceType: "players" });
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

    const ctx = await createAdminOrgGameContext({ programType: "league", audienceType: "parents" });
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
});
