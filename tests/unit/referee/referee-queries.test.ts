import { describe, it, expect, vi, beforeEach } from "vitest";
import { gameIncidents } from "@/lib/db/schema/teams";
import { suspensions } from "@/lib/db/schema/suspensions";

let assignmentRows: any[] = [];
let owedRows: any[] = [];
let detailRows: any[] = [];
let incidentRows: any[] = [];
let suspensionRows: any[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) => {
        // getRefereeMatchDetail's incidents query: select().from(gameIncidents).where().orderBy()
        if (table === gameIncidents) {
          return { where: (..._a: any[]) => ({ orderBy: async () => incidentRows }) };
        }
        // getRefereeMatchDetail's activeSuspensions query: select().from(suspensions).where().orderBy()
        if (table === suspensions) {
          return { where: (..._a: any[]) => ({ orderBy: async () => suspensionRows }) };
        }
        // getRefereeAssignments / getReportsOwed / getRefereeMatchDetail main row:
        // select().from(gameOfficials).innerJoin(games)[.leftJoin(home).leftJoin(away)].where()(.limit/.orderBy)
        return {
          innerJoin: () => ({
            leftJoin: () => ({
              leftJoin: () => ({
                where: (..._a: any[]) => ({
                  orderBy: async () => assignmentRows,
                  limit: async () => detailRows,
                }),
              }),
            }),
            where: async () => owedRows,
          }),
        };
      },
    }),
  }),
}));

import { getRefereeAssignments, getReportsOwed, getRefereeMatchDetail } from "@/lib/referee/referee-queries";

describe("referee-queries", () => {
  beforeEach(() => {
    assignmentRows = [];
    owedRows = [];
    detailRows = [];
    incidentRows = [];
    suspensionRows = [];
  });

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
        homeTeamId: "team-home",
        awayTeamId: "team-away",
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

  it("getRefereeMatchDetail includes homeTeamId/awayTeamId (needed by the UI to label suspensions by side)", async () => {
    detailRows = [
      {
        gameId: "g1",
        scheduledAt: new Date("2026-07-01T18:00:00Z"),
        status: "scheduled",
        homeScore: null,
        awayScore: null,
        refereeNotes: null,
        homeTeamId: "team-home",
        awayTeamId: "team-away",
        homeTeamName: "Red",
        awayTeamName: "Blue",
      },
    ];
    incidentRows = [];
    const result = await getRefereeMatchDetail("u1", "g1");
    expect(result).not.toBeNull();
    expect(result!.homeTeamId).toBe("team-home");
    expect(result!.awayTeamId).toBe("team-away");
  });

  it("getRefereeMatchDetail surfaces an activeSuspensions flag for the home team", async () => {
    detailRows = [
      { gameId: "g1", scheduledAt: new Date(), status: "scheduled", homeScore: null, awayScore: null, refereeNotes: null, homeTeamId: "team-home", awayTeamId: "team-away", homeTeamName: "Red", awayTeamName: "Blue" },
    ];
    incidentRows = [];
    suspensionRows = [
      { id: "s1", personName: "Jamie", teamId: "team-home", status: "active", gamesMissed: 1, gamesServed: 0, escalatedToDirector: false },
    ];
    const result = await getRefereeMatchDetail("u1", "g1");
    expect(result!.activeSuspensions).toEqual(suspensionRows);
  });

  it("getRefereeMatchDetail surfaces an activeSuspensions flag for the away team", async () => {
    detailRows = [
      { gameId: "g1", scheduledAt: new Date(), status: "scheduled", homeScore: null, awayScore: null, refereeNotes: null, homeTeamId: "team-home", awayTeamId: "team-away", homeTeamName: "Red", awayTeamName: "Blue" },
    ];
    incidentRows = [];
    suspensionRows = [
      { id: "s2", personName: "Alex", teamId: "team-away", status: "season", gamesMissed: 5, gamesServed: 1, escalatedToDirector: true },
    ];
    const result = await getRefereeMatchDetail("u1", "g1");
    expect(result!.activeSuspensions).toEqual(suspensionRows);
  });

  it("getRefereeMatchDetail returns empty activeSuspensions for a TBD-team game (no query issued)", async () => {
    detailRows = [
      { gameId: "g1", scheduledAt: new Date(), status: "scheduled", homeScore: null, awayScore: null, refereeNotes: null, homeTeamId: null, awayTeamId: null, homeTeamName: null, awayTeamName: null },
    ];
    incidentRows = [];
    // Deliberately non-empty — proves the query is skipped (teamIds.length === 0)
    // rather than merely filtered to nothing.
    suspensionRows = [{ id: "should-not-appear", personName: "x", teamId: "unrelated", status: "active", gamesMissed: 1, gamesServed: 0, escalatedToDirector: false }];
    const result = await getRefereeMatchDetail("u1", "g1");
    expect(result!.activeSuspensions).toEqual([]);
  });
});
