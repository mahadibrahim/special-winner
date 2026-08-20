# Youth Camps Two-Level Page System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/youth/camps` as a band-system hub with four camp-family sections, and add `/youth/camps/[type]` detail pages carrying each family's full story.

**Architecture:** A single content registry (`camp-page-content.ts`) drives both page kinds; `CategoryFinder` gains an opt-in `programSlugs` filter so each type page shows only its family's catalog seasons. Spec: `docs/superpowers/specs/2026-08-19-youth-camps-design.md`; approved mockups: `2026-08-19-youth-camps-mockup.html` (hub) and `2026-08-19-youth-camp-type-detail-mockup.html` (type page) in the same directory.

**Tech Stack:** Astro 5 SSR pages, React 19 islands (existing `CategoryFinder`), Tailwind 4 with the youth token set, Vitest unit tests, Playwright e2e.

## Global Constraints

- **Branch:** all work on `youth-camps-v2` (already created off origin/main in this worktree). Run `git branch --show-current` before every edit session.
- **Adult surfaces byte-identical:** every `CategoryFinder`/`SeasonsFinderSection` change must be opt-in with defaults preserving current behavior (owner mandate).
- **No invented dollar figures anywhere.** Prices render only from live catalog data.
- **Copy bans:** no eyebrow/kicker text unless it carries real info (dates/ages ARE real info); no oppositional language; facility is not a selling point; camps are NOT school-break-only; never "DoC takes a group himself"; ages render below titles.
- **Full-width body text:** no `max-w-*` measure caps on ledes/subheads/paragraphs (standing owner rule — the classes page predates it in places; new pages must comply).
- **Placeholder values** (ages, hours, schedule times, lunch/bring facts) live ONLY in `src/lib/youth/camp-page-content.ts` and render as normal copy (no "placeholder" tags on real pages).
- **Fixed-nav clearance:** the page's first flow element needs `pt-16 lg:pt-20` (nav is `fixed top-0` h-16/h-20 with no spacer).
- **Prerender policy:** both pages are SSR (no `prerender` flag) + `setMarketingEdgeCache(Astro)`.
- **E2E:** these specs run post-merge only (`test-full`); run them locally before pushing.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Content registry + lede update

**Files:**
- Create: `src/lib/youth/camp-page-content.ts`
- Modify: `src/lib/youth/landing-content.ts` (the `CAMPS` constant, ~line 112)
- Test: `tests/unit/camp-page-content.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CAMP_TYPES: CampType[]`, `CAMP_DAY_FACTS: CampFact[]`, `CAMP_DAY_FACTS_NOTE: string`, `CAMP_CALENDAR: { name: string; meta: string }[]`, `CAMP_HUB_FAQS: { question: string; answer: string }[]`, `CAMP_BANNER: { message: string; cta: string }`, types `CampType`, `CampTypeSlug`, `CampFact`, `CampScheduleRow`, `CampWhoCard`, `CampFaqItem`, `CampNamedCamp`. Tasks 3–5 import these exact names.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/camp-page-content.test.ts
// The camps registry drives /youth/camps AND /youth/camps/[type]. These
// invariants are what the pages assume; break one and a page 404s or
// renders an empty band silently.
import { describe, it, expect } from "vitest"
import {
  CAMP_TYPES,
  CAMP_DAY_FACTS,
  CAMP_CALENDAR,
  CAMP_HUB_FAQS,
} from "@/lib/youth/camp-page-content"

