import { describe, it, expect } from "vitest";
import { partitionTerms, type TermSeason } from "@/lib/leagues/terms";

const S = (over: Partial<TermSeason>): TermSeason => ({ id: "s", termSlug: "fall-2026", termLabel: "Fall 2026", status: "open", startDate: "2026-09-14", ...over });

describe("partitionTerms", () => {
  it("splits terms into current (open/active), upcoming (forming), past (completed)", () => {
    const { current, upcoming, past } = partitionTerms([
      S({ id: "a", termSlug: "fall-2026", status: "open", startDate: "2026-09-14" }),
      S({ id: "b", termSlug: "winter-1", termLabel: "Winter 1", status: "forming", startDate: "2026-11-09" }),
      S({ id: "c", termSlug: "summer-2026", termLabel: "Summer 2026", status: "completed", startDate: "2026-06-01" }),
      S({ id: "d", termSlug: "spring-2027", termLabel: "Spring 2027", status: "forming", startDate: "2027-04-05" }),
    ]);
    expect(current?.slug).toBe("fall-2026");
    expect(upcoming.map((t) => t.slug)).toEqual(["winter-1", "spring-2027"]);
    expect(past.map((t) => t.slug)).toEqual(["summer-2026"]);
  });
  it("current is null when nothing is open or active", () => {
    const { current, upcoming } = partitionTerms([S({ status: "forming" })]);
    expect(current).toBeNull();
    expect(upcoming).toHaveLength(1);
  });
});
