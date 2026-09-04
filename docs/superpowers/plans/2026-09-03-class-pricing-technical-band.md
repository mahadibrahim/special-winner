# Class Pricing — Technical Band + Jersey Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the engineering side of the approved class pricing structure (spec: `docs/superpowers/specs/2026-09-03-class-pricing-structure-design.md`): a technical band on class slot templates, a +$9/mo membership supplement gated at enrollment and booking time, and jersey-size capture at enrollment.

**Architecture:** A boolean `is_technical` on `class_slot_templates` is the single source of the band. The membership premium is a per-tier recurring Stripe Price (`membership_tiers.technical_monthly_cents` / `stripe_price_id_technical`) attached to the subscription as an add-on line item whose **quantity = the child's count of active technical enrollments** — synced best-effort after every enrollment mutation. Gating is a shared pure predicate used at enrollment time (with explicit parent acknowledgement) and in the per-session booking path. Unlimited tiers (`unlimited_classes: true`) always skip the gate.

**Tech Stack:** Astro 5 API routes, Drizzle ORM (PostgreSQL), Stripe subscriptions, React 19 islands, Vitest (unit + API), zod.

## Global Constraints

- Prices from the spec (catalog data, NOT hard-coded in app code): Weekly $125/mo (`classes_per_month: 5`), Plus $199/mo (`classes_per_month: 10`), Unlimited $240/mo (`unlimited_classes: true`); technical supplement $9/mo per weekly technical slot; annual fee $50 (`annualFeeCents: 5000`); camp discount `camp_discount_pct: 10`; drop-in `sessionRateCents` 3500 standard / 3700 technical.
- Unlimited tiers include technical — the gate must never fire when `benefits.unlimited_classes === true`.
- The premium must never be charged silently: enrollment into a technical slot requires an explicit `acknowledgeTechnicalPremium: true` from the client, sent only after the parent confirms UI copy showing the monthly amount.
- A tier with no `technical_monthly_cents` configured (null/0) has no premium — no gate, no add-on. This keeps adult/SoccerOne tiers untouched.
- Tenant scoping: every admin endpoint change keeps the existing `requireSameOrg*` / org-filter patterns; public endpoints stay org-scoped via `locals.organization`.
- Migrations: additive only, `IF NOT EXISTS` guards (repo convention for drifted DBs, see migrations 0023/0024).
- Copy rules: "smaller groups, extra coaching" framing for technical; never the word "surcharge"/"fee" for the supplement in parent-facing copy.
- All work on branch `youth-class-pricing` in this worktree. Run `git branch --show-current` before the first edit of any session.
- CI has no Stripe keys: API tests that require live Stripe calls must degrade or be gated (see `tests/api/` existing `itWithStripe` pattern in Stripe-dependent suites). The add-on sync is best-effort by design, so non-Stripe tests still pass.

---

### Task 1: Schema — technical band, tier supplement price, jersey size

**Files:**
- Modify: `src/lib/db/schema/classes.ts` (classSlotTemplates, ~line 94 before `active`)
- Modify: `src/lib/db/schema/memberships.ts` (membershipTiers, after `stripePriceIdFee` ~line 16 of the table block)
- Modify: `src/lib/db/schema/registrations.ts` (familyMembers table)
- Create: `src/lib/db/migrations/0145_*.sql` (via `npm run db:generate`, then edit for idempotency)

**Interfaces:**
- Produces: `classSlotTemplates.isTechnical: boolean` (`is_technical`, notNull default false); `membershipTiers.technicalMonthlyCents: integer | null` (`technical_monthly_cents`); `membershipTiers.stripePriceIdTechnical: text | null` (`stripe_price_id_technical`); `familyMembers.kitSize: text | null` (`kit_size`). Every later task reads these exact property names.

- [ ] **Step 1: Add the columns**

In `src/lib/db/schema/classes.ts`, inside `classSlotTemplates` directly above `active`:

```typescript
    /** Technical-training band: extra coaching, priced ~$2/class above
     *  standard. Drives the membership supplement gate (enrollment.ts /
     *  book-child.ts) and display chips. Drop-in/block pricing stays on the
     *  per-slot rate columns above — this flag does not change those. */
    isTechnical: boolean("is_technical").notNull().default(false),
```

In `src/lib/db/schema/memberships.ts`, inside `membershipTiers` after `stripePriceIdFee`:

```typescript
    /** Monthly technical-training supplement (+$9/mo per weekly technical
     *  slot). Null/0 = tier has no premium (adult tiers, unlimited). */
    technicalMonthlyCents: integer("technical_monthly_cents"),
    stripePriceIdTechnical: text("stripe_price_id_technical"),
```

