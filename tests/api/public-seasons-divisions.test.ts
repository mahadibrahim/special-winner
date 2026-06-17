import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/public/seasons division metadata", () => {
  it("returns division/term fields and filters by term", async () => {
    const res = await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult&term=fall-2026`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.seasons)).toBe(true);
    // Non-vacuous: the seed provides Fall 2026 adult-soccer divisions under the
    // Aspire org (the org both brand hosts resolve to), so this must be >= 1.
    expect(body.seasons.length).toBeGreaterThanOrEqual(1);
    for (const s of body.seasons) {
      expect(s).toHaveProperty("termSlug", "fall-2026");
      expect(s).toHaveProperty("skillLevel");
      expect(s).toHaveProperty("divisionGender");
      expect(s).toHaveProperty("dayOfWeek");
    }
  });
});
