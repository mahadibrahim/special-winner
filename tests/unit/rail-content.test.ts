import { describe, it, expect } from "vitest";
import { tierColorClass, priceLabel, formatDayTime } from "@/lib/leagues/rail-content";

describe("rail-content", () => {
  it("maps tier → text color (a=ink b=primary c=ochre d=sage)", () => {
    expect(tierColorClass("a")).toBe("text-ink");
    expect(tierColorClass("d")).toBe("text-sage");
    expect(tierColorClass(null)).toBe("text-ink"); // default
  });
  it("priceLabel per mode", () => {
    const s = { price: 120, teamPrice: 1000, deposit: 200 } as any;
    expect(priceLabel("solo", s)).toEqual({ amount: "$120", unit: "solo" });
    expect(priceLabel("team", s)).toEqual({ amount: "$1,000", unit: "team · early-bird" });
    expect(priceLabel("share", s)).toEqual({ amount: "$120", unit: "your share" });
  });
  it("formatDayTime renders day + time window (dayOfWeek is lowercase 'tue')", () => {
    expect(formatDayTime("tue", "19:00:00", "22:00:00")).toBe("Tue nights · 7–10pm");
    expect(formatDayTime("tue", null, null)).toBe("Tue nights");
    expect(formatDayTime(null, null, null)).toBe("");
  });
});
