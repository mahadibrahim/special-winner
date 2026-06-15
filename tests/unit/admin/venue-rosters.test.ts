import { describe, it, expect, vi } from "vitest";

const rows = [
  { teamId: "t1", teamName: "Red", playerName: "Ada L", status: "active", jerseyNumber: "7" },
  { teamId: "t1", teamName: "Red", playerName: "Bo K", status: "active", jerseyNumber: "9" },
  { teamId: "t2", teamName: "Blue", playerName: "Cy M", status: "active", jerseyNumber: null },
];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ innerJoin: () => ({ innerJoin: () => ({ innerJoin: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: () => ({ orderBy: async () => rows }) }) }) }) }) }) }) }),
  }),
}));

import { getVenueRosters } from "@/lib/admin/venue-rosters";

describe("getVenueRosters", () => {
  it("groups players by team", async () => {
    const teams = await getVenueRosters(["loc_1"]);
    expect(teams).toEqual([
      { teamId: "t1", teamName: "Red", players: [
        { playerName: "Ada L", status: "active", jerseyNumber: "7" },
        { playerName: "Bo K", status: "active", jerseyNumber: "9" },
      ]},
      { teamId: "t2", teamName: "Blue", players: [
        { playerName: "Cy M", status: "active", jerseyNumber: null },
      ]},
    ]);
  });

  it("returns [] for no locations", async () => {
    expect(await getVenueRosters([])).toEqual([]);
  });
});
