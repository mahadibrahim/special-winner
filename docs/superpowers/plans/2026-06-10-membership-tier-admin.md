# Membership Tier Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an org-scoped `/admin/memberships` UI that creates/edits membership tiers and their Stripe Products/Prices in one action, replacing the manual SQL + Stripe-dashboard step in the SoccerOne launch checklist.

**Architecture:** Mirror the existing branding admin (`src/pages/admin/branding/**` + `src/pages/api/admin/branding/**`). Pure logic (units, benefits validation, Stripe price-diff) lives in CI-testable modules; thin Stripe API calls sit on top. Stripe objects are created on the **platform account** (no Connect, per the one-shared-account decision). Price edits create a new Stripe Price and archive the old one — existing subscribers are grandfathered.

**Tech Stack:** Astro 5 SSR pages, React 19 client components, Drizzle ORM (PostgreSQL), Stripe Node SDK (`@/lib/stripe/client`), Vitest (unit + API), Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-10-membership-tier-admin-design.md`

---

## File Structure

**New**
- `src/lib/memberships/tier-units.ts` — dollars↔cents + benefits/tier zod schemas (pure)
- `src/lib/memberships/tier-price-diff.ts` — compute Stripe price actions on edit (pure)
- `src/lib/memberships/admin-stripe.ts` — thin Stripe Product/Price create/edit wrappers
- `src/pages/api/admin/memberships/tiers/index.ts` — GET list, POST create
- `src/pages/api/admin/memberships/tiers/[id].ts` — GET, PUT, DELETE
- `src/pages/api/admin/memberships/tiers/reorder.ts` — PUT reorder
- `src/components/admin/memberships/tier-form.tsx` — create/edit form (client)
- `src/components/admin/memberships/tiers-list.tsx` — list + drag-reorder (client)
- `src/pages/admin/memberships/index.astro` — list page
- `src/pages/admin/memberships/new.astro` — create page
- `src/pages/admin/memberships/[id].astro` — edit page
- `tests/unit/memberships/tier-units.test.ts`
- `tests/unit/memberships/tier-price-diff.test.ts`
- `tests/api/admin/membership-tiers.test.ts`

**Modify**
- `src/lib/db/schema/memberships.ts` — add `stripeProductId`
- `src/lib/admin/nav-super-admin.ts` — add "Memberships" link
- `docs/ops/soccerone-launch-checklist.md` — rewrite §6.5.4

---

## Task 1: Schema — add `stripe_product_id`

**Files:**
- Modify: `src/lib/db/schema/memberships.ts`
- Generate: `src/lib/db/migrations/NNNN_*.sql`

- [ ] **Step 1: Add the column to the Drizzle table**

In `src/lib/db/schema/memberships.ts`, inside the `membershipTiers` table definition, add after `stripePriceIdAnnual`:

```ts
    stripeProductId: text("stripe_product_id"),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/NNNN_*.sql` containing `ALTER TABLE "membership_tiers" ADD COLUMN "stripe_product_id" text;` and an updated `meta/_journal.json`. Review the SQL — it must be additive only.

- [ ] **Step 3: Apply locally + typecheck**

Run: `npm run db:push` (local DB only) then `npx tsc --noEmit`
Expected: push succeeds, zero type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/memberships.ts src/lib/db/migrations
git commit -m "feat(memberships): add stripe_product_id to membership_tiers"
```

---

## Task 2: Pure units + validation (`tier-units.ts`)

