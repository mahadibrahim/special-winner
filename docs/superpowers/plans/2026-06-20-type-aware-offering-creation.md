# Type-aware Offering Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guided "New offering" wizard that creates a Program + first Season in one flow, showing only the fields relevant to the chosen type (Camp, Tournament, League), with an explicit publish step.

**Architecture:** Reuse the existing Program + Season data model. A pure per-type field-config module drives a 3-step React wizard (type → details → review/publish). A new transactional `POST /api/admin/offerings` endpoint creates the program and its first season together. Three additive `seasons` columns (half-day price, min/max age) carry camp-specific data, and `deriveAudience` is extended so an explicit max age < 18 classifies as youth.

**Tech Stack:** Astro 5 + React 19, Drizzle ORM (PostgreSQL), Zod, Tailwind, shadcn/ui, Vitest (unit + api), Playwright (e2e).

## Global Constraints

- Scope is **Camp, Tournament, League** only. **Class is deferred** (gated on the membership-pricing decision) — do not build it here.
- Migrations are **additive and forward-compatible**: new columns are nullable; use `ADD COLUMN IF NOT EXISTS`. Generate via `npm run db:generate`, commit the SQL; never `db:push` to remote.
- Reuse the existing Program + Season model and the public catalog pipeline (`/api/public/seasons`, `CategoryFinder`, `/youth/camps`). This is a create-experience change, not a model rewrite.
- All money is integer cents; all times are `HH:MM`; all date-only values are `YYYY-MM-DD`.
- TDD: failing test first, watch it fail, minimal code, watch it pass, commit. Tenant-scoped admin endpoints must validate org ownership via `requireSameOrg*` helpers.
- Tests: unit/api via `npm run test:unit` / `npm run test:api` (api needs the dev server running); e2e via `npm test`.

---

### Task 1: Add camp fields to the `seasons` schema

**Files:**
- Modify: `src/lib/db/schema/programs.ts` (the `seasons` pgTable, near `priceCents`/`startTime`)
- Create: `src/lib/db/migrations/NNNN_*.sql` (generated)

**Interfaces:**
- Produces: `seasons.halfDayPriceCents: integer | null`, `seasons.minAge: integer | null`, `seasons.maxAge: integer | null`.

- [ ] **Step 1: Add the columns to the Drizzle table.** In `src/lib/db/schema/programs.ts`, inside the `seasons` table definition, add after `teamPriceCents` (line ~103) and near the age/price fields:

```ts
    // Camp/class economics + age range. Nullable: only some offering types use them.
    halfDayPriceCents: integer("half_day_price_cents"),
    minAge: integer("min_age"),
    maxAge: integer("max_age"),
```

- [ ] **Step 2: Generate the migration.**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/NNNN_*.sql` adding the three columns. Open it.

- [ ] **Step 3: Make the migration idempotent.** Edit the generated SQL so each column uses `IF NOT EXISTS` (matches the repo convention for drift safety):

```sql
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "half_day_price_cents" integer;
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "min_age" integer;
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "max_age" integer;
```

- [ ] **Step 4: Type-check.**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/db/schema/programs.ts src/lib/db/migrations/
git commit -m "feat(seasons): add half-day price and min/max age columns"
```

---

### Task 2: Accept the new fields in the season validator

**Files:**
- Modify: `src/pages/api/admin/seasons.ts` (the `seasonSchema`, lines ~32-65)
- Test: `tests/unit/season-schema.test.ts` (create)

**Interfaces:**
- Consumes: `seasons` columns from Task 1.
- Produces: `seasonSchema` now parses `halfDayPriceCents`, `minAge`, `maxAge` (all `z.number().int().min(0).optional().nullable()`), and rejects `maxAge < minAge`. Export `seasonSchema` so it is unit-testable.

- [ ] **Step 1: Export the schema.** In `src/pages/api/admin/seasons.ts`, change `const seasonSchema = z.object({...})...` to `export const seasonSchema = z.object({...})...` (no behavior change, just add `export`).

- [ ] **Step 2: Write the failing test.** Create `tests/unit/season-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { seasonSchema } from "@/pages/api/admin/seasons";

const base = {
  programId: "00000000-0000-0000-0000-000000000000",
  name: "Summer Camp",
  slug: "summer-camp",
  startDate: "2026-07-06",
  endDate: "2026-07-10",
  priceCents: 37500,
};

describe("seasonSchema camp fields", () => {
  it("accepts half-day price and an age range", () => {
    const r = seasonSchema.safeParse({ ...base, halfDayPriceCents: 20000, minAge: 5, maxAge: 12 });
    expect(r.success).toBe(true);
  });

  it("rejects maxAge below minAge", () => {
    const r = seasonSchema.safeParse({ ...base, minAge: 12, maxAge: 5 });
    expect(r.success).toBe(false);
  });

  it("still accepts a season with no camp fields (league)", () => {
    const r = seasonSchema.safeParse(base);
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 3: Run it, watch it fail.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/season-schema.test.ts`
Expected: FAIL — half-day/age fields are stripped or the maxAge<minAge case still passes.

