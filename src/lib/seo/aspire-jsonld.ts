// JSON-LD Organization schema for the Aspire brand. Extracted from about.astro
// so the homepage and the about page share one source. `logo` uses the brand
// share card (the only committed brand image); swap to a dedicated square logo
// asset when one exists. Postal addresses intentionally omit streetAddress /
// geo until partner facility agreements are finalized — do not fabricate them.
//
// Policy: NO AggregateRating/Review markup.
export const ASPIRE_ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SportsOrganization",
  name: "Aspire Sports",
  url: "https://aspiresportsohio.com",
  logo: "https://aspiresportsohio.com/og/aspire-share.jpg",
  foundingDate: "2023",
  founder: {
    "@type": "Person",
    name: "Bashir Awl",
    jobTitle: "Founder",
  },
  areaServed: {
    "@type": "City",
    name: "Columbus",
    containedInPlace: {
      "@type": "State",
      name: "Ohio",
    },
  },
  sport: ["Soccer"],
  location: [
    {
      "@type": "Place",
      name: "Aspire Sports — Worthington",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Worthington",
        addressRegion: "OH",
        addressCountry: "US",
      },
    },
    {
      "@type": "Place",
      name: "Aspire Sports — Downtown / OSU",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Columbus",
        addressRegion: "OH",
        addressCountry: "US",
      },
    },
  ],
};
