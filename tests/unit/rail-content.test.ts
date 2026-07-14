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
    // No team early-bird set → plain "team". The label used to hardcode
    // "· early-bird" here, claiming a discount that wasn't being applied.
    expect(priceLabel("team", s)).toEqual({ amount: "$1,000", unit: "team" });
    expect(priceLabel("share", s)).toEqual({ amount: "$120", unit: "your share" });
  });
  it("priceLabel prefers effectivePrice for solo/share, not team", () => {
    const s = { price: 120, teamPrice: 1000, deposit: 200, effectivePrice: 100 } as any;
    expect(priceLabel("solo", s)).toEqual({ amount: "$100", unit: "solo" });
    expect(priceLabel("share", s)).toEqual({ amount: "$100", unit: "your share" });
    // The per-player early-bird must not bleed into the team price.
    expect(priceLabel("team", s)).toEqual({ amount: "$1,000", unit: "team" });
  });
  it("priceLabel shows the team early-bird price, and only calls it early-bird when live", () => {
    const live = {
      price: 120,
      teamPrice: 1050,
      deposit: 200,
      effectiveTeamPrice: 1000,
      teamEarlyBirdActive: true,
    } as any;
    expect(priceLabel("team", live)).toEqual({ amount: "$1,000", unit: "team · early-bird" });

    // Window closed: charge path bills list, so the rail must show list.
    const closed = {
      price: 120,
      teamPrice: 1050,
      deposit: 200,
      effectiveTeamPrice: 1050,
      teamEarlyBirdActive: false,
    } as any;
    expect(priceLabel("team", closed)).toEqual({ amount: "$1,050", unit: "team" });

    // A team early-bird never discounts the solo price (Aspire policy).
    expect(priceLabel("solo", live)).toEqual({ amount: "$120", unit: "solo" });
  });
  it("formatDayTime renders day + time window (dayOfWeek is lowercase 'tue')", () => {
    expect(formatDayTime("tue", "19:00:00", "22:00:00")).toBe("Tue nights · 7–10pm");
    expect(formatDayTime("tue", null, null)).toBe("Tue nights");
    expect(formatDayTime(null, null, null)).toBe("");
  });
});
