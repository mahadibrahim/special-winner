# Rental Blocks — Core Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin build a multi-month recurring field-rental block in one pass, take a deposit that holds every session, and track the balance to collection.

**Architecture:** A new `field_rental_blocks` parent row whose children are ordinary `field_rentals` rows carrying `block_id`, so every existing rental mechanism (advisory-lock conflict checks, the field-time ledger, waivers, check-in, reschedule, refunds) keeps working unchanged. A recurring pattern is only a *generator*: it produces a session list that the admin edits directly, which is how skip-dates, multiple days, multiple fields and per-day times are all expressed through one mechanism. Money lives on the block row; sessions carry pro-rated amounts but stay unpaid until the block is settled.

**Tech Stack:** Astro 5 (SSR), React 19 islands, Drizzle ORM + PostgreSQL, Stripe Checkout, Vitest (unit + API integration), Playwright (E2E), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-08-14-rental-blocks-design.md`

**Companion plan:** `2026-08-14-rental-blocks-visibility.md` (calendar, recurring-slot finder, rate-card UI, dashboard grouping). Build this plan first.

## Global Constraints

- **Worktree:** all work happens in `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/rental-blocks` on branch `feat/rental-blocks`. Never switch the primary checkout (it sits on `feat/seo-content-phase-a`). Use absolute paths in every command.
- **Money is whole dollars.** Storage stays integer cents; every block-related cents value MUST be a multiple of 100. No cents input field anywhere in the UI. Display `$2,808`, never `$2,808.00`.
- **Per-session allocation must sum exactly to `total_cents`**, remainder dollars onto the first session.
- **All local-time arithmetic goes through `zonedMinuteToUtc`** from `@/lib/activity-tracking/tz-day`. Never add `7 * 24 * 3600_000` to advance a week.
- **Every admin endpoint** validates tenancy: `requireOrgAdminAccess(context)` from `@/lib/auth/roles` for org-scoped reads/writes, plus `requireSameOrgLocation` / `requireSameOrgVenue` from `@/lib/auth/require-resource-ownership.ts` when a location or venue id arrives in the body.
- **Prerender:** every page in this plan is SSR. Do not add `export const prerender = true`.
- **UI primitives:** `ErrorBanner`, `EmptyState`, `LoadingSkeleton` from `@/components/ui/`; `toast` from `sonner` for action errors. Top-level `client:load` islands call `useHydrationBeacon()`.
- **Enum migrations ship alone.** Adding `field_rental_block_status` is its own migration file, written idempotently.
- **Storefront drives branding AND pricing.** `brand === "soccerone"` → `quoteRentalCents`; otherwise `computeRentalPriceCents` + `resolveRentalHourlyRateCents`. Never read `locals.brandId` for block pricing — an admin builds from the Aspire host.
- **Quote markers never enter the ledger.** They live in `field_rental_block_quote_slots` and are read for display only.
- **Commit after every task.** Conventional-commit subjects (`feat(rentals): …`, `fix(rentals): …`, `test(rentals): …`).

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/lib/db/schema/field-rental-blocks.ts` | `field_rental_blocks`, `field_rental_block_quote_slots`, block status enum, types |
| `src/lib/rentals/blocks/generate.ts` | Pure: pattern → session list. DST-correct. |
| `src/lib/rentals/blocks/pricing.ts` | Pure: subtotal, discount, deposit, per-session allocation. Whole dollars. |
| `src/lib/rentals/blocks/create.ts` | Transactional commit of a block + its sessions; draft save; quote markers |
| `src/lib/rentals/blocks/quote-markers.ts` | Write/read/expire non-blocking markers |
| `src/lib/rentals/blocks/lifecycle.ts` | Deposit paid, balance paid, expire unpaid, cancel remaining, complete |
| `src/lib/rentals/blocks/messages.ts` | Quote, deposit, balance, confirmation dispatch (brand-aware) |
| `src/lib/email/templates/rental-block-quote.tsx` | Quote/deposit email body |
| `src/lib/email/templates/rental-block-confirmation.tsx` | Confirmed schedule email body |
| `src/lib/stripe/handle-rental-block-deposit-complete.ts` | Webhook: deposit → block active, sessions confirmed |
| `src/lib/stripe/handle-rental-block-balance-complete.ts` | Webhook: balance → sessions paid |
| `src/components/admin/rentals/blocks/BlockBuilder.tsx` | Orchestrates the four panels |
| `src/components/admin/rentals/blocks/PatternPanel.tsx` | Storefront, location, day rows, date range |
| `src/components/admin/rentals/blocks/SessionTable.tsx` | Editable generated session list |
| `src/components/admin/rentals/blocks/PricePanel.tsx` | Subtotal, discount, deposit, balance date |
| `src/components/admin/rentals/blocks/BlocksList.tsx` | Blocks tab |
| `src/components/admin/rentals/blocks/BlockDetail.tsx` | Block detail + actions |
| `src/components/rentals/BlockQuotePage.tsx` | Public quote → deposit → balance island |
| `src/pages/admin/rentals/blocks/index.astro` | Blocks tab page |
| `src/pages/admin/rentals/blocks/new.astro` | Builder page |
| `src/pages/admin/rentals/blocks/[id].astro` | Block detail page |
| `src/pages/rentals/blocks/[token].astro` | Public tokenized quote page |
| `src/pages/api/admin/rentals/blocks/index.ts` | `GET` list, `POST` create |
| `src/pages/api/admin/rentals/blocks/[id].ts` | `GET`, `PATCH` (edit/cancel) |
| `src/pages/api/admin/rentals/blocks/[id]/deposit-link.ts` | Send/resend deposit link |
| `src/pages/api/admin/rentals/blocks/[id]/balance-link.ts` | Send balance link now |
| `src/pages/api/admin/rentals/blocks/generate-preview.ts` | Pattern → priced sessions + conflict reasons |
| `src/pages/api/rentals/blocks/[token]/index.ts` | Public read by token |
| `src/pages/api/rentals/blocks/[token]/pay.ts` | Mint Checkout for deposit or balance |
| `src/pages/api/cron/rental-block-sweeps.ts` | Expire unpaid blocks + balance reminders |
| `netlify/functions/scheduled-rental-block-sweeps.ts` | Netlify schedule wrapper |

**Modify**

| File | Change |
|---|---|
| `src/lib/db/schema/field-rentals.ts` | Add `blockId` column + index; add rate-card columns |
| `src/lib/db/schema/self-service-tokens.ts` | Add `"rental_block"` to `selfServiceTokenKindEnum` |
| `src/lib/rentals/expire.ts` | `expirePendingRentals` gains `block_id IS NULL` |
| `src/lib/scheduling/sync.ts` | Export `topLevelResource` as `resolveTopLevelResourceId` |
| `src/lib/stripe/handle-stripe-event.ts` | Dispatch the two new `metadata.type` values |
| `src/components/admin/rentals/RentalsList.tsx` | Add a "Block" column linking to the parent |
| `src/pages/admin/rentals/index.astro` | Link to the Blocks tab |

---

### Task 1: Schema and migrations

