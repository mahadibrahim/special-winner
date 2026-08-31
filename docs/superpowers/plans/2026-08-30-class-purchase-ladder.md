# Class Purchase Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell youth classes four ways — drop-in, per-child credit packs, prorated multi-week blocks, and the existing membership — on one credits ledger, in-house.

**Architecture:** Three new tables (`class_pack_products` catalog, `class_blocks` windows, `class_credit_grants` ledger) hang off the existing classes engine. Balances are count-derived (granted − bookings referencing the grant), never stored. Purchases are Stripe Checkout **payment-mode** sessions fulfilled exclusively by webhook (no orphan grants). The booking engine (`createChildClassBooking`) gains a credit-redemption fallthrough: membership unlimited → membership allotment → pinned block credits → floating pack credits → paid. Block enrollments are `class_enrollments` rows backed by a credit grant instead of a membership; the existing daily materialize/auto-book cron books them with no special-casing beyond the fallthrough.

**Tech Stack:** Astro 5 + React 19, Drizzle/Postgres, Stripe Checkout + webhooks, Vitest (unit + API), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-30-class-purchase-ladder-design.md`

## Global Constraints

- Worktree: ALL work happens in `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/youth-classes-ux` on branch `classes-purchase-ladder`. Subagents MUST use absolute paths under this root — never the main checkout.
- Postgres enum additions ship as their **own migration file** with no DML that uses the value (55P04). Task 0 does this; no other task may add enum values.
- Every admin endpoint validates tenant ownership via `requireSameOrg*` helpers (`src/lib/auth/require-resource-ownership.ts`).
- Every `findFirst`/`.limit(1)` on a non-unique predicate carries an explicit `orderBy` (shared CI DB accumulates rows).
- Money is integer cents. All timestamps UTC; wall-clock class times resolve via the existing `occurrenceInstants` machinery — never naive offset math.
- Copy rules: no eyebrow/kicker text; youth surfaces use emerald accents, brand-red hot CTAs (see `docs/design-system.md`).
- API tests live in `tests/api/`, unit tests in `tests/unit/`, run with the dev server up for API tests. Stripe-dependent API tests use the `itWithStripe` gate (CI has no Stripe keys — see `tests/api/` existing usage).
- Commit after every green task. Run `npx tsc --noEmit` before each commit — zero errors baseline.

---

### Task 0: `pack_credit` enum migration (standalone)

**Files:**
- Modify: `src/lib/db/schema/drop-in.ts:54-63` (the `dropInPaymentMethodEnum`)
- Create: generated `src/lib/db/migrations/0134_*.sql`

**Interfaces:**
- Produces: `dropInPaymentMethodEnum` now includes `"pack_credit"`; `drop_in_bookings.payment_method` may hold `'pack_credit'`. No other schema change in this task.

- [ ] **Step 1: Add the enum value**

In `src/lib/db/schema/drop-in.ts`, extend `dropInPaymentMethodEnum`:

```ts
export const dropInPaymentMethodEnum = pgEnum("drop_in_payment_method", [
  "card_online",
  "card_present",
  "member_unlimited",
  "member_allotment",
  // Host's free seat in a game they host (GoodRec model) — created/cancelled
  // by src/lib/dropin/host-assignment.ts, always amount_paid_cents = 0.
  "host_comp",
  "trial",
  // Class session paid from a purchased credit grant (pack or block) —
  // see src/lib/db/schema/classes.ts classCreditGrants.
  "pack_credit",
]);
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Verify the generated `src/lib/db/migrations/0134_*.sql` contains ONLY `ALTER TYPE "drop_in_payment_method" ADD VALUE 'pack_credit'` (wrapped or not, per drizzle-kit's emission). If drizzle bundles anything else, stop and fix the schema diff.

- [ ] **Step 3: Type check + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/lib/db/schema/drop-in.ts src/lib/db/migrations/
git commit -m "feat(classes): add pack_credit payment method (enum-only migration)"
```

---

### Task 1: Ledger schema — pack products, blocks, credit grants

**Files:**
- Modify: `src/lib/db/schema/classes.ts` (add three tables + `blockRateCents` column + relax `classEnrollments.membershipId`)
- Modify: `src/lib/db/schema/drop-in.ts` (add `creditGrantId` to `dropInBookings`)
- Create: generated `src/lib/db/migrations/0135_*.sql`

**Interfaces:**
- Consumes: Task 0's enum value (schema-level only; no DML).
- Produces (exact Drizzle exports from `@/lib/db/schema/classes`):
  - `classPackProducts`, `ClassPackProduct` (`$inferSelect`)
  - `classBlocks`, `ClassBlock`
  - `classCreditGrants`, `ClassCreditGrant`, `classCreditSourceEnum` (`"pack" | "block"`)
  - `classEnrollments.membershipId` now **nullable**; new nullable `classEnrollments.creditGrantId`
  - `dropInBookings.creditGrantId` (nullable uuid, soft FK to `class_credit_grants.id`)

- [ ] **Step 1: Add tables to `src/lib/db/schema/classes.ts`**

```ts
export const classCreditSourceEnum = pgEnum("class_credit_source", ["pack", "block"]);

/** Admin-defined class-pack catalog (N floating session credits for one
 *  child). Mirrors membership_tiers' Stripe reconciliation shape. */
export const classPackProducts = pgTable(
  "class_pack_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sessionCount: integer("session_count").notNull(),
    priceCents: integer("price_cents").notNull(),
    /** Credits expire this many months after purchase. */
    expiryMonths: integer("expiry_months").notNull().default(6),
    stripeProductId: text("stripe_product_id"),
    stripePriceId: text("stripe_price_id"),
    active: boolean("active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("class_pack_products_org_active_idx").on(table.organizationId, table.active),
  ],
);

/** Admin-defined org-wide block window ("Fall Block", Sep 15 – Nov 7).
 *  Dates are civil dates in the org's timezone; instants resolve at
 *  purchase time via the same wall-clock machinery the cron uses. */
export const classBlocks = pgTable(
  "class_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("class_blocks_org_active_idx").on(table.organizationId, table.active, table.startDate),
  ],
);

/** Per-child credits ledger. Balance is COUNT-DERIVED: remaining =
 *  sessionsGranted − active bookings whose creditGrantId references this
 *  row (statuses confirmed/waitlisted/pending_claim/pending_payment/
 *  no_show; a cancelled booking returns the credit automatically). Same
 *  derive-don't-store pattern (and accepted TOCTOU tolerance) as the
 *  monthly allotment in src/lib/memberships/allotment.ts. */
