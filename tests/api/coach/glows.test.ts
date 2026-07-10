import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  coachNotes,
  sessionPlans,
  sessionActivityUsage,
  activities,
  skills,
  teams,
  users,
} from "@/lib/db/schema";
import { getSkillGrow } from "@/lib/curriculum/reinforcement";
import {
  getCoachCookie,
  getParentCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Coach Glows & Grows API", () => {
  let coachCookie: string;
  let parentCookie: string;
  let teamId: string;
  let sessionId: string;
  const createdSessionIds: string[] = [];
  // Fixture for the cross-coach ownership test: a team + session this
  // coach does not own, inserted directly via getDb() since the sessions
  // POST API itself refuses to create a session on a team you don't coach.
  let otherTeamId: string | undefined;
  let otherSessionId: string | undefined;
  // Fixture for the grow-only test on a CI/clean DB, where no seeded
  // activity resolves to a curated grow phrase (CI only has synthetic
  // "e2e-*-skill" rows, not real curriculum slugs). Only set (and only
  // torn down) when this run actually inserted them.
  let fixtureSkillId: string | undefined;
  let fixtureActivityId: string | undefined;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    parentCookie = await getParentCookie();

    // Pick a team that actually has an active roster (not just any of the
    // coach's teams) — the roster whole-batch checks below need at least
    // one real familyMemberId to submit against.
    const playersRes = await apiFetch("/api/coach/players", {
      method: "GET",
      cookie: coachCookie,
    });
    const playersJson = await expectJson(playersRes, 200);
    expect(playersJson.players.length).toBeGreaterThan(0);
    teamId = playersJson.players[0].team.id;

    const createRes = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Glows & Grows test session",
        scheduledDate: new Date("2026-08-05T17:00:00Z").toISOString(),
        durationMinutes: 60,
        status: "planned",
      }),
    });
    const created = await expectJson(createRes, 201);
    sessionId = created.session.id;
    createdSessionIds.push(sessionId);
  });

  afterAll(async () => {
    // Clean up any coach_notes written to this session directly via the DB
    // (in case a test failed before the API-level cleanup below ran).
    await getDb().delete(coachNotes).where(eq(coachNotes.sessionPlanId, sessionId));

    for (const id of createdSessionIds) {
      await apiFetch(`/api/coach/sessions/${id}`, {
        method: "DELETE",
        cookie: coachCookie,
      });
    }

    // Grow-only CI fixture: the session delete above already cascades away
    // its sessionActivityUsage row (onDelete: cascade on sessionPlanId), so
    // only the activity/skill rows this run created remain to clean up.
    if (fixtureActivityId) {
      await getDb().delete(activities).where(eq(activities.id, fixtureActivityId));
    }
    if (fixtureSkillId) {
      await getDb().delete(skills).where(eq(skills.id, fixtureSkillId));
    }

    // Cross-coach ownership fixture: not reachable through the coach's own
    // API (that's the point), so torn down directly via the DB.
    if (otherSessionId) {
      await getDb().delete(sessionPlans).where(eq(sessionPlans.id, otherSessionId));
    }
    if (otherTeamId) {
      await getDb().delete(teams).where(eq(teams.id, otherTeamId));
    }

    resetCookies();
  });

  it("GET returns the bootstrap payload: session, roster, chips, existingNotes", async () => {
    const res = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);

    expect(json.session.id).toBe(sessionId);
    expect(json.session.team.id).toBe(teamId);
    expect(Array.isArray(json.roster)).toBe(true);
    expect(Array.isArray(json.chips.glows)).toBe(true);
    // Universal glows are always present, even for a session with no
    // segments/activities wired up yet.
    expect(json.chips.glows.length).toBeGreaterThan(0);
    expect(Array.isArray(json.existingNotes)).toBe(true);
  });

  it("GET as a parent is forbidden", async () => {
    const res = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("POST happy path writes glow/grow notes visible to parents and reflects in existingNotes", async () => {
    const bootstrapRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const bootstrap = await expectJson(bootstrapRes, 200);
    expect(bootstrap.roster.length).toBeGreaterThan(0);

    const universalGlow = bootstrap.chips.glows[0];
    const grow = bootstrap.chips.grows[0]; // may be undefined for a chip-less session

    const players = bootstrap.roster.slice(0, Math.min(2, bootstrap.roster.length));
    const entries = players.map((p: any, i: number) => ({
      familyMemberId: p.familyMemberId,
      glows: [universalGlow],
      ...(i === 0 && grow ? { grow } : {}),
      note: "Great session overall.",
    }));

    const postRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ entries }),
    });
    const postJson = await expectJson(postRes, 201);
    expect(postJson.created.length).toBe(entries.length);
    for (const c of postJson.created) {
      expect(c.noteIds.length).toBeGreaterThan(0);
    }

    const afterRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const afterJson = await expectJson(afterRes, 200);
    expect(afterJson.existingNotes.length).toBeGreaterThanOrEqual(entries.length);

    // Direct DB check: rows are parent-visible and tagged to this session.
    const rows = await getDb()
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.sessionPlanId, sessionId));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.visibleToParent).toBe(true);
      expect(row.sessionPlanId).toBe(sessionId);
    }

    // Clean up what this test wrote so later tests in this file start clean.
    await getDb().delete(coachNotes).where(eq(coachNotes.sessionPlanId, sessionId));
  });

  it("POST with a made-up chip label is rejected and writes zero rows", async () => {
    const bootstrapRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const bootstrap = await expectJson(bootstrapRes, 200);
    const familyMemberId = bootstrap.roster[0].familyMemberId;

    const res = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        entries: [{ familyMemberId, glows: ["Definitely not a real chip"] }],
      }),
    });
    expect(res.status).toBe(400);

    const rows = await getDb()
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.sessionPlanId, sessionId));
    expect(rows.length).toBe(0);
  });

  it("POST with a foreign familyMemberId mixed into a valid batch is rejected and writes zero rows", async () => {
    const bootstrapRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const bootstrap = await expectJson(bootstrapRes, 200);
    const validFamilyMemberId = bootstrap.roster[0].familyMemberId;
    const universalGlow = bootstrap.chips.glows[0];

    const res = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        entries: [
          { familyMemberId: validFamilyMemberId, glows: [universalGlow] },
          { familyMemberId: randomUUID(), glows: [universalGlow] },
        ],
      }),
    });
    expect(res.status).toBe(400);

    const rows = await getDb()
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.sessionPlanId, sessionId));
    expect(rows.length).toBe(0);
  });

  it("POST to a session the coach doesn't own (nonexistent id) is forbidden", async () => {
    const res = await apiFetch(`/api/coach/sessions/${randomUUID()}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        entries: [{ familyMemberId: randomUUID(), glows: ["Great effort today"] }],
      }),
    });
    expect([403, 404]).toContain(res.status);
  });

  it("POST to a session on a team this coach doesn't coach is forbidden (cross-coach ownership)", async () => {
    const db = getDb();

    // Real, different user id — fetched directly rather than hardcoded so
    // this doesn't depend on a stable seed id. orderBy + limit(1) per the
    // multi-tenant-query convention (CI's shared DB can have >1 match).
    const [adminUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@test.aspiresports.com"))
      .orderBy(asc(users.id))
      .limit(1);
    expect(adminUser).toBeTruthy();

    const [ownTeam] = await db
      .select({ seasonId: teams.seasonId })
      .from(teams)
      .where(eq(teams.id, teamId));
    expect(ownTeam).toBeTruthy();

    // verifyCoachAccess (glows.ts) compares the SESSION'S TEAM's
    // coachUserId/assistantCoachUserId — not sessionPlans.coachUserId — so
    // the fixture must put the admin on the team, not just on the session
    // row, for this to actually exercise the ownership check.
    const [otherTeam] = await db
      .insert(teams)
      .values({
        seasonId: ownTeam.seasonId,
        name: "Cross-coach ownership test team",
        coachUserId: adminUser.id,
      })
      .returning({ id: teams.id });
    otherTeamId = otherTeam.id;

    const [otherSession] = await db
      .insert(sessionPlans)
      .values({
        teamId: otherTeamId,
        coachUserId: adminUser.id,
        title: "Cross-coach ownership test session",
        scheduledDate: new Date("2026-08-07T17:00:00Z"),
        durationMinutes: 60,
        status: "planned",
      })
      .returning({ id: sessionPlans.id });
    otherSessionId = otherSession.id;

    const res = await apiFetch(`/api/coach/sessions/${otherSessionId}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        entries: [{ familyMemberId: randomUUID(), glows: ["Great effort today"] }],
      }),
    });
    expect([403, 404]).toContain(res.status);
  });

  it("POST to a draft session is rejected by the status gate (GET stays open)", async () => {
    // status omitted -> defaults to "draft" (src/pages/api/coach/sessions/index.ts).
    const createRes = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Draft status-gate test session",
        scheduledDate: new Date("2026-08-08T17:00:00Z").toISOString(),
        durationMinutes: 60,
      }),
    });
    const created = await expectJson(createRes, 201);
    const draftSessionId = created.session.id;
    createdSessionIds.push(draftSessionId);
    expect(created.session.status).toBe("draft");

    // GET must stay open for a draft session (bootstrap for the read-only
    // summary state) even though POST will reject.
    const bootstrapRes = await apiFetch(`/api/coach/sessions/${draftSessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const bootstrap = await expectJson(bootstrapRes, 200);
    const familyMemberId = bootstrap.roster[0].familyMemberId;
    const universalGlow = bootstrap.chips.glows[0];

    const res = await apiFetch(`/api/coach/sessions/${draftSessionId}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        entries: [{ familyMemberId, glows: [universalGlow] }],
      }),
    });
    const json = await expectJson(res, 400);
    expect(json.error).toBe(
      "Glows can only be shared for planned, active, or completed sessions"
    );

    const rows = await getDb()
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.sessionPlanId, draftSessionId));
    expect(rows.length).toBe(0);
  });

  it("POST with a duplicate familyMemberId in one batch is rejected and writes zero rows", async () => {
    const bootstrapRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const bootstrap = await expectJson(bootstrapRes, 200);
    const familyMemberId = bootstrap.roster[0].familyMemberId;
    const universalGlow = bootstrap.chips.glows[0];

    const res = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        entries: [
          { familyMemberId, glows: [universalGlow] },
          { familyMemberId, glows: [universalGlow] },
        ],
      }),
    });
    expect(res.status).toBe(400);

    const rows = await getDb()
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.sessionPlanId, sessionId));
    expect(rows.length).toBe(0);
  });

  it("POST with empty glows + a legal grow + a note preserves the note on the grow row", async () => {
    const db = getDb();

    // The shared fixture `sessionId` has no activities wired up, so its
    // grows chip set is always empty (getSessionChips only ever produces
    // grows from skill-linked activities — there's no universal grow
    // fallback). Find any seeded activity with a skill that has a curated
    // grow phrase so we have a session with a legal, non-empty grows set.
    const activityRows = await db
      .select({ id: activities.id, skillsDeveloped: activities.skillsDeveloped })
      .from(activities);
    const skillRows = await db.select({ id: skills.id, slug: skills.slug }).from(skills);
    const skillSlugById = new Map(skillRows.map((s) => [s.id, s.slug]));

    let growActivityId: string | null = null;
    let growPhrase: string | null = null;
    outer: for (const a of activityRows) {
      for (const skillId of a.skillsDeveloped ?? []) {
        const slug = skillSlugById.get(skillId);
        const grow = slug ? getSkillGrow(slug) : null;
        if (grow) {
          growActivityId = a.id;
          growPhrase = grow;
          break outer;
        }
      }
    }
    if (!growActivityId) {
      // CI's throwaway DB only has synthetic "e2e-*-skill" rows (see
      // seedCurriculumRadarFixture in seed-e2e-tests.ts) — none of their
      // slugs are in the curated SKILL_REINFORCEMENT map, so no seeded
      // activity will ever resolve to a grow phrase there. Build the
      // minimal fixture ourselves using the real "ball-control" curriculum
      // slug so this test is self-sufficient on a clean DB, instead of
      // depending on staging's real curriculum content.
      const BALL_CONTROL_SLUG = "ball-control";
      const curatedGrowPhrase = getSkillGrow(BALL_CONTROL_SLUG);
      expect(
        curatedGrowPhrase,
        `expected a curated grow phrase for "${BALL_CONTROL_SLUG}" in reinforcement.ts`
      ).not.toBeNull();

      const [existingBallControlSkill] = await db
        .select({ id: skills.id, sportId: skills.sportId })
        .from(skills)
        .where(eq(skills.slug, BALL_CONTROL_SLUG))
        .orderBy(asc(skills.id))
        .limit(1);

      let ballControlSkillId: string;
      let fixtureSportId: string;
      if (existingBallControlSkill) {
        ballControlSkillId = existingBallControlSkill.id;
        fixtureSportId = existingBallControlSkill.sportId;
      } else {
        // Reuse FK reference values (sport/domain/stage) from any existing
        // seeded skill row rather than reconstructing reference data —
        // e2e seed guarantees at least one skills row exists.
        const [referenceSkill] = await db
          .select({
            sportId: skills.sportId,
            domainId: skills.domainId,
            stageId: skills.stageId,
          })
          .from(skills)
          .orderBy(asc(skills.id))
          .limit(1);
        expect(
          referenceSkill,
          "expected at least one seeded skill row to copy FK reference values from"
        ).toBeTruthy();

        const [insertedSkill] = await db
          .insert(skills)
          .values({
            sportId: referenceSkill.sportId,
            domainId: referenceSkill.domainId,
            stageId: referenceSkill.stageId,
            name: "Ball Control",
            slug: BALL_CONTROL_SLUG,
            active: true,
          })
          .returning({ id: skills.id });
        ballControlSkillId = insertedSkill.id;
        fixtureSkillId = ballControlSkillId;
        fixtureSportId = referenceSkill.sportId;
      }

      // The clean CI DB seeds skills but no curriculum activities, so the
      // activity's sportId comes from the skill row rather than a
      // (possibly nonexistent) reference activity.
      const [insertedActivity] = await db
        .insert(activities)
        .values({
          sportId: fixtureSportId,
          name: "Grow Fixture Ball Control Drill",
          slug: `grow-fixture-${randomUUID()}`,
          durationMinutes: 10,
          howToPlay:
            "Fixture activity created for the grow-only glows test on a clean DB.",
          skillsDeveloped: [ballControlSkillId],
          active: true,
        })
        .returning({ id: activities.id });
      fixtureActivityId = insertedActivity.id;

      growActivityId = insertedActivity.id;
      growPhrase = curatedGrowPhrase;
    }

    // Dedicated session so wiring in an activity doesn't change the shared
    // sessionId's chip set for other tests in this file.
    const createRes = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Grow-only note test session",
        scheduledDate: new Date("2026-08-09T17:00:00Z").toISOString(),
        durationMinutes: 60,
        status: "planned",
      }),
    });
    const created = await expectJson(createRes, 201);
    const growSessionId = created.session.id;
    createdSessionIds.push(growSessionId);

    await db.insert(sessionActivityUsage).values({
      sessionPlanId: growSessionId,
      activityId: growActivityId!,
      segmentOrder: 1,
    });

    const bootstrapRes = await apiFetch(`/api/coach/sessions/${growSessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const bootstrap = await expectJson(bootstrapRes, 200);
    expect(bootstrap.chips.grows).toContain(growPhrase);
    expect(bootstrap.roster.length).toBeGreaterThan(0);

    const familyMemberId = bootstrap.roster[0].familyMemberId;
    const noteText = "Needs extra reps on this at home this week.";

    const res = await apiFetch(`/api/coach/sessions/${growSessionId}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        entries: [{ familyMemberId, glows: [], grow: growPhrase, note: noteText }],
      }),
    });
    await expectJson(res, 201);

    const rows = await db
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.sessionPlanId, growSessionId));
    expect(rows.length).toBe(1);
    expect(rows[0].category).toBe("focus");
    expect(rows[0].content).toContain(noteText);

    await db.delete(coachNotes).where(eq(coachNotes.sessionPlanId, growSessionId));
  });
});
