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
      name: "Soccer ONE Indoor Soccer — Downtown Columbus",
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
  alternateName: "Soccer One Indoor Soccer Worthington",
  url: "https://www.gosoccerone.com/worthington",
  sport: "Soccer",
  address: {
    "@type": "PostalAddress",
    streetAddress: "535 Lakeview Plaza Blvd",
    addressLocality: "Worthington",
    addressRegion: "OH",
    postalCode: "43085",
    addressCountry: "US",
  },
  openingHoursSpecification: HOURS,
  parentOrganization: { "@type": "Organization", name: "SoccerOne", url: "https://www.gosoccerone.com" },
};

export const DOWNTOWN_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SportsActivityLocation",
  name: "Soccer ONE Indoor Soccer",
  alternateName: "SoccerOne Downtown Columbus",
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
  openingHoursSpecification: HOURS,
  parentOrganization: { "@type": "Organization", name: "SoccerOne", url: "https://www.gosoccerone.com" },
};
