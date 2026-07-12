import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

describe("GET /api/public/seasons", () => {
  it("includes registrationCloses on every season", async () => {
    const res = await fetch(`${BASE}/api/public/seasons`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.seasons)).toBe(true);
    for (const season of body.seasons) {
      expect(season).toHaveProperty("registrationCloses");
    }
  });
});
