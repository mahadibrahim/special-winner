import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";

const ENDPOINT = "/api/public/drop-standings";

describe("GET /api/public/drop-standings", () => {
  it("returns 400 when neither dropSeasonId nor division is provided", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" });
    expect(res.status).toBe(400);
  });

  it("returns 200 with { standings: [] } for an unknown dropSeasonId (no such season)", async () => {
    const res = await apiFetch(
      `${ENDPOINT}?dropSeasonId=00000000-0000-0000-0000-000000000000`,
      { method: "GET" }
    );
    const body = await expectJson(res, 200);
    expect(body).toHaveProperty("standings");
    expect(Array.isArray(body.standings)).toBe(true);
  });

  it("returns 200 with standings array for ?division=mens", async () => {
    const res = await apiFetch(`${ENDPOINT}?division=mens`, { method: "GET" });
    const body = await expectJson(res, 200);
    expect(body).toHaveProperty("standings");
    expect(Array.isArray(body.standings)).toBe(true);
  });

  it("returns 200 with standings array for ?division=womens", async () => {
    const res = await apiFetch(`${ENDPOINT}?division=womens`, { method: "GET" });
    const body = await expectJson(res, 200);
    expect(body).toHaveProperty("standings");
    expect(Array.isArray(body.standings)).toBe(true);
  });

  it("standing rows do not contain weight, bmi, or player-level fields", async () => {
    const res = await apiFetch(`${ENDPOINT}?division=mens`, { method: "GET" });
    const body = await expectJson(res, 200);
    const serialised = JSON.stringify(body);
    // Must not leak any player-level sensitive fields
    expect(serialised).not.toMatch(/\bweight\b/i);
    expect(serialised).not.toMatch(/\bbmi\b/i);
    expect(serialised).not.toMatch(/\bweightG\b/i);
    expect(serialised).not.toMatch(/\bheight\b/i);
    // Each standing row (if any) must only contain team-level keys
    for (const row of body.standings ?? []) {
      const rowStr = JSON.stringify(row);
      expect(rowStr).not.toMatch(/\bweight\b/i);
      expect(rowStr).not.toMatch(/\bbmi\b/i);
      const allowedKeys = new Set([
        "teamId",
        "teamName",
        "played",
        "won",
        "drawn",
        "lost",
        "points",
        "bonusGoals",
        "totalGoals",
      ]);
      for (const key of Object.keys(row)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    }
  });
});