**Files:**
- Create: `src/lib/memberships/tier-units.ts`
- Test: `tests/unit/memberships/tier-units.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { dollarsToCents, centsToDollars, benefitsSchema, tierInputSchema } from "@/lib/memberships/tier-units";

describe("dollarsToCents", () => {
  it("converts 29 → 2900", () => expect(dollarsToCents(29)).toBe(2900));
  it("rounds 29.999 → 3000", () => expect(dollarsToCents(29.999)).toBe(3000));
  it("null passes through", () => expect(dollarsToCents(null)).toBeNull());
});

describe("centsToDollars", () => {
  it("2900 → 29", () => expect(centsToDollars(2900)).toBe(29));
  it("null passes through", () => expect(centsToDollars(null)).toBeNull());
});

describe("benefitsSchema", () => {
  it("accepts known typed keys", () => {
    const r = benefitsSchema.parse({ rental_discount_pct: 10, unlimited_pickup: true });
    expect(r.rental_discount_pct).toBe(10);
  });
  it("rejects pct > 100", () => expect(() => benefitsSchema.parse({ rental_discount_pct: 150 })).toThrow());
  it("rejects negative counts", () => expect(() => benefitsSchema.parse({ free_pickup_per_month: -1 })).toThrow());
  it("preserves unknown keys", () => {
    const r = benefitsSchema.parse({ future_perk: 5 }) as Record<string, unknown>;
    expect(r.future_perk).toBe(5);
  });
});

describe("tierInputSchema", () => {
  const base = { name: "Member", monthlyDollars: 29, annualDollars: 290, benefits: {}, displayOrder: 0, isActive: true };
  it("accepts a valid tier", () => expect(tierInputSchema.parse(base).name).toBe("Member"));
  it("rejects empty name", () => expect(() => tierInputSchema.parse({ ...base, name: "" })).toThrow());
  it("rejects when both prices null", () =>
    expect(() => tierInputSchema.parse({ ...base, monthlyDollars: null, annualDollars: null })).toThrow());
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/memberships/tier-units.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { z } from "zod";

export function dollarsToCents(d: number | null): number | null {
  return d == null ? null : Math.round(d * 100);
}
export function centsToDollars(c: number | null): number | null {
  return c == null ? null : c / 100;
}

const count = z.number().int().min(0);
// Known keys are typed; unknown keys are passed through (forward-compat).
export const benefitsSchema = z
  .object({
    rental_discount_pct: z.number().int().min(0).max(100).optional(),
    unlimited_pickup: z.boolean().optional(),
    free_pickup_per_month: count.optional(),
    guest_passes_per_month: count.optional(),
    booking_window_days: count.optional(),
    priority_league_signup_hrs: count.optional(),
    members_only_pickup: z.boolean().optional(),
  })
  .passthrough();

export const tierInputSchema = z
  .object({
    name: z.string().trim().min(1),
    monthlyDollars: z.number().positive().nullable(),
    annualDollars: z.number().positive().nullable(),
    benefits: benefitsSchema,
    displayOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.monthlyDollars != null || v.annualDollars != null, {
    message: "At least one of monthly or annual price is required",
    path: ["monthlyDollars"],
  });

export type TierInput = z.infer<typeof tierInputSchema>;
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/memberships/tier-units.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/memberships/tier-units.ts tests/unit/memberships/tier-units.test.ts
git commit -m "feat(memberships): tier units + benefits/input validation"
```

---

## Task 3: Stripe price-diff logic (`tier-price-diff.ts`)

This is the brain of the edit path — it must be CI-covered without Stripe.

