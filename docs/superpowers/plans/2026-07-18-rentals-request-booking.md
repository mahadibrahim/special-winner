# Request-based Field Rentals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace instant online field-rental booking with a request → admin-approve → pay-link flow, on both brands.

**Architecture:** A new `requested` status holds the slot (via the conflict check + scheduling ledger) but is not swept by the 10-minute payment-expiry cron. The public `POST /api/rentals/bookings` creates a `requested` row instead of a Stripe hold. Admins approve (→ `pending_payment` + 24h pay-link, or `confirmed` for $0) or decline (→ `cancelled`) from the rental detail view. The signed-in renter pays from `/dashboard/bookings`, which mints a fresh Checkout Session; the existing webhook confirms it unchanged. A separate cron sweep releases un-actioned requests after a configurable hold window.

**Tech Stack:** Astro 5 (SSR), React 19 islands, Drizzle ORM + PostgreSQL, Stripe Checkout + webhooks, Vitest (API/unit), Playwright (E2E).

## Global Constraints

- **Scope:** both brands — SoccerOne `/soccerone/rent` (`FieldCalendar.tsx`) and Aspire `/rentals` (`RentalBooking.tsx`). They share `POST /api/rentals/bookings`.
- **Minimum lead time:** 48 hours (rate-card `minLeadTimeHours`, default 48). Requests for slots sooner are rejected — "contact the venue".
- **Request hold window:** rate-card `requestHoldHours`, default 24. Un-approved requests auto-cancel after this.
- **Pay window after approval:** 24 hours (`paymentExpiresAt = now + 24h`), reusing the existing `expire-pending-rentals` cron.
- **$0/comp requests:** still go through a request; approval confirms directly (no pay-link).
- **Migrations:** schema touches require `npm run db:generate`; enum `ADD VALUE` written with `IF NOT EXISTS` (0023/0024 idempotent pattern). Never `db:push` to remote.
- **Multi-tenant:** admin endpoints keep `requireOrgAdminAccess` + `callerCanActOnVenue`. `findFirst`/`.limit(1)` needs deterministic filters (already keyed by id here).
- **Timestamps:** UTC in DB. `E2E_TEST_ENDPOINTS=yes` skips the far-window and near-lead-time guards (same as today's window check).
- **Pre-push:** `npm run db:generate` (commit migration) → `npm run db:seed:e2e` → API tests → `npm run build` → `npx tsc --noEmit` (zero errors).

---

## File Structure

**Schema / migrations**
- Modify `src/lib/db/schema/field-rentals.ts` — `requested` enum value, `requestExpiresAt` column, rate-card `requestHoldHours` + `minLeadTimeHours`, index WHERE.
- Create `src/lib/db/migrations/NNNN_*.sql` — generated.

**Lib (rental lifecycle)**
- Modify `src/lib/rentals/booking.ts` — `createRentalRequest()`.
- Modify `src/lib/rentals/conflicts.ts` — block `requested` rows.
- Modify `src/lib/scheduling/sync.ts` — ledger block for `requested`.
- Modify `src/lib/rentals/expire.ts` — `expireStaleRentalRequests()`.
- Modify `src/pages/api/cron/expire-pending-rentals.ts` — call both sweeps.

**Messaging**
- Create `src/lib/rentals/messages/request-lifecycle.ts` — renderers for received / approved / declined / admin-new.
- Create `src/lib/email/templates/field-rental-request.tsx` — email bodies.
- Modify `src/lib/rentals/messages/dispatch.ts` — 4 new dispatch fns.

**API**
- Modify `src/pages/api/rentals/bookings/index.ts` — POST → request mode.
- Modify `src/pages/api/admin/rentals/[id].ts` — approve/decline actions.
- Create `src/pages/api/rentals/bookings/[id]/pay.ts` — mint Checkout for an approved rental.

**UI**
- Modify `src/components/admin/rentals/RentalDetail.tsx` — approve/decline buttons + `requested` status.
- Modify `src/components/admin/rentals/RentalsList.tsx` — `requested` filter/badge.
- Modify `src/components/dashboard/MyFieldRentals.tsx` — "Pay now" button.
- Modify `src/components/soccerone/FieldCalendar.tsx` — request flow + copy + client lead-time guard.
- Modify `src/components/rentals/RentalBooking.tsx` — request flow + copy.
- Modify `src/pages/soccerone/rent.astro` — copy.

**Tests**
- Create `tests/api/rentals/request.test.ts`, `tests/api/rentals/approve-decline.test.ts`, `tests/api/rentals/pay.test.ts`.
- Modify `tests/api/rentals/bookings.test.ts`, `tests/api/rentals/conflict.test.ts`, `tests/api/rentals/expire.test.ts`.
- Create `tests/unit/rental-request-messages.test.ts`.
- Modify `tests/e2e/field-rentals.spec.ts`.

---

## Task 1: Schema — `requested` status, request-expiry column, rate-card policy

**Files:**
- Modify: `src/lib/db/schema/field-rentals.ts`
- Create: `src/lib/db/migrations/NNNN_*.sql` (generated)

**Interfaces:**
- Produces: enum value `"requested"` on `field_rental_status`; column `fieldRentals.requestExpiresAt: timestamptz | null`; `fieldRentalRateCard.requestHoldHours: number` (default 24) and `.minLeadTimeHours: number` (default 48).

- [ ] **Step 1: Add the enum value**

In `src/lib/db/schema/field-rentals.ts`, edit `fieldRentalStatusEnum`:

```ts
export const fieldRentalStatusEnum = pgEnum("field_rental_status", [
  "requested",
  "pending_payment",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);
```

- [ ] **Step 2: Add `requestExpiresAt` column**

In the `fieldRentals` table definition, add directly after the `paymentExpiresAt` line:

```ts
    paymentExpiresAt: timestamp("payment_expires_at", { withTimezone: true }),
    // When a `requested` row auto-releases if no admin approves/declines it.
    // Distinct from paymentExpiresAt so the request-hold sweep and the
    // payment-hold sweep never key off the same column.
    requestExpiresAt: timestamp("request_expires_at", { withTimezone: true }),
```

- [ ] **Step 3: Include `requested` in the active-field partial index**

Edit the `field_rentals_active_field_idx` index:

```ts
    index("field_rentals_active_field_idx")
      .on(table.venueId, table.fieldNumber, table.startsAt)
      .where(sql`status IN ('requested', 'pending_payment', 'confirmed')`),
```

- [ ] **Step 4: Add rate-card policy fields**

In `fieldRentalRateCard`, add after `checkInWindowMinutes`:

```ts
  checkInWindowMinutes: integer("check_in_window_minutes").notNull().default(60),
  // Hours a `requested` (un-approved) rental holds its slot before the sweep
  // auto-cancels it and frees the field.
  requestHoldHours: integer("request_hold_hours").notNull().default(24),
  // Minimum hours in advance a slot may be requested online. Sooner than this
  // → "contact the venue". Gives runway for approve + 24h pay window.
  minLeadTimeHours: integer("min_lead_time_hours").notNull().default(48),
```

- [ ] **Step 5: Generate the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/NNNN_*.sql` file is created and `tsc` still resolves the schema.

- [ ] **Step 6: Make the enum add idempotent**

Open the generated SQL. Ensure the enum line reads with `IF NOT EXISTS` (edit if drizzle emitted it without):

```sql
ALTER TYPE "public"."field_rental_status" ADD VALUE IF NOT EXISTS 'requested' BEFORE 'pending_payment';
```

The `ADD COLUMN` and rate-card `ADD COLUMN` lines drizzle generates are already safe (fresh columns). Confirm they use `ADD COLUMN "request_expires_at"`, `"request_hold_hours"`, `"min_lead_time_hours"`.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema/field-rentals.ts src/lib/db/migrations
git commit -m "feat(rentals): requested status + request-hold/lead-time schema"
```

---

## Task 2: Request lifecycle lib — `createRentalRequest` + conflict blocking + ledger

**Files:**
- Modify: `src/lib/rentals/booking.ts`
- Modify: `src/lib/rentals/conflicts.ts`
- Modify: `src/lib/scheduling/sync.ts`
- Test: `tests/api/rentals/request.test.ts`

**Interfaces:**
- Consumes: `assertNoRentalConflict` (conflicts.ts), `withLedgerSync` (booking.ts, existing), `RentalHoldResult` (booking.ts).
- Produces: `createRentalRequest(input: RentalRequestInput): Promise<RentalHoldResult>` — inserts a `requested` row, sets `requestExpiresAt`, syncs the ledger. Returns `{ ok: false, error }` on slot conflict.

- [ ] **Step 1: Block `requested` rows in the conflict check**

In `src/lib/rentals/conflicts.ts`, the rental-overlap `or(...)` currently covers `confirmed` and fresh `pending_payment`. Add a `requested` branch:

```ts
        or(
          eq(fieldRentals.status, "confirmed"),
          and(
            eq(fieldRentals.status, "pending_payment"),
            or(
              isNull(fieldRentals.paymentExpiresAt),
              gte(fieldRentals.paymentExpiresAt, now),
            ),
          ),
          and(
            eq(fieldRentals.status, "requested"),
            or(
              isNull(fieldRentals.requestExpiresAt),
              gte(fieldRentals.requestExpiresAt, now),
            ),
          ),
        ),
```

- [ ] **Step 2: Give `requested` rows a ledger block**

In `src/lib/scheduling/sync.ts`, the rental sync selects the row and keeps a block only for active statuses. Add `requestExpiresAt` to the select, add `requested` to the active set, and set the block expiry from the right column.

Find the `syncRentalBlock` select (currently selecting `status: fieldRentals.status`) and add:

```ts
      status: fieldRentals.status,
      requestExpiresAt: fieldRentals.requestExpiresAt,
```

Change the guard:

```ts
  if (!r || !["pending_payment", "confirmed", "requested"].includes(r.status)) {
    await removeSourceBlock("rental", rentalId);
    return;
  }
```

Change the `upsertSourceBlock` `expiresAt`:

```ts
    expiresAt:
      r.status === "pending_payment"
        ? r.paymentExpiresAt
        : r.status === "requested"
          ? r.requestExpiresAt
          : null,
```

- [ ] **Step 3: Add `createRentalRequest` to booking.ts**

In `src/lib/rentals/booking.ts`, add after `createConfirmedRentalNonStripe`:

```ts
export interface RentalRequestInput {
  organizationId: string;
  venueId: string;
  fieldNumber: number;
  startsAt: Date;
  endsAt: Date;
  amountDueCents: number;
  requestHoldHours: number;
  renterUserId: string | null;
  renterName: string;
  renterEmail: string | null;
  renterPhone: string | null;
  partySize: number;
  purpose: string | null;
  notes: string | null;
  createdByUserId: string | null;
  waiverSigned: boolean;
  waiverSignedBy: string | null;
  brand?: BrandId;
}

/**
 * Insert a `requested` field rental after a conflict check. Holds the slot
 * (conflict check + ledger see `requested`) but is NOT swept by the
 * payment-expiry cron — a separate sweep releases it after requestHoldHours.
 * No Stripe object: payment happens only after an admin approves.
 */
export async function createRentalRequest(
  input: RentalRequestInput,
): Promise<RentalHoldResult> {
  const db = getDb();
  const created = await db.transaction(async (tx) => {
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
        status: "requested",
        source: "online_booking",
        // Free requests confirm as comp on approval; paid as card_online.
        paymentMethod: input.amountDueCents === 0 ? "comp" : "card_online",
        amountDueCents: input.amountDueCents,
        amountPaidCents: 0,
        paymentStatus: "unpaid",
        requestExpiresAt: new Date(
          Date.now() + input.requestHoldHours * 60 * 60_000,
        ),
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
        brand: input.brand ?? "aspire",
      })
      .returning();
    return { ok: true as const, rental };
  });
  return withLedgerSync(created);
}
```

- [ ] **Step 4: Write the failing test**

Create `tests/api/rentals/request.test.ts`:

```ts
/**
 * Integration: createRentalRequest inserts a `requested` row and holds the
 * slot — a second request for the same field/time conflicts. Runs against
 * the CI DB directly (no HTTP), like confirmation-dispatch.test.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { createRentalRequest } from "@/lib/rentals/booking";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

let orgId: string;

// Distinct far-future day per run so concurrent CI runs never collide.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2036, 0, 1) + RUN_DAY_OFFSET * 86_400_000;
const FIELD = 7;

function slot(hour: number, hours: number) {
  const startsAt = new Date(RUN_BASE_UTC + hour * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + hours * 3_600_000);
  return { startsAt, endsAt };
}

function input(over: Record<string, unknown> = {}) {
  return {
    organizationId: orgId,
    venueId: E2E_RENTAL_VENUE_ID,
    fieldNumber: FIELD,
    ...slot(10, 1),
    amountDueCents: 5000,
    requestHoldHours: 24,
    renterUserId: null,
    renterName: "Request Tester",
    renterEmail: "req@test.aspiresports.com",
    renterPhone: null,
    partySize: 4,
    purpose: "practice",
    notes: null,
    createdByUserId: null,
    waiverSigned: true,
    waiverSignedBy: "Request Tester",
    ...over,
  } as Parameters<typeof createRentalRequest>[0];
}

beforeAll(async () => {
  const [v] = await getDb()
    .select({ organizationId: venues.organizationId })
    .from(venues)
    .where(eq(venues.id, E2E_RENTAL_VENUE_ID))
    .limit(1);
  if (!v) throw new Error("seed rental venue missing — run db:seed:e2e");
  orgId = v.organizationId;
});

describe("createRentalRequest", () => {
  it("creates a requested row that holds the slot", async () => {
    const first = await createRentalRequest(input());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.rental.status).toBe("requested");
    expect(first.rental.requestExpiresAt).not.toBeNull();

    // Second request, same field + overlapping time → conflict.
    const second = await createRentalRequest(input({ ...slot(10, 1) }));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Start the dev server against staging (`npm run dev:bws`), then:

Run: `TEST_BASE_URL=http://localhost:4321 npm run test:api -- rentals/request`
Expected: PASS (requested row created; second request conflicts).

- [ ] **Step 6: Commit**

```bash
git add src/lib/rentals/booking.ts src/lib/rentals/conflicts.ts src/lib/scheduling/sync.ts tests/api/rentals/request.test.ts
git commit -m "feat(rentals): createRentalRequest holds slot via conflict check + ledger"
```

---

## Task 3: Stale-request expiry sweep

**Files:**
- Modify: `src/lib/rentals/expire.ts`
- Modify: `src/pages/api/cron/expire-pending-rentals.ts`
- Test: `tests/api/rentals/expire.test.ts`

**Interfaces:**
- Produces: `expireStaleRentalRequests(): Promise<{ expired: number }>` — cancels `requested` rows past `requestExpiresAt`, frees the ledger.

- [ ] **Step 1: Add the sweep**

In `src/lib/rentals/expire.ts`, add below `expirePendingRentals`:

```ts
/**
 * Sweep `requested` rows whose `request_expires_at` has passed — an admin
 * never approved/declined them — and cancel them, freeing the field. Mirrors
 * expirePendingRentals but keyed on requestExpiresAt / status='requested'.
 */
export async function expireStaleRentalRequests(): Promise<{ expired: number }> {
  const now = new Date();
  const rows = await getDb()
    .update(fieldRentals)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: "venue_unavailable",
      requestExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(fieldRentals.status, "requested"),
        isNotNull(fieldRentals.requestExpiresAt),
        lt(fieldRentals.requestExpiresAt, now),
      ),
    )
    .returning({ id: fieldRentals.id });

  for (const row of rows) {
    await removeSourceBlock("rental", row.id);
  }
  return { expired: rows.length };
}
```

(The imports `and, eq, lt, isNotNull`, `getDb`, `fieldRentals`, `removeSourceBlock` are already present from `expirePendingRentals`.)

- [ ] **Step 2: Call it from the cron**

In `src/pages/api/cron/expire-pending-rentals.ts`, import and run both sweeps. Change the import:

```ts
import {
  expirePendingRentals,
  expireStaleRentalRequests,
} from "@/lib/rentals/expire";
```

Replace the `const result = await expirePendingRentals();` block:

```ts
    const startedAt = Date.now();
    const holds = await expirePendingRentals();
    const requests = await expireStaleRentalRequests();
    const result = {
      expired: holds.expired,
      expiredRequests: requests.expired,
    };
    const elapsedMs = Date.now() - startedAt;
```

- [ ] **Step 3: Write the failing test**

Add to `tests/api/rentals/expire.test.ts` a case that inserts a `requested` row with a past `requestExpiresAt` and asserts the sweep cancels it. Match the existing file's import/context pattern; append:

```ts
import { expireStaleRentalRequests } from "@/lib/rentals/expire";

describe("expireStaleRentalRequests", () => {
  it("cancels a requested row past its requestExpiresAt and frees it", async () => {
    // Insert directly using the same org/venue helper the file already sets up.
    const [row] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: orgId,
        venueId,
        fieldNumber: 9,
        startsAt: new Date(Date.UTC(2037, 0, 1, 12)),
        endsAt: new Date(Date.UTC(2037, 0, 1, 13)),
        status: "requested",
        source: "online_booking",
        paymentMethod: "card_online",
        amountDueCents: 5000,
        renterName: "Stale Request",
        requestExpiresAt: new Date(Date.now() - 60_000), // already lapsed
      })
      .returning();

    const { expired } = await expireStaleRentalRequests();
    expect(expired).toBeGreaterThanOrEqual(1);

    const [after] = await getDb()
      .select({ status: fieldRentals.status })
      .from(fieldRentals)
      .where(eq(fieldRentals.id, row.id))
      .limit(1);
    expect(after.status).toBe("cancelled");
  });
});
```

If `expire.test.ts` does not already expose `orgId`/`venueId`, mirror the setup in `tests/api/rentals/request.test.ts` (Task 2, Step 4) to derive `orgId` from `E2E_RENTAL_VENUE_ID` and reuse that venue.

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_BASE_URL=http://localhost:4321 npm run test:api -- rentals/expire`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/expire.ts src/pages/api/cron/expire-pending-rentals.ts tests/api/rentals/expire.test.ts
git commit -m "feat(rentals): sweep expires stale un-approved requests"
```

---

## Task 4: Request-lifecycle messaging

**Files:**
- Create: `src/lib/email/templates/field-rental-request.tsx`
- Create: `src/lib/rentals/messages/request-lifecycle.ts`
- Modify: `src/lib/rentals/messages/dispatch.ts`
- Test: `tests/unit/rental-request-messages.test.ts`

**Interfaces:**
- Consumes: `renderEmail` (`@/lib/email/render`), `formatRentalWindow` (`./format`), `normalizeBrand`, `dollars` (`@/lib/dropin/messages/types`), `BrandId`.
- Produces:
  - `renderRentalRequestMessage(kind, ctx): Promise<RentalMessageVariants>` where `kind: "received" | "approved" | "declined"` and `ctx: RentalRequestMessageContext`.
  - `dispatchRentalRequestReceived(rentalId)`, `dispatchRentalRequestApproved(rentalId)`, `dispatchRentalRequestDeclined(rentalId)`, `dispatchNewRentalRequestToAdmin(rentalId)` — each `Promise<RentalDispatchResult>`.

- [ ] **Step 1: Email template**

Create `src/lib/email/templates/field-rental-request.tsx` (mirror `field-rental-confirmation.tsx` structure — read it first for the exact brand-wrapper imports):

```tsx
import { BrandEmailLayout } from "./brand-email-layout";
import type { BrandId } from "@/lib/branding/themes";

interface Props {
  recipientName: string;
  venueName: string;
  whenLabel: string;
  kind: "received" | "approved" | "declined";
  amountLabel: string | null;
  payUrl: string | null;
  brand: BrandId;
}

export function FieldRentalRequestEmail({
  recipientName,
  venueName,
  whenLabel,
  kind,
  amountLabel,
  payUrl,
  brand,
}: Props) {
  const heading =
    kind === "received"
      ? "We got your request"
      : kind === "approved"
        ? "Your rental is approved — reserve it"
        : "Your rental request";
  const body =
    kind === "received"
      ? `Thanks, ${recipientName}. We received your request for ${venueName} on ${whenLabel}. Our team will review it and email you a link to pay once it's approved.`
      : kind === "approved"
        ? `Good news, ${recipientName} — your request for ${venueName} on ${whenLabel} is approved${amountLabel ? ` (${amountLabel})` : ""}. Pay within 24 hours to lock in the slot.`
        : `Sorry, ${recipientName} — we couldn't accommodate your request for ${venueName} on ${whenLabel}. Please pick another time, and reach out if we can help.`;

  return (
    <BrandEmailLayout brand={brand} previewText={heading}>
      <h1>{heading}</h1>
      <p>{body}</p>
      {kind === "approved" && payUrl ? (
        <p>
          <a href={payUrl}>Pay &amp; confirm your rental</a>
        </p>
      ) : null}
    </BrandEmailLayout>
  );
}
```

> If `field-rental-confirmation.tsx` uses a different layout wrapper/prop name, match it exactly instead of `BrandEmailLayout`/`previewText`.

- [ ] **Step 2: Renderer**

Create `src/lib/rentals/messages/request-lifecycle.ts`:

```ts
/**
 * Renders the request-lifecycle notifications (received / approved / declined)
 * for the renter. Structure mirrors rental-confirmation.ts.
 */
import { renderEmail } from "@/lib/email/render";
import { FieldRentalRequestEmail } from "@/lib/email/templates/field-rental-request";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { dollars } from "@/lib/dropin/messages/types";
import { formatRentalWindow } from "./format";
import type { BrandId } from "@/lib/branding/themes";
import type { RentalMessageVariants } from "./rental-confirmation";

export type RentalRequestKind = "received" | "approved" | "declined";

export interface RentalRequestMessageContext {
  recipientName: string;
  venueName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string | null;
  amountDueCents: number;
  payUrl: string | null;
  brand?: BrandId;
}

export async function renderRentalRequestMessage(
  kind: RentalRequestKind,
  ctx: RentalRequestMessageContext,
): Promise<RentalMessageVariants> {
  const brand = normalizeBrand(ctx.brand);
  const brandLabel = brand === "soccerone" ? "SoccerOne" : "Aspire";
  const whenLabel = formatRentalWindow(ctx.startsAt, ctx.endsAt, ctx.timezone);
  const amountLabel = ctx.amountDueCents > 0 ? `${dollars(ctx.amountDueCents)}` : null;

  const subject =
    kind === "received"
      ? `Request received — ${ctx.venueName} on ${whenLabel}`
      : kind === "approved"
        ? `Approved — reserve ${ctx.venueName} on ${whenLabel}`
        : `Update on your request — ${ctx.venueName}`;

  const { html, text } = await renderEmail(
    FieldRentalRequestEmail({
      recipientName: ctx.recipientName,
      venueName: ctx.venueName,
      whenLabel,
      kind,
      amountLabel,
      payUrl: ctx.payUrl,
      brand,
    }),
  );

  const sms =
    kind === "received"
      ? `[${brandLabel}] Got your request: ${ctx.venueName}, ${whenLabel}. We'll email a pay link once it's approved.`
      : kind === "approved"
        ? `[${brandLabel}] Approved: ${ctx.venueName}, ${whenLabel}. Pay within 24h to lock it in${ctx.payUrl ? `: ${ctx.payUrl}` : ""}.`
        : `[${brandLabel}] We couldn't fit your request: ${ctx.venueName}, ${whenLabel}. Try another time.`;

  return { email: { subject, html, text }, sms: { body: sms } };
}
```

- [ ] **Step 3: Dispatchers**

In `src/lib/rentals/messages/dispatch.ts`, add four functions. They reuse the same row-load + email-preferred/SMS-fallback pattern as `dispatchRentalConfirmation`. Add near the bottom:

```ts
import { renderRentalRequestMessage } from "./request-lifecycle";
import { getAdminNotifyEmail } from "@/lib/organization/notify"; // see Step 3a

const APP_URL = process.env.PUBLIC_APP_URL ?? "https://www.aspiresports.com";

async function loadRentalForMessage(rentalId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: fieldRentals.id,
      organizationId: fieldRentals.organizationId,
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      amountDueCents: fieldRentals.amountDueCents,
      renterName: fieldRentals.renterName,
      renterEmail: fieldRentals.renterEmail,
      renterPhone: fieldRentals.renterPhone,
      brand: fieldRentals.brand,
      venueName: venues.name,
      orgTimezone: organizations.timezone,
    })
    .from(fieldRentals)
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .leftJoin(organizations, eq(organizations.id, fieldRentals.organizationId))
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  return row ?? null;
}

