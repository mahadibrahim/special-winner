# Field Rentals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers book and pay for a field/venue time-block online, and let admins create rentals taken by phone or at the front desk, with no double-booking against other rentals or scheduled games.

**Architecture:** A single `field_rentals` table where one row is one booking is one occupied field-block. Availability is computed on the fly (venue rental hours minus games minus existing rentals). The booking endpoint inserts a `pending_payment` row that holds the field, behind a Postgres advisory lock keyed on `(venueId, fieldNumber)` so concurrent attempts serialize; a Stripe Checkout Session is created and the `checkout.session.completed` webhook flips the row to `confirmed`. A Netlify scheduled function expires abandoned holds. The whole feature mirrors the existing drop-in booking feature's patterns (`src/lib/db/schema/drop-in.ts`, `src/pages/api/dropin/`, `src/lib/stripe/handle-dropin-checkout-complete.ts`, `src/pages/api/cron/expire-pending-claims.ts`).

**Tech Stack:** Astro 5 (SSR), React 19 islands, Drizzle ORM + PostgreSQL, Stripe (Checkout Sessions + Connect destination charges + Terminal for card-present), Netlify Functions, Vitest (unit + API), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-05-14-field-rentals-design.md`. This is Spec 1 of 2; Spec 2 (venue check-in) is a separate plan. This plan ships the waiver/check-in *columns* but builds none of Spec 2's UI.

**Branch:** `feat/field-rentals` (already created; the spec is committed there).

---

## File Structure

**Schema**
- Create `src/lib/db/schema/field-rentals.ts` — `fieldRentals` + `fieldRentalRateCard` tables, 5 enums, type exports.
- Modify `src/lib/db/schema/teams.ts` — add 4 rental columns to `venues`.
- Modify `src/lib/db/schema/index.ts` — export `./field-rentals`.
- Generated migration under `src/lib/db/migrations/`.

**Pure logic (no DB, unit-tested)** — `src/lib/rentals/`
- Create `src/lib/rentals/pricing.ts` — `resolveRentalHourlyRateCents()`, `computeRentalPriceCents()`.
- Create `src/lib/rentals/overlap.ts` — `rangesOverlap()`, `subtractBusyBlocks()`.
- Create `src/lib/rentals/validators.ts` — `validateRentalBookingRequest()`, `validateRentalRateCardPut()`, `validateAdminRentalCreate()`.

**DB logic (DB, API-tested)** — `src/lib/rentals/`
- Create `src/lib/rentals/availability.ts` — `getVenueRentalAvailability()`.
- Create `src/lib/rentals/conflicts.ts` — `assertNoRentalConflict()` (advisory lock + overlap query; runs inside a tx).
- Create `src/lib/rentals/booking.ts` — `createRentalHold()`, `createConfirmedRentalNonStripe()`.
- Create `src/lib/rentals/refund.ts` — `refundFieldRental()`.

**Stripe**
- Create `src/lib/stripe/handle-field-rental-checkout-complete.ts`.
- Create `src/lib/stripe/handle-field-rental-walkup-payment.ts`.
- Modify `src/pages/api/webhooks/stripe.ts` — route `metadata.type === "field_rental"` and `"field_rental_walk_up"`.

**Customer API** — `src/pages/api/rentals/`
- Create `src/pages/api/rentals/availability.ts` — `GET`.
- Create `src/pages/api/rentals/bookings/index.ts` — `GET` (own rentals) + `POST` (create).
- Create `src/pages/api/rentals/bookings/[id]/cancel.ts` — `POST`.

**Admin API** — `src/pages/api/admin/rentals/`
- Create `src/pages/api/admin/rentals/index.ts` — `GET` (list) + `POST` (admin create).
- Create `src/pages/api/admin/rentals/[id].ts` — `GET` + `PATCH` (cancel).
- Create `src/pages/api/admin/rentals/[id]/refund.ts` — `POST`.
- Create `src/pages/api/admin/rentals/rate-card.ts` — `GET` + `PUT`.

**Scheduled expiry**
- Create `src/pages/api/cron/expire-pending-rentals.ts` — `POST`.
- Create `netlify/functions/scheduled-expire-pending-rentals.ts`.

**Customer UI**
- Create `src/pages/rentals/index.astro` — booking page (SSR).
- Create `src/components/rentals/RentalBooking.tsx` — availability grid + booking panel island.
- Create `src/components/dashboard/MyFieldRentals.tsx` — dashboard list island.
- Modify `src/pages/dashboard/bookings.astro` — render `MyFieldRentals`.

**Admin UI**
- Create `src/pages/admin/rentals/index.astro` + `src/components/admin/rentals/RentalsList.tsx`.
- Create `src/pages/admin/rentals/new.astro` + `src/components/admin/rentals/RentalCreateForm.tsx`.
- Create `src/pages/admin/rentals/[id].astro` + `src/components/admin/rentals/RentalDetail.tsx`.
- Create `src/pages/admin/rentals/rate-card.astro` + `src/components/admin/rentals/RentalRateCardEditor.tsx`.
- Modify the venue edit form to add the 4 rental fields (locate the existing venue form; see Task 19).

**Tests**
- `tests/unit/rentals-pricing.test.ts`, `tests/unit/rentals-overlap.test.ts`, `tests/unit/rentals-validators.test.ts`
- `tests/api/rentals/availability.test.ts`, `tests/api/rentals/bookings.test.ts`, `tests/api/rentals/conflict.test.ts`, `tests/api/rentals/webhook.test.ts`, `tests/api/rentals/refund.test.ts`, `tests/api/rentals/rate-card.test.ts`
- `tests/e2e/field-rentals.spec.ts`

---

## Conventions to follow (read before starting)

- API routes: `export const prerender = false;` at top. JSON helper `const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });`.
- Admin endpoints gate with `requireAdminAccess(context)` from `@/lib/auth/roles`, then `context.locals.organization?.id` for org scope, then `requireSameOrgVenue(orgId, venueId)` from `@/lib/auth/require-resource-ownership` for any venue-scoped resource.
- Customer endpoints gate with `if (!locals.user) return json({ error: "Unauthorized" }, 401);`.
- DB access via `getDb()` from `@/lib/db`. Money is integer cents. Timestamps are `timestamp(..., { withTimezone: true })`.
- Idempotency keys on Stripe writes follow `${rentalId}:<purpose>:${amountCents}` (see `src/lib/stripe/client.ts` header comment).
- Commit after every task with a Conventional Commit message scoped `feat(rentals):` / `test(rentals):` / `chore(rentals):`.
- All commits go on branch `feat/field-rentals`.

---

## Task 1: Field rentals schema

**Files:**
- Create: `src/lib/db/schema/field-rentals.ts`
- Modify: `src/lib/db/schema/teams.ts` (venues table — add 4 columns)
- Modify: `src/lib/db/schema/index.ts` (add export)

- [ ] **Step 1: Create the schema file**

Create `src/lib/db/schema/field-rentals.ts`:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { venues } from "./teams";
import { users } from "./users";

// === enums ===

export const fieldRentalStatusEnum = pgEnum("field_rental_status", [
  "pending_payment",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);
export const fieldRentalSourceEnum = pgEnum("field_rental_source", [
  "online_booking",
  "admin_created",
]);
export const fieldRentalPaymentMethodEnum = pgEnum("field_rental_payment_method", [
  "card_online",
  "card_present",
  "cash",
  "comp",
]);
export const fieldRentalPaymentStatusEnum = pgEnum("field_rental_payment_status", [
  "unpaid",
  "paid",
  "refunded",
]);
export const fieldRentalCancellationReasonEnum = pgEnum(
  "field_rental_cancellation_reason",
  ["user_request", "admin_override", "venue_unavailable"],
);

// === tables ===

export const fieldRentals = pgTable(
  "field_rentals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "restrict" }),
    fieldNumber: integer("field_number").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: fieldRentalStatusEnum("status").notNull(),
    source: fieldRentalSourceEnum("source").notNull(),
    renterUserId: uuid("renter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    renterName: text("renter_name").notNull(),
    renterEmail: text("renter_email"),
    renterPhone: text("renter_phone"),
    partySize: integer("party_size").notNull().default(1),
    purpose: text("purpose"),
    notes: text("notes"),
    paymentMethod: fieldRentalPaymentMethodEnum("payment_method").notNull(),
    amountDueCents: integer("amount_due_cents").notNull(),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    paymentStatus: fieldRentalPaymentStatusEnum("payment_status")
      .notNull()
      .default("unpaid"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeRefundId: text("stripe_refund_id"),
    paymentExpiresAt: timestamp("payment_expires_at", { withTimezone: true }),
    waiverSigned: boolean("waiver_signed").notNull().default(false),
    waiverSignedAt: timestamp("waiver_signed_at", { withTimezone: true }),
    waiverSignedBy: text("waiver_signed_by"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedInByUserId: uuid("checked_in_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: fieldRentalCancellationReasonEnum("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("field_rentals_venue_starts_at_idx").on(table.venueId, table.startsAt),
    index("field_rentals_org_starts_at_idx").on(table.organizationId, table.startsAt),
    index("field_rentals_renter_starts_at_idx").on(table.renterUserId, table.startsAt),
    index("field_rentals_active_field_idx")
      .on(table.venueId, table.fieldNumber, table.startsAt)
      .where(sql`status IN ('pending_payment', 'confirmed')`),
  ],
);

export const fieldRentalRateCard = pgTable("field_rental_rate_card", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  defaultHourlyRateCents: integer("default_hourly_rate_cents").notNull().default(8000),
  cancelWindowHours: integer("cancel_window_hours").notNull().default(24),
  bookingIncrementMinutes: integer("booking_increment_minutes").notNull().default(60),
  minDurationMinutes: integer("min_duration_minutes").notNull().default(60),
  maxDurationMinutes: integer("max_duration_minutes").notNull().default(240),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
});

// Type exports
export type FieldRental = typeof fieldRentals.$inferSelect;
export type NewFieldRental = typeof fieldRentals.$inferInsert;
export type FieldRentalRateCard = typeof fieldRentalRateCard.$inferSelect;
```

- [ ] **Step 2: Add the 4 rental columns to the `venues` table**

In `src/lib/db/schema/teams.ts`, inside the `venues` `pgTable` definition, immediately after the `partnerApplicationFeePct` line and before `createdAt`, add:

```typescript
    // Field rental config. rentalEnabled gates the feature per venue;
    // rentalHourlyRateCents overrides the org rate-card default when set;
    // open/close minutes bound the rentable window (minutes from midnight,
    // org timezone). Null open/close means no time-of-day restriction.
    rentalEnabled: boolean("rental_enabled").notNull().default(false),
    rentalHourlyRateCents: integer("rental_hourly_rate_cents"),
    rentalOpenMinute: integer("rental_open_minute"),
    rentalCloseMinute: integer("rental_close_minute"),
```

(`boolean` and `integer` are already imported in `teams.ts` — confirm at the top of the file.)

- [ ] **Step 3: Export the new schema module**

In `src/lib/db/schema/index.ts`, append after the drop-in export line:

```typescript
// Field rentals (book a field/venue time-block + payment)
export * from "./field-rentals";
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema/field-rentals.ts src/lib/db/schema/teams.ts src/lib/db/schema/index.ts
git commit -m "feat(rentals): add field_rentals + rate-card schema and venue rental columns"
```

---

## Task 2: Generate and commit the migration

**Files:**
- Create: `src/lib/db/migrations/NNNN_*.sql` (generated) + `meta` updates

- [ ] **Step 1: Generate the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/0025_*.sql` file is created adding the 5 `field_rental_*` enums, the `field_rentals` and `field_rental_rate_card` tables, and the 4 `venues` columns.

- [ ] **Step 2: Review the generated SQL**

Open the generated file. Confirm:
- The 5 enum `CREATE TYPE` statements are wrapped in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;` (drizzle-kit does this automatically — see `0024_curved_runaways.sql`). If any are not wrapped, wrap them by hand to match the repo's idempotent-migration convention.
- The `venues` changes are `ALTER TABLE "venues" ADD COLUMN ...`. Change each to `ADD COLUMN IF NOT EXISTS` to stay idempotent on a drifted DB (see CLAUDE.md "db:push vs db:generate").
- No `DROP` statements (this migration is purely additive).

- [ ] **Step 3: Apply locally to verify it runs**

Ensure `.env` `DATABASE_URL` points at localhost, then run: `npm run db:push`
Expected: applies cleanly. (This is local-only iteration; the committed migration file is the path to staging/prod.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/migrations/
git commit -m "feat(rentals): generate field_rentals migration"
```

---

## Task 3: Rental pricing (pure functions)

**Files:**
- Create: `src/lib/rentals/pricing.ts`
- Test: `tests/unit/rentals-pricing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rentals-pricing.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  resolveRentalHourlyRateCents,
  computeRentalPriceCents,
} from "@/lib/rentals/pricing";

describe("resolveRentalHourlyRateCents", () => {
  it("uses the venue override when set", () => {
    expect(resolveRentalHourlyRateCents(12000, 8000)).toBe(12000);
  });
  it("falls back to the rate-card default when the venue override is null", () => {
    expect(resolveRentalHourlyRateCents(null, 8000)).toBe(8000);
  });
});

