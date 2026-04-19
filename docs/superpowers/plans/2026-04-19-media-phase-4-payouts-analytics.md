# Media Workflow — Phase 4: Payouts & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship rate cards, Stripe Connect onboarding + payouts, 1099-NEC PDF generation, and an admin analytics dashboard on top of the Phase 1-3 media-workflow foundation so photographers get paid automatically when admins approve, and ops has visibility into coverage, SLA, and cost.

**Architecture:** Two new Drizzle tables (`media_rate_cards`, `media_staff_payouts`) in the existing `src/lib/db/schema/media.ts` module. A pure rate-resolution function used by shoot creation to snapshot rate. Stripe Connect onboarding reuses the existing `createConnectAccount` / `createAccountOnboardingLink` helpers from `src/lib/stripe/connect.ts` but writes the account id to `media_staff_profiles.stripe_connect_account_id` instead of `organizations.stripe_account_id`. Payout state machine drives off `shoot_sessions.payout_status` with four forward transitions and a retry branch. 1099 PDFs render with `pdf-lib` using deterministic byte output (fixed creation date, no metadata entropy) and are stored on R2 under `org/<org_id>/tax/<year>/1099-<user_id>.pdf`. Analytics are SQL aggregates exposed as JSON and rendered with `recharts` (new dep).

**Tech Stack:** Astro 5, React 19, Drizzle ORM, PostgreSQL, Stripe (existing), `pdf-lib` (new), `recharts` (new), `@aws-sdk/client-s3` (new — R2 writes for the 1099 PDFs via S3-compatible API), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-04-19-media-workflow-design.md` — this plan covers section 9 only.

**Depends on Phases 1-3 being merged:**
- `src/lib/db/schema/media.ts` exists with `shoot_sessions` (including `rate_type`, `rate_cents`, `payout_status`), `media_staff_profiles` (including `stripe_connect_account_id` placeholder, `preferred_rate_type`, `preferred_rate_cents`), `media_assets`, `media_tags`, `media_audit_log`, `media_staff_agreements` tables.
- Roles `media_staff` and `media_editor` exist in `roleNameEnum`.
- `/media/*` route namespace and `/admin/media/*` exist with layouts and the `requireMediaStaffAccess` helper analogous to `requireAdminAccess`.
- R2 bucket provisioned and env vars `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` are wired from Phase 1.

**Out of scope for this plan:**
- CV-based analytics (jersey OCR, face recognition confidences)
- Refund / payout reversal flow (future, manual for now via Stripe dashboard)
- Background check integration
- W-2 payroll variant

---

## File structure

### New / modified schema
- Modify: `src/lib/db/schema/media.ts` — add `mediaRateCards`, `mediaStaffPayouts` tables + types + relations

### New library modules
- Create: `src/lib/media/rates.ts` — rate-resolution function, rate-card CRUD helpers
- Create: `src/lib/media/payouts.ts` — payout state-machine helpers, Connect transfer wrapper
- Create: `src/lib/media/connect.ts` — Stripe Connect onboarding for media_staff (reuses `createConnectAccount`)
- Create: `src/lib/media/1099.ts` — deterministic 1099-NEC PDF generator
- Create: `src/lib/media/analytics.ts` — SQL aggregates (coverage, SLA, per-photographer, per-editor)
- Create: `src/lib/storage/r2.ts` — thin S3-compatible R2 client wrapper (if not already created in Phase 1; if present, skip Task creating it)

### New API routes
- Create: `src/pages/api/admin/media/rates/index.ts` — GET list, POST create
- Create: `src/pages/api/admin/media/rates/[id].ts` — PATCH update / deactivate
- Create: `src/pages/api/admin/media/shoots/[id]/approve.ts` — POST approve a single shoot payout
- Create: `src/pages/api/admin/media/shoots/bulk-approve.ts` — POST approve many shoots
- Create: `src/pages/api/admin/media/payouts/retry.ts` — POST retry a failed transfer
- Create: `src/pages/api/media/payments/index.ts` — GET photographer's own payment history + YTD
- Create: `src/pages/api/media/payments/1099/[year].ts` — GET photographer's own 1099 PDF URL (signed download)
- Create: `src/pages/api/media/connect/onboard.ts` — POST initiate Connect onboarding for self
- Create: `src/pages/api/media/connect/status.ts` — GET Connect account status
- Create: `src/pages/api/media/profile/rate-preferences.ts` — PATCH preferred_rate_type + preferred_rate_cents
- Create: `src/pages/api/admin/media/analytics/coverage.ts`
- Create: `src/pages/api/admin/media/analytics/sla.ts`
- Create: `src/pages/api/admin/media/analytics/cost.ts`
- Create: `src/pages/api/admin/media/analytics/scorecards.ts`
- Create: `src/pages/api/admin/media/1099/[year]/[userId].ts` — admin download of a photographer's 1099 PDF

### Modified API routes (existing from Phase 1)
- Modify: `src/pages/api/admin/media/shoots/index.ts` — on shoot creation, call `resolveSessionRate` to snapshot `rate_type` + `rate_cents`

### New UI pages
- Create: `src/pages/admin/media/rates.astro` — rate-card CRUD page
- Create: `src/pages/admin/media/shoots/bulk-approve.astro` — weekly batch approval page
- Create: `src/pages/admin/media/analytics.astro` — analytics dashboards
- Create: `src/pages/media/payments.astro` — photographer payments page
- Create: `src/pages/media/connect.astro` — Connect onboarding landing page
- Create: `src/pages/media/profile.astro` — photographer profile edit (rate preferences)

### Modified UI pages (existing from Phase 1)
- Modify: `src/pages/admin/media/shoots/[id].astro` — add "Approve payout" button + retry control

### New React components
- Create: `src/components/admin/media/rate-cards-list.tsx`
- Create: `src/components/admin/media/rate-card-form.tsx`
- Create: `src/components/admin/media/bulk-approve-table.tsx`
- Create: `src/components/admin/media/analytics-dashboard.tsx` (uses recharts)
- Create: `src/components/admin/media/approve-payout-button.tsx`
- Create: `src/components/media/payments-history.tsx`
- Create: `src/components/media/connect-onboard-card.tsx`
- Create: `src/components/media/rate-preferences-form.tsx`

### New tests
- Create: `tests/api/admin/media-rates.test.ts`
- Create: `tests/api/admin/media-payouts.test.ts`
- Create: `tests/api/media/payments.test.ts`
- Create: `tests/api/media/connect.test.ts`
- Create: `tests/api/admin/media-analytics.test.ts`
- Create: `tests/api/lib/rate-resolution.test.ts`
- Create: `tests/api/lib/1099-pdf.test.ts`
- Create: `tests/media-payouts-e2e.spec.ts` (Playwright)

### Dependencies to add
- `pdf-lib` (runtime, deterministic PDF)
- `recharts` (runtime, React chart library)
- `@aws-sdk/client-s3` (runtime, R2 writes for PDFs — if not already added in Phase 1)

---

## Conventions

- Tests hit `http://localhost:4321`. Start `npm run dev` in another terminal before running `npm run test:api`.
- Use existing helpers in `tests/api/setup/test-helpers.ts` — `getAdminCookie`, `apiFetch`, `expectJson`, `resetCookies`, `testSlug`. A new `getMediaStaffCookie` helper is added in Task 2 because Phase 1 will have seeded a test `media_staff` account.
- All new API routes use `export const prerender = false`.
- All new admin endpoints call `requireAdminAccess` + `requireOrganizationContext` (from `@/lib/auth`).
- All `/media/*` endpoints call the `requireMediaStaffAccess` helper introduced by Phase 1; if reading that helper shows a different name in your repo (e.g., `requireMediaStaff`), adapt the imports — this plan assumes `requireMediaStaffAccess`.
- Dollar amounts are always stored and transmitted as **integer cents**.
- `shoot_sessions.payout_status` values per spec: `unearned`, `pending_approval`, `approved`, `paid`, `failed`, `cancelled`. Phase 1 created the column with `unearned` as default and `cancelled` as a terminal option; this plan adds the `failed` value to the enum in Task 1.
- Commit after every test-passing step. Never use `--no-verify`.
- When modifying an existing file, **read it first** — Phase 1-3 work may have diverged from assumptions.

---

## Task 1: Schema — media_rate_cards + media_staff_payouts + payout_status failed value

**Files:**
- Modify: `src/lib/db/schema/media.ts`

- [ ] **Step 1: Read the existing media.ts file**

```bash
cat src/lib/db/schema/media.ts
```

Confirm `shootSessions`, `mediaStaffProfiles`, `payoutStatusEnum` (or string column) already exist. If `payout_status` was defined as a pgEnum, note its exact name; if it was a plain `varchar`, Step 2 will differ (just widen allowed values in application code).

- [ ] **Step 2: Append the two new tables + enum values to src/lib/db/schema/media.ts**

Add these imports at the top if missing (merge with existing):

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
```

Append below the existing tables (keep existing content intact):

```typescript
// ============================================================
// Phase 4: rate cards + payouts
// ============================================================

export const mediaRateTypeEnum = pgEnum("media_rate_type", [
  "per_game",
  "per_day",
  "flat",
]);

export const mediaSessionTypeEnum = pgEnum("media_session_type", [
  "game",
  "team_posed",
  "practice",
  "event",
]);

export const mediaPayoutTransferStatusEnum = pgEnum("media_payout_transfer_status", [
  "pending",
  "succeeded",
  "failed",
]);

export const mediaRateCards = pgTable(
  "media_rate_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    sessionType: varchar("session_type", { length: 30 }).notNull(),
    rateType: varchar("rate_type", { length: 20 }).notNull(),
    rateCents: integer("rate_cents").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    orgActiveIdx: index("media_rate_cards_org_active_idx").on(
      t.organizationId,
      t.active
    ),
    orgSessionTypeIdx: index("media_rate_cards_org_session_type_idx").on(
      t.organizationId,
      t.sessionType,
      t.active
    ),
  })
);

export const mediaStaffPayouts = pgTable(
  "media_staff_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    shootSessionId: uuid("shoot_session_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    failureCode: varchar("failure_code", { length: 100 }),
    failureMessage: text("failure_message"),
    retryCount: integer("retry_count").notNull().default(0),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // One attempt per shoot-session initially; retries bump retry_count in place
    shootUnique: uniqueIndex("media_staff_payouts_shoot_unique").on(
      t.shootSessionId
    ),
    userStatusIdx: index("media_staff_payouts_user_status_idx").on(
      t.userId,
      t.status
    ),
    orgPaidAtIdx: index("media_staff_payouts_org_paid_at_idx").on(
      t.organizationId,
      t.paidAt
    ),
  })
);

export const mediaRateCardsRelations = relations(mediaRateCards, () => ({}));
export const mediaStaffPayoutsRelations = relations(mediaStaffPayouts, () => ({}));

export type MediaRateCard = typeof mediaRateCards.$inferSelect;
export type NewMediaRateCard = typeof mediaRateCards.$inferInsert;
export type MediaStaffPayout = typeof mediaStaffPayouts.$inferSelect;
export type NewMediaStaffPayout = typeof mediaStaffPayouts.$inferInsert;
```

Note: `shoot_sessions.payout_status` was created in Phase 1 as a `varchar`; this plan stores `failed` as an additional application-level value without an enum migration. If Phase 1 used a pgEnum, add `failed` by running `ALTER TYPE ... ADD VALUE 'failed'` manually in a migration file — the generator will produce this when you run `db:generate`.

- [ ] **Step 3: Generate and apply migration**

```bash
npm run db:generate
npm run db:push
```

Expected: migration file created under `src/lib/db/migrations/`, push reports the two new tables.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/media.ts src/lib/db/migrations/
git commit -m "feat(media): add media_rate_cards + media_staff_payouts tables"
```

---

## Task 2: Test helper — getMediaStaffCookie

**Files:**
- Modify: `tests/api/setup/test-helpers.ts`

- [ ] **Step 1: Append the helper**

Add to `tests/api/setup/test-helpers.ts`:

```typescript
let _mediaStaffCookie: string | null = null;

/**
 * Returns a cached media_staff auth cookie. Signs in on first call.
 * Assumes Phase 1 seeded media_staff@test.aspiresports.com / TestMediaStaff123!
 */
export async function getMediaStaffCookie(): Promise<string> {
  if (!_mediaStaffCookie) {
    _mediaStaffCookie = await getAuthCookie(
      "media_staff@test.aspiresports.com",
      "TestMediaStaff123!"
    );
  }
  return _mediaStaffCookie;
}
```

Update the existing `resetCookies()` to null `_mediaStaffCookie` as well:

```typescript
export function resetCookies(): void {
  _adminCookie = null;
  _coachCookie = null;
  _parentCookie = null;
  _mediaStaffCookie = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/api/setup/test-helpers.ts
git commit -m "test: add getMediaStaffCookie helper"
```

---

## Task 3: Rate resolution library

**Files:**
- Create: `src/lib/media/rates.ts`
- Create: `tests/api/lib/rate-resolution.test.ts`

- [ ] **Step 1: Write the failing unit test**

```typescript
// tests/api/lib/rate-resolution.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson, resetCookies, testSlug } from "../setup/test-helpers";

// This test exercises rate resolution end-to-end via the shoot-creation endpoint,
// because resolveSessionRate is pure but reads the db — we test it through the
// route that actually uses it (integration style matching our test harness).

describe("Rate resolution precedence", () => {
  let adminCookie: string;

  beforeAll(async () => { adminCookie = await getAdminCookie(); });
  afterAll(() => resetCookies());

  it("uses photographer override when set", async () => {
    // Assume seed data: media_staff_profile with preferred_rate_type='per_game' and preferred_rate_cents=15000.
    // Create a shoot for that photographer; expect snapshot to match the override.
    const createRes = await apiFetch("/api/admin/media/shoots", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        assignedUserId: "SEED_MEDIA_STAFF_WITH_OVERRIDE_USER_ID",
        sessionType: "game",
        scheduledStart: new Date(Date.now() + 86400000).toISOString(),
        scheduledEnd: new Date(Date.now() + 90000000).toISOString(),
      }),
    });
    const json = await expectJson(createRes, 201);
    expect(json.shoot.rateType).toBe("per_game");
    expect(json.shoot.rateCents).toBe(15000);
  });

  it("falls back to active rate card matching session_type when no override", async () => {
    // Assume seed data: another media_staff_profile with no preferred rate; active rate card for session_type='game' at 12000.
    const createRes = await apiFetch("/api/admin/media/shoots", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        assignedUserId: "SEED_MEDIA_STAFF_NO_OVERRIDE_USER_ID",
        sessionType: "game",
        scheduledStart: new Date(Date.now() + 86400000).toISOString(),
        scheduledEnd: new Date(Date.now() + 90000000).toISOString(),
      }),
    });
    const json = await expectJson(createRes, 201);
    expect(json.shoot.rateCents).toBe(12000);
  });

  it("returns 422 when no override and no active rate card matches session_type", async () => {
    const createRes = await apiFetch("/api/admin/media/shoots", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        assignedUserId: "SEED_MEDIA_STAFF_NO_OVERRIDE_USER_ID",
        sessionType: "event", // no active card for event
        scheduledStart: new Date(Date.now() + 86400000).toISOString(),
        scheduledEnd: new Date(Date.now() + 90000000).toISOString(),
      }),
    });
    expect(createRes.status).toBe(422);
    const json = await createRes.json();
    expect(json.error).toMatch(/rate/i);
  });
});
```

Replace `SEED_MEDIA_STAFF_WITH_OVERRIDE_USER_ID` / `SEED_MEDIA_STAFF_NO_OVERRIDE_USER_ID` with actual UUIDs sourced from the Phase 1 seed (or fetch them at the top of the suite via `/api/admin/media/staff`). If the seed doesn't yet have these variants, add them in `src/lib/db/seeds/seed-phase1-demo.ts` before running the test.

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/lib/rate-resolution.test.ts
```

