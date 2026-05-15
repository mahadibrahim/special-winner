import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

describe("GET /api/admin/check-in/day", () => {
  let cookie: string;
  beforeAll(async () => {
    cookie = await getAdminCookie();
  });

  it("returns 200 with events array for an org-owned venue", async () => {
    const res = await apiFetch(
      `/api/admin/check-in/day?venueId=${E2E_RENTAL_VENUE_ID}&date=2035-08-15`,
      { method: "GET", cookie },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("venueName");
    expect(Array.isArray(body.events)).toBe(true);
  });

  it("returns 400 on malformed date", async () => {
    const res = await apiFetch(
      `/api/admin/check-in/day?venueId=${E2E_RENTAL_VENUE_ID}&date=NOT-A-DATE`,
      { method: "GET", cookie },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing venueId", async () => {
    const res = await apiFetch(
      `/api/admin/check-in/day?date=2035-08-15`,
      { method: "GET", cookie },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 on a non-owned venue (org isolation)", async () => {
    const res = await apiFetch(
      `/api/admin/check-in/day?venueId=00000000-0000-0000-0000-000000000000&date=2035-08-15`,
      { method: "GET", cookie },
    );
    expect(res.status).toBe(404);
  });

  it("returns 401/403 without admin cookie", async () => {
    const res = await apiFetch(
      `/api/admin/check-in/day?venueId=${E2E_RENTAL_VENUE_ID}&date=2035-08-15`,
      { method: "GET" },
    );
    expect([401, 403]).toContain(res.status);
  });
});