async function dispatchRequestLifecycle(
  rentalId: string,
  kind: "received" | "approved" | "declined",
): Promise<RentalDispatchResult> {
  const row = await loadRentalForMessage(rentalId);
  if (!row) return { ok: false, reason: "rental_not_found" };
  const hasEmail = Boolean(row.renterEmail);
  const hasPhone = Boolean(row.renterPhone);
  if (!hasEmail && !hasPhone) return { ok: false, reason: "no_contact_info" };

  const brand = normalizeBrand(row.brand);
  const variants = await renderRentalRequestMessage(kind, {
    recipientName: row.renterName,
    venueName: row.venueName ?? "the facility",
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.orgTimezone ?? null,
    amountDueCents: row.amountDueCents,
    payUrl: kind === "approved" ? `${APP_URL}/dashboard/bookings` : null,
    brand,
  });

  if (hasEmail && isEmailConfigured()) {
    const r = await sendEmail({
      to: row.renterEmail!,
      subject: variants.email.subject,
      html: variants.email.html,
      text: variants.email.text,
      from: fromForBrand(brand),
    });
    if (r.success) return { ok: true, channel: "email" };
  }
  if (hasPhone) {
    const normalized = normalizeUsPhone(row.renterPhone!);
    if (normalized) {
      const r = await sendSms({ to: normalized, body: variants.sms.body, organizationId: row.organizationId });
      if (r.ok) return { ok: true, channel: "sms" };
      return { ok: false, reason: r.reason, error: r.error };
    }
  }
  return { ok: false, reason: "no_channel_available" };
}