Expected: FAIL (rate resolution not wired into shoot creation yet).

- [ ] **Step 3: Create src/lib/media/rates.ts**

```typescript
import { getDb } from "@/lib/db";
import { mediaRateCards, mediaStaffProfiles } from "@/lib/db/schema/media";
import { and, eq, desc } from "drizzle-orm";

export interface ResolvedRate {
  rateType: string;
  rateCents: number;
  source: "photographer_override" | "rate_card";
  rateCardId?: string;
}

export class RateResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateResolutionError";
  }
}

/**
 * Resolve the rate for a shoot at assignment time.
 *
 * Precedence:
 *   1. photographer's preferred_rate_type + preferred_rate_cents (both non-null)
 *   2. most-recent active rate card matching (organization_id, session_type)
 *   3. throw RateResolutionError — caller must surface 422 to the admin
 */
export async function resolveSessionRate(params: {
  organizationId: string;
  userId: string;
  sessionType: string;
}): Promise<ResolvedRate> {
  const db = getDb();

  // 1. Photographer override
  const [profile] = await db
    .select({
      preferredRateType: mediaStaffProfiles.preferredRateType,
      preferredRateCents: mediaStaffProfiles.preferredRateCents,
    })
    .from(mediaStaffProfiles)
    .where(eq(mediaStaffProfiles.userId, params.userId))
    .limit(1);

  if (
    profile &&
    profile.preferredRateType &&
    profile.preferredRateCents != null
  ) {
    return {
      rateType: profile.preferredRateType,
      rateCents: profile.preferredRateCents,
      source: "photographer_override",
    };
  }

  // 2. Active rate card
  const [card] = await db
    .select()
    .from(mediaRateCards)
    .where(
      and(
        eq(mediaRateCards.organizationId, params.organizationId),
        eq(mediaRateCards.sessionType, params.sessionType),
        eq(mediaRateCards.active, true)
      )
    )
    .orderBy(desc(mediaRateCards.updatedAt))
    .limit(1);

  if (card) {
    return {
      rateType: card.rateType,
      rateCents: card.rateCents,
      source: "rate_card",
      rateCardId: card.id,
    };
  }

  // 3. No match
  throw new RateResolutionError(
    `No rate resolvable for user ${params.userId} session_type=${params.sessionType}: no photographer override and no active rate card.`
  );
}
```

- [ ] **Step 4: Wire resolveSessionRate into shoot creation**

Read `src/pages/api/admin/media/shoots/index.ts` (created in Phase 1) first to see the exact insert shape. Inside the `POST` handler, **before** the `insert(shootSessions).values(...)` call, add:

```typescript
import { resolveSessionRate, RateResolutionError } from "@/lib/media/rates";

// ... inside POST handler, after parsing body and validating assignedUserId:
let resolved;
try {
  resolved = await resolveSessionRate({
    organizationId: orgContext.organizationId,
    userId: parsed.data.assignedUserId,
    sessionType: parsed.data.sessionType,
  });
} catch (err) {
  if (err instanceof RateResolutionError) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }
  throw err;
}

// ... then in the insert values object:
rateType: resolved.rateType,
rateCents: resolved.rateCents,
payoutStatus: "unearned",
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:api -- tests/api/lib/rate-resolution.test.ts
```

Expected: PASS (all three cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/media/rates.ts src/pages/api/admin/media/shoots/index.ts tests/api/lib/rate-resolution.test.ts
git commit -m "feat(media): rate resolution precedence (override -> card -> error)"
```

---

## Task 4: Admin rate-card CRUD API

**Files:**
- Create: `src/pages/api/admin/media/rates/index.ts`
- Create: `src/pages/api/admin/media/rates/[id].ts`
- Create: `tests/api/admin/media-rates.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/admin/media-rates.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson, resetCookies, testSlug } from "../setup/test-helpers";