- [ ] **Step 4: Add the fields + cross-field check.** In `seasonSchema`, add inside the object (after `teamPriceCents`):

```ts
  halfDayPriceCents: z.number().int().min(0).optional().nullable(),
  minAge: z.number().int().min(0).optional().nullable(),
  maxAge: z.number().int().min(0).optional().nullable(),
```

Then add a `.refine` after the existing team-price refine:

```ts
.refine(
  (data) => data.minAge == null || data.maxAge == null || data.maxAge >= data.minAge,
  { message: "Oldest age must be greater than or equal to youngest age", path: ["maxAge"] },
)
```

- [ ] **Step 5: Persist the fields on insert and update.** In the `POST` handler's `tx.insert(seasons).values({...})` and the `PUT` handler's `.update(seasons).set({...})`, add:

```ts
      halfDayPriceCents: data.halfDayPriceCents ?? null,
      minAge: data.minAge ?? null,
      maxAge: data.maxAge ?? null,
```

(Use `validData` instead of `data` in the PUT handler.)

- [ ] **Step 6: Run the test, watch it pass.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/season-schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit.**

```bash
git add src/pages/api/admin/seasons.ts tests/unit/season-schema.test.ts
git commit -m "feat(seasons): validate and persist half-day price and age range"
```

---

### Task 3: Classify by explicit age range in `deriveAudience`

**Files:**
- Modify: `src/lib/programs/derive.ts` (`deriveAudience`, ~line 126; and `SeasonForDerive` type)
- Test: `tests/unit/derive-audience.test.ts` (create)

**Interfaces:**
- Consumes: `seasons.minAge/maxAge` (Task 1).
- Produces: `deriveAudience` returns `"youth"` when `s.maxAge != null && s.maxAge < 18`, and `"adult"` when `s.minAge != null && s.minAge >= 18`, taking precedence over the age-group/`audienceType` fallback.

- [ ] **Step 1: Find the `SeasonForDerive` type.** In `src/lib/programs/derive.ts`, locate `type SeasonForDerive` and add optional `minAge`/`maxAge`:

```ts
  minAge?: number | null;
  maxAge?: number | null;
```

- [ ] **Step 2: Write the failing test.** Create `tests/unit/derive-audience.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveAudience } from "@/lib/programs/derive";

const program = { programType: "camp", audienceType: "parents" } as any;

describe("deriveAudience with explicit age range", () => {
  it("classifies a 5-12 camp as youth", () => {
    expect(deriveAudience({ program, minAge: 5, maxAge: 12 } as any)).toBe("youth");
  });

  it("classifies an 18+ offering as adult", () => {
    expect(deriveAudience({ program, minAge: 18, maxAge: 99 } as any)).toBe("adult");
  });

  it("falls back to audienceType when no age range is set", () => {
    expect(deriveAudience({ program } as any)).toBe("youth");
  });
});
```

- [ ] **Step 3: Run it, watch it fail.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/derive-audience.test.ts`
Expected: FAIL — the explicit-age cases are not handled.

- [ ] **Step 4: Add the explicit-age branch.** At the **top** of `deriveAudience` (before the `ageGroup` checks):

```ts
  if (s.maxAge != null && s.maxAge < 18) return "youth";
  if (s.minAge != null && s.minAge >= 18) return "adult";