**Files:**
- Create: `src/lib/db/schema/field-rental-blocks.ts`
- Modify: `src/lib/db/schema/field-rentals.ts`
- Modify: `src/lib/db/schema/self-service-tokens.ts:17-30`
- Modify: `src/lib/db/schema/index.ts` (re-export the new module — match how `field-rentals` is exported)
- Create: `src/lib/db/migrations/NNNN_rental_block_status_enum.sql`
- Create: `src/lib/db/migrations/NNNN_rental_blocks.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `fieldRentalBlocks`, `fieldRentalBlockQuoteSlots`, `fieldRentalBlockStatusEnum`, `type FieldRentalBlock`, `type NewFieldRentalBlock`; `fieldRentals.blockId`; `fieldRentalRateCard.depositPct` / `.balanceDueLeadDays` / `.blockHoldHours` / `.quoteMarkerTtlDays`; token kind `"rental_block"`.

- [ ] **Step 1: Write the schema module**

Create `src/lib/db/schema/field-rental-blocks.ts`:

```ts
import {
  pgTable, pgEnum, uuid, text, varchar, timestamp, integer, jsonb, index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { locations, venues } from "./teams";
import { users } from "./users";
import { fieldRentalPaymentMethodEnum } from "./field-rentals";

export const fieldRentalBlockStatusEnum = pgEnum("field_rental_block_status", [
  "draft",
  "awaiting_deposit",
  "active",
  "completed",
  "cancelled",
]);

export const fieldRentalBlocks = pgTable(
  "field_rental_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    brand: varchar("brand", { length: 20 }).notNull().default("soccerone"),
    label: text("label").notNull(),

    renterUserId: uuid("renter_user_id").references(() => users.id, { onDelete: "set null" }),
    renterName: text("renter_name").notNull(),
    renterEmail: text("renter_email"),
    renterPhone: text("renter_phone"),
    partySize: integer("party_size").notNull().default(1),
    purpose: text("purpose"),
    notes: text("notes"),

    // Generator input plus the admin's per-row edits, so a draft can be reopened.
    pattern: jsonb("pattern"),

    subtotalCents: integer("subtotal_cents").notNull().default(0),
    discountKind: varchar("discount_kind", { length: 10 }),
    discountValue: integer("discount_value"),
    totalCents: integer("total_cents").notNull().default(0),

    depositPctSnapshot: integer("deposit_pct_snapshot"),
    depositDueCents: integer("deposit_due_cents").notNull().default(0),
    depositPaidAt: timestamp("deposit_paid_at", { withTimezone: true }),
    depositExpiresAt: timestamp("deposit_expires_at", { withTimezone: true }),
    stripeDepositPiId: text("stripe_deposit_pi_id"),

    balanceDueCents: integer("balance_due_cents").notNull().default(0),
    balanceDueAt: timestamp("balance_due_at", { withTimezone: true }),
    balancePaidAt: timestamp("balance_paid_at", { withTimezone: true }),
    stripeBalancePiId: text("stripe_balance_pi_id"),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    reminderStage: varchar("reminder_stage", { length: 20 }),

    status: fieldRentalBlockStatusEnum("status").notNull().default("draft"),
    offlinePaymentMethod: fieldRentalPaymentMethodEnum("offline_payment_method"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("field_rental_blocks_org_status_idx").on(t.organizationId, t.status),
    index("field_rental_blocks_location_status_idx").on(t.locationId, t.status),
    index("field_rental_blocks_balance_due_idx").on(t.balanceDueAt),
  ],
);

/**
 * Non-blocking soft holds for draft quotes. Deliberately NOT resource_blocks
 * rows: assertNoBlockConflict treats every unexpired ledger row as a hard
 * conflict, which would block competing quotes. Read for display only.
 */
export const fieldRentalBlockQuoteSlots = pgTable(
  "field_rental_block_quote_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockId: uuid("block_id")
      .notNull()
      .references(() => fieldRentalBlocks.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
    fieldNumber: integer("field_number").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("field_rental_block_quote_slots_venue_starts_idx").on(t.venueId, t.startsAt),
    index("field_rental_block_quote_slots_block_idx").on(t.blockId),
  ],
);

export type FieldRentalBlock = typeof fieldRentalBlocks.$inferSelect;
export type NewFieldRentalBlock = typeof fieldRentalBlocks.$inferInsert;
export type FieldRentalBlockQuoteSlot = typeof fieldRentalBlockQuoteSlots.$inferSelect;
```

- [ ] **Step 2: Add `blockId` to `field_rentals` and the four rate-card columns**

In `src/lib/db/schema/field-rentals.ts`, inside the `fieldRentals` column list (after `brand`):

```ts
    // Parent block when this session belongs to a recurring rental block.
    // Nullable: standalone rentals have none. The payment-hold sweep skips
    // rows with a block — the block-level sweep cancels those together.
    blockId: uuid("block_id"),
```

Add to the index array:

```ts
    index("field_rentals_block_starts_at_idx").on(table.blockId, table.startsAt),
```

> The FK is declared in SQL rather than via `.references()` to avoid a circular
> import between `field-rentals.ts` and `field-rental-blocks.ts`. Migration
> step 4 adds the constraint.

In `fieldRentalRateCard`, add:

```ts
  depositPct: integer("deposit_pct").notNull().default(25),
  balanceDueLeadDays: integer("balance_due_lead_days").notNull().default(30),
  blockHoldHours: integer("block_hold_hours").notNull().default(72),
  quoteMarkerTtlDays: integer("quote_marker_ttl_days").notNull().default(14),
```

- [ ] **Step 3: Add the token kind**

In `src/lib/db/schema/self-service-tokens.ts`, add `"rental_block"` to `selfServiceTokenKindEnum` after `"rental_claim"`.

- [ ] **Step 4: Generate and hand-edit the migrations**

Run from the worktree root:

```bash
cd /Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/rental-blocks
npm run db:generate
```

Drizzle emits one file. **Split it into two** so the enum ships alone (the 55P04 lesson — see migrations `0023`/`0024` for the idempotent pattern):

`NNNN_rental_block_status_enum.sql`:

```sql
DO $$ BEGIN
  CREATE TYPE "public"."field_rental_block_status" AS ENUM('draft','awaiting_deposit','active','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE "public"."self_service_token_kind" ADD VALUE IF NOT EXISTS 'rental_block';
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

`NNNN_rental_blocks.sql` — the two `CREATE TABLE IF NOT EXISTS` statements, then:

```sql
ALTER TABLE "field_rentals" ADD COLUMN IF NOT EXISTS "block_id" uuid;
DO $$ BEGIN
  ALTER TABLE "field_rentals" ADD CONSTRAINT "field_rentals_block_id_fk"
    FOREIGN KEY ("block_id") REFERENCES "public"."field_rental_blocks"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "field_rentals_block_starts_at_idx" ON "field_rentals" ("block_id","starts_at");

ALTER TABLE "field_rental_rate_card" ADD COLUMN IF NOT EXISTS "deposit_pct" integer DEFAULT 25 NOT NULL;
ALTER TABLE "field_rental_rate_card" ADD COLUMN IF NOT EXISTS "balance_due_lead_days" integer DEFAULT 30 NOT NULL;
ALTER TABLE "field_rental_rate_card" ADD COLUMN IF NOT EXISTS "block_hold_hours" integer DEFAULT 72 NOT NULL;
ALTER TABLE "field_rental_rate_card" ADD COLUMN IF NOT EXISTS "quote_marker_ttl_days" integer DEFAULT 14 NOT NULL;
```

Keep `src/lib/db/migrations/meta/_journal.json` consistent with both files (Drizzle wrote one entry; duplicate it for the split, incrementing `idx` and `tag`).

- [ ] **Step 5: Verify the schema compiles and the migration applies**

```bash
npx tsc --noEmit
npm run db:migrate
```

Expected: zero TS errors; migration output lists both new files as applied. If `db:migrate` reports "already exists", that is the drifted-staging case — `npm run db:migrate:bootstrap` is the recovery path.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema/ src/lib/db/migrations/
git commit -m "feat(rentals): schema for recurring rental blocks and quote markers"
```

---

### Task 2: Pure session generator

**Files:**
- Create: `src/lib/rentals/blocks/generate.ts`
- Test: `tests/unit/rentals/blocks/generate.test.ts`

**Interfaces:**
- Consumes: `zonedMinuteToUtc` from `@/lib/activity-tracking/tz-day`.
- Produces:
  ```ts
  export interface BlockPatternDay {
    weekday: number;          // 0 = Sun … 6 = Sat, in the org timezone
    startMinute: number;      // minutes past local midnight (1200 = 8:00 PM)
    durationMinutes: number;
    venueIds: string[];       // one session per venue per matching date
  }
  export interface BlockPattern {
    timeZone: string;
    firstDate: string;        // YYYY-MM-DD, local
    lastDate: string;         // YYYY-MM-DD, local, inclusive
    days: BlockPatternDay[];
    excludedDates?: string[]; // YYYY-MM-DD, local
  }
  export interface GeneratedSession {
    key: string;              // `${date}|${venueId}|${startMinute}` — stable across edits
    date: string;             // YYYY-MM-DD, local
    venueId: string;
    startMinute: number;
    durationMinutes: number;
    startsAt: Date;           // UTC
    endsAt: Date;             // UTC
  }
  export function generateBlockSessions(pattern: BlockPattern): GeneratedSession[]
  export function localMinuteToUtc(date: string, minute: number, tz: string): Date
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rentals/blocks/generate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateBlockSessions, localMinuteToUtc } from "@/lib/rentals/blocks/generate";

const TZ = "America/New_York";
const V1 = "11111111-1111-1111-1111-111111111111";
const V2 = "22222222-2222-2222-2222-222222222222";

// 1200 = 20:00 local. Tuesdays: Jan 6, Feb 17, Mar 24 2026 are all Tuesdays.
const tuesdays8pm = {
  timeZone: TZ,
  firstDate: "2026-01-06",
  lastDate: "2026-03-24",
  days: [{ weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [V1] }],
};

describe("generateBlockSessions", () => {
  it("generates one session per matching weekday, inclusive of both bounds", () => {
    const s = generateBlockSessions(tuesdays8pm);
    expect(s).toHaveLength(12);
    expect(s[0].date).toBe("2026-01-06");
    expect(s[11].date).toBe("2026-03-24");
  });

  it("keeps local wall-clock time across the March spring-forward", () => {
    // DST 2026 begins Mar 8. Jan 6 8pm is EST (UTC-5); Mar 24 8pm is EDT (UTC-4).
    const s = generateBlockSessions(tuesdays8pm);
    expect(s[0].startsAt.toISOString()).toBe("2026-01-07T01:00:00.000Z");
    expect(s[11].startsAt.toISOString()).toBe("2026-03-25T00:00:00.000Z");
  });

  it("keeps local wall-clock time across the November fall-back", () => {
    // DST 2026 ends Nov 1. Oct 27 8pm is EDT; Nov 3 8pm is EST.
    const s = generateBlockSessions({
      ...tuesdays8pm,
      firstDate: "2026-10-27",
      lastDate: "2026-11-03",
    });
    expect(s).toHaveLength(2);
    expect(s[0].startsAt.toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(s[1].startsAt.toISOString()).toBe("2026-11-04T01:00:00.000Z");
  });

  it("drops excluded dates", () => {
    const s = generateBlockSessions({ ...tuesdays8pm, excludedDates: ["2026-02-17"] });
    expect(s).toHaveLength(11);
    expect(s.some((x) => x.date === "2026-02-17")).toBe(false);
  });

  it("supports several days per week with their own times and durations", () => {
    const s = generateBlockSessions({
      timeZone: TZ,
      firstDate: "2026-01-06",
      lastDate: "2026-01-12",
      days: [
        { weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [V1] },
        { weekday: 4, startMinute: 1260, durationMinutes: 90, venueIds: [V1] },
      ],
    });
    expect(s.map((x) => [x.date, x.startMinute, x.durationMinutes])).toEqual([
      ["2026-01-06", 1200, 60],
      ["2026-01-08", 1260, 90],
    ]);
  });

  it("emits one session per venue for a multi-field day", () => {
    const s = generateBlockSessions({
      timeZone: TZ,
      firstDate: "2026-01-10",
      lastDate: "2026-01-10",
      days: [{ weekday: 6, startMinute: 540, durationMinutes: 240, venueIds: [V1, V2] }],
    });
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.venueId)).toEqual([V1, V2]);
    expect(s[0].endsAt.getTime() - s[0].startsAt.getTime()).toBe(4 * 3_600_000);
  });

  it("rolls a session ending at local midnight onto the next date", () => {
    // 23:00 + 90min = 24:30 local → must not throw on minute > 1440.
    const s = generateBlockSessions({
      timeZone: TZ,
      firstDate: "2026-01-06",
      lastDate: "2026-01-06",
      days: [{ weekday: 2, startMinute: 1380, durationMinutes: 90, venueIds: [V1] }],
    });
    expect(s[0].startsAt.toISOString()).toBe("2026-01-07T04:00:00.000Z");
    expect(s[0].endsAt.toISOString()).toBe("2026-01-07T05:30:00.000Z");
  });

  it("returns sessions sorted by start time", () => {
    const s = generateBlockSessions({
      timeZone: TZ,
      firstDate: "2026-01-06",
      lastDate: "2026-01-09",
      days: [
        { weekday: 5, startMinute: 1200, durationMinutes: 60, venueIds: [V1] },
        { weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [V1] },
      ],
    });
    expect(s.map((x) => x.date)).toEqual(["2026-01-06", "2026-01-09"]);
  });

  it("gives each session a key stable across regeneration", () => {
    const a = generateBlockSessions(tuesdays8pm);
    const b = generateBlockSessions(tuesdays8pm);
    expect(a.map((x) => x.key)).toEqual(b.map((x) => x.key));
    expect(a[0].key).toBe(`2026-01-06|${V1}|1200`);
  });

  it("throws when lastDate precedes firstDate", () => {
    expect(() =>
      generateBlockSessions({ ...tuesdays8pm, firstDate: "2026-03-24", lastDate: "2026-01-06" }),
    ).toThrow(/lastDate/);
  });
});

