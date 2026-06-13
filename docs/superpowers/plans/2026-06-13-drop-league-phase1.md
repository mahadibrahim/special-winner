# The Drop League — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up the Drop League foundation — data model, admin Drop-season management, and the public BMI-gated registration flow — so an admin can open a Drop season and eligible players (BMI ≥ 27.5) can register with consent and a stored health profile. **No billing, no weigh-in/scoring yet** (those are Phases 2 and 3).

**Architecture:** Drop League is a distinct product line (see `docs/drop-league-brief.md`). Phase 1 adds two tables (`drop_seasons`, `drop_players`), an admin surface to create/list Drop seasons, and a public registration page + endpoint that gates on BMI and captures explicit health-data consent. Health units (height/weight) are entered in natural units (ft/in, lbs) and stored in metric base units (cm, grams) — encode/decode at the API boundary. Weight is sensitive: managed-Postgres encryption-at-rest covers storage; access is gated so weight is never returned on public surfaces.

**Tech Stack:** Astro 5 SSR, React 19, Drizzle ORM (PostgreSQL), Zod, Vitest. Mirror existing patterns (`seed-e2e-tests.ts` for schema/seed shape, `src/pages/api/admin/seasons.ts` for admin endpoints, `src/pages/api/public/season-interest.ts` for public capture endpoints).

**Brief:** `docs/drop-league-brief.md` (pricing confirmed **$99/month + $25 registration**, founder 2026-06-13).

**Phasing:** P1 (this) foundation + registration · P2 subscription billing ($99/mo + $25) · P3 weigh-in entry + bonus-goal scoring engine + scoreboard/table · P4 player dashboard, food diary, nudges, landing page, division selector.

---

## Decisions (stated, reversible — product is pre-launch)

- **Person link:** `drop_players` stores the registrant's contact fields (name/email/phone/dob) and an optional `user_id` (linked when the email matches an account; subscription in P2 will require an account). Keeps P1 registration frictionless.
- **Units:** height stored `height_cm` (int), weight stored `weight_g` (int); API accepts ft/in + lbs and converts. BMI computed server-side, stored `bmi` numeric(4,1).
- **Eligibility gate:** reject registration when computed BMI < 27.5 (the one hard rule).
- **Divisions:** `mens` (Mondays) / `womens` (Wednesdays) as an enum; single-gender at launch.
- **Health-data consent:** registration requires an explicit `consent` boolean; store `consent_at`. Weight/BMI never appear on any public/list response — only the player's own + (later) coach views.

## File structure

- Create `src/lib/db/schema/drop-league.ts` — `drop_seasons` + `drop_players` tables + enums.
- Modify `src/lib/db/schema/index.ts` — export it.
- Create migration `0045_*.sql`.
- Create `src/lib/drop-league/health.ts` — BMI + unit conversion helpers (pure, unit-tested).
- Create `src/pages/api/admin/drop-seasons.ts` — GET (list) + POST (create) Drop seasons (tenant + admin scoped).
- Create `src/pages/api/public/drop-register.ts` — POST registration (BMI gate, create player).
- Create `src/components/admin/drop-seasons-list.tsx` — admin create/list UI.
- Create `src/pages/admin/drop-league.astro` — admin page hosting the list.
- Create `src/components/drop-league/drop-register-form.tsx` — public registration form.
- Create `src/pages/drop-league/register.astro` — public registration page.
- Tests: `tests/unit/drop-health.test.ts`, `tests/api/admin/drop-seasons.test.ts`, `tests/api/public/drop-register.test.ts`.

---

## Task 1: Schema — `drop_seasons` + `drop_players`

**Files:** Create `src/lib/db/schema/drop-league.ts`; Modify `src/lib/db/schema/index.ts`.

- [ ] **Step 1: Create the schema module**

