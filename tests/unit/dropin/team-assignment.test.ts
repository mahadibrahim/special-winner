import { describe, it, expect } from "vitest";
import { assignTeam } from "@/lib/dropin/team-assignment";

describe("assignTeam", () => {
  it("returns null for class kind (team_count=0)", () => {
    expect(assignTeam({ teamCount: 0, teamColors: [] }, "intermediate", [])).toBeNull();
  });

  it("assigns first team when both empty", () => {
    expect(
      assignTeam(
        { teamCount: 2, teamColors: ["orange", "black"] },
        "intermediate",
        [],
      ),
    ).toBe("orange");
  });

  it("assigns smallest team", () => {
    const existing = [
      { teamAssignment: "orange", skillLevel: "intermediate" as const },
      { teamAssignment: "orange", skillLevel: "intermediate" as const },
      { teamAssignment: "black", skillLevel: "intermediate" as const },
    ];
    expect(
      assignTeam(
        { teamCount: 2, teamColors: ["orange", "black"] },
        "intermediate",
        existing,
      ),
    ).toBe("black");
  });

  it("breaks ties by skill balance", () => {
    // Both teams same size; orange has 2 advanced, black has 2 recreational.
    // Adding intermediate (rank 2) to either leaves the gap at 1.67 — tie. Pick orange (first in list).
    const existing = [
      { teamAssignment: "orange", skillLevel: "advanced" as const },
      { teamAssignment: "orange", skillLevel: "advanced" as const },
      { teamAssignment: "black", skillLevel: "recreational" as const },
      { teamAssignment: "black", skillLevel: "recreational" as const },
    ];
    expect(
      assignTeam(
        { teamCount: 2, teamColors: ["orange", "black"] },
        "intermediate",
        existing,
      ),
    ).toBe("orange");
  });
});