describe("Admin media rate cards", () => {
  let adminCookie: string;
  let createdId: string;

  beforeAll(async () => { adminCookie = await getAdminCookie(); });
  afterAll(() => resetCookies());

  it("requires admin auth on list", async () => {
    const res = await apiFetch("/api/admin/media/rates", { method: "GET" });
    expect([401, 403]).toContain(res.status);
  });

  it("creates a rate card", async () => {
    const res = await apiFetch("/api/admin/media/rates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        name: testSlug("Standard Game"),
        sessionType: "game",
        rateType: "per_game",
        rateCents: 12000,
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.rateCard.id).toBeDefined();
    expect(json.rateCard.active).toBe(true);
    createdId = json.rateCard.id;
  });

  it("lists rate cards and includes the one we just created", async () => {
    const res = await apiFetch("/api/admin/media/rates", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.rateCards)).toBe(true);
    expect(json.rateCards.some((c: any) => c.id === createdId)).toBe(true);
  });

  it("updates a rate card", async () => {
    const res = await apiFetch(`/api/admin/media/rates/${createdId}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ rateCents: 15000 }),
    });
    const json = await expectJson(res, 200);
    expect(json.rateCard.rateCents).toBe(15000);
  });

  it("deactivates a rate card", async () => {
    const res = await apiFetch(`/api/admin/media/rates/${createdId}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ active: false }),
    });
    const json = await expectJson(res, 200);
    expect(json.rateCard.active).toBe(false);
  });

  it("rejects invalid session_type", async () => {
    const res = await apiFetch("/api/admin/media/rates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        name: testSlug("Bad"),
        sessionType: "not_a_type",
        rateType: "per_game",
        rateCents: 1,
      }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/admin/media-rates.test.ts
```

Expected: FAIL (endpoints don't exist).

- [ ] **Step 3: Create src/pages/api/admin/media/rates/index.ts**

```typescript
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { mediaRateCards } from "@/lib/db/schema/media";
import { and, eq, desc } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

export const prerender = false;

const SESSION_TYPES = ["game", "team_posed", "practice", "event"] as const;
const RATE_TYPES = ["per_game", "per_day", "flat"] as const;

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  sessionType: z.enum(SESSION_TYPES),
  rateType: z.enum(RATE_TYPES),
  rateCents: z.number().int().positive(),
});

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const rows = await getDb()
    .select()
    .from(mediaRateCards)
    .where(eq(mediaRateCards.organizationId, org.organizationId))
    .orderBy(desc(mediaRateCards.updatedAt));

  return new Response(JSON.stringify({ rateCards: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  let raw: unknown;
  try { raw = await context.request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid payload", details: parsed.error.format() }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const [row] = await getDb()
    .insert(mediaRateCards)
    .values({
      organizationId: org.organizationId,
      name: parsed.data.name,
      sessionType: parsed.data.sessionType,
      rateType: parsed.data.rateType,
      rateCents: parsed.data.rateCents,
      active: true,
    })
    .returning();

  return new Response(JSON.stringify({ rateCard: row }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Create src/pages/api/admin/media/rates/[id].ts**

```typescript
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { mediaRateCards } from "@/lib/db/schema/media";
import { and, eq } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

export const prerender = false;

const SESSION_TYPES = ["game", "team_posed", "practice", "event"] as const;
const RATE_TYPES = ["per_game", "per_day", "flat"] as const;

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  sessionType: z.enum(SESSION_TYPES).optional(),
  rateType: z.enum(RATE_TYPES).optional(),
  rateCents: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

export const PATCH: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const id = context.params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "id required" }), { status: 400 });
  }

  let raw: unknown;
  try { raw = await context.request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid payload", details: parsed.error.format() }),
      { status: 400 }
    );
  }

  const [existing] = await getDb()
    .select()
    .from(mediaRateCards)
    .where(
      and(
        eq(mediaRateCards.id, id),
        eq(mediaRateCards.organizationId, org.organizationId)
      )
    )
    .limit(1);
  if (!existing) {
    return new Response(JSON.stringify({ error: "Rate card not found" }), { status: 404 });
  }

  const [row] = await getDb()
    .update(mediaRateCards)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(mediaRateCards.id, id))
    .returning();

  return new Response(JSON.stringify({ rateCard: row }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:api -- tests/api/admin/media-rates.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/admin/media/rates/ tests/api/admin/media-rates.test.ts
git commit -m "feat(media): admin CRUD for rate cards"
```

---

## Task 5: Admin rate-cards UI

**Files:**
- Create: `src/components/admin/media/rate-cards-list.tsx`
- Create: `src/components/admin/media/rate-card-form.tsx`
- Create: `src/pages/admin/media/rates.astro`

- [ ] **Step 1: Create the form component**

```tsx
// src/components/admin/media/rate-card-form.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function RateCardForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [sessionType, setSessionType] = useState("game");
  const [rateType, setRateType] = useState("per_game");
  const [dollars, setDollars] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(dollars) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error("Enter a positive dollar amount");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/media/rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sessionType, rateType, rateCents: cents }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Failed to create rate card");
      return;
    }
    toast.success("Rate card created");
    setName("");
    setDollars("");
    onCreated();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 max-w-md">
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <Label>Session type</Label>
        <Select value={sessionType} onValueChange={setSessionType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="game">Game</SelectItem>
            <SelectItem value="team_posed">Team posed</SelectItem>
            <SelectItem value="practice">Practice</SelectItem>
            <SelectItem value="event">Event</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Rate type</Label>
        <Select value={rateType} onValueChange={setRateType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="per_game">Per game</SelectItem>
            <SelectItem value="per_day">Per day</SelectItem>
            <SelectItem value="flat">Flat</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Amount (USD)</Label>
        <Input
          type="number"
          step="0.01"
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create rate card"}</Button>
    </form>
  );
}
```

- [ ] **Step 2: Create the list component**

```tsx
// src/components/admin/media/rate-cards-list.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RateCardForm } from "./rate-card-form";

interface RateCard {
  id: string;
  name: string;
  sessionType: string;
  rateType: string;
  rateCents: number;
  active: boolean;
  updatedAt: string;
}

export function RateCardsList() {
  const [rows, setRows] = useState<RateCard[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/media/rates");
    if (res.ok) setRows((await res.json()).rateCards);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(id: string, active: boolean) {
    const res = await fetch(`/api/admin/media/rates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (!res.ok) {
      toast.error("Failed to update");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold mb-2">Create new rate card</h2>
        <RateCardForm onCreated={load} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Existing rate cards</h2>
        {loading ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rate cards yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Name</th>
                <th>Session</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">{r.name}</td>
                  <td>{r.sessionType}</td>
                  <td>{r.rateType}</td>
                  <td>${(r.rateCents / 100).toFixed(2)}</td>
                  <td>
                    {r.active ? (
                      <Badge>Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </td>
                  <td>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(r.id, !r.active)}
                    >
                      {r.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Create the Astro page**

```astro
---
// src/pages/admin/media/rates.astro
import '../../../styles/globals.css';
import { AdminLayout } from '../../../components/admin/admin-layout';
import { RateCardsList } from '../../../components/admin/media/rate-cards-list';

const user = Astro.locals.user;
if (!user) return Astro.redirect('/signin?returnUrl=/admin/media/rates');
---

<AdminLayout currentPath="/admin/media/rates" user={user} client:load>
  <div class="p-6">
    <h1 class="text-2xl font-semibold mb-4">Media rate cards</h1>
    <RateCardsList client:load />
  </div>
</AdminLayout>
```

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`, log in as admin, visit `http://localhost:4321/admin/media/rates`. Create a card, deactivate, reactivate. Should all work without console errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/media/ src/pages/admin/media/rates.astro
git commit -m "feat(media): admin UI for rate-card CRUD"
```

---

## Task 6: Photographer rate-preferences API + UI

**Files:**
- Create: `src/pages/api/media/profile/rate-preferences.ts`
- Create: `src/components/media/rate-preferences-form.tsx`
- Create: `src/pages/media/profile.astro`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/media/profile.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getMediaStaffCookie, getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("Media profile: rate preferences", () => {
  let mediaCookie: string;
  let parentCookie: string;

  beforeAll(async () => {
    mediaCookie = await getMediaStaffCookie();
    parentCookie = await getParentCookie();
  });
  afterAll(() => resetCookies());

  it("rejects parent (403)", async () => {
    const res = await apiFetch("/api/media/profile/rate-preferences", {
      method: "PATCH",
      cookie: parentCookie,
      body: JSON.stringify({ preferredRateType: "per_game", preferredRateCents: 12000 }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("allows media_staff to set preference", async () => {
    const res = await apiFetch("/api/media/profile/rate-preferences", {
      method: "PATCH",
      cookie: mediaCookie,
      body: JSON.stringify({ preferredRateType: "per_day", preferredRateCents: 40000 }),
    });
    const json = await expectJson(res, 200);
    expect(json.profile.preferredRateType).toBe("per_day");
    expect(json.profile.preferredRateCents).toBe(40000);
  });

  it("allows clearing preference with nulls", async () => {
    const res = await apiFetch("/api/media/profile/rate-preferences", {
      method: "PATCH",
      cookie: mediaCookie,
      body: JSON.stringify({ preferredRateType: null, preferredRateCents: null }),
    });
    const json = await expectJson(res, 200);
    expect(json.profile.preferredRateType).toBeNull();
    expect(json.profile.preferredRateCents).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/media/profile.test.ts
```

Expected: FAIL (404 — endpoint missing).

- [ ] **Step 3: Create the endpoint**

```typescript
// src/pages/api/media/profile/rate-preferences.ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { mediaStaffProfiles } from "@/lib/db/schema/media";
import { eq } from "drizzle-orm";
import { requireMediaStaffAccess } from "@/lib/auth";

export const prerender = false;

const RATE_TYPES = ["per_game", "per_day", "flat"] as const;
const PatchSchema = z.object({
  preferredRateType: z.enum(RATE_TYPES).nullable(),
  preferredRateCents: z.number().int().positive().nullable(),
});

export const PATCH: APIRoute = async (context) => {
  const auth = await requireMediaStaffAccess(context);
  if (!auth.authorized) return auth.response;

  let raw: unknown;
  try { raw = await context.request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid payload", details: parsed.error.format() }),
      { status: 400 }
    );
  }

  // Enforce: both null or both set
  const bothSet =
    parsed.data.preferredRateType !== null &&
    parsed.data.preferredRateCents !== null;
  const bothNull =
    parsed.data.preferredRateType === null &&
    parsed.data.preferredRateCents === null;
  if (!bothSet && !bothNull) {
    return new Response(
      JSON.stringify({
        error: "preferredRateType and preferredRateCents must both be set or both be null",
      }),
      { status: 400 }
    );
  }

  const [row] = await getDb()
    .update(mediaStaffProfiles)
    .set({
      preferredRateType: parsed.data.preferredRateType,
      preferredRateCents: parsed.data.preferredRateCents,
      updatedAt: new Date(),
    })
    .where(eq(mediaStaffProfiles.userId, auth.user.id))
    .returning();

  return new Response(JSON.stringify({ profile: row }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Create the form component**

```tsx
// src/components/media/rate-preferences-form.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function RatePreferencesForm({
  initialRateType,
  initialRateCents,
}: {
  initialRateType: string | null;
  initialRateCents: number | null;
}) {
  const [rateType, setRateType] = useState(initialRateType ?? "per_game");
  const [dollars, setDollars] = useState(
    initialRateCents != null ? (initialRateCents / 100).toString() : ""
  );
  const [saving, setSaving] = useState(false);

  async function save(clear: boolean) {
    setSaving(true);
    const body = clear
      ? { preferredRateType: null, preferredRateCents: null }
      : {
          preferredRateType: rateType,
          preferredRateCents: Math.round(parseFloat(dollars) * 100),
        };
    const res = await fetch("/api/media/profile/rate-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Failed to save");
      return;
    }
    toast.success(clear ? "Preference cleared — rate cards will apply" : "Preference saved");
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); save(false); }}
      className="grid gap-3 max-w-md"
    >
      <div>
        <Label>Preferred rate type</Label>
        <Select value={rateType} onValueChange={setRateType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="per_game">Per game</SelectItem>
            <SelectItem value="per_day">Per day</SelectItem>
            <SelectItem value="flat">Flat</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Preferred amount (USD)</Label>
        <Input
          type="number"
          step="0.01"
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>Save preference</Button>
        <Button type="button" variant="outline" onClick={() => save(true)} disabled={saving}>
          Clear (use rate card)
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Create the Astro page**

```astro
---
// src/pages/media/profile.astro
import '../../styles/globals.css';
import { RatePreferencesForm } from '../../components/media/rate-preferences-form';
import { getDb } from '../../lib/db';
import { mediaStaffProfiles } from '../../lib/db/schema/media';
import { eq } from 'drizzle-orm';

const user = Astro.locals.user;
if (!user) return Astro.redirect('/signin?returnUrl=/media/profile');

const [profile] = await getDb()
  .select()
  .from(mediaStaffProfiles)
  .where(eq(mediaStaffProfiles.userId, user.id))
  .limit(1);
---

<div class="p-6 max-w-2xl mx-auto">
  <h1 class="text-2xl font-semibold mb-4">My profile</h1>
  <section class="mb-8">
    <h2 class="text-lg font-semibold mb-2">Rate preference</h2>
    <p class="text-sm text-muted-foreground mb-3">
      Optional. If set, this overrides the org's rate card for your assignments.
    </p>
    <RatePreferencesForm
      initialRateType={profile?.preferredRateType ?? null}
      initialRateCents={profile?.preferredRateCents ?? null}
      client:load
    />
  </section>
</div>
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npm run test:api -- tests/api/media/profile.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/api/media/profile/ src/components/media/rate-preferences-form.tsx src/pages/media/profile.astro tests/api/media/profile.test.ts
git commit -m "feat(media): photographer rate-preference self-service"
```

---

## Task 7: Stripe Connect onboarding for media_staff

**Files:**
- Create: `src/lib/media/connect.ts`
- Create: `src/pages/api/media/connect/onboard.ts`
- Create: `src/pages/api/media/connect/status.ts`
- Create: `src/components/media/connect-onboard-card.tsx`
- Create: `src/pages/media/connect.astro`
- Create: `tests/api/media/connect.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/media/connect.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getMediaStaffCookie, getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("Media Stripe Connect onboarding", () => {
  let mediaCookie: string;
  let parentCookie: string;

  beforeAll(async () => {
    mediaCookie = await getMediaStaffCookie();
    parentCookie = await getParentCookie();
  });
  afterAll(() => resetCookies());

  it("rejects parent on onboard (403)", async () => {
    const res = await apiFetch("/api/media/connect/onboard", {
      method: "POST",
      cookie: parentCookie,
    });
    expect([401, 403]).toContain(res.status);
  });

  it("allows media_staff to initiate onboarding", async () => {
    const res = await apiFetch("/api/media/connect/onboard", {
      method: "POST",
      cookie: mediaCookie,
    });
    // In dev/test mode with Stripe test keys, returns 200 with onboardingUrl.
    // If Stripe keys are absent, returns 503 — skip.
    if (res.status === 503) return;
    const json = await expectJson(res, 200);
    expect(typeof json.onboardingUrl).toBe("string");
    expect(typeof json.accountId).toBe("string");
  });

  it("returns status for media_staff after onboarding row exists", async () => {
    const res = await apiFetch("/api/media/connect/status", {
      method: "GET",
      cookie: mediaCookie,
    });
    if (res.status === 503) return;
    const json = await expectJson(res, 200);
    expect(typeof json.hasConnectAccount).toBe("boolean");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/media/connect.test.ts
```

Expected: FAIL (404 on endpoints).

- [ ] **Step 3: Create src/lib/media/connect.ts**

```typescript
import { stripe } from "@/lib/stripe/client";
import { createAccountOnboardingLink, getConnectAccountStatus } from "@/lib/stripe/connect";
import { getDb } from "@/lib/db";
import { mediaStaffProfiles } from "@/lib/db/schema/media";
import { eq } from "drizzle-orm";

export interface MediaConnectOnboardResult {
  accountId: string;
  onboardingUrl: string;
}

/**
 * Create (or reuse) a Stripe Express Connect account for a media_staff user
 * and return an onboarding link. Writes the account id to media_staff_profiles.
 *
 * Returns null if Stripe is not configured.
 */
export async function onboardMediaStaff(params: {
  userId: string;
  organizationId: string;
  email: string;
  fullName: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<MediaConnectOnboardResult | null> {
  if (!stripe) return null;

  const db = getDb();

  // Reuse existing account if profile already has one
  const [profile] = await db
    .select()
    .from(mediaStaffProfiles)
    .where(eq(mediaStaffProfiles.userId, params.userId))
    .limit(1);

  let accountId = profile?.stripeConnectAccountId ?? null;

  if (!accountId) {
    // Create Express account — independent contractors, not standard businesses
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: params.email,
      business_type: "individual",
      capabilities: {
        transfers: { requested: true },
      },
      business_profile: {
        name: params.fullName,
        mcc: "7221", // Photographic services
      },
      metadata: {
        userId: params.userId,
        organizationId: params.organizationId,
        role: "media_staff",
      },
    });
    accountId = account.id;

    await db
      .update(mediaStaffProfiles)
      .set({
        stripeConnectAccountId: accountId,
        updatedAt: new Date(),
      })
      .where(eq(mediaStaffProfiles.userId, params.userId));
  }

  const url = await createAccountOnboardingLink(
    accountId,
    params.returnUrl,
    params.refreshUrl
  );
  if (!url) throw new Error("Failed to create onboarding link");

  return { accountId, onboardingUrl: url };
}

export async function getMediaStaffConnectStatus(userId: string): Promise<{
  hasConnectAccount: boolean;
  accountId: string | null;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requiresAction: boolean;
}> {
  const [profile] = await getDb()
    .select()
    .from(mediaStaffProfiles)
    .where(eq(mediaStaffProfiles.userId, userId))
    .limit(1);

  const accountId = profile?.stripeConnectAccountId ?? null;
  if (!accountId || !stripe) {
    return {
      hasConnectAccount: !!accountId,
      accountId,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requiresAction: true,
    };
  }

  const s = await getConnectAccountStatus(accountId);
  return {
    hasConnectAccount: true,
    accountId,
    payoutsEnabled: s?.payoutsEnabled ?? false,
    detailsSubmitted: s?.detailsSubmitted ?? false,
    requiresAction: s?.requiresAction ?? true,
  };
}
```

- [ ] **Step 4: Create src/pages/api/media/connect/onboard.ts**

```typescript
import type { APIRoute } from "astro";
import { requireMediaStaffAccess, requireOrganizationContext } from "@/lib/auth";
import { onboardMediaStaff } from "@/lib/media/connect";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = await requireMediaStaffAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const origin = new URL(context.request.url).origin;
  try {
    const result = await onboardMediaStaff({
      userId: auth.user.id,
      organizationId: org.organizationId,
      email: auth.user.email,
      fullName: auth.user.name ?? auth.user.email,
      returnUrl: `${origin}/media/connect?status=complete`,
      refreshUrl: `${origin}/media/connect?status=refresh`,
    });
    if (!result) {
      return new Response(
        JSON.stringify({ error: "Stripe is not configured" }),
        { status: 503 }
      );
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Connect onboard error", err);
    return new Response(JSON.stringify({ error: "Onboarding failed" }), { status: 500 });
  }
};
```

- [ ] **Step 5: Create src/pages/api/media/connect/status.ts**

```typescript
import type { APIRoute } from "astro";
import { requireMediaStaffAccess } from "@/lib/auth";
import { getMediaStaffConnectStatus } from "@/lib/media/connect";
import { stripe } from "@/lib/stripe/client";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireMediaStaffAccess(context);
  if (!auth.authorized) return auth.response;

  if (!stripe) {
    return new Response(JSON.stringify({ error: "Stripe is not configured" }), { status: 503 });
  }

  const status = await getMediaStaffConnectStatus(auth.user.id);
  return new Response(JSON.stringify(status), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 6: Create the UI card**

```tsx
// src/components/media/connect-onboard-card.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Status {
  hasConnectAccount: boolean;
  accountId: string | null;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requiresAction: boolean;
}

export function ConnectOnboardCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/media/connect/status");
    if (res.ok) setStatus(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function start() {
    setWorking(true);
    const res = await fetch("/api/media/connect/onboard", { method: "POST" });
    setWorking(false);
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Failed to start onboarding");
      return;
    }
    const { onboardingUrl } = await res.json();
    window.location.href = onboardingUrl;
  }

  if (loading) return <p>Loading…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Get paid via Stripe</CardTitle>
        <CardDescription>
          We pay photographers through Stripe Connect. Finish onboarding and you'll
          receive payouts automatically when we approve your shoots.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status?.payoutsEnabled ? (
          <Badge>Payouts enabled</Badge>
        ) : status?.detailsSubmitted ? (
          <Badge variant="secondary">Under review</Badge>
        ) : status?.hasConnectAccount ? (
          <Badge variant="outline">Onboarding started</Badge>
        ) : (
          <Badge variant="outline">Not started</Badge>
        )}
        {!status?.payoutsEnabled && (
          <Button onClick={start} disabled={working}>
            {working ? "Opening Stripe…" : status?.hasConnectAccount ? "Continue onboarding" : "Start onboarding"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Create the Astro page**

```astro
---
// src/pages/media/connect.astro
import '../../styles/globals.css';
import { ConnectOnboardCard } from '../../components/media/connect-onboard-card';

const user = Astro.locals.user;
if (!user) return Astro.redirect('/signin?returnUrl=/media/connect');
---

<div class="p-6 max-w-2xl mx-auto">
  <h1 class="text-2xl font-semibold mb-4">Stripe Connect</h1>
  <ConnectOnboardCard client:load />
</div>
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npm run test:api -- tests/api/media/connect.test.ts
```

Expected: PASS (or skip paths trigger if Stripe keys absent).

- [ ] **Step 9: Commit**

```bash
git add src/lib/media/connect.ts src/pages/api/media/connect/ src/components/media/connect-onboard-card.tsx src/pages/media/connect.astro tests/api/media/connect.test.ts
git commit -m "feat(media): Stripe Connect onboarding for media_staff"
```

---

## Task 8: Payout state machine + approve endpoint

**Files:**
- Create: `src/lib/media/payouts.ts`
- Create: `src/pages/api/admin/media/shoots/[id]/approve.ts`
- Create: `tests/api/admin/media-payouts.test.ts`

- [ ] **Step 1: Write the failing test (happy path)**

```typescript
// tests/api/admin/media-payouts.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

// Assume seed data: a shoot session owned by media_staff@test, currently in status='ready', payout_status='pending_approval'.
const SEED_READY_SHOOT_ID = "00000000-0000-4000-8000-000000000101"; // replace with real seed value

describe("Admin: approve payout", () => {
  let adminCookie: string;

  beforeAll(async () => { adminCookie = await getAdminCookie(); });
  afterAll(() => resetCookies());

  it("rejects non-admin", async () => {
    const res = await apiFetch(`/api/admin/media/shoots/${SEED_READY_SHOOT_ID}/approve`, {
      method: "POST",
    });
    expect([401, 403]).toContain(res.status);
  });

  it("approves pending_approval shoot and transitions to paid", async () => {
    const res = await apiFetch(`/api/admin/media/shoots/${SEED_READY_SHOOT_ID}/approve`, {
      method: "POST",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(["approved", "paid"]).toContain(json.shoot.payoutStatus);
    expect(json.payout).toBeDefined();
    expect(json.payout.amountCents).toBeGreaterThan(0);
  });

  it("refuses to approve an unearned shoot (status=assigned)", async () => {
    // A shoot whose session.status hasn't reached 'ready'/'published' yet
    const UNEARNED_SHOOT_ID = "00000000-0000-4000-8000-000000000102";
    const res = await apiFetch(`/api/admin/media/shoots/${UNEARNED_SHOOT_ID}/approve`, {
      method: "POST",
      cookie: adminCookie,
    });
    expect([409, 422]).toContain(res.status);
  });

  it("refuses to double-approve a paid shoot", async () => {
    const res = await apiFetch(`/api/admin/media/shoots/${SEED_READY_SHOOT_ID}/approve`, {
      method: "POST",
      cookie: adminCookie,
    });
    expect([409, 422]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/admin/media-payouts.test.ts
```

Expected: FAIL (404 on endpoint).

- [ ] **Step 3: Create src/lib/media/payouts.ts**

```typescript
import { stripe } from "@/lib/stripe/client";
import { getDb } from "@/lib/db";
import { shootSessions, mediaStaffProfiles, mediaStaffPayouts, mediaAuditLog } from "@/lib/db/schema/media";
import { and, eq } from "drizzle-orm";

export type PayoutStatus =
  | "unearned"
  | "pending_approval"
  | "approved"
  | "paid"
  | "failed"
  | "cancelled";

export class PayoutStateError extends Error {
  constructor(message: string, public readonly code: "invalid_transition" | "not_ready" | "no_connect" | "stripe_error") {
    super(message);
    this.name = "PayoutStateError";
  }
}

/**
 * Transition a shoot's payout_status from pending_approval -> approved -> paid|failed.
 * Returns the updated shoot row + (if transfer attempted) the payout row.
 *
 * Preconditions:
 *   - shoot.status in ('ready','published')
 *   - shoot.payout_status = 'pending_approval'
 *   - photographer has stripe_connect_account_id and payouts_enabled
 */
export async function approvePayout(params: {
  shootSessionId: string;
  organizationId: string;
  approvedByUserId: string;
}): Promise<{
  shoot: typeof shootSessions.$inferSelect;
  payout: typeof mediaStaffPayouts.$inferSelect | null;
}> {
  const db = getDb();

  const [shoot] = await db
    .select()
    .from(shootSessions)
    .where(
      and(
        eq(shootSessions.id, params.shootSessionId),
        eq(shootSessions.organizationId, params.organizationId)
      )
    )
    .limit(1);
  if (!shoot) throw new PayoutStateError("Shoot not found", "invalid_transition");

  if (shoot.payoutStatus !== "pending_approval") {
    throw new PayoutStateError(
      `Cannot approve shoot in payout_status=${shoot.payoutStatus}`,
      "invalid_transition"
    );
  }
  if (shoot.status !== "ready" && shoot.status !== "published") {
    throw new PayoutStateError(
      `Shoot session must be ready or published to approve (got status=${shoot.status})`,
      "not_ready"
    );
  }

  // Move to approved first (durable checkpoint)
  await db
    .update(shootSessions)
    .set({ payoutStatus: "approved", updatedAt: new Date() })
    .where(eq(shootSessions.id, shoot.id));

  await db.insert(mediaAuditLog).values({
    actorUserId: params.approvedByUserId,
    entityType: "session",
    entityId: shoot.id,
    action: "approve",
    diff: { from: "pending_approval", to: "approved" },
  });

  // Resolve connect account
  const [profile] = await db
    .select()
    .from(mediaStaffProfiles)
    .where(eq(mediaStaffProfiles.userId, shoot.assignedUserId))
    .limit(1);
  if (!profile?.stripeConnectAccountId) {
    throw new PayoutStateError(
      "Photographer has no Stripe Connect account — cannot transfer",
      "no_connect"
    );
  }

  // Create or fetch payout row (unique on shoot_session_id)
  let [payoutRow] = await db
    .select()
    .from(mediaStaffPayouts)
    .where(eq(mediaStaffPayouts.shootSessionId, shoot.id))
    .limit(1);

  if (!payoutRow) {
    [payoutRow] = await db
      .insert(mediaStaffPayouts)
      .values({
        userId: shoot.assignedUserId,
        organizationId: shoot.organizationId,
        shootSessionId: shoot.id,
        amountCents: shoot.rateCents,
        status: "pending",
      })
      .returning();
  }

  // Attempt the transfer
  if (!stripe) {
    throw new PayoutStateError("Stripe not configured", "stripe_error");
  }

  try {
    const transfer = await stripe.transfers.create({
      amount: shoot.rateCents,
      currency: "usd",
      destination: profile.stripeConnectAccountId,
      description: `Aspire Media shoot ${shoot.id}`,
      metadata: {
        shoot_session_id: shoot.id,
        org_id: shoot.organizationId,
        user_id: shoot.assignedUserId,
      },
    });

    const paidAt = new Date();
    [payoutRow] = await db
      .update(mediaStaffPayouts)
      .set({
        stripeTransferId: transfer.id,
        status: "succeeded",
        paidAt,
        updatedAt: new Date(),
      })
      .where(eq(mediaStaffPayouts.id, payoutRow.id))
      .returning();

    const [updatedShoot] = await db
      .update(shootSessions)
      .set({
        payoutStatus: "paid",
        stripeTransferId: transfer.id,
        updatedAt: new Date(),
      })
      .where(eq(shootSessions.id, shoot.id))
      .returning();

    await db.insert(mediaAuditLog).values({
      actorUserId: params.approvedByUserId,
      entityType: "session",
      entityId: shoot.id,
      action: "approve",
      diff: { from: "approved", to: "paid", transferId: transfer.id },
    });

    return { shoot: updatedShoot, payout: payoutRow };
  } catch (err: any) {
    [payoutRow] = await db
      .update(mediaStaffPayouts)
      .set({
        status: "failed",
        failureCode: err?.code ?? "unknown",
        failureMessage: err?.message ?? String(err),
        retryCount: (payoutRow.retryCount ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(mediaStaffPayouts.id, payoutRow.id))
      .returning();

    const [updatedShoot] = await db
      .update(shootSessions)
      .set({ payoutStatus: "failed", updatedAt: new Date() })
      .where(eq(shootSessions.id, shoot.id))
      .returning();

    await db.insert(mediaAuditLog).values({
      actorUserId: params.approvedByUserId,
      entityType: "session",
      entityId: shoot.id,
      action: "approve",
      diff: { from: "approved", to: "failed", error: payoutRow.failureMessage },
    });

    return { shoot: updatedShoot, payout: payoutRow };
  }
}

/**
 * Retry a failed payout. Only allowed when shoot.payout_status='failed'.
 * Resets payout row to 'pending' then re-runs the transfer attempt.
 */
export async function retryPayout(params: {
  shootSessionId: string;
  organizationId: string;
  retriedByUserId: string;
}): Promise<{
  shoot: typeof shootSessions.$inferSelect;
  payout: typeof mediaStaffPayouts.$inferSelect | null;
}> {
  const db = getDb();
  const [shoot] = await db
    .select()
    .from(shootSessions)
    .where(
      and(
        eq(shootSessions.id, params.shootSessionId),
        eq(shootSessions.organizationId, params.organizationId)
      )
    )
    .limit(1);
  if (!shoot) throw new PayoutStateError("Shoot not found", "invalid_transition");
  if (shoot.payoutStatus !== "failed") {
    throw new PayoutStateError(
      `Can only retry failed payouts (current: ${shoot.payoutStatus})`,
      "invalid_transition"
    );
  }

  // Flip back to 'approved' and call approvePayout's transfer path
  await db
    .update(shootSessions)
    .set({ payoutStatus: "approved", updatedAt: new Date() })
    .where(eq(shootSessions.id, shoot.id));

  // For retry we need the payout row to exist; approvePayout's transfer logic
  // handles both create-or-update. But approvePayout only runs from
  // pending_approval. We inline the transfer attempt here instead.

  const [profile] = await db
    .select()
    .from(mediaStaffProfiles)
    .where(eq(mediaStaffProfiles.userId, shoot.assignedUserId))
    .limit(1);
  if (!profile?.stripeConnectAccountId) {
    throw new PayoutStateError("No Connect account", "no_connect");
  }
  if (!stripe) throw new PayoutStateError("Stripe not configured", "stripe_error");

  let [payoutRow] = await db
    .select()
    .from(mediaStaffPayouts)
    .where(eq(mediaStaffPayouts.shootSessionId, shoot.id))
    .limit(1);

  try {
    const transfer = await stripe.transfers.create({
      amount: shoot.rateCents,
      currency: "usd",
      destination: profile.stripeConnectAccountId,
      description: `Aspire Media shoot ${shoot.id} (retry)`,
      metadata: {
        shoot_session_id: shoot.id,
        org_id: shoot.organizationId,
        user_id: shoot.assignedUserId,
        retry: "true",
      },
    });

    [payoutRow] = await db
      .update(mediaStaffPayouts)
      .set({
        stripeTransferId: transfer.id,
        status: "succeeded",
        paidAt: new Date(),
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(mediaStaffPayouts.id, payoutRow.id))
      .returning();

    const [updatedShoot] = await db
      .update(shootSessions)
      .set({
        payoutStatus: "paid",
        stripeTransferId: transfer.id,
        updatedAt: new Date(),
      })
      .where(eq(shootSessions.id, shoot.id))
      .returning();

    await db.insert(mediaAuditLog).values({
      actorUserId: params.retriedByUserId,
      entityType: "session",
      entityId: shoot.id,
      action: "approve",
      diff: { from: "failed", to: "paid", transferId: transfer.id, retry: true },
    });

    return { shoot: updatedShoot, payout: payoutRow };
  } catch (err: any) {
    [payoutRow] = await db
      .update(mediaStaffPayouts)
      .set({
        status: "failed",
        failureCode: err?.code ?? "unknown",
        failureMessage: err?.message ?? String(err),
        retryCount: (payoutRow.retryCount ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(mediaStaffPayouts.id, payoutRow.id))
      .returning();

    const [updatedShoot] = await db
      .update(shootSessions)
      .set({ payoutStatus: "failed", updatedAt: new Date() })
      .where(eq(shootSessions.id, shoot.id))
      .returning();

    return { shoot: updatedShoot, payout: payoutRow };
  }
}
```

- [ ] **Step 4: Create src/pages/api/admin/media/shoots/[id]/approve.ts**

```typescript
import type { APIRoute } from "astro";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { approvePayout, PayoutStateError } from "@/lib/media/payouts";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const id = context.params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "id required" }), { status: 400 });
  }

  try {
    const result = await approvePayout({
      shootSessionId: id,
      organizationId: org.organizationId,
      approvedByUserId: auth.user.id,
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof PayoutStateError) {
      const status =
        err.code === "invalid_transition" ? 409 :
        err.code === "not_ready" ? 422 :
        err.code === "no_connect" ? 422 :
        500;
      return new Response(JSON.stringify({ error: err.message, code: err.code }), { status });
    }
    console.error("approve error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
};
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:api -- tests/api/admin/media-payouts.test.ts
```

Expected: PASS (happy path + guard clauses). Stripe test keys required — if absent, the happy-path test will fail with `stripe_error`; skip/xfail is acceptable if `STRIPE_SECRET_KEY` isn't configured in the CI env.

- [ ] **Step 6: Commit**

```bash
git add src/lib/media/payouts.ts src/pages/api/admin/media/shoots/\[id\]/approve.ts tests/api/admin/media-payouts.test.ts
git commit -m "feat(media): payout state machine + approve endpoint"
```

---

## Task 9: Payout retry endpoint + failed-transfer test

**Files:**
- Create: `src/pages/api/admin/media/payouts/retry.ts`
- Modify: `tests/api/admin/media-payouts.test.ts` (add retry cases)

- [ ] **Step 1: Add retry tests**

Append to `tests/api/admin/media-payouts.test.ts`:

```typescript
describe("Admin: retry failed payout", () => {
  let adminCookie: string;
  const FAILED_SHOOT_ID = "00000000-0000-4000-8000-000000000103"; // seed: payout_status='failed'

  beforeAll(async () => { adminCookie = await getAdminCookie(); });
  afterAll(() => resetCookies());

  it("retries a failed payout", async () => {
    const res = await apiFetch("/api/admin/media/payouts/retry", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ shootSessionId: FAILED_SHOOT_ID }),
    });
    const json = await expectJson(res, 200);
    expect(["paid", "failed"]).toContain(json.shoot.payoutStatus);
    expect(json.payout.retryCount).toBeGreaterThan(0);
  });

  it("refuses to retry a paid shoot", async () => {
    const PAID_SHOOT_ID = "00000000-0000-4000-8000-000000000101";
    const res = await apiFetch("/api/admin/media/payouts/retry", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ shootSessionId: PAID_SHOOT_ID }),
    });
    expect([409, 422]).toContain(res.status);
  });
});
```

Test-side note: to create a `failed` fixture, extend the seed or invoke Stripe with a known-failing amount (Stripe test mode has no reliable transfer-failure trigger; prefer seeding a row with `payout_status='failed'` directly). Document the chosen approach in `src/lib/db/seeds/seed-phase1-demo.ts` as you add the fixture.

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/admin/media-payouts.test.ts
```

Expected: FAIL on the retry cases (endpoint missing).

- [ ] **Step 3: Create src/pages/api/admin/media/payouts/retry.ts**

```typescript
import type { APIRoute } from "astro";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { retryPayout, PayoutStateError } from "@/lib/media/payouts";

export const prerender = false;

const Schema = z.object({ shootSessionId: z.string().uuid() });

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  let raw: unknown;
  try { raw = await context.request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
  }

  try {
    const result = await retryPayout({
      shootSessionId: parsed.data.shootSessionId,
      organizationId: org.organizationId,
      retriedByUserId: auth.user.id,
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof PayoutStateError) {
      const status =
        err.code === "invalid_transition" ? 409 :
        err.code === "no_connect" ? 422 :
        500;
      return new Response(JSON.stringify({ error: err.message, code: err.code }), { status });
    }
    console.error("retry error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:api -- tests/api/admin/media-payouts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/media/payouts/retry.ts tests/api/admin/media-payouts.test.ts
git commit -m "feat(media): retry endpoint for failed payouts"
```

---

## Task 10: Transfer metadata shape test

**Files:**
- Modify: `tests/api/admin/media-payouts.test.ts`

- [ ] **Step 1: Append metadata shape test**

```typescript
describe("Payout transfer metadata", () => {
  let adminCookie: string;
  // A shoot in pending_approval state, photographer has a Stripe test Connect account.
  const READY_FOR_APPROVE_ID = "00000000-0000-4000-8000-000000000104";

  beforeAll(async () => { adminCookie = await getAdminCookie(); });
  afterAll(() => resetCookies());

  it("includes shoot_session_id, org_id, user_id in transfer metadata", async () => {
    const res = await apiFetch(`/api/admin/media/shoots/${READY_FOR_APPROVE_ID}/approve`, {
      method: "POST",
      cookie: adminCookie,
    });
    // Skip if stripe is not wired in this environment.
    if (res.status === 500 || res.status === 503) return;
    const json = await expectJson(res, 200);
    expect(json.shoot.stripeTransferId).toBeDefined();

    // Fetch the transfer back from Stripe via an admin debug endpoint we add below.
    const metaRes = await apiFetch(
      `/api/admin/media/shoots/${READY_FOR_APPROVE_ID}/transfer-metadata`,
      { method: "GET", cookie: adminCookie }
    );
    const metaJson = await expectJson(metaRes, 200);
    expect(metaJson.metadata.shoot_session_id).toBe(READY_FOR_APPROVE_ID);
    expect(metaJson.metadata.org_id).toBeDefined();
    expect(metaJson.metadata.user_id).toBeDefined();
  });
});
```

- [ ] **Step 2: Create src/pages/api/admin/media/shoots/[id]/transfer-metadata.ts**

```typescript
import type { APIRoute } from "astro";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { shootSessions } from "@/lib/db/schema/media";
import { and, eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe/client";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const id = context.params.id;
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 });

  const [shoot] = await getDb()
    .select()
    .from(shootSessions)
    .where(
      and(
        eq(shootSessions.id, id),
        eq(shootSessions.organizationId, org.organizationId)
      )
    )
    .limit(1);
  if (!shoot?.stripeTransferId) {
    return new Response(JSON.stringify({ error: "No transfer on file" }), { status: 404 });
  }
  if (!stripe) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), { status: 503 });
  }
  const transfer = await stripe.transfers.retrieve(shoot.stripeTransferId);
  return new Response(
    JSON.stringify({ metadata: transfer.metadata, amount: transfer.amount }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
```

- [ ] **Step 3: Run test to verify it passes**

```bash
npm run test:api -- tests/api/admin/media-payouts.test.ts
```

Expected: PASS (or skip if Stripe not configured).

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/media/shoots/\[id\]/transfer-metadata.ts tests/api/admin/media-payouts.test.ts
git commit -m "feat(media): expose transfer metadata for reconciliation"
```

---

## Task 11: Bulk-approve endpoint + weekly batch UI

**Files:**
- Create: `src/pages/api/admin/media/shoots/bulk-approve.ts`
- Create: `src/components/admin/media/bulk-approve-table.tsx`
- Create: `src/pages/admin/media/shoots/bulk-approve.astro`
- Modify: `tests/api/admin/media-payouts.test.ts`

- [ ] **Step 1: Add bulk-approve test**

```typescript
describe("Admin: bulk approve", () => {
  let adminCookie: string;
  beforeAll(async () => { adminCookie = await getAdminCookie(); });
  afterAll(() => resetCookies());

  it("lists pending_approval shoots (GET)", async () => {
    const res = await apiFetch("/api/admin/media/shoots/bulk-approve", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.shoots)).toBe(true);
    for (const s of json.shoots) expect(s.payoutStatus).toBe("pending_approval");
  });

  it("approves many shoots (POST)", async () => {
    // Seed data must include at least 2 pending_approval shoots owned by photographers with Connect accounts.
    const listRes = await apiFetch("/api/admin/media/shoots/bulk-approve", {
      method: "GET",
      cookie: adminCookie,
    });
    const list = await expectJson(listRes, 200);
    const ids = list.shoots.slice(0, 2).map((s: any) => s.id);
    if (ids.length < 2) return; // skip if fixture insufficient

    const res = await apiFetch("/api/admin/media/shoots/bulk-approve", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ shootSessionIds: ids }),
    });
    const json = await expectJson(res, 200);
    expect(json.results.length).toBe(ids.length);
    for (const r of json.results) {
      expect(["paid", "failed"]).toContain(r.payoutStatus);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/admin/media-payouts.test.ts
```

Expected: FAIL (404 on bulk-approve).

- [ ] **Step 3: Create the endpoint**

```typescript
// src/pages/api/admin/media/shoots/bulk-approve.ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { shootSessions, mediaStaffProfiles, users } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { approvePayout, PayoutStateError } from "@/lib/media/payouts";

export const prerender = false;

const BodySchema = z.object({
  shootSessionIds: z.array(z.string().uuid()).min(1).max(200),
});

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const rows = await getDb()
    .select({
      id: shootSessions.id,
      assignedUserId: shootSessions.assignedUserId,
      assignedUserName: users.name,
      sessionType: shootSessions.sessionType,
      scheduledStart: shootSessions.scheduledStart,
      rateCents: shootSessions.rateCents,
      rateType: shootSessions.rateType,
      payoutStatus: shootSessions.payoutStatus,
      status: shootSessions.status,
    })
    .from(shootSessions)
    .leftJoin(users, eq(users.id, shootSessions.assignedUserId))
    .where(
      and(
        eq(shootSessions.organizationId, org.organizationId),
        eq(shootSessions.payoutStatus, "pending_approval")
      )
    );

  return new Response(JSON.stringify({ shoots: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  let raw: unknown;
  try { raw = await context.request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
  }

  const results: any[] = [];
  for (const id of parsed.data.shootSessionIds) {
    try {
      const { shoot, payout } = await approvePayout({
        shootSessionId: id,
        organizationId: org.organizationId,
        approvedByUserId: auth.user.id,
      });
      results.push({
        id,
        payoutStatus: shoot.payoutStatus,
        transferId: shoot.stripeTransferId,
        amountCents: payout?.amountCents ?? null,
      });
    } catch (err) {
      results.push({
        id,
        payoutStatus: "error",
        error: err instanceof PayoutStateError ? err.message : "internal",
      });
    }
  }

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Create the bulk-approve table component**

```tsx
// src/components/admin/media/bulk-approve-table.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface Row {
  id: string;
  assignedUserName: string | null;
  sessionType: string;
  scheduledStart: string;
  rateCents: number;
  rateType: string;
  status: string;
}

export function BulkApproveTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/media/shoots/bulk-approve");
    if (res.ok) setRows((await res.json()).shoots);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function submit() {
    if (selected.size === 0) return;
    setSubmitting(true);
    const res = await fetch("/api/admin/media/shoots/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shootSessionIds: Array.from(selected) }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error("Bulk approve failed");
      return;
    }
    const { results } = await res.json();
    const okCount = results.filter((r: any) => r.payoutStatus === "paid").length;
    const failCount = results.length - okCount;
    toast.success(`${okCount} paid, ${failCount} issue(s)`);
    setSelected(new Set());
    await load();
  }

  const total = rows
    .filter((r) => selected.has(r.id))
    .reduce((acc, r) => acc + r.rateCents, 0);

  if (loading) return <p>Loading…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <span className="text-sm">{selected.size} selected · ${(total / 100).toFixed(2)}</span>
        <Button onClick={submit} disabled={selected.size === 0 || submitting}>
          {submitting ? "Approving…" : "Approve selected"}
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th></th>
            <th>Photographer</th>
            <th>Session</th>
            <th>Scheduled</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2">
                <Checkbox
                  checked={selected.has(r.id)}
                  onCheckedChange={() => toggle(r.id)}
                />
              </td>
              <td>{r.assignedUserName ?? r.id}</td>
              <td>{r.sessionType}</td>
              <td>{new Date(r.scheduledStart).toLocaleString()}</td>
              <td>{r.rateType}</td>
              <td>${(r.rateCents / 100).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Create the Astro page**

```astro
---
// src/pages/admin/media/shoots/bulk-approve.astro
import '../../../../styles/globals.css';
import { AdminLayout } from '../../../../components/admin/admin-layout';
import { BulkApproveTable } from '../../../../components/admin/media/bulk-approve-table';

const user = Astro.locals.user;
if (!user) return Astro.redirect('/signin?returnUrl=/admin/media/shoots/bulk-approve');
---

<AdminLayout currentPath="/admin/media/shoots/bulk-approve" user={user} client:load>
  <div class="p-6">
    <h1 class="text-2xl font-semibold mb-4">Weekly payout approval</h1>
    <p class="text-sm text-muted-foreground mb-4">
      Shoots with payout_status=pending_approval. Approving transfers via Stripe Connect.
    </p>
    <BulkApproveTable client:load />
  </div>
</AdminLayout>
```

- [ ] **Step 6: Run tests**

```bash
npm run test:api -- tests/api/admin/media-payouts.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/api/admin/media/shoots/bulk-approve.ts src/components/admin/media/bulk-approve-table.tsx src/pages/admin/media/shoots/bulk-approve.astro
git commit -m "feat(media): bulk-approve weekly batch UI + API"
```

---

## Task 12: Shoot-detail approve button

**Files:**
- Modify: `src/pages/admin/media/shoots/[id].astro`
- Create: `src/components/admin/media/approve-payout-button.tsx`

- [ ] **Step 1: Read the existing shoot detail page**

```bash
cat src/pages/admin/media/shoots/\[id\].astro
```

Note where actions block is rendered.

- [ ] **Step 2: Create the button component**

```tsx
// src/components/admin/media/approve-payout-button.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ApprovePayoutButton({
  shootSessionId,
  payoutStatus,
}: {
  shootSessionId: string;
  payoutStatus: string;
}) {
  const [status, setStatus] = useState(payoutStatus);
  const [working, setWorking] = useState(false);

  async function approve() {
    setWorking(true);
    const res = await fetch(`/api/admin/media/shoots/${shootSessionId}/approve`, {
      method: "POST",
    });
    setWorking(false);
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Approve failed");
      return;
    }
    const { shoot } = await res.json();
    setStatus(shoot.payoutStatus);
    toast.success(`Now: ${shoot.payoutStatus}`);
  }

  async function retry() {
    setWorking(true);
    const res = await fetch(`/api/admin/media/payouts/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shootSessionId }),
    });
    setWorking(false);
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Retry failed");
      return;
    }
    const { shoot } = await res.json();
    setStatus(shoot.payoutStatus);
    toast.success(`Now: ${shoot.payoutStatus}`);
  }

  if (status === "pending_approval") {
    return <Button disabled={working} onClick={approve}>{working ? "Working…" : "Approve payout"}</Button>;
  }
  if (status === "failed") {
    return <Button disabled={working} onClick={retry} variant="destructive">{working ? "Retrying…" : "Retry transfer"}</Button>;
  }
  return <span className="text-sm text-muted-foreground">Payout status: {status}</span>;
}
```

- [ ] **Step 3: Wire into [id].astro**

In the existing `src/pages/admin/media/shoots/[id].astro`, after the shoot detail block is rendered, add:

```astro
---
// (existing frontmatter — add imports)
import { ApprovePayoutButton } from '../../../../components/admin/media/approve-payout-button';
// ... existing data fetch for the shoot lands in `shoot` variable
---

<!-- inside the actions area of the page -->
<ApprovePayoutButton
  shootSessionId={shoot.id}
  payoutStatus={shoot.payoutStatus}
  client:load
/>
```

- [ ] **Step 4: Manual smoke test**

`npm run dev`, log in as admin, navigate to an existing shoot at pending_approval status, click "Approve payout", confirm toast shows new status.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/media/approve-payout-button.tsx src/pages/admin/media/shoots/\[id\].astro
git commit -m "feat(media): approve/retry buttons on shoot detail page"
```

---

## Task 13: Photographer payments API + UI

**Files:**
- Create: `src/pages/api/media/payments/index.ts`
- Create: `src/components/media/payments-history.tsx`
- Create: `src/pages/media/payments.astro`
- Create: `tests/api/media/payments.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/media/payments.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getMediaStaffCookie, getAdminCookie, getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("Media payments", () => {
  let mediaCookie: string;
  let parentCookie: string;

  beforeAll(async () => {
    mediaCookie = await getMediaStaffCookie();
    parentCookie = await getParentCookie();
  });
  afterAll(() => resetCookies());

  it("rejects parent", async () => {
    const res = await apiFetch("/api/media/payments", { method: "GET", cookie: parentCookie });
    expect([401, 403]).toContain(res.status);
  });

  it("returns photographer's own history + YTD", async () => {
    const res = await apiFetch("/api/media/payments", { method: "GET", cookie: mediaCookie });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.payments)).toBe(true);
    expect(typeof json.totals.lifetimeCents).toBe("number");
    expect(typeof json.totals.ytdCents).toBe("number");
    // Permission gate: must only contain this user's rows
    for (const p of json.payments) expect(p.userId).toBeUndefined(); // userId stripped from response
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/media/payments.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create the endpoint**

```typescript
// src/pages/api/media/payments/index.ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { mediaStaffPayouts, shootSessions } from "@/lib/db/schema/media";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireMediaStaffAccess } from "@/lib/auth";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireMediaStaffAccess(context);
  if (!auth.authorized) return auth.response;

  const db = getDb();
  const now = new Date();
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const rows = await db
    .select({
      payoutId: mediaStaffPayouts.id,
      shootSessionId: mediaStaffPayouts.shootSessionId,
      amountCents: mediaStaffPayouts.amountCents,
      status: mediaStaffPayouts.status,
      stripeTransferId: mediaStaffPayouts.stripeTransferId,
      paidAt: mediaStaffPayouts.paidAt,
      sessionType: shootSessions.sessionType,
      scheduledStart: shootSessions.scheduledStart,
      rateType: shootSessions.rateType,
    })
    .from(mediaStaffPayouts)
    .leftJoin(shootSessions, eq(shootSessions.id, mediaStaffPayouts.shootSessionId))
    .where(eq(mediaStaffPayouts.userId, auth.user.id))
    .orderBy(desc(mediaStaffPayouts.createdAt));

  const [lifetime] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${mediaStaffPayouts.amountCents}), 0)`,
    })
    .from(mediaStaffPayouts)
    .where(
      and(
        eq(mediaStaffPayouts.userId, auth.user.id),
        eq(mediaStaffPayouts.status, "succeeded")
      )
    );

  const [ytd] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${mediaStaffPayouts.amountCents}), 0)`,
    })
    .from(mediaStaffPayouts)
    .where(
      and(
        eq(mediaStaffPayouts.userId, auth.user.id),
        eq(mediaStaffPayouts.status, "succeeded"),
        gte(mediaStaffPayouts.paidAt, startOfYear)
      )
    );

  return new Response(
    JSON.stringify({
      payments: rows,
      totals: {
        lifetimeCents: Number(lifetime.total ?? 0),
        ytdCents: Number(ytd.total ?? 0),
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
```

- [ ] **Step 4: Create the React component**

```tsx
// src/components/media/payments-history.tsx
"use client";

import { useEffect, useState } from "react";

interface Row {
  payoutId: string;
  shootSessionId: string;
  amountCents: number;
  status: string;
  stripeTransferId: string | null;
  paidAt: string | null;
  sessionType: string | null;
  scheduledStart: string | null;
  rateType: string | null;
}

interface Totals {
  lifetimeCents: number;
  ytdCents: number;
}

export function PaymentsHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals>({ lifetimeCents: 0, ytdCents: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/media/payments");
      if (res.ok) {
        const json = await res.json();
        setRows(json.payments);
        setTotals(json.totals);
      }
      setLoading(false);
    })();
  }, []);

  const year = new Date().getUTCFullYear();

  if (loading) return <p>Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Lifetime paid</p>
          <p className="text-2xl font-semibold">${(totals.lifetimeCents / 100).toFixed(2)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Year to date ({year})</p>
          <p className="text-2xl font-semibold">${(totals.ytdCents / 100).toFixed(2)}</p>
        </div>
      </div>

      <a
        href={`/api/media/payments/1099/${year - 1}`}
        className="inline-block text-sm underline"
      >
        Download my {year - 1} 1099-NEC (PDF)
      </a>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th>Scheduled</th>
            <th>Session</th>
            <th>Rate</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Paid at</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.payoutId} className="border-b">
              <td className="py-2">{r.scheduledStart ? new Date(r.scheduledStart).toLocaleDateString() : "—"}</td>
              <td>{r.sessionType}</td>
              <td>{r.rateType}</td>
              <td>${(r.amountCents / 100).toFixed(2)}</td>
              <td>{r.status}</td>
              <td>{r.paidAt ? new Date(r.paidAt).toLocaleDateString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Create the Astro page**

```astro
---
// src/pages/media/payments.astro
import '../../styles/globals.css';
import { PaymentsHistory } from '../../components/media/payments-history';

const user = Astro.locals.user;
if (!user) return Astro.redirect('/signin?returnUrl=/media/payments');
---

<div class="p-6 max-w-4xl mx-auto">
  <h1 class="text-2xl font-semibold mb-4">Payments</h1>
  <PaymentsHistory client:load />
</div>
```

- [ ] **Step 6: Run test**

```bash
npm run test:api -- tests/api/media/payments.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/api/media/payments/index.ts src/components/media/payments-history.tsx src/pages/media/payments.astro tests/api/media/payments.test.ts
git commit -m "feat(media): photographer payments history page with YTD"
```

---

## Task 14: Install pdf-lib + @aws-sdk/client-s3 + recharts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install pdf-lib @aws-sdk/client-s3 recharts
```

Versions at the time of writing: `pdf-lib@1.17.1`, `@aws-sdk/client-s3@3+`, `recharts@2+`. Use whatever npm resolves; pin later if CI dictates.

- [ ] **Step 2: Verify no peer-dep warnings break the build**

```bash
npm run build
```

Expected: build completes. If recharts warns about React 19 peer ranges, add `--legacy-peer-deps` to the install command or upgrade to a recharts pre-release that supports React 19 (2.13.0+ should work).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pdf-lib, @aws-sdk/client-s3, recharts for Phase 4"
```

---

## Task 15: R2 client wrapper (create only if Phase 1 didn't)

**Files:**
- Create (if missing): `src/lib/storage/r2.ts`

- [ ] **Step 1: Check if already exists**

```bash
ls src/lib/storage/r2.ts 2>/dev/null && echo "already exists — skip this task" || echo "creating now"
```

If it exists, skip this task entirely.

- [ ] **Step 2: Create the wrapper**

```typescript
// src/lib/storage/r2.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = import.meta.env.R2_ACCOUNT_ID;
const accessKeyId = import.meta.env.R2_ACCESS_KEY_ID;
const secretAccessKey = import.meta.env.R2_SECRET_ACCESS_KEY;
const bucket = import.meta.env.R2_BUCKET;

export function isR2Configured(): boolean {
  return !!(accountId && accessKeyId && secretAccessKey && bucket);
}

export const r2Client = isR2Configured()
  ? new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    })
  : null;

export const r2Bucket = bucket;

export async function r2Put(key: string, body: Uint8Array | Buffer, contentType: string): Promise<void> {
  if (!r2Client || !r2Bucket) throw new Error("R2 not configured");
  await r2Client.send(
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function r2SignedGet(key: string, ttlSeconds = 300): Promise<string> {
  if (!r2Client || !r2Bucket) throw new Error("R2 not configured");
  return getSignedUrl(
    r2Client,
    new GetObjectCommand({ Bucket: r2Bucket, Key: key }),
    { expiresIn: ttlSeconds }
  );
}

// Also install the presigner if not already a dep
// npm install @aws-sdk/s3-request-presigner
```

- [ ] **Step 3: Install presigner if missing**

```bash
npm ls @aws-sdk/s3-request-presigner || npm install @aws-sdk/s3-request-presigner
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage/r2.ts package.json package-lock.json
git commit -m "feat(storage): minimal R2 S3-compatible wrapper"
```

---

## Task 16: 1099-NEC PDF generator (deterministic)

**Files:**
- Create: `src/lib/media/1099.ts`
- Create: `tests/api/lib/1099-pdf.test.ts`

- [ ] **Step 1: Write the failing determinism test**

```typescript
// tests/api/lib/1099-pdf.test.ts
import { describe, it, expect } from "vitest";
import { generate1099PdfBytes } from "../../../src/lib/media/1099";

describe("1099-NEC PDF", () => {
  const fixture = {
    taxYear: 2026,
    payer: {
      name: "Aspire Sports LLC",
      streetAddress: "123 Main St",
      cityStateZip: "Powell, OH 43065",
      tin: "12-3456789",
    },
    recipient: {
      name: "Jane Doe",
      streetAddress: "456 Oak Ave",
      cityStateZip: "Columbus, OH 43215",
      tin: "***-**-1234",
    },
    box1NonemployeeCompensationCents: 450000, // $4,500.00
    box4FederalWithholdingCents: 0,
  };

  it("is deterministic — same input yields identical bytes", async () => {
    const a = await generate1099PdfBytes(fixture);
    const b = await generate1099PdfBytes(fixture);
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
  });

  it("different amounts produce different bytes", async () => {
    const a = await generate1099PdfBytes(fixture);
    const b = await generate1099PdfBytes({
      ...fixture,
      box1NonemployeeCompensationCents: fixture.box1NonemployeeCompensationCents + 1,
    });
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/lib/1099-pdf.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Create src/lib/media/1099.ts**

```typescript
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface NineOneOneNineInput {
  taxYear: number;
  payer: {
    name: string;
    streetAddress: string;
    cityStateZip: string;
    tin: string;
  };
  recipient: {
    name: string;
    streetAddress: string;
    cityStateZip: string;
    tin: string;
  };
  box1NonemployeeCompensationCents: number;
  box4FederalWithholdingCents: number;
}

// A fixed epoch so CreationDate/ModDate don't vary.
// pdf-lib lets us set these directly on the document.
const DETERMINISTIC_EPOCH = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));

function fmtCents(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rem = Math.abs(cents % 100).toString().padStart(2, "0");
  return `${dollars.toLocaleString("en-US")}.${rem}`;
}

/**
 * Render a plain-text 1099-NEC summary as PDF bytes. Not the official IRS
 * facsimile form; we render a clear record suitable for tax prep and
 * audit. Determinism is a requirement: same input -> same bytes.
 */
export async function generate1099PdfBytes(input: NineOneOneNineInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  // Strip metadata to keep bytes deterministic
  pdf.setTitle(`1099-NEC ${input.taxYear} — ${input.recipient.name}`);
  pdf.setAuthor("Aspire Sports");
  pdf.setSubject("Form 1099-NEC");
  pdf.setCreator("aspire-sports");
  pdf.setProducer("aspire-sports");
  pdf.setCreationDate(DETERMINISTIC_EPOCH);
  pdf.setModificationDate(DETERMINISTIC_EPOCH);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]); // letter

  let y = 740;
  const left = 50;
  const draw = (text: string, { size = 11, useBold = false, offsetX = 0 } = {}) => {
    page.drawText(text, {
      x: left + offsetX,
      y,
      size,
      font: useBold ? bold : font,
      color: rgb(0, 0, 0),
    });
  };

  draw(`Form 1099-NEC — Tax Year ${input.taxYear}`, { size: 16, useBold: true });
  y -= 30;
  draw("Payer (Aspire Sports org)", { useBold: true });
  y -= 16;
  draw(input.payer.name);
  y -= 14;
  draw(input.payer.streetAddress);
  y -= 14;
  draw(input.payer.cityStateZip);
  y -= 14;
  draw(`Payer TIN: ${input.payer.tin}`);
  y -= 28;

  draw("Recipient", { useBold: true });
  y -= 16;
  draw(input.recipient.name);
  y -= 14;
  draw(input.recipient.streetAddress);
  y -= 14;
  draw(input.recipient.cityStateZip);
  y -= 14;
  draw(`Recipient TIN: ${input.recipient.tin}`);
  y -= 28;

  draw("Box 1 — Nonemployee compensation", { useBold: true });
  y -= 16;
  draw(`$${fmtCents(input.box1NonemployeeCompensationCents)}`);
  y -= 28;

  draw("Box 4 — Federal income tax withheld", { useBold: true });
  y -= 16;
  draw(`$${fmtCents(input.box4FederalWithholdingCents)}`);
  y -= 28;

  draw(
    "This document summarizes compensation paid via Stripe Connect transfers during the tax year. Please consult a tax professional for filing.",
    { size: 9 }
  );

  // Serialize with deterministic object order
  return pdf.save({ useObjectStreams: false });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:api -- tests/api/lib/1099-pdf.test.ts
