import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/public/seasons status handling", () => {
  it("returns only completed seasons when explicitly requested", async () => {
    const res = await fetch(`${BASE}/api/public/seasons?status=completed`);
    expect(res.status).toBe(200);
    const { seasons } = await res.json();
    expect(Array.isArray(seasons)).toBe(true);
    for (const s of seasons) expect(s.status).toBe("completed");
  });
  it("default (no status) never includes completed", async () => {
    const res = await fetch(`${BASE}/api/public/seasons`);
    const { seasons } = await res.json();
    for (const s of seasons) expect(["open", "active", "forming"]).toContain(s.status);
  });
});
