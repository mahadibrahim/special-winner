# Adult 4v4 Flag Football Landing Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch sellable adult 4v4 flag football for Winter 1 with landing pages that conform to the existing adult-league sport pattern (`/adult/leagues/<sport>` + `[term]`), generalizing the soccer-hardcoded components wholesale rather than forking them.

**Architecture:** New content module `adult-flag-football-content.ts` mirrors `adult-soccer-content.ts` slot for slot; `SoccerLandingTabs` and `SeasonTabs` are generalized into sport-parameterized components consumed by both soccer and flag pages; two new Astro SSR pages fetch `/api/public/seasons?sport=flag-football&audience=adult`; catalog rows are created via the existing admin UI/API (no seed scripts for prod). JSON-LD and sitemap fixes are applied to both sports.

**Tech Stack:** Astro 5 (SSR pages), React 19 islands (`client:load` + `useHydrationBeacon`), Tailwind 4, Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-07-28-flag-football-landing-design.md`

## Global Constraints

- Work in a **git worktree** on branch `feat/flag-football-landing` cut from `main` (CLAUDE.md requires a worktree for plans of this size; create it via `superpowers:using-git-worktrees` BEFORE the first edit). All file paths below are relative to the worktree root. Subagents MUST be given the absolute worktree path.
- Season facts (verbatim from spec): Wednesdays · Worthington · Winter 1 term `winter-1-2627` (window 2026-11-09 – 2027-01-17, open) · Winter 2 term `winter-2-2027` (2027-01-18 – 2027-03-20, upcoming) · 8 games · roster 6–10 (4 to play) · `per_team` pricing, teamPrice **$795**, individual price **$105**, deposit **$200**, signupModes `["team","individual"]` · divisions Men's + Coed (`divisionGender: "mens" | "coed"`, `skillLevel: null`).
- Coed default rule: at least 1 female player on the field at all times; females may sub for males, not vice-versa.
- All new pages are SSR: `export const prerender = false;` — never prerender (they read live season data).
- Every `client:load` island on these pages keeps `useHydrationBeacon()`; every new e2e interaction is preceded by `await waitForHydration(page)`.
- No new npm dependencies. No schema changes, no migrations. No one-off DB scripts — prod catalog rows are created through the admin UI/API only.
- Soccer pages must render identically after generalization (same markup, same testids: `now-registering`, `landing-tabs`, `overview-season-cta`).
- Route is `/adult/leagues/flag-football` — there is NO top-level `/flag-football`.
- Commit after every task; run `npx tsc --noEmit` before each commit (repo baseline is zero errors).

---

### Task 1: Flag football content module + league guide doc

**Files:**
- Create: `src/lib/leagues/landing-content.ts` (shared types)
- Create: `src/lib/leagues/adult-flag-football-content.ts`
- Modify: `src/lib/leagues/adult-soccer-content.ts` (import shared types instead of declaring them)
- Create: `docs/sports/adult-flag-football-leagues.md`
- Test: `tests/unit/adult-flag-football-content.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `landing-content.ts` exporting `type ValueProp = { icon: string; tint: "orange" | "sage" | "ochre"; title: string; copy: string }`, `type RuleSection = { title: string; items: string[] }`, `type FaqEntry = { q: string; a: string }`. `adult-flag-football-content.ts` exporting `FORMAT_FACTS: string[]`, `RULE_SECTIONS: RuleSection[]`, `FAQ: FaqEntry[]`, `WHY_4V4: ValueProp[]`, `DIVISION_CALLOUTS: { title: string; copy: string }[]`. `adult-soccer-content.ts` keeps ALL its existing exports (`SKILL_LEVELS`, `FORMAT_FACTS`, `RULE_SECTIONS`, `FAQ`, `WHY_INDOOR`, and the types re-exported from `landing-content.ts` so existing imports keep compiling).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/adult-flag-football-content.test.ts
import { describe, it, expect } from "vitest";
import { FORMAT_FACTS, RULE_SECTIONS, FAQ, WHY_4V4, DIVISION_CALLOUTS } from "@/lib/leagues/adult-flag-football-content";

