# Youth Class Memberships — Plan 2: Scheduling Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The class scheduling engine: slot templates, per-child home-slot enrollments, weekly session materialization with allotment-aware auto-booking, trial and member child bookings (free + paid paths), cutoff-gated cancellation, and the read APIs Plan 3's UX will consume.

**Architecture:** Class sessions are `drop_in_sessions` rows (`kind: "class"`, `audience: "youth"`) linked to new `class_slot_templates`; children enroll via new `class_enrollments`. Consumption stays count-based: an allotment booking IS the decrement. Booking reuses the drop-in transaction/capacity/participant-index machinery (`checkSessionCapacityLocked`, the v3 `COALESCE(family_member_id, user_id)` unique index — siblings already coexist). Per-child entitlement rides `getActiveChildMembership` from Plan 1. No parent-facing UI in this plan — Plan 3 owns pages/components.

**Tech Stack:** Astro 5 API routes, Drizzle (Postgres/Railway), Stripe (paid make-ups reuse the drop-in Checkout webhook path), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-youth-class-memberships-design.md`. **Prereq:** Plan 1 merged (PR #586; #588 dahlia follow-up).

## Global Constraints

- Execute in a fresh worktree on branch `youth-classes-engine` off current `origin/main` (create via `superpowers:using-git-worktrees` before Task 1; cherry-pick the plan-doc commit). `git branch --show-current` before every edit session.
- Migrations: `db:generate` only; **enum additions are their own migration file** (Task 2 exists solely for `trial`).
- Every `findFirst`/`.limit(1)` carries explicit `orderBy` unless it is a PK/unique lookup.
- `npx tsc --noEmit` zero errors before every commit; unit suites in `tests/unit/`, API suites hit a running dev server (`./scripts/with-bws.sh env … npm run dev`; remember `bws run` OVERWRITES outer-shell env — overrides go inside via `env`).
- Spec rules that bind throughout: home-slot auto-booking consumes the shared monthly pool and only books while credits remain (unlimited always books); cancel ≥24h before start frees the credit (count-based, automatic), inside 24h the booking stays counted; trial = one per child, free, requires a signed-in parent; all reads/writes org-scoped; `past_due` memberships pause auto-booking.
- Allotment month boundary is UTC calendar month (`allotmentPeriodStart` — unchanged).
- Classes launch ~2026-09-13 — prefer reusing drop-in machinery over building parallel structures.

---

### Task 1: Schema — slot templates, enrollments, session linkage

**Files:**
- Create: `src/lib/db/schema/classes.ts`
- Modify: `src/lib/db/schema/drop-in.ts` (sessions table + one index; bookings `membershipId` comment)
- Create: `src/lib/db/migrations/NNNN_*.sql` (via `npm run db:generate`)

**Interfaces:**
- Produces: `classSlotTemplates`, `classEnrollments` tables (+`ClassSlotTemplate`/`ClassEnrollment` types); `dropInSessions.classSlotTemplateId: uuid | null`; partial unique index `drop_in_sessions_one_per_template_start` on `(class_slot_template_id, starts_at)` where template id non-null (materialization idempotency); enrollment statuses `active | ended`.

- [ ] **Step 1: Create `src/lib/db/schema/classes.ts`**

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  time,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, locations } from "./organizations";
import { familyMembers } from "./registrations";
import { memberships } from "./memberships";

export const classEnrollmentStatusEnum = pgEnum("class_enrollment_status", [
  "active",
  "ended",
]);

/**
 * A recurring weekly class slot ("Soccer Skills 6–8, Tue 17:00, cap 12").
 * The cron materializes one drop_in_sessions row (kind='class') per active
 * template per week; enrolled children are auto-booked into it while their
 * monthly class allotment lasts.
 */
export const classSlotTemplates = pgTable(
  "class_slot_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    sportLabel: text("sport_label").notNull().default("Soccer"),
    minAge: integer("min_age"),
    maxAge: integer("max_age"),
    /** 0=Sunday … 6=Saturday, matching JS Date#getUTCDay. */
    weekday: integer("weekday").notNull(),
    /** Local wall-clock start, org timezone (repo convention: UTC storage,
     *  org-tz display — but slot times are WALL times, so store the wall
     *  time and resolve to an instant at materialization). */
    startTime: time("start_time").notNull(),
    durationMins: integer("duration_mins").notNull().default(55),
    capacity: integer("capacity").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("class_slot_templates_org_active_idx").on(table.organizationId, table.active),
  ],
);

/**
 * A child's standing home-slot enrollment. Capacity = count of ACTIVE
 * enrollments per template, checked transactionally against
 * classSlotTemplates.capacity.
 */
export const classEnrollments = pgTable(
  "class_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotTemplateId: uuid("slot_template_id")
      .notNull()
      .references(() => classSlotTemplates.id, { onDelete: "restrict" }),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    status: classEnrollmentStatusEnum("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("class_enrollments_one_active_per_child_template")
      .on(table.slotTemplateId, table.familyMemberId)
      .where(sql`status = 'active'`),
    index("class_enrollments_child_idx").on(table.familyMemberId, table.status),
    index("class_enrollments_template_status_idx").on(table.slotTemplateId, table.status),
  ],
);

export type ClassSlotTemplate = typeof classSlotTemplates.$inferSelect;
export type NewClassSlotTemplate = typeof classSlotTemplates.$inferInsert;
export type ClassEnrollment = typeof classEnrollments.$inferSelect;
```