**Files:**
- Create: `src/lib/memberships/tier-price-diff.ts`
- Test: `tests/unit/memberships/tier-price-diff.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { diffTierPrices } from "@/lib/memberships/tier-price-diff";

const old = { monthlyCents: 2900, annualCents: 29000, monthlyPriceId: "price_m", annualPriceId: "price_a" };

describe("diffTierPrices", () => {
  it("no change → all noop", () => {
    const r = diffTierPrices(old, { monthlyCents: 2900, annualCents: 29000 });
    expect(r).toEqual([
      { interval: "month", action: "noop" },
      { interval: "year", action: "noop" },
    ]);
  });
  it("monthly amount changed → replace with oldPriceId", () => {
    const r = diffTierPrices(old, { monthlyCents: 3100, annualCents: 29000 });
    expect(r[0]).toEqual({ interval: "month", action: "replace", amountCents: 3100, oldPriceId: "price_m" });
    expect(r[1]).toEqual({ interval: "year", action: "noop" });
  });
  it("annual added (was null) → create", () => {
    const r = diffTierPrices(
      { monthlyCents: 2900, annualCents: null, monthlyPriceId: "price_m", annualPriceId: null },
      { monthlyCents: 2900, annualCents: 29000 },
    );
    expect(r[1]).toEqual({ interval: "year", action: "create", amountCents: 29000 });
  });
  it("monthly removed (now null) → archive", () => {
    const r = diffTierPrices(old, { monthlyCents: null, annualCents: 29000 });
    expect(r[0]).toEqual({ interval: "month", action: "archive", oldPriceId: "price_m" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/memberships/tier-price-diff.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
export type Interval = "month" | "year";

export type PriceAction =
  | { interval: Interval; action: "noop" }
  | { interval: Interval; action: "create"; amountCents: number }
  | { interval: Interval; action: "archive"; oldPriceId: string }
  | { interval: Interval; action: "replace"; amountCents: number; oldPriceId: string };

type OldState = {
  monthlyCents: number | null;
  annualCents: number | null;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
};
type NextAmounts = { monthlyCents: number | null; annualCents: number | null };

function diffOne(interval: Interval, oldCents: number | null, oldPriceId: string | null, nextCents: number | null): PriceAction {
  if (oldCents == null && nextCents == null) return { interval, action: "noop" };
  if (oldCents == null && nextCents != null) return { interval, action: "create", amountCents: nextCents };
  if (oldCents != null && nextCents == null) return { interval, action: "archive", oldPriceId: oldPriceId! };
  if (oldCents === nextCents) return { interval, action: "noop" };
  return { interval, action: "replace", amountCents: nextCents!, oldPriceId: oldPriceId! };
}

export function diffTierPrices(old: OldState, next: NextAmounts): PriceAction[] {
  return [
    diffOne("month", old.monthlyCents, old.monthlyPriceId, next.monthlyCents),
    diffOne("year", old.annualCents, old.annualPriceId, next.annualCents),
  ];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/memberships/tier-price-diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memberships/tier-price-diff.ts tests/unit/memberships/tier-price-diff.test.ts
git commit -m "feat(memberships): pure Stripe price-diff for tier edits"
```

---

## Task 4: Stripe admin module (`admin-stripe.ts`)

Thin wrappers over the Stripe SDK. No new tests here (the logic is in Tasks 2–3); exercised by the Stripe-gated API happy-path in Task 5.

**Files:**
- Create: `src/lib/memberships/admin-stripe.ts`

- [ ] **Step 1: Implement create + edit-apply**

