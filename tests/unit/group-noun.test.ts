import { describe, it, expect } from "vitest";
import { groupNoun } from "@/lib/programs/group-noun";

describe("groupNoun", () => {
  it("maps league to team", () => {
    expect(groupNoun("league")).toBe("team");
  });

  it("maps camp to camp group", () => {
    expect(groupNoun("camp")).toBe("camp group");
  });

  it("maps clinic to class", () => {
    expect(groupNoun("clinic")).toBe("class");
  });

  it("maps training to class", () => {
    expect(groupNoun("training")).toBe("class");
  });

  it("maps tournament to group", () => {
    expect(groupNoun("tournament")).toBe("group");
  });

  it("never says team for a non-league program type", () => {
    for (const type of ["camp", "clinic", "training", "tournament", "unknown-future-type"]) {
      expect(groupNoun(type)).not.toBe("team");
    }
  });

  it("falls back to group for an unrecognized program type", () => {
    expect(groupNoun("unknown-future-type")).toBe("group");
  });
});
