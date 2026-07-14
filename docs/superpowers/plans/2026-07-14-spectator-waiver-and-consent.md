# Spectator Waiver + Channel-Aware Consent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone entering the facility sign a liability waiver at the kiosk, and turn the ones who opt in into verified, convertible marketing contacts — per channel, with consent that stands up to a carrier review.

**Architecture:** A new kiosk mode (`spectator`) writes a lightweight `spectator_waivers` record — no booking, no token, no payment. Ticking a marketing box (never the waiver alone) creates a passwordless `users` row and a **per-channel** consent record. Email is verified by double opt-in; SMS by OTP; WhatsApp consent is captured but parked until the channel can deliver. A dormant channel records consent and queues the confirmation rather than failing.

**Tech Stack:** Astro 5, React 19, Drizzle ORM, Postgres, Tailwind 4, Resend, Twilio/Zernio SMS, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-14-spectator-waiver-and-consent-design.md`

**Branch:** `feat/spectator-waiver-and-consent` (already cut). **Worktree:** `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/command-center-polish` — run every command from here; do NOT `cd` to the main checkout.

## Global Constraints

- **Every opt-in checkbox ships UNCHECKED.** A pre-checked box is exactly what got the 10DLC registration **declined on 2026-07-13**. Enforce with a test.
- **Store the exact opt-in text shown** with each consent record. The carrier reviewer asks to see the live form; the stored evidence must match what was displayed.
- **Marketing consent is separable from the waiver.** The waiver is a condition of entry. It must be possible to sign it while declining every channel.
- **No raw Tailwind palette classes** (`stone-*`, `bg-white`, `emerald-*`, `amber-*`). Use design tokens (`bg-paper`, `text-ink`, `text-ink-muted`, `border-border`, …). **Accent tokens (`sage`, `ochre`) are NEVER a text color** — they don't invert across brands and land at ~2:1 on the light one. Semantic color = tint + border, text on ink tokens.
- **No `<a>` tags and no `window.location` in `src/components/kiosk/` or `src/pages/kiosk/`.** The kiosk is a mounted, unattended iPad; every link is an escape hatch. `grep` must return zero.
- **Every input ≥16px** (`text-base`). Below that, iOS Safari zooms the viewport on focus and never zooms back.
- **Migrations must be idempotent** (`ADD COLUMN IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object THEN null; END $$;`) per the 0023/0024 convention — prod has been `db:push`-drifted before. Drizzle does NOT generate this form; hand-edit after `db:generate`.
- **Multi-tenant hazard:** any query picking a row from a set needs a deterministic `orderBy` — the staging/CI DB accumulates rows.
- **Test fixtures that seed a drop-in session anchor to `now`,** never a fixed UTC hour. A fixed hour is a time-of-day lottery; it broke `main` on 2026-07-14.
- `npx tsc --noEmit` → zero errors. Full Playwright runs **post-merge only**, so run new E2E specs locally before merging.

## File Structure

**Create:**
- `src/lib/db/schema/spectators.ts` — `spectator_waivers` table.
- `src/lib/consent/channels.ts` — the `ConsentChannel` type + the single source of the opt-in copy shown to customers (so the stored text and the rendered text cannot drift).
- `src/lib/consent/record.ts` — `recordConsent()`, `getConsent()`, staleness helper.
- `src/pages/api/kiosk/[locationSlug]/spectator/lookup.ts` — phone → existing valid waiver?
- `src/pages/api/kiosk/[locationSlug]/spectator/sign.ts` — create waiver + user + consents.
- `src/pages/api/consent/confirm/[token].ts` — email double-opt-in confirmation.
- `src/pages/api/cron/flush-parked-consents.ts` — retry when a dormant channel wakes.
- `netlify/functions/scheduled-flush-parked-consents.ts`
- `src/components/kiosk/SpectatorFlow.tsx` — the kiosk mode.
- `src/components/kiosk/ConsentBoxes.tsx` — the three unchecked boxes.
- Tests: `tests/unit/consent-channels.test.ts`, `tests/unit/consent-staleness.test.ts`, `tests/api/consent/channel-isolation.test.ts`, `tests/api/kiosk/spectator.test.ts`, `tests/e2e/kiosk-spectator.spec.ts`

**Modify:**
- `src/lib/db/schema/phone-verifications.ts` — add `channel` to `phoneOptIns`.
- `src/lib/sms/send.ts` — scope the opt-in gate to `channel='sms'`; add `channel_dormant`.
- `src/lib/sms/opt-in.ts`, `src/lib/sms/compliance.ts` — scope every query by channel.
- `src/lib/messaging/inbound-whatsapp.ts` — scope to `channel='whatsapp'`.
- `src/components/kiosk/KioskRoot.tsx` — add the `spectator` mode.

---

### Task 1: `channel` on `phone_opt_ins` — and the call-site sweep that stops SMS breaking

**This is the riskiest task in the plan.** `phone_opt_ins` today has one row per `(organization_id, phone)`. `sendSms` gates on `optIn[0]` — the *first* row. The moment a phone can have both an `sms` row and a `whatsapp` row, `optIn[0]` may be the **WhatsApp** row, and **WhatsApp consent would silently decide whether an SMS is allowed to send.** That is a compliance bug, not a bug-bug.

**Files:**
- Modify: `src/lib/db/schema/phone-verifications.ts`
- Create: `src/lib/db/migrations/NNNN_*.sql` (via `npm run db:generate`, then hand-edit for idempotency)
- Modify: `src/lib/sms/send.ts`, `src/lib/sms/opt-in.ts`, `src/lib/sms/compliance.ts`, `src/lib/messaging/inbound-whatsapp.ts`
- Test: `tests/api/consent/channel-isolation.test.ts`

**Interfaces:**
- Produces: `phoneOptIns.channel: 'sms' | 'whatsapp'` (NOT NULL, default `'sms'`); unique index `(organization_id, phone, channel)`.

- [ ] **Step 1: Write the failing test — WhatsApp consent must not decide SMS**

```ts
// tests/api/consent/channel-isolation.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { and, eq } from "drizzle-orm";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { sendSms } from "@/lib/sms/send";

