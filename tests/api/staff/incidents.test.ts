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
import { and, eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";

const ENDPOINT = "/api/staff/incidents";

describe("POST /api/staff/incidents", () => {
  let adminCookie: string;
  let coachCookie: string;
  let venueId: string;
  let gameId: string;
  let participantFamilyMemberId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    coachCookie = await getCoachCookie();

    const gamesRes = await apiFetch("/api/admin/games", {
      method: "GET",
      cookie: adminCookie,
    });
    const gamesJson = await expectJson(gamesRes, 200);
    expect(gamesJson.games.length).toBeGreaterThan(0);

    // Not every seeded game has a full venue/season/program/sport chain
    // (bootstrapActivityCompletions requires all of them) — try candidates
    // with a venueId set until one bootstraps successfully.
    const candidates = gamesJson.games.filter((g: { venueId: string | null }) => g.venueId);
    for (const candidate of candidates) {
      try {
        await bootstrapActivityCompletions(candidate.id);
        gameId = candidate.id;
        venueId = candidate.venueId;
        break;
      } catch {
        continue;
      }
    }
    if (!gameId) {
      throw new Error(
        "No seeded aspire-sports game has a full venue/season/program/sport chain for bootstrap",
      );
    }

    // A registered participant, discovered via a coach's roster (mirrors
    // tests/api/coach/attendance.test.ts).
    const teamsRes = await apiFetch("/api/coach/teams", {
      method: "GET",
      cookie: coachCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    for (const team of teamsJson.teams) {
      const rosterRes = await apiFetch(`/api/coach/teams/${team.id}/roster`, {
        method: "GET",
        cookie: coachCookie,
      });
      const rosterJson = await rosterRes.json();
      if (rosterJson.roster?.length > 0) {
        participantFamilyMemberId = rosterJson.roster[0].player.id;
        break;
      }
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
    if (!participantFamilyMemberId) {
      console.warn(
        "Skipping participant-subject test: no roster members found on any coach team",
      );
      return;
    }
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

    // markCompleteBySystemEvent is fired-and-forgotten by the route; give
    // the event loop a tick to let the update land before asserting.
    await new Promise((r) => setTimeout(r, 300));

    const [after] = await getDb()
      .select()
      .from(activityCompletions)
      .where(
        and(
          eq(activityCompletions.gameId, gameId),
          eq(activityCompletions.activityId, "act.incident_response"),
        ),
      );
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
