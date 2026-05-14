import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie } from "../setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("rental rate-card API", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await getAdminCookie();
  });

  it("GET creates and returns a default rate card", async () => {
    const res = await fetch(`${BASE}/api/admin/rentals/rate-card`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rateCard.defaultHourlyRateCents).toBeGreaterThan(0);
  });

  it("PUT updates the default hourly rate", async () => {
    const res = await fetch(`${BASE}/api/admin/rentals/rate-card`, {
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ defaultHourlyRateCents: 9500 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rateCard.defaultHourlyRateCents).toBe(9500);
  });

  it("PUT rejects a negative rate with 400", async () => {
    const res = await fetch(`${BASE}/api/admin/rentals/rate-card`, {
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ defaultHourlyRateCents: -5 }),
    });
    expect(res.status).toBe(400);
  });

  it("GET without auth returns 401/403", async () => {
    const res = await fetch(`${BASE}/api/admin/rentals/rate-card`);
    expect([401, 403]).toContain(res.status);
  });
});