describe("adult-flag-football-content", () => {
  it("states the 4v4 format and 8-game season", () => {
    const joined = FORMAT_FACTS.join(" ").toLowerCase();
    expect(joined).toContain("4v4");
    expect(joined).toContain("8-game");
    expect(joined).toContain("roster");
  });
  it("has rule sections covering the game, coed, conduct, roster", () => {
    expect(RULE_SECTIONS.length).toBeGreaterThanOrEqual(4);
    const titles = RULE_SECTIONS.map((s) => s.title.toLowerCase()).join(" ");
    expect(titles).toContain("coed");
    for (const s of RULE_SECTIONS) expect(s.items.length).toBeGreaterThanOrEqual(3);
  });
  it("bans QB runs and enforces the 7-second clock in the rules", () => {
    const allRules = RULE_SECTIONS.flatMap((s) => s.items).join(" ").toLowerCase();
    expect(allRules).toContain("7-second");
    expect(allRules).toMatch(/quarterback|qb/);
  });
  it("has FAQ entries and both division callouts", () => {
    expect(FAQ.length).toBeGreaterThanOrEqual(4);
    expect(DIVISION_CALLOUTS.map((d) => d.title.toLowerCase()).join(" ")).toMatch(/men/);
    expect(DIVISION_CALLOUTS.map((d) => d.title.toLowerCase()).join(" ")).toMatch(/coed/);
  });
  it("has 5-6 value props with valid tints", () => {
    expect(WHY_4V4.length).toBeGreaterThanOrEqual(5);
    for (const v of WHY_4V4) expect(["orange", "sage", "ochre"]).toContain(v.tint);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adult-flag-football-content.test.ts`
Expected: FAIL — cannot resolve `@/lib/leagues/adult-flag-football-content`.

- [ ] **Step 3: Create the shared types module**

```typescript
// src/lib/leagues/landing-content.ts
// Shared content types for the adult-league landing pages (soccer, flag football, …).
export type ValueProp = { icon: string; tint: "orange" | "sage" | "ochre"; title: string; copy: string };
export type RuleSection = { title: string; items: string[] };
export type FaqEntry = { q: string; a: string };
```

In `src/lib/leagues/adult-soccer-content.ts`, delete the local `RuleSection`, `FaqEntry`, and `ValueProp` type declarations and replace with:

```typescript
import type { ValueProp, RuleSection, FaqEntry } from "@/lib/leagues/landing-content";
export type { ValueProp, RuleSection, FaqEntry };
```

(Keep `SkillLevel` where it is — it's soccer-specific. Keep every value export unchanged.)

- [ ] **Step 4: Write the flag content module**

```typescript
// src/lib/leagues/adult-flag-football-content.ts
// Evergreen copy for the Adult 4v4 Flag Football league pages.
// Source of truth: docs/sports/adult-flag-football-leagues.md (the published League Guide).
import type { ValueProp, RuleSection, FaqEntry } from "@/lib/leagues/landing-content";

export const FORMAT_FACTS: string[] = [
  "4v4 — everyone's a receiver",
  "8-game season, no playoffs",
  "Two 20-min halves, running clock",
  "Roster 6–10 (4 to play)",
  "7-second pass clock",
  "Boarded indoor turf — bigger than NFL Blitz indoor spec",
];

export const RULE_SECTIONS: RuleSection[] = [
  { title: "The game", items: [
    "4v4 flag, no contact · two 20-min running-clock halves",
    "No QB runs — handoffs, pitches and laterals behind the line only",
    "7-second pass clock (play is dead if the ball isn't out)",
    "No diving, no jumping to avoid a flag pull · spinning allowed",
    "Flag pull = down · ball spotted at the flag",
  ]},
  { title: "Coed rules", items: [
    "At least 1 female player on the field at all times",
    "Females may sub for males, not vice-versa",
    "No gender restrictions on positions — anyone can play QB",
  ]},
  { title: "Conduct & safety", items: [
    "No contact: no blocking, no stripping, no flag guarding",
    "Zero tolerance — violent conduct = ejection",
    "Mouthguards recommended · flat / turf shoes only, no cleats",
    "Flags provided; shirts must be tucked (flags visible)",
  ]},
  { title: "Roster & standings", items: [
    "Roster 6–10 (4 to play) · locks after game 3",
    "3 pts win / 1 draw / 0 loss · tiebreak: H2H → point differential",
    "$200 non-refundable deposit · paid in full by game 1",
  ]},
];

export const FAQ: FaqEntry[] = [
  { q: "Don't have a team?", a: "Register solo — we place free agents on balanced teams by schedule. Individual spot is $105 for the 8-game season." },
  { q: "Why 4v4 instead of 6v6?", a: "Our boarded fields are sized for it — bigger than the official NFL Blitz indoor 4v4 spec. Four a side means every player runs a route on every play, and you get roughly double the touches of a 6v6 league." },
  { q: "How do I pay?", a: "A $200 non-refundable deposit holds your team's spot; the balance is due in full by game 1. Team registration is $795 with a 6–10 player roster." },
  { q: "What do I wear?", a: "Athletic wear and flat or turf shoes — no cleats. We provide the flags and game balls. Shirts tucked so flags stay visible." },
  { q: "When and where?", a: "Wednesday nights at our Worthington facility (535 Lakeview Plaza Blvd) on climate-controlled boarded turf. Winter 1 runs November into January; Winter 2 follows straight after." },
];

export const WHY_4V4: ValueProp[] = [
  { icon: "🏈", tint: "orange", title: "Everyone's a receiver", copy: "4v4 means every player runs a route on every snap — no linemen, no standing around." },
  { icon: "⚡", tint: "ochre", title: "More touches, faster games", copy: "A 7-second pass clock and short field keep the ball moving — roughly double the touches of a 6v6 league." },
  { icon: "🧱", tint: "sage", title: "The ball never dies", copy: "Fully boarded turf, bigger than NFL Blitz indoor spec. No chasing overthrows into a parking lot." },
  { icon: "☃︎", tint: "sage", title: "Winter-proof", copy: "Climate-controlled indoor turf. Games run on schedule all winter — never frozen out." },
  { icon: "🤝", tint: "orange", title: "No team? No problem", copy: "Sign up solo and we place free agents on balanced squads by schedule." },
  { icon: "🍻", tint: "ochre", title: "Stick around after", copy: "Half of league night happens off the field — food, drinks, and the people you'll keep playing with." },
];

// Season-one divisions (rendered on the Overview tab in place of soccer's skill ladder).
export const DIVISION_CALLOUTS: { title: string; copy: string }[] = [
  { title: "Men's 4v4", copy: "Open competitive division. Roster 6–10, everyone plays." },
  { title: "Coed 4v4", copy: "At least 1 female player on the field at all times; anyone can play QB. The social-but-real-football option." },
];
```

- [ ] **Step 5: Run the tests, verify they pass**

Run: `npx vitest run tests/unit/adult-flag-football-content.test.ts tests/unit/adult-soccer-content.test.ts`
Expected: both PASS (the soccer test guards the type-move refactor).

- [ ] **Step 6: Write the league guide doc**

Create `docs/sports/adult-flag-football-leagues.md` containing: the format decision and why (field-size math: Worthington fields 110×60 ft ≈ 37×20 yd vs NFL Blitz indoor 4v4 max 25×20 yd; NFL Flag 5v5 regulation is 70×30 yd — too wide for us), the full rule kit matching `RULE_SECTIONS` above verbatim, season structure (Wednesdays, Winter 1 `winter-1-2627` Nov 9 – Jan 17, Winter 2 `winter-2-2027` Jan 18 – Mar 20, 8 games), pricing ($795 team / $105 individual / $200 deposit), and a "Copy source of truth" note stating the content module mirrors this doc. Mark the coed rule as owner-adjustable before registration opens.

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit` — expect zero errors.

```bash
git add src/lib/leagues/landing-content.ts src/lib/leagues/adult-flag-football-content.ts src/lib/leagues/adult-soccer-content.ts docs/sports/adult-flag-football-leagues.md tests/unit/adult-flag-football-content.test.ts
git commit -m "feat(flag): adult 4v4 flag football content module + league guide"
```

---

### Task 2: Generalize the landing tabs component (wholesale)

**Files:**
- Create: `src/components/leagues/landing-tabs.tsx`
- Delete: `src/components/leagues/soccer-landing-tabs.tsx`
- Modify: `src/pages/adult/leagues/soccer/index.astro` (use the new component)

**Interfaces:**
- Consumes: `ValueProp`, `RuleSection` from `@/lib/leagues/landing-content` (Task 1); existing `LevelLadder`, `useHydrationBeacon`, `trackLandingTabViewed`, `trackLandingCtaClicked` (`trackLandingTabViewed` already takes `{ sport: string; tab }`).
- Produces: `export type LandingTerm = { slug: string; label: string; meta: string }` (unchanged shape) and:

```typescript
export type LandingOverview = {
  kicker: string;                                        // "Why indoor soccer"
  headline: { before: string; em: string; after: string }; // rendered as {before}<em>{em}</em>{after}
  intro: string;
  why: ValueProp[];
  midLabel: string;                                      // "Find your level" / "The divisions"
  midSlot: { kind: "ladder" } | { kind: "divisions"; items: { title: string; copy: string }[] };
};
export function LandingTabs(props: {
  sport: string;        // analytics param, e.g. "soccer", "flag-football"
  basePath: string;     // "/adult/leagues/soccer" — CTA/term link prefix
  overview: LandingOverview;
  ruleSections: RuleSection[];
  pastEmptyCopy: string;
  current: CurrentTerm | null;   // CurrentTerm/UpcomingTerm keep their existing shapes
  upcoming: UpcomingTerm[];
  past: LandingTerm[];
}): JSX.Element;
```

- [ ] **Step 1: Create `landing-tabs.tsx` from the existing component**

Copy `soccer-landing-tabs.tsx` → `landing-tabs.tsx`, rename the component to `LandingTabs`, then parameterize — the rendered DOM for soccer must not change:

- Remove the imports of `WHY_INDOOR`, `RULE_SECTIONS` (content now arrives via props). Keep `LevelLadder` imported.
- `trackLandingTabViewed({ sport: "soccer", tab })` → `trackLandingTabViewed({ sport: props.sport, tab })`.
- Every `\`/adult/leagues/soccer/${...}\`` href → `\`${props.basePath}/${...}\``.
- Overview hardcoded strings become `props.overview` fields: kicker line renders `overview.kicker`; the `<h2>` renders `{overview.headline.before}<em className="italic" style={{ color: ORANGE }}>{overview.headline.em}</em>{overview.headline.after}`; the intro `<p>` renders `overview.intro`; the value-prop grid maps `overview.why`.
- The "Find your level" label renders `overview.midLabel`; below it render `overview.midSlot.kind === "ladder" ? <LevelLadder /> : <div className="grid md:grid-cols-2 gap-3.5">{overview.midSlot.items.map((d) => (<div key={d.title} className="bg-paper border border-cream-3 rounded-xl p-4"><div className="font-display font-semibold text-lg mb-0.5">{d.title}</div><p className="text-[12.5px] text-ink-2 leading-snug">{d.copy}</p></div>))}</div>`.
- Rules grid maps `props.ruleSections`.
- The past-tab empty-state string ("No completed seasons yet — Fall 2026 is the first. …") becomes `props.pastEmptyCopy`.
- Keep `useHydrationBeacon()`, all testids (`landing-tabs`, `overview-season-cta`), tab keys, and all classNames exactly as they are.

- [ ] **Step 2: Update the soccer landing to use it, delete the old component**

In `src/pages/adult/leagues/soccer/index.astro`, replace the `SoccerLandingTabs` import/usage with:

```astro
import { LandingTabs } from "@/components/leagues/landing-tabs";
import { FORMAT_FACTS, WHY_INDOOR, RULE_SECTIONS } from "@/lib/leagues/adult-soccer-content";
```

```jsx
<LandingTabs client:load
  sport="soccer"
  basePath="/adult/leagues/soccer"
  overview={{
    kicker: "Why indoor soccer",
    headline: { before: "Real games, ", em: "every week", after: " — rain, snow, or shine." },
    intro: "A faster, higher-scoring game on walled turf, leagues sorted by skill so every match is competitive, and a crew waiting whether or not you bring one.",
    why: WHY_INDOOR,
    midLabel: "Find your level",
    midSlot: { kind: "ladder" },
  }}
  ruleSections={RULE_SECTIONS}
  pastEmptyCopy="No completed seasons yet — Fall 2026 is the first. Results & champions will appear here."
  current={currentProp} upcoming={upcomingProps} past={pastProps} />
```

Then `git rm src/components/leagues/soccer-landing-tabs.tsx`. Grep to confirm nothing else imports it: `grep -rn "soccer-landing-tabs" src/ tests/` → zero hits.

- [ ] **Step 3: Verify soccer landing unchanged**

Run: `npx tsc --noEmit` — zero errors. Then with the dev server running (`npm run dev:bws`), load `http://localhost:4321/adult/leagues/soccer` in a browser: hero, "Now Registering" banner, all four tabs render; Overview shows the skill ladder and rules; tab clicks work.
Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- league-lead-in` — the "soccer landing tabs switch content" spec must PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/leagues/landing-tabs.tsx src/pages/adult/leagues/soccer/index.astro
git rm src/components/leagues/soccer-landing-tabs.tsx 2>/dev/null; git add -A src/components/leagues/
git commit -m "refactor(leagues): generalize SoccerLandingTabs into sport-parameterized LandingTabs"
```

---

### Task 3: Generalize SeasonTabs + DivisionsFinder level display

**Files:**
- Modify: `src/components/leagues/season-tabs.tsx`
- Modify: `src/components/leagues/divisions-finder.tsx`
- Modify: `src/pages/adult/leagues/soccer/[term].astro` (pass the new props)

**Interfaces:**
- Consumes: `RuleSection`, `FaqEntry` from `@/lib/leagues/landing-content`; soccer content values from `adult-soccer-content.ts`.
- Produces: `SeasonTabs` gains required props `sport: string`, `ruleSections: RuleSection[]`, `faq: FaqEntry[]`, `arenaNote: { title: string; body: string } | null`, and optional `showLevels?: boolean` (default `true`, forwarded to `DivisionsFinder`). `DivisionsFinder` gains optional `showLevels?: boolean` (default `true`).

- [ ] **Step 1: Parameterize SeasonTabs**

In `src/components/leagues/season-tabs.tsx`:
- Remove `import { RULE_SECTIONS, FAQ } from "@/lib/leagues/adult-soccer-content"`; add the new props to the function signature; render `props.ruleSections` and `props.faq` where the imports were used.
- `trackSeasonViewed({ sport: "soccer", term })` → `trackSeasonViewed({ sport, term })`.
- The hardcoded note block containing `<strong>Walled-arena 7v7.</strong> All Aspire fields have boards — no offside, the wall is in play.` (~line 67): keep the wrapper element and classes, substitute `{arenaNote && (<... ><strong>{arenaNote.title}</strong> {arenaNote.body}</...>)}` where `<...>` is the existing wrapper.
- Forward `showLevels` to `<DivisionsFinder ... showLevels={showLevels ?? true} />`.

- [ ] **Step 2: Add `showLevels` to DivisionsFinder**

In `src/components/leagues/divisions-finder.tsx` (default `showLevels = true`; when `false`):
- Do not render the `LevelLadder` facet block (the gender/day/venue facets stay).
- Division card meta (~line 113): render `{d.gender === "mens" ? "Men's" : d.gender === "womens" ? "Women's" : "Coed"}` and append `· Level {d.level.toUpperCase()}` only when `showLevels`.
- Hide the `<Bars .../>` element (~line 109) when `!showLevels`.
- Leave all filtering logic untouched (`level: "open"` already passes every level filter).

- [ ] **Step 3: Update soccer's `[term].astro` call site**

```jsx
<SeasonTabs client:load
  sport="soccer"
  divisions={divisions} venues={venues} weekStart={startDate}
  scheduleNote="One game per week per team. Exact slots assigned after rosters lock."
  term={term ?? ""}
  ruleSections={RULE_SECTIONS} faq={FAQ}
  arenaNote={{ title: "Walled-arena 7v7.", body: "All Aspire fields have boards — no offside, the wall is in play." }} />
```

(Add `RULE_SECTIONS, FAQ` to the existing `adult-soccer-content` import in that file. Do not pass `showLevels` — soccer keeps the default `true`.)

- [ ] **Step 4: Verify soccer term page unchanged**

Run: `npx tsc --noEmit` — zero errors.
Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- adult-soccer-season` — the fall-2026 division-filter spec must PASS. Also eyeball `http://localhost:4321/adult/leagues/soccer/fall-2026`: Rules and FAQ tabs still populated, arena note present.

- [ ] **Step 5: Commit**

```bash
git add src/components/leagues/season-tabs.tsx src/components/leagues/divisions-finder.tsx "src/pages/adult/leagues/soccer/[term].astro"
git commit -m "refactor(leagues): parameterize SeasonTabs/DivisionsFinder by sport and content"
```

---

### Task 4: E2E seed fixtures for flag football

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts`

**Interfaces:**
- Consumes: existing seed helpers/patterns in that file (read it first; follow its idempotent upsert-by-slug conventions exactly — fixtures are pinned BY SLUG, never by name).
- Produces: staging rows — sport `flag-football` ("Flag Football"); program `adult-4v4-flag-football` ("Adult 4v4 Flag Football League", `programType: "league"`, `audienceType: "adults"`); an Adult 18–99 age group (reuse the existing adult age-group fixture if the seed already creates one); four seasons with slugs `winter-1-2627-flag-mens`, `winter-1-2627-flag-coed` (status `open`) and `winter-2-2027-flag-mens`, `winter-2-2027-flag-coed` (status `forming`/upcoming per the seed's convention for not-yet-open seasons).

- [ ] **Step 1: Read the seed file and add the fixtures**

Season field values (all four): location Worthington fixture, `dayOfWeek: "wed"`, `startTime: "18:00"`, `endTime: "23:00"`, `pricingMode: "per_team"`, teamPrice 79500 (cents — confirm the unit the seed uses for soccer and match it), price 10500, deposit 20000, `allowDeposit: true`, `signupModes: ["team","individual"]`, `divisionGender: "mens"` / `"coed"`, `skillLevel: null`, `maxParticipants: 100000` (a low capacity silently waitlists at Pay and has broken e2e before), term slug/label `winter-1-2627` / "Winter 1 2026-27" and `winter-2-2027` / "Winter 2 2027", dates 2026-11-09–2027-01-17 and 2027-01-18–2027-03-20, Winter 1 `registrationCloses` ≈ 2026-10-29T12:00Z.

- [ ] **Step 2: Run the seed and verify**

Run: `./scripts/with-bws.sh npm run db:seed:e2e` (staging DB — the seed is guarded and idempotent). Then with the dev server up: `curl -s "http://localhost:4321/api/public/seasons?sport=flag-football&audience=adult" | python3 -m json.tool | head -40` — expect the two Winter 1 seasons with `termSlug: "winter-1-2627"`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "test(flag): e2e seed fixtures for flag football winter seasons"
```

---

### Task 5: Flag football landing page

**Files:**
- Create: `src/pages/adult/leagues/flag-football/index.astro`
- Test: `tests/e2e/flag-football-landing.spec.ts` (created here, extended in Task 6)

**Interfaces:**
- Consumes: `LandingTabs` (Task 2), flag content module (Task 1), `partitionTerms`/`TermSeason` from `@/lib/leagues/terms`, `breadcrumbJsonLd` from `@/lib/seo/breadcrumbs`, seed data (Task 4).
- Produces: route `/adult/leagues/flag-football`.

- [ ] **Step 1: Write the failing e2e test**

```typescript
// tests/e2e/flag-football-landing.spec.ts
import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "";

test("flag football landing: hero, tabs, divisions explainer @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/flag-football`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /flag football/i }).first()).toBeVisible();
  await expect(page.getByTestId("landing-tabs")).toBeVisible();
  await expect(page.getByRole("heading", { name: /nobody blocks/i })).toBeVisible();
  await expect(page.getByText("Men's 4v4")).toBeVisible();
  await page.getByRole("button", { name: "Upcoming" }).click();
  await expect(page.getByText(/Winter 2 2027/)).toBeVisible();
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- flag-football-landing`
Expected: FAIL — the route 404s.

- [ ] **Step 3: Build the page**

Create `src/pages/adult/leagues/flag-football/index.astro` mirroring soccer's `index.astro` frontmatter (fetch live + completed with `sport=flag-football&audience=adult`, `partitionTerms`, the same `venuesIn`/`divsIn`/`fmtRange` helpers, `currentProp`/`upcomingProps`/`pastProps`). Differences:

- `<BaseLayout title="Adult Flag Football Leagues — Indoor 4v4 in Columbus | Aspire Sports" description={\`Men's and coed indoor 4v4 flag football leagues at Worthington, Columbus. ${FORMAT_FACTS.slice(0, 3).join(" · ")}. Team and free-agent signup.\`}>`
- Hero `<h1>`: `Adult flag football<br/>at Aspire.` Sub: `Men's & coed indoor 4v4 — every player runs a route, every single play. Wednesday nights at Worthington.` Facts line: `{FORMAT_FACTS.slice(0, 4).join(" · ")}`. "Now Registering" banner identical to soccer's but hrefs use `/adult/leagues/flag-football/${currentProp.slug}`. Hero photo: reuse soccer's gradient treatment with an Unsplash flag/football turf image (same URL pattern, `auto=format&fit=crop&w=1600&q=60`).
- JSON-LD in the layout slot (three `<script type="application/ld+json" set:html={JSON.stringify(...)} />` tags, exactly the `/sports/[slug]` approach): `faqSchema` built from the content module's `FAQ` (`@type: "FAQPage"`, `mainEntity` mapping q/a to Question/Answer); `sportSchema` `{"@context":"https://schema.org","@type":"SportsActivityLocation",name:"Aspire Sports Flag Football — Columbus, Ohio",sport:"Flag Football",url:"https://aspiresportsohio.com/adult/leagues/flag-football",areaServed:{"@type":"City",name:"Columbus",containedInPlace:{"@type":"State",name:"Ohio"}},parentOrganization:{"@type":"SportsOrganization",name:"Aspire Sports",url:"https://aspiresportsohio.com"}}`; `breadcrumbJsonLd([{name:"Home",url:\`${ORIGIN}/\`},{name:"Adult",url:\`${ORIGIN}/adult\`},{name:"Adult Leagues",url:\`${ORIGIN}/adult/leagues\`},{name:"Flag Football",url:\`${ORIGIN}/adult/leagues/flag-football\`}])` with `const ORIGIN = import.meta.env.PUBLIC_APP_URL || "https://aspiresportsohio.com"`.
- Tabs island:

```jsx
<LandingTabs client:load
  sport="flag-football"
  basePath="/adult/leagues/flag-football"
  overview={{
    kicker: "Why 4v4 flag football",
    headline: { before: "Every player, ", em: "every play", after: " — nobody blocks, everybody catches." },
    intro: "Four a side on boarded indoor turf sized beyond the official NFL Blitz indoor spec — a faster, everyone-touches-it game you can play all winter.",
    why: WHY_4V4,
    midLabel: "The divisions",
    midSlot: { kind: "divisions", items: DIVISION_CALLOUTS },
  }}
  ruleSections={RULE_SECTIONS}
  pastEmptyCopy="No completed seasons yet — Winter 1 2026-27 is the first. Results & champions will appear here."
  current={currentProp} upcoming={upcomingProps} past={pastProps} />
```

- [ ] **Step 4: Run the e2e test, verify it passes**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- flag-football-landing`
Expected: PASS. Also verify in a browser (both light rendering and that JSON-LD scripts appear in view-source).

- [ ] **Step 5: Commit**

```bash
git add src/pages/adult/leagues/flag-football/index.astro tests/e2e/flag-football-landing.spec.ts
git commit -m "feat(flag): adult flag football landing page with JSON-LD"
```

---

### Task 6: Flag football term page

**Files:**
- Create: `src/pages/adult/leagues/flag-football/[term].astro`
- Modify: `tests/e2e/flag-football-landing.spec.ts` (add the term-page test)

**Interfaces:**
- Consumes: `SeasonTabs` with Task 3's props; flag content module; seed data (`winter-1-2627`).
- Produces: route `/adult/leagues/flag-football/[term]`; empty terms redirect to `/adult/leagues/flag-football`.

- [ ] **Step 1: Add the failing e2e test**

Append to `tests/e2e/flag-football-landing.spec.ts`:

```typescript
test("flag football term page: divisions render without skill levels @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/flag-football/winter-1-2627`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /Winter 1 2026-27/ })).toBeVisible();
  await expect(page.getByText("Coed", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Level [A-D]/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Register/ }).first()).toBeVisible();
});
```

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- flag-football-landing` → new test FAILS (404).