export const dispatchRentalRequestReceived = (id: string) =>
  dispatchRequestLifecycle(id, "received");
export const dispatchRentalRequestApproved = (id: string) =>
  dispatchRequestLifecycle(id, "approved");
export const dispatchRentalRequestDeclined = (id: string) =>
  dispatchRequestLifecycle(id, "declined");

/** Notify the org/venue that a new request needs review. */
export async function dispatchNewRentalRequestToAdmin(
  rentalId: string,
): Promise<RentalDispatchResult> {
  const row = await loadRentalForMessage(rentalId);
  if (!row) return { ok: false, reason: "rental_not_found" };
  const to = await getAdminNotifyEmail(row.organizationId);
  if (!to) return { ok: false, reason: "no_admin_email" };
  if (!isEmailConfigured()) return { ok: false, reason: "email_not_configured" };
  const brand = normalizeBrand(row.brand);
  const whenLabel = `${row.startsAt.toISOString()} – ${row.endsAt.toISOString()}`;
  const r = await sendEmail({
    to,
    subject: `New field-rental request — ${row.venueName ?? "facility"}`,
    html: `<p>${row.renterName} requested ${row.venueName ?? "a field"} (Field ${row.fieldNumber}), ${whenLabel}.</p><p><a href="${APP_URL}/admin/rentals/${row.id}">Review the request</a></p>`,
    text: `${row.renterName} requested ${row.venueName ?? "a field"} (Field ${row.fieldNumber}), ${whenLabel}. Review: ${APP_URL}/admin/rentals/${row.id}`,
    from: fromForBrand(brand),
  });
  return r.success ? { ok: true, channel: "email" } : { ok: false, reason: "email_failed", error: r.error };
}
```

- [ ] **Step 3a: Admin-notify email resolver**

Check whether an org "notify" email helper already exists (grep `getAdminNotifyEmail`, `notifyEmail`, `ops` email). If none, create `src/lib/organization/notify.ts`:

```ts
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema/organizations";

