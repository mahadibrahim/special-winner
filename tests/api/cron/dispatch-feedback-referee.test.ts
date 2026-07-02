import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  organizations,
  users,
  locations,
  sports,
  programs,
  seasons,
  teams,
  rosters,
  registrations,
  familyMembers,
  games,
  gameOfficials,
  feedbackRequests,
} from "@/lib/db/schema";

const ENDPOINT = "/api/cron/dispatch-feedback-requests";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "devsecret";

const runCron = () =>
  fetch(`${BASE}${ENDPOINT}`, {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
  });

/**
 * Full row graph: org (flag on) → location → sport → program(tournament) →
 * season → two teams → one rostered youth registration per team (distinct
 * parents) → completed game with one official.
 */
async function seedCompletedGame() {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Ref Org ${suffix}`,
      slug: `ref-org-${suffix}`,
      organizationType: "headquarters",
      features: { enableRefereeRatings: true },
    })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({ organizationId: org.id, name: `Loc ${suffix}`, slug: `loc-${suffix}` })
    .returning();

  const [sport] = await db
    .insert(sports)
    .values({ organizationId: org.id, name: `Sport ${suffix}`, slug: `sport-${suffix}` })
    .returning();

  const [program] = await db
    .insert(programs)
    .values({
      locationId: location.id,
      sportId: sport.id,
      name: `Program ${suffix}`,
      slug: `program-${suffix}`,
      programType: "tournament",
    })
    .returning();

  const [season] = await db
    .insert(seasons)
    .values({
      programId: program.id,
      name: `Season ${suffix}`,
      slug: `season-${suffix}`,
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      priceCents: 10000,
    })
    .returning();

  async function seedParentWithRosteredKid(teamName: string) {
    const [team] = await db
      .insert(teams)
      .values({ seasonId: season.id, name: teamName })
      .returning();
    const p = Math.random().toString(36).slice(2, 10);
    const [parent] = await db
      .insert(users)
      .values({
        email: `ref-parent-${p}@test.example`,
        passwordHash: "x",
        firstName: "Parent",
        lastName: p,
      })
      .returning();
    const [kid] = await db
      .insert(familyMembers)
      .values({
        parentUserId: parent.id,
        firstName: "Kid",
        lastName: p,
        birthDate: "2016-01-01",
      })
      .returning();
    const [registration] = await db
      .insert(registrations)
      .values({
        seasonId: season.id,
        familyMemberId: kid.id,
        registeredByUserId: parent.id,
        status: "confirmed",
        amountDueCents: 10000,
      })
      .returning();
    await db.insert(rosters).values({
      teamId: team.id,
      registrationId: registration.id,
      status: "active",
    });
    return { team, parent };
  }

  const home = await seedParentWithRosteredKid(`Home ${suffix}`);
  const away = await seedParentWithRosteredKid(`Away ${suffix}`);

  const [refUser] = await db
    .insert(users)
    .values({
      email: `ref-official-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Ref",
      lastName: "Official",
    })
    .returning();

  const [game] = await db
    .insert(games)
    .values({
      seasonId: season.id,
      homeTeamId: home.team.id,
      awayTeamId: away.team.id,
      scheduledAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      status: "completed",
      homeScore: 2,
      awayScore: 1,
    })
    .returning();

  const [official] = await db
    .insert(gameOfficials)
    .values({ gameId: game.id, userId: refUser.id, position: "referee" })
    .returning();

  return { org, game, official, homeParent: home.parent, awayParent: away.parent, refUser };
}

describe("referee-rating dispatch", () => {
  it("creates one request per roster parent for a completed game, tagged tournament", async () => {
    const { game, official, homeParent, awayParent } = await seedCompletedGame();

    const res = await runCron();
    expect(res.status).toBe(200);

    const db = getDb();
    const rows = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "referee_rating"),
          eq(feedbackRequests.targetId, game.id),
        ),
      );
    expect(rows.length).toBe(2);
    const recipients = rows.map((r) => r.recipientUserId).sort();
    expect(recipients).toEqual([homeParent.id, awayParent.id].sort());
    expect(rows.every((r) => r.gameOfficialId === official.id)).toBe(true);
    expect(rows.every((r) => r.metadata?.gameType === "tournament")).toBe(true);
    expect(rows.every((r) => r.status === "sent")).toBe(true);

    // Idempotent on re-run.
    await runCron();
    const again = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "referee_rating"),
          eq(feedbackRequests.targetId, game.id),
        ),
      );
    expect(again.length).toBe(2);
  });

  it("never asks the official about themselves", async () => {
    const { game, refUser } = await seedCompletedGame();
    await runCron();
    const rows = await getDb()
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "referee_rating"),
          eq(feedbackRequests.targetId, game.id),
          eq(feedbackRequests.recipientUserId, refUser.id),
        ),
      );
    expect(rows.length).toBe(0);
  });

  it("caps at one referee email per recipient per 24h", async () => {
    const { org, game, homeParent } = await seedCompletedGame();
    const db = getDb();

    // Recipient already got a referee ask 1 hour ago (different game).
    await db.insert(feedbackRequests).values({
      organizationId: org.id,
      brand: "aspire",
      kind: "referee_rating",
      targetId: crypto.randomUUID(),
      recipientUserId: homeParent.id,
      gameOfficialId: null,
      tokenHash: `refcap-${Math.random().toString(36).slice(2)}`,
      status: "sent",
      sentAt: new Date(Date.now() - 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      metadata: { eventLabel: "Earlier game" },
    });

    await runCron();

    const rows = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "referee_rating"),
          eq(feedbackRequests.targetId, game.id),
          eq(feedbackRequests.recipientUserId, homeParent.id),
        ),
      );
    expect(rows.length).toBe(0); // capped
  });
});
