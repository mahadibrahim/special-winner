import { describe, it, expect } from "vitest";
import { groupByTerm, resolveCurrentTerm, type TermSeason } from "@/lib/leagues/terms";

const S = (over: Partial<TermSeason>): TermSeason => ({
  id: "s", termSlug: "fall-2026", termLabel: "Fall 2026",
  status: "open", startDate: "2026-09-14", ...over,
});

describe("terms", () => {
  it("groups seasons by termSlug preserving label", () => {
    const groups = groupByTerm([S({ id: "a" }), S({ id: "b" }), S({ id: "c", termSlug: "summer-2026", termLabel: "Summer 2026", status: "completed", startDate: "2026-06-01" })]);
    expect(groups.map((g) => g.slug)).toEqual(["summer-2026", "fall-2026"]);
    expect(groups.find((g) => g.slug === "fall-2026")!.seasons).toHaveLength(2);
  });
  it("resolveCurrentTerm picks the earliest-starting term with an open season", () => {
    const t = resolveCurrentTerm([
      S({ id: "a", termSlug: "winter-2027", termLabel: "Winter 2027", status: "forming", startDate: "2027-01-05" }),
      S({ id: "b", termSlug: "fall-2026", termLabel: "Fall 2026", status: "open", startDate: "2026-09-14" }),
    ]);
    expect(t?.slug).toBe("fall-2026");
  });
  it("falls back to earliest forming term when nothing is open", () => {
    const t = resolveCurrentTerm([S({ id: "a", status: "forming" })]);
    expect(t?.slug).toBe("fall-2026");
  });
  it("returns null for an empty list", () => {
    expect(resolveCurrentTerm([])).toBeNull();
  });
});