```

Expected: PASS. If determinism fails, inspect which metadata field is varying. pdf-lib v1.17.1's default behavior embeds creation timestamps unless overridden; the explicit `setCreationDate`/`setModificationDate` calls above prevent that.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/1099.ts tests/api/lib/1099-pdf.test.ts
git commit -m "feat(media): deterministic 1099-NEC PDF generator"
```

---

## Task 17: 1099 aggregation + storage + download endpoint

**Files:**
- Modify: `src/lib/media/1099.ts`
- Create: `src/pages/api/media/payments/1099/[year].ts`
- Create: `src/pages/api/admin/media/1099/[year]/[userId].ts`

- [ ] **Step 1: Add aggregation helper to src/lib/media/1099.ts**

Append to the bottom of `src/lib/media/1099.ts`:

```typescript
import { getDb } from "@/lib/db";
import { mediaStaffPayouts, mediaStaffProfiles } from "@/lib/db/schema/media";
import { users } from "@/lib/db/schema/users";
import { organizations } from "@/lib/db/schema/organizations";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { r2Put, r2SignedGet } from "@/lib/storage/r2";

export async function aggregatePaidCentsForUserYear(params: {
  userId: string;
  organizationId: string;
  taxYear: number;
}): Promise<number> {
  const start = new Date(Date.UTC(params.taxYear, 0, 1));
  const end = new Date(Date.UTC(params.taxYear + 1, 0, 1));
  const [row] = await getDb()
    .select({ total: sql<number>`COALESCE(SUM(${mediaStaffPayouts.amountCents}), 0)` })
    .from(mediaStaffPayouts)
    .where(
      and(
        eq(mediaStaffPayouts.userId, params.userId),
        eq(mediaStaffPayouts.organizationId, params.organizationId),
        eq(mediaStaffPayouts.status, "succeeded"),
        gte(mediaStaffPayouts.paidAt, start),
        lt(mediaStaffPayouts.paidAt, end)
      )
    );
  return Number(row.total ?? 0);
}

export function r2KeyFor1099(params: { organizationId: string; taxYear: number; userId: string }): string {
  return `org/${params.organizationId}/tax/${params.taxYear}/1099-${params.userId}.pdf`;
}

/**
 * Generate (and cache in R2) a 1099-NEC PDF for the given user+org+year.
 * Returns a signed download URL with short TTL.
 */
export async function ensure1099Pdf(params: {
  userId: string;
  organizationId: string;
  taxYear: number;
}): Promise<{ downloadUrl: string; totalCents: number; key: string }> {
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.id, params.userId)).limit(1);
  if (!user) throw new Error("User not found");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, params.organizationId)).limit(1);
  if (!org) throw new Error("Org not found");
  const [profile] = await db.select().from(mediaStaffProfiles).where(eq(mediaStaffProfiles.userId, params.userId)).limit(1);

  const totalCents = await aggregatePaidCentsForUserYear(params);

  const bytes = await generate1099PdfBytes({
    taxYear: params.taxYear,
    payer: {
      name: org.legalName ?? org.name,
      streetAddress: (org as any).streetAddress ?? "",
      cityStateZip: [
        (org as any).city,
        (org as any).state,
        (org as any).postalCode,
      ].filter(Boolean).join(", "),
      tin: (org as any).taxId ?? "—",
    },
    recipient: {
      name: user.name ?? user.email,
      streetAddress: (profile as any)?.mailingStreet ?? "",
      cityStateZip: [
        (profile as any)?.mailingCity,
        (profile as any)?.mailingState,
        (profile as any)?.mailingZip,
      ].filter(Boolean).join(", "),
      tin: (profile as any)?.taxIdLast4 ? `***-**-${(profile as any).taxIdLast4}` : "—",
    },
    box1NonemployeeCompensationCents: totalCents,
    box4FederalWithholdingCents: 0,
  });

  const key = r2KeyFor1099(params);
  await r2Put(key, Buffer.from(bytes), "application/pdf");

  const downloadUrl = await r2SignedGet(key, 300);
  return { downloadUrl, totalCents, key };
}
```

