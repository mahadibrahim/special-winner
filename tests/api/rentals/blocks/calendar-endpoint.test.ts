/**
 * Integration: GET /api/admin/rentals/calendar - org-scoped range availability.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, getParentCookie, apiFetch } from "../../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID, resolveE2ELocationId } from "@/lib/db/seeds/seed-e2e-tests";

let admin: string;
let parent: string;
let locationId: string;

/** A location id that is a valid uuid but belongs to no org of the admin's. */
const FOREIGN_LOCATION_ID = "00000000-0000-4000-8000-0000000000ff";

const url = (over: Record<string, string> = {}) => {
  const params = new URLSearchParams({
    locationId,
    from: "2044-01-01",
    to: "2044-01-31",
    ...over,
  });
  return `/api/admin/rentals/calendar?${params.toString()}`;
};

beforeAll(async () => {
  admin = await getAdminCookie();
  parent = await getParentCookie();
  locationId = await resolveE2ELocationId();
});

describe("GET /api/admin/rentals/calendar", () => {
  it("returns venues, busy blocks, quotes and the timezone for a valid range", async () => {
    const res = await apiFetch(url(), { headers: { Cookie: admin } });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(typeof body.timeZone).toBe("string");
    expect(Array.isArray(body.venues)).toBe(true);
    expect(Array.isArray(body.busy)).toBe(true);
    expect(Array.isArray(body.quotes)).toBe(true);

    const venue = body.venues.find(
      (v: { id: string }) => v.id === E2E_RENTAL_VENUE_ID,
    );
    expect(venue).toBeTruthy();
    expect(Array.isArray(venue.fieldNumbers)).toBe(true);
    expect(venue.fieldNumbers.length).toBeGreaterThan(0);
  });

  it("rejects a malformed from date with 400", async () => {
    const res = await apiFetch(url({ from: "01/01/2044" }), {
      headers: { Cookie: admin },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a range whose end precedes its start with 400", async () => {
    const res = await apiFetch(url({ from: "2044-02-01", to: "2044-01-01" }), {
      headers: { Cookie: admin },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a range longer than 120 days with 400", async () => {
    const res = await apiFetch(url({ from: "2044-01-01", to: "2044-12-31" }), {
      headers: { Cookie: admin },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a missing locationId with 400", async () => {
    const res = await apiFetch(
      "/api/admin/rentals/calendar?from=2044-01-01&to=2044-01-31",
      { headers: { Cookie: admin } },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for a location in another org", async () => {
    const res = await apiFetch(url({ locationId: FOREIGN_LOCATION_ID }), {
      headers: { Cookie: admin },
    });
    expect(res.status).toBe(404);
  });

  it("rejects a non-admin with 401/403", async () => {
    const res = await apiFetch(url(), { headers: { Cookie: parent } });
    expect([401, 403]).toContain(res.status);
  });

  it("rejects an anonymous caller with 401/403", async () => {
    const res = await apiFetch(url());
    expect([401, 403]).toContain(res.status);
  });
});
