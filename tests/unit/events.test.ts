import { describe, it, expect } from "vitest";
import { seasonsToSportsEvents } from "@/lib/seo/events";

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