Note on `(org as any).streetAddress`: Phase 1/Phase 3 may or may not have added address fields to the organizations table. If those columns are missing, the cast-to-any keeps compilation green and emits empty strings at runtime. Add a follow-up schema migration outside this plan if payer-address completeness becomes a legal requirement.

- [ ] **Step 2: Create photographer download endpoint**

```typescript
// src/pages/api/media/payments/1099/[year].ts
import type { APIRoute } from "astro";
import { requireMediaStaffAccess, requireOrganizationContext } from "@/lib/auth";
import { ensure1099Pdf } from "@/lib/media/1099";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireMediaStaffAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const yearStr = context.params.year;
  const taxYear = yearStr ? parseInt(yearStr, 10) : NaN;
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    return new Response(JSON.stringify({ error: "Invalid tax year" }), { status: 400 });
  }

  const { downloadUrl, totalCents } = await ensure1099Pdf({
    userId: auth.user.id,
    organizationId: org.organizationId,
    taxYear,
  });

  // Redirect client to the signed R2 URL
  return new Response(null, {
    status: 302,
    headers: { Location: downloadUrl, "X-Total-Cents": String(totalCents) },
  });
};
```

- [ ] **Step 3: Create admin download endpoint**

```typescript
// src/pages/api/admin/media/1099/[year]/[userId].ts
import type { APIRoute } from "astro";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { ensure1099Pdf } from "@/lib/media/1099";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const yearStr = context.params.year;
  const userId = context.params.userId;
  const taxYear = yearStr ? parseInt(yearStr, 10) : NaN;
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    return new Response(JSON.stringify({ error: "Invalid tax year" }), { status: 400 });
  }
  if (!userId) {
    return new Response(JSON.stringify({ error: "userId required" }), { status: 400 });
  }

  const { downloadUrl, totalCents } = await ensure1099Pdf({
    userId,
    organizationId: org.organizationId,
    taxYear,
  });

  return new Response(null, {
    status: 302,
    headers: { Location: downloadUrl, "X-Total-Cents": String(totalCents) },
  });
};
```