```

- [ ] **Step 5: Run the test, watch it pass.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/derive-audience.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit.**

```bash
git add src/lib/programs/derive.ts tests/unit/derive-audience.test.ts
git commit -m "feat(programs): derive youth/adult from explicit season age range"
```

---

### Task 4: Per-type field configuration (pure module)

**Files:**
- Create: `src/lib/admin/offering-types.ts`
- Test: `tests/unit/offering-types.test.ts`

**Interfaces:**
- Produces:
  - `type OfferingType = "camp" | "tournament" | "league"`
  - `type OfferingFieldKey = "dateRange" | "dailyTimes" | "gameDayTime" | "fullDayPrice" | "halfDayPrice" | "teamPrice" | "individualPrice" | "ageRange" | "ageGroup" | "divisions" | "capacityKids" | "capacityTeams" | "deposit"`
  - `interface OfferingTypeConfig { label: string; description: string; fields: OfferingFieldKey[]; required: OfferingFieldKey[] }`
  - `const OFFERING_TYPES: Record<OfferingType, OfferingTypeConfig>`
  - `function offeringFieldShown(type: OfferingType, key: OfferingFieldKey): boolean`
  - `function offeringFieldRequired(type: OfferingType, key: OfferingFieldKey): boolean`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/offering-types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { OFFERING_TYPES, offeringFieldShown, offeringFieldRequired } from "@/lib/admin/offering-types";

describe("OFFERING_TYPES", () => {
  it("shows half-day price and age range for camps but not divisions", () => {
    expect(offeringFieldShown("camp", "halfDayPrice")).toBe(true);
    expect(offeringFieldShown("camp", "ageRange")).toBe(true);
    expect(offeringFieldShown("camp", "divisions")).toBe(false);
    expect(offeringFieldShown("camp", "teamPrice")).toBe(false);
  });

  it("shows team price + divisions + team capacity for tournaments", () => {
    expect(offeringFieldShown("tournament", "teamPrice")).toBe(true);
    expect(offeringFieldShown("tournament", "divisions")).toBe(true);
    expect(offeringFieldShown("tournament", "capacityTeams")).toBe(true);
    expect(offeringFieldShown("tournament", "halfDayPrice")).toBe(false);
  });

  it("shows divisions + individual & team price for leagues", () => {
    expect(offeringFieldShown("league", "divisions")).toBe(true);
    expect(offeringFieldShown("league", "individualPrice")).toBe(true);
    expect(offeringFieldShown("league", "teamPrice")).toBe(true);
  });

  it("marks full-day price and age range required for camps", () => {
    expect(offeringFieldRequired("camp", "fullDayPrice")).toBe(true);
    expect(offeringFieldRequired("camp", "ageRange")).toBe(true);
    expect(offeringFieldRequired("camp", "halfDayPrice")).toBe(false);
  });

  it("exposes a label and description per type", () => {
    expect(OFFERING_TYPES.camp.label).toBe("Camp");
    expect(OFFERING_TYPES.camp.description.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it, watch it fail.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/offering-types.test.ts`
Expected: FAIL — `Cannot find package '@/lib/admin/offering-types'`.

- [ ] **Step 3: Write the module.** Create `src/lib/admin/offering-types.ts`:

```ts
export type OfferingType = "camp" | "tournament" | "league";

export type OfferingFieldKey =
  | "dateRange"
  | "dailyTimes"
  | "gameDayTime"
  | "fullDayPrice"
  | "halfDayPrice"
  | "teamPrice"
  | "individualPrice"
  | "ageRange"
  | "ageGroup"
  | "divisions"
  | "capacityKids"
  | "capacityTeams"
  | "deposit";

export interface OfferingTypeConfig {
  label: string;
  description: string;
  fields: OfferingFieldKey[];
  required: OfferingFieldKey[];
}

export const OFFERING_TYPES: Record<OfferingType, OfferingTypeConfig> = {
  camp: {
    label: "Camp",
    description: "A multi-day camp kids register for individually.",
    fields: ["dateRange", "dailyTimes", "fullDayPrice", "halfDayPrice", "ageRange", "capacityKids", "deposit"],
    required: ["dateRange", "fullDayPrice", "ageRange"],
  },
  tournament: {
    label: "Tournament",
    description: "A single- or multi-day event teams enter.",
    fields: ["dateRange", "gameDayTime", "teamPrice", "individualPrice", "divisions", "ageGroup", "capacityTeams"],
    required: ["dateRange", "teamPrice"],
  },
  league: {
    label: "League",
    description: "A recurring season with weekly games.",
    fields: ["dateRange", "gameDayTime", "individualPrice", "teamPrice", "divisions", "ageGroup", "capacityKids", "deposit"],
    required: ["dateRange", "individualPrice"],
  },
};

export function offeringFieldShown(type: OfferingType, key: OfferingFieldKey): boolean {
  return OFFERING_TYPES[type].fields.includes(key);
}

export function offeringFieldRequired(type: OfferingType, key: OfferingFieldKey): boolean {
  return OFFERING_TYPES[type].required.includes(key);
}
```

- [ ] **Step 4: Run the test, watch it pass.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/offering-types.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/admin/offering-types.ts tests/unit/offering-types.test.ts
git commit -m "feat(admin): per-type offering field configuration"
```

---

### Task 5: Combined create endpoint `POST /api/admin/offerings`

**Files:**
- Create: `src/pages/api/admin/offerings.ts`
- Test: `tests/api/offerings-create.test.ts`

**Interfaces:**
- Consumes: `seasonSchema` (Task 2), `requireSameOrgLocation/Sport` helpers, `programs`/`seasons` tables.
- Produces: `POST /api/admin/offerings` accepting `{ programType, locationId, sportId, name, slug, audienceType?, season: <seasonSchema-minus-programId> }`, creating a program + first season in one transaction and returning `{ program: {id}, season: {id, status} }`. Publishing is expressed by the caller setting `season.status` to `"open"` (vs `"draft"`).

- [ ] **Step 1: Write the failing API test.** Create `tests/api/offerings-create.test.ts` (follow the auth/login pattern used by other files in `tests/api/`; reuse the shared admin sign-in helper):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminRequest } from "./setup/admin-client"; // existing helper used by other admin api tests

describe("POST /api/admin/offerings", () => {
  it("creates a published camp program + season in one call", async () => {
    const res = await adminRequest("/api/admin/offerings", {
      method: "POST",
      body: {
        programType: "camp",
        locationId: TEST_LOCATION_ID, // from seed
        sportId: TEST_SPORT_ID,       // from seed
        name: "Test Summer Camp",
        slug: `test-summer-camp-${Date.now()}`,
        season: {
          name: "Test Camp Week 1",
          slug: `test-camp-wk1-${Date.now()}`,
          startDate: "2026-07-06",
          endDate: "2026-07-10",
          priceCents: 37500,
          halfDayPriceCents: 20000,
          minAge: 5,
          maxAge: 12,
          status: "open",
        },
      },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.program.id).toBeTruthy();
    expect(body.season.status).toBe("open");
  });
});
```