/**
 * Email address that should receive operational notifications for an org.
 * Falls back to the org contact email; null if none is set.
 */
export async function getAdminNotifyEmail(orgId: string): Promise<string | null> {
  const [org] = await getDb()
    .select({ email: organizations.contactEmail })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return org?.email ?? null;
}
```

> Confirm the actual column name on `organizations` (grep the schema for `Email`). Use whatever contact/notification email column exists; if there is a dedicated ops-ping recipient, prefer it.

- [ ] **Step 4: Write the failing renderer test**

Create `tests/unit/rental-request-messages.test.ts` (pure — no DB/server):

```ts
import { describe, it, expect } from "vitest";
import { renderRentalRequestMessage } from "@/lib/rentals/messages/request-lifecycle";

const base = {
  recipientName: "Jordan",
  venueName: "Worthington",
  startsAt: new Date("2026-09-01T22:00:00.000Z"),
  endsAt: new Date("2026-09-01T23:00:00.000Z"),
  timezone: "America/New_York",
  amountDueCents: 5000,
  payUrl: "https://example.com/dashboard/bookings",
  brand: "soccerone" as const,
};

describe("renderRentalRequestMessage", () => {
  it("received: no pay link, mentions review", async () => {
    const m = await renderRentalRequestMessage("received", { ...base, payUrl: null });
    expect(m.email.subject).toMatch(/request received/i);
    expect(m.sms.body).toMatch(/SoccerOne/);
    expect(m.email.html).not.toMatch(/Pay &amp; confirm/);
  });

  it("approved: includes pay link + 24h", async () => {
    const m = await renderRentalRequestMessage("approved", base);
    expect(m.email.subject).toMatch(/approved/i);
    expect(m.email.html).toMatch(/dashboard\/bookings/);
    expect(m.sms.body).toMatch(/24h/);
  });

  it("declined: no pay link", async () => {
    const m = await renderRentalRequestMessage("declined", { ...base, payUrl: null });
    expect(m.email.subject).toMatch(/update/i);
    expect(m.sms.body).toMatch(/couldn't/i);
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:api -- rental-request-messages` (unit tests run under the same Vitest; adjust to the repo's unit runner if separate — `npx vitest run tests/unit/rental-request-messages.test.ts`).
Expected: PASS.

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/lib/email/templates/field-rental-request.tsx src/lib/rentals/messages/request-lifecycle.ts src/lib/rentals/messages/dispatch.ts src/lib/organization/notify.ts tests/unit/rental-request-messages.test.ts
git commit -m "feat(rentals): request lifecycle + admin-notify messaging"
```

---

## Task 5: Public POST endpoint → request mode

**Files:**
- Modify: `src/pages/api/rentals/bookings/index.ts`
- Test: `tests/api/rentals/bookings.test.ts`, `tests/api/rentals/conflict.test.ts`

**Interfaces:**
- Consumes: `createRentalRequest` (Task 2), `dispatchRentalRequestReceived` + `dispatchNewRentalRequestToAdmin` (Task 4), rate-card `requestHoldHours` + `minLeadTimeHours` (Task 1).
- Produces: `POST /api/rentals/bookings` → `200 { requested: true, rentalId }` | `409 { error }` (conflict) | `422 { error }` (validation / lead-time / window).

- [ ] **Step 1: Swap imports**

In `src/pages/api/rentals/bookings/index.ts`, remove the now-unused Stripe/checkout imports (`stripe`, `collectAdAttribution`) and the `createRentalHold` / `createConfirmedRentalNonStripe` imports; add:

```ts
import { createRentalRequest } from "@/lib/rentals/booking";
import {
  dispatchRentalRequestReceived,
  dispatchNewRentalRequestToAdmin,
} from "@/lib/rentals/messages/dispatch";
```

(Keep `getActiveMembershipForOrg`, `applyMemberRentalDiscount`, `resolveBookingWindowDays`, `bookingWindowEndUtc`, `brandFromHost`, pricing imports, `validateRentalBookingRequest`.)

- [ ] **Step 2: Add the min-lead-time guard**

Inside the `if (process.env.E2E_TEST_ENDPOINTS !== "yes")` block in `POST`, after the existing far-window check, add:

```ts
    const minLeadHours = rateCard.minLeadTimeHours;
    if (startsAt.getTime() < Date.now() + minLeadHours * 60 * 60_000) {
      return json(
        {
          error: `Requests must be at least ${minLeadHours} hours in advance. To book sooner, contact the venue directly.`,
        },
        422,
      );
    }
```

> `rateCard` is resolved a few lines below the window block today. Move the `rateCard` lookup ABOVE this guard (it's the same block that ensures the rate card exists), so `minLeadTimeHours` is available here. The duration min/max checks stay where they are.

- [ ] **Step 3: Replace the hold+Stripe body with a request**

Delete everything from `if (amountDueCents === 0) { ... }` through the end of the Stripe `try/catch` (the entire confirmed-comp + `createRentalHold` + checkout-session logic). Replace with:

```ts
  const bookingBrand = brandFromHost(request.headers.get("host") ?? "");

  const req = await createRentalRequest({
    organizationId: orgId,
    venueId,
    fieldNumber,
    startsAt,
    endsAt,
    amountDueCents,
    requestHoldHours: rateCard.requestHoldHours,
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
    brand: bookingBrand,
  });
  if (!req.ok) return json({ error: req.error }, 409);

  // Fire-and-forget notifications — never fail the request over a send error.
  await dispatchRentalRequestReceived(req.rental.id).catch((e) =>
    console.error("[rentals] request-received dispatch failed", e),
  );
  await dispatchNewRentalRequestToAdmin(req.rental.id).catch((e) =>
    console.error("[rentals] admin new-request dispatch failed", e),
  );

  return json({ requested: true, rentalId: req.rental.id }, 200);
```

Keep the pricing block that computes `baseAmountDueCents` → `amountDueCents` (member discount is baked into `amountDueCents`, which is stored on the row and read back by the pay endpoint). `memberDiscountMembershipId` is no longer referenced in this file (Stripe metadata moved to the pay endpoint, which prices from the stored `amountDueCents`) — delete the `memberDiscountMembershipId` variable to avoid an unused-variable lint. The minor analytics consequence (`used_membership` no longer set on the rental purchase event) is acceptable and noted as a follow-up in the spec.

- [ ] **Step 4: Update `bookings.test.ts`**

In `tests/api/rentals/bookings.test.ts`, replace the "returns 200 with paymentRequired and checkoutUrl" test with a request-mode assertion, and add a lead-time note. Because the API test server runs with `E2E_TEST_ENDPOINTS=yes`, the lead-time guard is skipped there (far-future slots), so the happy path returns `requested`:

```ts
  it("returns 200 with requested:true for a valid booking request", async () => {
    const cookie = await getParentCookie();
    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(validBody({ fieldNumber: 1, ...slot(14, 2) })),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.requested).toBe(true);
    expect(typeof body.rentalId).toBe("string");
    expect(body).not.toHaveProperty("checkoutUrl");
  });

  it("holds the slot — a second request for the same slot conflicts", async () => {
    const cookie = await getParentCookie();
    const s = slot(16, 1);
    const first = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(validBody({ fieldNumber: 1, ...s })),
    });
    expect(first.status).toBe(200);
    const second = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(validBody({ fieldNumber: 1, ...s })),
    });
    expect(second.status).toBe(409);
  });
```

- [ ] **Step 5: Update `conflict.test.ts`**

In `tests/api/rentals/conflict.test.ts`, the "accepts a non-overlapping booking … 200" test asserts `body` has `paymentRequired`. Change that assertion to the request shape:

```ts
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("requested", true);
```

Remove the now-irrelevant `if (res.status === 500 && body?.error === "Stripe not configured")` short-circuit in that test (request mode makes no Stripe call).

- [ ] **Step 6: Run tests**

Run: `TEST_BASE_URL=http://localhost:4321 E2E_TEST_ENDPOINTS=yes npm run test:api -- rentals/bookings rentals/conflict`
Expected: PASS (requested shape; slot-hold conflict 409).

- [ ] **Step 7: Commit**

```bash
git add src/pages/api/rentals/bookings/index.ts tests/api/rentals/bookings.test.ts tests/api/rentals/conflict.test.ts
git commit -m "feat(rentals): public booking POST creates a request, not a Stripe hold"
```

---

## Task 6: Pay endpoint + dashboard "Pay now"

**Files:**
- Create: `src/pages/api/rentals/bookings/[id]/pay.ts`
- Modify: `src/components/dashboard/MyFieldRentals.tsx`
- Test: `tests/api/rentals/pay.test.ts`

**Interfaces:**
- Produces: `POST /api/rentals/bookings/:id/pay` → `200 { checkoutUrl }` for a renter-owned `pending_payment` rental; `403`/`404`/`422` otherwise.

- [ ] **Step 1: Write the pay endpoint**

Create `src/pages/api/rentals/bookings/[id]/pay.ts` (Checkout minting mirrors the deleted block from `bookings/index.ts`):

```ts
/**
 * POST /api/rentals/bookings/:id/pay
 *
 * Mints a fresh Stripe Checkout Session for an APPROVED rental
 * (status `pending_payment`) owned by the signed-in renter. Minting on
 * demand (rather than at approval time) avoids Stripe-session-expiry — the
 * approval email just links here. The existing checkout.session.completed
 * webhook flips the row to `confirmed`.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { stripe } from "@/lib/stripe/client";
import { collectAdAttribution } from "@/lib/analytics/parse-cookies";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, locals, url, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const rentalId = params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  const db = getDb();
  const [row] = await db
    .select({ rental: fieldRentals, venue: venues })
    .from(fieldRentals)
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  if (!row?.rental) return json({ error: "Rental not found" }, 404);
  const { rental, venue } = row;

  if (rental.renterUserId !== locals.user.id) {
    return json({ error: "Not your rental" }, 403);
  }
  if (rental.status !== "pending_payment") {
    return json({ error: "Rental is not awaiting payment" }, 422);
  }
  if (!stripe) return json({ error: "Stripe not configured" }, 500);

  const partnerStripeAccountId = venue?.partnerStripeAccountId ?? null;
  const applicationFeePct = venue?.partnerApplicationFeePct ?? 0;
  const applicationFeeCents = partnerStripeAccountId
    ? Math.round((rental.amountDueCents * applicationFeePct) / 100)
    : undefined;
  const appUrl = url.origin;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: locals.user.email,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Field rental — ${venue?.name ?? "Facility"}`,
                description: `Field ${rental.fieldNumber}, ${rental.startsAt.toISOString()}`,
              },
              unit_amount: rental.amountDueCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: "field_rental",
          rental_id: rental.id,
          organization_id: rental.organizationId,
          base_amount_cents: String(rental.amountDueCents),
          brand: rental.brand,
          user_id: locals.user.id,
          venue_name: venue?.name ?? "",
          ...collectAdAttribution(url, request.headers.get("cookie")),
        },
        payment_intent_data: partnerStripeAccountId
          ? {
              application_fee_amount: applicationFeeCents,
              transfer_data: { destination: partnerStripeAccountId },
            }
          : undefined,
        success_url: `${appUrl}/dashboard/bookings?rental=success`,
        cancel_url: `${appUrl}/dashboard/bookings?rental=cancelled`,
      },
      { idempotencyKey: `${rental.id}:rental-pay:${rental.amountDueCents}` },
    );
    return json({ checkoutUrl: session.url }, 200);
  } catch (err) {
    console.error("[rentals] pay checkout session create failed", err);
    return json({ error: "Could not start checkout" }, 502);
  }
};
```

> Verify `venues.partnerStripeAccountId` / `partnerApplicationFeePct` field names against the schema (they're read in `bookings/index.ts` today — reuse the same names).

- [ ] **Step 2: Add "Pay now" to the dashboard**

In `src/components/dashboard/MyFieldRentals.tsx`, add a pay handler and a button for `pending_payment` rentals. Add the handler near `cancel`:

```ts
  const [paying, setPaying] = useState<Set<string>>(new Set());

  const payNow = async (rentalId: string) => {
    setPaying((p) => new Set(p).add(rentalId));
    try {
      const res = await fetch(`/api/rentals/bookings/${rentalId}/pay`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.checkoutUrl) {
        toast.error(json.error ?? "Could not start payment");
        return;
      }
      window.location.href = json.checkoutUrl as string;
    } finally {
      setPaying((p) => {
        const n = new Set(p);
        n.delete(rentalId);
        return n;
      });
    }
  };