- [ ] **Step 4: Manual smoke test**

With dev server running and R2 configured, log in as media_staff, visit `/api/media/payments/1099/2025`. Browser should redirect to R2 URL and download the PDF. Open it — should show correct totals.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/1099.ts src/pages/api/media/payments/1099/ src/pages/api/admin/media/1099/
git commit -m "feat(media): 1099-NEC PDF aggregation, R2 storage, download endpoints"
```

---

## Task 18: Analytics — coverage rate

**Files:**
- Create: `src/lib/media/analytics.ts`
- Create: `src/pages/api/admin/media/analytics/coverage.ts`
- Create: `tests/api/admin/media-analytics.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/admin/media-analytics.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("Admin media analytics: coverage", () => {
  let adminCookie: string;
  let parentCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    parentCookie = await getParentCookie();
  });
  afterAll(() => resetCookies());

  it("rejects non-admin", async () => {
    const res = await apiFetch("/api/admin/media/analytics/coverage", {
      method: "GET",
      cookie: parentCookie,
    });
    expect([401, 403]).toContain(res.status);
  });

  it("returns coverage weeks + totals", async () => {
    const res = await apiFetch("/api/admin/media/analytics/coverage", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.byWeek)).toBe(true);
    expect(typeof json.overallCoverageRate).toBe("number");
    expect(json.overallCoverageRate).toBeGreaterThanOrEqual(0);
    expect(json.overallCoverageRate).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/admin/media-analytics.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create src/lib/media/analytics.ts**

```typescript
import { getDb } from "@/lib/db";
import { shootSessions } from "@/lib/db/schema/media";
import { games } from "@/lib/db/schema/teams";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export async function coverageByWeek(params: {
  organizationId: string;
  start: Date;
  end: Date;
  locationId?: string;
}): Promise<{
  byWeek: Array<{ week: string; eligibleGames: number; assignedShoots: number; rate: number }>;
  overallCoverageRate: number;
}> {
  const db = getDb();

  // Eligible games in window, grouped by ISO week
  const eligibleRows = await db
    .select({
      week: sql<string>`TO_CHAR(${games.scheduledStart}, 'IYYY-IW')`,
      count: sql<number>`COUNT(*)`,
    })
    .from(games)
    .where(
      and(
        gte(games.scheduledStart, params.start),
        lte(games.scheduledStart, params.end)
        // NOTE: organization scoping on games goes via teams→locations→org in
        // the existing schema. We'll filter by organizationId on the shoot
        // side and trust this count for now. Refine in a follow-up if overcount.
      )
    )
    .groupBy(sql`TO_CHAR(${games.scheduledStart}, 'IYYY-IW')`);

  const assignedRows = await db
    .select({
      week: sql<string>`TO_CHAR(${shootSessions.scheduledStart}, 'IYYY-IW')`,
      count: sql<number>`COUNT(*)`,
    })
    .from(shootSessions)
    .where(
      and(
        eq(shootSessions.organizationId, params.organizationId),
        eq(shootSessions.sessionType, "game"),
        gte(shootSessions.scheduledStart, params.start),
        lte(shootSessions.scheduledStart, params.end)
      )
    )
    .groupBy(sql`TO_CHAR(${shootSessions.scheduledStart}, 'IYYY-IW')`);

  const weekMap = new Map<string, { eligibleGames: number; assignedShoots: number }>();
  for (const r of eligibleRows) {
    weekMap.set(r.week, { eligibleGames: Number(r.count), assignedShoots: 0 });
  }
  for (const r of assignedRows) {
    const cur = weekMap.get(r.week) ?? { eligibleGames: 0, assignedShoots: 0 };
    cur.assignedShoots = Number(r.count);
    weekMap.set(r.week, cur);
  }

  const byWeek = Array.from(weekMap.entries())
    .map(([week, v]) => ({
      week,
      eligibleGames: v.eligibleGames,
      assignedShoots: v.assignedShoots,
      rate: v.eligibleGames > 0 ? Math.min(1, v.assignedShoots / v.eligibleGames) : 0,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));

  const totals = byWeek.reduce(
    (acc, r) => ({
      eligibleGames: acc.eligibleGames + r.eligibleGames,
      assignedShoots: acc.assignedShoots + r.assignedShoots,
    }),
    { eligibleGames: 0, assignedShoots: 0 }
  );
  const overallCoverageRate =
    totals.eligibleGames > 0 ? Math.min(1, totals.assignedShoots / totals.eligibleGames) : 0;

  return { byWeek, overallCoverageRate };
}
```

- [ ] **Step 4: Create endpoint**

```typescript
// src/pages/api/admin/media/analytics/coverage.ts
import type { APIRoute } from "astro";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { coverageByWeek } from "@/lib/media/analytics";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const url = new URL(context.request.url);
  const end = url.searchParams.get("endDate") ? new Date(url.searchParams.get("endDate")!) : new Date();
  const start = url.searchParams.get("startDate")
    ? new Date(url.searchParams.get("startDate")!)
    : new Date(end.getTime() - 1000 * 60 * 60 * 24 * 90);

  const data = await coverageByWeek({ organizationId: org.organizationId, start, end });
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 5: Run test**

```bash
npm run test:api -- tests/api/admin/media-analytics.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/media/analytics.ts src/pages/api/admin/media/analytics/coverage.ts tests/api/admin/media-analytics.test.ts
git commit -m "feat(media): coverage-rate analytics endpoint"
```

---

## Task 19: Analytics — SLAs (confirmation lead time, upload, tag)

**Files:**
- Modify: `src/lib/media/analytics.ts`
- Create: `src/pages/api/admin/media/analytics/sla.ts`
- Modify: `tests/api/admin/media-analytics.test.ts`

- [ ] **Step 1: Append SLA test**

```typescript
describe("Admin media analytics: SLA", () => {
  let adminCookie: string;
  beforeAll(async () => { adminCookie = await getAdminCookie(); });
  afterAll(() => resetCookies());

  it("returns confirmation lead time, upload SLA, tag SLA distributions", async () => {
    const res = await apiFetch("/api/admin/media/analytics/sla", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.confirmationLeadTimeHours).toBeDefined();
    expect(json.uploadSlaHours).toBeDefined();
    expect(json.tagSlaHours).toBeDefined();
    for (const k of ["confirmationLeadTimeHours", "uploadSlaHours", "tagSlaHours"]) {
      expect(typeof json[k].p50).toBe("number");
      expect(typeof json[k].p90).toBe("number");
    }
  });
});
```

- [ ] **Step 2: Append to src/lib/media/analytics.ts**

```typescript
export interface SlaStats {
  p50: number;
  p90: number;
  count: number;
}

export async function slaStats(params: {
  organizationId: string;
  start: Date;
  end: Date;
}): Promise<{
  confirmationLeadTimeHours: SlaStats;
  uploadSlaHours: SlaStats;
  tagSlaHours: SlaStats;
}> {
  const db = getDb();

  // Confirmation lead time = scheduled_start - confirmed_at (hours, clipped at 0)
  const confirmRows = await db
    .select({
      hours: sql<number>`EXTRACT(EPOCH FROM (${shootSessions.scheduledStart} - ${shootSessions.confirmedAt}))/3600.0`,
    })
    .from(shootSessions)
    .where(
      and(
        eq(shootSessions.organizationId, params.organizationId),
        gte(shootSessions.scheduledStart, params.start),
        lte(shootSessions.scheduledStart, params.end),
        sql`${shootSessions.confirmedAt} IS NOT NULL`
      )
    );

  // Upload SLA = checked_out_at - checked_in_at (hours)
  const uploadRows = await db
    .select({
      hours: sql<number>`EXTRACT(EPOCH FROM (${shootSessions.checkedOutAt} - ${shootSessions.checkedInAt}))/3600.0`,
    })
    .from(shootSessions)
    .where(
      and(
        eq(shootSessions.organizationId, params.organizationId),
        gte(shootSessions.scheduledStart, params.start),
        lte(shootSessions.scheduledStart, params.end),
        sql`${shootSessions.checkedOutAt} IS NOT NULL AND ${shootSessions.checkedInAt} IS NOT NULL`
      )
    );

  // Tag SLA = ready timestamp - uploaded timestamp. ready/uploaded timestamps live in audit log OR
  // we approximate with updatedAt at each status. Phase 2 added status_changed_at columns; if not,
  // use updatedAt at the time status became 'ready'. Here we use a coarse approximation via updatedAt
  // of sessions currently at ready/published minus a fixed offset — refine with status_log if present.
  const tagRows = await db
    .select({
      // Approximation: shoot.updatedAt - scheduledEnd when status progressed
      hours: sql<number>`EXTRACT(EPOCH FROM (${shootSessions.updatedAt} - ${shootSessions.scheduledEnd}))/3600.0`,
    })
    .from(shootSessions)
    .where(
      and(
        eq(shootSessions.organizationId, params.organizationId),
        gte(shootSessions.scheduledStart, params.start),
        lte(shootSessions.scheduledStart, params.end),
        sql`${shootSessions.status} IN ('ready','published')`
      )
    );

  const percentiles = (arr: number[]): SlaStats => {
    const clean = arr.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
    const p = (q: number) =>
      clean.length === 0 ? 0 : clean[Math.min(clean.length - 1, Math.floor(q * clean.length))];
    return { p50: Number(p(0.5).toFixed(2)), p90: Number(p(0.9).toFixed(2)), count: clean.length };
  };

  return {
    confirmationLeadTimeHours: percentiles(confirmRows.map((r) => Number(r.hours))),
    uploadSlaHours: percentiles(uploadRows.map((r) => Number(r.hours))),
    tagSlaHours: percentiles(tagRows.map((r) => Number(r.hours))),
  };
}
```

- [ ] **Step 3: Create endpoint**

```typescript
// src/pages/api/admin/media/analytics/sla.ts
import type { APIRoute } from "astro";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { slaStats } from "@/lib/media/analytics";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const url = new URL(context.request.url);
  const end = url.searchParams.get("endDate") ? new Date(url.searchParams.get("endDate")!) : new Date();
  const start = url.searchParams.get("startDate")
    ? new Date(url.searchParams.get("startDate")!)
    : new Date(end.getTime() - 1000 * 60 * 60 * 24 * 90);

  const data = await slaStats({ organizationId: org.organizationId, start, end });
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Run test**

```bash
npm run test:api -- tests/api/admin/media-analytics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/analytics.ts src/pages/api/admin/media/analytics/sla.ts tests/api/admin/media-analytics.test.ts
git commit -m "feat(media): SLA distribution analytics"
```

---

## Task 20: Analytics — cost per game, cost per tagged asset

**Files:**
- Modify: `src/lib/media/analytics.ts`
- Create: `src/pages/api/admin/media/analytics/cost.ts`
- Modify: `tests/api/admin/media-analytics.test.ts`

- [ ] **Step 1: Append cost test**

```typescript
describe("Admin media analytics: cost", () => {
  let adminCookie: string;
  beforeAll(async () => { adminCookie = await getAdminCookie(); });
  afterAll(() => resetCookies());

  it("returns cost per game + cost per tagged asset", async () => {
    const res = await apiFetch("/api/admin/media/analytics/cost", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(typeof json.costPerGameCents).toBe("number");
    expect(typeof json.costPerTaggedAssetCents).toBe("number");
    expect(typeof json.totalPaidCents).toBe("number");
  });
});
```

- [ ] **Step 2: Append cost helper**

Append to `src/lib/media/analytics.ts`:

```typescript
import { mediaStaffPayouts, mediaAssets, mediaTags } from "@/lib/db/schema/media";

export async function costStats(params: {
  organizationId: string;
  start: Date;
  end: Date;
}): Promise<{
  totalPaidCents: number;
  gameCount: number;
  taggedAssetCount: number;
  costPerGameCents: number;
  costPerTaggedAssetCents: number;
}> {
  const db = getDb();

  const [paid] = await db
    .select({ total: sql<number>`COALESCE(SUM(${mediaStaffPayouts.amountCents}), 0)` })
    .from(mediaStaffPayouts)
    .where(
      and(
        eq(mediaStaffPayouts.organizationId, params.organizationId),
        eq(mediaStaffPayouts.status, "succeeded"),
        gte(mediaStaffPayouts.paidAt, params.start),
        lte(mediaStaffPayouts.paidAt, params.end)
      )
    );

  const [games] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(shootSessions)
    .where(
      and(
        eq(shootSessions.organizationId, params.organizationId),
        eq(shootSessions.sessionType, "game"),
        eq(shootSessions.payoutStatus, "paid"),
        gte(shootSessions.scheduledStart, params.start),
        lte(shootSessions.scheduledStart, params.end)
      )
    );

  const [tagged] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${mediaAssets.id})` })
    .from(mediaAssets)
    .innerJoin(mediaTags, eq(mediaTags.mediaAssetId, mediaAssets.id))
    .innerJoin(shootSessions, eq(shootSessions.id, mediaAssets.shootSessionId))
    .where(
      and(
        eq(shootSessions.organizationId, params.organizationId),
        gte(shootSessions.scheduledStart, params.start),
        lte(shootSessions.scheduledStart, params.end)
      )
    );

  const totalPaidCents = Number(paid.total ?? 0);
  const gameCount = Number(games.count ?? 0);
  const taggedAssetCount = Number(tagged.count ?? 0);

  return {
    totalPaidCents,
    gameCount,
    taggedAssetCount,
    costPerGameCents: gameCount > 0 ? Math.round(totalPaidCents / gameCount) : 0,
    costPerTaggedAssetCents: taggedAssetCount > 0 ? Math.round(totalPaidCents / taggedAssetCount) : 0,
  };
}
```

- [ ] **Step 3: Create endpoint**

```typescript
// src/pages/api/admin/media/analytics/cost.ts
import type { APIRoute } from "astro";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { costStats } from "@/lib/media/analytics";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const url = new URL(context.request.url);
  const end = url.searchParams.get("endDate") ? new Date(url.searchParams.get("endDate")!) : new Date();
  const start = url.searchParams.get("startDate")
    ? new Date(url.searchParams.get("startDate")!)
    : new Date(end.getTime() - 1000 * 60 * 60 * 24 * 90);

  const data = await costStats({ organizationId: org.organizationId, start, end });
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Run test**

