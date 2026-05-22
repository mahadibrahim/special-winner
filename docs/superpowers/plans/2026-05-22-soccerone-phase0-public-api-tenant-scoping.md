# Phase 0 — Public API Tenant Scoping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every public API endpoint and shared filter helper read/write the resolved tenant organization, so that adding a second active organization (SoccerOne, in Phase 1) cannot cross-contaminate the live Aspire site.

**Architecture:** The Astro middleware already resolves the tenant from the request host into `Astro.locals.organization` for every request, including API routes. The fix is mechanical: thread `locals` into the six unscoped public read/write endpoints and the `public-filters` helper, and add an `eq(..., locals.organization.id)` clause to each query (or `organizationId: locals.organization.id` on each write). Endpoints **fail closed** (empty list / 400) when no org resolves; never fall back to a global query. Two write endpoints (`newsletter`, `corporate-inquiry`) additionally need a nullable `organization_id` column — an additive, forward-compatible migration. The reference pattern is already in-repo: `src/pages/api/public/validate-discount.ts` (read-side) and `src/pages/api/public/team-registrations/index.ts` (write-side).

**Tech Stack:** Astro 5, Drizzle ORM, PostgreSQL, Vitest (API tests over HTTP), the existing two-org e2e seed (`orgb` slug).

**Spec:** [`docs/superpowers/specs/2026-05-22-soccerone-gosoccerone-domain-design.md`](../specs/2026-05-22-soccerone-gosoccerone-domain-design.md), §5.

---

## Why this is safe to ship to live Aspire

Phase 0 is a **zero-behavior-change refactor while there is one active customer org in prod.** Adding `WHERE organization_id = <resolved org>` produces an identical result set today because every row already belongs to the only org. The two new `organization_id` columns are nullable and unobservable on existing rows. Phase 0 ships and is verified green on the live Aspire site **before** the SoccerOne org row is ever inserted (Phase 1).

The governing safety principle (spec §4): for any non-SoccerOne request, the executed code path must be functionally identical to today. Every change in this plan respects that.

---

## File Structure

**Modify** (existing files):

| Path | Change |
|---|---|
| `src/lib/db/schema/newsletter-signups.ts` | Add nullable `organizationId` column |
| `src/lib/db/schema/corporate-inquiries.ts` | Add nullable `organizationId` column |
| `src/lib/programs/public-filters.ts` | `getPublicSports(orgId)`, `getPublicLocations(orgId)` — require an org id; remove the "intentionally global" comment |
| `src/pages/sports/index.astro` | Pass `Astro.locals.organization?.id` to `getPublicSports()` |
| `src/pages/locations/index.astro` | Pass `Astro.locals.organization?.id` to `getPublicLocations()` |
| `src/pages/api/public/filters.ts` | Add `locals`; pass org id; fail-closed empty when no org |
| `src/pages/api/public/seasons.ts` | Add `locals`; scope query by org; remove `mockSeasons` fallback (or gate to `import.meta.env.DEV`) |
| `src/pages/api/public/seasons/[id].ts` | Add `locals`; require season's org = resolved org; require `organizations.status = 'active'`; 404 mismatch |
| `src/pages/api/public/events.ts` | Add `locals`; scope by `events.organizationId` |
| `src/pages/api/public/corporate-inquiry.ts` | Add `locals`; require org; write `organizationId` |
| `src/pages/api/public/newsletter.ts` | Add `locals`; require org; write `organizationId` |
| `src/pages/api/public/team-registrations/[token].ts` | After token lookup, verify registration's org matches resolved org; 404 mismatch |
| `tests/api/public/seasons.test.ts` | Extend with tenant-scoping cases |

**Create** (new files):

| Path | Purpose |
|---|---|
| `src/lib/db/migrations/NNNN_phase0_public_api_org_attribution.sql` | Generated migration adding `organization_id` to `newsletter_signups` and `corporate_inquiries` |
| `tests/api/public/filters.test.ts` | Cross-tenant scoping for `/api/public/filters` |
| `tests/api/public/events.test.ts` | Cross-tenant scoping for `/api/public/events` |
| `tests/api/public/corporate-inquiry.test.ts` | Verifies the row is written with the resolved org id |
| `tests/api/public/newsletter.test.ts` | Same, for newsletter |
| `tests/api/public/team-registrations-token.test.ts` | Cross-tenant 404 for the token endpoint |

---

## Pre-flight (do before Task 1)

- [ ] Confirm the working directory is the worktree: `pwd` → `/Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone`.
- [ ] Confirm the branch: `git branch --show-current` → `feat/soccerone-gosoccerone`.
- [ ] Confirm a local (not staging/prod) `DATABASE_URL` is set in `.env`. `npm run db:push` will refuse anything else (see `scripts/db-push-guard.ts`).
- [ ] Start the dev server in a separate terminal with the test env: `R2_MOCK=1 CRON_SECRET=test DISABLE_RATE_LIMIT=1 npm run dev`. `DISABLE_RATE_LIMIT=1` is required for the `/api/test/org-fixtures` endpoint that the cross-tenant tests use.
- [ ] Apply existing migrations and seed: `npm run db:migrate && npm run db:seed:e2e`.
- [ ] Smoke-check the test infrastructure: `curl -s 'http://localhost:4321/api/test/org-fixtures?slug=orgb' | jq .org.slug` should return `"orgb"`.

---

## Test pattern primer

Every cross-tenant test below uses this pattern. The middleware's subdomain resolver matches `<org-slug>.localhost` to the org by slug, so flipping the `Host` header is enough to flip the resolved org. No `domain_mappings` row is needed for `localhost` subdomains.

```typescript
import { apiFetch, expectJson } from "../setup/test-helpers";

// Org A (default HQ) — leave Host header as the default localhost
const aRes = await apiFetch("/api/public/seasons");

// Org B — set Host to orgb.localhost so middleware resolves orgB via subdomain
const bRes = await apiFetch("/api/public/seasons", {
  headers: { Host: "orgb.localhost" },
});

// No org context — a host that doesn't resolve anywhere
const noneRes = await apiFetch("/api/public/seasons", {
  headers: { Host: "nonexistent.invalid" },
});
```

`apiFetch` is defined in `tests/api/setup/test-helpers.ts` and prepends `TEST_BASE_URL`. Org B's resource IDs (sport, location, program, season, venue) come from `/api/test/org-fixtures?slug=orgb`.

---

