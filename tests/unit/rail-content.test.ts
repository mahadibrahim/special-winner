import { describe, it, expect } from "vitest";
import { tierColorClass, priceLabel, teamPriceStory, teamRailBreakdown, formatDayTime } from "@/lib/leagues/rail-content";

describe("rail-content", () => {
  it("maps tier → text color (a=ink b=primary c=ochre d=sage)", () => {
    expect(tierColorClass("a")).toBe("text-ink");
    expect(tierColorClass("d")).toBe("text-sage");
    expect(tierColorClass(null)).toBe("text-ink"); // default
  });
  it("colors the youth tiers too, rather than falling through to the default", () => {
    expect(tierColorClass("competitive_a")).toBe("text-ink");
    expect(tierColorClass("competitive_b")).toBe("text-primary");
    expect(tierColorClass("developmental")).toBe("text-ochre");
    expect(tierColorClass("recreational")).toBe("text-sage");
  });
  it("priceLabel per mode", () => {
    const s = { price: 120, teamPrice: 1000, deposit: 200 } as any;
    expect(priceLabel("solo", s)).toEqual({ amount: "$120", unit: "solo" });
    // Team mode is deposit-first: the number a captain pays today leads.
    expect(priceLabel("team", s)).toEqual({
      amount: "$200 down",
      unit: "today · $1,000 total · your roster pays the rest",
    });
    // Share mode with no assigned-share value renders nothing — the rail
    // shows the fallback sentence instead of ever guessing the solo price.
    expect(priceLabel("share", s)).toEqual({ amount: "", unit: "" });
  });
  it("priceLabel prefers effectivePrice for solo, not team", () => {
    const s = { price: 120, teamPrice: 1000, deposit: 200, effectivePrice: 100 } as any;
    expect(priceLabel("solo", s)).toEqual({ amount: "$100", unit: "solo" });
    // The per-player early-bird must not bleed into the team price.
    expect(priceLabel("team", s)).toEqual({
      amount: "$200 down",
      unit: "today · $1,000 total · your roster pays the rest",
    });
  });
  it("priceLabel shows the team early-bird price, and only calls it early-bird when live", () => {
    const live = {
      price: 120, teamPrice: 1050, deposit: 200,
      effectiveTeamPrice: 1000, teamEarlyBirdActive: true,
    } as any;
    expect(priceLabel("team", live)).toEqual({
      amount: "$200 down",
      unit: "today · $1,000 total (early-bird) · your roster pays the rest",
    });

    // Window closed: charge path bills list, so the rail must show list.
    const closed = {
      price: 120, teamPrice: 1050, deposit: 200,
      effectiveTeamPrice: 1050, teamEarlyBirdActive: false,
    } as any;
    expect(priceLabel("team", closed)).toEqual({
      amount: "$200 down",
      unit: "today · $1,050 total · your roster pays the rest",
    });

    // A team early-bird never discounts the solo price (Aspire policy).
    expect(priceLabel("solo", live)).toEqual({ amount: "$120", unit: "solo" });
  });
  it("priceLabel share mode with an assigned share renders the real amount, not the solo price", () => {
    const s = { price: 120, teamPrice: 1000, deposit: 200 } as any;
    expect(priceLabel("share", s, { shareCents: 9000 })).toEqual({
      amount: "$90",
      unit: "your share",
    });
    // Odd-cent splits keep both cent digits — "$90.50", never "$90.5".
    expect(priceLabel("share", s, { shareCents: 9050 })).toEqual({
      amount: "$90.50",
      unit: "your share",
    });
  });
  it("priceLabel share mode without a share value renders nothing (rail handles fallback copy)", () => {
    const s = { price: 120, teamPrice: 1000, deposit: 200 } as any;
    expect(priceLabel("share", s)).toEqual({ amount: "", unit: "" });
    expect(priceLabel("share", s, {})).toEqual({ amount: "", unit: "" });
    expect(priceLabel("share", s, { shareCents: null })).toEqual({ amount: "", unit: "" });
  });
  it("priceLabel solo/team modes ignore opts.shareCents", () => {
    const s = { price: 120, teamPrice: 1000, deposit: 200 } as any;
    expect(priceLabel("solo", s, { shareCents: 9000 })).toEqual({ amount: "$120", unit: "solo" });
    expect(priceLabel("team", s, { shareCents: 9000 })).toEqual({
      amount: "$200 down",
      unit: "today · $1,000 total · your roster pays the rest",
    });
  });
  it("formatDayTime renders day + time window (dayOfWeek is lowercase 'tue')", () => {
    expect(formatDayTime("tue", "19:00:00", "22:00:00")).toBe("Tue nights · 7–10pm");
    expect(formatDayTime("tue", null, null)).toBe("Tue nights");
    expect(formatDayTime(null, null, null)).toBe("");
  });
});

describe("teamPriceStory", () => {
  it("deposit-first story with early-bird strikethrough base", () => {
    expect(
      teamPriceStory({ price: 120, teamPrice: 1050, effectiveTeamPrice: 1000, teamEarlyBirdActive: true }),
    ).toEqual({ deposit: "$200", total: "$1,000", baseTotal: "$1,050" });
  });
  it("no strikethrough when the window is closed or not discounting", () => {
    expect(
      teamPriceStory({ price: 120, teamPrice: 1050, effectiveTeamPrice: 1050, teamEarlyBirdActive: false }),
    ).toEqual({ deposit: "$200", total: "$1,050", baseTotal: null });
    expect(teamPriceStory({ price: 120, teamPrice: 1050 })).toEqual({
      deposit: "$200", total: "$1,050", baseTotal: null,
    });
  });
  it("falls back to solo price when teamPrice is null (team-only misconfig)", () => {
    expect(teamPriceStory({ price: 120, teamPrice: null })).toEqual({
      deposit: "$200", total: "$120", baseTotal: null,
    });
  });
});

describe("teamRailBreakdown", () => {
  it("no early-bird, no discount: total leads, no struck base", () => {
    expect(teamRailBreakdown({ price: 120, teamPrice: 1000, effectiveTeamPrice: 1000 })).toEqual({
      total: "$1,000", baseTotal: null, depositToday: "$200", rosterPays: "$800",
    });
  });
  it("early-bird live: total is the early-bird price, base is the struck list price", () => {
    expect(
      teamRailBreakdown({ price: 120, teamPrice: 1050, effectiveTeamPrice: 1000, teamEarlyBirdActive: true }),
    ).toEqual({ total: "$1,000", baseTotal: "$1,050", depositToday: "$200", rosterPays: "$800" });
  });
  it("discount applied strikes the early-bird price and shrinks the roster split", () => {
    expect(
      teamRailBreakdown(
        { price: 120, teamPrice: 1050, effectiveTeamPrice: 1000, teamEarlyBirdActive: true },
        { discountCents: 10000 },
      ),
    ).toEqual({ total: "$900", baseTotal: "$1,000", depositToday: "$200", rosterPays: "$700" });
  });
  it("discount without an early-bird window strikes the plain team fee", () => {
    expect(
      teamRailBreakdown({ price: 120, teamPrice: 1000, effectiveTeamPrice: 1000 }, { discountCents: 10000 }),
    ).toEqual({ total: "$900", baseTotal: "$1,000", depositToday: "$200", rosterPays: "$700" });
  });
});
