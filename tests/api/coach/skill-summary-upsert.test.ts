/**
 * D5: player_skill_summary must be unique per (family_member_id, skill_id).
 * Before migration 0075 the duplicate insert below succeeds (test fails);
 * after it, the second insert violates the unique index.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { playerSkillSummary } from "@/lib/db/schema/assessments";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("player_skill_summary uniqueness (D5)", () => {
  let coachCookie: string;
  let playerId: string;
  let sportId: string;
  let skillId: string | null = null;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();

    const playersRes = await apiFetch("/api/coach/players", {
      method: "GET",
      cookie: coachCookie,
    });
    const playersJson = await expectJson(playersRes, 200);
    const player = playersJson.players.find((p: any) => p.team?.sport?.id);
    expect(player).toBeDefined();
    playerId = player.id;
    sportId = player.team.sport.id;

    const skillsRes = await apiFetch(`/api/coach/skills?sportId=${sportId}`, {
      method: "GET",
      cookie: coachCookie,
    });
    const skillsJson = await expectJson(skillsRes, 200);
    if (skillsJson.skills?.length > 0) {
      skillId = skillsJson.skills[0].id;
    }
  });

  afterAll(() => {
    resetCookies();
  });

  it("DB rejects a duplicate (family_member_id, skill_id) summary row", async () => {
    if (!skillId) {
      console.warn("Skipping: no skills loaded for coach's sport");
      return;
    }
    const db = getDb();
    const now = new Date();
    const insertedIds: string[] = [];
    let firstError: unknown = null;
    let secondError: unknown = null;

    const values = {
      familyMemberId: playerId,
      skillId,
      currentLevel: 3,
      highestLevel: 3,
      assessmentCount: 1,
      trend: "new" as const,
      firstAssessedAt: now,
      lastAssessedAt: now,
    };

    try {
      const [row] = await db.insert(playerSkillSummary).values(values).returning({ id: playerSkillSummary.id });
      insertedIds.push(row.id);
    } catch (e) {
      firstError = e;
    }
    try {
      const [row] = await db.insert(playerSkillSummary).values(values).returning({ id: playerSkillSummary.id });
      insertedIds.push(row.id);
    } catch (e) {
      secondError = e;
    }

    // Cleanup only what this test inserted.
    for (const id of insertedIds) {
      await db.delete(playerSkillSummary).where(eq(playerSkillSummary.id, id));
    }

    // At least one of the two inserts must have hit the unique index.
    expect(firstError !== null || secondError !== null).toBe(true);
  });

  it("posting the same skill twice yields exactly one summary row", async () => {
    if (!skillId) {
      console.warn("Skipping: no skills loaded for coach's sport");
      return;
    }
    for (const level of [2, 4]) {
      const res = await apiFetch("/api/coach/assessments", {
        method: "POST",
        cookie: coachCookie,
        body: JSON.stringify({ familyMemberId: playerId, skillId, level }),
      });
      await expectJson(res, 201);
    }

    const detailRes = await apiFetch(`/api/coach/players/${playerId}/assessments`, {
      method: "GET",
      cookie: coachCookie,
    });
    const detail = await expectJson(detailRes, 200);
    const matching = detail.summaries.filter((s: any) => s.skillId === skillId);
    expect(matching.length).toBe(1);
    expect(matching[0].currentLevel).toBe(4);
    expect(matching[0].highestLevel).toBeGreaterThanOrEqual(4);
  });
});
