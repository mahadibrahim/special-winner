import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
describe("/api/admin/merch/kit-products", () => {
  it("GET 401 unauth", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/kit-products?kitId=00000000-0000-0000-0000-000000000000`)).status).toBe(401);
  });
  it("POST 401 unauth", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/kit-products`, { method: "POST" })).status).toBe(401);
  });
});