```

In the `actionNode` for upcoming rentals, add a Pay button as the first action when awaiting payment:

```tsx
                <div className="flex flex-col items-end gap-1.5">
                  {r.status === "pending_payment" && (
                    <Button
                      size="sm"
                      disabled={paying.has(r.id)}
                      onClick={() => payNow(r.id)}
                    >
                      {paying.has(r.id) ? "Starting…" : "Pay now"}
                    </Button>
                  )}
                  {r.checkedInAt ? (
                    // …existing check-in / cancel actions unchanged…
```

- [ ] **Step 3: Write the failing test**

Create `tests/api/rentals/pay.test.ts`. It seeds a `pending_payment` rental owned by the parent test user, then hits the endpoint. Derive the parent user id the same way the suite's helpers do (grep `getParentCookie` / a `PARENT_USER_ID` seed export; if none, insert with `renterUserId` from a `/api/auth/me` call using the cookie):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { getParentCookie, apiFetch } from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

let orgId: string;
let parentUserId: string;
let cookie: string;

beforeAll(async () => {
  cookie = await getParentCookie();
  const me = await apiFetch("/api/auth/me", { method: "GET", cookie });
  parentUserId = (await me.json()).user.id;
  const [v] = await getDb()
    .select({ organizationId: venues.organizationId })
    .from(venues)
    .where(eq(venues.id, E2E_RENTAL_VENUE_ID))
    .limit(1);
  orgId = v.organizationId;
});

async function makePendingRental(userId: string | null) {
  const [r] = await getDb()
    .insert(fieldRentals)
    .values({
      organizationId: orgId,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: 8,
      startsAt: new Date(Date.UTC(2038, 0, 1, 12)),
      endsAt: new Date(Date.UTC(2038, 0, 1, 13)),
      status: "pending_payment",
      source: "online_booking",
      paymentMethod: "card_online",
      amountDueCents: 5000,
      renterUserId: userId,
      renterName: "Pay Tester",
      paymentExpiresAt: new Date(Date.now() + 24 * 3_600_000),
    })
    .returning();
  return r.id;
}

describe("POST /api/rentals/bookings/:id/pay", () => {
  it("403 when the rental is not the caller's", async () => {
    const id = await makePendingRental(null);
    const res = await apiFetch(`/api/rentals/bookings/${id}/pay`, { method: "POST", cookie });
    expect(res.status).toBe(403);
  });

  it("owner path returns a checkoutUrl (or flags Stripe unconfigured)", async () => {
    const id = await makePendingRental(parentUserId);
    const res = await apiFetch(`/api/rentals/bookings/${id}/pay`, { method: "POST", cookie });
    const body = await res.json();
    if (res.status === 500 && body.error === "Stripe not configured") return;
    expect(res.status).toBe(200);
    expect(typeof body.checkoutUrl).toBe("string");
  });

  it("422 when the rental is not pending_payment", async () => {
    const id = await makePendingRental(parentUserId);
    await getDb().update(fieldRentals).set({ status: "requested" }).where(eq(fieldRentals.id, id));
    const res = await apiFetch(`/api/rentals/bookings/${id}/pay`, { method: "POST", cookie });
    expect(res.status).toBe(422);
  });
});
```

> If `/api/auth/me`'s response shape differs, adjust `parentUserId` extraction to match (grep the endpoint). The 403 and 422 cases don't depend on Stripe.

- [ ] **Step 4: Run tests**

Run: `TEST_BASE_URL=http://localhost:4321 npm run test:api -- rentals/pay`
Expected: PASS (403 / 422 deterministic; 200 or Stripe-unconfigured skip).

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/pages/api/rentals/bookings/\[id\]/pay.ts src/components/dashboard/MyFieldRentals.tsx tests/api/rentals/pay.test.ts
git commit -m "feat(rentals): pay endpoint + dashboard Pay now for approved rentals"
```

---

## Task 7: Admin approve / decline

**Files:**
- Modify: `src/pages/api/admin/rentals/[id].ts`
- Modify: `src/components/admin/rentals/RentalDetail.tsx`
- Modify: `src/components/admin/rentals/RentalsList.tsx`
- Test: `tests/api/rentals/approve-decline.test.ts`

**Interfaces:**
- Consumes: `syncRentalBlock` (already imported), `removeSourceBlock` (add import), dispatchers from Task 4.
- Produces: `PATCH /api/admin/rentals/:id` accepts `{ approve: true }` / `{ decline: true }`. Approve → `pending_payment` (amount>0, `paymentExpiresAt=now+24h`) or `confirmed` (amount==0); decline → `cancelled`.

- [ ] **Step 1: Add the approve/decline branch**

In `src/pages/api/admin/rentals/[id].ts`, add imports:

```ts
import { removeSourceBlock } from "@/lib/scheduling/blocks";
import {
  dispatchRentalConfirmation,
  dispatchRentalRequestApproved,
  dispatchRentalRequestDeclined,
} from "@/lib/rentals/messages/dispatch";
```

(`dispatchRentalConfirmation` is already exported from `dispatch.ts`; just add it to the import list.)

Extend the `body` type with `approve?: boolean; decline?: boolean;`. Then, immediately after the ownership checks and BEFORE the `if (body.reschedule)` block, add:

```ts
  // --- approve / decline a requested rental ---
  if (body.approve === true || body.decline === true) {
    if (rental.status !== "requested") {
      return json({ error: "Only requested rentals can be approved or declined" }, 422);
    }

    if (body.decline === true) {
      const [updated] = await db
        .update(fieldRentals)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: "venue_unavailable",
          requestExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(fieldRentals.id, rentalId))
        .returning();
      await removeSourceBlock("rental", rentalId);
      await dispatchRentalRequestDeclined(rentalId).catch((e) =>
        console.error("[rentals] decline dispatch failed", e),
      );
      return json({ rental: updated }, 200);
    }

    // approve
    if (rental.amountDueCents === 0) {
      const [updated] = await db
        .update(fieldRentals)
        .set({
          status: "confirmed",
          paymentMethod: "comp",
          paymentStatus: "paid",
          requestExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(fieldRentals.id, rentalId))
        .returning();
      await syncRentalBlock(rentalId);
      await dispatchRentalConfirmation(rentalId).catch((e) =>
        console.error("[rentals] confirm dispatch failed", e),
      );
      return json({ rental: updated }, 200);
    }

    const [updated] = await db
      .update(fieldRentals)
      .set({
        status: "pending_payment",
        paymentMethod: "card_online",
        requestExpiresAt: null,
        paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        updatedAt: new Date(),
      })
      .where(eq(fieldRentals.id, rentalId))
      .returning();
    // Refresh the ledger block so its expiry tracks the 24h pay window.
    await syncRentalBlock(rentalId);
    await dispatchRentalRequestApproved(rentalId).catch((e) =>
      console.error("[rentals] approve dispatch failed", e),
    );
    return json({ rental: updated }, 200);
  }
```

- [ ] **Step 2: RentalDetail — status type + buttons**

In `src/components/admin/rentals/RentalDetail.tsx`:

Add `"requested"` to the `Rental["status"]` union and to `statusColor` (return `"bg-sky-100 text-sky-900 border-sky-200"` for `requested`). Add handlers:

```ts
  const approve = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/rentals/${rentalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Approve failed"); return; }
      toast.success("Request approved");
      await reload();
    } finally { setBusy(false); }
  };

  const decline = async () => {
    if (!data) return;
    if (!window.confirm("Decline this request? The slot will be freed.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/rentals/${rentalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decline: true }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Decline failed"); return; }
      toast.success("Request declined");
      await reload();
    } finally { setBusy(false); }
  };
