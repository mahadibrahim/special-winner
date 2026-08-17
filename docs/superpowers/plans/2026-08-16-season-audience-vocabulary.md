# Season Audience Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the season dialog's division-gender and skill-level fields speak youth vocabulary for youth programs and adult vocabulary for adult ones.

**Architecture:** Two audience-scoped vocabulary lists live in `src/lib/leagues/division-filters.ts` as the single source of truth. A pure `audienceForProgram()` resolver in `src/lib/programs/derive.ts` maps a program's `audienceType` to `"youth" | "adult"`. Admin forms build their dropdown options from pure option-builder functions that also preserve any stored value belonging to the other vocabulary. Customer-facing display goes through one badge helper so nothing reads the raw column.

**Tech Stack:** Astro 5, React 19, Drizzle ORM (PostgreSQL), Zod, Vitest.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-16-youth-adult-season-vocabulary-design.md`. Read it before starting.
- Youth levels are `competitive_a | competitive_b | developmental | recreational`. There is no bare `competitive` value.
- Adult levels are unchanged: `a | b | c | d | open`.
- Youth genders are `coed | boys | girls`; adult genders are `coed | mens | womens`. `coed` is in both.
- The two level lists must stay fully disjoint. A stored level identifies its own audience.
- Every level value must fit `varchar(16)`; every gender value must fit `varchar(10)`.
- Server validation accepts the union of both vocabularies and never cross-checks a value against the program's audience.
- Run `npx tsc --noEmit` before every commit. Expect three pre-existing `pdf-lib` module errors in `scripts/` and nothing else.
- `tests/unit/soccerone/venues.test.ts` fails with `Database not available. Ensure DATABASE_URL is set.` This is pre-existing and unrelated. Every other unit test must pass.
- Unit tests only. Do not start a dev server; do not write API or Playwright tests for this work.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/programs/derive.ts` | Add `Audience` type + `audienceForProgram()`. Existing `deriveAudience()` is untouched. |
| `src/lib/leagues/division-filters.ts` | Audience-scoped value lists, dropdown labels, the rail badge helper, and the two option builders. |
| `src/lib/db/schema/programs.ts` | Widen `skill_level` to `varchar(16)`. |
| `src/lib/db/migrations/NNNN_*.sql` | Generated migration for that widening. |
| `src/pages/api/admin/seasons.ts` | Widen the `skillLevel` zod enum to the union. |
| `src/components/admin/seasons-list.tsx` | Season dialog reads the selected program's audience and builds both dropdowns from it. |
| `src/components/leagues/rail-content.ts` | Tier colors for the four youth values. |
| `src/components/registration/league-context-rail.tsx` | Render the badge via the helper instead of `.toUpperCase()`. |
| `src/components/admin/offering-wizard/*` | Audience choice in the wizard; dropdowns keyed off it; `audienceType` sent to the API. |

---

### Task 1: Audience-scoped vocabulary and pure helpers

Everything here is a pure function. No React, no DB, no network.

**Files:**
- Modify: `src/lib/programs/derive.ts` (append near `deriveAudience`, around line 130)
- Modify: `src/lib/leagues/division-filters.ts:1-38`
- Test: `tests/unit/division-gender.test.ts` (exists — extend it)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `type Audience = "youth" | "adult"` (exported from `src/lib/programs/derive.ts`)
  - `audienceForProgram(audienceType: string | null | undefined): Audience`
  - `ADULT_GENDERS`, `YOUTH_GENDERS`, `ADULT_LEVELS`, `YOUTH_LEVELS` — readonly string tuples
  - `DIVISION_GENDERS`, `DIVISION_LEVELS` — the unions
  - `type DivisionGender`, `type DivisionLevel`
  - `DIVISION_GENDER_LABEL: Record<DivisionGender, string>`, `DIVISION_LEVEL_LABEL: Record<DivisionLevel, string>`
  - `divisionGenderLabel(value: string): string` (already exists — unchanged)
  - `skillLevelBadge(value: string | null | undefined): string`
  - `interface VocabOption { value: string; label: string }`
  - `genderOptionsFor(audience: Audience, stored?: string | null): VocabOption[]`
  - `levelOptionsFor(audience: Audience, stored?: string | null): VocabOption[]`