```ts
import { stripe } from "@/lib/stripe/client";
import { diffTierPrices, type Interval } from "@/lib/memberships/tier-price-diff";

function s() {
  if (!stripe) throw new Error("Stripe not configured");
  return stripe;
}

export type StripeTierRefs = {
  productId: string;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
};

async function createPrice(productId: string, interval: Interval, amountCents: number): Promise<string> {
  const price = await s().prices.create({
    product: productId,
    unit_amount: amountCents,
    currency: "usd",
    recurring: { interval },
  });
  return price.id;
}

/** Create a Product + recurring Prices for a brand-new tier. */
export async function createTierStripeObjects(opts: {
  orgId: string;
  name: string;
  monthlyCents: number | null;
  annualCents: number | null;
}): Promise<StripeTierRefs> {
  const product = await s().products.create({
    name: opts.name,
    metadata: { organization_id: opts.orgId, kind: "membership_tier" },
  });
  const monthlyPriceId = opts.monthlyCents != null ? await createPrice(product.id, "month", opts.monthlyCents) : null;
  const annualPriceId = opts.annualCents != null ? await createPrice(product.id, "year", opts.annualCents) : null;
  return { productId: product.id, monthlyPriceId, annualPriceId };
}

/** Apply edits: rename product, create/archive/replace prices. Grandfathers existing subs. */
export async function applyTierStripeEdits(opts: {
  productId: string;
  nameChangedTo?: string;
  old: { monthlyCents: number | null; annualCents: number | null; monthlyPriceId: string | null; annualPriceId: string | null };
  next: { monthlyCents: number | null; annualCents: number | null };
}): Promise<{ monthlyPriceId: string | null; annualPriceId: string | null }> {
  if (opts.nameChangedTo) {
    await s().products.update(opts.productId, { name: opts.nameChangedTo });
  }
  let monthlyPriceId = opts.old.monthlyPriceId;
  let annualPriceId = opts.old.annualPriceId;

  for (const a of diffTierPrices(opts.old, opts.next)) {
    if (a.action === "noop") continue;
    if (a.action === "archive") {
      await s().prices.update(a.oldPriceId, { active: false });
      if (a.interval === "month") monthlyPriceId = null; else annualPriceId = null;
    } else if (a.action === "create") {
      const id = await createPrice(opts.productId, a.interval, a.amountCents);
      if (a.interval === "month") monthlyPriceId = id; else annualPriceId = id;
    } else { // replace
      const id = await createPrice(opts.productId, a.interval, a.amountCents);
      await s().prices.update(a.oldPriceId, { active: false });
      if (a.interval === "month") monthlyPriceId = id; else annualPriceId = id;
    }
  }
  return { monthlyPriceId, annualPriceId };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/memberships/admin-stripe.ts
git commit -m "feat(memberships): Stripe Product/Price admin wrappers"
```

---

## Task 5: API — list + create (`tiers/index.ts`)

**Files:**
- Create: `src/pages/api/admin/memberships/tiers/index.ts`
- Test: `tests/api/admin/membership-tiers.test.ts`

- [ ] **Step 1: Write the failing API tests** (list scoping + validation; Stripe happy-path gated)

```ts
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

async function adminCookie(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@test.aspiresports.com", password: "TestAdmin123!" }),
  });
  if (!res.ok) throw new Error(`signin failed: ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("GET /api/admin/memberships/tiers", () => {
  it("401 without auth", async () => {
    const res = await fetch(`${BASE}/api/admin/memberships/tiers`);
    expect(res.status).toBe(401);
  });
  it("lists tiers for the active org, ordered", async () => {
    const cookie = await adminCookie();
    const res = await fetch(`${BASE}/api/admin/memberships/tiers`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.tiers)).toBe(true);
  });
});

describe("POST /api/admin/memberships/tiers", () => {
  it("422 when both prices null", async () => {
    const cookie = await adminCookie();
    const res = await fetch(`${BASE}/api/admin/memberships/tiers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: "Bad", monthlyDollars: null, annualDollars: null, benefits: {}, displayOrder: 0, isActive: true }),
    });
    expect(res.status).toBe(422);
  });

  itWithStripe("creates a tier with Stripe price ids", async () => {
    const cookie = await adminCookie();
    const res = await fetch(`${BASE}/api/admin/memberships/tiers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: `Test ${Date.now()}`, monthlyDollars: 29, annualDollars: 290, benefits: { rental_discount_pct: 10 }, displayOrder: 5, isActive: true }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tier.stripePriceIdMonthly).toMatch(/^price_/);
    expect(body.tier.stripeProductId).toMatch(/^prod_/);
  });
});
```

- [ ] **Step 2: Run to verify failure** (start dev server first: `npm run dev`)

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/membership-tiers.test.ts`
Expected: FAIL (404 — route missing).

- [ ] **Step 3: Implement the endpoint**

