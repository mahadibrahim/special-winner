// JSON-LD Organization schema for the Aspire brand. Extracted from about.astro
// so the homepage and the about page share one source. `logo` uses the brand
// share card (the only committed brand image); swap to a dedicated square logo
// asset when one exists.
//
// Street addresses, geo, and the Worthington telephone are sourced from the
// live Google Business listings ("Aspire Sports Ohio" at 535 Lakeview Plaza
// Blvd; the Downtown venue shares the 980 E Starr Ave building with SoccerOne
// Downtown). No separate Aspire phone exists for the Downtown venue, so it is
// omitted rather than fabricated. Do not invent NAP data — pull it from GBP.
//
// Policy: NO AggregateRating/Review markup.
import { VENUE_ADDRESSES } from "./venue-address";

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
      telephone: "+1-614-749-9782",
      address: VENUE_ADDRESSES.worthington.address,
      geo: VENUE_ADDRESSES.worthington.geo,
    },
    {
      "@type": "Place",
      name: "Aspire Sports — Downtown / OSU",
      address: VENUE_ADDRESSES.downtown.address,
      geo: VENUE_ADDRESSES.downtown.geo,
    },
  ],
};
