# Forming / Interest-List State — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `forming` season status that advertises a division on the public catalog with a "Join the interest list" CTA (free email capture, deduped per division) instead of a checkout, so the 2026–27 catalog can be seeded as drafts and advertised without taking money for leagues that may not run.

**Architecture:** A new `forming` value on the existing `season_status` enum; a new `season_interest` table (newsletter_signups is unique-on-email so cannot hold per-division interest); the public seasons API surfaces forming seasons with a derived `signupMode` field; the season card branches on `signupMode`; a new public capture endpoint; admin gains a forming status option, badge, and per-division interest count. Phase 2 (priority window: `general_availability_at`, threshold, cohort email) is **out of scope** here.

**Tech Stack:** Astro 5 SSR, React 19, Drizzle ORM (PostgreSQL), Zod, Vitest (API + unit tests).

**Spec:** `docs/superpowers/specs/2026-06-13-forming-interest-list-design.md`

---

## File Structure

- **Create** `src/lib/db/schema/season-interest.ts` — the `season_interest` table.
- **Modify** `src/lib/db/schema/programs.ts` — add `forming` to `seasonStatusEnum`.
- **Modify** `src/lib/db/schema/index.ts` — export the new table.
- **Create** `src/lib/db/migrations/0044_*.sql` — generated, then hand-edited for idempotency.
- **Modify** `src/lib/programs/derive.ts` — add `deriveSignupMode()`.
- **Modify** `src/lib/programs/api-season.ts` — add `status` + `signupMode` to `ApiSeason`.
- **Modify** `src/pages/api/public/seasons.ts` — extend `PUBLIC_STATUSES`, emit `signupMode`, sort register-before-interest.
- **Modify** `src/lib/programs/public-filters.ts` — include `forming` in both filter queries.
- **Create** `src/pages/api/public/season-interest.ts` — interest capture endpoint.
- **Create** `src/components/programs/season-interest-form.tsx` — the capture form.
- **Modify** `src/components/programs/program-card-v2.tsx` — CTA branch for `signupMode === 'interest'`.
- **Modify** `src/pages/api/admin/seasons.ts` — allow `forming` in the status zod enum; return `interestCount`.
- **Modify** `src/components/admin/seasons-list.tsx` — add `forming` to `statusOptions`; show interest count.
- **Modify** `src/components/admin/super/season-hub-layout.tsx` — add `forming` badge style.
- **Create** `tests/unit/derive-signup-mode.test.ts`, **Modify** `tests/api/public/seasons.test.ts`, **Create** `tests/api/public/season-interest.test.ts`.

---

## Task 1: Add `forming` to the season status enum + `season_interest` table

**Files:**
- Modify: `src/lib/db/schema/programs.ts:29-36`
- Create: `src/lib/db/schema/season-interest.ts`
- Modify: `src/lib/db/schema/index.ts`

- [ ] **Step 1: Add `forming` to the enum**

In `src/lib/db/schema/programs.ts`, change the enum (currently `draft, open, closed, active, completed, cancelled`):

```typescript
export const seasonStatusEnum = pgEnum("season_status", [
  "draft",
  "forming",
  "open",
  "closed",
  "active",
  "completed",
  "cancelled",
]);
```

- [ ] **Step 2: Create the `season_interest` table**

Create `src/lib/db/schema/season-interest.ts`:

```typescript
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { seasons } from "./programs";

/**
 * Per-division interest capture for `forming` seasons. A person may be
 * interested in many divisions, so this is keyed by (season, email) — unlike
 * `newsletter_signups`, which is unique on email alone and therefore cannot
 * hold per-division interest. Free, email-only (no deposit); the deposit is a
 * registration-time feature. See the forming/interest-list design spec.
 */
export const seasonInterest = pgTable(
  "season_interest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    // Tenant scope. Nullable to survive org deletion; set on every insert.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    email: varchar("email", { length: 320 }).notNull(),
    firstName: varchar("first_name", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("season_interest_season_idx").on(table.seasonId),
    // One interest row per person per division (case-insensitive email).
    uniqueIndex("season_interest_season_email_uniq").on(
      table.seasonId,
      sql`lower(${table.email})`,
    ),
  ],
);

export type SeasonInterest = typeof seasonInterest.$inferSelect;
export type NewSeasonInterest = typeof seasonInterest.$inferInsert;
```

- [ ] **Step 3: Export the table**

In `src/lib/db/schema/index.ts`, add after the `export * from "./programs";` line:

