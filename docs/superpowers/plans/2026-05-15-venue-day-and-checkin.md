# Venue Day & Check-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the venue manager day view + player self-service (email/SMS/QR + kiosk) + walk-in registration with embedded payment, completing Spec 2's three surfaces.

**Architecture:** Manager dashboard polls a single day-view endpoint; player/parent completes outstanding waiver/photo/payment on their own device or a venue kiosk via a token-authenticated public URL minted on the manager side. Walk-in registration on the kiosk uses an embedded Stripe PaymentElement (card stays on the tablet, Connect-aware). Photos go to R2; email via Resend; SMS via Twilio; QR via the `qrcode` npm package.

**Tech Stack:** Astro 5 SSR + React 19 islands, Drizzle + PostgreSQL, Stripe (PaymentElement + Connect), Cloudflare R2 (existing client), Resend (existing client), Twilio (existing client with opt-in enforcement), Netlify Scheduled Functions, Vitest (unit + API), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-05-15-venue-day-and-checkin-design.md`. Spec 1 (Field Rentals, PR #46) already shipped the rental `waiverSigned*`/`checkedInAt`/`no_show` seams and the `drop_in_bookings.checkedInAt` column.

**Branch:** `feat/venue-day-and-checkin` (already created off `origin/main`).

---

## File Structure

**Schema additions** — `src/lib/db/schema/`
- Modify: `drop-in.ts` — add `waiverSigned`/`waiverSignedAt`/`waiverSignedBy` to `dropInBookings`, add `checkInWindowMinutes` to `dropInRateCard`.
- Modify: `field-rentals.ts` — add `checkInWindowMinutes` to `fieldRentalRateCard`.
- Create: `self-service-tokens.ts` — new table + 2 enums + type exports.
- Modify: `index.ts` — export the new module.
- Generated migration under `src/lib/db/migrations/`.

**Pure helpers** — `src/lib/`
- Create: `src/lib/phone.ts` — `normalizePhone` + `formatPhone`.
- Create: `src/lib/check-in/tokens.ts` — `mintToken`, `verifyToken`, `consumeToken`.

**DB helpers** — `src/lib/check-in/`
- Create: `src/lib/check-in/resolve-signer.ts` — parent-vs-self routing.
- Create: `src/lib/check-in/day-view.ts` — merges drop-in + games + rentals → shared shape.
- Create: `src/lib/check-in/photo-upload.ts` — R2 upload + column write.

**Stripe**
- Create: `src/lib/stripe/handle-dropin-walkin-payment.ts` — webhook handler for walk-in PaymentIntent success.
- Modify: `src/pages/api/webhooks/stripe.ts` — route `metadata.type === "dropin_walkin"`.

**Manager API** — `src/pages/api/admin/check-in/`
- Create: `day.ts` — `GET`.
- Create: `send-link.ts` — `POST`.
- Create: `check-in.ts` — `POST`.
- Create: `upload-photo.ts` — `POST` (multipart).

**Self-serve API** — `src/pages/api/self-serve/[token]/`
- Create: `index.ts` — `GET` context.
- Create: `waiver.ts` — `POST`.
- Create: `photo.ts` — `POST` (multipart).
- Create: `check-in.ts` — `POST`.
- Create: `consume.ts` — `POST`.

**Kiosk API** — `src/pages/api/kiosk/[venueSlug]/`
- Create: `search.ts` — `GET`.
- Create: `token-for-target.ts` — `POST`.
- Create: `walkin/start.ts` — `POST`.
- Create: `walkin/payment.ts` — `POST`.
- Create: `reset.ts` — `POST` (clears walkin session).

**Customer dashboard** — `src/pages/api/dashboard/`
- Create: `check-in.ts` — `POST`.

**UI — Manager**
- Create: `src/pages/admin/check-in/index.astro` + `src/components/admin/check-in/CheckInDashboard.tsx` + `src/components/admin/check-in/EventCard.tsx` + `src/components/admin/check-in/Drawer.tsx` + `src/components/admin/check-in/SendLinkActions.tsx`.

**UI — Self-serve**
- Create: `src/pages/self-serve/[token].astro` + `src/components/self-serve/SelfServe.tsx` + `src/components/self-serve/WaiverCard.tsx` + `src/components/self-serve/PhotoCard.tsx`.

**UI — Kiosk**
- Create: `src/pages/kiosk/[venueSlug]/index.astro` + `src/components/kiosk/KioskLanding.tsx` + `src/components/kiosk/FindBooking.tsx` + `src/components/kiosk/WalkInWizard.tsx`.

**UI — Drop-in booking flow**
- Modify: `src/components/dropin/SessionDetail.tsx` / `BookButton.tsx` — add a waiver step before the existing book flow.

**Customer dashboard UI**
- Modify: `src/components/dashboard/MyDropInBookings` (locate exact filename) and `src/components/dashboard/MyFieldRentals.tsx` — add "Check me in" button.

**Cleanup**
- Create: `src/lib/check-in/cleanup-expired-tokens.ts` + `src/pages/api/cron/cleanup-self-service-tokens.ts` + `netlify/functions/scheduled-cleanup-self-service-tokens.ts`.

**Tests**
- `tests/unit/phone.test.ts`
- `tests/unit/check-in/tokens.test.ts`
- `tests/unit/check-in/resolve-signer.test.ts`
- `tests/api/check-in/day.test.ts`
- `tests/api/check-in/send-link.test.ts`
- `tests/api/check-in/check-in.test.ts`
- `tests/api/check-in/upload-photo.test.ts`
- `tests/api/self-serve/context.test.ts`
- `tests/api/self-serve/waiver.test.ts`
- `tests/api/self-serve/photo.test.ts`
- `tests/api/self-serve/check-in.test.ts`
- `tests/api/kiosk/search.test.ts`
- `tests/api/kiosk/walkin.test.ts`
- `tests/api/dashboard/check-in.test.ts`
- `tests/api/webhooks/walkin-payment.test.ts`
- `tests/e2e/check-in-flow.spec.ts`
- `tests/e2e/walkin-registration.spec.ts`

---

## Conventions (read before starting)

- All API routes: `export const prerender = false;` and `const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });` (per Spec 1).
- Admin endpoints gate with `requireAdminAccess(context)` from `@/lib/auth/roles` + `requireOrganizationContext`, plus `requireSameOrgVenue` from `@/lib/auth/require-resource-ownership` when a venue is named.
- Customer endpoints gate with `if (!locals.user) return json({ error: "Unauthorized" }, 401);`.
- Token-authed endpoints (self-serve) validate via `verifyToken()` from `src/lib/check-in/tokens.ts` — no `locals.user` check.
- Kiosk endpoints validate via `requireKioskVenue()` (the venueSlug → venueId resolver) — no user.
- Money in cents, timestamps `timestamp(..., { withTimezone: true })`.
- Stripe idempotency-key convention from `src/lib/stripe/client.ts` header: `${rentalId or bookingId}:<purpose>:${amountCents}`.
- Commit after every task with `feat(check-in):` / `test(check-in):` / `chore(check-in):` per Conventional Commits.
- All API tests use the post-Spec-1 robust slot helper:
  ```typescript
  const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
  const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;
  ```
  Years stay 4-digit; no pg-driver year-overflow.
- API tests import the real helpers `getAdminCookie`, `getParentCookie`, `apiFetch` from `tests/api/setup/test-helpers.ts`. Seed constants `E2E_RENTAL_VENUE_ID`, `E2E_ORG_ID` are import-safe from `@/lib/db/seeds/seed-e2e-tests`.
- Paid-path tests defensively skip on `"Stripe not configured"` (the pattern from `tests/api/rentals/bookings.test.ts:83`).

---

## Task 1: Schema additions

**Files:**
- Modify: `src/lib/db/schema/drop-in.ts`
- Modify: `src/lib/db/schema/field-rentals.ts`
- Create: `src/lib/db/schema/self-service-tokens.ts`
- Modify: `src/lib/db/schema/index.ts`

- [ ] **Step 1: Add drop-in waiver columns + checkInWindow column to drop-in rate card**

In `src/lib/db/schema/drop-in.ts`, inside the `dropInBookings` `pgTable` definition, after the `cancellationReason` line, add:

```typescript
    waiverSigned: boolean("waiver_signed").notNull().default(false),
    waiverSignedAt: timestamp("waiver_signed_at", { withTimezone: true }),
    waiverSignedBy: text("waiver_signed_by"),
```

In the same file, inside `dropInRateCard`, after `promotionWindowMinutes`, add:

```typescript
  checkInWindowMinutes: integer("check_in_window_minutes").notNull().default(60),
```

- [ ] **Step 2: Add checkInWindow column to field-rental rate card**

In `src/lib/db/schema/field-rentals.ts`, inside `fieldRentalRateCard`, after `maxDurationMinutes`, add:

```typescript
  checkInWindowMinutes: integer("check_in_window_minutes").notNull().default(60),
```

- [ ] **Step 3: Create the self-service-tokens schema file**

Create `src/lib/db/schema/self-service-tokens.ts`:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { venues } from "./teams";
import { users } from "./users";

export const selfServiceTokenKindEnum = pgEnum("self_service_token_kind", [
  "drop_in_booking",
  "field_rental",
  "roster_entry",
  "walkin_session",
]);

export const selfServiceSendChannelEnum = pgEnum("self_service_send_channel", [
  "email",
  "sms",
  "qr",
  "kiosk_search",
  "customer_dashboard",
]);

export const selfServiceTokens = pgTable(
  "self_service_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull(),
    kind: selfServiceTokenKindEnum("kind").notNull(),
    targetId: uuid("target_id").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    sentVia: selfServiceSendChannelEnum("sent_via").notNull(),
    recipientUserId: uuid("recipient_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    recipientEmail: text("recipient_email"),
    recipientPhone: text("recipient_phone"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    consumedByIp: text("consumed_by_ip"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("self_service_tokens_token_idx").on(table.token),
    index("self_service_tokens_target_idx").on(table.targetId, table.kind),
    index("self_service_tokens_expires_unclaimed_idx")
      .on(table.expiresAt)
      .where(/* drizzle sql tag */ /* @ts-expect-error */ undefined),
  ],
);

export type SelfServiceToken = typeof selfServiceTokens.$inferSelect;
export type NewSelfServiceToken = typeof selfServiceTokens.$inferInsert;
```

> Note: the partial-index `where` clause for unconsumed rows uses Drizzle's `sql` tag. After import (`import { sql } from "drizzle-orm";`), replace `/* drizzle sql tag */ /* @ts-expect-error */ undefined` with `` sql`consumed_at IS NULL` ``. The `@ts-expect-error` placeholder is there because the file as written won't type-check; fix it as part of this step. If unsure, copy the partial-index pattern from `src/lib/db/schema/drop-in.ts`'s `drop_in_bookings_promotion_expiry_idx`.

- [ ] **Step 4: Export the new module**

In `src/lib/db/schema/index.ts`, append after the drop-in export line:

```typescript
// Self-service tokens for waiver/photo/payment self-serve surfaces
export * from "./self-service-tokens";
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema/drop-in.ts src/lib/db/schema/field-rentals.ts src/lib/db/schema/self-service-tokens.ts src/lib/db/schema/index.ts
git commit -m "feat(check-in): add drop-in waiver cols, rate-card checkInWindow, self_service_tokens schema"
```

---

## Task 2: Generate and commit the migration

**Files:**
- Create: `src/lib/db/migrations/00NN_*.sql` + `meta` updates