```ts
/**
 * GET  /api/admin/memberships/tiers → list tiers for the active org.
 * POST /api/admin/memberships/tiers → create a tier + its Stripe Product/Prices.
 */
import type { APIRoute } from "astro";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { requireAdminAccess } from "@/lib/auth/roles";
import { tierInputSchema, dollarsToCents } from "@/lib/memberships/tier-units";
import { createTierStripeObjects } from "@/lib/memberships/admin-stripe";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  const db = getDb();
  const tiers = await db
    .select()
    .from(membershipTiers)
    .where(eq(membershipTiers.organizationId, orgId))
    .orderBy(asc(membershipTiers.displayOrder), asc(membershipTiers.createdAt));
  return json({ tiers }, 200);
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  let raw: unknown;
  try { raw = await context.request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const parsed = tierInputSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  const input = parsed.data;

  const monthlyCents = dollarsToCents(input.monthlyDollars);
  const annualCents = dollarsToCents(input.annualDollars);

  let refs;
  try {
    refs = await createTierStripeObjects({ orgId, name: input.name, monthlyCents, annualCents });
  } catch (e) {
    console.error("[admin/tiers] stripe create failed", e);
    return json({ error: "Could not create Stripe price" }, 502);
  }

  const db = getDb();
  const [tier] = await db
    .insert(membershipTiers)
    .values({
      organizationId: orgId,
      name: input.name,
      monthlyPriceCents: monthlyCents,
      annualPriceCents: annualCents,
      benefits: input.benefits,
      displayOrder: input.displayOrder,
      isActive: input.isActive,
      stripeProductId: refs.productId,
      stripePriceIdMonthly: refs.monthlyPriceId,
      stripePriceIdAnnual: refs.annualPriceId,
    })
    .returning();
  return json({ tier }, 201);
};
```

- [ ] **Step 4: Run to verify pass**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/membership-tiers.test.ts`
Expected: PASS (Stripe happy-path is skipped without a key — that's expected; the list/validation cases pass).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/memberships/tiers/index.ts tests/api/admin/membership-tiers.test.ts
git commit -m "feat(memberships): admin tiers list + create endpoint"
```

---

## Task 6: API — get/edit/delete (`tiers/[id].ts`)

**Files:**
- Create: `src/pages/api/admin/memberships/tiers/[id].ts`
- Test: extend `tests/api/admin/membership-tiers.test.ts`

- [ ] **Step 1: Add failing tests** (tenant scoping + delete guard)

```ts
describe("PUT/DELETE /api/admin/memberships/tiers/[id]", () => {
  it("404 on a tier id outside the active org", async () => {
    const cookie = await adminCookie();
    const res = await fetch(`${BASE}/api/admin/memberships/tiers/00000000-0000-0000-0000-000000000000`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: "X", monthlyDollars: 10, annualDollars: null, benefits: {}, displayOrder: 0, isActive: true }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/membership-tiers.test.ts -t "outside the active org"`
Expected: FAIL (404 not yet produced by a real handler / route missing).

- [ ] **Step 3: Implement**

