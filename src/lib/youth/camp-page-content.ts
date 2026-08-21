// src/lib/youth/camp-page-content.ts
// Youth camps content registry — the ONE owner-tuning surface for the camps
// hub (/youth/camps) and the camp-type detail pages (/youth/camps/[type]).
//
// Owner contract (2026-08-19 design session): ages, hours, schedule times,
// lunch/bring facts are PLACEHOLDER values the owner tunes here. They render
// as normal copy — the constant is the tuning surface, not the page.
//
// Seeding contract: a camp season belongs to a family iff its program's slug
// is listed in that family's `programSlugs`. Admin-created camp programs
// MUST use these slugs (there is no camp-family column in the schema — the
// program is the family).

export type CampTypeSlug = "schools-out" | "summer" | "skills" | "specialty"

export interface CampFact {
  label: string
  value: string
}

export interface CampScheduleRow {
  time: string
  what: string
  why: string
}

export interface CampWhoCard {
  label: string
  title: string
  body: string
}

export interface CampFaqItem {
  question: string
  answer: string
}

export interface CampNamedCamp {
  name: string
  hook: string
  blurb: string
}

export interface CampType {
  slug: CampTypeSlug
  name: string
  /** <title> for the family page — Title-Case with the head terms ("Youth",
   *  "Soccer") the display name deliberately drops (issue #575). */
  seoTitle: string
  /** Band/hero tone — maps to token backgrounds on the pages. */
  tone: "royal" | "emerald" | "red" | "navy"
  /** When it runs — hero-tile kicker and band kicker (real info, not an eyebrow). */
  kicker: string
  /** Hero tile meta line (mono). */
  tileMeta: string
  /** Ages line, shown below the band/hero title. Placeholder — owner tunes. */
  agesLine: string
  /** Hub band body paragraph. */
  body: string
  /** Hub band teaser row (one-liner under a mono label). null hides the row. */
  teaser: { label: string; text: string } | null
  /** Planned windows (mono line on the band and the detail hero). */
  windows: string
  /** Detail-page hero sub. */
  heroSub: string
  /** Detail-page schedule section heading + lede. */
  scheduleHeading: string
  scheduleLede: string
  /** Timetable rows. Empty for specialty, which renders namedCamps instead. */
  schedule: CampScheduleRow[]
  /** Specialty only: the named camps. Empty for the other families. */
  namedCamps: CampNamedCamp[]
  whoCards: CampWhoCard[]
  faqs: CampFaqItem[]
  /** Catalog mapping — see the seeding contract in the file comment. */
  programSlugs: string[]
  /** Detail-page close band. */
  closeHeading: string
  closeSub: string
}

/** Shared camp-day logistics. Placeholder values — owner tunes. */
export const CAMP_DAY_FACTS: CampFact[] = [
  { label: "Hours", value: "9:00am – 3:00pm" },
  { label: "Drop-off", value: "From 8:45am" },
  { label: "Pick-up", value: "By 3:15pm" },
  { label: "Lunch", value: "Pack it — two snack breaks" },
  { label: "Bring", value: "Water bottle, shin guards, indoor shoes" },
  { label: "Where", value: "Worthington Fieldhouse" },
]

export const CAMP_DAY_FACTS_NOTE =
  "Every camp's card shows its own dates, ages and venue — the facts above are the standard day, and any camp that differs says so on its card."

/** Empty-state body for the camps booking finders — the shared default says
 *  "blocks and seasons", which is classes/leagues vocabulary (issue #574). */
export const CAMP_FINDER_EMPTY_BODY =
  "New camps open through the year — leave your email and you'll hear the moment the next one does."

/** Top-banner copy (owner-editable). Static until camps are seeded; revisit
 *  to the leagues-style live deadline line once inventory exists. */
export const CAMP_BANNER = {
  message: "Winter break camp dates announce soon · dates go fast when they drop",
  cta: "Get notified →",
}

/** The authored calendar band — planned windows, each with a notify chip. */
export const CAMP_CALENDAR = [
  { name: "Winter break", meta: "Late Dec · school's-out camp" },
  { name: "Spring break", meta: "Late Mar · school's-out camp" },
  { name: "Summer", meta: "Jun – Aug · weekly day camp" },
  { name: "Skills & specialty", meta: "Announced through the year" },
]

