import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/health", () => {
  it("returns 200 with status ok and db up when the DB is reachable", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("up");
    expect(typeof body.durationMs).toBe("number");
    expect(typeof body.time).toBe("string");
    // Valid ISO timestamp.
    expect(Number.isFinite(Date.parse(body.time))).toBe(true);
  });

  it("is uncacheable so monitors never read a stale verdict", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("does not leak raw DB error detail in the response body", async () => {
    const res = await fetch(`${BASE}/api/health`);
    const body = await res.json();
    // The public payload is a fixed shape — no error string field.
    expect(body).not.toHaveProperty("dbError");
    expect(body).not.toHaveProperty("error");
  });
});
