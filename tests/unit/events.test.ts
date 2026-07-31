import { describe, it, expect } from "vitest";
import { seasonsToSportsEvents, seasonsToLeagueEvents } from "@/lib/seo/events";

const base = {
  id: "s1",
  name: "Adult Coed — Sunday",
  startDate: "2026-09-06",
  endDate: "2026-11-01",
  registrationCloses: "2026-08-30",
  price: 95,
  sport: { name: "Soccer" },
  location: { name: "SoccerOne Worthington", city: "Worthington", state: "OH" },
};

describe("seasonsToSportsEvents", () => {
  it("maps a valid season to a SportsEvent with an Offer", () => {
    const [ev] = seasonsToSportsEvents([base], "https://www.gosoccerone.com");
    expect(ev).toMatchObject({
      "@type": "SportsEvent",
      name: "Adult Coed — Sunday",
      sport: "Soccer",
      startDate: "2026-09-06",
      endDate: "2026-11-01",
      location: {
        "@type": "Place",
        name: "SoccerOne Worthington",
        address: { addressLocality: "Worthington", addressRegion: "OH" },
      },
      offers: {
        "@type": "Offer",
        price: 95,
        priceCurrency: "USD",
        url: "https://www.gosoccerone.com/register/s1",
        validThrough: "2026-08-30",
      },
    });
  });

  it("skips seasons with no start date or no positive price", () => {
    expect(seasonsToSportsEvents([{ ...base, startDate: null }], "https://x")).toHaveLength(0);
    expect(seasonsToSportsEvents([{ ...base, price: 0 }], "https://x")).toHaveLength(0);
  });

  it("omits endDate and validThrough when absent", () => {
    const [ev] = seasonsToSportsEvents(
      [{ ...base, endDate: null, registrationCloses: null }],
      "https://x",
    );
    expect(ev).not.toHaveProperty("endDate");
    expect(ev.offers).not.toHaveProperty("validThrough");
  });
});

const leagueBase = {
  ...base,
  status: "open",
  signupModes: ["individual", "team"],
  price: 120,
  teamPrice: 1050,
  effectiveTeamPrice: 1000,
  teamEarlyBirdActive: true,
  earlyBirdDeadline: "2026-08-03T12:00:00Z",
  location: { name: "Worthington", city: "Worthington", state: "OH", slug: "worthington" },
};

describe("seasonsToLeagueEvents", () => {
  it("emits a SportsActivityLocation with the street address for known venues", () => {
    const [ev] = seasonsToLeagueEvents([leagueBase], "https://aspiresportsohio.com");
    expect(ev.location).toMatchObject({
      "@type": "SportsActivityLocation",
      name: "Worthington",
      address: { streetAddress: "535 Lakeview Plaza Blvd", postalCode: "43085" },
      geo: { latitude: 40.1130348 },
    });
  });

  it("emits one offer per signup mode with mode-specific register URLs", () => {
    const [ev] = seasonsToLeagueEvents([leagueBase], "https://aspiresportsohio.com");
    const offers = ev.offers as Array<Record<string, unknown>>;
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      price: 120,
      url: "https://aspiresportsohio.com/register/s1?mode=individual",
      validThrough: "2026-08-30",
    });
    expect(offers[1]).toMatchObject({
      price: 1000,
      url: "https://aspiresportsohio.com/register/s1?mode=team",
      // Early-bird price only valid until its deadline, not reg close.
      validThrough: "2026-08-03T12:00:00Z",
    });
  });

  it("uses the list team price and reg-close expiry once early bird lapses", () => {
    const [ev] = seasonsToLeagueEvents(
      [{ ...leagueBase, teamEarlyBirdActive: false, effectiveTeamPrice: 1050 }],
      "https://x",
    );
    const offers = ev.offers as Array<Record<string, unknown>>;
    expect(offers[1]).toMatchObject({ price: 1050, validThrough: "2026-08-30" });
  });

  it("skips non-open seasons and seasons with no valid offer", () => {
    expect(seasonsToLeagueEvents([{ ...leagueBase, status: "forming" }], "https://x")).toHaveLength(0);
    expect(seasonsToLeagueEvents([{ ...leagueBase, status: "completed" }], "https://x")).toHaveLength(0);
    expect(
      seasonsToLeagueEvents([{ ...leagueBase, price: 0, teamPrice: null, effectiveTeamPrice: null }], "https://x"),
    ).toHaveLength(0);
  });

  it("falls back to city/state-only address for unknown venues", () => {
    const [ev] = seasonsToLeagueEvents(
      [{ ...leagueBase, location: { name: "Pop-up", city: "Dublin", state: "OH", slug: "popup" } }],
      "https://x",
    );
    expect(ev.location.address).not.toHaveProperty("streetAddress");
    expect(ev.location).not.toHaveProperty("geo");
  });
});
