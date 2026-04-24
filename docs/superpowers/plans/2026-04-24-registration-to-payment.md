# Registration → Payment (Sandbox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the parent registration wizard drive a Stripe sandbox Checkout Session end-to-end so that a test-card payment results in a `paid` / `confirmed` registration, the webhook is idempotent, and the post-payment success/cancel UX is coherent.

**Architecture:** All app-logic; no schema changes. Extract the webhook's checkout-complete handler into a testable module, add an idempotency guard keyed by `stripeCheckoutSessionId`, move the registration confirmation email to fire after successful payment, and add a dashboard success banner that polls the registration while the webhook catches up. Cancel flow resumes the existing pending row.

**Tech Stack:** Astro 5, React 19, Drizzle ORM, Stripe SDK v20, Vitest (`api` project has DB access via `tests/api/setup/global-setup.ts`), Stripe CLI.

**Spec:** `docs/superpowers/specs/2026-04-24-registration-to-payment-design.md`

---

## File Map

**Create:**
- `src/lib/stripe/handle-checkout-complete.ts` — exported `handleCheckoutComplete(event)` with idempotency + email send
- `tests/api/webhooks/stripe.test.ts` — integration tests for the handler
- `src/components/dashboard/payment-success-banner.tsx` — client component for post-checkout confirmation
- `docs/stripe-sandbox.md` — dev-mode sandbox runbook

**Modify:**
- `package.json` — add `stripe:listen` script
- `src/pages/api/webhooks/stripe.ts` — delegate to new handler module
- `src/pages/api/registrations/index.ts` — remove confirmation email from pending branch; add `orderBy` to duplicate lookup
- `src/pages/api/payments/create-checkout.ts` — use the single `db` handle
- `src/pages/dashboard/index.astro` — render success banner when `?payment=success` is present
- `src/components/registration/registration-wizard.tsx` — resume-payment screen when `?payment=cancelled` finds an existing pending row

---

## Task 1: Add `stripe:listen` npm script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add script**

Add the following to the `scripts` object in `package.json`, immediately after `"preview": "astro preview",`:

```json
"stripe:listen": "stripe listen --forward-to localhost:4321/api/webhooks/stripe --events checkout.session.completed,payment_intent.succeeded,payment_intent.payment_failed",
```

- [ ] **Step 2: Verify the script parses**

Run: `npm run stripe:listen -- --help`
Expected: the Stripe CLI help text prints (confirms `stripe` is on PATH and the script is wired). If `command not found`, tell the user to install the Stripe CLI and re-run.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(stripe): add npm script for forwarding webhooks in dev"
```

---

## Task 2: Write the sandbox runbook

**Files:**
- Create: `docs/stripe-sandbox.md`

- [ ] **Step 1: Write the doc**

Create `docs/stripe-sandbox.md` with this exact content:

```markdown
# Stripe sandbox (test mode) dev workflow

Use this when you want to drive the registration → payment flow end-to-end
against your local dev server.

## One-time setup

1. Install the Stripe CLI: https://stripe.com/docs/stripe-cli
2. `stripe login` — associates the CLI with your test-mode account.
3. In `.env`, confirm these three vars are set with **test** keys:
   - `STRIPE_SECRET_KEY=sk_test_...`
   - `STRIPE_PUBLISHABLE_KEY=pk_test_...`
   - `STRIPE_WEBHOOK_SECRET=whsec_...` (filled in step 2 of "each session" below)

## Each dev session

Open two terminals.

**Terminal A — dev server:**
```bash
npm run dev
```

**Terminal B — webhook forwarder:**
```bash
npm run stripe:listen
```

The first time you run `stripe:listen` in a session it prints:

```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxx
```

Copy that `whsec_...` value into `.env` as `STRIPE_WEBHOOK_SECRET` and restart
the dev server. The secret is stable for your machine — you only need to do
this once unless you reset your CLI credentials.

## Smoke test

1. Sign in at http://localhost:4321/signin as `parent@test.aspiresports.com` / `TestParent123!`
2. Browse to http://localhost:4321/programs, pick any open season, click Register.
3. Step through Select Player → Sign Waiver → Payment.
4. On the Stripe Checkout page, use test card `4242 4242 4242 4242`, any
   future expiry, any CVC, any ZIP.
5. You'll land back on `/dashboard?payment=success&registration=<id>`.
6. Verify in Drizzle Studio (`npm run db:studio`):
   - `registrations.status = 'confirmed'`
   - `registrations.payment_status = 'paid'` (or `'deposit_paid'` if you picked deposit)
   - One row in `payments` with `status = 'succeeded'` and
     `metadata->>'stripeCheckoutSessionId'` set.

## Test cards

- `4242 4242 4242 4242` — succeeds
- `4000 0000 0000 0002` — declined (generic)
- `4000 0000 0000 9995` — insufficient funds
- Full list: https://stripe.com/docs/testing#cards
```

- [ ] **Step 2: Commit**

```bash
git add docs/stripe-sandbox.md
git commit -m "docs(stripe): add sandbox/test-mode dev runbook"
```

---

## Task 3: Extract webhook handler into testable module

**Files:**
- Create: `src/lib/stripe/handle-checkout-complete.ts`
- Modify: `src/pages/api/webhooks/stripe.ts`

- [ ] **Step 1: Create the new module**

Create `src/lib/stripe/handle-checkout-complete.ts` with this content. It preserves today's behavior exactly — no idempotency guard and no email yet. Those land in Task 5 and Task 6, each with a failing test first.

```typescript
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { registrations, payments } from "@/lib/db/schema";

