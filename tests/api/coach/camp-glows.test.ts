/**
 * Task 6 of the 2026-09-06-camps-phase4 plan: `GET`/`POST
 * /api/coach/class-sessions/:id/glows` widened to camp day-sessions
 * (`drop_in_sessions.kind='camp'`). Camp notes anchor on
 * `activityKind: 'camp_session'` + `activityId` with `teamId` null.
 *
 * Auth branches under test (verifyClassSessionAccess):
 *   - POD COACH: `teams` row under the session's `campSeasonId` with
 *     `coachUserId` (or `assistantCoachUserId`) = caller — coachA leads the
 *     home pod, so reaches EVERY day-session of the camp season.
 *   - DAY-STAFFED: an active `kind='class_session'` coaching_assignment
 *     targeting the specific day-session — coachB holds one on sessionB
 *     only (the materializer-staffed path), so 403s on sessionA.
 *   - Cross-org: a camp session materialized under org B is unreachable
 *     for the aspire coach (flat 403, same convention as class sessions).
 *
 * Fixture pattern mirrors tests/api/camps/pod-placements.test.ts (direct
 * DB inserts — no Stripe in CI — anchored to `new Date()`, FK-ordered
 * afterAll cleanup) and tests/api/coaching/class-glows.test.ts (seeded
 * coach account resolution, booked/not-booked children).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema/users";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { coachNotes } from "@/lib/db/schema";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { seasons, programs } from "@/lib/db/schema/programs";
import { teams, venues } from "@/lib/db/schema/teams";
import { sports, ageGroups } from "@/lib/db/schema/sports";
import { apiFetch, getAuthCookie, getCoachCookie, getParentCookie } from "../setup/test-helpers";
import { resolveClassTestFixtures, createTestChild } from "../../utils/classes-helpers";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";

let organizationId: string;
let parentUserId: string;
let coachAId: string;
let coachBId: string;
let coachACookie: string;
let coachBCookie: string;
let parentCookie: string;

let campSeasonId: string;
let podTeamId: string;
let sessionAId: string;
let sessionBId: string;
let orgBSessionId: string;
let childBookedId: string;
let childNotBookedId: string;

const suffix = Date.now();

// FK-ordered cleanup registries (pod-placements.test.ts pattern).
const createdSessionIds: string[] = [];
const createdBookingIds: string[] = [];
const createdTeamIds: string[] = [];
const createdSeasonIds: string[] = [];
const createdProgramIds: string[] = [];
const createdSportIds: string[] = [];
const createdAgeGroupIds: string[] = [];
const createdVenueIds: string[] = [];
const createdFamilyMemberIds: string[] = [];

async function getBootstrap(sessionId: string, cookie?: string) {
  return apiFetch(`/api/coach/class-sessions/${sessionId}/glows`, { cookie });
}

async function postBatch(sessionId: string, body: unknown, cookie?: string) {
  return apiFetch(`/api/coach/class-sessions/${sessionId}/glows`, {
    method: "POST",
    cookie,
    body: JSON.stringify(body),
  });
}

async function insertCampSession(opts: {
  organizationId: string;
  venueId: string;
  campSeasonId: string;
  daysFromNow: number;
}): Promise<string> {
  const db = getDb();
  const startsAt = new Date(Date.now() + opts.daysFromNow * 86_400_000);
  const [session] = await db
    .insert(dropInSessions)
    .values({
      organizationId: opts.organizationId,
      venueId: opts.venueId,
      kind: "camp",
      sportOrClassLabel: "Test Summer Camp",
      formatLabel: "Week 1",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 6 * 3_600_000),
      capacity: 40,
      campSeasonId: opts.campSeasonId,
    })
    .returning({ id: dropInSessions.id });
  createdSessionIds.push(session.id);
  return session.id;
}

beforeAll(async () => {
  ({ organizationId, parentUserId } = await resolveClassTestFixtures());

  coachACookie = await getCoachCookie();
  coachBCookie = await getAuthCookie("training+coach@test.aspiresports.com", "TestCoach123!");
  parentCookie = await getParentCookie();

  const db = getDb();

  async function resolveOrgCoach(email: string): Promise<string> {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(users.email, email),
          eq(roles.name, "coach"),
          eq(userRoles.scopeType, "organization"),
          eq(userRoles.scopeId, organizationId),
        ),
      )
      .orderBy(asc(userRoles.createdAt))
      .limit(1);
    if (!row) {
      throw new Error(`camp-glows.test: ${email} is not a seeded org coach — run npm run db:seed:e2e`);
    }
    return row.id;
  }

  coachAId = await resolveOrgCoach("coach@test.aspiresports.com");
  coachBId = await resolveOrgCoach("training+coach@test.aspiresports.com");

  // Camp season in the seeded aspire-sports org, with two pods (home/away).
  const ctx = await createAdminOrgGameContext({ programType: "camp", audienceType: "parents" });
  campSeasonId = ctx.seasonId;
  podTeamId = ctx.homeTeamId;
  createdSeasonIds.push(ctx.seasonId);
  createdProgramIds.push(ctx.programId);
  createdVenueIds.push(ctx.venueId);
  createdTeamIds.push(ctx.homeTeamId, ctx.awayTeamId);
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

  // coachA leads the home pod — the pod-coach auth branch.
  await db.update(teams).set({ coachUserId: coachAId }).where(eq(teams.id, podTeamId));

  sessionAId = await insertCampSession({
    organizationId,
    venueId: ctx.venueId,
    campSeasonId,
    daysFromNow: 2,
  });
  sessionBId = await insertCampSession({
    organizationId,
    venueId: ctx.venueId,
    campSeasonId,
    daysFromNow: 3,
  });

  // coachB is day-staffed on sessionB ONLY (materializer path) — no pod, no
  // assignment reaching sessionA.
  await db.insert(coachingAssignments).values({
    organizationId,
    coachUserId: coachBId,
    kind: "class_session",
    targetId: sessionBId,
    role: "assistant",
  });

  childBookedId = await createTestChild(parentUserId, `CampGlows-Booked-${suffix}`);
  childNotBookedId = await createTestChild(parentUserId, `CampGlows-NotBooked-${suffix}`);
  createdFamilyMemberIds.push(childBookedId, childNotBookedId);

  for (const sessionId of [sessionAId, sessionBId]) {
    const [booking] = await db
      .insert(dropInBookings)
      .values({
        sessionId,
        userId: parentUserId,
        familyMemberId: childBookedId,
        status: "confirmed",
        source: "auto_enrollment",
        paymentMethod: "registration",
      })
      .returning({ id: dropInBookings.id });
    createdBookingIds.push(booking.id);
  }

  // Cross-org camp session under org B's fixtures.
  const orgBFixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
  if (orgBFixtureRes.status !== 200) {
    throw new Error(
      `Could not load Org B fixtures (status ${orgBFixtureRes.status}). ` +
        "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
    );
  }
  const orgBFixtures = await orgBFixtureRes.json();
  if (!orgBFixtures.seasonId || !orgBFixtures.venueId) {
    throw new Error("Org B fixture is missing seasonId/venueId — run npm run db:seed:e2e.");
  }
  orgBSessionId = await insertCampSession({
    organizationId: orgBFixtures.org.id,
    venueId: orgBFixtures.venueId,
    campSeasonId: orgBFixtures.seasonId,
    daysFromNow: 2,
  });
});

afterAll(async () => {
  const db = getDb();
  if (createdSessionIds.length > 0) {
    await db
      .delete(coachNotes)
      .where(
        and(
          eq(coachNotes.activityKind, "camp_session"),
          inArray(coachNotes.activityId, createdSessionIds),
        ),
      );
    await db
      .delete(coachingAssignments)
      .where(
        and(
          eq(coachingAssignments.kind, "class_session"),
          inArray(coachingAssignments.targetId, createdSessionIds),
        ),
      );
  }
  if (createdBookingIds.length > 0) {
    await db.delete(dropInBookings).where(inArray(dropInBookings.id, createdBookingIds));
  }
  if (createdSessionIds.length > 0) {
    await db.delete(dropInSessions).where(inArray(dropInSessions.id, createdSessionIds));
  }
  if (createdFamilyMemberIds.length > 0) {
    await db.delete(familyMembers).where(inArray(familyMembers.id, createdFamilyMemberIds));
  }
  if (createdTeamIds.length > 0) {
    await db.delete(teams).where(inArray(teams.id, createdTeamIds));
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

describe("GET /api/coach/class-sessions/:id/glows (camp day-session)", () => {
  it("401s for an anonymous caller", async () => {
    const res = await getBootstrap(sessionAId);
    expect(res.status).toBe(401);
  });

  it("403s for a parent", async () => {
    const res = await getBootstrap(sessionAId, parentCookie);
    expect(res.status).toBe(403);
  });

  it("403s for an org coach with neither a pod nor a day assignment on this camp day", async () => {
    const res = await getBootstrap(sessionAId, coachBCookie);
    expect(res.status).toBe(403);
  });

  it("403s for a coach of another org's camp day (cross-org)", async () => {
    const res = await getBootstrap(orgBSessionId, coachACookie);
    expect(res.status).toBe(403);
  });

  it("returns the camper roster + chips for the pod coach", async () => {
    const res = await getBootstrap(sessionAId, coachACookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    const rosterEntry = body.roster.find(
      (r: { familyMemberId: string }) => r.familyMemberId === childBookedId,
    );
    expect(rosterEntry).toBeDefined();
    expect(
      body.roster.find((r: { familyMemberId: string }) => r.familyMemberId === childNotBookedId),
    ).toBeUndefined();
    expect(body.chips.glows).toContain("Great effort today");
    expect(Array.isArray(body.existingNotes)).toBe(true);
  });

  it("also grants access to a day-staffed coach (class_session assignment on the camp day)", async () => {
    const res = await getBootstrap(sessionBId, coachBCookie);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/coach/class-sessions/:id/glows (camp day-session)", () => {
  it("403s for the unassigned coach", async () => {
    const res = await postBatch(
      sessionAId,
      { entries: [{ familyMemberId: childBookedId, glows: ["Great effort today"] }] },
      coachBCookie,
    );
    expect(res.status).toBe(403);
  });

  it("403s cross-org", async () => {
    const res = await postBatch(
      orgBSessionId,
      { entries: [{ familyMemberId: childBookedId, glows: ["Great effort today"] }] },
      coachACookie,
    );
    expect(res.status).toBe(403);
  });

  it("rejects a camper who is not booked into this camp day with 422", async () => {
    const res = await postBatch(
      sessionAId,
      { entries: [{ familyMemberId: childNotBookedId, glows: ["Great effort today"] }] },
      coachACookie,
    );
    expect(res.status).toBe(422);
  });

  it("pod coach writes a glow anchored on activityKind='camp_session' with teamId null", async () => {
    const res = await postBatch(
      sessionAId,
      {
        entries: [
          { familyMemberId: childBookedId, glows: ["Great effort today"], note: "Loved camp today" },
        ],
      },
      coachACookie,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toHaveLength(1);
    expect(body.created[0].familyMemberId).toBe(childBookedId);

    const db = getDb();
    const [note] = await db
      .select()
      .from(coachNotes)
      .where(
        and(
          eq(coachNotes.familyMemberId, childBookedId),
          eq(coachNotes.activityKind, "camp_session"),
          eq(coachNotes.activityId, sessionAId),
        ),
      );
    expect(note).toBeDefined();
    expect(note.teamId).toBeNull();
    expect(note.visibleToParent).toBe(true);
    expect(note.coachUserId).toBe(coachAId);
    expect(note.content).toContain("Great effort today");

    // The GET bootstrap must read the note back under the camp anchor —
    // proves the existing-notes filter is per-kind, not class_session-only.
    const bootstrapRes = await getBootstrap(sessionAId, coachACookie);
    expect(bootstrapRes.status).toBe(200);
    const bootstrap = await bootstrapRes.json();
    expect(
      bootstrap.existingNotes.some((n: { id: string }) => n.id === note.id),
    ).toBe(true);
  });

  it("day-staffed coach writes a glow on their camp day with the same camp anchor", async () => {
    const res = await postBatch(
      sessionBId,
      { entries: [{ familyMemberId: childBookedId, glows: ["Kind teammate"] }] },
      coachBCookie,
    );
    expect(res.status).toBe(200);

    const db = getDb();
    const [note] = await db
      .select()
      .from(coachNotes)
      .where(
        and(
          eq(coachNotes.familyMemberId, childBookedId),
          eq(coachNotes.activityKind, "camp_session"),
          eq(coachNotes.activityId, sessionBId),
        ),
      );
    expect(note).toBeDefined();
    expect(note.teamId).toBeNull();
    expect(note.coachUserId).toBe(coachBId);
  });
});
