import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { registrations } from "@/lib/db/schema/registrations";
import { games, rosters, teams } from "@/lib/db/schema/teams";
import { programs, seasons } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { apiFetch, getAuthCookie, getCoachCookie } from "./setup/test-helpers";
import { createTestDropInSession } from "../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  cleanupTestClassFixtures,
  cleanupTestMembershipTiers,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
} from "../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let cookie: string;
let testChildId: string;

const createdTemplateIds: string[] = [];
const createdEnrollmentIds: string[] = [];
const createdSessionIds: string[] = [];
const createdTierIds: string[] = [];

// League-game fixtures (Task 3) — a team + opponent on a season under the
// resolved org, a confirmed registration + roster spot for the test child,
// and two future games (one scheduled, one postponed).
let homeTeamId: string;
let awayTeamId: string;
let homeTeamName: string;
let awayTeamName: string;
let gameRegistrationId: string;
let gameRosterId: string;
let scheduledGameId: string;
let postponedGameId: string;

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);

  const suffix = Date.now();
  testChildId = await createTestChild(parentUserId, `Schedule-${suffix}`);

  // enrollChild requires an active class-benefit membership on the child
  // (same "no_membership" 403 gate summary.test.ts's fixtures work around) —
  // own tier so this suite doesn't depend on/interfere with the shared
  // "Test Class Tier 4" fixture's benefit shape.
  const db0 = getDb();
  const [tier] = await db0
    .insert(membershipTiers)
    .values({
      organizationId,
      name: `Schedule-Tier-${suffix}`,
      monthlyPriceCents: 4900,
      benefits: { classes_per_month: 4 },
      isActive: true,
    })
    .returning();
  createdTierIds.push(tier.id);
  await createTestChildMembership({
    userId: parentUserId,
    familyMemberId: testChildId,
    organizationId,
    tierId: tier.id,
    idSuffix: `schedule-${suffix}`,
  });

  // A confirmed, future booked class session — the "firm event" leg.
  const { sessionId } = await createTestDropInSession({
    organizationId,
    venueId,
    kind: "class",
    capacity: 10,
    startsAt: new Date(Date.now() + 2 * 86_400_000),
  });
  createdSessionIds.push(sessionId);
  const db = getDb();
  await db.insert(dropInBookings).values({
    sessionId,
    userId: parentUserId,
    familyMemberId: testChildId,
    status: "confirmed",
    source: "online_booking",
    paymentMethod: "member_allotment",
    amountPaidCents: 0,
  });

  // An active standing enrollment — the "projected" leg (beyond the
  // materialization horizon, since we don't run the cron in this suite).
  const templateId = await createTestClassTemplate({
    organizationId,
    venueId,
    name: `Schedule-Slot-${suffix}`,
    capacity: 10,
  });
  createdTemplateIds.push(templateId);

  const enrollRes = await apiFetch("/api/classes/enrollments", {
    method: "POST",
    cookie,
    body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: testChildId }),
  });
  expect(enrollRes.status).toBe(200);
  const { enrollmentId } = await enrollRes.json();
  createdEnrollmentIds.push(enrollmentId);

  // League-game leg: teams/games hang off a season, not directly off the
  // org, so reuse an existing season under the resolved org — the seeded
  // e2e catalog has plenty. Oldest-first per the multi-tenant query hazard
  // convention (CI's shared DB accumulates many matching rows).
  const [existingSeason] = await db0
    .select({ id: seasons.id })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(locations.organizationId, organizationId))
    .orderBy(asc(seasons.createdAt))
    .limit(1);
  if (!existingSeason) {
    throw new Error("No season found under the resolved org — run npm run db:seed:e2e before this suite");
  }
  const seasonId = existingSeason.id;

  homeTeamName = `Schedule-Home-${suffix}`;
  awayTeamName = `Schedule-Away-${suffix}`;
  const [homeTeam] = await db0.insert(teams).values({ seasonId, name: homeTeamName }).returning();
  const [awayTeam] = await db0.insert(teams).values({ seasonId, name: awayTeamName }).returning();
  homeTeamId = homeTeam.id;
  awayTeamId = awayTeam.id;

  const [gameReg] = await db0
    .insert(registrations)
    .values({
      seasonId,
      familyMemberId: testChildId,
      registeredByUserId: parentUserId,
      status: "confirmed",
      paymentStatus: "paid",
      amountDueCents: 0,
    })
    .returning();
  gameRegistrationId = gameReg.id;

  const [roster] = await db0
    .insert(rosters)
    .values({ teamId: homeTeamId, registrationId: gameRegistrationId })
    .returning();
  gameRosterId = roster.id;

  const [scheduledGame] = await db0
    .insert(games)
    .values({
      seasonId,
      homeTeamId,
      awayTeamId,
      venueId,
      fieldNumber: "3",
      scheduledAt: new Date(Date.now() + 3 * 86_400_000),
      status: "scheduled",
    })
    .returning();
  scheduledGameId = scheduledGame.id;

  const [postponedGame] = await db0
    .insert(games)
    .values({
      seasonId,
      homeTeamId,
      awayTeamId,
      venueId,
      scheduledAt: new Date(Date.now() + 4 * 86_400_000),
      status: "postponed",
    })
    .returning();
  postponedGameId = postponedGame.id;
});

