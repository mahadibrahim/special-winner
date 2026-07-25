import { describe, it, expect } from "vitest";
import { balanceDays } from "@/lib/scheduling/balance-days";

const days = ["mon", "tue", "wed"] as const;

describe("balanceDays", () => {
  it("spreads unassigned divisions evenly across open days", () => {
    const d = [
      { id: "a", dayOfWeek: null },
      { id: "b", dayOfWeek: null },
      { id: "c", dayOfWeek: null },
    ];
    const m = balanceDays(d, [...days]);
    expect(new Set(m.values())).toEqual(new Set(["mon", "tue", "wed"]));
  });

  it("fill-empty leaves already-assigned divisions on their day", () => {
    const d = [
      { id: "a", dayOfWeek: "tue" as const },
      { id: "b", dayOfWeek: null },
      { id: "c", dayOfWeek: null },
    ];
    const m = balanceDays(d, [...days], { mode: "fill-empty" });
    expect(m.get("a")).toBe("tue");
    // b, c go to the least-loaded days (mon, wed), avoiding piling onto tue
    expect(new Set([m.get("b"), m.get("c")])).toEqual(new Set(["mon", "wed"]));
  });

  it("rebalance ignores existing days and redistributes evenly", () => {
    const d = [
      { id: "a", dayOfWeek: "tue" as const },
      { id: "b", dayOfWeek: "tue" as const },
      { id: "c", dayOfWeek: "tue" as const },
    ];
    const m = balanceDays(d, [...days], { mode: "rebalance" });
    expect(new Set(m.values())).toEqual(new Set(["mon", "tue", "wed"]));
  });

  it("is deterministic by id ordering", () => {
    const d = [
      { id: "c", dayOfWeek: null },
      { id: "a", dayOfWeek: null },
      { id: "b", dayOfWeek: null },
    ];
    expect(balanceDays(d, [...days])).toEqual(balanceDays([...d].reverse(), [...days]));
  });

  it("returns an empty map when there are no open days", () => {
    expect(balanceDays([{ id: "a", dayOfWeek: null }], []).size).toBe(0);
  });

  it("handles zero divisions", () => {
    expect(balanceDays([], [...days]).size).toBe(0);
  });
});