In `src/lib/db/schema/registrations.ts`, inside `familyMembers` (next to other nullable profile fields):

```typescript
    /** Jersey size captured at class-membership enrollment (annual fee
     *  includes a jersey). Free-text from a fixed select: YS/YM/YL/AS/AM/AL/AXL. */
    kitSize: text("kit_size"),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/0145_*.sql` containing four `ALTER TABLE ... ADD COLUMN` statements and nothing else. If it contains anything besides these adds, STOP — the schema edit touched something unintended.

- [ ] **Step 3: Make the migration idempotent**

Edit the generated SQL so each statement uses `ADD COLUMN IF NOT EXISTS` (repo convention for drifted DBs).

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema/ src/lib/db/migrations/
git commit -m "feat(classes): schema for technical band, tier supplement price, kit size"
```

---

### Task 2: Shared gate predicate `requiresTechnicalPremium`

**Files:**
- Create: `src/lib/classes/technical-premium.ts`
- Test: `tests/unit/classes/technical-premium.test.ts`

**Interfaces:**
- Produces: `requiresTechnicalPremium(opts: { isTechnicalSlot: boolean; benefits: Record<string, unknown>; technicalMonthlyCents: number | null }): boolean` — Tasks 5 and 6 import this exact signature.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/classes/technical-premium.test.ts
import { describe, it, expect } from "vitest";
import { requiresTechnicalPremium } from "@/lib/classes/technical-premium";

describe("requiresTechnicalPremium", () => {
  const base = { isTechnicalSlot: true, benefits: {}, technicalMonthlyCents: 900 };

  it("fires for a technical slot on a limited tier with a configured premium", () => {
    expect(requiresTechnicalPremium(base)).toBe(true);
  });
  it("never fires for a standard slot", () => {
    expect(requiresTechnicalPremium({ ...base, isTechnicalSlot: false })).toBe(false);
  });
  it("never fires for unlimited tiers", () => {
    expect(
      requiresTechnicalPremium({ ...base, benefits: { unlimited_classes: true } }),
    ).toBe(false);
  });
  it("never fires when no premium is configured (null or 0)", () => {
    expect(requiresTechnicalPremium({ ...base, technicalMonthlyCents: null })).toBe(false);
    expect(requiresTechnicalPremium({ ...base, technicalMonthlyCents: 0 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/classes/technical-premium.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/classes/technical-premium.ts
/**
 * THE one predicate for "does this membership owe the technical supplement
 * for this slot" — shared by the enrollment gate (enrollment.ts) and the
 * per-session booking gate (book-child.ts) so the two can never disagree.
 *
 * Unlimited tiers include technical by design (spec: the top tier stays
 * asterisk-free). A tier with no configured premium has nothing to charge,
 * so the gate stays open — this is what keeps adult/SoccerOne tiers inert.
 */
export function requiresTechnicalPremium(opts: {
  isTechnicalSlot: boolean;
  benefits: Record<string, unknown>;
  technicalMonthlyCents: number | null;
}): boolean {
  if (!opts.isTechnicalSlot) return false;
  if (opts.benefits.unlimited_classes === true) return false;
  return (opts.technicalMonthlyCents ?? 0) > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/classes/technical-premium.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/classes/technical-premium.ts tests/unit/classes/technical-premium.test.ts
git commit -m "feat(classes): shared technical-premium gate predicate"
```

---

### Task 3: Admin templates carry the technical flag

**Files:**
- Modify: `src/lib/classes/admin-templates.ts` (templateInputSchema, ~line 28)
- Modify: `src/pages/api/admin/classes/templates/index.ts` (POST insert values)
- Modify: `src/pages/api/admin/classes/templates/[id].ts` (PUT update values, GET/list select if it enumerates columns)
- Modify: `src/components/admin/classes/template-form.tsx` (checkbox)
- Modify: `src/components/admin/classes/templates-list.tsx` (badge)
- Test: extend `tests/api/admin-class-blocks.test.ts`-adjacent suite — add `tests/api/admin-class-templates-technical.test.ts`

**Interfaces:**
- Consumes: `classSlotTemplates.isTechnical` (Task 1).
- Produces: `templateInputSchema` gains `isTechnical: z.boolean().default(false)`; admin template GET/list responses include `isTechnical: boolean`. Task 4's public endpoint and Task 6's UI rely on the flag being settable here.

- [ ] **Step 1: Write the failing API test**