- [ ] **Step 2: Build the term page**

Copy soccer's `[term].astro` structure into `src/pages/adult/leagues/flag-football/[term].astro` with these substitutions:
- Fetch `sport=flag-football`; empty → `return Astro.redirect("/adult/leagues/flag-football")`.
- Imports from `@/lib/leagues/adult-flag-football-content` (`FORMAT_FACTS, RULE_SECTIONS, FAQ`).
- Title: `` `${termLabel} Adult Flag Football — Indoor 4v4 | Aspire Sports` ``; description: `` `Register for ${termLabel} adult indoor 4v4 flag football at Worthington. ${FORMAT_FACTS.slice(0,3).join(" · ")}.` ``
- Hero `<h1>`: `{termLabel} · Flag Football`; the facts `<p>` reads `Indoor 4v4 · {startDate} – {endDate} · 8-game season, no playoffs · {divisions.length} divisions` (drop the venue count — single venue).
- The `divisions` mapping, `fmtTime`, `statusRank`, `STATUS_LABEL`, hero CTAs (`hero-register` testid) all stay identical.
- Island call:

```jsx
<SeasonTabs client:load
  sport="flag-football"
  divisions={divisions} venues={venues} weekStart={startDate}
  scheduleNote="One game per week per team, Wednesday nights. Exact slots assigned after rosters lock."
  term={term ?? ""}
  ruleSections={RULE_SECTIONS} faq={FAQ}
  arenaNote={{ title: "Boarded-turf 4v4.", body: "Fully boarded indoor turf, bigger than the NFL Blitz indoor spec — the ball stays in, the game stays fast." }}
  showLevels={false} />
```