```

In the header actions, when `rental.status === "requested"`, render Approve/Decline instead of the cancel button:

```tsx
        {rental.status === "requested" ? (
          <div className="flex gap-2">
            <Button disabled={busy} onClick={approve}>Approve</Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={decline}
              className="text-rose-700 border-rose-200 hover:bg-rose-50"
            >
              Decline
            </Button>
          </div>
        ) : (
          !isTerminal && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={cancelRental}
              className="text-rose-700 border-rose-200 hover:bg-rose-50"
            >
              {rental.paymentStatus === "paid" && rental.amountPaidCents > 0
                ? "Refund and cancel"
                : "Cancel rental"}
            </Button>
          )
        )}
```

- [ ] **Step 3: RentalsList — filter + badge**

In `src/components/admin/rentals/RentalsList.tsx`: add `"requested"` to the `RentalRow["status"]` union; add `{ value: "requested", label: "Requested" }` as the second `STATUS_OPTIONS` entry (after "All"); add the `requested` case to `statusColor` (`"bg-sky-100 text-sky-900 border-sky-200"`). Add a pending-count line above the table:

```tsx
      {!loading && rows.length > 0 && (
        (() => {
          const pending = rows.filter((r) => r.status === "requested").length;
          return pending > 0 ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
              {pending} request{pending === 1 ? "" : "s"} awaiting review
            </div>
          ) : null;
        })()
      )}