describe("camp page content registry", () => {
  it("carries exactly the four owner-decided families, in menu order", () => {
    expect(CAMP_TYPES.map((t) => t.slug)).toEqual([
      "schools-out",
      "summer",
      "skills",
      "specialty",
    ])
  })

  it("slugs are unique and URL-safe (they are route params)", () => {
    const slugs = CAMP_TYPES.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/)
  })

  it("every family renders either a timetable or named camps — never neither", () => {
    for (const t of CAMP_TYPES) {
      expect(
        t.schedule.length > 0 || t.namedCamps.length > 0,
        `${t.slug} has no schedule and no named camps`,
      ).toBe(true)
    }
  })

  it("program slugs never overlap between families (a season must have one home)", () => {
    const all = CAMP_TYPES.flatMap((t) => t.programSlugs)
    expect(new Set(all).size).toBe(all.length)
  })

  it("every family has who-cards and FAQs for its detail page", () => {
    for (const t of CAMP_TYPES) {
      expect(t.whoCards.length, `${t.slug} whoCards`).toBeGreaterThanOrEqual(2)
      expect(t.faqs.length, `${t.slug} faqs`).toBeGreaterThanOrEqual(3)
    }
  })

  it("hub-level furniture is populated", () => {
    expect(CAMP_DAY_FACTS.length).toBeGreaterThanOrEqual(4)
    expect(CAMP_CALENDAR.length).toBe(4)
    expect(CAMP_HUB_FAQS.length).toBeGreaterThanOrEqual(5)
  })

  it("copy ban: nothing claims camps are school-break-only", () => {
    // The year-round framing is an owner-approved contract.
    const allCopy = JSON.stringify(CAMP_TYPES) + JSON.stringify(CAMP_HUB_FAQS)
    expect(allCopy.toLowerCase()).not.toContain("only when school")
    expect(allCopy.toLowerCase()).not.toContain("school breaks only")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/camp-page-content.test.ts`
Expected: FAIL — cannot resolve `@/lib/youth/camp-page-content`.

- [ ] **Step 3: Create the registry**

```ts
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
      "As they're scheduled through the year. Leave your email in the notify form above and you'll hear the moment one opens.",
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
```

- [ ] **Step 4: Update the CAMPS lede (copy cleanup — year-round framing)**

In `src/lib/youth/landing-content.ts`, replace the `CAMPS` constant body:

```ts
export const CAMPS = {
  lede:
    "Day camps when school's out, skills and specialty camps while it's in — every one of them coached rather than supervised, by the same people they see every week.",
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/camp-page-content.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Grep for other CAMPS.lede consumers**

Run: `grep -rn "CAMPS" src/ --include="*.astro" --include="*.tsx" --include="*.ts" | grep -v camp-page-content`
Expected consumers: `src/pages/youth/camps.astro` (rebuilt in Task 3). If any other page renders `CAMPS.lede`, read it and confirm the year-round copy reads correctly there too (it should — it's the approved framing).

- [ ] **Step 7: Commit**

```bash
git add src/lib/youth/camp-page-content.ts src/lib/youth/landing-content.ts tests/unit/camp-page-content.test.ts
git commit -m "feat(youth): camps content registry — four families, one tuning surface

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `programSlugs` scoping in the finder (opt-in)

**Files:**
- Modify: `src/lib/programs/category-pages.ts` (`scopeSeasons`, ~line 44)
- Modify: `src/components/landing/category-finder.tsx` (props + the `scoped` memo, ~lines 31–125)
- Test: `tests/unit/category-finder-program-slugs.test.ts`

**Interfaces:**
- Consumes: `scopeSeasons(seasons, audience, programTypes, sportSlug?)` — existing signature.
- Produces: `scopeSeasons(seasons, audience, programTypes, sportSlug?, programSlugs?)` — 5th optional param; `CategoryFinder` prop `programSlugs?: string[]`. Task 4 passes `programSlugs={type.programSlugs}`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/category-finder-program-slugs.test.ts
// The camp-type detail pages (/youth/camps/[type]) scope the shared finder
// to one camp family by program slug — there is no camp-family column, the
// program IS the family. The default (no programSlugs) MUST stay unscoped:
// every existing category page relies on it.
import { describe, it, expect } from "vitest"
import { scopeSeasons } from "@/lib/programs/category-pages"
import type { ApiSeason } from "@/lib/programs/api-season"

function campSeason(programSlug: string): ApiSeason {
  return {
    sport: { id: "sp-soccer", name: "soccer", slug: "soccer", icon: null, color: null },
    program: { slug: programSlug, programType: "camp", audienceType: "youth" },
    ageGroup: { id: "ag", name: "U10", minAge: 8, maxAge: 9 },
  } as unknown as ApiSeason
}

const ALL = [
  campSeason("summer-day-camp"),
  campSeason("goalie-camp"),
  campSeason("schools-out-day-camp"),
]

describe("scopeSeasons — program-slug scoping", () => {
  it("returns every program when no slugs are given, exactly as before", () => {
    expect(scopeSeasons(ALL, "youth", ["camp"]).map((s) => s.program.slug))
      .toEqual(["summer-day-camp", "goalie-camp", "schools-out-day-camp"])
  })

  it("keeps only the named programs when slugs are given", () => {
    expect(
      scopeSeasons(ALL, "youth", ["camp"], undefined, ["summer-day-camp"]).map(
        (s) => s.program.slug,
      ),
    ).toEqual(["summer-day-camp"])
  })

  it("accepts multiple slugs — the specialty family spans several programs", () => {
    expect(
      scopeSeasons(ALL, "youth", ["camp"], undefined, [
        "goalie-camp",
        "schools-out-day-camp",
      ]),
    ).toHaveLength(2)
  })

  it("returns nothing for slugs with no inventory rather than falling back to all", () => {
    // Silent fallback-to-everything is the leagues sport-scoping bug all
    // over again — an empty family must render the notify empty state.
    expect(scopeSeasons(ALL, "youth", ["camp"], undefined, ["defender-camp"])).toEqual([])
  })

  it("an empty array means 'no filter', matching the omitted-prop default", () => {
    expect(scopeSeasons(ALL, "youth", ["camp"], undefined, [])).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/category-finder-program-slugs.test.ts`
Expected: FAIL — the two scoped assertions return all 3 seasons (param ignored).

- [ ] **Step 3: Extend `scopeSeasons`**

In `src/lib/programs/category-pages.ts`, replace the function (keep the existing doc comment, append the new param note):

```ts
export function scopeSeasons(
  seasons: ApiSeason[],
  audience: CategoryAudience,
  programTypes: string[],
  sportSlug?: string | null,
  /** Restrict to specific programs, by slug — the camp-type pages pass their
   *  family's programs. Omitted or empty = no program filter (every existing
   *  page's behavior). Unknown slugs return nothing, never everything. */
  programSlugs?: string[],
): ApiSeason[] {
  return seasons.filter(
    (s) =>
      deriveAudience(s) === audience &&
      programTypes.includes(s.program.programType) &&
      (!sportSlug || s.sport?.slug === sportSlug) &&
      (!programSlugs || programSlugs.length === 0 || programSlugs.includes(s.program.slug)),
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/category-finder-program-slugs.test.ts tests/unit/category-finder-sport.test.ts tests/unit/category-pages.test.ts`
Expected: ALL PASS (the two existing suites prove default behavior unchanged).

- [ ] **Step 5: Thread the prop through CategoryFinder**

In `src/components/landing/category-finder.tsx`:

Add to `CategoryFinderProps` (after the `sport` prop, ~line 37):

```ts
  /** Restrict to specific programs, by slug. Opt-in — the camp-type pages
   *  (/youth/camps/[type]) pass their family's program slugs; every other
   *  call site omits it and renders byte-identical. */
  programSlugs?: string[]
```

Add `programSlugs,` to the destructured props (after `sport,`), and change the `scoped` memo:

```ts
  const scoped = useMemo(
    // scopeSeasons returns a fresh array (.filter), so in-place sort is safe.
    () =>
      scopeSeasons(seasons, audience, programTypes, sport, programSlugs).sort(
        byRegistrationCloses,
      ),
    [seasons, audience, programTypes, sport, programSlugs],
  )
```

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/programs/category-pages.ts src/components/landing/category-finder.tsx tests/unit/category-finder-program-slugs.test.ts
git commit -m "feat(finder): opt-in programSlugs scoping for camp-family pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Rebuild the camps hub (`/youth/camps`)

**Files:**
- Modify: `src/pages/youth/camps.astro` (full replacement)

**Interfaces:**
- Consumes: everything Task 1 exports; `CategoryFinder` (Task 2 unchanged defaults — hub passes no `programSlugs`); shipped `SectionJumpBar`, `FeatureBand`, `SlotGraphic`, `YouthCoachSection`, `LandingFaq`, `TileFactsLine`.
- Produces: the hub page. Band anchors `#camp-<slug>`; sections `#day`, `#coach`, `#open`, `#calendar`, `#faqs`. `sectionId="youth-camps"` (e2e contract: `#empty-finder-youth-camps-email` must keep existing).

- [ ] **Step 1: Replace `src/pages/youth/camps.astro`**

Design source of truth: `docs/superpowers/specs/2026-08-19-youth-camps-mockup.html` (final reviewed state). Full file:

```astro
---
// Youth camps hub — the menu of the four camp families. Camps is a coaching
// surface like classes (owner split: Director of Coaching IS prominent here,
// never on league pages). Band composition follows the owner-approved mockup
// verbatim — docs/superpowers/specs/2026-08-19-youth-camps-mockup.html.
// Content and every placeholder fact live in ONE registry:
// src/lib/youth/camp-page-content.ts (the owner-tuning surface).
//
// Launch reality: the catalog has zero camp seasons, so the finder renders
// its banded notify empty state and the authored calendar carries the dates
// story. Cards appear automatically as camps are seeded — no code change.
//
// Copy rules (owner-directed): no oppositional language, facility not a
// selling point, camps are NOT school-break-only, no invented dollar figures.
import BaseLayout from "@/layouts/BaseLayout.astro"
import CategoryFinder from "@/components/landing/category-finder.tsx"
import TileFactsLine from "@/components/landing/tile-facts-line"
import YouthCoachSection from "@/components/youth/youth-coach-section.astro"
import LandingFaq from "@/components/landing/landing-faq.tsx"
import SectionJumpBar from "@/components/youth/bands/section-jump-bar.astro"
import FeatureBand from "@/components/youth/bands/feature-band.astro"
import SlotGraphic from "@/components/youth/bands/slot-graphic.astro"
import { CAMPS } from "@/lib/youth/landing-content"
import {
  CAMP_TYPES,
  CAMP_DAY_FACTS,
  CAMP_DAY_FACTS_NOTE,
  CAMP_BANNER,
  CAMP_CALENDAR,
  CAMP_HUB_FAQS,
} from "@/lib/youth/camp-page-content"
import { setMarketingEdgeCache } from "@/lib/http/edge-cache"

const HERO_IMAGE = "/images/stock/youth-training.jpg"
setMarketingEdgeCache(Astro)

// Band/tile tone maps — token classes only, mirroring feature-band.astro's
// TONE approach so the camp bands and the shipped primitives read as one
// system. Declared in frontmatter (Astro misparses `<` type annotations
// inside JSX expression callbacks — classes-page precedent).
const TONE_BG: Record<string, string> = {
  royal: "bg-royal",
  emerald: "bg-emerald",
  red: "bg-brand-red",
  navy: "bg-navy-deep",
}
const TONE_ART: Record<string, string> = {
  royal:
    "linear-gradient(135deg, var(--royal-bright), color-mix(in oklch, var(--royal), var(--navy-deep) 35%))",
  emerald:
    "linear-gradient(135deg, var(--emerald-bright), color-mix(in oklch, var(--emerald), var(--navy-deep) 35%))",
  red: "linear-gradient(135deg, color-mix(in oklch, var(--brand-red), var(--navy-deep) 10%), color-mix(in oklch, var(--brand-red), var(--navy-deep) 45%))",
  navy: "linear-gradient(135deg, var(--royal-bright), color-mix(in oklch, var(--navy-deep), var(--royal) 25%))",
}
// Specialty (navy) gets the ochre kicker accent from the mockup.
const TONE_KICKER: Record<string, string> = {
  royal: "text-cream/75",
  emerald: "text-cream/75",
  red: "text-cream/75",
  navy: "text-ochre",
}

const JUMP_ITEMS = [
  { href: "#camp-schools-out", label: "The camps" },
  { href: "#day", label: "The camp day" },
  { href: "#coach", label: "Coaching" },
  { href: "#open", label: "Book & dates" },
  { href: "#calendar", label: "Calendar" },
  { href: "#faqs", label: "FAQs" },
]
---

<BaseLayout
  title="Youth Sports Camps in Columbus & Worthington, Ohio — Aspire Sports"
  description="Youth camps in Columbus and Worthington, Ohio — day camps when school's out, skills and specialty camps through the year. Coached rather than supervised. See dates and book online."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/youth/camps`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    {/* ---------- Top banner — owner-editable copy; static until camps are
        seeded (no live inventory to compute a deadline from), then revisit to
        the leagues-style live line. pt-16 lg:pt-20 clears the fixed site nav:
        this banner is the FIRST flow element on the page and Navigation is
        `fixed top-0` at h-16/h-20 with no BaseLayout spacer. ---------- */}
    <div class="bg-brand-red text-cream px-6 sm:px-9 pt-16 lg:pt-20" data-testid="camps-banner">
      <div class="max-w-[1080px] mx-auto flex items-center justify-between gap-4 flex-wrap py-3">
        <span class="font-mono text-[11.5px] tracking-[0.12em] uppercase">● {CAMP_BANNER.message}</span>
        <a
          href="#calendar"
          data-youth-cta="camps-banner"
          class="bg-cream text-brand-red font-mono text-[11px] tracking-[0.1em] uppercase rounded-lg px-4 py-[9px] no-underline whitespace-nowrap"
        >
          {CAMP_BANNER.cta}
        </a>
      </div>
    </div>

    {/* ---------- Hero — four doors, one page ---------------------------- */}
    <section class="relative text-cream px-6 sm:px-9 pt-16 pb-14 overflow-hidden bg-navy-deep">
      <div class="graded graded--emerald graded--fill z-0" aria-hidden="true">
        <img src={HERO_IMAGE} alt="" />
      </div>
      <div class="relative z-10 max-w-[1080px] mx-auto">
        <h1
          class="font-display font-semibold tracking-tight max-w-[16ch]"
          style="font-size:clamp(2.8rem,6vw,4.2rem);line-height:.98;letter-spacing:-0.015em"
        >
          Camp, all year long.
        </h1>
        <p class="mt-[18px] text-[17.5px] text-cream/92">{CAMPS.lede}</p>
        <div
          class="grid gap-3.5 mt-[30px]"
          style="grid-template-columns:repeat(auto-fit,minmax(228px,1fr))"
        >
          {
            CAMP_TYPES.map((t) => (
              <a
                href={`#camp-${t.slug}`}
                data-youth-cta={`camps-tile-${t.slug}`}
                class={`relative rounded-2xl px-[22px] pt-5 pb-[18px] text-cream no-underline block ${TONE_BG[t.tone]}`}
              >
                <div class={`font-mono text-[9.5px] tracking-[0.16em] uppercase ${TONE_KICKER[t.tone]}`}>
                  {t.kicker}
                </div>
                <h2 class="font-display font-semibold text-[22px] mt-1.5">{t.name}</h2>
                <div class="font-mono text-[10.5px] mt-1.5 text-cream/85">{t.tileMeta}</div>
                <span class="absolute right-[18px] bottom-3.5 font-semibold text-lg" aria-hidden="true">→</span>
              </a>
            ))
          }
        </div>
        <p class="mt-[22px] text-[13.5px] text-cream/70">
          Looking for a weekly season instead?
          <a href="/youth/leagues" class="text-cream/90 underline underline-offset-2">Youth leagues →</a>
          · Year-round training?
          <a href="/youth/classes" class="text-cream/90 underline underline-offset-2">Classes →</a>
        </p>
      </div>
    </section>

    <SectionJumpBar items={JUMP_ITEMS} />

    {/* ---------- Camp-type bands — one full-bleed band per family --------
        Custom band markup rather than FeatureBand: these carry an ages line,
        a windows line, a teaser detail row (or the specialty chip grid) and
        two CTAs, which FeatureBand's Props deliberately don't. ---------- */}
    {
      CAMP_TYPES.map((t, i) => (
        <section id={`camp-${t.slug}`} class={`${TONE_BG[t.tone]} text-cream px-6 sm:px-9 py-16`}>
          <div class="max-w-[1080px] mx-auto">
            <div
              class={`grid gap-11 items-center md:grid-cols-[1.15fr_1fr] ${
                i % 2 === 1 ? "md:[&>*:first-child]:order-2 md:[&>*:last-child]:order-1" : ""
              }`}
            >
              <div>
                <p class={`font-mono text-[10px] tracking-[0.16em] uppercase ${TONE_KICKER[t.tone]}`}>
                  {t.kicker}
                </p>
                <h2
                  class="font-display font-semibold mt-2.5"
                  style="font-size:clamp(1.9rem,3.4vw,2.6rem);letter-spacing:-0.01em"
                >
                  {t.name}
                </h2>
                {t.agesLine && (
                  <div class="font-mono text-[11px] tracking-[0.14em] uppercase mt-2 text-cream/85">
                    {t.agesLine}
                  </div>
                )}
                <p class="text-[15px] text-cream/90 mt-3.5">{t.body}</p>
                <div class="font-mono text-[11.5px] mt-4 text-cream/85 leading-loose">{t.windows}</div>
                {t.teaser && (
                  <div class="mt-4 border-t border-cream/25 pt-3.5">
                    <div class="font-mono text-[9.5px] tracking-[0.15em] uppercase text-cream/70">
                      {t.teaser.label}
                    </div>
                    <p class="text-[13.5px] text-cream/88 mt-1.5">{t.teaser.text}</p>
                  </div>
                )}
                {t.namedCamps.length > 0 && (
                  <div class="grid gap-2.5 mt-[18px]" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
                    {t.namedCamps.map((c) => (
                      <div class="border border-cream/30 rounded-[10px] px-3.5 py-3 font-semibold text-[13.5px]">
                        {c.name}
                        <small class="block font-mono font-normal text-[9.5px] tracking-[0.1em] uppercase text-cream/70 mt-1">
                          {c.hook}
                        </small>
                      </div>
                    ))}
                  </div>
                )}
                <div class="flex flex-wrap gap-2.5 mt-[22px]">
                  <a
                    href={`/youth/camps/${t.slug}`}
                    data-youth-cta={`camps-band-${t.slug}`}
                    class="inline-block bg-cream text-ink font-semibold text-[14px] px-5 py-3 rounded-[10px] no-underline"
                  >
                    Everything about {t.slug === "summer" ? "summer camp" : t.name.toLowerCase()} →
                  </a>
                  {t.slug === "specialty" ? (
                    <a
                      href="#calendar"
                      data-youth-cta={`camps-band-${t.slug}-notify`}
                      class="inline-block border-[1.5px] border-cream/40 text-cream font-semibold text-[14px] px-5 py-3 rounded-[10px] no-underline"
                    >
                      Get notified when one drops
                    </a>
                  ) : (
                    <a
                      href="#open"
                      data-youth-cta={`camps-band-${t.slug}-dates`}
                      class="inline-block border-[1.5px] border-cream/40 text-cream font-semibold text-[14px] px-5 py-3 rounded-[10px] no-underline"
                    >
                      See dates
                    </a>
                  )}
                </div>
              </div>
              <div
                class="relative overflow-hidden rounded-2xl min-h-[240px]"
                style={`background:${TONE_ART[t.tone]}`}
              >
                <SlotGraphic variant={i} />
              </div>
            </div>
          </div>
        </section>
      ))
    }

    {/* ---------- The camp day, up front — placeholder facts, one constant */}
    <section id="day" class="bg-paper border-y border-cream-3 px-6 sm:px-9 pt-14 pb-[60px]">
      <div class="max-w-[1080px] mx-auto">
        <h2 class="font-display font-semibold tracking-tight text-ink" style="font-size:clamp(2.1rem,3.8vw,2.9rem);letter-spacing:-0.015em">
          The camp day, <span class="text-brand-red">up front.</span>
        </h2>
        <div class="grid gap-x-8 gap-y-[26px] mt-[34px]" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
          {
            CAMP_DAY_FACTS.map((f) => (
              <div>
                <div class="font-mono text-[10.5px] tracking-[0.15em] uppercase text-ink-muted">{f.label}</div>
                <div class="font-display font-semibold text-[21px] mt-1.5 leading-tight text-ink">{f.value}</div>
              </div>
            ))
          }
        </div>
        <p class="mt-[26px] text-[13px] text-ink-muted">{CAMP_DAY_FACTS_NOTE}</p>
      </div>
    </section>

    {/* ---------- Coaching — camps is a coaching surface (owner split) ---- */}
    <div id="coach">
      <YouthCoachSection headingId="camps-coach-h" />
    </div>

    {/* ---------- Book it — red flood + overlapping paper finder sheet ---- */}
    <section id="open" class="bg-brand-red text-cream text-center px-6 sm:px-9 pt-16 pb-[140px]">
      <div class="max-w-[1080px] mx-auto">
        <h2 class="font-display font-semibold tracking-tight" style="font-size:clamp(2.2rem,4.5vw,3.2rem);letter-spacing:-0.015em">
          Book a camp.
        </h2>
        {/* Live facts line — edge-cached page, so status is computed
            client-side from the shared catalog fetch (classes precedent).
            Renders blank while the catalog has no camps; never invents. */}
        <TileFactsLine client:visible audience="youth" programTypes={["camp"]} tone="cream" />
      </div>
    </section>
    <div class="-mt-[88px] pb-[76px] px-6 sm:px-9">
      {/* Paper-sheet overlap (owner-flagged: the overlap element must be a
          card/sheet surface, never bare text straddling the band boundary).
          sectionId stays "youth-camps" — the e2e empty-notify capture id
          (#empty-finder-youth-camps-email) and signup attribution depend on
          it. Empty state = the banded "Be first in when it opens." card. */}
      <div class="max-w-[1080px] mx-auto bg-paper border border-cream-3 rounded-2xl shadow-xl">
        <CategoryFinder
          client:load
          audience="youth"
          programTypes={["camp"]}
          title="Open camps"
          descriptor="Every camp shows its dates, ages, venue and price on the card."
          ageChips
          sectionId="youth-camps"
          cardVariant="youth-band"
          headerHidden
        />
      </div>
    </div>

    {/* ---------- The camp calendar — authored windows + notify ----------- */}
    <section id="calendar" class="px-6 sm:px-9 py-[72px]">
      <div class="max-w-[1080px] mx-auto">
        <h2 class="font-display font-semibold tracking-tight text-ink" style="font-size:clamp(2.1rem,3.8vw,2.9rem);letter-spacing:-0.015em">
          The camp calendar.
        </h2>
        <p class="text-[15.5px] text-ink-2 mt-3">
          Planned windows for the year — leave your email in the notify form above and you'll hear
          the moment a window's dates open for booking.
        </p>
        <div class="grid gap-3.5 mt-[34px]" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
          {
            CAMP_CALENDAR.map((c) => (
              <div class="bg-paper border border-cream-3 rounded-[14px] p-5">
                <h3 class="font-display font-semibold text-[20px] text-ink">{c.name}</h3>
                <div class="font-mono text-[11px] text-ink-muted mt-1">{c.meta}</div>
                <a
                  href="#open"
                  data-youth-cta={`camps-calendar-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  class="inline-block text-[11px] font-semibold bg-cream-2 border border-cream-3 rounded-full px-3 py-[5px] mt-3 no-underline text-ink"
                >
                  Get notified
                </a>
              </div>
            ))
          }
        </div>
      </div>
    </section>

    {/* ---------- FAQs ----------------------------------------------------- */}
    <LandingFaq client:visible id="faqs" heading="Questions parents ask." items={CAMP_HUB_FAQS} />

    {/* ---------- Cross-promos --------------------------------------------- */}
    <FeatureBand
      tone="emerald"
      graphicVariant={2}
      kicker="Also at Aspire"
      title="Ready for game day?"
      body="Youth leagues run by age group from U6 to U19 — developmental seasons where we build the teams, and competitive winter play."
      cta={{ href: "/youth/leagues", label: "See youth leagues →" }}
    />
    <FeatureBand
      tone="royal"
      graphicVariant={1}
      kicker="Also at Aspire"
      title="Training that runs all year."
      body="Small-group classes from 18 months to nineteen years — one pathway, one curriculum, the same coaches they'll see at camp."
      cta={{ href: "/youth/classes", label: "See classes →" }}
    />

    {/* ---------- Close ------------------------------------------------------ */}
    <section class="bg-navy-deep text-cream text-center px-6 sm:px-9 py-[76px]" aria-labelledby="youth-camps-close-h">
      <div class="max-w-[1080px] mx-auto">
        <h2
          id="youth-camps-close-h"
          class="font-display font-semibold tracking-tight"
          style="font-size:clamp(2rem,4vw,2.8rem)"
        >
          The best week of <span class="text-emerald-bright">their year.</span>
        </h2>
        <p class="mt-2.5 text-cream/90">
          Dates go fast when they drop — grab yours early, or get notified the moment they open.
        </p>
        <div class="flex justify-center gap-3 mt-6">
          <a
            href="#open"
            data-youth-cta="camps-close-book"
            class="inline-block font-semibold text-[14.5px] px-[22px] py-[13px] rounded-[10px] bg-brand-red text-cream no-underline"
          >
            Book a camp →
          </a>
          <a
            href="#calendar"
            data-youth-cta="camps-close-notify"
            class="inline-block font-semibold text-[14.5px] px-[22px] py-[13px] rounded-[10px] border-[1.5px] border-cream/50 text-cream no-underline"
          >
            Get notified →
          </a>
        </div>
      </div>
    </section>
  </main>
</BaseLayout>

<script>
  import { track } from "@/lib/analytics/track"

  document.querySelectorAll<HTMLAnchorElement>("[data-youth-cta]").forEach((el) => {
    el.addEventListener("click", () =>
      track("youth_hub_section_cta_clicked", { section: el.dataset.youthCta ?? "" }),
    )
  })
</script>
```

- [ ] **Step 2: Verify it renders**

Dev server for this worktree (if not already running):
`./scripts/with-bws.sh npx astro dev --port 4455` (background; bare `npm run dev` is broken here).
Run: `curl -s http://localhost:4455/youth/camps | grep -c "Camp, all year long"`
Expected: `1` (or more). Also `curl -s http://localhost:4455/youth/camps | grep -c "camp-schools-out"` ≥ 2 (tile + band anchor).

- [ ] **Step 3: Browser check**

Open `http://localhost:4455/youth/camps` and eyeball against the mockup: banner clears the fixed nav; four tiles sit 4-across at desktop; the four bands alternate sides; finder sheet overlaps the red flood and shows the banded "Be first in when it opens." card; calendar, FAQ, cross-promos, close render. Check both a wide and a narrow viewport.

- [ ] **Step 4: Type check + commit**

Run: `npx tsc --noEmit` — zero errors.

```bash
git add src/pages/youth/camps.astro
git commit -m "feat(youth): rebuild /youth/camps as the four-family camps hub

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Camp-type detail pages (`/youth/camps/[type]`)

**Files:**
- Create: `src/pages/youth/camps/[type].astro`

**Interfaces:**
- Consumes: `CAMP_TYPES`, `CAMP_DAY_FACTS`, `CAMP_DAY_FACTS_NOTE` (Task 1); `CategoryFinder` with `programSlugs` (Task 2); `LandingFaq`.
- Produces: `/youth/camps/schools-out|summer|skills|specialty`; unknown slug → `Astro.rewrite("/404")`. Finder `sectionId` = `youth-camps-<slug>`.

- [ ] **Step 1: Create the page**

Design source of truth: `docs/superpowers/specs/2026-08-19-youth-camp-type-detail-mockup.html`. Full file:

```astro
---
// Camp-type detail page — "what specifically happens at this camp." One
// registry-driven route for the four families (schools-out / summer / skills
// / specialty). The hub carries the menu; this page carries the full story:
// the hour-by-hour day (or the named camps, for specialty), who it's for,
// the logistics, and this family's dates from the catalog.
//
// Content contract: everything here renders from CAMP_TYPES — see
// src/lib/youth/camp-page-content.ts for the owner-tuning surface and the
// program-slug seeding contract.
import BaseLayout from "@/layouts/BaseLayout.astro"
import CategoryFinder from "@/components/landing/category-finder.tsx"
import LandingFaq from "@/components/landing/landing-faq.tsx"
import {
  CAMP_TYPES,
  CAMP_DAY_FACTS,
  CAMP_DAY_FACTS_NOTE,
} from "@/lib/youth/camp-page-content"
import { setMarketingEdgeCache } from "@/lib/http/edge-cache"

const { type } = Astro.params
const camp = CAMP_TYPES.find((t) => t.slug === type)
if (!camp) {
  // Unknown slug → 404, not a redirect (dead URLs must fall out of the index
  // — adult-soccer-leagues-[suburb].astro precedent).
  return Astro.rewrite("/404")
}
setMarketingEdgeCache(Astro)

const siblings = CAMP_TYPES.filter((t) => t.slug !== camp.slug)

const TONE_BG: Record<string, string> = {
  royal: "bg-royal",
  emerald: "bg-emerald",
  red: "bg-brand-red",
  navy: "bg-navy-deep",
}

// Title-case the family name for the <title> without lowercasing the page's
// own display copy (which renders camp.name as authored).
const pageTitle = `${camp.name} in Columbus & Worthington, Ohio — Aspire Sports`
---

<BaseLayout
  title={pageTitle}
  description={`${camp.heroSub} See dates and book online at Aspire Sports.`}
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/youth/camps/${camp.slug}`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    {/* ---------- Hero — family tone; breadcrumb back to the hub ----------
        pt-16 lg:pt-20 inside the hero's top padding clears the fixed nav
        (first flow element on the page). ---------- */}
    <section class={`relative overflow-hidden text-cream px-6 sm:px-9 pt-24 lg:pt-28 pb-[52px] ${TONE_BG[camp.tone]}`}>
      <div
        class="absolute inset-0 z-0"
        aria-hidden="true"
        style="background:repeating-linear-gradient(45deg,oklch(0.972 0.008 80/.05) 0 2px,transparent 2px 30px),linear-gradient(160deg,oklch(0.18 0.07 262/.35),transparent 60%)"
      >
      </div>
      <div class="relative z-10 max-w-[1080px] mx-auto">
        <p class="font-mono text-[10.5px] tracking-[0.14em] uppercase mb-[22px]">
          <a href="/youth/camps" class="text-cream/85 no-underline hover:underline">← All camps</a>
        </p>
        <h1
          class="font-display font-semibold tracking-tight max-w-[18ch]"
          style="font-size:clamp(2.6rem,5.5vw,3.8rem);line-height:1;letter-spacing:-0.015em"
        >
          {camp.name}
        </h1>
        {camp.agesLine && (
          <div class="font-mono text-[11.5px] tracking-[0.14em] uppercase mt-3.5 text-cream/90">
            {camp.agesLine} · Worthington Fieldhouse
          </div>
        )}
        <p class="mt-4 text-[16.5px] text-cream/92">{camp.heroSub}</p>
        <div class="flex flex-wrap gap-3 mt-[26px]">
          <a
            href="#open"
            data-youth-cta={`camp-${camp.slug}-hero-book`}
            class="inline-block font-semibold text-[14.5px] px-[22px] py-[13px] rounded-[10px] bg-brand-red text-cream no-underline"
          >
            See dates & book →
          </a>
          <a
            href="#day"
            data-youth-cta={`camp-${camp.slug}-hero-day`}
            class="inline-block font-semibold text-[14.5px] px-[22px] py-[13px] rounded-[10px] border-[1.5px] border-cream/50 text-cream no-underline"
          >
            {camp.schedule.length > 0 ? "What the day looks like ↓" : "What we run ↓"}
          </a>
        </div>
        <div class="font-mono text-[11.5px] mt-6 text-cream/85 leading-loose">{camp.windows}</div>
      </div>
    </section>

    {/* ---------- The schedule — timetable, or the named camps ------------- */}
    <section id="day" class="px-6 sm:px-9 py-[72px]">
      <div class="max-w-[1080px] mx-auto">
        <h2 class="font-display font-semibold tracking-tight text-ink" style="font-size:clamp(2.1rem,3.8vw,2.9rem);letter-spacing:-0.015em">
          {camp.scheduleHeading}
        </h2>
        <p class="text-[15.5px] text-ink-2 mt-3">{camp.scheduleLede}</p>

        {
          camp.schedule.length > 0 ? (
            <div class="mt-[34px] border border-cream-3 rounded-2xl bg-paper overflow-hidden">
              {camp.schedule.map((row) => (
                <div class="grid gap-[18px] px-6 py-4 border-b border-cream-3 last:border-b-0 items-baseline sm:grid-cols-[150px_1fr]">
                  <span class="font-mono text-[12px] tracking-[0.08em] text-brand-red font-medium">{row.time}</span>
                  <span>
                    <span class="font-semibold text-[15px] text-ink">{row.what}</span>
                    <span class="block text-[13px] text-ink-muted mt-0.5">{row.why}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div class="grid gap-3.5 mt-[34px]" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
              {camp.namedCamps.map((c) => (
                <div class="bg-navy-deep text-cream rounded-[14px] p-6">
                  <h3 class="font-display font-semibold text-[22px]">{c.name}</h3>
                  <div class="font-mono text-[9.5px] tracking-[0.12em] uppercase text-emerald-bright mt-1.5">
                    {c.hook}
                  </div>
                  <p class="text-[13.5px] text-cream/85 mt-2.5">{c.blurb}</p>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </section>

    {/* ---------- Who it's for --------------------------------------------- */}
    <section class="bg-cream-2 border-y border-cream-3 px-6 sm:px-9 py-16">
      <div class="max-w-[1080px] mx-auto">
        <h2 class="font-display font-semibold tracking-tight text-ink" style="font-size:clamp(2.1rem,3.8vw,2.9rem);letter-spacing:-0.015em">
          Who it's <span class="text-brand-red">for.</span>
        </h2>
        <div class="grid gap-3.5 mt-[34px]" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
          {
            camp.whoCards.map((c) => (
              <div class="bg-paper border border-cream-3 rounded-[14px] p-[22px]">
                <div class="font-mono text-[9.5px] tracking-[0.15em] uppercase text-ink-muted">{c.label}</div>
                <h3 class="font-display font-semibold text-[20px] mt-2 text-ink">{c.title}</h3>
                <p class="text-[13.5px] text-ink-2 mt-1.5">{c.body}</p>
              </div>
            ))
          }
        </div>
      </div>
    </section>

    {/* ---------- Know before you book — shared facts, one constant -------- */}
    <section class="bg-paper border-b border-cream-3 px-6 sm:px-9 pt-14 pb-[60px]">
      <div class="max-w-[1080px] mx-auto">
        <h2 class="font-display font-semibold tracking-tight text-ink" style="font-size:clamp(2.1rem,3.8vw,2.9rem);letter-spacing:-0.015em">
          Know before <span class="text-brand-red">you book.</span>
        </h2>
        <div class="grid gap-x-8 gap-y-[26px] mt-[34px]" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
          {
            CAMP_DAY_FACTS.map((f) => (
              <div>
                <div class="font-mono text-[10.5px] tracking-[0.15em] uppercase text-ink-muted">{f.label}</div>
                <div class="font-display font-semibold text-[21px] mt-1.5 leading-tight text-ink">{f.value}</div>
              </div>
            ))
          }
        </div>
        <p class="mt-[26px] text-[13px] text-ink-muted">{CAMP_DAY_FACTS_NOTE}</p>
      </div>
    </section>

    {/* ---------- Dates & booking — this family only ----------------------- */}
    <section id="open" class="bg-brand-red text-cream text-center px-6 sm:px-9 pt-16 pb-[140px]">
      <div class="max-w-[1080px] mx-auto">
        <h2 class="font-display font-semibold tracking-tight" style="font-size:clamp(2.2rem,4.5vw,3.2rem);letter-spacing:-0.015em">
          Dates & booking.
        </h2>
        <p class="mt-3 font-mono text-[12px] tracking-[0.06em] text-cream/92 uppercase">
          Live from the catalog — cards appear the moment a camp opens
        </p>
      </div>
    </section>
    <div class="-mt-[88px] pb-[76px] px-6 sm:px-9">
      <div class="max-w-[1080px] mx-auto bg-paper border border-cream-3 rounded-2xl shadow-xl">
        <CategoryFinder
          client:load
          audience="youth"
          programTypes={["camp"]}
          programSlugs={camp.programSlugs}
          title={`Open ${camp.name.toLowerCase()}`}
          descriptor="Every camp shows its dates, ages, venue and price on the card."
          ageChips
          sectionId={`youth-camps-${camp.slug}`}
          cardVariant="youth-band"
          headerHidden
        />
      </div>
    </div>

    {/* ---------- Family FAQ ------------------------------------------------ */}
    <LandingFaq client:visible id="faqs" heading="Questions parents ask." items={camp.faqs} />

    {/* ---------- The other camps ------------------------------------------- */}
    <section class="px-6 sm:px-9 py-16">
      <div class="max-w-[1080px] mx-auto">
        <h2 class="font-display font-semibold tracking-tight text-ink" style="font-size:clamp(2.1rem,3.8vw,2.9rem);letter-spacing:-0.015em">
          The other <span class="text-brand-red">camps.</span>
        </h2>
        <div class="grid gap-3.5 mt-[30px]" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
          {
            siblings.map((s) => (
              <a
                href={`/youth/camps/${s.slug}`}
                data-youth-cta={`camp-${camp.slug}-other-${s.slug}`}
                class={`relative rounded-2xl px-[22px] pt-5 pb-[18px] text-cream no-underline block ${TONE_BG[s.tone]}`}
              >
                <div class="font-mono text-[9.5px] tracking-[0.16em] uppercase text-cream/80">{s.kicker}</div>
                <h3 class="font-display font-semibold text-[21px] mt-1.5">{s.name}</h3>
                <span class="absolute right-[18px] bottom-3.5 font-semibold text-lg" aria-hidden="true">→</span>
              </a>
            ))
          }
        </div>
      </div>
    </section>

    {/* ---------- Close ------------------------------------------------------ */}
    <section class="bg-navy-deep text-cream text-center px-6 sm:px-9 py-[76px]" aria-labelledby={`camp-${camp.slug}-close-h`}>
      <div class="max-w-[1080px] mx-auto">
        <h2
          id={`camp-${camp.slug}-close-h`}
          class="font-display font-semibold tracking-tight"
          style="font-size:clamp(2rem,4vw,2.8rem)"
        >
          {camp.closeHeading}
        </h2>
        <p class="mt-2.5 text-cream/90">{camp.closeSub}</p>
        <div class="flex justify-center gap-3 mt-6">
          <a
            href="#open"
            data-youth-cta={`camp-${camp.slug}-close-book`}
            class="inline-block font-semibold text-[14.5px] px-[22px] py-[13px] rounded-[10px] bg-brand-red text-cream no-underline"
          >
            See dates →
          </a>
          <a
            href="/youth/camps"
            data-youth-cta={`camp-${camp.slug}-close-all`}
            class="inline-block font-semibold text-[14.5px] px-[22px] py-[13px] rounded-[10px] border-[1.5px] border-cream/50 text-cream no-underline"
          >
            All camps →
          </a>
        </div>
      </div>
    </section>
  </main>
</BaseLayout>

<script>
  import { track } from "@/lib/analytics/track"

  document.querySelectorAll<HTMLAnchorElement>("[data-youth-cta]").forEach((el) => {
    el.addEventListener("click", () =>
      track("youth_hub_section_cta_clicked", { section: el.dataset.youthCta ?? "" }),
    )
  })
</script>
```

- [ ] **Step 2: Verify all four render and unknown slugs 404**

```bash
for t in schools-out summer skills specialty nope; do
  echo -n "$t: "; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4455/youth/camps/$t"
done
```
Expected: `200 200 200 200 404`.

- [ ] **Step 3: Browser check**

Open `/youth/camps/schools-out` (timetable renders 8 rows) and `/youth/camps/specialty` (named-camp cards render instead of a timetable; no ages line in hero). Confirm the hero clears the fixed nav and the finder sheet overlaps the red band.

- [ ] **Step 4: Type check + commit**

Run: `npx tsc --noEmit` — zero errors.

```bash
git add "src/pages/youth/camps/[type].astro"
git commit -m "feat(youth): camp-type detail pages — the full story per family

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Sitemap + e2e coverage

**Files:**
- Modify: `src/lib/seo/aspire-sitemap-pages.mjs` (~line 21)
- Modify: `tests/e2e/category-pages.spec.ts` (the `/youth/camps` test, ~lines 71–82)

**Interfaces:**
- Consumes: routes from Tasks 3–4; the e2e contract `#empty-finder-youth-camps-email`.
- Produces: sitemap entries; updated + new specs.

- [ ] **Step 1: Add the type pages to the sitemap list**

In `src/lib/seo/aspire-sitemap-pages.mjs`, directly after the `"/youth/camps",` line:

```js
  // Camp-family detail pages — registry-driven (src/lib/youth/camp-page-content.ts);
  // keep in sync with CAMP_TYPES slugs.
  "/youth/camps/schools-out",
  "/youth/camps/summer",
  "/youth/camps/skills",
  "/youth/camps/specialty",
```

- [ ] **Step 2: Update the camps e2e test + add type-page coverage**

Replace the existing `/youth/camps` test in `tests/e2e/category-pages.spec.ts` with:

```ts
  test("/youth/camps — empty catalog captures email", async ({ page }) => {
    await page.goto("/youth/camps", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Rebuilt hub renders the four-family menu server-side.
    await expect(page.getByRole("heading", { level: 1, name: /camp, all year long/i })).toBeVisible();

    // Seed has no camp programs → the youth-band empty state (banded notify
    // card) renders. Copy changed with cardVariant="youth-band": it reads
    // "Be first in when it opens." rather than "nothing open right now".
    await expect(page.getByText(/be first in when it opens/i)).toBeVisible();
    // Scope to the empty-state form — the footer newsletter form also has an
    // email input with the same accessible label, so target by the unique id.
    await page.locator("#empty-finder-youth-camps-email").fill("camps-waitlist-e2e@test.aspiresports.com");
    await page.getByRole("button", { name: /notify me/i }).click();
    await expect(page.getByText(/you're on the list/i)).toBeVisible();
  });

  test("/youth/camps — band links through to the family page", async ({ page }) => {
    await page.goto("/youth/camps", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // The hub band's primary CTA → /youth/camps/schools-out with the
    // hour-by-hour timetable (the "what specifically happens" surface).
    await page.locator('a[href="/youth/camps/schools-out"]').first().click();
    await page.waitForURL("**/youth/camps/schools-out");
    await expect(
      page.getByRole("heading", { level: 1, name: /school's-out day camps/i }),
    ).toBeVisible();
    await expect(page.getByText(/the day, hour by hour/i)).toBeVisible();
    await expect(page.getByText(/drop-off & arrival games/i)).toBeVisible();
  });

  test("/youth/camps/[type] — unknown family 404s", async ({ page }) => {
    const response = await page.goto("/youth/camps/underwater-basket-weaving", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
  });
```

- [ ] **Step 3: Run the touched specs locally**

The e2e seed must be present (`npm run db:seed:e2e` against the staging DB if not already seeded) and the dev server running on :4455.
Run: `PLAYWRIGHT_BASE_URL=http://localhost:4455 npx playwright test tests/e2e/category-pages.spec.ts`
Expected: all category-pages tests PASS (including the three camps tests). If the two pre-existing staging-data failures documented in memory appear in OTHER suites, they are not regressions — but every category-pages test must pass.

- [ ] **Step 4: Grep for other specs touching the camps surface**

Run: `grep -rn "youth/camps" tests/e2e/`
Expected: only `category-pages.spec.ts` (plus a cross-link assertion in `youth-leagues.spec.ts` — read it; it checks a link *to* /youth/camps, which still exists, so no change. If it asserts anything about the old camps page structure, update it to the new structure).

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/aspire-sitemap-pages.mjs tests/e2e/category-pages.spec.ts
git commit -m "test(youth): camps hub/type-page e2e + sitemap entries for the four families

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification + PR

**Files:** none new — verification and shipping.

- [ ] **Step 1: Unit tests**

Run: `npx vitest run tests/unit/`
Expected: all pass (including the two new suites).

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors (repo baseline is zero).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds. The `Astro.request.headers` prerender warnings are documented noise; anything else, investigate.

- [ ] **Step 4: Full local Playwright pass on the touched surface**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4455 npx playwright test tests/e2e/category-pages.spec.ts tests/e2e/youth-leagues.spec.ts`
Expected: PASS. (These run post-merge only in CI — this local run is the gate.)

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin youth-camps-v2
gh pr create --title "Youth camps: two-level rebuild — four-family hub + camp-type detail pages" --body "$(cat <<'EOF'
## Summary
- Rebuilds /youth/camps on the youth band system: four-family menu (School's-out / Summer / Soccer skills / Specialty), day-facts band, coach section, red-flood booking sheet, authored calendar + notify, FAQ, cross-promos
- Adds /youth/camps/[type] detail pages — hour-by-hour day (or named specialty camps), who it's for, logistics, family-scoped dates & booking
- One content registry (src/lib/youth/camp-page-content.ts) is the owner-tuning surface for every placeholder fact; program-slug seeding contract documented there
- CategoryFinder gains opt-in programSlugs scoping (defaults byte-identical — unit-proven)
- Sitemap entries for the four family pages; camps e2e updated for the youth-band empty state + new type-page coverage

Spec: docs/superpowers/specs/2026-08-19-youth-camps-design.md (mockups alongside, owner-approved live on :4455)

## Launch state
Catalog has zero camp seasons today — the finder renders the banded notify empty state and the authored calendar carries dates until the owner seeds camp programs (slugs must match the registry).

## Test plan
- [x] tests/unit/camp-page-content.test.ts + category-finder-program-slugs.test.ts
- [x] Local Playwright: category-pages.spec.ts (hub empty-notify, band → type page, unknown-type 404), youth-leagues.spec.ts
- [x] npx tsc --noEmit clean, npm run build clean
- [x] Browser pass against both approved mockups

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Watch CI to green**

Run: `gh pr checks --watch`
Expected: all checks green. The task — and the push — is not done until CI is green on origin.

---

## Self-Review (completed at planning time)

- **Spec coverage:** registry (T1), finder scoping (T2), hub composition incl. banner/hero/bands/day-facts/coach/flood/calendar/FAQ/promos/close (T3), type pages incl. 404 (T4), sitemap + e2e (T5), verification/PR (T6). Copy-cleanup item (CAMPS.lede) folded into T1.
- **Placeholder scan:** none — all copy, code, and commands are written out.
- **Type consistency:** `CampType`/`CAMP_TYPES`/`programSlugs`/`sectionId` names match across T1→T4; `scopeSeasons` 5-param signature matches T2's test and finder call.