describe("localMinuteToUtc", () => {
  it("rolls minutes past midnight onto the following date", () => {
    expect(localMinuteToUtc("2026-01-06", 1470, TZ).toISOString()).toBe("2026-01-07T05:30:00.000Z");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/rental-blocks
npx vitest run tests/unit/rentals/blocks/generate.test.ts
```

Expected: FAIL — cannot resolve `@/lib/rentals/blocks/generate`.

- [ ] **Step 3: Implement the generator**

Create `src/lib/rentals/blocks/generate.ts`:

```ts
/**
 * Pure pattern → session-list generator for recurring rental blocks.
 *
 * The recurring rule is only a GENERATOR: the admin edits the resulting list
 * directly, which is how skip-dates, per-day times and multi-field sessions
 * are expressed. Nothing here touches the DB.
 *
 * Local dates are advanced by CALENDAR day and each session's instants are
 * resolved per-date in the org timezone. Advancing by 7 * 24h instead would
 * silently shift sessions by an hour across a DST boundary — every winter
 * block crosses one.
 */
import { zonedMinuteToUtc } from "@/lib/activity-tracking/tz-day";

export interface BlockPatternDay {
  weekday: number;
  startMinute: number;
  durationMinutes: number;
  venueIds: string[];
}

export interface BlockPattern {
  timeZone: string;
  firstDate: string;
  lastDate: string;
  days: BlockPatternDay[];
  excludedDates?: string[];
}

export interface GeneratedSession {
  key: string;
  date: string;
  venueId: string;
  startMinute: number;
  durationMinutes: number;
  startsAt: Date;
  endsAt: Date;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `zonedMinuteToUtc` capped at 1440; roll past-midnight minutes to the next date. */
export function localMinuteToUtc(date: string, minute: number, tz: string): Date {
  if (minute <= 1440) return zonedMinuteToUtc(date, minute, tz);
  const days = Math.floor(minute / 1440);
  return zonedMinuteToUtc(addLocalDays(date, days), minute - days * 1440, tz);
}

/** Calendar-day arithmetic on a YYYY-MM-DD string, via UTC to dodge local-tz drift. */
function addLocalDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Day of week (0 = Sun) of a YYYY-MM-DD calendar date. Timezone-independent. */
function localWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function generateBlockSessions(pattern: BlockPattern): GeneratedSession[] {
  const { timeZone, firstDate, lastDate, days, excludedDates } = pattern;
  if (!DATE_RE.test(firstDate)) throw new Error(`invalid firstDate '${firstDate}'`);
  if (!DATE_RE.test(lastDate)) throw new Error(`invalid lastDate '${lastDate}'`);
  if (lastDate < firstDate) throw new Error("lastDate must not precede firstDate");

  const excluded = new Set(excludedDates ?? []);
  const byWeekday = new Map<number, BlockPatternDay[]>();
  for (const day of days) {
    const list = byWeekday.get(day.weekday) ?? [];
    list.push(day);
    byWeekday.set(day.weekday, list);
  }

  const out: GeneratedSession[] = [];
  for (let date = firstDate; date <= lastDate; date = addLocalDays(date, 1)) {
    if (excluded.has(date)) continue;
    for (const day of byWeekday.get(localWeekday(date)) ?? []) {
      for (const venueId of day.venueIds) {
        out.push({
          key: `${date}|${venueId}|${day.startMinute}`,
          date,
          venueId,
          startMinute: day.startMinute,
          durationMinutes: day.durationMinutes,
          startsAt: localMinuteToUtc(date, day.startMinute, timeZone),
          endsAt: localMinuteToUtc(date, day.startMinute + day.durationMinutes, timeZone),
        });
      }
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/unit/rentals/blocks/generate.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/blocks/generate.ts tests/unit/rentals/blocks/generate.test.ts
git commit -m "feat(rentals): DST-correct session generator for rental blocks"
```

---

### Task 3: Pure block pricing

**Files:**
- Create: `src/lib/rentals/blocks/pricing.ts`
- Test: `tests/unit/rentals/blocks/pricing.test.ts`

**Interfaces:**
- Consumes: `GeneratedSession` from Task 2; `quoteRentalCents` from `@/lib/rentals/soccerone-pricing`; `computeRentalPriceCents`, `resolveRentalHourlyRateCents` from `@/lib/rentals/pricing`.
- Produces:
  ```ts
  export type BlockDiscount = { kind: "percent" | "amount"; value: number } | null;
  export interface PricedSession extends GeneratedSession { rateCardCents: number; allocatedCents: number }
  export interface BlockQuote {
    sessions: PricedSession[];
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
    depositDueCents: number;
    balanceDueCents: number;
  }
  export function priceSession(s: GeneratedSession, ctx: BlockPricingContext): number
  export function quoteBlock(sessions: GeneratedSession[], ctx: BlockPricingContext, opts: { discount: BlockDiscount; depositPct: number }): BlockQuote
  export function balanceDueAt(firstSessionStartsAt: Date, leadDays: number): Date
  export interface BlockPricingContext {
    brand: "soccerone" | "aspire";
    timeZone: string;
    venueHourlyRateCents: Record<string, number | null>; // venueId → override
    defaultHourlyRateCents: number;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rentals/blocks/pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateBlockSessions } from "@/lib/rentals/blocks/generate";
import { quoteBlock, priceSession, balanceDueAt } from "@/lib/rentals/blocks/pricing";

const TZ = "America/New_York";
const V1 = "11111111-1111-1111-1111-111111111111";

const soccerone = {
  brand: "soccerone" as const,
  timeZone: TZ,
  venueHourlyRateCents: { [V1]: null },
  defaultHourlyRateCents: 8000,
};

// 12 Tuesdays 8-9pm, Jan-Mar 2026 → winter evening tier, $260/hr.
const tuesdays = generateBlockSessions({
  timeZone: TZ,
  firstDate: "2026-01-06",
  lastDate: "2026-03-24",
  days: [{ weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [V1] }],
});

const multipleOf100 = (n: number) => n % 100 === 0;

describe("priceSession", () => {
  it("uses the SoccerOne winter evening tier", () => {
    expect(priceSession(tuesdays[0], soccerone)).toBe(26000);
  });

  it("uses the flat hourly rate for the Aspire storefront", () => {
    expect(priceSession(tuesdays[0], { ...soccerone, brand: "aspire" })).toBe(8000);
  });

  it("prefers a venue rate override on the Aspire storefront", () => {
    expect(
      priceSession(tuesdays[0], {
        ...soccerone,
        brand: "aspire",
        venueHourlyRateCents: { [V1]: 12000 },
      }),
    ).toBe(12000);
  });
});

describe("quoteBlock", () => {
  it("sums the rate card and applies a percent discount", () => {
    const q = quoteBlock(tuesdays, soccerone, {
      discount: { kind: "percent", value: 10 },
      depositPct: 25,
    });
    expect(q.subtotalCents).toBe(312000); // 12 × $260 = $3,120
    expect(q.discountCents).toBe(31200);  // −$312
    expect(q.totalCents).toBe(280800);    // $2,808
    expect(q.depositDueCents).toBe(70200); // $702
    expect(q.balanceDueCents).toBe(210600); // $2,106
  });

  it("applies a flat-amount discount", () => {
    const q = quoteBlock(tuesdays.slice(0, 11), soccerone, {
      discount: { kind: "amount", value: 30000 },
      depositPct: 25,
    });
    expect(q.subtotalCents).toBe(286000);
    expect(q.totalCents).toBe(256000);   // $2,560
    expect(q.depositDueCents).toBe(64000); // 25% of $2,560 = $640
  });

  it("keeps every amount a whole number of dollars", () => {
    const q = quoteBlock(tuesdays.slice(0, 11), soccerone, {
      discount: { kind: "percent", value: 13 },
      depositPct: 25,
    });
    for (const n of [q.subtotalCents, q.discountCents, q.totalCents, q.depositDueCents, q.balanceDueCents]) {
      expect(multipleOf100(n)).toBe(true);
    }
    expect(q.sessions.every((s) => multipleOf100(s.allocatedCents))).toBe(true);
  });

  it("allocates per-session amounts summing exactly to the total, remainder on the first", () => {
    const q = quoteBlock(tuesdays.slice(0, 11), soccerone, {
      discount: { kind: "amount", value: 30000 },
      depositPct: 25,
    });
    const sum = q.sessions.reduce((a, s) => a + s.allocatedCents, 0);
    expect(sum).toBe(q.totalCents);
    // $2,560 / 11 → $232 each, $8 remainder onto the first session.
    expect(q.sessions[0].allocatedCents).toBe(24000);
    expect(q.sessions[1].allocatedCents).toBe(23200);
  });

  it("treats a null discount as no discount", () => {
    const q = quoteBlock(tuesdays, soccerone, { discount: null, depositPct: 25 });
    expect(q.discountCents).toBe(0);
    expect(q.totalCents).toBe(q.subtotalCents);
  });

  it("never lets a discount push the total below zero", () => {
    const q = quoteBlock(tuesdays.slice(0, 1), soccerone, {
      discount: { kind: "amount", value: 99999900 },
      depositPct: 25,
    });
    expect(q.totalCents).toBe(0);
    expect(q.depositDueCents).toBe(0);
    expect(q.balanceDueCents).toBe(0);
  });

  it("returns a zero quote for no sessions", () => {
    const q = quoteBlock([], soccerone, { discount: null, depositPct: 25 });
    expect(q).toMatchObject({ subtotalCents: 0, totalCents: 0, depositDueCents: 0, balanceDueCents: 0 });
    expect(q.sessions).toEqual([]);
  });

  it("charges a 100% deposit as the whole total with no balance", () => {
    const q = quoteBlock(tuesdays, soccerone, { discount: null, depositPct: 100 });
    expect(q.depositDueCents).toBe(q.totalCents);
    expect(q.balanceDueCents).toBe(0);
  });
});

describe("balanceDueAt", () => {
  it("is the lead-day count before the first session", () => {
    expect(balanceDueAt(new Date("2026-01-07T01:00:00.000Z"), 30).toISOString())
      .toBe("2025-12-08T01:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/rentals/blocks/pricing.test.ts
```

Expected: FAIL — cannot resolve `@/lib/rentals/blocks/pricing`.

- [ ] **Step 3: Implement the pricing module**

Create `src/lib/rentals/blocks/pricing.ts`:

```ts
/**
 * Pure pricing for recurring rental blocks.
 *
 * Money invariant: every value returned here is a whole number of dollars
 * (a multiple of 100 cents). Cents exist only because Stripe and the rest of
 * the schema store minor units; no cent ever reaches the UI or the
 * arithmetic. Per-session allocation sums EXACTLY to totalCents, with the
 * remainder dollars on the first session.
 */
import type { GeneratedSession } from "./generate";
import { quoteRentalCents } from "@/lib/rentals/soccerone-pricing";
import { computeRentalPriceCents, resolveRentalHourlyRateCents } from "@/lib/rentals/pricing";

export type BlockDiscount = { kind: "percent" | "amount"; value: number } | null;

export interface BlockPricingContext {
  brand: "soccerone" | "aspire";
  timeZone: string;
  venueHourlyRateCents: Record<string, number | null>;
  defaultHourlyRateCents: number;
}

export interface PricedSession extends GeneratedSession {
  rateCardCents: number;
  allocatedCents: number;
}

export interface BlockQuote {
  sessions: PricedSession[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  depositDueCents: number;
  balanceDueCents: number;
}

const DOLLAR = 100;

/** Round to the nearest whole dollar. */
function toWholeDollars(cents: number): number {
  return Math.round(cents / DOLLAR) * DOLLAR;
}

export function priceSession(s: GeneratedSession, ctx: BlockPricingContext): number {
  if (ctx.brand === "soccerone") {
    return quoteRentalCents(s.startsAt, s.endsAt, ctx.timeZone);
  }
  const hourly = resolveRentalHourlyRateCents(
    ctx.venueHourlyRateCents[s.venueId] ?? null,
    ctx.defaultHourlyRateCents,
  );
  return computeRentalPriceCents(s.startsAt, s.endsAt, hourly);
}

export function quoteBlock(
  sessions: GeneratedSession[],
  ctx: BlockPricingContext,
  opts: { discount: BlockDiscount; depositPct: number },
): BlockQuote {
  const rated = sessions.map((s) => ({ ...s, rateCardCents: toWholeDollars(priceSession(s, ctx)) }));
  const subtotalCents = rated.reduce((a, s) => a + s.rateCardCents, 0);

  const rawDiscount =
    opts.discount === null
      ? 0
      : opts.discount.kind === "percent"
        ? (subtotalCents * opts.discount.value) / 100
        : opts.discount.value;
  const discountCents = Math.min(toWholeDollars(rawDiscount), subtotalCents);
  const totalCents = subtotalCents - discountCents;

  const depositDueCents = Math.min(
    toWholeDollars((totalCents * opts.depositPct) / 100),
    totalCents,
  );
  const balanceDueCents = totalCents - depositDueCents;

  // Whole-dollar allocation: even share to every session, remainder dollars
  // onto the first so the parts sum exactly to totalCents.
  const sessionsOut: PricedSession[] = [];
  if (rated.length > 0) {
    const share = Math.floor(totalCents / rated.length / DOLLAR) * DOLLAR;
    const remainder = totalCents - share * rated.length;
    rated.forEach((s, i) => {
      sessionsOut.push({ ...s, allocatedCents: i === 0 ? share + remainder : share });
    });
  }

  return { sessions: sessionsOut, subtotalCents, discountCents, totalCents, depositDueCents, balanceDueCents };
}

export function balanceDueAt(firstSessionStartsAt: Date, leadDays: number): Date {
  return new Date(firstSessionStartsAt.getTime() - leadDays * 24 * 3_600_000);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/unit/rentals/blocks/pricing.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/blocks/pricing.ts tests/unit/rentals/blocks/pricing.test.ts
git commit -m "feat(rentals): whole-dollar block pricing with exact per-session allocation"
```

---

### Task 4: Quote markers

**Files:**
- Create: `src/lib/rentals/blocks/quote-markers.ts`
- Test: `tests/api/rentals/blocks/quote-markers.test.ts`

**Interfaces:**
- Consumes: `fieldRentalBlockQuoteSlots`, `fieldRentalBlocks` (Task 1).
- Produces:
  ```ts
  export interface MarkerSlot { venueId: string; fieldNumber: number; startsAt: Date; endsAt: Date }
  export async function replaceQuoteMarkers(blockId: string, slots: MarkerSlot[], ttlDays: number): Promise<void>
  export async function clearQuoteMarkers(blockId: string): Promise<void>
  export async function findCompetingQuotes(
    slots: MarkerSlot[], excludeBlockId?: string,
  ): Promise<Map<string, { blockId: string; label: string; quotedAt: Date }>>  // key: `${venueId}|${startsAt.toISOString()}`
  export async function purgeExpiredQuoteMarkers(): Promise<{ purged: number }>
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/api/rentals/blocks/quote-markers.test.ts`:

```ts
/**
 * Integration: quote markers are visible for display but never block.
 * Seeds rows directly via getDb(); no HTTP.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentalBlocks, fieldRentalBlockQuoteSlots } from "@/lib/db/schema/field-rental-blocks";
import {
  replaceQuoteMarkers, clearQuoteMarkers, findCompetingQuotes, purgeExpiredQuoteMarkers,
} from "@/lib/rentals/blocks/quote-markers";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID, E2E_LOCATION_ID } from "@/lib/db/seeds/seed-e2e-tests";

const START = new Date(Date.UTC(2039, 2, 1, 1));
const END = new Date(Date.UTC(2039, 2, 1, 2));
const slot = { venueId: E2E_RENTAL_VENUE_ID, fieldNumber: 1, startsAt: START, endsAt: END };
const created: string[] = [];

async function makeBlock(label: string) {
  const [b] = await getDb()
    .insert(fieldRentalBlocks)
    .values({
      organizationId: E2E_ORG_ID,
      locationId: E2E_LOCATION_ID,
      label,
      renterName: label,
      status: "draft",
    })
    .returning();
  created.push(b.id);
  return b.id;
}

afterAll(async () => {
  if (created.length) {
    await getDb().delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, created));
  }
});

describe("quote markers", () => {
  it("writes one marker per slot with the configured TTL", async () => {
    const id = await makeBlock("Marker A");
    await replaceQuoteMarkers(id, [slot], 14);
    const rows = await getDb()
      .select()
      .from(fieldRentalBlockQuoteSlots)
      .where(eq(fieldRentalBlockQuoteSlots.blockId, id));
    expect(rows).toHaveLength(1);
    const ttlDays = (rows[0].expiresAt.getTime() - Date.now()) / (24 * 3_600_000);
    expect(ttlDays).toBeGreaterThan(13.9);
    expect(ttlDays).toBeLessThan(14.1);
  });

  it("replaces rather than appends on re-save", async () => {
    const id = await makeBlock("Marker B");
    await replaceQuoteMarkers(id, [slot, { ...slot, startsAt: END, endsAt: new Date(END.getTime() + 3_600_000) }], 14);
    await replaceQuoteMarkers(id, [slot], 14);
    const rows = await getDb()
      .select()
      .from(fieldRentalBlockQuoteSlots)
      .where(eq(fieldRentalBlockQuoteSlots.blockId, id));
    expect(rows).toHaveLength(1);
  });

  it("surfaces a competing quote on the same slot, excluding the caller's own", async () => {
    const mine = await makeBlock("Marker Mine");
    const theirs = await makeBlock("Ohio Elite 03B");
    await replaceQuoteMarkers(mine, [slot], 14);
    await replaceQuoteMarkers(theirs, [slot], 14);

    const found = await findCompetingQuotes([slot], mine);
    const hit = found.get(`${slot.venueId}|${START.toISOString()}`);
    expect(hit?.label).toBe("Ohio Elite 03B");

    const unfiltered = await findCompetingQuotes([slot]);
    expect(unfiltered.size).toBe(1); // one slot key, whichever block won the pick
  });

  it("ignores expired markers", async () => {
    const id = await makeBlock("Marker Expired");
    await replaceQuoteMarkers(id, [slot], 14);
    await getDb()
      .update(fieldRentalBlockQuoteSlots)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(fieldRentalBlockQuoteSlots.blockId, id));
    expect((await findCompetingQuotes([slot])).size).toBe(0);
  });

  it("clears markers for a block", async () => {
    const id = await makeBlock("Marker Clear");
    await replaceQuoteMarkers(id, [slot], 14);
    await clearQuoteMarkers(id);
    const rows = await getDb()
      .select()
      .from(fieldRentalBlockQuoteSlots)
      .where(eq(fieldRentalBlockQuoteSlots.blockId, id));
    expect(rows).toHaveLength(0);
  });

  it("purges expired markers", async () => {
    const id = await makeBlock("Marker Purge");
    await replaceQuoteMarkers(id, [slot], 14);
    await getDb()
      .update(fieldRentalBlockQuoteSlots)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(fieldRentalBlockQuoteSlots.blockId, id));
    const { purged } = await purgeExpiredQuoteMarkers();
    expect(purged).toBeGreaterThanOrEqual(1);
  });
});
```

> **If `E2E_LOCATION_ID` is not exported** from `src/lib/db/seeds/seed-e2e-tests.ts`, add and export it alongside `E2E_RENTAL_VENUE_ID`, resolving the seeded rental venue's `locationId`. Do this in this task, not later.

- [ ] **Step 2: Run the test to verify it fails**

Start the dev server in a separate shell first (the API suite needs the DB env):

```bash
cd /Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/rental-blocks
./scripts/with-bws.sh npx vitest run tests/api/rentals/blocks/quote-markers.test.ts
```

Expected: FAIL — cannot resolve `@/lib/rentals/blocks/quote-markers`.

- [ ] **Step 3: Implement quote markers**

Create `src/lib/rentals/blocks/quote-markers.ts`:

```ts
/**
 * Non-blocking soft holds for draft block quotes.
 *
 * These deliberately do NOT live in the field-time ledger: assertNoBlockConflict
 * treats every unexpired resource_blocks row as a hard conflict, so a marker
 * there would block competing quotes — the opposite of the intent. Markers are
 * read for display only, so an admin building a competing block can see
 * "also quoted to X".
 */
import { and, eq, gt, lt, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  fieldRentalBlocks,
  fieldRentalBlockQuoteSlots,
} from "@/lib/db/schema/field-rental-blocks";

export interface MarkerSlot {
  venueId: string;
  fieldNumber: number;
  startsAt: Date;
  endsAt: Date;
}

const slotKey = (venueId: string, startsAt: Date) => `${venueId}|${startsAt.toISOString()}`;

export async function replaceQuoteMarkers(
  blockId: string,
  slots: MarkerSlot[],
  ttlDays: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 3_600_000);
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(fieldRentalBlockQuoteSlots)
      .where(eq(fieldRentalBlockQuoteSlots.blockId, blockId));
    if (slots.length === 0) return;
    await tx.insert(fieldRentalBlockQuoteSlots).values(
      slots.map((s) => ({
        blockId,
        venueId: s.venueId,
        fieldNumber: s.fieldNumber,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        expiresAt,
      })),
    );
  });
}

export async function clearQuoteMarkers(blockId: string): Promise<void> {
  await getDb()
    .delete(fieldRentalBlockQuoteSlots)
    .where(eq(fieldRentalBlockQuoteSlots.blockId, blockId));
}

export async function findCompetingQuotes(
  slots: MarkerSlot[],
  excludeBlockId?: string,
): Promise<Map<string, { blockId: string; label: string; quotedAt: Date }>> {
  const out = new Map<string, { blockId: string; label: string; quotedAt: Date }>();
  if (slots.length === 0) return out;

  const venueIds = [...new Set(slots.map((s) => s.venueId))];
  const earliest = new Date(Math.min(...slots.map((s) => s.startsAt.getTime())));
  const latest = new Date(Math.max(...slots.map((s) => s.endsAt.getTime())));

  const rows = await getDb()
    .select({
      blockId: fieldRentalBlockQuoteSlots.blockId,
      venueId: fieldRentalBlockQuoteSlots.venueId,
      startsAt: fieldRentalBlockQuoteSlots.startsAt,
      endsAt: fieldRentalBlockQuoteSlots.endsAt,
      label: fieldRentalBlocks.label,
      quotedAt: fieldRentalBlocks.updatedAt,
    })
    .from(fieldRentalBlockQuoteSlots)
    .innerJoin(fieldRentalBlocks, eq(fieldRentalBlocks.id, fieldRentalBlockQuoteSlots.blockId))
    .where(
      and(
        inArray(fieldRentalBlockQuoteSlots.venueId, venueIds),
        gt(fieldRentalBlockQuoteSlots.expiresAt, new Date()),
        lt(fieldRentalBlockQuoteSlots.startsAt, latest),
        gt(fieldRentalBlockQuoteSlots.endsAt, earliest),
        eq(fieldRentalBlocks.status, "draft"),
      ),
    );

  for (const slot of slots) {
    const hit = rows.find(
      (r) =>
        r.venueId === slot.venueId &&
        r.blockId !== excludeBlockId &&
        r.startsAt < slot.endsAt &&
        r.endsAt > slot.startsAt,
    );
    if (hit) {
      out.set(slotKey(slot.venueId, slot.startsAt), {
        blockId: hit.blockId,
        label: hit.label,
        quotedAt: hit.quotedAt,
      });
    }
  }
  return out;
}

export async function purgeExpiredQuoteMarkers(): Promise<{ purged: number }> {
  const rows = await getDb()
    .delete(fieldRentalBlockQuoteSlots)
    .where(lt(fieldRentalBlockQuoteSlots.expiresAt, new Date()))
    .returning({ id: fieldRentalBlockQuoteSlots.id });
  return { purged: rows.length };
}
```

Remove the unused `or`/`sql` imports if the linter flags them.

- [ ] **Step 4: Run the test to verify it passes**

```bash
./scripts/with-bws.sh npx vitest run tests/api/rentals/blocks/quote-markers.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/blocks/quote-markers.ts tests/api/rentals/blocks/quote-markers.test.ts src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "feat(rentals): non-blocking quote markers for draft rental blocks"
```

---

### Task 5: Transactional block create

**Files:**
- Create: `src/lib/rentals/blocks/create.ts`
- Modify: `src/lib/scheduling/sync.ts:23-40` (export the resource resolver)
- Test: `tests/api/rentals/blocks/create.test.ts`

**Interfaces:**
- Consumes: `generateBlockSessions` (Task 2), `quoteBlock` (Task 3), `replaceQuoteMarkers` (Task 4), `assertNoRentalConflict` from `@/lib/rentals/conflicts`, `assertNoBlockConflict` from `@/lib/scheduling/blocks`, `syncRentalBlock` from `@/lib/scheduling/sync`.
- Produces:
  ```ts
  export type BlockCommitMode = "draft" | "send_deposit" | "paid_offline";
  export interface CreateBlockInput {
    organizationId: string; locationId: string; brand: "soccerone" | "aspire";
    label: string; renterUserId: string | null; renterName: string;
    renterEmail: string | null; renterPhone: string | null;
    partySize: number; purpose: string | null; notes: string | null;
    pattern: BlockPattern; excludedKeys: string[];
    sessionOverrides: Record<string, { startMinute?: number; durationMinutes?: number; venueId?: string }>;
    extraSessions: GeneratedSession[];
    discount: BlockDiscount; depositPct: number;
    rateCard: { balanceDueLeadDays: number; blockHoldHours: number; quoteMarkerTtlDays: number };
    pricingContext: BlockPricingContext;
    mode: BlockCommitMode;
    offlinePaymentMethod: "cash" | "comp" | null;
    createdByUserId: string;
  }
  export type CreateBlockResult =
    | { ok: true; blockId: string; sessionIds: string[] }
    | { ok: false; error: string; conflicts: Array<{ key: string; reason: string }> };
  export async function createRentalBlock(input: CreateBlockInput): Promise<CreateBlockResult>
  export function resolveSessionList(input: CreateBlockInput): GeneratedSession[]
  export async function resolveVenueFieldNumbers(venueIds: string[]): Promise<Record<string, number>>
  ```
- `resolveSessionList` is pure: generate from pattern, drop `excludedKeys`, apply `sessionOverrides`, append `extraSessions`, re-sort by `startsAt`.

- [ ] **Step 1: Export the resource resolver**

In `src/lib/scheduling/sync.ts`, change `async function topLevelResource(` to:

```ts
/** Resolve (venueId, fieldNumber) → top-level resource id, or null. */
export async function resolveTopLevelResourceId(
  venueId: string,
  fieldNumber: number,
): Promise<string | null> {
```

Update its three call sites in that file.

- [ ] **Step 2: Write the failing test**

Create `tests/api/rentals/blocks/create.test.ts`:

```ts
/**
 * Integration: createRentalBlock commits a block + its sessions atomically,
 * and rejects the whole build when any session conflicts.
 */
import { describe, it, expect, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks, fieldRentalBlockQuoteSlots } from "@/lib/db/schema/field-rental-blocks";
import { createRentalBlock, resolveSessionList } from "@/lib/rentals/blocks/create";
import { generateBlockSessions } from "@/lib/rentals/blocks/generate";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID, E2E_LOCATION_ID, E2E_ADMIN_USER_ID } from "@/lib/db/seeds/seed-e2e-tests";

const TZ = "America/New_York";
const createdBlocks: string[] = [];
const createdRentals: string[] = [];

// Far-future Tuesdays so nothing in seeded data collides.
const pattern = {
  timeZone: TZ,
  firstDate: "2041-01-08",
  lastDate: "2041-01-29",
  days: [{ weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [E2E_RENTAL_VENUE_ID] }],
};

function input(overrides: Partial<Parameters<typeof createRentalBlock>[0]> = {}) {
  return {
    organizationId: E2E_ORG_ID,
    locationId: E2E_LOCATION_ID,
    brand: "soccerone" as const,
    label: `Block Test ${Math.random().toString(36).slice(2, 8)}`,
    renterUserId: null,
    renterName: "Block Tester",
    renterEmail: "block-tester@test.aspiresports.com",
    renterPhone: null,
    partySize: 12,
    purpose: "team practice",
    notes: null,
    pattern,
    excludedKeys: [],
    sessionOverrides: {},
    extraSessions: [],
    discount: { kind: "percent" as const, value: 10 },
    depositPct: 25,
    rateCard: { balanceDueLeadDays: 30, blockHoldHours: 72, quoteMarkerTtlDays: 14 },
    pricingContext: {
      brand: "soccerone" as const,
      timeZone: TZ,
      venueHourlyRateCents: { [E2E_RENTAL_VENUE_ID]: null },
      defaultHourlyRateCents: 8000,
    },
    mode: "send_deposit" as const,
    offlinePaymentMethod: null,
    createdByUserId: E2E_ADMIN_USER_ID,
    ...overrides,
  };
}

afterAll(async () => {
  const db = getDb();
  if (createdRentals.length) await db.delete(fieldRentals).where(inArray(fieldRentals.id, createdRentals));
  if (createdBlocks.length) await db.delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, createdBlocks));
});

async function commit(over = {}) {
  const res = await createRentalBlock(input(over));
  if (res.ok) {
    createdBlocks.push(res.blockId);
    createdRentals.push(...res.sessionIds);
  }
  return res;
}

describe("resolveSessionList", () => {
  it("drops excluded keys and applies per-row overrides", () => {
    const all = generateBlockSessions(pattern);
    const list = resolveSessionList(
      input({ excludedKeys: [all[1].key], sessionOverrides: { [all[2].key]: { startMinute: 1260 } } }) as any,
    );
    expect(list).toHaveLength(all.length - 1);
    expect(list.find((s) => s.date === all[2].date)!.startMinute).toBe(1260);
  });
});

describe("createRentalBlock", () => {
  it("send_deposit creates pending_payment sessions and an awaiting_deposit block", async () => {
    const res = await commit();
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const [block] = await getDb().select().from(fieldRentalBlocks).where(eq(fieldRentalBlocks.id, res.blockId));
    expect(block.status).toBe("awaiting_deposit");
    expect(block.subtotalCents).toBe(4 * 26000);      // 4 winter-evening Tuesdays
    expect(block.totalCents).toBe(93600);              // −10%
    expect(block.depositDueCents).toBe(23400);         // 25%
    expect(block.balanceDueCents).toBe(70200);
    expect(block.depositExpiresAt).toBeTruthy();
    expect(block.balanceDueAt).toBeTruthy();

    const sessions = await getDb().select().from(fieldRentals).where(eq(fieldRentals.blockId, res.blockId));
    expect(sessions).toHaveLength(4);
    expect(sessions.every((s) => s.status === "pending_payment")).toBe(true);
    expect(sessions.every((s) => s.paymentStatus === "unpaid" && s.amountPaidCents === 0)).toBe(true);
    expect(sessions.every((s) => s.brand === "soccerone")).toBe(true);
    expect(sessions.every((s) => s.paymentExpiresAt !== null)).toBe(true);
    expect(sessions.reduce((a, s) => a + s.amountDueCents, 0)).toBe(block.totalCents);
  });

  it("paid_offline confirms the block and every session immediately", async () => {
    const res = await commit({
      mode: "paid_offline",
      offlinePaymentMethod: "cash",
      pattern: { ...pattern, firstDate: "2041-02-05", lastDate: "2041-02-26" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [block] = await getDb().select().from(fieldRentalBlocks).where(eq(fieldRentalBlocks.id, res.blockId));
    expect(block.status).toBe("active");
    expect(block.offlinePaymentMethod).toBe("cash");
    const sessions = await getDb().select().from(fieldRentals).where(eq(fieldRentals.blockId, res.blockId));
    expect(sessions.every((s) => s.status === "confirmed" && s.paymentStatus === "paid")).toBe(true);
  });

  it("draft creates the block and quote markers but no sessions", async () => {
    const res = await commit({
      mode: "draft",
      pattern: { ...pattern, firstDate: "2041-03-05", lastDate: "2041-03-26" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [block] = await getDb().select().from(fieldRentalBlocks).where(eq(fieldRentalBlocks.id, res.blockId));
    expect(block.status).toBe("draft");
    expect(block.pattern).toBeTruthy();
    const sessions = await getDb().select().from(fieldRentals).where(eq(fieldRentals.blockId, res.blockId));
    expect(sessions).toHaveLength(0);
    const markers = await getDb()
      .select()
      .from(fieldRentalBlockQuoteSlots)
      .where(eq(fieldRentalBlockQuoteSlots.blockId, res.blockId));
    expect(markers).toHaveLength(4);
  });

  it("rejects the whole build when a session conflicts, creating nothing", async () => {
    const p = { ...pattern, firstDate: "2041-04-02", lastDate: "2041-04-23" };
    const first = await commit({ pattern: p });
    expect(first.ok).toBe(true);

    const before = await getDb().select().from(fieldRentalBlocks);
    const second = await createRentalBlock(input({ pattern: p }));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.conflicts.length).toBeGreaterThan(0);

    const after = await getDb().select().from(fieldRentalBlocks);
    expect(after.length).toBe(before.length); // nothing committed
  });

  it("rejects an empty session list", async () => {
    const res = await createRentalBlock(
      input({ pattern: { ...pattern, days: [] } }),
    );
    expect(res.ok).toBe(false);
  });
});
```

> Add `E2E_ADMIN_USER_ID` to the seed exports if absent, resolving the seeded admin's `users.id`.

- [ ] **Step 3: Run the test to verify it fails**

```bash
./scripts/with-bws.sh npx vitest run tests/api/rentals/blocks/create.test.ts
```

Expected: FAIL — cannot resolve `@/lib/rentals/blocks/create`.

- [ ] **Step 4: Implement `create.ts`**

Create `src/lib/rentals/blocks/create.ts`. Key requirements, in order:

1. `resolveSessionList(input)` — pure: `generateBlockSessions(input.pattern)`, filter out `excludedKeys`, apply `sessionOverrides` (recomputing `startsAt`/`endsAt` via `localMinuteToUtc` when `startMinute`/`durationMinutes`/`venueId` change), concat `extraSessions`, sort by `startsAt`. Throw if the result is empty.
2. `resolveVenueFieldNumbers(venueIds)` — one query against `venueResources` for top-level rows (`parentResourceId IS NULL`), returning `venueId → fieldNumber` (default `1` when a venue has no resource rows, matching the availability fallback).
3. `quoteBlock(sessions, input.pricingContext, { discount, depositPct })` for the money.
4. `mode === "draft"`: insert the block with `status: "draft"`, `pattern` stored as jsonb (pattern + `excludedKeys` + `sessionOverrides` + `extraSessions`), the quote totals, **no sessions**; then `replaceQuoteMarkers(blockId, slots, rateCard.quoteMarkerTtlDays)`. Return.
5. Otherwise, inside a single `db.transaction`:
   - Insert the block row (`awaiting_deposit` for `send_deposit`, `active` for `paid_offline`; `depositExpiresAt = now + blockHoldHours * 3600_000` only for `send_deposit`; `balanceDueAt = balanceDueAt(firstSession.startsAt, rateCard.balanceDueLeadDays)`).
   - **Sort the session list by `(venueId, fieldNumber, startsAt)`** before locking, so concurrent builds acquire advisory locks in the same order and cannot deadlock.
   - For each session: `assertNoRentalConflict(tx, { venueId, fieldNumber, startsAt, endsAt })` — collect `{ key, reason }` on a non-null return; then resolve the resource id via `resolveTopLevelResourceId` and call `assertNoBlockConflict(tx, { resourceId, startsAt, endsAt })`, catching `BlockConflictError` into the same collection. **Do not** call `upsertSourceBlock` here — it opens its own transaction and the pool is `max: 1`, which would deadlock.
   - If any conflicts were collected, `throw` a sentinel so the transaction rolls back, and return `{ ok: false, error, conflicts }`.
   - Insert every session with: `blockId`, `organizationId`, `venueId`, `fieldNumber`, `startsAt`, `endsAt`, `source: "admin_created"`, `brand: input.brand`, `renter*` copied from the block, `partySize`, `purpose`, `notes`, `amountDueCents` = that session's `allocatedCents`, and per mode:
     - `send_deposit`: `status: "pending_payment"`, `paymentMethod: "card_online"`, `paymentStatus: "unpaid"`, `amountPaidCents: 0`, `paymentExpiresAt` = the block's `depositExpiresAt`.
     - `paid_offline`: `status: "confirmed"`, `paymentMethod: offlinePaymentMethod`, `paymentStatus: "paid"`, `amountPaidCents` = `allocatedCents`, `paymentExpiresAt: null`.
   - `createdByUserId: input.createdByUserId`.
6. After the transaction commits, `await Promise.all(sessionIds.map(syncRentalBlock))` to write ledger rows, and `clearQuoteMarkers(blockId)`. If `syncRentalBlock` throws `BlockConflictError` for any session, cancel the whole block (mirror `withLedgerSync`'s compensation: set every session `cancelled`, block `cancelled`) and return `{ ok: false, … }`.

Reference implementations to mirror: `createRentalRequest` in `src/lib/rentals/booking.ts` (transaction + conflict + ledger sync shape) and `withLedgerSync` in the same file (compensation on ledger conflict).

- [ ] **Step 5: Run the test to verify it passes**

```bash
./scripts/with-bws.sh npx vitest run tests/api/rentals/blocks/create.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rentals/blocks/create.ts src/lib/scheduling/sync.ts tests/api/rentals/blocks/create.test.ts src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "feat(rentals): atomic block create with all-or-nothing conflict rejection"
```

---

### Task 6: Preview and create endpoints

**Files:**
- Create: `src/pages/api/admin/rentals/blocks/generate-preview.ts`
- Create: `src/pages/api/admin/rentals/blocks/index.ts`
- Create: `src/lib/rentals/blocks/validators.ts`
- Test: `tests/api/rentals/blocks/endpoints.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5; `requireOrgAdminAccess` from `@/lib/auth/roles`; `requireSameOrgLocation` from `@/lib/auth/require-resource-ownership`.
- Produces:
  - `POST /api/admin/rentals/blocks/generate-preview` → `{ sessions: Array<{ key, date, venueId, venueName, startsAt, endsAt, rateCardCents, allocatedCents, conflict: { reason: string } | null, competingQuote: { label: string; quotedAt: string } | null }>, subtotalCents, discountCents, totalCents, depositDueCents, balanceDueCents, balanceDueAt }`
  - `GET /api/admin/rentals/blocks?status=&locationId=` → `{ blocks: BlockRow[] }` where `BlockRow` = `{ id, label, renterName, locationName, brand, status, sessionCount, firstSessionAt, lastSessionAt, totalCents, paidCents, balanceDueCents, balanceDueAt, overdue: boolean }`
  - `POST /api/admin/rentals/blocks` → `{ blockId, sessionIds }` on 200; `{ error, conflicts }` on 409
  - `export function validateCreateBlockBody(body: unknown): { ok: true; value: CreateBlockBody } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing test**

Create `tests/api/rentals/blocks/endpoints.test.ts`:

```ts
/**
 * Integration: admin block endpoints — preview, list, create, tenancy.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { getAdminCookie, getParentCookie, apiFetch } from "../../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID, E2E_LOCATION_ID } from "@/lib/db/seeds/seed-e2e-tests";

let admin: string;
let parent: string;
const blocks: string[] = [];

const pattern = {
  timeZone: "America/New_York",
  firstDate: "2042-01-07",
  lastDate: "2042-01-28",
  days: [{ weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [E2E_RENTAL_VENUE_ID] }],
};

const body = (over: Record<string, unknown> = {}) => ({
  locationId: E2E_LOCATION_ID,
  brand: "soccerone",
  label: `Endpoint Block ${Math.random().toString(36).slice(2, 8)}`,
  renterName: "Endpoint Tester",
  renterEmail: "endpoint-tester@test.aspiresports.com",
  partySize: 12,
  pattern,
  excludedKeys: [],
  sessionOverrides: {},
  extraSessions: [],
  discount: { kind: "percent", value: 10 },
  depositPct: 25,
  mode: "draft",
  ...over,
});

beforeAll(async () => {
  admin = await getAdminCookie();
  parent = await getParentCookie();
});

afterAll(async () => {
  const db = getDb();
  if (blocks.length) {
    await db.delete(fieldRentals).where(inArray(fieldRentals.blockId, blocks));
    await db.delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, blocks));
  }
});

describe("POST /api/admin/rentals/blocks/generate-preview", () => {
  it("prices the generated sessions without persisting anything", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks/generate-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body()),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessions).toHaveLength(4);
    expect(json.subtotalCents).toBe(4 * 26000);
    expect(json.totalCents).toBe(93600);
    expect(json.depositDueCents).toBe(23400);
    expect(json.balanceDueAt).toBeTruthy();
    expect(json.sessions[0].venueName).toBeTruthy();
  });

  it("rejects a non-admin", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks/generate-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: parent },
      body: JSON.stringify(body()),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("rejects a location from another org", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks/generate-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body({ locationId: "00000000-0000-0000-0000-000000000000" })),
    });
    expect([403, 404]).toContain(res.status);
  });

  it("rejects a malformed pattern", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks/generate-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body({ pattern: { ...pattern, firstDate: "nope" } })),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/rentals/blocks", () => {
  it("creates a draft block", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body()),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    blocks.push(json.blockId);
    expect(json.blockId).toBeTruthy();
    expect(json.sessionIds).toEqual([]);
  });

  it("returns 409 with the conflicting session keys", async () => {
    const p = { ...pattern, firstDate: "2042-02-04", lastDate: "2042-02-25" };
    const first = await apiFetch("/api/admin/rentals/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body({ pattern: p, mode: "send_deposit" })),
    });
    expect(first.status).toBe(200);
    blocks.push((await first.json()).blockId);

    const second = await apiFetch("/api/admin/rentals/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body({ pattern: p, mode: "send_deposit" })),
    });
    expect(second.status).toBe(409);
    const json = await second.json();
    expect(json.conflicts.length).toBeGreaterThan(0);
  });

  it("rejects a non-admin", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: parent },
      body: JSON.stringify(body()),
    });
    expect([401, 403]).toContain(res.status);
  });
});

describe("GET /api/admin/rentals/blocks", () => {
  it("lists blocks for the admin's org", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks", { headers: { Cookie: admin } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.blocks)).toBe(true);
    if (json.blocks.length) {
      expect(json.blocks[0]).toHaveProperty("sessionCount");
      expect(json.blocks[0]).toHaveProperty("overdue");
    }
  });

  it("filters by status", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks?status=draft", { headers: { Cookie: admin } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.blocks.every((b: { status: string }) => b.status === "draft")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Start the dev server first (`R2_MOCK=1 CRON_SECRET=devsecret npm run dev:bws` in another shell), then:

```bash
CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/blocks/endpoints.test.ts
```

Expected: FAIL — 404 on both new routes.

- [ ] **Step 3: Implement the validator**

Create `src/lib/rentals/blocks/validators.ts` mirroring the style of `src/lib/rentals/validators.ts`: a plain function returning a discriminated result, no zod. Validate: `locationId` uuid; `brand` in `["soccerone","aspire"]`; `label` non-empty ≤ 200 chars; `renterName` non-empty; `renterEmail` null or contains `@`; `partySize` integer 1–200; `pattern.timeZone` non-empty; `pattern.firstDate`/`lastDate` match `YYYY-MM-DD` with `lastDate >= firstDate`; `pattern.days` non-empty array with `weekday` 0–6, `startMinute` 0–1439, `durationMinutes` 15–480, `venueIds` non-empty uuid array; `discount` null or `{kind, value}` with `value >= 0` and percent ≤ 100; `depositPct` integer 0–100; `mode` in `["draft","send_deposit","paid_offline"]`; `offlinePaymentMethod` required and in `["cash","comp"]` when `mode === "paid_offline"`.

- [ ] **Step 4: Implement the endpoints**

Both files follow the shape of `src/pages/api/admin/rentals/rate-card.ts`:

```ts
export const prerender = false;
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;
  // … validate, then requireSameOrgLocation(orgId, body.locationId) → 403/404
};
```

`generate-preview` additionally:
- loads the rate card (creating the default row if missing, exactly as `rate-card.ts` GET does) for `balanceDueLeadDays` / `quoteMarkerTtlDays`,
- loads the location's rental venues for names and `rentalHourlyRateCents`,
- builds the `BlockPricingContext` from `brand` + org timezone + those venues,
- resolves each session's conflict reason by running the same read the builder shows: `getBlocksForVenueDay`-derived busy blocks over the range, labelled `rental` / `game` / `maintenance` / `external`,
- calls `findCompetingQuotes` for the `competingQuote` field,
- **persists nothing.**

`index.ts` `POST` maps `createRentalBlock` results: `ok` → 200, `!ok` with conflicts → 409, validation → 400.

`index.ts` `GET` aggregates `sessionCount` / `firstSessionAt` / `lastSessionAt` / `paidCents` with a grouped join on `field_rentals`, and computes `overdue = status === "active" && balancePaidAt === null && balanceDueAt < now`. Order by `createdAt desc` — and per the multi-tenant query hazard note, every `limit(1)` in this file needs an explicit `orderBy`.

- [ ] **Step 5: Run the test to verify it passes**

```bash
CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/blocks/endpoints.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/admin/rentals/blocks/ src/lib/rentals/blocks/validators.ts tests/api/rentals/blocks/endpoints.test.ts
git commit -m "feat(rentals): admin block preview, list, and create endpoints"
```

---

### Task 7: Block detail endpoint

**Files:**
- Create: `src/pages/api/admin/rentals/blocks/[id].ts`
- Test: `tests/api/rentals/blocks/detail.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/admin/rentals/blocks/:id` → `{ block, sessions: Array<{ id, venueName, fieldNumber, startsAt, endsAt, status, amountDueCents, waiverSigned, checkedInAt }> }`
  - `PATCH /api/admin/rentals/blocks/:id` with one of:
    - `{ notes }` / `{ label }` — edit metadata
    - `{ cancelRemainingFrom: ISO8601 }` → cancels sessions starting at/after that instant, frees their ledger rows, returns `{ cancelledSessionIds, suggestedRefundCents }`
    - `{ cancel: true }` → cancels the whole block and every session

- [ ] **Step 1: Write the failing test**

Create `tests/api/rentals/blocks/detail.test.ts` covering:
1. `GET` returns the block with its sessions ordered by `startsAt`, including `venueName`.
2. `GET` on another org's block id → 403/404.
3. `PATCH { notes }` persists and returns the updated block.
4. `PATCH { cancelRemainingFrom }` cancels only sessions at/after the instant, leaves earlier ones `confirmed`, and returns `suggestedRefundCents` equal to the sum of the cancelled sessions' `amountDueCents` capped at the block's paid amount.
5. `PATCH { cancel: true }` sets block `cancelled` and every session `cancelled`.
6. Non-admin → 401/403.

Seed via `createRentalBlock` with `mode: "paid_offline"` so paid amounts are non-zero, and clean up in `afterAll` exactly as Task 5's test does.

- [ ] **Step 2: Run it and confirm 404s**

```bash
CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/blocks/detail.test.ts
```

- [ ] **Step 3: Implement `[id].ts`**

`requireOrgAdminAccess`, then load the block and **verify `block.organizationId === orgId`** before anything else (return `ownershipDeniedResponse()` otherwise). Cancellation paths run in a transaction, then call `removeSourceBlock("rental", sessionId)` for each cancelled session outside it. `suggestedRefundCents` = `min(sum(cancelled sessions' amountDueCents), block.depositPaidAt ? depositDueCents : 0 + block.balancePaidAt ? balanceDueCents : 0)`, rounded to whole dollars. Refund issuance itself is Task 12; this endpoint only suggests.

- [ ] **Step 4: Run the test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/rentals/blocks/\[id\].ts tests/api/rentals/blocks/detail.test.ts
git commit -m "feat(rentals): block detail read, edit, and cancellation endpoint"
```

---

### Task 8: Builder UI

**Files:**
- Create: `src/components/admin/rentals/blocks/BlockBuilder.tsx`
- Create: `src/components/admin/rentals/blocks/PatternPanel.tsx`
- Create: `src/components/admin/rentals/blocks/SessionTable.tsx`
- Create: `src/components/admin/rentals/blocks/PricePanel.tsx`
- Create: `src/pages/admin/rentals/blocks/new.astro`

**Interfaces:**
- Consumes: `POST /api/admin/rentals/blocks/generate-preview`, `POST /api/admin/rentals/blocks` (Task 6).
- Produces: `<BlockBuilder locations={…} timeZone={…} internal={false} />`, mounted `client:load`.

- [ ] **Step 1: Build `PatternPanel`**

Controlled component. Props: `{ value: PatternFormState; locations: LocationOption[]; venuesByLocation: Record<string, VenueOption[]>; onChange(next): void; onGenerate(): void; generating: boolean }`. Renders the Storefront select (SoccerOne default), Location select, a repeatable day row (weekday select, time input, duration select, venue checkboxes), `+ add day`, and first/last date inputs. Time input is `type="time"`; convert to `startMinute` with `hh * 60 + mm`. No cents, no money here.

- [ ] **Step 2: Build `SessionTable`**

Props: `{ sessions: PreviewSession[]; excludedKeys: Set<string>; onToggle(key): void; onEdit(key, patch): void; onAddOneOff(session): void }`. One row per session: checkbox, date, editable time, editable duration, venue select, rate-card amount, and a right-hand cell showing either the conflict reason (`⚠ Winter Cup game`) or the competing-quote note (`also quoted to Ohio Elite · Nov 1`). Rows arriving with `conflict !== null` render unchecked and disabled-by-default with the reason; the header shows `N of M selected`. Money renders through a shared `formatDollars(cents)` helper that asserts `cents % 100 === 0` in dev and never prints decimals.

- [ ] **Step 3: Build `PricePanel`**

Props: `{ quote: PreviewQuote; discount: BlockDiscount; depositPct: number; balanceDueAt: string; onChange(patch): void }`. Shows subtotal, discount input (percent/amount toggle, whole dollars only — `step="1"`, `min="0"`), total, deposit percent input with the computed dollar amount beside it, hold hours, and the balance due date (prefilled, editable). Every displayed amount uses `formatDollars`.

- [ ] **Step 4: Build `BlockBuilder`**

Calls `useHydrationBeacon()`. Owns state: renter fields, pattern, `excludedKeys`, `sessionOverrides`, `extraSessions`, discount, depositPct, preview result, busy flags. `Generate` POSTs to `generate-preview` and stores the response; edits to discount/depositPct re-POST (debounced 300ms) so the money always matches the server's arithmetic rather than duplicating it client-side. Three commit buttons POST to `/api/admin/rentals/blocks` with the corresponding `mode`; a 409 renders `<ErrorBanner>` listing the conflicting session dates and re-marks those rows. Success navigates to `/admin/rentals/blocks/{id}`. Action failures use `toast.error`.

When `internal` is true (Task 10), the money panels are not rendered and the only action is `Reserve`.

- [ ] **Step 5: Build the page**

`src/pages/admin/rentals/blocks/new.astro` — extends `BaseLayout`, no `prerender`, loads the org's locations and rental-enabled venues in frontmatter, mounts `<BlockBuilder client:load … />`.

- [ ] **Step 6: Verify in a browser**

```bash
npm run dev:bws
```

Open `http://localhost:4321/admin/rentals/blocks/new`, sign in as `admin@test.aspiresports.com` / `TestAdmin123!`. Confirm: Generate produces 12 rows for a Jan–Mar Tuesday pattern; unchecking a row lowers the total; a conflicting row shows its reason; no amount anywhere shows cents. Check both storefront values render legibly — SoccerOne's `BrandTheme` inverts the Aspire tokens, so re-pin token values on the container if anything goes illegible.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/rentals/blocks/ src/pages/admin/rentals/blocks/new.astro
git commit -m "feat(rentals): admin block builder with editable generated session list"
```

---

### Task 9: Blocks list and detail UI

**Files:**
- Create: `src/components/admin/rentals/blocks/BlocksList.tsx`
- Create: `src/components/admin/rentals/blocks/BlockDetail.tsx`
- Create: `src/pages/admin/rentals/blocks/index.astro`
- Create: `src/pages/admin/rentals/blocks/[id].astro`
- Modify: `src/components/admin/rentals/RentalsList.tsx`
- Modify: `src/pages/admin/rentals/index.astro`

- [ ] **Step 1: `BlocksList`**

Mirror `RentalsList.tsx` structure exactly (filter bar, `ErrorBanner`, `LoadingSkeleton`, `EmptyState`, table). Columns: Label / Renter, Location, Pattern summary (e.g. `Tue 8:00 PM · 12 sessions · Jan 6 – Mar 24`), Status badge, Paid / Total, Balance due, Open. Status filter select over the five block statuses. An `⚠ overdue` badge when `overdue`. Above the table, a banner counting `awaiting_deposit` blocks — mirroring the existing "N requests awaiting review" line.

- [ ] **Step 2: `BlockDetail`**

Sections: renter card; money summary (subtotal, discount, total, deposit paid/unpaid, balance owed + due date); session table (date, venue, time, status, amount, waiver, checked-in, link to `/admin/rentals/{sessionId}`); actions row. Actions: `Send deposit link`, `Send balance link`, `Mark paid offline`, `Cancel remaining from…` (date input), `Cancel block`, and for drafts `Re-check availability` + `Open in builder`. Each action `fetch`es its endpoint, `toast`es the result, and reloads the block. Destructive actions require a typed confirmation — do **not** use `window.confirm` (browser dialogs block automation).

- [ ] **Step 3: Pages and cross-links**

Both Astro pages extend `BaseLayout`, no `prerender`, mount their island `client:load`. In `RentalsList.tsx`, add a `blockLabel`/`blockId` field to `RentalRow` and a "Block" column rendering a link to `/admin/rentals/blocks/{blockId}` or `—`; extend the `GET /api/admin/rentals` select to include them. In `src/pages/admin/rentals/index.astro`, add a link to `/admin/rentals/blocks`.

- [ ] **Step 4: Verify in a browser**

Confirm the Blocks tab lists the blocks seeded by earlier tests, the detail page renders a 12-session table, and the flat rentals list shows the Block column linking up.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/rentals/ src/pages/admin/rentals/
git commit -m "feat(rentals): blocks list, block detail, and rentals-list cross-link"
```

---

### Task 10: Internal reserve mode

**Files:**
- Modify: `src/lib/rentals/blocks/create.ts`
- Modify: `src/components/admin/rentals/blocks/BlockBuilder.tsx`
- Modify: `src/pages/api/admin/rentals/blocks/index.ts`
- Test: `tests/api/rentals/blocks/internal-reserve.test.ts`

**Interfaces:**
- Produces: `mode: "internal_reserve"` on `CreateBlockInput`; `createRentalBlock` then writes **manual ledger blocks** via `createManualBlock` instead of rentals, and no block row.

- [ ] **Step 1: Write the failing test**

Assert that `POST /api/admin/rentals/blocks` with `mode: "internal_reserve"` and a label:
1. creates no `field_rental_blocks` row and no `field_rentals` rows,
2. creates one `resource_blocks` row per generated session with `sourceType: "maintenance"` and the supplied label,
3. causes a subsequent `generate-preview` over the same slots to report each session with a conflict reason carrying that label,
4. is rejected for a non-admin.

- [ ] **Step 2: Run it and confirm failure**

- [ ] **Step 3: Implement**

In `create.ts`, branch before the block insert: for `internal_reserve`, resolve each session's resource id and call `createManualBlock` (signature in `src/lib/scheduling/blocks.ts:308`) with the label, returning `{ ok: true, blockId: "", sessionIds: [] }` shaped as `{ ok: true, reservedCount }`. Widen `CreateBlockResult` accordingly. In the validator, allow the new mode and require `label`; skip all money validation for it. In `BlockBuilder`, when `internal` is true hide `PricePanel` and render a single `Reserve` button. Add `?internal=1` handling to `new.astro`.

- [ ] **Step 4: Run the test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/blocks/create.ts src/components/admin/rentals/blocks/BlockBuilder.tsx src/pages/api/admin/rentals/blocks/index.ts src/pages/admin/rentals/blocks/new.astro tests/api/rentals/blocks/internal-reserve.test.ts
git commit -m "feat(rentals): internal reserve mode fences inventory via manual ledger blocks"
```

---

### Task 11: Public quote page and token

**Files:**
- Create: `src/pages/api/rentals/blocks/[token]/index.ts`
- Create: `src/pages/rentals/blocks/[token].astro`
- Create: `src/components/rentals/BlockQuotePage.tsx`
- Create: `src/lib/rentals/blocks/tokens.ts`
- Test: `tests/api/rentals/blocks/public-token.test.ts`

**Interfaces:**
- Consumes: `mintToken` from `@/lib/check-in/tokens-db`, kind `"rental_block"` (Task 1).
- Produces:
  ```ts
  export async function mintBlockToken(block: FieldRentalBlock): Promise<string>
  export async function resolveBlockToken(token: string): Promise<{ block: FieldRentalBlock } | null>
  ```
  `GET /api/rentals/blocks/:token` → `{ block: PublicBlockView, sessions: PublicSession[], owed: { kind: "deposit" | "balance" | "none"; cents: number; dueAt: string | null } }`

- [ ] **Step 1: Write the failing test**

Cover: a minted token resolves to its block without any auth cookie; the payload contains the full session list and the correct `owed.kind` for `awaiting_deposit` (deposit), `active` with unpaid balance (balance), and fully paid (none); an unknown token → 404; an expired token → 410; the payload never includes `notes` (internal) or `createdByUserId`.

TTL: `24 * 45` hours — must outlive the 72h deposit hold *and* the balance reminder schedule (T−14 → T+1), mirroring the `CLAIM_TTL_HOURS` reasoning in `src/lib/rentals/claim.ts`.

- [ ] **Step 2: Run it and confirm failure**

- [ ] **Step 3: Implement**

`tokens.ts` wraps `mintToken({ kind: "rental_block", targetId: block.id, organizationId, venueId: null, sentVia: "email", recipientEmail: block.renterEmail, recipientPhone: block.renterPhone, createdByUserId: null, ttlHours: 24 * 45 })` — note `mintToken` already returns a live unconsumed token when one exists, so resending is idempotent. `resolveBlockToken` looks the token up, rejects consumed/expired, and loads the block.

The endpoint and page require **no session**. The page extends `BaseLayout`, is SSR, and mounts `<BlockQuotePage client:load />` which renders the schedule, the amount owed, and a Pay button hitting Task 12's endpoint. Brand the page from `block.brand`: SoccerOne blocks render `SoccerOneHeader`/`SoccerOneFooter`; remember Astro scoped styles do not reach React islands, so the island carries its own `<style>`.

- [ ] **Step 4: Run the test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/blocks/tokens.ts src/pages/api/rentals/blocks/ src/pages/rentals/blocks/ src/components/rentals/BlockQuotePage.tsx tests/api/rentals/blocks/public-token.test.ts
git commit -m "feat(rentals): tokenized public quote page for rental blocks"
```

---

### Task 12: Deposit and balance payment

**Files:**
- Create: `src/pages/api/rentals/blocks/[token]/pay.ts`
- Create: `src/lib/stripe/handle-rental-block-deposit-complete.ts`
- Create: `src/lib/stripe/handle-rental-block-balance-complete.ts`
- Create: `src/lib/rentals/blocks/lifecycle.ts`
- Modify: `src/lib/stripe/handle-stripe-event.ts:125-180`
- Create: `src/pages/api/admin/rentals/blocks/[id]/deposit-link.ts`
- Create: `src/pages/api/admin/rentals/blocks/[id]/balance-link.ts`
- Test: `tests/api/rentals/blocks/payment.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lifecycle.ts
  export async function applyDepositPaid(blockId: string, paymentIntentId: string | null, paidCents: number): Promise<{ ok: boolean; reason?: string }>
  export async function applyBalancePaid(blockId: string, paymentIntentId: string | null, paidCents: number): Promise<{ ok: boolean; reason?: string }>
  export async function expireUnpaidRentalBlocks(): Promise<{ expired: number }>
  export async function completeFinishedBlocks(): Promise<{ completed: number }>
  ```
  `POST /api/rentals/blocks/:token/pay` → `{ url }` (Stripe Checkout URL). Metadata `type` is `rental_block_deposit` or `rental_block_balance`, plus `block_id` and `organization_id`.

- [ ] **Step 1: Write the failing test**

`tests/api/rentals/blocks/payment.test.ts` — Stripe is not configured on CI, so gate the Checkout-minting cases behind the repo's `itWithStripe` pattern (see `tests/api/rentals/pay.test.ts`) and test the state transitions by calling `applyDepositPaid` / `applyBalancePaid` directly. Assert:
1. `applyDepositPaid` flips the block to `active`, sets `depositPaidAt` and `stripeDepositPiId`, sets `balanceDueAt`, and flips **every** session from `pending_payment` to `confirmed`.
2. Sessions keep `amountPaidCents = 0` and `paymentStatus = "unpaid"` after the deposit (block is the payment truth).
3. A second `applyDepositPaid` call is a no-op returning `{ ok: false, reason: … }` (webhook replay).
4. `applyBalancePaid` sets `balancePaidAt` and flips every session to `paymentStatus: "paid"` with `amountPaidCents === amountDueCents`.
5. `applyDepositPaid` on a `cancelled` block returns `{ ok: false }` and mutates nothing — the refund path.
6. `POST /api/rentals/blocks/:token/pay` on a fully-paid block → 422.

- [ ] **Step 2: Run it and confirm failure**

- [ ] **Step 3: Implement**

`applyDepositPaid` mirrors `handleFieldRentalCheckoutComplete`'s two-phase shape: classify under `SELECT … FOR UPDATE` inside a transaction, guard on `status === "awaiting_deposit"` so replays bail, update block + sessions in that transaction, then do the Stripe/messaging work outside it. Re-check conflicts before confirming; if a session lost its slot, refund the deposit via `stripe.refunds.create`, set the block `cancelled`, and `logAlert`. After success, `syncRentalBlock` each session, `clearQuoteMarkers`, and dispatch the confirmation email (Task 13) through `awaitDispatch` — serverless freezes the function otherwise.

`pay.ts` resolves the token, decides deposit vs balance from block state, and mints Checkout with `mode: "payment"`, `customer_email: block.renterEmail`, one line item (`Field rental block — <label>`, `unit_amount` = amount owed), the metadata above, and the venue's Connect split if `partnerStripeAccountId` is set — copy the `application_fee_amount` / `transfer_data` shape from `src/pages/api/rentals/bookings/[id]/pay.ts`. Use an `idempotencyKey` of `${block.id}:deposit:${cents}` / `${block.id}:balance:${cents}`.

In `handle-stripe-event.ts`, add two `else if (session.metadata?.type === …)` branches next to the `field_rental` branch, returning the same `{status}` shape so the unrecognized-type warning stays meaningful.

The two admin `*-link.ts` endpoints re-mint the token, dispatch the relevant email, and return `{ sent: true }`.

- [ ] **Step 4: Run the test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/blocks/lifecycle.ts src/lib/stripe/ src/pages/api/rentals/blocks/ src/pages/api/admin/rentals/blocks/ tests/api/rentals/blocks/payment.test.ts
git commit -m "feat(rentals): deposit and balance collection for rental blocks"
```

---

### Task 13: Block emails

**Files:**
- Create: `src/lib/rentals/blocks/messages.ts`
- Create: `src/lib/email/templates/rental-block-quote.tsx`
- Create: `src/lib/email/templates/rental-block-confirmation.tsx`
- Test: `tests/unit/rentals/blocks/messages.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function dispatchBlockQuote(blockId: string, kind: "deposit" | "balance"): Promise<void>
  export async function dispatchBlockConfirmation(blockId: string): Promise<void>
  export function formatBlockScheduleLines(sessions: Array<{ startsAt: Date; endsAt: Date; venueName: string }>, tz: string): string[]
  ```

- [ ] **Step 1: Write the failing unit test**

Test `formatBlockScheduleLines` only (pure): renders each line as `Tue Jan 6 · 8:00–9:00 PM · Orange`, in the org timezone, and lines either side of a DST boundary both show `8:00 PM`. Follow `tests/unit/rentals/rental-confirmation.test.ts` for style.

- [ ] **Step 2: Run it and confirm failure**

- [ ] **Step 3: Implement**

Mirror `src/lib/rentals/messages/rental-confirmation.ts` and `dispatch.ts`. Brand from `block.brand` via `normalizeBrand`. Emails must state the amount owed in whole dollars, the due date, and carry the tokenized link. Messaging stays inert unless `MESSAGING_LIVE=yes` — never bypass that guard while testing.

- [ ] **Step 4: Run the test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/blocks/messages.ts src/lib/email/templates/ tests/unit/rentals/blocks/messages.test.ts
git commit -m "feat(rentals): brand-aware quote, balance, and confirmation emails for blocks"
```

---

### Task 14: Block-aware expiry and reminders

**Files:**
- Modify: `src/lib/rentals/expire.ts:11-38`
- Modify: `src/lib/rentals/blocks/lifecycle.ts`
- Create: `src/pages/api/cron/rental-block-sweeps.ts`
- Create: `netlify/functions/scheduled-rental-block-sweeps.ts`
- Test: `tests/api/rentals/blocks/sweeps.test.ts`

- [ ] **Step 1: Write the failing test**

The regression test is the important one:

```ts
it("expirePendingRentals leaves block sessions alone", async () => {
  // A block session past its payment expiry must NOT be cancelled piecemeal —
  // the block-level sweep cancels the whole block together, otherwise a live
  // deposit link points at a half-destroyed schedule.
  const res = await createRentalBlock(input({ mode: "send_deposit" }));
  if (!res.ok) throw new Error(res.error);
  await getDb()
    .update(fieldRentals)
    .set({ paymentExpiresAt: new Date(Date.now() - 60_000) })
    .where(eq(fieldRentals.blockId, res.blockId));

  await expirePendingRentals();

  const sessions = await getDb().select().from(fieldRentals).where(eq(fieldRentals.blockId, res.blockId));
  expect(sessions.every((s) => s.status === "pending_payment")).toBe(true);
});
```

Plus: `expireUnpaidRentalBlocks` cancels an `awaiting_deposit` block past `depositExpiresAt` **and** all its sessions and removes their ledger rows; it ignores blocks whose deposit is paid; the balance-reminder sweep sets `reminderStage` to `t14`, then `t3`, then `overdue` at the right times and **never** cancels; `completeFinishedBlocks` marks a fully-paid past block `completed`; the cron route rejects a wrong `CRON_SECRET` with 401.

- [ ] **Step 2: Run it and confirm the regression test fails**

Expected: the new regression test FAILS (sessions come back `cancelled`) — that is the bug this task fixes.

- [ ] **Step 3: Implement**

In `expire.ts`, add `isNull(fieldRentals.blockId)` to `expirePendingRentals`'s `where`, with a comment pointing at `expireUnpaidRentalBlocks`. Implement the three sweeps in `lifecycle.ts`. The cron route follows `src/pages/api/cron/expire-pending-rentals.ts` exactly (same `CRON_SECRET` check and response shape) and runs all four: `purgeExpiredQuoteMarkers`, `expireUnpaidRentalBlocks`, balance reminders, `completeFinishedBlocks`. Reminder emails go through `awaitDispatch`. Register the Netlify schedule alongside `scheduled-expire-pending-rentals.ts`.

- [ ] **Step 4: Run the test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/expire.ts src/lib/rentals/blocks/lifecycle.ts src/pages/api/cron/rental-block-sweeps.ts netlify/functions/scheduled-rental-block-sweeps.ts tests/api/rentals/blocks/sweeps.test.ts
git commit -m "fix(rentals): block-aware expiry so payment sweep cannot eat block sessions"
```

---

### Task 15: Block-level refund

**Files:**
- Modify: `src/pages/api/admin/rentals/blocks/[id].ts`
- Create: `src/pages/api/admin/rentals/blocks/[id]/refund.ts`
- Test: `tests/api/rentals/blocks/refund.test.ts`

- [ ] **Step 1: Write the failing test**

Assert: `POST /api/admin/rentals/blocks/:id/refund` with `{ amountCents }` rejects a non-whole-dollar amount (400), rejects an amount above what was paid (422), records the refund against the block on success, and rejects a non-admin. Gate the Stripe-issuing case behind `itWithStripe`; assert the guard logic unconditionally.

- [ ] **Step 2: Run it and confirm failure**

- [ ] **Step 3: Implement**

Reuse `stripe.refunds.create` against `stripeDepositPiId` then `stripeBalancePiId` (deposit first), mirroring the structure of `src/lib/rentals/refund.ts`. Validate `amountCents % 100 === 0`. Update the block's paid figures and `logAlert` on partial failure.

- [ ] **Step 4: Run the test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/rentals/blocks/ tests/api/rentals/blocks/refund.test.ts
git commit -m "feat(rentals): block-level refunds against deposit and balance intents"
```

---

### Task 16: E2E flow and pre-push verification

**Files:**
- Create: `tests/e2e/rental-blocks.spec.ts`
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts` (only if a fixture is missing)

- [ ] **Step 1: Write the E2E spec**

```ts
import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

test("admin builds a rental block and the renter pays the deposit", async ({ page }) => {
  await signIn(page, "admin@test.aspiresports.com", "TestAdmin123!");
  await page.goto("/admin/rentals/blocks/new", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // Pattern: Tuesdays 8-9pm across a far-future winter range.
  await page.getByLabel("Location").selectOption({ index: 0 });
  await page.getByLabel("Day").selectOption("2");
  await page.getByLabel("Start time").fill("20:00");
  await page.getByLabel("First date").fill("2043-01-06");
  await page.getByLabel("Last date").fill("2043-03-24");
  await page.getByRole("button", { name: "Generate" }).click();

  await expect(page.getByText(/12 of 12 selected/)).toBeVisible();
  await page.getByLabel("Renter name").fill("E2E Winter Team");
  await page.getByLabel("Renter email").fill("e2e-block@test.aspiresports.com");
  await page.getByRole("button", { name: "Send deposit link" }).click();

  await expect(page).toHaveURL(/\/admin\/rentals\/blocks\/[0-9a-f-]{36}/);
  await expect(page.getByText("Awaiting deposit")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(13); // header + 12 sessions
});
```

Use element clicks throughout, never `page.keyboard.press`, and `waitForHydration` before the first interaction — CI's headless Chromium hydrates slower and interactions on un-hydrated DOM silently drop.

- [ ] **Step 2: Run it locally**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/rental-blocks.spec.ts
```

- [ ] **Step 3: Check the existing rental specs still pass**

Full Playwright runs are skipped on PRs here (`test-full` runs post-merge only), so these will not gate the PR — run them by hand:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/field-rentals.spec.ts tests/e2e/soccerone-rental-pricing.spec.ts
```

- [ ] **Step 4: Full pre-push sequence**

```bash
cd /Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/rental-blocks
npm run db:seed:e2e
CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npm run test:api
npm run build
npx tsc --noEmit
```

Expected: API suite green (`CRON_SECRET` must match the dev server's, or you get spurious 401 cron failures); build succeeds — ignore the `Astro.request.headers is not available on prerendered pages` warnings, they are known false positives from middleware; `tsc` reports **zero** errors.

- [ ] **Step 5: Commit and push**

```bash
git add tests/e2e/rental-blocks.spec.ts
git commit -m "test(rentals): e2e coverage for block build and deposit link"
git push -u origin feat/rental-blocks
```

The task is not done until CI is green on the pushed commit. A green local run is not sufficient.

---

## Self-Review

**Spec coverage.** Data model → Task 1. Whole-dollar money → Tasks 1, 3, and the Global Constraints. Generator → Task 2. Builder four panels → Tasks 6, 8. Storefront drives branding and pricing → Tasks 3, 6, 8. DST → Task 2. All-or-nothing commit → Task 5. Commit-action table → Task 5. Internal reserve → Task 10. Contention / quote markers → Tasks 4, 6, 8. Draft staleness re-check → Tasks 7, 9. Public token page → Task 11. Deposit → confirmed → Task 12. Balance + reminders → Tasks 12, 14. Offline payment → Task 5. Expiry hazards → Task 14. Race-loss refund → Task 12. Brand hazard → Tasks 3, 5, 13. Cancel remaining + refund → Tasks 7, 15. Surfaces → Tasks 8, 9, 11. File layout → matches the spec's list, with `create.ts`/`validators.ts`/`tokens.ts` split out. Migrations → Task 1. Testing → every task, consolidated in Task 16.

Deferred to the companion plan by design: `/admin/rentals/calendar`, the recurring-slot finder, the calendar endpoint, rate-card UI for the four new fields, and dashboard grouping. Note this means the four new rate-card columns are **DB-editable only** until that plan lands; the builder reads them and lets the admin override deposit percent per block, so nothing is blocked.

**Type consistency.** `GeneratedSession` (Task 2) is consumed unchanged by `quoteBlock` (Task 3) and `resolveSessionList` (Task 5). `BlockPricingContext` is defined once in Task 3 and built in Task 6. `MarkerSlot` (Task 4) is what Task 5 passes to `replaceQuoteMarkers`. `resolveTopLevelResourceId` is renamed in Task 5 and used in Tasks 5 and 10. `applyDepositPaid` / `applyBalancePaid` / `expireUnpaidRentalBlocks` / `completeFinishedBlocks` all live in `lifecycle.ts`, created in Task 12 and extended in Task 14.

**Placeholder scan.** No TBDs. The two places that say "add this seed export if absent" (`E2E_LOCATION_ID`, `E2E_ADMIN_USER_ID`) name the exact symbol and where it comes from. `NNNN_` migration prefixes are assigned by `db:generate` at run time, which is the repo's convention.