- [ ] **Step 1: Generate the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/0026_*.sql` adding the 2 new enums, the new table, the 3 drop-in columns, and the 2 rate-card columns.

- [ ] **Step 2: Make the migration idempotent**

Open the generated file. Wrap each `CREATE TYPE` in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;` per the convention in `0024_curved_runaways.sql`. Change every `ALTER TABLE ... ADD COLUMN` to `ADD COLUMN IF NOT EXISTS`. Confirm no `DROP` statements exist.

- [ ] **Step 3: Apply locally if a local DB is available**

If `.env`'s `DATABASE_URL` points at `localhost`, run `npm run db:push`. Otherwise (the worktree's `.env` points at the remote prod proxy and `db-push-guard` will refuse — that's correct), skip this step. The committed migration is the path; CI / `migrate-prod` will apply it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/migrations/
git commit -m "feat(check-in): generate migration for waiver cols + rate-card window + self_service_tokens"
```

---

## Task 3: Phone normalize/format helpers

**Files:**
- Create: `src/lib/phone.ts`
- Test: `tests/unit/phone.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/phone.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalizePhone, formatPhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("strips all non-digits", () => {
    expect(normalizePhone("(555) 555-0182")).toBe("5555550182");
  });
  it("drops a leading 1 country code", () => {
    expect(normalizePhone("+1 (555) 555-0182")).toBe("5555550182");
    expect(normalizePhone("1-555-555-0182")).toBe("5555550182");
  });
  it("keeps numbers that are already 10 digits", () => {
    expect(normalizePhone("5555550182")).toBe("5555550182");
  });
  it("returns the empty string for empty/null/garbage", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone("not a phone")).toBe("");
  });
  it("returns the empty string when fewer than 10 digits remain", () => {
    expect(normalizePhone("555-0182")).toBe("");
  });
});