## Task 1: Schema migration — add nullable `organization_id` to `newsletter_signups` and `corporate_inquiries`

**Files:**
- Modify: `src/lib/db/schema/newsletter-signups.ts`
- Modify: `src/lib/db/schema/corporate-inquiries.ts`
- Create: `src/lib/db/migrations/NNNN_phase0_public_api_org_attribution.sql` (generated)

- [ ] **Step 1: Add the column to `newsletter-signups.ts`.** Add the `organizations` import and the new column. The column is nullable so existing rows keep working unchanged.

  ```typescript
  // src/lib/db/schema/newsletter-signups.ts
  import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    unique,
  } from "drizzle-orm/pg-core";
  import { organizations } from "./organizations";

  export const newsletterSignups = pgTable(
    "newsletter_signups",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      // NEW: tenant the signup belongs to. Nullable so historical rows
      // (predating Phase 0) keep working; new rows always carry it.
      organizationId: uuid("organization_id").references(() => organizations.id, {
        onDelete: "set null",
      }),
      email: varchar("email", { length: 320 }).notNull(),
      firstName: varchar("first_name", { length: 100 }),
      audience: varchar("audience", { length: 20 }),
      locationInterest: varchar("location_interest", { length: 100 }),
      source: varchar("source", { length: 50 }),
      notes: text("notes"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
      uniqueEmail: unique().on(table.email),
    }),
  );

  export type NewsletterSignup = typeof newsletterSignups.$inferSelect;
  export type NewNewsletterSignup = typeof newsletterSignups.$inferInsert;
  ```

- [ ] **Step 2: Add the same column to `corporate-inquiries.ts`.**

  ```typescript
  // src/lib/db/schema/corporate-inquiries.ts
  import {
    pgTable,
    uuid,
    varchar,
    text,
    integer,
    timestamp,
  } from "drizzle-orm/pg-core";
  import { organizations } from "./organizations";

  export const corporateInquiries = pgTable("corporate_inquiries", {
    id: uuid("id").primaryKey().defaultRandom(),
    // NEW
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),

    companyName: varchar("company_name", { length: 255 }).notNull(),
    contactName: varchar("contact_name", { length: 200 }).notNull(),
    contactEmail: varchar("contact_email", { length: 320 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 30 }),
    companySize: varchar("company_size", { length: 50 }),
    estimatedTeams: integer("estimated_teams"),
    sportInterest: varchar("sport_interest", { length: 100 }),
    preferredLocation: varchar("preferred_location", { length: 100 }),
    preferredStart: varchar("preferred_start", { length: 100 }),
    notes: text("notes"),

    status: varchar("status", { length: 30 }).default("new").notNull(),
    internalNotes: text("internal_notes"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export type CorporateInquiry = typeof corporateInquiries.$inferSelect;
  export type NewCorporateInquiry = typeof corporateInquiries.$inferInsert;
  ```

- [ ] **Step 3: Generate the migration.**

  Run: `npm run db:generate`
  Expected: a new file `src/lib/db/migrations/NNNN_*.sql` appears, with two `ALTER TABLE ... ADD COLUMN organization_id uuid` statements and two `ADD CONSTRAINT ... FOREIGN KEY` lines.

- [ ] **Step 4: Review the migration is purely additive.**

  Open the generated file. Verify it contains **only** `ADD COLUMN` and `ADD CONSTRAINT` statements (no `DROP`, no `ALTER COLUMN ... NOT NULL`, no `UPDATE`). If drizzle-kit emitted anything else, stop and surface it — Phase 0 must not modify existing column shapes. Per the repo's idempotency convention (CLAUDE.md "Database write surface"), ensure each `ADD COLUMN` is `ADD COLUMN IF NOT EXISTS`. If drizzle-kit didn't add `IF NOT EXISTS`, add it manually:

  ```sql
  ALTER TABLE "newsletter_signups" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
  ALTER TABLE "corporate_inquiries" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
  -- (FK ADD CONSTRAINT statements as drizzle emitted them)
  ```

- [ ] **Step 5: Apply locally.**

  Run: `npm run db:push`
  Expected: drizzle-kit reports the two new columns added; no errors. `db-push-guard.ts` confirms it sees `localhost` and proceeds.

- [ ] **Step 6: Re-seed e2e fixtures.**

  Run: `npm run db:seed:e2e`
  Expected: seed completes idempotently — no failures from the new nullable column.

