import { describe, it, expect, vi } from "vitest";

// getVenueReports runs TWO queries: booking-derived metrics (booking→session→
// venue, 2 inner joins) and a SEPARATE capacity aggregate over sessions
// (session→venue, 1 inner join). Capacity must come from the session query,
// not the booking-joined one — so the mock returns capacity ONLY there.
const bookingAgg = [{ checkedIn: 12, walkUps: 4, noShows: 2, booked: 18 }];
const capacityAgg = [{ capacity: 48 }];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          // booking metrics: ...innerJoin().innerJoin().where()
          innerJoin: () => ({ where: async () => bookingAgg }),
          // capacity: ...innerJoin().where()
          where: async () => capacityAgg,
        }),
      }),
    }),
  }),
}));

import { getVenueReports } from "@/lib/admin/venue-reports";

describe("getVenueReports", () => {
  it("takes capacity from the session aggregate, not the booking join", async () => {
    const r = await getVenueReports(["loc_1"], "today", new Date("2026-06-14T12:00:00Z"));
    // capacity 48 proves it came from the separate session query (the booking
    // query returns no capacity field); fillRate = 18 / 48.
    expect(r).toEqual({ checkedIn: 12, walkUps: 4, noShows: 2, booked: 18, capacity: 48, fillRate: 18 / 48 });
  });

  it("zeroes out for no locations", async () => {
    const r = await getVenueReports([], "today", new Date("2026-06-14T12:00:00Z"));
    expect(r).toEqual({ checkedIn: 0, walkUps: 0, noShows: 0, booked: 0, capacity: 0, fillRate: 0 });
  });
});
