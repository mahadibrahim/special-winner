import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("GET /api/dashboard/play/games", () => {
  let cookie: string;
  beforeAll(async () => {
    cookie = await getParentCookie();
  });

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch("/api/dashboard/play/games");
    expect(res.status).toBe(401);
  });

  it("returns a games array for an authenticated user", async () => {
    const res = await apiFetch("/api/dashboard/play/games", { cookie });
    const body = await expectJson(res, 200);
    expect(Array.isArray(body.games)).toBe(true);
  });

  it("returns venueName and venueAddress on each game", async () => {
    const res = await apiFetch("/api/dashboard/play/games", { cookie });
    const body = await expectJson(res, 200);
    expect(Array.isArray(body.games)).toBe(true);
    for (const g of body.games) {
      expect(g.venueName === null || typeof g.venueName === "string").toBe(true);
      expect(g.venueAddress === null || typeof g.venueAddress === "string").toBe(true);
    }
  });

  afterAll(() => resetCookies());
});
