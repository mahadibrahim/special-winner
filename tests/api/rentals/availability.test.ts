import { describe, it, expect } from "vitest";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

const ISO_RX = /^\d{4}-\d{2}-\d{2}T/;

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
    // Verify that free-block timestamps are serialized as ISO strings.
    if (body.fields[0].free.length > 0) {
      const block = body.fields[0].free[0];
      expect(typeof block.startsAt).toBe("string");
      expect(block.startsAt).toMatch(ISO_RX);
      expect(typeof block.endsAt).toBe("string");
      expect(block.endsAt).toMatch(ISO_RX);
    }
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