> **Naming note:** the spec calls the badge helper `skillLevelLabel`. Use `skillLevelBadge` instead — `DIVISION_LEVEL_LABEL` is the *admin dropdown* label and they are different strings for the same value (`b` → `B · Competitive` in the dropdown, `Tier B` in the badge). Two things named `...Label` would get mixed up.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/division-gender.test.ts`:

```ts
import {
  ADULT_GENDERS,
  ADULT_LEVELS,
  YOUTH_GENDERS,
  YOUTH_LEVELS,
  DIVISION_LEVELS,
  genderOptionsFor,
  levelOptionsFor,
  skillLevelBadge,
} from "@/lib/leagues/division-filters";
import { audienceForProgram } from "@/lib/programs/derive";

describe("audienceForProgram", () => {
  it("treats both adult spellings as adult", () => {
    expect(audienceForProgram("adults")).toBe("adult");
    expect(audienceForProgram("adult")).toBe("adult");
  });

  it("treats the parents default and anything unknown as youth", () => {
    expect(audienceForProgram("parents")).toBe("youth");
    expect(audienceForProgram("")).toBe("youth");
    expect(audienceForProgram(null)).toBe("youth");
    expect(audienceForProgram(undefined)).toBe("youth");
    expect(audienceForProgram("families")).toBe("youth");
  });
});

describe("vocabulary lists", () => {
  it("keeps the level lists fully disjoint", () => {
    const overlap = ADULT_LEVELS.filter((l) => (YOUTH_LEVELS as readonly string[]).includes(l));
    expect(overlap).toEqual([]);
  });

  it("shares only coed between the gender lists", () => {
    const overlap = ADULT_GENDERS.filter((g) => (YOUTH_GENDERS as readonly string[]).includes(g));
    expect(overlap).toEqual(["coed"]);
  });

  it("fits every level inside varchar(16)", () => {
    for (const l of DIVISION_LEVELS) expect(l.length).toBeLessThanOrEqual(16);
  });

  it("has no bare competitive value", () => {
    expect(DIVISION_LEVELS).not.toContain("competitive");
  });
});

describe("levelOptionsFor", () => {
  it("offers the youth tiers to a youth season", () => {
    expect(levelOptionsFor("youth").map((o) => o.value)).toEqual([
      "competitive_a", "competitive_b", "developmental", "recreational",
    ]);
  });

  it("offers the adult ladder to an adult season", () => {
    expect(levelOptionsFor("adult").map((o) => o.value)).toEqual(["a", "b", "c", "d", "open"]);
  });

  it("appends a stored value from the other vocabulary, marked", () => {
    const opts = levelOptionsFor("youth", "b");
    expect(opts.map((o) => o.value)).toContain("b");
    expect(opts.find((o) => o.value === "b")?.label).toBe("Adult tier: B · Competitive");
  });

  it("does not duplicate a stored value that already belongs", () => {
    const opts = levelOptionsFor("youth", "developmental");
    expect(opts.filter((o) => o.value === "developmental")).toHaveLength(1);
    expect(opts.find((o) => o.value === "developmental")?.label).toBe("Developmental");
  });

  it("ignores an empty stored value", () => {
    expect(levelOptionsFor("youth", "")).toHaveLength(4);
    expect(levelOptionsFor("youth", null)).toHaveLength(4);
  });

  it("preserves an unrecognised stored value rather than dropping it", () => {
    const opts = levelOptionsFor("youth", "legacy_tier");
    expect(opts.find((o) => o.value === "legacy_tier")?.label).toBe("Adult tier: legacy_tier");
  });
});

describe("genderOptionsFor", () => {
  it("offers boys and girls to a youth season", () => {
    expect(genderOptionsFor("youth").map((o) => o.value)).toEqual(["coed", "boys", "girls"]);
  });

  it("offers mens and womens to an adult season", () => {
    expect(genderOptionsFor("adult").map((o) => o.value)).toEqual(["coed", "mens", "womens"]);
  });

  it("marks a stored adult gender on a youth season", () => {
    expect(genderOptionsFor("youth", "mens").find((o) => o.value === "mens")?.label)
      .toBe("Adult tier: Men's");
  });

  it("does not mark coed, which belongs to both", () => {
    const opts = genderOptionsFor("youth", "coed");
    expect(opts).toHaveLength(3);
    expect(opts.find((o) => o.value === "coed")?.label).toBe("Coed");
  });
});