```typescript
import { pgTable, uuid, varchar, integer, numeric, boolean, date, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, locations } from "./organizations";
import { users } from "./users";

export const dropDivisionEnum = pgEnum("drop_division", ["mens", "womens"]);
export const dropSeasonStatusEnum = pgEnum("drop_season_status", ["draft", "open", "active", "completed", "cancelled"]);
export const dropPlayerStatusEnum = pgEnum("drop_player_status", ["registered", "active", "graduated", "cancelled"]);

export const dropSeasons = pgTable("drop_seasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  division: dropDivisionEnum("division").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  sessionDay: integer("session_day"), // 0=Sun..6=Sat; mens=1 (Mon), womens=3 (Wed)
  maxPlayers: integer("max_players"),
  status: dropSeasonStatusEnum("status").default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("drop_seasons_org_idx").on(t.organizationId),
  uniqueIndex("drop_seasons_org_slug_uniq").on(t.organizationId, t.slug),
]);

export const dropPlayers = pgTable("drop_players", {
  id: uuid("id").primaryKey().defaultRandom(),
  dropSeasonId: uuid("drop_season_id").notNull().references(() => dropSeasons.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  division: dropDivisionEnum("division").notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  dob: date("dob"),
  heightCm: integer("height_cm").notNull(),
  // Sensitive health data. Managed-Postgres encrypts at rest; never returned on public/list responses.
  seasonStartWeightG: integer("season_start_weight_g").notNull(),
  currentWeightG: integer("current_weight_g").notNull(),
  bmi: numeric("bmi", { precision: 4, scale: 1 }).notNull(),
  maintenanceStatus: boolean("maintenance_status").default(false).notNull(),
  consentAt: timestamp("consent_at").notNull(),
  status: dropPlayerStatusEnum("status").default("registered").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("drop_players_season_idx").on(t.dropSeasonId),
  uniqueIndex("drop_players_season_email_uniq").on(t.dropSeasonId, sql`lower(${t.email})`),
]);

export type DropSeason = typeof dropSeasons.$inferSelect;
export type NewDropSeason = typeof dropSeasons.$inferInsert;
export type DropPlayer = typeof dropPlayers.$inferSelect;
export type NewDropPlayer = typeof dropPlayers.$inferInsert;
```

- [ ] **Step 2:** In `src/lib/db/schema/index.ts`, add `export * from "./drop-league";` after the season-interest export.
- [ ] **Step 3:** `npx tsc --noEmit` → zero errors.
- [ ] **Step 4: Commit** — `git add src/lib/db/schema/drop-league.ts src/lib/db/schema/index.ts && git commit -m "feat(drop): drop_seasons + drop_players schema"`

## Task 2: Migration 0045

- [ ] **Step 1:** `npm run db:generate` → produces `src/lib/db/migrations/0045_*.sql` with the 3 enums + 2 tables.
- [ ] **Step 2:** Make enum creates idempotent (`DO $$ BEGIN CREATE TYPE … EXCEPTION WHEN duplicate_object THEN null; END $$;` per 0023/0024) and tables `IF NOT EXISTS`. Confirm the unique index on `(drop_season_id, lower(email))`.
- [ ] **Step 3:** `npm run db:migrate` against the local DB applies cleanly.
- [ ] **Step 4: Commit** — `git add src/lib/db/migrations/ && git commit -m "feat(drop): migration 0045"`

## Task 3: Health helpers (unit TDD)

**Files:** Create `src/lib/drop-league/health.ts`; Test `tests/unit/drop-health.test.ts`.

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import { lbsToGrams, feetInchesToCm, computeBmi, isEligibleBmi } from "@/lib/drop-league/health";

describe("drop-league health", () => {
  it("converts lbs to grams", () => { expect(lbsToGrams(200)).toBe(90718); });
  it("converts ft/in to cm", () => { expect(feetInchesToCm(5, 10)).toBe(178); });
  it("computes BMI from grams + cm", () => {
    // 90718 g (200 lb), 178 cm → BMI ~28.6
    expect(computeBmi(90718, 178)).toBeCloseTo(28.6, 1);
  });
  it("gates eligibility at 27.5", () => {
    expect(isEligibleBmi(27.5)).toBe(true);
    expect(isEligibleBmi(27.4)).toBe(false);
  });
});
```

- [ ] **Step 2:** Run → fails (module missing).
- [ ] **Step 3: Implement**

```typescript
const LB_TO_G = 453.59237;
export const lbsToGrams = (lbs: number): number => Math.round(lbs * LB_TO_G);
export const feetInchesToCm = (feet: number, inches: number): number => Math.round((feet * 12 + inches) * 2.54);
export const computeBmi = (weightG: number, heightCm: number): number => {
  const kg = weightG / 1000;
  const m = heightCm / 100;
  return Math.round((kg / (m * m)) * 10) / 10;
};
export const ELIGIBLE_BMI_MIN = 27.5;
export const isEligibleBmi = (bmi: number): boolean => bmi >= ELIGIBLE_BMI_MIN;
```

- [ ] **Step 4:** Run → 4 pass. `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit** — `git add src/lib/drop-league/health.ts tests/unit/drop-health.test.ts && git commit -m "feat(drop): BMI + unit-conversion helpers"`

