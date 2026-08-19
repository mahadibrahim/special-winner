# Youth Soccer Leagues Two-Path Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/youth/leagues/soccer` as the owner-approved two-path page (Competitive club-team entry / Developmental individual signup) with direct on-page booking, and 302 `/youth/leagues` to it.

**Architecture:** The shared `youth-sport-league-page.astro` body is recomposed to the approved mockup (`docs/superpowers/specs/2026-08-18-youth-leagues-two-path-mockup.html` — the design source of truth; consult it for any visual question). Live data flows through the existing finder chain: `CategoryFinder` gains an opt-in `layout="table"` that renders division rows instead of cards, plus opt-in level chips. A pure helper (`division-row-model.ts`) decides each row's badge/price/CTA so it is unit-testable. The page's existing server-side seasons fetch also feeds the new deadline banner and the inline division rows in the type cards (server-rendered, crawlable). Authored copy lives in one new constants file the owner can edit in one place.

**Tech Stack:** Astro 5 + React 19 islands, Tailwind 4, Vitest (unit), Playwright (e2e).

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-18-youth-leagues-two-path-mockup.html`. Spec: `docs/superpowers/specs/2026-08-18-youth-leagues-two-path-design.md`.
- League-type labels are **Competitive** and **Developmental** — "Winter" is only ever the season window (**Nov – late March**).
- Never author dollar figures, dates, or spots-left counts — all from the catalog. Mockup's `$1,150`/`$195`/`Nov 8` are samples.
- Commitment facts are owner-directed Arena placeholders, in ONE constant: 1 game/week · no required practices · 6–10 games/season · 45–50 min games (varies by league) · Sat & Sun, 7am–8pm.
- Body text spans the full content column — NO `max-w-[...]` measure caps on paragraphs (owner rule, 2026-08-18).
- No Director of Coaching content on league surfaces (owner mandate).
- Rules & regulations / Reschedules cards and club-team FAQ answers are OUT — owner content pending. No stub pages, no invented policy.
- Youth-only: do not change any default the adult pages consume; new finder behavior must be opt-in props (like `cardVariant="youth-band"` was).
- Edge cache: `setMarketingEdgeCache(Astro)` only after a successful catalog fetch (existing contract in the page).
- All commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Run all commands from the worktree root `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/fix-meta-autofill-noise` (subagents: use absolute paths — do NOT operate on the main checkout).
- Dev server for browser checks: `./scripts/with-bws.sh npx astro dev --port 4455` (may already be running).

---

### Task 1: Authored constants + LEAGUE_KINDS relabel + venue access facts

**Files:**
- Create: `src/lib/youth/league-page-content.ts`
- Modify: `src/lib/youth/landing-content.ts` (LEAGUE_KINDS block, lines ~89-110)
- Modify: `src/lib/locations/venue-facts.ts` (add `highwayAccess` to the two venues)
- Test: none new (constants; consumers are tested in later tasks). Type check gates.

**Interfaces:**
- Produces: `COMMITMENT_FACTS: { label: string; value: string }[]`,
  `DEADLINE_BANNER: { urgency: string; cta: string }`,
  `CLUB_TEAM_PROMISES: string[]`, `CLUB_CARD: { kicker: string; heading: string; body: string; emailCta: string; enterCta: string }`,
  `LEAGUE_TYPE_CARDS: { competitive: {...}, developmental: {...} }` (see code) — all from `@/lib/youth/league-page-content`.
- Produces: `LEAGUE_KINDS` with `name: "Competitive" | "Developmental"` (relabeled in place; same shape).
- Produces: `VenueFacts.highwayAccess?: string`.

- [ ] **Step 1: Create the constants file**

```typescript
// src/lib/youth/league-page-content.ts
// Owner-editable copy for the youth league pages (two-path composition).
// Every fact below is owner-directed (2026-08-18): the commitment numbers
// are Arena-copy placeholders the owner will tune — change them HERE only.
// Design: docs/superpowers/specs/2026-08-18-youth-leagues-two-path-design.md

/** "The commitment, up front." facts band. */
export const COMMITMENT_FACTS: { label: string; value: string; sub?: string }[] = [
  { label: "Games", value: "1 per week" },
  { label: "Practices", value: "None required" },
  { label: "Season", value: "6–10 games" },
  { label: "Game length", value: "45–50 minutes", sub: "varies by league" },
  { label: "Game days", value: "Sat & Sun, 7am–8pm" },
]

/** Copy shell around the live term facts in the top deadline banner. */
export const DEADLINE_BANNER = {
  /** Rendered before the live "closes <date>" fact. */
  urgency: "divisions fill fast",
  cta: "Claim your spot →",
}

/** "Bringing a whole team?" section. */
export const CLUB_TEAM_PROMISES = [
  "One team fee, split online — the captain reserves the spot, every family pays their own share.",
  "Your division's schedule is published before week 1.",
  "Games on Saturdays and Sundays only — no weeknight travel.",
]

export const CLUB_CARD = {
  heading: "Spots go fast. Claim yours.",
  body: "Tell us your age group and level and we'll place your team in the right division — or enter directly above.",
  enterCta: "Enter your team →",
  emailCta: "Email us about winter entry",
}

