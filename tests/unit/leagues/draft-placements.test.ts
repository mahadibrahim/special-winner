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
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments.every((a) => a.teamId === "t2")).toBe(true);
  });

  it("conserves every registration — placed or unplaced, never dropped or duplicated", () => {
    const regs = Array.from({ length: 9 }, (_, i) => reg(`r${i + 1}`));
    // total capacity across the three teams is 6 (2 + 3 + 1), so exactly 3 of
    // the 9 registrations must land in unplaced.
    const teams = [team("t1", 0, 2), team("t2", 0, 3), team("t3", 0, 1)];
    const result = draftPlacements(regs, teams);

    expect(result.assignments).toHaveLength(6);
    expect(result.unplaced).toHaveLength(3);
    expect(result.assignments.length + result.unplaced.length).toBe(regs.length);

    const allIds = [...result.assignments.map((a) => a.registrationId), ...result.unplaced];
    expect(new Set(allIds).size).toBe(regs.length); // no duplicates, none dropped
    expect([...allIds].sort()).toEqual(regs.map((r) => r.registrationId).sort());
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

  it("applies load, then gender-spread, then teamId order — in that precedence, across 3 teams", () => {
    // t3 starts one ahead on load so it's excluded from the first two picks by
    // load alone (tier 1: load beats everything, including gender).
    const regs = [reg("r1", { gender: "F" }), reg("r2", { gender: "F" }), reg("r3", { gender: "F" }), reg("r4", { gender: "F" })];
    const teams = [team("t1", 0), team("t2", 0), team("t3", 1)];
    const result = draftPlacements(regs, teams);

    // r1: t1/t2 tied at load 0, gender F tied at 0 -> tier 3 (teamId order) -> t1.
    expect(teamOf(result, "r1")).toBe("t1");
    // r2: t2 (load 0) is strictly less loaded than t1 (load 1) and t3 (load 1)
    // -> tier 1 (load) wins outright, gender never consulted.
    expect(teamOf(result, "r2")).toBe("t2");
    // Now all three teams are tied at load 1: t1 holds 1 F, t2 holds 1 F, t3
    // holds 0 F. r3: tier 2 (gender spread) picks t3 despite it sorting last
    // by teamId — proof the gender rule outranks plain id order.
    expect(teamOf(result, "r3")).toBe("t3");
    // r4: t1/t2 tied at load 1 with 1 F each (t3 is now at load 2) -> gender
    // tied too -> falls through to tier 3 (teamId order) -> t1.
    expect(teamOf(result, "r4")).toBe("t1");
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
