import { describe, it, expect } from "vitest";
import {
  draftPlacements,
  type PlacementRegistration,
  type PlacementTeam,
} from "@/lib/leagues/draft-placements";

function reg(
  registrationId: string,
  opts: Partial<Omit<PlacementRegistration, "registrationId">> = {},
): PlacementRegistration {
  return {
    registrationId,
    familyMemberId: `fm-${registrationId}`,
    birthDate: opts.birthDate ?? "2015-01-01",
    gender: opts.gender ?? null,
  };
}

function team(teamId: string, currentCount: number, maxRosterSize: number | null = null): PlacementTeam {
  return { teamId, name: teamId, currentCount, maxRosterSize };
}

function teamOf(result: ReturnType<typeof draftPlacements>, registrationId: string): string | undefined {
  return result.assignments.find((a) => a.registrationId === registrationId)?.teamId;
}

describe("draftPlacements", () => {
  it("spreads registrations evenly across equally-loaded teams", () => {
    const regs = ["r1", "r2", "r3", "r4", "r5", "r6"].map((id) => reg(id));
    const teams = [team("t1", 0), team("t2", 0), team("t3", 0)];
    const result = draftPlacements(regs, teams);

    expect(result.unplaced).toEqual([]);
    expect(result.assignments).toHaveLength(6);
    const counts = new Map<string, number>();
    for (const a of result.assignments) counts.set(a.teamId, (counts.get(a.teamId) ?? 0) + 1);
    expect([...counts.values()].sort()).toEqual([2, 2, 2]);
    // deterministic exact layout: least-loaded-first, first-minimum tie-break by teamId
    expect(teamOf(result, "r1")).toBe("t1");
    expect(teamOf(result, "r2")).toBe("t2");
    expect(teamOf(result, "r3")).toBe("t3");
    expect(teamOf(result, "r4")).toBe("t1");
    expect(teamOf(result, "r5")).toBe("t2");
    expect(teamOf(result, "r6")).toBe("t3");
  });

  it("never assigns a team at maxRosterSize", () => {
    const regs = ["r1", "r2"].map((id) => reg(id));
    const teams = [team("t1", 2, 2), team("t2", 0, null)];
    const result = draftPlacements(regs, teams);

    expect(result.unplaced).toEqual([]);
    expect(result.assignments.every((a) => a.teamId === "t2")).toBe(true);
  });

  it("places remaining registrations in unplaced when every team is capped", () => {
    const regs = ["r1", "r2", "r3"].map((id) => reg(id));
    const teams = [team("t1", 2, 2), team("t2", 1, 1)];
    const result = draftPlacements(regs, teams);

    expect(result.assignments).toEqual([]);
    expect(result.unplaced).toEqual(["r1", "r2", "r3"]);
  });

  it("partially places when caps are hit partway through", () => {
    const regs = ["r1", "r2", "r3"].map((id) => reg(id));
    const teams = [team("t1", 1, 2)]; // room for exactly one more
    const result = draftPlacements(regs, teams);

    expect(result.assignments).toEqual([{ registrationId: "r1", teamId: "t1" }]);
    expect(result.unplaced).toEqual(["r2", "r3"]);
  });

  it("is deterministic regardless of input ordering", () => {
    const regs = ["r3", "r1", "r2", "r5", "r4"].map((id) => reg(id));
    const teams = [team("t2", 0), team("t1", 0), team("t3", 1, 3)];

    const a = draftPlacements(regs, teams);
    const b = draftPlacements([...regs].reverse(), [...teams].reverse());

    const sortAssignments = (r: ReturnType<typeof draftPlacements>) =>
      [...r.assignments].sort((x, y) => x.registrationId.localeCompare(y.registrationId));

    expect(sortAssignments(a)).toEqual(sortAssignments(b));
    expect([...a.unplaced].sort()).toEqual([...b.unplaced].sort());

    // and running it again with the same input produces an identical result
    const c = draftPlacements(regs, teams);
    expect(a).toEqual(c);
  });

  it("prefers the team with fewer of the registration's gender when load is tied", () => {
    // t2 starts one ahead on load, so r1 goes to t1 (strictly less loaded).
    // That ties the load at 1/1, but t1 now holds an F while t2 holds none —
    // the gender-spread rule should route r2 to t2 despite equal teamId ordering
    // otherwise preferring t1.
    const regs = [reg("r1", { gender: "F" }), reg("r2", { gender: "F" }), reg("r3", { gender: "F" })];
    const teams = [team("t1", 0), team("t2", 1)];
    const result = draftPlacements(regs, teams);

    expect(teamOf(result, "r1")).toBe("t1");
    expect(teamOf(result, "r2")).toBe("t2");
    expect(teamOf(result, "r3")).toBe("t1");
    expect(result.unplaced).toEqual([]);
  });

  it("ignores the gender-spread rule when gender is null, falling back to teamId order", () => {
    const regs = [reg("r1", { gender: null }), reg("r2", { gender: null })];
    const teams = [team("t1", 0), team("t2", 1)];
    const result = draftPlacements(regs, teams);

    // r1: t1 strictly less loaded (0 < 1) -> t1. Now tied 1/1 with null gender,
    // so the tie falls through to first-minimum-by-teamId -> t1 again.
    expect(teamOf(result, "r1")).toBe("t1");
    expect(teamOf(result, "r2")).toBe("t1");
  });

  it("returns all registrations as unplaced when there are no teams", () => {
    const regs = ["r2", "r1"].map((id) => reg(id));
    const result = draftPlacements(regs, []);

    expect(result.assignments).toEqual([]);
    expect(result.unplaced).toEqual(["r1", "r2"]);
  });

  it("handles zero registrations", () => {
    const result = draftPlacements([], [team("t1", 0)]);
    expect(result.assignments).toEqual([]);
    expect(result.unplaced).toEqual([]);
  });

  it("places registrations with a null birthDate normally", () => {
    const regs = [reg("r1", { birthDate: null }), reg("r2", { birthDate: "2016-05-01" })];
    const teams = [team("t1", 0), team("t2", 0)];
    const result = draftPlacements(regs, teams);

    expect(result.unplaced).toEqual([]);
    expect(result.assignments).toHaveLength(2);
    expect(teamOf(result, "r1")).toBe("t1");
    expect(teamOf(result, "r2")).toBe("t2");
  });
});
