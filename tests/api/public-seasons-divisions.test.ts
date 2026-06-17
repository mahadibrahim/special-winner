import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/public/seasons division metadata", () => {
  it("returns division/term fields and filters by term", async () => {
    const res = await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult&term=fall-2026`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.seasons)).toBe(true);
    for (const s of body.seasons) {
      expect(s).toHaveProperty("termSlug", "fall-2026");
      expect(s).toHaveProperty("skillLevel");
      expect(s).toHaveProperty("divisionGender");
      expect(s).toHaveProperty("dayOfWeek");
    }
  });
});