- [ ] **Step 3: Run the e2e tests, verify they pass**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- flag-football-landing`
Expected: both tests PASS. Click through Register → the existing wizard opens at `/register/<seasonId>` (team + individual both offered — the wizard reads `signupModes`).

- [ ] **Step 4: Commit**

```bash
git add "src/pages/adult/leagues/flag-football/[term].astro" tests/e2e/flag-football-landing.spec.ts
git commit -m "feat(flag): per-term flag football division page"
```

---

### Task 7: Wholesale SEO — soccer landing JSON-LD + sitemap entries

**Files:**
- Modify: `src/pages/adult/leagues/soccer/index.astro`
- Modify: `src/lib/seo/aspire-sitemap-pages.mjs`
- Test: `tests/unit/` — check for an existing sitemap/tenant-seo test (`tests/unit/tenant-seo.test.ts`) and extend it if it asserts the Aspire page list.

**Interfaces:**
- Consumes: `breadcrumbJsonLd`, soccer `FAQ` (already exported), the `/sports/[slug]` JSON-LD shapes from Task 5.
- Produces: soccer landing emits FAQPage + SportsActivityLocation + BreadcrumbList; `ASPIRE_SSR_PUBLIC_PAGES` includes both league landings.

- [ ] **Step 1: Add JSON-LD to the soccer landing**

In `src/pages/adult/leagues/soccer/index.astro`, add the same three schema objects as Task 5 with soccer values: FAQPage from soccer `FAQ`; SportsActivityLocation with `name: "Aspire Sports Adult Soccer — Columbus, Ohio"`, `sport: "Soccer"`, `url: "https://aspiresportsohio.com/adult/leagues/soccer"`; breadcrumb Home → Adult → Adult Leagues → Soccer. Render the three `<script type="application/ld+json">` tags inside `<BaseLayout>`.

- [ ] **Step 2: Add both landings to the sitemap list**

In `src/lib/seo/aspire-sitemap-pages.mjs` append to `ASPIRE_SSR_PUBLIC_PAGES`:

```js
  "/adult/leagues/soccer",
  "/adult/leagues/flag-football",
