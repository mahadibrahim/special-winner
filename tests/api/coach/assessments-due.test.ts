import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  apiFetch,
  expectJson,
  getCoachCookie,
  getParentCookie,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/coach/assessments/due";

describe("GET /api/coach/assessments/due", () => {
  let coachCookie: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  it("returns 401 unauthenticated", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-coach (parent)", async () => {
    const parentCookie = await getParentCookie();
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: parentCookie });
    expect(res.status).toBe(403);
  });

  it("returns due players grouped by team, non-fresh only", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: coachCookie });
    const json = await expectJson(res, 200);

    expect(typeof json.totalPlayersDue).toBe("number");
    expect(Array.isArray(json.teams)).toBe(true);

    for (const team of json.teams) {
      expect(team.teamId).toBeTruthy();
      expect(typeof team.teamName).toBe("string");
      // Teams only appear when they have at least one non-fresh player.
      expect(team.players.length).toBeGreaterThan(0);
      for (const player of team.players) {
        expect(player.familyMemberId).toBeTruthy();
        expect(["due", "overdue", "never"]).toContain(player.worstStatus);
        expect(typeof player.hasAnyAssessment).toBe("boolean");
        // Every listed player carries at least one non-fresh domain.
        expect(player.dueDomains.length).toBeGreaterThan(0);
        for (const domain of player.dueDomains) {
          expect(["due", "overdue", "never"]).toContain(domain.status);
        }
      }
    }
  });

  it("nav-badges exposes the due count alongside inbox", async () => {
    const res = await apiFetch("/api/coach/nav-badges", {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);
    expect(typeof json.inbox).toBe("number");
    expect(typeof json.assessmentsDue).toBe("number");
  });
});