```typescript
export * from "./season-interest";
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema/programs.ts src/lib/db/schema/season-interest.ts src/lib/db/schema/index.ts
git commit -m "feat(forming): add forming status enum + season_interest table"
```

---

## Task 2: Generate and finalize the migration

**Files:**
- Create: `src/lib/db/migrations/0044_*.sql` (drizzle-generated)

- [ ] **Step 1: Generate the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/0044_*.sql` containing an `ALTER TYPE "season_status" ADD VALUE 'forming'` and a `CREATE TABLE "season_interest"` with the unique index.

- [ ] **Step 2: Make the enum addition idempotent**

Open the generated `0044_*.sql`. Change the enum line to be idempotent (drifted/re-run safety — repo convention, see 0023/0024):

```sql
ALTER TYPE "public"."season_status" ADD VALUE IF NOT EXISTS 'forming';
```

Ensure the enum `ADD VALUE` is its own statement (drizzle separates statements with `--> statement-breakpoint`; Postgres requires `ADD VALUE` to run outside a multi-statement transaction with dependent DDL — keeping the table `CREATE` in a later statement is correct as generated). Confirm the `CREATE TABLE` uses the unique index on `(season_id, lower(email))`.

- [ ] **Step 3: Verify the migration applies on a local DB**

Run: `npm run db:migrate` (against a local DB per `.env`)
Expected: applies cleanly; `season_interest` exists and `season_status` includes `forming`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/migrations/0044_*.sql src/lib/db/migrations/meta
git commit -m "feat(forming): migration for forming status + season_interest"
```

---

## Task 3: `deriveSignupMode()` helper (unit TDD)

**Files:**
- Modify: `src/lib/programs/derive.ts`
- Modify: `src/lib/programs/api-season.ts`
- Test: `tests/unit/derive-signup-mode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/derive-signup-mode.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { deriveSignupMode } from "@/lib/programs/derive";

describe("deriveSignupMode", () => {
  it("returns 'interest' for a forming season", () => {
    expect(deriveSignupMode({ status: "forming" })).toBe("interest");
  });

  it("returns 'register' for an open season", () => {
    expect(deriveSignupMode({ status: "open" })).toBe("register");
  });

  it("returns 'register' for an active season", () => {
    expect(deriveSignupMode({ status: "active" })).toBe("register");
  });

  it("prefers an explicit signupMode field when present", () => {
    expect(deriveSignupMode({ status: "open", signupMode: "interest" })).toBe(
      "interest",
    );
  });

  it("defaults to 'register' when status is missing", () => {
    expect(deriveSignupMode({})).toBe("register");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/derive-signup-mode.test.ts`
Expected: FAIL — `deriveSignupMode is not a function`.

- [ ] **Step 3: Implement the helper**

In `src/lib/programs/derive.ts`, add at the end of the file:

```typescript
/**
 * The CTA mode for a season card. `forming` seasons collect interest;
 * everything else registers. An explicit `signupMode` (set by the public
 * seasons API) wins, so the card never re-derives server intent. Phase 2 adds
 * a 'priority' mode for the registration window; Phase 1 is interest|register.
 */
export function deriveSignupMode(s: {
  status?: string;
  signupMode?: string;
}): "interest" | "register" {
  if (s.signupMode === "interest" || s.signupMode === "register") {
    return s.signupMode;
  }
  return s.status === "forming" ? "interest" : "register";
}
```

- [ ] **Step 4: Add `status` + `signupMode` to the ApiSeason type**

In `src/lib/programs/api-season.ts`, inside the `ApiSeason` interface, add (next to the other optional fields like `signupModes?`):

```typescript
  status?: string
  signupMode?: "interest" | "register"
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/derive-signup-mode.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/programs/derive.ts src/lib/programs/api-season.ts tests/unit/derive-signup-mode.test.ts
git commit -m "feat(forming): deriveSignupMode helper + ApiSeason signupMode field"
```

---

## Task 4: Public seasons API surfaces forming + `signupMode` (API TDD)

**Files:**
- Modify: `src/pages/api/public/seasons.ts`
- Test: `tests/api/public/seasons.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/api/public/seasons.test.ts`, add inside the `describe("GET /api/public/seasons", ...)` block:

