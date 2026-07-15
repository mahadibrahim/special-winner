import { describe, it, expect } from "vitest";
import { groupDivisionsByDay } from "@/lib/leagues/division-filters";
import type { Division } from "@/lib/leagues/division-filters";

const div = (id: string, day: Division["day"]): Division => ({
  id,
  seasonId: id,
  name: id,
  level: "open",
  gender: "coed",
  day,
  time: null,
  venueSlug: "v",
  venueName: "V",
  status: "open",
  spotsLabel: "",
  signupModes: [],
});

describe("groupDivisionsByDay", () => {
  it("orders groups by WEEK_ORDER and omits empty days", () => {
    const g = groupDivisionsByDay([div("a", "wed"), div("b", "mon")]);
    expect(g.map((x) => x.day)).toEqual(["mon", "wed"]);
    expect(g[0].label).toBe("Mon");
  });

  it("puts null-day divisions in a trailing 'Day TBD' group", () => {
    const g = groupDivisionsByDay([div("a", null), div("b", "tue")]);
    expect(g.map((x) => x.day)).toEqual(["tue", null]);
    expect(g[1].label).toBe("Day TBD");
  });

  it("groups multiple divisions under the same day", () => {
    const g = groupDivisionsByDay([div("a", "mon"), div("b", "mon")]);
    expect(g).toHaveLength(1);
    expect(g[0].items.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("returns [] for no divisions", () => {
    expect(groupDivisionsByDay([])).toEqual([]);
  });
});
