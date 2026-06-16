import { describe, it, expect, vi } from "vitest";

// Mutable so a test can swap in the empty (unassigned-coach) result.
let result: Array<{ teamId: string; teamName: string; playerCount: number }> = [];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => result }) }) }),
  }),
}));

import { getCoachTeams } from "@/lib/coach/get-coach-teams";

// One row per team; playerCount comes back from the scalar subquery.
const rows = [
  { teamId: "t1", teamName: "U10 Red", playerCount: 8 },
  { teamId: "t2", teamName: "U12 Blue", playerCount: 11 },
];

describe("getCoachTeams", () => {
  it("returns the coach's teams with player counts", async () => {
    result = rows;
    expect(await getCoachTeams("u1")).toEqual(rows);
  });

  it("returns [] for an unassigned coach", async () => {
    result = [];
    expect(await getCoachTeams("u1")).toEqual([]);
  });
});
