# Youth Class Memberships — Plan 1: Per-Child Memberships, Billing & Camp Discount

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-child membership subscriptions (monthly package + $45/yr fee on one Stripe subscription), sibling discount, membership revenue in the payments ledger, and the automatic 10% member discount on camps.

**Architecture:** Extends the existing `memberships`/`membership_tiers` Stripe-subscription system (SoccerOne-proven) with a nullable `family_member_id` dimension; the $45 fee rides the first invoice as a one-time line item (drop-league pattern) and is re-invoiced annually by cron. The camp discount hooks into `create-checkout-for-registration.ts` where the program row is already loaded. Class scheduling/booking is **Plan 2** — nothing here depends on it.

**Tech Stack:** Astro 5 API routes, Drizzle ORM (Postgres/Railway), Stripe subscriptions + invoice items, Vitest (`tests/unit`, `tests/api`), zod.

**Spec:** `docs/superpowers/specs/2026-08-23-youth-class-memberships-design.md`

## Global Constraints

- Execute in a fresh worktree on branch `youth-memberships-billing` (create via `superpowers:using-git-worktrees` before Task 1). Run `git branch --show-current` before every edit session.
- Schema changes: edit `src/lib/db/schema/*`, then `npm run db:generate`, review the SQL, commit the migration. Never `db:push` against Railway.
- **Enum value additions must be their own migration file** (Postgres 55P04 precedent) — Task 2 exists solely for this.
- Every `findFirst`/`.limit(1)` needs an explicit `orderBy` (multi-tenant CI hazard).
- `npx tsc --noEmit` must stay at zero errors; run before every commit.
- API tests hit a running dev server: start `npm run dev:bws` first (staging DB); Stripe-dependent tests use the `itWithStripe` gate pattern from `tests/api` (CI has no Stripe keys).
- Sibling discount percent: default **10**, read from org settings key `siblingDiscountPct`.
- Camp discount rule: applies to the early-bird-adjusted amount; a typed discount code **replaces** it — the single larger discount wins, never both.
- All work must be verified in a real browser before the final task closes (owner requirement), not just test-green.

---

### Task 1: Schema — per-child memberships, tier fee/tagline, payments.membership_id

**Files:**
- Modify: `src/lib/db/schema/memberships.ts`
- Modify: `src/lib/db/schema/payments.ts:66-115`
- Create: `src/lib/db/migrations/NNNN_*.sql` (via `npm run db:generate`)

**Interfaces:**
- Produces: `memberships.familyMemberId: uuid | null`, `memberships.feeNextDueAt: timestamp | null`, `membershipTiers.annualFeeCents: integer | null`, `membershipTiers.tagline: text | null`, `membershipTiers.stripePriceIdFee: text | null`, `payments.membershipId: uuid | null`. Index split: child memberships unique per `(userId, organizationId, familyMemberId)` live-status; adult (null-child) rows keep the old `(userId, organizationId)` rule.

- [ ] **Step 1: Edit `memberships.ts`**

In `membershipTiers`, after `monthlyPriceCents`/`annualPriceCents` (line ~59):

```typescript
    annualFeeCents: integer("annual_fee_cents"),
    tagline: text("tagline"),
```

and after `stripePriceIdAnnual` (line ~62):

```typescript
    stripePriceIdFee: text("stripe_price_id_fee"),
```

In `memberships`, import `familyMembers` (`import { familyMembers } from "./registrations";`) and add after `userId`:

```typescript
    familyMemberId: uuid("family_member_id").references(
      () => familyMembers.id,
      { onDelete: "restrict" },
    ),
```

after `currentPeriodEnd`:

```typescript
    feeNextDueAt: timestamp("fee_next_due_at", { withTimezone: true }),
```

Replace the single partial unique index (lines 121-123) with:

```typescript
    // Adult (self) memberships: unchanged one-active-per-user-per-org rule.
    uniqueIndex("memberships_one_active_per_user_org")
      .on(table.userId, table.organizationId)
      .where(
        sql`status IN ('active', 'paused', 'past_due', 'incomplete') AND family_member_id IS NULL`,
      ),
    // Child memberships: one active per child per org.
    uniqueIndex("memberships_one_active_per_child_org")
      .on(table.organizationId, table.familyMemberId)
      .where(
        sql`status IN ('active', 'paused', 'past_due', 'incomplete') AND family_member_id IS NOT NULL`,
      ),
    index("memberships_family_member_idx").on(table.familyMemberId),
```

- [ ] **Step 2: Edit `payments.ts`**

Import memberships (`import { memberships } from "./memberships";`) and add after `teamRegistrationId` (line ~75):

```typescript
    membershipId: uuid("membership_id").references(() => memberships.id, {
      onDelete: "set null",
    }),
```

and in the index block:

```typescript
    index("payments_membership_idx").on(table.membershipId),
```

