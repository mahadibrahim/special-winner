# Walk-In Pricing Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charge and enforce a distinct, higher walk-in price for in-person drop-in bookings (kiosk + staffed venue-manager desk), backed by an org-default rate and a per-session override.

**Architecture:** Add two additive columns (`drop_in_rate_card.default_walk_up_rate_cents`, `drop_in_sessions.walk_up_rate_cents`). Make the pure `resolveRate()` channel-aware via an optional `source` param (defaults to online, so the 6 online callers are untouched). Thread `source: "walk_up"` through the venue-manager flow and replace the kiosk's inline amount math with `resolveRate(...,"walk_up")`. Expose both rates in the rate-card editor and session form.

**Tech Stack:** Astro 5 + React 19, Drizzle ORM (Postgres), Vitest (unit + API). Spec: `docs/superpowers/specs/2026-06-18-walkin-pricing-enforcement-design.md`.

---

## Conventions for this plan

- Run all commands from the worktree root.
- Unit tests: `tests/unit/` (Vitest, no DB). Single file: `npx vitest run tests/unit/<file>`.
- API tests: `tests/api/` hit a running dev server (CI-gated; create the file, run only if a server is up).
- `.astro`/endpoints/components verified by `npx tsc --noEmit` + `npm run build`.
- `npm run db:generate` diffs `schema.ts` against migration snapshots offline (no DB needed). `db:migrate`/`db:push` are NOT run here — CI/`migrate-prod.yml` applies migrations.

---

## Phase 1 — Schema + migration

### Task 1: Add the two rate columns + generate the migration

**Files:**
- Modify: `src/lib/db/schema/drop-in.ts`
- Create (generated): `src/lib/db/migrations/0055_*.sql`

- [ ] **Step 1: Add `walkUpRateCents` to `dropInSessions`**

In `src/lib/db/schema/drop-in.ts`, in the `dropInSessions` table, immediately after the existing `memberRateCents` column (`memberRateCents: integer("member_rate_cents"),`) add:

```ts
    walkUpRateCents: integer("walk_up_rate_cents"),
```

- [ ] **Step 2: Add `defaultWalkUpRateCents` to `dropInRateCard`**

In the `dropInRateCard` table, immediately after the `defaultMemberRateCents` line add:

```ts
  defaultWalkUpRateCents: integer("default_walk_up_rate_cents").notNull().default(1700),
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new file `src/lib/db/migrations/0055_<random>.sql` is created containing two `ALTER TABLE ... ADD COLUMN` statements (for `drop_in_sessions.walk_up_rate_cents` and `drop_in_rate_card.default_walk_up_rate_cents`).

- [ ] **Step 4: Make the generated SQL idempotent**

Open the new `src/lib/db/migrations/0055_*.sql` and change each `ADD COLUMN` to `ADD COLUMN IF NOT EXISTS` (drift-safe convention, per `0023`/`0024`). The file should read like:

```sql
ALTER TABLE "drop_in_sessions" ADD COLUMN IF NOT EXISTS "walk_up_rate_cents" integer;
ALTER TABLE "drop_in_rate_card" ADD COLUMN IF NOT EXISTS "default_walk_up_rate_cents" integer DEFAULT 1700 NOT NULL;
```

(Keep whatever exact column ordering/quoting drizzle emitted; only insert `IF NOT EXISTS`.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema/drop-in.ts src/lib/db/migrations/
git commit -m "feat(dropin): walk-up rate columns (rate card default + per-session override)"
```

---

## Phase 2 — Channel-aware pricing (TDD)

### Task 2: Make `resolveRate` walk-up-aware

