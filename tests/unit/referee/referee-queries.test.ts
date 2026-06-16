import { describe, it, expect, vi, beforeEach } from "vitest";

let assignmentRows: any[] = [];
let owedRows: any[] = [];
let detailRows: any[] = [];
let incidentRows: any[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    // getRefereeAssignments / getRefereeMatchDetail: select().from().innerJoin()...where()(.limit/.orderBy)
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            leftJoin: () => ({
              where: (..._a: any[]) => ({
                orderBy: async () => assignmentRows,
                limit: async () => detailRows,
              }),
            }),
          }),
          // getReportsOwed: select(count).from(gameOfficials).innerJoin(games).where()
          where: async () => owedRows,
        }),
        // getRefereeMatchDetail second query: select().from(gameIncidents).where().orderBy()
        where: (..._a: any[]) => ({
          orderBy: async () => incidentRows,
        }),
      }),
    }),
  }),
}));

import { getRefereeAssignments, getReportsOwed, getRefereeMatchDetail } from "@/lib/referee/referee-queries";

describe("referee-queries", () => {
  beforeEach(() => { assignmentRows = []; owedRows = []; detailRows = []; incidentRows = []; });

  it("getRefereeAssignments returns the ref's matches with a reported flag", async () => {
    assignmentRows = [
      { gameId: "g1", scheduledAt: new Date("2026-07-01T18:00:00Z"), status: "scheduled", homeScore: null, awayScore: null, homeTeamName: "Red", awayTeamName: "Blue", position: "referee" },
      { gameId: "g2", scheduledAt: new Date("2026-06-01T18:00:00Z"), status: "completed", homeScore: 2, awayScore: 1, homeTeamName: "Red", awayTeamName: "Green", position: "referee" },
    ];
    const out = await getRefereeAssignments("u1");
    expect(out.map((m) => [m.gameId, m.reported])).toEqual([["g1", false], ["g2", true]]);
  });

  it("getReportsOwed counts past, not-completed assignments", async () => {
    owedRows = [{ count: 4 }];
    expect(await getReportsOwed("u1")).toBe(4);
  });

  it("getRefereeMatchDetail returns null when user is not assigned", async () => {
    detailRows = [];
    incidentRows = [];
    const result = await getRefereeMatchDetail("u1", "g1");
    expect(result).toBeNull();
  });

  it("getRefereeMatchDetail returns game detail with incidents when assigned", async () => {
    detailRows = [
      {
        gameId: "g1",
        scheduledAt: new Date("2026-07-01T18:00:00Z"),
        status: "scheduled",
        homeScore: null,
        awayScore: null,
        refereeNotes: null,
        homeTeamName: "Red",
        awayTeamName: "Blue",
      },
    ];
    incidentRows = [
      { id: "inc1", type: "yellow_card", side: "home", player: "Player 7", minute: 23, description: "Foul" },
    ];
    const result = await getRefereeMatchDetail("u1", "g1");
    expect(result).not.toBeNull();
    expect(result!.gameId).toBe("g1");
    expect(result!.incidents).toEqual(incidentRows);
  });
});
