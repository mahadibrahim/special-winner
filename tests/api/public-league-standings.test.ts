import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/public/league-standings", () => {
  it("returns a ranked table + results for the seeded active soccer division", async () => {
    const seasonsRes = await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult&status=active&term=summer-2026`);
    const { seasons } = await seasonsRes.json();
    expect(Array.isArray(seasons)).toBe(true);
    expect(seasons.length).toBeGreaterThanOrEqual(1);
    const seasonId = seasons[0].id;

    const res = await fetch(`${BASE}/api/public/league-standings?seasonId=${seasonId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.standings.length).toBeGreaterThanOrEqual(2);
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < body.standings.length; i++) {
      expect(body.standings[i - 1].points).toBeGreaterThanOrEqual(body.standings[i].points);
    }
    expect(body.standings[0]).toHaveProperty("teamName");
    expect(body.standings[0]).toHaveProperty("goalDiff");
  });
});