```ts
/**
 * GET    /api/admin/memberships/tiers/[id] → fetch one (org-scoped).
 * PUT    /api/admin/memberships/tiers/[id] → edit + reconcile Stripe Prices.
 * DELETE /api/admin/memberships/tiers/[id] → hard-delete iff unreferenced, else 409.
 */
import type { APIRoute } from "astro";
import { eq, and, count } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers, memberships } from "@/lib/db/schema/memberships";
import { requireAdminAccess } from "@/lib/auth/roles";
import { tierInputSchema, dollarsToCents } from "@/lib/memberships/tier-units";
import { applyTierStripeEdits } from "@/lib/memberships/admin-stripe";

export const prerender = false;
const json = (b: unknown, s: number) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function loadOwned(orgId: string, id: string) {
  const db = getDb();
  const [tier] = await db
    .select()
    .from(membershipTiers)
    .where(and(eq(membershipTiers.id, id), eq(membershipTiers.organizationId, orgId)))
    .limit(1);
  return tier ?? null;
}

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);
  const tier = await loadOwned(orgId, context.params.id!);
  if (!tier) return json({ error: "Tier not found" }, 404);
  return json({ tier }, 200);
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  const existing = await loadOwned(orgId, context.params.id!);
  if (!existing) return json({ error: "Tier not found" }, 404);

  let raw: unknown;
  try { raw = await context.request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const parsed = tierInputSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  const input = parsed.data;

  const nextMonthly = dollarsToCents(input.monthlyDollars);
  const nextAnnual = dollarsToCents(input.annualDollars);

  let priceIds = { monthlyPriceId: existing.stripePriceIdMonthly, annualPriceId: existing.stripePriceIdAnnual };
  if (existing.stripeProductId) {
    try {
      priceIds = await applyTierStripeEdits({
        productId: existing.stripeProductId,
        nameChangedTo: input.name !== existing.name ? input.name : undefined,
        old: {
          monthlyCents: existing.monthlyPriceCents,
          annualCents: existing.annualPriceCents,
          monthlyPriceId: existing.stripePriceIdMonthly,
          annualPriceId: existing.stripePriceIdAnnual,
        },
        next: { monthlyCents: nextMonthly, annualCents: nextAnnual },
      });
    } catch (e) {
      console.error("[admin/tiers] stripe edit failed", e);
      return json({ error: "Could not update Stripe price" }, 502);
    }
  }

  const db = getDb();
  const [tier] = await db
    .update(membershipTiers)
    .set({
      name: input.name,
      monthlyPriceCents: nextMonthly,
      annualPriceCents: nextAnnual,
      benefits: input.benefits,
      displayOrder: input.displayOrder,
      isActive: input.isActive,
      stripePriceIdMonthly: priceIds.monthlyPriceId,
      stripePriceIdAnnual: priceIds.annualPriceId,
      updatedAt: new Date(),
    })
    .where(eq(membershipTiers.id, existing.id))
    .returning();
  return json({ tier }, 200);
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  const existing = await loadOwned(orgId, context.params.id!);
  if (!existing) return json({ error: "Tier not found" }, 404);

  const db = getDb();
  const [{ value }] = await db
    .select({ value: count() })
    .from(memberships)
    .where(eq(memberships.tierId, existing.id));
  if (value > 0) return json({ error: "Tier has subscribers — deactivate instead" }, 409);

  await db.delete(membershipTiers).where(eq(membershipTiers.id, existing.id));
  return json({ ok: true }, 200);
};
```

- [ ] **Step 4: Run to verify pass**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/membership-tiers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/memberships/tiers/[id].ts tests/api/admin/membership-tiers.test.ts
git commit -m "feat(memberships): admin tier get/edit/delete endpoint"
```

---

## Task 7: API — reorder (`tiers/reorder.ts`)

**Files:**
- Create: `src/pages/api/admin/memberships/tiers/reorder.ts`
- Test: extend `tests/api/admin/membership-tiers.test.ts`

- [ ] **Step 1: Add failing test**

```ts
describe("PUT /api/admin/memberships/tiers/reorder", () => {
  it("400 when ids is not an array", async () => {
    const cookie = await adminCookie();
    const res = await fetch(`${BASE}/api/admin/memberships/tiers/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ids: "nope" }),
    });
    expect(res.status).toBe(400);
  });
  it("rejects ids outside the active org (404)", async () => {
    const cookie = await adminCookie();
    const res = await fetch(`${BASE}/api/admin/memberships/tiers/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ids: ["00000000-0000-0000-0000-000000000000"] }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/membership-tiers.test.ts -t "reorder"`
Expected: FAIL (route missing).

- [ ] **Step 3: Implement**

```ts
/** PUT /api/admin/memberships/tiers/reorder → set displayOrder from an ordered id list. */
import type { APIRoute } from "astro";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { requireAdminAccess } from "@/lib/auth/roles";

export const prerender = false;
const json = (b: unknown, s: number) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  let raw: { ids?: unknown };
  try { raw = await context.request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const ids = raw.ids;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
    return json({ error: "ids must be an array of strings" }, 400);
  }

  const db = getDb();
  // All ids must belong to the active org, or reject the whole request.
  const owned = await db
    .select({ id: membershipTiers.id })
    .from(membershipTiers)
    .where(and(eq(membershipTiers.organizationId, orgId), inArray(membershipTiers.id, ids as string[])));
  if (owned.length !== ids.length) return json({ error: "One or more tiers not found in this org" }, 404);

  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(membershipTiers)
        .set({ displayOrder: i, updatedAt: new Date() })
        .where(eq(membershipTiers.id, ids[i] as string));
    }
  });
  return json({ ok: true }, 200);
};
```

- [ ] **Step 4: Run to verify pass**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/membership-tiers.test.ts -t "reorder"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/memberships/tiers/reorder.ts tests/api/admin/membership-tiers.test.ts
git commit -m "feat(memberships): admin tier reorder endpoint"
```