- [ ] **Step 2: Link sessions to templates in `drop-in.ts`**

Import `classSlotTemplates` from `./classes` and add to `dropInSessions` after `hostUserId`:

```typescript
    // Set when the session was materialized from a recurring class slot
    // template (kind='class' home-slot machinery). NULL for every pickup
    // session and for one-off classes created directly in admin.
    classSlotTemplateId: uuid("class_slot_template_id").references(
      () => classSlotTemplates.id,
      { onDelete: "set null" },
    ),
```

and in the sessions index block:

```typescript
    // Materialization idempotency: at most one session per template per
    // start instant — the cron upserts against this.
    uniqueIndex("drop_in_sessions_one_per_template_start")
      .on(table.classSlotTemplateId, table.startsAt)
      .where(sql`class_slot_template_id IS NOT NULL`),
```

Also update the stale comment on `dropInBookings.membershipId` ("the memberships table does not exist yet") to reference `memberships.ts` — it has existed since Phase 3.

- [ ] **Step 3: Generate + review migration**

Run: `npm run db:generate`. Review: two `CREATE TABLE`, one `CREATE TYPE class_enrollment_status` (a NEW enum created WITH its table is fine in one migration — the own-file rule is for ADD VALUE on existing enums), `ADD COLUMN class_slot_template_id`, the two partial unique indexes + three plain indexes. No other tables touched.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/db/schema/ src/lib/db/migrations/
git commit -m "feat(classes): slot template + enrollment schema, session linkage"
```

---

### Task 2: Enum migration — `drop_in_payment_method` gains `trial`

**Files:**
- Modify: `src/lib/db/schema/drop-in.ts` (`dropInPaymentMethodEnum`)
- Create: `src/lib/db/migrations/NNNN_*.sql` (own migration, nothing else in it)

**Interfaces:**
- Produces: `"trial"` as a valid `paymentMethod` on `drop_in_bookings`. Also fix the known drift: `src/lib/dropin/pricing.ts`'s `DropInPaymentMethod` type union omits `host_comp` — add both `host_comp` and `trial` so the type matches the DB enum.

- [ ] **Step 1: Append `"trial"`** to `dropInPaymentMethodEnum` in `drop-in.ts` (after `"host_comp"`).
- [ ] **Step 2: `npm run db:generate`** — verify the migration is exactly one `ALTER TYPE "drop_in_payment_method" ADD VALUE 'trial';`. If anything else appears, Task 1's migration wasn't committed — stop.
- [ ] **Step 3:** Update `DropInPaymentMethod` in `src/lib/dropin/pricing.ts` to include `"host_comp"` and `"trial"`. `npx tsc --noEmit` — fix any switch-exhaustiveness fallout minimally.
- [ ] **Step 4: Commit** — `feat(dropin): 'trial' payment method (enum-only migration) + type-union drift fix`.

---

### Task 3: Per-child class allotment

**Files:**
- Modify: `src/lib/memberships/allotment.ts`
- Modify: `src/lib/memberships/get-child-membership.ts`
- Test: `tests/unit/memberships/class-allotment.test.ts`

**Interfaces:**
- Consumes: Plan 1's `getActiveChildMembership`; benefit keys `classes_per_month` / `unlimited_classes`.
- Produces: `computeClassAllotmentRemaining(benefits, used): number | "unlimited"` exported from `allotment.ts`; `ChildMembership` gains `classAllotmentRemaining: number | "unlimited"` (0 when the tier has no class benefit). Pickup allotment behavior untouched.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "vitest";
import { computeClassAllotmentRemaining } from "@/lib/memberships/allotment";

describe("computeClassAllotmentRemaining", () => {
  it("unlimited wins over any count", () => {
    expect(
      computeClassAllotmentRemaining({ unlimited_classes: true, classes_per_month: 4 }, 99),
    ).toBe("unlimited");
  });
  it("cap minus used, floored at zero", () => {
    expect(computeClassAllotmentRemaining({ classes_per_month: 4 }, 1)).toBe(3);
    expect(computeClassAllotmentRemaining({ classes_per_month: 4 }, 6)).toBe(0);
  });
  it("no class benefit → 0", () => {
    expect(computeClassAllotmentRemaining({ free_pickup_per_month: 4 }, 0)).toBe(0);
  });
});
```