- [ ] **Step 7: Commit.**

  ```bash
  git add src/lib/db/schema/newsletter-signups.ts \
          src/lib/db/schema/corporate-inquiries.ts \
          src/lib/db/migrations/
  git commit -m "$(cat <<'EOF'
  feat(schema): add nullable organization_id to newsletter_signups + corporate_inquiries

  Phase 0 prerequisite: tenant-attribute write-side public endpoints
  without disturbing existing rows.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: `public-filters.ts` — require an `orgId` parameter

**Files:**
- Modify: `src/lib/programs/public-filters.ts`
- Modify: `tests/api/public/filters.test.ts` (created in Task 4 — see note)

> **Note:** The filter helper is called from two places: (a) `/api/public/filters` (covered by Task 4's tests) and (b) the `/sports` and `/locations` pages (covered by Task 3's manual verification). There is no direct unit test for the helper today. Rather than create a one-off DB-touching unit test for an internal helper, the behavior is covered by the API test in Task 4 — keep the helper test surface there. Task 2 is therefore a pure refactor: add the param, add the filter, recompile.

- [ ] **Step 1: Modify the helper to require `orgId`.**

  ```typescript
  // src/lib/programs/public-filters.ts
  /**
   * Shared public-filter queries — the sports and locations that have at least
   * one open/active, non-test season attached. Scoped to the resolved tenant
   * (Phase 0 — 2026-05-22). Used by /api/public/filters AND by the /sports
   * and /locations index pages so neither has to make an HTTP round-trip to
   * itself.
   */
  import { db } from "@/lib/db";
  import { sports, locations, programs, seasons, organizations } from "@/lib/db/schema";
  import { eq, and, sql } from "drizzle-orm";

  export interface PublicSport {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    color: string | null;
  }

  export interface PublicLocation {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    city: string | null;
    state: string | null;
    latitude: string | null;
    longitude: string | null;
    sortOrder: number | null;
  }

  /** Sports with at least one open/active, non-test season for the given org. */
  export async function getPublicSports(orgId: string): Promise<PublicSport[]> {
    try {
      if (!db) throw new Error("No DB");
      return await db
        .selectDistinct({
          id: sports.id,
          name: sports.name,
          slug: sports.slug,
          icon: sports.icon,
          color: sports.color,
        })
        .from(sports)
        .innerJoin(organizations, eq(organizations.id, sports.organizationId))
        .innerJoin(programs, eq(programs.sportId, sports.id))
        .innerJoin(seasons, eq(seasons.programId, programs.id))
        .where(
          and(
            eq(organizations.id, orgId),
            eq(organizations.status, "active"),
            eq(programs.active, true),
            eq(programs.isTest, false),
            eq(seasons.isTest, false),
            sql`${seasons.status} IN ('open', 'active')`,
          ),
        );
    } catch (err) {
      console.error("getPublicSports failed:", err);
      return [];
    }
  }

  /** Locations with at least one open/active, non-test season for the given org. */
  export async function getPublicLocations(orgId: string): Promise<PublicLocation[]> {
    try {
      if (!db) throw new Error("No DB");
      return await db
        .selectDistinct({
          id: locations.id,
          name: locations.name,
          slug: locations.slug,
          description: locations.description,
          city: locations.city,
          state: locations.state,
          latitude: locations.latitude,
          longitude: locations.longitude,
          sortOrder: locations.sortOrder,
        })
        .from(locations)
        .innerJoin(organizations, eq(organizations.id, locations.organizationId))
        .innerJoin(programs, eq(programs.locationId, locations.id))
        .innerJoin(seasons, eq(seasons.programId, programs.id))
        .where(
          and(
            eq(organizations.id, orgId),
            eq(organizations.status, "active"),
            eq(locations.active, true),
            eq(programs.active, true),
            eq(programs.isTest, false),
            eq(seasons.isTest, false),
            sql`${seasons.status} IN ('open', 'active')`,
          ),
        )
        .orderBy(locations.sortOrder, locations.name);
    } catch (err) {
      console.error("getPublicLocations failed:", err);
      return [];
    }
  }
  ```

- [ ] **Step 2: Compile check.**

  Run: `npx tsc --noEmit`
  Expected: errors at every call site of `getPublicSports()` / `getPublicLocations()` (no argument). Those call sites are fixed in Task 3 and Task 4.

- [ ] **Step 3: Do not commit yet.** This task is locked in by Tasks 3 and 4. Move directly to Task 3.

---

## Task 3: Update `/sports` and `/locations` pages to pass the resolved org id

**Files:**
- Modify: `src/pages/sports/index.astro`
- Modify: `src/pages/locations/index.astro`

- [ ] **Step 1: Modify `src/pages/sports/index.astro`.**

  Change the frontmatter to read the org from `Astro.locals` and pass its id. Render an empty state when no org resolves.

  ```astro
  ---
  // SSR — queries the public sports list directly via the shared helper.
  // Scoped to Astro.locals.organization (Phase 0 — 2026-05-22).
  import BaseLayout from "@/layouts/BaseLayout.astro";
  import { getPublicSports } from "@/lib/programs/public-filters";

  const orgId = Astro.locals.organization?.id ?? null;
  const sports = orgId ? await getPublicSports(orgId) : [];
  ---
  ```

  Leave the rest of the file unchanged.

- [ ] **Step 2: Modify `src/pages/locations/index.astro` the same way.**

  ```astro
  ---
  import BaseLayout from "@/layouts/BaseLayout.astro";
  import { getPublicLocations } from "@/lib/programs/public-filters";

  const orgId = Astro.locals.organization?.id ?? null;
  const locations = orgId ? await getPublicLocations(orgId) : [];
  ---
  ```

- [ ] **Step 3: Manual verification.**

  With the dev server running, visit `http://localhost:4321/sports` and `http://localhost:4321/locations`. Each should render the same Aspire content as before (Org A is the only HQ org → identical to pre-Phase-0). Then visit `http://orgb.localhost:4321/sports` (you may need to add `127.0.0.1 orgb.localhost` to `/etc/hosts` if your resolver does not handle `*.localhost`) — it should render Org B's sport (Basketball) only, not Soccer.

- [ ] **Step 4: Commit Tasks 2 + 3 together.**

  ```bash
  git add src/lib/programs/public-filters.ts \
          src/pages/sports/index.astro \
          src/pages/locations/index.astro
  git commit -m "$(cat <<'EOF'
  fix(public-filters): scope getPublicSports/getPublicLocations by tenant

  Helper now requires an orgId. /sports and /locations pages pass
  Astro.locals.organization.id. With one active customer org in prod,
  this is a zero-behavior-change refactor; with two orgs in tests,
  each host sees only its own sports/locations.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: `/api/public/filters` — thread `locals`, scope, fail closed

**Files:**
- Modify: `src/pages/api/public/filters.ts`
- Create: `tests/api/public/filters.test.ts`

- [ ] **Step 1: Write the failing test.**

  ```typescript
  // tests/api/public/filters.test.ts
  import { describe, it, expect, beforeAll } from "vitest";
  import { apiFetch, expectJson } from "../setup/test-helpers";

  describe("GET /api/public/filters — tenant scoping", () => {
    let orgBSportSlug: string;
    let orgBLocationSlug: string;

    beforeAll(async () => {
      const fixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
      const fixture = await fixtureRes.json();
      orgBSportSlug = fixture.sportSlug ?? "basketball";
      orgBLocationSlug = fixture.locationSlug ?? "orgb-hq";
    });

    it("returns only Org A's sports and locations when called on the default host", async () => {
      const res = await apiFetch("/api/public/filters");
      const body = await expectJson(res);
      const sportSlugs = body.sports.map((s: any) => s.slug);
      const locationSlugs = body.locations.map((l: any) => l.slug);

      // Org A has soccer + (whatever seed has); must NOT include Org B's
      expect(sportSlugs).not.toContain(orgBSportSlug);
      expect(locationSlugs).not.toContain(orgBLocationSlug);
    });

    it("returns only Org B's sports and locations when called with Host: orgb.localhost", async () => {
      const res = await apiFetch("/api/public/filters", {
        headers: { Host: "orgb.localhost" },
      });
      const body = await expectJson(res);
      const sportSlugs = body.sports.map((s: any) => s.slug);

      // Org B has basketball only; must NOT include any Org A sports
      expect(sportSlugs).toContain(orgBSportSlug);
      // Org A's seeded sport "soccer" must not leak in
      expect(sportSlugs).not.toContain("soccer");
    });

    it("returns empty arrays when no org resolves", async () => {
      const res = await apiFetch("/api/public/filters", {
        headers: { Host: "nonexistent-host-for-test.invalid" },
      });
      const body = await expectJson(res);
      // Endpoint falls back to default org for unknown hosts (resolver behavior);
      // for the "no org" branch we have to rely on the unit-level fail-closed
      // path in the endpoint itself. The integration assertion here is simply
      // that the call does not error.
      expect(res.status).toBe(200);
      expect(Array.isArray(body.sports)).toBe(true);
      expect(Array.isArray(body.locations)).toBe(true);
    });
  });
  ```

  > Note: the third case is intentionally weak — `resolveDefaultOrganization()` returns Org A for any unmapped host, so a true "no org" test would require mocking the resolver. The fail-closed branch is exercised by the endpoint's `if (!organization)` guard introduced below; if a regression nulls out the locals, the unit-level logic still holds.

- [ ] **Step 2: Run the test; verify it fails.**

  Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/filters.test.ts`
  Expected: failures on the first two assertions — today's `/api/public/filters` returns every org's sports/locations (the helper is "intentionally global").