export const classCreditGrants = pgTable(
  "class_credit_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "restrict" }),
    source: classCreditSourceEnum("source").notNull(),
    packProductId: uuid("pack_product_id").references(() => classPackProducts.id, {
      onDelete: "set null",
    }),
    blockId: uuid("block_id").references(() => classBlocks.id, { onDelete: "set null" }),
    /** Set on block grants: credits are pinned to this weekly slot. NULL on
     *  pack grants (floating — any class session). */
    slotTemplateId: uuid("slot_template_id").references(() => classSlotTemplates.id, {
      onDelete: "set null",
    }),
    sessionsGranted: integer("sessions_granted").notNull(),
    pricePaidCents: integer("price_paid_cents").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Webhook idempotency: one grant per Checkout Session, replays no-op.
    uniqueIndex("class_credit_grants_checkout_session_uq").on(table.stripeCheckoutSessionId),
    index("class_credit_grants_child_idx").on(table.familyMemberId, table.expiresAt),
  ],
);
```

Add `date` to the `drizzle-orm/pg-core` import list. Add type exports:

```ts
export type ClassPackProduct = typeof classPackProducts.$inferSelect;
export type ClassBlock = typeof classBlocks.$inferSelect;
export type ClassCreditGrant = typeof classCreditGrants.$inferSelect;
```

- [ ] **Step 2: Relax `classEnrollments` for credit-backed enrollment**

In the same file, change `classEnrollments.membershipId` to nullable and add `creditGrantId`:

```ts
    // Nullable since the purchase-ladder work: a block purchase creates an
    // enrollment backed by a credit grant instead of a membership. Exactly
    // one of (membershipId, creditGrantId) is set — enforced by the CHECK
    // below, mirroring family_members_self_xor_parent.
    membershipId: uuid("membership_id").references(() => memberships.id, {
      onDelete: "restrict",
    }),
    creditGrantId: uuid("credit_grant_id").references(() => classCreditGrants.id, {
      onDelete: "restrict",
    }),
```

Add to the table's third argument array:

```ts
    check(
      "class_enrollments_membership_xor_grant",
      sql`(membership_id IS NOT NULL) <> (credit_grant_id IS NOT NULL)`,
    ),
```

(`check` comes from `drizzle-orm/pg-core`.) NOTE: `classCreditGrants` must be declared ABOVE `classEnrollments` in the file for the reference, or use a `() =>` thunk reference as shown (thunk makes order irrelevant — keep the thunk).

- [ ] **Step 3: Add `blockRateCents` to `classSlotTemplates`**

After `memberRateCents`:

```ts
    /** Per-session rate for BLOCK purchases of this template. Null falls
     *  back to sessionRateCents at quote time. */
    blockRateCents: integer("block_rate_cents"),
```

- [ ] **Step 4: Add `creditGrantId` to `dropInBookings`** (`src/lib/db/schema/drop-in.ts`, after `membershipId`)

```ts
    // Soft reference to class_credit_grants (same no-FK rationale as
    // membershipId above). Set iff paymentMethod = 'pack_credit'; the
    // credits balance derivation counts active bookings by this column.
    creditGrantId: uuid("credit_grant_id"),
```

Add a partial index in the table's index array (balance derivation is per-grant):

```ts
    index("drop_in_bookings_credit_grant_idx")
      .on(table.creditGrantId)
      .where(sql`credit_grant_id IS NOT NULL`),
```

- [ ] **Step 5: Generate migration, review, verify existing-data safety**

Run: `npm run db:generate`
Review `0135_*.sql`: three `CREATE TABLE`s, the enum type `class_credit_source`, `ALTER TABLE class_enrollments ALTER COLUMN membership_id DROP NOT NULL` + `ADD COLUMN credit_grant_id` + the CHECK constraint, template + booking columns, indexes. The CHECK is satisfied by every existing row (all have membershipId set, creditGrantId null). Nothing here uses `'pack_credit'` in DML.

- [ ] **Step 6: Type check + commit**

Run: `npx tsc --noEmit` → zero errors (fix any `membershipId` non-null assumptions the compiler surfaces — expected: none, it was already written via explicit values).

```bash
git add src/lib/db/schema/ src/lib/db/migrations/
git commit -m "feat(classes): pack/block/credit-grant schema + credit-backed enrollments"
```

---

### Task 2: Credits library — balances + redemption selection

**Files:**
- Create: `src/lib/classes/credits.ts`
- Test: `tests/unit/classes/credits.test.ts`

**Interfaces:**
- Consumes: Task 1 tables.
- Produces (exact exports from `@/lib/classes/credits`):

```ts
export interface CreditGrantBalance {
  grantId: string;
  source: "pack" | "block";
  slotTemplateId: string | null; // set → pinned to that weekly slot
  sessionsGranted: number;
  used: number;
  remaining: number;             // max(0, granted - used)
  expiresAt: Date;
  packName: string | null;       // joined pack product name (display)
  blockName: string | null;      // joined block name (display)
}

/** All of a child's grants in this org (including exhausted/expired — the
 *  caller filters; the dashboard shows history). Ordered expiresAt ASC. */
export async function getCreditBalances(
  familyMemberId: string,
  organizationId: string,
  dbOrTx?: DbClient,
): Promise<CreditGrantBalance[]>;

/** Pure. Picks the grant to redeem for a session of `slotTemplateId`
 *  (null for one-off class sessions): pinned grants matching the template
 *  first, then floating pack grants; earliest expiry wins within each
 *  class; unexpired (expiresAt > now) and remaining > 0 only. Returns
 *  null when nothing is redeemable. */
export function selectRedeemableGrant(
  balances: CreditGrantBalance[],
  opts: { slotTemplateId: string | null; now: Date },
): CreditGrantBalance | null;
```

`DbClient` is the same union used in `src/lib/memberships/get-child-membership.ts:22-24` — copy that type alias.

- [ ] **Step 1: Write failing unit tests** (`tests/unit/classes/credits.test.ts`)

Test `selectRedeemableGrant` (pure — no DB):

```ts
import { describe, it, expect } from "vitest"
import { selectRedeemableGrant, type CreditGrantBalance } from "@/lib/classes/credits"

const base = (over: Partial<CreditGrantBalance>): CreditGrantBalance => ({
  grantId: "g1", source: "pack", slotTemplateId: null, sessionsGranted: 10,
  used: 0, remaining: 10, expiresAt: new Date("2027-01-01T00:00:00Z"),
  packName: null, blockName: null, ...over,
})
const NOW = new Date("2026-09-01T00:00:00Z")

