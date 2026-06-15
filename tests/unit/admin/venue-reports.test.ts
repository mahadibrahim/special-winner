import { describe, it, expect, vi } from "vitest";

// One aggregate row per metric query. getVenueReports runs 1 grouped query.
const agg = [{ checkedIn: 12, walkUps: 4, noShows: 2, booked: 18, capacity: 24 }];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: async () => agg }) }) }) }),
  }),
}));

import { getVenueReports } from "@/lib/admin/venue-reports";

describe("getVenueReports", () => {
  it("returns operational metrics with fill rate", async () => {
    const r = await getVenueReports(["loc_1"], "today", new Date("2026-06-14T12:00:00Z"));
    expect(r).toEqual({ checkedIn: 12, walkUps: 4, noShows: 2, booked: 18, capacity: 24, fillRate: 0.75 });
  });

  it("zeroes out for no locations", async () => {
    const r = await getVenueReports([], "today", new Date("2026-06-14T12:00:00Z"));
    expect(r).toEqual({ checkedIn: 0, walkUps: 0, noShows: 0, booked: 0, capacity: 0, fillRate: 0 });
  });
});
