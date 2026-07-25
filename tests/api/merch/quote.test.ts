import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("POST /api/merch/quote", () => {
  it("400s on an invalid body", async () => {
    const res = await fetch(`${BASE}/api/merch/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    expect([400, 503]).toContain(res.status); // 503 if Printful unconfigured on this env
  });
});
