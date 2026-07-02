# Post-Event Feedback (NPS + Review Funnel & Referee Ratings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified post-event feedback engine that sends event-anchored NPS surveys (with a Google-review funnel for promoters and staff alerts for detractors) and post-game referee ratings, per the approved spec `docs/superpowers/specs/2026-07-02-post-event-feedback-design.md`.

**Architecture:** One `feedback_requests` table is the spine (polymorphic `kind` + `targetId`, hashed single-use token); `nps_responses` and `referee_ratings` hang off it. An hourly cron (`Netlify scheduled function → /api/cron/dispatch-feedback-requests`) scans for newly-eligible events, applies frequency caps, and sends tokenized links via the existing `sendTransactionalEmail` path. A public SSR page `/feedback/[token]` renders the right form by kind. Admin dashboards live under `/admin/reports/`.

**Tech Stack:** Astro 5 (SSR) + React 19, Drizzle ORM (Postgres), Resend via `src/lib/email/send.ts`, Netlify scheduled functions, Vitest (`tests/unit`, `tests/api`), Playwright (`tests/e2e`).

## Global Constraints

- Feature flags `enableNpsSurveys` / `enableRefereeRatings` default **off**; every dispatch path checks them.
- New migration SQL must be idempotent (`DO $$ BEGIN CREATE TYPE … EXCEPTION WHEN duplicate_object THEN null; END $$;`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) — see migrations `0023`/`0024` for the pattern.
- Schema changes go through `npm run db:generate` → commit the migration. Never `db:push` against remote DBs.
- Every admin API endpoint validates tenant ownership (`requireSuperAdminAccess` or `requireAdminAccess` + `requireOrganizationContext`; all queries pinned to `orgContext.organizationId`).
- Any `findFirst` / `.limit(1)` MUST have an explicit `orderBy` (shared CI database has many rows).
- Rater identity must never be joined to a referee rating in any API response.
- Feedback tokens: 32 bytes base64url, only the SHA-256 hex hash is stored (`magic_links` pattern). Never log plaintext tokens.
- Expiry: NPS requests 14 days, referee requests 7 days. NPS cooldown: one per `kind` per recipient per 90 days. Referee cap: max one referee-rating email per recipient per rolling 24h.
- Emails always send + log via `sendTransactionalEmail` (writes `email_logs`); SMS is only ever an additive nudge.
- UI: use `ErrorBanner`, `EmptyState`, `LoadingSkeleton` from `src/components/ui/`; toasts via sonner.
- E2E-driven pages: top-level `client:load` component calls `useHydrationBeacon()`; specs call `waitForHydration(page)` before interacting. Full Playwright runs post-merge only — run affected specs locally before merging.
- Cron endpoints: guard with `x-cron-secret` = `CRON_SECRET`, refuse in prod when unset (copy `src/pages/api/cron/expire-pending-rentals.ts`).
- All timestamps UTC, `timestamp(..., { withTimezone: true })` for new tables.
- Commit after every task; run `npx tsc --noEmit` before each commit (baseline is zero errors).

---

## Phase 1 — Engine + NPS end-to-end

### Task 1: Schema module + migration

**Files:**
- Create: `src/lib/db/schema/feedback.ts`
- Modify: `src/lib/db/schema/index.ts` (append export)
- Create (generated): `src/lib/db/migrations/00XX_*.sql` via `npm run db:generate`

**Interfaces:**
- Produces: `feedbackRequests`, `npsResponses`, `refereeRatings` tables; `feedbackRequestKindEnum`, `feedbackRequestStatusEnum`; types `FeedbackRequest`, `NewFeedbackRequest`, `NpsResponse`, `RefereeRating`, `FeedbackRequestKind`, `FeedbackRequestStatus`, `FeedbackRequestMetadata`. All later tasks import these from `@/lib/db/schema`.

- [ ] **Step 1: Write the schema module**

```typescript
// src/lib/db/schema/feedback.ts
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { games, gameOfficials } from "./teams";

// === enums ===

export const feedbackRequestKindEnum = pgEnum("feedback_request_kind", [
  "nps_drop_in",
  "nps_field_rental",
  "nps_season",
  "referee_rating",
]);

export const feedbackRequestStatusEnum = pgEnum("feedback_request_status", [
  "pending",
  "sent",
  "responded",
  "expired",
]);

/**
 * Context captured at dispatch time so the public page, emails, and alerts
 * never need polymorphic joins back to the source booking/game.
 */
export interface FeedbackRequestMetadata {
  /** Human label for the experience, e.g. "Pickup Soccer — Mon, Jun 29". */
  eventLabel: string;
  /** referee_rating only — derived from the game's program type. */
  gameType?: "league" | "tournament";
  /** referee_rating only — display name shown on the rating form. */
  refereeName?: string;
}

// === tables ===

/**
 * The spine of the post-event feedback engine. One row = one ask sent to one
 * person about one event. `targetId` is polymorphic by kind (same pattern as
 * self_service_tokens): dropInBookings.id | fieldRentals.id | registrations.id
 * | games.id. Token follows the magic_links hashing pattern — only the SHA-256
 * hash is stored; plaintext exists once at dispatch time inside the outbound
 * message.
 */
export const feedbackRequests = pgTable(
  "feedback_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    brand: varchar("brand", { length: 20 }).default("aspire").notNull(),
    kind: feedbackRequestKindEnum("kind").notNull(),
    targetId: uuid("target_id").notNull(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // referee_rating only: which official is being rated.
    gameOfficialId: uuid("game_official_id").references(() => gameOfficials.id, {
      onDelete: "cascade",
    }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    status: feedbackRequestStatusEnum("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<FeedbackRequestMetadata>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Dedupe: the cron can never double-create for the same event/recipient.
    // Two partial uniques because gameOfficialId is null for all NPS kinds.
    uniqueIndex("feedback_requests_dedupe_nps_uniq")
      .on(table.kind, table.targetId, table.recipientUserId)
      .where(sql`game_official_id IS NULL`),
    uniqueIndex("feedback_requests_dedupe_ref_uniq")
      .on(table.kind, table.targetId, table.recipientUserId, table.gameOfficialId)
      .where(sql`game_official_id IS NOT NULL`),
    // Cooldown / daily-cap lookups.
    index("feedback_requests_recipient_kind_sent_idx").on(
      table.recipientUserId,
      table.kind,
      table.sentAt,
    ),
    // Dashboard queries.
    index("feedback_requests_org_kind_created_idx").on(
      table.organizationId,
      table.kind,
      table.createdAt,
    ),
    // Pending-resend sweep + expiry.
    index("feedback_requests_status_expires_idx").on(table.status, table.expiresAt),
  ],
);

export const npsResponses = pgTable(
  "nps_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .unique()
      .references(() => feedbackRequests.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    comment: text("comment"),
    reviewLinkClickedAt: timestamp("review_link_clicked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("nps_responses_score_range", sql`${table.score} >= 0 AND ${table.score} <= 10`),
  ],
);

/**
 * Referee ratings. gameId + refereeUserId are denormalized from the request's
 * targetId / gameOfficial so the admin dashboard aggregates without joining
 * through feedback_requests. The rater's identity lives ONLY on the request
 * row — no read surface may join it back to a rating.
 */
export const refereeRatings = pgTable(
  "referee_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .unique()
      .references(() => feedbackRequests.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    refereeUserId: uuid("referee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    overall: integer("overall").notNull(),
    gameControl: integer("game_control").notNull(),
    communication: integer("communication").notNull(),
    fairness: integer("fairness").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("referee_ratings_referee_created_idx").on(
      table.refereeUserId,
      table.createdAt,
    ),
    index("referee_ratings_game_idx").on(table.gameId),
    check(
      "referee_ratings_dimension_range",
      sql`${table.overall} BETWEEN 1 AND 5 AND ${table.gameControl} BETWEEN 1 AND 5 AND ${table.communication} BETWEEN 1 AND 5 AND ${table.fairness} BETWEEN 1 AND 5`,
    ),
  ],
);

// Type exports
export type FeedbackRequest = typeof feedbackRequests.$inferSelect;
export type NewFeedbackRequest = typeof feedbackRequests.$inferInsert;
export type NpsResponse = typeof npsResponses.$inferSelect;
export type NewNpsResponse = typeof npsResponses.$inferInsert;
export type RefereeRating = typeof refereeRatings.$inferSelect;
export type NewRefereeRating = typeof refereeRatings.$inferInsert;
export type FeedbackRequestKind = (typeof feedbackRequestKindEnum.enumValues)[number];
export type FeedbackRequestStatus =
  (typeof feedbackRequestStatusEnum.enumValues)[number];
```

- [ ] **Step 2: Export from the schema index**

Append to `src/lib/db/schema/index.ts` (after the self-service-tokens export at the bottom):

```typescript
// Post-event feedback engine (NPS surveys + referee ratings)
export * from "./feedback";
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: a new file `src/lib/db/migrations/00XX_<name>.sql` creating `feedback_request_kind`, `feedback_request_status`, `feedback_requests`, `nps_responses`, `referee_ratings` plus the indexes/checks above.

- [ ] **Step 5: Make the migration idempotent**

Edit the generated SQL: wrap each `CREATE TYPE` in the duplicate-object guard and add `IF NOT EXISTS` to `CREATE TABLE` / `CREATE INDEX` statements, mirroring `src/lib/db/migrations/0024_*.sql`:

```sql
DO $$ BEGIN
 CREATE TYPE "public"."feedback_request_kind" AS ENUM('nps_drop_in', 'nps_field_rental', 'nps_season', 'referee_rating');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
```

(Repeat for `feedback_request_status`; `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / wrap `ALTER TABLE ... ADD CONSTRAINT` FK statements in `DO $$ ... duplicate_object` guards, exactly as 0024 does.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema/feedback.ts src/lib/db/schema/index.ts src/lib/db/migrations/
git commit -m "feat(feedback): schema for feedback_requests, nps_responses, referee_ratings"
```

---

### Task 2: Org settings + feature-flag plumbing

**Files:**
- Modify: `src/lib/db/schema/organizations.ts` (two interfaces; jsonb — no migration)
- Modify: `src/pages/api/admin/organizations/settings.ts` (accept the new keys)
- Test: `tests/api/admin/feedback-settings.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `OrganizationFeatures.enableNpsSurveys?: boolean`, `OrganizationFeatures.enableRefereeRatings?: boolean`; `OrganizationSettings.feedback?: { googleReviewUrl?: { aspire?: string; soccerone?: string }; detractorAlertEmail?: string }`. PATCH `/api/admin/organizations/settings` accepts `{ settings: { feedback: ... }, features: { enableNpsSurveys?, enableRefereeRatings? } }`.

- [ ] **Step 1: Extend the interfaces**

In `src/lib/db/schema/organizations.ts`, add to `OrganizationFeatures` (after `enableCustomDomain?: boolean;`):

```typescript
  enableNpsSurveys?: boolean;
  enableRefereeRatings?: boolean;
```

Add to `OrganizationSettings` (after `siteAnnouncement?: OrganizationSiteAnnouncement;`):

```typescript
  /** Post-event feedback engine (NPS surveys + review funnel). */
  feedback?: {
    /** Per-brand Google review destinations for promoters (9-10 scores). */
    googleReviewUrl?: {
      aspire?: string;
      soccerone?: string;
    };
    /** Detractor (0-6) alert recipient; falls back to contact.supportEmail. */
    detractorAlertEmail?: string;
  };
```

- [ ] **Step 2: Write the failing API test**