```typescript
// tests/api/admin-class-templates-technical.test.ts
// Same harness/signin helpers as tests/api/admin-class-packs.test.ts — copy
// its beforeAll admin-signin block verbatim, then:
import { describe, it, expect } from "vitest";
// ... signin boilerplate from admin-class-packs.test.ts ...

describe("admin class templates — technical flag", () => {
  it("round-trips isTechnical through create and list", async () => {
    const created = await adminFetch("/api/admin/classes/templates", {
      method: "POST",
      body: JSON.stringify({
        name: `Tech Test ${Date.now()}`,
        venueId: SEEDED_VENUE_ID, // resolve the same way admin-class-blocks.test.ts does
        weekday: 2,
        startTime: "16:00",
        capacity: 10,
        sessionRateDollars: 37,
        isTechnical: true,
      }),
    });
    expect(created.status).toBe(200);
    const { template } = await created.json();
    expect(template.isTechnical).toBe(true);

    const list = await adminFetch("/api/admin/classes/templates");
    const row = (await list.json()).templates.find((t: any) => t.id === template.id);
    expect(row.isTechnical).toBe(true);
  });
});
```

Adapt field/venue resolution to exactly match the existing `admin-class-packs.test.ts` / `admin-class-blocks.test.ts` harness (auth helper names, seeded venue lookup, response envelope) — read that file first and mirror it; the assertion payload above is the contract.

- [ ] **Step 2: Run to verify it fails**

Run: `CRON_SECRET=<dev-server-value> TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin-class-templates-technical.test.ts` (dev server running)
Expected: FAIL — `isTechnical` undefined in response.

- [ ] **Step 3: Implement**

In `templateInputSchema` (`src/lib/classes/admin-templates.ts`), after `capacity`:

```typescript
  /** Technical-training band — drives the membership supplement gate and
   *  display chips. See classSlotTemplates.isTechnical. */
  isTechnical: z.boolean().default(false),
```

In the POST handler (`templates/index.ts`) add `isTechnical: data.isTechnical` to the insert `values({...})`; in the PUT handler (`templates/[id].ts`) add it to the update `set({...})`. If the GET/list handlers use explicit `.select({...})` column maps, add `isTechnical: classSlotTemplates.isTechnical`; if they select whole rows, no change.

In `template-form.tsx`, add a checkbox styled/structured identically to the existing `active` control:

```tsx
<label className="flex items-center gap-2">
  <Checkbox
    checked={form.isTechnical}
    onCheckedChange={(v) => setForm((f) => ({ ...f, isTechnical: v === true }))}
  />
  <span>
    Technical training class
    <span className="block text-xs text-muted-foreground">
      Smaller groups, extra coaching — members pay the monthly technical supplement.
    </span>
  </span>
</label>
```