---

## Task 8: Form component (`tier-form.tsx`)

Follow the existing admin form pattern in `src/components/admin/branding/BrandProfileEditor.tsx` and `src/components/admin/dropin/SessionForm.tsx` (these are `"use client"` controlled-state React forms that `fetch` the API and use `toast` + `ErrorBanner` — they are NOT react-hook-form). Match their styling/structure.

**Files:**
- Create: `src/components/admin/memberships/tier-form.tsx`

- [ ] **Step 1: Implement the form**

Requirements (mirror BrandProfileEditor's structure exactly for layout/classes):
- Props: `{ tier?: MembershipTier }` — import `type { MembershipTier }` from `@/lib/db/schema/memberships` (the `$inferSelect` row; over JSON its timestamps arrive as strings, which the form doesn't read). `undefined` = create mode.
- Controlled fields: `name` (text), `monthlyDollars` (number, empty = null), `annualDollars` (number, empty = null), the 7 benefit fields (5 number inputs, 2 checkboxes), `displayOrder` (number), `isActive` (checkbox).
- Prices shown in **dollars** (e.g. `29` for $29). On submit, send dollars — the API converts to cents.
- Submit handler:

```tsx
const url = tier ? `/api/admin/memberships/tiers/${tier.id}` : "/api/admin/memberships/tiers";
const method = tier ? "PUT" : "POST";
const res = await fetch(url, {
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name,
    monthlyDollars: monthly === "" ? null : Number(monthly),
    annualDollars: annual === "" ? null : Number(annual),
    benefits: buildBenefits(), // omit empty/false keys
    displayOrder: Number(displayOrder) || 0,
    isActive,
  }),
});
if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? "Save failed"); return; }
window.location.href = "/admin/memberships";
```

- `buildBenefits()` includes only set numeric fields (`> 0` or explicitly entered) and `true` toggles, so the stored blob stays minimal.
- Use `<ErrorBanner message={error} />` (from `@/components/ui/error-banner`) for the error state.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/memberships/tier-form.tsx
git commit -m "feat(memberships): admin tier create/edit form"
```

---

## Task 9: List component + pages

**Files:**
- Create: `src/components/admin/memberships/tiers-list.tsx`
- Create: `src/pages/admin/memberships/index.astro`
- Create: `src/pages/admin/memberships/new.astro`
- Create: `src/pages/admin/memberships/[id].astro`

- [ ] **Step 1: List component with drag-reorder**

Mirror the native HTML5 drag pattern in `src/components/admin/waitlist-manager.tsx` (`draggable`, `onDragStart`, `onDragOver`, `onDrop` with an index-swap on local state). Props: `{ tiers: MembershipTier[] }` (same `MembershipTier` import as Task 8).
- Render each tier row: drag handle, name, monthly/annual price (format cents→`$X`), active badge, "Edit" link to `/admin/memberships/${id}`.
- On drop, reorder local state, then `PUT /api/admin/memberships/tiers/reorder` with `{ ids: reordered.map(t => t.id) }`; `toast.error` on failure and revert.
- Empty state: `<EmptyState title="No membership tiers yet" description="Create your first tier to start selling memberships." />`.
- "New tier" button → `/admin/memberships/new`.

- [ ] **Step 2: Pages** — mirror `src/pages/admin/branding/{index,[id]}.astro`. Each extends the admin layout used by branding (copy its frontmatter/layout import exactly). All three: `export const prerender = false;`.
  - `index.astro`: server-fetch tiers for `Astro.locals.organization.id` (query `membershipTiers` directly, ordered by `displayOrder`), render `<TiersList client:load tiers={tiers} />`.
  - `new.astro`: render `<TierForm client:load />`.
  - `[id].astro`: load the org-scoped tier by `Astro.params.id` (404 → redirect to `/admin/memberships`), render `<TierForm client:load tier={tier} />`.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build completes (requires a local `DATABASE_URL` in `.env`).

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/memberships/tiers-list.tsx src/pages/admin/memberships
git commit -m "feat(memberships): admin tier list page + new/edit pages"
```

---

## Task 10: Nav link

**Files:**
- Modify: `src/lib/admin/nav-super-admin.ts`

- [ ] **Step 1: Add the link**

Add `Gem` to the lucide import, then add to the `"Plan"` group's `items` (after Rentals):

```ts
      { name: "Memberships", href: "/admin/memberships", icon: Gem },
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/admin/nav-super-admin.ts
git commit -m "feat(memberships): add Memberships to admin nav"
```

---

## Task 11: Launch-checklist rewrite

**Files:**
- Modify: `docs/ops/soccerone-launch-checklist.md`

- [ ] **Step 1: Replace §6.5.4** — swap the "create Stripe Prices in the dashboard + INSERT SQL" block for:

```markdown
### 6.5.4 Create membership tiers (Phase 3)

Open `https://www.gosoccerone.com/admin/memberships` signed in as a super-admin
scoped to the SoccerOne org. Create the launch tiers — the form creates the
Stripe Prices and the rows together; no SQL or Stripe-dashboard work needed:

- **Member** — monthly $29, annual $290, benefit `rental_discount_pct: 10`.
- **Founder** — monthly $99, annual $990, benefits `rental_discount_pct: 20`,
  `guest_passes_per_month: 2`, `booking_window_days: 30`.

Then smoke-check `GET /api/public/membership-tiers` returns both, ordered.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ops/soccerone-launch-checklist.md
git commit -m "docs(ops): tier admin UI replaces manual SQL in launch checklist"
```

---

## Task 12: Pre-push verification

- [ ] **Step 1: Confirm the migration is committed** (Task 1) — CI's `db:migrate` needs it.
- [ ] **Step 2: Re-seed + run the suites** (dev server up):

```bash
npm run db:seed:e2e
TEST_BASE_URL=http://localhost:4321 npx vitest run tests/unit/memberships tests/api/admin/membership-tiers.test.ts
```
Expected: unit tests pass; API tests pass (Stripe happy-path skipped without a key).

- [ ] **Step 3: Type check + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: zero errors, build completes.

- [ ] **Step 4: Open the PR** via the `/ship` skill, then merge once CI is green.

---

## Self-Review Notes

- **Spec coverage:** pages + API (T5–T9), Stripe lifecycle incl. grandfather/archive (T3–T4, T6), schema column (T1), dollars→cents boundary (T2), structured 7-key benefits editor (T2, T8), tenant scoping + delete guard (T6), drag-reorder (T7, T9), nav (T10), checklist rewrite (T11). All spec sections map to a task.
- **CI coverage of logic:** price-diff and units are pure unit tests (T2–T3) that run without Stripe — the gap that bit the earlier PR is closed.
- **Type consistency:** `createTierStripeObjects` / `applyTierStripeEdits` / `diffTierPrices` signatures are used identically in T4 and T6; `tierInputSchema` field names (`monthlyDollars`, `annualDollars`) are consistent across T2/T5/T6/T8.