export const CAMP_HUB_FAQS: CampFaqItem[] = [
  {
    question: "What ages can come to camp?",
    answer:
      "Most camps run for 5 – 12 year olds, grouped by age on the day — and every camp's card shows its own age range before you book.",
  },
  {
    question: "What does a camp day actually look like?",
    answer:
      "Drop-off from 8:45, a coached morning session, lunch from their bag, an afternoon session, and a small-sided tournament to finish — each camp's page walks the day hour by hour.",
  },
  {
    question: "Do I pack a lunch?",
    answer: "Yes — pack a lunch and two snacks. We break twice for snacks and water.",
  },
  {
    question: "What should my kid bring?",
    answer: "A water bottle, shin guards and indoor shoes. Everything else is on us.",
  },
  {
    question: "Are camps soccer-only?",
    answer:
      "Skills and specialty camps are soccer camps. Day camps mix real soccer training with the wider games and free play a full camp day needs.",
  },
  {
    question: "Does my kid need to have played before?",
    answer:
      "No — groups are matched by age and level on the day, so first-timers and club kids both get a day that fits.",
  },
  {
    question: "How do specialty camps get announced?",
    answer:
      "As they're scheduled through the year. Leave your email in the notify form by the calendar and you'll hear the moment one opens.",
  },
  {
    question: "What's the refund policy?",
    answer:
      "Full refund 14 or more days before the camp starts; case-by-case inside 14 days.",
  },
]

