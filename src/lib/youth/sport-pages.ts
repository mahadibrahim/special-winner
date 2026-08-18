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

import { PRICING } from "@/lib/youth/landing-content";

/** Shape-compatible with LandingFaqItem (landing-faq.tsx) — typed locally so
 *  lib code doesn't import component types. */
export interface SportFaq {
  question: string;
  answer: string;
  linkHref?: string;
  linkLabel?: string;
}

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
  /** Editorial intro paragraphs under the hero — customer-forward voice,
   *  location words allowed here (sport pages only). */
  intro: string[];
  /** Sport-specific FAQs. True answers only. */
  faqs: SportFaq[];
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
    intro: [
      "Your kid wants to play soccer — or you want them to try it. Either way, there's a place for them here: leagues by age group from U6 to U19, weeknight classes that start at 18 months with you on the floor beside them, and camps that cover school breaks. It's all indoors in central Ohio, so the season your kid falls in love with the game doesn't end in November.",
      "Every coach they'll have trains under our Director of Coaching, so Tuesday's session means the same thing as Thursday's. Start with what's open above, or find their age group and go from there.",
    ],
    faqs: [
      {
        question: "What age can my kid start?",
        answer:
          "At 18 months, in Aspire Micros — you're on the floor with them. From age 3 they train without you, and leagues start at U6.",
      },
      {
        question: "Is it indoors in the winter?",
        answer:
          "Yes. Everything runs indoors, so winter is a real season for your kid, not a pause.",
      },
      {
        question: "Does my kid need experience — or a team?",
        answer:
          "No. Developmental leagues take individual players — we build the teams — and classes meet your kid where they are, from their first touch.",
      },
      {
        // PRICING.body verbatim so the figures can never drift (spec §3).
        question: "What does it cost?",
        answer: PRICING.body,
      },
    ],
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
    intro: [
      "If your kid already plays soccer, futsal is more of what they love — the same game's skills, coached by the same staff on the same curriculum. If they're new, it's a friendly way in: small groups, and coaches who explain while the game is happening.",
      "Leagues run by age group, indoors in central Ohio. Find your kid's group and see what's open for the 2026–27 season.",
    ],
    faqs: [
      {
        question: "Is futsal right for a kid who plays soccer?",
        answer:
          "Yes — the same staff coach both, on the same curriculum, and many soccer families add futsal to keep their kid playing between seasons.",
      },
      {
        question: "What age groups do you run?",
        answer:
          "Leagues run by age group. The futsal age-group page shows what's open for the 2026–27 season.",
        linkHref: "/youth/leagues/futsal",
        linkLabel: "See futsal age groups",
      },
      {
        question: "Does my kid need a team?",
        answer:
          "No. Developmental leagues take individual players — we build the teams around them.",
      },
      {
        // PRICING.body verbatim so the figures can never drift (spec §3).
        question: "What does it cost?",
        answer: PRICING.body,
      },
    ],
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