afterAll(async () => {
  const db = getDb();
  if (createdSessionIds.length > 0) {
    await db.delete(dropInBookings).where(inArray(dropInBookings.sessionId, createdSessionIds));
    await db
      .update(dropInSessions)
      .set({ status: "cancelled" })
      .where(inArray(dropInSessions.id, createdSessionIds));
  }
  await cleanupTestClassFixtures(createdTemplateIds, createdEnrollmentIds);
  await cleanupTestMembershipTiers(createdTierIds);

  // FK-safe order: games -> rosters -> registrations -> teams. Guard against
  // undefined ids (beforeAll may have died partway through) so a cleanup
  // failure doesn't mask the original setup error.
  const gameIds = [scheduledGameId, postponedGameId].filter(Boolean);
  if (gameIds.length > 0) {
    await db.delete(games).where(inArray(games.id, gameIds));
  }
  if (gameRosterId) {
    await db.delete(rosters).where(eq(rosters.id, gameRosterId));
  }
  if (gameRegistrationId) {
    await db.delete(registrations).where(eq(registrations.id, gameRegistrationId));
  }
  const teamIds = [homeTeamId, awayTeamId].filter(Boolean);
  if (teamIds.length > 0) {
    await db.delete(teams).where(inArray(teams.id, teamIds));
  }
});

describe("GET /api/dashboard/schedule", () => {
  it("returns 401 signed out", async () => {
    const res = await apiFetch("/api/dashboard/schedule");
    expect(res.status).toBe(401);
  });

  it("returns booked and projected events, all scoped to the caller's children", async () => {
    const res = await apiFetch("/api/dashboard/schedule", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();

    const childIds = new Set(body.children.map((c: any) => c.id));
    expect(childIds.has(testChildId)).toBe(true);

    for (const event of body.events) {
      expect(childIds.has(event.childId)).toBe(true);
    }

    const bookedEvents = body.events.filter((e: any) => e.projected === false);
    const projectedEvents = body.events.filter((e: any) => e.projected === true);
    expect(bookedEvents.length).toBeGreaterThanOrEqual(1);
    expect(projectedEvents.length).toBeGreaterThanOrEqual(1);

    const ourBooked = bookedEvents.find((e: any) => e.bookingId && e.childId === testChildId);
    expect(ourBooked).toBeTruthy();
    expect(ourBooked.bookingId).not.toBeNull();

    const ourProjected = projectedEvents.find((e: any) => e.childId === testChildId);
    expect(ourProjected).toBeTruthy();
    expect(ourProjected.bookingId).toBeNull();
    expect(ourProjected.type).toBe("class");
  });

  it("includes league games for the child's roster spot alongside class events", async () => {
    const res = await apiFetch("/api/dashboard/schedule", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();

    const gameEvents = body.events.filter((e: any) => e.type === "game" && e.childId === testChildId);
    expect(gameEvents.length).toBe(2);

    const scheduled = gameEvents.find((e: any) => e.id === `game-${scheduledGameId}-${testChildId}`);
    expect(scheduled).toBeTruthy();
    expect(scheduled.title).toBe(`${homeTeamName} vs ${awayTeamName}`);
    expect(scheduled.status).toBe("scheduled");
    expect(scheduled.bookingId).toBeNull();

    const postponed = gameEvents.find((e: any) => e.id === `game-${postponedGameId}-${testChildId}`);
    expect(postponed).toBeTruthy();
    expect(postponed.title).toBe(`${homeTeamName} vs ${awayTeamName}`);
    expect(postponed.status).toBe("postponed");

    // Class events (booked + projected) are still present alongside games.
    expect(body.events.some((e: any) => e.type === "class")).toBe(true);
  });

  it("scopes events to the signed-in user — a different account sees none of this family's events", async () => {
    const coachCookie = await getCoachCookie();
    const res = await apiFetch("/api/dashboard/schedule", { cookie: coachCookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual([]);
  });
});