Run → FAIL (not exported).

- [ ] **Step 2: Implement in `allotment.ts`**

```typescript
/** Class-package twin of the pickup allotment. Same count-based model and
 *  UTC-calendar-month period; benefits keys `classes_per_month` /
 *  `unlimited_classes`. Consumption unit: a confirmed/no_show booking on a
 *  kind='class' session with paymentMethod 'member_allotment' for the child. */
export function computeClassAllotmentRemaining(
  benefits: Record<string, unknown>,
  used: number,
): number | "unlimited" {
  if (benefits.unlimited_classes === true) return "unlimited";
  const cap = Number(benefits.classes_per_month) || 0;
  if (cap <= 0) return 0;
  return Math.max(0, cap - used);
}
```

Run → PASS.

- [ ] **Step 3: Wire into `getActiveChildMembership`**

After the row resolves, when the tier has a class benefit (`unlimited_classes === true` or `classes_per_month > 0`), count usage and attach; else `classAllotmentRemaining = 0`:

```typescript
  const [usedRow] = await db
    .select({ used: count() })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
    .where(
      and(
        eq(dropInBookings.membershipId, row.m.id),
        eq(dropInBookings.familyMemberId, familyMemberId),
        eq(dropInSessions.kind, "class"),
        eq(dropInBookings.paymentMethod, "member_allotment"),
        inArray(dropInBookings.status, ["confirmed", "no_show"]),
        gte(dropInBookings.createdAt, allotmentPeriodStart(new Date())),
      ),
    );
```

Imports: `dropInBookings`, `dropInSessions` from the drop-in schema; `count`, `gte` from drizzle. Unlimited/no-benefit tiers skip the count (mirror the pickup short-circuit in `get-active-membership.ts`).

- [ ] **Step 4: Typecheck, unit tests, commit** — `feat(classes): per-child monthly class allotment`.

---

### Task 4: Child class booking library

**Files:**
- Create: `src/lib/classes/book-child.ts`
- Test: `tests/unit/classes/book-child-args.test.ts` (pure guards), API coverage lands in Task 9

**Interfaces:**
- Consumes: `getActiveChildMembership` (+`classAllotmentRemaining`), `checkSessionCapacityLocked` + `DropInTx` from `src/lib/dropin/booking.ts`, `computeClassAllotmentRemaining`.
- Produces:

```typescript
export type ChildBookingKind = "member" | "trial";
export interface ChildBookingError {
  code:
    | "session_not_found" | "session_not_class" | "session_not_scheduled"
    | "session_started" | "session_full" | "child_not_found"
    | "already_booked" | "no_membership" | "allotment_exhausted"
    | "trial_already_used" | "age_ineligible" | "waiver_required";
  message: string;
}
export type ChildBookingResult =
  | { ok: true; bookingId: string; paymentMethod: "member_allotment" | "trial" }
  | { ok: false; error: ChildBookingError };
export async function createChildClassBooking(opts: {
  sessionId: string;
  parentUserId: string;
  familyMemberId: string;
  kind: ChildBookingKind;
  source?: "online_booking" | "auto_enrollment";
  waiver?: { signedBy: string; consentText: string };
  brand?: BrandId;
  dbOrTx?: DropInTx;           // cron passes its own tx
}): Promise<ChildBookingResult>;
```