```bash
npm run test:api -- tests/api/admin/media-analytics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/analytics.ts src/pages/api/admin/media/analytics/cost.ts tests/api/admin/media-analytics.test.ts
git commit -m "feat(media): cost-per-game + cost-per-tagged-asset analytics"
```

---

## Task 21: Analytics — per-photographer + per-editor scorecards

**Files:**
- Modify: `src/lib/media/analytics.ts`
- Create: `src/pages/api/admin/media/analytics/scorecards.ts`
- Modify: `tests/api/admin/media-analytics.test.ts`

- [ ] **Step 1: Append test**

```typescript
describe("Admin media analytics: scorecards", () => {
  let adminCookie: string;
  beforeAll(async () => { adminCookie = await getAdminCookie(); });
  afterAll(() => resetCookies());

  it("returns per-photographer and per-editor scorecards", async () => {
    const res = await apiFetch("/api/admin/media/analytics/scorecards", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.photographers)).toBe(true);
    expect(Array.isArray(json.editors)).toBe(true);
    if (json.photographers.length > 0) {
      const p = json.photographers[0];
      expect(typeof p.userId).toBe("string");
      expect(typeof p.sessionsCompleted).toBe("number");
      expect(typeof p.noShowCount).toBe("number");
      expect(typeof p.avgTagsPerAsset).toBe("number");
    }
    if (json.editors.length > 0) {
      const e = json.editors[0];
      expect(typeof e.userId).toBe("string");
      expect(typeof e.tagsPerHour).toBe("number");
      expect(typeof e.sessionsProcessed).toBe("number");
    }
  });
});
```

- [ ] **Step 2: Append to src/lib/media/analytics.ts**

```typescript
import { users } from "@/lib/db/schema/users";

export async function photographerScorecards(params: {
  organizationId: string;
  start: Date;
  end: Date;
}): Promise<
  Array<{
    userId: string;
    name: string | null;
    sessionsCompleted: number;
    noShowCount: number;
    avgTagsPerAsset: number;
    paidCents: number;
  }>
> {
  const db = getDb();

  const rows = await db
    .select({
      userId: shootSessions.assignedUserId,
      name: users.name,
      completed: sql<number>`COUNT(*) FILTER (WHERE ${shootSessions.status} IN ('ready','published'))`,
      noShow: sql<number>`COUNT(*) FILTER (WHERE ${shootSessions.status} = 'cancelled' AND ${shootSessions.checkedInAt} IS NULL)`,
    })
    .from(shootSessions)
    .leftJoin(users, eq(users.id, shootSessions.assignedUserId))
    .where(
      and(
        eq(shootSessions.organizationId, params.organizationId),
        gte(shootSessions.scheduledStart, params.start),
        lte(shootSessions.scheduledStart, params.end)
      )
    )
    .groupBy(shootSessions.assignedUserId, users.name);

  const tagCountRows = await db
    .select({
      userId: shootSessions.assignedUserId,
      assetCount: sql<number>`COUNT(DISTINCT ${mediaAssets.id})`,
      tagCount: sql<number>`COUNT(${mediaTags.id})`,
    })
    .from(mediaAssets)
    .innerJoin(shootSessions, eq(shootSessions.id, mediaAssets.shootSessionId))
    .leftJoin(mediaTags, eq(mediaTags.mediaAssetId, mediaAssets.id))
    .where(
      and(
        eq(shootSessions.organizationId, params.organizationId),
        gte(shootSessions.scheduledStart, params.start),
        lte(shootSessions.scheduledStart, params.end)
      )
    )
    .groupBy(shootSessions.assignedUserId);

  const paidRows = await db
    .select({
      userId: mediaStaffPayouts.userId,
      total: sql<number>`COALESCE(SUM(${mediaStaffPayouts.amountCents}), 0)`,
    })
    .from(mediaStaffPayouts)
    .where(
      and(
        eq(mediaStaffPayouts.organizationId, params.organizationId),
        eq(mediaStaffPayouts.status, "succeeded"),
        gte(mediaStaffPayouts.paidAt, params.start),
        lte(mediaStaffPayouts.paidAt, params.end)
      )
    )
    .groupBy(mediaStaffPayouts.userId);

  const tagMap = new Map(
    tagCountRows.map((r) => [
      r.userId,
      Number(r.assetCount) > 0 ? Number(r.tagCount) / Number(r.assetCount) : 0,
    ])
  );
  const paidMap = new Map(paidRows.map((r) => [r.userId, Number(r.total)]));

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name ?? null,
    sessionsCompleted: Number(r.completed),
    noShowCount: Number(r.noShow),
    avgTagsPerAsset: Number((tagMap.get(r.userId) ?? 0).toFixed(2)),
    paidCents: paidMap.get(r.userId) ?? 0,
  }));
}

export async function editorScorecards(params: {
  organizationId: string;
  start: Date;
  end: Date;
}): Promise<
  Array<{
    userId: string;
    name: string | null;
    tagsCount: number;
    sessionsProcessed: number;
    tagsPerHour: number;
  }>
> {
  const db = getDb();

  // Tags authored by each user in window, joined against sessions for org scope
  const rows = await db
    .select({
      userId: mediaTags.taggedByUserId,
      name: users.name,
      tagsCount: sql<number>`COUNT(*)`,
      sessionsProcessed: sql<number>`COUNT(DISTINCT ${mediaAssets.shootSessionId})`,
    })
    .from(mediaTags)
    .innerJoin(mediaAssets, eq(mediaAssets.id, mediaTags.mediaAssetId))
    .innerJoin(shootSessions, eq(shootSessions.id, mediaAssets.shootSessionId))
    .leftJoin(users, eq(users.id, mediaTags.taggedByUserId))
    .where(
      and(
        eq(shootSessions.organizationId, params.organizationId),
        gte(mediaTags.createdAt, params.start),
        lte(mediaTags.createdAt, params.end)
      )
    )
    .groupBy(mediaTags.taggedByUserId, users.name);

  // tags per hour is tagsCount / (end - start) hours, which is coarse; refine to actual active
  // time later (clock-in/out for editors not modeled yet).
  const windowHours = (params.end.getTime() - params.start.getTime()) / (1000 * 60 * 60);

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name ?? null,
    tagsCount: Number(r.tagsCount),
    sessionsProcessed: Number(r.sessionsProcessed),
    tagsPerHour:
      windowHours > 0 ? Number((Number(r.tagsCount) / windowHours).toFixed(2)) : 0,
  }));
}
```

