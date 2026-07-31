// Canonical PostalAddress + geo for the two physical venues, keyed by
// `locations.slug`. Single source for street-level NAP in JSON-LD — sourced
// from the live Google Business listings (see aspire-jsonld.ts header).
// Do not invent NAP data — pull it from GBP.
//
// The DB `locations` rows also carry addresses, but they are nullable and
// have drifted on staging; schema markup must never emit a half-empty
// address, so structured data resolves through this file first and falls
// back to DB fields only for venues not listed here.

export interface VenuePostalAddress {
  "@type": "PostalAddress";
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
}

export interface VenueGeo {
  "@type": "GeoCoordinates";
  latitude: number;
  longitude: number;
}

export const VENUE_ADDRESSES: Record<string, { address: VenuePostalAddress; geo: VenueGeo }> = {
  worthington: {
    address: {
      "@type": "PostalAddress",
      streetAddress: "535 Lakeview Plaza Blvd",
      addressLocality: "Worthington",
      addressRegion: "OH",
      postalCode: "43085",
      addressCountry: "US",
    },
    geo: { "@type": "GeoCoordinates", latitude: 40.1130348, longitude: -83.0021613 },
  },
  downtown: {
    address: {
      "@type": "PostalAddress",
      streetAddress: "980 E Starr Ave",
      addressLocality: "Columbus",
      addressRegion: "OH",
      postalCode: "43201",
      addressCountry: "US",
    },
    geo: { "@type": "GeoCoordinates", latitude: 39.9827248, longitude: -82.9781289 },
  },
};

export function venueAddress(locationSlug: string | null | undefined) {
  return locationSlug ? (VENUE_ADDRESSES[locationSlug] ?? null) : null;
}
