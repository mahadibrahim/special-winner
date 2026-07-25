import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
describe("/api/admin/merch/kits", () => {
  it("GET 401 unauth", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/kits`)).status).toBe(401);
  });
  it("POST 401 unauth", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/kits`, { method: "POST" })).status).toBe(401);
  });
});