describe("computeRentalPriceCents", () => {
  const start = new Date("2026-06-01T18:00:00Z");
  it("charges per hour for a whole-hour block", () => {
    const end = new Date("2026-06-01T20:00:00Z");
    expect(computeRentalPriceCents(start, end, 8000)).toBe(16000);
  });
  it("prorates a 90-minute block", () => {
    const end = new Date("2026-06-01T19:30:00Z");
    expect(computeRentalPriceCents(start, end, 8000)).toBe(12000);
  });
  it("returns 0 when end is not after start", () => {
    expect(computeRentalPriceCents(start, start, 8000)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/rentals-pricing.test.ts`
Expected: FAIL — cannot resolve `@/lib/rentals/pricing`.

- [ ] **Step 3: Implement**

Create `src/lib/rentals/pricing.ts`:

```typescript
/**
 * Pure pricing helpers for field rentals. No DB access — unit-tested.
 * Mirrors the drop-in "session override wins over rate-card default"
 * pattern (`src/lib/dropin/pricing.ts`).
 */

/** Venue per-venue override wins; otherwise the org rate-card default. */
export function resolveRentalHourlyRateCents(
  venueHourlyRateCents: number | null,
  rateCardDefaultHourlyRateCents: number,
): number {
  return venueHourlyRateCents ?? rateCardDefaultHourlyRateCents;
}

/** Price = (duration in hours) * hourly rate, rounded to the nearest cent. */
export function computeRentalPriceCents(
  startsAt: Date,
  endsAt: Date,
  hourlyRateCents: number,
): number {
  const ms = endsAt.getTime() - startsAt.getTime();
  if (ms <= 0) return 0;
  const hours = ms / (1000 * 60 * 60);
  return Math.round(hours * hourlyRateCents);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/rentals-pricing.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/pricing.ts tests/unit/rentals-pricing.test.ts
git commit -m "feat(rentals): rental pricing helpers with unit tests"
```

---

## Task 4: Overlap math (pure functions)

**Files:**
- Create: `src/lib/rentals/overlap.ts`
- Test: `tests/unit/rentals-overlap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rentals-overlap.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { rangesOverlap, subtractBusyBlocks } from "@/lib/rentals/overlap";

const d = (iso: string) => new Date(iso);

describe("rangesOverlap", () => {
  it("returns true for overlapping ranges", () => {
    expect(
      rangesOverlap(
        d("2026-06-01T18:00:00Z"), d("2026-06-01T20:00:00Z"),
        d("2026-06-01T19:00:00Z"), d("2026-06-01T21:00:00Z"),
      ),
    ).toBe(true);
  });
  it("returns false for touching-but-not-overlapping ranges", () => {
    expect(
      rangesOverlap(
        d("2026-06-01T18:00:00Z"), d("2026-06-01T20:00:00Z"),
        d("2026-06-01T20:00:00Z"), d("2026-06-01T21:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("subtractBusyBlocks", () => {
  it("returns the whole window when there are no busy blocks", () => {
    const free = subtractBusyBlocks(
      d("2026-06-01T16:00:00Z"), d("2026-06-01T22:00:00Z"), [],
    );
    expect(free).toEqual([
      { startsAt: d("2026-06-01T16:00:00Z"), endsAt: d("2026-06-01T22:00:00Z") },
    ]);
  });
  it("splits the window around a busy block", () => {
    const free = subtractBusyBlocks(
      d("2026-06-01T16:00:00Z"), d("2026-06-01T22:00:00Z"),
      [{ startsAt: d("2026-06-01T18:00:00Z"), endsAt: d("2026-06-01T19:00:00Z") }],
    );
    expect(free).toEqual([
      { startsAt: d("2026-06-01T16:00:00Z"), endsAt: d("2026-06-01T18:00:00Z") },
      { startsAt: d("2026-06-01T19:00:00Z"), endsAt: d("2026-06-01T22:00:00Z") },
    ]);
  });
  it("merges adjacent/overlapping busy blocks before subtracting", () => {
    const free = subtractBusyBlocks(
      d("2026-06-01T16:00:00Z"), d("2026-06-01T22:00:00Z"),
      [
        { startsAt: d("2026-06-01T18:00:00Z"), endsAt: d("2026-06-01T19:30:00Z") },
        { startsAt: d("2026-06-01T19:00:00Z"), endsAt: d("2026-06-01T20:00:00Z") },
      ],
    );
    expect(free).toEqual([
      { startsAt: d("2026-06-01T16:00:00Z"), endsAt: d("2026-06-01T18:00:00Z") },
      { startsAt: d("2026-06-01T20:00:00Z"), endsAt: d("2026-06-01T22:00:00Z") },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/rentals-overlap.test.ts`
Expected: FAIL — cannot resolve `@/lib/rentals/overlap`.

- [ ] **Step 3: Implement**

Create `src/lib/rentals/overlap.ts`:

```typescript
/**
 * Pure time-range helpers for rental availability. No DB access.
 * A "block" is a half-open interval [startsAt, endsAt).
 */
export interface TimeBlock {
  startsAt: Date;
  endsAt: Date;
}

/** Half-open overlap: touching endpoints do not count as overlapping. */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Merge overlapping/adjacent blocks into a sorted, disjoint list. */
function mergeBlocks(blocks: TimeBlock[]): TimeBlock[] {
  const sorted = [...blocks].sort(
    (x, y) => x.startsAt.getTime() - y.startsAt.getTime(),
  );
  const merged: TimeBlock[] = [];
  for (const block of sorted) {
    const last = merged[merged.length - 1];
    if (last && block.startsAt.getTime() <= last.endsAt.getTime()) {
      if (block.endsAt.getTime() > last.endsAt.getTime()) {
        last.endsAt = block.endsAt;
      }
    } else {
      merged.push({ startsAt: block.startsAt, endsAt: block.endsAt });
    }
  }
  return merged;
}

/**
 * Subtract busy blocks from a [windowStart, windowEnd) window, returning
 * the free blocks. Busy blocks are merged first so overlapping inputs are
 * handled correctly.
 */
export function subtractBusyBlocks(
  windowStart: Date,
  windowEnd: Date,
  busy: TimeBlock[],
): TimeBlock[] {
  const free: TimeBlock[] = [];
  let cursor = windowStart;
  for (const block of mergeBlocks(busy)) {
    if (block.endsAt <= cursor) continue;
    if (block.startsAt >= windowEnd) break;
    if (block.startsAt > cursor) {
      free.push({ startsAt: cursor, endsAt: block.startsAt });
    }
    if (block.endsAt > cursor) cursor = block.endsAt;
  }
  if (cursor < windowEnd) {
    free.push({ startsAt: cursor, endsAt: windowEnd });
  }
  return free;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/rentals-overlap.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/overlap.ts tests/unit/rentals-overlap.test.ts
git commit -m "feat(rentals): time-range overlap helpers with unit tests"
```

---

## Task 5: Request validators (pure functions)

**Files:**
- Create: `src/lib/rentals/validators.ts`
- Test: `tests/unit/rentals-validators.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rentals-validators.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  validateRentalRateCardPut,
  validateRentalBookingRequest,
  validateAdminRentalCreate,
} from "@/lib/rentals/validators";

describe("validateRentalRateCardPut", () => {
  it("accepts an empty body (partial update)", () => {
    expect(validateRentalRateCardPut({})).toBeNull();
  });
  it("rejects a negative rate", () => {
    expect(validateRentalRateCardPut({ defaultHourlyRateCents: -1 })).toMatch(
      /defaultHourlyRateCents/,
    );
  });
  it("rejects minDuration greater than maxDuration", () => {
    expect(
      validateRentalRateCardPut({ minDurationMinutes: 300, maxDurationMinutes: 240 }),
    ).toMatch(/minDuration/);
  });
});

describe("validateRentalBookingRequest", () => {
  const base = {
    venueId: "11111111-1111-1111-1111-111111111111",
    fieldNumber: 1,
    startsAt: "2026-06-01T18:00:00Z",
    endsAt: "2026-06-01T19:00:00Z",
    partySize: 8,
    waiverName: "Sam Renter",
    waiverAccepted: true,
  };
  it("accepts a well-formed request", () => {
    expect(validateRentalBookingRequest(base)).toBeNull();
  });
  it("rejects when endsAt is not after startsAt", () => {
    expect(
      validateRentalBookingRequest({ ...base, endsAt: "2026-06-01T18:00:00Z" }),
    ).toMatch(/endsAt/);
  });
  it("rejects when the waiver is not accepted", () => {
    expect(
      validateRentalBookingRequest({ ...base, waiverAccepted: false }),
    ).toMatch(/waiver/i);
  });
  it("rejects a blank waiver name", () => {
    expect(
      validateRentalBookingRequest({ ...base, waiverName: "  " }),
    ).toMatch(/waiver/i);
  });
});

describe("validateAdminRentalCreate", () => {
  const base = {
    venueId: "11111111-1111-1111-1111-111111111111",
    fieldNumber: 1,
    startsAt: "2026-06-01T18:00:00Z",
    endsAt: "2026-06-01T19:00:00Z",
    renterName: "Phone Caller",
    partySize: 10,
    paymentMethod: "cash" as const,
  };
  it("accepts a well-formed admin create", () => {
    expect(validateAdminRentalCreate(base)).toBeNull();
  });
  it("rejects a blank renter name", () => {
    expect(validateAdminRentalCreate({ ...base, renterName: "" })).toMatch(
      /renterName/,
    );
  });
  it("rejects an unknown payment method", () => {
    expect(
      validateAdminRentalCreate({ ...base, paymentMethod: "bitcoin" as never }),
    ).toMatch(/paymentMethod/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/rentals-validators.test.ts`
Expected: FAIL — cannot resolve `@/lib/rentals/validators`.

- [ ] **Step 3: Implement**

Create `src/lib/rentals/validators.ts`:

```typescript
/**
 * Pure-function validators for the field-rental endpoints. No DB access —
 * unit-tested. Endpoints translate a returned error string into a 400/422.
 * Mirrors `src/lib/dropin/validators.ts`.
 */

export interface RentalRateCardPutBody {
  defaultHourlyRateCents?: number;
  cancelWindowHours?: number;
  bookingIncrementMinutes?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
}

export function validateRentalRateCardPut(
  body: RentalRateCardPutBody,
): string | null {
  for (const key of [
    "defaultHourlyRateCents",
    "cancelWindowHours",
    "bookingIncrementMinutes",
    "minDurationMinutes",
    "maxDurationMinutes",
  ] as const) {
    const v = body[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      return `${key} must be a non-negative number`;
    }
  }
  if (
    body.minDurationMinutes !== undefined &&
    body.maxDurationMinutes !== undefined &&
    body.minDurationMinutes > body.maxDurationMinutes
  ) {
    return "minDurationMinutes cannot exceed maxDurationMinutes";
  }
  return null;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYMENT_METHODS = ["card_online", "card_present", "cash", "comp"] as const;

export interface RentalBookingRequestBody {
  venueId?: string;
  fieldNumber?: number;
  startsAt?: string;
  endsAt?: string;
  partySize?: number;
  purpose?: string;
  waiverName?: string;
  waiverAccepted?: boolean;
}

export function validateRentalBookingRequest(
  body: RentalBookingRequestBody,
): string | null {
  if (!body.venueId || !UUID_RX.test(body.venueId)) {
    return "venueId must be a valid id";
  }
  if (
    typeof body.fieldNumber !== "number" ||
    !Number.isInteger(body.fieldNumber) ||
    body.fieldNumber < 1
  ) {
    return "fieldNumber must be a positive integer";
  }
  const start = body.startsAt ? new Date(body.startsAt) : null;
  const end = body.endsAt ? new Date(body.endsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return "startsAt must be a valid date";
  if (!end || Number.isNaN(end.getTime())) return "endsAt must be a valid date";
  if (end.getTime() <= start.getTime()) return "endsAt must be after startsAt";
  if (
    body.partySize !== undefined &&
    (typeof body.partySize !== "number" || body.partySize < 1)
  ) {
    return "partySize must be a positive integer";
  }
  if (!body.waiverAccepted) return "waiver must be accepted to book";
  if (!body.waiverName || body.waiverName.trim().length === 0) {
    return "waiver signature name is required";
  }
  return null;
}

export interface AdminRentalCreateBody extends RentalBookingRequestBody {
  renterName?: string;
  renterEmail?: string;
  renterPhone?: string;
  renterUserId?: string;
  paymentMethod?: (typeof PAYMENT_METHODS)[number];
  notes?: string;
}

export function validateAdminRentalCreate(
  body: AdminRentalCreateBody,
): string | null {
  if (!body.venueId || !UUID_RX.test(body.venueId)) {
    return "venueId must be a valid id";
  }
  if (
    typeof body.fieldNumber !== "number" ||
    !Number.isInteger(body.fieldNumber) ||
    body.fieldNumber < 1
  ) {
    return "fieldNumber must be a positive integer";
  }
  const start = body.startsAt ? new Date(body.startsAt) : null;
  const end = body.endsAt ? new Date(body.endsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return "startsAt must be a valid date";
  if (!end || Number.isNaN(end.getTime())) return "endsAt must be a valid date";
  if (end.getTime() <= start.getTime()) return "endsAt must be after startsAt";
  if (!body.renterName || body.renterName.trim().length === 0) {
    return "renterName is required";
  }
  if (
    body.partySize !== undefined &&
    (typeof body.partySize !== "number" || body.partySize < 1)
  ) {
    return "partySize must be a positive integer";
  }
  if (
    !body.paymentMethod ||
    !PAYMENT_METHODS.includes(body.paymentMethod)
  ) {
    return `paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}`;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/rentals-validators.test.ts`
Expected: PASS (10 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/validators.ts tests/unit/rentals-validators.test.ts
git commit -m "feat(rentals): request validators with unit tests"
```

---

## Task 6: Availability + conflict detection (DB logic)

**Files:**
- Create: `src/lib/rentals/availability.ts`
- Create: `src/lib/rentals/conflicts.ts`

This task has no standalone test — it is exercised by the API tests in Tasks 8 and 9. It is split out so those endpoints stay thin.

- [ ] **Step 1: Implement `getVenueRentalAvailability`**

Create `src/lib/rentals/availability.ts`:

```typescript
/**
 * Computes free rental blocks for a venue on a given calendar date.
 *
 * Free = the venue's rental window (rentalOpenMinute..rentalCloseMinute)
 * minus scheduled/in-progress games on that (venueId, fieldNumber) minus
 * confirmed + non-expired pending_payment rentals on that field.
 *
 * Drop-in sessions are intentionally excluded from the v1 conflict net —
 * they carry no field number. See the spec's "Availability + conflict
 * detection" section.
 */
import { and, eq, gte, lt, inArray, isNull, or, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venues, games } from "@/lib/db/schema/teams";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { subtractBusyBlocks, type TimeBlock } from "./overlap";

export interface FieldAvailability {
  fieldNumber: number;
  free: TimeBlock[];
}

export async function getVenueRentalAvailability(
  venueId: string,
  /** Start of the calendar day, UTC instant for the org's local midnight. */
  dayStart: Date,
  /** End of the calendar day (dayStart + 24h). */
  dayEnd: Date,
): Promise<{ venueName: string; fields: FieldAvailability[] } | null> {
  const db = getDb();

  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue || !venue.rentalEnabled) return null;

  const fieldCount = venue.fieldCount ?? 1;

  // Venue rental window for the day. Null open/close → full day.
  const windowStart =
    venue.rentalOpenMinute != null
      ? new Date(dayStart.getTime() + venue.rentalOpenMinute * 60_000)
      : dayStart;
  const windowEnd =
    venue.rentalCloseMinute != null
      ? new Date(dayStart.getTime() + venue.rentalCloseMinute * 60_000)
      : dayEnd;

  // Games on this venue overlapping the day. games.endsAt is derived from
  // scheduledAt + durationMinutes.
  const gameRows = await db
    .select({
      fieldNumber: games.fieldNumber,
      scheduledAt: games.scheduledAt,
      durationMinutes: games.durationMinutes,
    })
    .from(games)
    .where(
      and(
        eq(games.venueId, venueId),
        inArray(games.status, ["scheduled", "in_progress"]),
        lt(games.scheduledAt, dayEnd),
      ),
    );

  // Confirmed + non-expired pending_payment rentals overlapping the day.
  const now = new Date();
  const rentalRows = await db
    .select({
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      status: fieldRentals.status,
      paymentExpiresAt: fieldRentals.paymentExpiresAt,
    })
    .from(fieldRentals)
    .where(
      and(
        eq(fieldRentals.venueId, venueId),
        lt(fieldRentals.startsAt, dayEnd),
        gt(fieldRentals.endsAt, dayStart),
        or(
          eq(fieldRentals.status, "confirmed"),
          and(
            eq(fieldRentals.status, "pending_payment"),
            or(
              isNull(fieldRentals.paymentExpiresAt),
              gte(fieldRentals.paymentExpiresAt, now),
            ),
          ),
        ),
      ),
    );

  const fields: FieldAvailability[] = [];
  for (let fieldNumber = 1; fieldNumber <= fieldCount; fieldNumber++) {
    const busy: TimeBlock[] = [];
    for (const g of gameRows) {
      if ((g.fieldNumber ?? 1) !== fieldNumber) continue;
      busy.push({
        startsAt: g.scheduledAt,
        endsAt: new Date(
          g.scheduledAt.getTime() + (g.durationMinutes ?? 0) * 60_000,
        ),
      });
    }
    for (const r of rentalRows) {
      if (r.fieldNumber !== fieldNumber) continue;
      busy.push({ startsAt: r.startsAt, endsAt: r.endsAt });
    }
    fields.push({
      fieldNumber,
      free: subtractBusyBlocks(windowStart, windowEnd, busy),
    });
  }

  return { venueName: venue.name, fields };
}
```

> Note: confirm `games` has a `durationMinutes` column when implementing — the research reported it does. If it is named differently, adjust the select and the `endsAt` computation accordingly.

- [ ] **Step 2: Implement `assertNoRentalConflict`**

Create `src/lib/rentals/conflicts.ts`:

```typescript
/**
 * Conflict detection for a proposed rental, run INSIDE a transaction.
 *
 * Takes a Postgres transaction-scoped advisory lock keyed on
 * (venueId, fieldNumber) so concurrent booking attempts for the same field
 * serialize. Then checks for any overlapping confirmed/pending rental or
 * scheduled/in-progress game on that field. Returns null if clear, or an
 * error string if the slot is taken.
 *
 * The caller MUST be inside `db.transaction(...)` and pass the `tx` handle —
 * the advisory lock is transaction-scoped and releases on commit/rollback.
 */
import { and, eq, inArray, lt, gt, or, isNull, gte, ne, sql } from "drizzle-orm";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { games } from "@/lib/db/schema/teams";

type Tx = Parameters<Parameters<ReturnType<typeof import("@/lib/db").getDb>["transaction"]>[0]>[0];

export async function assertNoRentalConflict(
  tx: Tx,
  params: {
    venueId: string;
    fieldNumber: number;
    startsAt: Date;
    endsAt: Date;
    /** When re-checking an existing row (e.g. admin edit), exclude it. */
    excludeRentalId?: string;
  },
): Promise<string | null> {
  const { venueId, fieldNumber, startsAt, endsAt, excludeRentalId } = params;

  // Transaction-scoped advisory lock. hashtext(uuid) → int4, fieldNumber is
  // already int4; the two-arg form locks on the pair.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${venueId}), ${fieldNumber})`,
  );

  const now = new Date();

  // Overlapping rental on the same field.
  const rentalConflicts = await tx
    .select({ id: fieldRentals.id })
    .from(fieldRentals)
    .where(
      and(
        eq(fieldRentals.venueId, venueId),
        eq(fieldRentals.fieldNumber, fieldNumber),
        lt(fieldRentals.startsAt, endsAt),
        gt(fieldRentals.endsAt, startsAt),
        excludeRentalId ? ne(fieldRentals.id, excludeRentalId) : undefined,
        or(
          eq(fieldRentals.status, "confirmed"),
          and(
            eq(fieldRentals.status, "pending_payment"),
            or(
              isNull(fieldRentals.paymentExpiresAt),
              gte(fieldRentals.paymentExpiresAt, now),
            ),
          ),
        ),
      ),
    )
    .limit(1);
  if (rentalConflicts.length > 0) {
    return "That field is already booked for part of the requested time.";
  }

  // Overlapping game on the same field. game end = scheduledAt + duration.
  const gameConflicts = await tx
    .select({ id: games.id })
    .from(games)
    .where(
      and(
        eq(games.venueId, venueId),
        eq(games.fieldNumber, fieldNumber),
        inArray(games.status, ["scheduled", "in_progress"]),
        lt(games.scheduledAt, endsAt),
        gt(
          sql`${games.scheduledAt} + (${games.durationMinutes} * interval '1 minute')`,
          startsAt,
        ),
      ),
    )
    .limit(1);
  if (gameConflicts.length > 0) {
    return "A scheduled game occupies that field for part of the requested time.";
  }

  return null;
}
```

> Note: the `Tx` type extraction above can be brittle across Drizzle versions. If `npx tsc --noEmit` complains, replace the `Tx` type with the concrete transaction type the codebase already uses elsewhere — grep for `db.transaction(` in `src/lib/dropin/` and copy the parameter typing pattern used there.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors. Fix the `Tx` typing per the note if needed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rentals/availability.ts src/lib/rentals/conflicts.ts
git commit -m "feat(rentals): venue availability + transactional conflict detection"
```

---

## Task 7: Rental rate-card endpoint

**Files:**
- Create: `src/pages/api/admin/rentals/rate-card.ts`
- Test: `tests/api/rentals/rate-card.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/rentals/rate-card.test.ts`. Mirror an existing admin API test for auth setup — grep `tests/api/` for a test that signs in as `admin@test.aspiresports.com` and copy its sign-in helper usage. The test must:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
// Reuse the repo's existing API-test sign-in helper. Grep tests/api/ for
// `signIn(` or the cookie-jar pattern used by other admin tests and import
// the same helper here.
import { signInAsAdmin } from "../helpers"; // adjust import to the real helper path

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("rental rate-card API", () => {
  let cookie: string;
  beforeAll(async () => {
    cookie = await signInAsAdmin();
  });

  it("GET creates and returns a default rate card", async () => {
    const res = await fetch(`${BASE}/api/admin/rentals/rate-card`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rateCard.defaultHourlyRateCents).toBeGreaterThan(0);
  });

  it("PUT updates the default hourly rate", async () => {
    const res = await fetch(`${BASE}/api/admin/rentals/rate-card`, {
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ defaultHourlyRateCents: 9500 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rateCard.defaultHourlyRateCents).toBe(9500);
  });

  it("PUT rejects a negative rate with 400", async () => {
    const res = await fetch(`${BASE}/api/admin/rentals/rate-card`, {
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ defaultHourlyRateCents: -5 }),
    });
    expect(res.status).toBe(400);
  });

  it("GET without auth returns 401/403", async () => {
    const res = await fetch(`${BASE}/api/admin/rentals/rate-card`);
    expect([401, 403]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Start the dev server in another shell (`R2_MOCK=1 CRON_SECRET=devsecret npm run dev`), then run:
`TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/rate-card.test.ts`
Expected: FAIL — endpoint returns 404.

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/admin/rentals/rate-card.ts` — structurally identical to `src/pages/api/admin/dropin/rate-card.ts`, swapping the table and validator:

```typescript
/**
 * GET /api/admin/rentals/rate-card → org's field-rental rate card (creates
 *                                    a default row if missing).
 * PUT /api/admin/rentals/rate-card → upsert with validation.
 *
 * Mirrors src/pages/api/admin/dropin/rate-card.ts.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentalRateCard } from "@/lib/db/schema/field-rentals";
import { requireAdminAccess } from "@/lib/auth/roles";
import {
  validateRentalRateCardPut,
  type RentalRateCardPutBody,
} from "@/lib/rentals/validators";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  const db = getDb();
  let [row] = await db
    .select()
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, orgId))
    .limit(1);

  if (!row) {
    [row] = await db
      .insert(fieldRentalRateCard)
      .values({ organizationId: orgId })
      .returning();
  }

  return json({ rateCard: row }, 200);
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  let body: RentalRateCardPutBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const err = validateRentalRateCardPut(body);
  if (err) return json({ error: err }, 400);

  const db = getDb();
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedByUserId: auth.user.id,
  };
  for (const key of [
    "defaultHourlyRateCents",
    "cancelWindowHours",
    "bookingIncrementMinutes",
    "minDurationMinutes",
    "maxDurationMinutes",
  ] as const) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const [existing] = await db
    .select({ id: fieldRentalRateCard.id })
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, orgId))
    .limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(fieldRentalRateCard)
      .set(updates)
      .where(eq(fieldRentalRateCard.organizationId, orgId))
      .returning();
  } else {
    [row] = await db
      .insert(fieldRentalRateCard)
      .values({ organizationId: orgId, ...updates })
      .returning();
  }
  return json({ rateCard: row }, 200);
};
```

> Note on `auth.user.id`: confirm the shape `requireAdminAccess` returns by reading `src/lib/auth/roles.ts` around line 175 — `src/pages/api/admin/dropin/rate-card.ts` uses `auth.user.id`, so it is correct, but verify.

- [ ] **Step 4: Run the test to verify it passes**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/rate-card.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/rentals/rate-card.ts tests/api/rentals/rate-card.test.ts
git commit -m "feat(rentals): admin rate-card endpoint with API tests"
```

---

## Task 8: Availability endpoint

**Files:**
- Create: `src/pages/api/rentals/availability.ts`
- Test: `tests/api/rentals/availability.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/rentals/availability.test.ts`. It needs a `rentalEnabled` venue in seed data — see Task 21 for the seed addition; for now the test can sign in as admin, create a venue via the existing admin venues endpoint with `rentalEnabled: true` (or fetch an existing seeded rental venue once Task 21 lands). Minimum assertions:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { signInAsAdmin } from "../helpers"; // adjust to real helper

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("rental availability API", () => {
  let cookie: string;
  let rentalVenueId: string;

  beforeAll(async () => {
    cookie = await signInAsAdmin();
    // Fetch a rental-enabled venue from the seed (added in Task 21).
    const res = await fetch(`${BASE}/api/admin/venues`, { headers: { cookie } });
    const body = await res.json();
    const venue = body.venues.find((v: { rentalEnabled: boolean }) => v.rentalEnabled);
    rentalVenueId = venue.id;
  });

  it("returns per-field free blocks for a rental-enabled venue", async () => {
    const res = await fetch(
      `${BASE}/api/rentals/availability?venueId=${rentalVenueId}&date=2026-06-01`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields[0]).toHaveProperty("free");
  });

  it("returns 404 for a venue that is not rental-enabled or does not exist", async () => {
    const res = await fetch(
      `${BASE}/api/rentals/availability?venueId=00000000-0000-0000-0000-000000000000&date=2026-06-01`,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for a missing date param", async () => {
    const res = await fetch(
      `${BASE}/api/rentals/availability?venueId=${rentalVenueId}`,
    );
    expect(res.status).toBe(400);
  });
});
```

> If the admin venues list endpoint is named differently, grep `src/pages/api/admin/` for the venues route and adjust. If it does not return `rentalEnabled`, add that column to its select in this task.

- [ ] **Step 2: Run the test to verify it fails**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/availability.test.ts`
Expected: FAIL — endpoint 404.

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/rentals/availability.ts`:

```typescript
/**
 * GET /api/rentals/availability?venueId=&date=YYYY-MM-DD
 *
 * Public (no auth) — returns per-field free rental blocks for the venue on
 * the given date. 404 when the venue is missing or not rental-enabled.
 */
import type { APIRoute } from "astro";
import { getVenueRentalAvailability } from "@/lib/rentals/availability";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ url }) => {
  const venueId = url.searchParams.get("venueId");
  const date = url.searchParams.get("date");
  if (!venueId) return json({ error: "venueId required" }, 400);
  if (!date || !DATE_RX.test(date)) {
    return json({ error: "date required (YYYY-MM-DD)" }, 400);
  }

  // Treat the date as a UTC calendar day. (Org-timezone handling is a
  // follow-up; for launch all venues are US/Eastern and the booking grid
  // shows local times client-side.)
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const result = await getVenueRentalAvailability(venueId, dayStart, dayEnd);
  if (!result) return json({ error: "Venue not found or rentals disabled" }, 404);

  return json(
    {
      venueName: result.venueName,
      date,
      fields: result.fields.map((f) => ({
        fieldNumber: f.fieldNumber,
        free: f.free.map((b) => ({
          startsAt: b.startsAt.toISOString(),
          endsAt: b.endsAt.toISOString(),
        })),
      })),
    },
    200,
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/availability.test.ts`
Expected: PASS (3 assertions). (If it fails only on the seed-venue lookup, that resolves once Task 21 lands; note it and proceed.)

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/rentals/availability.ts tests/api/rentals/availability.test.ts
git commit -m "feat(rentals): public availability endpoint with API tests"
```

---

## Task 9: Customer booking endpoint (create + list)

**Files:**
- Create: `src/lib/rentals/booking.ts`
- Create: `src/pages/api/rentals/bookings/index.ts`
- Test: `tests/api/rentals/bookings.test.ts`, `tests/api/rentals/conflict.test.ts`

- [ ] **Step 1: Implement the booking orchestrator lib**

Create `src/lib/rentals/booking.ts`:

```typescript
/**
 * Booking orchestration for field rentals.
 *
 * createRentalHold: inserts a `pending_payment` row inside a transaction
 * after a conflict check, holding the field for `holdMinutes`. Used by the
 * customer online flow and the admin card_present flow — the Stripe object
 * is created by the caller after this returns, and the webhook flips the
 * row to `confirmed`.
 *
 * createConfirmedRentalNonStripe: inserts a `confirmed` row directly for
 * cash/comp admin bookings (no Stripe object).
 */
import { getDb } from "@/lib/db";
import { fieldRentals, type FieldRental } from "@/lib/db/schema/field-rentals";
import { assertNoRentalConflict } from "./conflicts";

const HOLD_MINUTES = 30;

export interface RentalHoldInput {
  organizationId: string;
  venueId: string;
  fieldNumber: number;
  startsAt: Date;
  endsAt: Date;
  source: "online_booking" | "admin_created";
  paymentMethod: "card_online" | "card_present";
  amountDueCents: number;
  renterUserId: string | null;
  renterName: string;
  renterEmail: string | null;
  renterPhone: string | null;
  partySize: number;
  purpose: string | null;
  notes: string | null;
  createdByUserId: string | null;
  // Online flow captures the waiver up-front; admin flow may not.
  waiverSigned: boolean;
  waiverSignedBy: string | null;
}

export type RentalHoldResult =
  | { ok: true; rental: FieldRental }
  | { ok: false; error: string };

export async function createRentalHold(
  input: RentalHoldInput,
): Promise<RentalHoldResult> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const conflict = await assertNoRentalConflict(tx, {
      venueId: input.venueId,
      fieldNumber: input.fieldNumber,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
    if (conflict) return { ok: false as const, error: conflict };

    const [rental] = await tx
      .insert(fieldRentals)
      .values({
        organizationId: input.organizationId,
        venueId: input.venueId,
        fieldNumber: input.fieldNumber,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: "pending_payment",
        source: input.source,
        paymentMethod: input.paymentMethod,
        amountDueCents: input.amountDueCents,
        amountPaidCents: 0,
        paymentStatus: "unpaid",
        paymentExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
        renterUserId: input.renterUserId,
        renterName: input.renterName,
        renterEmail: input.renterEmail,
        renterPhone: input.renterPhone,
        partySize: input.partySize,
        purpose: input.purpose,
        notes: input.notes,
        createdByUserId: input.createdByUserId,
        waiverSigned: input.waiverSigned,
        waiverSignedAt: input.waiverSigned ? new Date() : null,
        waiverSignedBy: input.waiverSignedBy,
      })
      .returning();
    return { ok: true as const, rental };
  });
}

export interface ConfirmedRentalInput
  extends Omit<RentalHoldInput, "paymentMethod"> {
  paymentMethod: "cash" | "comp";
}

export async function createConfirmedRentalNonStripe(
  input: ConfirmedRentalInput,
): Promise<RentalHoldResult> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const conflict = await assertNoRentalConflict(tx, {
      venueId: input.venueId,
      fieldNumber: input.fieldNumber,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
    if (conflict) return { ok: false as const, error: conflict };

    const [rental] = await tx
      .insert(fieldRentals)
      .values({
        organizationId: input.organizationId,
        venueId: input.venueId,
        fieldNumber: input.fieldNumber,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: "confirmed",
        source: input.source,
        paymentMethod: input.paymentMethod,
        amountDueCents: input.amountDueCents,
        amountPaidCents: input.paymentMethod === "cash" ? input.amountDueCents : 0,
        paymentStatus: "paid",
        renterUserId: input.renterUserId,
        renterName: input.renterName,
        renterEmail: input.renterEmail,
        renterPhone: input.renterPhone,
        partySize: input.partySize,
        purpose: input.purpose,
        notes: input.notes,
        createdByUserId: input.createdByUserId,
        waiverSigned: input.waiverSigned,
        waiverSignedAt: input.waiverSigned ? new Date() : null,
        waiverSignedBy: input.waiverSignedBy,
      })
      .returning();
    return { ok: true as const, rental };
  });
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/api/rentals/bookings.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { signInAsAdmin, signInAsParent } from "../helpers"; // adjust to real helpers

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("customer rental booking API", () => {
  let parentCookie: string;
  let rentalVenueId: string;

  beforeAll(async () => {
    parentCookie = await signInAsParent();
    const adminCookie = await signInAsAdmin();
    const res = await fetch(`${BASE}/api/admin/venues`, {
      headers: { cookie: adminCookie },
    });
    const body = await res.json();
    rentalVenueId = body.venues.find(
      (v: { rentalEnabled: boolean }) => v.rentalEnabled,
    ).id;
  });

  it("POST without auth returns 401", async () => {
    const res = await fetch(`${BASE}/api/rentals/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("POST with an unaccepted waiver returns 422", async () => {
    const res = await fetch(`${BASE}/api/rentals/bookings`, {
      method: "POST",
      headers: { cookie: parentCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        venueId: rentalVenueId,
        fieldNumber: 1,
        startsAt: "2026-09-01T18:00:00.000Z",
        endsAt: "2026-09-01T19:00:00.000Z",
        partySize: 8,
        waiverName: "Test Parent",
        waiverAccepted: false,
      }),
    });
    expect(res.status).toBe(422);
  });

  it("POST a valid paid booking returns a checkout URL and creates a pending_payment hold", async () => {
    const res = await fetch(`${BASE}/api/rentals/bookings`, {
      method: "POST",
      headers: { cookie: parentCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        venueId: rentalVenueId,
        fieldNumber: 1,
        startsAt: "2026-09-02T18:00:00.000Z",
        endsAt: "2026-09-02T20:00:00.000Z",
        partySize: 10,
        purpose: "Practice",
        waiverName: "Test Parent",
        waiverAccepted: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentRequired).toBe(true);
    expect(typeof body.checkoutUrl).toBe("string");
  });

  it("GET lists the caller's own rentals", async () => {
    const res = await fetch(`${BASE}/api/rentals/bookings`, {
      headers: { cookie: parentCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.rentals)).toBe(true);
  });
});
```

Create `tests/api/rentals/conflict.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { signInAsAdmin, signInAsParent } from "../helpers"; // adjust to real helpers

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("rental conflict detection", () => {
  let parentCookie: string;
  let rentalVenueId: string;

  beforeAll(async () => {
    parentCookie = await signInAsParent();
    const adminCookie = await signInAsAdmin();
    const res = await fetch(`${BASE}/api/admin/venues`, {
      headers: { cookie: adminCookie },
    });
    const body = await res.json();
    rentalVenueId = body.venues.find(
      (v: { rentalEnabled: boolean }) => v.rentalEnabled,
    ).id;
  });

  it("rejects a second booking that overlaps a held slot", async () => {
    const slot = {
      venueId: rentalVenueId,
      fieldNumber: 2,
      startsAt: "2026-10-01T18:00:00.000Z",
      endsAt: "2026-10-01T20:00:00.000Z",
      partySize: 8,
      waiverName: "Test Parent",
      waiverAccepted: true,
    };
    const first = await fetch(`${BASE}/api/rentals/bookings`, {
      method: "POST",
      headers: { cookie: parentCookie, "Content-Type": "application/json" },
      body: JSON.stringify(slot),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${BASE}/api/rentals/bookings`, {
      method: "POST",
      headers: { cookie: parentCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...slot,
        startsAt: "2026-10-01T19:00:00.000Z",
        endsAt: "2026-10-01T21:00:00.000Z",
      }),
    });
    expect(second.status).toBe(409);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/bookings.test.ts tests/api/rentals/conflict.test.ts`
Expected: FAIL — endpoint 404.

- [ ] **Step 4: Implement the endpoint**

Create `src/pages/api/rentals/bookings/index.ts`:

```typescript
/**
 * GET  /api/rentals/bookings → the authenticated user's field rentals.
 * POST /api/rentals/bookings → create a rental.
 *   - comp/$0 path: insert a confirmed row immediately.
 *   - paid path: insert a `pending_payment` hold, create a Stripe Checkout
 *     Session (Connect-aware), return the URL. The webhook flips the row to
 *     `confirmed`.
 *
 * Mirrors src/pages/api/dropin/bookings/index.ts.
 */
import type { APIRoute } from "astro";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalRateCard } from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { stripe } from "@/lib/stripe/client";
import { resolveRentalHourlyRateCents, computeRentalPriceCents } from "@/lib/rentals/pricing";
import { validateRentalBookingRequest } from "@/lib/rentals/validators";
import { createRentalHold, createConfirmedRentalNonStripe } from "@/lib/rentals/booking";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const db = getDb();
  const rows = await db
    .select({
      id: fieldRentals.id,
      venueId: fieldRentals.venueId,
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      status: fieldRentals.status,
      paymentStatus: fieldRentals.paymentStatus,
      amountDueCents: fieldRentals.amountDueCents,
      amountPaidCents: fieldRentals.amountPaidCents,
      partySize: fieldRentals.partySize,
      purpose: fieldRentals.purpose,
      checkedInAt: fieldRentals.checkedInAt,
      venueName: venues.name,
    })
    .from(fieldRentals)
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .where(eq(fieldRentals.renterUserId, locals.user.id))
    .orderBy(desc(fieldRentals.startsAt));

  return json({ rentals: rows }, 200);
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const validationError = validateRentalBookingRequest(body);
  if (validationError) return json({ error: validationError }, 422);

  const venueId = body.venueId as string;
  const fieldNumber = body.fieldNumber as number;
  const startsAt = new Date(body.startsAt as string);
  const endsAt = new Date(body.endsAt as string);
  const partySize = (body.partySize as number) ?? 1;
  const purpose = (body.purpose as string) ?? null;
  const waiverName = (body.waiverName as string).trim();

  const db = getDb();
  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue || !venue.rentalEnabled) {
    return json({ error: "Venue not found or rentals disabled" }, 404);
  }

  // Org context — derive from the venue's location.
  const orgId = locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  // Rate card → resolved hourly rate → price.
  let [rateCard] = await db
    .select()
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, orgId))
    .limit(1);
  if (!rateCard) {
    [rateCard] = await db
      .insert(fieldRentalRateCard)
      .values({ organizationId: orgId })
      .returning();
  }

  // Duration bounds check.
  const durationMinutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
  if (durationMinutes < rateCard.minDurationMinutes) {
    return json(
      { error: `Minimum rental is ${rateCard.minDurationMinutes} minutes` },
      422,
    );
  }
  if (durationMinutes > rateCard.maxDurationMinutes) {
    return json(
      { error: `Maximum rental is ${rateCard.maxDurationMinutes} minutes` },
      422,
    );
  }

  const hourlyRate = resolveRentalHourlyRateCents(
    venue.rentalHourlyRateCents,
    rateCard.defaultHourlyRateCents,
  );
  const amountDueCents = computeRentalPriceCents(startsAt, endsAt, hourlyRate);

  // $0 → confirmed comp immediately.
  if (amountDueCents === 0) {
    const result = await createConfirmedRentalNonStripe({
      organizationId: orgId,
      venueId,
      fieldNumber,
      startsAt,
      endsAt,
      source: "online_booking",
      paymentMethod: "comp",
      amountDueCents: 0,
      renterUserId: locals.user.id,
      renterName: waiverName,
      renterEmail: locals.user.email,
      renterPhone: null,
      partySize,
      purpose,
      notes: null,
      createdByUserId: locals.user.id,
      waiverSigned: true,
      waiverSignedBy: waiverName,
    });
    if (!result.ok) return json({ error: result.error }, 409);
    return json({ paymentRequired: false, rentalId: result.rental.id }, 200);
  }

  // Paid → hold + Stripe Checkout.
  if (!stripe) return json({ error: "Stripe not configured" }, 500);

  const hold = await createRentalHold({
    organizationId: orgId,
    venueId,
    fieldNumber,
    startsAt,
    endsAt,
    source: "online_booking",
    paymentMethod: "card_online",
    amountDueCents,
    renterUserId: locals.user.id,
    renterName: waiverName,
    renterEmail: locals.user.email,
    renterPhone: null,
    partySize,
    purpose,
    notes: null,
    createdByUserId: locals.user.id,
    waiverSigned: true,
    waiverSignedBy: waiverName,
  });
  if (!hold.ok) return json({ error: hold.error }, 409);

  const partnerStripeAccountId = venue.partnerStripeAccountId ?? null;
  const applicationFeePct = venue.partnerApplicationFeePct ?? 0;
  const applicationFeeCents = partnerStripeAccountId
    ? Math.round((amountDueCents * applicationFeePct) / 100)
    : undefined;
  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";

  try {
    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: locals.user.email,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Field rental — ${venue.name}`,
                description: `Field ${fieldNumber}, ${startsAt.toISOString()}`,
              },
              unit_amount: amountDueCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: "field_rental",
          rental_id: hold.rental.id,
          organization_id: orgId,
        },
        payment_intent_data: partnerStripeAccountId
          ? {
              application_fee_amount: applicationFeeCents,
              transfer_data: { destination: partnerStripeAccountId },
            }
          : undefined,
        success_url: `${appUrl}/dashboard/bookings?rental=success`,
        cancel_url: `${appUrl}/rentals?rental=cancelled`,
      },
      { idempotencyKey: `${hold.rental.id}:rental-checkout:${amountDueCents}` },
    );
    return json(
      {
        paymentRequired: true,
        checkoutUrl: checkoutSession.url,
        rentalId: hold.rental.id,
      },
      200,
    );
  } catch (err) {
    // Roll the hold back so the field is not orphaned-as-busy.
    await db.delete(fieldRentals).where(eq(fieldRentals.id, hold.rental.id));
    console.error("[rentals] checkout session create failed", err);
    return json({ error: "Could not start checkout" }, 502);
  }
};
```

> Note on org context: `locals.organization` is set by middleware via domain resolution. If a customer can reach `/api/rentals/bookings` on a host without an org context, the `400` is correct. Confirm `locals.organization` is populated on the customer host the same way `src/pages/api/dropin/bookings/index.ts` relies on it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/bookings.test.ts tests/api/rentals/conflict.test.ts`
Expected: PASS (5 assertions total).

- [ ] **Step 6: Commit**

```bash
git add src/lib/rentals/booking.ts src/pages/api/rentals/bookings/index.ts tests/api/rentals/bookings.test.ts tests/api/rentals/conflict.test.ts
git commit -m "feat(rentals): customer booking endpoint with hold + checkout and conflict tests"
```

---

## Task 10: Checkout-complete webhook handler

**Files:**
- Create: `src/lib/stripe/handle-field-rental-checkout-complete.ts`
- Modify: `src/pages/api/webhooks/stripe.ts`
- Test: `tests/api/rentals/webhook.test.ts`

- [ ] **Step 1: Implement the handler**

Create `src/lib/stripe/handle-field-rental-checkout-complete.ts`:

```typescript
/**
 * Stripe webhook handler for field-rental checkout completion.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "checkout.session.completed"` AND
 * `metadata.type === "field_rental"`.
 *
 * Flips the `pending_payment` hold row to `confirmed` and records payment.
 * Idempotent: if the row is already `confirmed`, skip. Mirrors
 * src/lib/stripe/handle-dropin-checkout-complete.ts.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";

export async function handleFieldRentalCheckoutComplete(
  session: Stripe.Checkout.Session,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; rentalId: string; paidCents: number }
> {
  const rentalId = session.metadata?.rental_id;
  if (!rentalId) {
    return { status: "skipped", reason: "missing rental_id metadata" };
  }

  const db = getDb();
  const paymentIntentId = (session.payment_intent as string) ?? null;
  const paidCents = session.amount_total ?? 0;

  return await db.transaction(async (tx) => {
    const [rental] = await tx
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId))
      .for("update");
    if (!rental) {
      return { status: "skipped", reason: `rental ${rentalId} not found` };
    }
    if (rental.status === "confirmed") {
      return { status: "skipped", reason: `rental ${rentalId} already confirmed` };
    }
    if (rental.status !== "pending_payment") {
      return {
        status: "skipped",
        reason: `rental ${rentalId} in unexpected status ${rental.status}`,
      };
    }

    await tx
      .update(fieldRentals)
      .set({
        status: "confirmed",
        paymentStatus: "paid",
        amountPaidCents: paidCents,
        stripePaymentIntentId: paymentIntentId,
        paymentExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(fieldRentals.id, rentalId));

    return { status: "processed", rentalId, paidCents };
  });
}
```

- [ ] **Step 2: Wire it into the webhook router**

In `src/pages/api/webhooks/stripe.ts`:

Add the import near the other handler imports:

```typescript
import { handleFieldRentalCheckoutComplete } from "@/lib/stripe/handle-field-rental-checkout-complete";
```

In the `case "checkout.session.completed":` block, extend the metadata routing. Replace the existing `if (session.metadata?.type === "dropin_booking") { ... } else { ... }` with:

```typescript
        if (session.metadata?.type === "dropin_booking") {
          const result = await handleDropInCheckoutComplete(session);
          console.log(
            `[stripe webhook] checkout.session.completed (dropin) → ${result.status}`,
            result,
          );
        } else if (session.metadata?.type === "field_rental") {
          const result = await handleFieldRentalCheckoutComplete(session);
          console.log(
            `[stripe webhook] checkout.session.completed (field_rental) → ${result.status}`,
            result,
          );
        } else {
          const result = await handleCheckoutComplete(session);
          console.log(
            `[stripe webhook] checkout.session.completed → ${result.status}`,
            result,
          );
        }
```

- [ ] **Step 3: Write the failing test**

Create `tests/api/rentals/webhook.test.ts`. The test verifies the handler logic by driving a rental through to `confirmed`. Because constructing a signed Stripe event over HTTP is heavy, test the handler function directly against the DB (a unit-style test that needs a DB connection — place it in `tests/api/` since it touches the DB, per the repo's test-layout rule):

```typescript
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { eq } from "drizzle-orm";
import { handleFieldRentalCheckoutComplete } from "@/lib/stripe/handle-field-rental-checkout-complete";
import { createRentalHold } from "@/lib/rentals/booking";
// Reuse a seeded rental-enabled venue + org id. Grep the seed file
// (src/lib/db/seeds/seed-e2e-tests.ts) for the rental venue's fixed UUID
// added in Task 21, and import or hardcode it here.
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

describe("handleFieldRentalCheckoutComplete", () => {
  it("flips a pending_payment hold to confirmed and records payment", async () => {
    const hold = await createRentalHold({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: 3,
      startsAt: new Date("2026-11-01T18:00:00.000Z"),
      endsAt: new Date("2026-11-01T19:00:00.000Z"),
      source: "online_booking",
      paymentMethod: "card_online",
      amountDueCents: 8000,
      renterUserId: null,
      renterName: "Webhook Test",
      renterEmail: null,
      renterPhone: null,
      partySize: 8,
      purpose: null,
      notes: null,
      createdByUserId: null,
      waiverSigned: true,
      waiverSignedBy: "Webhook Test",
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) return;

    const result = await handleFieldRentalCheckoutComplete({
      metadata: { type: "field_rental", rental_id: hold.rental.id },
      payment_intent: "pi_test_rental_webhook",
      amount_total: 8000,
    } as never);
    expect(result.status).toBe("processed");

    const [row] = await getDb()
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, hold.rental.id));
    expect(row.status).toBe("confirmed");
    expect(row.paymentStatus).toBe("paid");
    expect(row.amountPaidCents).toBe(8000);

    // Idempotency: a second delivery is a no-op skip.
    const again = await handleFieldRentalCheckoutComplete({
      metadata: { type: "field_rental", rental_id: hold.rental.id },
      payment_intent: "pi_test_rental_webhook",
      amount_total: 8000,
    } as never);
    expect(again.status).toBe("skipped");
  });
});
```

> If the seed file does not export the venue/org ids as named constants, add those exports in Task 21 — note the dependency and continue.

- [ ] **Step 4: Run the test to verify it fails, then passes**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/webhook.test.ts`
Expected before Step 1–2 wiring: FAIL (module missing). After: PASS (5 assertions). If it fails only on the seed-constant import, that resolves with Task 21.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stripe/handle-field-rental-checkout-complete.ts src/pages/api/webhooks/stripe.ts tests/api/rentals/webhook.test.ts
git commit -m "feat(rentals): checkout-complete webhook handler with idempotency test"
```

---

## Task 11: Customer cancel endpoint

**Files:**
- Create: `src/lib/rentals/refund.ts`
- Create: `src/pages/api/rentals/bookings/[id]/cancel.ts`

The refund helper is created here and reused by the admin refund endpoint (Task 13).

- [ ] **Step 1: Implement the refund helper**

Create `src/lib/rentals/refund.ts`:

```typescript
/**
 * Refund + cancel a field rental. Issues a Stripe refund when the rental
 * was paid online/card-present, then marks the row cancelled. Cash/comp
 * rentals are cancelled without a Stripe call.
 *
 * Returns the updated row or an error string. Idempotency-keyed on the
 * rental id + amount per the repo's Stripe key convention.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, type FieldRental } from "@/lib/db/schema/field-rentals";
import { stripe } from "@/lib/stripe/client";

export async function refundFieldRental(
  rentalId: string,
  reason: "user_request" | "admin_override" | "venue_unavailable",
): Promise<{ ok: true; rental: FieldRental } | { ok: false; error: string }> {
  const db = getDb();
  const [rental] = await db
    .select()
    .from(fieldRentals)
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  if (!rental) return { ok: false, error: "Rental not found" };
  if (rental.status === "cancelled") {
    return { ok: false, error: "Rental already cancelled" };
  }

  const needsStripeRefund =
    rental.paymentStatus === "paid" &&
    rental.amountPaidCents > 0 &&
    rental.stripePaymentIntentId != null &&
    (rental.paymentMethod === "card_online" ||
      rental.paymentMethod === "card_present");

  let stripeRefundId: string | null = rental.stripeRefundId;
  if (needsStripeRefund) {
    if (!stripe) return { ok: false, error: "Stripe not configured" };
    try {
      const refund = await stripe.refunds.create(
        { payment_intent: rental.stripePaymentIntentId! },
        {
          idempotencyKey: `${rental.id}:refund:${rental.amountPaidCents}`,
        },
      );
      stripeRefundId = refund.id;
    } catch (err) {
      console.error("[rentals] refund failed", err);
      return { ok: false, error: "Refund failed; rental not cancelled" };
    }
  }

  const [updated] = await db
    .update(fieldRentals)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: reason,
      paymentStatus: needsStripeRefund ? "refunded" : rental.paymentStatus,
      stripeRefundId,
      updatedAt: new Date(),
    })
    .where(eq(fieldRentals.id, rentalId))
    .returning();
  return { ok: true, rental: updated };
}
```

- [ ] **Step 2: Implement the customer cancel endpoint**

Create `src/pages/api/rentals/bookings/[id]/cancel.ts`:

```typescript
/**
 * POST /api/rentals/bookings/:id/cancel
 *
 * The renter cancels their own rental. Allowed only outside the rate
 * card's cancelWindowHours before `startsAt`. Issues a refund if paid.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalRateCard } from "@/lib/db/schema/field-rentals";
import { refundFieldRental } from "@/lib/rentals/refund";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const rentalId = params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  const db = getDb();
  const [rental] = await db
    .select()
    .from(fieldRentals)
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  // 404 (not 403) for "not yours" — do not leak existence.
  if (!rental || rental.renterUserId !== locals.user.id) {
    return json({ error: "Rental not found" }, 404);
  }
  if (rental.status === "cancelled") {
    return json({ error: "Rental already cancelled" }, 409);
  }

  const [rateCard] = await db
    .select()
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, rental.organizationId))
    .limit(1);
  const cancelWindowHours = rateCard?.cancelWindowHours ?? 24;
  const cutoff = new Date(
    rental.startsAt.getTime() - cancelWindowHours * 60 * 60 * 1000,
  );
  if (new Date() > cutoff) {
    return json(
      {
        error: `Rentals can only be cancelled more than ${cancelWindowHours} hours before the start time.`,
      },
      422,
    );
  }

  const result = await refundFieldRental(rentalId, "user_request");
  if (!result.ok) return json({ error: result.error }, 502);
  return json({ rental: result.rental }, 200);
};
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rentals/refund.ts src/pages/api/rentals/bookings/[id]/cancel.ts
git commit -m "feat(rentals): refund helper + customer cancel endpoint"
```

---

## Task 12: Admin rentals list + create endpoint

**Files:**
- Create: `src/pages/api/admin/rentals/index.ts`

- [ ] **Step 1: Implement the endpoint**

Create `src/pages/api/admin/rentals/index.ts`:

```typescript
/**
 * GET  /api/admin/rentals?venueId=&from=&to=&status= → filtered list.
 * POST /api/admin/rentals → admin-created rental (phone/walk-in).
 *   - cash/comp → confirmed immediately.
 *   - card_present → pending_payment hold + PaymentIntent (Terminal); the
 *     webhook confirms it. (Terminal client wiring is in the admin UI.)
 *   - card_online → confirmed row + (optional) emailed payment link; for v1
 *     we create a confirmed row with paymentStatus "unpaid" and surface it
 *     in the admin UI as "payment link pending" — link emailing is deferred.
 */
import type { APIRoute } from "astro";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalRateCard } from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { requireAdminAccess } from "@/lib/auth/roles";
import {
  requireSameOrgVenue,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { validateAdminRentalCreate } from "@/lib/rentals/validators";
import { resolveRentalHourlyRateCents, computeRentalPriceCents } from "@/lib/rentals/pricing";
import { createRentalHold, createConfirmedRentalNonStripe } from "@/lib/rentals/booking";
import { stripe } from "@/lib/stripe/client";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  const url = context.url;
  const venueId = url.searchParams.get("venueId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const status = url.searchParams.get("status");

  const conditions = [eq(fieldRentals.organizationId, orgId)];
  if (venueId) conditions.push(eq(fieldRentals.venueId, venueId));
  if (from) conditions.push(gte(fieldRentals.startsAt, new Date(from)));
  if (to) conditions.push(lte(fieldRentals.startsAt, new Date(to)));
  if (status)
    conditions.push(
      eq(
        fieldRentals.status,
        status as (typeof fieldRentals.status.enumValues)[number],
      ),
    );

  const rows = await getDb()
    .select({
      id: fieldRentals.id,
      venueId: fieldRentals.venueId,
      venueName: venues.name,
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      status: fieldRentals.status,
      source: fieldRentals.source,
      renterName: fieldRentals.renterName,
      renterPhone: fieldRentals.renterPhone,
      partySize: fieldRentals.partySize,
      paymentMethod: fieldRentals.paymentMethod,
      paymentStatus: fieldRentals.paymentStatus,
      amountDueCents: fieldRentals.amountDueCents,
      amountPaidCents: fieldRentals.amountPaidCents,
      waiverSigned: fieldRentals.waiverSigned,
      checkedInAt: fieldRentals.checkedInAt,
    })
    .from(fieldRentals)
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .where(and(...conditions))
    .orderBy(desc(fieldRentals.startsAt));

  return json({ rentals: rows }, 200);
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const validationError = validateAdminRentalCreate(body);
  if (validationError) return json({ error: validationError }, 422);

  const venueId = body.venueId as string;
  const ownership = await requireSameOrgVenue(orgId, venueId);
  if (!ownership.ok) return ownershipDeniedResponse();

  const db = getDb();
  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) return ownershipDeniedResponse();

  const fieldNumber = body.fieldNumber as number;
  const startsAt = new Date(body.startsAt as string);
  const endsAt = new Date(body.endsAt as string);
  const partySize = (body.partySize as number) ?? 1;
  const purpose = (body.purpose as string) ?? null;
  const notes = (body.notes as string) ?? null;
  const renterName = (body.renterName as string).trim();
  const renterEmail = (body.renterEmail as string) ?? null;
  const renterPhone = (body.renterPhone as string) ?? null;
  const renterUserId = (body.renterUserId as string) ?? null;
  const paymentMethod = body.paymentMethod as
    | "card_online"
    | "card_present"
    | "cash"
    | "comp";

  let [rateCard] = await db
    .select()
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, orgId))
    .limit(1);
  if (!rateCard) {
    [rateCard] = await db
      .insert(fieldRentalRateCard)
      .values({ organizationId: orgId })
      .returning();
  }
  const hourlyRate = resolveRentalHourlyRateCents(
    venue.rentalHourlyRateCents,
    rateCard.defaultHourlyRateCents,
  );
  const amountDueCents =
    paymentMethod === "comp"
      ? 0
      : computeRentalPriceCents(startsAt, endsAt, hourlyRate);

  // cash / comp → confirmed immediately.
  if (paymentMethod === "cash" || paymentMethod === "comp") {
    const result = await createConfirmedRentalNonStripe({
      organizationId: orgId,
      venueId,
      fieldNumber,
      startsAt,
      endsAt,
      source: "admin_created",
      paymentMethod,
      amountDueCents,
      renterUserId,
      renterName,
      renterEmail,
      renterPhone,
      partySize,
      purpose,
      notes,
      createdByUserId: auth.user.id,
      waiverSigned: false,
      waiverSignedBy: null,
    });
    if (!result.ok) return json({ error: result.error }, 409);
    return json({ rental: result.rental, paymentRequired: false }, 200);
  }

  // card_present → hold + Terminal PaymentIntent.
  if (paymentMethod === "card_present") {
    if (!stripe) return json({ error: "Stripe not configured" }, 500);
    const hold = await createRentalHold({
      organizationId: orgId,
      venueId,
      fieldNumber,
      startsAt,
      endsAt,
      source: "admin_created",
      paymentMethod: "card_present",
      amountDueCents,
      renterUserId,
      renterName,
      renterEmail,
      renterPhone,
      partySize,
      purpose,
      notes,
      createdByUserId: auth.user.id,
      waiverSigned: false,
      waiverSignedBy: null,
    });
    if (!hold.ok) return json({ error: hold.error }, 409);

    const partnerStripeAccountId = venue.partnerStripeAccountId ?? null;
    const applicationFeePct = venue.partnerApplicationFeePct ?? 0;
    const applicationFeeCents = partnerStripeAccountId
      ? Math.round((amountDueCents * applicationFeePct) / 100)
      : undefined;
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: amountDueCents,
          currency: "usd",
          payment_method_types: ["card_present"],
          capture_method: "automatic",
          metadata: {
            type: "field_rental_walk_up",
            rental_id: hold.rental.id,
            organization_id: orgId,
          },
          ...(partnerStripeAccountId
            ? {
                application_fee_amount: applicationFeeCents,
                transfer_data: { destination: partnerStripeAccountId },
              }
            : {}),
        },
        { idempotencyKey: `${hold.rental.id}:rental-cp-pi:${amountDueCents}` },
      );
      return json(
        {
          paymentRequired: true,
          rentalId: hold.rental.id,
          clientSecret: intent.client_secret,
          amountCents: amountDueCents,
        },
        200,
      );
    } catch (err) {
      await db.delete(fieldRentals).where(eq(fieldRentals.id, hold.rental.id));
      console.error("[rentals] card-present PI create failed", err);
      return json({ error: "Could not start card-present payment" }, 502);
    }
  }

  // card_online → confirmed row, payment link emailing deferred to a
  // follow-up. Row is created unpaid so it shows in the admin list.
  const result = await createConfirmedRentalNonStripe({
    organizationId: orgId,
    venueId,
    fieldNumber,
    startsAt,
    endsAt,
    source: "admin_created",
    paymentMethod: "cash", // placeholder method satisfies the typed union;
    amountDueCents,
    renterUserId,
    renterName,
    renterEmail,
    renterPhone,
    partySize,
    purpose,
    notes,
    createdByUserId: auth.user.id,
    waiverSigned: false,
    waiverSignedBy: null,
  });
  if (!result.ok) return json({ error: result.error }, 409);
  // Correct the method + payment status post-insert.
  const [fixed] = await db
    .update(fieldRentals)
    .set({ paymentMethod: "card_online", paymentStatus: "unpaid", amountPaidCents: 0 })
    .where(eq(fieldRentals.id, result.rental.id))
    .returning();
  return json({ rental: fixed, paymentRequired: false }, 200);
};
```

> The `card_online` admin branch is deliberately minimal for v1 (the spec marks the emailed payment link optional). If you prefer, drop `card_online` from `validateAdminRentalCreate`'s allowed methods instead — but keep it if the admin UI offers it. Either way, do not leave a half-built link flow.

- [ ] **Step 2: Write the failing test**

Append to `tests/api/rentals/bookings.test.ts` a new `describe` block (or create `tests/api/rentals/admin-rentals.test.ts`) covering:
- `POST /api/admin/rentals` with `paymentMethod: "cash"` and a valid venue → 200, `rental.status === "confirmed"`, `rental.paymentStatus === "paid"`.
- `POST /api/admin/rentals` with `paymentMethod: "comp"` → 200, `rental.amountDueCents === 0`.
- `POST /api/admin/rentals` for a venue in another org → 404 (ownership denied).
- `GET /api/admin/rentals?status=confirmed` → 200, returns an array, every row `status === "confirmed"`.
- `GET /api/admin/rentals` without admin auth → 401/403.

Use the `signInAsAdmin` helper and the rental-enabled seed venue id, same as Task 9.

- [ ] **Step 3: Run the tests (fail → pass)**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/admin-rentals.test.ts`
Expected: PASS after Step 1.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/rentals/index.ts tests/api/rentals/admin-rentals.test.ts
git commit -m "feat(rentals): admin rentals list + create endpoint with tests"
```

---

## Task 13: Admin rental detail + cancel/refund endpoints

**Files:**
- Create: `src/pages/api/admin/rentals/[id].ts`
- Create: `src/pages/api/admin/rentals/[id]/refund.ts`
- Test: `tests/api/rentals/refund.test.ts`

- [ ] **Step 1: Implement the detail + PATCH endpoint**

Create `src/pages/api/admin/rentals/[id].ts`:

```typescript
/**
 * GET   /api/admin/rentals/:id → full rental detail (org-scoped).
 * PATCH /api/admin/rentals/:id → update notes/purpose, or cancel (without
 *        refund — use /refund for paid rentals). Body: { notes?, purpose?,
 *        cancel?: boolean }.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { requireAdminAccess } from "@/lib/auth/roles";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);
  const rentalId = context.params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  const [row] = await getDb()
    .select()
    .from(fieldRentals)
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  if (!row || row.field_rentals.organizationId !== orgId) {
    return json({ error: "Rental not found" }, 404);
  }
  return json(
    { rental: row.field_rentals, venue: row.venues },
    200,
  );
};

export const PATCH: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);
  const rentalId = context.params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  let body: { notes?: string; purpose?: string; cancel?: boolean };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const db = getDb();
  const [rental] = await db
    .select()
    .from(fieldRentals)
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  if (!rental || rental.organizationId !== orgId) {
    return json({ error: "Rental not found" }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.purpose !== undefined) updates.purpose = body.purpose;
  if (body.cancel === true) {
    if (rental.paymentStatus === "paid" && rental.amountPaidCents > 0) {
      return json(
        { error: "Paid rental — use POST /api/admin/rentals/:id/refund" },
        422,
      );
    }
    updates.status = "cancelled";
    updates.cancelledAt = new Date();
    updates.cancellationReason = "admin_override";
  }

  const [updated] = await db
    .update(fieldRentals)
    .set(updates)
    .where(eq(fieldRentals.id, rentalId))
    .returning();
  return json({ rental: updated }, 200);
};
```

> Note on the join row shape: Drizzle returns joined rows keyed by table name (`row.field_rentals`, `row.venues`). Confirm the table key — it is the SQL table name, so `field_rentals` and `venues`. If `npx tsc` disagrees, log the row shape once and adjust.

- [ ] **Step 2: Implement the refund endpoint**

Create `src/pages/api/admin/rentals/[id]/refund.ts`:

```typescript
/**
 * POST /api/admin/rentals/:id/refund → refund + cancel a paid rental.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { requireAdminAccess } from "@/lib/auth/roles";
import { refundFieldRental } from "@/lib/rentals/refund";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);
  const rentalId = context.params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  const [rental] = await getDb()
    .select()
    .from(fieldRentals)
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  if (!rental || rental.organizationId !== orgId) {
    return json({ error: "Rental not found" }, 404);
  }

  const result = await refundFieldRental(rentalId, "admin_override");
  if (!result.ok) return json({ error: result.error }, 502);
  return json({ rental: result.rental }, 200);
};
```

- [ ] **Step 3: Write the failing test**

Create `tests/api/rentals/refund.test.ts`. It should:
- Sign in as admin, create a `cash` rental via `POST /api/admin/rentals` (this gives `paymentStatus: "paid"` with no Stripe PI, so `refundFieldRental` cancels without a Stripe call).
- `POST /api/admin/rentals/:id/refund` → 200, `rental.status === "cancelled"`.
- A second refund of the same rental → 502 (already cancelled).
- `PATCH /api/admin/rentals/:id` with `{ cancel: true }` on an *unpaid* `card_online` rental → 200, `status === "cancelled"`.
- `GET /api/admin/rentals/:id` for a rental in another org → 404.

- [ ] **Step 4: Run the tests (fail → pass)**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/refund.test.ts`
Expected: PASS after Steps 1–2.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/pages/api/admin/rentals/[id].ts src/pages/api/admin/rentals/[id]/refund.ts tests/api/rentals/refund.test.ts
git commit -m "feat(rentals): admin rental detail, cancel, and refund endpoints with tests"
```

---

## Task 14: Card-present walk-up webhook handler

**Files:**
- Create: `src/lib/stripe/handle-field-rental-walkup-payment.ts`
- Modify: `src/pages/api/webhooks/stripe.ts`

- [ ] **Step 1: Implement the handler**

Create `src/lib/stripe/handle-field-rental-walkup-payment.ts`:

```typescript
/**
 * Stripe webhook handler for field-rental card-present (Terminal) payments.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "payment_intent.succeeded"` AND
 * `metadata.type === "field_rental_walk_up"`.
 *
 * Flips the `pending_payment` hold to `confirmed`. Mirrors
 * src/lib/stripe/handle-dropin-walkup-payment.ts.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";

export async function handleFieldRentalWalkUpPayment(
  paymentIntent: Stripe.PaymentIntent,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; rentalId: string; paidCents: number }
> {
  const rentalId = paymentIntent.metadata?.rental_id;
  if (!rentalId) {
    return { status: "skipped", reason: "missing rental_id metadata" };
  }
  const paidCents = paymentIntent.amount_received ?? paymentIntent.amount ?? 0;
  const db = getDb();

  return await db.transaction(async (tx) => {
    const [rental] = await tx
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId))
      .for("update");
    if (!rental) {
      return { status: "skipped", reason: `rental ${rentalId} not found` };
    }
    if (rental.status === "confirmed") {
      return { status: "skipped", reason: `rental ${rentalId} already confirmed` };
    }
    if (rental.status !== "pending_payment") {
      return {
        status: "skipped",
        reason: `rental ${rentalId} in unexpected status ${rental.status}`,
      };
    }
    await tx
      .update(fieldRentals)
      .set({
        status: "confirmed",
        paymentStatus: "paid",
        amountPaidCents: paidCents,
        stripePaymentIntentId: paymentIntent.id,
        paymentExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(fieldRentals.id, rentalId));
    return { status: "processed", rentalId, paidCents };
  });
}
```

- [ ] **Step 2: Wire it into the webhook router**

In `src/pages/api/webhooks/stripe.ts`, add the import:

```typescript
import { handleFieldRentalWalkUpPayment } from "@/lib/stripe/handle-field-rental-walkup-payment";
```

In the `case "payment_intent.succeeded":` block, add a branch before the `dropin_booking_walk_up` branch:

```typescript
        if (paymentIntent.metadata?.type === "field_rental_walk_up") {
          const result = await handleFieldRentalWalkUpPayment(paymentIntent);
          console.log(
            `[stripe webhook] payment_intent.succeeded (field_rental walk-up) → ${result.status}`,
            result,
          );
        } else if (paymentIntent.metadata?.type === "dropin_booking_walk_up") {
```

(Keep the rest of the existing `else if` chain intact.)

- [ ] **Step 3: Extend the webhook test**

In `tests/api/rentals/webhook.test.ts`, add a second `it(...)` that creates a `card_present` hold via `createRentalHold` and calls `handleFieldRentalWalkUpPayment` directly with a faked `PaymentIntent` (`{ id, amount_received, metadata: { type: "field_rental_walk_up", rental_id } } as never`), asserting the row flips to `confirmed`/`paid` and a second call skips.

- [ ] **Step 4: Run the test, type-check, commit**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/webhook.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/lib/stripe/handle-field-rental-walkup-payment.ts src/pages/api/webhooks/stripe.ts tests/api/rentals/webhook.test.ts
git commit -m "feat(rentals): card-present walk-up webhook handler with test"
```

---

## Task 15: Scheduled expiry of abandoned holds

**Files:**
- Create: `src/lib/rentals/expire.ts`
- Create: `src/pages/api/cron/expire-pending-rentals.ts`
- Create: `netlify/functions/scheduled-expire-pending-rentals.ts`

- [ ] **Step 1: Implement the expiry sweep lib**

Create `src/lib/rentals/expire.ts`:

```typescript
/**
 * Sweep `pending_payment` field-rental rows whose `payment_expires_at` has
 * passed and mark them cancelled, freeing the field. Mirrors the drop-in
 * `expireOverduePromotions` sweep.
 */
import { and, eq, lt, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";

export async function expirePendingRentals(): Promise<{ expired: number }> {
  const now = new Date();
  const rows = await getDb()
    .update(fieldRentals)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: "user_request",
      updatedAt: now,
    })
    .where(
      and(
        eq(fieldRentals.status, "pending_payment"),
        isNotNull(fieldRentals.paymentExpiresAt),
        lt(fieldRentals.paymentExpiresAt, now),
      ),
    )
    .returning({ id: fieldRentals.id });
  return { expired: rows.length };
}
```

- [ ] **Step 2: Implement the cron route**

Create `src/pages/api/cron/expire-pending-rentals.ts` — copy `src/pages/api/cron/expire-pending-claims.ts` exactly, swapping the lib call and log strings:

```typescript
/**
 * POST /api/cron/expire-pending-rentals
 *
 * Cron entry point for the field-rental pending-payment expiry sweep.
 * Mirrors /api/cron/expire-pending-claims (same auth header, same
 * misconfigured-in-prod behavior, same response shape). Runs every 5
 * minutes via netlify/functions/scheduled-expire-pending-rentals.ts.
 */
import type { APIRoute } from "astro";
import { expirePendingRentals } from "@/lib/rentals/expire";

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
    console.error(
      "[cron] CRON_SECRET not configured in production. Refusing request.",
    );
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const startedAt = Date.now();
    const result = await expirePendingRentals();
    const elapsedMs = Date.now() - startedAt;
    console.info(
      `[cron] Field-rental pending-payment expiry: expired=${result.expired} in ${elapsedMs}ms`,
    );
    return new Response(JSON.stringify({ ...result, elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] Expire pending rentals failed:", err);
    return new Response(JSON.stringify({ error: "Cron job failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Field-rental pending-payment expiry cron endpoint",
      usage:
        "POST with header x-cron-secret: $CRON_SECRET to expire overdue pending_payment rentals. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
```

- [ ] **Step 3: Implement the Netlify scheduled function**

Create `netlify/functions/scheduled-expire-pending-rentals.ts` — copy `netlify/functions/scheduled-expire-pending-claims.ts` exactly, changing only `ROUTE`, the log prefix, and the comment:

```typescript
/**
 * Netlify Scheduled Function — triggers the field-rental pending-payment
 * expiry sweep every 5 minutes by POSTing to
 * /api/cron/expire-pending-rentals. See
 * netlify/functions/scheduled-expire-pending-claims.ts for why this does
 * not import the app lib directly.
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/expire-pending-rentals";

export const handler = schedule("*/5 * * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-expire-pending-rentals] no site URL in env (URL / PUBLIC_APP_URL)",
    );
    return { statusCode: 500, body: "Site URL not configured" };
  }
  try {
    const res = await fetch(`${base}${ROUTE}`, {
      method: "POST",
      headers: {
        "x-cron-secret": process.env.CRON_SECRET ?? "",
        Origin: base,
      },
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(
        `[scheduled-expire-pending-rentals] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-expire-pending-rentals] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-expire-pending-rentals]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
```

- [ ] **Step 4: Write the failing test**

Create `tests/api/rentals/expire.test.ts`:
- Create a `pending_payment` hold via `createRentalHold`, then directly `UPDATE` its `paymentExpiresAt` to a past timestamp (via `getDb()`).
- `POST /api/cron/expire-pending-rentals` with header `x-cron-secret: <CRON_SECRET from env>` → 200, body `expired >= 1`.
- Re-fetch the row → `status === "cancelled"`.
- `POST` without the header (when `CRON_SECRET` is set) → 401.

- [ ] **Step 5: Run the test, type-check, commit**

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/expire.test.ts`
(Match `CRON_SECRET` to the dev server's — see CLAUDE.md pre-push note.)
Expected: PASS.
Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/lib/rentals/expire.ts src/pages/api/cron/expire-pending-rentals.ts netlify/functions/scheduled-expire-pending-rentals.ts tests/api/rentals/expire.test.ts
git commit -m "feat(rentals): scheduled expiry of abandoned pending_payment holds"
```

---

## Task 16: Customer rentals booking page + island

**Files:**
- Create: `src/pages/rentals/index.astro`
- Create: `src/components/rentals/RentalBooking.tsx`

- [ ] **Step 1: Create the Astro page**

Create `src/pages/rentals/index.astro`. It must extend `BaseLayout` (per CLAUDE.md — never a bare `<html>`) and be SSR (no `prerender` flag — it reads request-time data). Pass the rental-enabled venues for the current org to the island.

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
import RentalBooking from "@/components/rentals/RentalBooking.tsx";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { and, eq } from "drizzle-orm";

const orgId = Astro.locals.organization?.id;
let rentalVenues: { id: string; name: string; fieldCount: number }[] = [];
if (orgId) {
  const rows = await getDb()
    .select({
      id: venues.id,
      name: venues.name,
      fieldCount: venues.fieldCount,
    })
    .from(venues)
    .innerJoin(locations, eq(venues.locationId, locations.id))
    .where(and(eq(locations.organizationId, orgId), eq(venues.rentalEnabled, true)));
  rentalVenues = rows.map((r) => ({
    id: r.id,
    name: r.name,
    fieldCount: r.fieldCount ?? 1,
  }));
}
---

<BaseLayout title="Book a Field">
  <main class="mx-auto max-w-4xl px-4 py-8">
    <h1 class="text-2xl font-semibold">Book a Field</h1>
    <RentalBooking client:load venues={rentalVenues} />
  </main>
</BaseLayout>
```

> Confirm `BaseLayout`'s prop name for the page title by opening `src/layouts/BaseLayout.astro` — it may be `title` or `pageTitle`. Match it.

- [ ] **Step 2: Create the booking island**

Create `src/components/rentals/RentalBooking.tsx`. Requirements:
- `"use client"` directive at the top.
- Calls `useHydrationBeacon()` from `@/lib/hooks/use-hydration-beacon` (per CLAUDE.md Playwright convention — this page has an E2E test in Task 20).
- Props: `venues: { id: string; name: string; fieldCount: number }[]`.
- State: selected `venueId`, selected `date` (default today, `<input type="date">`), fetched availability, selected field + start + duration, renter `partySize`/`purpose`, `waiverName`, `waiverAccepted`.
- On venue/date change: `GET /api/rentals/availability?venueId=&date=` → render a per-field list of free blocks as clickable slot buttons (use the rate card's `bookingIncrementMinutes`; for v1 render free blocks as-is and let the user pick a start within a block + a duration select of 60/90/120/180/240 min).
- A booking form: party size, purpose, a waiver section (checkbox `waiverAccepted` + text input `waiverName`).
- Submit → `POST /api/rentals/bookings`. On `{ paymentRequired: true }` → `window.location.href = checkoutUrl`. On `{ paymentRequired: false }` → redirect to `/dashboard/bookings?rental=success`. On non-2xx → show the JSON `error` in an `<ErrorBanner message={...} />` from `@/components/ui/error-banner`.
- Use `toast.error(...)` from `sonner` for transient network failures.
- Empty state when a venue has no free blocks: `<EmptyState title="No availability" description="..." />` from `@/components/ui/empty-state`.

Implement the component following these requirements and the existing `src/components/dropin/SessionDetail.tsx` + `BookButton.tsx` patterns for fetch/loading/error handling. Keep it one focused file under ~250 lines; if it grows past that, extract the availability grid into `src/components/rentals/AvailabilityGrid.tsx`.

- [ ] **Step 3: Manual smoke test in the browser**

Start the dev server, sign in as the parent test account, visit `/rentals`. Confirm: venue select populated, picking a venue+date loads availability, picking a slot + filling the form + accepting the waiver and submitting redirects to Stripe Checkout (test mode). Cancel out of Checkout and confirm the `pending_payment` row exists (it will be swept within 30 min, or by Task 15's cron).

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/pages/rentals/index.astro src/components/rentals/RentalBooking.tsx
git commit -m "feat(rentals): customer field-booking page and island"
```

---

## Task 17: Customer dashboard — My Field Rentals

**Files:**
- Create: `src/components/dashboard/MyFieldRentals.tsx`
- Modify: `src/pages/dashboard/bookings.astro`

- [ ] **Step 1: Create the dashboard list component**

Create `src/components/dashboard/MyFieldRentals.tsx`:
- `"use client"`.
- On mount, `GET /api/rentals/bookings` → render the caller's rentals grouped into "Upcoming" (`startsAt` in the future and `status !== "cancelled"`) and "Past / Cancelled".
- Each row: venue name, field number, date/time range, status badge, payment status, party size.
- For an upcoming, non-cancelled rental, show a "Cancel" button → `POST /api/rentals/bookings/:id/cancel`; on success refetch the list; on 422 (inside cancel window) show the returned `error` via `toast.error`.
- Loading → `<LoadingSkeleton />` from `@/components/ui/loading-skeleton`. Empty → `<EmptyState title="No field rentals yet" description="Book a field from the Rentals page." />`.

Follow the existing `src/components/dashboard/MyDropInBookings` component for structure, fetch handling, and styling.

- [ ] **Step 2: Render it on the dashboard bookings page**

In `src/pages/dashboard/bookings.astro`, import `MyFieldRentals` and render it as a `client:load` island below the existing `MyDropInBookings`. Match the existing section markup (heading + component) so the two booking types read as sibling sections.

```astro
---
// ...existing imports...
import MyFieldRentals from "@/components/dashboard/MyFieldRentals.tsx";
---
<!-- ...existing MyDropInBookings section... -->
<section class="mt-8">
  <h2 class="text-xl font-semibold">Field Rentals</h2>
  <MyFieldRentals client:load />
</section>
```

- [ ] **Step 3: Manual smoke test**

As the parent test account, after a successful Stripe test-mode rental payment (or an admin-created `cash` rental for that user), visit `/dashboard/bookings` and confirm the rental appears and the Cancel button works outside the cancel window.

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/components/dashboard/MyFieldRentals.tsx src/pages/dashboard/bookings.astro
git commit -m "feat(rentals): customer dashboard field-rentals list"
```

---

## Task 18: Admin rentals pages

**Files:**
- Create: `src/pages/admin/rentals/index.astro` + `src/components/admin/rentals/RentalsList.tsx`
- Create: `src/pages/admin/rentals/new.astro` + `src/components/admin/rentals/RentalCreateForm.tsx`
- Create: `src/pages/admin/rentals/[id].astro` + `src/components/admin/rentals/RentalDetail.tsx`
- Create: `src/pages/admin/rentals/rate-card.astro` + `src/components/admin/rentals/RentalRateCardEditor.tsx`

All four pages extend `BaseLayout`, are SSR (under `/admin`, middleware-gated — no `prerender`), and render a `client:load` island. Follow the existing `src/pages/admin/dropin/` pages + `src/components/admin/dropin/` components for layout, the admin nav, and fetch/error patterns.

- [ ] **Step 1: Rentals list page**

`src/pages/admin/rentals/index.astro` renders `RentalsList`. `RentalsList.tsx` (`"use client"`):
- Filters: venue select, date-from/date-to, status select.
- `GET /api/admin/rentals?...` with the filters → a table: venue, field, date/time, renter, party size, status, payment status, waiver (✓/�—), checked-in (✓/�—).
- Each row links to `/admin/rentals/:id`.
- A "New rental" link to `/admin/rentals/new` and a "Rate card" link to `/admin/rentals/rate-card`.
- Loading/empty/error via the shared UI primitives.

- [ ] **Step 2: New rental page**

`src/pages/admin/rentals/new.astro` renders `RentalCreateForm`. `RentalCreateForm.tsx` (`"use client"`):
- Fields: venue select, field-number select (1..fieldCount of the chosen venue), start datetime-local, duration select, renter name/email/phone, party size, purpose, notes, payment method radio (`cash` / `comp` / `card_present` / `card_online`).
- Submit → `POST /api/admin/rentals`.
  - `cash`/`comp` → on 200 redirect to `/admin/rentals/:id`.
  - `card_present` → on 200 you get `{ clientSecret, amountCents }`; for v1 display the `clientSecret` and an instruction line ("Charge on the Terminal reader"). Full Terminal-reader JS wiring mirrors `src/components/admin/dropin/WalkUpPanel.tsx` — reuse that component's Terminal hook if it is exported; if wiring it is more than a small lift, render the clientSecret + amount and a "Mark paid" note and leave a `// TODO(rentals): wire Terminal reader — see WalkUpPanel` is NOT acceptable. Instead: if the Terminal hook is not cleanly reusable, drop `card_present` from the form's options for v1 and from `validateAdminRentalCreate`'s allowed set, and note that in the commit message. Decide based on what `WalkUpPanel.tsx` actually exposes.
  - `card_online` → on 200 redirect to `/admin/rentals/:id` (the detail page shows "payment link pending").
- Error → `<ErrorBanner />`.

- [ ] **Step 3: Rental detail page**

`src/pages/admin/rentals/[id].astro` passes `Astro.params.id` to `RentalDetail`. `RentalDetail.tsx` (`"use client"`):
- `GET /api/admin/rentals/:id` → show all rental fields: venue/field, time, renter contact, party size, purpose, notes (editable → `PATCH`), payment method/status/amounts, waiver status, check-in status.
- Actions: "Cancel" (unpaid → `PATCH { cancel: true }`; paid → `POST /:id/refund`), with a confirm step.
- Loading/error via shared primitives.

- [ ] **Step 4: Rate-card page**

`src/pages/admin/rentals/rate-card.astro` renders `RentalRateCardEditor`. `RentalRateCardEditor.tsx` (`"use client"`) — mirror `src/components/admin/dropin/RateCardEditor.tsx` exactly, swapping the endpoint to `/api/admin/rentals/rate-card` and the fields to `defaultHourlyRateCents`, `cancelWindowHours`, `bookingIncrementMinutes`, `minDurationMinutes`, `maxDurationMinutes`.

- [ ] **Step 5: Add admin nav links**

Find the admin navigation component (grep `src/components/admin/` for the nav that lists "Drop-in" / "Games" / "Venues"). Add a "Rentals" entry pointing to `/admin/rentals`. Match the existing nav item markup.

- [ ] **Step 6: Manual smoke test**

As the admin test account: visit `/admin/rentals` (list loads), `/admin/rentals/new` (create a `cash` rental → lands on detail), `/admin/rentals/rate-card` (load, edit a value, save, reload — value persists).

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/pages/admin/rentals/ src/components/admin/rentals/
git commit -m "feat(rentals): admin rentals list, create, detail, and rate-card pages"
```

---

## Task 19: Venue edit form — rental config fields

**Files:**
- Modify: the existing venue create/edit form component and its endpoint.

- [ ] **Step 1: Locate the venue form and endpoint**

Run: `grep -rl "fieldCount\|partnerStripeAccountId" src/components src/pages/admin` to find the venue form component and `grep -rl "venues" src/pages/api/admin` to find the venue mutation endpoint. Read both.

- [ ] **Step 2: Add the 4 rental fields to the form**

In the venue form component, add inputs for:
- `rentalEnabled` — checkbox.
- `rentalHourlyRateCents` — number input (dollars in the UI, convert to cents on submit), shown only when `rentalEnabled` is checked. Label: "Rental hourly rate (blank = use org default)".
- `rentalOpenMinute` / `rentalCloseMinute` — render as two `<input type="time">` fields ("Rentals open" / "Rentals close"); convert HH:MM ↔ minutes-from-midnight on submit/load. Shown only when `rentalEnabled` is checked.

- [ ] **Step 3: Persist the fields in the venue endpoint**

In the venue create/update endpoint, accept and write `rentalEnabled`, `rentalHourlyRateCents`, `rentalOpenMinute`, `rentalCloseMinute`. Validate: `rentalHourlyRateCents` non-negative or null; `rentalOpenMinute`/`rentalCloseMinute` in `[0, 1440]` or null; if both set, open < close. Return a 400 with a clear message on violation.

- [ ] **Step 4: Manual smoke test**

As admin, edit a venue: enable rentals, set a rate and open/close times, save, reload — values persist. This is also what makes the Task 8/9 tests' "rental-enabled venue" real outside the seed.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/components src/pages/admin src/pages/api/admin
git commit -m "feat(rentals): venue edit form rental config fields"
```

---

## Task 20: E2E — customer books a field

**Files:**
- Create: `tests/e2e/field-rentals.spec.ts`

- [ ] **Step 1: Write the E2E spec**

Create `tests/e2e/field-rentals.spec.ts`. Follow the existing `tests/e2e/` conventions (CLAUDE.md "Playwright conventions"): import `waitForHydration` and `signIn` from `../utils/test-helpers`, call `await waitForHydration(page)` before any interaction, prefer element clicks.

The spec:
```typescript
import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

test("a signed-in customer can book a field through to Stripe Checkout", async ({ page }) => {
  await signIn(page, "parent@test.aspiresports.com", "TestParent123!");
  await page.goto("/rentals", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // Pick the seeded rental-enabled venue.
  await page.getByLabel(/venue/i).selectOption({ index: 1 });
  // Date defaults to today; pick a far-future date the seed leaves free.
  await page.getByLabel(/date/i).fill("2026-12-15");

  // Pick the first available slot button.
  await page.getByRole("button", { name: /book|select/i }).first().click();

  await page.getByLabel(/party size/i).fill("8");
  await page.getByLabel(/signature|your name/i).fill("Test Parent");
  await page.getByLabel(/accept|agree/i).check();

  await page.getByRole("button", { name: /continue to payment|book/i }).click();

  // Either we land on Stripe Checkout (paid path) or on the dashboard
  // (comp path). Accept both — assert we left /rentals successfully.
  await page.waitForURL(/checkout\.stripe\.com|\/dashboard\/bookings/, {
    timeout: 15_000,
  });
  expect(page.url()).not.toContain("/rentals");
});
```

> Adjust the selectors (`getByLabel`, `getByRole`) to the actual labels/roles in `RentalBooking.tsx`. The test is the forcing function for accessible labels — add `<label>`s / `aria-label`s to the island if these selectors don't resolve.

- [ ] **Step 2: Run the E2E test**

Ensure the dev server is up and e2e data seeded (`npm run db:seed:e2e`). Run:
`PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/field-rentals.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/field-rentals.spec.ts
git commit -m "test(rentals): e2e — customer books a field"
```

---

## Task 21: E2E seed data + pre-push checklist

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts`
- Modify: `.env.example` (if any new env var was introduced — none expected; verify)

- [ ] **Step 1: Add a rental-enabled venue + rate card to the e2e seed**

In `src/lib/db/seeds/seed-e2e-tests.ts`:
- Set `rentalEnabled: true`, a `rentalHourlyRateCents` (e.g. `8000`), `rentalOpenMinute: 480` (8am), `rentalCloseMinute: 1320` (10pm) on one existing seeded venue (or add a dedicated one) with a **fixed UUID**.
- Insert a `fieldRentalRateCard` row for the seed org.
- Export the fixed ids as named constants the API tests import:
  ```typescript
  export const E2E_RENTAL_VENUE_ID = "<fixed-uuid>";
  export const E2E_ORG_ID = "<the seed org's fixed uuid>";
  ```
  (If `E2E_ORG_ID` or an equivalent is already exported, reuse it instead of adding a duplicate.)
- Keep the seed idempotent — use `onConflictDoNothing` / `onConflictDoUpdate` like the rest of the file.

- [ ] **Step 2: Re-seed and run the full rentals test suite**

Run: `npm run db:seed:e2e`
Then, with the dev server up (`R2_MOCK=1 CRON_SECRET=devsecret npm run dev`):
`CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/ tests/unit/rentals-*.test.ts`
Expected: all rentals API + unit tests PASS.

- [ ] **Step 3: Run the pre-push checklist (CLAUDE.md "Pre-push checklist")**

- `git status` — confirm the migration file from Task 2 is committed.
- `npm run db:seed:e2e` — idempotent, no errors.
- `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npm run test:api` — full API suite green.
- `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test` — E2E suite green.
- `npm run build` — clean (catches SSR/prerender mistakes).
- `npx tsc --noEmit` — zero errors.
- Check `.env.example` — this feature introduces no new env vars (Stripe + `CRON_SECRET` + `PUBLIC_APP_URL` already exist). Confirm and, if anything was added, document it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "test(rentals): e2e seed — rental-enabled venue + rate card"
```

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/field-rentals
```
Then open a PR against `main` with a summary of the field-rentals feature and a test plan. Wait for CI to go green before declaring the work done (CLAUDE.md: "A push isn't 'done' until CI is green").

---

## Self-Review

**Spec coverage:**
- Data model (`field_rentals`, `field_rental_rate_card`, 4 venue columns, 5 enums) → Task 1. Migration → Task 2. ✓
- Availability + conflict detection (computed availability, advisory lock, drop-in excluded) → Tasks 4, 6, 8. ✓
- Customer booking flow + payment (pending_payment hold, Connect-aware Checkout, comp path) → Tasks 3, 5, 9. ✓
- Checkout webhook → Task 10. Card-present webhook → Task 14. ✓
- Scheduled `expire-pending-rentals` → Task 15. ✓
- Admin-created flow (cash/comp/card_present/card_online) → Task 12. ✓
- Admin management (list, detail, cancel, refund, rate-card) → Tasks 7, 12, 13. ✓
- Customer dashboard → Task 17. ✓
- Customer UI → Tasks 16, 17. Admin UI → Task 18. Venue config fields → Task 19. ✓
- Spec 2 seams (waiver/check-in columns, `no_show`, denormalized `renterName`, indexes) → baked into Task 1's schema; no Spec 2 UI built. ✓
- Error handling (409 conflict, 422 hours/duration/waiver, hold rollback on Stripe failure, webhook idempotency, refund-fails-then-not-cancelled) → Tasks 9, 10, 11, 13. ✓
- Testing (unit, API, E2E, pre-push) → Tasks 3–5, 7–15, 20, 21. ✓
- Rollout (additive migration, rate card lazily created, venues default `rentalEnabled: false`) → Tasks 2, 7, 19. ✓

**Placeholder scan:** Tasks 16 and 18 describe UI components by requirements rather than full code — this is deliberate for near-mirror UI files and each names the exact existing file to mirror, the exact endpoints, the exact shared primitives, and a size budget. Task 18 Step 2 explicitly forbids leaving a half-built Terminal flow and gives a concrete fallback (drop `card_present` from the form + validator). No "TBD"/"implement later" left in backend logic.

**Type consistency:** `createRentalHold` / `createConfirmedRentalNonStripe` signatures in Task 9 match their call sites in Tasks 9 and 12. `refundFieldRental(rentalId, reason)` in Task 11 matches its call in Task 13. `assertNoRentalConflict(tx, params)` in Task 6 matches its calls in Task 9's `booking.ts`. Webhook metadata keys (`type: "field_rental"`, `rental_id`, `type: "field_rental_walk_up"`) are consistent between the booking endpoints (Tasks 9, 12) and the handlers (Tasks 10, 14). Enum values (`pending_payment`, `confirmed`, `cancelled`, `completed`, `no_show`; `card_online`/`card_present`/`cash`/`comp`; `unpaid`/`paid`/`refunded`) are consistent between Task 1's schema and every consumer.

**Known cross-task dependency:** Tasks 8, 9, 10's tests depend on the rental-enabled seed venue + exported id constants from Task 21. Each affected step notes this. If executing strictly in order, those tests go green only after Task 21 re-seeds — acceptable, and Task 21 Step 2 re-runs the whole rentals suite as the gate.