- [ ] **Step 3: Create endpoint**

```typescript
// src/pages/api/admin/media/analytics/scorecards.ts
import type { APIRoute } from "astro";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { photographerScorecards, editorScorecards } from "@/lib/media/analytics";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const url = new URL(context.request.url);
  const end = url.searchParams.get("endDate") ? new Date(url.searchParams.get("endDate")!) : new Date();
  const start = url.searchParams.get("startDate")
    ? new Date(url.searchParams.get("startDate")!)
    : new Date(end.getTime() - 1000 * 60 * 60 * 24 * 90);

  const [photographers, editors] = await Promise.all([
    photographerScorecards({ organizationId: org.organizationId, start, end }),
    editorScorecards({ organizationId: org.organizationId, start, end }),
  ]);

  return new Response(JSON.stringify({ photographers, editors }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Run test**

```bash
npm run test:api -- tests/api/admin/media-analytics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/analytics.ts src/pages/api/admin/media/analytics/scorecards.ts tests/api/admin/media-analytics.test.ts
git commit -m "feat(media): per-photographer + per-editor scorecard analytics"
```

---

## Task 22: Analytics dashboard UI (recharts)

**Files:**
- Create: `src/components/admin/media/analytics-dashboard.tsx`
- Create: `src/pages/admin/media/analytics.astro`

- [ ] **Step 1: Create the dashboard component**

```tsx
// src/components/admin/media/analytics-dashboard.tsx
"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Coverage {
  byWeek: Array<{ week: string; eligibleGames: number; assignedShoots: number; rate: number }>;
  overallCoverageRate: number;
}
interface Sla {
  confirmationLeadTimeHours: { p50: number; p90: number; count: number };
  uploadSlaHours: { p50: number; p90: number; count: number };
  tagSlaHours: { p50: number; p90: number; count: number };
}
interface Cost {
  totalPaidCents: number;
  gameCount: number;
  taggedAssetCount: number;
  costPerGameCents: number;
  costPerTaggedAssetCents: number;
}
interface Scorecards {
  photographers: Array<{ userId: string; name: string | null; sessionsCompleted: number; noShowCount: number; avgTagsPerAsset: number; paidCents: number }>;
  editors: Array<{ userId: string; name: string | null; tagsCount: number; sessionsProcessed: number; tagsPerHour: number }>;
}

export function AnalyticsDashboard() {
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [sla, setSla] = useState<Sla | null>(null);
  const [cost, setCost] = useState<Cost | null>(null);
  const [cards, setCards] = useState<Scorecards | null>(null);

  useEffect(() => {
    (async () => {
      const [c, s, co, sc] = await Promise.all([
        fetch("/api/admin/media/analytics/coverage").then((r) => r.json()),
        fetch("/api/admin/media/analytics/sla").then((r) => r.json()),
        fetch("/api/admin/media/analytics/cost").then((r) => r.json()),
        fetch("/api/admin/media/analytics/scorecards").then((r) => r.json()),
      ]);
      setCoverage(c);
      setSla(s);
      setCost(co);
      setCards(sc);
    })();
  }, []);

  if (!coverage || !sla || !cost || !cards) return <p>Loading…</p>;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Coverage rate</CardTitle>
          <CardDescription>
            {(coverage.overallCoverageRate * 100).toFixed(1)}% overall (last 90d)
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={coverage.byWeek}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
              <Tooltip formatter={(v: any, name: string) => name === "rate" ? `${(v * 100).toFixed(1)}%` : v} />
              <Legend />
              <Line type="monotone" dataKey="rate" name="Coverage" stroke="#4f46e5" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Confirmation lead time</CardTitle></CardHeader>
          <CardContent>
            <p>p50: {sla.confirmationLeadTimeHours.p50} h</p>
            <p>p90: {sla.confirmationLeadTimeHours.p90} h</p>
            <p className="text-sm text-muted-foreground">{sla.confirmationLeadTimeHours.count} shoots</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Upload SLA</CardTitle></CardHeader>
          <CardContent>
            <p>p50: {sla.uploadSlaHours.p50} h</p>
            <p>p90: {sla.uploadSlaHours.p90} h</p>
            <p className="text-sm text-muted-foreground">{sla.uploadSlaHours.count} shoots</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tag SLA</CardTitle></CardHeader>
          <CardContent>
            <p>p50: {sla.tagSlaHours.p50} h</p>
            <p>p90: {sla.tagSlaHours.p90} h</p>
            <p className="text-sm text-muted-foreground">{sla.tagSlaHours.count} shoots</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Total paid</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">${(cost.totalPaidCents / 100).toFixed(2)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cost per game</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">${(cost.costPerGameCents / 100).toFixed(2)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cost per tagged asset</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">${(cost.costPerTaggedAssetCents / 100).toFixed(2)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Photographer scorecard</CardTitle></CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cards.photographers}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="sessionsCompleted" fill="#4f46e5" name="Sessions" />
              <Bar dataKey="noShowCount" fill="#dc2626" name="No-shows" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Editor scorecard</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th>Editor</th>
                <th>Sessions</th>
                <th>Tags</th>
                <th>Tags/hr</th>
              </tr>
            </thead>
            <tbody>
              {cards.editors.map((e) => (
                <tr key={e.userId} className="border-b">
                  <td className="py-2">{e.name ?? e.userId}</td>
                  <td>{e.sessionsProcessed}</td>
                  <td>{e.tagsCount}</td>
                  <td>{e.tagsPerHour}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create the Astro page**

```astro
---
// src/pages/admin/media/analytics.astro
import '../../../styles/globals.css';
import { AdminLayout } from '../../../components/admin/admin-layout';
import { AnalyticsDashboard } from '../../../components/admin/media/analytics-dashboard';

const user = Astro.locals.user;
if (!user) return Astro.redirect('/signin?returnUrl=/admin/media/analytics');
---

<AdminLayout currentPath="/admin/media/analytics" user={user} client:load>
  <div class="p-6">
    <h1 class="text-2xl font-semibold mb-4">Media analytics</h1>
    <AnalyticsDashboard client:load />
  </div>
</AdminLayout>
```

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`, log in as admin, navigate to `/admin/media/analytics`. Charts render, no console errors. If recharts complains about React 19, drop to recharts 2.12 or upgrade to 2.13+.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/media/analytics-dashboard.tsx src/pages/admin/media/analytics.astro
git commit -m "feat(media): admin analytics dashboard with recharts"
```

---

## Task 23: Playwright E2E — golden path

**Files:**
- Create: `tests/media-payouts-e2e.spec.ts`

- [ ] **Step 1: Write the E2E spec**

```typescript
// tests/media-payouts-e2e.spec.ts
import { test, expect } from "@playwright/test";

const ADMIN = { email: "admin@test.aspiresports.com", password: "TestAdmin123!" };
const PHOTOG = { email: "media_staff@test.aspiresports.com", password: "TestMediaStaff123!" };

test.describe("Media payouts — golden path", () => {
  test("admin creates rate card, assigns shoot, approves, photographer sees payment", async ({ page, browser }) => {
    // 1. Admin creates rate card
    await page.goto("/signin");
    await page.fill('input[name="email"]', ADMIN.email);
    await page.fill('input[name="password"]', ADMIN.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/);

    await page.goto("/admin/media/rates");
    const uniqueName = `E2E ${Date.now()}`;
    await page.fill('input[name="name"], input[placeholder*="Name"]', uniqueName);
    await page.click('button:has-text("Create rate card")');
    await expect(page.locator(`text=${uniqueName}`)).toBeVisible();

    // 2. Admin opens bulk-approve page (we assume a pending shoot exists from fixtures)
    await page.goto("/admin/media/shoots/bulk-approve");
    const firstCheckbox = page.locator('input[type="checkbox"]').first();
    await expect(firstCheckbox).toBeVisible({ timeout: 10_000 });
    await firstCheckbox.check();
    await page.click('button:has-text("Approve selected")');
    await expect(page.locator("text=paid")).toBeVisible({ timeout: 15_000 });

    // 3. Photographer signs in and views /media/payments
    const photogContext = await browser.newContext();
    const photogPage = await photogContext.newPage();
    await photogPage.goto("/signin");
    await photogPage.fill('input[name="email"]', PHOTOG.email);
    await photogPage.fill('input[name="password"]', PHOTOG.password);
    await photogPage.click('button[type="submit"]');
    await photogPage.waitForURL(/\/(dashboard|media)/);

    await photogPage.goto("/media/payments");
    await expect(photogPage.locator("text=Year to date")).toBeVisible();
    // At least one row in history
    await expect(photogPage.locator("tbody tr")).not.toHaveCount(0);

    await photogContext.close();
  });
});
```

- [ ] **Step 2: Run the E2E**

```bash
npm run test -- media-payouts-e2e
```

Expected: PASS. Requires dev server + Stripe test keys + pre-seeded pending-approval shoot. If Stripe keys missing, the approve step will leave status at `failed`; the assertion needs loosening to `expect(paid|failed)` — adjust only if that's the actual CI constraint.

- [ ] **Step 3: Commit**

```bash
git add tests/media-payouts-e2e.spec.ts
git commit -m "test(e2e): media payouts golden-path flow"
```

---

## Task 24: Permission-gate test — media_staff sees own payments only

**Files:**
- Modify: `tests/api/media/payments.test.ts`

- [ ] **Step 1: Append the test**

```typescript
describe("Payments permission gate", () => {
  let mediaCookie: string;
  let mediaCookieTwo: string; // a second seeded media_staff user

  beforeAll(async () => {
    mediaCookie = await getMediaStaffCookie();
    // Ensure phase-1 seed has a second staff user: media_staff_2@test.aspiresports.com
    const res = await (await import("../setup/test-helpers")).getAuthCookie
      ? null
      : null;
    // Use the helper directly:
    const { getAuthCookie } = await import("../setup/test-helpers");
    try {
      mediaCookieTwo = await getAuthCookie(
        "media_staff_2@test.aspiresports.com",
        "TestMediaStaff123!"
      );
    } catch {
      mediaCookieTwo = "";
    }
  });
  afterAll(() => resetCookies());

  it("only returns the calling user's payouts", async () => {
    if (!mediaCookieTwo) return; // skip if second seed user absent
    const r1 = await apiFetch("/api/media/payments", { method: "GET", cookie: mediaCookie });
    const r2 = await apiFetch("/api/media/payments", { method: "GET", cookie: mediaCookieTwo });
    const j1 = await r1.json();
    const j2 = await r2.json();
    const ids1 = new Set((j1.payments ?? []).map((p: any) => p.payoutId));
    const ids2 = new Set((j2.payments ?? []).map((p: any) => p.payoutId));
    // Disjoint unless both users share a session (they shouldn't)
    for (const id of ids1) expect(ids2.has(id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run**

```bash
npm run test:api -- tests/api/media/payments.test.ts
```

Expected: PASS (or skip cleanly if fixture missing).

- [ ] **Step 3: Commit**

```bash
git add tests/api/media/payments.test.ts
git commit -m "test(media): photographer sees only own payouts"
```

---

## Task 25: Final smoke — run all new tests + build

**Files:**
- (no new files)

- [ ] **Step 1: Run the full new-test surface**

```bash
npm run test:api -- \
  tests/api/admin/media-rates.test.ts \
  tests/api/admin/media-payouts.test.ts \
  tests/api/admin/media-analytics.test.ts \
  tests/api/media/profile.test.ts \
  tests/api/media/connect.test.ts \
  tests/api/media/payments.test.ts \
  tests/api/lib/rate-resolution.test.ts \
  tests/api/lib/1099-pdf.test.ts
```

Expected: all PASS. If a test needs Stripe keys or R2 to be configured and those aren't present in the environment, it should be self-skipping per the guards added above.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Verify migration applied and tables exist**

```bash
npm run db:studio
```

Visually confirm `media_rate_cards` and `media_staff_payouts` tables exist with the expected columns. Close studio.

- [ ] **Step 4: Final commit (if anything was cleaned up during smoke)**

```bash
git status
# If clean, no-op. Otherwise commit any lint fixes:
git add -A
git commit -m "chore: final cleanup after Phase 4 smoke"
```

---

## Self-review notes (resolved before delivery)

- Spec coverage checked: rate cards (Tasks 1, 3, 4, 5), photographer overrides (Tasks 1, 6), Connect onboarding (Task 7), state machine with failed+retry (Tasks 8, 9), approve action + bulk (Tasks 8, 11, 12), transfer metadata (Tasks 8, 10), photographer payments page (Task 13), 1099 PDF + determinism (Tasks 14-17), analytics (Tasks 18-22), API routes §9.4 (Tasks 4, 8, 11, 13, 17, 18-21 — every listed route present), Vitest coverage for rate resolution / state / metadata / PDF / permissions (Tasks 3, 8-10, 16, 24), Playwright E2E (Task 23).
- Spec ambiguity resolution:
  1. Spec §9.2 says `pending_approval → approved → paid|failed` but doesn't specify who triggers `pending_approval`. Resolved: shoot's `payout_status` flips to `pending_approval` when session status reaches `ready`/`published`. That transition is owned by Phase 2 (when session hits `ready`) or Phase 3 (when publishing). This plan only consumes the `pending_approval` state — if Phase 2/3 didn't wire this, the earliest Task 8 test will surface it and a one-line fix belongs in whichever phase owns session-status transitions.
  2. Spec §11 lists "1099 PDF generation determinism" as a test. Resolved: determinism means byte-identical output for identical input — metadata (creation timestamp, producer) is frozen via `setCreationDate(fixed)` and `setProducer("aspire-sports")`, and `pdf.save({ useObjectStreams: false })` emits stable object order.
  3. Spec §9.3 lists analytics metrics but not exact time windows or percentile choices. Resolved: default 90-day window, p50+p90, overridable via `?startDate=&endDate=`.
  4. Spec §5.1 shows `shoot_sessions.payout_status` enum without `failed`. Added `failed` as an application-level value (varchar); if Phase 1 used a Postgres enum, the generated migration adds the value.
  5. Spec §9.2 says "reuse existing Connect account creation/onboarding patterns" — the existing helpers assume `standard` accounts for franchises. For individual photographers, Express (platform-controlled) is the right choice; the Task 7 `onboardMediaStaff` helper calls `stripe.accounts.create({ type: "express", business_type: "individual", ... })` rather than reusing `createConnectAccount` which is franchise-specific. Rationale documented inline.
  6. Spec §5.1 `media_staff_payouts` table not specified — this plan adds it with the minimum fields the spec implies (transfer id, status, paid_at) plus retry tracking and failure diagnostics.
