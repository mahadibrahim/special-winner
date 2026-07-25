import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("POST /api/admin/merch/sync", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await fetch(`${BASE}/api/admin/merch/sync`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/merch/sync", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await fetch(`${BASE}/api/admin/merch/sync`);
    expect(res.status).toBe(401);
  });
});