const PHONE = `555${Date.now().toString().slice(-7)}`;

describe("consent is per-channel", () => {
  afterAll(async () => {
    await getDb().delete(phoneOptIns).where(eq(phoneOptIns.phone, PHONE));
  });

  it("a WhatsApp opt-in does NOT authorise an SMS send", async () => {
    // The ONLY consent on file is WhatsApp. SMS must still be refused.
    await getDb().insert(phoneOptIns).values({
      organizationId: E2E_ORG_ID,
      phone: PHONE,
      channel: "whatsapp",
      status: "opted_in",
      optedInAt: new Date(),
      optInSource: "test",
    });

    const res = await sendSms({
      organizationId: E2E_ORG_ID,
      to: PHONE,
      body: "should not send",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_opted_in");
  });

  it("both channels coexist on one phone without overwriting each other", async () => {
    await getDb().insert(phoneOptIns).values({
      organizationId: E2E_ORG_ID,
      phone: PHONE,
      channel: "sms",
      status: "opted_in",
      optedInAt: new Date(),
      optInSource: "test",
    });

    const rows = await getDb()
      .select()
      .from(phoneOptIns)
      .where(and(eq(phoneOptIns.organizationId, E2E_ORG_ID), eq(phoneOptIns.phone, PHONE)));

    // The old unique index on (org, phone) made this impossible.
    expect(rows.length).toBe(2);
    expect(new Set(rows.map((r) => r.channel))).toEqual(new Set(["sms", "whatsapp"]));
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Start the dev server first. Run:
`TEST_BASE_URL=http://localhost:4331 ./scripts/with-bws.sh npx vitest run tests/api/consent/channel-isolation.test.ts`
Expected: FAIL — `channel` is not a column, and the unique index on `(org, phone)` rejects the second insert.

- [ ] **Step 3: Add the column to the schema**

In `src/lib/db/schema/phone-verifications.ts`, inside `phoneOptIns`:

```ts
    // Consent is per CHANNEL. SMS (TCPA / 10DLC) and WhatsApp (Meta policy) are
    // legally distinct consents — a single status per (org, phone) cannot
    // honestly represent "yes to SMS, no to WhatsApp", and sendSms's gate reads
    // the FIRST matching row, so a WhatsApp row could otherwise authorise an SMS.
    channel: varchar("channel", { length: 20 }).notNull().default("sms"),
```

and change the index:

```ts
  (table) => ({
    orgPhoneChannelIdx: uniqueIndex("idx_phone_opt_ins_org_phone_channel").on(
      table.organizationId,
      table.phone,
      table.channel,
    ),
  }),
```

- [ ] **Step 4: Generate the migration and make it idempotent**

```bash
./scripts/with-bws.sh npm run db:generate
```

Then hand-edit the generated `src/lib/db/migrations/NNNN_*.sql` — drizzle emits non-idempotent DDL and this repo's prod has been `db:push`-drifted:

```sql
-- Consent is per-channel. Existing rows are all SMS consents (the table was
-- built for 10DLC), so the backfill default is correct by construction.
ALTER TABLE "phone_opt_ins" ADD COLUMN IF NOT EXISTS "channel" varchar(20) DEFAULT 'sms' NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "idx_phone_opt_ins_org_phone";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_phone_opt_ins_org_phone_channel"
  ON "phone_opt_ins" ("organization_id","phone","channel");
```

- [ ] **Step 5: Sweep EVERY call site — this is the whole point of the task**

`grep -rn "phoneOptIns" src/` and scope each query. Specifically:

**`src/lib/sms/send.ts`** — the gate. Find the `optIn` select and add the channel predicate:

```ts
    const optIn = await db
      .select()
      .from(phoneOptIns)
      .where(
        and(
          eq(phoneOptIns.organizationId, organizationId),
          eq(phoneOptIns.phone, normalized),
          // Without this, optIn[0] can be the WhatsApp row and WhatsApp consent
          // would decide whether we may send an SMS.
          eq(phoneOptIns.channel, "sms"),
        ),
      )
      .limit(1);
```

**`src/lib/sms/opt-in.ts`** — both `.insert(phoneOptIns)` calls set `channel: "sms"`, and any `onConflict` target becomes `(organizationId, phone, channel)`.

**`src/lib/sms/compliance.ts`** — the STOP/START handlers update `.where(eq(phoneOptIns.phone, phone))` with **no org and no channel**. Scope them to `channel = 'sms'`. Document the semantics in a comment:

```ts
  // An SMS STOP opts the sender out of SMS. It does NOT revoke WhatsApp consent
  // — they are distinct consents under distinct regimes, and a person who
  // texted STOP has not said anything about WhatsApp. A WhatsApp opt-out
  // arrives on the WhatsApp inbound path and scopes itself the same way.
```

**`src/lib/messaging/inbound-whatsapp.ts:156`** — scope its select to `eq(phoneOptIns.channel, "whatsapp")`.

- [ ] **Step 6: Run the test**

`TEST_BASE_URL=http://localhost:4331 ./scripts/with-bws.sh npx vitest run tests/api/consent/channel-isolation.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 7: Run the whole SMS suite — you have changed a gate that money and compliance depend on**

```bash
TEST_BASE_URL=http://localhost:4331 ./scripts/with-bws.sh npx vitest run tests/api/ tests/unit/
npx tsc --noEmit
```
Expected: no regressions. If an existing SMS test fails, the call-site sweep is incomplete — fix the sweep, not the test.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema/phone-verifications.ts src/lib/db/migrations src/lib/sms src/lib/messaging/inbound-whatsapp.ts tests/api/consent/channel-isolation.test.ts
git commit -m "feat(consent): make phone opt-ins per-channel

sendSms gated on optIn[0] — the first row for (org, phone). Once a phone can
carry both an SMS and a WhatsApp consent, that first row could be the WhatsApp
one, so WhatsApp consent would silently decide whether an SMS may send. SMS
(TCPA/10DLC) and WhatsApp (Meta) are distinct consents; the table now models
them as such."
```

---

### Task 2: `channel_dormant` — a channel that cannot deliver is not an error

**Files:**
- Modify: `src/lib/sms/send.ts`
- Test: `tests/unit/sms-dormant-channel.test.ts`

**Interfaces:**
- Produces: `SendSmsResult` gains `reason: "channel_dormant"`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sms-dormant-channel.test.ts
import { describe, it, expect } from "vitest";
import { classifyProviderError } from "@/lib/sms/send";

describe("dormant channel classification", () => {
  it("treats 'under carrier review' as dormant, not a provider error", () => {
    // The documented response while a 10DLC registration is unapproved
    // (docs/operations/zernio-sms-unpark-checklist.md). It is not a failure —
    // the channel simply is not awake yet, and the consent must be kept.
    const err = new Error("403 Your SMS registration is still under carrier review.");
    expect(classifyProviderError(err)).toBe("channel_dormant");
  });

  it("a genuine carrier failure stays a provider_error", () => {
    expect(classifyProviderError(new Error("502 carrier failure"))).toBe("provider_error");
  });

  it("a missing sender is a configuration fault, not dormancy", () => {
    expect(
      classifyProviderError(new Error("404 No SMS-enabled number matches from")),
    ).toBe("not_configured");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

`npx vitest run tests/unit/sms-dormant-channel.test.ts`
Expected: FAIL — `classifyProviderError` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/sms/send.ts`, add `"channel_dormant"` to the `reason` union, and export:

```ts
/**
 * Map a provider transport error to a reason.
 *
 * "Dormant" is not "broken". While a 10DLC registration is under carrier review
 * a send returns `403 … still under carrier review` — the number is real, the
 * consent is real, the channel is simply not awake yet. Callers must keep the
 * consent and park the message, not discard it. See
 * docs/operations/zernio-sms-unpark-checklist.md.
 */
export function classifyProviderError(
  err: unknown,
): "channel_dormant" | "not_configured" | "provider_error" {
  const msg = err instanceof Error ? err.message : String(err);
  if (/under carrier review/i.test(msg)) return "channel_dormant";
  if (/no sms-enabled number matches/i.test(msg)) return "not_configured";
  return "provider_error";
}
```

and in `sendSms`'s `catch`, replace the hardcoded `"provider_error"` with `classifyProviderError(err)`.

- [ ] **Step 4: Run tests, typecheck, commit**

```bash
npx vitest run tests/unit/sms-dormant-channel.test.ts
npx tsc --noEmit
git add src/lib/sms/send.ts tests/unit/sms-dormant-channel.test.ts
git commit -m "feat(sms): classify an unapproved carrier registration as channel_dormant"
```

---

### Task 3: The consent module — one source for the copy, one source for the rules

**Files:**
- Create: `src/lib/consent/channels.ts`, `src/lib/consent/record.ts`
- Test: `tests/unit/consent-channels.test.ts`, `tests/unit/consent-staleness.test.ts`

**Interfaces:**
- Consumes: `phoneOptIns.channel` (Task 1).
- Produces:
  - `type ConsentChannel = "email" | "sms" | "whatsapp"`
  - `CONSENT_COPY: Record<ConsentChannel, string>`
  - `recordConsent(opts: { db; organizationId: string; userId: string; channel: ConsentChannel; phone?: string; email?: string; source: string; textShown: string }): Promise<void>`
  - `isConsentStale(optedInAt: Date, now?: Date): boolean`
  - `CONSENT_STALE_AFTER_DAYS = 90`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/consent-channels.test.ts
import { describe, it, expect } from "vitest";
import { CONSENT_COPY, CONSENT_CHANNELS } from "@/lib/consent/channels";

describe("consent copy", () => {
  it("has copy for every channel", () => {
    for (const c of CONSENT_CHANNELS) {
      expect(CONSENT_COPY[c], `missing copy for ${c}`).toBeTruthy();
    }
  });

  it("never phrases an opt-in as a condition of entry", () => {
    // The waiver is a condition of entry. Consent obtained as a condition of
    // something else is not consent — and a carrier reviewer reads this copy.
    for (const c of CONSENT_CHANNELS) {
      expect(CONSENT_COPY[c].toLowerCase()).not.toMatch(/required|must|to enter/);
    }
  });
});
```

```ts
// tests/unit/consent-staleness.test.ts
import { describe, it, expect } from "vitest";
import { isConsentStale, CONSENT_STALE_AFTER_DAYS } from "@/lib/consent/record";

const DAY = 86_400_000;

describe("parked consent goes stale", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  it("a fresh consent is usable", () => {
    expect(isConsentStale(new Date(now.getTime() - 10 * DAY), now)).toBe(false);
  });

  it("a consent older than 90 days must be re-confirmed, not blasted", () => {
    // Ticked at a kiosk in July, channel goes live in October. Messaging them
    // silently three months later is how a WABA gets flagged.
    expect(isConsentStale(new Date(now.getTime() - 91 * DAY), now)).toBe(true);
  });

  it("the boundary is inclusive of the 90th day", () => {
    expect(isConsentStale(new Date(now.getTime() - CONSENT_STALE_AFTER_DAYS * DAY), now)).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run them and see them fail**

`npx vitest run tests/unit/consent-channels.test.ts tests/unit/consent-staleness.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement `channels.ts`**

```ts
// src/lib/consent/channels.ts
/**
 * The single source of the opt-in copy shown to customers.
 *
 * It lives here, not in the component, because the exact text displayed must be
 * STORED with each consent record: a carrier reviewer asks to see the live
 * opt-in form and compares it against the consent evidence. If the component
 * rendered one sentence and we stored another, the evidence is worthless.
 *
 * None of this copy may frame consent as a condition of entry — the waiver is
 * the condition of entry, and consent obtained as a condition of something else
 * is not consent.
 */
export const CONSENT_CHANNELS = ["email", "sms", "whatsapp"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const CONSENT_COPY: Record<ConsentChannel, string> = {
  email:
    "Email me about sessions, leagues and offers. I can unsubscribe any time.",
  sms:
    "Text me about sessions, leagues and offers. Message and data rates may apply. Reply STOP to opt out.",
  whatsapp:
    "Message me on WhatsApp about sessions, leagues and offers. I can opt out any time.",
};
```

- [ ] **Step 4: Implement `record.ts`**

```ts
// src/lib/consent/record.ts
import { and, eq } from "drizzle-orm";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { users } from "@/lib/db/schema/users";
import type { ConsentChannel } from "./channels";

/**
 * A consent parked while its channel was dormant, then flushed months later, is
 * exactly what gets a sender flagged. Past this age we re-confirm rather than
 * message.
 */
export const CONSENT_STALE_AFTER_DAYS = 90;

export function isConsentStale(optedInAt: Date, now: Date = new Date()): boolean {
  const ageDays = (now.getTime() - optedInAt.getTime()) / 86_400_000;
  return ageDays > CONSENT_STALE_AFTER_DAYS;
}

type Db = ReturnType<typeof import("@/lib/db").getDb>;

/**
 * Record consent for ONE channel. Never call this for a channel the customer
 * did not explicitly tick — the caller passes exactly the channels whose boxes
 * were checked, and `textShown` is the literal sentence they saw.
 */
export async function recordConsent(opts: {
  db: Db;
  organizationId: string;
  userId: string;
  channel: ConsentChannel;
  phone?: string;
  email?: string;
  source: string;
  textShown: string;
}): Promise<void> {
  const now = new Date();

  if (opts.channel === "email") {
    // Email consent is NOT active until the double-opt-in link is clicked; the
    // confirmation endpoint sets emailVerified. Marketing selects on
    // emailVerified && !marketingOptedOutAt, so recording intent here cannot
    // put an unverified address on the list.
    await opts.db
      .update(users)
      .set({ marketingOptedOutAt: null, updatedAt: now })
      .where(eq(users.id, opts.userId));
    return;
  }

  if (!opts.phone) throw new Error(`recordConsent: ${opts.channel} requires a phone`);

  await opts.db
    .insert(phoneOptIns)
    .values({
      organizationId: opts.organizationId,
      userId: opts.userId,
      phone: opts.phone,
      channel: opts.channel,
      status: "opted_in",
      optedInAt: now,
      optInSource: opts.source,
      consentTextShown: opts.textShown,
    })
    .onConflictDoUpdate({
      target: [phoneOptIns.organizationId, phoneOptIns.phone, phoneOptIns.channel],
      set: {
        status: "opted_in",
        optedInAt: now,
        optedOutAt: null,
        optInSource: opts.source,
        consentTextShown: opts.textShown,
        updatedAt: now,
      },
    });
}
```

- [ ] **Step 5: `consentTextShown` needs a column — add it in the same migration family as Task 1**

In `src/lib/db/schema/phone-verifications.ts`, add to `phoneOptIns`:

```ts
    // The literal sentence the customer saw when they ticked the box. A carrier
    // reviewer compares the live form against the consent evidence; if they
    // disagree, the evidence proves nothing.
    consentTextShown: text("consent_text_shown"),
```

Regenerate, and hand-edit for idempotency:
```sql
ALTER TABLE "phone_opt_ins" ADD COLUMN IF NOT EXISTS "consent_text_shown" text;
```

- [ ] **Step 6: Run tests, typecheck, commit**

```bash
npx vitest run tests/unit/consent-channels.test.ts tests/unit/consent-staleness.test.ts
npx tsc --noEmit
git add src/lib/consent src/lib/db/schema/phone-verifications.ts src/lib/db/migrations tests/unit/consent-channels.test.ts tests/unit/consent-staleness.test.ts
git commit -m "feat(consent): per-channel consent recording with stored opt-in text and a staleness rule"
```

---

### Task 4: `spectator_waivers`

**Files:**
- Create: `src/lib/db/schema/spectators.ts`
- Modify: `src/lib/db/schema/index.ts` (export it)
- Create: migration
- Test: covered by Task 5's API tests

**Interfaces:**
- Produces: `spectatorWaivers` table.

- [ ] **Step 1: Write the schema**

```ts
// src/lib/db/schema/spectators.ts
import { index, pgTable, text, timestamp, uuid, varchar, boolean } from "drizzle-orm/pg-core";
import { organizations, locations } from "./organizations";
import { users } from "./users";

/**
 * A liability waiver for someone ENTERING the facility, not playing in it.
 *
 * Deliberately NOT a booking: a spectator has no session, no capacity, no
 * payment, no self-serve token. Threading "no booking" special-cases through
 * the money-handling code would be the wrong trade.
 *
 * userId is nullable ON PURPOSE. Signing a waiver makes you a signature.
 * Ticking a marketing opt-in makes you a user. Someone who signs and walks in
 * without opting in never gets an account they did not ask for.
 */
export const spectatorWaivers = pgTable(
  "spectator_waivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    email: varchar("email", { length: 255 }),

    // A minor spectator (a sibling brought along to watch) is signed for by a
    // guardian — the same rule as a minor player. The child is named on the
    // document; the guardian signs it.
    isMinor: boolean("is_minor").notNull().default(false),
    guardianName: varchar("guardian_name", { length: 200 }),

    signedName: varchar("signed_name", { length: 200 }).notNull(),
    // The waiver text is brand-derived and will be revised. Store what they
    // actually signed — a document edited in August must not retroactively
    // change what someone agreed to in July.
    waiverTextShown: text("waiver_text_shown").notNull(),
    signedAt: timestamp("signed_at").notNull().defaultNow(),
    validUntil: timestamp("valid_until").notNull(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    lookupIdx: index("idx_spectator_waivers_org_phone").on(t.organizationId, t.phone),
  }),
);
```

Export it from `src/lib/db/schema/index.ts` alongside the other tables.

- [ ] **Step 2: Generate + make idempotent**

```bash
./scripts/with-bws.sh npm run db:generate
```
Hand-edit the generated SQL: `CREATE TABLE IF NOT EXISTS`, and wrap each `ADD CONSTRAINT` in `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN null; END $$;`.

- [ ] **Step 3: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/db/schema/spectators.ts src/lib/db/schema/index.ts src/lib/db/migrations
git commit -m "feat(spectator): spectator_waivers table"
```

---

### Task 5: Spectator API — lookup and sign

**Files:**
- Create: `src/pages/api/kiosk/[locationSlug]/spectator/lookup.ts`
- Create: `src/pages/api/kiosk/[locationSlug]/spectator/sign.ts`
- Test: `tests/api/kiosk/spectator.test.ts`

**Interfaces:**
- Consumes: `requireKioskLocation(slug, orgId)` from `src/lib/check-in/kiosk-auth.ts`; `recordConsent`, `CONSENT_COPY` (Task 3); `spectatorWaivers` (Task 4).
- Produces:
  - `GET /api/kiosk/<slug>/spectator/lookup?q=<digits>` → `{ found: boolean; firstName?: string; validUntil?: string }`
  - `POST /api/kiosk/<slug>/spectator/sign` → `{ ok: true; waiverId: string; pending: ConsentChannel[] }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api/kiosk/spectator.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { spectatorWaivers } from "@/lib/db/schema/spectators";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { users } from "@/lib/db/schema/users";
import { eq, and } from "drizzle-orm";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const SUFFIX = `${Date.now()}`.slice(-7);
const PHONE = `555${SUFFIX}`;
const EMAIL = `spectator-${SUFFIX}@example.invalid`;
let LOCATION_ID = "";

describe("kiosk spectator waiver", () => {
  afterAll(async () => {
    const db = getDb();
    await db.delete(spectatorWaivers).where(eq(spectatorWaivers.phone, PHONE));
    await db.delete(phoneOptIns).where(eq(phoneOptIns.phone, PHONE));
    await db.delete(users).where(eq(users.email, EMAIL));
  });

  it("signing with NO opt-ins creates a signature but NOT a user", async () => {
    // The waiver is a condition of entry. Declining every channel must still
    // admit you — and must not silently create an account.
    const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/sign`, {
      method: "POST",
      body: JSON.stringify({
        firstName: "Nocon",
        lastName: "Sent",
        phone: PHONE,
        email: EMAIL,
        signedName: "Nocon Sent",
        consents: [], // declined everything
      }),
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const waivers = await db.select().from(spectatorWaivers).where(eq(spectatorWaivers.phone, PHONE));
    expect(waivers.length).toBe(1);
    expect(waivers[0].userId).toBeNull();

    const u = await db.select().from(users).where(eq(users.email, EMAIL));
    expect(u.length, "declining every opt-in must not create an account").toBe(0);
  });

  it("an SMS opt-in creates a user and an SMS-scoped consent carrying the exact text shown", async () => {
    const { CONSENT_COPY } = await import("@/lib/consent/channels");
    const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/sign`, {
      method: "POST",
      body: JSON.stringify({
        firstName: "Opted",
        lastName: "In",
        phone: `${PHONE}1`.slice(0, 10),
        email: `opt-${EMAIL}`,
        signedName: "Opted In",
        consents: ["sms"],
      }),
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const rows = await db
      .select()
      .from(phoneOptIns)
      .where(and(eq(phoneOptIns.phone, `${PHONE}1`.slice(0, 10)), eq(phoneOptIns.channel, "sms")));
    expect(rows.length).toBe(1);
    expect(rows[0].consentTextShown).toBe(CONSENT_COPY.sms);
    expect(rows[0].userId).toBeTruthy();
  });

  it("lookup finds a valid waiver by phone and does not leak a full surname", async () => {
    const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/lookup?q=${PHONE.slice(-4)}`);
    const body = await res.json();
    expect(body.found).toBe(true);
    // Same privacy rule as the booking search: the kiosk is public.
    expect(JSON.stringify(body)).not.toContain("Sent");
  });
});
```

Resolve `LOCATION_ID` in a `beforeAll` the same way `tests/api/kiosk/search.test.ts` does (venue → `locationId`).

- [ ] **Step 2: Run and see it fail** — endpoints do not exist (404).

- [ ] **Step 3: Implement `lookup.ts`**

Phone-digits only, minimum 4 — identical privacy rule to the booking search (a public kiosk must not let anyone fish for names). Return `{ found, firstName, validUntil }` only; never a surname.

```ts
import type { APIRoute } from "astro";
import { and, desc, eq, gt, ilike } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { spectatorWaivers } from "@/lib/db/schema/spectators";
import { requireKioskLocation } from "@/lib/check-in/kiosk-auth";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ params, url, locals }) => {
  const k = await requireKioskLocation(params.locationSlug ?? "", locals.organization?.id ?? null);
  if (!k.ok) return k.response;

  const digits = (url.searchParams.get("q") ?? "").replace(/\D/g, "");
  if (digits.length < 4) return json({ found: false }, 200);

  const [row] = await getDb()
    .select({
      firstName: spectatorWaivers.firstName,
      validUntil: spectatorWaivers.validUntil,
    })
    .from(spectatorWaivers)
    .where(
      and(
        eq(spectatorWaivers.organizationId, k.location.organizationId),
        ilike(spectatorWaivers.phone, `%${digits.slice(-4)}`),
        gt(spectatorWaivers.validUntil, new Date()),
      ),
    )
    // Multi-tenant hazard: a shared DB accumulates rows. Newest valid waiver wins.
    .orderBy(desc(spectatorWaivers.signedAt))
    .limit(1);

  if (!row) return json({ found: false }, 200);
  return json({ found: true, firstName: row.firstName, validUntil: row.validUntil }, 200);
};
```

- [ ] **Step 4: Implement `sign.ts`**

Validate with zod. Then, in order:

1. Insert the `spectator_waivers` row (always). `validUntil` = end of the current season/year — use `new Date(now.getFullYear(), 11, 31)`.
2. **If and only if `consents` is non-empty**, resolve-or-create a passwordless `users` row and stamp `userId` on the waiver.
3. For each ticked channel, call `recordConsent({ ..., textShown: CONSENT_COPY[channel] })`.
4. For `sms`: attempt the OTP send. If it returns `reason: "channel_dormant"`, do **not** fail — return the channel in `pending` so the UI can say so honestly.
5. For `whatsapp`: always `pending` (the channel cannot deliver yet).
6. For `email`: send the double-opt-in confirmation (Task 6).

Return `{ ok: true, waiverId, pending }`.

- [ ] **Step 5: Run tests, typecheck, commit**

```bash
TEST_BASE_URL=http://localhost:4331 ./scripts/with-bws.sh npx vitest run tests/api/kiosk/spectator.test.ts
npx tsc --noEmit
git add src/pages/api/kiosk tests/api/kiosk/spectator.test.ts
git commit -m "feat(spectator): lookup + sign endpoints"
```

---

### Task 6: Email double opt-in — an unverified address can never reach the list

**Files:**
- Create: `src/pages/api/consent/confirm/[token].ts`
- Modify: `src/lib/consent/record.ts` (mint the confirmation token)
- Test: `tests/api/consent/double-opt-in.test.ts`

**Interfaces:**
- Consumes: `mintToken` from `src/lib/check-in/tokens-db.ts` (the existing token machinery), `sendEmail` from `@/lib/email`.
- Produces: `GET /api/consent/confirm/<token>` → sets `users.emailVerified = true`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/consent/double-opt-in.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";
import { apiFetch } from "../setup/test-helpers";

describe("email double opt-in", () => {
  it("an email opt-in does NOT verify the address until the link is clicked", async () => {
    // This is the whole garbage-data fix: ticking a box is intent, not proof.
    // Marketing selects on emailVerified, so an unverified address is
    // structurally incapable of entering the list.
    const email = `dbl-${Date.now()}@example.invalid`;

    // ...sign as a spectator with consents: ["email"] (see spectator.test.ts)...

    const [u] = await getDb().select().from(users).where(eq(users.email, email));
    expect(u.emailVerified, "must NOT be verified before the click").toBe(false);

    // ...fetch the confirmation token the send recorded, then:
    const res = await apiFetch(`/api/consent/confirm/${token}`);
    expect(res.status).toBe(200);

    const [after] = await getDb().select().from(users).where(eq(users.email, email));
    expect(after.emailVerified).toBe(true);
  });
});
```

Retrieve the token from the messaging mock (`GET /api/test/messaging-mock?to=<email>`, requires `E2E_TEST_ENDPOINTS=yes`) rather than the real inbox.

- [ ] **Step 2: Run and see it fail.**

- [ ] **Step 3: Implement the confirm endpoint** — verify the token, set `emailVerified = true`, redirect to a simple "you're subscribed" page.

- [ ] **Step 4: Wire the send** into `sign.ts` for the `email` channel, reusing `src/lib/email/templates/email-verification.tsx`.

- [ ] **Step 5: Run, typecheck, commit.**

---

### Task 7: The kiosk spectator mode

**Files:**
- Create: `src/components/kiosk/SpectatorFlow.tsx`, `src/components/kiosk/ConsentBoxes.tsx`
- Modify: `src/components/kiosk/KioskRoot.tsx`
- Test: `tests/e2e/kiosk-spectator.spec.ts` (Task 8)

**Interfaces:**
- Consumes: `PhoneKeypad` (`src/components/kiosk/PhoneKeypad.tsx`), `CONSENT_COPY`, the Task 5 endpoints.
- Produces: a `spectator` value on `KioskRoot`'s `Mode` union.

- [ ] **Step 1: `ConsentBoxes.tsx` — the boxes, unchecked, forever**

```tsx
"use client";

import { CONSENT_CHANNELS, CONSENT_COPY, type ConsentChannel } from "@/lib/consent/channels";

/**
 * Every box renders UNCHECKED. This is not a style preference — a pre-checked
 * opt-in is exactly what got this project's 10DLC registration DECLINED on
 * 2026-07-13 ("the opt-in form needed an unchecked checkbox"). There is a test
 * that fails if any box defaults to checked. Do not "helpfully" pre-select one.
 *
 * The copy comes from CONSENT_COPY and nowhere else: the sentence displayed
 * here is stored verbatim with the consent record, and a carrier reviewer
 * compares the two.
 */
export function ConsentBoxes({
  selected,
  onChange,
}: {
  selected: ConsentChannel[];
  onChange: (next: ConsentChannel[]) => void;
}) {
  const toggle = (c: ConsentChannel) =>
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-ink-muted pb-2">
        Optional — you can come in either way.
      </legend>
      {CONSENT_CHANNELS.map((c) => (
        <label
          key={c}
          className="flex items-start gap-3 min-h-[60px] p-4 rounded-xl border border-border bg-paper cursor-pointer hover:bg-cream-2 transition-colors"
        >
          <input
            type="checkbox"
            checked={selected.includes(c)}
            onChange={() => toggle(c)}
            className="mt-1 w-5 h-5 accent-primary"
          />
          <span className="text-base text-ink leading-relaxed">{CONSENT_COPY[c]}</span>
        </label>
      ))}
    </fieldset>
  );
}
```

- [ ] **Step 2: Write the unchecked-by-default test**

```tsx
// tests/unit/consent-boxes-unchecked.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { ConsentBoxes } from "@/components/kiosk/ConsentBoxes";

describe("consent boxes", () => {
  it("render UNCHECKED with no selection", () => {
    // A pre-checked box got the 10DLC registration declined. This test is the
    // guard; if it ever fails, do not "fix" it by changing the assertion.
    const html = renderToStaticMarkup(
      React.createElement(ConsentBoxes, { selected: [], onChange: () => {} }),
    );
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain("checked");
  });
});
```

- [ ] **Step 3: `SpectatorFlow.tsx`** — steps: `lookup` (PhoneKeypad) → if found & valid, "You're all set" → else `form` (name, phone, email, guardian if minor) → `waiver` (text + signature) → `ConsentBoxes` → submit → `done` (honest about any `pending` channels: "We'll text you to confirm — the SMS channel is being switched on").

- [ ] **Step 4: Add `"spectator"` to `KioskRoot`'s `Mode`** and a third landing button, styled like the existing two.

- [ ] **Step 5: Verify the invariants and commit**

```bash
grep -rnE "<a |window\.location" src/components/kiosk/ | grep -vE "^\S+:[0-9]+:\s*(\*|//)"   # must be ZERO
grep -rE "stone-|bg-white|emerald-|amber-|text-sage|text-ochre" src/components/kiosk/         # must be ZERO
npx vitest run tests/unit/consent-boxes-unchecked.test.tsx
npx tsc --noEmit
git add src/components/kiosk tests/unit/consent-boxes-unchecked.test.tsx
git commit -m "feat(kiosk): spectator waiver mode with unchecked per-channel consent"
```

---

### Task 8: Flush parked consents when a channel wakes up

**Files:**
- Create: `src/pages/api/cron/flush-parked-consents.ts`, `netlify/functions/scheduled-flush-parked-consents.ts`
- Test: `tests/api/consent/flush-parked.test.ts`

**Interfaces:**
- Consumes: `isConsentStale`, `CONSENT_STALE_AFTER_DAYS` (Task 3); `sendSms` + `classifyProviderError` (Task 2).

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/consent/flush-parked.test.ts
describe("flushing parked consents", () => {
  it("sends the confirmation for a FRESH parked consent once the channel is awake", async () => {
    // ...seed a phone_opt_ins row, status "pending", optedInAt = 10 days ago...
    const res = await apiFetch("/api/cron/flush-parked-consents", {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET! },
    });
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(body.reconfirmRequired).toBe(0);
  });

  it("does NOT blast a consent older than 90 days — it requires re-confirmation", async () => {
    // Ticked at a kiosk in July, channel approved in October. Messaging them
    // silently is how a WABA gets flagged.
    // ...seed optedInAt = 120 days ago...
    const body = await (await apiFetch("/api/cron/flush-parked-consents", {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET! },
    })).json();
    expect(body.sent).toBe(0);
    expect(body.reconfirmRequired).toBe(1);
  });

  it("leaves the consent parked (not failed) if the channel is still dormant", async () => {
    // A dormant channel must never DESTROY consent. It stays queued.
    // ...stub the provider to throw "403 ... under carrier review"...
    const body = await (await apiFetch("/api/cron/flush-parked-consents", {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET! },
    })).json();
    expect(body.stillDormant).toBe(1);
    expect(body.sent).toBe(0);
  });
});
```

- [ ] **Step 2: Run and see it fail.**

- [ ] **Step 3: Implement the cron.** For each `phone_opt_ins` row with `status = 'pending'`:
- stale (`isConsentStale`) → mark `reconfirm_required`, do **not** send;
- fresh → send the confirmation. The first message on a newly-live channel **names when and where they opted in**: `` `You signed up at ${facility} on ${date}. Reply STOP to opt out.` ``;
- `channel_dormant` → leave it pending, count it, try again next run.

Guard with `x-cron-secret` exactly as the other crons do (see `send-welcome-series.ts`).

- [ ] **Step 4: Add the Netlify schedule** — `"*/30 * * * *"` (a channel can wake at any time; half-hourly is cheap and bounded). Mirror `netlify/functions/scheduled-send-welcome-series.ts`.

**Note:** staging will run this cron too, but `MESSAGING_LIVE` is unset there, so it records instead of sending. That is the intended behaviour, not a bug.

- [ ] **Step 5: Run, typecheck, commit.**

---

### Task 9: E2E + full verification

**Files:**
- Create: `tests/e2e/kiosk-spectator.spec.ts`

- [ ] **Step 1: Write the spec**

Cover, at minimum:
1. Landing shows the third option; tapping it reaches the keypad.
2. **Declining every consent box still admits you** — and creates no account. (The separability rule.)
3. The consent boxes render **unchecked**.
4. The tab never leaves `/kiosk/<slug>`.

Use the location **UUID** resolved at runtime (`requireKioskLocation` accepts a UUID; the seeded slug is timestamped and unstable — see `tests/e2e/kiosk.spec.ts`). Call `waitForHydration(page)` before any click.

- [ ] **Step 2: Run it locally — it will NOT gate the PR**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:4331 npx playwright test tests/e2e/kiosk-spectator.spec.ts --reporter=line
```
Full Playwright runs **post-merge only**. A broken spec here silently breaks `main` — this exact thing happened on 2026-07-14.

- [ ] **Step 3: Full pre-push checklist**

```bash
npx tsc --noEmit
./scripts/with-bws.sh npm run build
TEST_BASE_URL=http://localhost:4331 ./scripts/with-bws.sh npm run test:api
PLAYWRIGHT_BASE_URL=http://localhost:4331 ./scripts/with-bws.sh npm test
```
Run the dev server with `MESSAGING_MOCK=1` so the suite cannot send real mail.

- [ ] **Step 4: Confirm the compliance invariants hold**

```bash
# No pre-checked box anywhere.
grep -rn "defaultChecked\|checked={true}" src/components/kiosk/   # must be ZERO
# SMS gating is never decided by a WhatsApp row.
grep -rn "phoneOptIns" src/lib/sms/ | grep -c "channel"           # every query scoped
```

- [ ] **Step 5: Open the PR.** Flag in the body:
> **Schema change** — `phone_opt_ins.channel` + `spectator_waivers`. Migrations run against prod on merge.
> **Compliance** — every opt-in box ships unchecked and the displayed text is stored with the consent. A pre-checked box is what got the 10DLC registration declined on 2026-07-13.

---

## Self-Review

**Spec coverage:** §1 spectator flow → Tasks 4, 5, 7. §2 identity (signature vs user) → Task 5 Step 4 + its first test. §3 channel-aware consent → Task 1. §4 verification (email double opt-in, SMS OTP) → Tasks 5, 6. §5 dormant channels + staleness → Tasks 2, 3, 8. §6 compliance rules → Tasks 3 (stored text), 7 (unchecked boxes, with tests), 5 (separability test). §7 WhatsApp visible + parked → Tasks 3, 7, 8. Testing → Tasks 1–9. Out-of-scope items correctly absent.

**Beyond the spec:** Task 1's call-site sweep. The spec said "add a channel column"; reading the code showed `sendSms` gates on `optIn[0]`, so without scoping every query a WhatsApp consent would authorise an SMS send. That is a compliance defect the spec did not anticipate, and it is now the plan's highest-risk gated task.

**Type consistency:** `ConsentChannel` = `"email" | "sms" | "whatsapp"` in Tasks 3, 5, 7, 8. `recordConsent({ db, organizationId, userId, channel, phone?, email?, source, textShown })` defined in Task 3 and called in Task 5. `classifyProviderError` defined in Task 2 and used in Tasks 2, 8. `isConsentStale(optedInAt, now?)` defined in Task 3 and used in Task 8. `CONSENT_COPY` defined in Task 3, consumed in Tasks 5 and 7, and asserted in Task 5's test.
