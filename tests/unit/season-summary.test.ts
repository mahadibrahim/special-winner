import { describe, it, expect } from "vitest";
import { summarizeOpenLeagues } from "@/lib/locations/season-summary";

const season = (over: Record<string, unknown> = {}) => ({
  status: "open",
  termSlug: "fall-2026",
  dayOfWeek: "tue",
  price: 120,
  effectivePrice: null,
  teamPrice: 1050,
  effectiveTeamPrice: 1000,
  registrationCloses: "2026-09-03T12:00:00.000Z",
  signupModes: ["team", "individual"],
  program: { programType: "league" },
  ageGroup: { minAge: 18, maxAge: 99 },
  ...over,
});

describe("summarizeOpenLeagues", () => {
  it("returns null when no open adult league seasons", () => {
    expect(summarizeOpenLeagues([])).toBeNull();
    expect(summarizeOpenLeagues([season({ status: "active" })])).toBeNull();
    expect(summarizeOpenLeagues([season({ ageGroup: { minAge: 6, maxAge: 12 } })])).toBeNull();
  });

  it("summarizes divisions, nights, early-bird-aware prices, and term link", () => {
    const s = summarizeOpenLeagues([
      season(),
      season({ dayOfWeek: "sun", effectivePrice: 100 }),
    ])!;
    expect(s.divisionCount).toBe(2);
    expect(s.nights).toEqual(["Tue", "Sun"]);
    expect(s.soloPrice).toBe(100); // lowest effective price wins the "from $X" display
    expect(s.teamPrice).toBe(1000); // effectiveTeamPrice preferred
    expect(s.termSlug).toBe("fall-2026");
    expect(s.termHref).toBe("/adult/leagues/soccer/fall-2026");
    expect(s.closes).toBe("2026-09-03T12:00:00.000Z");
  });

  it("solo price null when no individual signup", () => {
    const s = summarizeOpenLeagues([season({ signupModes: ["team"] })])!;
    expect(s.soloPrice).toBeNull();
  });
});
