// JSON-LD structured data for SoccerOne pages. Facts sourced from the
// venue content doc (aspire-sports-ops/marketing/data/soccerone-venue.md)
// and the live Google Business listing. `alternateName` carries the
// two-word spelling ("Soccer One") that searchers actually type and that
// every aggregator uses — the brand renders it one-word everywhere else.
//
// Policy: NO AggregateRating/Review markup. Google's guidelines prohibit
// marking up third-party (Google) reviews as your own; we have no
// first-party review corpus yet.

const HOURS = [
  {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    opens: "16:00",
    closes: "23:59",
  },
];

export const SOCCERONE_ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SportsActivityLocation",
  name: "SoccerOne",
  alternateName: "Soccer One Indoor Soccer",
  url: "https://www.gosoccerone.com",
  sport: "Soccer",
  description:
    "Columbus's newest indoor soccer chain — adult leagues, youth weekend leagues, pickup, futsal, and field rentals across Worthington and Downtown Columbus.",
  location: [
    {
      "@type": "Place",
      name: "SoccerOne Worthington",
      address: {
        "@type": "PostalAddress",
        streetAddress: "535 Lakeview Plaza Blvd",
        addressLocality: "Worthington",
        addressRegion: "OH",
        postalCode: "43085",
        addressCountry: "US",
      },
    },
    {
      "@type": "Place",
      name: "SoccerOne Downtown",
      address: {
        "@type": "PostalAddress",
        streetAddress: "980 E Starr Ave",
        addressLocality: "Columbus",
        addressRegion: "OH",
        postalCode: "43201",
        addressCountry: "US",
      },
    },
  ],
};

export const WORTHINGTON_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SportsActivityLocation",
  name: "SoccerOne Worthington",
  // alternateName carries the spellings searchers type AND the exact name on
  // the Google Business listing, so Google reconciles this entity with the GBP.
  alternateName: ["Soccer One Indoor Soccer Worthington", "Soccer ONE Worthington"],
  url: "https://www.gosoccerone.com/worthington",
  sport: "Soccer",
  telephone: "+1-614-805-5821",
  address: {
    "@type": "PostalAddress",
    streetAddress: "535 Lakeview Plaza Blvd",
    addressLocality: "Worthington",
    addressRegion: "OH",
    postalCode: "43085",
    addressCountry: "US",
  },
  geo: { "@type": "GeoCoordinates", latitude: 40.1130348, longitude: -83.0021613 },
  // hasMap = the map link; sameAs = entity reconciliation with the GBP listing.
  hasMap: "https://maps.google.com/?cid=380177723020037394",
  sameAs: ["https://maps.google.com/?cid=380177723020037394"],
  openingHoursSpecification: HOURS,
  parentOrganization: { "@type": "Organization", name: "SoccerOne", url: "https://www.gosoccerone.com" },
};

export const DOWNTOWN_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SportsActivityLocation",
  name: "SoccerOne Downtown",
  // Exact GBP name ("Soccer ONE Indoor Soccer") kept as an alternateName so
  // Google reconciles this entity with the Downtown Google Business listing.
  alternateName: ["Soccer ONE Indoor Soccer", "SoccerOne Downtown Columbus"],
  url: "https://www.gosoccerone.com/downtown",
  sport: "Soccer",
  telephone: "+1-614-695-1857",
  address: {
    "@type": "PostalAddress",
    streetAddress: "980 E Starr Ave",
    addressLocality: "Columbus",
    addressRegion: "OH",
    postalCode: "43201",
    addressCountry: "US",
  },
  geo: { "@type": "GeoCoordinates", latitude: 39.9827248, longitude: -82.9781289 },
  hasMap: "https://maps.google.com/?cid=12977032128879473055",
  sameAs: ["https://maps.google.com/?cid=12977032128879473055"],
  openingHoursSpecification: HOURS,
  parentOrganization: { "@type": "Organization", name: "SoccerOne", url: "https://www.gosoccerone.com" },
};
