// Registry of youth SPORT landing pages — the sports with a live page at
// /youth/[sport] (soccer, futsal, …). The youth funnel is sport-first: a
// parent picks the sport on /youth, and the sport page holds that sport's
// leagues, classes, camps and coaching story.
//
// Same editorial-act rule as YOUTH_LEAGUE_SPORTS (src/lib/leagues/
// youth-sports.ts): deliberately not derived from the sports table — a DB row
// must not auto-publish a marketing surface. Launching a sport here means
// adding an entry; the hub tile and the landing page both come from it.
//
// Copy rules (owner-directed, unchanged): no format claims, no location in
// hub-level copy, no oppositional language.

export interface YouthSportPage {
  /** Matches `sports.slug` — scopes catalog reads and the league-page link. */
  slug: string;
  /** Display name, e.g. "Soccer". */
  name: string;
  /** Hub tile status, mono uppercase. Authored, keep honest. */
  statusLabel: string;
  /** Hub tile meta line under the name. */
  tileMeta: string;
  /** Sport-page hero headline — short declarative, terminal period. */
  heroTitle: string;
  heroSubhead: string;
  metaDescription: string;
  /** Render the Director of Coaching section on this sport's page. He is
   *  soccer's DoC; futsal is soccer's sibling sport run by the same staff. */
  hasCoach: boolean;
}

export const YOUTH_SPORT_PAGES: Record<string, YouthSportPage> = {
  soccer: {
    slug: "soccer",
    name: "Soccer",
    statusLabel: "Now enrolling",
    tileMeta: "Leagues, classes & camps",
    heroTitle: "Youth soccer.",
    heroSubhead:
      "Leagues by age group, weeknight classes from 18 months up, and camps on school breaks — one programme, U6 to U19.",
    metaDescription:
      "Youth soccer in Columbus and central Ohio — leagues U6–U19, weeknight classes from 18 months, and school-break camps. See what's open and register.",
    hasCoach: true,
  },
  futsal: {
    slug: "futsal",
    name: "Futsal",
    statusLabel: "Now enrolling",
    tileMeta: "Leagues by age group",
    heroTitle: "Youth futsal.",
    heroSubhead:
      "Indoor futsal by age group — soccer's fast small-sided sibling, coached by the same staff on the same curriculum.",
    metaDescription:
      "Youth futsal leagues in Columbus and central Ohio, by age group. See what's open for the 2026–27 season and register.",
    hasCoach: true,
  },
};

export function getYouthSportPage(
  slug: string | undefined,
): YouthSportPage | null {
  if (!slug) return null;
  return YOUTH_SPORT_PAGES[slug] ?? null;
}
