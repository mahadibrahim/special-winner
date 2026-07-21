// The single file a human edits when facility claims change. Everything
// program-related stays live from the seasons API — this holds only the
// structural facts of the building (owner-verified 2026-07-21).

export interface VenueSpec { n: string; label: string }

export interface VenueFacts {
  /** One-line identity under the hero title. */
  tagline: string;
  /** Facts ticker items (address renders separately from the DB row). */
  ticker: string[];
  specs: VenueSpec[];
  features: string[];
  comingSoon: string[];
  /** Which What's-Happening cards this venue gets besides live leagues. */
  offerings: { youth: boolean; pickup: boolean; rentals: boolean };
  directions: string[];
  parkingNote: string;
  hours: string;
  photos: { src: string; alt: string }[];
  heroPoster: string;
}

const FACTS: Record<string, VenueFacts> = {
  worthington: {
    tagline:
      "2 indoor turf fields off I-270, futsal court coming. Adult co-ed leagues on weeknights, youth programs U6–U18 on a published weekly schedule.",
    ticker: ["Weeknights to 11 PM", "Free parking", "Indoor · year-round"],
    specs: [
      { n: "2", label: "Turf fields · 110×60, boarded" },
      { n: "Futsal", label: "Court coming Sept 2026" },
      { n: "Year-round", label: "No weather cancellations" },
      { n: "Free", label: "On-site parking" },
    ],
    features: [
      "Fully boarded fields — play off the walls, keep the tempo up",
      "Family-friendly viewing area",
      "Restrooms + locker rooms",
    ],
    comingSoon: ["Futsal court — September 2026"],
    offerings: { youth: true, pickup: false, rentals: true },
    directions: [
      "I-270 Exit 23 → US-23 north",
      "East on Campus View Blvd",
      "Lakeview Plaza — we're in Suite B",
    ],
    parkingNote: "Free lot right outside the door — designed for family drop-off.",
    hours: "Weeknights to 11 PM · weekend mornings",
    photos: [
      { src: "/media/soccerone/still-action.jpg", alt: "Match on the boarded turf field" },
      { src: "/media/soccerone/still-entrance.jpg", alt: "Facility entrance" },
      { src: "/media/soccerone/still-party.jpg", alt: "Spectator and event space" },
    ],
    heroPoster: "/media/soccerone/worthington-hero-poster.jpg",
  },
  downtown: {
    tagline:
      "One field near campus — the pickup and rentals hub. Show up and play, or book the field by the hour.",
    ticker: ["Pickup most nights", "Book by the hour", "Indoor · year-round"],
    specs: [
      { n: "1", label: "Indoor field" },
      { n: "Nightly", label: "Drop-in pickup" },
      { n: "Hourly", label: "Field rentals" },
    ],
    features: [
      "Campus-adjacent — walkable from OSU",
      "Balanced-teams pickup format, live session times published",
    ],
    comingSoon: [],
    offerings: { youth: false, pickup: true, rentals: true },
    directions: ["Near the OSU campus — exact walking/parking notes on the booking page"],
    parkingNote: "Street and lot parking nearby.",
    hours: "Sessions listed on the pickup schedule",
    photos: [
      { src: "/media/soccerone/still-action.jpg", alt: "Indoor field in play" },
      { src: "/media/soccerone/still-entrance.jpg", alt: "Facility entrance" },
    ],
    heroPoster: "/media/soccerone/worthington-hero-poster.jpg",
  },
};

export function getVenueFacts(slug: string): VenueFacts | null {
  return FACTS[slug] ?? null;
}