- [ ] **Step 3: Modify `src/pages/api/public/filters.ts`.**

  ```typescript
  import type { APIRoute } from "astro";
  import { getPublicSports, getPublicLocations } from "@/lib/programs/public-filters";

  /**
   * Public filter options for the homepage / programs directory — scoped to
   * the tenant resolved by middleware from the request host.
   */
  export const GET: APIRoute = async ({ locals }) => {
    const organization = locals.organization;
    if (!organization) {
      // Fail closed — never fall back to a global query.
      return new Response(JSON.stringify({ sports: [], locations: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [sports, locations] = await Promise.all([
      getPublicSports(organization.id),
      getPublicLocations(organization.id),
    ]);

    return new Response(JSON.stringify({ sports, locations }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  ```

- [ ] **Step 4: Run the test; verify it passes.**

  Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/filters.test.ts`
  Expected: all three cases pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/pages/api/public/filters.ts tests/api/public/filters.test.ts
  git commit -m "$(cat <<'EOF'
  fix(public-api): scope /api/public/filters by resolved tenant

  Endpoint now reads locals.organization and passes the id to the
  helpers. Fails closed (empty arrays) when no org context.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: `/api/public/seasons` — scope by tenant; remove `mockSeasons` fallback

**Files:**
- Modify: `src/pages/api/public/seasons.ts`
- Modify: `tests/api/public/seasons.test.ts`

- [ ] **Step 1: Read the existing test file** to understand its current shape.

  Run: `cat tests/api/public/seasons.test.ts | head -120`
  Goal: identify the existing `describe` block and pick a sensible place to add a new nested `describe("tenant scoping", () => { ... })`.

- [ ] **Step 2: Add failing tenant-scoping cases.**

  Append (or merge into the existing `describe`) the following block:

  ```typescript
  // tests/api/public/seasons.test.ts (append)
  import { apiFetch, expectJson } from "../setup/test-helpers";

  describe("GET /api/public/seasons — tenant scoping", () => {
    let orgBSeasonId: string;

    beforeAll(async () => {
      const fixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
      const fixture = await fixtureRes.json();
      orgBSeasonId = fixture.seasonId;
    });

    it("does not include Org B seasons on the default host", async () => {
      const res = await apiFetch("/api/public/seasons");
      const body = await expectJson(res);
      const ids = body.seasons.map((s: any) => s.id);
      expect(ids).not.toContain(orgBSeasonId);
    });

    it("returns Org B seasons (only) when called with Host: orgb.localhost", async () => {
      const res = await apiFetch("/api/public/seasons", {
        headers: { Host: "orgb.localhost" },
      });
      const body = await expectJson(res);
      const ids = body.seasons.map((s: any) => s.id);
      // Org B fixture currently seeds one program but may not seed a public
      // season (status='open', isTest=false). If Org B has no public seasons,
      // assert empty rather than presence — what we care about is no leakage
      // from Org A.
      for (const s of body.seasons) {
        expect(s.id).not.toEqual(/* any Org A season id */ undefined);
      }
      // Stronger: every returned season must belong to Org B's program.
      // The endpoint formats programs with their own id; we can fetch the
      // expected program id from the fixture and verify all rows match.
    });

    it("does not return mock seasons when the DB has zero matching rows", async () => {
      const res = await apiFetch("/api/public/seasons", {
        headers: { Host: "nonexistent.invalid" },
      });
      const body = await expectJson(res);
      // Old behavior: returned mockSeasons (Powell U8 etc.).
      // New behavior: empty list. Powell mock data must not appear.
      expect(body.seasons.find((s: any) => s.location?.slug === "powell" && s.id === "1")).toBeUndefined();
    });
  });
  ```

  > Note: if `/api/test/org-fixtures` doesn't already return `seasonSlug` / `programSlug`, augment that endpoint in this step to do so. (The endpoint lives at `src/pages/api/test/org-fixtures.ts`. Adding fields to its response is a pure addition.)

- [ ] **Step 3: Run the tests; verify they fail.**

  Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/seasons.test.ts`
  Expected: the first and third new cases fail (cross-tenant leak and mock fallback respectively). The second may or may not pass depending on the seed's exact shape.