- [ ] **Step 1: Implement** (mirror `createConfirmedBookingFreePath`'s transaction shape — read it first; key differences):
  - Lock the session FOR UPDATE; require `kind === "class"`, `status === "scheduled"`, `startsAt > now` (else `session_started`).
  - Child ownership: `familyMembers` row with `id = familyMemberId AND parentUserId = opts.parentUserId` (403-shaped `child_not_found` on miss).
  - Age gate: when the session's template (join via `classSlotTemplateId`, may be null for one-off classes) has `minAge`/`maxAge` and the child has `birthDate`, compute age at session date; outside range → `age_ineligible`. No template/no DOB → skip.
  - Duplicate guard keyed on the PARTICIPANT (matches the v3 index): existing active-status booking where `sessionId` matches and `familyMemberId = opts.familyMemberId` → `already_booked`.
  - `kind: "member"`: `getActiveChildMembership(familyMemberId, session.organizationId, tx)`; none or status ≠ "active" → `no_membership`; `classAllotmentRemaining === 0` → `allotment_exhausted` (paid path is Task 5's endpoint concern). Insert with `paymentMethod: "member_allotment"`, `membershipId`, `amountPaidCents: 0`.
  - `kind: "trial"`: one per child EVER (per org): count prior bookings for this `familyMemberId` with `paymentMethod = 'trial'` joined to sessions of this org, any status except cancelled → `trial_already_used`. No membership required. Insert with `paymentMethod: "trial"`.
  - Waiver: query whether ANY prior `dropInBookings` row for this child has `waiverSigned = true` (waiver-on-file). If none and `opts.waiver` absent → `waiver_required`; if provided, stamp `waiverSigned/At/By`, `waiverConsentVariant: "guardian"`, `waiverConsentText`.
  - Capacity via `checkSessionCapacityLocked(tx, sessionId, session.capacity)`.
  - Insert carries `userId: opts.parentUserId`, `familyMemberId`, `status: "confirmed"`, `source: opts.source ?? "online_booking"`, `brand: opts.brand ?? "aspire"`. Skip team-assignment and gender caps (classes have neither); skip `resolveRate` (both class paths are $0 here).
  - After commit (only when NOT running inside a caller tx): `ensureDropInCustomerMembership` + confirmation dispatch, same pattern/ordering as the free path. When `dbOrTx` was passed (cron), the CALLER owns post-commit side effects — document this in the doc comment.
- [ ] **Step 2:** Unit-test the pure age computation (extract `ageOnDate(birthDate, onDate)` helper) and the error-shape mapping.
- [ ] **Step 3:** `npx tsc --noEmit`; commit — `feat(classes): child class booking library (member + trial paths)`.

---

### Task 5: Endpoints — trial booking, member booking, paid make-up, cancellation

**Files:**
- Create: `src/pages/api/classes/book.ts` (POST — member/trial child booking)
- Create: `src/pages/api/classes/bookings/[id]/cancel.ts` (POST)
- Modify: the drop-in paid-checkout endpoint + webhook insert path (find via `grep -rn "dropin_booking" src/` — the checkout creator and `handleCheckoutSessionCompleted` for drop-ins) to carry `family_member_id` metadata → booking row, enabling paid member-rate make-ups when allotment is exhausted
- Test: covered in Task 9's API suites

**Interfaces:**
- Produces: `POST /api/classes/book` body `{ sessionId, familyMemberId, kind: "member" | "trial", waiver?: { signedBy, consentText } }` → 200 `{ bookingId, paymentMethod }` | 402 `{ error: "allotment_exhausted", memberRateCents }` (kind=member, pool empty — client can proceed to the paid flow) | 4xx mapped from `ChildBookingError` (`child_not_found`→404, `already_booked`→409, `trial_already_used`→409, `waiver_required`→422, `age_ineligible`→422, capacity→409). `POST /api/classes/bookings/:id/cancel` → 200 `{ cancelled: true, creditFreed: boolean }` | 409 `{ error: "inside_cutoff" }`.

- [ ] **Step 1: `book.ts`** — auth via `locals.user` + `locals.organization` (401/400 like `subscribe.ts`); call `createChildClassBooking`; on `allotment_exhausted` respond 402 with the session's `memberRateCents ?? rateCard.memberRateCents` so Plan 3 can route to paid checkout.
- [ ] **Step 2: paid path** — read the existing drop-in checkout creator + its webhook insert FIRST; thread optional `familyMemberId` (validated against `parentUserId = locals.user.id`) through checkout metadata (`family_member_id`) into the webhook's booking insert (participant column + guardian waiver variant). The v3 participant index already dedupes. Keep the change minimal — no behavior change for adult drop-ins.
- [ ] **Step 3: `cancel.ts`** — load booking + session (org-scoped via session.organizationId = locals.organization.id); require the booking's `userId === locals.user.id`; require active status; cutoff: `session.startsAt - 24h > now` → set `status: "cancelled"`, `cancelledAt`, `cancellationReason: "user_request"` (credit frees automatically — count-based); else 409 `inside_cutoff`. CreditFreed = the booking's paymentMethod was `member_allotment`.
- [ ] **Step 4:** `npx tsc --noEmit`; commit — `feat(classes): booking + cancellation endpoints, paid child make-up path`.

---

### Task 6: Enrollment library + endpoints

**Files:**
- Create: `src/lib/classes/enrollment.ts`
- Create: `src/pages/api/classes/enrollments/index.ts` (POST create, GET list mine)
- Create: `src/pages/api/classes/enrollments/[id].ts` (DELETE end; PUT change-slot)
- Test: Task 9

**Interfaces:**
- Produces: `enrollChild({ slotTemplateId, familyMemberId, parentUserId, organizationId })` → `{ ok: true, enrollmentId } | { ok: false, error: { code: "template_not_found" | "template_inactive" | "template_full" | "child_not_found" | "no_membership" | "already_enrolled" } }`; `endEnrollment(id)`; `changeEnrollmentSlot(id, newSlotTemplateId)` = end + create atomically. `POST /api/classes/enrollments` body `{ slotTemplateId, familyMemberId }`.

- [ ] **Step 1: `enrollment.ts`** — transaction: lock the template row FOR UPDATE (org-scoped), require `active`; child ownership check; `getActiveChildMembership` (active status + class benefit required → `no_membership`); active-enrollment count < capacity (`template_full`); insert (the partial unique index backstops `already_enrolled` — pre-check for the clean code). `changeEnrollmentSlot` runs end+create in ONE tx locking BOTH templates (ordered by id to avoid deadlock).
- [ ] **Step 2: endpoints** — auth + org context; GET returns the caller's children's active enrollments joined to template fields (name/weekday/startTime/location). DELETE/PUT verify the enrollment's child belongs to the caller.
- [ ] **Step 3:** `npx tsc --noEmit`; commit — `feat(classes): home-slot enrollment library + endpoints`.

---

### Task 7: Materialization + auto-booking cron

**Files:**
- Create: `src/lib/classes/materialize.ts`
- Create: `src/pages/api/cron/materialize-class-sessions.ts`
- Create: `netlify/functions/scheduled-materialize-class-sessions.ts` (mirror an existing `scheduled-*.ts`; pick an off-hour minute per the repo's stagger convention, e.g. `"23 4 * * *"` daily)
- Test: `tests/unit/classes/materialize.test.ts` (mock db/deps like `annual-fee.test.ts` does)

**Interfaces:**
- Consumes: Task 1 tables + idempotency index, Task 4's `createChildClassBooking` (with `dbOrTx`), org timezone (find the org-timezone helper via `grep -rn "timezone" src/lib/organization/` and reuse it — spec: templates store wall time in org tz).
- Produces: `materializeClassSessions(now: Date): Promise<{ sessionsCreated: number; autoBooked: number; skippedExhausted: number; skippedPastDue: number; failed: number }>` — for each active template: ensure sessions exist for the next `HORIZON_DAYS = 8` days (compute each occurrence's UTC instant from weekday+startTime in the org's tz; insert with `onConflictDoNothing` against `drop_in_sessions_one_per_template_start`; fields: org/location→venue mapping — templates reference `locations`; sessions require `venueId`: resolve the location's venue (grep how venues relate to locations — `venues` schema — and add a `venueId` column to the template in Task 1 if there is no 1:1 mapping; RESOLVE THIS while implementing Task 1, the implementer of Task 1 must check `src/lib/db/schema/` venue↔location shape and add `venueId` to `classSlotTemplates` if needed, keeping this task's insert unambiguous), `kind: "class"`, `audience: "youth"`, `sportOrClassLabel: template.sportLabel`, `formatLabel: template.name`, capacity, `classSlotTemplateId`, `status: "scheduled"`). Then for each newly-materialized session, auto-book every ACTIVE enrollment of that template via `createChildClassBooking({ kind: "member", source: "auto_enrollment", dbOrTx })` — per-enrollment try/catch (the `charge-unpaid-team-shares` isolation pattern); count `allotment_exhausted` as `skippedExhausted` (the five-week-month rule falls out naturally), membership `past_due` → `no_membership` counts as `skippedPastDue`; never throw the whole batch.
- Post-commit side effects for auto-bookings (confirmation email per booking) are dispatched AFTER each session's tx commits, batched per session, same `awaitDispatch` pattern as the free path.

- [ ] **Step 1:** failing unit tests: occurrence-instant math (tz-aware; test America/New_York around a DST boundary), horizon windowing (today+8d, only future instants), and the batch counters with mocked deps (created/exhausted/pastDue/failed).
- [ ] **Step 2:** implement `materialize.ts`; cron endpoint copies the CRON_SECRET skeleton; scheduled function mirrors siblings.
- [ ] **Step 3:** `npx tsc --noEmit`; unit green; commit — `feat(classes): weekly session materialization + allotment-aware auto-booking cron`.

---

### Task 8: Read APIs for Plan 3

**Files:**
- Create: `src/pages/api/public/class-schedule.ts` (GET — anonymous)
- Create: `src/pages/api/classes/summary.ts` (GET — authed parent)
- Test: Task 9

**Interfaces:**
- Produces:
  - `GET /api/public/class-schedule` → `{ slots: [{ templateId, name, sportLabel, weekday, startTime, durationMins, minAge, maxAge, locationName, capacity, enrolledCount, spotsLeft }], sessions: [{ id, templateId, startsAt, endsAt, capacity, bookedCount, spotsLeft }] }` — active templates + next-14-days scheduled class sessions for the resolved org, both with live counts (enrollments per template; seat-occupying bookings per session, same status set as `checkSessionCapacityLocked`).
  - `GET /api/classes/summary` → per child of the caller: `{ familyMemberId, name, membership: { tierName, status, classAllotmentRemaining } | null, enrollment: { id, templateId, templateName, weekday, startTime } | null, nextSession: { sessionId, startsAt, bookingId } | null, trialUsed: boolean }` — one round-trip payload for Plan 3's dashboard cards.

- [ ] **Step 1:** implement both (org-scoped; the public one follows the existing `src/pages/api/public/` conventions — read one for the response/caching shape). Counts via grouped queries, not N+1.
- [ ] **Step 2:** `npx tsc --noEmit`; commit — `feat(classes): schedule + per-child summary read APIs`.

---

### Task 9: Seed fixtures + API test suites

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts` (Stage: class slot template fixture for the Aspire org, idempotent select-by-name → insert, mirroring Stage 13b's pattern)
- Create: `tests/api/classes/book.test.ts`, `tests/api/classes/enrollments.test.ts`, `tests/api/classes/schedule.test.ts`, `tests/api/classes/cron-materialize.test.ts`
- Test commands are the deliverable

**Interfaces:**
- Consumes: everything above; the Plan-1 "Test Class Tier 4" fixture; parent test account + fresh `Date.now()`-suffixed children (repo convention).

- [ ] **Step 1: seed** — add "Test Class Slot" template (Aspire org, weekday matching a near-future day, capacity 12) — idempotent.
- [ ] **Step 2: API suites** (each self-seeds children/memberships like `memberships-child-subscribe.test.ts` does; direct DB inserts for membership rows):
  - book: member books free while allotment lasts; 5th booking in month → 402 with `memberRateCents`; trial once → second trial 409; sibling can book the same session (participant index); waiver_required when no waiver on file and none supplied; cancel ≥24h frees the credit (next book succeeds), cancel inside 24h → 409.
  - enrollments: create → capacity fills → `template_full`; no membership → error; change-slot atomically moves.
  - cron: POST with CRON_SECRET materializes sessions idempotently (run twice → same count second time 0) and auto-books an enrolled child; exhausted child skipped.
  - schedule/summary: shapes + counts as specced; anonymous schedule works, summary 401s anonymously.
- [ ] **Step 3:** run all with the dev server up (`CRON_SECRET=… TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/classes/`) → green; `npm run db:seed:e2e` still idempotent.
- [ ] **Step 4:** commit — `test(classes): engine API suites + slot fixture`.

---

### Task 10: Verification pass — staging cron dry-run + pre-push + PR

- [ ] **Step 1:** dev server on staging; create a real template via SQL-seed or (if Task 9's fixture suffices) reuse it; enroll a member child; invoke the cron endpoint; verify sessions + auto-bookings + `classAllotmentRemaining` decremented via `/api/classes/summary`.
- [ ] **Step 2:** full checklist: `npm run db:seed:e2e`; targeted API suites green; `npm run build`; `npx tsc --noEmit`; grep `tests/e2e/` for surfaces touched (none should be — engine only; confirm).
- [ ] **Step 3:** push `youth-classes-engine`, open PR titled `feat: youth classes engine — slot templates, enrollments, auto-booking cron, child bookings (Plan 2)`, body summarizing + noting Plan 3 (UX) follows. Wait for CI green.