```typescript
// tests/api/admin/feedback-settings.test.ts
import { describe, it, expect } from "vitest";
import { signInAsAdmin } from "../../utils/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("PATCH /api/admin/organizations/settings — feedback block", () => {
  it("round-trips feedback settings and feature flags", async () => {
    const cookie = await signInAsAdmin(BASE);

    const patch = await fetch(`${BASE}/api/admin/organizations/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        settings: {
          feedback: {
            googleReviewUrl: { aspire: "https://g.page/r/test-aspire/review" },
            detractorAlertEmail: "owner@test.aspiresports.com",
          },
        },
        features: { enableNpsSurveys: true, enableRefereeRatings: true },
      }),
    });
    expect(patch.status).toBe(200);

    const get = await fetch(`${BASE}/api/admin/organizations/settings`, {
      headers: { cookie },
    });
    const json = await get.json();
    expect(json.settings.feedback.googleReviewUrl.aspire).toBe(
      "https://g.page/r/test-aspire/review",
    );
    expect(json.features.enableNpsSurveys).toBe(true);
  });

  it("rejects a malformed review URL", async () => {
    const cookie = await signInAsAdmin(BASE);
    const res = await fetch(`${BASE}/api/admin/organizations/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        settings: { feedback: { googleReviewUrl: { aspire: "not-a-url" } } },
      }),
    });
    expect(res.status).toBe(400);
  });
});
```

Note: check `tests/utils/test-helpers.ts` for the existing admin sign-in helper name — if it's not `signInAsAdmin(BASE)`, use the helper the other `tests/api/admin/*.test.ts` files use (they sign in as `admin@test.aspiresports.com` / `TestAdmin123!` and return a cookie header).

- [ ] **Step 3: Run test to verify it fails**

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/feedback-settings.test.ts` (dev server running)
Expected: FAIL — PATCH returns 400 (schema rejects unknown `feedback` key) and GET has no `features` in the response.

- [ ] **Step 4: Extend the settings endpoint**

In `src/pages/api/admin/organizations/settings.ts`:

```typescript
const feedbackSettingsSchema = z.object({
  googleReviewUrl: z
    .object({
      aspire: z.string().url().optional(),
      soccerone: z.string().url().optional(),
    })
    .optional(),
  detractorAlertEmail: z.string().email().optional(),
});

const featuresPatchSchema = z.object({
  enableNpsSurveys: z.boolean().optional(),
  enableRefereeRatings: z.boolean().optional(),
});
```

Add `feedback: feedbackSettingsSchema.nullable().optional(),` to `settingsPatchSchema`, and change `bodySchema` to:

```typescript
const bodySchema = z.object({
  settings: settingsPatchSchema.optional(),
  features: featuresPatchSchema.optional(),
});
```

In the PATCH handler, after the existing settings merge, merge features the same way (read current `organizations.features`, shallow-merge the validated patch, write back in the same `update`). In the GET handler, also select and return `features: organizations.features` alongside `settings`.

- [ ] **Step 5: Run test to verify it passes**

Run: same command as Step 3.
Expected: PASS (2 tests).

- [ ] **Step 6: Type check and commit**

```bash
npx tsc --noEmit
git add src/lib/db/schema/organizations.ts src/pages/api/admin/organizations/settings.ts tests/api/admin/feedback-settings.test.ts
git commit -m "feat(feedback): org feedback settings + feature flags"
```

---

### Task 3: Feedback core lib (tokens, constants, category)

**Files:**
- Create: `src/lib/feedback/constants.ts`
- Create: `src/lib/feedback/tokens.ts`
- Test: `tests/unit/feedback-core.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - `constants.ts`: `NPS_EXPIRY_DAYS = 14`, `REFEREE_EXPIRY_DAYS = 7`, `NPS_COOLDOWN_DAYS = 90`, `REFEREE_DAILY_CAP_HOURS = 24`, `POST_EVENT_DELAY_HOURS = 2`, `DISPATCH_LOOKBACK_DAYS = 7`, `SEASON_LOOKBACK_DAYS = 14`, `npsCategory(score: number): "promoter" | "passive" | "detractor"`
  - `tokens.ts`: `generateFeedbackToken(): string`, `hashFeedbackToken(plaintext: string): string`, `buildFeedbackUrl(token: string, origin: string): string`

- [ ] **Step 1: Write the failing unit tests**

```typescript
// tests/unit/feedback-core.test.ts
import { describe, it, expect } from "vitest";
import { npsCategory } from "@/lib/feedback/constants";
import {
  generateFeedbackToken,
  hashFeedbackToken,
  buildFeedbackUrl,
} from "@/lib/feedback/tokens";

describe("npsCategory", () => {
  it("classifies the standard NPS bands", () => {
    expect(npsCategory(10)).toBe("promoter");
    expect(npsCategory(9)).toBe("promoter");
    expect(npsCategory(8)).toBe("passive");
    expect(npsCategory(7)).toBe("passive");
    expect(npsCategory(6)).toBe("detractor");
    expect(npsCategory(0)).toBe("detractor");
  });
});

describe("feedback tokens", () => {
  it("generates unique high-entropy tokens", () => {
    const a = generateFeedbackToken();
    const b = generateFeedbackToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes deterministically to sha256 hex", () => {
    const t = generateFeedbackToken();
    expect(hashFeedbackToken(t)).toBe(hashFeedbackToken(t));
    expect(hashFeedbackToken(t)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashFeedbackToken(t)).not.toBe(hashFeedbackToken(t + "x"));
  });

  it("builds the public URL", () => {
    expect(buildFeedbackUrl("abc123", "https://aspiresportsohio.com")).toBe(
      "https://aspiresportsohio.com/feedback/abc123",
    );
    expect(buildFeedbackUrl("abc123", "https://aspiresportsohio.com/")).toBe(
      "https://aspiresportsohio.com/feedback/abc123",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/feedback-core.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement**

```typescript
// src/lib/feedback/constants.ts

/** Days a NPS survey link stays usable. */
export const NPS_EXPIRY_DAYS = 14;
/** Days a referee-rating link stays usable (the moment fades fast). */
export const REFEREE_EXPIRY_DAYS = 7;
/** One NPS survey per kind per recipient per this many days. */
export const NPS_COOLDOWN_DAYS = 90;
/** Max one referee-rating email per recipient per rolling window. */
export const REFEREE_DAILY_CAP_HOURS = 24;
/** How long after an event ends before we ask about it. */
export const POST_EVENT_DELAY_HOURS = 2;
/** Dispatch only considers events that ended within this window (no ancient backfill). */
export const DISPATCH_LOOKBACK_DAYS = 7;
/** Seasons get a wider lookback — endDate is a date, and the cron may lag. */
export const SEASON_LOOKBACK_DAYS = 14;

export type NpsCategory = "promoter" | "passive" | "detractor";

/** Standard NPS banding: 9-10 promoter, 7-8 passive, 0-6 detractor. */
export function npsCategory(score: number): NpsCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}
```

```typescript
// src/lib/feedback/tokens.ts
import crypto from "node:crypto";

/**
 * Feedback link tokens follow the magic_links pattern: 32 bytes of entropy,
 * base64url plaintext delivered exactly once, SHA-256 hex hash persisted.
 * NEVER log the plaintext.
 */
export function generateFeedbackToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashFeedbackToken(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

export function buildFeedbackUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/feedback/${token}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/feedback-core.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/feedback/ tests/unit/feedback-core.test.ts
git commit -m "feat(feedback): core lib — tokens, constants, NPS banding"
```

---

### Task 4: Email templates + senders (NPS survey, detractor alert)

**Files:**
- Create: `src/lib/email/templates/feedback-nps.tsx`
- Create: `src/lib/email/templates/feedback-detractor-alert.tsx`
- Modify: `src/lib/email/send.ts` (two new exported senders, appended after `sendDisputeAlertEmail`)
- Test: `tests/unit/feedback-emails.test.ts`

**Interfaces:**
- Consumes: `sendTransactionalEmail` (private in send.ts — new senders live in the same file), `renderEmail`, `fromForBrand`, `EmailLayout` components, `BrandId`.
- Produces:
  - `sendNpsSurveyEmail(params: { to: string; userId: string; organizationId: string; brand: BrandId; recipientName: string; eventLabel: string; surveyUrl: string; smsOptIn?: boolean })`
  - `sendDetractorAlertEmail(params: { to: string; brand: BrandId; score: number; comment: string | null; eventLabel: string; kind: string })`

- [ ] **Step 1: Write the failing render tests**

```typescript
// tests/unit/feedback-emails.test.ts
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { FeedbackNpsEmail } from "@/lib/email/templates/feedback-nps";
import { FeedbackDetractorAlertEmail } from "@/lib/email/templates/feedback-detractor-alert";

describe("feedback email templates", () => {
  it("renders the NPS survey email with the tokenized link", async () => {
    const { html, text } = await renderEmail(
      FeedbackNpsEmail({
        recipientName: "Jordan",
        eventLabel: "Pickup Soccer — Mon, Jun 29",
        surveyUrl: "https://example.com/feedback/tok123",
        brand: "aspire",
      }),
    );
    expect(html).toContain("https://example.com/feedback/tok123");
    expect(html).toContain("Pickup Soccer");
    expect(text).toContain("https://example.com/feedback/tok123");
  });

  it("renders the detractor alert with score and comment", async () => {
    const { html } = await renderEmail(
      FeedbackDetractorAlertEmail({
        score: 3,
        comment: "Fields were muddy",
        eventLabel: "Pickup Soccer — Mon, Jun 29",
        kind: "nps_drop_in",
        brand: "aspire",
      }),
    );
    expect(html).toContain("3");
    expect(html).toContain("Fields were muddy");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/feedback-emails.test.ts`
Expected: FAIL — templates don't exist.

- [ ] **Step 3: Write the NPS survey template**

```tsx
// src/lib/email/templates/feedback-nps.tsx
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import type { BrandId } from "@/lib/branding/themes";

interface FeedbackNpsEmailProps {
  recipientName: string;
  /** e.g. "Pickup Soccer — Mon, Jun 29" or "Fall 2026 U10 Soccer season". */
  eventLabel: string;
  /** Absolute tokenized URL to /feedback/[token]. */
  surveyUrl: string;
  brand?: BrandId;
}

/**
 * Post-event NPS ask. Deliberately a single CTA — no embedded 0-10 score
 * links, because mail scanners and Apple link prefetch auto-click them and
 * fabricate responses. The score tap happens on the page.
 */
export function FeedbackNpsEmail({
  recipientName,
  eventLabel,
  surveyUrl,
  brand,
}: FeedbackNpsEmailProps) {
  return (
    <EmailLayout preview={`How was ${eventLabel}?`} brand={brand}>
      <Content>
        <H1>How was it?</H1>
        <P>Hi {recipientName},</P>
        <P>
          Thanks for being part of <strong>{eventLabel}</strong>. We&apos;d love
          to know how it went — it takes about 20 seconds.
        </P>
        <Button href={surveyUrl}>How was it? →</Button>
        <PMuted>
          Your answer goes straight to the people who run the program.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Write the detractor alert template**

```tsx
// src/lib/email/templates/feedback-detractor-alert.tsx
import {
  Content,
  Detail,
  DetailPanel,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import { StatusBanner } from "@/lib/email/components/status-banner";
import type { BrandId } from "@/lib/branding/themes";

interface FeedbackDetractorAlertEmailProps {
  score: number;
  comment: string | null;
  eventLabel: string;
  /** feedback_requests.kind, e.g. "nps_drop_in". */
  kind: string;
  brand?: BrandId;
}

/**
 * Internal staff alert fired the moment a detractor (0-6) score lands, so
 * the relationship can be recovered while it's fresh. The rater is NOT named
 * — staff follow up through the dashboard context, not by confronting the
 * customer with their score.
 */
export function FeedbackDetractorAlertEmail({
  score,
  comment,
  eventLabel,
  kind,
  brand,
}: FeedbackDetractorAlertEmailProps) {
  return (
    <EmailLayout preview={`Low NPS score (${score}/10) — ${eventLabel}`} brand={brand}>
      <StatusBanner mood="warning">Detractor alert</StatusBanner>
      <Content>
        <H1>
          Someone rated us {score}/10
        </H1>
        <DetailPanel>
          <Detail label="Experience">{eventLabel}</Detail>
          <Detail label="Survey type">{kind}</Detail>
          <Detail label="Score">{`${score} / 10`}</Detail>
          <Detail label="Comment">{comment ?? "No comment left (yet)"}</Detail>
        </DetailPanel>
        <P>
          Full response context is in the admin dashboard under Reports → NPS.
        </P>
        <PMuted>
          Sent automatically when a survey score of 6 or below is submitted.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}
```

Note: `StatusBanner` mood values — check `src/lib/email/components/status-banner.tsx` for the exact union (`"success"` exists; if `"warning"` isn't a member, use the closest negative mood it offers).

- [ ] **Step 5: Run render tests to verify they pass**

Run: `npx vitest run tests/unit/feedback-emails.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Add the senders to send.ts**

Append to `src/lib/email/send.ts` (imports at top: `FeedbackNpsEmail`, `FeedbackDetractorAlertEmail` from their templates):

```typescript
export interface SendNpsSurveyEmailParams {
  to: string;
  userId: string;
  organizationId: string;
  brand: BrandId;
  recipientName: string;
  eventLabel: string;
  surveyUrl: string;
  /** When true, also fire the SMS nudge (org has SMS + recipient opted in). */
  smsOptIn?: boolean;
}

export async function sendNpsSurveyEmail(params: SendNpsSurveyEmailParams) {
  const { html, text } = await renderEmail(
    FeedbackNpsEmail({
      recipientName: params.recipientName,
      eventLabel: params.eventLabel,
      surveyUrl: params.surveyUrl,
      brand: params.brand,
    }),
  );

  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "feedback_nps_survey",
    to: params.to,
    subject: `How was ${params.eventLabel}?`,
    html,
    text,
    from: fromForBrand(params.brand),
    smsNudge: params.smsOptIn
      ? {
          organizationId: params.organizationId,
          body: `How was ${clip(params.eventLabel, 60)}? 20-second survey: ${params.surveyUrl}`,
        }
      : undefined,
  });
}

export interface SendDetractorAlertEmailParams {
  to: string;
  brand: BrandId;
  score: number;
  comment: string | null;
  eventLabel: string;
  kind: string;
}

export async function sendDetractorAlertEmail(params: SendDetractorAlertEmailParams) {
  const { html, text } = await renderEmail(
    FeedbackDetractorAlertEmail({
      score: params.score,
      comment: params.comment,
      eventLabel: params.eventLabel,
      kind: params.kind,
      brand: params.brand,
    }),
  );

  return sendTransactionalEmail({
    emailType: "feedback_detractor_alert",
    to: params.to,
    subject: `Low NPS score (${params.score}/10) — ${params.eventLabel}`,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}
```

Note: the existing `sendSmsNudge` gateway call already no-ops when the recipient has no verified/opted-in phone, so `smsOptIn` can simply be "org has `features.enableSMS`" — the gateway enforces per-user opt-in.

- [ ] **Step 7: Type check and commit**

```bash
npx tsc --noEmit
git add src/lib/email/templates/feedback-nps.tsx src/lib/email/templates/feedback-detractor-alert.tsx src/lib/email/send.ts tests/unit/feedback-emails.test.ts
git commit -m "feat(feedback): NPS survey + detractor alert emails"
```

---

### Task 5: Dispatch lib + cron endpoint + Netlify schedule (NPS scans)

**Files:**
- Create: `src/lib/feedback/dispatch.ts`
- Create: `src/pages/api/cron/dispatch-feedback-requests.ts`
- Create: `netlify/functions/scheduled-dispatch-feedback-requests.ts`
- Test: `tests/api/cron/dispatch-feedback-requests.test.ts`

**Interfaces:**
- Consumes: Task 1 tables, Task 3 constants/tokens, Task 4 `sendNpsSurveyEmail`, `originForBrand` from `@/lib/organization/soccerone-routing`.
- Produces: `dispatchFeedbackRequests(now?: Date): Promise<DispatchResult>` with `DispatchResult = { created: number; sent: number; skippedCooldown: number; errors: number }`. Task 12 (Phase 2) adds the referee scan inside this same module.

- [ ] **Step 1: Write the failing API test**

```typescript
// tests/api/cron/dispatch-feedback-requests.test.ts
import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  organizations,
  users,
  feedbackRequests,
  dropInSessions,
  dropInBookings,
  venues,
} from "@/lib/db/schema";

const ENDPOINT = "/api/cron/dispatch-feedback-requests";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "devsecret";

function runCron(secret = CRON_SECRET) {
  return fetch(`${BASE}${ENDPOINT}`, {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
}

/** Org with NPS enabled + a user + a completed drop-in session with one confirmed booking. */
async function seedCompletedDropIn() {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Feedback Org ${suffix}`,
      slug: `fb-org-${suffix}`,
      organizationType: "headquarters",
      features: { enableNpsSurveys: true },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email: `fb-test-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Feedback",
      lastName: "Tester",
    })
    .returning();

  const [venue] = await db
    .insert(venues)
    .values({
      organizationId: org.id,
      name: `Venue ${suffix}`,
    })
    .returning();

  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const [session] = await db
    .insert(dropInSessions)
    .values({
      organizationId: org.id,
      venueId: venue.id,
      kind: "pickup",
      sportOrClassLabel: "Soccer",
      startsAt: new Date(threeHoursAgo.getTime() - 60 * 60 * 1000),
      endsAt: threeHoursAgo,
      capacity: 20,
      status: "completed",
    })
    .returning();

  const [booking] = await db
    .insert(dropInBookings)
    .values({
      sessionId: session.id,
      userId: user.id,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "card_online",
      brand: "aspire",
    })
    .returning();

  return { org, user, session, booking };
}

describe("POST /api/cron/dispatch-feedback-requests", () => {
  it("rejects a missing/bad cron secret", async () => {
    const res = await runCron("wrong-secret");
    expect(res.status).toBe(401);
  });

  it("creates + sends one NPS request for a completed drop-in booking, idempotently", async () => {
    const { user, booking } = await seedCompletedDropIn();

    const first = await runCron();
    expect(first.status).toBe(200);

    const db = getDb();
    const rows = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "nps_drop_in"),
          eq(feedbackRequests.targetId, booking.id),
          eq(feedbackRequests.recipientUserId, user.id),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].metadata?.eventLabel).toContain("Soccer");

    // Second run must not create a duplicate.
    await runCron();
    const again = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "nps_drop_in"),
          eq(feedbackRequests.targetId, booking.id),
        ),
      );
    expect(again.length).toBe(1);
  });

  it("respects the 90-day cooldown per kind", async () => {
    const { org, user } = await seedCompletedDropIn();
    const db = getDb();

    // Pretend this user already got a drop-in NPS ask 10 days ago.
    await db.insert(feedbackRequests).values({
      organizationId: org.id,
      brand: "aspire",
      kind: "nps_drop_in",
      targetId: crypto.randomUUID(),
      recipientUserId: user.id,
      tokenHash: `cooldown-${Math.random().toString(36).slice(2)}`,
      status: "sent",
      sentAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
      metadata: { eventLabel: "Earlier session" },
    });

    await runCron();

    const rows = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.recipientUserId, user.id),
          eq(feedbackRequests.kind, "nps_drop_in"),
        ),
      );
    // Only the pre-seeded row — the new booking was skipped by cooldown.
    expect(rows.length).toBe(1);
  });

  it("does nothing for orgs without enableNpsSurveys", async () => {
    const { org, user } = await seedCompletedDropIn();
    const db = getDb();
    await db
      .update(organizations)
      .set({ features: { enableNpsSurveys: false } })
      .where(eq(organizations.id, org.id));

    await runCron();

    const rows = await db
      .select()
      .from(feedbackRequests)
      .where(eq(feedbackRequests.recipientUserId, user.id));
    expect(rows.length).toBe(0);
  });
});
```

Note: `venues` requires whatever NOT NULL columns its schema defines — mirror the venue insert used in `tests/api/` fixtures if `name` alone is insufficient (check `src/lib/db/schema/teams.ts:57`).

- [ ] **Step 2: Run test to verify it fails**

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/cron/dispatch-feedback-requests.test.ts` (dev server running with the same `CRON_SECRET`)
Expected: FAIL — 404, endpoint doesn't exist.