/** The two league-type cards (#types). Division rows render live under these. */
export const LEAGUE_TYPE_CARDS = {
  competitive: {
    kicker: "Winter · November – late March",
    heading: "Competitive — for club teams",
    body:
      "Competitive indoor play for club teams who want to keep their season going through the cold months. Enter your full team; the roster registers and pays online.",
    urgency: "● Claim your winter spot — divisions fill fast",
    facts: [
      { label: "For", value: "Established teams" },
      { label: "Play", value: "Sat & Sun" },
      { label: "Entry", value: "Team registration" },
    ],
    allLink: "All winter divisions ↓",
  },
  developmental: {
    kicker: "Spring, summer & fall",
    heading: "Developmental — for individual players",
    body:
      "Built for touches and guidance. Coaches talk players through the game while it is happening, and what they took from it matters more than the scoreline. Sign your kid up solo — we build balanced teams.",
    urgency: null as string | null,
    facts: [
      { label: "For", value: "Individual players" },
      { label: "Teams", value: "We build them" },
      { label: "Signup", value: "Per player" },
    ],
    allLink: "All open age groups ↓",
  },
}
```

- [ ] **Step 2: Relabel LEAGUE_KINDS in `src/lib/youth/landing-content.ts`**

Replace the existing `LEAGUE_KINDS` array values (keep the `LeagueKind` shape and export name — the hub consumes it too):

```typescript
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
]
```

- [ ] **Step 3: Add `highwayAccess` to venue facts**

In `src/lib/locations/venue-facts.ts`: add to the `VenueFacts` interface

```typescript
  /** Short driving-access line, e.g. "Easy on and off I-270". Owner-supplied. */
  highwayAccess?: string
```

and set on the two venues that host youth leagues (match existing slugs in the file — Worthington gets `"Easy on and off I-270"`, the Downtown Columbus venue gets `"Easy on and off I-71"`).

- [ ] **Step 4: Grep LEAGUE_KINDS consumers and eyeball copy fit**

Run: `grep -rn "LEAGUE_KINDS" src/`
Expected consumers: `youth-sport-league-page.astro`, the `/youth` hub (and possibly `/youth/[sport]`). Open each hit and confirm the new `name` values ("Competitive"/"Developmental") read correctly in their headings (they render `k.name` as a card title — no string concatenation that assumes "Winter").

- [ ] **Step 5: Type check + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/lib/youth/league-page-content.ts src/lib/youth/landing-content.ts src/lib/locations/venue-facts.ts
git commit -m "feat(youth): league-page copy constants; Competitive/Developmental relabel; venue highway facts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Division row model (pure helper, TDD)

**Files:**
- Create: `src/lib/leagues/division-row-model.ts`
- Test: `tests/unit/division-row-model.test.ts`

**Interfaces:**
- Consumes: the season objects returned by `/api/public/seasons` (fields used: `id`, `name`, `skillLevel`, `teamPrice`, `effectiveTeamPrice`, `teamEarlyBirdActive`, `price`, `earlyBirdPrice`, `earlyBirdDeadline`, `spotsLeft`, `dayOfWeek`, `startDate`, `termLabel`, `minAge`, `maxAge`, `divisionGender`, `status`).
- Produces: `divisionRowModel(season): DivisionRowModel` and the type:

```typescript
export interface DivisionRowModel {
  id: string
  /** e.g. "U10 boys" — division label from ages + gender. */
  group: string
  /** "competitive" when the season sells team entry, else "developmental". */
  kind: "competitive" | "developmental"
  /** Chip text: "Competitive" | "Developmental". */
  kindLabel: string
  seasonName: string
  termLabel: string | null
  /** "Sat · starts Dec 6" style; null parts omitted. */
  meta: string
  /** Dollars. Team rows use effectiveTeamPrice, individual rows use price. */
  price: number
  priceUnit: "per team" | "per kid"
  /** Struck-through base price when early-bird is active, else null. */
  basePrice: number | null
  /** "/register/<id>?mode=team" for team rows, "/register/<id>" otherwise. */
  href: string
  cta: string // "Enter team →" | "Book →"
  /** Honest scarcity: spotsLeft when the season caps participants, else null. */
  spotsLeft: number | null
}
```

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/division-row-model.test.ts
import { describe, it, expect } from "vitest"
import { divisionRowModel } from "@/lib/leagues/division-row-model"

const base = {
  id: "s1",
  name: "Youth Soccer League — Winter I",
  skillLevel: null as string | null,
  teamPrice: null as number | null,
  effectiveTeamPrice: null as number | null,
  teamEarlyBirdActive: false,
  price: 195,
  earlyBirdPrice: null as number | null,
  earlyBirdDeadline: null as string | null,
  spotsLeft: null as number | null,
  dayOfWeek: "Saturday",
  startDate: "2026-11-08",
  termLabel: "Winter I",
  minAge: 8,
  maxAge: 9,
  divisionGender: null as string | null,
  status: "registration_open",
}

describe("divisionRowModel", () => {
  it("team-priced season → competitive team row", () => {
    const row = divisionRowModel({
      ...base,
      teamPrice: 1150,
      effectiveTeamPrice: 1150,
      divisionGender: "boys",
    })
    expect(row.kind).toBe("competitive")
    expect(row.kindLabel).toBe("Competitive")
    expect(row.href).toBe("/register/s1?mode=team")
    expect(row.cta).toBe("Enter team →")
    expect(row.price).toBe(1150)
    expect(row.priceUnit).toBe("per team")
    expect(row.group).toContain("boys")
  })

  it("individual season → developmental row booking per kid", () => {
    const row = divisionRowModel(base)
    expect(row.kind).toBe("developmental")
    expect(row.href).toBe("/register/s1")
    expect(row.cta).toBe("Book →")
    expect(row.price).toBe(195)
    expect(row.priceUnit).toBe("per kid")
  })

  it("active team early-bird shows discounted price with struck base", () => {
    const row = divisionRowModel({
      ...base,
      teamPrice: 1150,
      effectiveTeamPrice: 1050,
      teamEarlyBirdActive: true,
    })
    expect(row.price).toBe(1050)
    expect(row.basePrice).toBe(1150)
  })

  it("no early-bird → basePrice null (nothing to strike)", () => {
    expect(divisionRowModel(base).basePrice).toBeNull()
    expect(
      divisionRowModel({ ...base, teamPrice: 1150, effectiveTeamPrice: 1150 }).basePrice,
    ).toBeNull()
  })

  it("spotsLeft passes through only when capped", () => {
    expect(divisionRowModel({ ...base, spotsLeft: 3 }).spotsLeft).toBe(3)
    expect(divisionRowModel(base).spotsLeft).toBeNull()
  })

  it("group derives U-label from maxAge and appends gender", () => {
    expect(divisionRowModel({ ...base, minAge: 9, maxAge: 10 }).group).toBe("U10")
    expect(
      divisionRowModel({ ...base, minAge: 13, maxAge: 14, divisionGender: "girls" }).group,
    ).toBe("U14 girls")
  })

  it("meta joins day and start date, dropping nulls", () => {
    expect(divisionRowModel(base).meta).toBe("Sat · starts Nov 8")
    expect(divisionRowModel({ ...base, dayOfWeek: null as any }).meta).toBe("starts Nov 8")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/division-row-model.test.ts`
