// Suburb landing pages — the "adult soccer league <suburb> ohio" cluster.
// Deliberately small (guardrail: suburbs players actually drive from, not a
// phone book) and honest: pages say "near <suburb>", never claim a venue is
// in the suburb, and route lines name real roads with no drive-time claims.
//
// Selection note (2026-08-01): the app stores no registrant postal codes, so
// this list is proximity-based around the two venues. Owner: adjust the list
// and verify the route lines — same review bar as venue-facts.ts directions
// (Worthington's I-270 exit 23 comes from that file).
export interface SuburbPage {
  /** URL segment: /adult-soccer-leagues-<slug> */
  slug: string;
  name: string;
  /** locations.slug of the closest venue — its divisions lead the page. */
  primaryVenue: string;
  /** Optional second venue worth naming (e.g. Clintonville sits between both). */
  secondaryVenue?: string;
  /** One honest sentence about getting there: real roads, no minute claims. */
  routeLine: string;
}

export const SUBURB_PAGES: SuburbPage[] = [
  {
    slug: "dublin",
    name: "Dublin",
    primaryVenue: "worthington",
    routeLine:
      "Straight across the I-270 North loop from Dublin — take exit 23 (US-23/Worthington) and the venue sits just off the exit in Lakeview Plaza.",
  },
  {
    slug: "westerville",
    name: "Westerville",
    primaryVenue: "worthington",
    routeLine:
      "A short run west on I-270 from Westerville to exit 23 (US-23/Worthington), just off the exit in Lakeview Plaza.",
  },
  {
    slug: "powell",
    name: "Powell",
    primaryVenue: "worthington",
    routeLine:
      "Straight south on US-23 from Powell Road into Worthington — no highway needed.",
  },
  {
    slug: "hilliard",
    name: "Hilliard",
    primaryVenue: "worthington",
    routeLine:
      "I-270 North around the loop from Hilliard to exit 23 (US-23/Worthington).",
  },
  {
    slug: "gahanna",
    name: "Gahanna",
    primaryVenue: "worthington",
    routeLine:
      "I-270 North from Gahanna around to exit 23 (US-23/Worthington).",
  },
  {
    slug: "clintonville",
    name: "Clintonville",
    primaryVenue: "worthington",
    secondaryVenue: "downtown",
    routeLine:
      "Clintonville sits between both venues — up High Street or OH-315 to Worthington, or south to the Downtown venue at 980 E Starr Ave in Milo-Grogan.",
  },
];

export function suburbBySlug(slug: string | undefined): SuburbPage | null {
  return SUBURB_PAGES.find((s) => s.slug === slug) ?? null;
}
