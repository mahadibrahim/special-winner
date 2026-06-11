import { describe, it, expect } from "vitest";
import {
  rangesOverlap,
  expandFamily,
  findRoot,
} from "@/lib/scheduling/blocks";

const d = (h: number) => new Date(Date.UTC(2026, 5, 20, h));

describe("rangesOverlap (half-open intervals)", () => {
  it("detects plain overlap", () => {
    expect(rangesOverlap(d(10), d(12), d(11), d(13))).toBe(true);
  });
  it("detects containment", () => {
    expect(rangesOverlap(d(10), d(14), d(11), d(12))).toBe(true);
  });
  it("back-to-back slots do NOT overlap (10–11 then 11–12)", () => {
    expect(rangesOverlap(d(10), d(11), d(11), d(12))).toBe(false);
  });
  it("disjoint ranges do not overlap", () => {
    expect(rangesOverlap(d(8), d(9), d(11), d(12))).toBe(false);
  });
});

describe("expandFamily", () => {
  // Worthington-style: Field 1 splits into halves; Fields 2, 3 flat.
  const rows = [
    { id: "f1", parentResourceId: null },
    { id: "f1a", parentResourceId: "f1" },
    { id: "f1b", parentResourceId: "f1" },
    { id: "f2", parentResourceId: null },
    { id: "f3", parentResourceId: null },
  ];

  it("flat resource → itself only", () => {
    expect(expandFamily("f2", rows).sort()).toEqual(["f2"]);
  });
  it("parent → itself + all descendants", () => {
    expect(expandFamily("f1", rows).sort()).toEqual(["f1", "f1a", "f1b"]);
  });
  it("child → itself + ancestors, NOT the sibling", () => {
    expect(expandFamily("f1a", rows).sort()).toEqual(["f1", "f1a"]);
  });
  it("handles deeper nesting (quarter inside half)", () => {
    const deep = [...rows, { id: "f1a1", parentResourceId: "f1a" }];
    expect(expandFamily("f1a1", deep).sort()).toEqual(["f1", "f1a", "f1a1"]);
    expect(expandFamily("f1", deep).sort()).toEqual(["f1", "f1a", "f1a1", "f1b"]);
    // Sibling half still unaffected by the quarter
    expect(expandFamily("f1b", deep).sort()).toEqual(["f1", "f1b"]);
  });
});

describe("findRoot", () => {
  const rows = [
    { id: "f1", parentResourceId: null },
    { id: "f1a", parentResourceId: "f1" },
    { id: "f1a1", parentResourceId: "f1a" },
  ];
  it("root of a root is itself", () => {
    expect(findRoot("f1", rows)).toBe("f1");
  });
  it("walks to the top from any depth", () => {
    expect(findRoot("f1a", rows)).toBe("f1");
    expect(findRoot("f1a1", rows)).toBe("f1");
  });
});