```

- [ ] **Step 3: Verify**

Run: `npx vitest run tests/unit/tenant-seo.test.ts` — update the test's expected page list if it enumerates `ASPIRE_SSR_PUBLIC_PAGES` (it should now include both new entries), and re-run to PASS. With the dev server up: `curl -s http://localhost:4321/sitemap.xml | grep -c "adult/leagues"` → includes the new URLs (dev serves the inline fallback). View-source the soccer landing → three JSON-LD scripts.

- [ ] **Step 4: Commit**

```bash
git add src/pages/adult/leagues/soccer/index.astro src/lib/seo/aspire-sitemap-pages.mjs tests/unit/tenant-seo.test.ts
git commit -m "feat(seo): JSON-LD on league landings + sitemap entries for both sports"
```

---

### Task 8: Hub tile + about-page copy

**Files:**
- Modify: `src/pages/adult/leagues.astro`
- Modify: `src/pages/about.astro`

**Interfaces:**
- Consumes: existing `[data-sport-tile]` click-tracking script in `leagues.astro` (fires `trackCatalogSportTileClicked` automatically from the data attributes).
- Produces: a live Flag Football tile; corrected launch copy.

- [ ] **Step 1: Add the Flag Football tile**

In `src/pages/adult/leagues.astro`, change the tile grid class from `grid sm:grid-cols-3 gap-3 mt-6` to `grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6`, and insert after the soccer tile:

