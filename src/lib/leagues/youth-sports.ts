// Registry of youth league sports — the sports that have a live page under
// /youth/leagues/[sport].
//
// The dynamic routes validate their [sport] param against this map, so a
// garbage slug (/youth/leagues/asdf) degrades to the sport picker instead of
// rendering an empty page under invented branding. That makes this registry
// the single switch for launching a sport's league surface: add an entry here
// and a tile on /youth/leagues, and the landing, term and division pages all
// exist.
//
// Deliberately NOT derived from the sports table: a sport existing in the DB
// (or having a stray season row) should not auto-publish a marketing surface
// for it. Publishing a sport is an editorial act.

export interface YouthLeagueSport {
  /** Matches `sports.slug` — scopes every catalog read on the sport's pages. */
  slug: string;
  /** Display name, e.g. "Soccer". Also the divisionNaming fallback. */
  name: string;
  /** The WHOLE h1 on the landing page — a complete sentence, rendered verbatim
   *  (2026-08-18 two-path recompose; there is no longer an "at Aspire" suffix
   *  appended by the template). */
  heroTitle: string;
  /** Meta description for the landing page. */
  metaDescription: string;
}

export const YOUTH_LEAGUE_SPORTS: Record<string, YouthLeagueSport> = {
  soccer: {
    slug: "soccer",
    name: "Soccer",
    heroTitle: "Indoor youth soccer leagues.",
    metaDescription:
      "Youth soccer leagues in Columbus and central Ohio, U6 through U19. Find your kid's age group for the 2026–27 season and register.",
  },
  // No claims about how futsal differs from soccer (court, ball, roster) —
  // per-season facts we don't model, and the standing rule is no format claims.
  futsal: {
    slug: "futsal",
    name: "Futsal",
    heroTitle: "Indoor youth futsal leagues.",
    metaDescription:
      "Youth futsal leagues in Columbus and central Ohio. Find your kid's age group for the 2026–27 season and register.",
  },
};

export function getYouthLeagueSport(
  slug: string | undefined,
): YouthLeagueSport | null {
  if (!slug) return null;
  return YOUTH_LEAGUE_SPORTS[slug] ?? null;
}
