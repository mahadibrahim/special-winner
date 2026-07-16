// Map public season rows (/api/public/seasons shape) to Schema.org SportsEvent
// objects for JSON-LD. Only emits events with a real future start date and a
// positive price — forming/interest seasons and priceless rows are skipped so
// Google never sees an "event" with no offer.
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
