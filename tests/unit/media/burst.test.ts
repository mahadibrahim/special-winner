import { describe, it, expect } from "vitest";
import { computeBurstGroups } from "@/lib/media/burst";

describe("computeBurstGroups", () => {
  it("groups assets captured within 2 seconds of a neighbor", () => {
    const assets = [
      { id: "a", capturedAt: new Date("2026-04-19T14:00:00.000Z") },
      { id: "b", capturedAt: new Date("2026-04-19T14:00:01.000Z") },
      { id: "c", capturedAt: new Date("2026-04-19T14:00:02.500Z") },
      { id: "d", capturedAt: new Date("2026-04-19T14:00:10.000Z") },
    ];
    const groups = computeBurstGroups(assets);
    expect(groups.get("a")).toBe(groups.get("b"));
    expect(groups.get("b")).toBe(groups.get("c"));
    expect(groups.get("d")).not.toBe(groups.get("a"));
  });

  it("assigns a unique group to isolated assets", () => {
    const assets = [
      { id: "x", capturedAt: new Date("2026-04-19T14:00:00.000Z") },
      { id: "y", capturedAt: new Date("2026-04-19T14:00:10.000Z") },
    ];
    const groups = computeBurstGroups(assets);
    expect(groups.get("x")).not.toBe(groups.get("y"));
    expect(groups.get("x")).toBeTruthy();
    expect(groups.get("y")).toBeTruthy();
  });

  it("handles assets with null capturedAt (assigns unique group)", () => {
    const assets = [
      { id: "p", capturedAt: null },
      { id: "q", capturedAt: null },
    ];
    const groups = computeBurstGroups(assets);
    expect(groups.get("p")).not.toBe(groups.get("q"));
  });

  it("sorts by capturedAt before grouping (unordered input)", () => {
    const assets = [
      { id: "c", capturedAt: new Date("2026-04-19T14:00:02.000Z") },
      { id: "a", capturedAt: new Date("2026-04-19T14:00:00.000Z") },
      { id: "b", capturedAt: new Date("2026-04-19T14:00:01.000Z") },
    ];
    const groups = computeBurstGroups(assets);
    expect(groups.get("a")).toBe(groups.get("b"));
    expect(groups.get("b")).toBe(groups.get("c"));
  });
});