```typescript
    it("tags every returned season with a signupMode of interest|register", async () => {
      const res = await apiFetch(LIST_ENDPOINT, { method: "GET" });
      const json = await expectJson(res, 200);
      for (const season of json.seasons) {
        expect(["interest", "register"]).toContain(season.signupMode);
        // forming → interest; open/active → register
        if (season.status === "forming") {
          expect(season.signupMode).toBe("interest");
        } else {
          expect(season.signupMode).toBe("register");
        }
      }
    });

    it("still excludes draft/closed seasons now that forming is public", async () => {
      const res = await apiFetch(`${LIST_ENDPOINT}?status=draft`, { method: "GET" });
      const json = await expectJson(res, 200);
      for (const season of json.seasons) {
        expect(["open", "active", "forming"]).toContain(season.status);
      }
    });
```

- [ ] **Step 2: Run to verify it fails**

Run (dev server must be up): `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/seasons.test.ts`
Expected: FAIL — `season.signupMode` is `undefined`.

- [ ] **Step 3: Extend `PUBLIC_STATUSES` and emit `signupMode`**

In `src/pages/api/public/seasons.ts`, change the allowlist constant (added in PR #189):

```typescript
    const PUBLIC_STATUSES = ["open", "active", "forming"] as const;
```

In the `formatted` mapping (the returned object per season), add a `signupMode` field next to `status`:

```typescript
        status: r.season.status,
        signupMode: r.season.status === "forming" ? "interest" : "register",
```

- [ ] **Step 4: Sort register-before-interest**

The query already does `.orderBy(asc(seasons.startDate))`. After building `formatted`, re-sort so live (register) seasons lead and forming sinks beneath, preserving start-date order within each group. Replace `return new Response(JSON.stringify({ seasons: formatted }), ...)` so it sorts first:

```typescript
    const ordered = [...formatted].sort((a, b) => {
      // register before interest; otherwise keep start-date order (stable)
      if (a.signupMode !== b.signupMode) {
        return a.signupMode === "register" ? -1 : 1;
      }
      return 0;
    });

    return new Response(JSON.stringify({ seasons: ordered }), {
```

- [ ] **Step 5: Run to verify it passes**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/seasons.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/public/seasons.ts tests/api/public/seasons.test.ts
git commit -m "feat(forming): public seasons API surfaces forming + signupMode"
```

---

## Task 5: Public filters include forming

**Files:**
- Modify: `src/lib/programs/public-filters.ts`

- [ ] **Step 1: Include forming in both filter queries**

In `src/lib/programs/public-filters.ts`, both `getPublicSports` and `getPublicLocations` have the clause `sql`${seasons.status} IN ('open', 'active')``. Change both to:

```typescript
          sql`${seasons.status} IN ('open', 'active', 'forming')`,
```

This makes a sport/venue that has only forming (advertised-but-not-open) divisions still appear in the `/sports` and `/locations` filters — the whole point of advertising the grid.

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: zero errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/programs/public-filters.ts
git commit -m "feat(forming): include forming seasons in public sport/location filters"
```

---

## Task 6: Interest capture endpoint (API TDD)

**Files:**
- Create: `src/pages/api/public/season-interest.ts`
- Test: `tests/api/public/season-interest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/public/season-interest.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";

const ENDPOINT = "/api/public/season-interest";

describe("POST /api/public/season-interest", () => {
  it("rejects a missing/invalid body (400)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(res.status).toBe(400);
  });

  it("404s for a season that is not forming or not in this tenant", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        seasonId: "00000000-0000-0000-0000-000000000000",
        email: "fan@example.com",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("accepts interest for a forming season and is idempotent on resubmit", async () => {
    // Find a forming season in this tenant, if the seed provides one.
    const list = await apiFetch("/api/public/seasons", { method: "GET" });
    const body = await expectJson(list, 200);
    const forming = body.seasons.find((s: any) => s.signupMode === "interest");
    if (!forming) return; // seed has no forming fixture yet — skip, not fail

    const payload = JSON.stringify({ seasonId: forming.id, email: "interested@example.com" });
    const first = await apiFetch(ENDPOINT, { method: "POST", body: payload });
    expect(first.status).toBe(200);
    const second = await apiFetch(ENDPOINT, { method: "POST", body: payload });
    expect(second.status).toBe(200); // upsert no-op, not a 409
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/season-interest.test.ts`
Expected: FAIL — endpoint 404s (route does not exist) for the 400 case.

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/public/season-interest.ts`:

```typescript
import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import {
  seasonInterest,
  newsletterSignups,
  seasons,
  programs,
  sports,
  organizations,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

const BodySchema = z.object({
  seasonId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(320),
  firstName: z.string().trim().max(100).optional(),
});

export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
  if (!db) {
    return new Response(JSON.stringify({ error: "Database unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Per-IP burst limit — unauthenticated public write.
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`season-interest:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
  }

  let parsed;
  try {
    parsed = BodySchema.safeParse(await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid input", issues: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const organization = locals.organization;
  if (!organization) {
    return new Response(
      JSON.stringify({ error: "Organization context required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { seasonId, email, firstName } = parsed.data;

  // Verify the season is forming AND owned by the resolved tenant. The season's
  // org is reached via program → sport → organization (same join the public
  // seasons endpoint uses). Anything else → 404 (don't leak existence).
  const owned = await db
    .select({ id: seasons.id })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(sports, eq(programs.sportId, sports.id))
    .innerJoin(organizations, eq(organizations.id, sports.organizationId))
    .where(
      and(
        eq(seasons.id, seasonId),
        eq(seasons.status, "forming"),
        eq(organizations.id, organization.id),
        eq(organizations.status, "active"),
      ),
    )
    .limit(1);

  if (owned.length === 0) {
    return new Response(JSON.stringify({ error: "Season not available" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Per-division interest — idempotent on (season, lower(email)).
  await db
    .insert(seasonInterest)
    .values({ seasonId, organizationId: organization.id, email, firstName })
    .onConflictDoNothing();

  // Also feed the general marketing list (unique on email → upsert).
  await db
    .insert(newsletterSignups)
    .values({
      organizationId: organization.id,
      email,
      firstName,
      source: "interest-list",
    })
    .onConflictDoUpdate({
      target: newsletterSignups.email,
      set: { updatedAt: sql`now()` },
    });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/season-interest.test.ts`
Expected: PASS (the forming-fixture case skips cleanly until the seed adds one).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/public/season-interest.ts tests/api/public/season-interest.test.ts
git commit -m "feat(forming): POST /api/public/season-interest capture endpoint"
```

---

## Task 7: Public card CTA branch + interest form

**Files:**
- Create: `src/components/programs/season-interest-form.tsx`
- Modify: `src/components/programs/program-card-v2.tsx:175-210` (the CTA block)

- [ ] **Step 1: Create the interest form component**

Create `src/components/programs/season-interest-form.tsx` (modeled on `empty-notify-form.tsx`, posting to the new endpoint):

```tsx
"use client"

import { useState } from "react"

/**
 * Inline email capture for a `forming` (advertised, not-yet-open) division.
 * Posts to /api/public/season-interest with the seasonId; org-scoped via host,
 * rate-limited, idempotent per (season, email). Replaces the Register CTA on
 * forming cards.
 */
export function SeasonInterestForm({
  seasonId,
  seasonName,
}: {
  seasonId: string
  seasonName: string
}) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus("submitting")
    setError(null)
    try {
      const res = await fetch("/api/public/season-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId, email: email.trim() }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error ?? "Could not save your interest")
      }
      setStatus("ok")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your interest")
      setStatus("error")
    }
  }

  if (status === "ok") {
    return (
      <p className="text-sm text-sage font-medium">
        You're on the list for {seasonName} — we'll email you when registration opens.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="flex-1 rounded-md border border-border bg-paper px-3 py-2 text-sm"
          aria-label={`Email for ${seasonName} interest list`}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {status === "submitting" ? "…" : "Notify me"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 2: Branch the card CTA on signupMode**

In `src/components/programs/program-card-v2.tsx`, near the top where other derives run (around `const status = deriveStatusPill(season)`), add:

```tsx
import { deriveSignupMode } from "@/lib/programs/derive"
import { SeasonInterestForm } from "./season-interest-form"
```

and:

```tsx
  const signupMode = deriveSignupMode(season)
```

Then wrap the existing register-button block (the `<a href={`/register/...`}>` CTA region, ~lines 175-210) so forming cards render the interest form instead:

```tsx
        {signupMode === "interest" ? (
          <div className="mt-3">
            <span className="inline-flex items-center text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-ochre-soft text-ink-2 mb-2">
              Forming
            </span>
            <SeasonInterestForm seasonId={season.id} seasonName={season.name} />
          </div>
        ) : (
          /* existing register CTA block unchanged */
          <>{/* …the current <a href={`/register/${season.id}`}> buttons… */}</>
        )}
```

(Keep the existing register markup verbatim inside the `else` branch — do not rewrite it.)

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: build succeeds (catches SSR/import mistakes).

- [ ] **Step 4: Manual smoke (dev server)**

With `npm run dev` running and at least one season set to `forming` via admin (Task 8), load `/adult/leagues` (or the relevant catalog page). Expected: the forming division shows a "Forming" chip and a "Notify me" email field instead of a Register button; submitting shows the confirmation line.

- [ ] **Step 5: Commit**

```bash
git add src/components/programs/season-interest-form.tsx src/components/programs/program-card-v2.tsx
git commit -m "feat(forming): interest-list CTA + capture form on forming cards"
```

---

## Task 8: Admin — forming status option, badge, and interest count

**Files:**
- Modify: `src/pages/api/admin/seasons.ts:48` (status zod enum) + GET response
- Modify: `src/components/admin/seasons-list.tsx:68-77` (statusOptions)
- Modify: `src/components/admin/super/season-hub-layout.tsx:58-61` (badge styles)

- [ ] **Step 1: Allow `forming` in the admin status enum**

In `src/pages/api/admin/seasons.ts`, the create/update zod schema (line ~48) is `status: z.enum(["draft", "open", "closed", "active", "completed", "cancelled"]).default("draft")`. Add `"forming"`:

```typescript
  status: z.enum(["draft", "forming", "open", "closed", "active", "completed", "cancelled"]).default("draft"),
```

- [ ] **Step 2: Return per-season interest count from the admin GET**

In `src/pages/api/admin/seasons.ts`, in the GET handler that lists seasons, after the seasons are fetched, add a count query and merge it in. Add the import `seasonInterest` to the existing schema import, then:

```typescript
    // Per-season interest counts (forming demand signal). Single grouped query.
    const interestRows = await db
      .select({
        seasonId: seasonInterest.seasonId,
        count: sql<number>`count(*)::int`,
      })
      .from(seasonInterest)
      .groupBy(seasonInterest.seasonId);
    const interestMap = new Map(interestRows.map((r) => [r.seasonId, r.count]));
```

and add `interestCount: interestMap.get(s.id) ?? 0` to each season object in the returned list.

- [ ] **Step 3: Add `forming` to the admin status options**

In `src/components/admin/seasons-list.tsx`, add to the `statusOptions` array (after `draft`):

```typescript
  { value: "forming", label: "Forming", color: "bg-amber-100 text-amber-800" },
```

The status `<Select>` in the create/edit form maps over `statusOptions`, so this exposes "Forming" automatically. In the season row rendering, where a count or badge is shown, display the interest count when `season.status === "forming"`:

```tsx
{season.status === "forming" && (
  <span className="text-xs text-ink-muted ml-2">{season.interestCount ?? 0} interested</span>
)}
```

(Add `interestCount?: number` to the local `Season` type in this file.)

- [ ] **Step 4: Add the forming badge style to the season hub**

In `src/components/admin/super/season-hub-layout.tsx`, the `STATUS_STYLES` map (lines 58-61) lists `draft`, `open`, `active`, `closed`. Add:

```typescript
  forming: "bg-amber-100 text-amber-800",
```

- [ ] **Step 5: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: zero errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/admin/seasons.ts src/components/admin/seasons-list.tsx src/components/admin/super/season-hub-layout.tsx
git commit -m "feat(forming): admin forming status option, badge, and interest count"
```

---

## Final verification (before declaring Phase 1 done)

- [ ] `npx tsc --noEmit` → zero errors.
- [ ] `npm run build` → succeeds.
- [ ] `npx vitest run tests/unit/derive-signup-mode.test.ts` → pass.
- [ ] With dev server up and e2e data seeded: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/seasons.test.ts tests/api/public/season-interest.test.ts` → pass.
- [ ] Manual: create a season, set status → Forming in admin; confirm it appears on the public catalog with a "Notify me" form (not Register); submit an email; confirm the admin list shows "1 interested".
- [ ] Push branch, open PR, **wait for CI green** (build, test-api, test-critical, typecheck) before merge — per the repo release process.

---

## Spec coverage check

- Forming status (spec §1) → Tasks 1, 2, 8.
- Public visibility + signupMode + sort (spec §2) → Tasks 3, 4; filters Task 5.
- Per-division interest table + endpoint, free/no-deposit (spec §3) → Tasks 1, 6.
- Admin badge + interest count + status transition (spec §5) → Task 8.
- **Out of scope (Phase 2, by design):** priority window (`general_availability_at`, `interest_threshold`), `priority` signupMode, cohort conversion email, attention-feed prompt, CSV export, PostHog funnel. Not covered here intentionally — see spec Phasing.
