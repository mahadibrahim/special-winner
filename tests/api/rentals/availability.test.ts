import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Fixed UUID from seed-e2e-tests.ts E2E_RENTAL_VENUE_ID.
// Importing that constant directly would execute the seed module's top-level
// seedE2ETests() call, so we embed the value here instead.
const E2E_RENTAL_VENUE_ID = "4b237a78-868d-4e64-8487-f3dce687b603";

describe("rental availability API", () => {
  it("returns per-field free blocks for a rental-enabled venue", async () => {
    const res = await fetch(
      `${BASE}/api/rentals/availability?venueId=${E2E_RENTAL_VENUE_ID}&date=2026-09-01`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields.length).toBeGreaterThan(0);
    expect(body.fields[0]).toHaveProperty("free");
    expect(Array.isArray(body.fields[0].free)).toBe(true);
  });

  it("returns 404 for a venue that does not exist", async () => {
    const res = await fetch(
      `${BASE}/api/rentals/availability?venueId=00000000-0000-0000-0000-000000000000&date=2026-09-01`,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for a missing date param", async () => {
    const res = await fetch(
      `${BASE}/api/rentals/availability?venueId=${E2E_RENTAL_VENUE_ID}`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed date param", async () => {
    const res = await fetch(
      `${BASE}/api/rentals/availability?venueId=${E2E_RENTAL_VENUE_ID}&date=09-01-2026`,
    );
    expect(res.status).toBe(400);
  });
});
