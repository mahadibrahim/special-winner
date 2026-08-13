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

const ASPIRE_ORIGIN = "https://aspiresportsohio.com";

/** Stable @id so WebSite.publisher and the org node resolve to one entity. */
const ORG_ID = `${ASPIRE_ORIGIN}/#organization`;

/**
 * Public social profiles, emitted as `sameAs`. Google uses these to tie the
 * site to the brand entity (the Knowledge Panel / brand box in results).
 *
 * DELIBERATELY EMPTY: src/lib/branding/join-config.ts still ships
 * REPLACE_ME placeholders for every handle, and a sameAs pointing at a
 * non-existent profile is worse than none — it breaks entity resolution.
 * Add the real profile URLs here (Instagram, Facebook, YouTube, TikTok, the
 * Google Business listing) once the accounts are confirmed; `sameAs` is
 * omitted from the emitted JSON-LD entirely while this is empty.
 */
export const ASPIRE_SAME_AS: string[] = [];

export const ASPIRE_ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SportsOrganization",
  "@id": ORG_ID,
  name: "Aspire Sports",
  // GBP lists the business as "Aspire Sports Ohio"; matching the alternate
  // name helps Google reconcile the site with the Business Profile.
  alternateName: "Aspire Sports Ohio",
  description:
    "Aspire Sports runs adult and youth sports leagues, pickup, camps and clinics in Columbus, Ohio — indoor 7v7 soccer and 4v4 flag football at venues in Worthington and Downtown / OSU.",
  url: ASPIRE_ORIGIN,
  logo: "https://aspiresportsohio.com/og/aspire-share.jpg",
  ...(ASPIRE_SAME_AS.length > 0 ? { sameAs: ASPIRE_SAME_AS } : {}),
  // Top-level NAP mirrors the Worthington venue, which is the registered
  // business address on GBP. Nested location[] entries stay as-is.
  address: VENUE_ADDRESSES.worthington.address,
  telephone: "+1-614-749-9782",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer service",
    telephone: "+1-614-749-9782",
    areaServed: "US",
    availableLanguage: ["English"],
  },
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
  // Both sports Aspire actually runs — the flag football league has its own
  // landing pages and divisions, so listing Soccer alone understated the org.
  sport: ["Soccer", "Flag Football"],
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

/**
 * WebSite node. This is what lets Google show "Aspire Sports" as the site
 * name above a result instead of the bare aspiresportsohio.com domain — the
 * site name is read from WebSite.name on the homepage. `publisher` points at
 * the org @id so both nodes describe one entity rather than two.
 *
 * No SearchAction/sitelinks-searchbox: Google retired that rich result in
 * 2024, so emitting it would be dead weight.
 */
export const ASPIRE_WEBSITE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${ASPIRE_ORIGIN}/#website`,
  name: "Aspire Sports",
  alternateName: "Aspire Sports Ohio",
  url: ASPIRE_ORIGIN,
  publisher: { "@id": ORG_ID },
};