```html
<a href="/adult/leagues/flag-football" data-sport-tile data-sport="flag-football" data-state="live" class="relative rounded-2xl p-4 text-ink overflow-hidden" style="background:oklch(0.75 0.14 85)">
  <div class="font-mono text-[9px] tracking-widest uppercase opacity-80">● Now registering</div>
  <div class="font-display font-semibold text-2xl mt-1.5">Flag Football</div>
  <div class="font-mono text-xs">Winter 1 · 4v4 · Men's &amp; Coed</div>
  <span class="absolute right-4 bottom-4 font-semibold text-lg">→</span>
</a>
```

(Ochre-family background per the design system; text stays `text-ink` like the soccer tile. Basketball/volleyball tiles stay coming-soon.)

- [ ] **Step 2: Correct the about-page copy**

In `src/pages/about.astro`, exactly two edits:
- ~line 73: `with youth programming at our Worthington facility. Flag football follows in 2027.` → `with youth programming at our Worthington facility. Adult 4v4 flag football joins this winter at Worthington.`
- ~line 294 (timeline entry): `date: 'Winter 2027',` → `date: 'Winter 2026–27',` (title `'Flag football season 1.'` and body stay — still accurate).
- Leave the principle quote (~line 171, "soccer-only at launch … follows a season later") and the 2027 hiring paragraph (~line 224) unchanged — both remain true.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`. With the dev server: `/adult/leagues` shows four tiles, flag tile links to the landing; `/about` shows the new copy. Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- league-lead-in category-pages` — the hub specs must still PASS (they select the soccer tile by name and the hero/cross-links; the fourth tile doesn't collide).

- [ ] **Step 4: Commit**

```bash
git add src/pages/adult/leagues.astro src/pages/about.astro
git commit -m "feat(flag): live hub tile + corrected launch copy on about page"
```

---

### Task 9: Catalog runbook + full verification

**Files:**
- Create: `docs/runbooks/flag-football-catalog-launch.md`
- No code changes (verification task).

**Interfaces:**
- Consumes: everything prior.
- Produces: a go-live runbook for the owner; a green branch ready for PR.

- [ ] **Step 1: Verify the admin path for sport creation**

`POST /api/admin/sports` exists. Confirm the admin UI at `/admin/sports` (directory `src/pages/admin/sports/`) offers a create form. Sign in locally as `admin@test.aspiresports.com` / `TestAdmin123!` and check. If the UI cannot create a sport, document the API fallback in the runbook (an authenticated POST from the admin session — this is the supported admin API, not a seed script); only build a create form if the API also can't serve the need (it can — don't build UI in this plan).

