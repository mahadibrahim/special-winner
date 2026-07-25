import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
describe("POST /api/merch/checkout", () => {
  it("400s (or 503) on an invalid body", async () => {
    const res = await fetch(`${BASE}/api/merch/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    expect([400, 503]).toContain(res.status);
  });
});