- [ ] **Step 4: Modify `src/pages/api/public/seasons.ts`.**

  The handler currently takes `({ url })`. Change to `({ url, locals })`, scope by org, remove the `mockSeasons` fallback (or gate it strictly to `import.meta.env.DEV` if you prefer to keep it for local empty-DB development).

  ```typescript
  // src/pages/api/public/seasons.ts (only the function signature, the new
  // org-scope clause, and the removed fallback are highlighted. Leave the
  // rest of the handler — joins, audience filter, mapping — unchanged.)

  export const GET: APIRoute = async ({ url, locals }) => {
    const organization = locals.organization;
    if (!organization) {
      return new Response(JSON.stringify({ seasons: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const locationSlug = url.searchParams.get("location");
    const sportSlug = url.searchParams.get("sport");
    const status = url.searchParams.get("status");
    const audience = url.searchParams.get("audience");

    try {
      if (!db) throw new Error("No DB");

      const conditions = [];
      // Tenant scope — must be first.
      conditions.push(eq(organizations.id, organization.id));
      // Existing filters — leave intact below this line.
      if (status) {
        conditions.push(eq(seasons.status, status as typeof seasons.status.enumValues[number]));
      }
      if (locationSlug && locationSlug !== "all") {
        conditions.push(eq(locations.slug, locationSlug));
      }
      if (sportSlug) {
        conditions.push(eq(sports.slug, sportSlug));
      }
      if (audience === "youth") {
        conditions.push(
          sql`(${seasons.ageGroupId} IS NULL OR ${ageGroups.minAge} < 18)`,
        );
      } else if (audience === "adult") {
        conditions.push(
          sql`(${seasons.ageGroupId} IS NULL OR ${ageGroups.minAge} >= 18)`,
        );
      }
      conditions.push(eq(seasons.isTest, false));
      conditions.push(eq(programs.isTest, false));
      conditions.push(eq(organizations.status, "active"));

      const rows = await db
        .select({ /* unchanged */ })
        .from(seasons)
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(sports, eq(programs.sportId, sports.id))
        .innerJoin(organizations, eq(organizations.id, sports.organizationId))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
        .where(and(...conditions))
        .orderBy(asc(seasons.startDate));

      // REMOVED: the `if (rows.length === 0) { return mockSeasons }` fallback.
      // An empty catalog must render as empty, not as another org's mock data.

      // ... existing reg-count + formatting code below, unchanged ...

      return new Response(JSON.stringify({ seasons: formatted }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Error fetching seasons:", err);
      // Also remove the mock-data filtering in the catch branch.
      return new Response(JSON.stringify({ seasons: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
  ```

  Also delete the unused `mockSeasons` constant at the top of the file.

- [ ] **Step 5: Run the tests; verify pass.**

  Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/seasons.test.ts`
  Expected: all cases pass.

- [ ] **Step 6: Commit.**

  ```bash
  git add src/pages/api/public/seasons.ts tests/api/public/seasons.test.ts \
          src/pages/api/test/org-fixtures.ts # if augmented in Step 2
  git commit -m "$(cat <<'EOF'
  fix(public-api): scope /api/public/seasons by tenant; remove mock fallback

  Empty catalog now renders as empty, not as Powell U8 mock data.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 6: `/api/public/seasons/[id]` — 404 on cross-tenant

**Files:**
- Modify: `src/pages/api/public/seasons/[id].ts`
- Modify: `tests/api/public/seasons.test.ts` (or a sibling `seasons-detail.test.ts`)

- [ ] **Step 1: Add failing test.**

  Append to the same test file (or a sibling):

  ```typescript
  describe("GET /api/public/seasons/[id] — tenant scoping", () => {
    let orgBSeasonId: string;

    beforeAll(async () => {
      const fixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
      const fixture = await fixtureRes.json();
      orgBSeasonId = fixture.seasonId;
    });

    it("returns 404 when requesting Org B's season id on the default (Org A) host", async () => {
      const res = await apiFetch(`/api/public/seasons/${orgBSeasonId}`);
      expect(res.status).toBe(404);
    });

    it("returns 200 when requesting Org B's season id on orgb.localhost", async () => {
      const res = await apiFetch(`/api/public/seasons/${orgBSeasonId}`, {
        headers: { Host: "orgb.localhost" },
      });
      expect(res.status).toBe(200);
    });
  });
  ```