- [ ] **Step 2: Write the runbook**

`docs/runbooks/flag-football-catalog-launch.md` — exact steps the owner performs in the **prod** admin, with a values table straight from the Global Constraints (sport `flag-football`; program "Adult 4v4 Flag Football League", league/adults; Adult 18–99 age group; 4 seasons: Winter 1 mens/coed **open** + Winter 2 mens/coed **upcoming**, Wednesdays, Worthington, per_team $795 / $105 / $200 deposit, signup modes team+individual, terms `winter-1-2627` / `winter-2-2027` with the exact date windows, Winter 1 registration close ≈ Oct 29 2026, early-bird optional and **team-only** per league policy). Include post-creation checks: `/adult/leagues/flag-football` shows the Now Registering banner, `/sports/flag-football` resolves, a $0-risk test of the register flow stops before payment.

- [ ] **Step 3: Full local verification (pre-push checklist)**

With the dev server up (started with `R2_MOCK=1 CRON_SECRET=<x>` via `./scripts/with-bws.sh`):
1. `npx vitest run tests/unit/` — all green.
2. `CRON_SECRET=<same> TEST_BASE_URL=http://localhost:4321 npm run test:api` — no regressions vs the known staging-data failures.
3. `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- flag-football-landing adult-soccer-season league-lead-in category-pages landing-pages` — all green.
4. `./scripts/with-bws.sh npm run build` — succeeds (catches SSR/prerender mistakes).
5. `npx tsc --noEmit` — zero errors.

- [ ] **Step 4: Commit and push**

```bash
git add docs/runbooks/flag-football-catalog-launch.md
git commit -m "docs(flag): prod catalog go-live runbook"
git push -u origin feat/flag-football-landing
```

Open the PR with a summary linking the spec; wait for CI green on origin before declaring done (a push isn't done until CI passes).

---

## Self-review notes

- Spec coverage: routes (T5/T6), content module + guide doc (T1), component generalization incl. SeasonTabs implied by `[term]` mirroring (T2/T3), catalog via admin + verification (T9), JSON-LD both sports + sitemap (T5/T7), hub tile + about copy (T8), unit + e2e tests (T1/T4/T5/T6), out-of-scope items untouched.
- The e2e seed task (T4) precedes the page tasks because the pages render from live season data; without fixtures the landing has no current term and the term page redirects.
- Cents-vs-dollars for seed prices is flagged in T4 Step 1 — match whatever unit the soccer fixtures use in that file rather than assuming.
