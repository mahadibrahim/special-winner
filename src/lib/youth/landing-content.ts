// Authored copy for the /youth landing page.
//
// The page deliberately carries NO live inventory — no division counts, no
// start dates, no "18 open". It is a menu: each section says what a thing is
// and links to the page that holds the detail and the register button. That
// was an explicit owner decision, so resist the urge to wire a finder in here.
//
// Copy rules this file follows, all owner-directed:
//   - No oppositional language. We never say what other clubs do or don't do.
//     Sell the programme and the philosophy; the competition doesn't appear.
//   - No eyebrow/kicker text above headings.
//   - The facility is not a selling point. Indoor appears only as a practical
//     detail, never as a claim.
//   - Pricing is indicative, never exact. Exact figures live on the programme
//     pages next to what's actually open.
//
// SPORT-AGNOSTIC ON PURPOSE. Soccer and futsal are what run today, but this is
// the youth hub for every sport Aspire will run. Nothing here may assume one
// sport — no "weak foot", no "on the pitch". Sport-specific copy belongs one
// level down, on /youth/leagues/<sport> and friends. Adding basketball should
// mean adding a line to SPORTS, not rewriting this page.

export interface WayIn {
  label: string;
  href: string;
  /** One line under the name in the hero. Keep to two short clauses. */
  meta: string;
  /** CategoryCard aurora palette. Three doors need three palettes so no
   *  colour repeats — see category-card.astro. */
  palette: "youth-a" | "youth-b" | "youth-c";
  /** Analytics id passed to CategoryCard. */
  cta: string;
  statusLabel: string;
  ctaLabel: string;
}

export interface LeagueKind {
  /** e.g. "December – April". Plain months, not term slugs. */
  when: string;
  name: string;
  body: string;
  /** Two-or-three short label/value pairs. Nothing that goes stale weekly. */
  facts: { label: string; value: string }[];
}

/**
 * The age span shown in the hero.
 *
 * ⚠️ This must match what is actually bookable. The 18-month end is the
 * owner's stated plan (Aspire Micros); if no Micros class is open when this
 * ships, narrow this string rather than advertising a product that does not
 * exist yet.
 */
export const AGE_SPAN = "18 months to 19 years";

/**
 * Sports currently running. Adding one here is the whole change — the page
 * reads this list rather than naming a sport in prose anywhere.
 * Keep it to what is genuinely bookable; "coming soon" belongs on the
 * programme pages, not the hub.
 */
export const SPORTS = ["Soccer", "Futsal"];

export const HERO = {
  /** Philosophy as the headline: touches over standing around. Works for any
   *  ball sport, which is deliberate — see the sport-agnostic note above. */
  title: "More time on the ball.",
  subhead: `Leagues, classes and camps in Worthington, for ${AGE_SPAN}. Small groups, real coaching, and a lot of touches.`,
};

export const WAYS_IN: WayIn[] = [
  {
    label: "Leagues", href: "/youth/leagues", palette: "youth-a", cta: "youth-hub-leagues",
    meta: "Games at the weekend, by age group",
    statusLabel: "Now enrolling", ctaLabel: "See the leagues",
  },
  {
    label: "Classes", href: "/youth/classes", palette: "youth-b", cta: "youth-hub-classes",
    meta: "Weeknight training, five steps",
    statusLabel: "Now enrolling", ctaLabel: "See the pathway",
  },
  {
    label: "Camps", href: "/youth/camps", palette: "youth-c", cta: "youth-hub-camps",
    meta: "School breaks and summer",
    statusLabel: "Booking soon", ctaLabel: "See camp dates",
  },
];

/**
 * Youth benefit trio. All three columns take the emerald accent because the
 * design system assigns emerald to youth — mixing accents here would borrow
 * adult's orange onto a youth surface.
 */
export const BENEFITS = [
  {
    accent: "border-t-emerald-600",
    title: "More touches",
    body: "Small groups and small-sided games, so nobody spends the session waiting for a turn.",
  },
  {
    accent: "border-t-emerald-600",
    title: "Coaching that explains",
    body: "Coaches talk players through the game while it is happening, not only at half time.",
  },
  {
    accent: "border-t-emerald-600",
    title: "Somewhere to keep going",
    body: "One path from eighteen months to nineteen years, so nobody has to start over.",
  },
];