```

- [ ] **Step 4: Write the failing test**

Create `tests/api/rentals/approve-decline.test.ts` (uses the admin cookie + a seeded `requested` row):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

let orgId: string;
let cookie: string;

beforeAll(async () => {
  cookie = await getAdminCookie();
  const [v] = await getDb()
    .select({ organizationId: venues.organizationId })
    .from(venues)
    .where(eq(venues.id, E2E_RENTAL_VENUE_ID))
    .limit(1);
  orgId = v.organizationId;
});

async function makeRequest(amountDueCents: number, field: number) {
  const [r] = await getDb()
    .insert(fieldRentals)
    .values({
      organizationId: orgId,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: field,
      startsAt: new Date(Date.UTC(2039, 0, 1, 12)),
      endsAt: new Date(Date.UTC(2039, 0, 1, 13)),
      status: "requested",
      source: "online_booking",
      paymentMethod: amountDueCents === 0 ? "comp" : "card_online",
      amountDueCents,
      renterName: "Approve Tester",
      requestExpiresAt: new Date(Date.now() + 24 * 3_600_000),
    })
    .returning();
  return r.id;
}

async function statusOf(id: string) {
  const [r] = await getDb()
    .select({ status: fieldRentals.status, paymentExpiresAt: fieldRentals.paymentExpiresAt })
    .from(fieldRentals)
    .where(eq(fieldRentals.id, id))
    .limit(1);
  return r;
}

describe("PATCH /api/admin/rentals/:id approve/decline", () => {
  it("approve (paid) → pending_payment with a pay window", async () => {
    const id = await makeRequest(5000, 21);
    const res = await apiFetch(`/api/admin/rentals/${id}`, {
      method: "PATCH", cookie, body: JSON.stringify({ approve: true }),
    });
    expect(res.status).toBe(200);
    const after = await statusOf(id);
    expect(after.status).toBe("pending_payment");
    expect(after.paymentExpiresAt).not.toBeNull();
  });

  it("approve ($0) → confirmed", async () => {
    const id = await makeRequest(0, 22);
    const res = await apiFetch(`/api/admin/rentals/${id}`, {
      method: "PATCH", cookie, body: JSON.stringify({ approve: true }),
    });
    expect(res.status).toBe(200);
    expect((await statusOf(id)).status).toBe("confirmed");
  });

  it("decline → cancelled", async () => {
    const id = await makeRequest(5000, 23);
    const res = await apiFetch(`/api/admin/rentals/${id}`, {
      method: "PATCH", cookie, body: JSON.stringify({ decline: true }),
    });
    expect(res.status).toBe(200);
    expect((await statusOf(id)).status).toBe("cancelled");
  });

  it("approve on a non-requested row → 422", async () => {
    const id = await makeRequest(5000, 24);
    await getDb().update(fieldRentals).set({ status: "confirmed" }).where(eq(fieldRentals.id, id));
    const res = await apiFetch(`/api/admin/rentals/${id}`, {
      method: "PATCH", cookie, body: JSON.stringify({ approve: true }),
    });
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `TEST_BASE_URL=http://localhost:4321 npm run test:api -- rentals/approve-decline`
Expected: PASS.

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/pages/api/admin/rentals/\[id\].ts src/components/admin/rentals/RentalDetail.tsx src/components/admin/rentals/RentalsList.tsx tests/api/rentals/approve-decline.test.ts
git commit -m "feat(rentals): admin approve/decline requested rentals"
```

---

## Task 8: Front-end request flow + copy + E2E

**Files:**
- Modify: `src/components/soccerone/FieldCalendar.tsx`
- Modify: `src/components/rentals/RentalBooking.tsx`
- Modify: `src/pages/soccerone/rent.astro`
- Test: `tests/e2e/field-rentals.spec.ts`

**Interfaces:**
- Consumes: `POST /api/rentals/bookings` → `{ requested: true }` (Task 5).

- [ ] **Step 1: FieldCalendar — request handling + button copy**

In `src/components/soccerone/FieldCalendar.tsx`, in `handleBook`, replace the success branch (the `body.paymentRequired && body.checkoutUrl` block) with request handling:

```ts
      if (body.requested) {
        setRequestSubmitted(true);
        return;
      }
      // Legacy fallback (should not happen in request mode).
      window.location.href = "/dashboard/bookings";