Expected: FAIL — cannot resolve `@/lib/leagues/division-row-model`.

- [ ] **Step 3: Implement**

```typescript
// src/lib/leagues/division-row-model.ts
// Pure presentation model for one division row on the youth league pages —
// the single place that decides team-vs-individual economics for display.
// A season SELLS TEAM ENTRY iff the catalog priced it per team
// (teamPrice != null); that, not skillLevel, is the load-bearing
// discriminator, so a mislabeled level can never route a parent into the
// team checkout. The charge path recomputes everything server-side — these
// fields are display-only, same contract as /api/public/seasons.

interface SeasonLike {
  id: string
  name: string
  skillLevel: string | null
  teamPrice: number | null
  effectiveTeamPrice: number | null
  teamEarlyBirdActive: boolean
  price: number
  earlyBirdPrice: number | null
  earlyBirdDeadline: string | null
  spotsLeft: number | null
  dayOfWeek: string | null
  startDate: string | null
  termLabel: string | null
  minAge: number | null
  maxAge: number | null
  divisionGender: string | null
  status: string
}

export interface DivisionRowModel {
  id: string
  group: string
  kind: "competitive" | "developmental"
  kindLabel: string
  seasonName: string
  termLabel: string | null
  meta: string
  price: number
  priceUnit: "per team" | "per kid"
  basePrice: number | null
  href: string
  cta: string
  spotsLeft: number | null
}

const DAY_ABBR: Record<string, string> = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu",
  Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
}

function shortStart(startDate: string | null): string | null {
  if (!startDate) return null
  const d = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return `starts ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
}

export function divisionRowModel(season: SeasonLike): DivisionRowModel {
  const team = season.teamPrice != null
  const group = [
    season.maxAge != null ? `U${season.maxAge + 1}` : null,
    season.divisionGender,
  ]
    .filter(Boolean)
    .join(" ")

  const price = team ? (season.effectiveTeamPrice ?? season.teamPrice!) : season.price
  const basePrice =
    team && season.teamEarlyBirdActive && season.effectiveTeamPrice != null &&
    season.teamPrice != null && season.effectiveTeamPrice < season.teamPrice
      ? season.teamPrice
      : null

  const meta = [
    season.dayOfWeek ? DAY_ABBR[season.dayOfWeek] ?? season.dayOfWeek : null,
    shortStart(season.startDate),
  ]
    .filter(Boolean)
    .join(" · ")

  return {
    id: season.id,
    group,
    kind: team ? "competitive" : "developmental",
    kindLabel: team ? "Competitive" : "Developmental",
    seasonName: season.name,
    termLabel: season.termLabel,
    meta,
    price,
    priceUnit: team ? "per team" : "per kid",
    basePrice,
    href: team ? `/register/${season.id}?mode=team` : `/register/${season.id}`,
    cta: team ? "Enter team →" : "Book →",
    spotsLeft: season.spotsLeft,
  }
}
```

Note: `U${maxAge + 1}` — verify against `src/lib/leagues/youth-age-groups.ts` before committing: a U10 division's players are at most 9 on the Aug 1 cutoff, hence `maxAge` 9 → "U10". If the catalog's `minAge`/`maxAge` semantics differ (grep how `program-card-v2.tsx` renders its age line and copy that rule), adjust the helper AND the test to match the card's existing convention — the two surfaces must agree.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/division-row-model.test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leagues/division-row-model.ts tests/unit/division-row-model.test.ts
git commit -m "feat(youth): pure division-row model for league table + inline rows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Finder table layout + level chips (opt-in, adult-safe)

**Files:**
- Create: `src/components/landing/youth-division-table.tsx`
- Modify: `src/components/landing/seasons-finder-section.tsx` (add `layout` + `levelChips` props; render table when `layout==="table"`)
- Modify: `src/components/landing/category-finder.tsx` (pass through the two new props)
- Test: covered by Task 6 e2e + existing unit test `tests/unit/category-finder-sport.test.ts` must keep passing.

**Interfaces:**
- Consumes: `divisionRowModel` from Task 2; the finder's existing `filtered` seasons array, `ageChips` filtering, `data-finder-empty` empty-state branches (do not duplicate them — table layout reuses the SAME empty-state JSX; only the non-empty branch forks).
- Produces: `<YouthDivisionTable rows={DivisionRowModel[]} onBook={(id: string) => void} />`; `CategoryFinder` props `layout?: "cards" | "table"` (default `"cards"`) and `levelChips?: boolean` (default false). Defaults MUST be byte-identical to current behavior — adult pages and youth classes pass neither.

- [ ] **Step 1: Build the table component**

```tsx
// src/components/landing/youth-division-table.tsx
"use client"
// One row per open division — the direct-booking surface of the youth
// league pages (design: 2026-08-18 two-path mockup). Rows come from
// divisionRowModel so economics/CTA logic stays unit-tested and shared
// with the server-rendered inline rows in the type cards.
import type { DivisionRowModel } from "@/lib/leagues/division-row-model"