**Files:**
- Modify: `src/lib/dropin/pricing.ts`
- Test: `tests/unit/resolve-rate-walkup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/resolve-rate-walkup.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { resolveRate, type RateCard, type SessionRateOverrides, type MembershipForPricing } from "@/lib/dropin/pricing"

const rateCard: RateCard = {
  defaultSessionRateCents: 1500,
  defaultMemberRateCents: 1200,
  defaultWalkUpRateCents: 1700,
}
const plainSession: SessionRateOverrides = { sessionRateCents: null, memberRateCents: null, walkUpRateCents: null }
const user = { id: "u1" }

describe("resolveRate — channel-aware walk-up pricing", () => {
  it("non-member online (default source) pays the session rate", () => {
    expect(resolveRate(plainSession, null, null, rateCard).amountCents).toBe(1500)
  })

  it("non-member walk_up pays the walk-up rate", () => {
    expect(resolveRate(plainSession, null, null, rateCard, "walk_up").amountCents).toBe(1700)
  })

  it("explicit online_booking source still pays the session rate", () => {
    expect(resolveRate(plainSession, null, null, rateCard, "online_booking").amountCents).toBe(1500)
  })

  it("per-session walkUpRateCents overrides the org default", () => {
    const s: SessionRateOverrides = { sessionRateCents: null, memberRateCents: null, walkUpRateCents: 2000 }
    expect(resolveRate(s, null, null, rateCard, "walk_up").amountCents).toBe(2000)
  })

  it("member with unlimited_pickup is free regardless of source", () => {
    const m: MembershipForPricing = { id: "m1", tier: { benefits: { unlimited_pickup: true } }, allotmentRemaining: 0 }
    expect(resolveRate(plainSession, user, m, rateCard, "walk_up").amountCents).toBe(0)
    expect(resolveRate(plainSession, user, m, rateCard).amountCents).toBe(0)
  })

  it("member with allotment remaining is free regardless of source", () => {
    const m: MembershipForPricing = { id: "m1", tier: { benefits: {} }, allotmentRemaining: 2 }
    expect(resolveRate(plainSession, user, m, rateCard, "walk_up").amountCents).toBe(0)
  })

  it("member out of allotment pays the member rate, NOT walk-up, even at walk_up", () => {
    const m: MembershipForPricing = { id: "m1", tier: { benefits: {} }, allotmentRemaining: 0 }
    expect(resolveRate(plainSession, user, m, rateCard, "walk_up").amountCents).toBe(1200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/resolve-rate-walkup.test.ts`
Expected: FAIL — `resolveRate` doesn't accept a 5th arg / `RateCard` has no `defaultWalkUpRateCents` (type error or wrong amounts).

- [ ] **Step 3: Update `pricing.ts`**

In `src/lib/dropin/pricing.ts`:

a) Add `defaultWalkUpRateCents` to `RateCard`:

```ts
export interface RateCard {
  defaultSessionRateCents: number;
  defaultMemberRateCents: number;
  defaultWalkUpRateCents: number;
}
```

b) Add an optional `walkUpRateCents` to `SessionRateOverrides`:

```ts
export interface SessionRateOverrides {
  sessionRateCents: number | null;
  memberRateCents: number | null;
  walkUpRateCents?: number | null;
}
```

c) Add a source type (place it near the other exported types):

```ts
export type DropInBookingSource = "online_booking" | "walk_up";
```

d) Change the `resolveRate` signature and the no-membership branch. Replace the current function header and the first `const`s + the no-membership block with:

```ts
export function resolveRate(
  session: SessionRateOverrides,
  user: { id: string } | null,
  membership: MembershipForPricing | null,
  rateCard: RateCard,
  source: DropInBookingSource = "online_booking",
): ResolvedRate {
  const sessionRate = session.sessionRateCents ?? rateCard.defaultSessionRateCents;
  const walkUpRate = session.walkUpRateCents ?? rateCard.defaultWalkUpRateCents;
  const memberRate = session.memberRateCents ?? rateCard.defaultMemberRateCents;

  // No user, or no membership: pay the public price for this channel —
  // walk-ins pay the (higher) walk-up rate, online pays the session rate.
  if (!user || !membership) {
    return {
      amountCents: source === "walk_up" ? walkUpRate : sessionRate,
      paymentMethod: "card_online",
      membershipId: null,
    };
  }
```

Leave the three member branches (unlimited → free, allotment > 0 → free, else member rate) exactly as they are. Update the function's doc comment to note the `source` rule (walk-ups pay the walk-up rate; members are unaffected by source).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/resolve-rate-walkup.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Confirm no existing caller broke**

