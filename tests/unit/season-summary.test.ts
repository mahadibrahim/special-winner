import { describe, it, expect } from "vitest";
import {
  summarizeOpenLeagues,
  summarizeUpcomingTerms,
} from "@/lib/locations/season-summary";

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
    expect(
      summarizeOpenLeagues([season({ ageGroup: { minAge: 6, maxAge: 12 } })]),
    ).toBeNull();
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
    expect(s.hasOpen).toBe(true);
  });

  it("solo price null when no individual signup", () => {
    const s = summarizeOpenLeagues([season({ signupModes: ["team"] })])!;
    expect(s.soloPrice).toBeNull();
  });

  it("scopes to the open term only — future forming terms don't inflate counts or prices", () => {
    // Prod shape: 7 open fall divisions + dozens of pre-created forming
    // winter/spring divisions (cheaper future team price, other nights).
    const s = summarizeOpenLeagues([
      season(),
      season({ dayOfWeek: "sun" }),
      season({
        status: "forming",
        termSlug: "winter-1-2627",
        dayOfWeek: "wed",
        teamPrice: 750,
        effectiveTeamPrice: null,
        registrationCloses: null,
        startDate: "2026-11-20",
      }),
      season({
        status: "forming",
        termSlug: "spring-2027",
        dayOfWeek: "mon",
        teamPrice: 750,
        effectiveTeamPrice: null,
        registrationCloses: null,
        startDate: "2027-03-01",
      }),
    ])!;
    expect(s.divisionCount).toBe(2); // fall only
    expect(s.nights).toEqual(["Tue", "Sun"]); // no Wed/Mon from future terms
    expect(s.teamPrice).toBe(1000); // fall's price, not winter's $750
    expect(s.termSlug).toBe("fall-2026");
    expect(s.hasOpen).toBe(true);
  });

  it("with no open term, picks the nearest forming term by start date", () => {
    const s = summarizeOpenLeagues([
      season({
        status: "forming",
        termSlug: "spring-2027",
        registrationCloses: null,
        startDate: "2027-03-01",
      }),
      season({
        status: "forming",
        termSlug: "winter-1-2627",
        dayOfWeek: "wed",
        registrationCloses: null,
        startDate: "2026-11-20",
      }),
    ])!;
    expect(s.termSlug).toBe("winter-1-2627");
    expect(s.divisionCount).toBe(1);
    expect(s.hasOpen).toBe(false);
  });

  it("forming-only seasons still summarize, but with hasOpen false and no closes date", () => {
    const s = summarizeOpenLeagues([
      season({ status: "forming", registrationCloses: null }),
    ])!;
    expect(s).not.toBeNull();
    expect(s.hasOpen).toBe(false);
    expect(s.closes).toBeNull();
    expect(s.divisionCount).toBe(1);
  });
});

describe("summarizeUpcomingTerms", () => {
  it("groups forming future terms, excludes the active term, sorts by start date", () => {
    const upcoming = summarizeUpcomingTerms(
      [
        season(), // open fall — not forming, ignored
        season({
          status: "forming",
          termSlug: "fall-2026", // same term as the active card — excluded
          registrationCloses: null,
        }),
        season({
          status: "forming",
          termSlug: "spring-2027",
          termLabel: "Spring 2027",
          registrationCloses: null,
          startDate: "2027-03-01",
        }),
        season({
          status: "forming",
          termSlug: "winter-1-2627",
          termLabel: "Winter 1",
          registrationCloses: null,
          startDate: "2026-11-20",
        }),
        season({
          status: "forming",
          termSlug: "winter-1-2627",
          termLabel: "Winter 1",
          registrationCloses: null,
          startDate: "2026-11-22",
        }),
      ],
      "fall-2026",
    );
    expect(upcoming.map((t) => t.termSlug)).toEqual(["winter-1-2627", "spring-2027"]);
    expect(upcoming[0].count).toBe(2);
    expect(upcoming[0].startDate).toBe("2026-11-20"); // earliest within the term
    expect(upcoming[0].termHref).toBe("/adult/leagues/soccer/winter-1-2627");
    expect(upcoming[1].termLabel).toBe("Spring 2027");
  });

  it("returns empty for no forming terms", () => {
    expect(summarizeUpcomingTerms([season()], "fall-2026")).toEqual([]);
  });
});