Check for an import cycle: `memberships.ts` must not import from `payments.ts` (it doesn't today). If `tsc` reports a cycle, use a plain `uuid("membership_id")` soft reference with a comment instead of the FK.

- [ ] **Step 3: Generate + review the migration**

Run: `npm run db:generate`
Review the generated `src/lib/db/migrations/NNNN_*.sql`: it must contain only `ALTER TABLE ... ADD COLUMN`, `DROP INDEX`/`CREATE UNIQUE INDEX` statements, and **no enum changes**. The old `memberships_one_active_per_user_org` index is dropped and recreated with the `family_member_id IS NULL` predicate — confirm both partial predicates appear.

- [ ] **Step 4: Type check + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/lib/db/schema/memberships.ts src/lib/db/schema/payments.ts src/lib/db/migrations/
git commit -m "feat(memberships): per-child membership schema — family_member_id, annual fee, payments link"
```

---

### Task 2: Enum migration — `payment_type` gains `membership`

**Files:**
- Modify: `src/lib/db/schema/payments.ts:20-26`
- Create: `src/lib/db/migrations/NNNN_*.sql` (own migration, nothing else in it)

**Interfaces:**
- Produces: `paymentTypeEnum` includes `"membership"`; later tasks insert `payments` rows with `paymentType: "membership"`.

- [ ] **Step 1: Edit the enum**

```typescript
export const paymentTypeEnum = pgEnum("payment_type", [
  "deposit",
  "full",
  "balance",
  "refund",
  "installment",
  "membership",
]);
```

- [ ] **Step 2: Generate — verify the migration contains ONLY the enum add**

Run: `npm run db:generate`
The generated SQL must be exactly one statement of the form `ALTER TYPE "payment_type" ADD VALUE 'membership';` (drizzle may wrap it). If drizzle bundled other pending changes, you skipped committing Task 1's migration — stop and fix.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema/payments.ts src/lib/db/migrations/
git commit -m "feat(payments): add 'membership' payment type (enum-only migration)"
```

---

### Task 3: Benefit keys + per-child membership lookup

**Files:**
- Modify: `src/lib/memberships/tier-units.ts:12-22`
- Modify: `src/lib/db/schema/memberships.ts:41-48` (doc comment only)
- Create: `src/lib/memberships/get-child-membership.ts`
- Test: `tests/unit/memberships/get-child-membership.test.ts` (pure parts), `tests/api/memberships-child-lookup.test.ts` deferred to Task 5 (needs webhook-inserted rows)

**Interfaces:**
- Consumes: Task 1 columns.
- Produces: `benefitsSchema` accepts `classes_per_month`, `unlimited_classes`, `camp_discount_pct`. `getActiveChildMembership(familyMemberId: string, organizationId: string, dbOrTx?): Promise<ChildMembership | null>` where `ChildMembership = { id: string; userId: string; tierId: string; tierName: string; status: "active" | "paused" | "past_due" | "incomplete"; benefits: Record<string, unknown> }`.

- [ ] **Step 1: Extend `benefitsSchema` in `tier-units.ts`**

```typescript
    members_only_pickup: z.boolean().optional(),
    classes_per_month: count.optional(),
    unlimited_classes: z.boolean().optional(),
    camp_discount_pct: z.number().int().min(0).max(100).optional(),
```

Also append the three keys to the known-keys doc comment in `schema/memberships.ts` (lines 41-48).

- [ ] **Step 2: Write the failing test**

`tests/unit/memberships/benefits-schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { benefitsSchema } from "@/lib/memberships/tier-units";

describe("benefitsSchema class keys", () => {
  it("accepts the class package keys", () => {
    const parsed = benefitsSchema.parse({
      classes_per_month: 4,
      unlimited_classes: false,
      camp_discount_pct: 10,
    });
    expect(parsed.classes_per_month).toBe(4);
    expect(parsed.camp_discount_pct).toBe(10);
  });
  it("rejects out-of-range camp_discount_pct", () => {
    expect(() => benefitsSchema.parse({ camp_discount_pct: 101 })).toThrow();
  });
});
```

Run: `npx vitest run tests/unit/memberships/benefits-schema.test.ts` → PASS after Step 1 (schema-first here; the failing-first cycle applies to Step 3's helper). If it passes before Step 1, your zod `.passthrough()` masked the range check — the second assertion is the one that must flip from red to green.

- [ ] **Step 3: Create `get-child-membership.ts`**

```typescript
/**
 * Child-membership lookup: resolves the active membership FOR A CHILD
 * (family_members row), not for the paying user. Used by the camp
 * discount (Plan 1) and class booking/auto-booking (Plan 2).
 *
 * Mirrors get-active-membership.ts's tier-join safety gate: zero rows
 * when the org has no tiers or the child has no live membership.
 */
import { and, eq, inArray, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";

type DbClient =
  | ReturnType<typeof getDb>
  | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

const LIVE_STATUSES = ["active", "paused", "past_due", "incomplete"] as const;

export interface ChildMembership {
  id: string;
  userId: string;
  tierId: string;
  tierName: string;
  status: (typeof LIVE_STATUSES)[number];
  benefits: Record<string, unknown>;
}

export async function getActiveChildMembership(
  familyMemberId: string,
  organizationId: string,
  dbOrTx?: DbClient,
): Promise<ChildMembership | null> {
  const db = dbOrTx ?? getDb();
  const rows = await db
    .select({ m: memberships, t: membershipTiers })
    .from(memberships)
    .innerJoin(membershipTiers, eq(membershipTiers.id, memberships.tierId))
    .where(
      and(
        eq(memberships.familyMemberId, familyMemberId),
        eq(memberships.organizationId, organizationId),
        eq(membershipTiers.organizationId, organizationId),
        inArray(memberships.status, [...LIVE_STATUSES]),
      ),
    )
    .orderBy(desc(memberships.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.m.id,
    userId: row.m.userId,
    tierId: row.t.id,
    tierName: row.t.name,
    status: row.m.status as ChildMembership["status"],
    benefits:
      typeof row.t.benefits === "object" && row.t.benefits !== null
        ? (row.t.benefits as Record<string, unknown>)
        : {},
  };
}
```

- [ ] **Step 4: Type check + commit**

Run: `npx tsc --noEmit` and `npx vitest run tests/unit/memberships/` → PASS.

```bash
git add src/lib/memberships/tier-units.ts src/lib/db/schema/memberships.ts src/lib/memberships/get-child-membership.ts tests/unit/memberships/benefits-schema.test.ts
git commit -m "feat(memberships): class benefit keys + child membership lookup"
```

---

### Task 4: Admin tier form/API — fee, tagline, class benefits, fee Stripe Price

**Files:**
- Modify: `src/lib/memberships/tier-units.ts:24-36` (`tierInputSchema`)
- Modify: `src/lib/memberships/admin-stripe.ts`
- Modify: `src/pages/api/admin/memberships/tiers/index.ts` (create path)
- Modify: `src/pages/api/admin/memberships/tiers/[id].ts` (edit path)
- Modify: `src/components/admin/memberships/tier-form.tsx`
- Test: `tests/unit/memberships/tier-units.test.ts`

**Interfaces:**
- Consumes: Task 1 columns (`annualFeeCents`, `tagline`, `stripePriceIdFee`), Task 3 benefit keys.
- Produces: `tierInputSchema` gains `annualFeeDollars: number | null`, `tagline: string | null`. `createTierStripeObjects` gains `annualFeeCents: number | null` in opts and `feePriceId: string | null` in `StripeTierRefs`. `createFeePrice(productId: string, amountCents: number): Promise<string>` exported from `admin-stripe.ts`.

- [ ] **Step 1: Write the failing schema test**

```typescript
import { describe, it, expect } from "vitest";
import { tierInputSchema } from "@/lib/memberships/tier-units";

describe("tierInputSchema fee + tagline", () => {
  it("accepts annual fee and tagline", () => {
    const v = tierInputSchema.parse({
      name: "All-Star",
      monthlyDollars: 120,
      annualDollars: null,
      annualFeeDollars: 45,
      tagline: "8 classes a month",
      benefits: { classes_per_month: 8, camp_discount_pct: 10 },
    });
    expect(v.annualFeeDollars).toBe(45);
    expect(v.tagline).toBe("8 classes a month");
  });
});
```

Run: `npx vitest run tests/unit/memberships/tier-units.test.ts` → FAIL (unknown keys stripped / type error).

- [ ] **Step 2: Extend `tierInputSchema`**

Add inside the object, before `.refine`:

```typescript
    annualFeeDollars: z.number().positive().nullable().default(null),
    tagline: z.string().trim().max(120).nullable().default(null),
```

Run the test → PASS.

- [ ] **Step 3: Fee Price support in `admin-stripe.ts`**

```typescript
/** One-time Price for the annual membership fee (rides the first invoice
 *  and each anniversary's invoice item — not a recurring Price). */
export async function createFeePrice(
  productId: string,
  amountCents: number,
): Promise<string> {
  const price = await s().prices.create({
    product: productId,
    unit_amount: amountCents,
    currency: "usd",
  });
  return price.id;
}
```

Extend `createTierStripeObjects` opts with `annualFeeCents: number | null` and its return:

```typescript
  const feePriceId =
    opts.annualFeeCents != null
      ? await createFeePrice(product.id, opts.annualFeeCents)
      : null;
  return { productId: product.id, monthlyPriceId, annualPriceId, feePriceId };
```

Add `feePriceId: string | null` to `StripeTierRefs`. In `applyTierStripeEdits`, add opts `old.feeCents/old.feePriceId` and `next.feeCents`; when the fee changed: archive the old fee price (`prices.update(id, { active: false })`) and create a new one via `createFeePrice`; return `feePriceId` alongside the interval price ids. (No diff helper needed — the fee has no interval dimension; a direct `old !== next` comparison suffices.)

- [ ] **Step 4: Wire the admin endpoints**

In `tiers/index.ts` (create): pass `annualFeeCents: dollarsToCents(input.annualFeeDollars)` into `createTierStripeObjects`, persist `annualFeeCents`, `tagline`, `stripePriceIdFee: refs.feePriceId`. In `tiers/[id].ts` (edit): thread old/next fee cents through `applyTierStripeEdits`, persist the returned `feePriceId` and the new `annualFeeCents`/`tagline`. Follow the exact persistence pattern already used for `stripePriceIdMonthly`.

- [ ] **Step 5: Tier form fields**

In `tier-form.tsx`, mirror the existing `monthlyDollars` input for: "Annual fee ($/yr)" → `annualFeeDollars`, "Tagline" (text, maxLength 120) → `tagline`, and in the benefits section three inputs mapped to `classes_per_month` (number), `unlimited_classes` (checkbox), `camp_discount_pct` (number 0-100), following the shapes of `free_pickup_per_month` / `unlimited_pickup` / `rental_discount_pct` already in the form.

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit` → zero. `npx vitest run tests/unit/memberships/` → PASS.

```bash
git add src/lib/memberships/tier-units.ts src/lib/memberships/admin-stripe.ts src/pages/api/admin/memberships/tiers/ src/components/admin/memberships/tier-form.tsx tests/unit/memberships/tier-units.test.ts
git commit -m "feat(admin): membership tier fee, tagline, and class benefit fields"
```

---

### Task 5: Subscribe endpoint — per-child, fee line item, sibling coupon

**Files:**
- Modify: `src/pages/api/memberships/subscribe.ts`
- Modify: `src/lib/memberships/stripe.ts:69-135` (`createSubscriptionCheckoutSession`)
- Create: `src/lib/memberships/sibling-discount.ts`
- Modify: `src/lib/memberships/webhook-handlers.ts:25-128` (`handleCheckoutSessionCompleted`)
- Test: `tests/unit/memberships/sibling-discount.test.ts`, `tests/api/memberships-child-subscribe.test.ts`

**Interfaces:**
- Consumes: Task 1 columns, Task 3 `getActiveChildMembership` types, Task 4 `stripePriceIdFee`.
- Produces: `POST /api/memberships/subscribe` body gains optional `familyMemberId: string`; `createSubscriptionCheckoutSession` opts gain `familyMemberId?: string`, `feePriceId?: string | null`, `couponId?: string | null`; webhook inserts `familyMemberId` + `feeNextDueAt`. `getSiblingCouponId(orgId: string, userId: string, familyMemberId: string): Promise<string | null>` from `sibling-discount.ts`.

- [ ] **Step 1: Write the failing unit test for sibling eligibility**

`sibling-discount.ts` exposes a pure predicate so eligibility is testable without Stripe:

```typescript
import { describe, it, expect } from "vitest";
import { isSiblingEligible } from "@/lib/memberships/sibling-discount";

describe("isSiblingEligible", () => {
  it("eligible when another child of the same user holds a live membership", () => {
    expect(
      isSiblingEligible(
        [{ familyMemberId: "kid-a", status: "active" }],
        "kid-b",
      ),
    ).toBe(true);
  });
  it("not eligible for the same child (re-subscribe) or with no existing rows", () => {
    expect(
      isSiblingEligible(
        [{ familyMemberId: "kid-b", status: "active" }],
        "kid-b",
      ),
    ).toBe(false);
    expect(isSiblingEligible([], "kid-b")).toBe(false);
  });
});
```

Run: `npx vitest run tests/unit/memberships/sibling-discount.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement `sibling-discount.ts`**

```typescript
/**
 * Sibling discount: an additional child's monthly package gets a percent-off
 * Stripe coupon, decided at subscribe time and kept for the life of the
 * subscription (no re-ranking when the full-price sibling cancels — spec'd).
 * Rate comes from org settings `siblingDiscountPct`, default 10.
 */
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships } from "@/lib/db/schema/memberships";
import { organizations } from "@/lib/db/schema/organizations";
import { membershipsStripe } from "./stripe";

const LIVE = ["active", "paused", "past_due", "incomplete"] as const;
export const DEFAULT_SIBLING_DISCOUNT_PCT = 10;

export function isSiblingEligible(
  existing: Array<{ familyMemberId: string | null; status: string }>,
  familyMemberId: string,
): boolean {
  return existing.some(
    (m) =>
      m.familyMemberId != null &&
      m.familyMemberId !== familyMemberId &&
      (LIVE as readonly string[]).includes(m.status),
  );
}

/** Returns a reusable Stripe coupon id when the discount applies, else null. */
export async function getSiblingCouponId(
  orgId: string,
  userId: string,
  familyMemberId: string,
): Promise<string | null> {
  const db = getDb();
  const existing = await db
    .select({
      familyMemberId: memberships.familyMemberId,
      status: memberships.status,
    })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, orgId),
        isNotNull(memberships.familyMemberId),
        ne(memberships.familyMemberId, familyMemberId),
        inArray(memberships.status, [...LIVE]),
      ),
    );
  if (!isSiblingEligible(existing, familyMemberId)) return null;

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const pct =
    (org?.settings as { siblingDiscountPct?: number } | null)
      ?.siblingDiscountPct ?? DEFAULT_SIBLING_DISCOUNT_PCT;
  if (pct <= 0) return null;

  // Reusable forever-duration coupon, one per percent. Custom coupon ids
  // make create idempotent: on resource_already_exists we reuse it.
  const couponId = `sibling-${pct}pct`;
  const s = membershipsStripe();
  try {
    await s.coupons.create({
      id: couponId,
      percent_off: pct,
      duration: "forever",
      name: `Sibling discount ${pct}%`,
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "resource_already_exists") throw err;
  }
  return couponId;
}
```

Add `siblingDiscountPct?: number` to the `OrganizationSettings` type (`src/lib/db/schema/organizations.ts:422` block).

Run the unit test → PASS.

- [ ] **Step 3: Extend `createSubscriptionCheckoutSession`**

Add to opts: `familyMemberId?: string; feePriceId?: string | null; couponId?: string | null`. Changes inside:

```typescript
    line_items: [
      { price: opts.priceId, quantity: 1 },
      ...(opts.feePriceId ? [{ price: opts.feePriceId, quantity: 1 }] : []),
    ],
    ...(opts.couponId ? { discounts: [{ coupon: opts.couponId }] } : {}),
```

Add `...(opts.familyMemberId ? { family_member_id: opts.familyMemberId } : {})` to **both** metadata blocks (session + subscription_data). Extend the idempotency key so per-child sessions don't collide: `` `${opts.userId}:${opts.familyMemberId ?? "self"}:${opts.tierId}:${opts.billingInterval}:checkout:v1` ``. Note: `discounts` and `allow_promotion_codes` are mutually exclusive in Checkout — we don't use promotion codes, no conflict.

- [ ] **Step 4: Extend the subscribe endpoint**

In `subscribe.ts`: parse optional `familyMemberId` from the body. When present, validate ownership before anything else — the child must be the caller's dependent:

```typescript
import { familyMembers } from "@/lib/db/schema/registrations";
import { getSiblingCouponId } from "@/lib/memberships/sibling-discount";
// after tier lookup:
let familyMemberId: string | null = null;
if (typeof body.familyMemberId === "string") {
  const [child] = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.id, body.familyMemberId),
        eq(familyMembers.parentUserId, locals.user.id),
      ),
    )
    .limit(1);
  if (!child) return json({ error: "Family member not found" }, 404);
  familyMemberId = child.id;
}
const couponId = familyMemberId
  ? await getSiblingCouponId(locals.organization.id, locals.user.id, familyMemberId)
  : null;
```

Pass to the session call: `familyMemberId: familyMemberId ?? undefined, feePriceId: familyMemberId ? tier.stripePriceIdFee : null, couponId`. (The fee only attaches to child memberships; adult SoccerOne tiers have no fee configured, so this is belt-and-braces.)

- [ ] **Step 5: Webhook — persist child + fee anniversary**

In `handleCheckoutSessionCompleted`, read `const familyMemberId = session.metadata.family_member_id ?? null;` and extend the insert values (import `nextFeeDueAt` from `./annual-fee` — same calendar-year math as the cron, no 365-day drift):

```typescript
      familyMemberId,
      feeNextDueAt: familyMemberId ? nextFeeDueAt(new Date()) : null,
```

(If Task 7 hasn't run yet when this task executes, create `src/lib/memberships/annual-fee.ts` with just the `nextFeeDueAt` function from Task 7 Step 2 — Task 7 then fills in the rest of the file.)

Set `feeNextDueAt` only when the tier actually has a fee: fetch the tier's `annualFeeCents` before the insert (single `select` by `tierId`, `.limit(1)` with `orderBy` not needed — primary-key lookup) and gate on it being non-null.

- [ ] **Step 6: API test**

`tests/api/memberships-child-subscribe.test.ts` (follow the existing signed-in API test helpers; itWithStripe-gate the checkout call):

```typescript
// Shape (adapt helper imports to tests/api conventions):
// 1. Sign in as parent@test.aspiresports.com.
// 2. POST /api/memberships/subscribe with a familyMemberId belonging to a
//    DIFFERENT user → expect 404.
// 3. itWithStripe: POST with own child + tierId → expect 200 + checkoutUrl.
// 4. POST with familyMemberId: "not-a-uuid" → expect 404/422, not 500.
```

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/memberships-child-subscribe.test.ts` (dev server up) → PASS.

- [ ] **Step 7: Type check + commit**

```bash
npx tsc --noEmit
git add src/pages/api/memberships/subscribe.ts src/lib/memberships/stripe.ts src/lib/memberships/sibling-discount.ts src/lib/memberships/webhook-handlers.ts src/lib/db/schema/organizations.ts tests/
git commit -m "feat(memberships): per-child subscribe with annual fee line item and sibling coupon"
```

---

### Task 6: `invoice.paid` → payments ledger + revenue report

**Files:**
- Create: `src/lib/memberships/invoice-ledger.ts`
- Modify: `src/lib/stripe/handle-stripe-event.ts:112-123` (event list doc), `:227-233` (add case)
- Modify: `src/components/admin/revenue-report.tsx` (include membership rows)
- Test: `tests/unit/memberships/invoice-ledger.test.ts`

**Interfaces:**
- Consumes: Task 1 `payments.membershipId`, Task 2 `"membership"` payment type.
- Produces: `handleInvoicePaid(invoice: Stripe.Invoice): Promise<void>` from `invoice-ledger.ts`; exported pure helper `invoiceToLedgerRow(invoice, membership)` for unit tests.

- [ ] **Step 1: Write the failing unit test**

```typescript
import { describe, it, expect } from "vitest";
import { invoiceToLedgerRow } from "@/lib/memberships/invoice-ledger";

const membership = { id: "mem-1", userId: "user-1" };

describe("invoiceToLedgerRow", () => {
  it("maps a paid invoice to a membership payment row", () => {
    const row = invoiceToLedgerRow(
      {
        id: "in_1",
        amount_paid: 16500,
        payment_intent: "pi_1",
        charge: "ch_1",
      } as never,
      membership,
    );
    expect(row).toEqual({
      membershipId: "mem-1",
      userId: "user-1",
      amountCents: 16500,
      paymentType: "membership",
      status: "succeeded",
      stripePaymentIntentId: "pi_1",
      stripeChargeId: "ch_1",
      metadata: { stripe_invoice_id: "in_1" },
    });
  });
  it("returns null for zero-amount invoices", () => {
    expect(
      invoiceToLedgerRow({ id: "in_2", amount_paid: 0 } as never, membership),
    ).toBeNull();
  });
});
```

Run: `npx vitest run tests/unit/memberships/invoice-ledger.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement `invoice-ledger.ts`**

```typescript
/**
 * invoice.paid → payments ledger. Closes the gap where month-2+
 * subscription revenue was invisible to admin reporting: every paid
 * subscription invoice (first and recurring, memberships and drop-league)
 * lands as a payments row.
 *
 * Idempotent: payments has a partial unique index on
 * stripe_payment_intent_id; onConflictDoNothing absorbs webhook retries.
 * Invoices without a payment intent (rare $0 or credit cases) are skipped.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships } from "@/lib/db/schema/memberships";
import { payments } from "@/lib/db/schema/payments";

export function invoiceToLedgerRow(
  invoice: Stripe.Invoice,
  membership: { id: string; userId: string },
) {
  if (!invoice.amount_paid || invoice.amount_paid <= 0) return null;
  const pi =
    typeof invoice.payment_intent === "string"
      ? invoice.payment_intent
      : invoice.payment_intent?.id ?? null;
  const charge =
    typeof invoice.charge === "string" ? invoice.charge : invoice.charge?.id ?? null;
  return {
    membershipId: membership.id,
    userId: membership.userId,
    amountCents: invoice.amount_paid,
    paymentType: "membership" as const,
    status: "succeeded" as const,
    stripePaymentIntentId: pi,
    stripeChargeId: charge,
    metadata: { stripe_invoice_id: invoice.id },
  };
}

export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.subscription) return;
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription.id;
  const db = getDb();
  const [membership] = await db
    .select({ id: memberships.id, userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.stripeSubscriptionId, subscriptionId))
    .limit(1); // unique column — at most one row
  if (!membership) return; // drop-league or unknown sub — not ours
  const row = invoiceToLedgerRow(invoice, membership);
  if (!row) return;
  await db
    .insert(payments)
    .values(row)
    .onConflictDoNothing({ target: payments.stripePaymentIntentId });
}
```

Run the test → PASS.

- [ ] **Step 3: Wire the event**

In `handle-stripe-event.ts`: add `invoice.paid` to the required-events doc list (line ~123) and a case next to `invoice.payment_failed`:

```typescript
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      await handleInvoicePaid(invoice);
      console.log(`[stripe webhook] invoice.paid (ledger) → ${invoice.id}`);
      break;
    }
```

Import from `@/lib/memberships/invoice-ledger`. **Deploy note for the plan executor:** `invoice.paid` must also be added to the Stripe Dashboard webhook endpoint's event list at ship time — record this in the PR description.

- [ ] **Step 4: Revenue report**

In `revenue-report.tsx`, find the query that inner-joins `payments.registrationId` and add membership revenue: either widen the join to a `leftJoin` + include `paymentType = 'membership'` rows labeled with the tier name (join `memberships` → `membership_tiers` via `payments.membershipId`), or add a separate "Memberships" summary row — match whichever shape the component's existing grouping uses (inspect before editing; keep the smallest change that makes membership revenue visible with a total and count).

- [ ] **Step 5: Type check + commit**

```bash
npx tsc --noEmit
git add src/lib/memberships/invoice-ledger.ts src/lib/stripe/handle-stripe-event.ts src/components/admin/revenue-report.tsx tests/unit/memberships/invoice-ledger.test.ts
git commit -m "feat(payments): invoice.paid writes membership revenue to the ledger and report"
```

---

### Task 7: Annual-fee anniversary cron

**Files:**
- Create: `src/pages/api/cron/membership-annual-fees.ts`
- Create: `src/lib/memberships/annual-fee.ts`
- Test: `tests/unit/memberships/annual-fee.test.ts`

**Interfaces:**
- Consumes: Task 1 `feeNextDueAt`/`annualFeeCents`/`stripePriceIdFee`.
- Produces: `GET/POST /api/cron/membership-annual-fees` (CRON_SECRET-gated, same pattern as existing crons in `src/pages/api/cron/`); pure helper `nextFeeDueAt(from: Date): Date` (+1 calendar year).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { nextFeeDueAt } from "@/lib/memberships/annual-fee";

describe("nextFeeDueAt", () => {
  it("advances one calendar year", () => {
    expect(nextFeeDueAt(new Date("2026-09-01T12:00:00Z")).toISOString()).toBe(
      "2027-09-01T12:00:00.000Z",
    );
  });
  it("handles Feb 29 → Feb 28", () => {
    expect(nextFeeDueAt(new Date("2028-02-29T00:00:00Z")).toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `annual-fee.ts`**

```typescript
/**
 * Annual membership fee anniversary. The fee rides the FIRST invoice as a
 * one-time Checkout line item; each anniversary this module adds a Stripe
 * invoice item so the fee rides the next monthly subscription invoice.
 *
 * Idempotency: fee_next_due_at is advanced in the same pass that creates
 * the invoice item, and the invoice-item call carries an idempotency key
 * of `${membershipId}:fee:${dueYear}` — a crashed run that already hit
 * Stripe re-sends the same key and Stripe dedupes.
 */
import type Stripe from "stripe";
import { and, eq, isNotNull, lte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { membershipsStripe } from "./stripe";

export function nextFeeDueAt(from: Date): Date {
  const d = new Date(from.getTime());
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  // Feb 29 → setUTCFullYear rolls to Mar 1; clamp back to Feb 28.
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
  return d;
}

export async function processDueAnnualFees(now: Date): Promise<number> {
  const db = getDb();
  const due = await db
    .select({ m: memberships, t: membershipTiers })
    .from(memberships)
    .innerJoin(membershipTiers, eq(membershipTiers.id, memberships.tierId))
    .where(
      and(
        isNotNull(memberships.feeNextDueAt),
        lte(memberships.feeNextDueAt, now),
        inArray(memberships.status, ["active", "past_due"]),
        isNotNull(memberships.stripeCustomerId),
        isNotNull(memberships.stripeSubscriptionId),
      ),
    );
  const s = membershipsStripe();
  let processed = 0;
  for (const { m, t } of due) {
    if (t.annualFeeCents == null || !t.stripePriceIdFee) continue;
    const dueYear = m.feeNextDueAt!.getUTCFullYear();
    await s.invoiceItems.create(
      {
        customer: m.stripeCustomerId!,
        subscription: m.stripeSubscriptionId!,
        price: t.stripePriceIdFee,
      } as Stripe.InvoiceItemCreateParams,
      { idempotencyKey: `${m.id}:fee:${dueYear}` },
    );
    await db
      .update(memberships)
      .set({ feeNextDueAt: nextFeeDueAt(m.feeNextDueAt!), updatedAt: new Date() })
      .where(eq(memberships.id, m.id));
    processed++;
  }
  return processed;
}
```

Run the unit test → PASS.

- [ ] **Step 3: Cron endpoint**

Create `src/pages/api/cron/membership-annual-fees.ts` copying the auth/response skeleton of an existing cron (e.g. the shortest file in `src/pages/api/cron/` — check `CRON_SECRET` handling verbatim), calling `processDueAnnualFees(new Date())` and returning `{ processed }`. Register the schedule wherever the repo's other crons are scheduled (check `netlify.toml` / scheduled-function config for the existing pattern and mirror it; daily is sufficient).

- [ ] **Step 4: Type check + commit**

```bash
npx tsc --noEmit
git add src/lib/memberships/annual-fee.ts src/pages/api/cron/membership-annual-fees.ts tests/unit/memberships/annual-fee.test.ts netlify.toml
git commit -m "feat(memberships): annual fee anniversary cron via Stripe invoice items"
```

---

### Task 8: Member camp discount in checkout

**Files:**
- Create: `src/lib/memberships/camp-discount.ts`
- Modify: `src/lib/payments/create-checkout-for-registration.ts:141-222`
- Test: `tests/unit/memberships/camp-discount.test.ts`

**Interfaces:**
- Consumes: Task 3 `getActiveChildMembership`.
- Produces: `computeMemberCampDiscountCents(amountDueCents: number, benefits: Record<string, unknown>): number` (pure); checkout result/metadata gains `member_discount_pct` + `member_discount_cents`. The checkout function's return payload gains `memberDiscountCents: number` (0 when none) for the order-summary line.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { computeMemberCampDiscountCents } from "@/lib/memberships/camp-discount";

describe("computeMemberCampDiscountCents", () => {
  it("10% of the early-bird-adjusted amount, rounded", () => {
    expect(computeMemberCampDiscountCents(19900, { camp_discount_pct: 10 })).toBe(1990);
    expect(computeMemberCampDiscountCents(19999, { camp_discount_pct: 10 })).toBe(2000);
  });
  it("0 without the benefit, with 0 pct, or out-of-range pct", () => {
    expect(computeMemberCampDiscountCents(19900, {})).toBe(0);
    expect(computeMemberCampDiscountCents(19900, { camp_discount_pct: 0 })).toBe(0);
    expect(computeMemberCampDiscountCents(19900, { camp_discount_pct: 200 })).toBe(0);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `camp-discount.ts`**

```typescript
/** Member camp discount — pure math, clamped like rental_discount_pct. */
export function computeMemberCampDiscountCents(
  amountDueCents: number,
  benefits: Record<string, unknown>,
): number {
  const pct = Number(benefits.camp_discount_pct);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return 0;
  return Math.round((amountDueCents * pct) / 100);
}
```

Run → PASS.

- [ ] **Step 3: Wire into `create-checkout-for-registration.ts`**

After the base `amountDue` computation (line ~142) and **before** the discount-code transaction (line ~160), insert:

```typescript
  // Member camp discount: computed BEFORE code redemption so the two can
  // compete — the single larger discount wins (spec rule), and a losing
  // code is never redeemed (no wasted use).
  let memberDiscountCents = 0;
  let memberDiscountPct = 0;
  if (program.programType === "camp") {
    const childMembership = await getActiveChildMembership(
      registration.familyMemberId,
      orgId,
    );
    if (childMembership && childMembership.status === "active") {
      memberDiscountPct = Number(childMembership.benefits.camp_discount_pct) || 0;
      memberDiscountCents = computeMemberCampDiscountCents(
        amountDue,
        childMembership.benefits,
      );
    }
  }
```

Then adjust the code path: inside the existing transaction, after computing the code's `amount` (line ~200), add the competition gate **before** the redemption insert:

```typescript
      // Spec: member discount and code don't stack — larger single wins.
      // A code that loses to the member discount is NOT redeemed.
      if (amount <= memberDiscountCents) return null;
```

After the transaction block (line ~222), apply whichever won:

```typescript
  if (redeemed) {
    // Code won; member discount is not applied.
    memberDiscountCents = 0;
    memberDiscountPct = 0;
  } else if (memberDiscountCents > 0) {
    amountDue = Math.max(0, amountDue - memberDiscountCents);
  }
```

(`redeemed` handling for the code path itself is unchanged.) Add `member_discount_pct: String(memberDiscountPct)` and `member_discount_cents: String(memberDiscountCents)` to the Stripe session metadata block (line ~310, only when > 0), and include `memberDiscountCents` in the function's return payload alongside the existing discount fields; surface it in the order-summary/payment-step response shape the same way `discountAmountCents` flows today, rendered as a "Member discount −N%" line (mirror the `appliedDiscount` rendering in `src/components/registration/order-summary.tsx:45-72`).

Guest checkout (`guest-checkout.ts:420`) needs no change: guests have no membership, `getActiveChildMembership` returns null.

- [ ] **Step 4: API test additions**

Extend the existing camp/registration checkout API test file (find via `grep -l "create-checkout" tests/api/`) with: (a) member child + camp season → response `memberDiscountCents > 0` and reduced total; (b) member child + a discount code larger than 10% → code applied, `memberDiscountCents === 0`, code usage recorded; (c) non-member child → no member discount. Seed a tier + membership via the e2e seed or direct inserts per that file's conventions; itWithStripe-gate assertions that need a live session.

- [ ] **Step 5: Type check, run tests, commit**

```bash
npx tsc --noEmit
npx vitest run tests/unit/memberships/
git add src/lib/memberships/camp-discount.ts src/lib/payments/create-checkout-for-registration.ts src/components/registration/ tests/
git commit -m "feat(camps): automatic member discount, larger-of vs discount codes"
```

---

### Task 9: Verification pass — browser + full pre-push checklist

**Files:** none created — this is a gate.

- [ ] **Step 1: Migrate staging + seed tiers**

Dev server on staging DB (`npm run dev:bws`). Confirm migrations applied (`npm run db:migrate` path per repo scripts). In `/admin/memberships`, create the three Aspire class tiers with marketing names + taglines + `annualFeeCents: 4500` + benefits (`classes_per_month: 4` / `8` / `unlimited_classes: true`, `camp_discount_pct: 10` on all three).

- [ ] **Step 2: Browser verification (owner-required gate)**

In a real browser: (a) tier admin form round-trips fee/tagline/benefits; (b) subscribe to a child membership with Stripe test card `4242…` — checkout shows package + $45 fee lines; (c) subscribe a second child — checkout shows the 10% sibling coupon; (d) dashboard membership card reflects the child; (e) camp registration checkout for the member child shows the "Member discount −10%" line and reduced total; (f) the same checkout with a 25% discount code applies the code instead; (g) SoccerOne membership page still works (adult path regression). Fix anything misaligned before proceeding — refine until the flows read as high-quality, not merely functional.

- [ ] **Step 3: Full pre-push checklist**

Run in order: `npm run db:seed:e2e`; API tests (`CRON_SECRET=<match> TEST_BASE_URL=http://localhost:4321 npm run test:api`); `npm run build`; `npx tsc --noEmit`. All green.

- [ ] **Step 4: Push + PR**

```bash
git push -u origin youth-memberships-billing
gh pr create --title "feat: per-child class memberships — billing, sibling discount, camp discount" --body "Implements Plan 1 of docs/superpowers/specs/2026-08-23-youth-class-memberships-design.md

- Per-child membership subscriptions ($45/yr fee + monthly package, one Stripe sub per child)
- Sibling discount coupon (org-configurable, default 10%)
- invoice.paid → payments ledger + revenue report (closes the month-2+ blindspot)
- Annual-fee anniversary cron
- Automatic member camp discount (larger-of vs codes)

**Ops TODO before merge:** add \`invoice.paid\` to the Stripe webhook endpoint's event list.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Wait for CI green on the pushed commit before calling the plan done.
