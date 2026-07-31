// Map public season rows (/api/public/seasons shape) to Schema.org SportsEvent
// objects for JSON-LD. Only emits events with a real future start date and a
// positive price — forming/interest seasons and priceless rows are skipped so
// Google never sees an "event" with no offer.
import { venueAddress } from "./venue-address";

export interface SeasonForEvent {
  id: string;
  name: string;
  startDate: string | null;
  endDate?: string | null;
  registrationCloses?: string | null;
  price: number | null;
  sport?: { name?: string | null } | null;
  location?: { name?: string | null; city?: string | null; state?: string | null } | null;
}

// Richer per-division Event markup for the Aspire league pages: street-level
// venue address (SportsActivityLocation) and one Offer per signup path, with
// early-bird handled by reading the API's request-time effective prices —
// never hardcode a price or an early-bird boundary here.
export interface SeasonForLeagueEvent extends SeasonForEvent {
  status?: string | null;
  signupModes?: string[] | null;
  teamPrice?: number | null;
  effectivePrice?: number | null;
  effectiveTeamPrice?: number | null;
  teamEarlyBirdActive?: boolean | null;
  earlyBirdDeadline?: string | null;
  location?: { name?: string | null; city?: string | null; state?: string | null; slug?: string | null } | null;
}

export function seasonsToLeagueEvents(seasons: SeasonForLeagueEvent[], origin: string) {
  return seasons
    .filter((s) => !!s.startDate && s.status === "open")
    .map((s) => {
      const venue = venueAddress(s.location?.slug);
      const modes = s.signupModes ?? ["individual"];
      const offers: Record<string, unknown>[] = [];
      if (modes.includes("individual")) {
        const solo = s.effectivePrice ?? s.price;
        if (typeof solo === "number" && solo > 0) {
          offers.push({
            "@type": "Offer",
            name: "Individual player registration",
            price: solo,
            priceCurrency: "USD",
            url: `${origin}/register/${s.id}?mode=individual`,
            availability: "https://schema.org/InStock",
            ...(s.registrationCloses ? { validThrough: s.registrationCloses } : {}),
          });
        }
      }
      if (modes.includes("team")) {
        const team = s.effectiveTeamPrice ?? s.teamPrice;
        if (typeof team === "number" && team > 0) {
          // While team early bird is live the discounted price is only valid
          // until its deadline; the offer expiry reflects that so Google
          // never caches an expired price as current.
          const teamValidThrough =
            s.teamEarlyBirdActive && s.earlyBirdDeadline ? s.earlyBirdDeadline : s.registrationCloses;
          offers.push({
            "@type": "Offer",
            name: "Team registration",
            price: team,
            priceCurrency: "USD",
            url: `${origin}/register/${s.id}?mode=team`,
            availability: "https://schema.org/InStock",
            ...(teamValidThrough ? { validThrough: teamValidThrough } : {}),
          });
        }
      }
      if (offers.length === 0) return null;
      return {
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        name: s.name,
        sport: s.sport?.name ?? "Soccer",
        startDate: s.startDate as string,
        ...(s.endDate ? { endDate: s.endDate } : {}),
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
          "@type": "SportsActivityLocation",
          name: s.location?.name ?? "Aspire Sports",
          address: venue?.address ?? {
            "@type": "PostalAddress",
            addressLocality: s.location?.city ?? "Columbus",
            addressRegion: s.location?.state ?? "OH",
            addressCountry: "US",
          },
          ...(venue ? { geo: venue.geo } : {}),
        },
        offers: offers.length === 1 ? offers[0] : offers,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
}

export function seasonsToSportsEvents(seasons: SeasonForEvent[], origin: string) {
  return seasons
    .filter((s) => !!s.startDate && typeof s.price === "number" && s.price > 0)
    .map((s) => ({
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: s.name,
      sport: s.sport?.name ?? "Soccer",
      startDate: s.startDate as string,
      ...(s.endDate ? { endDate: s.endDate } : {}),
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "Place",
        name: s.location?.name ?? "SoccerOne",
        address: {
          "@type": "PostalAddress",
          addressLocality: s.location?.city ?? "Columbus",
          addressRegion: s.location?.state ?? "OH",
          addressCountry: "US",
        },
      },
      offers: {
        "@type": "Offer",
        price: s.price as number,
        priceCurrency: "USD",
        url: `${origin}/register/${s.id}`,
        availability: "https://schema.org/InStock",
        ...(s.registrationCloses ? { validThrough: s.registrationCloses } : {}),
      },
    }));
}