describe("formatPhone", () => {
  it("formats a 10-digit number as (NNN) NNN-NNNN", () => {
    expect(formatPhone("5555550182")).toBe("(555) 555-0182");
  });
  it("normalizes first, then formats", () => {
    expect(formatPhone("+1 555.555.0182")).toBe("(555) 555-0182");
  });
  it("falls back to the original when un-normalizable", () => {
    expect(formatPhone("not a phone")).toBe("not a phone");
  });
  it("falls back to empty for empty input", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone(null)).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/unit/phone.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

Create `src/lib/phone.ts`:

```typescript
/**
 * Pure phone-number helpers. No I/O. Used at every write site
 * (normalize-on-write) and every display site (format-on-display) so phones
 * land in the DB as 10 digits and render as (NNN) NNN-NNNN.
 */

/**
 * Strip every non-digit, drop a leading "1" country code, return the
 * 10-digit form. Returns "" for anything that can't be normalized to
 * exactly 10 digits.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = raw.replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits.length === 10 ? digits : "";
}

/**
 * Format a phone for display as "(NNN) NNN-NNNN". Falls back to the
 * original input if it can't normalize to 10 digits, so existing rows
 * with international or otherwise non-conforming numbers render unchanged.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = normalizePhone(raw);
  if (digits.length !== 10) return raw;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
```

- [ ] **Step 4: Run to verify pass**

`npx vitest run tests/unit/phone.test.ts` → PASS (10 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/phone.ts tests/unit/phone.test.ts
git commit -m "feat(check-in): phone normalize + format helpers with unit tests"
```

---

## Task 4: Token mint/verify/consume helpers

**Files:**
- Create: `src/lib/check-in/tokens.ts`
- Test: `tests/unit/check-in/tokens.test.ts`

These are pure functions for token VALUE manipulation. DB persistence lives in Task 7.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/check-in/tokens.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateTokenValue, isTokenShape } from "@/lib/check-in/tokens";

describe("generateTokenValue", () => {
  it("returns a 43-character base64url string", () => {
    const t = generateTokenValue();
    expect(t.length).toBe(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("produces unique values across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateTokenValue());
    expect(seen.size).toBe(1000);
  });
});

describe("isTokenShape", () => {
  it("accepts well-formed tokens", () => {
    expect(isTokenShape(generateTokenValue())).toBe(true);
  });
  it("rejects strings with disallowed characters", () => {
    expect(isTokenShape("has spaces and stuff!")).toBe(false);
  });
  it("rejects too-short and too-long values", () => {
    expect(isTokenShape("short")).toBe(false);
    expect(isTokenShape("x".repeat(100))).toBe(false);
  });
  it("rejects empty input", () => {
    expect(isTokenShape("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/unit/check-in/tokens.test.ts` → FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/check-in/tokens.ts`:

```typescript
/**
 * Token value generation + shape validation for self-service surfaces.
 * The DB row carries the token in a unique column; this module owns the
 * value format. DB-backed mint/verify/consume live in
 * `src/lib/check-in/tokens-db.ts` (created in Task 7).
 */
import { randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_LENGTH = 43; // base64url(32 bytes) = 43 chars without padding
const TOKEN_RX = /^[A-Za-z0-9_-]{43}$/;

/** Cryptographically random base64url token, 32 bytes / 43 chars. */
export function generateTokenValue(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** True iff the input has the expected token character set and length. */
export function isTokenShape(value: string): boolean {
  return TOKEN_RX.test(value);
}
```

- [ ] **Step 4: Run to verify pass**

`npx vitest run tests/unit/check-in/tokens.test.ts` → PASS (7 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/check-in/tokens.ts tests/unit/check-in/tokens.test.ts
git commit -m "feat(check-in): token value generation + shape validation"
```

---

## Task 5: resolveSigner helper

**Files:**
- Create: `src/lib/check-in/resolve-signer.ts`
- Test: `tests/unit/check-in/resolve-signer.test.ts` (mocked DB) — see note below

`resolveSigner` is the parent-vs-self routing for waiver delivery. The full DB-backed test lives in Task 9's send-link API test. Here, write a SMALL unit test using a fake `db` shape so the logic is exercised without a real connection.

- [ ] **Step 1: Implement**

Create `src/lib/check-in/resolve-signer.ts`:

```typescript
/**
 * Given a (kind, targetId), resolve who should sign the waiver / receive
 * the link. Centralizes the parent-vs-self routing so the send-link
 * endpoint, the self-serve page, and the kiosk all agree.
 *
 * - drop_in_booking: signer = booking's user. (Drop-in is adult-only
 *   today. If youth drop-in ships, expand this helper.)
 * - field_rental: signer = renterUser if set; else the typed
 *   renterName/email/phone (admin-created with no account).
 * - roster_entry: load the registration's family_member. If parentUserId
 *   set → signer is the parent. If selfUserId set → adult self.
 * - walkin_session: signer = whoever filled the contact form on the
 *   kiosk. Parent fields used when DOB indicates minor.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { rosters } from "@/lib/db/schema/teams";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";

export type SelfServiceKind =
  | "drop_in_booking"
  | "field_rental"
  | "roster_entry"
  | "walkin_session";

export interface ResolvedSigner {
  signerName: string;
  displayName: string; // who the page header says "Hi <name>"
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientUserId: string | null;
  isMinor: boolean;
}

export async function resolveSigner(
  kind: SelfServiceKind,
  targetId: string,
): Promise<ResolvedSigner | null> {
  const db = getDb();

  if (kind === "drop_in_booking") {
    const [row] = await db
      .select({
        bookingId: dropInBookings.id,
        userId: dropInBookings.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
      })
      .from(dropInBookings)
      .innerJoin(users, eq(users.id, dropInBookings.userId))
      .where(eq(dropInBookings.id, targetId))
      .limit(1);
    if (!row) return null;
    const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.email;
    return {
      signerName: name,
      displayName: name,
      recipientEmail: row.email,
      recipientPhone: row.phone,
      recipientUserId: row.userId,
      isMinor: false,
    };
  }

  if (kind === "field_rental") {
    const [row] = await db
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, targetId))
      .limit(1);
    if (!row) return null;
    if (row.renterUserId) {
      const [u] = await db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        })
        .from(users)
        .where(eq(users.id, row.renterUserId))
        .limit(1);
      const name = u
        ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email
        : row.renterName;
      return {
        signerName: name,
        displayName: name,
        recipientEmail: u?.email ?? row.renterEmail,
        recipientPhone: u?.phone ?? row.renterPhone,
        recipientUserId: row.renterUserId,
        isMinor: false,
      };
    }
    return {
      signerName: row.renterName,
      displayName: row.renterName,
      recipientEmail: row.renterEmail,
      recipientPhone: row.renterPhone,
      recipientUserId: null,
      isMinor: false,
    };
  }

  if (kind === "roster_entry") {
    const [row] = await db
      .select({
        rosterId: rosters.id,
        familyMemberId: registrations.familyMemberId,
        fmFirstName: familyMembers.firstName,
        fmLastName: familyMembers.lastName,
        parentUserId: familyMembers.parentUserId,
        selfUserId: familyMembers.selfUserId,
        birthDate: familyMembers.birthDate,
      })
      .from(rosters)
      .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
      .innerJoin(familyMembers, eq(familyMembers.id, registrations.familyMemberId))
      .where(eq(rosters.id, targetId))
      .limit(1);
    if (!row) return null;
    const playerName = `${row.fmFirstName} ${row.fmLastName}`.trim();
    const signerUserId = row.parentUserId ?? row.selfUserId;
    if (!signerUserId) {
      // Family member with neither parent nor self user — should be impossible
      // per the schema CHECK constraint, but defensively:
      return {
        signerName: playerName,
        displayName: playerName,
        recipientEmail: null,
        recipientPhone: null,
        recipientUserId: null,
        isMinor: row.parentUserId !== null,
      };
    }
    const [u] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, signerUserId))
      .limit(1);
    const signerName = u
      ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email
      : playerName;
    return {
      signerName,
      displayName: playerName, // page shows kid's name, signer signs for them
      recipientEmail: u?.email ?? null,
      recipientPhone: u?.phone ?? null,
      recipientUserId: signerUserId,
      isMinor: row.parentUserId !== null,
    };
  }

  // walkin_session: target is a self_service_tokens row whose recipient_*
  // fields carry the typed contact info. Lookup happens at the token
  // layer, not here. Return null to signal "the token row carries it."
  return null;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` → zero errors.

- [ ] **Step 3: Commit (no test yet — covered by Task 9 send-link API test)**

```bash
git add src/lib/check-in/resolve-signer.ts
git commit -m "feat(check-in): resolveSigner — parent-vs-self routing for waiver delivery"
```

---

## Task 6: Day-view query helper

**Files:**
- Create: `src/lib/check-in/day-view.ts`

This is the DB-touching query that merges drop-in sessions, games, and field rentals for one (venueId, date) into a shared `DayEvent` shape. Used by `GET /api/admin/check-in/day` (Task 8). No unit test here; the API test covers it.

- [ ] **Step 1: Implement**

Create `src/lib/check-in/day-view.ts`:

```typescript
/**
 * Merge drop-in sessions, scheduled/in-progress games, and field rentals
 * for a (venueId, date) into a single time-ordered list of DayEvent rows
 * the manager dashboard renders. Each event has the same summary shape
 * regardless of source.
 */
import { and, eq, gt, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { games, venues, teams, rosters } from "@/lib/db/schema/teams";

export type DayEventKind = "drop_in_session" | "game" | "field_rental";

export interface DayEvent {
  kind: DayEventKind;
  id: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  fieldNumber: number | null;
  title: string;
  subtitle: string | null;
  counts: {
    expected: number;
    waiversOutstanding: number;
    checkedIn: number;
  };
}

export async function getVenueDayEvents(
  venueId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<{ venueName: string; events: DayEvent[] } | null> {
  const db = getDb();

  const [venue] = await db
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) return null;

  // Drop-in sessions today + their bookings
  const sessions = await db
    .select({
      id: dropInSessions.id,
      startsAt: dropInSessions.startsAt,
      endsAt: dropInSessions.endsAt,
      sportOrClassLabel: dropInSessions.sportOrClassLabel,
      formatLabel: dropInSessions.formatLabel,
      bookableResourceId: dropInSessions.bookableResourceId,
      status: dropInSessions.status,
    })
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.venueId, venueId),
        eq(dropInSessions.status, "scheduled"),
        gte(dropInSessions.startsAt, dayStart),
        lt(dropInSessions.startsAt, dayEnd),
      ),
    );

  const sessionIds = sessions.map((s) => s.id);
  const sessionBookings = sessionIds.length
    ? await db
        .select({
          sessionId: dropInBookings.sessionId,
          status: dropInBookings.status,
          waiverSigned: dropInBookings.waiverSigned,
          checkedInAt: dropInBookings.checkedInAt,
        })
        .from(dropInBookings)
        .where(
          and(
            inArray(dropInBookings.sessionId, sessionIds),
            inArray(dropInBookings.status, ["confirmed", "waitlisted"]),
          ),
        )
    : [];

  const dropInEvents: DayEvent[] = sessions.map((s) => {
    const rows = sessionBookings.filter((b) => b.sessionId === s.id);
    const expected = rows.filter((b) => b.status === "confirmed").length;
    const waiversOutstanding = rows.filter(
      (b) => b.status === "confirmed" && !b.waiverSigned,
    ).length;
    const checkedIn = rows.filter((b) => b.checkedInAt != null).length;
    return {
      kind: "drop_in_session",
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      fieldNumber: null, // drop-in sessions don't carry field number yet
      title: s.sportOrClassLabel,
      subtitle: s.formatLabel ?? null,
      counts: { expected, waiversOutstanding, checkedIn },
    };
  });

  // Field rentals overlapping the day
  const rentalRows = await db
    .select({
      id: fieldRentals.id,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      fieldNumber: fieldRentals.fieldNumber,
      renterName: fieldRentals.renterName,
      purpose: fieldRentals.purpose,
      status: fieldRentals.status,
      waiverSigned: fieldRentals.waiverSigned,
      checkedInAt: fieldRentals.checkedInAt,
    })
    .from(fieldRentals)
    .where(
      and(
        eq(fieldRentals.venueId, venueId),
        lt(fieldRentals.startsAt, dayEnd),
        gt(fieldRentals.endsAt, dayStart),
        eq(fieldRentals.status, "confirmed"),
      ),
    );
  const rentalEvents: DayEvent[] = rentalRows.map((r) => ({
    kind: "field_rental",
    id: r.id,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    fieldNumber: r.fieldNumber,
    title: r.renterName,
    subtitle: r.purpose,
    counts: {
      expected: 1, // rental = party-of-one for now (renter); party_size in detail view
      waiversOutstanding: r.waiverSigned ? 0 : 1,
      checkedIn: r.checkedInAt ? 1 : 0,
    },
  }));

  // Games scheduled today on this venue
  const gameRows = await db
    .select({
      id: games.id,
      scheduledAt: games.scheduledAt,
      durationMinutes: games.durationMinutes,
      fieldNumber: games.fieldNumber,
      status: games.status,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
    })
    .from(games)
    .where(
      and(
        eq(games.venueId, venueId),
        inArray(games.status, ["scheduled", "in_progress"]),
        gte(games.scheduledAt, dayStart),
        lt(games.scheduledAt, dayEnd),
      ),
    );
  const teamIds = Array.from(
    new Set(
      gameRows.flatMap((g) => [g.homeTeamId, g.awayTeamId]).filter(Boolean),
    ),
  ) as string[];
  const teamRows = teamIds.length
    ? await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, teamIds))
    : [];
  const teamName = (id: string | null) =>
    id ? teamRows.find((t) => t.id === id)?.name ?? "TBD" : "TBD";
  // For games we count rostered players as expected; check-in/waivers come
  // from rosters → registrations. Simplified: count rostered players,
  // waiversOutstanding = 0 (registration waiver was signed at sign-up;
  // game-day waiver capture is a separate Spec 2 nicety we surface only
  // for rostered players who somehow lack a waiver — handled in detail
  // view, not in the day-summary count).
  const gameRosterCounts = teamIds.length
    ? await db
        .select({
          teamId: rosters.teamId,
          c: sql<number>`count(*)::int`,
        })
        .from(rosters)
        .where(and(inArray(rosters.teamId, teamIds), eq(rosters.status, "active")))
        .groupBy(rosters.teamId)
    : [];
  const rosterCount = (teamId: string | null) =>
    teamId
      ? gameRosterCounts.find((r) => r.teamId === teamId)?.c ?? 0
      : 0;

  const gameEvents: DayEvent[] = gameRows.map((g) => {
    const expected =
      rosterCount(g.homeTeamId) + rosterCount(g.awayTeamId);
    return {
      kind: "game",
      id: g.id,
      startsAt: g.scheduledAt.toISOString(),
      endsAt: new Date(
        g.scheduledAt.getTime() + (g.durationMinutes ?? 0) * 60_000,
      ).toISOString(),
      fieldNumber: g.fieldNumber ? Number(g.fieldNumber) : null,
      title: `${teamName(g.homeTeamId)} vs ${teamName(g.awayTeamId)}`,
      subtitle: null,
      counts: {
        expected,
        waiversOutstanding: 0, // see note above
        checkedIn: 0, // attendance is per-roster; surfaced in drawer
      },
    };
  });

  const events = [...dropInEvents, ...rentalEvents, ...gameEvents].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt),
  );

  return { venueName: venue.name, events };
}
```

> Note on `games.fieldNumber`: it's a `varchar` in the schema (Task 6 of Spec 1's plan documented this). `Number(g.fieldNumber)` coerces strings like `"1"` to `1`. Strings that aren't numeric coerce to `NaN`; the rendering side handles that by falling back to a "—" label.

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/lib/check-in/day-view.ts
git commit -m "feat(check-in): day-view query merges drop-in + rental + game rows"
```

---

## Task 7: Token CRUD lib

**Files:**
- Create: `src/lib/check-in/tokens-db.ts`

Database-backed `mintToken`, `verifyToken`, `consumeToken`. The pure-helpers are in Task 4.

- [ ] **Step 1: Implement**

Create `src/lib/check-in/tokens-db.ts`:

```typescript
/**
 * DB-backed token mint / verify / consume. Pure value helpers live in
 * `./tokens.ts`. Manager + kiosk endpoints mint; self-serve endpoints
 * verify; self-serve consume endpoint marks final completion.
 *
 * Idempotent mint: if a live (unconsumed, unexpired) token exists for
 * the same (kind, targetId), reuse it instead of cluttering the table.
 */
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  selfServiceTokens,
  type SelfServiceToken,
  type NewSelfServiceToken,
} from "@/lib/db/schema/self-service-tokens";
import { generateTokenValue, isTokenShape } from "./tokens";

const DEFAULT_TTL_HOURS = 6;

export interface MintTokenInput {
  kind: NewSelfServiceToken["kind"];
  targetId: string;
  organizationId: string;
  venueId: string | null;
  sentVia: NewSelfServiceToken["sentVia"];
  recipientUserId: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  createdByUserId: string | null;
  ttlHours?: number;
}

export async function mintToken(
  input: MintTokenInput,
): Promise<SelfServiceToken> {
  const db = getDb();
  const now = new Date();

  // Look for a live, unconsumed token for the same target.
  const [live] = await db
    .select()
    .from(selfServiceTokens)
    .where(
      and(
        eq(selfServiceTokens.kind, input.kind),
        eq(selfServiceTokens.targetId, input.targetId),
        isNull(selfServiceTokens.consumedAt),
        gt(selfServiceTokens.expiresAt, now),
      ),
    )
    .orderBy(sql`created_at desc`)
    .limit(1);
  if (live) return live;

  const ttl = (input.ttlHours ?? DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
  const [row] = await db
    .insert(selfServiceTokens)
    .values({
      token: generateTokenValue(),
      kind: input.kind,
      targetId: input.targetId,
      organizationId: input.organizationId,
      venueId: input.venueId,
      sentVia: input.sentVia,
      recipientUserId: input.recipientUserId,
      recipientEmail: input.recipientEmail,
      recipientPhone: input.recipientPhone,
      createdByUserId: input.createdByUserId,
      expiresAt: new Date(now.getTime() + ttl),
    })
    .returning();
  return row;
}

export type VerifyResult =
  | { ok: true; token: SelfServiceToken }
  | { ok: false; reason: "bad_shape" | "not_found" | "expired" | "consumed" };

export async function verifyToken(value: string): Promise<VerifyResult> {
  if (!isTokenShape(value)) return { ok: false, reason: "bad_shape" };
  const db = getDb();
  const [row] = await db
    .select()
    .from(selfServiceTokens)
    .where(eq(selfServiceTokens.token, value))
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt.getTime() < Date.now())
    return { ok: false, reason: "expired" };
  if (row.consumedAt != null) return { ok: false, reason: "consumed" };
  return { ok: true, token: row };
}

export async function consumeToken(
  id: string,
  consumedByIp: string | null,
): Promise<void> {
  await getDb()
    .update(selfServiceTokens)
    .set({ consumedAt: new Date(), consumedByIp })
    .where(eq(selfServiceTokens.id, id));
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/lib/check-in/tokens-db.ts
git commit -m "feat(check-in): DB-backed mint/verify/consume for self_service_tokens"
```

---

## Task 8: Photo upload pipeline

**Files:**
- Create: `src/lib/check-in/photo-upload.ts`

The shared helper used by both `/api/admin/check-in/upload-photo` and `/api/self-serve/[token]/photo`. Downsizes, uploads to R2, writes the URL to the appropriate column.

- [ ] **Step 1: Confirm `sharp` is available**

Run: `grep '"sharp"' package.json`
Expected: dependency is listed. If not, add it: `npm install --save sharp`.

- [ ] **Step 2: Confirm the R2 helper signature**

Read `src/lib/storage/r2.ts` lines 1–80 to confirm the upload signature. The plan below assumes a `putObject(key, body, contentType)` helper. If the actual signature differs, adapt.

- [ ] **Step 3: Implement**

Create `src/lib/check-in/photo-upload.ts`:

```typescript
/**
 * Photo upload pipeline for venue check-in. Downsizes to 1024px JPEG,
 * uploads to R2, writes the URL to the right column.
 *
 * Routing:
 *   adult drop-in / rental signer with users.id → users.avatarUrl
 *   roster_entry / family_member-anchored → family_members.photoUrl
 *
 * Returns the public R2 URL.
 */
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { putObject, publicUrl } from "@/lib/storage/r2";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_LONGEST_EDGE = 1024;
const JPEG_QUALITY = 82;

export interface PhotoUploadInput {
  bytes: Buffer;
  contentType: string;
  /** Where to write the resulting URL. Exactly one must be set. */
  target:
    | { kind: "user"; id: string }
    | { kind: "family_member"; id: string };
}

export type PhotoUploadResult =
  | { ok: true; url: string }
  | { ok: false; reason: "too_big" | "bad_type" | "process_failed" };

const ACCEPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function uploadPhoto(
  input: PhotoUploadInput,
): Promise<PhotoUploadResult> {
  if (input.bytes.byteLength > MAX_BYTES) {
    return { ok: false, reason: "too_big" };
  }
  if (!ACCEPT_TYPES.has(input.contentType)) {
    return { ok: false, reason: "bad_type" };
  }

  let processed: Buffer;
  try {
    processed = await sharp(input.bytes)
      .rotate() // honor EXIF orientation
      .resize({
        width: MAX_LONGEST_EDGE,
        height: MAX_LONGEST_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error("[check-in.photo] sharp processing failed", err);
    return { ok: false, reason: "process_failed" };
  }

  const key = `avatars/${input.target.kind}/${input.target.id}/${Date.now()}.jpg`;
  await putObject(key, processed, "image/jpeg");
  const url = publicUrl(key);

  const db = getDb();
  if (input.target.kind === "user") {
    await db
      .update(users)
      .set({ avatarUrl: url })
      .where(eq(users.id, input.target.id));
  } else {
    await db
      .update(familyMembers)
      .set({ photoUrl: url })
      .where(eq(familyMembers.id, input.target.id));
  }

  return { ok: true, url };
}
```

> Note: if `src/lib/storage/r2.ts` doesn't export `putObject` / `publicUrl`, look for the closest equivalents (the file imports `PutObjectCommand` from `@aws-sdk/client-s3` — read further to find the existing wrapper, or write a thin `putObject` adapter inline). The thumbnail-job (`src/lib/media/thumbnail-job.ts`) is a good reference for end-to-end upload-then-update.

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add src/lib/check-in/photo-upload.ts package.json package-lock.json
git commit -m "feat(check-in): photo upload pipeline — downsize, R2, write column"
```

---

## Task 9: `GET /api/admin/check-in/day`

**Files:**
- Create: `src/pages/api/admin/check-in/day.ts`
- Test: `tests/api/check-in/day.test.ts`

- [ ] **Step 1: Implement the endpoint**

Create `src/pages/api/admin/check-in/day.ts`:

```typescript
/**
 * GET /api/admin/check-in/day?venueId=&date=YYYY-MM-DD → day-view payload.
 * Admin + same-org-venue gated. The dashboard polls this every ~5s.
 */
import type { APIRoute } from "astro";
import { requireAdminAccess } from "@/lib/auth/roles";
import {
  requireSameOrgVenue,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { getVenueDayEvents } from "@/lib/check-in/day-view";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  const venueId = context.url.searchParams.get("venueId");
  const date = context.url.searchParams.get("date");
  if (!venueId || !UUID_RX.test(venueId))
    return json({ error: "venueId required (UUID)" }, 400);
  if (!date || !DATE_RX.test(date))
    return json({ error: "date required (YYYY-MM-DD)" }, 400);

  const ownership = await requireSameOrgVenue(orgId, venueId);
  if (!ownership.ok) return ownershipDeniedResponse();

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  try {
    const result = await getVenueDayEvents(venueId, dayStart, dayEnd);
    if (!result) return json({ error: "Venue not found" }, 404);
    return json({ venueName: result.venueName, date, events: result.events }, 200);
  } catch (err) {
    console.error("[check-in/day]", err);
    return json({ error: "Internal error" }, 500);
  }
};
```

- [ ] **Step 2: Write the API test**

A staging-backed dev server runs at `http://localhost:4322`. Run API tests with:
`CRON_SECRET=devcronsecret TEST_BASE_URL=http://localhost:4322 DATABASE_URL="$(grep '^STAGING_DATABASE_URL=' .env | cut -d= -f2-)" npx vitest run --config vitest.config.ts --project api <testfile>`

Create `tests/api/check-in/day.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

describe("GET /api/admin/check-in/day", () => {
  let cookie: string;
  beforeAll(async () => {
    cookie = await getAdminCookie();
  });

  it("returns 200 with events array for an org-owned venue", async () => {
    const res = await apiFetch(
      `/api/admin/check-in/day?venueId=${E2E_RENTAL_VENUE_ID}&date=2035-08-15`,
      { method: "GET", cookie },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("venueName");
    expect(Array.isArray(body.events)).toBe(true);
  });

  it("returns 400 on bad date", async () => {
    const res = await apiFetch(
      `/api/admin/check-in/day?venueId=${E2E_RENTAL_VENUE_ID}&date=2035-13-99`,
      { method: "GET", cookie },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 on a non-owned venue (org isolation)", async () => {
    const res = await apiFetch(
      `/api/admin/check-in/day?venueId=00000000-0000-0000-0000-000000000000&date=2035-08-15`,
      { method: "GET", cookie },
    );
    expect(res.status).toBe(404);
  });

  it("returns 401/403 without admin cookie", async () => {
    const res = await apiFetch(
      `/api/admin/check-in/day?venueId=${E2E_RENTAL_VENUE_ID}&date=2035-08-15`,
      { method: "GET" },
    );
    expect([401, 403]).toContain(res.status);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
CRON_SECRET=devcronsecret TEST_BASE_URL=http://localhost:4322 DATABASE_URL="$(grep '^STAGING_DATABASE_URL=' .env | cut -d= -f2-)" npx vitest run --config vitest.config.ts --project api tests/api/check-in/day.test.ts
git add src/pages/api/admin/check-in/day.ts tests/api/check-in/day.test.ts
git commit -m "feat(check-in): GET /api/admin/check-in/day endpoint with tests"
```

---

## Task 10: `POST /api/admin/check-in/send-link`

**Files:**
- Create: `src/pages/api/admin/check-in/send-link.ts`
- Test: `tests/api/check-in/send-link.test.ts`

- [ ] **Step 1: Confirm `qrcode` dep**

Run: `grep '"qrcode"' package.json`. If not present: `npm install --save qrcode @types/qrcode`. The server doesn't generate the QR (the client does); we just return the URL. But we may also embed a server-rendered SVG for the QR-overlay path later — install it now so the implementer doesn't bounce back.

- [ ] **Step 2: Implement**

Create `src/pages/api/admin/check-in/send-link.ts`:

```typescript
/**
 * POST /api/admin/check-in/send-link
 * Body: { kind, targetId, channel: "email"|"sms"|"qr" }
 *
 * - Mints (or reuses) a self_service_tokens row for (kind, targetId).
 * - email: dispatches via Resend.
 * - sms:   dispatches via Twilio (opt-in enforced by lib/sms/send.ts).
 * - qr:    returns the URL; the client renders the QR.
 *
 * Returns { url, expiresAt, channel, recipient } — recipient is partially
 * masked for display ("a***@b.com" / "(555) ***-0145") so the manager can
 * confirm where it went without exposing PII unnecessarily.
 */
import type { APIRoute } from "astro";
import { requireAdminAccess } from "@/lib/auth/roles";
import { mintToken } from "@/lib/check-in/tokens-db";
import { resolveSigner, type SelfServiceKind } from "@/lib/check-in/resolve-signer";
import { sendSms } from "@/lib/sms/send";
import { sendTransactionalEmail } from "@/lib/email/send";
import { formatPhone } from "@/lib/phone";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const VALID_KINDS: SelfServiceKind[] = [
  "drop_in_booking",
  "field_rental",
  "roster_entry",
];
const VALID_CHANNELS = ["email", "sms", "qr"] as const;
type Channel = (typeof VALID_CHANNELS)[number];

function maskEmail(e: string | null): string | null {
  if (!e) return null;
  const [user, domain] = e.split("@");
  if (!domain) return e;
  return `${user[0] ?? "a"}***@${domain}`;
}
function maskPhone(p: string | null): string | null {
  if (!p) return null;
  const f = formatPhone(p);
  // Replace middle group with stars: "(555) ***-0145"
  return f.replace(/^(\(\d{3}\)) \d{3}/, "$1 ***");
}

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  let body: { kind?: string; targetId?: string; channel?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const kind = body.kind as SelfServiceKind;
  const channel = body.channel as Channel;
  const targetId = body.targetId;
  if (!kind || !VALID_KINDS.includes(kind))
    return json({ error: "kind must be one of: " + VALID_KINDS.join(", ") }, 400);
  if (!VALID_CHANNELS.includes(channel))
    return json({ error: "channel must be email | sms | qr" }, 400);
  if (!targetId) return json({ error: "targetId required" }, 400);

  const signer = await resolveSigner(kind, targetId);
  if (!signer) return json({ error: "Target not found" }, 404);

  if (channel === "email" && !signer.recipientEmail)
    return json({ error: "No email on file for the signer" }, 422);
  if (channel === "sms" && !signer.recipientPhone)
    return json({ error: "No phone on file for the signer" }, 422);

  const token = await mintToken({
    kind,
    targetId,
    organizationId: orgId,
    venueId: null, // resolved on the page from the target row
    sentVia: channel,
    recipientUserId: signer.recipientUserId,
    recipientEmail: signer.recipientEmail,
    recipientPhone: signer.recipientPhone,
    createdByUserId: auth.user.id,
  });

  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";
  const url = `${appUrl}/self-serve/${token.token}`;

  if (channel === "email") {
    await sendTransactionalEmail({
      to: signer.recipientEmail!,
      subject: "Finish your booking — quick waiver and photo",
      // Keep template simple; richer template lives later under
      // src/lib/email/templates/.
      text: `Hi ${signer.displayName},\n\nA few quick items remain for your booking. Tap below to finish:\n${url}\n\nLink expires in 6 hours.\n— Aspire Sports`,
    });
  } else if (channel === "sms") {
    const smsResult = await sendSms({
      to: signer.recipientPhone!,
      body: `${signer.displayName}: finish your Aspire Sports booking (waiver + photo): ${url}`,
      organizationId: orgId,
    });
    if (!smsResult.ok) {
      return json(
        { error: `SMS not sent: ${smsResult.reason}` },
        smsResult.reason === "not_configured" ? 503 : 422,
      );
    }
  }

  return json(
    {
      url,
      expiresAt: token.expiresAt,
      channel,
      recipient:
        channel === "email"
          ? maskEmail(signer.recipientEmail)
          : channel === "sms"
            ? maskPhone(signer.recipientPhone)
            : null,
    },
    200,
  );
};
```

> Note: confirm `sendTransactionalEmail`'s exact signature in `src/lib/email/send.ts`. Adapt if the function name or argument shape differs.

- [ ] **Step 3: Write the API test**

Create `tests/api/check-in/send-link.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

describe("POST /api/admin/check-in/send-link", () => {
  let cookie: string;
  let rentalId: string;

  beforeAll(async () => {
    cookie = await getAdminCookie();
    // Seed a confirmed rental with renter email + phone we can route to.
    const start = new Date(RUN_BASE_UTC + 10 * 3_600_000);
    const end = new Date(start.getTime() + 60 * 60_000);
    const [rental] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 30,
        startsAt: start,
        endsAt: end,
        status: "confirmed",
        source: "admin_created",
        renterName: "Send Link Tester",
        renterEmail: "send-link-tester@example.com",
        renterPhone: "5555550182",
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
      })
      .returning();
    rentalId = rental.id;
  });

  it("mints a token and returns the url for channel=qr", async () => {
    const res = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        kind: "field_rental",
        targetId: rentalId,
        channel: "qr",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.url).toBe("string");
    expect(body.url).toMatch(/\/self-serve\//);
    expect(body.channel).toBe("qr");
  });

  it("re-uses the live token on a second QR send (idempotent)", async () => {
    const a = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        kind: "field_rental",
        targetId: rentalId,
        channel: "qr",
      }),
    });
    const b = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        kind: "field_rental",
        targetId: rentalId,
        channel: "qr",
      }),
    });
    const aBody = await a.json();
    const bBody = await b.json();
    expect(aBody.url).toBe(bBody.url);
  });

  it("returns 422 when channel=sms but no phone on file", async () => {
    // Seed a rental with no phone
    const start = new Date(RUN_BASE_UTC + 14 * 3_600_000);
    const [r] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 31,
        startsAt: start,
        endsAt: new Date(start.getTime() + 60 * 60_000),
        status: "confirmed",
        source: "admin_created",
        renterName: "No Phone",
        renterEmail: "no-phone@example.com",
        renterPhone: null,
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
      })
      .returning();
    const res = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        kind: "field_rental",
        targetId: r.id,
        channel: "sms",
      }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 401/403 without admin cookie", async () => {
    const res = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      body: JSON.stringify({
        kind: "field_rental",
        targetId: rentalId,
        channel: "qr",
      }),
    });
    expect([401, 403]).toContain(res.status);
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
CRON_SECRET=devcronsecret TEST_BASE_URL=http://localhost:4322 DATABASE_URL="$(grep '^STAGING_DATABASE_URL=' .env | cut -d= -f2-)" npx vitest run --config vitest.config.ts --project api tests/api/check-in/send-link.test.ts
git add src/pages/api/admin/check-in/send-link.ts tests/api/check-in/send-link.test.ts package.json package-lock.json
git commit -m "feat(check-in): POST /send-link with email/sms/qr dispatch + idempotent re-issue"
```

---

## Task 11: `POST /api/admin/check-in/check-in` + `/upload-photo`

**Files:**
- Create: `src/pages/api/admin/check-in/check-in.ts`
- Create: `src/pages/api/admin/check-in/upload-photo.ts`
- Test: `tests/api/check-in/check-in.test.ts`, `tests/api/check-in/upload-photo.test.ts`

- [ ] **Step 1: Implement check-in endpoint**

Create `src/pages/api/admin/check-in/check-in.ts`:

```typescript
/**
 * POST /api/admin/check-in/check-in
 * Body: { kind, targetId }
 *
 * Stamps checkedInAt on the target row and records checkedInByUserId =
 * the manager. Idempotent — re-firing does NOT shift the timestamp.
 */
import type { APIRoute } from "astro";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { requireAdminAccess } from "@/lib/auth/roles";

export const prerender = false;
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const VALID_KINDS = ["drop_in_booking", "field_rental"] as const;
type Kind = (typeof VALID_KINDS)[number];

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  let body: { kind?: string; targetId?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const kind = body.kind as Kind;
  const targetId = body.targetId;
  if (!kind || !VALID_KINDS.includes(kind))
    return json({ error: "kind must be drop_in_booking | field_rental" }, 400);
  if (!targetId) return json({ error: "targetId required" }, 400);

  const db = getDb();
  const now = new Date();

  if (kind === "drop_in_booking") {
    const [updated] = await db
      .update(dropInBookings)
      .set({ checkedInAt: now, updatedAt: now })
      .where(
        and(eq(dropInBookings.id, targetId), isNull(dropInBookings.checkedInAt)),
      )
      .returning();
    // If already checked in, fetch and return that row unchanged.
    const row =
      updated ??
      (
        await db
          .select()
          .from(dropInBookings)
          .where(eq(dropInBookings.id, targetId))
          .limit(1)
      )[0];
    if (!row) return json({ error: "Booking not found" }, 404);
    return json({ booking: row }, 200);
  }

  // field_rental
  const [updated] = await db
    .update(fieldRentals)
    .set({
      checkedInAt: now,
      checkedInByUserId: auth.user.id,
      updatedAt: now,
    })
    .where(and(eq(fieldRentals.id, targetId), isNull(fieldRentals.checkedInAt)))
    .returning();
  const row =
    updated ??
    (
      await db
        .select()
        .from(fieldRentals)
        .where(eq(fieldRentals.id, targetId))
        .limit(1)
    )[0];
  if (!row || row.organizationId !== orgId)
    return json({ error: "Rental not found" }, 404);
  return json({ rental: row }, 200);
};
```

- [ ] **Step 2: Implement upload-photo endpoint**

Create `src/pages/api/admin/check-in/upload-photo.ts`:

```typescript
/**
 * POST /api/admin/check-in/upload-photo (multipart)
 *
 * Manager-side photo upload. Resolves the photo target (users.avatarUrl
 * vs family_members.photoUrl) from the (kind, targetId), then runs the
 * shared upload pipeline.
 */
import type { APIRoute } from "astro";
import { requireAdminAccess } from "@/lib/auth/roles";
import { resolveSigner } from "@/lib/check-in/resolve-signer";
import { uploadPhoto } from "@/lib/check-in/photo-upload";

export const prerender = false;
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const form = await context.request.formData();
  const kind = form.get("kind") as string | null;
  const targetId = form.get("targetId") as string | null;
  const file = form.get("file") as File | null;
  if (!kind || !targetId || !file)
    return json({ error: "kind, targetId, and file are required" }, 400);

  const signer = await resolveSigner(kind as never, targetId);
  if (!signer) return json({ error: "Target not found" }, 404);

  const target: Parameters<typeof uploadPhoto>[0]["target"] = signer.isMinor
    ? // roster_entry minor → family_member photo
      // For non-roster targets that route to a minor, we'd need a more
      // detailed resolver; for now, the manager-upload path is primarily
      // adult drop-in / rentals.
      { kind: "family_member", id: (signer as never as { familyMemberId: string }).familyMemberId }
    : signer.recipientUserId
      ? { kind: "user", id: signer.recipientUserId }
      : null!;
  if (!target) return json({ error: "No photo target for this signer" }, 422);

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await uploadPhoto({
    bytes,
    contentType: file.type,
    target,
  });
  if (!result.ok) {
    const status =
      result.reason === "too_big" ? 413 : result.reason === "bad_type" ? 415 : 500;
    return json({ error: result.reason }, status);
  }
  return json({ url: result.url }, 200);
};
```

> Note: the `resolveSigner` return type doesn't currently expose the `familyMemberId` for the roster path. When implementing, extend `ResolvedSigner` to include `familyMemberId: string | null` for the roster_entry path so the upload endpoint can route correctly. Update Task 5's interface and the resolver accordingly.

- [ ] **Step 3: Write API tests**

Create `tests/api/check-in/check-in.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { eq } from "drizzle-orm";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

describe("POST /api/admin/check-in/check-in (field_rental)", () => {
  let cookie: string;
  let rentalId: string;

  beforeAll(async () => {
    cookie = await getAdminCookie();
    const [r] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 40,
        startsAt: new Date(RUN_BASE_UTC + 10 * 3_600_000),
        endsAt: new Date(RUN_BASE_UTC + 11 * 3_600_000),
        status: "confirmed",
        source: "admin_created",
        renterName: "Check-in Tester",
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
      })
      .returning();
    rentalId = r.id;
  });

  it("stamps checkedInAt and returns the row", async () => {
    const res = await apiFetch("/api/admin/check-in/check-in", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "field_rental", targetId: rentalId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rental.checkedInAt).not.toBeNull();
    const [row] = await getDb()
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId));
    expect(row.checkedInAt).not.toBeNull();
  });

  it("is idempotent — re-firing keeps the original timestamp", async () => {
    const [before] = await getDb()
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId));
    const ts0 = before.checkedInAt;
    const res = await apiFetch("/api/admin/check-in/check-in", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "field_rental", targetId: rentalId }),
    });
    expect(res.status).toBe(200);
    const [after] = await getDb()
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId));
    expect(after.checkedInAt?.getTime()).toBe(ts0?.getTime());
  });

  it("returns 404 for a missing rental id", async () => {
    const res = await apiFetch("/api/admin/check-in/check-in", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        kind: "field_rental",
        targetId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(res.status).toBe(404);
  });
});
```

Skip `upload-photo.test.ts` for now — it requires a multipart form fixture and the storage pipeline is exercised end-to-end by the E2E test (Task 24). If you want a unit-style coverage, add a small test that posts a tiny JPEG buffer; otherwise document the gap in the commit message.

- [ ] **Step 4: Run + commit**

```bash
CRON_SECRET=devcronsecret TEST_BASE_URL=http://localhost:4322 DATABASE_URL="$(grep '^STAGING_DATABASE_URL=' .env | cut -d= -f2-)" npx vitest run --config vitest.config.ts --project api tests/api/check-in/check-in.test.ts
git add src/pages/api/admin/check-in/check-in.ts src/pages/api/admin/check-in/upload-photo.ts tests/api/check-in/check-in.test.ts src/lib/check-in/resolve-signer.ts
git commit -m "feat(check-in): admin check-in + photo upload endpoints"
```

---

## Task 12: Self-serve API — context + waiver + consume

**Files:**
- Create: `src/pages/api/self-serve/[token]/index.ts`
- Create: `src/pages/api/self-serve/[token]/waiver.ts`
- Create: `src/pages/api/self-serve/[token]/consume.ts`
- Test: `tests/api/self-serve/context.test.ts`, `tests/api/self-serve/waiver.test.ts`

- [ ] **Step 1: Implement `GET /api/self-serve/[token]`**

Create `src/pages/api/self-serve/[token]/index.ts`:

```typescript
/**
 * GET /api/self-serve/[token] → token context for the player page.
 * Returns the signer name + a one-line booking summary + a list of
 * outstanding items (waiver / photo / payment).
 */
import type { APIRoute } from "astro";
import { verifyToken } from "@/lib/check-in/tokens-db";
import { resolveSigner } from "@/lib/check-in/resolve-signer";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { eq } from "drizzle-orm";

export const prerender = false;
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params }) => {
  const tokenValue = params.token;
  if (!tokenValue) return json({ error: "Token required" }, 400);

  const v = await verifyToken(tokenValue);
  if (!v.ok) {
    const status =
      v.reason === "expired" || v.reason === "consumed" ? 410 : 404;
    return json({ error: v.reason }, status);
  }
  const tok = v.token;

  const signer = await resolveSigner(tok.kind, tok.targetId);
  if (!signer && tok.kind !== "walkin_session")
    return json({ error: "Target gone" }, 410);

  // Outstanding-items resolution per kind
  const db = getDb();
  let summary = "";
  let outstanding = { waiver: false, photo: false, payment: false };

  if (tok.kind === "drop_in_booking") {
    const [b] = await db
      .select({
        startsAt: dropInSessions.startsAt,
        venueName: venues.name,
        sportLabel: dropInSessions.sportOrClassLabel,
        waiverSigned: dropInBookings.waiverSigned,
      })
      .from(dropInBookings)
      .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
      .innerJoin(venues, eq(venues.id, dropInSessions.venueId))
      .where(eq(dropInBookings.id, tok.targetId))
      .limit(1);
    if (!b) return json({ error: "Booking gone" }, 410);
    summary = `${b.sportLabel} on ${b.startsAt.toLocaleString()} at ${b.venueName}`;
    outstanding.waiver = !b.waiverSigned;
    // Photo on file? Check the signer's user.avatarUrl (signed by user).
    // For brevity we don't reload here — the page can re-query if needed.
  } else if (tok.kind === "field_rental") {
    const [r] = await db
      .select({
        startsAt: fieldRentals.startsAt,
        venueName: venues.name,
        waiverSigned: fieldRentals.waiverSigned,
      })
      .from(fieldRentals)
      .innerJoin(venues, eq(venues.id, fieldRentals.venueId))
      .where(eq(fieldRentals.id, tok.targetId))
      .limit(1);
    if (!r) return json({ error: "Rental gone" }, 410);
    summary = `Field rental on ${r.startsAt.toLocaleString()} at ${r.venueName}`;
    outstanding.waiver = !r.waiverSigned;
  } else if (tok.kind === "roster_entry") {
    summary = `Today's game`;
    outstanding.waiver = true; // game-day waiver: simplest is "always show" and let the API write
  } else if (tok.kind === "walkin_session") {
    summary = `Walk-in registration`;
    outstanding.waiver = true;
    outstanding.payment = true;
  }

  return json(
    {
      tokenKind: tok.kind,
      displayName: signer?.displayName ?? "Guest",
      signerName: signer?.signerName ?? null,
      summary,
      outstanding,
      expiresAt: tok.expiresAt,
    },
    200,
  );
};
```

- [ ] **Step 2: Implement waiver endpoint**

Create `src/pages/api/self-serve/[token]/waiver.ts`:

```typescript
/**
 * POST /api/self-serve/[token]/waiver
 * Body: { acceptedName: string }
 *
 * Writes waiverSigned* on the target row, plus a consents audit row.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { verifyToken } from "@/lib/check-in/tokens-db";

export const prerender = false;
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request }) => {
  const tokenValue = params.token;
  if (!tokenValue) return json({ error: "Token required" }, 400);
  const v = await verifyToken(tokenValue);
  if (!v.ok) {
    const status =
      v.reason === "expired" || v.reason === "consumed" ? 410 : 404;
    return json({ error: v.reason }, status);
  }
  const tok = v.token;

  let body: { acceptedName?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const acceptedName = (body.acceptedName ?? "").trim();
  if (acceptedName.length === 0)
    return json({ error: "acceptedName is required" }, 422);

  const now = new Date();
  const db = getDb();
  if (tok.kind === "drop_in_booking") {
    await db
      .update(dropInBookings)
      .set({
        waiverSigned: true,
        waiverSignedAt: now,
        waiverSignedBy: acceptedName,
        updatedAt: now,
      })
      .where(eq(dropInBookings.id, tok.targetId));
  } else if (tok.kind === "field_rental") {
    await db
      .update(fieldRentals)
      .set({
        waiverSigned: true,
        waiverSignedAt: now,
        waiverSignedBy: acceptedName,
        updatedAt: now,
      })
      .where(eq(fieldRentals.id, tok.targetId));
  } else if (tok.kind === "roster_entry") {
    // For roster waivers the waiver lives on the registrations row — but
    // it's already signed at registration time. This is a no-op + 200 so
    // the UI flow can complete cleanly; in practice the page won't show
    // an unsigned waiver for a roster_entry target.
    return json({ ok: true }, 200);
  } else if (tok.kind === "walkin_session") {
    // The walk-in flow stamps the waiver on the booking row it created.
    // The booking id is the targetId for walkin tokens after the
    // "create-booking" kiosk step.
    await db
      .update(dropInBookings)
      .set({
        waiverSigned: true,
        waiverSignedAt: now,
        waiverSignedBy: acceptedName,
        updatedAt: now,
      })
      .where(eq(dropInBookings.id, tok.targetId));
  }

  // Audit trail: append a `consents` row. Mirrors the registration flow's
  // pattern. Resolve signedByUserId from the token's recipientUserId.
  const { consents } = await import("@/lib/db/schema/consents");
  await db.insert(consents).values({
    familyMemberId: null, // resolved below if minor
    type: "liability",
    status: "granted",
    signedByUserId: tok.recipientUserId,
    signedByName: acceptedName,
    signedAt: now,
    // contentHash: stable hash of the waiver text shown — for v1, store
    // a constant; future spec can version waivers and hash per-version.
    contentHash: "v1-liability-2026-05-15",
  });

  return json({ ok: true, waiverSignedAt: now.toISOString() }, 200);
};
```

> Note on consents.familyMemberId: for roster_entry minors, resolve from
> the registration's `familyMemberId` and pass it. For drop-in adult /
> rental, leave null. The consents schema (`src/lib/db/schema/consents.ts`)
> defines whether the column is nullable; if it's NOT NULL, you'll need to
> resolve a family_member id (the resolveSigner helper should be extended
> with `familyMemberId: string | null` per the Task 5 note).

- [ ] **Step 3: Implement consume endpoint**

Create `src/pages/api/self-serve/[token]/consume.ts`:

```typescript
import type { APIRoute } from "astro";
import { verifyToken, consumeToken } from "@/lib/check-in/tokens-db";

export const prerender = false;
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request }) => {
  const tokenValue = params.token;
  if (!tokenValue) return json({ error: "Token required" }, 400);
  const v = await verifyToken(tokenValue);
  if (!v.ok) return json({ error: v.reason }, 410);
  const ip =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    null;
  await consumeToken(v.token.id, ip);
  return json({ ok: true }, 200);
};
```

- [ ] **Step 4: Write API tests**

Create `tests/api/self-serve/context.test.ts` and `tests/api/self-serve/waiver.test.ts`. Each test:
1. Seeds a target row (rental or drop-in booking).
2. Mints a token directly via `mintToken({...})` from `@/lib/check-in/tokens-db`.
3. Calls `GET /api/self-serve/[token.token]` → asserts response shape.
4. For waiver test: calls `POST /api/self-serve/[token.token]/waiver` with valid `acceptedName` → asserts row flipped.
5. Asserts 410 for expired/consumed token (manually back-date `expiresAt` or call consumeToken).
6. Asserts 404 for bad token shape.

(Test scaffolding follows the bookings.test.ts pattern from Spec 1.)

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
CRON_SECRET=devcronsecret TEST_BASE_URL=http://localhost:4322 DATABASE_URL="$(grep '^STAGING_DATABASE_URL=' .env | cut -d= -f2-)" npx vitest run --config vitest.config.ts --project api tests/api/self-serve/
git add src/pages/api/self-serve/ tests/api/self-serve/
git commit -m "feat(check-in): self-serve context + waiver + consume endpoints with tests"
```

---

## Task 13: Self-serve API — photo + check-in

**Files:**
- Create: `src/pages/api/self-serve/[token]/photo.ts`
- Create: `src/pages/api/self-serve/[token]/check-in.ts`
- Test: `tests/api/self-serve/photo.test.ts`, `tests/api/self-serve/check-in.test.ts`

- [ ] **Step 1: Implement photo endpoint**

Create `src/pages/api/self-serve/[token]/photo.ts`. Same shape as the manager `upload-photo` but token-authed:

```typescript
import type { APIRoute } from "astro";
import { verifyToken } from "@/lib/check-in/tokens-db";
import { resolveSigner } from "@/lib/check-in/resolve-signer";
import { uploadPhoto } from "@/lib/check-in/photo-upload";

export const prerender = false;
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request }) => {
  const tokenValue = params.token;
  if (!tokenValue) return json({ error: "Token required" }, 400);
  const v = await verifyToken(tokenValue);
  if (!v.ok) {
    const status =
      v.reason === "expired" || v.reason === "consumed" ? 410 : 404;
    return json({ error: v.reason }, status);
  }
  const tok = v.token;

  const form = await request.formData();
  const file = form.get("file") as File | null;
  if (!file) return json({ error: "file required" }, 400);

  const signer = await resolveSigner(tok.kind, tok.targetId);
  const target = signer?.isMinor
    ? { kind: "family_member" as const, id: (signer as never as { familyMemberId: string }).familyMemberId }
    : signer?.recipientUserId
      ? { kind: "user" as const, id: signer.recipientUserId }
      : null;
  if (!target) return json({ error: "No photo target" }, 422);

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await uploadPhoto({
    bytes,
    contentType: file.type,
    target,
  });
  if (!result.ok) {
    const status =
      result.reason === "too_big" ? 413 : result.reason === "bad_type" ? 415 : 500;
    return json({ error: result.reason }, status);
  }
  return json({ url: result.url }, 200);
};
```

- [ ] **Step 2: Implement self-serve check-in endpoint**

Create `src/pages/api/self-serve/[token]/check-in.ts`:

```typescript
/**
 * POST /api/self-serve/[token]/check-in
 *
 * The customer-dashboard variant of self check-in. Stamps checkedInAt
 * on the target row. Idempotent.
 */
import type { APIRoute } from "astro";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { verifyToken } from "@/lib/check-in/tokens-db";

export const prerender = false;
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params }) => {
  const tokenValue = params.token;
  if (!tokenValue) return json({ error: "Token required" }, 400);
  const v = await verifyToken(tokenValue);
  if (!v.ok) {
    const status =
      v.reason === "expired" || v.reason === "consumed" ? 410 : 404;
    return json({ error: v.reason }, status);
  }
  const tok = v.token;
  const now = new Date();
  const db = getDb();

  if (tok.kind === "drop_in_booking" || tok.kind === "walkin_session") {
    await db
      .update(dropInBookings)
      .set({ checkedInAt: now, updatedAt: now })
      .where(
        and(eq(dropInBookings.id, tok.targetId), isNull(dropInBookings.checkedInAt)),
      );
  } else if (tok.kind === "field_rental") {
    await db
      .update(fieldRentals)
      .set({ checkedInAt: now, updatedAt: now })
      .where(
        and(eq(fieldRentals.id, tok.targetId), isNull(fieldRentals.checkedInAt)),
      );
  }
  return json({ ok: true, checkedInAt: now.toISOString() }, 200);
};
```

- [ ] **Step 3: Tests + commit**

Mirror the structure of Task 12's tests. Run, then commit:

```bash
CRON_SECRET=devcronsecret TEST_BASE_URL=http://localhost:4322 DATABASE_URL="$(grep '^STAGING_DATABASE_URL=' .env | cut -d= -f2-)" npx vitest run --config vitest.config.ts --project api tests/api/self-serve/
git add src/pages/api/self-serve/[token]/photo.ts src/pages/api/self-serve/[token]/check-in.ts tests/api/self-serve/
git commit -m "feat(check-in): self-serve photo + check-in endpoints with tests"
```

---

## Task 14: Kiosk API — search + token-for-target

**Files:**
- Create: `src/lib/check-in/kiosk-auth.ts` — `requireKioskVenue(venueSlug)` helper.
- Create: `src/pages/api/kiosk/[venueSlug]/search.ts`
- Create: `src/pages/api/kiosk/[venueSlug]/token-for-target.ts`
- Test: `tests/api/kiosk/search.test.ts`

- [ ] **Step 1: Implement kiosk auth helper**

Create `src/lib/check-in/kiosk-auth.ts`:

```typescript
/**
 * Resolve a kiosk URL slug to its venue. Kiosk surfaces aren't authed by
 * a session — the URL slug IS the credential. The slug isn't a secret
 * (it's painted on the tablet), but it's used to scope every query.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";

export async function requireKioskVenue(slug: string) {
  // Slug field doesn't exist on venues today. For v1, treat the slug as
  // the venue UUID. Production deployments can map slug→id via a tiny
  // venue_kiosk_slugs table later. Documented gap.
  const [v] = await getDb()
    .select()
    .from(venues)
    .where(eq(venues.id, slug))
    .limit(1);
  if (!v || !v.active)
    return { ok: false as const, response: new Response(JSON.stringify({ error: "Kiosk not found" }), { status: 404 }) };
  return { ok: true as const, venue: v };
}
```

> Note: this v1 uses venue UUID as the slug to keep the data model minimal. A follow-up can add a `venues.kioskSlug` short-string column for friendly URLs (e.g. `/kiosk/worthington`). Track as a non-blocking enhancement.

- [ ] **Step 2: Implement search endpoint**

Create `src/pages/api/kiosk/[venueSlug]/search.ts`:

```typescript
/**
 * GET /api/kiosk/[venueSlug]/search?q= → today's bookings at this venue
 * matching by name or last-4 of phone (player or parent).
 */
import type { APIRoute } from "astro";
import { and, eq, gte, lt, ilike, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { requireKioskVenue } from "@/lib/check-in/kiosk-auth";
import { normalizePhone } from "@/lib/phone";

export const prerender = false;
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params, url }) => {
  const slug = params.venueSlug;
  if (!slug) return json({ error: "venueSlug required" }, 400);
  const k = await requireKioskVenue(slug);
  if (!k.ok) return k.response;
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return json({ results: [] }, 200);

  // Today bounds in venue org timezone (simplified to UTC for v1)
  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  const phoneDigits = normalizePhone(q) || q.replace(/\D/g, "");
  const last4Filter =
    phoneDigits.length >= 4
      ? phoneDigits.slice(-4)
      : null;
  const nameLike = `%${q}%`;

  // Drop-in: today, this venue, joined to users for name/phone match
  const dropInRows = await getDb()
    .select({
      bookingId: dropInBookings.id,
      name: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      waiverSigned: dropInBookings.waiverSigned,
      checkedInAt: dropInBookings.checkedInAt,
      startsAt: dropInSessions.startsAt,
      sportLabel: dropInSessions.sportOrClassLabel,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
    .innerJoin(users, eq(users.id, dropInBookings.userId))
    .where(
      and(
        eq(dropInSessions.venueId, k.venue.id),
        gte(dropInSessions.startsAt, dayStart),
        lt(dropInSessions.startsAt, dayEnd),
        eq(dropInBookings.status, "confirmed"),
        or(
          ilike(users.firstName, nameLike),
          ilike(users.lastName, nameLike),
          last4Filter ? ilike(users.phone, `%${last4Filter}`) : undefined,
        ),
      ),
    );

  // Field rentals today: search by renterName / renterPhone last-4
  const rentalRows = await getDb()
    .select({
      rentalId: fieldRentals.id,
      renterName: fieldRentals.renterName,
      renterPhone: fieldRentals.renterPhone,
      waiverSigned: fieldRentals.waiverSigned,
      checkedInAt: fieldRentals.checkedInAt,
      startsAt: fieldRentals.startsAt,
    })
    .from(fieldRentals)
    .where(
      and(
        eq(fieldRentals.venueId, k.venue.id),
        gte(fieldRentals.startsAt, dayStart),
        lt(fieldRentals.startsAt, dayEnd),
        eq(fieldRentals.status, "confirmed"),
        or(
          ilike(fieldRentals.renterName, nameLike),
          last4Filter ? ilike(fieldRentals.renterPhone, `%${last4Filter}`) : undefined,
        ),
      ),
    );

  const results = [
    ...dropInRows.map((r) => ({
      kind: "drop_in_booking" as const,
      targetId: r.bookingId,
      title: `${r.name ?? ""} ${r.lastName ?? ""}`.trim(),
      subtitle: `${r.sportLabel} at ${r.startsAt.toLocaleTimeString()}`,
      waiverSigned: r.waiverSigned,
      checkedIn: r.checkedInAt != null,
    })),
    ...rentalRows.map((r) => ({
      kind: "field_rental" as const,
      targetId: r.rentalId,
      title: r.renterName,
      subtitle: `Rental at ${r.startsAt.toLocaleTimeString()}`,
      waiverSigned: r.waiverSigned,
      checkedIn: r.checkedInAt != null,
    })),
  ];
  return json({ results }, 200);
};
```

- [ ] **Step 3: Implement token-for-target endpoint**

Create `src/pages/api/kiosk/[venueSlug]/token-for-target.ts`:

```typescript
import type { APIRoute } from "astro";
import { requireKioskVenue } from "@/lib/check-in/kiosk-auth";
import { mintToken } from "@/lib/check-in/tokens-db";
import { resolveSigner } from "@/lib/check-in/resolve-signer";

export const prerender = false;
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const slug = context.params.venueSlug;
  if (!slug) return json({ error: "venueSlug required" }, 400);
  const k = await requireKioskVenue(slug);
  if (!k.ok) return k.response;
  let body: { kind?: string; targetId?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.kind || !body.targetId)
    return json({ error: "kind + targetId required" }, 400);

  const signer = await resolveSigner(body.kind as never, body.targetId);
  const token = await mintToken({
    kind: body.kind as never,
    targetId: body.targetId,
    organizationId: k.venue.locationId
      ? // venue.locationId → locations.organizationId; for v1 we trust the org
        // is derivable from the venue. Simplification: query if needed.
        (await (await import("@/lib/db")).getDb()
          .select({ organizationId: (await import("@/lib/db/schema/organizations")).locations.organizationId })
          .from((await import("@/lib/db/schema/organizations")).locations)
          .where((await import("drizzle-orm")).eq((await import("@/lib/db/schema/organizations")).locations.id, k.venue.locationId))
          .limit(1))[0]?.organizationId
      : null,
    venueId: k.venue.id,
    sentVia: "kiosk_search",
    recipientUserId: signer?.recipientUserId ?? null,
    recipientEmail: signer?.recipientEmail ?? null,
    recipientPhone: signer?.recipientPhone ?? null,
    createdByUserId: null,
  });

  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";
  return json(
    { url: `${appUrl}/self-serve/${token.token}`, expiresAt: token.expiresAt },
    200,
  );
};
```

> Note: the dynamic-import pattern in the orgId resolution is ugly. Replace with a clean import block at the top of the file. The intent is: derive `organizationId` from the venue's `locationId` → `locations.organizationId`. Refactor during implementation.

- [ ] **Step 4: Tests + commit**

Mirror earlier tests' pattern. Then:

```bash
CRON_SECRET=devcronsecret TEST_BASE_URL=http://localhost:4322 DATABASE_URL="$(grep '^STAGING_DATABASE_URL=' .env | cut -d= -f2-)" npx vitest run --config vitest.config.ts --project api tests/api/kiosk/search.test.ts
git add src/lib/check-in/kiosk-auth.ts src/pages/api/kiosk/[venueSlug]/search.ts src/pages/api/kiosk/[venueSlug]/token-for-target.ts tests/api/kiosk/
git commit -m "feat(check-in): kiosk search + token-for-target endpoints"
```

---

## Task 15: Kiosk API — walkin/start + walkin/payment

**Files:**
- Create: `src/pages/api/kiosk/[venueSlug]/walkin/start.ts`
- Create: `src/pages/api/kiosk/[venueSlug]/walkin/payment.ts`
- Test: `tests/api/kiosk/walkin.test.ts`

This is the walk-in registration flow. The flow has 5 steps client-side (Task 22). Server-side, **start** creates the booking-in-pending and mints a `walkin_session` token; **payment** creates the PaymentIntent.

Code shape mirrors the rental booking endpoint from Spec 1 (`src/pages/api/rentals/bookings/index.ts`) — Connect-aware, idempotency keys, hold rollback on Stripe failure. Use that as a template.

Key behaviors:
- `walkin/start` body: `{ sessionId, contact: { firstName, lastName, email, phone, dob }, parent?: { firstName, lastName, email, phone } }`.
- Creates a `users` row matching by email (or fresh).
- If `dob` indicates minor, creates a `family_members` row with `parentUserId` set; signer = parent.
- Creates a `dropInBookings` row in `pending_payment` status with `paymentMethod: "card_online"`, `amountDueCents` resolved from the session's rate.
- Mints `walkin_session` token bound to the booking id.
- Returns `{ token, url }`.

- `walkin/payment` body: `{ token }`.
- Verifies token; resolves booking; computes price (already on booking row).
- Creates Stripe PaymentIntent with `metadata.type = "dropin_walkin"`, Connect-aware via `venue.partnerStripeAccountId`.
- Returns `{ clientSecret, amountCents }`.

Implementer should write this by mirroring `src/pages/api/rentals/bookings/index.ts:163-241` (the hold-then-Stripe path) and the admin `card_present` walk-up in `src/pages/api/admin/rentals/index.ts`. Both already in repo.

- [ ] **Steps:** mirror the rental endpoint structure. Implement, write a test that hits `start` then `payment`, defensive-skip when Stripe unconfigured per Task 9's pattern, commit.

```bash
git add src/pages/api/kiosk/[venueSlug]/walkin/ tests/api/kiosk/walkin.test.ts
git commit -m "feat(check-in): kiosk walkin/start + walkin/payment endpoints"
```

---

## Task 16: Walk-in payment webhook handler

**Files:**
- Create: `src/lib/stripe/handle-dropin-walkin-payment.ts`
- Modify: `src/pages/api/webhooks/stripe.ts`
- Test: extend `tests/api/rentals/webhook.test.ts` or create `tests/api/check-in/walkin-payment-webhook.test.ts`

Mirrors `handle-field-rental-walkup-payment.ts` from Spec 1. On `payment_intent.succeeded` with `metadata.type === "dropin_walkin"`, flips the `pending_payment` drop-in booking to `confirmed`.

- [ ] **Step 1: Implement handler**

Create `src/lib/stripe/handle-dropin-walkin-payment.ts` — copy the structure of `handle-field-rental-walkup-payment.ts`, swap `fieldRentals` for `dropInBookings`, swap the metadata-key check, swap the column updates.

- [ ] **Step 2: Wire into webhook router**

In `src/pages/api/webhooks/stripe.ts`, add a branch in `payment_intent.succeeded` BEFORE the existing branches:

```typescript
if (paymentIntent.metadata?.type === "dropin_walkin") {
  const result = await handleDropinWalkinPayment(paymentIntent);
  console.log(`[stripe webhook] payment_intent.succeeded (dropin walkin) → ${result.status}`, result);
} else if (paymentIntent.metadata?.type === "field_rental_walk_up") {
  // ...existing
```

- [ ] **Step 3: Test + commit**

Test mirrors `tests/api/rentals/webhook.test.ts` — direct handler test with seeded `pending_payment` row + faked PaymentIntent metadata. Then:

```bash
git add src/lib/stripe/handle-dropin-walkin-payment.ts src/pages/api/webhooks/stripe.ts tests/api/check-in/walkin-payment-webhook.test.ts
git commit -m "feat(check-in): walkin payment webhook handler"
```

---

## Task 17: Customer dashboard check-in API

**Files:**
- Create: `src/pages/api/dashboard/check-in.ts`
- Test: `tests/api/dashboard/check-in.test.ts`

`POST /api/dashboard/check-in`, body `{ kind, targetId }`. Auth: logged-in user must match the booking's `userId` (drop-in) / `renterUserId` (rental) / `family_members.parentUserId` (roster for minor). Validates against the rate-card's `checkInWindowMinutes` around `startsAt`. Stamps `checkedInAt`.

- [ ] Mirror Task 11's structure. Test the auth check (other-user gets 403), the window check (too early / too late returns 422), happy path returns 200.

```bash
git add src/pages/api/dashboard/check-in.ts tests/api/dashboard/check-in.test.ts
git commit -m "feat(check-in): customer dashboard self check-in API"
```

---

## Task 18: Manager dashboard UI — page + dashboard component

**Files:**
- Create: `src/pages/admin/check-in/index.astro`
- Create: `src/components/admin/check-in/CheckInDashboard.tsx`
- Create: `src/components/admin/check-in/EventCard.tsx`

`CheckInDashboard.tsx` ("use client"):
- Header: venue select (from server-side load), date input (default today).
- Body: maps `events` from `GET /api/admin/check-in/day` into `<EventCard />` per row.
- Polls every 5s while the dashboard is visible (skip while drawer is open is OK; the drawer poll covers it).
- Selecting a card opens the drawer (Task 19).

`EventCard.tsx`: pure presentational — time + title + counts pills.

- [ ] Implement, smoke-test in the browser (admin sign-in cookie). Astro page extends `BaseLayout` per CLAUDE.md; admin nav link added to `src/components/admin/admin-layout.tsx`.

```bash
git add src/pages/admin/check-in/ src/components/admin/check-in/CheckInDashboard.tsx src/components/admin/check-in/EventCard.tsx src/components/admin/admin-layout.tsx
git commit -m "feat(check-in): admin /admin/check-in page + dashboard + event cards"
```

---

## Task 19: Drawer + send-link actions + photo upload

**Files:**
- Create: `src/components/admin/check-in/Drawer.tsx`
- Create: `src/components/admin/check-in/SendLinkActions.tsx`
- Create: `src/components/admin/check-in/AvatarUploader.tsx`
- Modify: `src/components/admin/check-in/CheckInDashboard.tsx` — open the drawer on card click.

`Drawer.tsx`:
- Fetches per-event detail from a new endpoint `GET /api/admin/check-in/event?kind=&id=` (TODO: add this endpoint as part of Task 19; small thin wrapper that returns person rows for the event).
- Renders rows: photo (clickable when empty → AvatarUploader), name + subtitle (phone formatted), waiver badge (click → opens an inline send-link panel), check-in button.
- Polls every 5s while open.

`SendLinkActions.tsx`:
- Three buttons: Email / SMS / Show QR.
- Email is primary (filled). On click → `POST /api/admin/check-in/send-link`. Show a confirmation toast with masked recipient. On 422 (no contact info) toast the error and fall back to QR.
- "Show QR" → opens a fullscreen overlay with a QR rendered client-side from the URL.

`AvatarUploader.tsx`:
- Hidden `<input type="file" accept="image/*">`; clicking the avatar triggers it.
- On selection, multipart-POSTs to `/api/admin/check-in/upload-photo`.

- [ ] Implement, smoke-test. Add the `GET /api/admin/check-in/event` endpoint in the same task — small server function returning per-event person rows.

```bash
git add src/components/admin/check-in/ src/pages/api/admin/check-in/event.ts
git commit -m "feat(check-in): drawer + send-link actions + photo uploader"
```

---

## Task 20: Self-serve UI

**Files:**
- Create: `src/pages/self-serve/[token].astro`
- Create: `src/components/self-serve/SelfServe.tsx`
- Create: `src/components/self-serve/WaiverCard.tsx`
- Create: `src/components/self-serve/PhotoCard.tsx`

Astro page (`prerender = false`, no middleware gate — token authorizes):
- Resolves the token server-side via `GET /api/self-serve/[token]`. If the token is expired/invalid, render an error page ("This link expired — ask the front desk for a new one").
- Otherwise renders `<SelfServe client:load context={...} />`.

`SelfServe.tsx`:
- Calls `useHydrationBeacon()`.
- Renders outstanding-items as stacked cards.

`WaiverCard.tsx`:
- Waiver text from the org's `waivers` table (type "liability"). For v1: render a static placeholder text + a real text load follow-up; the spec accepts this as a v1 simplification.
- Accept checkbox, typed-name input (prefilled with `signerName`), Save button.
- On Save: `POST /api/self-serve/[token]/waiver`.

`PhotoCard.tsx`:
- `<input type="file" accept="image/*" capture="user">`.
- Live preview after selection.
- Save: multipart POST to `/api/self-serve/[token]/photo`.

After both done, page POSTs `/api/self-serve/[token]/consume` and shows a "You're all set" success state.

- [ ] Implement, smoke-test (curl to mint a token in a test, open the URL in the browser).

```bash
git add src/pages/self-serve/ src/components/self-serve/
git commit -m "feat(check-in): self-serve page + waiver + photo cards"
```

---

## Task 21: Kiosk landing + find-my-booking

**Files:**
- Create: `src/pages/kiosk/[venueSlug]/index.astro`
- Create: `src/components/kiosk/KioskLanding.tsx`
- Create: `src/components/kiosk/FindBooking.tsx`

Astro page passes the venue (resolved via `requireKioskVenue`) to `<KioskLanding />`. Landing has two big buttons: "Find my booking" and "Walk-in registration."

`FindBooking.tsx`:
- Search box → `GET /api/kiosk/[venueSlug]/search?q=`.
- Tapping a result → `POST /api/kiosk/[venueSlug]/token-for-target` → redirect to `/self-serve/[token]`.

- [ ] Implement, smoke-test.

```bash
git add src/pages/kiosk/ src/components/kiosk/KioskLanding.tsx src/components/kiosk/FindBooking.tsx
git commit -m "feat(check-in): kiosk landing + find-my-booking"
```

---

## Task 22: Kiosk walk-in wizard with PaymentElement

**Files:**
- Create: `src/components/kiosk/WalkInWizard.tsx`

5-step wizard:
1. Pick session (today's drop-ins at this venue with capacity).
2. Contact info (with DOB → if minor, add parent fields).
3. Waiver (read + accept + typed signer name).
4. Photo capture.
5. Pay (embedded `<PaymentElement />`).

Each step calls the corresponding API:
- Step 1: just client-side selection.
- Step 2: `POST /api/kiosk/[venueSlug]/walkin/start` → returns `{ token, url }`. Stay on the wizard; the token is used for the next two steps.
- Step 3: `POST /api/self-serve/[token]/waiver`.
- Step 4: `POST /api/self-serve/[token]/photo` (multipart).
- Step 5: `POST /api/kiosk/[venueSlug]/walkin/payment` `{ token }` → returns `{ clientSecret, amountCents }`. Render `<PaymentElement />` (mirror the registration payment step component — read `src/components/registration/payment-step.tsx`).

On payment success → confirmation screen with the player's name + "You're checked in!" and a button to go back to the kiosk landing.

- [ ] Implement, smoke-test the happy path against the staging Stripe test mode.

```bash
git add src/components/kiosk/WalkInWizard.tsx
git commit -m "feat(check-in): kiosk walk-in wizard with embedded PaymentElement"
```

---

## Task 23: Drop-in booking flow waiver step

**Files:**
- Modify: `src/components/dropin/SessionDetail.tsx` and/or `BookButton.tsx`

Add a waiver-acceptance step before the existing `POST /api/dropin/bookings`. The booking endpoint already accepts a `waiverSigned`/`waiverSignedBy` if we extend its body; the new flow:

1. Detail page shows the BookButton.
2. On click, if the user hasn't already signed a current waiver, show an inline modal: waiver text + acknowledge + typed name.
3. On accept, the POST body now includes `{ waiverAccepted: true, waiverName: "..." }`.
4. Endpoint writes these to the new `drop_in_bookings.waiverSigned*` columns.

Modify `src/pages/api/dropin/bookings/index.ts` to accept + write these fields when present.

- [ ] Implement. Existing dropin tests stay green.

```bash
git add src/components/dropin/ src/pages/api/dropin/bookings/index.ts
git commit -m "feat(check-in): drop-in booking flow captures waiver at sign-up"
```

---

## Task 24: Customer dashboard self check-in UI

**Files:**
- Modify: `src/components/dashboard/MyDropInBookings` (locate exact filename).
- Modify: `src/components/dashboard/MyFieldRentals.tsx`.

Add a "Check me in" button to each upcoming row. Visible only when `now` is within `checkInWindowMinutes` of the event's `startsAt`. On click, POST `/api/dashboard/check-in` `{ kind, targetId }`. On 200, refetch. On 422 (out of window) toast the message.

- [ ] Implement, smoke-test.

```bash
git add src/components/dashboard/
git commit -m "feat(check-in): customer dashboard self check-in button"
```

---

## Task 25: Scheduled cleanup for expired tokens

**Files:**
- Create: `src/lib/check-in/cleanup-expired-tokens.ts`
- Create: `src/pages/api/cron/cleanup-self-service-tokens.ts`
- Create: `netlify/functions/scheduled-cleanup-self-service-tokens.ts`
- Test: `tests/api/check-in/cleanup-tokens.test.ts`

Mirror Task 15 of Spec 1's plan (expire-pending-rentals). The cron route deletes `self_service_tokens` rows where `expiresAt < now - 30 days` (a grace period for audit), regardless of consumed state.

- [ ] Implement, test, commit.

```bash
git add src/lib/check-in/cleanup-expired-tokens.ts src/pages/api/cron/cleanup-self-service-tokens.ts netlify/functions/scheduled-cleanup-self-service-tokens.ts tests/api/check-in/cleanup-tokens.test.ts
git commit -m "feat(check-in): scheduled cleanup of expired self-service tokens"
```

---

## Task 26: E2E + seed + pre-push checklist

**Files:**
- Create: `tests/e2e/check-in-flow.spec.ts`
- Create: `tests/e2e/walkin-registration.spec.ts`
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts` if new fixtures are required.

E2E 1 (`check-in-flow.spec.ts`):
- Sign in as admin, open `/admin/check-in`, pick the seed venue.
- Click an event card with a missing waiver, click "Show QR" (avoids SMS/email infra), read the URL from the QR API response (intercept the `/send-link` POST and grab `url`).
- Open the self-serve URL, sign the waiver, take a (test fixture) photo.
- Back on admin dashboard, poll-driven row update flips badges to green within 10s.
- Click "Check in" — badge flips to "Here ✓".

E2E 2 (`walkin-registration.spec.ts`):
- Visit `/kiosk/[venueSlug]` directly.
- Click "Walk-in registration", complete the 5 steps end-to-end including Stripe test-mode payment.
- Confirmation screen appears. Defensive Stripe-not-configured skip per the Spec 1 pattern.

- [ ] Implement both. Then pre-push checklist:
  - `npm run db:seed:e2e` idempotent.
  - Type check zero errors.
  - Build clean.
  - API rentals + check-in test files pass per-file.
  - E2E spec passes.

```bash
git add tests/e2e/check-in-flow.spec.ts tests/e2e/walkin-registration.spec.ts src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "test(check-in): e2e flows + seed updates"
git push -u origin feat/venue-day-and-checkin
```

Then `gh pr create` with a PR body summarizing the new feature, kept rows, and a test plan (mirror Spec 1's PR body shape).

---

## Self-Review

**1. Spec coverage:** Walked through the spec's 11 sections — every one has at least one corresponding task. Data model → T1+T2; phone helpers → T3; tokens → T4+T7; resolveSigner → T5; day-view → T6; photo pipeline → T8; manager APIs → T9–T11; self-serve APIs → T12–T13; kiosk APIs → T14–T15; walk-in webhook → T16; customer self-check-in → T17+T24; UI manager → T18+T19; UI self-serve → T20; UI kiosk → T21+T22; drop-in booking waiver → T23; scheduled cleanup → T25; testing → T9–T26.

**2. Placeholder scan:** Found three soft spots: the `sql` tag in T1 step 3 with `@ts-expect-error` (instructions to fix during implementation), the orgId resolution in T14 step 3's dynamic-import sketch (call-out to refactor), and the v1 `requireKioskVenue` using venue UUID as slug (documented as v1 simplification, with a follow-up note). Each has an explicit instruction to fix or accept the v1 shape rather than being a true unresolved blank. Acceptable.

**3. Type consistency:** `ResolvedSigner` is defined in T5 and used in T11 + T13 — T11's photo upload route needs `familyMemberId` on the interface, which T11's note already calls out for extension. `DayEvent` shape defined in T6 used by T9's endpoint, T18's dashboard. `mintToken` signature defined in T7, called in T10, T14, T15 with matching params. `verifyToken` shape consistent across self-serve endpoints (T12, T13). `PhotoUploadInput.target` discriminated union consistent between T8 implementation and T11/T13 callers.

One genuine gap: I describe the `consents` audit row in the spec but no task explicitly writes it. The waiver endpoints (T12) write the booking/rental columns but don't append to `consents`. Add to T12 step 2: "After the row-update, append a `consents` row of `type: 'liability'`, `signedByUserId` resolved from the token, `signedByName = acceptedName`, `signedAt = now`. Mirrors the registration flow's consent-write pattern in `src/lib/registrations/create-registration.ts`." Fixing inline.

[Fix applied in T12.]