export function YouthDivisionTable({
  rows,
  onBook,
}: {
  rows: DivisionRowModel[]
  onBook?: (id: string) => void
}) {
  return (
    <div>
      {/* Header row hides on small screens; rows collapse to two columns. */}
      <div className="hidden sm:grid grid-cols-[1.1fr_1.7fr_1.1fr_0.9fr_auto] gap-3.5 items-center px-1.5 py-3 border-b border-cream-2 font-mono text-[9.5px] tracking-[0.14em] uppercase text-ink-muted text-left">
        <span>Age group</span><span>Season</span><span>Day &amp; start</span><span>Price</span><span />
      </div>
      <ul role="list">
        {rows.map((row) => (
          <li
            key={row.id}
            className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.1fr_1.7fr_1.1fr_0.9fr_auto] gap-1.5 sm:gap-3.5 items-center px-1.5 py-3.5 border-b border-cream-3 last:border-b-0 text-left"
            data-division-row={row.kind}
          >
            <span>
              <span className="font-display font-semibold text-[19px] text-ink">{row.group}</span>
              <span
                className={`font-mono text-[9px] tracking-[0.1em] uppercase rounded-md px-2 py-[3px] ml-2 align-[2px] ${
                  row.kind === "competitive"
                    ? "bg-royal/10 text-royal"
                    : "bg-emerald/15 text-emerald"
                }`}
              >
                {row.kindLabel}
              </span>
            </span>
            <span className="text-[13.5px] text-ink-2">
              {row.seasonName}
              {row.spotsLeft != null && (
                <span className="block font-mono text-[9.5px] tracking-[0.08em] uppercase text-brand-red mt-0.5">
                  ● {row.spotsLeft} {row.kind === "competitive" ? "team spots" : "spots"} left
                </span>
              )}
            </span>
            <span className="text-[13px] text-ink-2">{row.meta}</span>
            <span className="font-display font-semibold text-[19px] text-ink">
              ${row.price.toLocaleString()}
              {row.basePrice != null && (
                <s className="font-sans font-normal text-[12px] text-ink-muted ml-1.5">
                  ${row.basePrice.toLocaleString()}
                </s>
              )}
              <small className="block font-sans font-normal text-[10.5px] text-ink-muted">
                {row.priceUnit}
              </small>
            </span>
            <a
              href={row.href}
              onClick={() => onBook?.(row.id)}
              className={`font-mono text-[10.5px] tracking-[0.1em] uppercase rounded-lg px-3.5 py-2.5 text-cream no-underline whitespace-nowrap justify-self-end ${
                row.kind === "competitive" ? "bg-royal" : "bg-brand-red"
              }`}
            >
              {row.cta}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Wire `layout` + `levelChips` through the finder**

In `seasons-finder-section.tsx`:
1. Extend the props interface: `layout?: "cards" | "table"` and `levelChips?: boolean` next to the existing `cardVariant`/`headerHidden` props (~line 85-90).
2. Add level-filter state alongside the existing day/age filter state: `const [level, setLevel] = useState<"all" | "competitive" | "developmental">("all")`. Filter step (apply after the existing filters, before render): `const rows = filtered.map(divisionRowModel); const levelRows = level === "all" ? rows : rows.filter((r) => r.kind === level)`.
3. When `levelChips` is true render a chip row above the existing chips, same chip styling as the day chips already in the file (copy their classNames):
   "All" / "Competitive (team entry)" / "Developmental (per kid)" — `onClick={() => setLevel(...)}`, active styling matches the day-chip active state.
4. In the non-empty render branch: `layout === "table"` → `<YouthDivisionTable rows={levelRows} onBook={(id) => trackProgramCardClicked?.(...)}/>` (reuse whatever card-click analytics call the card branch makes — grep the file for the card's click tracking and fire the same event with the same shape, `{ seasonId: id }` plus its existing fields). Cards branch stays untouched.
5. Empty states: unchanged — both layouts share the existing `data-finder-empty` branches.

In `category-finder.tsx`: add the two props to its interface and pass them through to `SeasonsFinderSection` (exactly how `cardVariant`/`headerHidden` are passed, lines ~53-56 and ~153-154).

- [ ] **Step 3: Guard the defaults**

Run: `npx vitest run tests/unit/category-finder-sport.test.ts`
Expected: PASS unchanged.
Run: `grep -rn "CategoryFinder" src/pages/adult/ src/pages/youth/classes.astro | head`
Confirm no adult/classes call site passes `layout` or `levelChips` (defaults intact).

- [ ] **Step 4: Type check + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/components/landing/youth-division-table.tsx src/components/landing/seasons-finder-section.tsx src/components/landing/category-finder.tsx
git commit -m "feat(youth): opt-in division-table layout + level chips on the finder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Compact age-lookup row (Astro)

**Files:**
- Create: `src/components/youth/age-lookup-inline.astro`
- Test: e2e in Task 6 (`birthday lookup filters the table`).

**Interfaces:**
- Consumes: `resolveAgeGroup(month, year)` and `YOUTH_AGE_GROUPS` from `@/lib/leagues/youth-age-groups`; `dispatchFinderFilter` from `@/lib/landing/finder-filter`; `track` from `@/lib/analytics/track`.
- Produces: `<AgeLookupInline finderId={string} sportKey={string} />` — one bordered row: mono label, month/year selects, inline answer. Dispatches the same `aspire:finder-filter` event the old ladder did (`ageGroup` key PRESENT-with-undefined to clear — the finder gates on `"ageGroup" in detail`).

- [ ] **Step 1: Build the component**

```astro
---
// Compact "Which group is my kid in?" row for the booking sheet — the
// non-prominent successor to the 14-band ladder (owner: available, not
// prominent). Same resolver + same finder-filter bus as the old ladder, so
// the finder integration is unchanged.
import { YOUTH_AGE_GROUPS } from "@/lib/leagues/youth-age-groups"

interface Props {
  finderId: string
  sportKey: string
}
const { finderId, sportKey } = Astro.props

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const YEARS = [...new Set(
  YOUTH_AGE_GROUPS.flatMap((g) => [
    Number(g.bornFrom.slice(0, 4)),
    Number(g.bornTo.slice(0, 4)),
  ]),
)].sort((a, b) => b - a)
---

<div
  class="flex items-center gap-3.5 flex-wrap bg-cream border border-cream-3 rounded-xl px-4 py-3 mx-1.5 mt-3.5 mb-1"
  data-age-lookup-inline
  data-finder={finderId}
  data-sport={sportKey}
>
  <label class="font-mono text-[9.5px] tracking-[0.14em] uppercase text-ink-muted" for="age-lookup-month">
    Which group is my kid in?
  </label>
  <select id="age-lookup-month" class="text-[13px] border border-cream-3 bg-paper rounded-lg px-2.5 py-1.5 text-ink">
    <option value="">Month born</option>
    {MONTHS.map((m, i) => <option value={i + 1}>{m}</option>)}
  </select>
  <select id="age-lookup-year" class="text-[13px] border border-cream-3 bg-paper rounded-lg px-2.5 py-1.5 text-ink">
    <option value="">Year born</option>
    {YEARS.map((y) => <option value={y}>{y}</option>)}
  </select>
  <p id="age-lookup-answer" class="text-[13px] text-ink hidden" role="status" aria-live="polite"></p>
</div>

<script>
  import { resolveAgeGroup } from "@/lib/leagues/youth-age-groups"
  import { dispatchFinderFilter } from "@/lib/landing/finder-filter"
  import { track } from "@/lib/analytics/track"

  const root = document.querySelector<HTMLElement>("[data-age-lookup-inline]")
  if (root) {
    const finderId = root.dataset.finder ?? ""
    const sportKey = root.dataset.sport ?? ""
    const monthEl = document.getElementById("age-lookup-month") as HTMLSelectElement | null
    const yearEl = document.getElementById("age-lookup-year") as HTMLSelectElement | null
    const answerEl = document.getElementById("age-lookup-answer")

    function runLookup() {
      if (!monthEl || !yearEl || !answerEl) return
      const month = Number(monthEl.value)
      const year = Number(yearEl.value)
      if (!month || !year) return
      const group = resolveAgeGroup(month, year)
      answerEl.classList.remove("hidden")
      // `ageGroup: undefined` PRESENT-with-undefined clears the filter —
      // the finder gates on `"ageGroup" in detail` (see age-group-ladder).
      // scroll:false — the answer renders right here.
      if (!group) {
        answerEl.textContent = "That birthday falls outside our U6–U19 groups for this season."
        dispatchFinderFilter(
          { key: sportKey, sectionId: finderId, ageGroup: undefined },
          { scroll: false },
        )
        return
      }
      answerEl.innerHTML = `→ Your kid plays <b class="text-brand-red">${group.label}</b> — rows filtered below`
      dispatchFinderFilter(
        { key: sportKey, sectionId: finderId, ageGroup: group.label },
        { scroll: false },
      )
      track("youth_age_lookup_used", { group: group.label })
    }

    monthEl?.addEventListener("change", runLookup)
    yearEl?.addEventListener("change", runLookup)
  }
</script>
```

- [ ] **Step 2: Verify the finder's age filter applies in table layout**

Read `seasons-finder-section.tsx`'s age-group filter handling (search `ageGroup`): confirm the filter it applies to `filtered` sits UPSTREAM of the Task 3 `filtered.map(divisionRowModel)` — i.e., table rows shrink when the event fires. If the age filter is only applied when `ageChips` is true, decouple: the event-driven filter must work in table layout without chips.

- [ ] **Step 3: Type check + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/components/youth/age-lookup-inline.astro
git commit -m "feat(youth): compact age-lookup row wired to the finder filter bus

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Page recompose + redirects + doc amendments

**Files:**
- Modify: `src/components/youth/youth-sport-league-page.astro` (full template recompose; keep the frontmatter fetch/edge-cache logic)
- Modify: `src/pages/youth/leagues.astro` (replace body with a 302 redirect)
- Modify: `src/pages/youth/leagues/[sport]/index.astro` (unknown sport → `/youth/leagues/soccer` directly)
- Modify: `docs/design-system.md` (Youth band grammar section: add table layout, deadline banner, full-width text rule)
- Modify: `docs/adult-design-reference.md` (§2: mark the measure-cap rule retired 2026-08-18 by owner decision)
- Test: e2e in Task 6; build gate here.

**Interfaces:**
- Consumes: everything from Tasks 1–4: `COMMITMENT_FACTS`, `DEADLINE_BANNER`, `CLUB_TEAM_PROMISES`, `CLUB_CARD`, `LEAGUE_TYPE_CARDS` (Task 1); `divisionRowModel` (Task 2); `CategoryFinder layout="table" levelChips` (Task 3); `AgeLookupInline` (Task 4); plus existing `getVenueFacts`/`VENUE_SLUGS` (now with `highwayAccess`), `partitionTerms`, `filterYouthSeasons`, `SectionJumpBar`, `FeatureBand`, `LandingFaq`, `SeasonCalendarBand`, `TileFactsLine`.
- Produces: the shipped page. Structure below is normative; visual details come from the mockup.

- [ ] **Step 1: Extend the page's server fetch to keep season rows**

In `youth-sport-league-page.astro` frontmatter, the existing try/catch fetch maps rows to `termSeasons` only. Keep that, and ALSO retain the open seasons for the banner + inline rows:

```typescript
import { divisionRowModel, type DivisionRowModel } from "@/lib/leagues/division-row-model"
import {
  COMMITMENT_FACTS, DEADLINE_BANNER, CLUB_TEAM_PROMISES, CLUB_CARD, LEAGUE_TYPE_CARDS,
} from "@/lib/youth/league-page-content"

let openRows: DivisionRowModel[] = []
let bannerDeadline: string | null = null   // earliest registrationCloses among open seasons
let bannerTermLabel: string | null = null
// inside the existing try block, after liveRows is parsed:
const open = filterYouthSeasons(liveRows).filter((s) => s.status === "registration_open")
openRows = open.map(divisionRowModel)
const closes = open
  .map((s) => s.registrationCloses)
  .filter(Boolean)
  .sort()
bannerDeadline = closes[0] ?? null
bannerTermLabel = open[0]?.termLabel ?? currentTerm?.label ?? null
const competitiveRows = openRows.filter((r) => r.kind === "competitive").slice(0, 3)
const developmentalRows = openRows.filter((r) => r.kind === "developmental").slice(0, 3)
```

(`filterYouthSeasons`'s return type must expose the fields `divisionRowModel` needs — it returns the raw API rows filtered, check and cast via the row-model's `SeasonLike` if its declared type is narrower.)

- [ ] **Step 2: Recompose the template to the mockup's section order**

Normative order (ids must match — the jump bar, hero CTAs, and e2e depend on them):

1. **Deadline banner** (before the hero, only when `openRows.length > 0`): full-width `bg-brand-red text-cream` bar; mono message `● {bannerTermLabel} · {bannerDeadline ? \`team entry closes ${short date}\` : "registration open"} · {DEADLINE_BANNER.urgency}`; cream CTA pill (`DEADLINE_BANNER.cta`) → `#open`. Carry over `data-testid="now-registering"`, `data-hero-banner-cta`, `data-term` and the existing `trackLandingCtaClicked` script hook from the old in-hero banner (which this replaces).
2. **Hero**: graded photo (keep `five-aside-turf.jpg` + `graded--emerald`), h1 `Indoor youth {sport} leagues.` — pass through existing `heroTitle` prop reworked: index.astro already passes sport-specific copy; change the registry's `heroTitle` usage so soccer renders exactly "Indoor youth soccer leagues." (edit `src/lib/leagues/youth-sports.ts` heroTitle values to the "Indoor youth <sport> leagues." form and render `{heroTitle}` as the FULL h1 — no more "at Aspire." suffix). Subhead (full width, no measure cap): `U6 to U19, all year — **competitive winter leagues for club teams**, and **developmental leagues** where individual players sign up and we build the teams.` Then the two path tiles (royal/emerald, `→ #types`) from `LEAGUE_TYPE_CARDS` kicker/heading data, and the crosslink line: `Every game indoors, one game a week, Saturdays & Sundays. Also at Aspire: <a href="/youth/leagues/futsal">youth futsal →</a>` (on the futsal page, link to soccer instead: build the crosslink from the OTHER live sport in `YOUTH_LEAGUE_SPORTS`).
3. **Jump bar**: `#types` League types · `#open` Book now · `#commitment` The commitment · `#teams` Club teams · `#info` League info · `#venues` Venues · `#calendar` Calendar · `#faq` FAQs.
4. **League types** (`#types`): h2 `Two kinds of league. <span class="text-brand-red">Book from right here.</span>`, full-width lede, two cards from `LEAGUE_TYPE_CARDS` (royal competitive / emerald developmental) each with kicker, heading, body, competitive-only urgency strip, `facts` dl, then server-rendered `competitiveRows`/`developmentalRows` as `<a>` rows (group + meta left, cream `{row.cta} · ${row.price}` pill right — spots-left inline in meta when present), and the `allLink` anchor → `#open`. When a card has zero rows, render the card without the rows block (kicker/body/facts still stand) and point its CTA at `#calendar` (notify) instead of `#open`.
5. **Book** (`#open`): red flood, h2 `Every open division.`, `TileFactsLine` island (sport-scoped, cream) as the live line; then the `-mt-[88px]` paper sheet containing `<AgeLookupInline finderId={FINDER_ID} sportKey={sportSlug} />` and `<CategoryFinder client:load audience="youth" programTypes={["league"]} sport={sportSlug} sectionId={FINDER_ID} layout="table" levelChips ageChips headerHidden title="Open divisions" descriptor="Every open division, one click to checkout." cardVariant="youth-band" />` (cardVariant still governs the empty state styling).
6. **Commitment** (`#commitment`): `bg-paper` band, h2 `The commitment, <span class="text-brand-red">up front.</span>`, facts grid from `COMMITMENT_FACTS` (mono label / serif value, `sub` rendered small under the value), PLUS a wide "Where" fact rendered horizontally: `<a href="/locations/<slug>">` links for each youth venue joined by " or " (from `venueSlugs` + `VENUE_DISPLAY_NAMES`, underlined, inherit color). Footnote line (full width): schedule-before-week-1 + move-notification sentence + highway sentence built from the venues' `highwayAccess` values.
7. **Club teams** (`#teams`): `bg-cream-2` band, h2 `Bringing a <span class="text-brand-red">whole team?</span>`, two-column: left = lede + `CLUB_TEAM_PROMISES` list (red em-dash bullets); right = navy card: mono kicker `Competitive entry · Nov – late Mar`, `CLUB_CARD.heading/body`, red `CLUB_CARD.enterCta` → `#open`, outline `CLUB_CARD.emailCta` → `mailto:` the org contact address — grep `src/lib` for the existing public contact email constant (used on /contact); do not hardcode a new one.
8. **League info** (`#info`): h2 `League info, <span class="text-brand-red">all of it.</span>`; TWO cards only (owner content pending for rules/reschedules): "Schedules & standings" → link to `${basePath}` seasons area — link the current term page when `currentTerm` exists, else `#calendar`; "Refund policy" → `/refund-policy`. Paper cards: mono kicker, serif title, sm body, red go-link.
9. **Venues** (`#venues`): keep the existing venue-cards section, lede gains the highway sentence, card meta line renders `vf.highwayAccess` when present.
10. **How it works**: numbered navy band, 3 steps, unchanged copy from the current shipped version of this file (step 1 body becomes "Every division shows its ages right on the row — or use the birthday lookup above.").
11. **Calendar** (`#calendar`): existing `SeasonCalendarBand` block unchanged.
12. **FAQ** (`#faq`): existing `faqs` prop/`YOUTH_LEAGUE_FAQS` unchanged, heading "Questions parents ask."
13. **Close**: navy band, h2 `See you on <span class="text-emerald-bright">game day.</span>`, lede `Whole team or one kid — book straight from this page in a few minutes.`, red `Book now →` → `#open` + ghost `Competitive team entry →` → `#teams`.

Deletions from the current template: `AgeGroupLadder` import/use (replaced by `AgeLookupInline`), the "Two kinds of season" mid-page section (subsumed by `#types`), the "All seasons" list section (keep the SEO term links — fold `upcomingTerms`/`pastTerms`/`currentTerm` links into a compact line-list INSIDE `#calendar`'s wrapper div above the island, same `<a>`s as today so the crawlable-archive contract holds). Keep both `<script>` blocks (banner analytics + `data-youth-cta` tracking) — every new CTA gets a `data-youth-cta` value following the existing `league-*` naming.

- [ ] **Step 3: Redirect `/youth/leagues` and fix the unknown-sport hop**

`src/pages/youth/leagues.astro` — replace the whole file:

```astro
---
// /youth/leagues → the soccer page, 302 (deliberately temporary): soccer is
// the only real league sport today, and the owner directed a soccer-focused
// page (2026-08-18 two-path design). The URL stays reserved for a future
// multi-sport picker, hence not a 301. Inbound links keep working.
export const prerender = false
return Astro.redirect("/youth/leagues/soccer", 302)
---
```

`src/pages/youth/leagues/[sport]/index.astro` — the unknown-sport branch currently redirects to `/youth/leagues` (which would now double-hop): change to `return Astro.redirect("/youth/leagues/soccer")`.

- [ ] **Step 4: Amend the design docs**

`docs/design-system.md` "Youth band grammar" section — append:

```markdown
- Deadline banner (youth league pages) — full-width brand-red bar above the
  hero: live term + registration deadline, cream CTA pill. Replaces the
  in-hero now-registering banner on league surfaces.
- Division table (`YouthDivisionTable` via `CategoryFinder layout="table"`,
  opt-in) — direct-booking rows: group + Competitive/Developmental badge,
  season, day/start, price with per-team/per-kid unit, row CTA. Level chips
  via `levelChips`.
- League-type labels are Competitive / Developmental; "Winter" only ever
  names the season window (Nov – late March).
- **Full-width body text (owner rule, 2026-08-18):** no max-width measure
  caps on paragraph text. Ledes/subheads/notes span the content column.
```

`docs/adult-design-reference.md` §2 — annotate the measure-cap bullet:

```markdown
- ~~subheads capped at `max-w-[520px]`–`[560px]`~~ **Retired 2026-08-18 by
  owner decision — body text spans the full content column. Existing adult
  pages still carry caps; drop them when touching those pages.**
```

- [ ] **Step 5: Build + browser check + commit**

Run: `npx tsc --noEmit` → zero errors.
Run: `./scripts/with-bws.sh npm run build` → exit 0.
Dev server up (`./scripts/with-bws.sh npx astro dev --port 4455`), then:
- `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:4455/youth/leagues` → `302 …/youth/leagues/soccer`
- Load `http://localhost:4455/youth/leagues/soccer` in a browser: banner (if staging has open seasons), hero, both path tiles, type cards with rows, table with lookup row + chips, commitment facts with linked venues, club band, info cards, venues, calendar, FAQ, close. Compare against the mockup side by side.

```bash
git add src/components/youth/youth-sport-league-page.astro src/pages/youth/leagues.astro "src/pages/youth/leagues/[sport]/index.astro" src/lib/leagues/youth-sports.ts docs/design-system.md docs/adult-design-reference.md
git commit -m "feat(youth): two-path soccer leagues page — deadline banner, direct-booking table, club-team path

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: E2E spec rewrite + full verification

**Files:**
- Modify: `tests/e2e/youth-leagues.spec.ts` (ladder tests → lookup/table tests; banner; redirects)
- Modify: `tests/e2e/category-pages.spec.ts` (`/youth/leagues` test → redirect assertion)
- Test: the specs themselves; run against :4455.

**Interfaces:**
- Consumes: page ids/testids from Task 5 (`#types`, `#open`, `data-testid="now-registering"`, `[data-age-lookup-inline]`, `[data-division-row]`), helpers `waitForHydration` from `../utils/test-helpers`.

- [ ] **Step 1: Rewrite `tests/e2e/youth-leagues.spec.ts`**

Replace the "youth soccer landing" and "youth sport routes" describes (keep the file's `recordFinderFilterEvents` helper and the "youth navigation" + "youth classes v2" describes as-is). New content:

```typescript
test.describe("youth soccer leagues — two-path page", () => {
  test("hero, jump bar, and both path tiles render server-side", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await expect(
      page.getByRole("heading", { level: 1, name: /indoor youth soccer leagues/i }),
    ).toBeVisible()
    await expect(page.locator("[data-jump-link]")).toHaveCount(8)
    await expect(page.locator("#types")).toBeVisible()
    // Two toned type cards, competitive first.
    await expect(page.getByRole("heading", { name: /competitive — for club teams/i })).toBeVisible()
    await expect(page.getByRole("heading", { name: /developmental — for individual players/i })).toBeVisible()
  })

  test("deadline banner is a real anchor when present, absent entirely otherwise", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    const banner = page.locator('[data-testid="now-registering"]')
    if ((await banner.count()) === 0) {
      // No open seasons: nothing renders — no empty banner, no placeholder.
      return
    }
    await expect(banner).toHaveCount(1)
    // The banner CTA anchors into the on-page booking section.
    await expect(banner.locator('a[href="#open"], [data-hero-banner-cta]').first()).toBeVisible()
  })

  test("division table renders open seasons as bookable rows", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    const rows = page.locator("[data-division-row]")
    if ((await rows.count()) === 0) {
      // Empty catalog (staging): the notify empty state must show instead.
      await expect(page.locator("[data-finder-empty]")).toBeVisible()
      return
    }
    // Every row's CTA links straight into /register/<id>.
    const href = await rows.first().locator('a[href^="/register/"]').getAttribute("href")
    expect(href).toMatch(/^\/register\/[^/?]+/)
  })

  test("compact birthday lookup filters the finder, not just styling", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await recordFinderFilterEvents(page)
    await page.selectOption("#age-lookup-month", "3")
    await page.selectOption("#age-lookup-year", "2017")
    await expect(page.locator("#age-lookup-answer")).toContainText("U10")
    expect(await readFinderFilterEvents(page)).toEqual([{ hasAgeGroup: true, ageGroup: "U10" }])
  })

  test("a birthday after August resolves one group younger", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await page.selectOption("#age-lookup-month", "9")
    await page.selectOption("#age-lookup-year", "2017")
    await expect(page.locator("#age-lookup-answer")).toContainText("U9")
  })

  test("shows no format claims", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    const body = await page.locator("main").innerText()
    expect(body).not.toMatch(/\d+v\d+/)
    expect(body).not.toMatch(/size [345] ball/i)
  })
})

test.describe("youth league routing", () => {
  test("/youth/leagues 302s to the soccer page", async ({ page }) => {
    const res = await page.request.get("/youth/leagues", { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers()["location"]).toMatch(/\/youth\/leagues\/soccer$/)
  })

  test("futsal renders the same two-path shape", async ({ page }) => {
    await page.goto("/youth/leagues/futsal", { waitUntil: "domcontentloaded" })
    await expect(page.locator("h1")).toContainText(/futsal/i)
    await expect(page.locator("#types")).toBeVisible()
  })

  test("an unknown sport lands on the soccer page", async ({ page }) => {
    await page.goto("/youth/leagues/hockey", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/youth\/leagues\/soccer\/?$/)
  })

  test("an unknown futsal term lands on the futsal page, not a 404", async ({ page }) => {
    await page.goto("/youth/leagues/futsal/no-such-term", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/youth\/leagues\/futsal\/?$/)
  })
})
```

(Adjust `readFinderFilterEvents` import if it was scoped inside the removed describe — it is module-level today; keep it.)

- [ ] **Step 2: Update `tests/e2e/category-pages.spec.ts`**

Replace the `/youth/leagues` test body:

```typescript
  test("/youth/leagues — forwards to the soccer two-path page", async ({ page }) => {
    // Owner decision 2026-08-18: soccer-focused page; /youth/leagues 302s
    // while soccer is the only league sport.
    await page.goto("/youth/leagues", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/youth\/leagues\/soccer$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /indoor youth soccer leagues/i }),
    ).toBeVisible();
    await waitForHydration(page);
    await expect(page.getByText(/E2E Test Spring 2026/).first()).toBeVisible();
  });
```

- [ ] **Step 3: Run the affected specs**

Dev server on :4455 (with-bws), then:
Run: `PLAYWRIGHT_BASE_URL=http://localhost:4455 npx playwright test tests/e2e/youth-leagues.spec.ts tests/e2e/category-pages.spec.ts --reporter=line`
Expected: all pass. If a locator mismatches the built page, fix the PAGE or the SPEC to the mockup's intent — the mockup is the arbiter.

- [ ] **Step 4: Full local verification (pre-push checklist subset)**

Run: `npx tsc --noEmit` → zero errors.
Run: `./scripts/with-bws.sh npm run build` → exit 0.
Run: `PLAYWRIGHT_BASE_URL=http://localhost:4455 npx playwright test --grep-invert soccerone` full run if time allows; at minimum also `tests/e2e/landing-pages.spec.ts` (hub links) and `tests/e2e/adult-soccer-season.spec.ts` (adult finder untouched).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/youth-leagues.spec.ts tests/e2e/category-pages.spec.ts
git commit -m "test(youth): two-path leagues specs — lookup row, division table, 302 routing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Cleanup, memory, PR

**Files:**
- Delete: `public/__mockup-youth-leagues.html` (served mockup copy — the canonical one lives in docs/superpowers/specs/)
- Possibly delete: `src/components/youth/age-group-ladder.astro` IF nothing else imports it (`grep -rn "age-group-ladder" src/` — if `/youth/[sport]` or another page still uses it, leave it).

- [ ] **Step 1: Remove the served mockup copy and orphan check**

```bash
rm public/__mockup-youth-leagues.html
grep -rn "age-group-ladder" src/
```
Delete the ladder component only on zero hits outside the deleted usage.

- [ ] **Step 2: Final sweep + commit + push + PR**

Run: `git status` — no unintended files (`.hallmark/` stays untracked).

```bash
git add -A
git commit -m "chore(youth): drop served mockup copy; remove orphaned ladder if unused

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin youth-leagues-v2
gh pr create --title "Youth leagues: two-path soccer page (Competitive/Developmental) with direct booking" --body "$(cat <<'EOF'
Owner-approved iteration (design: docs/superpowers/specs/2026-08-18-youth-leagues-two-path-design.md, mockup alongside).

- /youth/leagues/soccer rebuilt: deadline banner, product hero, two path tiles, Competitive/Developmental type cards with inline bookable division rows, direct-booking division table (+ compact birthday lookup, level chips), commitment facts, club-teams block, league info, venues with highway access, close band.
- /youth/leagues 302s to the soccer page (temporary by design).
- Finder gains opt-in layout="table" + levelChips; adult defaults byte-identical.
- LEAGUE_KINDS relabeled Competitive/Developmental (winter = Nov–late Mar).
- Full-width body text rule (owner): measure caps dropped + docs amended.
- CI: playwright install-deps hang hardening (job/step timeouts).
- E2E: youth-leagues + category-pages specs rewritten for the new page.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Then watch CI to green (`gh pr checks --watch`); the task is not done until the PR's CI passes. Update the `youth-leagues-v2-recompose` memory file: built → PR open, list owner-content blockers (rules page, reschedule policy, club FAQs).
