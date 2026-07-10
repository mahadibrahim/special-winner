/**
 * Parent-facing coach notes feed (Plan 2 Task 8,
 * docs/superpowers/specs/2026-07-09-glows-and-grows-design.md §5).
 *
 * GET /api/family/coach-notes returns visible-to-parent coach_notes rows
 * for every family member the requesting user can access (primary
 * guardian, self-registered adult, or linked co-parent — see
 * src/lib/auth/family-access.ts), newest first.
 *
 * Uses the seeded coach (coach@test.aspiresports.com) and the seeded
 * child "Tommy" — parent@test.aspiresports.com's dependent, rostered on
 * the seeded "E2E Test Team" which the seeded coach coaches (see
 * tests/api/coach/assessment-snapshots.test.ts for the same fixture).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, asc, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { teams } from "@/lib/db/schema/teams";
import { coachNotes } from "@/lib/db/schema/teams";
import {
  getCoachCookie,
  getParentCookie,
  getAuthCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Parent coach-notes feed API", () => {
  let coachCookie: string;
  let parentCookie: string;
  let anotherParentCookie: string;
  let teamId: string;
  let tommyId: string;
  let sessionId: string;
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    parentCookie = await getParentCookie();
    anotherParentCookie = await getAuthCookie(
      "familyonly@test.aspiresports.com",
      "TestFamily123!"
    );

    const db = getDb();

    // Seeded child "Tommy" (parent@test.aspiresports.com's dependent) —
    // multi-tenant hazard: explicit orderBy per CLAUDE.md.
    const [tommy] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .innerJoin(users, eq(familyMembers.parentUserId, users.id))
      .where(
        and(
          eq(users.email, "parent@test.aspiresports.com"),
          eq(familyMembers.firstName, "Tommy")
        )
      )
      .orderBy(asc(familyMembers.createdAt))
      .limit(1);
    if (!tommy) {
      throw new Error(
        "coach-notes test: seeded child 'Tommy' not found — run npm run db:seed:e2e first"
      );
    }
    tommyId = tommy.id;

    const [team] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.name, "E2E Test Team"))
      .orderBy(asc(teams.createdAt))
      .limit(1);
    if (!team) {
      throw new Error(
        "coach-notes test: seeded 'E2E Test Team' not found — run npm run db:seed:e2e first"
      );
    }
    teamId = team.id;

    const createRes = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Coach notes feed test session",
        scheduledDate: new Date("2026-08-10T17:00:00Z").toISOString(),
        durationMinutes: 60,
        status: "planned",
      }),
    });
    const created = await expectJson(createRes, 201);
    sessionId = created.session.id;
    createdSessionIds.push(sessionId);

    const bootstrapRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const bootstrap = await expectJson(bootstrapRes, 200);
    const universalGlow = bootstrap.chips.glows[0];
    const entry = bootstrap.roster.find((p: any) => p.familyMemberId === tommyId);
    if (!entry) {
      throw new Error(
        "coach-notes test: seeded 'Tommy' is not on the E2E Test Team roster returned by the glows bootstrap"
      );
    }

    const postRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        entries: [{ familyMemberId: tommyId, glows: [universalGlow], note: "Feed test note." }],
      }),
    });
    await expectJson(postRes, 201);
  });

  afterAll(async () => {
    await getDb().delete(coachNotes).where(eq(coachNotes.sessionPlanId, sessionId));
    for (const id of createdSessionIds) {
      await apiFetch(`/api/coach/sessions/${id}`, {
        method: "DELETE",
        cookie: coachCookie,
      });
    }
    resetCookies();
  });

  it("returns the note with player name, coach name and session info for the owning parent", async () => {
    const res = await apiFetch("/api/family/coach-notes", {
      method: "GET",
      cookie: parentCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.notes)).toBe(true);

    const note = json.notes.find((n: any) => n.familyMemberId === tommyId);
    expect(note).toBeDefined();
    expect(note.playerFirstName).toBe("Tommy");
    expect(typeof note.coachName).toBe("string");
    expect(note.coachName.length).toBeGreaterThan(0);
    expect(note.session).toBeDefined();
    expect(note.session.id).toBe(sessionId);
    expect(note.session.title).toBe("Coach notes feed test session");
    expect(note.category).toBeDefined();
    expect(typeof note.content).toBe("string");
  });

  it("does not return the note for an unrelated user", async () => {
    const res = await apiFetch("/api/family/coach-notes", {
      method: "GET",
      cookie: anotherParentCookie,
    });
    const json = await expectJson(res, 200);
    const note = json.notes.find((n: any) => n.familyMemberId === tommyId);
    expect(note).toBeUndefined();
  });

  it("is unauthorized without a session cookie", async () => {
    const res = await apiFetch("/api/family/coach-notes", { method: "GET" });
    expect(res.status).toBe(401);
  });
});