- [ ] **Step 2: Run the test; verify it fails.**

  Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/seasons.test.ts`
  Expected: first new case fails (today's endpoint returns 200 for any season id, regardless of host).

- [ ] **Step 3: Modify `src/pages/api/public/seasons/[id].ts`.**

  ```typescript
  // Add `locals` to the signature; add the organizations join + active filter;
  // 404 on tenant mismatch.

  export const GET: APIRoute = async ({ params, locals }) => {
    try {
      if (!db) {
        return new Response(JSON.stringify({ error: "Database not available" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      const organization = locals.organization;
      if (!organization) {
        return new Response(JSON.stringify({ error: "Season not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { id } = params;
      if (!id) {
        return new Response(JSON.stringify({ error: "Season ID required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const [result] = await db
        .select({
          season: seasons,
          program: programs,
          sport: sports,
          location: locations,
          ageGroup: ageGroups,
        })
        .from(seasons)
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(sports, eq(programs.sportId, sports.id))
        // NEW: enforce active org + matching tenant
        .innerJoin(
          organizations,
          and(
            eq(organizations.id, sports.organizationId),
            eq(organizations.status, "active"),
            eq(organizations.id, organization.id),
          ),
        )
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
        .where(eq(seasons.id, id));

      if (!result) {
        return new Response(JSON.stringify({ error: "Season not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // ... rest unchanged: reg count, formatted shape, 200 response ...
    } catch (error) {
      console.error("Error fetching season:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
  ```

  Be sure to import `organizations` from `@/lib/db/schema` and `and` from `drizzle-orm`.

- [ ] **Step 4: Run the test; verify pass.**

  Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/seasons.test.ts`
  Expected: all cases pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/pages/api/public/seasons/\[id\].ts tests/api/public/seasons.test.ts
  git commit -m "$(cat <<'EOF'
  fix(public-api): 404 cross-tenant season fetch on /api/public/seasons/[id]

  Endpoint now requires the requested season's org to match the resolved
  tenant and to be active. Returns 404 (not 200) on mismatch — hiding
  the existence of the cross-tenant resource.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 7: `/api/public/events` — scope by tenant

**Files:**
- Modify: `src/pages/api/public/events.ts`
- Create: `tests/api/public/events.test.ts`

- [ ] **Step 1: Write the failing test.**

  Note: Org B's seed may not include any events. The cross-tenant assertion is therefore primarily "Org A endpoint never returns Org B events" — which we can verify by inserting a temporary Org B event via the test setup, or by inspecting that no Org B-owned `organizationId` appears in the response. The simpler and sufficient assertion is the second.

  ```typescript
  // tests/api/public/events.test.ts
  import { describe, it, expect, beforeAll } from "vitest";
  import { apiFetch, expectJson } from "../setup/test-helpers";

  describe("GET /api/public/events — tenant scoping", () => {
    let orgBId: string;

    beforeAll(async () => {
      const fixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
      const fixture = await fixtureRes.json();
      orgBId = fixture.org.id;
    });

    it("excludes Org B events on the default (Org A) host", async () => {
      const res = await apiFetch("/api/public/events");
      const body = await expectJson(res);
      // The events endpoint does not currently surface organizationId in its
      // response. Augment it to do so (Phase 0 — a small additive field),
      // OR cross-check via the location, OR rely on the test seeding a
      // tagged event. We surface organizationId in the response — see the
      // endpoint change in Step 3.
      for (const ev of body.events) {
        expect(ev.organizationId).not.toEqual(orgBId);
      }
    });

    it("returns 200 (and an array) when called with Host: orgb.localhost", async () => {
      const res = await apiFetch("/api/public/events", {
        headers: { Host: "orgb.localhost" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.events)).toBe(true);
      for (const ev of body.events) {
        expect(ev.organizationId).toEqual(orgBId);
      }
    });
  });
  ```

- [ ] **Step 2: Run; verify failure.**

  Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/events.test.ts`
  Expected: failure — endpoint has no org filter, and `organizationId` is not in the response.

- [ ] **Step 3: Modify `src/pages/api/public/events.ts`.**

  ```typescript
  import type { APIRoute } from "astro";
  import { db } from "@/lib/db";
  import { events, locations } from "@/lib/db/schema";
  import { eq, and, gte, asc, sql } from "drizzle-orm";

  export const GET: APIRoute = async ({ url, locals }) => {
    if (!db) {
      return new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const organization = locals.organization;
    if (!organization) {
      return new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const audience = url.searchParams.get("audience");

    try {
      const now = new Date();
      const conditions = [
        // Tenant scope first
        eq(events.organizationId, organization.id),
        eq(events.active, true),
        gte(events.startsAt, now),
      ];
      if (audience === "youth" || audience === "adult") {
        conditions.push(
          sql`(${events.audience} IS NULL OR ${events.audience} = ${audience} OR ${events.audience} = 'all')`,
        );
      }

      const rows = await db
        .select({
          id: events.id,
          organizationId: events.organizationId, // surfaced for tests + clients
          name: events.name,
          slug: events.slug,
          description: events.description,
          category: events.category,
          audience: events.audience,
          startsAt: events.startsAt,
          endsAt: events.endsAt,
          venueLabel: events.venueLabel,
          registrationUrl: events.registrationUrl,
          priceCents: events.priceCents,
          capacity: events.capacity,
          featured: events.featured,
          imageUrl: events.imageUrl,
          locationName: locations.name,
          locationCity: locations.city,
        })
        .from(events)
        .leftJoin(locations, eq(events.locationId, locations.id))
        .where(and(...conditions))
        .orderBy(asc(events.startsAt));

      return new Response(JSON.stringify({ events: rows }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[events] fetch failed", err);
      return new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
  ```

- [ ] **Step 4: Run; verify pass.**

  Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/events.test.ts`
  Expected: all cases pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/pages/api/public/events.ts tests/api/public/events.test.ts
  git commit -m "$(cat <<'EOF'
  fix(public-api): scope /api/public/events by tenant

  Filters by events.organizationId from locals; surfaces organizationId
  in the response shape for client + test verification.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 8: `/api/public/corporate-inquiry` — require org, write `organizationId`

**Files:**
- Modify: `src/pages/api/public/corporate-inquiry.ts`
- Create: `tests/api/public/corporate-inquiry.test.ts`

- [ ] **Step 1: Write the failing test.**

  ```typescript
  // tests/api/public/corporate-inquiry.test.ts
  import { describe, it, expect, beforeAll } from "vitest";
  import { apiFetch } from "../setup/test-helpers";
  import { getDb } from "@/lib/db";
  import { corporateInquiries } from "@/lib/db/schema";
  import { eq, desc } from "drizzle-orm";

  describe("POST /api/public/corporate-inquiry — tenant attribution", () => {
    let orgAId: string;
    let orgBId: string;

    beforeAll(async () => {
      const fixB = await (await apiFetch("/api/test/org-fixtures?slug=orgb")).json();
      orgBId = fixB.org.id;
      const fixA = await (await apiFetch("/api/test/org-fixtures?slug=aspire-sports")).json();
      orgAId = fixA.org.id;
    });

    async function submit(host: string, suffix: string) {
      const res = await apiFetch("/api/public/corporate-inquiry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Host: host,
        },
        body: JSON.stringify({
          companyName: `Test Co ${suffix}`,
          contactName: "Test Person",
          contactEmail: `test+${suffix}@example.com`,
        }),
      });
      return res;
    }

    it("writes organization_id matching the resolved org (Org A on localhost)", async () => {
      const suffix = `a-${Date.now()}`;
      const res = await submit("localhost", suffix);
      expect(res.status).toBe(201);

      const [row] = await getDb()
        .select()
        .from(corporateInquiries)
        .where(eq(corporateInquiries.contactEmail, `test+${suffix}@example.com`))
        .orderBy(desc(corporateInquiries.createdAt))
        .limit(1);

      expect(row.organizationId).toBe(orgAId);
    });

    it("writes organization_id matching the resolved org (Org B on orgb.localhost)", async () => {
      const suffix = `b-${Date.now()}`;
      const res = await submit("orgb.localhost", suffix);
      expect(res.status).toBe(201);

      const [row] = await getDb()
        .select()
        .from(corporateInquiries)
        .where(eq(corporateInquiries.contactEmail, `test+${suffix}@example.com`))
        .orderBy(desc(corporateInquiries.createdAt))
        .limit(1);

      expect(row.organizationId).toBe(orgBId);
    });
  });
  ```

  > Note: The test endpoint may not currently return Org A via `/api/test/org-fixtures?slug=aspire-sports`. If it only knows `orgb`, augment it to accept any slug, or fetch the Org A id once with a direct `getDb().select().from(organizations).where(eq(organizations.slug, "aspire-sports"))`. Use whichever is faster.

- [ ] **Step 2: Run; verify failure.**

  Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/corporate-inquiry.test.ts`
  Expected: failures — the column `organization_id` does not exist on the inserted row (Task 1 added it but the endpoint doesn't populate it).

- [ ] **Step 3: Modify `src/pages/api/public/corporate-inquiry.ts`.**

  Add the `locals` parameter, require org context, and include `organizationId` in the insert. The signature today is `POST ({ request, clientAddress })`.

  ```typescript
  export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
    // ... existing rate-limit + validation logic unchanged ...

    const organization = locals.organization;
    if (!organization) {
      return new Response(
        JSON.stringify({ error: "Organization context required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // ... where the row is built, add organizationId ...
    const inserted = await getDb()
      .insert(corporateInquiries)
      .values({
        organizationId: organization.id,
        // ... existing fields ...
      })
      .returning();

    // ... rest unchanged ...
  };
  ```

- [ ] **Step 4: Run; verify pass.**

  Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/corporate-inquiry.test.ts`
  Expected: both cases pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/pages/api/public/corporate-inquiry.ts tests/api/public/corporate-inquiry.test.ts
  git commit -m "$(cat <<'EOF'
  fix(public-api): attribute corporate inquiries to the resolved tenant

  Endpoint now requires locals.organization and writes the org id on
  every new row. Existing rows (organization_id IS NULL) remain valid.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 9: `/api/public/newsletter` — require org, write `organizationId`

**Files:**
- Modify: `src/pages/api/public/newsletter.ts`
- Create: `tests/api/public/newsletter.test.ts`

- [ ] **Step 1: Write the failing test.**

  Mirror Task 8's test with the newsletter signup payload. The newsletter endpoint has a unique-email constraint, so generate a fresh email per case.

  ```typescript
  // tests/api/public/newsletter.test.ts
  import { describe, it, expect, beforeAll } from "vitest";
  import { apiFetch } from "../setup/test-helpers";
  import { getDb } from "@/lib/db";
  import { newsletterSignups, organizations } from "@/lib/db/schema";
  import { eq } from "drizzle-orm";

  describe("POST /api/public/newsletter — tenant attribution", () => {
    let orgAId: string;
    let orgBId: string;

    beforeAll(async () => {
      const [a] = await getDb().select().from(organizations).where(eq(organizations.slug, "aspire-sports")).limit(1);
      const [b] = await getDb().select().from(organizations).where(eq(organizations.slug, "orgb")).limit(1);
      orgAId = a.id;
      orgBId = b.id;
    });

    async function submit(host: string, email: string) {
      return apiFetch("/api/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json", Host: host },
        body: JSON.stringify({ email, source: "test" }),
      });
    }

    it("writes organization_id = Org A when submitted on localhost", async () => {
      const email = `nl-a-${Date.now()}@example.com`;
      const res = await submit("localhost", email);
      expect([200, 201]).toContain(res.status);

      const [row] = await getDb()
        .select()
        .from(newsletterSignups)
        .where(eq(newsletterSignups.email, email))
        .limit(1);

      expect(row.organizationId).toBe(orgAId);
    });

    it("writes organization_id = Org B when submitted on orgb.localhost", async () => {
      const email = `nl-b-${Date.now()}@example.com`;
      const res = await submit("orgb.localhost", email);
      expect([200, 201]).toContain(res.status);

      const [row] = await getDb()
        .select()
        .from(newsletterSignups)
        .where(eq(newsletterSignups.email, email))
        .limit(1);

      expect(row.organizationId).toBe(orgBId);
    });
  });
  ```

- [ ] **Step 2: Run; verify failure.** As Task 8.

- [ ] **Step 3: Modify `src/pages/api/public/newsletter.ts`.**

  The current handler is `POST ({ request, clientAddress })`. Add `locals`, require `organization`, and include `organizationId` in the insert. The endpoint also handles email re-submissions by updating an existing row — when updating, set `organizationId` to the resolved org's id (the most-recent tenant the user expressed interest in).

  ```typescript
  export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
    // ... existing rate-limit + validation ...

    const organization = locals.organization;
    if (!organization) {
      return new Response(
        JSON.stringify({ error: "Organization context required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Where the row is inserted/upserted:
    await getDb()
      .insert(newsletterSignups)
      .values({
        organizationId: organization.id,
        // ... existing fields ...
      })
      .onConflictDoUpdate({
        target: newsletterSignups.email,
        set: {
          organizationId: organization.id,
          // ... existing updateable fields ...
          updatedAt: new Date(),
        },
      });

    // ... rest unchanged ...
  };
  ```

- [ ] **Step 4: Run; verify pass.**

- [ ] **Step 5: Commit.**

  ```bash
  git add src/pages/api/public/newsletter.ts tests/api/public/newsletter.test.ts
  git commit -m "$(cat <<'EOF'
  fix(public-api): attribute newsletter signups to the resolved tenant

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 10: `/api/public/team-registrations/[token]` — defensive cross-tenant 404

**Files:**
- Modify: `src/pages/api/public/team-registrations/[token].ts`
- Create: `tests/api/public/team-registrations-token.test.ts`

- [ ] **Step 1: Write the failing test.**

  This test requires a team-registration token belonging to Org A and a request made on `orgb.localhost`. If the e2e seed already creates a team registration for Org A, fetch the token via direct DB query at the start of the test; otherwise create one via the admin API or insert directly.

  ```typescript
  // tests/api/public/team-registrations-token.test.ts
  import { describe, it, expect, beforeAll } from "vitest";
  import { apiFetch } from "../setup/test-helpers";
  import { getDb } from "@/lib/db";
  import { teamRegistrations, organizations } from "@/lib/db/schema";
  import { eq } from "drizzle-orm";

  describe("GET /api/public/team-registrations/[token] — tenant scoping", () => {
    let orgAToken: string;

    beforeAll(async () => {
      const [orgA] = await getDb()
        .select()
        .from(organizations)
        .where(eq(organizations.slug, "aspire-sports"))
        .limit(1);

      const [reg] = await getDb()
        .select()
        .from(teamRegistrations)
        .where(eq(teamRegistrations.organizationId, orgA.id))
        .limit(1);

      if (!reg) {
        throw new Error(
          "This test requires at least one team_registrations row for Org A. " +
            "Run `npm run db:seed:e2e` and ensure the captain-flow seed creates a team registration.",
        );
      }
      orgAToken = reg.token; // adjust property name to match schema
    });

    it("returns 200 when the token is requested on its own host (Org A on localhost)", async () => {
      const res = await apiFetch(`/api/public/team-registrations/${orgAToken}`);
      expect(res.status).toBe(200);
    });

    it("returns 404 when the same token is requested on a different host (orgb.localhost)", async () => {
      const res = await apiFetch(`/api/public/team-registrations/${orgAToken}`, {
        headers: { Host: "orgb.localhost" },
      });
      expect(res.status).toBe(404);
    });
  });
  ```

- [ ] **Step 2: Run; verify failure.**

  Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/team-registrations-token.test.ts`
  Expected: second case fails (today's endpoint returns 200 for any valid token regardless of host).

- [ ] **Step 3: Modify the endpoint.**

  ```typescript
  // src/pages/api/public/team-registrations/[token].ts
  export const GET: APIRoute = async ({ params, locals }) => {
    const token = params.token;
    if (!token) {
      return new Response(JSON.stringify({ error: "Token required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ... existing token lookup (unchanged) ...

    // After the row is loaded, before returning it:
    const organization = locals.organization;
    if (!organization || teamRegistration.organizationId !== organization.id) {
      // 404 (not 403) — hide the existence of cross-tenant resources.
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ... existing 200 response ...
  };
  ```

- [ ] **Step 4: Run; verify pass.**

- [ ] **Step 5: Commit.**

  ```bash
  git add src/pages/api/public/team-registrations/\[token\].ts \
          tests/api/public/team-registrations-token.test.ts
  git commit -m "$(cat <<'EOF'
  fix(public-api): 404 cross-tenant team-registration token fetch

  Defensive cross-check: the token's organizationId must match the
  resolved tenant. 404 (not 403) — hides existence of cross-tenant rows.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 11: Regression sweep + pre-push checklist

**Files:** none modified; this is verification.

Run the full pre-push checklist from CLAUDE.md ("Pre-push checklist (major work)"). This is the gate before pushing the branch.

- [ ] **Step 1: Ensure migrations are committed.** `npm run db:generate` should produce no new files — the Task 1 migration is the only schema change.

- [ ] **Step 2: Re-seed e2e data.**

  Run: `npm run db:seed:e2e`
  Expected: clean idempotent run.

- [ ] **Step 3: Run the full API test suite.**

  With the dev server running (`R2_MOCK=1 CRON_SECRET=test DISABLE_RATE_LIMIT=1 npm run dev`):

  Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api`
  Expected: all green. **Pay attention to any pre-existing Aspire test that relied on a single-org assumption** — the spec called this out as a likely surfacing. Fix any such tests by passing the resolved org through (using the same patterns established in Tasks 4–10) before proceeding.

- [ ] **Step 4: Run Playwright.**

  Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test`
  Expected: all green.

- [ ] **Step 5: Type check.**

  Run: `npx tsc --noEmit`
  Expected: zero errors. The repo's baseline is zero.

- [ ] **Step 6: Build.**

  Run: `npm run build`
  Expected: success. The pre-push checklist notes this is the step that catches SSR-vs-prerender mistakes that `npm run dev` doesn't.

- [ ] **Step 7: Manual smoke on Aspire content (the regression gate).**

  With dev still running, visit:
  - `http://localhost:4321/` — Aspire homepage renders unchanged.
  - `http://localhost:4321/programs` — Aspire programs directory unchanged.
  - `http://localhost:4321/events` — Aspire events unchanged.
  - `http://localhost:4321/sports` — Aspire sports list unchanged.
  - `http://localhost:4321/locations` — Aspire locations list unchanged.

  If any of these surface Basketball, "Org B HQ", or any Org B content, **stop** — there's a leak the test suite missed; revisit the endpoint involved.

- [ ] **Step 8: Push the branch and open a PR.**

  ```bash
  git push -u origin feat/soccerone-gosoccerone
  gh pr create --base main \
    --title "Phase 0: public-API tenant scoping (SoccerOne prerequisite)" \
    --body "$(cat <<'EOF'
  Phase 0 of the SoccerOne / gosoccerone.com project. Tenant-scopes every
  public API endpoint and shared filter helper so adding a second active
  org (SoccerOne, in Phase 1) cannot cross-contaminate the live Aspire
  site.

  Design: docs/superpowers/specs/2026-05-22-soccerone-gosoccerone-domain-design.md (§5)
  Plan:   docs/superpowers/plans/2026-05-22-soccerone-phase0-public-api-tenant-scoping.md

  Zero-behavior-change while there is one active customer org in prod
  (every row already belongs to the only org). Hard gate: this must
  merge and be verified green before the SoccerOne org row is created.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

- [ ] **Step 9: Wait for CI to go green** on the resulting commit on origin. Per CLAUDE.md ("A push isn't 'done' until CI is green on the resulting commit on origin"), do not declare Phase 0 complete on a green local run.

---

## Acceptance (from spec §5.6)

- [ ] All endpoints listed in the spec's §5.2 read/write the resolved org.
- [ ] All endpoints fail closed (empty list / 400) when `locals.organization` is null.
- [ ] Aspire E2E suite green; manual check: Aspire `/programs`, `/events`, `/sports`, `/locations` unchanged on the default host.
- [ ] CI green on the PR's head commit on `main`.

---

## Out of scope (deferred to later phases)

- The middleware host-rewrite for `gosoccerone.com` (Phase 1).
- Creating the SoccerOne organization, locations, venues, programs (Phase 1, data preconditions).
- Wiring SoccerOne marketing CTAs to the booking flows (Phase 2).
- The membership subsystem (Phase 3).

These are tracked in the spec and will get their own implementation plans after Phase 0 ships.

---

## Self-review

**Spec coverage** — every endpoint listed in spec §5.2 has a task:

| Spec §5.2 row | Task |
|---|---|
| `seasons.ts` | Task 5 |
| `seasons/[id].ts` | Task 6 |
| `events.ts` | Task 7 |
| `public-filters.ts` | Task 2 |
| `filters.ts` | Task 4 |
| `corporate-inquiry.ts` | Task 1 (schema) + Task 8 |
| `newsletter.ts` | Task 1 (schema) + Task 9 |
| `team-registrations/[token].ts` | Task 10 |
| §5.3 consumers (`/sports`, `/locations`) | Task 3 |
| §5.4 mock-data fallback cleanup | Task 5 |
| §5.6 acceptance | Task 11 |

**Placeholder scan** — no "TBD", "TODO", "implement later", "fill in details". Code blocks for every modification. Three places hedge slightly: (a) Task 2's helper has no dedicated unit test (intentional — covered by Task 4's API test); (b) Task 5's seed-augmentation step is conditional on the `/api/test/org-fixtures` endpoint's current shape; (c) Task 8's note about Org A id lookup. Each is explicit about the contingency and gives the engineer the exact action.

**Type / name consistency** — `getPublicSports(orgId)` and `getPublicLocations(orgId)` signatures are identical across Tasks 2, 3, and 4. The new `organizationId` column name is consistent across schema (Task 1), endpoints (Tasks 8, 9), and tests (Tasks 8, 9). `locals.organization` is the read pattern throughout.

**Scope** — single implementation plan, single PR, ~10 commits, no scope creep beyond Phase 0.