## Task 4: Admin Drop-seasons endpoint (API TDD)

**Files:** Create `src/pages/api/admin/drop-seasons.ts`; Test `tests/api/admin/drop-seasons.test.ts`.

Mirror `src/pages/api/admin/seasons.ts` for auth/tenant scoping (`requireOrganizationContext` + admin role). GET lists Drop seasons for the org with a per-season `playerCount` (grouped query, standalone — not nested in a txn). POST validates a Zod body `{ division: 'mens'|'womens', name, slug, startDate, endDate, sessionDay?, maxPlayers?, status? }` (status enum default 'draft'), inserts scoped to the org. Read `seasons.ts` first to match the exact auth helper + response shape.

- [ ] Step 1: failing test (POST creates a draft Drop season; GET returns it with playerCount 0; non-admin → 401/403). Step 2: run→fail. Step 3: implement. Step 4: run→pass (API tests run on CI). Step 5: `npx tsc --noEmit` + `npm run build`. Step 6: commit `feat(drop): admin drop-seasons endpoint`.

## Task 5: Public BMI-gated registration endpoint (API TDD)

**Files:** Create `src/pages/api/public/drop-register.ts`; Test `tests/api/public/drop-register.test.ts`.

Mirror `src/pages/api/public/season-interest.ts` (rate-limit, tenant via `locals.organization`). Zod body `{ dropSeasonId, firstName, lastName, email, phone?, dob?, heightFeet, heightInches, weightLbs, consent: true }`. Logic: verify the Drop season is `open` + tenant-owned (else 404); require `consent === true` (else 400); convert units, compute BMI; **if BMI < 27.5 → 422 `{ error: "not_eligible" }`** (no row written); else insert `drop_players` (status 'registered', `season_start_weight_g = current_weight_g`, `consent_at = now()`), idempotent on `(drop_season_id, lower(email))`. Response never echoes weight/BMI back beyond an `{ ok: true, eligible: true }`.

- [ ] Step 1: failing tests (missing consent → 400; ineligible BMI → 422, no row; eligible → 200; non-open season → 404). Step 2: run→fail. Step 3: implement. Step 4: build + tsc. Step 5: commit `feat(drop): public BMI-gated registration endpoint`.

## Task 6: Admin UI — Drop seasons list/create

**Files:** Create `src/components/admin/drop-seasons-list.tsx`, `src/pages/admin/drop-league.astro`.

Client component (`useHydrationBeacon`) fetching `/api/admin/drop-seasons`: table of Drop seasons (division, name, dates, status, player count) + a create form (division select, name, dates, session day auto from division, status). The `.astro` page extends `BaseLayout`, is SSR (admin), middleware already gates `/admin/**`. Build, manual smoke.

- [ ] Steps: build the component + page; `npm run build`; commit `feat(drop): admin drop-league season management UI`.

## Task 7: Public registration page + form

**Files:** Create `src/components/drop-league/drop-register-form.tsx`, `src/pages/drop-league/register.astro`.

Form collects name/email/phone/dob, height (ft + in), weight (lbs), division (or derived from chosen season), and an explicit **consent checkbox** ("I consent to Aspire storing my weight for the Drop League"). Posts to `/api/public/drop-register`. On `422 not_eligible`, show a kind, non-judgmental message (brand tone: "Drop League is for players with a BMI of 27.5+ — this isn't the right fit right now"). On success, a confirmation. The page extends `BaseLayout`, SSR. Build, smoke.

- [ ] Steps: build form + page; `npm run build`; commit `feat(drop): public BMI-gated registration page`.

## Final verification
- `npx tsc --noEmit` zero errors; `npm run build` succeeds; `npx vitest run tests/unit/drop-health.test.ts` passes.
- Push branch, open PR, **wait for CI green** (build, test-api applies migration 0045 + runs the new API tests, test-critical, typecheck) before merge.

## Spec coverage (Phase 1 slice of the brief)
Covers: data model foundation (§11 `season`, `player_health_profile`, partial), BMI gate (§2), division structure (§2/§4), consent + private weight handling (§11 privacy). **Deferred by design:** subscription billing (P2 — §9/§11), weigh-in + bonus-goal engine + scoreboard (P3 — §5/§6/§7/§11), dashboards/food diary/nudges/landing/division-selector (P4 — §10/§11). Teams, weekly_weigh_in, match_result, food_diary, subscription tables come with their phases.
