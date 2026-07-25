# Per-player Rental Waivers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a rental is approved, let the requester add a player roster (name + email, adult or minor); each player/parent signs the liability waiver via an emailed self-serve link; completion is tracked ("X of N signed") with reminder nudges, no hard block.

**Architecture:** A self-contained `field_rental_players` roster table holds the per-player signature record. Signing reuses the existing `self_service_tokens` + `/self-serve/[token]` flow via a new `rental_player` kind. Emails reuse the rental messaging + `MESSAGING_LIVE` gate. Status shows on the requester dashboard + admin rental detail. Nothing gates payment/booking.

**Tech Stack:** Astro 5 (SSR), React 19 islands, Drizzle ORM + PostgreSQL, Vitest (API/unit), reuses `waivers`/`self_service_tokens`/self-serve signing page.

## Global Constraints

- **Both brands** — shared rental flow; brand comes from `field_rentals.brand`.
- **Roster is added AFTER approval by the requester** (renter-owned). The request-time flow is unchanged except the approval hook that auto-adds the requester as player #1 (already signed).
- **Signers:** adults sign own (`signer_email` = their email); minors' parent signs (`is_minor=true`, `signer_email` = parent's). `resolveSigner` is the authority on minor vs adult copy.
- **Tracked, NOT gated:** no rental status transition depends on waiver completion.
- **Self-contained roster:** the `field_rental_players` row IS the signature record. Do NOT write rental players into `family_members` or the user-gated `consents` ledger. Reuse the `waivers` *content* + a sha256 hash for legal proof.
- **No email blasts:** every send respects `MESSAGING_LIVE`; reminders are bounded + stamped (`reminder_sent_at`).
- **Migrations:** `db:generate` → commit → controller applies to staging (prod on merge). Any enum `ADD VALUE` used in the same migration must be isolated in its own migration file (the 55P04 lesson from #419).
- **Self-serve safety:** the token is the capability (same model as existing self-serve); no extra auth on the signing page.
- **Pre-push:** `npm run build`, `npx tsc --noEmit` (0 errors), affected API tests green.
- **SoccerOne can't be browser-verified on localhost** (301 to prod); Aspire `/rentals` + `/dashboard/bookings` + `/self-serve/[token]` ARE verifiable — verify there.

---

## File Structure

- Modify `src/lib/db/schema/field-rentals.ts` — `field_rental_players` table + `field_rental_player_status` enum.
- Modify `src/lib/db/schema/self-service-tokens.ts` — add `rental_player` to `selfServiceTokenKindEnum`.
- Create migration(s) via `db:generate`.
- Modify `src/lib/check-in/resolve-signer.ts` — `rental_player` in `SelfServiceKind` + `SELF_SERVICE_KINDS` + `resolveSigner`.
- Modify `src/lib/self-serve/build-context.ts` — `rental_player` outstanding (waiver-only).
- Modify `src/pages/api/self-serve/[token]/waiver.ts` — `rental_player` branch marks the roster row signed.
- Create `src/lib/rentals/players.ts` — `createRentalPlayer` helper (insert row + mint token + email) + `resolveActiveLiabilityWaiver`.
- Create `src/lib/rentals/messages/player-waiver.ts` — sign-your-waiver + reminder renderers/dispatchers.
- Create `src/pages/api/rentals/bookings/[id]/players/index.ts` (GET/POST) + `[playerId]/index.ts` (DELETE) + `[playerId]/resend.ts` (POST).
- Modify `src/pages/api/admin/rentals/[id].ts` — auto-add requester on approve.
- Create `src/lib/rentals/player-reminders.ts` + `src/pages/api/cron/rental-waiver-reminders.ts` + `netlify/functions/scheduled-rental-waiver-reminders.ts`.
- Modify `src/components/dashboard/MyBookings.tsx` — players panel.
- Modify `src/components/admin/rentals/RentalDetail.tsx` — roster section.
- Tests under `tests/api/rentals/` + `tests/unit/`.

---

## Task 1: Schema — `field_rental_players` + `rental_player` token kind

**Files:**
- Modify: `src/lib/db/schema/field-rentals.ts`, `src/lib/db/schema/self-service-tokens.ts`
- Create: migration(s)

**Interfaces:**
- Produces: table `field_rental_players` (columns per the spec), enum `field_rental_player_status` (`pending`/`signed`), and `rental_player` added to `self_service_token_kind`. Type exports `FieldRentalPlayer`, `NewFieldRentalPlayer`.

- [ ] **Step 1: Add the table + status enum**

In `src/lib/db/schema/field-rentals.ts`, add after the existing rental enums:

```ts
export const fieldRentalPlayerStatusEnum = pgEnum("field_rental_player_status", [
  "pending",
  "signed",
]);
```

And after the `fieldRentals` table (import `waivers` is NOT needed — reference by column only):

```ts
export const fieldRentalPlayers = pgTable(
  "field_rental_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => fieldRentals.id, { onDelete: "cascade" }),
    playerName: text("player_name").notNull(),
    isMinor: boolean("is_minor").notNull().default(false),
    // Adult's own email, or the parent/guardian's for a minor.
    signerEmail: text("signer_email").notNull(),
    status: fieldRentalPlayerStatusEnum("status").notNull().default("pending"),
    // Captured at signing (the parent's name when isMinor).
    signerName: text("signer_name"),
    waiverId: uuid("waiver_id"),
    contentHash: text("content_hash"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedIp: text("signed_ip"),
    signedUa: text("signed_ua"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("field_rental_players_rental_idx").on(t.rentalId),
    index("field_rental_players_pending_idx")
      .on(t.rentalId)
      .where(sql`status = 'pending'`),
  ],
);

export type FieldRentalPlayer = typeof fieldRentalPlayers.$inferSelect;
export type NewFieldRentalPlayer = typeof fieldRentalPlayers.$inferInsert;
```

Ensure `boolean`, `index`, `sql`, `text`, `timestamp`, `uuid`, `pgEnum` are imported at the top of the file (most already are; add any missing).

- [ ] **Step 2: Add the token kind**

In `src/lib/db/schema/self-service-tokens.ts`, add `"rental_player"` to `selfServiceTokenKindEnum` (after `"field_rental"`):

```ts
export const selfServiceTokenKindEnum = pgEnum("self_service_token_kind", [
  "drop_in_booking",
  "field_rental",
  "rental_player",
  "roster_entry",
  "walkin_session",
  "email_consent",
]);
```

- [ ] **Step 3: Generate migration(s)**

Run: `cd /Volumes/MahadData/Aspire-Sports/web-app-player-waivers && ./scripts/with-bws.sh npm run db:generate`
Expected: a migration creating `field_rental_players` + the two `ADD VALUE`/`CREATE TYPE` statements.

- [ ] **Step 4: Isolate enum ADD VALUE if needed**

Open the generated SQL. The NEW type `field_rental_player_status` is created fresh (`CREATE TYPE`) and the table uses it — that's fine in one file (a freshly `CREATE`d type is usable in the same transaction). But the `ALTER TYPE "self_service_token_kind" ADD VALUE 'rental_player'` must NOT be used in the same migration file as anything referencing it — nothing here does (no column defaults to it), so it's safe. Confirm the token-kind add reads `ADD VALUE IF NOT EXISTS 'rental_player'` (edit to add `IF NOT EXISTS` for re-run safety). If drizzle put the `ADD VALUE` and a use of it in one file, split per the 0097/0098 pattern.

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/lib/db/schema/field-rentals.ts src/lib/db/schema/self-service-tokens.ts src/lib/db/migrations
git commit -m "feat(rentals): field_rental_players roster + rental_player token kind"
```

> Controller applies the migration to staging before Task 3's DB test.

---

## Task 2: Self-serve resolution for `rental_player`

**Files:**
- Modify: `src/lib/check-in/resolve-signer.ts`, `src/lib/self-serve/build-context.ts`
- Test: `tests/api/rentals/player-waiver-resolve.test.ts`

**Interfaces:**
- Consumes: `fieldRentalPlayers` (Task 1).
- Produces: `resolveSigner("rental_player", playerId, orgId)` → `ResolvedSigner` for the roster row (adult or minor); `build-context` reports `outstanding = { waiver: !signed, photo: false, payment: false }` for a `rental_player` token.

- [ ] **Step 1: Add the kind to the signer set + type**

In `src/lib/check-in/resolve-signer.ts`: add `"rental_player"` to the `SelfServiceKind` union AND the `SELF_SERVICE_KINDS` set.

- [ ] **Step 2: Resolve the roster row**

Add a branch in `resolveSigner` (after the `field_rental` branch), importing `fieldRentalPlayers`:

```ts
  if (kind === "rental_player") {
    const [p] = await db
      .select()
      .from(fieldRentalPlayers)
      .innerJoin(fieldRentals, eq(fieldRentals.id, fieldRentalPlayers.rentalId))
      .where(
        and(
          eq(fieldRentalPlayers.id, targetId),
          eq(fieldRentals.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!p) return null;
    const row = p.field_rental_players;
    return {
      // Adult signs own; a minor's parent signs — but the name is captured at
      // signing time (signerName), so before signing we show the player name.
      signerName: row.signerName ?? row.playerName,
      displayName: row.playerName,
      recipientEmail: row.signerEmail,
      recipientPhone: null,
      recipientUserId: null,
      familyMemberId: null,
      isMinor: row.isMinor,
    };
  }
```

- [ ] **Step 3: Outstanding = waiver-only in build-context**

In `src/lib/self-serve/build-context.ts`, after the existing kind branches, add a `rental_player` branch that sets `outstanding.waiver` from the row's status and leaves photo/payment false:

```ts
  if (tok.kind === "rental_player") {
    const [p] = await getDb()
      .select({ status: fieldRentalPlayers.status, venueName: venues.name })
      .from(fieldRentalPlayers)
      .innerJoin(fieldRentals, eq(fieldRentals.id, fieldRentalPlayers.rentalId))
      .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
      .where(eq(fieldRentalPlayers.id, tok.targetId))
      .limit(1);
    outstanding.waiver = p ? p.status !== "signed" : false;
    // photo + payment stay false; amountDueCents stays 0.
  }
```

Import `fieldRentalPlayers` in `build-context.ts`. Ensure the returned `spaceName`/`summary` are populated sensibly (venue name; "Sign your waiver to play at {venue}"). Read the file's return shape and fill the fields it requires (don't leave any required field undefined).

- [ ] **Step 4: Failing test**

Create `tests/api/rentals/player-waiver-resolve.test.ts` (direct-DB, like sibling rental tests — use `E2E_ORG_ID`, `E2E_RENTAL_VENUE_ID`):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";
import { resolveSigner } from "@/lib/check-in/resolve-signer";
import { E2E_ORG_ID, E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

let rentalId: string;
let adultId: string;
let minorId: string;

beforeAll(async () => {
  const db = getDb();
  const [r] = await db.insert(fieldRentals).values({
    organizationId: E2E_ORG_ID, venueId: E2E_RENTAL_VENUE_ID, fieldNumber: 40,
    startsAt: new Date(Date.UTC(2040, 0, 1, 12)), endsAt: new Date(Date.UTC(2040, 0, 1, 13)),
    status: "confirmed", source: "online_booking", paymentMethod: "card_online",
    amountDueCents: 5000, renterName: "Roster Host",
  }).returning();
  rentalId = r.id;
  const [a] = await db.insert(fieldRentalPlayers).values({
    rentalId, playerName: "Adult Al", signerEmail: "al@test.aspiresports.com", isMinor: false,
  }).returning();
  const [m] = await db.insert(fieldRentalPlayers).values({
    rentalId, playerName: "Kid Kim", signerEmail: "parent@test.aspiresports.com", isMinor: true,
  }).returning();
  adultId = a.id; minorId = m.id;
});

describe("resolveSigner rental_player", () => {
  it("adult: displayName = player, not minor", async () => {
    const s = await resolveSigner("rental_player", adultId, E2E_ORG_ID);
    expect(s).not.toBeNull();
    expect(s!.isMinor).toBe(false);
    expect(s!.displayName).toBe("Adult Al");
    expect(s!.recipientEmail).toBe("al@test.aspiresports.com");
  });
  it("minor: isMinor true, displayName = child", async () => {
    const s = await resolveSigner("rental_player", minorId, E2E_ORG_ID);
    expect(s!.isMinor).toBe(true);
    expect(s!.displayName).toBe("Kid Kim");
  });
  it("wrong org → null", async () => {
    const s = await resolveSigner("rental_player", adultId, "00000000-0000-0000-0000-000000000000");
    expect(s).toBeNull();
  });
});
```

- [ ] **Step 5: Run (after controller applies Task 1 migration)**

Run: `TEST_BASE_URL=http://localhost:4321 ALLOW_E2E_SEED=yes ./scripts/with-bws.sh npm run test:api -- rentals/player-waiver-resolve`
Expected: PASS. (If it fails on missing table, the controller hasn't applied Task 1's migration yet — report that.)

- [ ] **Step 6: tsc + commit**

Run: `npx tsc --noEmit` → zero errors.
```bash
git add src/lib/check-in/resolve-signer.ts src/lib/self-serve/build-context.ts tests/api/rentals/player-waiver-resolve.test.ts
git commit -m "feat(rentals): resolve rental_player self-serve token (waiver-only)"
```

---

## Task 3: Signing endpoint marks the roster row

**Files:**
- Create: `src/lib/consents/active-waiver.ts` (helper)
- Modify: `src/pages/api/self-serve/[token]/waiver.ts`
- Test: `tests/api/rentals/player-waiver-sign.test.ts`

**Interfaces:**
- Consumes: Task 1 table, Task 2 resolution.
- Produces: signing a `rental_player` token marks the row `signed` with `signer_name`, `waiver_id`, `content_hash`, `signed_at`, ip/ua.
- Produces: `resolveActiveLiabilityWaiver(db, orgId)` → `{ id, contentHash } | null`.

- [ ] **Step 1: Active-waiver helper**

Create `src/lib/consents/active-waiver.ts`:

```ts
import { createHash } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { waivers } from "@/lib/db/schema/consents";

/**
 * The org's current liability waiver (org-specific preferred, else the global
 * default), with a sha256 of its content for tamper-proof audit. Null if none
 * is configured — callers then store a null waiverId and a version string.
 */
export async function resolveActiveLiabilityWaiver(
  db: Database,
  orgId: string | null,
): Promise<{ id: string; contentHash: string } | null> {
  const rows = await db
    .select({ id: waivers.id, content: waivers.content, orgId: waivers.organizationId })
    .from(waivers)
    .where(
      and(
        eq(waivers.type, "liability"),
        isNull(waivers.supersededAt),
        or(eq(waivers.organizationId, orgId ?? ""), isNull(waivers.organizationId)),
      ),
    )
    // Prefer the org-specific row over the global default.
    .orderBy(sql`${waivers.organizationId} nulls last`)
    .limit(1);
  const w = rows[0];
  if (!w) return null;
  return { id: w.id, contentHash: createHash("sha256").update(w.content).digest("hex") };
}
```

- [ ] **Step 2: `rental_player` branch in waiver.ts**

In `src/pages/api/self-serve/[token]/waiver.ts`, add a branch in the kind switch (alongside `field_rental`). Capture ip/ua from headers; resolve the active waiver:

```ts
  } else if (tok.kind === "rental_player") {
    const waiver = await resolveActiveLiabilityWaiver(db, tok.organizationId);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = request.headers.get("user-agent") ?? null;
    await db
      .update(fieldRentalPlayers)
      .set({
        status: "signed",
        signerName: acceptedName,
        waiverId: waiver?.id ?? null,
        contentHash: waiver?.contentHash ?? "v1-liability",
        signedAt: now,
        signedIp: ip,
        signedUa: ua,
      })
      .where(eq(fieldRentalPlayers.id, tok.targetId));
  }
```

Add imports: `fieldRentalPlayers` from `@/lib/db/schema/field-rentals`, `resolveActiveLiabilityWaiver` from `@/lib/consents/active-waiver`. The existing consents-insert block below is gated on `signer?.familyMemberId && signerUserId` — for `rental_player` both are null, so it correctly no-ops (self-contained). Leave it.

- [ ] **Step 3: Failing test**

Create `tests/api/rentals/player-waiver-sign.test.ts`. It seeds a rental + player, mints a `rental_player` token via `mintToken`, POSTs the waiver over HTTP, asserts the row is `signed`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";
import { mintToken } from "@/lib/check-in/tokens-db";
import { E2E_ORG_ID, E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
let token: string;
let playerId: string;

beforeAll(async () => {
  const db = getDb();
  const [r] = await db.insert(fieldRentals).values({
    organizationId: E2E_ORG_ID, venueId: E2E_RENTAL_VENUE_ID, fieldNumber: 41,
    startsAt: new Date(Date.UTC(2041, 0, 1, 12)), endsAt: new Date(Date.UTC(2041, 0, 1, 13)),
    status: "confirmed", source: "online_booking", paymentMethod: "card_online",
    amountDueCents: 5000, renterName: "Sign Host",
  }).returning();
  const [p] = await db.insert(fieldRentalPlayers).values({
    rentalId: r.id, playerName: "Signer Sam", signerEmail: "sam@test.aspiresports.com",
  }).returning();
  playerId = p.id;
  const t = await mintToken({
    kind: "rental_player", targetId: playerId, organizationId: E2E_ORG_ID,
    venueId: E2E_RENTAL_VENUE_ID, sentVia: "email",
    recipientUserId: null, recipientEmail: "sam@test.aspiresports.com", recipientPhone: null,
  });
  token = t.token;
});

describe("sign rental_player waiver", () => {
  it("marks the roster row signed", async () => {
    const res = await fetch(`${BASE}/api/self-serve/${token}/waiver`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptedName: "Signer Sam" }),
    });
    expect(res.status).toBe(200);
    const [after] = await getDb()
      .select({ status: fieldRentalPlayers.status, signerName: fieldRentalPlayers.signerName, signedAt: fieldRentalPlayers.signedAt })
      .from(fieldRentalPlayers).where(eq(fieldRentalPlayers.id, playerId)).limit(1);
    expect(after.status).toBe("signed");
    expect(after.signerName).toBe("Signer Sam");
    expect(after.signedAt).not.toBeNull();
  });
});
```

> Verify `mintToken`'s exact input type first (read `src/lib/check-in/tokens-db.ts`) — if it requires additional fields (e.g. `createdByUserId`, `expiresInHours`), add them.

- [ ] **Step 4: Run**

Run: `TEST_BASE_URL=http://localhost:4321 ALLOW_E2E_SEED=yes ./scripts/with-bws.sh npm run test:api -- rentals/player-waiver-sign`
Expected: PASS.

- [ ] **Step 5: tsc + commit**

```bash
git add src/lib/consents/active-waiver.ts src/pages/api/self-serve/\[token\]/waiver.ts tests/api/rentals/player-waiver-sign.test.ts
git commit -m "feat(rentals): sign rental_player waiver marks roster row (content-hashed)"
```

---

## Task 4: Player-waiver messaging (sign + reminder)

**Files:**
- Create: `src/lib/rentals/messages/player-waiver.ts`
- Test: `tests/unit/rental-player-waiver-messages.test.ts`

**Interfaces:**
- Produces:
  - `renderPlayerWaiverInvite(ctx)` and `renderPlayerWaiverReminder(ctx)` → `{ email: { subject, html, text } }`, brand + minor aware.
  - `dispatchPlayerWaiverInvite(playerId)` and `dispatchPlayerWaiverReminder(playerId)` → `Promise<{ ok: boolean; reason?: string }>` — load the row + rental, render, `sendEmail` (respecting `isEmailConfigured()`), build the `/self-serve/{token}` URL from an existing/most-recent `rental_player` token for the row.

- [ ] **Step 1: Renderer + dispatcher**

Create `src/lib/rentals/messages/player-waiver.ts`. Model structure on `src/lib/rentals/messages/request-lifecycle.ts` (read it first for the exact email wrapper + `sendEmail`/`fromForBrand`/`normalizeBrand` imports). Copy must be a requirement + a link — minor-aware ("You're signing on behalf of {playerName}"). Include:

```ts
export interface PlayerWaiverContext {
  playerName: string;
  isMinor: boolean;
  venueName: string;
  whenLabel: string;
  signUrl: string;
  brand?: BrandId;
}
export async function renderPlayerWaiverInvite(ctx: PlayerWaiverContext): Promise<{ email: { subject: string; html: string; text: string } }> { /* ... */ }
export async function renderPlayerWaiverReminder(ctx: PlayerWaiverContext): Promise<{ email: { subject: string; html: string; text: string } }> { /* ... */ }
```

The dispatchers load the player row + rental (venue name, brand, starts_at) + the row's active `rental_player` token (most recent, unconsumed) to build `signUrl = ${PUBLIC_APP_URL}/self-serve/${token}`. If no token/email, return `{ ok: false, reason }`. Send email-only (roster has no phone). Respect `isEmailConfigured()`.

- [ ] **Step 2: Unit test (pure renderer)**

Create `tests/unit/rental-player-waiver-messages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderPlayerWaiverInvite, renderPlayerWaiverReminder } from "@/lib/rentals/messages/player-waiver";

const base = { playerName: "Jamie", venueName: "Worthington", whenLabel: "Sep 1, 6:00 PM", signUrl: "https://x/self-serve/abc", brand: "soccerone" as const };

describe("player waiver messages", () => {
  it("invite (adult) has link + no parent phrasing", async () => {
    const m = await renderPlayerWaiverInvite({ ...base, isMinor: false });
    expect(m.email.subject).toMatch(/waiver/i);
    expect(m.email.html).toMatch(/self-serve\/abc/);
    expect(m.email.html).not.toMatch(/on behalf of/i);
  });
  it("invite (minor) mentions signing for the child", async () => {
    const m = await renderPlayerWaiverInvite({ ...base, isMinor: true });
    expect(m.email.html).toMatch(/Jamie/);
    expect(m.email.html).toMatch(/behalf|parent|guardian/i);
  });
  it("reminder subject differs", async () => {
    const m = await renderPlayerWaiverReminder({ ...base, isMinor: false });
    expect(m.email.subject).toMatch(/reminder|still|don't forget/i);
  });
});
```

- [ ] **Step 3: Run + commit**

Run: `npx vitest run tests/unit/rental-player-waiver-messages.test.ts` → PASS. `npx tsc --noEmit` → 0 errors.
```bash
git add src/lib/rentals/messages/player-waiver.ts tests/unit/rental-player-waiver-messages.test.ts
git commit -m "feat(rentals): player-waiver invite + reminder messaging"
```

---

## Task 5: Roster endpoints + on-add email + auto-add-requester

**Files:**
- Create: `src/lib/rentals/players.ts` (`createRentalPlayer`)
- Create: `src/pages/api/rentals/bookings/[id]/players/index.ts` (GET/POST), `[playerId]/index.ts` (DELETE), `[playerId]/resend.ts` (POST)
- Modify: `src/pages/api/admin/rentals/[id].ts` (auto-add requester on approve)
- Test: `tests/api/rentals/players.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `createRentalPlayer({ db, rental, playerName, signerEmail, isMinor, createdByUserId })` → inserts the row, mints a `rental_player` token, dispatches the invite; returns the row. Roster endpoints (renter-owned). Approve hook inserts the requester as a `signed` player.

- [ ] **Step 1: `createRentalPlayer` helper**

Create `src/lib/rentals/players.ts`:

```ts
import { getDb } from "@/lib/db";
import { fieldRentalPlayers, type FieldRental } from "@/lib/db/schema/field-rentals";
import { mintToken } from "@/lib/check-in/tokens-db";
import { dispatchPlayerWaiverInvite } from "@/lib/rentals/messages/player-waiver";

export async function createRentalPlayer(input: {
  rental: FieldRental;
  playerName: string;
  signerEmail: string;
  isMinor: boolean;
  createdByUserId: string | null;
}): Promise<{ id: string }> {
  const db = getDb();
  const [row] = await db
    .insert(fieldRentalPlayers)
    .values({
      rentalId: input.rental.id,
      playerName: input.playerName,
      signerEmail: input.signerEmail,
      isMinor: input.isMinor,
      status: "pending",
    })
    .returning();
  await mintToken({
    kind: "rental_player",
    targetId: row.id,
    organizationId: input.rental.organizationId,
    venueId: input.rental.venueId,
    sentVia: "email",
    recipientUserId: null,
    recipientEmail: input.signerEmail,
    recipientPhone: null,
    createdByUserId: input.createdByUserId,
  });
  await dispatchPlayerWaiverInvite(row.id).catch((e) =>
    console.error("[rentals] player waiver invite dispatch failed", e),
  );
  return { id: row.id };
}
```

> Match `mintToken`'s real input shape (read `tokens-db.ts`; drop `createdByUserId` if not accepted).

- [ ] **Step 2: Roster endpoints**

Create `src/pages/api/rentals/bookings/[id]/players/index.ts`:
- `GET`: renter-owned (`rental.renterUserId === locals.user.id`) → return roster rows (`id, playerName, isMinor, signerEmail, status, signedAt`) + `{ signed, total }`.
- `POST` `{ playerName, signerEmail, isMinor }`: validate (non-empty name, valid email, length ≤ 320); renter-owned; load rental; `createRentalPlayer(...)`; 200 with the row. Rate-limit per rental (e.g. `rateLimit(\`rental-players:${id}\`, 20, 60_000)`) so the roster can't be flooded.

Create `[playerId]/index.ts` `DELETE`: renter-owned; only a `pending` row may be removed; 200.
Create `[playerId]/resend.ts` `POST`: renter-owned; re-mint token (mintToken reuses an existing unconsumed one) + `dispatchPlayerWaiverInvite`; rate-limited.

All use `locals.user` auth (401 if absent) and the ownership check against `field_rentals.renterUserId`.

- [ ] **Step 3: Auto-add requester on approve**

In `src/pages/api/admin/rentals/[id].ts`, in the approve branch (both the `amountDueCents === 0 → confirmed` and the `→ pending_payment` paths), after the status update + before the dispatch, insert the requester as a signed player (only if the rental has a `renterUserId` and no player row exists yet for the rental). Add a helper insert:

```ts
    // Auto-add the requester as player #1 — they accepted the waiver at request
    // time, so record them as already signed (no email needed).
    await db.insert(fieldRentalPlayers).values({
      rentalId,
      playerName: rental.renterName,
      signerEmail: rental.renterEmail ?? "",
      isMinor: false,
      status: "signed",
      signerName: rental.waiverSignedBy ?? rental.renterName,
      signedAt: rental.waiverSignedAt ?? new Date(),
    }).onConflictDoNothing();
```

Import `fieldRentalPlayers`. (If `renterEmail` may be null and the column is NOT NULL, coalesce to `""` as above — the requester row isn't emailed.)

- [ ] **Step 4: API test**

Create `tests/api/rentals/players.test.ts` — parent cookie + a seeded `confirmed` rental owned by the parent user; assert POST adds a row (200) + GET shows it + count; DELETE removes a pending; 403 for a non-owner. (Mirror `tests/api/rentals/pay.test.ts`'s setup: parent user id via `/api/auth/me`, `E2E_ORG_ID`, `E2E_RENTAL_VENUE_ID`.) Assert the roster `GET` returns `{ signed, total }`.

- [ ] **Step 5: Run + commit**

Run: `TEST_BASE_URL=http://localhost:4321 ALLOW_E2E_SEED=yes ./scripts/with-bws.sh npm run test:api -- rentals/players`
Expected: PASS. `npx tsc --noEmit` → 0 errors.
```bash
git add src/lib/rentals/players.ts src/pages/api/rentals/bookings/\[id\]/players src/pages/api/admin/rentals/\[id\].ts tests/api/rentals/players.test.ts
git commit -m "feat(rentals): roster endpoints + on-add invite + auto-add requester on approve"
```

---

## Task 6: Reminder cron

**Files:**
- Create: `src/lib/rentals/player-reminders.ts`, `src/pages/api/cron/rental-waiver-reminders.ts`, `netlify/functions/scheduled-rental-waiver-reminders.ts`
- Test: `tests/api/rentals/player-reminders.test.ts`

**Interfaces:**
- Produces: `remindPendingRentalPlayers(): Promise<{ reminded: number }>` — for each `pending` player whose rental starts in the future and whose `reminder_sent_at` is null or older than 24h, dispatch a reminder + stamp `reminder_sent_at`. Bounded, idempotent.

- [ ] **Step 1: Sweep**

Create `src/lib/rentals/player-reminders.ts`:

```ts
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentalPlayers, fieldRentals } from "@/lib/db/schema/field-rentals";
import { dispatchPlayerWaiverReminder } from "@/lib/rentals/messages/player-waiver";

const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function remindPendingRentalPlayers(): Promise<{ reminded: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - REMINDER_INTERVAL_MS);
  const rows = await getDb()
    .select({ id: fieldRentalPlayers.id })
    .from(fieldRentalPlayers)
    .innerJoin(fieldRentals, eq(fieldRentals.id, fieldRentalPlayers.rentalId))
    .where(
      and(
        eq(fieldRentalPlayers.status, "pending"),
        gt(fieldRentals.startsAt, now),
        or(isNull(fieldRentalPlayers.reminderSentAt), lt(fieldRentalPlayers.reminderSentAt, cutoff)),
      ),
    )
    .limit(200);
  let reminded = 0;
  for (const r of rows) {
    const res = await dispatchPlayerWaiverReminder(r.id).catch(() => ({ ok: false }));
    // Stamp regardless of send outcome so a hard-bouncing address isn't retried every run.
    await getDb().update(fieldRentalPlayers).set({ reminderSentAt: now }).where(eq(fieldRentalPlayers.id, r.id));
    if (res.ok) reminded++;
  }
  return { reminded };
}
```

- [ ] **Step 2: Cron endpoint + schedule**

Create `src/pages/api/cron/rental-waiver-reminders.ts` mirroring `src/pages/api/cron/expire-pending-rentals.ts` (same `CRON_SECRET` auth, `warmDbConnection()`, response shape) calling `remindPendingRentalPlayers()`. Create `netlify/functions/scheduled-rental-waiver-reminders.ts` mirroring the sibling scheduled function (a daily or twice-daily cron; copy the sibling's cadence declaration and adjust the path + name).

- [ ] **Step 3: Test**

Create `tests/api/rentals/player-reminders.test.ts` (direct-DB): seed a `pending` player on a future-dated rental with `reminderSentAt=null`; call `remindPendingRentalPlayers()`; assert `reminded >= 1` and the row's `reminderSentAt` is stamped; seed a second `pending` player with a recent `reminderSentAt` and assert it's NOT re-stamped (skipped).

- [ ] **Step 4: Run + commit**

Run: `TEST_BASE_URL=http://localhost:4321 ALLOW_E2E_SEED=yes ./scripts/with-bws.sh npm run test:api -- rentals/player-reminders`
Expected: PASS. `npx tsc --noEmit` → 0 errors.
```bash
git add src/lib/rentals/player-reminders.ts src/pages/api/cron/rental-waiver-reminders.ts netlify/functions/scheduled-rental-waiver-reminders.ts tests/api/rentals/player-reminders.test.ts
git commit -m "feat(rentals): reminder cron for unsigned player waivers"
```

---

## Task 7: UI — requester dashboard panel + admin roster section

**Files:**
- Modify: `src/components/dashboard/MyBookings.tsx`
- Modify: `src/components/admin/rentals/RentalDetail.tsx`

**Interfaces:**
- Consumes: the roster endpoints (Task 5).
- Produces: a "Players & waivers" panel on the requester's approved rental (add player, X of N signed, resend) and a read-only roster section on the admin rental detail.

- [ ] **Step 1: Requester panel (MyBookings)**

In `src/components/dashboard/MyBookings.tsx`, for a rental item whose status is `pending_payment` or `confirmed`, render a "Players & waivers" panel: fetch `GET /api/rentals/bookings/${id}/players`, show "{signed} of {total} signed", list players (name · status), an add-player mini-form (name, email, minor checkbox) → `POST .../players`, and a "Resend" per pending player → `POST .../players/${playerId}/resend`. Read the file's rental-card structure and add the panel within/under the card, using the existing dashboard tokens (`Button`, stone/cream). Keep it collapsed-by-default if the card is dense.

- [ ] **Step 2: Admin roster section (RentalDetail)**

In `src/components/admin/rentals/RentalDetail.tsx`, add a "Players & waivers" section that fetches the roster (admin can read via the same `GET /api/rentals/bookings/${id}/players` only if that endpoint allows admin; if not, add an admin GET on `/api/admin/rentals/${id}` response or a small admin players GET). Show "{signed} of {total} signed" + rows (name, adult/minor, status, signedAt) + a resend action. Read-only otherwise.

> Decide the admin read path: simplest is to include the roster in the existing `GET /api/admin/rentals/[id]` response (add a `players` array) — do that rather than reusing the renter-owned endpoint (which checks `renterUserId`, not admin). Note this in the report.

- [ ] **Step 3: Build + tsc**

Run: `./scripts/with-bws.sh npm run build` → succeeds; `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Browser check (Aspire, controller-assisted)**

The requester panel is on `/dashboard/bookings` (Aspire-reachable). Controller: sign in as parent with a seeded approved rental, confirm the panel renders, add a player, confirm it appears + "1 of N". SoccerOne verified on prod post-deploy.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/MyBookings.tsx src/components/admin/rentals/RentalDetail.tsx
git commit -m "feat(rentals): players & waivers panel (dashboard + admin)"
```

---

## Final verification (before PR)

- [ ] `npx tsc --noEmit` → 0 errors; `./scripts/with-bws.sh npm run build` → Complete.
- [ ] `TEST_BASE_URL=http://localhost:4321 ALLOW_E2E_SEED=yes ./scripts/with-bws.sh npm run test:api -- rentals` → green (transient Railway blips re-run clean); unit messages pass.
- [ ] Controller applied the Task 1 migration to staging (and it applies to prod on merge).
- [ ] Manual (Aspire): approve a request → requester adds a player → invite email fires (MESSAGING_MOCK) → open the `/self-serve/[token]` link → sign → roster shows signed + "X of N"; admin rental detail shows the roster.

## Spec coverage check

Spec §1 (schema) → T1; §2 (roster capture endpoints) → T5; §3 (signing reuse) → T2+T3; §4 (emails+reminders) → T4+T6; §5 (tracking surfaces) → T7; §6 (tests) → each task; auto-add requester → T5; self-contained/no-consents → T1/T3; no gating → nothing gates status (verified across T5/T7).
