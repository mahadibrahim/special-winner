// The single file a human edits when facility claims change. Everything
// program-related stays live from the seasons API — this holds only the
// structural facts of the building (owner-verified 2026-07-21).
//
// v2 role note: these pages are PROGRAM pages. Venue operations content —
// hours, parking, field rentals — lives on the venue website (the SoccerOne
// pages for the same building) and must not reappear here.

export interface VenueSpec {
  n: string;
  label: string;
}

export interface VenueFacts {
  /** One-line identity under the hero title. */
  tagline: string;
  /** Facts ticker items (address renders separately from the DB row). */
  ticker: string[];
  specs: VenueSpec[];
  features: string[];
  comingSoon: string[];
  /** Which What's-Happening cards this venue gets besides live leagues. */
  offerings: { youth: boolean; pickup: boolean };
  directions: string[];
  photos: { src: string; alt: string }[];
  heroPoster: string;
}

const FACTS: Record<string, VenueFacts> = {
  worthington: {
    tagline:
      "2 indoor turf fields off I-270, futsal court coming. Adult co-ed leagues on weeknights, youth programs U6–U18 on a published weekly schedule.",
    ticker: ["Indoor · year-round"],
    specs: [
      { n: "2", label: "Turf fields · 110×60, boarded" },
      { n: "Futsal", label: "Court coming Sept 2026" },
      { n: "Year-round", label: "No weather cancellations" },
    ],
    features: [
      "Fully boarded fields — play off the walls, keep the tempo up",
      "Family-friendly viewing area",
      "Restrooms + locker rooms",
    ],
    comingSoon: ["Futsal court — September 2026"],
    offerings: { youth: true, pickup: false },
    directions: [
      "I-270 Exit 23 → US-23 north",
      "East on Campus View Blvd",
      "Lakeview Plaza — we're in Suite B",
    ],
    photos: [
      {
        src: "/media/soccerone/still-action.jpg",
        alt: "Match on the boarded turf field",
      },
      { src: "/media/soccerone/still-entrance.jpg", alt: "Facility entrance" },
      {
        src: "/media/soccerone/still-party.jpg",
        alt: "Spectator and event space",
      },
    ],
    heroPoster: "/media/soccerone/worthington-hero-poster.jpg",
  },
  downtown: {
    tagline:
      "One field near campus — the drop-in pickup hub. Show up and play, no season commitment.",
    ticker: ["Indoor · year-round"],
    specs: [
      { n: "1", label: "Indoor field" },
      { n: "Drop-in", label: "Pickup sessions" },
    ],
    features: [
      "Campus-adjacent — walkable from OSU",
      "Balanced-teams pickup format, live session times published",
    ],
    comingSoon: [],
    offerings: { youth: false, pickup: true },
    directions: [
      "I-71 → E 5th Ave exit, east on 5th",
      "Right (south) on St Clair Ave",
      "Left (east) on E Starr Ave — the long building on your left, between Gray St and Loew St",
    ],
    // Photo strip intentionally empty until Downtown photography exists —
    // reusing Worthington's stills here showed the wrong building. To fill:
    // drop files in public/media/aspire/ (e.g. downtown-field.jpg,
    // downtown-entrance.jpg) and list them here.
    photos: [],
    heroPoster: "/media/soccerone/worthington-hero-poster.jpg",
  },
};

export function getVenueFacts(slug: string): VenueFacts | null {
  return FACTS[slug] ?? null;
}
