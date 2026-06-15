import { describe, it, expect, vi } from "vitest";

// One row per team; playerCount comes back from the scalar subquery.
const rows = [
  { teamId: "t1", teamName: "U10 Red", playerCount: 8 },
  { teamId: "t2", teamName: "U12 Blue", playerCount: 11 },
];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => rows }) }) }),
  }),
}));

import { getCoachTeams } from "@/lib/coach/get-coach-teams";

describe("getCoachTeams", () => {
  it("returns the coach's teams with player counts", async () => {
    expect(await getCoachTeams("u1")).toEqual(rows);
  });
});
