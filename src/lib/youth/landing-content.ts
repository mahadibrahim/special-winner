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

export interface LeagueKind {
  /** e.g. "Winter · November – late March". Plain months, not term slugs. */
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
   *  ball sport, which is deliberate — see the sport-agnostic note above.
   *  Deliberately no location (owner-directed). The sports themselves render
   *  as the hero tiles (YOUTH_SPORT_PAGES), so the copy never enumerates
   *  them. */
  title: "More time on the ball.",
  subhead: `Pick your kid's sport — leagues, classes and camps for ${AGE_SPAN}, in small groups with real coaching.`,
};

/** Hub crawlable intro — the only prose block on the hub (tiles and
 *  accordions carry little indexable text). Customer-forward; NO location
 *  words on the hub (owner rule). */
export const INTRO =
  "Whatever sport your kid picks, they get the same three things here: a coach who explains while the game is happening, a small group where they're never waiting for a turn, and one pathway that runs from their first steps at 18 months to competitive play at nineteen — so they never have to start over.";

/**
 * Youth benefit trio. All three columns take the emerald accent because the
 * design system assigns emerald to youth — mixing accents here would borrow
 * adult's orange onto a youth surface.
 */
export const BENEFITS = [
  {
    accent: "border-t-emerald",
    title: "More touches",
    body: "Small groups and small-sided games, so nobody spends the session waiting for a turn.",
  },
  {
    accent: "border-t-emerald",
    title: "Coaching that explains",
    body: "Your kid's coach trains under our Director of Coaching — a nine-year MLS veteran — and explains the game while it is happening, not just at half time.",
  },
  {
    accent: "border-t-emerald",
    title: "Somewhere to keep going",
    body: "One path from eighteen months to nineteen years, so nobody has to start over.",
  },
];

export const LEAGUE_KINDS: LeagueKind[] = [
  {
    when: "Winter · November – late March",
    name: "Competitive",
    body:
      "Competitive indoor play for club teams who want to keep their season going through the cold months. Games on Saturdays and Sundays.",
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

export const CAMPS = {
  lede:
    "Day camps for when school is out, and specialty camps through the year — full days coached rather than supervised, with the same people they see every week.",
};

export interface PathwayStep {
  /** Locked name — see docs/superpowers/specs/2026-08-17-youth-pathway-naming-decision.md. */
  name: string;
  /** Age line, shown mono. Select carries its invited-track reading here. */
  ages: string;
  /** Short mono "hook" line — the one-sentence promise for this step, shown
   *  under the age line on the pathway cards (mockup `.hook`). The step
   *  detail bands render `ages` in this position instead (via FeatureBand's
   *  `hook` prop) — this field is not used there. */
  hook: string;
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
    ages: "18 months – 3 years old",
    hook: "Their first game, with you beside them.",
    blurb: "You're on the floor with them. Movement, balance, first contact with a ball.",
  },
  {
    name: "Aspire Minis",
    ages: "3 – 5 years old",
    hook: "First time solo — big step, small group.",
    blurb: "Their first time without you. Listening to a coach, taking turns, and a lot of touches.",
  },
  {
    name: "Aspire Juniors",
    ages: "5 – 8 years old",
    hook: "Where skills start to stick.",
    blurb: "First real skills. Control of the ball, and the start of wanting it.",
  },
  {
    name: "Aspire Academy",
    ages: "8 – 12 years old",
    hook: "Training gets real.",
    // Mockup-verbatim (dropped the old "Training gets serious." prefix — the
    // hook line above now carries that beat, so the blurb doesn't repeat it).
    blurb: "Decisions under pressure, not just technique.",
  },
  {
    name: "Aspire Select",
    ages: "8 – 19 · by invitation",
    hook: "An invitation, not an age band.",
    blurb:
      "Small invitation-only groups for players who are ready for more, under our most senior coaches.",
  },
];

export interface PathwayStepDetail {
  /** Matches `Aspire <Name>`.toLowerCase() with the "Aspire " prefix
   *  stripped — same slug rule as youth-sport-page.astro's `stepSlug`. Also
   *  the suffix of the step band's `id="step-<slug>"`. */
  slug: "micros" | "minis" | "juniors" | "academy" | "select";
  /** Label for the step band's CTA button — the four age steps say "Book
   *  <Name> →"; Select's invitation framing gets its own label. */
  ctaLabel: string;
  /** The long-form paragraph on the step detail band (mockup `#steps`
   *  section) — verbatim from the committed mockup. */
  body: string;
}

/**
 * Long-form copy for the five `#step-<slug>` detail bands on /youth/classes.
 * Kept separate from `PATHWAY` (the short pathway-card copy) because the two
 * sections need different lengths of prose for the same step.
 */
export const PATHWAY_DETAILS: PathwayStepDetail[] = [
  {
    slug: "micros",
    ctaLabel: "Book Micros →",
    body: "Your kid's first organized play, with you on the floor beside them. Sessions are built around movement, balance, and first touches on a ball — and just as much around learning to be in a group: waiting a turn, following a coach's voice, celebrating somebody else's goal.",
  },
  {
    slug: "minis",
    ctaLabel: "Book Minis →",
    body: "The first big step: training without you. Minis is where kids learn to listen to a coach, take turns, and get a lot of touches in a group small enough that nobody disappears. The session is play, and the learning hides inside it.",
  },
  {
    slug: "juniors",
    ctaLabel: "Book Juniors →",
    body: "Where skills start to stick. Juniors works on real control of the ball and the beginnings of wanting it — turning, protecting, taking players on. Coaches narrate the game as it happens, so the learning lands in the moment.",
  },
  {
    slug: "academy",
    ctaLabel: "Book Academy →",
    body: "Training gets real. Academy is decisions under pressure, not just technique — smaller spaces, faster play, and coaching that asks questions as often as it gives answers. Players leave knowing what they did well and what to work on next.",
  },
  {
    slug: "select",
    ctaLabel: "How invitations work →",
    body: "An invitation, not an age band. Select is a small group for players who are ready for more, under our most senior coaches — invitations come from your kid's coach, based on readiness, not a tryout day. The pathway is how they get there.",
  },
];

/**
 * ⚠️ The bio and quote are OWNER-PROVIDED (2026-08-18) and authoritative —
 * do not edit their claims without the owner. The credits row is from public
 * record and was verified. Clubs are named as biography only — the page must
 * never imply any club he has played or coached for endorses Aspire.
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
    "Saad Abdul-Salaam brings championship-level experience to Aspire as both a player and coach. A former Columbus Crew player and nine-year MLS veteran, Saad won an MLS Cup during his professional career before transitioning into youth development. Most recently, he coached the Columbus Crew Academy U18 team to the first national championship in Academy history. Saad is passionate about helping young players build confidence, master the fundamentals, and develop a genuine love for the game.",
  /** First-person, owner-commissioned (2026-08-18): his commitment to meet
   *  every player where they are — fun or competition — and grow them to
   *  their full potential. Rendered as a real quotation. */
  quote:
    "Every kid walks in at a different place — some are here for the fun, some for the competition. My commitment is the same either way: meet them where they are, and grow them to their full potential.",
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