- [ ] **Step 3: Implement the dispatch lib**

```typescript
// src/lib/feedback/dispatch.ts
import { and, eq, gte, lte, lt, isNull, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  feedbackRequests,
  organizations,
  users,
  dropInSessions,
  dropInBookings,
  fieldRentals,
  registrations,
  seasons,
  programs,
  locations,
  type NewFeedbackRequest,
  type FeedbackRequestKind,
  type FeedbackRequestMetadata,
  type OrganizationFeatures,
} from "@/lib/db/schema";
import {
  NPS_EXPIRY_DAYS,
  NPS_COOLDOWN_DAYS,
  POST_EVENT_DELAY_HOURS,
  DISPATCH_LOOKBACK_DAYS,
  SEASON_LOOKBACK_DAYS,
} from "./constants";
import { generateFeedbackToken, hashFeedbackToken, buildFeedbackUrl } from "./tokens";
import { sendNpsSurveyEmail } from "@/lib/email/send";
import { originForBrand } from "@/lib/organization/soccerone-routing";
import type { BrandId } from "@/lib/branding/themes";

export interface DispatchResult {
  created: number;
  sent: number;
  skippedCooldown: number;
  errors: number;
}

interface Candidate {
  organizationId: string;
  brand: string;
  kind: FeedbackRequestKind;
  targetId: string;
  recipientUserId: string;
  gameOfficialId?: string | null;
  metadata: FeedbackRequestMetadata;
  expiryDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function formatEventDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

/** Orgs with the given feature flag on. */
async function orgsWithFeature(
  flag: keyof OrganizationFeatures,
): Promise<Set<string>> {
  const rows = await getDb()
    .select({ id: organizations.id, features: organizations.features })
    .from(organizations);
  return new Set(
    rows.filter((r) => (r.features as OrganizationFeatures | null)?.[flag] === true).map((r) => r.id),
  );
}

/** Scan 1: completed drop-in sessions → confirmed, non-no-show bookings. */
async function scanDropIns(now: Date, enabledOrgs: Set<string>): Promise<Candidate[]> {
  const db = getDb();
  const endedBefore = new Date(now.getTime() - POST_EVENT_DELAY_HOURS * HOUR_MS);
  const endedAfter = new Date(now.getTime() - DISPATCH_LOOKBACK_DAYS * DAY_MS);

  const rows = await db
    .select({
      bookingId: dropInBookings.id,
      userId: dropInBookings.userId,
      brand: dropInBookings.brand,
      organizationId: dropInSessions.organizationId,
      label: dropInSessions.sportOrClassLabel,
      endsAt: dropInSessions.endsAt,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInBookings.sessionId, dropInSessions.id))
    .where(
      and(
        eq(dropInBookings.status, "confirmed"),
        lte(dropInSessions.endsAt, endedBefore),
        gte(dropInSessions.endsAt, endedAfter),
        inArray(dropInSessions.status, ["scheduled", "completed"]),
      ),
    );

  return rows
    .filter((r) => enabledOrgs.has(r.organizationId))
    .map((r) => ({
      organizationId: r.organizationId,
      brand: r.brand,
      kind: "nps_drop_in" as const,
      targetId: r.bookingId,
      recipientUserId: r.userId,
      metadata: { eventLabel: `${r.label} — ${formatEventDate(r.endsAt)}` },
      expiryDays: NPS_EXPIRY_DAYS,
    }));
}

/** Scan 2: ended, paid field rentals (skips rentals with no linked user account). */
async function scanRentals(now: Date, enabledOrgs: Set<string>): Promise<Candidate[]> {
  const db = getDb();
  const endedBefore = new Date(now.getTime() - POST_EVENT_DELAY_HOURS * HOUR_MS);
  const endedAfter = new Date(now.getTime() - DISPATCH_LOOKBACK_DAYS * DAY_MS);

  const rows = await db
    .select({
      rentalId: fieldRentals.id,
      renterUserId: fieldRentals.renterUserId,
      brand: fieldRentals.brand,
      organizationId: fieldRentals.organizationId,
      endsAt: fieldRentals.endsAt,
    })
    .from(fieldRentals)
    .where(
      and(
        inArray(fieldRentals.status, ["confirmed", "completed"]),
        eq(fieldRentals.paymentStatus, "paid"),
        lte(fieldRentals.endsAt, endedBefore),
        gte(fieldRentals.endsAt, endedAfter),
      ),
    );

  return rows
    .filter((r) => r.renterUserId !== null && enabledOrgs.has(r.organizationId))
    .map((r) => ({
      organizationId: r.organizationId,
      brand: r.brand,
      kind: "nps_field_rental" as const,
      targetId: r.rentalId,
      recipientUserId: r.renterUserId as string,
      metadata: { eventLabel: `Field rental — ${formatEventDate(r.endsAt)}` },
      expiryDays: NPS_EXPIRY_DAYS,
    }));
}

/** Scan 3: seasons whose endDate passed → confirmed registrations. */
async function scanSeasons(now: Date, enabledOrgs: Set<string>): Promise<Candidate[]> {
  const db = getDb();
  const today = now.toISOString().slice(0, 10);
  const lookbackDate = new Date(now.getTime() - SEASON_LOOKBACK_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const rows = await db
    .select({
      registrationId: registrations.id,
      recipientUserId: registrations.registeredByUserId,
      brand: registrations.brand,
      organizationId: locations.organizationId,
      seasonName: seasons.name,
      programName: programs.name,
    })
    .from(registrations)
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(
      and(
        eq(registrations.status, "confirmed"),
        lt(seasons.endDate, today),
        gte(seasons.endDate, lookbackDate),
      ),
    );

  return rows
    .filter((r) => enabledOrgs.has(r.organizationId))
    .map((r) => ({
      organizationId: r.organizationId,
      brand: r.brand,
      kind: "nps_season" as const,
      targetId: r.registrationId,
      recipientUserId: r.recipientUserId,
      metadata: { eventLabel: `${r.programName} — ${r.seasonName}` },
      expiryDays: NPS_EXPIRY_DAYS,
    }));
}

/** True when this recipient already got this NPS kind within the cooldown. */
async function inCooldown(
  recipientUserId: string,
  kind: FeedbackRequestKind,
  now: Date,
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - NPS_COOLDOWN_DAYS * DAY_MS);
  const [row] = await getDb()
    .select({ id: feedbackRequests.id })
    .from(feedbackRequests)
    .where(
      and(
        eq(feedbackRequests.recipientUserId, recipientUserId),
        eq(feedbackRequests.kind, kind),
        gte(feedbackRequests.sentAt, cutoff),
      ),
    )
    .orderBy(sql`${feedbackRequests.sentAt} DESC`)
    .limit(1);
  return row !== undefined;
}

/** Insert the request (dedupe via unique index) and send the email. */
async function createAndSend(candidate: Candidate, now: Date): Promise<"created_sent" | "duplicate" | "error"> {
  const db = getDb();
  const plaintext = generateFeedbackToken();

  const inserted = await db
    .insert(feedbackRequests)
    .values({
      organizationId: candidate.organizationId,
      brand: candidate.brand,
      kind: candidate.kind,
      targetId: candidate.targetId,
      recipientUserId: candidate.recipientUserId,
      gameOfficialId: candidate.gameOfficialId ?? null,
      tokenHash: hashFeedbackToken(plaintext),
      status: "pending",
      expiresAt: new Date(now.getTime() + candidate.expiryDays * DAY_MS),
      metadata: candidate.metadata,
    })
    .onConflictDoNothing()
    .returning({ id: feedbackRequests.id });

  if (inserted.length === 0) return "duplicate";

  const [recipient] = await db
    .select({
      email: users.email,
      firstName: users.firstName,
    })
    .from(users)
    .where(eq(users.id, candidate.recipientUserId))
    .limit(1);

  if (!recipient?.email) return "error";

  const brand = (candidate.brand === "soccerone" ? "soccerone" : "aspire") as BrandId;
  const surveyUrl = buildFeedbackUrl(plaintext, originForBrand(brand));

  const [org] = await db
    .select({ features: organizations.features })
    .from(organizations)
    .where(eq(organizations.id, candidate.organizationId))
    .limit(1);
  const smsOptIn =
    (org?.features as OrganizationFeatures | null)?.enableSMS === true;

  try {
    await sendNpsSurveyEmail({
      to: recipient.email,
      userId: candidate.recipientUserId,
      organizationId: candidate.organizationId,
      brand,
      recipientName: recipient.firstName ?? "there",
      eventLabel: candidate.metadata.eventLabel,
      surveyUrl,
      smsOptIn,
    });
  } catch (err) {
    // Leave the row pending — the next run's pending sweep re-tokens and retries.
    console.error("[feedback] send failed, leaving pending:", err);
    return "error";
  }

  await db
    .update(feedbackRequests)
    .set({ status: "sent", sentAt: now })
    .where(eq(feedbackRequests.id, inserted[0].id));

  return "created_sent";
}

/**
 * Retry rows stuck in `pending` (a previous run created the row but the send
 * threw). The plaintext token is gone, so re-token before resending.
 */
async function resendPending(now: Date, result: DispatchResult): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(feedbackRequests)
    .where(
      and(
        eq(feedbackRequests.status, "pending"),
        gte(feedbackRequests.expiresAt, now),
        isNull(feedbackRequests.sentAt),
      ),
    )
    .orderBy(sql`${feedbackRequests.createdAt} ASC`)
    .limit(50);

  for (const row of rows) {
    // Referee resends are handled by the same path; NPS-only until Task 12
    // adds sendRefereeRatingEmail (pending referee rows are skipped here
    // by kind check until then — Task 12 removes the check).
    if (row.kind === "referee_rating") continue;

    const plaintext = generateFeedbackToken();
    await db
      .update(feedbackRequests)
      .set({ tokenHash: hashFeedbackToken(plaintext) })
      .where(eq(feedbackRequests.id, row.id));

    const [recipient] = await db
      .select({ email: users.email, firstName: users.firstName })
      .from(users)
      .where(eq(users.id, row.recipientUserId))
      .limit(1);
    if (!recipient?.email) continue;

    const brand = (row.brand === "soccerone" ? "soccerone" : "aspire") as BrandId;
    try {
      await sendNpsSurveyEmail({
        to: recipient.email,
        userId: row.recipientUserId,
        organizationId: row.organizationId,
        brand,
        recipientName: recipient.firstName ?? "there",
        eventLabel: row.metadata?.eventLabel ?? "your recent visit",
        surveyUrl: buildFeedbackUrl(plaintext, originForBrand(brand)),
      });
      await db
        .update(feedbackRequests)
        .set({ status: "sent", sentAt: now })
        .where(eq(feedbackRequests.id, row.id));
      result.sent += 1;
    } catch (err) {
      console.error("[feedback] pending resend failed:", err);
      result.errors += 1;
    }
  }
}

export async function dispatchFeedbackRequests(now: Date = new Date()): Promise<DispatchResult> {
  const result: DispatchResult = { created: 0, sent: 0, skippedCooldown: 0, errors: 0 };

  const npsOrgs = await orgsWithFeature("enableNpsSurveys");
  const candidates: Candidate[] = [
    ...(await scanDropIns(now, npsOrgs)),
    ...(await scanRentals(now, npsOrgs)),
    ...(await scanSeasons(now, npsOrgs)),
  ];

  for (const candidate of candidates) {
    if (await inCooldown(candidate.recipientUserId, candidate.kind, now)) {
      result.skippedCooldown += 1;
      continue;
    }
    const outcome = await createAndSend(candidate, now);
    if (outcome === "created_sent") {
      result.created += 1;
      result.sent += 1;
    } else if (outcome === "error") {
      result.errors += 1;
    }
    // "duplicate" is the idempotency path — silently fine.
  }

  await resendPending(now, result);
  return result;
}
```

Performance note: the cooldown check is one indexed query per candidate; candidate volume per hourly run is tens of rows, not thousands — fine. If a scan window ever produces more, batch the cooldown lookup by `inArray(recipientUserId, ...)` — don't pre-optimize now.

Correctness note (cooldown vs same-run duplicates): `inCooldown` reads `sentAt`, which is set as each candidate is processed sequentially — so two same-run candidates for the same recipient+kind are correctly capped (the first send stamps `sentAt`, the second sees it).

- [ ] **Step 4: Implement the cron endpoint**