export const CAMP_TYPES: CampType[] = [
  {
    slug: "schools-out",
    name: "School's-out day camps",
    seoTitle:
      "School's-Out Youth Day Camps in Columbus & Worthington, Ohio — Aspire Sports",
    tone: "royal",
    kicker: "Winter break · spring break · school closure days",
    tileMeta: "Winter break · spring break · closure days",
    agesLine: "5 – 12 years old",
    body: "School's closed and work isn't. Drop off in the morning, pick up in the afternoon, and the hours in between are a real coached day — small groups, games that teach something, and the same curriculum that runs the rest of the year. Not a gym with a sitter.",
    teaser: {
      label: "The day, roughly",
      text: "Arrival games while everyone lands → a coached session → lunch and downtime → small-sided tournament all afternoon → pick-up. Phones stay in bags; nobody sits out.",
    },
    windows:
      "● Winter break · late December ● Spring break · late March ● District closure days as they land",
    heroSub:
      "School's closed and work isn't. Drop off in the morning, pick up in the afternoon — and the hours in between are a real coached day, not a gym with a sitter.",
    scheduleHeading: "The day, hour by hour.",
    scheduleLede:
      "Every school's-out day runs the same shape, so kids know the rhythm by mid-morning of day one.",
    schedule: [
      { time: "8:45 – 9:00", what: "Drop-off & arrival games", why: "Coaches run low-key games as kids land — nobody stands around waiting for the day to start." },
      { time: "9:00 – 10:30", what: "Morning session", why: "The coached block — curriculum work in small groups, matched to age and level." },
      { time: "10:30 – 10:45", what: "Snack break", why: "From their bag — pack two snacks." },
      { time: "10:45 – 12:00", what: "Games that use the morning", why: "Small-sided play that puts the morning's work straight into a game." },
      { time: "12:00 – 12:45", what: "Lunch & downtime", why: "Packed lunch. Kids who need quiet get it; kids who don't, don't." },
      { time: "12:45 – 2:15", what: "Afternoon session", why: "Second coached block — different focus from the morning, same small groups." },
      { time: "2:15 – 3:00", what: "The tournament", why: "The day ends on the thing they'll talk about in the car." },
      { time: "3:00 – 3:15", what: "Pick-up", why: "On time, every time — we know the day doesn't end when yours does." },
    ],
    namedCamps: [],
    whoCards: [
      { label: "Ages", title: "5 – 12 years old", body: "Grouped by age on the day, so a five-year-old is never in a twelve-year-old's game." },
      { label: "Experience", title: "Never played? Fine.", body: "Groups are matched by level within each age — first-timers and club kids both get a day that fits." },
      { label: "The fit", title: "Built for working parents.", body: "Drop-off from 8:45, pick-up by 3:15, and the day runs on time at both ends." },
    ],
    faqs: [
      { question: "Can I book a single day instead of the whole break?", answer: "Where the catalog offers single days, yes — each camp's card says whether it's bookable by the day or as the full break." },
      { question: "What if my kid has never played soccer?", answer: "Groups are matched by age and level on the day — first-timers get a day that fits, not a day spent chasing club kids." },
      { question: "Do I pack a lunch?", answer: "Yes — pack a lunch and two snacks. We break twice for snacks and water." },
      { question: "What should they bring?", answer: "A water bottle, shin guards and indoor shoes." },
      { question: "What happens if school adds a closure day?", answer: "When districts add closure days, we add camp days where we can — leave your email and you'll hear the moment one opens." },
      { question: "What's the refund policy?", answer: "Full refund 14 or more days before the camp starts; case-by-case inside 14 days." },
    ],
    programSlugs: ["schools-out-day-camp"],
    closeHeading: "The break, covered.",
    closeSub: "Book the days you need — or get notified the moment dates drop.",
  },
  {
    slug: "summer",
    name: "Summer day camp",
    seoTitle: "Youth Summer Day Camp in Columbus & Worthington, Ohio — Aspire Sports",
    tone: "emerald",
    kicker: "June – August · book by the week",
    tileMeta: "Weekly sessions all summer",
    agesLine: "5 – 12 years old",
    body: "The big one. Weekly sessions all summer — full days that mix real training with the kind of playing kids actually remember. Book the weeks that fit your summer; every week stands on its own, so there's no falling behind.",
    teaser: {
      label: "The week, roughly",
      text: "Every day mixes a real training block with games and free play; the week builds to a Friday tournament. Themes change week to week, so repeat weeks don't repeat.",
    },
    windows: "● Weekly sessions, June through August · each week bookable on its own",
    heroSub:
      "Full days, all summer, a week at a time. Real training every morning, the games kids remember every afternoon — book the weeks that fit your summer.",
    scheduleHeading: "The week, day by day.",
    scheduleLede:
      "Every summer day runs the same reliable shape; the week builds to Friday's tournament.",
    schedule: [
      { time: "8:45 – 9:00", what: "Drop-off & arrival games", why: "Coaches run low-key games as kids land — the day starts when they walk in." },
      { time: "9:00 – 10:30", what: "Morning training", why: "The coached block — curriculum work in small groups, matched to age and level." },
      { time: "10:30 – 12:00", what: "Games & free play", why: "Small-sided games that put the morning's work straight to use." },
      { time: "12:00 – 12:45", what: "Lunch & downtime", why: "Packed lunch. Quiet corner for the kids who want one." },
      { time: "12:45 – 2:15", what: "Afternoon block", why: "The week's theme lives here — different every week, so repeat weeks don't repeat." },
      { time: "2:15 – 3:00", what: "Daily tournament", why: "Every day ends playing; Friday's finale is the one they'll talk about all weekend." },
      { time: "3:00 – 3:15", what: "Pick-up", why: "On time, every time." },
    ],
    namedCamps: [],
    whoCards: [
      { label: "Ages", title: "5 – 12 years old", body: "Grouped by age within the week, so every group's games are their own." },
      { label: "Experience", title: "All levels, genuinely.", body: "Summer weeks carry the widest mix of the year — the groups are built so that works." },
      { label: "The fit", title: "A week at a time.", body: "Each week stands alone. Take week 2 and week 7 — nobody's behind." },
    ],
    faqs: [
      { question: "Do we book the whole summer?", answer: "No — you book by the week. Every week stands on its own." },
      { question: "Can they come with a friend?", answer: "Yes — book the same week and tell us at drop-off; we'll group them where ages allow." },
      { question: "Do I pack a lunch?", answer: "Yes — pack a lunch and two snacks. We break twice for snacks and water." },
      { question: "What should they bring?", answer: "A water bottle, shin guards and indoor shoes — and sunscreen on outdoor days, applied before drop-off." },
      { question: "What's the refund policy?", answer: "Full refund 14 or more days before the week starts; case-by-case inside 14 days." },
    ],
    programSlugs: ["summer-day-camp"],
    closeHeading: "Their best week of summer.",
    closeSub: "Weeks go fast when dates drop — grab yours early, or get notified the moment they open.",
  },
  {
    slug: "skills",
    name: "Soccer skills camps",
    seoTitle: "Youth Soccer Skills Camps in Columbus & Worthington, Ohio — Aspire Sports",
    tone: "red",
    kicker: "Through the year · not break-bound",
    tileMeta: "Technical camps on our curriculum",
    agesLine: "By age group",
    body: "Multi-day technical camps run on the same written curriculum as our classes — touches, decisions, and coaches who explain the game while it's happening. A skills camp week moves your kid forward, measurably, and their regular coach sees the difference.",
    teaser: {
      label: "What they'll work on",
      text: "First touch, 1v1s, finishing, and decision-making — where each kid starts gets assessed on day one, and what they worked on comes home with them at the end.",
    },
    windows: "● Scheduled through the year — school breaks and beyond",
    heroSub:
      "Multi-day technical camps on the same written curriculum as our classes — a camp that moves your kid forward, measurably, not just a week that fills.",
    scheduleHeading: "The session, block by block.",
    scheduleLede:
      "Skills camps run focused sessions rather than full days — every block is touches and decisions.",
    schedule: [
      { time: "9:00 – 9:20", what: "Warm-up with the ball", why: "Every minute has a ball in it — no laps, no lines." },
      { time: "9:20 – 10:30", what: "Technical block", why: "The day's focus — first touch, 1v1s, finishing — taught the way our classes teach it." },
      { time: "10:30 – 10:45", what: "Snack break", why: "From their bag." },
      { time: "10:45 – 12:00", what: "Small-sided application", why: "The morning's technique under game pressure, with coaches talking players through it live." },
    ],
    namedCamps: [],
    whoCards: [
      { label: "Ages", title: "Grouped by age", body: "Each camp posts its own age group on the card — sessions are built for that group, not stretched across all of them." },
      { label: "Experience", title: "For kids who play.", body: "Skills camps assume game experience — they're the sharpening stone, not the introduction." },
      { label: "The proof", title: "Assessed, then tracked.", body: "Where each kid starts is assessed on day one, and what they worked on comes home at the end." },
    ],
    faqs: [
      { question: "How is this different from a day camp?", answer: "Focused sessions instead of full days — every block is technical work and its application, run on the class curriculum." },
      { question: "Does my kid need to be in our classes already?", answer: "No — skills camps stand alone. Kids in our classes will recognize the language; kids who aren't will pick it up on day one." },
      { question: "What ages do skills camps run for?", answer: "Each camp posts its own age group on the card before you book." },
      { question: "What should they bring?", answer: "A water bottle, shin guards, indoor shoes, and a snack." },
      { question: "What's the refund policy?", answer: "Full refund 14 or more days before the camp starts; case-by-case inside 14 days." },
    ],
    programSlugs: ["soccer-skills-camp"],
    closeHeading: "Sharper by Friday.",
    closeSub: "See what's scheduled — or get notified the moment the next one opens.",
  },
  {
    slug: "specialty",
    name: "Specialty camps",
    seoTitle:
      "Youth Soccer Goalie, Striker & Tryout-Prep Camps in Columbus, Ohio — Aspire Sports",
    tone: "navy",
    kicker: "Short & focused · announced through the year",
    tileMeta: "Goalie · defender · striker · tryout prep",
    agesLine: "",
    body: "Position-specific and goal-specific camps, announced as they're scheduled — deep work on one thing, for kids who know what they're chasing.",
    teaser: null,
    windows: "● Announced through the year — leave your email and you'll hear first",
    heroSub:
      "Deep work on one thing — a position, a role, a tryout — in short, focused camps announced through the year.",
    scheduleHeading: "The camps.",
    scheduleLede:
      "Each specialty camp is its own short, focused block. These are the ones we run — dates land in the catalog as they're scheduled.",
    schedule: [],
    namedCamps: [
      { name: "Goalie camp", hook: "The position nobody else trains", blurb: "Handling, footwork, angles and the courage part — real goalkeeper coaching, not a field session with gloves on." },
      { name: "Defender camp", hook: "Reading the game, not chasing it", blurb: "Positioning, timing, and 1v1 defending — the decisions that make a defender, taught as decisions." },
      { name: "Striker camp", hook: "Finishing, movement, composure", blurb: "Runs, first touches in the box, and finishing under pressure — repetitions with a coach explaining why." },
      { name: "Tryout prep", hook: "Ready when the clubs are watching", blurb: "What tryouts actually measure and how to show it — sharp, honest preparation in the weeks before club season." },
    ],
    whoCards: [
      { label: "The fit", title: "For kids chasing something.", body: "A position, a role, a tryout — specialty camps are for kids who already know what they want more of." },
      { label: "Format", title: "Short and focused.", body: "A morning or two, not a full week — deep on one thing, priced for what it is." },
      { label: "Ages", title: "Posted per camp.", body: "Each camp's card carries its own age range — goalie camp and tryout prep don't share one." },
    ],
    faqs: [
      { question: "When do specialty camps run?", answer: "As they're scheduled through the year — leave your email and you'll hear the moment one opens." },
      { question: "How long is a specialty camp?", answer: "Short by design — typically a morning or two rather than a full week. Each card shows its exact dates and times." },
      { question: "Is tryout prep tied to a specific club?", answer: "No — it prepares kids for what tryouts measure everywhere: sharpness, decisions, and showing what you have in a short window." },
      { question: "What's the refund policy?", answer: "Full refund 14 or more days before the camp starts; case-by-case inside 14 days." },
    ],
    programSlugs: ["goalie-camp", "defender-camp", "striker-camp", "tryout-prep-camp"],
    closeHeading: "One thing, done properly.",
    closeSub: "Get notified the moment the next specialty camp drops.",
  },
]