describe("selectRedeemableGrant", () => {
  it("prefers a pinned grant matching the template over a floating pack", () => {
    const pinned = base({ grantId: "block", source: "block", slotTemplateId: "tpl-1" })
    const floating = base({ grantId: "pack" })
    expect(selectRedeemableGrant([floating, pinned], { slotTemplateId: "tpl-1", now: NOW })?.grantId).toBe("block")
  })
  it("never spends a pinned grant on a different template's session", () => {
    const pinned = base({ grantId: "block", source: "block", slotTemplateId: "tpl-1" })
    expect(selectRedeemableGrant([pinned], { slotTemplateId: "tpl-2", now: NOW })).toBeNull()
    expect(selectRedeemableGrant([pinned], { slotTemplateId: null, now: NOW })).toBeNull()
  })
  it("floating packs redeem on any template, oldest expiry first", () => {
    const a = base({ grantId: "later", expiresAt: new Date("2027-06-01T00:00:00Z") })
    const b = base({ grantId: "sooner", expiresAt: new Date("2026-12-01T00:00:00Z") })
    expect(selectRedeemableGrant([a, b], { slotTemplateId: "tpl-9", now: NOW })?.grantId).toBe("sooner")
  })
  it("skips expired and exhausted grants", () => {
    const expired = base({ grantId: "expired", expiresAt: new Date("2026-08-01T00:00:00Z") })
    const empty = base({ grantId: "empty", remaining: 0, used: 10 })
    expect(selectRedeemableGrant([expired, empty], { slotTemplateId: null, now: NOW })).toBeNull()
  })
  it("expiry boundary: a grant expiring exactly now is not redeemable", () => {
    const atNow = base({ grantId: "atNow", expiresAt: NOW })
    expect(selectRedeemableGrant([atNow], { slotTemplateId: null, now: NOW })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/classes/credits.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/classes/credits.ts`**

`getCreditBalances`: one query — `classCreditGrants` LEFT JOIN `classPackProducts` (name) LEFT JOIN `classBlocks` (name), where `familyMemberId` + `organizationId` match, `orderBy(asc(classCreditGrants.expiresAt))`; then one aggregate query over `dropInBookings` — `select({ creditGrantId, used: count() })` where `creditGrantId` IN (grant ids) AND `status` IN `["confirmed", "waitlisted", "pending_claim", "pending_payment", "no_show"]`, `groupBy(creditGrantId)`. (Cancelled excluded → credit returns on cancel. `no_show` still consumes — the seat was held.) Merge into `CreditGrantBalance[]`. Empty grant list short-circuits before the bookings query.

`selectRedeemableGrant`: filter `remaining > 0 && expiresAt > now`, filter pinned-mismatch (`b.slotTemplateId !== null && b.slotTemplateId !== opts.slotTemplateId` → drop), sort pinned-match first then `expiresAt` ascending, return `[0] ?? null`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/classes/credits.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classes/credits.ts tests/unit/classes/credits.test.ts
git commit -m "feat(classes): credit balances + redemption-selection library"
```

---

### Task 3: Credit redemption in the booking engine

**Files:**
- Modify: `src/lib/classes/book-child.ts` (the `kind === "member"` gate, lines ~199-215, and the insert at ~307)
- Modify: `src/pages/api/classes/book.ts` (doc comment only — response `paymentMethod` may now be `"pack_credit"`)
- Test: `tests/unit/classes/redemption-order.test.ts` (pure pieces), `tests/api/classes-credit-booking.test.ts`

**Interfaces:**
- Consumes: `getCreditBalances`, `selectRedeemableGrant` (Task 2).
- Produces: `createChildClassBooking` unchanged signature; `ChildBookingResult.paymentMethod` union becomes `"member_allotment" | "trial" | "pack_credit"`. New behavior for `kind: "member"`:
  - active membership + unlimited/allotment → as today (`member_allotment`).
  - allotment exhausted OR no active membership → try credits via `selectRedeemableGrant` (using the session's `classSlotTemplateId`); on hit, insert booking with `paymentMethod: "pack_credit"`, `creditGrantId`, `membershipId: null`, `amountPaidCents: 0`.
  - no membership AND no credits → `no_membership` (unchanged).
  - membership-but-exhausted AND no credits → `allotment_exhausted` (unchanged 402 path).

- [ ] **Step 1: Write the failing API test** (`tests/api/classes-credit-booking.test.ts`)

Model on the existing class-booking API tests in `tests/api/` (find them: `grep -l "api/classes/book" tests/api/`). Seed shape: create a credit grant row directly via the test DB helper the existing classes API tests use (they insert templates/sessions — follow the same fixture pattern), then as the seeded parent (`parent@test.aspiresports.com` / `TestParent123!`):

1. Child with NO membership + a floating pack grant (remaining 3) → `POST /api/classes/book {kind:"member"}` → 200, `paymentMethod: "pack_credit"`.
2. Repeat on a second session until grant exhausted → next booking → 402 `allotment_exhausted`? NO — child has no membership → expect 403 `no_membership`. Assert exactly this (redemption exhaustion for membership-less children reports `no_membership`).
3. Cancel one credit booking via `POST /api/classes/bookings/:id/cancel` → book again → 200 (credit freed).
4. Expired grant (`expiresAt` in the past) → 403 `no_membership`.
5. Pinned block grant for template A → booking a template-B session → 403; booking a template-A session → 200 with `pack_credit`.

- [ ] **Step 2: Run to verify failure**

Run (dev server up): `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/classes-credit-booking.test.ts --config <the config tests/api uses — match existing scripts>`
Expected: FAIL — bookings return 403/402 where 200 expected.

- [ ] **Step 3: Implement the fallthrough in `book-child.ts`**

Replace the `kind === "member"` branch body (keep the trial branch untouched):

```ts
    let paymentMethod: "member_allotment" | "trial" | "pack_credit";
    let membershipId: string | null = null;
    let creditGrantId: string | null = null;
    if (opts.kind === "member") {
      const membership = await getActiveChildMembership(
        opts.familyMemberId,
        session.organizationId,
        tx,
      );
      if (membership && membership.status === "active" && membership.classAllotmentRemaining !== 0) {
        paymentMethod = "member_allotment";
        membershipId = membership.id;
      } else {
        // Credits fallthrough — pinned (this slot) first, then floating
        // packs, earliest expiry first. See src/lib/classes/credits.ts.
        const balances = await getCreditBalances(
          opts.familyMemberId,
          session.organizationId,
          tx,
        );
        const grant = selectRedeemableGrant(balances, {
          slotTemplateId: session.classSlotTemplateId,
          now: new Date(),
        });
        if (grant) {
          paymentMethod = "pack_credit";
          creditGrantId = grant.grantId;
        } else if (!membership || membership.status !== "active") {
          return err("no_membership", "Child has no active membership");
        } else {
          return err("allotment_exhausted", "Child's monthly class allotment is used up");
        }
      }
    } else {
```

In the insert `values({...})`, add `creditGrantId`. Update the module doc comment ("this library only ever inserts $0 rows" still true — credits are $0 at booking time). Update `ChildBookingResult`'s `paymentMethod` union.

- [ ] **Step 4: Run API tests + full existing class suites to verify no regression**

Run the new test file → PASS. Then: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/ -t class` (or the existing class-related API test files by name) → all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classes/book-child.ts src/pages/api/classes/book.ts tests/api/classes-credit-booking.test.ts
git commit -m "feat(classes): credit redemption fallthrough in child booking engine"
```

---

### Task 4: Block proration math + credit-backed enrollment lifecycle in the cron

**Files:**
- Create: `src/lib/classes/block-occurrences.ts`
- Modify: `src/lib/classes/materialize.ts` (add an enrollment-expiry pass; no auto-book changes — Task 3 made the engine credit-aware)
- Test: `tests/unit/classes/block-occurrences.test.ts`, extend the existing materialize unit tests (`grep -rl materialize tests/unit/`)

**Interfaces:**
- Consumes: `occurrenceInstants(weekday, startTime, timeZone, now, horizonEnd): Date[]` (exported from `@/lib/classes/materialize`).
- Produces (from `@/lib/classes/block-occurrences`):

```ts
/** UTC instants of every occurrence of (weekday, startTime) within the
 *  block's civil-date window [startDate, endDate] (inclusive, org tz),
 *  strictly after `after`. Used for full-price display (after = block
 *  start's eve) and mid-block proration (after = now). */
export function blockOccurrenceInstants(opts: {
  weekday: number;
  startTime: string;       // "HH:MM:SS"
  timeZone: string;
  startDate: string;       // "YYYY-MM-DD" (classBlocks.startDate)
  endDate: string;         // "YYYY-MM-DD"
  after: Date;
}): Date[];

/** End-of-day instant of the block's endDate in org tz — the grant expiry. */
export function blockExpiryInstant(endDate: string, timeZone: string): Date;
```

Also produces in `materialize.ts`: a new pass 0 inside `materializeClassSessions` that ends credit-backed enrollments whose grant has expired, and a new counter `enrollmentsEnded: number` on `MaterializeResult`.

- [ ] **Step 1: Write failing unit tests**

`tests/unit/classes/block-occurrences.test.ts` — America/New_York, Tuesday 17:00 template:

```ts
import { describe, it, expect } from "vitest"
import { blockOccurrenceInstants, blockExpiryInstant } from "@/lib/classes/block-occurrences"

const TPL = { weekday: 2, startTime: "17:00:00", timeZone: "America/New_York" }

describe("blockOccurrenceInstants", () => {
  it("counts every Tuesday in an 8-week window when 'after' precedes the block", () => {
    const out = blockOccurrenceInstants({ ...TPL, startDate: "2026-09-15", endDate: "2026-11-07",
      after: new Date("2026-09-01T00:00:00Z") })
    expect(out).toHaveLength(8) // Sep 15,22,29, Oct 6,13,20,27, Nov 3
    expect(out[0].toISOString()).toBe("2026-09-15T21:00:00.000Z") // EDT −4
  })
  it("prorates: joining mid-block yields only future occurrences", () => {
    const out = blockOccurrenceInstants({ ...TPL, startDate: "2026-09-15", endDate: "2026-11-07",
      after: new Date("2026-10-07T00:00:00Z") })
    expect(out).toHaveLength(4) // Oct 13,20,27, Nov 3
  })
  it("is DST-safe: occurrences after the Nov 1 fallback resolve at EST −5", () => {
    const out = blockOccurrenceInstants({ ...TPL, startDate: "2026-10-25", endDate: "2026-11-10",
      after: new Date("2026-10-20T00:00:00Z") })
    // Oct 27 (EDT) then Nov 3 + Nov 10 (EST)
    expect(out.map((d) => d.toISOString())).toEqual([
      "2026-10-27T21:00:00.000Z",
      "2026-11-03T22:00:00.000Z",
      "2026-11-10T22:00:00.000Z",
    ])
  })
  it("an occurrence at exactly 'after' is excluded (strictly after)", () => {
    const out = blockOccurrenceInstants({ ...TPL, startDate: "2026-09-15", endDate: "2026-09-15",
      after: new Date("2026-09-15T21:00:00Z") })
    expect(out).toHaveLength(0)
  })
})

describe("blockExpiryInstant", () => {
  it("is end-of-day in org tz", () => {
    expect(blockExpiryInstant("2026-11-07", "America/New_York").toISOString())
      .toBe("2026-11-08T04:59:59.000Z") // 23:59:59 EST
  })
})
```

- [ ] **Step 2: Run to verify failure** → module not found.

- [ ] **Step 3: Implement**

`blockOccurrenceInstants`: parse `startDate`/`endDate` into `{y,m,day}` civil parts (split on `-`), reuse the exported `occurrenceInstants` — but its `now`/`horizonEnd` are instants, so: compute `windowStart = zonedWallClockUtc(startCiv, 0, 0, 0, tz)` and `windowEnd = blockExpiryInstant(endDate, tz)`. To avoid re-exporting private helpers, implement in this file by importing `occurrenceInstants` and calling it with `now = new Date(Math.max(after.getTime(), windowStart.getTime() - 1))` and `horizonEnd = windowEnd` — `occurrenceInstants` walks civil days between the two and applies `> now && <= horizonEnd`, which is exactly the window semantics. For `windowStart`/`blockExpiryInstant`, export a small `zonedWallClockUtc` wrapper from `materialize.ts` (add `export` to the existing function — no logic change) and call it with `(civ, 23, 59, 59, tz)` for expiry.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Add the enrollment-expiry pass to `materializeClassSessions`**

At the top of the function (before the template loop), one UPDATE: end every `class_enrollments` row where `status = 'active'`, `creditGrantId IS NOT NULL`, and its grant's `expiresAt <= now` — join via subquery:

```ts
  // ---- Pass 0: end credit-backed enrollments whose grant has expired ----
  // A block enrollment holds its template seat only through the block
  // window (grant.expiresAt = block end). Membership-backed enrollments
  // are ended by handleSubscriptionDeleted, never here.
  const ended = await db
    .update(classEnrollments)
    .set({ status: "ended", endedAt: now })
    .where(
      and(
        eq(classEnrollments.status, "active"),
        sql`${classEnrollments.creditGrantId} IN (
          SELECT id FROM class_credit_grants WHERE expires_at <= ${now}
        )`,
      ),
    )
    .returning({ id: classEnrollments.id });
  counters.enrollmentsEnded = ended.length;
```

Add `enrollmentsEnded: 0` to the counters init and the `MaterializeResult` interface. The auto-book sweep needs **no change**: credit-backed enrollments flow into `createChildClassBooking({kind:"member"})`, whose Task 3 fallthrough redeems the pinned grant; an exhausted-but-unexpired grant reports `no_membership` → `skippedPastDue` counter (acceptable labeling; add a one-line comment there noting credit-exhausted lands in this bucket).

- [ ] **Step 6: Type check + run materialize unit tests + commit**

`npx tsc --noEmit`; `npx vitest run tests/unit/classes/` → green.

```bash
git add src/lib/classes/block-occurrences.ts src/lib/classes/materialize.ts tests/unit/classes/
git commit -m "feat(classes): block occurrence math + credit-backed enrollment expiry"
```

---

### Task 5: Class sessions never quote the adult rate card

**Files:**
- Modify: `src/pages/api/classes/book.ts:152-160` (the 402 quote fallback)
- Modify: the paid drop-in pricing resolution for class-kind sessions — find it: `grep -rn "resolveRate" src/lib/dropin/pricing.ts src/pages/api/dropin/bookings/index.ts`
- Test: extend `tests/api/` class booking tests (same file family as Task 3's)

**Interfaces:**
- Produces: for `kind='class'` sessions with null `memberRateCents`/`sessionRateCents`, paid quotes/checkouts return `409 { error: "class_rate_not_configured" }` instead of falling back to `drop_in_rate_card` (the adult pickup card). Pickup sessions keep the rate-card fallback unchanged.

- [ ] **Step 1: Write the failing API test**

Seed a class template + session with `sessionRateCents: null, memberRateCents: null`; exhaust nothing — directly: child with no membership/credits → `POST /api/classes/book {kind:"member"}` → today this 403s (fine), so target the quote paths: child WITH active membership + zero allotment remaining (seed tier `classes_per_month: 0`? — that's "no benefit"; instead use a 1-class tier and consume it on another session) → book → expect `409 class_rate_not_configured` instead of `402` with an adult-card price. And `POST /api/dropin/bookings` (paid path) for that class session → `409 class_rate_not_configured`.

- [ ] **Step 2: Run to verify failure** — currently 402 with the rate-card default.

- [ ] **Step 3: Implement**

In `book.ts`'s `allotment_exhausted` branch: if `session.memberRateCents === null`, return `json({ error: "class_rate_not_configured", message: "This class is missing its pricing — contact the front desk" }, 409)` and fire `captureServerException`-style ops visibility (`sendOpsPing` is overkill; a `console.error` + `captureServerException` matches the repo's config-error pattern — copy the shape used in `materialize.ts`). Delete the rate-card fallback in this branch. In the paid path's rate resolution, gate the rate-card fallback on `session.kind !== "class"` with the same 409 (locate via the grep in Files; apply at the same layer that today reads `dropInRateCard`).

- [ ] **Step 4: Run tests** → PASS (including existing pickup tests — the fallback must remain for pickup).

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(classes): class sessions 409 on missing rates instead of quoting the adult pickup card"
```

---

### Task 6: Public catalog endpoints

**Files:**
- Create: `src/pages/api/public/class-packs.ts`
- Create: `src/pages/api/public/class-blocks.ts`
- Test: `tests/api/public-class-catalog.test.ts`

**Interfaces:**
- Consumes: Task 1 tables, Task 4 `blockOccurrenceInstants`.
- Produces:
  - `GET /api/public/class-packs` → `{ packs: Array<{ id, name, sessionCount, priceCents, expiryMonths }> }` — active only, `orderBy(displayOrder asc, createdAt asc)`, org from `locals.organization`, 200 `{ packs: [] }` when none.
  - `GET /api/public/class-blocks` → `{ block: null } | { block: { id, name, startDate, endDate, upcoming: boolean, templates: Array<{ slotTemplateId, name, weekday, startTime, venueName, spotsLeft, totalSessions, remainingSessions, fullPriceCents, proratedPriceCents }> } }` — the **current or next** active block (first by `startDate` with `endDate >= today`, `orderBy(asc(startDate))`); per active template: `totalSessions` = occurrences with `after` = day before `startDate`, `remainingSessions` = occurrences after now, prices = counts × (`blockRateCents ?? sessionRateCents`), `spotsLeft` = capacity − active enrollments (same count the schedule endpoint uses — copy its query shape from `src/pages/api/public/class-schedule.ts`). Templates with **both** rates null are omitted (unsellable — Task 5 semantics).

Both endpoints: `export const prerender = false`, no auth (public), follow `src/pages/api/public/membership-tiers.ts`'s structure (read it first).

- [ ] **Step 1: Write failing API tests** — seed one pack product + one block + template via the fixture helper; assert shapes above, incl. `remainingSessions < totalSessions` when the block is mid-flight (seed `startDate` in the past relative to now), empty-catalog 200s, and inactive rows excluded.

- [ ] **Step 2: Run to verify failure** → 404s.

- [ ] **Step 3: Implement both endpoints.**

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/public/class-packs.ts src/pages/api/public/class-blocks.ts tests/api/public-class-catalog.test.ts
git commit -m "feat(classes): public pack + block catalog endpoints"
```

---

### Task 7: Pack purchase — checkout endpoint + webhook fulfillment

**Files:**
- Create: `src/pages/api/classes/packs/purchase.ts`
- Create: `src/lib/classes/purchase-webhooks.ts`
- Modify: `src/lib/stripe/handle-stripe-event.ts:129-199` (two new `metadata?.type` branches)
- Test: `tests/api/class-pack-purchase.test.ts`

**Interfaces:**
- Consumes: Task 1 `classPackProducts`/`classCreditGrants`; the Checkout-creation pattern in `src/pages/api/memberships/subscribe.ts` (read it first: org scoping, child ownership, Stripe customer get-or-create, `brandFromHost`).
- Produces:
  - `POST /api/classes/packs/purchase` body `{ packProductId, familyMemberId }` → `{ url }` (Checkout URL) | 401/400/404/409. Payment-mode session, line item = the pack's `stripePriceId`, `success_url` = `${origin}/dashboard/family?pack=success&child={familyMemberId}`, `cancel_url` = `${origin}/youth/classes?pack=cancelled`. Metadata contract (all strings):
    `{ type: "class_pack_purchase", organization_id, user_id, family_member_id, pack_product_id, brand, ph_distinct_id? }`
  - From `@/lib/classes/purchase-webhooks`:
    ```ts
    export async function handleClassPackPurchaseComplete(session: Stripe.Checkout.Session): Promise<void>;
    ```
    (Task 8 adds `handleClassBlockPurchaseComplete` to this same module.)
    Pack handler: guard `session.mode === "payment"` + `metadata.type`; read pack product (for `sessionCount`/`expiryMonths`); insert grant with `expiresAt = now + expiryMonths` (calendar months via `new Date(Date.UTC(y, m + expiryMonths, d, hh, mm, ss))` on UTC parts), `stripeCheckoutSessionId: session.id`, `.onConflictDoNothing({ target: classCreditGrants.stripeCheckoutSessionId })`. On genuine insert: `capturePaymentCompleted({ kind: "class_pack", ... })` + `sendOpsPing({ kind: "class_pack_purchased", ... })` — mirror `handleCheckoutSessionCompleted`'s post-insert block (`src/lib/memberships/webhook-handlers.ts:95-152`), including the `fireServerPurchaseConversions` gate.
  - In `handle-stripe-event.ts`, before the final else (Task 8 adds the
    parallel `class_block_purchase` branch):
    ```ts
    } else if (session.metadata?.type === "class_pack_purchase") {
      await handleClassPackPurchaseComplete(session);
    }
    ```

- [ ] **Step 1: Write failing API tests** (`itWithStripe`-gated for the checkout-creation test; the webhook handler test needs no Stripe — call `handleClassPackPurchaseComplete` directly with a synthetic `Stripe.Checkout.Session` object, the pattern used by existing webhook-handler tests: `grep -rl "handleCheckoutSessionCompleted\|synthetic" tests/`):
  1. Purchase endpoint: 401 unauthed; 404 foreign-org pack; 404 child not owned; 200 `{ url }` (Stripe-gated).
  2. Webhook handler: synthetic completed session with the metadata contract → grant row exists with right `sessionsGranted`/`expiresAt`; replay the same session → still exactly one grant.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** the endpoint, the pack handler, and the pack dispatch branch. Do not create any block-purchase code in this task — Task 8 owns `handleClassBlockPurchaseComplete` and its dispatch branch entirely.

- [ ] **Step 4: Run tests** → PASS. Also replay-safety: run webhook test twice in-process.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/classes/packs/ src/lib/classes/purchase-webhooks.ts src/lib/stripe/handle-stripe-event.ts tests/api/class-pack-purchase.test.ts
git commit -m "feat(classes): pack purchase checkout + webhook-fulfilled credit grants"
```

---

### Task 8: Block purchase — prorated checkout + webhook enrollment

**Files:**
- Create: `src/pages/api/classes/blocks/purchase.ts`
- Modify: `src/lib/classes/purchase-webhooks.ts` (add `handleClassBlockPurchaseComplete`)
- Modify: `src/lib/stripe/handle-stripe-event.ts` (add the `class_block_purchase` branch)
- Test: `tests/api/class-block-purchase.test.ts`

**Interfaces:**
- Consumes: Task 4 `blockOccurrenceInstants`/`blockExpiryInstant`; Task 1 tables; org timezone via the join shape in `materialize.ts:261-265`.
- Produces:
  - `POST /api/classes/blocks/purchase` body `{ blockId, slotTemplateId, familyMemberId }`:
    - Validations: auth; block active + in this org + `endDate >= today`; template active + in this org; child owned by caller; template has a sellable rate (`blockRateCents ?? sessionRateCents` non-null, else 409 `class_rate_not_configured`); `remaining = blockOccurrenceInstants({... after: new Date()}).length > 0` else 409 `block_over`; capacity: active enrollments < capacity else 409 `template_full`; no existing active enrollment for (child, template) else 409 `already_enrolled`.
    - Checkout session, payment mode, dynamic price:
      ```ts
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: remaining * rateCents,
          product_data: { name: `${template.name} — ${block.name} (${remaining} sessions)` },
        },
      }],
      ```
      Metadata: `{ type: "class_block_purchase", organization_id, user_id, family_member_id, block_id, slot_template_id, sessions_granted: String(remaining), brand, ph_distinct_id? }`.
      `success_url` = `${origin}/dashboard/family/choose-slot?child={familyMemberId}&block=success&slot={slotTemplateId}`, `cancel_url` = `${origin}/youth/classes?block=cancelled`.
    - Response `{ url, remainingSessions: remaining, totalCents: remaining * rateCents }`.
  - `handleClassBlockPurchaseComplete`: guard mode+type; in one transaction — insert grant (`source: "block"`, `slotTemplateId`, `sessionsGranted: Number(md.sessions_granted)`, `expiresAt: blockExpiryInstant(block.endDate, orgTz)`, `stripeCheckoutSessionId: session.id`, `onConflictDoNothing` on the unique index; if the insert no-ops (replay), return before the enrollment insert) + insert `classEnrollments` row `{ slotTemplateId, familyMemberId, membershipId: null, creditGrantId: grant.id, status: "active" }` with `.onConflictDoNothing()` (the partial unique index `class_enrollments_one_active_per_child_template` absorbs a race). Capacity is NOT re-checked here — the customer has paid; a race that oversells by one seat is accepted and surfaced via ops ping (`sendOpsPing({ kind: "class_block_purchased", ... })` fires on genuine insert either way). Telemetry mirrors the pack handler.
  - Deliberate: the webhook does **not** book sessions (no guardian waiver exists yet unless one is on file). The success page (existing `/dashboard/family/choose-slot`, extended in Task 11) confirms the enrollment, captures the waiver, and books this week; the daily cron books the rest once a waiver is on file.

- [ ] **Step 1: Write failing API tests** — mirror Task 7's split: endpoint validations (409s for `block_over` with an all-past block, `template_full`, `already_enrolled`, `class_rate_not_configured`; proration: seed a mid-flight block, assert `totalCents = remainingSessions × blockRateCents` and `remainingSessions` < full count); webhook handler with synthetic session → grant + enrollment rows exist, `membershipId` null, replay inserts nothing.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run tests** → PASS. Also re-run `tests/api/classes-credit-booking.test.ts` — pinned-grant booking must work against the enrollment the webhook created.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/classes/blocks/ src/lib/classes/purchase-webhooks.ts src/lib/stripe/handle-stripe-event.ts tests/api/class-block-purchase.test.ts
git commit -m "feat(classes): prorated block purchase + webhook grant/enrollment"
```

---

### Task 9: Admin packs — API + UI + Stripe reconciliation

**Files:**
- Create: `src/pages/api/admin/classes/packs/index.ts` (GET list, POST create), `src/pages/api/admin/classes/packs/[id].ts` (PUT, DELETE)
- Create: `src/lib/classes/admin-pack-stripe.ts`
- Create: `src/components/admin/classes/packs-list.tsx`, `src/components/admin/classes/pack-form.tsx`
- Modify: `src/components/admin/classes/templates-list.tsx` (add a tab strip Templates | Packs | Blocks — follow whatever tab/nav affordance the admin memberships/classes pages already use; if none exists, a simple pill-link row at the top linking `/admin/classes`, `/admin/classes/packs`, `/admin/classes/blocks`)
- Create: `src/pages/admin/classes/packs.astro`, `src/pages/admin/classes/packs/new.astro`, `src/pages/admin/classes/packs/[id].astro`
- Test: `tests/api/admin-class-packs.test.ts`

**Interfaces:**
- Consumes: `requireSameOrg*` helpers; the tier admin as the template — read `src/pages/api/admin/memberships/tiers/index.ts`, `[id].ts`, `src/components/admin/memberships/{tiers-list,tier-form}.tsx` and mirror their shapes exactly (list/create/update/delete semantics, hard-delete iff unreferenced else 409 + deactivate guidance, Stripe reconcile on create/update).
- Produces:
  - `@/lib/classes/admin-pack-stripe`:
    ```ts
    export async function createPackStripeObjects(opts: { orgId: string; name: string; priceCents: number }):
      Promise<{ productId: string; priceId: string }>;   // one-time Price (no recurring)
    export async function applyPackStripeEdits(opts: { productId: string; nameChangedTo?: string;
      oldPriceCents: number; oldPriceId: string | null; nextPriceCents: number }):
      Promise<{ priceId: string | null }>;               // create-then-archive on amount change
    ```
    Mirror `admin-stripe.ts` (`createFeePrice` is the one-time-price pattern). Product metadata: `{ organization_id, kind: "class_pack" }`.
  - Admin endpoints: standard JSON CRUD on `classPackProducts` (fields: name, sessionCount, priceCents, expiryMonths, active, displayOrder). DELETE 409s when any `classCreditGrants.packProductId` references it.
  - UI: list with name/sessions/price/expiry/active + "New pack" → form (react-hook-form + zod per repo convention; see `tier-form.tsx`).

- [ ] **Step 1: Write failing API tests** — as the seeded admin (`admin@test.aspiresports.com` / `TestAdmin123!`): CRUD happy path (Stripe-gated for create/update), 401 non-admin, 404 cross-org (`requireSameOrg` behavior), DELETE-with-grants → 409.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement lib + endpoints, then pages/components.**
- [ ] **Step 4: Run tests → PASS. Browser-check `/admin/classes/packs` renders and creates.**
- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/classes/packs/ src/lib/classes/admin-pack-stripe.ts src/components/admin/classes/ src/pages/admin/classes/ tests/api/admin-class-packs.test.ts
git commit -m "feat(admin): class pack catalog CRUD with Stripe reconciliation"
```

---

### Task 10: Admin blocks + template block rate + missing-rate badge

**Files:**
- Create: `src/pages/api/admin/classes/blocks/index.ts`, `src/pages/api/admin/classes/blocks/[id].ts`
- Create: `src/components/admin/classes/blocks-list.tsx`, `src/components/admin/classes/block-form.tsx`
- Create: `src/pages/admin/classes/blocks.astro`, `src/pages/admin/classes/blocks/new.astro`, `src/pages/admin/classes/blocks/[id].astro`
- Modify: `src/components/admin/classes/template-form.tsx` (add `blockRateCents` money field beside the existing two rate fields), `src/pages/api/admin/classes/templates` endpoints (accept/persist the field — locate: `src/lib/classes/admin-templates.ts` and `grep -rn "sessionRateCents" src/pages/api/admin/classes/`)
- Modify: `src/components/admin/classes/templates-list.tsx` (row badge "No rates set — paid bookings blocked" when both `sessionRateCents` and `memberRateCents` are null, amber `text-warning` chip)
- Test: `tests/api/admin-class-blocks.test.ts`

**Interfaces:**
- Consumes: Task 1 `classBlocks`; tier-admin patterns as in Task 9.
- Produces: CRUD on `classBlocks` (name, startDate, endDate, active). Validation: `endDate >= startDate` (422); overlapping ACTIVE windows rejected (422 `overlapping_block`) — overlap test: `newStart <= existing.endDate AND newEnd >= existing.startDate` among `active = true` rows, excluding self on update. No Stripe objects (blocks price dynamically). DELETE 409s when referenced by any grant.

- [ ] **Step 1: Failing API tests** — CRUD, date validation, overlap 422, cross-org 404, delete-with-grants 409.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement endpoints + UI + template field + badge.**
- [ ] **Step 4: Tests PASS; browser-check blocks admin + template form field + badge.**
- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/classes/blocks/ src/components/admin/classes/ src/pages/admin/classes/ tests/api/admin-class-blocks.test.ts
git commit -m "feat(admin): class block windows CRUD + template block rate + missing-rate badge"
```

---

### Task 11: Public purchase UX — ladder band, block flow, drop-in door, copy fix

**Files:**
- Create: `src/components/youth/class-purchase-ladder.tsx`
- Modify: `src/pages/youth/classes.astro` (swap `<ClassTiers client:load />` in the `#pricing` band for `<ClassPurchaseLadder client:load />`; fix the FAQ/booking copy — find the block/monthly contradiction: `grep -n "block" src/pages/youth/classes.astro`)
- Modify: `src/components/youth/class-schedule.tsx` (session rows gain a "Book · $X" affordance for signed-out/non-member visitors — the drop-in door)
- Modify: `src/components/dashboard/choose-slot.tsx` + `src/pages/dashboard/family/choose-slot.astro` (block mode: `?block=success&slot=Y` pre-selects and locks slot Y, confirms the enrollment already exists, captures waiver, books this week via `POST /api/classes/book {kind:"member"}` — the credits fallthrough redeems the pinned grant)
- Test: `tests/unit/` — extract any new pure helpers (price formatting, ladder assembly from the three fetches) into `src/lib/classes/ladder-model.ts` and unit-test that; UI verified in browser + Task 12's E2E.

**Interfaces:**
- Consumes: `GET /api/public/class-packs`, `/api/public/class-blocks`, `/api/public/membership-tiers` (existing), `/api/public/class-schedule` (existing); purchase endpoints from Tasks 7/8; the auth-probe → ChildPicker → POST pattern in `class-tiers.tsx:206-297` (reuse `ChildPicker` as-is).
- Produces:
  - `<ClassPurchaseLadder />`: four-rung band — Drop-in (from-price = min session rate across schedule slots, "just show up once" copy), Packs (one card per catalog pack: name, N sessions, price, per-session math, expiry), Block (current/next window: dates, per-template picker with `remainingSessions`/`proratedPriceCents`, "join mid-block — you only pay for the weeks left" line when `remaining < total`), Membership (render the existing `ClassTiers` tier cards — import and embed the component rather than duplicating its fetch/checkout logic; it stays the membership rung's engine).
  - Fail-soft: any rung whose fetch fails or returns empty simply doesn't render; if ALL of packs/blocks/tiers are empty, render the existing `PRICING_CARDS_FALLBACK` figures-free cards (import from `class-tiers.tsx` — export it there if not already exported).
  - Pack CTA → auth probe → ChildPicker → `POST /api/classes/packs/purchase` → redirect to `url`. Block CTA → template picker → auth probe → ChildPicker → `POST /api/classes/blocks/purchase` → redirect. Drop-in session "Book" → auth probe → ChildPicker → `POST /api/classes/book {kind:"member"}`; on 403 `no_membership` (no credits either) → route to the paid drop-in checkout exactly as the make-up modal's 402 path does (reuse that fetch shape from `family-classes-card.tsx:505-690`).
  - Design: emerald youth band grammar, serif headers, brand-red CTAs, mono labels; no eyebrow text; band composition per `docs/design-system.md` "Youth band grammar". `useHydrationBeacon()` on the top-level island (it replaces `ClassTiers`, which already carries it — verify and keep).
  - Copy: `/youth/classes` FAQ and band copy now describes all four ways in (drop-in / pack / block / membership) — rewrite the "booked as multi-week blocks" FAQ answer to describe blocks as one of the options, monthly membership as another.

- [ ] **Step 1: Extract + unit-test `src/lib/classes/ladder-model.ts`** — `assembleLadder({ packs, blocks, tiers, scheduleSlots })` → ordered rung view-models incl. drop-in from-price (min non-null `sessionRateCents`; rung absent when no slot has a rate) and per-session pack math (`Math.round(priceCents / sessionCount)`). Failing tests first, then implement.
- [ ] **Step 2: Build `ClassPurchaseLadder` + swap into `classes.astro` + copy fix.**
- [ ] **Step 3: Drop-in door in `class-schedule.tsx`.**
- [ ] **Step 4: Block mode in choose-slot.**
- [ ] **Step 5: Verify in browser** (dev server): `/youth/classes` renders all four rungs against seeded catalog; empty-catalog org falls back cleanly; signed-out pack CTA bounces to signin with redirect; block flow reaches Stripe Checkout (test mode); dashboard choose-slot in block mode books with waiver. Check with the design-review eye: both light backgrounds and navy bands, mobile width via narrow window.
- [ ] **Step 6: Commit**

```bash
git add src/components/youth/ src/lib/classes/ladder-model.ts src/pages/youth/classes.astro src/components/dashboard/choose-slot.tsx src/pages/dashboard/family/choose-slot.astro tests/unit/classes/
git commit -m "feat(youth): four-rung class purchase ladder + drop-in door + block success flow"
```

---

### Task 12: Dashboard credits + summary API + E2E + ship checks

**Files:**
- Modify: `src/pages/api/classes/summary.ts` (per-child `credits: Array<{ source, remaining, expiresAt, label }>` from `getCreditBalances`, filtered to `remaining > 0 && expiresAt > now`; `label = packName ?? blockName ?? (source === "pack" ? "Class pack" : "Block")`)
- Modify: `src/components/dashboard/family-classes-card.tsx` (credits line per child: "6 sessions left · Starter Pack · expires Mar 1"; "Book a session" CTA opens the existing make-up modal; when child has credits but no waiver on file and no bookings yet, show the amber "Sign the waiver to activate bookings" nudge linking into the modal's waiver step)
- Create: `tests/e2e/class-pack-purchase.spec.ts`
- Test: extend the summary API test file (`grep -l "classes/summary" tests/api/`)

**Interfaces:**
- Consumes: Task 2 `getCreditBalances`; the summary endpoint's existing per-child assembly (cap-20 children behavior unchanged).
- Produces: summary response gains `credits` per child; family card renders it.

- [ ] **Step 1: Failing API test** for the summary extension (seed grant → assert `credits` array shape; exhausted/expired grants excluded).
- [ ] **Step 2: Implement summary + card.**
- [ ] **Step 3: E2E spec** — follow `tests/e2e/` classes signup spec patterns (`waitForHydration`, element clicks, hydration beacon; seeded parent account). Flow: seed a pack grant directly (E2E does NOT drive Stripe Checkout — same convention as the existing paid make-up spec, which asserts up to the checkout redirect) → sign in → family dashboard shows the credits line → open make-up modal → book a session → balance decrements on reload; `/youth/classes` shows the pack rung and clicking its CTA as a signed-out user lands on `/signin?redirect=...`.
- [ ] **Step 4: Run the full pre-push checklist** (this is the ship gate for the whole plan):
  1. `npm run db:seed:e2e` (extend `src/lib/db/seeds/seed-e2e-tests.ts` if the spec needs a seeded pack product/grant — it will; add idempotent fixtures pinned by slug/name).
  2. `CRON_SECRET=<dev's> TEST_BASE_URL=http://localhost:4321 npm run test:api`
  3. `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- class` (new spec + existing classes specs)
  4. `npm run build`
  5. `npx tsc --noEmit` → zero
  6. Grep `tests/e2e/` for specs touching `/youth/classes` pricing band (`grep -rln "pricing\|tiers" tests/e2e/`) — the band component changed; update selectors in the same commit.
- [ ] **Step 5: Commit**

```bash
git add src/pages/api/classes/summary.ts src/components/dashboard/family-classes-card.tsx tests/e2e/class-pack-purchase.spec.ts src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "feat(dashboard): per-child class credits + pack purchase E2E"
```

---

## Task execution notes for the orchestrator

- Model assignment: Tasks 0–8 (schema/engine/Stripe/webhooks) → **Opus** subagents. Tasks 9–12 (admin CRUD, UI, E2E) → **Sonnet** subagents, except Task 11's choose-slot block mode which is Opus if bundled separately.
- Dependency order: 0 → 1 → 2 → 3 → {4, 5, 6} (parallel-safe: disjoint files) → 7 → 8 → {9, 10, 11} (9/10 disjoint; 11 depends on 6/7/8) → 12.
- Every dispatch pins the worktree root path and the branch name, and forbids `git checkout`/stash.
- After each task: orchestrator reviews the diff before dispatching the next dependent task.