Run: `npx tsc --noEmit`
Expected: zero errors. (Online callers omit `source` → default `online_booking`; they may also omit `walkUpRateCents` since it's optional.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/dropin/pricing.ts tests/unit/resolve-rate-walkup.test.ts
git commit -m "feat(dropin): channel-aware resolveRate with walk-up pricing"
```

---

## Phase 3 — Enforce at the in-person flows

### Task 3: Venue-manager desk passes `source: "walk_up"`

**Files:**
- Modify: `src/pages/api/admin/dropin/sessions/[id]/walk-up.ts`

- [ ] **Step 1: Pass the walk-up source**

Find the single `resolveRate(...)` call (currently `const rate = resolveRate(session, { id: userId }, membership, rateCard);`) and add the `source` argument:

```ts
  const rate = resolveRate(session, { id: userId }, membership, rateCard, "walk_up");
```

The `session` row here is a full `select()` from `dropInSessions`, so it already carries `walkUpRateCents` after Task 1; `rateCard` is a full select with `defaultWalkUpRateCents`. No other change needed — members still resolve to member/free, non-members now resolve to the walk-up rate.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/dropin/sessions/[id]/walk-up.ts
git commit -m "feat(dropin): staffed walk-up desk charges the walk-up rate to non-members"
```

---

### Task 4: Kiosk charges the walk-up rate

**Files:**
- Modify: `src/pages/api/kiosk/[locationSlug]/walkin/start.ts`
- Modify: `src/pages/api/kiosk/[locationSlug]/walkin/payment.ts`

The kiosk never resolves membership — everyone pays walk-up. Route both files through `resolveRate(session, null, null, rateCard, "walk_up")` so `start` (stores `amountDueCents`) and `payment` (PaymentIntent base) cannot drift. The existing card surcharge in `payment.ts` stays on top → $17 base + surcharge.

- [ ] **Step 1: `start.ts` — import resolveRate**

Add to the imports at the top of `src/pages/api/kiosk/[locationSlug]/walkin/start.ts`:

```ts
import { resolveRate } from "@/lib/dropin/pricing";
```

- [ ] **Step 2: `start.ts` — replace the amount computation**

`session` and `rateCard` are both full `select()` rows here. Replace the existing:

```ts
  const amountDueCents =
    session.sessionRateCents ?? rateCard?.defaultSessionRateCents ?? 1500;
```

with:

```ts
  // Kiosk walk-ins always pay the walk-up rate (no membership lookup here).
  const amountDueCents = rateCard
    ? resolveRate(session, null, null, rateCard, "walk_up").amountCents
    : 1700;
```

- [ ] **Step 3: `payment.ts` — import resolveRate + select the rate columns**

Add to the imports at the top of `src/pages/api/kiosk/[locationSlug]/walkin/payment.ts`:

```ts
import { resolveRate } from "@/lib/dropin/pricing";
```

In the session `select({ ... })` (the object that currently includes `sessionRateCents: dropInSessions.sessionRateCents`), add the two sibling columns so `resolveRate` gets the full override set:

```ts
      sessionRateCents: dropInSessions.sessionRateCents,
      memberRateCents: dropInSessions.memberRateCents,
      walkUpRateCents: dropInSessions.walkUpRateCents,
```

- [ ] **Step 4: `payment.ts` — replace the amount computation**

Replace the existing:

```ts
  const amountCents =
    sessionRow.sessionRateCents ?? rateCard?.defaultSessionRateCents ?? 1500;
```

with:

```ts
  // Kiosk walk-ins always pay the walk-up rate (no membership lookup here).
  // The card surcharge below is still added on top → walk-up base + surcharge.
  const amountCents = rateCard
    ? resolveRate(sessionRow, null, null, rateCard, "walk_up").amountCents
    : 1700;
```

(`rateCard` in `payment.ts` is a full `select()` so it carries `defaultWalkUpRateCents`.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add "src/pages/api/kiosk/[locationSlug]/walkin/start.ts" "src/pages/api/kiosk/[locationSlug]/walkin/payment.ts"
git commit -m "feat(kiosk): walk-ins charge the walk-up rate (base + surcharge)"
```

---

## Phase 4 — Admin surfaces

### Task 5: Rate-card editor gains the walk-up rate

**Files:**
- Modify: `src/lib/dropin/validators.ts`
- Modify: `src/pages/api/admin/dropin/rate-card.ts`
- Modify: `src/components/admin/dropin/RateCardEditor.tsx`
- Test: `tests/unit/rate-card-validator.test.ts`

- [ ] **Step 1: Write the failing validator test**

Create `tests/unit/rate-card-validator.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { validateRateCardPut } from "@/lib/dropin/validators"

describe("validateRateCardPut — walk-up rate", () => {
  it("accepts a non-negative defaultWalkUpRateCents", () => {
    expect(validateRateCardPut({ defaultWalkUpRateCents: 1700 })).toBeNull()
  })
  it("rejects a negative defaultWalkUpRateCents", () => {
    expect(validateRateCardPut({ defaultWalkUpRateCents: -1 })).toMatch(/defaultWalkUpRateCents/)
  })
  it("ignores an omitted defaultWalkUpRateCents", () => {
    expect(validateRateCardPut({ defaultSessionRateCents: 1500 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/rate-card-validator.test.ts`
Expected: FAIL — `defaultWalkUpRateCents` isn't a known field / isn't validated.

- [ ] **Step 3: Update the validator**

In `src/lib/dropin/validators.ts`, add the field to `RateCardPutBody`:

```ts
export interface RateCardPutBody {
  defaultSessionRateCents?: number;
  defaultMemberRateCents?: number;
  defaultWalkUpRateCents?: number;
  cancelWindowHours?: number;
  promotionWindowMinutes?: number;
}
```

and add `"defaultWalkUpRateCents"` to the non-negative-number key loop in `validateRateCardPut`:

```ts
  for (const key of [
    "defaultSessionRateCents",
    "defaultMemberRateCents",
    "defaultWalkUpRateCents",
    "cancelWindowHours",
    "promotionWindowMinutes",
  ] as const) {
```

- [ ] **Step 4: Run the validator test**

Run: `npx vitest run tests/unit/rate-card-validator.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Handle the field in the PUT endpoint**

In `src/pages/api/admin/dropin/rate-card.ts`, after the existing `defaultMemberRateCents` block in the `updates` assembly, add:

```ts
  if (body.defaultWalkUpRateCents !== undefined)
    updates.defaultWalkUpRateCents = body.defaultWalkUpRateCents;
```

- [ ] **Step 6: Add the field to the editor UI**

In `src/components/admin/dropin/RateCardEditor.tsx`:

a) Add to the `RateCard` interface (after `defaultMemberRateCents`):

```ts
  defaultWalkUpRateCents: number;
```

b) Add `defaultWalkUpRateCents: card.defaultWalkUpRateCents,` to the `body` object in `submit` (after the `defaultMemberRateCents` line).

c) Add a new input block right after the member-rate `<div>` (the one ending with the member-price helper `<p>`):

```tsx
            <div>
              <Label htmlFor="walkup-rate">Default walk-up rate (cents)</Label>
              <Input
                id="walkup-rate"
                type="number"
                min={0}
                value={card.defaultWalkUpRateCents}
                onChange={(e) =>
                  setCard({
                    ...card,
                    defaultWalkUpRateCents: Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-ink-muted">
                In-person walk-in price: ${(card.defaultWalkUpRateCents / 100).toFixed(2)}
              </p>
            </div>
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/dropin/validators.ts src/pages/api/admin/dropin/rate-card.ts src/components/admin/dropin/RateCardEditor.tsx tests/unit/rate-card-validator.test.ts
git commit -m "feat(admin): edit the org default walk-up rate on the rate card"
```

---

### Task 6: Per-session walk-up override in the session form + endpoints

**Files:**
- Modify: `src/pages/api/admin/dropin/sessions/index.ts`
- Modify: `src/pages/api/admin/dropin/sessions/[id].ts`
- Modify: `src/components/admin/dropin/SessionForm.tsx`

- [ ] **Step 1: Create endpoint — accept + persist the override**

In `src/pages/api/admin/dropin/sessions/index.ts`:

a) Add to the `CreateBody` interface after `memberRateCents?: number | null;`:

```ts
  walkUpRateCents?: number | null;
```

b) In the `db.insert(dropInSessions).values({...})`, after `memberRateCents: body.memberRateCents ?? null,` add:

```ts
      walkUpRateCents: body.walkUpRateCents ?? null,
```

- [ ] **Step 2: Update endpoint — accept + persist the override**

In `src/pages/api/admin/dropin/sessions/[id].ts`:

a) Add to its update body interface after `memberRateCents?: number | null;`:

```ts
  walkUpRateCents?: number | null;
```

b) After the existing `memberRateCents` conditional in the `updates` assembly, add:

```ts
  if (body.walkUpRateCents !== undefined)
    updates.walkUpRateCents = body.walkUpRateCents;
```

- [ ] **Step 3: SessionForm — state field**

In `src/components/admin/dropin/SessionForm.tsx`:

a) In the form-state interface, after `memberRateCents: string;` add:

```ts
  walkUpRateCents: string;
```

b) In the initial/blank state object, after `memberRateCents: "",` add:

```ts
  walkUpRateCents: "",
```

c) In the hydrate-from-session mapping, after the `memberRateCents:` line add:

```ts
            walkUpRateCents:
              s.walkUpRateCents != null ? String(s.walkUpRateCents) : "",
```

d) In the submit payload, after the `memberRateCents:` ternary block add:

```ts
        walkUpRateCents: state.walkUpRateCents
          ? Number(state.walkUpRateCents)
          : undefined,
```

- [ ] **Step 4: SessionForm — input field**

After the member-rate `<div>` block (the input with `id="mrate"`), add:

```tsx
        <div>
          <Label htmlFor="wuprate">Walk-up rate (cents) — override</Label>
          <Input
            id="wuprate"
            type="number"
            min={0}
            value={state.walkUpRateCents}
            onChange={(e) =>
              setState({ ...state, walkUpRateCents: e.target.value })
            }
            placeholder="leave blank for rate-card default"
          />
        </div>
```

- [ ] **Step 5: Confirm the session type used by SessionForm exposes `walkUpRateCents`**

The form hydrates from a session object (`s`). Confirm its TS type (the admin session shape it's typed against) includes `walkUpRateCents` after the schema change — it derives from the Drizzle row, so it should. If `s.walkUpRateCents` is a type error, locate the session interface the form imports and add `walkUpRateCents: number | null` to it. Run:

Run: `npx tsc --noEmit`
Expected: zero errors (fix the session type as above if needed).

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/admin/dropin/sessions/index.ts "src/pages/api/admin/dropin/sessions/[id].ts" src/components/admin/dropin/SessionForm.tsx
git commit -m "feat(admin): per-session walk-up rate override on the session form"
```

---

## Phase 5 — API tests + verification

### Task 7: API tests for the rate-card walk-up field

**Files:**
- Create: `tests/api/dropin/walkup-rates.test.ts`

These hit the running dev server via the project's `apiFetch` helper (base URL handled internally; `Content-Type: application/json` is set by `apiFetch`). They use `getAdminCookie()` and gracefully skip when the test fixture isn't present (mirrors `tests/api/dropin/admin-sessions-repeat.test.ts`). Create + commit; run only if a dev server is up (CI-gated).

- [ ] **Step 1: Write the spec**

Create `tests/api/dropin/walkup-rates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";

const RATE_CARD = "/api/admin/dropin/rate-card";

describe("walk-up rate card admin API", () => {
  it("rejects an unauthenticated PUT (401)", async () => {
    const res = await apiFetch(RATE_CARD, {
      method: "PUT",
      body: JSON.stringify({ defaultWalkUpRateCents: 1700 }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts defaultWalkUpRateCents for an admin (200)", async () => {
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return; // fixture not present in this environment — skip
    }
    const res = await apiFetch(RATE_CARD, {
      method: "PUT",
      body: JSON.stringify({ defaultWalkUpRateCents: 1700 }),
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rateCard.defaultWalkUpRateCents).toBe(1700);
  });

  it("rejects a negative walk-up rate (400)", async () => {
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return;
    }
    const res = await apiFetch(RATE_CARD, {
      method: "PUT",
      body: JSON.stringify({ defaultWalkUpRateCents: -5 }),
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run if a dev server is up (optional here)**

If `npm run dev` is running on :4321 with the seeded admin fixture:
`CRON_SECRET=<dev-server's> TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/dropin/walkup-rates.test.ts`
Otherwise note it as CI-gated and proceed.

- [ ] **Step 3: Commit**

```bash
git add tests/api/dropin/walkup-rates.test.ts
git commit -m "test(api): walk-up rate card PUT accept/reject"
```

---

### Task 8: Full verification

- [ ] **Step 1: Unit suite (the new + existing)**

Run: `npx vitest run tests/unit/resolve-rate-walkup.test.ts tests/unit/rate-card-validator.test.ts`
Expected: all PASS.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds. Ignore known pre-existing noise: `Astro.request.headers` prerender warnings; and any `Cannot read properties of null (reading 'select')` from a prerendered guide page that queries the DB at build with no `DATABASE_URL` in this shell. Confirm no error references the files changed in this plan (`pricing.ts`, `rate-card.ts`, `RateCardEditor.tsx`, `SessionForm.tsx`, the two kiosk routes, the walk-up route).

- [ ] **Step 4: Confirm migration present + idempotent**

Run: `git status --porcelain src/lib/db/migrations` (should be clean — already committed) and visually confirm the `0055_*.sql` uses `ADD COLUMN IF NOT EXISTS` for both columns.

---

## Self-review (coverage map)

- **Schema (both columns, idempotent migration)** → Task 1.
- **Channel-aware `resolveRate` (optional `source`, walk-up rate, members unaffected, per-session override)** → Task 2 (+ tests).
- **Enforce at staffed desk** → Task 3. **Enforce at kiosk (start + payment, base + surcharge)** → Task 4.
- **Rate-card admin (validator + endpoint + editor)** → Task 5 (+ validator test).
- **Per-session override (create + update endpoints + SessionForm)** → Task 6.
- **API tests** → Task 7. **Build/type/unit verification** → Task 8.
- **Out of scope (kiosk membership, terminal surcharge policy, paymentMethod labeling, `pending_payment` enum)** → not implemented, per spec.
- **Back-compat:** `source` defaults to `online_booking` and `walkUpRateCents` is optional on `SessionRateOverrides`, so the 6 online `resolveRate` callers are untouched (verified by the Task 2 / Task 8 `tsc` runs).
```
