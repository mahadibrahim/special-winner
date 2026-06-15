import { describe, it, expect, vi } from "vitest";

// Driven from teams with LEFT JOINs to the roster chain (2 inner + 3 left).
// A team with no roster entries appears as a single row with null roster
// fields — it must still surface (with empty players), not vanish.
const rows = [
  { teamId: "t1", teamName: "Red", rosterId: "r1", playerName: "Ada", lastName: "L", status: "active", jerseyNumber: "7" },
  { teamId: "t1", teamName: "Red", rosterId: "r2", playerName: "Bo", lastName: "K", status: "active", jerseyNumber: "9" },
  { teamId: "t2", teamName: "Blue", rosterId: "r3", playerName: "Cy", lastName: "M", status: "active", jerseyNumber: null },
  // Team with no players yet: left join yields nulls across the roster chain.
  { teamId: "t3", teamName: "Green", rosterId: null, playerName: null, lastName: null, status: null, jerseyNumber: null },
];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ innerJoin: () => ({ innerJoin: () => ({ leftJoin: () => ({ leftJoin: () => ({ leftJoin: () => ({ where: () => ({ orderBy: async () => rows }) }) }) }) }) }) }) }),
  }),
}));

import { getVenueRosters } from "@/lib/admin/venue-rosters";

describe("getVenueRosters", () => {
  it("groups players by team and includes teams with no players", async () => {
    const teams = await getVenueRosters(["loc_1"]);
    expect(teams).toEqual([
      { teamId: "t1", teamName: "Red", players: [
        { playerName: "Ada L", status: "active", jerseyNumber: "7" },
        { playerName: "Bo K", status: "active", jerseyNumber: "9" },
      ]},
      { teamId: "t2", teamName: "Blue", players: [
        { playerName: "Cy M", status: "active", jerseyNumber: null },
      ]},
      // Empty team is present with an empty roster, not dropped.
      { teamId: "t3", teamName: "Green", players: [] },
    ]);
  });

  it("returns [] for no locations", async () => {
    expect(await getVenueRosters([])).toEqual([]);
  });
});