/**
 * Handle a `checkout.session.completed` event for a registration payment.
 * Returns an object describing what happened so callers/tests can assert.
 */
export async function handleCheckoutComplete(
  session: Stripe.Checkout.Session
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; registrationId: string; paidCents: number }
> {
  const registrationId = session.metadata?.registrationId;
  const paymentType = session.metadata?.type;

  if (paymentType !== "registration_payment" || !registrationId) {
    return { status: "skipped", reason: "not a registration payment" };
  }

  const db = getDb();

  const [registration] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, registrationId));

  if (!registration) {
    return { status: "skipped", reason: `registration ${registrationId} not found` };
  }

  const amountPaid = session.amount_total || 0;
  const newAmountPaid = registration.amountPaidCents + amountPaid;
  const isFullyPaid = newAmountPaid >= registration.amountDueCents;
  const paymentTypeValue =
    registration.registrationType === "deposit" ? "deposit" : "full";

  await db
    .update(registrations)
    .set({
      status: "confirmed",
      paymentStatus: isFullyPaid ? "paid" : "deposit_paid",
      amountPaidCents: newAmountPaid,
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, registrationId));

  await db.insert(payments).values({
    registrationId,
    userId: registration.registeredByUserId,
    amountCents: amountPaid,
    paymentType: paymentTypeValue as "deposit" | "full" | "balance" | "refund" | "installment",
    status: "succeeded",
    stripePaymentIntentId: session.payment_intent as string,
    metadata: {
      customerEmail: session.customer_email,
      stripeCheckoutSessionId: session.id,
    },
  });

  return { status: "processed", registrationId, paidCents: amountPaid };
}
```

- [ ] **Step 2: Replace inline handler in the webhook route**

Open `src/pages/api/webhooks/stripe.ts`. Replace the whole file with:

```typescript
import type { APIRoute } from "astro";
import { verifyWebhookSignature } from "@/lib/stripe/client";
import { handleCheckoutComplete } from "@/lib/stripe/handle-checkout-complete";
import type Stripe from "stripe";