> Note for implementer: open `tests/api/` and copy the exact admin auth/setup pattern + the seeded location/sport IDs that the existing season/program api tests use; substitute them for `TEST_LOCATION_ID`/`TEST_SPORT_ID`/`adminRequest`.

- [ ] **Step 2: Run it, watch it fail.** (Dev server running.)

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api tests/api/offerings-create.test.ts`
Expected: FAIL — 404 (route does not exist).

- [ ] **Step 3: Write the endpoint.** Create `src/pages/api/admin/offerings.ts`:

```ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { programs, seasons } from "@/lib/db/schema";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  requireSameOrgLocation,
  requireSameOrgSport,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { seasonSchema } from "@/pages/api/admin/seasons";

// The wizard creates a program + its first season together. Reuse seasonSchema
// for the season half, minus programId (the program is created in the same call).
const seasonForOffering = seasonSchema.innerType
  ? (seasonSchema as any) // seasonSchema is a ZodEffects (has .refine); parse via safeParse below
  : seasonSchema;

const offeringSchema = z.object({
  programType: z.enum(["camp", "tournament", "league"]),
  locationId: z.string().uuid(),
  sportId: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  audienceType: z.string().max(20).optional(),
  season: z.record(z.any()), // validated with seasonSchema after programId is attached
});

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const parsed = offeringSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }),
        { status: 400 },
      );
    }
    const data = parsed.data;

    const locationCheck = await requireSameOrgLocation(orgContext.organizationId, data.locationId);
    if (!locationCheck.ok) return ownershipDeniedResponse();
    const sportCheck = await requireSameOrgSport(orgContext.organizationId, data.sportId);
    if (!sportCheck.ok) return ownershipDeniedResponse();

    const result = await getDb().transaction(async (tx) => {
      const [program] = await tx
        .insert(programs)
        .values({
          locationId: data.locationId,
          sportId: data.sportId,
          name: data.name,
          slug: data.slug,
          programType: data.programType,
          audienceType: data.audienceType ?? (data.programType === "league" ? "adults" : "parents"),
          isActive: true,
        })
        .returning();

      // Validate the season half now that we have the programId.
      const seasonParsed = seasonSchema.safeParse({ ...data.season, programId: program.id });
      if (!seasonParsed.success) {
        throw new OfferingError(400, "Season validation failed", seasonParsed.error.flatten().fieldErrors);
      }
      const s = seasonParsed.data;

      const [season] = await tx
        .insert(seasons)
        .values({
          programId: program.id,
          name: s.name,
          slug: s.slug,
          startDate: s.startDate,
          endDate: s.endDate,
          priceCents: s.priceCents,
          teamPriceCents: s.teamPriceCents ?? null,
          halfDayPriceCents: s.halfDayPriceCents ?? null,
          minAge: s.minAge ?? null,
          maxAge: s.maxAge ?? null,
          maxParticipants: s.maxParticipants ?? null,
          depositCents: s.depositCents ?? null,
          allowDeposit: s.allowDeposit,
          signupModes: s.signupModes,
          status: s.status,
          startTime: s.startTime ?? null,
          endTime: s.endTime ?? null,
          divisionGender: s.divisionGender ?? null,
          skillLevel: s.skillLevel ?? null,
          dayOfWeek: s.dayOfWeek ?? null,
          scheduleNotes: s.scheduleNotes ?? null,
        })
        .returning();

      return { program, season };
    });

    return new Response(
      JSON.stringify({ program: { id: result.program.id }, season: { id: result.season.id, status: result.season.status } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    if (error instanceof OfferingError) {
      return new Response(JSON.stringify({ error: error.message, details: error.details }), { status: error.status });
    }
    console.error("Error creating offering:", error);
    return new Response(JSON.stringify({ error: "Failed to create offering" }), { status: 500 });
  }
};

class OfferingError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
```

> Implementer note: confirm `programs` has `isActive` and `audienceType` columns (it does — see `src/lib/db/schema/programs.ts` and the existing `POST /api/admin/programs`). Drop the `seasonForOffering` shim line if unused; it is only a reminder that `seasonSchema` is a `ZodEffects` and must be validated via `safeParse`, not `.shape`.

- [ ] **Step 4: Run the test, watch it pass.**

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api tests/api/offerings-create.test.ts`
Expected: PASS — 201, `season.status === "open"`.

- [ ] **Step 5: Commit.**

```bash
git add src/pages/api/admin/offerings.ts tests/api/offerings-create.test.ts
git commit -m "feat(admin): combined program+season create endpoint"
```

---

### Task 6: Wizard Step 1 — type picker

**Files:**
- Create: `src/components/admin/offering-wizard/TypeStep.tsx`
- Tested via: Task 9 Playwright e2e (no component unit test — repo convention: UI behavior is covered by Playwright, not Testing Library, which is not installed).

**Interfaces:**
- Consumes: `OFFERING_TYPES`, `OfferingType` (Task 4).
- Produces: `<TypeStep value={OfferingType | null} onSelect={(t: OfferingType) => void} />` rendering one selectable card per type with its label + description.

- [ ] **Step 1: Write the component.** Create `src/components/admin/offering-wizard/TypeStep.tsx`:

```tsx
"use client";
import { OFFERING_TYPES, type OfferingType } from "@/lib/admin/offering-types";

const ORDER: OfferingType[] = ["camp", "tournament", "league"];

export function TypeStep({
  value,
  onSelect,
}: {
  value: OfferingType | null;
  onSelect: (t: OfferingType) => void;
}) {
  return (
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
  );
}
```

- [ ] **Step 2: Type-check.**

Run: `npx tsc --noEmit`
Expected: exit 0. (No component unit test — the wizard's behavior is covered by the Task 9 Playwright e2e.)

- [ ] **Step 3: Commit.**

```bash
git add src/components/admin/offering-wizard/TypeStep.tsx
git commit -m "feat(admin): offering wizard type picker step"
```

---

### Task 7: Wizard Step 2 — type-aware details form

**Files:**
- Create: `src/components/admin/offering-wizard/DetailsStep.tsx`
- Tested via: Task 9 Playwright e2e (no component unit test — repo convention; Testing Library is not installed).

**Interfaces:**
- Consumes: `offeringFieldShown`, `OfferingType` (Task 4); the time normalizer `toTimeInputValue` from `@/lib/time/time-of-day` (already in the codebase).
- Produces: `<DetailsStep type={OfferingType} value={OfferingDraft} onChange={(d: OfferingDraft) => void} />` rendering only the fields `offeringFieldShown(type, key)` allows. Export `interface OfferingDraft` with string-valued form fields: `name, slug, startDate, endDate, dailyStartTime, dailyEndTime, fullDayPrice, halfDayPrice, individualPrice, teamPrice, minAge, maxAge, capacity, deposit, divisionGender, skillLevel`.

- [ ] **Step 1: Write the component.** Create `src/components/admin/offering-wizard/DetailsStep.tsx`:

```tsx
"use client";
import { offeringFieldShown, type OfferingType } from "@/lib/admin/offering-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface OfferingDraft {
  name: string; slug: string; startDate: string; endDate: string;
  dailyStartTime: string; dailyEndTime: string;
  fullDayPrice: string; halfDayPrice: string; individualPrice: string; teamPrice: string;
  minAge: string; maxAge: string; capacity: string; deposit: string;
  divisionGender: string; skillLevel: string;
}

export function DetailsStep({
  type,
  value,
  onChange,
}: {
  type: OfferingType;
  value: OfferingDraft;
  onChange: (d: OfferingDraft) => void;
}) {
  const set = (k: keyof OfferingDraft, v: string) => onChange({ ...value, [k]: v });
  const show = (key: Parameters<typeof offeringFieldShown>[1]) => offeringFieldShown(type, key);

  return (
    <div className="space-y-4">
      <Field id="name" label="Name *">
        <Input id="name" value={value.name} onChange={(e) => set("name", e.target.value)} />
      </Field>

      {show("dateRange") && (
        <div className="grid grid-cols-2 gap-4">
          <Field id="startDate" label="Start date *">
            <Input id="startDate" type="date" value={value.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field id="endDate" label="End date *">
            <Input id="endDate" type="date" value={value.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
        </div>
      )}

      {show("dailyTimes") && (
        <div className="grid grid-cols-2 gap-4">
          <Field id="dailyStartTime" label="Daily start time">
            <Input id="dailyStartTime" type="time" value={value.dailyStartTime} onChange={(e) => set("dailyStartTime", e.target.value)} />
          </Field>
          <Field id="dailyEndTime" label="Daily end time">
            <Input id="dailyEndTime" type="time" value={value.dailyEndTime} onChange={(e) => set("dailyEndTime", e.target.value)} />
          </Field>
        </div>
      )}

      {show("fullDayPrice") && (
        <Field id="fullDayPrice" label="Full-day price ($) *">
          <Input id="fullDayPrice" type="number" step="0.01" min="0" value={value.fullDayPrice} onChange={(e) => set("fullDayPrice", e.target.value)} />
        </Field>
      )}
      {show("halfDayPrice") && (
        <Field id="halfDayPrice" label="Half-day price ($)">
          <Input id="halfDayPrice" type="number" step="0.01" min="0" value={value.halfDayPrice} onChange={(e) => set("halfDayPrice", e.target.value)} />
        </Field>
      )}
      {show("individualPrice") && (
        <Field id="individualPrice" label="Individual price ($) *">
          <Input id="individualPrice" type="number" step="0.01" min="0" value={value.individualPrice} onChange={(e) => set("individualPrice", e.target.value)} />
        </Field>
      )}
      {show("teamPrice") && (
        <Field id="teamPrice" label="Team price ($) *">
          <Input id="teamPrice" type="number" step="0.01" min="0" value={value.teamPrice} onChange={(e) => set("teamPrice", e.target.value)} />
        </Field>
      )}

      {show("ageRange") && (
        <div className="grid grid-cols-2 gap-4">
          <Field id="minAge" label="Youngest age *">
            <Input id="minAge" type="number" min="0" value={value.minAge} onChange={(e) => set("minAge", e.target.value)} />
          </Field>
          <Field id="maxAge" label="Oldest age *">
            <Input id="maxAge" type="number" min="0" value={value.maxAge} onChange={(e) => set("maxAge", e.target.value)} />
          </Field>
        </div>
      )}

      {(show("capacityKids") || show("capacityTeams")) && (
        <Field id="capacity" label={show("capacityTeams") ? "Max teams" : "Max participants"}>
          <Input id="capacity" type="number" min="0" value={value.capacity} onChange={(e) => set("capacity", e.target.value)} />
        </Field>
      )}

      {show("deposit") && (
        <Field id="deposit" label="Deposit ($)">
          <Input id="deposit" type="number" step="0.01" min="0" value={value.deposit} onChange={(e) => set("deposit", e.target.value)} />
        </Field>
      )}

      {show("divisions") && (
        <div className="grid grid-cols-2 gap-4">
          <Field id="divisionGender" label="Division (gender)">
            <Input id="divisionGender" value={value.divisionGender} onChange={(e) => set("divisionGender", e.target.value)} placeholder="coed / mens / womens" />
          </Field>
          <Field id="skillLevel" label="Skill level">
            <Input id="skillLevel" value={value.skillLevel} onChange={(e) => set("skillLevel", e.target.value)} placeholder="a / b / c / d / open" />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Type-check.**

Run: `npx tsc --noEmit`
Expected: exit 0. (No component unit test — covered by the Task 9 Playwright e2e. Field visibility logic is already unit-tested in Task 4.)

- [ ] **Step 3: Commit.**

```bash
git add src/components/admin/offering-wizard/DetailsStep.tsx
git commit -m "feat(admin): type-aware offering details step"
```

---

### Task 8: Wizard orchestrator (review + publish) and entry point

**Files:**
- Create: `src/components/admin/offering-wizard/OfferingWizard.tsx`
- Create: `src/lib/admin/offering-draft-to-payload.ts`
- Test: `tests/unit/offering-draft-to-payload.test.ts`
- Modify: `src/components/admin/seasons-list.tsx` (add the "+ New offering" entry that mounts the wizard)

**Interfaces:**
- Consumes: `TypeStep`, `DetailsStep`/`OfferingDraft`, `OFFERING_TYPES`, the `POST /api/admin/offerings` endpoint.
- Produces:
  - `function draftToOfferingPayload(type, draft, ctx): object` — converts the string-form `OfferingDraft` into the endpoint body (dollars→cents via `Math.round(parseFloat(x)*100)`, ages→ints, picks `signupModes` per type: camp/league→`["individual"]` (league adds `"team"` when teamPrice set), tournament→`["team"]`), and sets `status` from the publish choice.
  - `<OfferingWizard locationId sportId onDone={() => void} />` — 3-step flow calling the endpoint with `status:"open"` (Publish) or `status:"draft"` (Save draft).

- [ ] **Step 1: Write the failing test for the payload mapper.** Create `tests/unit/offering-draft-to-payload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftToOfferingPayload } from "@/lib/admin/offering-draft-to-payload";

const ctx = { locationId: "loc", sportId: "sp", publish: true };
const campDraft = {
  name: "Summer Camp", slug: "summer-camp", startDate: "2026-07-06", endDate: "2026-07-10",
  dailyStartTime: "09:00", dailyEndTime: "16:00",
  fullDayPrice: "375", halfDayPrice: "200", individualPrice: "", teamPrice: "",
  minAge: "5", maxAge: "12", capacity: "50", deposit: "100", divisionGender: "", skillLevel: "",
};

describe("draftToOfferingPayload", () => {
  it("maps a camp draft to cents, ints, individual signup, and open status", () => {
    const p = draftToOfferingPayload("camp", campDraft, ctx) as any;
    expect(p.programType).toBe("camp");
    expect(p.season.priceCents).toBe(37500);
    expect(p.season.halfDayPriceCents).toBe(20000);
    expect(p.season.minAge).toBe(5);
    expect(p.season.maxAge).toBe(12);
    expect(p.season.signupModes).toEqual(["individual"]);
    expect(p.season.status).toBe("open");
    expect(p.season.startTime).toBe("09:00");
  });

  it("uses draft status when not publishing", () => {
    const p = draftToOfferingPayload("camp", campDraft, { ...ctx, publish: false }) as any;
    expect(p.season.status).toBe("draft");
  });

  it("maps tournament to team signup and team price", () => {
    const t = draftToOfferingPayload("tournament", { ...campDraft, teamPrice: "1050", fullDayPrice: "", individualPrice: "" }, ctx) as any;
    expect(t.season.signupModes).toEqual(["team"]);
    expect(t.season.teamPriceCents).toBe(105000);
  });
});
```

- [ ] **Step 2: Run it, watch it fail.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/offering-draft-to-payload.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the mapper.** Create `src/lib/admin/offering-draft-to-payload.ts`:

```ts
import type { OfferingType } from "@/lib/admin/offering-types";
import type { OfferingDraft } from "@/components/admin/offering-wizard/DetailsStep";

const cents = (s: string) => (s.trim() === "" ? null : Math.round(parseFloat(s) * 100));
const intOrNull = (s: string) => (s.trim() === "" ? null : parseInt(s, 10));

export function draftToOfferingPayload(
  type: OfferingType,
  d: OfferingDraft,
  ctx: { locationId: string; sportId: string; publish: boolean },
) {
  const signupModes: ("individual" | "team")[] =
    type === "tournament"
      ? ["team"]
      : type === "league" && d.teamPrice.trim() !== ""
        ? ["individual", "team"]
        : ["individual"];

  const priceCents =
    type === "tournament"
      ? (cents(d.teamPrice) ?? 0)
      : type === "league"
        ? (cents(d.individualPrice) ?? 0)
        : (cents(d.fullDayPrice) ?? 0);

  return {
    programType: type,
    locationId: ctx.locationId,
    sportId: ctx.sportId,
    name: d.name,
    slug: d.slug,
    season: {
      name: d.name,
      slug: d.slug,
      startDate: d.startDate,
      endDate: d.endDate,
      startTime: d.dailyStartTime.trim() === "" ? null : d.dailyStartTime,
      endTime: d.dailyEndTime.trim() === "" ? null : d.dailyEndTime,
      priceCents,
      teamPriceCents: cents(d.teamPrice),
      halfDayPriceCents: cents(d.halfDayPrice),
      minAge: intOrNull(d.minAge),
      maxAge: intOrNull(d.maxAge),
      maxParticipants: intOrNull(d.capacity),
      depositCents: cents(d.deposit),
      allowDeposit: cents(d.deposit) != null,
      signupModes,
      divisionGender: d.divisionGender.trim() === "" ? null : d.divisionGender,
      skillLevel: d.skillLevel.trim() === "" ? null : d.skillLevel,
      status: ctx.publish ? "open" : "draft",
    },
  };
}
```

- [ ] **Step 4: Run the test, watch it pass.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/offering-draft-to-payload.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the orchestrator.** Create `src/components/admin/offering-wizard/OfferingWizard.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { TypeStep } from "./TypeStep";
import { DetailsStep, type OfferingDraft } from "./DetailsStep";
import { OFFERING_TYPES, type OfferingType } from "@/lib/admin/offering-types";
import { draftToOfferingPayload } from "@/lib/admin/offering-draft-to-payload";

const EMPTY: OfferingDraft = {
  name: "", slug: "", startDate: "", endDate: "", dailyStartTime: "", dailyEndTime: "",
  fullDayPrice: "", halfDayPrice: "", individualPrice: "", teamPrice: "",
  minAge: "", maxAge: "", capacity: "", deposit: "", divisionGender: "", skillLevel: "",
};

export function OfferingWizard({
  locationId,
  sportId,
  onDone,
}: {
  locationId: string;
  sportId: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<OfferingType | null>(null);
  const [draft, setDraft] = useState<OfferingDraft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(publish: boolean) {
    if (!type) return;
    setBusy(true);
    setError(null);
    try {
      const payload = draftToOfferingPayload(type, draft, { locationId, sportId, publish });
      const res = await fetch("/api/admin/offerings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to create offering");
      }
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} />}

      {step === 1 && (
        <>
          <h2 className="font-display text-2xl">What are you creating?</h2>
          <TypeStep value={type} onSelect={setType} />
          <Button disabled={!type} onClick={() => setStep(2)}>Next</Button>
        </>
      )}

      {step === 2 && type && (
        <>
          <h2 className="font-display text-2xl">{OFFERING_TYPES[type].label} details</h2>
          <DetailsStep type={type} value={draft} onChange={setDraft} />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)}>Review</Button>
          </div>
        </>
      )}

      {step === 3 && type && (
        <>
          <h2 className="font-display text-2xl">Review</h2>
          <p className="text-ink-muted">{OFFERING_TYPES[type].label}: {draft.name} ({draft.startDate} – {draft.endDate})</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button variant="outline" disabled={busy} onClick={() => submit(false)}>Save as draft</Button>
            <Button disabled={busy} onClick={() => submit(true)}>Publish now</Button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Mount the entry point.** In `src/components/admin/seasons-list.tsx`, add a "+ New offering" button near the existing "Add Season" button that opens a dialog hosting `<OfferingWizard locationId={...} sportId={...} onDone={() => { setWizardOpen(false); fetchData(); }} />`. Source `locationId`/`sportId` from the first available program's location/sport or a small picker (reuse the existing location/sport selects pattern already in this file). Keep the existing "Add Season" flow intact.

- [ ] **Step 7: Type-check + build.**

Run: `npx tsc --noEmit && ./scripts/with-bws.sh npm run build`
Expected: tsc exit 0; build "Complete!" (the `Astro.request.headers` warnings are known noise).

- [ ] **Step 8: Commit.**

```bash
git add src/components/admin/offering-wizard/ src/lib/admin/offering-draft-to-payload.ts tests/unit/offering-draft-to-payload.test.ts src/components/admin/seasons-list.tsx
git commit -m "feat(admin): offering wizard orchestrator + entry point"
```

---

### Task 9: E2E — create and publish a camp, see it on /youth/camps

**Files:**
- Create: `tests/e2e/offering-wizard-camp.spec.ts`

**Interfaces:**
- Consumes: the full wizard + endpoint; the seeded admin account and a seeded location/sport.

- [ ] **Step 1: Write the spec.** Create `tests/e2e/offering-wizard-camp.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

test("create and publish a camp via the wizard, then see it under youth camps", async ({ page }) => {
  await signIn(page, "admin@test.aspiresports.com", "TestAdmin123!");
  await page.goto("/admin/seasons", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  await page.getByRole("button", { name: /new offering/i }).click();
  await page.getByText("Camp", { exact: true }).click();
  await page.getByRole("button", { name: /^next$/i }).click();

  const slug = `e2e-camp-${Date.now()}`;
  await page.getByLabel("Name *").fill("E2E Summer Camp");
  await page.getByLabel("Start date *").fill("2026-07-06");
  await page.getByLabel("End date *").fill("2026-07-10");
  await page.getByLabel("Full-day price ($) *").fill("375");
  await page.getByLabel("Youngest age *").fill("5");
  await page.getByLabel("Oldest age *").fill("12");
  await page.getByRole("button", { name: /review/i }).click();
  await page.getByRole("button", { name: /publish now/i }).click();

  await expect(page.getByText("E2E Summer Camp")).toBeVisible();
});
```

> Implementer note: confirm the seeded admin credentials and the `signIn`/`waitForHydration` helper signatures in `tests/utils/test-helpers.ts`; the wizard's name→slug autofill may need a slug field fill if not auto-derived. Assert on `/youth/camps` if the seed org maps to the public youth surface; otherwise assert the new row appears in the admin seasons list (shown above).

- [ ] **Step 2: Run it.**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- offering-wizard-camp`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add tests/e2e/offering-wizard-camp.spec.ts
git commit -m "test(e2e): create + publish a camp via the offering wizard"
```

---

## Self-Review

**Spec coverage:**
- Wizard (type → details → review/publish) → Tasks 6, 7, 8. ✓
- Type-aware fields → Task 4 (config) drives Task 7. ✓
- Explicit publish vs draft → Task 8 (`status` open/draft). ✓
- Program + first Season in one transaction → Task 5. ✓
- Schema: half-day price, min/max age → Task 1; validated/persisted → Task 2. ✓
- Audience derivation from explicit age → Task 3. ✓
- Reuse public pipeline → no change needed; verified by Task 9 e2e. ✓
- Class type → intentionally **out of scope** per Global Constraints (gated on membership decision). ✓
- Validation (maxAge≥minAge) → Task 2. Half-day≤full-day "warn don't block" → spec calls it a soft warning; left as a non-blocking UI nicety, not enforced (YAGNI for v1).

**Placeholder scan:** Two implementer notes (Task 5 seed IDs / `seasonForOffering` shim; Task 9 helper signatures) point at existing patterns the implementer must copy rather than invent — they are not missing logic. No "TODO/handle edge cases" placeholders.

**Type consistency:** `OfferingType`, `OfferingFieldKey`, `OfferingDraft`, `draftToOfferingPayload`, and the `/api/admin/offerings` body shape are used consistently across Tasks 4–9.