```typescript
// src/pages/api/cron/dispatch-feedback-requests.ts
/**
 * POST /api/cron/dispatch-feedback-requests
 *
 * Hourly sweep that creates + sends post-event feedback asks (NPS surveys,
 * referee ratings). Mirrors /api/cron/expire-pending-rentals (same auth
 * header, same misconfigured-in-prod behavior, same response shape).
 */
import type { APIRoute } from "astro";
import { dispatchFeedbackRequests } from "@/lib/feedback/dispatch";
import { captureServerException } from "@/lib/observability/server-error";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  const providedSecret = request.headers.get("x-cron-secret");

  if (secret) {
    if (providedSecret !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else if (import.meta.env.PROD) {
    console.error("[cron] CRON_SECRET not configured in production. Refusing request.");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const startedAt = Date.now();
    const result = await dispatchFeedbackRequests();
    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] Feedback dispatch: created=${result.created} sent=${result.sent} skippedCooldown=${result.skippedCooldown} errors=${result.errors} in ${elapsedMs}ms`,
    );

    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Feedback dispatch failed:", err);
    void captureServerException(err, {
      component: "cron/dispatch-feedback-requests",
    });
    return new Response(JSON.stringify({ error: "Cron job failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Post-event feedback dispatch cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to create + send NPS surveys and referee-rating asks for newly-eligible events.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
```

- [ ] **Step 5: Implement the Netlify scheduled function**

Copy `netlify/functions/scheduled-expire-pending-rentals.ts` verbatim to `netlify/functions/scheduled-dispatch-feedback-requests.ts`, changing only:

```typescript
const ROUTE = "/api/cron/dispatch-feedback-requests";

export const handler = schedule("0 * * * *", async () => {
```

…and the log prefix strings to `[scheduled-dispatch-feedback-requests]`. Keep the doc comment explaining why it does not import the app lib.

- [ ] **Step 6: Run the API tests**

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/cron/dispatch-feedback-requests.test.ts`
Expected: PASS (4 tests). Requires the dev server running with the same `CRON_SECRET` and the migration from Task 1 applied to the dev DB.

- [ ] **Step 7: Type check and commit**

```bash
npx tsc --noEmit
git add src/lib/feedback/dispatch.ts src/pages/api/cron/dispatch-feedback-requests.ts netlify/functions/scheduled-dispatch-feedback-requests.ts tests/api/cron/dispatch-feedback-requests.test.ts
git commit -m "feat(feedback): hourly dispatch cron for NPS surveys"
```

---

### Task 6: Public feedback page + NPS submit endpoints (incl. detractor alert)

**Files:**
- Create: `src/lib/feedback/lookup.ts`
- Create: `src/pages/feedback/[token].astro`
- Create: `src/components/feedback/feedback-form.tsx`
- Create: `src/pages/api/feedback/[token]/score.ts`
- Create: `src/pages/api/feedback/[token]/comment.ts`
- Create: `src/pages/api/feedback/[token]/review-click.ts`
- Test: `tests/api/public/feedback-submit.test.ts`

**Interfaces:**
- Consumes: Task 1 tables, Task 3 `hashFeedbackToken` / `npsCategory`, Task 4 `sendDetractorAlertEmail`, Task 2 settings shape.
- Produces:
  - `getFeedbackPageData(token: string): Promise<FeedbackPageData>` where `FeedbackPageData = { state: "open" | "responded" | "expired" | "not_found"; kind?: FeedbackRequestKind; eventLabel?: string; brand?: BrandId; refereeName?: string }`
  - `POST /api/feedback/[token]/score` body `{ score: number }` → `{ ok: true, category: "promoter"|"passive"|"detractor", reviewUrl: string | null }`
  - `POST /api/feedback/[token]/comment` body `{ comment: string }` → `{ ok: true }`
  - `POST /api/feedback/[token]/review-click` → `{ ok: true }`
  - Task 13 adds `POST /api/feedback/[token]/referee` beside these.

- [ ] **Step 1: Write the failing API tests**

```typescript
// tests/api/public/feedback-submit.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { organizations, users, feedbackRequests, npsResponses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateFeedbackToken, hashFeedbackToken } from "@/lib/feedback/tokens";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

/** Seed a sent NPS request and return its plaintext token. */
async function seedNpsRequest(opts?: { expired?: boolean; reviewUrl?: string }) {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Fb Submit Org ${suffix}`,
      slug: `fb-submit-${suffix}`,
      organizationType: "headquarters",
      features: { enableNpsSurveys: true },
      settings: {
        branding: { primaryColor: "#000000" },
        contact: { supportEmail: `staff-${suffix}@test.example` },
        payments: { currency: "usd" },
        registration: {},
        notifications: {},
        feedback: opts?.reviewUrl
          ? { googleReviewUrl: { aspire: opts.reviewUrl } }
          : undefined,
      },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email: `fb-submit-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Submit",
      lastName: "Tester",
    })
    .returning();

  const token = generateFeedbackToken();
  const [request] = await db
    .insert(feedbackRequests)
    .values({
      organizationId: org.id,
      brand: "aspire",
      kind: "nps_drop_in",
      targetId: crypto.randomUUID(),
      recipientUserId: user.id,
      tokenHash: hashFeedbackToken(token),
      status: "sent",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + (opts?.expired ? -1 : 1) * 24 * 60 * 60 * 1000),
      metadata: { eventLabel: "Pickup Soccer — test" },
    })
    .returning();

  return { token, request, org, user };
}

function post(path: string, body?: unknown) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/feedback/[token]/score", () => {
  it("saves a promoter score and returns the brand review URL", async () => {
    const { token, request } = await seedNpsRequest({
      reviewUrl: "https://g.page/r/test/review",
    });

    const res = await post(`/api/feedback/${token}/score`, { score: 10 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.category).toBe("promoter");
    expect(json.reviewUrl).toBe("https://g.page/r/test/review");

    const db = getDb();
    const [row] = await db
      .select()
      .from(npsResponses)
      .where(eq(npsResponses.requestId, request.id));
    expect(row.score).toBe(10);

    const [reqRow] = await db
      .select()
      .from(feedbackRequests)
      .where(eq(feedbackRequests.id, request.id));
    expect(reqRow.status).toBe("responded");
  });

  it("returns null reviewUrl for a promoter when no URL is configured", async () => {
    const { token } = await seedNpsRequest();
    const res = await post(`/api/feedback/${token}/score`, { score: 9 });
    const json = await res.json();
    expect(json.category).toBe("promoter");
    expect(json.reviewUrl).toBeNull();
  });

  it("is single-use", async () => {
    const { token } = await seedNpsRequest();
    await post(`/api/feedback/${token}/score`, { score: 5 });
    const second = await post(`/api/feedback/${token}/score`, { score: 10 });
    expect(second.status).toBe(409);
  });

  it("rejects expired links with 410", async () => {
    const { token } = await seedNpsRequest({ expired: true });
    const res = await post(`/api/feedback/${token}/score`, { score: 10 });
    expect(res.status).toBe(410);
  });

  it("rejects out-of-range scores", async () => {
    const { token } = await seedNpsRequest();
    const res = await post(`/api/feedback/${token}/score`, { score: 11 });
    expect(res.status).toBe(400);
  });

  it("404s an unknown token", async () => {
    const res = await post(`/api/feedback/${generateFeedbackToken()}/score`, { score: 5 });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/feedback/[token]/comment and review-click", () => {
  it("attaches a comment after the score", async () => {
    const { token, request } = await seedNpsRequest();
    await post(`/api/feedback/${token}/score`, { score: 4 });
    const res = await post(`/api/feedback/${token}/comment`, {
      comment: "Fields were muddy",
    });
    expect(res.status).toBe(200);

    const [row] = await getDb()
      .select()
      .from(npsResponses)
      .where(eq(npsResponses.requestId, request.id));
    expect(row.comment).toBe("Fields were muddy");
  });

  it("rejects a comment before any score", async () => {
    const { token } = await seedNpsRequest();
    const res = await post(`/api/feedback/${token}/comment`, { comment: "hi" });
    expect(res.status).toBe(409);
  });

  it("records the review click once", async () => {
    const { token, request } = await seedNpsRequest({
      reviewUrl: "https://g.page/r/test/review",
    });
    await post(`/api/feedback/${token}/score`, { score: 10 });
    const res = await post(`/api/feedback/${token}/review-click`);
    expect(res.status).toBe(200);

    const [row] = await getDb()
      .select()
      .from(npsResponses)
      .where(eq(npsResponses.requestId, request.id));
    expect(row.reviewLinkClickedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/feedback-submit.test.ts`
Expected: FAIL — 404 on every endpoint.

- [ ] **Step 3: Implement the lookup helper**

```typescript
// src/lib/feedback/lookup.ts
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { feedbackRequests, type FeedbackRequest, type FeedbackRequestKind } from "@/lib/db/schema";
import { hashFeedbackToken } from "./tokens";
import type { BrandId } from "@/lib/branding/themes";

export interface FeedbackPageData {
  state: "open" | "responded" | "expired" | "not_found";
  kind?: FeedbackRequestKind;
  eventLabel?: string;
  brand?: BrandId;
  refereeName?: string;
}

/** Resolve a plaintext token to its request row, or null. */
export async function getFeedbackRequestByToken(
  token: string,
): Promise<FeedbackRequest | null> {
  if (!token || token.length > 128) return null;
  const [row] = await getDb()
    .select()
    .from(feedbackRequests)
    .where(eq(feedbackRequests.tokenHash, hashFeedbackToken(token)))
    .limit(1);
  return row ?? null;
}

/** Page-facing view of a token: which form to render, or which end state. */
export async function getFeedbackPageData(token: string): Promise<FeedbackPageData> {
  const row = await getFeedbackRequestByToken(token);
  if (!row) return { state: "not_found" };

  const base = {
    kind: row.kind,
    eventLabel: row.metadata?.eventLabel,
    brand: (row.brand === "soccerone" ? "soccerone" : "aspire") as BrandId,
    refereeName: row.metadata?.refereeName,
  };
  if (row.status === "responded") return { state: "responded", ...base };
  if (row.expiresAt < new Date()) return { state: "expired", ...base };
  return { state: "open", ...base };
}
```

(`tokenHash` has a unique index, so `.limit(1)` without `orderBy` is safe here — zero or one row by construction.)

- [ ] **Step 4: Implement the score endpoint**

```typescript
// src/pages/api/feedback/[token]/score.ts
import type { APIRoute } from "astro";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { feedbackRequests, npsResponses, organizations } from "@/lib/db/schema";
import type { OrganizationSettings } from "@/lib/db/schema";
import { hashFeedbackToken } from "@/lib/feedback/tokens";
import { npsCategory } from "@/lib/feedback/constants";
import { getFeedbackRequestByToken } from "@/lib/feedback/lookup";
import { sendDetractorAlertEmail } from "@/lib/email/send";
import type { BrandId } from "@/lib/branding/themes";

export const prerender = false;

const bodySchema = z.object({ score: z.number().int().min(0).max(10) });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request }) => {
  const token = params.token ?? "";

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) return json(400, { error: "Score must be an integer 0-10" });
  const { score } = parsed.data;

  const db = getDb();
  const now = new Date();

  // Atomic single-use claim: only an unexpired, sent-but-unanswered request flips.
  const [claimed] = await db
    .update(feedbackRequests)
    .set({ status: "responded", respondedAt: now })
    .where(
      and(
        eq(feedbackRequests.tokenHash, hashFeedbackToken(token)),
        eq(feedbackRequests.status, "sent"),
        gt(feedbackRequests.expiresAt, now),
      ),
    )
    .returning();

  if (!claimed) {
    // Distinguish the failure for a friendlier client message.
    const existing = await getFeedbackRequestByToken(token);
    if (!existing) return json(404, { error: "Unknown link" });
    if (existing.status === "responded") return json(409, { error: "Already answered" });
    if (existing.expiresAt <= now) return json(410, { error: "Link expired" });
    return json(409, { error: "Link not active" });
  }

  if (claimed.kind === "referee_rating") {
    // Wrong endpoint for referee links; un-claim so the referee endpoint can take it.
    await db
      .update(feedbackRequests)
      .set({ status: "sent", respondedAt: null })
      .where(eq(feedbackRequests.id, claimed.id));
    return json(400, { error: "This link is a referee rating, not a survey" });
  }

  await db.insert(npsResponses).values({ requestId: claimed.id, score });

  // Resolve the org's feedback settings for review funnel + detractor alert.
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, claimed.organizationId))
    .limit(1);
  const settings = (org?.settings ?? {}) as OrganizationSettings;
  const brand = (claimed.brand === "soccerone" ? "soccerone" : "aspire") as BrandId;

  const category = npsCategory(score);
  const reviewUrl =
    category === "promoter"
      ? (settings.feedback?.googleReviewUrl?.[brand] ?? null)
      : null;

  if (category === "detractor") {
    const alertTo =
      settings.feedback?.detractorAlertEmail ?? settings.contact?.supportEmail;
    if (alertTo) {
      // Fire-and-forget — the alert must never block or fail the response save.
      void sendDetractorAlertEmail({
        to: alertTo,
        brand,
        score,
        comment: null,
        eventLabel: claimed.metadata?.eventLabel ?? "(unknown event)",
        kind: claimed.kind,
      }).catch((err) => console.error("[feedback] detractor alert failed:", err));
    }
  }

  return json(200, { ok: true, category, reviewUrl });
};
```

- [ ] **Step 5: Implement the comment and review-click endpoints**

```typescript
// src/pages/api/feedback/[token]/comment.ts
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { npsResponses } from "@/lib/db/schema";
import { getFeedbackRequestByToken } from "@/lib/feedback/lookup";

export const prerender = false;

const bodySchema = z.object({ comment: z.string().trim().min(1).max(2000) });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request }) => {
  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) return json(400, { error: "Comment must be 1-2000 chars" });

  const req = await getFeedbackRequestByToken(params.token ?? "");
  if (!req) return json(404, { error: "Unknown link" });
  if (req.status !== "responded") return json(409, { error: "Answer the survey first" });
  if (req.expiresAt <= new Date()) return json(410, { error: "Link expired" });

  const updated = await getDb()
    .update(npsResponses)
    .set({ comment: parsed.data.comment })
    .where(eq(npsResponses.requestId, req.id))
    .returning({ id: npsResponses.id });
  if (updated.length === 0) return json(409, { error: "No survey response found" });

  return json(200, { ok: true });
};
```

```typescript
// src/pages/api/feedback/[token]/review-click.ts
import type { APIRoute } from "astro";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { npsResponses } from "@/lib/db/schema";
import { getFeedbackRequestByToken } from "@/lib/feedback/lookup";

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params }) => {
  const req = await getFeedbackRequestByToken(params.token ?? "");
  if (!req) return json(404, { error: "Unknown link" });

  // Keep the FIRST click timestamp; later clicks are no-ops.
  await getDb()
    .update(npsResponses)
    .set({ reviewLinkClickedAt: new Date() })
    .where(and(eq(npsResponses.requestId, req.id), isNull(npsResponses.reviewLinkClickedAt)));

  return json(200, { ok: true });
};
```

- [ ] **Step 6: Run the API tests**

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/feedback-submit.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Implement the page and form component**

```astro
---
// src/pages/feedback/[token].astro
import BaseLayout from "../../layouts/BaseLayout.astro";
import { FeedbackForm } from "../../components/feedback/feedback-form";
import { getFeedbackPageData } from "@/lib/feedback/lookup";

// SSR (no prerender): the page branches on a per-token DB lookup.
const token = Astro.params.token ?? "";
const data = await getFeedbackPageData(token);
---

<BaseLayout title="How was it?" navigation={false} footer={false}>
  <main class="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-4 py-12">
    <FeedbackForm
      client:load
      token={token}
      state={data.state}
      kind={data.kind ?? null}
      eventLabel={data.eventLabel ?? null}
      refereeName={data.refereeName ?? null}
    />
  </main>
</BaseLayout>
```

(Verify `BaseLayout` accepts `navigation={false} footer={false}` — `src/pages/admin/settings.astro` uses exactly those props.)

```tsx
// src/components/feedback/feedback-form.tsx
"use client";

import { useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import type { FeedbackRequestKind } from "@/lib/db/schema";

interface FeedbackFormProps {
  token: string;
  state: "open" | "responded" | "expired" | "not_found";
  kind: FeedbackRequestKind | null;
  eventLabel: string | null;
  refereeName: string | null;
}

type Category = "promoter" | "passive" | "detractor";

export function FeedbackForm(props: FeedbackFormProps) {
  useHydrationBeacon();

  if (props.state === "not_found") {
    return (
      <TerminalCard
        title="This link isn't valid"
        body="Double-check the link from your email, or reach out to us directly."
      />
    );
  }
  if (props.state === "expired") {
    return (
      <TerminalCard
        title="This link has expired"
        body="Feedback links are open for a limited time after the event. We'd still love to hear from you — just reply to the email we sent."
      />
    );
  }
  if (props.state === "responded") {
    return (
      <TerminalCard title="Thanks — you're all set" body="You've already shared your feedback for this one." />
    );
  }

  if (props.kind === "referee_rating") {
    // Rendered by RefereeRatingForm from Phase 2 (Task 13). Until that task
    // lands, referee links can't occur in prod (flag off), so a plain
    // placeholder card keeps Phase 1 shippable.
    return (
      <TerminalCard title="Rating unavailable" body="This rating form isn't open yet." />
    );
  }

  return <NpsForm token={props.token} eventLabel={props.eventLabel} />;
}

function TerminalCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-white p-8 text-center shadow-sm">
      <h1 className="mb-2 text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}

function NpsForm({ token, eventLabel }: { token: string; eventLabel: string | null }) {
  const [phase, setPhase] = useState<"score" | "followup" | "done">("score");
  const [category, setCategory] = useState<Category | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitScore(score: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSelectedScore(score);
    try {
      const res = await fetch(`/api/feedback/${token}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong — try again.");
        setSelectedScore(null);
        return;
      }
      setCategory(json.category);
      setReviewUrl(json.reviewUrl);
      setPhase("followup");
    } catch {
      setError("Network error — try again.");
      setSelectedScore(null);
    } finally {
      setBusy(false);
    }
  }

  async function submitComment() {
    if (!comment.trim()) {
      setPhase("done");
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/feedback/${token}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment.trim() }),
      });
    } finally {
      setBusy(false);
      setPhase("done");
    }
  }

  function clickReview() {
    // Fire-and-forget tracking; navigation happens via the anchor itself.
    void fetch(`/api/feedback/${token}/review-click`, { method: "POST" });
  }

  if (phase === "done") {
    return (
      <TerminalCard
        title="Thank you!"
        body="Your feedback goes straight to the people who run the program."
      />
    );
  }

  if (phase === "followup") {
    return (
      <div className="rounded-lg border bg-white p-8 shadow-sm">
        {category === "promoter" ? (
          <>
            <h1 className="mb-2 text-xl font-semibold">That's great to hear! 🎉</h1>
            {reviewUrl ? (
              <>
                <p className="mb-4 text-muted-foreground">
                  Would you take 30 seconds to say so publicly? It helps other
                  families find us.
                </p>
                <a
                  href={reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={clickReview}
                  data-testid="review-cta"
                  className="mb-6 inline-block w-full rounded-md bg-primary px-4 py-3 text-center font-medium text-primary-foreground"
                >
                  Review us on Google
                </a>
              </>
            ) : (
              <p className="mb-4 text-muted-foreground">Thanks for being part of it.</p>
            )}
          </>
        ) : (
          <h1 className="mb-4 text-xl font-semibold">Thanks — what could we do better?</h1>
        )}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={
            category === "promoter"
              ? "Anything else you want to share? (optional)"
              : "Tell us what would have made it better (optional)"
          }
          data-testid="comment-box"
          className="mb-4 w-full rounded-md border p-3"
        />
        <button
          onClick={submitComment}
          disabled={busy}
          data-testid="finish-button"
          className="w-full rounded-md border px-4 py-3 font-medium"
        >
          {comment.trim() ? "Send feedback" : "Finish"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-8 shadow-sm">
      <h1 className="mb-1 text-xl font-semibold">How was it?</h1>
      {eventLabel && <p className="mb-4 text-muted-foreground">{eventLabel}</p>}
      <p className="mb-3 text-sm font-medium">
        How likely are you to recommend us to a friend?
      </p>
      {error && <ErrorBanner message={error} />}
      <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-label="Score from 0 to 10">
        {Array.from({ length: 11 }, (_, score) => (
          <button
            key={score}
            onClick={() => submitScore(score)}
            disabled={busy}
            aria-label={`Score ${score}`}
            data-testid={`score-${score}`}
            className={`rounded-md border py-3 text-sm font-medium hover:bg-accent ${
              selectedScore === score ? "bg-primary text-primary-foreground" : ""
            }`}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>Not likely</span>
        <span>Very likely</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Manual smoke test**

With the dev server running, insert a request via the seed helper in the API test (or re-run the cron against a seeded booking), open `/feedback/<plaintext token>`, tap `10`, confirm the review CTA appears; open the same URL again, confirm the "already shared" card.

- [ ] **Step 9: Type check and commit**

```bash
npx tsc --noEmit
git add src/lib/feedback/lookup.ts src/pages/feedback/ src/components/feedback/ src/pages/api/feedback/ tests/api/public/feedback-submit.test.ts
git commit -m "feat(feedback): public /feedback/[token] page + NPS submit flow"
```

---

### Task 7: Admin settings UI (feedback card)

**Files:**
- Create: `src/components/admin/feedback-settings-card.tsx`
- Modify: `src/components/admin/admin-settings.tsx` (render the card)

**Interfaces:**
- Consumes: Task 2's extended PATCH/GET on `/api/admin/organizations/settings`.
- Produces: admin UI only — no new programmatic interface.

- [ ] **Step 1: Build the card component**

```tsx
// src/components/admin/feedback-settings-card.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

interface FeedbackSettingsState {
  enableNpsSurveys: boolean;
  enableRefereeRatings: boolean;
  googleReviewUrlAspire: string;
  googleReviewUrlSoccerone: string;
  detractorAlertEmail: string;
}

/**
 * "Customer feedback" settings card: NPS + referee-rating feature toggles,
 * per-brand Google review URLs, detractor alert address. Persists via the
 * org settings PATCH endpoint (settings.feedback + features).
 */
export function FeedbackSettingsCard() {
  const [state, setState] = useState<FeedbackSettingsState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/organizations/settings");
        if (!res.ok) throw new Error("load failed");
        const json = await res.json();
        setState({
          enableNpsSurveys: json.features?.enableNpsSurveys ?? false,
          enableRefereeRatings: json.features?.enableRefereeRatings ?? false,
          googleReviewUrlAspire: json.settings?.feedback?.googleReviewUrl?.aspire ?? "",
          googleReviewUrlSoccerone:
            json.settings?.feedback?.googleReviewUrl?.soccerone ?? "",
          detractorAlertEmail: json.settings?.feedback?.detractorAlertEmail ?? "",
        });
      } catch {
        toast.error("Failed to load feedback settings");
      }
    })();
  }, []);

  async function save() {
    if (!state) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/organizations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          features: {
            enableNpsSurveys: state.enableNpsSurveys,
            enableRefereeRatings: state.enableRefereeRatings,
          },
          settings: {
            feedback: {
              googleReviewUrl: {
                ...(state.googleReviewUrlAspire
                  ? { aspire: state.googleReviewUrlAspire }
                  : {}),
                ...(state.googleReviewUrlSoccerone
                  ? { soccerone: state.googleReviewUrlSoccerone }
                  : {}),
              },
              ...(state.detractorAlertEmail
                ? { detractorAlertEmail: state.detractorAlertEmail }
                : {}),
            },
          },
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "save failed");
      }
      toast.success("Feedback settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!state) return null;

  return (
    <div className="rounded-lg border bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold">Customer feedback</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Post-event NPS surveys with a Google review funnel, and post-game
        referee ratings.
      </p>

      <label className="mb-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.enableNpsSurveys}
          onChange={(e) => setState({ ...state, enableNpsSurveys: e.target.checked })}
        />
        Send NPS surveys after bookings
      </label>
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.enableRefereeRatings}
          onChange={(e) =>
            setState({ ...state, enableRefereeRatings: e.target.checked })
          }
        />
        Send referee-rating asks after completed games
      </label>

      <label className="mb-1 block text-sm font-medium" htmlFor="fb-review-aspire">
        Google review URL — Aspire
      </label>
      <input
        id="fb-review-aspire"
        type="url"
        value={state.googleReviewUrlAspire}
        onChange={(e) => setState({ ...state, googleReviewUrlAspire: e.target.value })}
        placeholder="https://g.page/r/…/review"
        className="mb-3 w-full rounded-md border p-2 text-sm"
      />

      <label className="mb-1 block text-sm font-medium" htmlFor="fb-review-soccerone">
        Google review URL — SoccerOne
      </label>
      <input
        id="fb-review-soccerone"
        type="url"
        value={state.googleReviewUrlSoccerone}
        onChange={(e) =>
          setState({ ...state, googleReviewUrlSoccerone: e.target.value })
        }
        placeholder="https://g.page/r/…/review"
        className="mb-3 w-full rounded-md border p-2 text-sm"
      />

      <label className="mb-1 block text-sm font-medium" htmlFor="fb-alert-email">
        Detractor alert email (falls back to support email)
      </label>
      <input
        id="fb-alert-email"
        type="email"
        value={state.detractorAlertEmail}
        onChange={(e) => setState({ ...state, detractorAlertEmail: e.target.value })}
        placeholder="owner@example.com"
        className="mb-4 w-full rounded-md border p-2 text-sm"
      />

      <button
        onClick={save}
        disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        {saving ? "Saving…" : "Save feedback settings"}
      </button>
    </div>
  );
}
```

Style note: match the card markup/classes used by the existing sections inside `admin-settings.tsx` (e.g. the external-store card) rather than the generic classes above if they differ — the card must look native on the settings page.

- [ ] **Step 2: Render it in admin-settings.tsx**

In `src/components/admin/admin-settings.tsx`, import and render `<FeedbackSettingsCard />` alongside the existing settings cards (after the site-announcement card).

- [ ] **Step 3: Manual verification**

Dev server: `/admin/settings` as `admin@test.aspiresports.com` / `TestAdmin123!` — toggle NPS on, set an Aspire review URL, save, reload, confirm persistence.

- [ ] **Step 4: Type check and commit**

```bash
npx tsc --noEmit
git add src/components/admin/feedback-settings-card.tsx src/components/admin/admin-settings.tsx
git commit -m "feat(feedback): admin settings card for feedback engine"
```

---

### Task 8: Admin NPS report (API + page)

**Files:**
- Create: `src/pages/api/admin/reports/nps.ts`
- Create: `src/pages/admin/reports/nps.astro`
- Create: `src/components/admin/reports/nps-report.tsx`
- Test: `tests/api/admin/reports-nps.test.ts`

**Interfaces:**
- Consumes: Task 1 tables; admin auth helpers.
- Produces: `GET /api/admin/reports/nps` → `{ nps: number | null, responseCount: number, sentCount: number, responseRate: number | null, reviewClicks: number, reviewUrlConfigured: boolean, byKind: Array<{ kind: string, nps: number | null, count: number }>, trend: Array<{ weekStart: string, nps: number | null, count: number }>, recent: Array<{ score: number, comment: string | null, kind: string, eventLabel: string | null, respondedAt: string }> }` — 90-day window, org-scoped.

- [ ] **Step 1: Write the failing API test**

```typescript
// tests/api/admin/reports-nps.test.ts
import { describe, it, expect } from "vitest";
import { signInAsAdmin } from "../../utils/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/admin/reports/nps", () => {
  it("requires admin auth", async () => {
    const res = await fetch(`${BASE}/api/admin/reports/nps`);
    expect([401, 403]).toContain(res.status);
  });

  it("returns the report shape", async () => {
    const cookie = await signInAsAdmin(BASE);
    const res = await fetch(`${BASE}/api/admin/reports/nps`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("nps");
    expect(json).toHaveProperty("responseCount");
    expect(json).toHaveProperty("sentCount");
    expect(json).toHaveProperty("reviewClicks");
    expect(Array.isArray(json.byKind)).toBe(true);
    expect(Array.isArray(json.trend)).toBe(true);
    expect(Array.isArray(json.recent)).toBe(true);
    // Anonymity/scoping: no recipient identity in the payload.
    expect(JSON.stringify(json)).not.toContain("recipientUserId");
  });
});
```

(As in Task 2: use the actual admin sign-in helper from `tests/utils/test-helpers.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/reports-nps.test.ts`
Expected: FAIL — 404.

- [ ] **Step 3: Implement the API**

```typescript
// src/pages/api/admin/reports/nps.ts
import type { APIRoute } from "astro";
import { and, eq, gte, inArray, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { feedbackRequests, npsResponses, organizations } from "@/lib/db/schema";
import type { OrganizationSettings } from "@/lib/db/schema";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { npsCategory } from "@/lib/feedback/constants";

export const prerender = false;

const WINDOW_DAYS = 90;
const NPS_KINDS = ["nps_drop_in", "nps_field_rental", "nps_season"] as const;

/** Classic NPS: %promoters − %detractors, rounded, or null with no data. */
function computeNps(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const promoters = scores.filter((s) => npsCategory(s) === "promoter").length;
  const detractors = scores.filter((s) => npsCategory(s) === "detractor").length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

function weekStartOf(d: Date): string {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  copy.setUTCDate(copy.getUTCDate() - copy.getUTCDay());
  return copy.toISOString().slice(0, 10);
}

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const db = getDb();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Volume is bounded (90-day org window); aggregate in JS for clarity.
  const rows = await db
    .select({
      score: npsResponses.score,
      comment: npsResponses.comment,
      reviewLinkClickedAt: npsResponses.reviewLinkClickedAt,
      respondedAt: feedbackRequests.respondedAt,
      kind: feedbackRequests.kind,
      metadata: feedbackRequests.metadata,
    })
    .from(npsResponses)
    .innerJoin(feedbackRequests, eq(npsResponses.requestId, feedbackRequests.id))
    .where(
      and(
        eq(feedbackRequests.organizationId, orgContext.organizationId),
        inArray(feedbackRequests.kind, [...NPS_KINDS]),
        gte(feedbackRequests.respondedAt, cutoff),
      ),
    )
    .orderBy(desc(feedbackRequests.respondedAt));

  const sentRows = await db
    .select({ id: feedbackRequests.id })
    .from(feedbackRequests)
    .where(
      and(
        eq(feedbackRequests.organizationId, orgContext.organizationId),
        inArray(feedbackRequests.kind, [...NPS_KINDS]),
        inArray(feedbackRequests.status, ["sent", "responded"]),
        gte(feedbackRequests.createdAt, cutoff),
      ),
    );

  const scores = rows.map((r) => r.score);
  const byKind = NPS_KINDS.map((kind) => {
    const kindScores = rows.filter((r) => r.kind === kind).map((r) => r.score);
    return { kind, nps: computeNps(kindScores), count: kindScores.length };
  });

  const trendMap = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.respondedAt) continue;
    const week = weekStartOf(r.respondedAt);
    trendMap.set(week, [...(trendMap.get(week) ?? []), r.score]);
  }
  const trend = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, s]) => ({ weekStart, nps: computeNps(s), count: s.length }));

  // Detractor comments surface first in the recent feed.
  const recent = [...rows]
    .sort((a, b) => {
      const aDetractor = npsCategory(a.score) === "detractor" ? 0 : 1;
      const bDetractor = npsCategory(b.score) === "detractor" ? 0 : 1;
      return aDetractor - bDetractor;
    })
    .slice(0, 50)
    .map((r) => ({
      score: r.score,
      comment: r.comment,
      kind: r.kind,
      eventLabel: r.metadata?.eventLabel ?? null,
      respondedAt: r.respondedAt?.toISOString() ?? "",
    }));

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgContext.organizationId))
    .limit(1);
  const settings = (org?.settings ?? {}) as OrganizationSettings;
  const reviewUrlConfigured = Boolean(
    settings.feedback?.googleReviewUrl?.aspire ||
      settings.feedback?.googleReviewUrl?.soccerone,
  );

  return new Response(
    JSON.stringify({
      nps: computeNps(scores),
      responseCount: rows.length,
      sentCount: sentRows.length,
      responseRate:
        sentRows.length === 0 ? null : Math.round((rows.length / sentRows.length) * 100),
      reviewClicks: rows.filter((r) => r.reviewLinkClickedAt !== null).length,
      reviewUrlConfigured,
      byKind,
      trend,
      recent,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS (2 tests).

- [ ] **Step 5: Build the page + component**

```astro
---
// src/pages/admin/reports/nps.astro
import BaseLayout from "../../../layouts/BaseLayout.astro";
import { AdminLayout } from "../../../components/admin/admin-layout";
import { getPrimaryRoleName } from "@/lib/auth";
import { NpsReport } from "../../../components/admin/reports/nps-report";

const user = Astro.locals.user!;
const primaryRole = getPrimaryRoleName(Astro.locals.userRoles);
---

<BaseLayout title="NPS — Reports — Admin" navigation={false} footer={false}>
  <AdminLayout
    client:load
    role={primaryRole}
    currentPath="/admin/reports/nps"
    user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}
  >
    <NpsReport client:load />
  </AdminLayout>
</BaseLayout>
```

```tsx
// src/components/admin/reports/nps-report.tsx
"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { npsCategory } from "@/lib/feedback/constants";

interface NpsReportData {
  nps: number | null;
  responseCount: number;
  sentCount: number;
  responseRate: number | null;
  reviewClicks: number;
  reviewUrlConfigured: boolean;
  byKind: Array<{ kind: string; nps: number | null; count: number }>;
  trend: Array<{ weekStart: string; nps: number | null; count: number }>;
  recent: Array<{
    score: number;
    comment: string | null;
    kind: string;
    eventLabel: string | null;
    respondedAt: string;
  }>;
}

const KIND_LABELS: Record<string, string> = {
  nps_drop_in: "Drop-in / pickup",
  nps_field_rental: "Field rentals",
  nps_season: "Seasons",
};

export function NpsReport() {
  const [data, setData] = useState<NpsReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/reports/nps");
        if (!res.ok) throw new Error("Failed to load NPS report");
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">NPS</h1>
        <p className="text-sm text-muted-foreground">Rolling 90 days, all booking types</p>
      </div>

      {!data.reviewUrlConfigured && (
        <ErrorBanner message="No Google review URL is configured — promoters see a plain thank-you. Set one in Settings → Customer feedback." />
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="NPS" value={data.nps === null ? "—" : String(data.nps)} />
        <StatTile label="Responses" value={String(data.responseCount)} />
        <StatTile
          label="Response rate"
          value={data.responseRate === null ? "—" : `${data.responseRate}%`}
        />
        <StatTile label="Review clicks" value={String(data.reviewClicks)} />
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-medium">By booking type</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Type</th>
              <th className="py-1">NPS</th>
              <th className="py-1">Responses</th>
            </tr>
          </thead>
          <tbody>
            {data.byKind.map((k) => (
              <tr key={k.kind} className="border-t">
                <td className="py-2">{KIND_LABELS[k.kind] ?? k.kind}</td>
                <td className="py-2">{k.nps === null ? "—" : k.nps}</td>
                <td className="py-2">{k.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-medium">Weekly trend</h2>
        {data.trend.length === 0 ? (
          <EmptyState title="No responses yet" description="Trend appears once surveys start coming back." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">Week of</th>
                <th className="py-1">NPS</th>
                <th className="py-1">Responses</th>
              </tr>
            </thead>
            <tbody>
              {data.trend.map((t) => (
                <tr key={t.weekStart} className="border-t">
                  <td className="py-2">{t.weekStart}</td>
                  <td className="py-2">{t.nps === null ? "—" : t.nps}</td>
                  <td className="py-2">{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-medium">Recent responses (detractors first)</h2>
        {data.recent.length === 0 ? (
          <EmptyState title="No responses yet" description="Responses appear here as they come in." />
        ) : (
          <ul className="divide-y">
            {data.recent.map((r, i) => (
              <li key={i} className="py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      npsCategory(r.score) === "detractor"
                        ? "bg-red-100 text-red-800"
                        : npsCategory(r.score) === "promoter"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {r.score}/10
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {r.eventLabel ?? KIND_LABELS[r.kind] ?? r.kind}
                  </span>
                </div>
                {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
```

Also add an "NPS" link/card to `src/pages/admin/reports/index.astro` next to the existing registrations/revenue report links (match its existing markup).

- [ ] **Step 6: Type check and commit**

```bash
npx tsc --noEmit
git add src/pages/api/admin/reports/nps.ts src/pages/admin/reports/nps.astro src/pages/admin/reports/index.astro src/components/admin/reports/nps-report.tsx tests/api/admin/reports-nps.test.ts
git commit -m "feat(feedback): admin NPS report"
```

---

### Task 9: E2E fixtures + Playwright spec (NPS promoter path)

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts` (add feedback fixtures)
- Create: `tests/e2e/feedback-nps.spec.ts`

**Interfaces:**
- Consumes: Task 6 page + endpoints; Task 3 token helpers.
- Produces: fixed plaintext E2E tokens `e2e-feedback-nps-open` (NPS, org has Aspire review URL) — referenced by this spec and reset on every seed run.

- [ ] **Step 1: Add the seed fixture**

Add a `seedFeedbackFixtures()` function to `src/lib/db/seeds/seed-e2e-tests.ts`, called from the seed's main flow, following the file's existing idempotent style:

```typescript
async function seedFeedbackFixtures(db: Db, orgId: string) {
  const { hashFeedbackToken } = await import("@/lib/feedback/tokens");
  const { feedbackRequests, npsResponses, organizations, users } = await import(
    "@/lib/db/schema"
  );
  const { eq, sql } = await import("drizzle-orm");

  // The org must have the flag + a review URL so the promoter CTA renders.
  const [org] = await db
    .select({ settings: organizations.settings, features: organizations.features })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  await db
    .update(organizations)
    .set({
      features: { ...(org?.features ?? {}), enableNpsSurveys: true },
      settings: {
        ...(org?.settings ?? {}),
        feedback: {
          ...(org?.settings?.feedback ?? {}),
          googleReviewUrl: { aspire: "https://example.com/e2e-review" },
        },
      },
    })
    .where(eq(organizations.id, orgId));

  const [parent] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "parent@test.aspiresports.com"))
    .limit(1);
  if (!parent) throw new Error("e2e seed: parent test user missing");

  const tokenHash = hashFeedbackToken("e2e-feedback-nps-open");

  // Reset to a fresh 'sent' request every seed run (spec consumes it).
  await db.delete(feedbackRequests).where(eq(feedbackRequests.tokenHash, tokenHash));
  await db.insert(feedbackRequests).values({
    organizationId: orgId,
    brand: "aspire",
    kind: "nps_drop_in",
    targetId: sql`gen_random_uuid()`,
    recipientUserId: parent.id,
    tokenHash,
    status: "sent",
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    metadata: { eventLabel: "E2E Pickup Soccer" },
  });
}
```

Adaptation notes: use the seed file's actual `db` handle/type and org-id source (it already resolves the seed org); if `targetId` can't take a `sql` expression through the insert type, use `crypto.randomUUID()`. `.delete` cascades to `nps_responses` via FK, so the request is always fresh.

- [ ] **Step 2: Re-run the seed**

Run: `npm run db:seed:e2e`
Expected: completes without error (idempotent on re-run).

- [ ] **Step 3: Write the Playwright spec**

```typescript
// tests/e2e/feedback-nps.spec.ts
import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

// Fixed token seeded by seedFeedbackFixtures() in seed-e2e-tests.ts.
const TOKEN = "e2e-feedback-nps-open";

test.describe("NPS feedback flow", () => {
  test("promoter path: score 10 → Google review CTA", async ({ page }) => {
    await page.goto(`/feedback/${TOKEN}`);
    await waitForHydration(page);

    await expect(page.getByText("How was it?")).toBeVisible();
    await page.getByTestId("score-10").click();

    const cta = page.getByTestId("review-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "https://example.com/e2e-review");

    await page.getByTestId("finish-button").click();
    await expect(page.getByText("Thank you!")).toBeVisible();

    // Single-use: revisiting shows the responded card.
    await page.goto(`/feedback/${TOKEN}`);
    await waitForHydration(page);
    await expect(page.getByText(/already shared/i)).toBeVisible();
  });

  test("unknown token shows the invalid-link card", async ({ page }) => {
    await page.goto("/feedback/definitely-not-a-real-token");
    await waitForHydration(page);
    await expect(page.getByText(/isn't valid/i)).toBeVisible();
  });
});
```

- [ ] **Step 4: Run the spec locally**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- feedback-nps` (dev server running, seed applied)
Expected: PASS (2 tests). Note: this spec consumes the token — re-run `npm run db:seed:e2e` before re-running the spec.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/seeds/seed-e2e-tests.ts tests/e2e/feedback-nps.spec.ts
git commit -m "test(feedback): e2e NPS promoter flow + seed fixtures"
```

**Phase 1 complete** — the engine + NPS ships dark behind `enableNpsSurveys`.

---

## Phase 2 — Referee ratings

### Task 10: Referee rating email template + sender

**Files:**
- Create: `src/lib/email/templates/feedback-referee-rating.tsx`
- Modify: `src/lib/email/send.ts` (one new sender)
- Test: `tests/unit/feedback-emails.test.ts` (append one test)

**Interfaces:**
- Consumes: same email plumbing as Task 4.
- Produces: `sendRefereeRatingEmail(params: { to: string; userId: string; organizationId: string; brand: BrandId; recipientName: string; eventLabel: string; refereeName: string; surveyUrl: string; smsOptIn?: boolean })`

- [ ] **Step 1: Append the failing render test**

Add to `tests/unit/feedback-emails.test.ts`:

```typescript
import { FeedbackRefereeRatingEmail } from "@/lib/email/templates/feedback-referee-rating";

it("renders the referee rating email", async () => {
  const { html } = await renderEmail(
    FeedbackRefereeRatingEmail({
      recipientName: "Jordan",
      eventLabel: "U10 Tigers vs U10 Lions — Sat, Jul 4",
      refereeName: "Alex R.",
      surveyUrl: "https://example.com/feedback/tok456",
      brand: "aspire",
    }),
  );
  expect(html).toContain("Alex R.");
  expect(html).toContain("https://example.com/feedback/tok456");
});
```

Run: `npx vitest run tests/unit/feedback-emails.test.ts` — expected: FAIL (template missing).

- [ ] **Step 2: Write the template**

```tsx
// src/lib/email/templates/feedback-referee-rating.tsx
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import type { BrandId } from "@/lib/branding/themes";

interface FeedbackRefereeRatingEmailProps {
  recipientName: string;
  /** e.g. "U10 Tigers vs U10 Lions — Sat, Jul 4". */
  eventLabel: string;
  /** Display name of the official, e.g. "Alex R.". */
  refereeName: string;
  surveyUrl: string;
  brand?: BrandId;
}

/**
 * Post-game referee rating ask, sent to the adults tied to both rosters
 * once the game is marked completed. Single CTA (no embedded star links —
 * same mail-scanner reasoning as the NPS email).
 */
export function FeedbackRefereeRatingEmail({
  recipientName,
  eventLabel,
  refereeName,
  surveyUrl,
  brand,
}: FeedbackRefereeRatingEmailProps) {
  return (
    <EmailLayout preview={`Rate the referee — ${eventLabel}`} brand={brand}>
      <Content>
        <H1>How did the ref do?</H1>
        <P>Hi {recipientName},</P>
        <P>
          <strong>{eventLabel}</strong> is in the books. Help us keep officiating
          quality high — rate referee <strong>{refereeName}</strong> in about 20
          seconds.
        </P>
        <Button href={surveyUrl}>Rate the referee →</Button>
        <PMuted>
          Ratings are anonymous and go only to league staff — never to the
          referee directly.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}
```

- [ ] **Step 3: Add the sender to send.ts**

```typescript
export interface SendRefereeRatingEmailParams {
  to: string;
  userId: string;
  organizationId: string;
  brand: BrandId;
  recipientName: string;
  eventLabel: string;
  refereeName: string;
  surveyUrl: string;
  smsOptIn?: boolean;
}

export async function sendRefereeRatingEmail(params: SendRefereeRatingEmailParams) {
  const { html, text } = await renderEmail(
    FeedbackRefereeRatingEmail({
      recipientName: params.recipientName,
      eventLabel: params.eventLabel,
      refereeName: params.refereeName,
      surveyUrl: params.surveyUrl,
      brand: params.brand,
    }),
  );

  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "feedback_referee_rating",
    to: params.to,
    subject: `Rate the referee — ${params.eventLabel}`,
    html,
    text,
    from: fromForBrand(params.brand),
    smsNudge: params.smsOptIn
      ? {
          organizationId: params.organizationId,
          body: `How did the ref do at ${clip(params.eventLabel, 50)}? 20-second rating: ${params.surveyUrl}`,
        }
      : undefined,
  });
}
```

- [ ] **Step 4: Run tests, type check, commit**

```bash
npx vitest run tests/unit/feedback-emails.test.ts   # PASS (3 tests)
npx tsc --noEmit
git add src/lib/email/templates/feedback-referee-rating.tsx src/lib/email/send.ts tests/unit/feedback-emails.test.ts
git commit -m "feat(feedback): referee rating email"
```

---

### Task 11: Referee dispatch scan (recipients, daily cap)

**Files:**
- Modify: `src/lib/feedback/dispatch.ts` (scan 4 + daily cap + referee send path; remove the `referee_rating` skip in `resendPending`)
- Test: `tests/api/cron/dispatch-feedback-referee.test.ts`

**Interfaces:**
- Consumes: `games`, `gameOfficials`, `rosters`, `registrations`, `seasons`, `programs`, `locations`, `teams` tables; Task 10 `sendRefereeRatingEmail`.
- Produces: referee candidates flow through the same `dispatchFeedbackRequests()`; requests carry `gameOfficialId` + `metadata.gameType` + `metadata.refereeName`.

- [ ] **Step 1: Write the failing API test**

```typescript
// tests/api/cron/dispatch-feedback-referee.test.ts
import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  organizations,
  users,
  locations,
  sports,
  programs,
  seasons,
  teams,
  rosters,
  registrations,
  familyMembers,
  games,
  gameOfficials,
  feedbackRequests,
} from "@/lib/db/schema";

const ENDPOINT = "/api/cron/dispatch-feedback-requests";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "devsecret";

const runCron = () =>
  fetch(`${BASE}${ENDPOINT}`, {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
  });

/**
 * Full row graph: org (flag on) → location → sport → program(tournament) →
 * season → two teams → one rostered youth registration per team (distinct
 * parents) → completed game with one official.
 */
async function seedCompletedGame() {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Ref Org ${suffix}`,
      slug: `ref-org-${suffix}`,
      organizationType: "headquarters",
      features: { enableRefereeRatings: true },
    })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({ organizationId: org.id, name: `Loc ${suffix}`, slug: `loc-${suffix}` })
    .returning();

  const [sport] = await db
    .insert(sports)
    .values({ name: `Sport ${suffix}`, slug: `sport-${suffix}` })
    .returning();

  const [program] = await db
    .insert(programs)
    .values({
      locationId: location.id,
      sportId: sport.id,
      name: `Program ${suffix}`,
      slug: `program-${suffix}`,
      programType: "tournament",
    })
    .returning();

  const [season] = await db
    .insert(seasons)
    .values({
      programId: program.id,
      name: `Season ${suffix}`,
      slug: `season-${suffix}`,
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      priceCents: 10000,
    })
    .returning();

  async function seedParentWithRosteredKid(teamName: string) {
    const [team] = await db
      .insert(teams)
      .values({ seasonId: season.id, name: teamName })
      .returning();
    const p = Math.random().toString(36).slice(2, 10);
    const [parent] = await db
      .insert(users)
      .values({
        email: `ref-parent-${p}@test.example`,
        passwordHash: "x",
        firstName: "Parent",
        lastName: p,
      })
      .returning();
    const [kid] = await db
      .insert(familyMembers)
      .values({
        parentUserId: parent.id,
        firstName: "Kid",
        lastName: p,
        dateOfBirth: "2016-01-01",
      })
      .returning();
    const [registration] = await db
      .insert(registrations)
      .values({
        seasonId: season.id,
        familyMemberId: kid.id,
        registeredByUserId: parent.id,
        status: "confirmed",
        amountDueCents: 10000,
      })
      .returning();
    await db.insert(rosters).values({
      teamId: team.id,
      registrationId: registration.id,
      status: "active",
    });
    return { team, parent };
  }

  const home = await seedParentWithRosteredKid(`Home ${suffix}`);
  const away = await seedParentWithRosteredKid(`Away ${suffix}`);

  const [refUser] = await db
    .insert(users)
    .values({
      email: `ref-official-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Ref",
      lastName: "Official",
    })
    .returning();

  const [game] = await db
    .insert(games)
    .values({
      seasonId: season.id,
      homeTeamId: home.team.id,
      awayTeamId: away.team.id,
      scheduledAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      status: "completed",
      homeScore: 2,
      awayScore: 1,
    })
    .returning();

  const [official] = await db
    .insert(gameOfficials)
    .values({ gameId: game.id, userId: refUser.id, position: "referee" })
    .returning();

  return { org, game, official, homeParent: home.parent, awayParent: away.parent, refUser };
}

describe("referee-rating dispatch", () => {
  it("creates one request per roster parent for a completed game, tagged tournament", async () => {
    const { game, official, homeParent, awayParent } = await seedCompletedGame();

    const res = await runCron();
    expect(res.status).toBe(200);

    const db = getDb();
    const rows = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "referee_rating"),
          eq(feedbackRequests.targetId, game.id),
        ),
      );
    expect(rows.length).toBe(2);
    const recipients = rows.map((r) => r.recipientUserId).sort();
    expect(recipients).toEqual([homeParent.id, awayParent.id].sort());
    expect(rows.every((r) => r.gameOfficialId === official.id)).toBe(true);
    expect(rows.every((r) => r.metadata?.gameType === "tournament")).toBe(true);
    expect(rows.every((r) => r.status === "sent")).toBe(true);

    // Idempotent on re-run.
    await runCron();
    const again = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "referee_rating"),
          eq(feedbackRequests.targetId, game.id),
        ),
      );
    expect(again.length).toBe(2);
  });

  it("never asks the official about themselves", async () => {
    const { game, refUser } = await seedCompletedGame();
    await runCron();
    const rows = await getDb()
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "referee_rating"),
          eq(feedbackRequests.targetId, game.id),
          eq(feedbackRequests.recipientUserId, refUser.id),
        ),
      );
    expect(rows.length).toBe(0);
  });

  it("caps at one referee email per recipient per 24h", async () => {
    const { org, game, homeParent } = await seedCompletedGame();
    const db = getDb();

    // Recipient already got a referee ask 1 hour ago (different game).
    await db.insert(feedbackRequests).values({
      organizationId: org.id,
      brand: "aspire",
      kind: "referee_rating",
      targetId: crypto.randomUUID(),
      recipientUserId: homeParent.id,
      gameOfficialId: null,
      tokenHash: `refcap-${Math.random().toString(36).slice(2)}`,
      status: "sent",
      sentAt: new Date(Date.now() - 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      metadata: { eventLabel: "Earlier game" },
    });

    await runCron();

    const rows = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "referee_rating"),
          eq(feedbackRequests.targetId, game.id),
          eq(feedbackRequests.recipientUserId, homeParent.id),
        ),
      );
    expect(rows.length).toBe(0); // capped
  });
});
```

Adaptation note: `teams`, `locations`, `sports`, `familyMembers` NOT NULL columns may differ slightly — mirror the inserts in `tests/api/cron/send-welcome-series.test.ts`, which builds the same org→location→sport→program→season→registration graph.

- [ ] **Step 2: Run test to verify it fails**

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/cron/dispatch-feedback-referee.test.ts`
Expected: FAIL — zero referee requests created.

- [ ] **Step 3: Implement scan 4 in dispatch.ts**

Add imports (`games`, `gameOfficials`, `rosters`, `teams`, `familyMembers` as needed) plus `REFEREE_EXPIRY_DAYS`, `REFEREE_DAILY_CAP_HOURS`, `sendRefereeRatingEmail`, then:

```typescript
/** Scan 4: completed games with an official → adults on both rosters. */
async function scanRefereeRatings(now: Date, enabledOrgs: Set<string>): Promise<Candidate[]> {
  const db = getDb();
  const updatedAfter = new Date(now.getTime() - DISPATCH_LOOKBACK_DAYS * DAY_MS);

  const completedGames = await db
    .select({
      gameId: games.id,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      scheduledAt: games.scheduledAt,
      organizationId: locations.organizationId,
      programType: programs.programType,
      programName: programs.name,
    })
    .from(games)
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(and(eq(games.status, "completed"), gte(games.updatedAt, updatedAfter)));

  const candidates: Candidate[] = [];

  for (const game of completedGames) {
    if (!enabledOrgs.has(game.organizationId)) continue;

    const teamIds = [game.homeTeamId, game.awayTeamId].filter(
      (id): id is string => id !== null,
    );
    if (teamIds.length === 0) continue;

    // Head referee = earliest-assigned official (explicit orderBy: the CI DB
    // accumulates rows; see multi-tenant query hazards).
    const [official] = await db
      .select({
        id: gameOfficials.id,
        userId: gameOfficials.userId,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(gameOfficials)
      .innerJoin(users, eq(gameOfficials.userId, users.id))
      .where(eq(gameOfficials.gameId, game.gameId))
      .orderBy(sql`${gameOfficials.createdAt} ASC`)
      .limit(1);
    if (!official) continue;

    // Adults tied to both rosters: parents of youth players AND adult
    // self-registrants — both are registrations.registeredByUserId.
    const recipientRows = await db
      .selectDistinct({ userId: registrations.registeredByUserId, brand: registrations.brand })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .where(
        and(
          inArray(rosters.teamId, teamIds),
          eq(rosters.status, "active"),
          eq(registrations.status, "confirmed"),
        ),
      );

    const refereeName = `${official.firstName ?? "The"} ${(official.lastName ?? "referee").charAt(0)}.`;
    const gameType = game.programType === "tournament" ? "tournament" : "league";
    const eventLabel = `${game.programName} — ${formatEventDate(game.scheduledAt)}`;

    for (const recipient of recipientRows) {
      if (recipient.userId === official.userId) continue; // never self-rate
      candidates.push({
        organizationId: game.organizationId,
        brand: recipient.brand,
        kind: "referee_rating",
        targetId: game.gameId,
        recipientUserId: recipient.userId,
        gameOfficialId: official.id,
        metadata: { eventLabel, gameType, refereeName },
        expiryDays: REFEREE_EXPIRY_DAYS,
      });
    }
  }

  return candidates;
}

/** True when the recipient got ANY referee-rating ask in the cap window. */
async function inRefereeDailyCap(recipientUserId: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - REFEREE_DAILY_CAP_HOURS * HOUR_MS);
  const [row] = await getDb()
    .select({ id: feedbackRequests.id })
    .from(feedbackRequests)
    .where(
      and(
        eq(feedbackRequests.recipientUserId, recipientUserId),
        eq(feedbackRequests.kind, "referee_rating"),
        gte(feedbackRequests.sentAt, cutoff),
      ),
    )
    .orderBy(sql`${feedbackRequests.sentAt} DESC`)
    .limit(1);
  return row !== undefined;
}
```

Wire into `dispatchFeedbackRequests`:

```typescript
  const refOrgs = await orgsWithFeature("enableRefereeRatings");
  // Most recent game first so the daily cap anchors to the latest game.
  const refereeCandidates = (await scanRefereeRatings(now, refOrgs)).sort((a, b) =>
    (b.metadata.eventLabel ?? "").localeCompare(a.metadata.eventLabel ?? ""),
  );

  for (const candidate of refereeCandidates) {
    if (await inRefereeDailyCap(candidate.recipientUserId, now)) {
      result.skippedCooldown += 1;
      continue;
    }
    const outcome = await createAndSend(candidate, now);
    if (outcome === "created_sent") {
      result.created += 1;
      result.sent += 1;
    } else if (outcome === "error") {
      result.errors += 1;
    }
  }
```

Anchoring note: `scanRefereeRatings` returns games from the completed-games query; to anchor "most recent game" correctly, sort `refereeCandidates` by the underlying game `scheduledAt` descending — add `scheduledAt` to `Candidate.metadata`-adjacent local sort data (simplest: return candidates already sorted by building them from `completedGames` sorted `scheduledAt DESC`, then drop the `.sort()` above and note the ordering guarantee in a comment).

In `createAndSend`, branch on kind for the send:

```typescript
    if (candidate.kind === "referee_rating") {
      await sendRefereeRatingEmail({
        to: recipient.email,
        userId: candidate.recipientUserId,
        organizationId: candidate.organizationId,
        brand,
        recipientName: recipient.firstName ?? "there",
        eventLabel: candidate.metadata.eventLabel,
        refereeName: candidate.metadata.refereeName ?? "the referee",
        surveyUrl,
        smsOptIn,
      });
    } else {
      await sendNpsSurveyEmail({
        to: recipient.email,
        userId: candidate.recipientUserId,
        organizationId: candidate.organizationId,
        brand,
        recipientName: recipient.firstName ?? "there",
        eventLabel: candidate.metadata.eventLabel,
        surveyUrl,
        smsOptIn,
      });
    }
```

In `resendPending`, delete the `if (row.kind === "referee_rating") continue;` line and apply the same kind branch.

- [ ] **Step 4: Run the tests**

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/cron/dispatch-feedback-referee.test.ts tests/api/cron/dispatch-feedback-requests.test.ts`
Expected: PASS (7 tests — both new and Phase 1 suites).

- [ ] **Step 5: Type check and commit**

```bash
npx tsc --noEmit
git add src/lib/feedback/dispatch.ts tests/api/cron/dispatch-feedback-referee.test.ts
git commit -m "feat(feedback): referee-rating dispatch with roster recipients + daily cap"
```

---

### Task 12: Referee rating form + submit endpoint

**Files:**
- Create: `src/pages/api/feedback/[token]/referee.ts`
- Create: `src/components/feedback/referee-rating-form.tsx`
- Modify: `src/components/feedback/feedback-form.tsx` (replace the referee placeholder)
- Test: `tests/api/public/feedback-referee-submit.test.ts`

**Interfaces:**
- Consumes: Task 1 `refereeRatings`, Task 6 lookup/claim pattern.
- Produces: `POST /api/feedback/[token]/referee` body `{ overall, gameControl, communication, fairness: number (1-5 each), comment?: string }` → `{ ok: true }`.

- [ ] **Step 1: Write the failing API test**

```typescript
// tests/api/public/feedback-referee-submit.test.ts
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  organizations,
  users,
  locations,
  sports,
  programs,
  seasons,
  games,
  gameOfficials,
  feedbackRequests,
  refereeRatings,
} from "@/lib/db/schema";
import { generateFeedbackToken, hashFeedbackToken } from "@/lib/feedback/tokens";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

/** Sent referee-rating request pointing at a real completed game + official. */
async function seedRefereeRequest() {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `RefSubmit ${suffix}`,
      slug: `ref-submit-${suffix}`,
      organizationType: "headquarters",
    })
    .returning();
  const [location] = await db
    .insert(locations)
    .values({ organizationId: org.id, name: `Loc ${suffix}`, slug: `loc-${suffix}` })
    .returning();
  const [sport] = await db
    .insert(sports)
    .values({ name: `Sport ${suffix}`, slug: `sport-${suffix}` })
    .returning();
  const [program] = await db
    .insert(programs)
    .values({
      locationId: location.id,
      sportId: sport.id,
      name: `Program ${suffix}`,
      slug: `program-${suffix}`,
      programType: "league",
    })
    .returning();
  const [season] = await db
    .insert(seasons)
    .values({
      programId: program.id,
      name: `Season ${suffix}`,
      slug: `season-${suffix}`,
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      priceCents: 10000,
    })
    .returning();
  const [game] = await db
    .insert(games)
    .values({
      seasonId: season.id,
      scheduledAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      status: "completed",
    })
    .returning();
  const [refUser] = await db
    .insert(users)
    .values({
      email: `refsubmit-ref-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Ref",
      lastName: "User",
    })
    .returning();
  const [official] = await db
    .insert(gameOfficials)
    .values({ gameId: game.id, userId: refUser.id, position: "referee" })
    .returning();
  const [rater] = await db
    .insert(users)
    .values({
      email: `refsubmit-rater-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Rater",
      lastName: "User",
    })
    .returning();

  const token = generateFeedbackToken();
  const [request] = await db
    .insert(feedbackRequests)
    .values({
      organizationId: org.id,
      brand: "aspire",
      kind: "referee_rating",
      targetId: game.id,
      recipientUserId: rater.id,
      gameOfficialId: official.id,
      tokenHash: hashFeedbackToken(token),
      status: "sent",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      metadata: { eventLabel: "League game", gameType: "league", refereeName: "Ref U." },
    })
    .returning();

  return { token, request, game, refUser };
}

const post = (path: string, body: unknown) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/feedback/[token]/referee", () => {
  it("saves a rating with denormalized game + referee", async () => {
    const { token, request, game, refUser } = await seedRefereeRequest();

    const res = await post(`/api/feedback/${token}/referee`, {
      overall: 4,
      gameControl: 5,
      communication: 4,
      fairness: 3,
      comment: "Kept the game safe",
    });
    expect(res.status).toBe(200);

    const [row] = await getDb()
      .select()
      .from(refereeRatings)
      .where(eq(refereeRatings.requestId, request.id));
    expect(row.overall).toBe(4);
    expect(row.gameId).toBe(game.id);
    expect(row.refereeUserId).toBe(refUser.id);
    expect(row.comment).toBe("Kept the game safe");
  });

  it("is single-use", async () => {
    const { token } = await seedRefereeRequest();
    const body = { overall: 3, gameControl: 3, communication: 3, fairness: 3 };
    await post(`/api/feedback/${token}/referee`, body);
    const second = await post(`/api/feedback/${token}/referee`, body);
    expect(second.status).toBe(409);
  });

  it("rejects out-of-range dimensions", async () => {
    const { token } = await seedRefereeRequest();
    const res = await post(`/api/feedback/${token}/referee`, {
      overall: 6,
      gameControl: 3,
      communication: 3,
      fairness: 3,
    });
    expect(res.status).toBe(400);
  });

  it("rejects NPS tokens on this endpoint", async () => {
    const db = getDb();
    const suffix = Math.random().toString(36).slice(2, 10);
    const [org] = await db
      .insert(organizations)
      .values({ name: `X ${suffix}`, slug: `x-${suffix}`, organizationType: "headquarters" })
      .returning();
    const [user] = await db
      .insert(users)
      .values({ email: `x-${suffix}@test.example`, passwordHash: "x", firstName: "X", lastName: "Y" })
      .returning();
    const token = generateFeedbackToken();
    await db.insert(feedbackRequests).values({
      organizationId: org.id,
      brand: "aspire",
      kind: "nps_drop_in",
      targetId: crypto.randomUUID(),
      recipientUserId: user.id,
      tokenHash: hashFeedbackToken(token),
      status: "sent",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: { eventLabel: "x" },
    });

    const res = await post(`/api/feedback/${token}/referee`, {
      overall: 3,
      gameControl: 3,
      communication: 3,
      fairness: 3,
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/feedback-referee-submit.test.ts`
Expected: FAIL — 404.

- [ ] **Step 3: Implement the endpoint**

```typescript
// src/pages/api/feedback/[token]/referee.ts
import type { APIRoute } from "astro";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { feedbackRequests, refereeRatings, gameOfficials } from "@/lib/db/schema";
import { hashFeedbackToken } from "@/lib/feedback/tokens";
import { getFeedbackRequestByToken } from "@/lib/feedback/lookup";

export const prerender = false;

const dimension = z.number().int().min(1).max(5);
const bodySchema = z.object({
  overall: dimension,
  gameControl: dimension,
  communication: dimension,
  fairness: dimension,
  comment: z.string().trim().max(2000).optional(),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request }) => {
  const token = params.token ?? "";

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) return json(400, { error: "All ratings must be integers 1-5" });

  const db = getDb();
  const now = new Date();

  // Peek first: a non-referee token must not be claimed by this endpoint.
  const peek = await getFeedbackRequestByToken(token);
  if (!peek) return json(404, { error: "Unknown link" });
  if (peek.kind !== "referee_rating")
    return json(400, { error: "This link is a survey, not a referee rating" });

  const [claimed] = await db
    .update(feedbackRequests)
    .set({ status: "responded", respondedAt: now })
    .where(
      and(
        eq(feedbackRequests.tokenHash, hashFeedbackToken(token)),
        eq(feedbackRequests.status, "sent"),
        gt(feedbackRequests.expiresAt, now),
      ),
    )
    .returning();

  if (!claimed) {
    if (peek.status === "responded") return json(409, { error: "Already answered" });
    if (peek.expiresAt <= now) return json(410, { error: "Link expired" });
    return json(409, { error: "Link not active" });
  }

  // Resolve the rated official → denormalized refereeUserId.
  if (!claimed.gameOfficialId) return json(500, { error: "Rating target missing" });
  const [official] = await db
    .select({ userId: gameOfficials.userId })
    .from(gameOfficials)
    .where(eq(gameOfficials.id, claimed.gameOfficialId))
    .limit(1);
  if (!official) return json(500, { error: "Rating target missing" });

  await db.insert(refereeRatings).values({
    requestId: claimed.id,
    gameId: claimed.targetId,
    refereeUserId: official.userId,
    overall: parsed.data.overall,
    gameControl: parsed.data.gameControl,
    communication: parsed.data.communication,
    fairness: parsed.data.fairness,
    comment: parsed.data.comment?.length ? parsed.data.comment : null,
  });

  return json(200, { ok: true });
};
```

(`gameOfficials.id` is the primary key, so `.limit(1)` needs no `orderBy`.)

- [ ] **Step 4: Run test to verify it passes**

Run: same as Step 2. Expected: PASS (4 tests).

- [ ] **Step 5: Build the form and wire it in**

```tsx
// src/components/feedback/referee-rating-form.tsx
"use client";

import { useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";

interface RefereeRatingFormProps {
  token: string;
  eventLabel: string | null;
  refereeName: string | null;
  onDone: () => void;
}

const DIMENSIONS = [
  { key: "gameControl", label: "Game control & safety" },
  { key: "communication", label: "Communication & professionalism" },
  { key: "fairness", label: "Fairness & consistency" },
] as const;

type DimensionKey = (typeof DIMENSIONS)[number]["key"];

export function RefereeRatingForm({ token, eventLabel, refereeName, onDone }: RefereeRatingFormProps) {
  const [overall, setOverall] = useState<number | null>(null);
  const [dims, setDims] = useState<Record<DimensionKey, number | null>>({
    gameControl: null,
    communication: null,
    fairness: null,
  });
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const complete = overall !== null && DIMENSIONS.every((d) => dims[d.key] !== null);

  async function submit() {
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${token}/referee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overall,
          gameControl: dims.gameControl,
          communication: dims.communication,
          fairness: dims.fairness,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const jsonBody = await res.json().catch(() => ({}));
        setError(jsonBody.error ?? "Something went wrong — try again.");
        return;
      }
      onDone();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-white p-8 shadow-sm">
      <h1 className="mb-1 text-xl font-semibold">
        Rate {refereeName ?? "the referee"}
      </h1>
      {eventLabel && <p className="mb-4 text-muted-foreground">{eventLabel}</p>}
      <p className="mb-4 text-xs text-muted-foreground">
        Anonymous — goes only to league staff, never to the referee.
      </p>
      {error && <ErrorBanner message={error} />}

      <StarRow
        label="Overall"
        value={overall}
        onSelect={setOverall}
        testId="overall"
      />
      {DIMENSIONS.map((d) => (
        <StarRow
          key={d.key}
          label={d.label}
          value={dims[d.key]}
          onSelect={(v) => setDims((prev) => ({ ...prev, [d.key]: v }))}
          testId={d.key}
        />
      ))}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Anything staff should know? (optional)"
        data-testid="referee-comment"
        className="mb-4 mt-2 w-full rounded-md border p-3"
      />
      <button
        onClick={submit}
        disabled={!complete || busy}
        data-testid="referee-submit"
        className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-50"
      >
        Submit rating
      </button>
    </div>
  );
}

function StarRow({
  label,
  value,
  onSelect,
  testId,
}: {
  label: string;
  value: number | null;
  onSelect: (v: number) => void;
  testId: string;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-sm font-medium">{label}</div>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => onSelect(star)}
            aria-label={`${label}: ${star} of 5`}
            data-testid={`${testId}-star-${star}`}
            className={`rounded-md border px-3 py-2 text-lg ${
              value !== null && star <= value ? "bg-primary text-primary-foreground" : ""
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}
```

In `feedback-form.tsx`, replace the referee placeholder branch with:

```tsx
  if (props.kind === "referee_rating") {
    return <RefereeBranch token={props.token} eventLabel={props.eventLabel} refereeName={props.refereeName} />;
  }
```

…and add (plus the import of `RefereeRatingForm`):

```tsx
function RefereeBranch({
  token,
  eventLabel,
  refereeName,
}: {
  token: string;
  eventLabel: string | null;
  refereeName: string | null;
}) {
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <TerminalCard
        title="Thank you!"
        body="Your rating helps us keep officiating quality high."
      />
    );
  }
  return (
    <RefereeRatingForm
      token={token}
      eventLabel={eventLabel}
      refereeName={refereeName}
      onDone={() => setDone(true)}
    />
  );
}
```

- [ ] **Step 6: Type check and commit**

```bash
npx tsc --noEmit
git add src/pages/api/feedback/ src/components/feedback/ tests/api/public/feedback-referee-submit.test.ts
git commit -m "feat(feedback): referee rating form + submit endpoint"
```

---

### Task 13: Admin referee-ratings report (API + page)

**Files:**
- Create: `src/pages/api/admin/reports/referee-ratings.ts`
- Create: `src/pages/admin/reports/referee-ratings.astro`
- Create: `src/components/admin/reports/referee-ratings-report.tsx`
- Test: `tests/api/admin/reports-referee-ratings.test.ts`

**Interfaces:**
- Consumes: Task 1 tables; admin auth helpers.
- Produces: `GET /api/admin/reports/referee-ratings` → `{ referees: Array<{ refereeUserId: string, name: string, count: number, avgOverall: number, avgGameControl: number, avgCommunication: number, avgFairness: number, leagueCount: number, tournamentCount: number, lowSample: boolean }>, recentComments: Array<{ comment: string, overall: number, gameType: string | null, eventLabel: string | null, createdAt: string }> }`. **Rater identity is never included.**

- [ ] **Step 1: Write the failing API test**

```typescript
// tests/api/admin/reports-referee-ratings.test.ts
import { describe, it, expect } from "vitest";
import { signInAsAdmin } from "../../utils/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/admin/reports/referee-ratings", () => {
  it("requires admin auth", async () => {
    const res = await fetch(`${BASE}/api/admin/reports/referee-ratings`);
    expect([401, 403]).toContain(res.status);
  });

  it("returns the report shape without rater identity", async () => {
    const cookie = await signInAsAdmin(BASE);
    const res = await fetch(`${BASE}/api/admin/reports/referee-ratings`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.referees)).toBe(true);
    expect(Array.isArray(json.recentComments)).toBe(true);
    const payload = JSON.stringify(json);
    expect(payload).not.toContain("recipientUserId");
    expect(payload).not.toContain("raterUserId");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/reports-referee-ratings.test.ts`
Expected: FAIL — 404.

- [ ] **Step 3: Implement the API**

```typescript
// src/pages/api/admin/reports/referee-ratings.ts
import type { APIRoute } from "astro";
import { and, eq, gte, desc, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { feedbackRequests, refereeRatings, users } from "@/lib/db/schema";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";

export const prerender = false;

const WINDOW_DAYS = 180;
/** Below this rating count, averages get a low-sample badge in the UI. */
const LOW_SAMPLE_THRESHOLD = 5;

const round1 = (n: number) => Math.round(n * 10) / 10;

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const db = getDb();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Join through feedback_requests ONLY for org scoping + game metadata —
  // recipientUserId (the rater) is deliberately never selected.
  const rows = await db
    .select({
      refereeUserId: refereeRatings.refereeUserId,
      refFirstName: users.firstName,
      refLastName: users.lastName,
      overall: refereeRatings.overall,
      gameControl: refereeRatings.gameControl,
      communication: refereeRatings.communication,
      fairness: refereeRatings.fairness,
      comment: refereeRatings.comment,
      createdAt: refereeRatings.createdAt,
      metadata: feedbackRequests.metadata,
    })
    .from(refereeRatings)
    .innerJoin(feedbackRequests, eq(refereeRatings.requestId, feedbackRequests.id))
    .innerJoin(users, eq(refereeRatings.refereeUserId, users.id))
    .where(
      and(
        eq(feedbackRequests.organizationId, orgContext.organizationId),
        gte(refereeRatings.createdAt, cutoff),
      ),
    )
    .orderBy(desc(refereeRatings.createdAt));

  const byReferee = new Map<string, typeof rows>();
  for (const row of rows) {
    byReferee.set(row.refereeUserId, [...(byReferee.get(row.refereeUserId) ?? []), row]);
  }

  const referees = [...byReferee.entries()]
    .map(([refereeUserId, ratings]) => {
      const avg = (pick: (r: (typeof ratings)[number]) => number) =>
        round1(ratings.reduce((sum, r) => sum + pick(r), 0) / ratings.length);
      return {
        refereeUserId,
        name: `${ratings[0].refFirstName ?? ""} ${ratings[0].refLastName ?? ""}`.trim(),
        count: ratings.length,
        avgOverall: avg((r) => r.overall),
        avgGameControl: avg((r) => r.gameControl),
        avgCommunication: avg((r) => r.communication),
        avgFairness: avg((r) => r.fairness),
        leagueCount: ratings.filter((r) => r.metadata?.gameType === "league").length,
        tournamentCount: ratings.filter((r) => r.metadata?.gameType === "tournament").length,
        lowSample: ratings.length < LOW_SAMPLE_THRESHOLD,
      };
    })
    .sort((a, b) => b.count - a.count);

  const recentComments = rows
    .filter((r) => r.comment !== null)
    .slice(0, 50)
    .map((r) => ({
      comment: r.comment as string,
      overall: r.overall,
      gameType: r.metadata?.gameType ?? null,
      eventLabel: r.metadata?.eventLabel ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

  return new Response(JSON.stringify({ referees, recentComments }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: same as Step 2. Expected: PASS (2 tests).

- [ ] **Step 5: Build the page + component**

`src/pages/admin/reports/referee-ratings.astro` mirrors `nps.astro` (Task 8 Step 5) with `currentPath="/admin/reports/referee-ratings"`, title `Referee ratings — Reports — Admin`, rendering `<RefereeRatingsReport client:load />`.

```tsx
// src/components/admin/reports/referee-ratings-report.tsx
"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

interface RefereeRow {
  refereeUserId: string;
  name: string;
  count: number;
  avgOverall: number;
  avgGameControl: number;
  avgCommunication: number;
  avgFairness: number;
  leagueCount: number;
  tournamentCount: number;
  lowSample: boolean;
}

interface ReportData {
  referees: RefereeRow[];
  recentComments: Array<{
    comment: string;
    overall: number;
    gameType: string | null;
    eventLabel: string | null;
    createdAt: string;
  }>;
}

export function RefereeRatingsReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/reports/referee-ratings");
        if (!res.ok) throw new Error("Failed to load referee ratings");
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Referee ratings</h1>
        <p className="text-sm text-muted-foreground">
          Last 180 days. Ratings are anonymous — raters are never shown.
        </p>
      </div>

      <div className="rounded-lg border bg-white p-4">
        {data.referees.length === 0 ? (
          <EmptyState
            title="No ratings yet"
            description="Ratings appear once parents respond to post-game asks."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4">Referee</th>
                  <th className="py-1 pr-4">Ratings</th>
                  <th className="py-1 pr-4">Overall</th>
                  <th className="py-1 pr-4">Game control</th>
                  <th className="py-1 pr-4">Communication</th>
                  <th className="py-1 pr-4">Fairness</th>
                  <th className="py-1">League / Tourn.</th>
                </tr>
              </thead>
              <tbody>
                {data.referees.map((r) => (
                  <tr key={r.refereeUserId} className="border-t">
                    <td className="py-2 pr-4">
                      {r.name}
                      {r.lowSample && (
                        <span
                          className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800"
                          title="Fewer than 5 ratings — treat the averages as anecdotal"
                        >
                          low sample
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{r.count}</td>
                    <td className="py-2 pr-4 font-medium">{r.avgOverall}</td>
                    <td className="py-2 pr-4">{r.avgGameControl}</td>
                    <td className="py-2 pr-4">{r.avgCommunication}</td>
                    <td className="py-2 pr-4">{r.avgFairness}</td>
                    <td className="py-2">
                      {r.leagueCount} / {r.tournamentCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-medium">Recent comments (anonymous)</h2>
        {data.recentComments.length === 0 ? (
          <EmptyState title="No comments yet" description="Free-text comments show up here." />
        ) : (
          <ul className="divide-y">
            {data.recentComments.map((c, i) => (
              <li key={i} className="py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{c.overall}/5</span>
                  {c.eventLabel && <span>{c.eventLabel}</span>}
                  {c.gameType && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{c.gameType}</span>}
                </div>
                <p className="mt-1 text-sm">{c.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

Also add a "Referee ratings" link/card to `src/pages/admin/reports/index.astro`.

- [ ] **Step 6: Type check and commit**

```bash
npx tsc --noEmit
git add src/pages/api/admin/reports/referee-ratings.ts src/pages/admin/reports/referee-ratings.astro src/pages/admin/reports/index.astro src/components/admin/reports/referee-ratings-report.tsx tests/api/admin/reports-referee-ratings.test.ts
git commit -m "feat(feedback): admin referee-ratings report"
```

---

### Task 14: E2E referee spec + seed

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts` (extend `seedFeedbackFixtures`)
- Create: `tests/e2e/feedback-referee.spec.ts`

- [ ] **Step 1: Extend the seed**

In `seedFeedbackFixtures()`, after the NPS fixture, add a referee fixture with fixed token `e2e-feedback-referee-open`: reuse the seed's existing season (query `seasons` scoped to the seed org, `orderBy asc(createdAt)`, `limit 1`), insert a completed `games` row (null teams are fine — the form doesn't need rosters), a `gameOfficials` row pointing at the seeded coach user (`coach@test.aspiresports.com`), and a `feedback_requests` row (`kind: "referee_rating"`, `targetId: game.id`, `gameOfficialId`, recipient = the parent test user, `metadata: { eventLabel: "E2E League Game", gameType: "league", refereeName: "Coach T." }`). Delete-by-tokenHash first, same reset pattern as the NPS fixture. Also flip `enableRefereeRatings: true` in the same features update.

- [ ] **Step 2: Write the spec**

```typescript
// tests/e2e/feedback-referee.spec.ts
import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

const TOKEN = "e2e-feedback-referee-open";

test("referee rating: all dimensions + submit", async ({ page }) => {
  await page.goto(`/feedback/${TOKEN}`);
  await waitForHydration(page);

  await expect(page.getByText(/rate coach t\./i)).toBeVisible();

  await page.getByTestId("overall-star-4").click();
  await page.getByTestId("gameControl-star-5").click();
  await page.getByTestId("communication-star-4").click();
  await page.getByTestId("fairness-star-3").click();
  await page.getByTestId("referee-comment").fill("Kept things safe");
  await page.getByTestId("referee-submit").click();

  await expect(page.getByText("Thank you!")).toBeVisible();

  // Single-use.
  await page.goto(`/feedback/${TOKEN}`);
  await waitForHydration(page);
  await expect(page.getByText(/already shared/i)).toBeVisible();
});
```

- [ ] **Step 3: Run locally**

```bash
npm run db:seed:e2e
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- feedback-referee
```
Expected: PASS. (Token is consumed — re-seed before re-running.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/seeds/seed-e2e-tests.ts tests/e2e/feedback-referee.spec.ts
git commit -m "test(feedback): e2e referee rating flow + seed fixture"
```

---

### Task 15: Full verification sweep (pre-push checklist)

No new files — this is the CLAUDE.md "major work" checklist, required because this branch touches schema, endpoints, and E2E flows.

- [ ] **Step 1:** Confirm the migration is committed (`git log --stat -- src/lib/db/migrations/` shows the Task 1 file).
- [ ] **Step 2:** `npm run db:seed:e2e` — completes cleanly.
- [ ] **Step 3:** `CRON_SECRET=<same-as-dev-server> TEST_BASE_URL=http://localhost:4321 npm run test:api` — full API suite green (not just the new files).
- [ ] **Step 4:** `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test` — full Playwright suite green (new specs won't gate the PR; they run post-merge).
- [ ] **Step 5:** `npm run build` — no SSR/prerender errors.
- [ ] **Step 6:** `npx tsc --noEmit` — zero errors.
- [ ] **Step 7:** Commit any stragglers, push the branch, open a PR, and wait for CI green on the pushed commit before calling it done.

---

## Self-Review Notes (already applied)

- Spec coverage: schema/settings (T1-T2), caps + dispatch + cron (T5, T11), email single-CTA decision (T4, T10), public page states + atomic single-use (T6, T12), review funnel + detractor alert (T6), graceful missing-URL degradation (T6 API `reviewUrl: null` + T8 dashboard warning), admin settings (T7), both dashboards incl. low-sample badge and anonymity (T8, T13), tests per repo layout (unit T3/T4, api T2/T5/T6/T11/T12/T13, e2e T9/T14), flags default off (T2, enforced in T5/T11 scans).
- Known intentional deviations from spec, agreed during planning: detractor alert fires on score submission (comment may arrive after; alert says so); rentals without a linked user account are skipped (recipient requires a users.id); referee "one per day" cap uses a rolling 24h window.
- Type consistency: `Candidate`, `DispatchResult`, `FeedbackPageData`, endpoint bodies, and report payloads are defined once in their producing task and referenced verbatim by consumers.