export const POST: APIRoute = async ({ request }) => {
  try {
    const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("Stripe webhook secret not configured");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = verifyWebhookSignature(payload, signature, webhookSecret);
    if (!event) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const result = await handleCheckoutComplete(session);
        console.log(`[stripe webhook] checkout.session.completed → ${result.status}`, result);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Payment succeeded:", paymentIntent.id);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Payment failed:", paymentIntent.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Webhook handler failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors beyond the ~5 pre-existing baseline listed in CLAUDE.md).

- [ ] **Step 4: Commit**

```bash
git add src/lib/stripe/handle-checkout-complete.ts src/pages/api/webhooks/stripe.ts
git commit -m "refactor(stripe): extract checkout-complete handler for testability"
```

---

## Task 4: Add integration-test scaffolding for the webhook handler

**Files:**
- Create: `tests/api/webhooks/stripe.test.ts`

This test file is the baseline. Task 5 adds the idempotency test (which will fail), then Task 6 adds the email-on-success tests.

- [ ] **Step 1: Look at how other api tests seed data**

Read: `tests/api/setup/global-setup.ts` and `tests/api/admin/sports.test.ts` (the latter is a short, representative test).

Expected: Confirms the test helpers — how to create a user, family member, season, registration. Note the import paths (`@/lib/db`, `@/lib/db/schema`, Drizzle helpers) and the test-base-url fetch pattern for API tests.

- [ ] **Step 2: Write the scaffold test file**

Create `tests/api/webhooks/stripe.test.ts`. This file is a **failing** TDD skeleton that seeds a pending registration, invokes `handleCheckoutComplete` with a stubbed Stripe session, and asserts the happy-path transition. The second test (idempotency) will be added in Task 5.

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import {
  registrations,
  payments,
  familyMembers,
  seasons,
  programs,
  sports,
  locations,
  organizations,
  users,
} from "@/lib/db/schema";
import { handleCheckoutComplete } from "@/lib/stripe/handle-checkout-complete";

/**
 * Build a realistic fake Checkout Session. Fields we assert on are always
 * present; unused fields are set to unsafe casts since our handler only reads
 * a small subset.
 */
function makeCheckoutSession(overrides: {
  sessionId: string;
  paymentIntentId: string;
  registrationId: string;
  amountTotal: number;
  customerEmail: string;
}): Stripe.Checkout.Session {
  return {
    id: overrides.sessionId,
    object: "checkout.session",
    amount_total: overrides.amountTotal,
    currency: "usd",
    customer_email: overrides.customerEmail,
    payment_intent: overrides.paymentIntentId,
    metadata: {
      registrationId: overrides.registrationId,
      type: "registration_payment",
    },
    payment_status: "paid",
    status: "complete",
    mode: "payment",
  } as unknown as Stripe.Checkout.Session;
}

/**
 * Seed the minimum row graph needed to exercise handleCheckoutComplete. Returns
 * the registration id so tests can assert on state transitions.
 */
async function seedPendingRegistration(opts: {
  amountDueCents: number;
  registrationType?: "full" | "deposit";
}): Promise<{ registrationId: string; userId: string }> {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Org ${suffix}`,
      slug: `org-${suffix}`,
      organizationType: "headquarters",
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email: `parent-${suffix}@test.example`,
      hashedPassword: "x",
      role: "parent",
      firstName: "Pat",
      lastName: "Parent",
      organizationId: org.id,
    })
    .returning();

  const [sport] = await db
    .insert(sports)
    .values({ name: `Sport ${suffix}`, slug: `sport-${suffix}` })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({
      name: `Loc ${suffix}`,
      slug: `loc-${suffix}`,
      organizationId: org.id,
    })
    .returning();

  const [program] = await db
    .insert(programs)
    .values({
      name: `Prog ${suffix}`,
      slug: `prog-${suffix}`,
      sportId: sport.id,
      locationId: location.id,
      programType: "league",
    })
    .returning();

  const [season] = await db
    .insert(seasons)
    .values({
      name: `Season ${suffix}`,
      slug: `season-${suffix}`,
      programId: program.id,
      startDate: "2026-09-01",
      endDate: "2026-12-01",
      priceCents: opts.amountDueCents,
      status: "open",
    })
    .returning();

  const [member] = await db
    .insert(familyMembers)
    .values({
      parentUserId: user.id,
      firstName: "Kid",
      lastName: "Player",
      birthDate: "2015-01-01",
    })
    .returning();

  const [registration] = await db
    .insert(registrations)
    .values({
      seasonId: season.id,
      familyMemberId: member.id,
      registeredByUserId: user.id,
      status: "pending",
      paymentStatus: "unpaid",
      amountPaidCents: 0,
      amountDueCents: opts.amountDueCents,
      registrationType: opts.registrationType ?? "full",
      waiverSigned: true,
      waiverSignedAt: new Date(),
      waiverSignedBy: "Pat Parent",
    })
    .returning();

  return { registrationId: registration.id, userId: user.id };
}

describe("handleCheckoutComplete", () => {
  it("confirms the registration and records the payment on success", async () => {
    const db = getDb();
    const { registrationId } = await seedPendingRegistration({
      amountDueCents: 12500,
    });

    const result = await handleCheckoutComplete(
      makeCheckoutSession({
        sessionId: `cs_test_${Math.random().toString(36).slice(2)}`,
        paymentIntentId: `pi_test_${Math.random().toString(36).slice(2)}`,
        registrationId,
        amountTotal: 12500,
        customerEmail: "pat@test.example",
      })
    );

    expect(result.status).toBe("processed");

    const [reg] = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationId));

    expect(reg.status).toBe("confirmed");
    expect(reg.paymentStatus).toBe("paid");
    expect(reg.amountPaidCents).toBe(12500);

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.registrationId, registrationId));

    expect(paymentRows).toHaveLength(1);
    expect(paymentRows[0].amountCents).toBe(12500);
    expect(paymentRows[0].status).toBe("succeeded");
  });

  it("skips non-registration payments", async () => {
    const session = {
      id: "cs_test_nonreg",
      metadata: { type: "something_else" },
    } as unknown as Stripe.Checkout.Session;
    const result = await handleCheckoutComplete(session);
    expect(result.status).toBe("skipped");
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm run test:api -- tests/api/webhooks/stripe.test.ts`
Expected: Both tests PASS. If they fail, look at the actual error — often the seed helpers need a column that wasn't in this plan because the schema has a `NOT NULL` field without a default. Read the schema and add the missing field.

- [ ] **Step 4: Commit**

```bash
git add tests/api/webhooks/stripe.test.ts
git commit -m "test(stripe): baseline handler test covering happy path + skip"
```

---

## Task 5: Add webhook idempotency (TDD)

**Files:**
- Modify: `tests/api/webhooks/stripe.test.ts`
- Modify: `src/lib/stripe/handle-checkout-complete.ts`

- [ ] **Step 1: Add a failing idempotency test**

In `tests/api/webhooks/stripe.test.ts`, add this test inside the `describe("handleCheckoutComplete", …)` block, after the existing "skips non-registration payments" test:

```typescript
  it("is idempotent when the same checkout session is delivered twice", async () => {
    const db = getDb();
    const { registrationId } = await seedPendingRegistration({
      amountDueCents: 10000,
    });

    const session = makeCheckoutSession({
      sessionId: `cs_test_idem_${Math.random().toString(36).slice(2)}`,
      paymentIntentId: `pi_test_idem_${Math.random().toString(36).slice(2)}`,
      registrationId,
      amountTotal: 10000,
      customerEmail: "pat@test.example",
    });

    const first = await handleCheckoutComplete(session);
    const second = await handleCheckoutComplete(session);

    expect(first.status).toBe("processed");
    expect(second.status).toBe("skipped");

    const [reg] = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationId));
    // Must NOT have double-counted the payment.
    expect(reg.amountPaidCents).toBe(10000);

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.registrationId, registrationId));
    expect(paymentRows).toHaveLength(1);
  });
```

- [ ] **Step 2: Run and verify the test fails**

Run: `npm run test:api -- tests/api/webhooks/stripe.test.ts`
Expected: The new test FAILS. Typical failure: `expected 20000 to be 10000` (double-count) and `expected 2 to be 1` (two payment rows).

- [ ] **Step 3: Implement idempotency**

Open `src/lib/stripe/handle-checkout-complete.ts`. Replace the contents with:

```typescript
import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { registrations, payments } from "@/lib/db/schema";

/**
 * Handle a `checkout.session.completed` event for a registration payment.
 * Idempotent: if a payments row with the same stripeCheckoutSessionId already
 * exists, returns "skipped" without mutating state.
 */
export async function handleCheckoutComplete(
  session: Stripe.Checkout.Session
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; registrationId: string; paidCents: number }
> {
  const registrationId = session.metadata?.registrationId;
  const paymentType = session.metadata?.type;

  if (paymentType !== "registration_payment" || !registrationId) {
    return { status: "skipped", reason: "not a registration payment" };
  }

  const db = getDb();

  // Idempotency: if we've already recorded this checkout session, short-circuit.
  // The session id lives in payments.metadata->>'stripeCheckoutSessionId'.
  const existingPayment = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      sql`${payments.metadata} ->> 'stripeCheckoutSessionId' = ${session.id}`
    )
    .limit(1);

  if (existingPayment.length > 0) {
    return {
      status: "skipped",
      reason: `duplicate delivery for session ${session.id}`,
    };
  }

  const [registration] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, registrationId));

  if (!registration) {
    return { status: "skipped", reason: `registration ${registrationId} not found` };
  }

  const amountPaid = session.amount_total || 0;
  const newAmountPaid = registration.amountPaidCents + amountPaid;
  const isFullyPaid = newAmountPaid >= registration.amountDueCents;
  const paymentTypeValue =
    registration.registrationType === "deposit" ? "deposit" : "full";

  await db
    .update(registrations)
    .set({
      status: "confirmed",
      paymentStatus: isFullyPaid ? "paid" : "deposit_paid",
      amountPaidCents: newAmountPaid,
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, registrationId));

  await db.insert(payments).values({
    registrationId,
    userId: registration.registeredByUserId,
    amountCents: amountPaid,
    paymentType: paymentTypeValue as "deposit" | "full" | "balance" | "refund" | "installment",
    status: "succeeded",
    stripePaymentIntentId: session.payment_intent as string,
    metadata: {
      customerEmail: session.customer_email,
      stripeCheckoutSessionId: session.id,
    },
  });

  return { status: "processed", registrationId, paidCents: amountPaid };
}
```

- [ ] **Step 4: Re-run the tests**

Run: `npm run test:api -- tests/api/webhooks/stripe.test.ts`
Expected: All three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stripe/handle-checkout-complete.ts tests/api/webhooks/stripe.test.ts
git commit -m "feat(stripe): make checkout-complete handler idempotent"
```

---

## Task 6: Move registration confirmation email into webhook (TDD)

**Files:**
- Modify: `tests/api/webhooks/stripe.test.ts`
- Modify: `src/lib/stripe/handle-checkout-complete.ts`
- Modify: `src/pages/api/registrations/index.ts`

- [ ] **Step 1: Add tests asserting the email is sent once on success and not re-sent on duplicate**

The `sendRegistrationConfirmationEmail` function bails out if email isn't configured, which is the state of the test environment. We verify behavior by spying on the module. Add this at the top of `tests/api/webhooks/stripe.test.ts`, just below the existing imports:

```typescript
import * as emailModule from "@/lib/email/send";
import { vi } from "vitest";
```

Add a `beforeEach` near the top of the `describe` block (before the existing tests):

```typescript
  beforeEach(() => {
    vi.restoreAllMocks();
  });
```

Then add these two tests to the describe block:

```typescript
  it("sends the registration confirmation email on successful payment", async () => {
    const spy = vi
      .spyOn(emailModule, "sendRegistrationConfirmationEmail")
      .mockResolvedValue({ success: true } as never);

    const { registrationId } = await seedPendingRegistration({
      amountDueCents: 7500,
    });

    await handleCheckoutComplete(
      makeCheckoutSession({
        sessionId: `cs_test_email_${Math.random().toString(36).slice(2)}`,
        paymentIntentId: `pi_test_email_${Math.random().toString(36).slice(2)}`,
        registrationId,
        amountTotal: 7500,
        customerEmail: "pat@test.example",
      })
    );

    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0][0];
    expect(args.registrationId).toBe(registrationId);
    expect(args.paymentStatus).toBe("paid");
    expect(args.registrationStatus).toBe("confirmed");
  });

  it("does NOT re-send the email on duplicate webhook delivery", async () => {
    const spy = vi
      .spyOn(emailModule, "sendRegistrationConfirmationEmail")
      .mockResolvedValue({ success: true } as never);

    const { registrationId } = await seedPendingRegistration({
      amountDueCents: 5000,
    });
    const session = makeCheckoutSession({
      sessionId: `cs_test_nodup_${Math.random().toString(36).slice(2)}`,
      paymentIntentId: `pi_test_nodup_${Math.random().toString(36).slice(2)}`,
      registrationId,
      amountTotal: 5000,
      customerEmail: "pat@test.example",
    });

    await handleCheckoutComplete(session);
    await handleCheckoutComplete(session);

    expect(spy).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run — both new tests should fail**

Run: `npm run test:api -- tests/api/webhooks/stripe.test.ts`
Expected: the two new tests FAIL with `expected 0 to be 1` (handler doesn't send email yet).

- [ ] **Step 3: Wire the email send into the handler**

Open `src/lib/stripe/handle-checkout-complete.ts`. Update the imports and add a JOIN fetch plus email send after the registration/payment writes. Replace the module with:

```typescript
import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  payments,
  seasons,
  programs,
  locations,
  familyMembers,
  users,
} from "@/lib/db/schema";
import { sendRegistrationConfirmationEmail } from "@/lib/email/send";

export async function handleCheckoutComplete(
  session: Stripe.Checkout.Session
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; registrationId: string; paidCents: number }
> {
  const registrationId = session.metadata?.registrationId;
  const paymentType = session.metadata?.type;

  if (paymentType !== "registration_payment" || !registrationId) {
    return { status: "skipped", reason: "not a registration payment" };
  }

  const db = getDb();

  const existingPayment = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      sql`${payments.metadata} ->> 'stripeCheckoutSessionId' = ${session.id}`
    )
    .limit(1);

  if (existingPayment.length > 0) {
    return {
      status: "skipped",
      reason: `duplicate delivery for session ${session.id}`,
    };
  }

  const [registration] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, registrationId));

  if (!registration) {
    return { status: "skipped", reason: `registration ${registrationId} not found` };
  }

  const amountPaid = session.amount_total || 0;
  const newAmountPaid = registration.amountPaidCents + amountPaid;
  const isFullyPaid = newAmountPaid >= registration.amountDueCents;
  const paymentTypeValue =
    registration.registrationType === "deposit" ? "deposit" : "full";

  await db
    .update(registrations)
    .set({
      status: "confirmed",
      paymentStatus: isFullyPaid ? "paid" : "deposit_paid",
      amountPaidCents: newAmountPaid,
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, registrationId));

  await db.insert(payments).values({
    registrationId,
    userId: registration.registeredByUserId,
    amountCents: amountPaid,
    paymentType: paymentTypeValue as "deposit" | "full" | "balance" | "refund" | "installment",
    status: "succeeded",
    stripePaymentIntentId: session.payment_intent as string,
    metadata: {
      customerEmail: session.customer_email,
      stripeCheckoutSessionId: session.id,
    },
  });

  // Fire-and-forget email (don't block webhook ack on email delivery).
  // We await the JOIN to build the payload but let the send itself run async.
  try {
    const [row] = await db
      .select({
        user: users,
        familyMember: familyMembers,
        season: seasons,
        program: programs,
        location: locations,
      })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .innerJoin(users, eq(registrations.registeredByUserId, users.id))
      .where(eq(registrations.id, registrationId));

    if (row) {
      sendRegistrationConfirmationEmail({
        userId: row.user.id,
        organizationId: row.location.organizationId ?? undefined,
        registrationId,
        parentEmail: row.user.email,
        parentName: row.user.firstName || row.user.email.split("@")[0],
        childName: `${row.familyMember.firstName} ${row.familyMember.lastName}`,
        programName: row.program.name,
        seasonName: row.season.name,
        startDate: row.season.startDate,
        endDate: row.season.endDate,
        scheduleNotes: row.season.scheduleNotes || undefined,
        locationName: row.location.name,
        locationAddress:
          [row.location.addressLine1, row.location.city, row.location.state]
            .filter(Boolean)
            .join(", ") || undefined,
        amountDueCents: registration.amountDueCents,
        paymentStatus: isFullyPaid ? "paid" : "deposit_paid",
        registrationStatus: "confirmed",
      }).catch((err) => console.error("[stripe webhook] email send failed:", err));
    }
  } catch (err) {
    console.error("[stripe webhook] email payload build failed:", err);
  }

  return { status: "processed", registrationId, paidCents: amountPaid };
}
```

- [ ] **Step 4: Remove the pending-branch email send from the registrations API**

Open `src/pages/api/registrations/index.ts`. In the `POST` handler, delete the confirmation-email block that runs **after** the pending-registration insert. That's the block currently at approximately lines 325–359, starting with the comment `// Send confirmation email (don't block on failure)` and ending at the closing of its `try/catch`, up to but NOT including the `return new Response(...)` statement at the end of the function.

After the `const [newRegistration] = await getDb().insert(registrations)...` block, the next code should be the `return new Response(JSON.stringify({ registration: newRegistration, requiresPayment: true, amountDueCents: amountDue, ...`.

**Do NOT remove** the waitlist email block inside the `if (registeredCount >= season.maxParticipants)` branch — that one stays.

After editing, the middle of the POST handler should look like this (context is the pending-registration insert and its return):

```typescript
    // Create registration (pending payment)
    const [newRegistration] = await getDb()
      .insert(registrations)
      .values({
        seasonId: data.seasonId,
        familyMemberId: data.familyMemberId,
        registeredByUserId: user.id,
        status: "pending",
        paymentStatus: "unpaid",
        amountPaidCents: 0,
        amountDueCents: amountDue,
        registrationType: data.registrationType,
        waiverSigned: data.waiverSigned,
        waiverSignedAt: data.waiverSigned ? new Date() : null,
        waiverSignedBy: data.waiverSignedBy,
        notes: data.notes || null,
      })
      .returning();

    return new Response(
      JSON.stringify({
        registration: newRegistration,
        requiresPayment: true,
        amountDueCents: amountDue,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error creating registration:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
```

Also remove any imports that are now unused. In particular, if `sendRegistrationConfirmationEmail` is only referenced from the (now-removed) pending block AND the waitlist block still uses it, keep the import. If the waitlist branch was the only other consumer and it's still there, keep the import. Check with: `grep -n "sendRegistrationConfirmationEmail" src/pages/api/registrations/index.ts` — if one hit remains, the import stays.

- [ ] **Step 5: Re-run the tests**

Run: `npm run test:api -- tests/api/webhooks/stripe.test.ts`
Expected: all five tests PASS.

- [ ] **Step 6: Run the full API test suite as a regression check**

Run: `npm run test:api`
Expected: PASS. The change to `src/pages/api/registrations/index.ts` may break existing registration API tests that expect an email send on pending create — if any fail, read the failing test and update its expectation (email now only sent on webhook).

- [ ] **Step 7: Commit**

```bash
git add src/lib/stripe/handle-checkout-complete.ts src/pages/api/registrations/index.ts tests/api/webhooks/stripe.test.ts
git commit -m "feat(stripe): send registration email after payment (not on pending create)"
```

---

## Task 7: Deterministic duplicate-registration lookup

**Files:**
- Modify: `src/pages/api/registrations/index.ts`

- [ ] **Step 1: Make the lookup ordered**

Open `src/pages/api/registrations/index.ts`. The import of drizzle helpers today is `import { eq, and, desc } from "drizzle-orm";`. We need `asc` as well. Change that line to:

```typescript
import { eq, and, desc, asc } from "drizzle-orm";
```

Then find the duplicate-registration lookup block (around line 179) and add `.orderBy(asc(registrations.createdAt))` before the destructure. The block currently looks like:

```typescript
    const [existingReg] = await getDb()
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.seasonId, data.seasonId),
          eq(registrations.familyMemberId, data.familyMemberId)
        )
      );
```

Change it to:

```typescript
    const [existingReg] = await getDb()
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.seasonId, data.seasonId),
          eq(registrations.familyMemberId, data.familyMemberId)
        )
      )
      .orderBy(asc(registrations.createdAt))
      .limit(1);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run API tests**

Run: `npm run test:api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/registrations/index.ts
git commit -m "fix(registrations): deterministic ordering on duplicate lookup"
```

---

## Task 8: Unify `db` handle in create-checkout

**Files:**
- Modify: `src/pages/api/payments/create-checkout.ts`

- [ ] **Step 1: Replace every `getDb()` call inside POST with `db`**

Open `src/pages/api/payments/create-checkout.ts`. Line 23 already declares `const db = getDb();`. Replace every subsequent `getDb()` call inside the POST handler (there are five: one for the registration lookup, one for the discount-code lookup, one for the per-user usage count, and the insert+update pair for `discountUsages`/`discountCodes`, plus the final "update registration as paid" / "insert discount usage" / "update usedCount" / "update registration with reduced amount due" blocks).

Use Edit with `replace_all: true` on the string `await getDb()` → `await db` within this file only.

After editing, verify with: `grep -n "getDb" src/pages/api/payments/create-checkout.ts`
Expected: only one hit remains — the `const db = getDb();` on line 23.

- [ ] **Step 2: Typecheck and test**

Run: `npx tsc --noEmit && npm run test:api -- tests/api/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/payments/create-checkout.ts
git commit -m "refactor(payments): use single db handle in create-checkout"
```

---

## Task 9: Dashboard success banner component

**Files:**
- Create: `src/components/dashboard/payment-success-banner.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/dashboard/payment-success-banner.tsx`. It polls `GET /api/registrations` every 2 seconds up to 15 seconds (~7 attempts), looking for the row matching the `registration` query param with `paymentStatus === 'paid' || 'deposit_paid'`. When found, it renders a "Payment confirmed" banner with player/program details. On timeout it renders a softer "finalizing…" message. Both are dismissible and strip the query params on dismiss.

```tsx
"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, X } from "lucide-react"

interface RegistrationSummary {
  id: string
  paymentStatus: string
  familyMember: { firstName: string; lastName: string }
  program: { name: string }
  season: { name: string }
}

interface PaymentSuccessBannerProps {
  registrationId: string
}

const MAX_POLLS = 7
const POLL_INTERVAL_MS = 2000

function stripQueryParams() {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  url.searchParams.delete("payment")
  url.searchParams.delete("registration")
  window.history.replaceState({}, "", url.toString())
}

export function PaymentSuccessBanner({ registrationId }: PaymentSuccessBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [registration, setRegistration] = useState<RegistrationSummary | null>(null)
  const [state, setState] = useState<"polling" | "confirmed" | "pending">("polling")

  useEffect(() => {
    let attempts = 0
    let cancelled = false

    async function poll() {
      if (cancelled) return
      attempts += 1
      try {
        const res = await fetch("/api/registrations")
        if (res.ok) {
          const data = await res.json()
          const hit = (data.registrations ?? []).find(
            (r: RegistrationSummary) => r.id === registrationId
          )
          if (hit) {
            setRegistration(hit)
            if (hit.paymentStatus === "paid" || hit.paymentStatus === "deposit_paid") {
              setState("confirmed")
              return
            }
          }
        }
      } catch {
        // swallow — we'll retry
      }

      if (attempts >= MAX_POLLS) {
        setState("pending")
        return
      }
      setTimeout(poll, POLL_INTERVAL_MS)
    }

    poll()

    return () => {
      cancelled = true
    }
  }, [registrationId])

  if (dismissed) return null

  function handleDismiss() {
    stripQueryParams()
    setDismissed(true)
  }

  const playerName = registration
    ? `${registration.familyMember.firstName} ${registration.familyMember.lastName}`
    : null
  const programLabel = registration
    ? `${registration.program.name} — ${registration.season.name}`
    : null

  const baseClasses =
    "relative flex items-start gap-3 rounded-xl border px-4 py-3 mb-6"

  if (state === "confirmed") {
    return (
      <div
        className={`${baseClasses} border-emerald-300 bg-emerald-50 text-emerald-900`}
        role="status"
      >
        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden />
        <div className="flex-1">
          <div className="font-medium">Payment confirmed.</div>
          {playerName && programLabel && (
            <div className="text-sm opacity-90">
              {playerName} is registered for {programLabel}.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="rounded p-1 hover:bg-emerald-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  if (state === "pending") {
    return (
      <div
        className={`${baseClasses} border-amber-300 bg-amber-50 text-amber-900`}
        role="status"
      >
        <Loader2 className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden />
        <div className="flex-1">
          <div className="font-medium">Your payment went through.</div>
          <div className="text-sm opacity-90">
            We're finalizing your registration — refresh in a moment to see it confirmed.
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="rounded p-1 hover:bg-amber-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // polling
  return (
    <div
      className={`${baseClasses} border-ink/10 bg-cream text-ink`}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="mt-0.5 h-5 w-5 flex-shrink-0 animate-spin" aria-hidden />
      <div className="flex-1">
        <div className="font-medium">Confirming your payment…</div>
        <div className="text-sm opacity-80">This usually takes a couple of seconds.</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/payment-success-banner.tsx
git commit -m "feat(dashboard): add payment success banner with webhook-lag polling"
```

---

## Task 10: Wire banner into dashboard page

**Files:**
- Modify: `src/pages/dashboard/index.astro`

- [ ] **Step 1: Read query params and render the banner**

Open `src/pages/dashboard/index.astro`. Near the top of the frontmatter (the `---` block), after `const user = Astro.locals.user;` and the redirect, read the query params:

```astro
const paymentStatus = Astro.url.searchParams.get('payment');
const registrationIdParam = Astro.url.searchParams.get('registration');
const showPaymentSuccessBanner = paymentStatus === 'success' && !!registrationIdParam;
```

Add the import alongside the other component imports:

```astro
import { PaymentSuccessBanner } from '../../components/dashboard/payment-success-banner';
```

Then in the body of the page, place the banner as the FIRST child of the main dashboard container, before whatever existing top-level element. A minimal edit: find the first opening element inside the page body that contains the dashboard content (typically right after `<Navigation client:load />` and the opening `<main>` tag), and insert:

```astro
{showPaymentSuccessBanner && (
  <PaymentSuccessBanner registrationId={registrationIdParam} client:load />
)}
```

Place it immediately inside the main content container (e.g., right after `<main …>` or inside the top container), above the greeting/existing children.

- [ ] **Step 2: Smoke-test rendering**

Start the dev server (`npm run dev` in one terminal if not already) and visit:

```
http://localhost:4321/dashboard?payment=success&registration=00000000-0000-0000-0000-000000000000
```

Expected: The page loads, the polling banner shows at the top, no registration matches so after ~14 seconds it flips to the "finalizing" amber banner (because the nonexistent id won't ever satisfy the poll condition).

- [ ] **Step 3: Build (SSR-vs-prerender sanity check per CLAUDE.md)**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/index.astro
git commit -m "feat(dashboard): render payment success banner on ?payment=success"
```

---

## Task 11: Cancel-resume flow in registration wizard

**Files:**
- Modify: `src/pages/register/[seasonId].astro`
- Modify: `src/components/registration/registration-wizard.tsx`

- [ ] **Step 1: Pass cancel flag into the wizard**

Open `src/pages/register/[seasonId].astro`. In the frontmatter, read the query param:

```astro
const wasCancelled = Astro.url.searchParams.get('payment') === 'cancelled';
```

Then update the wizard invocation to pass it:

```astro
<RegistrationWizard seasonId={seasonId!} wasCancelled={wasCancelled} client:load />
```

- [ ] **Step 2: Accept the prop in the wizard**

Open `src/components/registration/registration-wizard.tsx`. Update the `RegistrationWizardProps` interface and the component signature:

```typescript
interface RegistrationWizardProps {
  seasonId: string
  hasLinkedTelegram?: boolean
  wasCancelled?: boolean
}

export default function RegistrationWizard({
  seasonId,
  hasLinkedTelegram = false,
  wasCancelled = false,
}: RegistrationWizardProps) {
```

- [ ] **Step 3: Add state + effect to detect the resumable registration**

Inside the component, near the other `useState` calls, add:

```typescript
  const [resumableRegistrationId, setResumableRegistrationId] = useState<string | null>(null)
  const [isResumingPayment, setIsResumingPayment] = useState(false)
```

Then add a `useEffect` near the existing effects:

```typescript
  useEffect(() => {
    if (!wasCancelled) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/registrations")
        if (!res.ok) return
        const data = await res.json()
        const match = (data.registrations ?? []).find(
          (r: { id: string; season: { id: string }; status: string; paymentStatus: string }) =>
            r.season.id === seasonId &&
            r.status === "pending" &&
            r.paymentStatus === "unpaid"
        )
        if (!cancelled && match) {
          setResumableRegistrationId(match.id)
        }
      } catch {
        // swallow — fall back to normal wizard
      }
    })()
    return () => {
      cancelled = true
    }
  }, [wasCancelled, seasonId])
```

- [ ] **Step 4: Add the "Finish payment" short-circuit UI**

Add a handler above `handleSubmitRegistration`:

```typescript
  const handleResumePayment = async () => {
    if (!resumableRegistrationId) return
    setIsResumingPayment(true)
    setError(null)
    try {
      const res = await fetch("/api/payments/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: resumableRegistrationId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout session")
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }
      // No URL + ok → discount zeroed the bill; treat as complete.
      setRegistrationComplete(true)
      setCurrentStep(4)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start payment")
    } finally {
      setIsResumingPayment(false)
    }
  }
```

Near the top of the component's return (inside the existing early-loading/error JSX, before the stepper), add a block that renders BEFORE the main wizard content when `resumableRegistrationId` is set:

```tsx
  if (resumableRegistrationId) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-xl border border-ink/10 bg-cream px-6 py-8 shadow-sm">
          <h2 className="text-2xl font-medium text-ink mb-2">Finish your payment</h2>
          <p className="text-ink/80 mb-6">
            You started registering for this season but didn't complete payment.
            Your spot is saved — click below to go back to Stripe Checkout.
          </p>
          {error && (
            <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={handleResumePayment} disabled={isResumingPayment}>
              {isResumingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting…
                </>
              ) : (
                "Continue to payment"
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setResumableRegistrationId(null)}
              disabled={isResumingPayment}
            >
              Start over
            </Button>
          </div>
        </div>
      </div>
    )
  }
```

Place this block BEFORE the `return (` that renders the stepper — i.e., after the existing early-return loading/error branches but before the main wizard JSX. The "Start over" button intentionally clears `resumableRegistrationId` so the parent can proceed through the normal wizard if they want — the server's duplicate-detection will return the same row on submit, which is fine.

- [ ] **Step 5: Typecheck and manual render**

Run: `npx tsc --noEmit`
Expected: no new errors.

Start the dev server, and test the happy cancel path:
1. Sign in as test parent.
2. Begin a registration for any open season.
3. Step through to Stripe Checkout.
4. Click "Back" or navigate to `http://localhost:4321/register/<seasonId>?payment=cancelled`.
5. The wizard should render the "Finish your payment" card instead of the normal stepper.
6. Click "Continue to payment" → you land back in Stripe Checkout with the same registration id.

- [ ] **Step 6: Commit**

```bash
git add src/pages/register/\[seasonId\].astro src/components/registration/registration-wizard.tsx
git commit -m "feat(registration): resume-payment screen when returning from cancelled checkout"
```

---

## Task 12: Final verification

**Files:** none modified.

- [ ] **Step 1: Run the full API suite**

Run: `npm run test:api`
Expected: PASS.

- [ ] **Step 2: Run the existing Playwright suite**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test`
Expected: PASS. (Nothing in this plan should touch any e2e-tested flow, so a failure here is a regression and should be debugged before shipping.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: End-to-end manual smoke test**

Follow `docs/stripe-sandbox.md` section "Smoke test" with the test parent account.

Verify:
- Registration transitions `pending/unpaid` → `confirmed/paid` after Stripe test card completes.
- Webhook log in `npm run stripe:listen` terminal shows `checkout.session.completed → processed`.
- A row appears in `payments` with `status = 'succeeded'`.
- Dashboard lands with success banner; banner flips from "Confirming…" to "Payment confirmed" within a couple seconds.
- A confirmation email is queued (check logs; email sending returns success even if SMTP isn't configured, per `isEmailConfigured` guard).
- Cancel flow: start another registration for a different season, hit "Back" on Stripe Checkout → you arrive at `?payment=cancelled` and see "Finish your payment" screen.
- Duplicate delivery idempotency: in the `stripe listen` terminal, press `r` then `Enter` or use `stripe trigger checkout.session.completed` to replay — the second delivery should log `→ skipped` and the DB should be unchanged.

- [ ] **Step 5: If everything passes, no commit needed — plan complete.**

---

## Self-review

**Spec coverage:**
- Phase 1 (CLI listen + docs + smoke test) → Tasks 1, 2, 12.
- Phase 2.1 (webhook idempotency) → Tasks 3, 4, 5.
- Phase 2.2 (email moves to webhook) → Task 6.
- Phase 2.3 (deterministic duplicate lookup) → Task 7.
- Phase 2.4 (single db handle) → Task 8.
- Phase 3.1 (success banner) → Tasks 9, 10.
- Phase 3.2 (cancel resume) → Task 11.
- Phase 3.3 (error surface) — already correct in current API error shaping; verified visually during Task 12 manual smoke test. No dedicated code task required.
- Testing (unit + integration) → integration tests in Tasks 4, 5, 6.

**Placeholders:** None. Every code change is fully specified.

**Type consistency:** `handleCheckoutComplete` signature is stable across Tasks 3→5→6. `PaymentSuccessBanner` props and `RegistrationWizardProps.wasCancelled` are each defined once. `resumableRegistrationId` is declared in Task 11 Step 3 and used in Steps 4 downstream.

**Known external assumptions:**
- Stripe CLI installed locally. Task 1 Step 2 catches the case where it isn't.
- The dev `.env` already has test-mode Stripe keys. Task 2's runbook documents this.
- The test DB (Vitest `api` project) can be written to freely — consistent with existing `tests/api/admin/*.test.ts` patterns that also seed rows.