```

Add state near the other `useState`s: `const [requestSubmitted, setRequestSubmitted] = useState(false);`

When `requestSubmitted`, render a success panel in place of the booking form (in the booking panel JSX, before the waiver block):

```tsx
              {requestSubmitted ? (
                <div className="request-success">
                  <h4 className="addons-heading">Request submitted</h4>
                  <p>
                    Thanks — we've got your request for this slot. Our team will
                    review it and email you a link to pay once it's approved.
                    The slot is held for you in the meantime.
                  </p>
                </div>
              ) : (
                <>
                  {/* existing waiver + submit block */}
                </>
              )}
```

Change the submit button label from `"Book this slot"` / `"Holding slot…"` to `"Request this slot"` / `"Submitting…"`.

- [ ] **Step 2: FieldCalendar — client-side 48h lead-time guard**

The server is the source of truth (Task 5); this is a UX mirror so near-term slots render disabled. Add a `minLeadTimeHours` prop and a lead-time predicate; gate the slot on it.

In the component's props interface add:

```ts
  minLeadTimeHours?: number;
```

Destructure with a default in the component signature: `minLeadTimeHours = 48`.

Add a module-level helper next to `isHourBookable`:

```ts
/** True if hour `h` on `dateStr` is at least `leadHours` hours from now. */
function meetsLeadTime(
  dateStr: string,
  h: number,
  timeZone: string,
  leadHours: number,
): boolean {
  const hourStart = zonedHourToUtc(dateStr, h, timeZone).getTime();
  return hourStart >= Date.now() + leadHours * 60 * 60_000;
}
```

At the grid-cell computation (where `const bookable = isHourBookable(currentField, date, h, timeZone);` is built, ~line 459), fold in the lead-time check and reason:

```ts
                const withinLead = meetsLeadTime(date, h, timeZone, minLeadTimeHours);
                const bookable =
                  isHourBookable(currentField, date, h, timeZone) && withinLead;
                const reason = !withinLead
                  ? `Requests need ${minLeadTimeHours}h notice — call the venue for sooner`
                  : hourReason(currentField, date, h, timeZone);
```

Use `reason` where the cell's title/tooltip is already rendered (replace the existing `hourReason(...)` call at that cell). Pass `minLeadTimeHours` from `rent.astro` via `<FieldCalendar minLeadTimeHours={...} />`; source it from the rate card if `rent.astro` loads it, otherwise omit the prop (defaults to 48).

- [ ] **Step 3: RentalBooking (Aspire) — same request handling**

In `src/components/rentals/RentalBooking.tsx`, apply the equivalent changes: on `{ requested: true }` show a "Request submitted — we'll email a pay link" state; change the submit label to "Request this slot". (Read the file's submit handler and mirror Step 1.)

- [ ] **Step 4: Page copy**

In `src/pages/soccerone/rent.astro`: change the hero `h1` "BOOK A FIELD" / `rh-desc` to request framing, e.g. h1 "REQUEST A FIELD" and desc "Request any of our 4 indoor fields. We review each request and email you a secure link to pay — slots are held while we confirm. Requests open 48 hours ahead; call us for anything sooner." Keep the rates table and calendar. Update the `<title>`/`description` meta from "Book an indoor soccer field" to "Request an indoor soccer field" if present.

- [ ] **Step 5: Update the E2E spec**

Open `tests/e2e/field-rentals.spec.ts`. Any assertion that expects a Stripe redirect / "Book this slot" / payment step must change to the request flow: click "Request this slot", assert the "Request submitted" confirmation appears (no navigation to Stripe). Keep `waitForHydration(page)` before interactions. If the spec drives the Aspire `/rentals` page, update both. Also grep `tests/e2e/soccerone-bookings.spec.ts`, `soccerone-rental-pricing.spec.ts`, and `self-serve-payment.spec.ts` for rental-booking assertions and update any that assumed instant checkout.

- [ ] **Step 6: Build + run affected E2E locally**

Run: `npm run build` → succeeds (SSR/prerender check).
Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- field-rentals`
Expected: PASS (request flow).

- [ ] **Step 7: Commit**

```bash
git add src/components/soccerone/FieldCalendar.tsx src/components/rentals/RentalBooking.tsx src/pages/soccerone/rent.astro tests/e2e/field-rentals.spec.ts
git commit -m "feat(rentals): request-this-slot UI + 48h lead-time guard + copy"
```

---

## Final verification (before PR)

- [ ] `npm run db:generate` shows no un-committed schema drift.
- [ ] `npm run db:seed:e2e` runs clean.
- [ ] `CRON_SECRET=<x> TEST_BASE_URL=http://localhost:4321 E2E_TEST_ENDPOINTS=yes npm run test:api` — all rental suites green.
- [ ] `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- field-rentals` green.
- [ ] `npm run build` succeeds.
- [ ] `npx tsc --noEmit` → zero errors.
- [ ] Manual: on `/soccerone/rent`, request a >48h slot → "Request submitted"; slot shows unavailable on reload. In `/admin/rentals`, the request shows "Requested"; Approve → renter dashboard shows "Pay now"; pay → confirmed. Decline frees the slot.

## Spec coverage check

Every spec section maps to a task: schema §1→T1; blocking §2→T2; public API §3→T5; front-end §4→T8; admin approval §5→T7; payment §6→T6; admin email §7→T4/T5; expiry cron §8→T3; templates §9→T4; tests §10→T2–T8.
