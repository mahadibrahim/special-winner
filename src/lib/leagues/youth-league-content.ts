// Shared authored content for the youth sport landing pages.
//
// These answers are about the AGE-GROUP SYSTEM and Aspire's policies, not
// about any one sport, so soccer and futsal share them verbatim rather than
// drifting into two near-identical copies. A sport that genuinely needs
// different answers passes its own `faqs`.
import type { LandingFaqItem } from "@/components/landing/landing-faq";
import type { CalendarTermConfig } from "@/components/landing/season-calendar-band";

export const YOUTH_LEAGUE_FAQS: LandingFaqItem[] = [
  {
    question: "The age groups changed this year — where does my kid land now?",
    answer:
      "For the 2026–27 season, groups run August 1 to July 31 instead of by calendar year, matching the change US Youth Soccer, US Club Soccer and AYSO all made together. Kids born August through December generally moved down a group; kids born January through July generally moved up. Use the birthday lookup above and it will tell you exactly.",
  },
  {
    question: "What ages can play?",
    answer:
      "Every group from U6 through U19. We run games at every age group — the ladder above lists all fourteen with the birth dates that belong to each.",
  },
  {
    question: "What if my kid doesn't know anyone on the team?",
    answer:
      "Most kids arrive not knowing anyone. Registration is per player — we build the teams and introduce coaches before week 1, so nobody has to bring a group of friends to sign up.",
  },
  {
    question: "Can siblings play at the same time?",
    answer:
      "Siblings usually land in different age groups, and we schedule sibling divisions close together wherever the schedule allows. Tell us at registration and we'll do our best.",
  },
  {
    question: "When are games?",
    answer:
      "Games are on weekends. Your exact slot comes with the schedule before week 1.",
  },
  {
    question: "What's the refund policy?",
    answer:
      "Cancel 14 or more days before the season starts for a full refund. Inside 14 days, we review case by case — the default is a prorated credit toward a future season.",
    linkHref: "/refund-policy",
    linkLabel: "Read the full refund policy",
  },
];

/** Authored future-term cells. Live terms from the catalog replace any cell
 *  they match; months are estimates until upcoming seasons exist in the DB. */
export const YOUTH_CALENDAR_TERMS: CalendarTermConfig[] = [
  { name: "Winter I", months: "Dec–Feb", match: "winter-i" },
  { name: "Winter II", months: "Feb–Apr", match: "winter-ii" },
  { name: "Spring", months: "Apr–Jun", match: "spring" },
  { name: "Fall", months: "Sep–Nov", match: "fall" },
];

/** Display names for the venue cards. VenueFacts carries facts but no name —
 *  the name lives on the DB location row. These are the same strings used on
 *  every other customer-facing page that names these venues. */
export const VENUE_DISPLAY_NAMES: Record<string, string> = {
  worthington: "Worthington",
  downtown: "Downtown / OSU",
};
