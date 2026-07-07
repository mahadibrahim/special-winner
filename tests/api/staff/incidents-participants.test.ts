import { describe, it, expect, beforeAll } from "vitest";
import { getCoachCookie, apiFetch, expectJson } from "../setup/test-helpers";

const ENDPOINT = "/api/staff/incidents/participants";

describe("GET /api/staff/incidents/participants", () => {
  let coachCookie: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
  });

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(`${ENDPOINT}?q=te`, { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("returns empty results for a query under 2 characters", async () => {
    const res = await apiFetch(`${ENDPOINT}?q=a`, {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.participants).toEqual([]);
  });

  it("returns empty results for an empty query", async () => {
    const res = await apiFetch(`${ENDPOINT}`, {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.participants).toEqual([]);
  });

  it("caps results at 10 for a broad match", async () => {
    // A single common vowel matches broadly across seeded first/last names.
    const res = await apiFetch(`${ENDPOINT}?q=an`, {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.participants)).toBe(true);
    expect(json.participants.length).toBeLessThanOrEqual(10);
    // De-duped: no repeated ids even if a family_member has several
    // registrations across seasons.
    const ids = json.participants.map((p: { id: string }) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