export const LEAGUE_KINDS: LeagueKind[] = [
  {
    when: "December – April",
    name: "Winter",
    body:
      "Indoor competitive play for club teams who want to keep their season going through the cold months. Games on Saturdays and Sundays.",
    facts: [
      { label: "For", value: "Established teams" },
      { label: "Play", value: "Sat & Sun" },
    ],
  },
  {
    when: "Spring, summer & fall",
    name: "Developmental",
    body:
      "Built for touches and guidance. Coaches talk players through the game while it is happening, and what they took from it matters more than the scoreline.",
    facts: [
      { label: "For", value: "Individual players" },
      { label: "Teams", value: "We build them" },
    ],
  },
];

export const CLASSES = {
  lede:
    "Training on a weeknight, in small groups, with a path that runs from a toddler on the floor beside you to a high-schooler sharpening the part of their game they know needs work.",
  points: [
    "Starts at 18 months, with a grown-up on the floor",
    "Five steps — Micros, Minis, Juniors, Academy, and Select by invitation",
    "Move up when they are ready, on their coach's word",
  ],
};

export const CAMPS = {
  lede:
    "Somewhere for them to be when there is no school and you still have work. Full days indoors, coached rather than supervised, with the same people they see the rest of the year.",
};

export interface PathwayStep {
  /** Locked name — see docs/superpowers/specs/2026-08-17-youth-pathway-naming-decision.md. */
  name: string;
  /** Age line, shown mono. Select carries its invited-track reading here. */
  ages: string;
  blurb: string;
}

/**
 * The training pathway (classes + camps). Names are OWNER-LOCKED; do not
 * rename without the naming decision doc changing first. Deliberately no
 * session lengths, roster sizes or other format claims in the blurbs.
 *
 * Select is an invited track spanning the older ages, not a fifth age band —
 * four rungs describe an age, Select describes an invitation, and rendering
 * it as an age band would tell a parent whose kid isn't picked that nothing
 * exists for their age.
 */
export const PATHWAY: PathwayStep[] = [
  {
    name: "Aspire Micros",
    ages: "18 months – 3",
    blurb: "You're on the floor with them. Movement, balance, first contact with a ball.",
  },
  {
    name: "Aspire Minis",
    ages: "3 – 5",
    blurb: "Their first time without you. Listening to a coach, taking turns, and a lot of touches.",
  },
  {
    name: "Aspire Juniors",
    ages: "5 – 8",
    blurb: "First real skills. Control of the ball, and the start of wanting it.",
  },
  {
    name: "Aspire Academy",
    ages: "8 – 12",
    blurb: "Training gets serious. Decisions under pressure, not just technique.",
  },
  {
    name: "Aspire Select",
    ages: "8 – 19 · by invitation",
    blurb: "Small groups our Director of Coaching takes himself.",
  },
];

/**
 * ⚠️ Career facts below are from public record and were verified. His title
 * here is owner-provided. The page must not imply that any club he has played
 * or coached for endorses Aspire — state his history as biography only.
 *
 * Structured as a single lead because there is one today. When a second sport
 * brings its own lead, this becomes an array and the section renders one card
 * per sport — the page markup already loops rather than hard-coding a name.
 */
export const COACH = {
  name: "Saad Abdul-Salaam",
  role: "Director of Coaching",
  /** Which sport this lead is responsible for. Shown only once SPORTS > 1. */
  sport: "Soccer",
  bio:
    "Saad grew up in Gahanna, played at Akron, went twelfth overall in the MLS SuperDraft and spent seven seasons as a professional. He moved into coaching and took a U18 side to the MLS Next Cup national championship.",
  method:
    "He writes what every group is taught, from eighteen months upward, and trains the coaches who deliver it — so a session means the same thing whichever night you come.",
  credits: [
    { value: "112", label: "MLS matches" },
    { value: "#12", label: "2015 SuperDraft" },
    { value: "Def. POY", label: "Sporting Kansas City" },
    { value: "Champion", label: "MLS Next Cup, U18" },
  ],
};

export interface Testimonial {
  quote: string;
  /** First name only, plus the kid's group — never a full name. */
  attribution: string;
}

/**
 * Empty until there are real ones. The section does not render while this is
 * empty — see youth.astro. Do not seed it with invented quotes.
 */
export const TESTIMONIALS: Testimonial[] = [];

export const PRICING = {
  heading: "What it costs",
  body:
    "A season of league play runs a little over $100 per player, and a block of classes is slightly less. Camps are priced by the day. Exact pricing sits on each programme's page, next to what is open.",
};