(Match the file's actual state-management idiom — it may use react-hook-form `register`/`Controller`; mirror whichever pattern `active` uses.)

In `templates-list.tsx`, next to the template name render:

```tsx
{t.isTechnical && (
  <Badge variant="outline" className="ml-2">Technical</Badge>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classes/admin-templates.ts src/pages/api/admin/classes/templates/ src/components/admin/classes/template-form.tsx src/components/admin/classes/templates-list.tsx tests/api/admin-class-templates-technical.test.ts
git commit -m "feat(admin): technical flag on class slot templates"
```

---

### Task 4: Tier supplement price — admin input + Stripe reconciliation

**Files:**
- Modify: `src/lib/memberships/tier-units.ts` (tierInputSchema)
- Modify: `src/lib/memberships/admin-stripe.ts` (StripeTierRefs, createTierStripeObjects, applyTierStripeEdits)
- Modify: `src/lib/memberships/tier-price-diff.ts` (diff the technical price like the fee price)
- Modify: `src/pages/api/admin/memberships/tiers/index.ts` + `[id].ts` (pass-through + persist)
- Test: `tests/unit/` — extend the existing tier-price-diff unit test file (find via `grep -rl tier-price-diff tests/unit/`); if none exists, create `tests/unit/memberships/tier-price-diff-technical.test.ts`

**Interfaces:**
- Consumes: `membershipTiers.technicalMonthlyCents` / `stripePriceIdTechnical` (Task 1).
- Produces: `tierInputSchema` gains `technicalMonthlyDollars: z.number().positive().nullable().default(null)`; `createTierStripeObjects`/`applyTierStripeEdits` return `technicalPriceId: string | null` alongside the existing ids. Task 5 reads `stripePriceIdTechnical` off the tier row.

- [ ] **Step 1: Read the three files end-to-end first.** `admin-stripe.ts` and `tier-price-diff.ts` implement create/replace/archive for the fee price — the technical price follows the **fee price's pattern with one difference: it is `recurring: { interval: "month" }`, not one-time** (it rides the subscription forever, like the tier price itself).

- [ ] **Step 2: Write the failing unit test** for the diff logic, mirroring the existing fee-price diff tests in shape (read them first):

```typescript
it("replaces the technical price when the amount changes", () => {
  const actions = diffTierPrices(
    { monthlyCents: 12500, annualCents: null, feeCents: 5000, technicalCents: 900,
      monthlyPriceId: "p_m", annualPriceId: null, feePriceId: "p_f", technicalPriceId: "p_t" },
    { monthlyCents: 12500, annualCents: null, feeCents: 5000, technicalCents: 1100 },
  );
  // expected action shape: copy exactly what the fee-price change case asserts,
  // with the technical ids substituted
});
```

Match the file's real `diffTierPrices` signature — if it takes per-interval params rather than an object, extend that shape instead; the contract is "technical price diffs exactly like the fee price".

- [ ] **Step 3: Run to verify it fails.** `npx vitest run <the test file>` — FAIL (unknown field).

- [ ] **Step 4: Implement**

- `tier-units.ts` tierInputSchema, after `annualFeeDollars`:
  ```typescript
  /** Monthly technical-training supplement (+$/mo per weekly technical slot). */
  technicalMonthlyDollars: z.number().positive().nullable().default(null),
  ```
- `admin-stripe.ts`:
  ```typescript
  export async function createTechnicalPrice(
    productId: string,
    unitAmountCents: number,
  ): Promise<string> {
    const price = await s().prices.create({
      product: productId,
      unit_amount: unitAmountCents,
      currency: "usd",
      recurring: { interval: "month" },
      nickname: "Technical training supplement",
    });
    return price.id;
  }
  ```
  Extend `StripeTierRefs` with `technicalPriceId: string | null`; in `createTierStripeObjects` create it when `technicalMonthlyCents` is set; in `applyTierStripeEdits` handle create/replace/archive exactly as the fee-price branches do (create-then-archive on replace; archive + null on removal).
- `tier-price-diff.ts`: add the technical price to whatever structure the fee price uses.
- Admin tier endpoints: persist `technicalMonthlyCents: dollarsToCents(data.technicalMonthlyDollars)` and `stripePriceIdTechnical` from the returned refs, in both POST (create) and PUT (edit), mirroring how `annualFeeCents`/`stripePriceIdFee` flow today.

- [ ] **Step 5: Run tests + type check.** `npx vitest run tests/unit/` and `npx tsc --noEmit` — all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/memberships/ src/pages/api/admin/memberships/ tests/unit/
git commit -m "feat(memberships): per-tier technical supplement price with Stripe reconciliation"
```

---

### Task 5: Add-on quantity sync + enrollment gate

**Files:**
- Create: `src/lib/memberships/technical-addon.ts`
- Modify: `src/lib/memberships/get-child-membership.ts` (return two more fields)
- Modify: `src/lib/classes/enrollment.ts` (gate + sync calls)
- Modify: `src/pages/api/classes/enrollments/index.ts` + `[id].ts` (new error code + ack pass-through)
- Test: `tests/api/classes-technical-enrollment.test.ts`

**Interfaces:**
- Consumes: `requiresTechnicalPremium` (Task 2), `classSlotTemplates.isTechnical` (Task 1), tier columns (Task 4).
- Produces:
  - `ChildMembership` gains `technicalMonthlyCents: number | null` and `stripeSubscriptionId: string | null` (from `row.t.technicalMonthlyCents` / `row.m.stripeSubscriptionId`).
  - `enrollChild` opts gain `acknowledgeTechnicalPremium?: boolean`; new `EnrollmentError` code `"technical_premium_required"`; `changeEnrollmentSlot(id, newSlotTemplateId, opts?: { acknowledgeTechnicalPremium?: boolean })`.
  - `syncTechnicalAddonQuantity(membershipId: string): Promise<void>` — fire-and-forget, never throws to callers.

- [ ] **Step 1: Write the failing API test** (no Stripe needed — the sync is best-effort and the gate fires before any Stripe call). Use the e2e-seeded parent + child + an active membership; mirror the harness of `tests/api/classes/`-adjacent suites (`memberships-child-subscribe.test.ts` shows the signin/child fixtures). The test needs a technical template and a limited tier with `technicalMonthlyCents` — create them via the admin API in `beforeAll` (Task 3 made the flag settable; Task 4 made the tier field settable; Stripe-less environments leave `stripePriceIdTechnical` null, which is fine for the gate).

```typescript
describe("technical enrollment gate", () => {
  it("refuses technical enrollment without acknowledgement", async () => {
    const res = await parentFetch("/api/classes/enrollments", {
      method: "POST",
      body: JSON.stringify({ slotTemplateId: TECH_TEMPLATE_ID, familyMemberId: CHILD_ID }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("technical_premium_required");
    expect(body.technicalMonthlyCents).toBe(900);
  });

  it("enrolls with acknowledgement", async () => {
    const res = await parentFetch("/api/classes/enrollments", {
      method: "POST",
      body: JSON.stringify({
        slotTemplateId: TECH_TEMPLATE_ID,
        familyMemberId: CHILD_ID,
        acknowledgeTechnicalPremium: true,
      }),
    });
    expect(res.status).toBe(200);
  });

  it("standard slots are unaffected", async () => {
    // enroll the same child in a standard template with no ack — 200
  });
});
```

- [ ] **Step 2: Run to verify it fails** (dev server running): the first assertion gets 200 instead of 409.

- [ ] **Step 3: Implement `get-child-membership.ts`** — add to the return object:

```typescript
    technicalMonthlyCents: row.t.technicalMonthlyCents,
    stripeSubscriptionId: row.m.stripeSubscriptionId,
```

and the two fields to the `ChildMembership` interface.

- [ ] **Step 4: Implement `technical-addon.ts`**

```typescript
// src/lib/memberships/technical-addon.ts
/**
 * Keeps a membership's Stripe subscription add-on item ("technical training
 * supplement") in step with reality: quantity = the child's count of ACTIVE
 * technical enrollments backed by that membership.
 *
 * BEST-EFFORT BY DESIGN: called post-commit after enrollment mutations. A
 * Stripe failure must never undo a seat the family already holds — it logs,
 * captures, and leaves the next mutation (or a manual fix) to reconcile.
 * Proration uses Stripe's default (create_prorations) so mid-cycle changes
 * bill fairly without extra machinery.
 */
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classEnrollments, classSlotTemplates } from "@/lib/db/schema/classes";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { membershipsStripe } from "./stripe";
import { captureServerException } from "@/lib/observability/server-error";

export async function syncTechnicalAddonQuantity(membershipId: string): Promise<void> {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        stripeSubscriptionId: memberships.stripeSubscriptionId,
        technicalPriceId: membershipTiers.stripePriceIdTechnical,
        benefits: membershipTiers.benefits,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(membershipTiers.id, memberships.tierId))
      .where(eq(memberships.id, membershipId))
      .limit(1);
    // Nothing to sync: no subscription (shouldn't happen for live rows), no
    // configured supplement price, or an unlimited tier (premium included).
    if (!row?.stripeSubscriptionId || !row.technicalPriceId) return;
    const benefits = (row.benefits ?? {}) as Record<string, unknown>;
    if (benefits.unlimited_classes === true) return;

    const [cnt] = await db
      .select({ c: count() })
      .from(classEnrollments)
      .innerJoin(
        classSlotTemplates,
        eq(classSlotTemplates.id, classEnrollments.slotTemplateId),
      )
      .where(
        and(
          eq(classEnrollments.membershipId, membershipId),
          eq(classEnrollments.status, "active"),
          eq(classSlotTemplates.isTechnical, true),
        ),
      );
    const quantity = cnt?.c ?? 0;

    const s = membershipsStripe();
    const items = await s.subscriptionItems.list({
      subscription: row.stripeSubscriptionId,
      limit: 100,
    });
    const existing = items.data.find(
      (i) => i.price.id === row.technicalPriceId,
    );

    if (existing && quantity === 0) {
      await s.subscriptionItems.del(existing.id);
    } else if (existing && existing.quantity !== quantity) {
      await s.subscriptionItems.update(existing.id, { quantity });
    } else if (!existing && quantity > 0) {
      await s.subscriptionItems.create({
        subscription: row.stripeSubscriptionId,
        price: row.technicalPriceId,
        quantity,
      });
    }
  } catch (err) {
    console.error("[technical-addon] sync failed", { membershipId, err });
    captureServerException(err, { context: "technical-addon-sync", membershipId });
  }
}
```

(Check `captureServerException`'s real signature in `src/lib/observability/server-error.ts` and match it.)

- [ ] **Step 5: Implement the enrollment gate** in `enrollment.ts`:

1. Add `"technical_premium_required"` to `EnrollmentError["code"]`.
2. `enrollChild` opts gain `acknowledgeTechnicalPremium?: boolean`. After the membership gate (after the `no_membership` return), insert:

```typescript
    // Technical supplement gate — the premium must never attach silently.
    // The client re-submits with acknowledgeTechnicalPremium after the
    // parent confirms the "+$X/month" copy. Unlimited tiers and tiers with
    // no configured premium skip (requiresTechnicalPremium).
    if (
      requiresTechnicalPremium({
        isTechnicalSlot: template.isTechnical,
        benefits: membership.benefits,
        technicalMonthlyCents: membership.technicalMonthlyCents,
      }) &&
      !opts.acknowledgeTechnicalPremium
    ) {
      return err(
        "technical_premium_required",
        "This is a technical training class — it adds a monthly supplement to the membership",
      );
    }
```

3. After the `enrollChild` transaction returns ok for a **membership-backed** enrollment, fire the sync (post-commit, like `promoteReleasedSessions`): `await syncTechnicalAddonQuantity(membership.id)` — but structure it so the transaction result is returned regardless (the helper never throws).
4. `changeEnrollmentSlot(id, newSlotTemplateId, opts?: { acknowledgeTechnicalPremium?: boolean })`: for membership-backed enrollments, when the DESTINATION is technical and the ORIGIN is not, run the same gate (fetch the membership's tier fields via `getActiveChildMembership(enrollment.familyMemberId, oldTemplate.organizationId, tx)`). After a successful move OR a successful `endEnrollment` of a membership-backed enrollment, call `syncTechnicalAddonQuantity(<membershipId>)` post-commit. Do NOT call it from `endEnrollmentsForMembership` (the subscription is being destroyed).

- [ ] **Step 6: Wire the endpoints.** `enrollments/index.ts`: pass `acknowledgeTechnicalPremium: body.acknowledgeTechnicalPremium === true` into `enrollChild`; add `technical_premium_required: 409` to `ERROR_STATUS`; when returning that error, include the amount so the UI can render it — look up is cheap: return `json({ error: code, message, technicalMonthlyCents }, 409)` by having `enrollChild` carry the cents on the error object (`EnrollmentError` gains optional `technicalMonthlyCents?: number`, set at the gate from `membership.technicalMonthlyCents`). Same wiring in `[id].ts` for the slot-change PUT.

- [ ] **Step 7: Run the API test** — all three cases PASS. Also `npx vitest run tests/unit/` and `npx tsc --noEmit`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/memberships/ src/lib/classes/enrollment.ts src/pages/api/classes/enrollments/ tests/api/classes-technical-enrollment.test.ts
git commit -m "feat(classes): technical supplement — enrollment gate + Stripe add-on quantity sync"
```

---

### Task 6: Booking gate — allotment make-ups can't leak technical access

**Files:**
- Modify: `src/lib/classes/book-child.ts` (member branch, ~line 231)
- Modify: `src/pages/api/classes/book.ts` (error → status map)
- Test: extend `tests/api/classes-technical-enrollment.test.ts` (same fixtures)

**Interfaces:**
- Consumes: `requiresTechnicalPremium` (Task 2), `ChildMembership.technicalMonthlyCents` (Task 5).
- Produces: new booking error code `"technical_not_included"` (maps to 409); a member WITH an active technical enrollment (or unlimited tier) books technical sessions off the allotment as before.

- [ ] **Step 1: Write the failing test** (extend the Task 5 suite): a child on a limited tier with NO technical enrollment books a technical session via `POST /api/classes/book` → expect 409 `technical_not_included` (or the 402 paid-quote envelope if the endpoint quotes instead — read `book.ts`'s error handling first and assert the real envelope; the contract is: the seat is NOT granted from the allotment). A second case: after the child holds a technical enrollment (created in Task 5's test), the same booking succeeds with `paymentMethod: "member_allotment"`.

- [ ] **Step 2: Run to verify it fails** — the booking currently succeeds off the allotment.

- [ ] **Step 3: Implement.** In `book-child.ts`'s member branch: the session row must know its template's band — check how `session` is loaded; add a join or follow-up select for `classSlotTemplates.isTechnical` via `session.classSlotTemplateId` (null template id = one-off session = standard). Then guard the allotment path:

```typescript
      const isTechnicalSlot = /* template lookup result, false when no template */;
      const technicalBlocked =
        membership !== null &&
        requiresTechnicalPremium({
          isTechnicalSlot,
          benefits: membership.benefits,
          technicalMonthlyCents: membership.technicalMonthlyCents,
        }) &&
        !(await hasActiveTechnicalEnrollment(tx, opts.familyMemberId, membership.id));

      if (membership && membership.status === "active" &&
          membership.classAllotmentRemaining !== 0 && !technicalBlocked) {
        paymentMethod = "member_allotment";
        membershipId = membership.id;
      } else {
        // existing credits fallthrough unchanged, EXCEPT the final else:
        // when the ONLY reason we got here is technicalBlocked (membership
        // active, allotment available), return the distinct code instead of
        // allotment_exhausted:
        //   return err("technical_not_included",
        //     "Technical classes need the technical supplement on the membership");
      }
```

`hasActiveTechnicalEnrollment` is a small helper in `book-child.ts` (or exported from `technical-addon.ts` — implementer's choice, but ONE query: active `classEnrollments` for (familyMemberId, membershipId) joined to `classSlotTemplates.isTechnical = true`, `limit 1`). Add `"technical_not_included"` to the booking error code union and to `book.ts`'s status map as 409.

- [ ] **Step 4: Run the tests** — PASS. Run the full existing classes suites to catch regressions: `npx vitest run tests/api/classes-credit-booking.test.ts tests/api/classes/` (server running) and `npx vitest run tests/unit/classes/`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classes/book-child.ts src/pages/api/classes/book.ts tests/api/classes-technical-enrollment.test.ts
git commit -m "feat(classes): technical band booking gate on member allotment"
```

---

### Task 7: Public surfaces — schedule chip, tier supplement line

**Files:**
- Modify: `src/pages/api/public/class-schedule.ts` (add `isTechnical` to both selects, ~lines 54/125, and response mapping ~line 114)
- Modify: `src/pages/api/public/membership-tiers.ts` (add `technicalMonthlyCents` to the select)
- Modify: `src/lib/classes/ladder-model.ts` (`LadderTier` gains `technicalMonthlyCents?: number | null`)
- Modify: `src/components/youth/class-purchase-ladder.tsx` (supplement line under the membership rung)
- Modify: `src/components/dashboard/choose-slot.tsx` (Technical chip on slots; confirm dialog on `technical_premium_required`)
- Test: extend `tests/api/public-class-catalog.test.ts`; extend `tests/unit/classes/ladder-model.test.ts`

**Interfaces:**
- Consumes: Task 1 columns; Task 5's 409 envelope `{ error: "technical_premium_required", technicalMonthlyCents }`.
- Produces: public schedule slots carry `isTechnical: boolean`; public tiers carry `technicalMonthlyCents: number | null`.

- [ ] **Step 1: Failing tests.** In `public-class-catalog.test.ts` assert a schedule slot object has `isTechnical` (boolean) and a tier object has `technicalMonthlyCents` (null or number) — follow the file's existing shape assertions. In `ladder-model.test.ts` add: a membership rung whose tiers include `technicalMonthlyCents: 900` is passed through unchanged (the model is a pass-through here; the test pins the type so a future field rename breaks loudly).

- [ ] **Step 2: Run to verify both fail.**

- [ ] **Step 3: Implement.**
- `class-schedule.ts`: add `isTechnical: classSlotTemplates.isTechnical` to the template select and the session-side select/mapping so every returned slot carries it.
- `membership-tiers.ts`: add `technicalMonthlyCents: membershipTiers.technicalMonthlyCents` to the select.
- `ladder-model.ts`: add to `LadderTier`: `technicalMonthlyCents?: number | null;`
- `class-purchase-ladder.tsx`, membership rung: when any rendered class tier has `(technicalMonthlyCents ?? 0) > 0`, render once under the tier cards (use the lowest such value if tiers differ):

```tsx
<p className="text-sm text-muted-foreground">
  Technical training classes: +{formatCents(minTechnicalCents)}/month per weekly
  class — smaller groups, extra coaching. Unlimited includes technical.
</p>
```

- `choose-slot.tsx`: render a "Technical" badge on slots with `isTechnical`; on POST failure with `error === "technical_premium_required"`, open the app's standard `ConfirmDialog` (see `src/components/ui/confirm-dialog.tsx`) with title "Technical training class" and body `"This class adds ${formatCents(technicalMonthlyCents)}/month to your membership — smaller groups, extra coaching. Add it?"`; on confirm, re-POST with `acknowledgeTechnicalPremium: true`.

- [ ] **Step 4: Run the tests + a browser check.** Vitest suites green; then load `http://localhost:4321/youth/classes` and the choose-slot page against the dev server (staging DB) and verify the chip and supplement line render (both brands' token rules apply — the island styles itself, per repo convention).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/public/ src/lib/classes/ladder-model.ts src/components/youth/class-purchase-ladder.tsx src/components/dashboard/choose-slot.tsx tests/
git commit -m "feat(classes): technical band on public schedule, tier supplement line, enroll confirm"
```

---

### Task 8: Jersey size capture at enrollment

**Files:**
- Modify: `src/pages/api/classes/enrollments/index.ts` (accept optional `kitSize`)
- Modify: `src/components/dashboard/choose-slot.tsx` (size select)
- Modify: `src/pages/api/admin/classes/templates/[id]/roster.ts` + `src/components/admin/classes/template-roster.tsx` (display)
- Test: extend `tests/api/classes-technical-enrollment.test.ts`

**Interfaces:**
- Consumes: `familyMembers.kitSize` (Task 1).
- Produces: enrollment POST accepts `kitSize?: "YS"|"YM"|"YL"|"AS"|"AM"|"AL"|"AXL"`; roster API rows include `kitSize: string | null`.

- [ ] **Step 1: Failing test:** POST an enrollment with `kitSize: "YM"`; then GET the admin roster for that template and assert the child's row has `kitSize: "YM"`. Invalid value (`kitSize: "XXL"`) → 422.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement.**
- `enrollments/index.ts`: validate `kitSize` against the fixed list (`const KIT_SIZES = ["YS","YM","YL","AS","AM","AL","AXL"] as const;` → 422 on anything else non-null); after a successful `enrollChild`, persist it:

```typescript
    if (kitSize) {
      await getDb()
        .update(familyMembers)
        .set({ kitSize })
        .where(
          and(
            eq(familyMembers.id, familyMemberId),
            eq(familyMembers.parentUserId, locals.user.id),
          ),
        );
    }
```

(After, not inside, the enroll transaction — a size write must never roll back a seat, and ownership was already proven by `enrollChild`; the where-clause re-check is belt-and-braces.)
- `choose-slot.tsx`: a `Select` labelled "Jersey size (included with your membership)" with the seven options, required before submit when the child's membership-backed enrollment is their first (keep it simple: always show, pre-filled from `/api/family-members` if the row already has one — check whether that endpoint returns the new column and add it if the select needs it).
- Roster: add `kitSize: familyMembers.kitSize` to the roster API select and a "Jersey" column in `template-roster.tsx`.

- [ ] **Step 4: Run tests** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/classes/enrollments/index.ts src/components/dashboard/choose-slot.tsx src/pages/api/admin/classes/templates/ src/components/admin/classes/template-roster.tsx tests/
git commit -m "feat(classes): jersey size capture at enrollment + roster display"
```

---

### Task 9: E2E seed, verification sweep, catalog runbook

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts` (a technical template + a tier with `technicalMonthlyCents`, if the API tests didn't already self-provision)
- Create: `docs/runbooks/class-pricing-catalog.md`
- Modify: `tests/e2e/` — grep for specs touching `/youth/classes`, choose-slot, or admin classes pages and update for the new UI elements (post-merge `test-full` runs them; they will not gate the PR)

**Interfaces:** consumes everything above; produces the owner-facing data-entry runbook.

- [ ] **Step 1: Seed.** If Task 5/6 tests provision their fixtures via admin APIs, the seed may need nothing — verify by running `npm run db:seed:e2e` then the full API suite. Add seed fixtures only if tests depend on pre-seeded rows.

- [ ] **Step 2: E2E sweep.** `grep -rl "youth/classes\|choose-slot\|admin/classes" tests/e2e/` — update any spec whose selectors/assertions the new chip, supplement line, confirm dialog, or jersey select break. Run the affected specs: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- <spec>`.

- [ ] **Step 3: Write the runbook** `docs/runbooks/class-pricing-catalog.md` — the owner's exact data entry, verbatim from the spec:

```markdown
# Class pricing catalog — data entry runbook

Do these in the admin UI once the technical-band release is live.

## Membership tiers (Admin → Memberships → Tiers)
| Name | Monthly | Benefits | Annual fee | Technical supplement |
|---|---|---|---|---|
| Weekly | $125 | classes_per_month: 5, camp_discount_pct: 10 | $50 | $9 |
| Plus | $199 | classes_per_month: 10, camp_discount_pct: 10 | $50 | $9 |
| Unlimited | $240 | unlimited_classes: true, camp_discount_pct: 10 | $50 | (leave empty — included) |

Allotments are 5/10 on purpose (not 4/8): months with five Tuesdays must
never block a weekly kid. Copy still says "1 class a week" / "2 a week".

## Slot templates (Admin → Classes → Templates)
- Standard classes: session rate $35, technical checkbox OFF
- Technical classes: session rate $37, technical checkbox ON

## Do NOT create
- Class packs, class blocks — deliberately dormant (spec: one system only).

## Verify after entry
1. /youth/classes shows: trial CTA, three tier cards, the technical
   supplement line, the $50/yr fee copy. No packs/blocks rungs.
2. Test-card subscribe on Weekly → choose a technical slot → confirm dialog
   shows +$9/month → Stripe subscription shows the supplement line item.
3. Cancel the test subscription in the billing portal.
```

- [ ] **Step 4: Full pre-push checklist** (CLAUDE.md major-work sequence): `npm run db:seed:e2e`; API suite with CI-equivalent env; `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test`; `npm run build`; `npx tsc --noEmit`. All green before the PR.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/seeds/ docs/runbooks/class-pricing-catalog.md tests/e2e/
git commit -m "feat(classes): e2e fixtures, catalog runbook, spec sweep for technical band"
```
