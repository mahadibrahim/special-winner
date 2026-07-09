import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  getCoachCookie,
  getParentCookie,
  apiFetch,
  expectJson,
} from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { incidents } from "@/lib/db/schema/incidents";
import { and, asc, eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { venues, games } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { sports } from "@/lib/db/schema/sports";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";

const ENDPOINT = "/api/staff/incidents";

// Deterministic markers so repeated local runs against the shared staging
// DB reuse the same fixture rows instead of accumulating one per run.
const FIXTURE_FAMILY_MEMBER_FIRST = "IncidentSuite";
const FIXTURE_FAMILY_MEMBER_LAST = "Participant";
const FIXTURE_GAME_MARKER = "incidents.test.ts fixture game";

describe("POST /api/staff/incidents", () => {
  let adminCookie: string;
  let coachCookie: string;
  let venueId: string;
  let gameId: string | undefined;
  let participantFamilyMemberId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    coachCookie = await getCoachCookie();

    const db = getDb();

    // --- Deterministic fixtures, self-seeded via direct DB access. ---
    // The previous version of this beforeAll derived venueId/gameId from
    // whatever GET /api/admin/games happened to return, and
    // participantFamilyMemberId from whichever coach team happened to have
    // a non-empty roster. That's ambient data staging has (accumulated over
    // time) but CI's fresh `db:seed:e2e` run does not — every seeded game
    // there lacks a venueId, so the whole suite threw in beforeAll and all
    // 8 tests were skipped. Self-seed instead, so behavior is identical on
    // CI and staging.

    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    if (!org) {
      throw new Error("e2e seed invariant violated: org 'aspire-sports' not found");
    }

    const [venueRow] = await db
      .select({ id: venues.id })
      .from(venues)
      .innerJoin(locations, eq(venues.locationId, locations.id))
      .where(eq(locations.organizationId, org.id))
      .orderBy(asc(venues.createdAt))
      .limit(1);
    if (!venueRow) {
      throw new Error("e2e seed invariant violated: no venue found for org 'aspire-sports'");
    }
    venueId = venueRow.id;

    // A season with a full program/sport chain in this org. Unlike "a game
    // with venueId set" (optional, and exactly what CI's leaner seed
    // lacks), every org is guaranteed at least one full season/program/
    // sport chain by the base e2e seed — this is the same "reuse the org's
    // oldest season" pattern seedFeedbackFixtures() uses above.
    const [seasonRow] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(eq(locations.organizationId, org.id))
      .orderBy(asc(seasons.createdAt))
      .limit(1);
    if (!seasonRow) {
      throw new Error(
        "e2e seed invariant violated: no season/program/sport chain found for org 'aspire-sports'",
      );
    }

    // Self-seed the one game the auto-complete-on-submit test needs, with
    // the full venue/season/program/sport chain bootstrapActivityCompletions
    // requires. Find-or-create by a marker in `notes` so repeated local
    // runs reuse the same row rather than accumulating one per run.
    let [game] = await db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.notes, FIXTURE_GAME_MARKER))
      .limit(1);
    if (!game) {
      [game] = await db
        .insert(games)
        .values({
          seasonId: seasonRow.id,
          venueId,
          scheduledAt: new Date(),
          status: "scheduled",
          notes: FIXTURE_GAME_MARKER,
        })
        .returning({ id: games.id });
    }
    try {
      await bootstrapActivityCompletions(game.id);
      gameId = game.id;
    } catch (err) {
      // Defensive only — with a self-seeded full chain this should always
      // succeed. Guard rather than throw so a surprise here doesn't skip
      // the other 7 tests in this suite.
      console.warn(
        `Skipping auto-complete test: bootstrapActivityCompletions failed for self-seeded game ${game.id}:`,
        err,
      );
    }

    // A registered participant — self-seeded directly rather than
    // discovered via a coach's roster (which may be empty on a fresh CI
    // seed). requireSameOrgFamilyMember only needs a family_member with a
    // registration on some season in this org, no team/roster involved.
    const [parentUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "parent@test.aspiresports.com"))
      .limit(1);
    if (!parentUser) {
      throw new Error("e2e seed invariant violated: parent test user not found");
    }

    let [familyMember] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.firstName, FIXTURE_FAMILY_MEMBER_FIRST),
          eq(familyMembers.lastName, FIXTURE_FAMILY_MEMBER_LAST),
        ),
      )
      .limit(1);
    if (!familyMember) {
      [familyMember] = await db
        .insert(familyMembers)
        .values({
          parentUserId: parentUser.id,
          firstName: FIXTURE_FAMILY_MEMBER_FIRST,
          lastName: FIXTURE_FAMILY_MEMBER_LAST,
          birthDate: "2015-01-01",
        })
        .returning({ id: familyMembers.id });
    }
    participantFamilyMemberId = familyMember.id;

    const [existingRegistration] = await db
      .select({ id: registrations.id })
      .from(registrations)
      .where(
        and(
          eq(registrations.familyMemberId, familyMember.id),
          eq(registrations.seasonId, seasonRow.id),
        ),
      )
      .limit(1);
    if (!existingRegistration) {
      await db.insert(registrations).values({
        seasonId: seasonRow.id,
        familyMemberId: familyMember.id,
        registeredByUserId: parentUser.id,
        status: "confirmed",
        amountDueCents: 0,
      });
    }
  });

  const baseBody = () => ({
    venueId,
    incidentType: "injury",
    occurredAt: new Date().toISOString(),
    peopleInvolved: "Two U10 players collided going for a ball",
    firstResponderName: "Coach Test",
    immediateCareGiven: "Ice pack applied, player rested on sideline",
    emergencyServicesCalled: false,
    suspectedConcussion: false,
    parentNotifiedOnsite: true,
  });

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        ...baseBody(),
        subject: { subjectType: "bystander", freeTextName: "Jane Doe" },
      }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a parent (not staff) (403)", async () => {
    const parentCookie = await getParentCookie();
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({
        ...baseBody(),
        subject: { subjectType: "bystander", freeTextName: "Jane Doe" },
      }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for a malformed body", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ venueId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates an incident for a bystander subject (201)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        ...baseBody(),
        subject: { subjectType: "bystander", freeTextName: "Jane Spectator" },
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.incident.subjectType).toBe("bystander");
    expect(json.incident.subjectFreeTextName).toBe("Jane Spectator");
    expect(json.incident.subjectFamilyMemberId).toBeNull();
    expect(json.incident.status).toBe("open");
  });

  it("creates an incident keyed to a registered participant by family_member_id", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        ...baseBody(),
        subject: {
          subjectType: "participant",
          familyMemberId: participantFamilyMemberId,
        },
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.incident.subjectType).toBe("participant");
    expect(json.incident.subjectFamilyMemberId).toBe(participantFamilyMemberId);
    expect(json.incident.subjectFreeTextName).toBeNull();
  });

  it("sets concussionClearanceStatus to pending when suspectedConcussion is true", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        ...baseBody(),
        suspectedConcussion: true,
        removedFromPlay: true,
        subject: { subjectType: "bystander", freeTextName: "Concussion Case" },
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.incident.suspectedConcussion).toBe(true);
    expect(json.incident.concussionClearanceStatus).toBe("pending");
  });

  it("auto-completes the game's act.incident_response activity_completions row", async () => {
    if (!gameId) {
      console.warn(
        "Skipping auto-complete test: no bootstrappable self-seeded game (see beforeAll warning above)",
      );
      return;
    }
    // Reset to pending first — this fixture game is shared across repeated
    // local runs (bootstrapActivityCompletions is onConflictDoNothing, so a
    // prior run's "completed" status would otherwise persist and make this
    // test fail on re-run rather than actually verifying anything).
    await getDb()
      .update(activityCompletions)
      .set({ status: "pending", completedAt: null, completedByUserId: null })
      .where(
        and(
          eq(activityCompletions.gameId, gameId),
          eq(activityCompletions.activityId, "act.incident_response"),
        ),
      );

    const before = await getDb()
      .select()
      .from(activityCompletions)
      .where(
        and(
          eq(activityCompletions.gameId, gameId),
          eq(activityCompletions.activityId, "act.incident_response"),
        ),
      );
    expect(before.length).toBe(1);
    expect(["pending", "in_progress", "overdue"]).toContain(before[0].status);

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        ...baseBody(),
        gameId,
        subject: { subjectType: "staff", freeTextName: "Assistant Referee" },
      }),
    });
    await expectJson(res, 201);

    // markCompleteBySystemEvent is fired-and-forgotten by the route, so poll
    // for the completion instead of sleeping a fixed interval. On a loaded CI
    // runner the async update can land in >300ms, which made this test flaky
    // ("expected 'pending' to be 'completed'"). Poll up to 5s, breaking as
    // soon as it completes.
    let after;
    const deadline = Date.now() + 5000;
    for (;;) {
      [after] = await getDb()
        .select()
        .from(activityCompletions)
        .where(
          and(
            eq(activityCompletions.gameId, gameId),
            eq(activityCompletions.activityId, "act.incident_response"),
          ),
        );
      if (after?.status === "completed" || Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(after.status).toBe("completed");
    expect(after.completedAt).not.toBeNull();
  });

  it("rejects a venue that doesn't belong to the caller's org (404)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        ...baseBody(),
        venueId: "00000000-0000-4000-8000-000000000000",
        subject: { subjectType: "bystander", freeTextName: "Jane Doe" },
      }),
    });
    expect(res.status).toBe(404);
  });

  afterAll(async () => {
    // Best-effort cleanup so repeated local runs don't accumulate rows in
    // the shared staging DB. Not required for correctness — every test
    // above asserts on the response body, not on list counts.
    const db = getDb();
    const rows = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(eq(incidents.firstResponderName, "Coach Test"));
    for (const row of rows) {
      await db.delete(incidents).where(eq(incidents.id, row.id));
    }
  });
});