describe("skillLevelBadge", () => {
  it("keeps the adult Tier X treatment", () => {
    expect(skillLevelBadge("b")).toBe("Tier B");
    expect(skillLevelBadge("open")).toBe("Tier OPEN");
  });

  it("renders youth tiers as words, no Tier prefix, no shouting", () => {
    expect(skillLevelBadge("developmental")).toBe("Developmental");
    expect(skillLevelBadge("competitive_a")).toBe("Competitive A");
  });

  it("renders nothing for an unset level", () => {
    expect(skillLevelBadge(null)).toBe("");
    expect(skillLevelBadge("")).toBe("");
  });

  it("echoes an unrecognised value instead of guessing", () => {
    expect(skillLevelBadge("legacy_tier")).toBe("legacy_tier");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/division-gender.test.ts`
Expected: FAIL — `audienceForProgram is not a function` / `levelOptionsFor is not a function`.

- [ ] **Step 3: Add the audience resolver**

Append to `src/lib/programs/derive.ts`, directly beneath the existing `deriveAudience` function:

```ts
export type Audience = "youth" | "adult";

/**
 * Audience of a program, from its stored audienceType alone.
 *
 * Deliberately NOT deriveAudience(): that one puts the season's age range
 * first, and the age fields are editable in the same admin form — typing into
 * "youngest age" would flip the form's vocabulary mid-edit. This resolver is
 * stable because a program's audience only changes when the program changes.
 *
 * audience_type is a free-text varchar(20) with no enum constraint; "adults"
 * is canonical (migration 0022) but "adult" exists in older fixtures.
 */
export function audienceForProgram(audienceType: string | null | undefined): Audience {
  return audienceType === "adults" || audienceType === "adult" ? "adult" : "youth";
}
```

- [ ] **Step 4: Replace the vocabulary block in division-filters.ts**

Replace lines 1-38 of `src/lib/leagues/division-filters.ts` (everything from `export const DIVISION_LEVELS` down to and including the closing brace of `divisionGenderLabel`) with:

```ts
import type { Audience } from "@/lib/programs/derive";

/**
 * Division vocabularies for `seasons.skill_level` and `seasons.division_gender`.
 *
 * Youth and adult programs answer the same two questions with different words.
 * The level lists are fully disjoint on purpose: a stored level identifies its
 * own audience, so no consumer needs to join to programs.audience_type to read
 * it. Genders share only "coed".
 *
 * Width limits: levels must fit varchar(16), genders varchar(10). See
 * schema/programs.ts.
 */
export const ADULT_LEVELS = ["a", "b", "c", "d", "open"] as const;

/** Competitive youth leagues run A and B divisions; the other two don't split. */
export const YOUTH_LEVELS = [
  "competitive_a",
  "competitive_b",
  "developmental",
  "recreational",
] as const;

export const DIVISION_LEVELS = [...ADULT_LEVELS, ...YOUTH_LEVELS] as const;

export type DivisionLevel = (typeof DIVISION_LEVELS)[number];

/** Admin dropdown labels. For the customer-facing badge use skillLevelBadge. */
export const DIVISION_LEVEL_LABEL: Record<DivisionLevel, string> = {
  a: "A · Elite",
  b: "B · Competitive",
  c: "C · Rec+",
  d: "D · Beginner",
  open: "Open",
  // Plain space, not the "·" the adult labels use: "Competitive · B" and the
  // adult "B · Competitive" are near-identical at a glance in one dropdown.
  competitive_a: "Competitive A",
  competitive_b: "Competitive B",
  developmental: "Developmental",
  recreational: "Recreational",
};

export const ADULT_GENDERS = ["coed", "mens", "womens"] as const;
export const YOUTH_GENDERS = ["coed", "boys", "girls"] as const;

export const DIVISION_GENDERS = ["coed", "boys", "girls", "mens", "womens"] as const;

export type DivisionGender = (typeof DIVISION_GENDERS)[number];

export const DIVISION_GENDER_LABEL: Record<DivisionGender, string> = {
  coed: "Coed",
  boys: "Boys",
  girls: "Girls",
  mens: "Men's",
  womens: "Women's",
};

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** Label a stored gender, echoing anything unrecognised instead of guessing. */
export function divisionGenderLabel(value: string): string {
  return DIVISION_GENDER_LABEL[value as DivisionGender] ?? value;
}

/**
 * The customer-facing level badge (registration rail).
 *
 * Adult keeps the established "Tier B" shouting. Youth gets the plain word a
 * parent understands — "Tier DEVELOPMENTAL" in a one-character badge is not a
 * thing anyone wants to read at checkout.
 */
export function skillLevelBadge(value: string | null | undefined): string {
  if (!value) return "";
  if ((ADULT_LEVELS as readonly string[]).includes(value)) return `Tier ${value.toUpperCase()}`;
  return DIVISION_LEVEL_LABEL[value as DivisionLevel] ?? value;
}

export interface VocabOption {
  value: string;
  label: string;
}

/**
 * Build dropdown options for one audience, keeping any stored value that
 * belongs to the other vocabulary.
 *
 * Until this shipped, both dropdowns offered the adult values on every season
 * regardless of audience, so youth seasons may already hold an adult value.
 * Dropping it would mean an admin who opens a season to change the price
 * silently erases a level someone set. The marker leads with the audience —
 * "Adult tier: B · Competitive" — because trailing it reads too much like the
 * youth "Competitive B" sitting two rows above.
 */
function optionsFor(
  own: readonly string[],
  labels: Record<string, string>,
  otherLabel: string,
  stored?: string | null,
): VocabOption[] {
  const options: VocabOption[] = own.map((value) => ({ value, label: labels[value] ?? value }));
  if (stored && !own.includes(stored)) {
    options.push({ value: stored, label: `${otherLabel}: ${labels[stored] ?? stored}` });
  }
  return options;
}

export function genderOptionsFor(audience: Audience, stored?: string | null): VocabOption[] {
  const own = audience === "adult" ? ADULT_GENDERS : YOUTH_GENDERS;
  const otherLabel = audience === "adult" ? "Youth tier" : "Adult tier";
  return optionsFor(own, DIVISION_GENDER_LABEL, otherLabel, stored);
}

export function levelOptionsFor(audience: Audience, stored?: string | null): VocabOption[] {
  const own = audience === "adult" ? ADULT_LEVELS : YOUTH_LEVELS;
  const otherLabel = audience === "adult" ? "Youth tier" : "Adult tier";
  return optionsFor(own, DIVISION_LEVEL_LABEL, otherLabel, stored);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/division-gender.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole unit suite and the type check**

Run: `npm run test:unit && npx tsc --noEmit`
Expected: only the two known failures from Global Constraints (`venues.test.ts`, the three `pdf-lib` errors).

Widening `DivisionLevel` changes the type of `Division.level`. If `divisions-finder.tsx` or `division-filters.test.ts` now fail to typecheck, that is real — fix it by widening the local `Record<string, ...>` lookups, not by narrowing the shared type back.

- [ ] **Step 7: Commit**

```bash
git add src/lib/leagues/division-filters.ts src/lib/programs/derive.ts tests/unit/division-gender.test.ts
git commit -m "feat(seasons): audience-scoped division vocabulary and label helpers"
```

---

### Task 2: Widen the skill_level column

**Files:**
- Modify: `src/lib/db/schema/programs.ts:143`
- Create: `src/lib/db/migrations/NNNN_*.sql` (generated — do not hand-write the filename)

**Interfaces:**
- Consumes: the value lists from Task 1 (for the comment only).
- Produces: a `skill_level` column wide enough for `competitive_a` (13 chars).

- [ ] **Step 1: Widen the column in the schema**

In `src/lib/db/schema/programs.ts`, replace line 143:

```ts
    skillLevel: varchar("skill_level", { length: 8 }), // 'a' | 'b' | 'c' | 'd' | 'open'
```

with:

```ts
    // DIVISION_LEVELS in lib/leagues/division-filters.ts is the source of
    // truth: 'a'|'b'|'c'|'d'|'open' (adult) plus 'competitive_a'|
    // 'competitive_b'|'developmental'|'recreational' (youth). 16 fits the
    // longest (competitive_a, 13) with headroom; it was varchar(8), which
    // every youth value overflowed.
    skillLevel: varchar("skill_level", { length: 16 }),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/NNNN_*.sql` containing roughly
`ALTER TABLE "seasons" ALTER COLUMN "skill_level" SET DATA TYPE varchar(16);`

Do **not** run `npm run db:push` — it is guarded to localhost and this repo's remote path is generate → commit → migrate.

- [ ] **Step 3: Read the generated migration**

Open the generated file and confirm it contains only the one `ALTER COLUMN ... SET DATA TYPE varchar(16)` statement for `seasons.skill_level`.

If it contains anything else — a dropped column, an unrelated table, a `CREATE TYPE` — stop and report. That means the local schema had drifted and the diff picked up something that is not part of this change.

- [ ] **Step 4: Verify the type check still passes**

Run: `npx tsc --noEmit`
Expected: only the three pre-existing `pdf-lib` errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema/programs.ts src/lib/db/migrations/
git commit -m "feat(db): widen seasons.skill_level to varchar(16) for youth tiers"
```

---

### Task 3: Accept youth levels at the write boundary

**Files:**
- Modify: `src/pages/api/admin/seasons.ts:68` (the `skillLevel` line in `seasonSchema`)
- Test: `tests/unit/division-gender.test.ts` (extend)

**Interfaces:**
- Consumes: `DIVISION_LEVELS` from Task 1. `DIVISION_GENDERS` is already imported in this file.
- Produces: a `seasonSchema` that accepts all nine level values.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/division-gender.test.ts`:

```ts
describe("seasonSchema skillLevel", () => {
  for (const level of DIVISION_LEVELS) {
    it(`accepts "${level}"`, () => {
      expect(seasonSchema.safeParse({ ...base, skillLevel: level }).success).toBe(true);
    });
  }

  it("rejects an unknown level", () => {
    expect(seasonSchema.safeParse({ ...base, skillLevel: "elite" }).success).toBe(false);
  });

  it("does not reject an adult level on a season (no audience cross-check)", () => {
    // A youth season holding a preserved adult tier must stay saveable —
    // otherwise opening it to edit the price 400s on an unrelated field.
    expect(seasonSchema.safeParse({ ...base, skillLevel: "b" }).success).toBe(true);
  });
});
```

`base` and `seasonSchema` are already imported at the top of this file from Task 1's work.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/division-gender.test.ts`
Expected: FAIL on the four youth values — `Invalid enum value`.

- [ ] **Step 3: Widen the enum**

In `src/pages/api/admin/seasons.ts`, change the `skillLevel` line inside `seasonSchema` from:

```ts
  skillLevel: z.enum(["a", "b", "c", "d", "open"]).optional().nullable(),
```

to:

```ts
  // Union of both audiences. Deliberately not cross-checked against the
  // program's audienceType: a youth season may hold a preserved adult tier,
  // and rejecting it here would 400 an unrelated edit.
  skillLevel: z.enum(DIVISION_LEVELS).optional().nullable(),
```

Then extend the existing import at the top of the file:

```ts
import { DIVISION_GENDERS, DIVISION_LEVELS } from "@/lib/leagues/division-filters";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/division-gender.test.ts && npx tsc --noEmit`
Expected: PASS; type check clean apart from the `pdf-lib` errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/seasons.ts tests/unit/division-gender.test.ts
git commit -m "feat(api): accept youth skill levels on seasons"
```

---

### Task 4: Audience-aware season dialog

**Files:**
- Modify: `src/components/admin/seasons-list.tsx` — the `Program` interface (line 78), the imports (line 28), and the two `Select`s in the "League page metadata" block (lines 1375-1399)

**Interfaces:**
- Consumes: `genderOptionsFor`, `levelOptionsFor` (Task 1), `audienceForProgram` (Task 1).
- Produces: no new exports.

`/api/admin/programs` already returns `audienceType` — verified in `src/pages/api/admin/programs.ts:45`. Only the client-side type is missing it.

- [ ] **Step 1: Add audienceType to the Program interface**

In `src/components/admin/seasons-list.tsx`, change the `Program` interface (line 78):

```ts
interface Program {
  id: string
  name: string
  audienceType: string
  sport: { id: string; name: string; icon: string | null }
  location: { id: string; name: string }
}
```

- [ ] **Step 2: Extend the imports**

Change the `@/lib/leagues/division-filters` import block to:

```ts
import {
  genderOptionsFor,
  levelOptionsFor,
  type DivisionGender,
} from "@/lib/leagues/division-filters"
import { audienceForProgram } from "@/lib/programs/derive"
```

`DivisionGender` stays — the `Season` interface (line 55) types `divisionGender` with it. The four constants (`DIVISION_GENDERS`, `DIVISION_GENDER_LABEL`, `DIVISION_LEVELS`, `DIVISION_LEVEL_LABEL`) are all dropped: after Step 4 the option builders are the only source of options and labels in this file. Confirm with
`grep -n "DIVISION_" src/components/admin/seasons-list.tsx` — the only remaining hits should be inside the import you just wrote.

- [ ] **Step 3: Derive the audience inside the component**

Inside `SeasonsList()`, after the `formData` state declaration (it ends around line 287 with `})`), add:

```ts
  // Vocabulary follows the program the season belongs to. Reading it from the
  // picker (not from the season row) means switching programs mid-dialog swaps
  // both dropdowns immediately, and it works on the create path where there is
  // no season row yet.
  const formAudience = audienceForProgram(
    programs.find((p) => p.id === formData.programId)?.audienceType,
  )
```

- [ ] **Step 4: Rebuild both Selects from the option builders**

Replace lines 1375-1399 (the "Division gender" and "Skill level" blocks) with:

```tsx
                    <Label>Division gender</Label>
                    <Select value={formData.divisionGender || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, divisionGender: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {genderOptionsFor(formAudience, formData.divisionGender).map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Skill level</Label>
                    <Select value={formData.skillLevel || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, skillLevel: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {levelOptionsFor(formAudience, formData.skillLevel).map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
```

Passing the current `formData` value as `stored` is what keeps a preserved value selectable. Without it, a shadcn `Select` whose `value` matches no `SelectItem` renders an empty trigger and the value is lost on the next save.

- [ ] **Step 5: Verify the type check and unit suite**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: clean apart from the known failures.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/seasons-list.tsx
git commit -m "feat(admin): season dialog vocabulary follows the program's audience"
```

---

### Task 5: Registration rail renders youth levels

**Files:**
- Modify: `src/lib/leagues/rail-content.ts:4-14`
- Modify: `src/components/registration/league-context-rail.tsx:41,70-72,93-95`
- Test: `tests/unit/rail-content.test.ts:5-9` (extend the existing `tierColorClass` case)

**Interfaces:**
- Consumes: `skillLevelBadge` (Task 1).
- Produces: no new exports. `tierColorClass` keeps its signature.

This is the customer-facing half. The rail wraps every registration, youth and adult — see `register-experience.tsx:60,67,80`.

- [ ] **Step 1: Write the failing test**

In `tests/unit/rail-content.test.ts`, replace the existing `tierColorClass` test with:

```ts
  it("maps tier → text color (a=ink b=primary c=ochre d=sage)", () => {
    expect(tierColorClass("a")).toBe("text-ink");
    expect(tierColorClass("d")).toBe("text-sage");
    expect(tierColorClass(null)).toBe("text-ink"); // default
  });
  it("colors the youth tiers too, rather than falling through to the default", () => {
    expect(tierColorClass("competitive_a")).toBe("text-ink");
    expect(tierColorClass("competitive_b")).toBe("text-primary");
    expect(tierColorClass("developmental")).toBe("text-ochre");
    expect(tierColorClass("recreational")).toBe("text-sage");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/rail-content.test.ts`
Expected: FAIL — `competitive_b` returns `"text-ink"` (the default) rather than `"text-primary"`.

- [ ] **Step 3: Add the youth tier colors**

In `src/lib/leagues/rail-content.ts`, replace lines 4-14:

```ts
type Tier = "a" | "b" | "c" | "d";
export type RailMode = "solo" | "team" | "share";

const TIER_TEXT: Record<Tier, string> = {
  a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage",
};

export function tierColorClass(skillLevel: string | null | undefined): string {
  const k = (skillLevel ?? "").toLowerCase() as Tier;
  return TIER_TEXT[k] ?? "text-ink";
}
```

with:

```ts
export type RailMode = "solo" | "team" | "share";

// Youth tiers reuse the adult ramp so the rail reads consistently across both
// audiences: most competitive → ink, down to sage.
const TIER_TEXT: Record<string, string> = {
  a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage",
  competitive_a: "text-ink", competitive_b: "text-primary",
  developmental: "text-ochre", recreational: "text-sage",
};

export function tierColorClass(skillLevel: string | null | undefined): string {
  return TIER_TEXT[(skillLevel ?? "").toLowerCase()] ?? "text-ink";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/rail-content.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the badge through the helper**

In `src/components/registration/league-context-rail.tsx`, add to the imports:

```ts
import { skillLevelBadge } from "@/lib/leagues/division-filters";
```

Replace line 41:

```ts
  const tier = (season.skillLevel ?? "").toUpperCase();
```

with:

```ts
  // Adult renders "Tier B"; youth renders "Developmental". The old
  // .toUpperCase() assumed a single letter and would have shouted
  // "TIER DEVELOPMENTAL" into a one-character badge.
  const tier = skillLevelBadge(season.skillLevel);
```

Then remove the now-doubled `Tier ` prefix in the desktop badge (line 71), changing:

```tsx
            Tier {tier}{success ? " · Registered" : ""}
```

to:

```tsx
            {tier}{success ? " · Registered" : ""}
```

Finally, drop `uppercase` from the two badge `className` strings (lines 70 and 94) so `Competitive A` keeps its casing — the adult string is already uppercased by the helper. Each `className` contains `font-bold uppercase tracking-wider`; make it `font-bold tracking-wider`.

The mobile chip on line 94 renders `{tier}` directly and needs no other change.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: clean apart from the known failures.

- [ ] **Step 7: Commit**

```bash
git add src/lib/leagues/rail-content.ts src/components/registration/league-context-rail.tsx tests/unit/rail-content.test.ts
git commit -m "fix(register): rail badge renders youth skill levels as words"
```

---

### Task 6: Offering wizard picks an audience

**Files:**
- Modify: `src/components/admin/offering-wizard/TypeStep.tsx`
- Modify: `src/components/admin/offering-wizard/OfferingWizard.tsx:10-13,31-50`
- Modify: `src/components/admin/offering-wizard/DetailsStep.tsx` — the `OfferingDraft` interface and the `show("divisions")` block
- Modify: `src/lib/admin/offering-draft-to-payload.ts:9-13,30-36`
- Test: `tests/unit/offering-draft-to-payload.test.ts` (extend)

**Interfaces:**
- Consumes: `genderOptionsFor`, `levelOptionsFor` (Task 1), `Audience` (Task 1).
- Produces: `OfferingDraft` gains `audience: Audience`; the offering payload gains a top-level `audienceType: "parents" | "adults"`.

**Why this task exists.** The wizard has no audience to key its dropdowns on: it never sends `audienceType`, and `src/pages/api/admin/offerings.ts:100` derives one as `programType === "league" ? "adults" : "parents"`. So **every youth league created through the wizard is stored as an adult program** — which also drives "per player" instead of "per kid" pricing copy via `derivePriceUnit()`. Asking the admin is both what this feature needs and the fix for that.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/offering-draft-to-payload.test.ts`:

The file already defines `campDraft` (line 5) and `ctx` (line 4) — reuse both.

First add `audience: "youth" as const,` to the existing `campDraft` literal. It is
not optional: Step 3 makes `audience` a required field on `OfferingDraft`, so
without this the existing tests stop typechecking.

Then append:

```ts
describe("audience", () => {
  it("sends parents for a youth offering", () => {
    const d = { ...campDraft, name: "U10 Flag Football", audience: "youth" as const };
    const p = draftToOfferingPayload("league", d, ctx) as any;
    expect(p.audienceType).toBe("parents");
  });

  it("sends adults for an adult offering", () => {
    const d = { ...campDraft, name: "Thursday Coed", audience: "adult" as const };
    const p = draftToOfferingPayload("league", d, ctx) as any;
    expect(p.audienceType).toBe("adults");
  });

  it("does not let a youth league fall through to the server's adults default", () => {
    const d = { ...campDraft, name: "U10 League", audience: "youth" as const };
    const p = draftToOfferingPayload("league", d, ctx) as any;
    expect(p.audienceType).not.toBe("adults");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/offering-draft-to-payload.test.ts`
Expected: FAIL — `expected undefined to be "parents"`.

- [ ] **Step 3: Add audience to the draft**

In `src/components/admin/offering-wizard/DetailsStep.tsx`, extend the interface:

```ts
export interface OfferingDraft {
  name: string; slug: string; startDate: string; endDate: string;
  dailyStartTime: string; dailyEndTime: string;
  fullDayPrice: string; halfDayPrice: string; individualPrice: string; teamPrice: string;
  minAge: string; maxAge: string; capacity: string; deposit: string;
  divisionGender: string; skillLevel: string;
  audience: Audience;
}
```

and add the import:

```ts
import type { Audience } from "@/lib/programs/derive";
```

In `src/components/admin/offering-wizard/OfferingWizard.tsx`, add `audience: "youth",` to the `EMPTY` draft literal (line 10-13).

- [ ] **Step 4: Send it in the payload**

In `src/lib/admin/offering-draft-to-payload.ts`, add `audienceType` to the returned object, directly after `slug`:

```ts
  return {
    programType: type,
    locationId: ctx.locationId,
    sportId: ctx.sportId,
    name: d.name,
    slug,
    // Explicit, so a youth league is not caught by the offerings API's
    // "league => adults" fallback (offerings.ts:100). That fallback is what
    // made youth leagues render "per player" instead of "per kid".
    audienceType: d.audience === "adult" ? "adults" : "parents",
    season: {
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/offering-draft-to-payload.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the audience choice to the wizard UI**

In `src/components/admin/offering-wizard/TypeStep.tsx`, add an audience toggle beneath the existing type buttons. Change the component signature and return:

```tsx
"use client";
import { OFFERING_TYPES, type OfferingType } from "@/lib/admin/offering-types";
import type { Audience } from "@/lib/programs/derive";

const ORDER: OfferingType[] = ["camp", "tournament", "league"];

const AUDIENCES: { key: Audience; label: string; hint: string }[] = [
  { key: "youth", label: "Youth", hint: "Parents register their kids" },
  { key: "adult", label: "Adult", hint: "Players register themselves" },
];

export function TypeStep({
  value,
  audience,
  onSelect,
  onAudience,
}: {
  value: OfferingType | null;
  audience: Audience;
  onSelect: (t: OfferingType) => void;
  onAudience: (a: Audience) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {ORDER.map((t) => {
          const cfg = OFFERING_TYPES[t];
          const active = value === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onSelect(t)}
              aria-pressed={active}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                active ? "border-ink bg-cream-2" : "border-border bg-paper hover:bg-cream-2"
              }`}
            >
              <div className="text-lg font-medium text-ink">{cfg.label}</div>
              <div className="text-sm text-ink-muted">{cfg.description}</div>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">
          Who is it for?
        </div>
        <div className="grid grid-cols-2 gap-3">
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => onAudience(a.key)}
              aria-pressed={audience === a.key}
              className={`text-left p-3 rounded-xl border transition-colors ${
                audience === a.key ? "border-ink bg-cream-2" : "border-border bg-paper hover:bg-cream-2"
              }`}
            >
              <div className="font-medium text-ink">{a.label}</div>
              <div className="text-xs text-ink-muted">{a.hint}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

In `OfferingWizard.tsx`, pass the two new props at the `<TypeStep ... />` call site:

```tsx
          <TypeStep
            value={type}
            audience={draft.audience}
            onSelect={setType}
            onAudience={(a) => setDraft((d) => ({ ...d, audience: a }))}
          />
```

- [ ] **Step 7: Key the wizard dropdowns off the audience**

In `DetailsStep.tsx`, replace the whole `@/lib/leagues/division-filters` import with:

```ts
import { genderOptionsFor, levelOptionsFor } from "@/lib/leagues/division-filters";
```

`DIVISION_GENDERS`, `DIVISION_GENDER_LABEL`, `DIVISION_LEVELS` and `DIVISION_LEVEL_LABEL` all go — the option builders supply the labels now.

Then, inside the `show("divisions")` block, replace the gender `.map`:

```tsx
                {DIVISION_GENDERS.map((g) => (
                  <SelectItem key={g} value={g}>{DIVISION_GENDER_LABEL[g]}</SelectItem>
                ))}
```

with:

```tsx
                {genderOptionsFor(value.audience, value.divisionGender).map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
```

and the level `.map`:

```tsx
                {DIVISION_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>{DIVISION_LEVEL_LABEL[l]}</SelectItem>
                ))}
```

with:

```tsx
                {levelOptionsFor(value.audience, value.skillLevel).map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: clean apart from the known failures.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/offering-wizard src/lib/admin/offering-draft-to-payload.ts tests/unit/offering-draft-to-payload.test.ts
git commit -m "feat(admin): offering wizard asks who the program is for"
```

---

### Task 7: Full verification

**Files:** none modified unless a check fails.

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: exactly three errors, all `Cannot find module 'pdf-lib'` in `scripts/`.

- [ ] **Step 2: Full unit suite**

Run: `npm run test:unit`
Expected: one failing file (`tests/unit/soccerone/venues.test.ts`, `Database not available`). Everything else passes.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success. Ignore `Astro.request.headers is not available on prerendered pages` warnings — CLAUDE.md documents them as a known false positive.

If another dev server is running on this machine, note that building can disturb its Vite cache; that is a local annoyance, not a build failure.

- [ ] **Step 4: Check the E2E specs that touch these surfaces**

Run: `grep -rln "skill\|division\|seasons" tests/e2e/`

For every hit, read it and confirm it does not assert on the old `Tier X` badge text or on the removed adult-only dropdown options. Full Playwright runs are skipped on PRs in this repo and only run post-merge, so a broken spec will not fail the PR — it will fail on `main`. Update any spec this change breaks.

- [ ] **Step 5: Commit any spec fixes**

```bash
git add tests/e2e/
git commit -m "test(e2e): update specs for audience-aware season vocabulary"
```

Skip this step if Step 4 found nothing to change.

---

## Out of Scope

Do not do these as part of this plan:

- Renaming the adult tier labels. `B · Competitive` (adult) and `Competitive B` (youth) remain similar; the `Adult tier:` prefix is the agreed mitigation. The owner deferred a proper rename.
- Hiding Term label / Term slug on youth seasons. Decided: all fields stay for both audiences.
- Adult-only surfaces: `divisions-finder.tsx` filter chips, `SoccerOneLeaguesFinder.tsx`, drop-league.
- Age groups, pricing, signup modes.
- `deriveAudience()` in `src/lib/programs/derive.ts` — leave it for its existing read-path callers.
- Backfilling existing rows. Stale values are preserved and surfaced, not migrated.
