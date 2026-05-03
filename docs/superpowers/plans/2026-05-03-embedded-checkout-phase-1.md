# Embedded Stripe Checkout — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the redirect-to-Stripe-Checkout payment flow with an embedded Payment Element backed by Checkout Sessions (`ui_mode: 'custom'`), wire GA4 ecommerce dataLayer events across the funnel, and add a server-side GA4 Measurement Protocol fire from the existing Stripe webhook as backup conversion attribution.

**Architecture:** Server still creates a Stripe Checkout Session (preserving Connect destination charges, idempotency keys, and the existing webhook). The session uses `ui_mode: 'custom'` and returns a `clientSecret` instead of a redirect URL. The wizard's payment step renders Stripe's `<PaymentElement />` inline via `@stripe/react-stripe-js`, calls `stripe.confirmPayment()` directly, and either resolves synchronously or redirects to a new `/payment/return` page for SCA / 3DS challenges. dataLayer events are pushed at four funnel checkpoints; the webhook also POSTs a `purchase` event to GA4 Measurement Protocol so ad-blocker losses are recovered. No DB schema changes.

**Tech Stack:** Astro 5, React 19, Stripe Node SDK (`stripe`), `@stripe/stripe-js` + `@stripe/react-stripe-js` (new), Vitest (unit + API integration), Playwright (E2E), Drizzle ORM (no schema changes this plan).

**Spec:** `docs/superpowers/specs/2026-05-03-embedded-stripe-checkout-gtm-design.md` (sections 1, 2, 3, 4.1–4.7, 7 edge cases for Phase 1, 9 phasing, 10 verification).

---

## File Structure

### Modified files (9)

| File | Responsibility | Changes |
|---|---|---|
| `src/lib/stripe/client.ts` | Stripe SDK init + Checkout Session helper | `createCheckoutSession` returns `{ id, clientSecret }` instead of `{ id, url }`; adds `ui_mode: 'custom'`; drops `success_url`/`cancel_url` |
| `src/lib/stripe/connect.ts` | Connect account + destination-charge Checkout Session | Same `ui_mode` change to `createConnectCheckoutSession` |
| `src/lib/stripe/handle-checkout-complete.ts` | Webhook handler — marks paid + sends emails | Adds fire-and-forget GA4 Measurement Protocol `purchase` event with derived `paymentType` |
| `src/lib/payments/create-checkout-for-registration.ts` | Orchestrator: discount + Connect routing + Stripe call | `CheckoutResult.kind === 'stripe_session'` shape changes from `{ checkoutUrl, sessionId }` to `{ clientSecret, sessionId }` |
| `src/pages/api/payments/create-checkout.ts` | API endpoint for authenticated checkout init | Returns `{ clientSecret, sessionId, publishableKey }`; reads `_ga` cookie + `gclid`/`fbclid` and forwards as Stripe session metadata |
| `src/pages/api/registrations/guest-checkout.ts` | API endpoint for guest registration + checkout init | Same return-shape + analytics-id capture |
| `src/components/registration/payment-step.tsx` | Wizard step 4 UI | Adds `clientSecret`/`publishableKey` props; renders `<EmbeddedPayment>` below the existing order summary when those props are set; otherwise renders today's UI unchanged |
| `src/components/registration/registration-wizard.tsx` | Wizard orchestrator | Replaces `window.location.href = checkoutUrl` redirects with state transition into embedded form; fires dataLayer events at funnel checkpoints; preserves Telegram-step gating |
| `src/lib/env.ts` + `.env.example` | Env validation + docs | Adds `GA4_MEASUREMENT_ID` + `GA4_API_SECRET` (optional in schema, soft-required in prod) |

### Created files (4)

| File | Responsibility |
|---|---|
| `src/lib/analytics/datalayer.ts` | Typed wrappers around `window.dataLayer.push` for the four GA4 ecommerce events |
| `src/lib/analytics/ga4-measurement-protocol.ts` | Server-side GA4 Measurement Protocol client (fire-and-forget `purchase`) |
| `src/components/registration/embedded-payment.tsx` | React component: wraps `<Elements>` + `<PaymentElement>` + pay button + state |
| `src/pages/payment/return.astro` | SSR page for `confirmPayment` `return_url` — resolves PaymentIntent status, fires client-side `purchase`, routes to dashboard |

### Test files

| Test | Type | Purpose |
|---|---|---|
| `tests/unit/datalayer.test.ts` | Unit | Asserts `dataLayer.push` calls are correctly shaped + `ecommerce: null` reset present + soft-fail when `window.dataLayer` is undefined |
| `tests/unit/ga4-measurement-protocol.test.ts` | Unit | Asserts request body shape; soft-fail when env vars unset; soft-fail on network error |
| `tests/api/payments-create-checkout.test.ts` | API integration (NEW) | Asserts `/api/payments/create-checkout` returns `clientSecret` + `publishableKey` and forwards `_ga` cookie value into the Stripe session metadata |
| `tests/e2e/registration-payment.spec.ts` | E2E (UPDATE existing) | Drives the embedded form with Stripe test cards instead of asserting a redirect to `checkout.stripe.com` |

---

## Pre-flight (do this BEFORE Task 1)

Confirm you're in the right place:

```bash
git branch --show-current
# Expected: a feature branch (NOT main). If you're on main, create a worktree:
#   See superpowers:using-git-worktrees skill for setup
```

Confirm Stripe webhook listener is running locally (Phase 1 manual verification needs this):

```bash
npm run stripe:listen
# Should print: > Ready! ... You are listening to events for ...
# Leave this running in a separate terminal during dev.
```

---

## Task 1: Install Stripe client SDK packages

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install dependencies**

```bash
npm install @stripe/stripe-js@^7.0.0 @stripe/react-stripe-js@^4.0.0
```

Use the latest major versions of both packages (they're pinned together — `react-stripe-js` peer-depends on `stripe-js`).

- [ ] **Step 2: Verify installs**

```bash
node -e "console.log(require('@stripe/stripe-js/package.json').version, require('@stripe/react-stripe-js/package.json').version)"
```

Expected: two version numbers, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @stripe/stripe-js + @stripe/react-stripe-js for embedded checkout"
```

---

## Task 2: Add GA4 env vars

**Files:**
- Modify: `src/lib/env.ts:38-77` (envSchema), `src/lib/env.ts:97-101` (SOFT_REQUIRED_IN_PROD)
- Modify: `.env.example` (add new section)

- [ ] **Step 1: Add to envSchema**

In `src/lib/env.ts` inside `envSchema = z.object({...})`, add to the optional block (after the existing optional vars, before the closing `})`):

```ts
  // GA4 Measurement Protocol — server-side purchase event backup.
  // Optional everywhere; missing values disable the server-side fire
  // but don't crash the site.
  GA4_MEASUREMENT_ID: z.string().optional(),
  GA4_API_SECRET: z.string().optional(),
```

- [ ] **Step 2: Add to SOFT_REQUIRED_IN_PROD**

In `src/lib/env.ts`, add to the `SOFT_REQUIRED_IN_PROD` array:

```ts
const SOFT_REQUIRED_IN_PROD = [
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "RESEND_INBOUND_WEBHOOK_SECRET",
  "CRON_SECRET",
  "GA4_MEASUREMENT_ID",
  "GA4_API_SECRET",
] as const;
```

- [ ] **Step 3: Add to .env.example**

In `.env.example` after the PostHog section (line 130), add:

```
# ------------------------------------------------------------
# GA4 Measurement Protocol (server-side purchase tracking)
# ------------------------------------------------------------
# Backup conversion fire from the Stripe webhook. Recovers
# purchase events lost to ad blockers / iOS Intelligent Tracking
# Prevention. Both values come from GA4 Admin → Data Streams →
# (your stream) → Measurement Protocol API secrets. Soft-required
# in prod: missing values disable the server-side fire only.

GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=
```

- [ ] **Step 4: Verify env loads**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "feat(env): add GA4_MEASUREMENT_ID + GA4_API_SECRET (soft-required)"
```

---

## Task 3: dataLayer typed wrappers (TDD)

**Files:**
- Create: `src/lib/analytics/datalayer.ts`
- Test: `tests/unit/datalayer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/datalayer.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  trackViewItem,
  trackBeginCheckout,
  trackAddPaymentInfo,
  trackPurchase,
  type SeasonItem,
} from "@/lib/analytics/datalayer";

const item: SeasonItem = {
  id: "season-uuid-1",
  name: "Summer Soccer - Worthington 2026",
  category: "Soccer",
  category2: "Worthington",
  priceCents: 25000,
};

describe("dataLayer trackers", () => {
  beforeEach(() => {
    (globalThis as any).window = { dataLayer: [] };
  });

  it("trackViewItem pushes ecommerce reset followed by view_item", () => {
    trackViewItem(item);
    const dl = (globalThis as any).window.dataLayer;
    expect(dl).toHaveLength(2);
    expect(dl[0]).toEqual({ ecommerce: null });
    expect(dl[1]).toMatchObject({
      event: "view_item",
      ecommerce: {
        currency: "USD",
        value: 250,
        items: [
          {
            item_id: "season-uuid-1",
            item_name: "Summer Soccer - Worthington 2026",
            item_category: "Soccer",
            item_category2: "Worthington",
            price: 250,
            quantity: 1,
          },
        ],
      },
    });
  });

  it("trackBeginCheckout pushes value at deposit/full amount, not unit price", () => {
    trackBeginCheckout(item, 7500, "EARLYBIRD");
    const dl = (globalThis as any).window.dataLayer;
    expect(dl[1]).toMatchObject({
      event: "begin_checkout",
      ecommerce: {
        currency: "USD",
        value: 75,
        coupon: "EARLYBIRD",
      },
    });
  });

  it("trackAddPaymentInfo includes payment_type", () => {
    trackAddPaymentInfo(item, 25000, "card");
    const dl = (globalThis as any).window.dataLayer;
    expect(dl[1]).toMatchObject({
      event: "add_payment_info",
      ecommerce: {
        currency: "USD",
        value: 250,
        payment_type: "card",
      },
    });
  });

  it("trackPurchase includes transaction_id + payment_type", () => {
    trackPurchase("pi_test_123", item, 7500, "deposit");
    const dl = (globalThis as any).window.dataLayer;
    expect(dl[1]).toMatchObject({
      event: "purchase",
      ecommerce: {
        transaction_id: "pi_test_123",
        currency: "USD",
        value: 75,
        payment_type: "deposit",
      },
    });
  });

  it("trackPurchase soft-fails when window.dataLayer is undefined", () => {
    delete (globalThis as any).window.dataLayer;
    expect(() => trackPurchase("pi_test_123", item, 7500, "deposit")).not.toThrow();
  });

  it("trackPurchase soft-fails when window itself is undefined", () => {
    delete (globalThis as any).window;
    expect(() => trackPurchase("pi_test_123", item, 7500, "deposit")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- datalayer
```

Expected: FAIL — `Cannot find module '@/lib/analytics/datalayer'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/analytics/datalayer.ts`:

```ts
/**
 * Typed wrappers around window.dataLayer.push for GA4 ecommerce events.
 *
 * Each helper:
 * 1. Pushes { ecommerce: null } first (per GA4 docs — clears any prior
 *    ecommerce object so events don't bleed into each other).
 * 2. Pushes the GA4-spec ecommerce event.
 * 3. Soft-fails if window.dataLayer is undefined (GTM blocked, SSR, etc.).
 *
 * GA4 spec reference:
 *   https://developers.google.com/tag-platform/gtagjs/reference/events
 */

export interface SeasonItem {
  /** Season UUID — used as the GA4 item_id */
  id: string;
  /** Display name, e.g. "Summer Soccer - Worthington 2026" */
  name: string;
  /** Sport name, e.g. "Soccer" */
  category: string;
  /** Location name, e.g. "Worthington" */
  category2: string;
  /** Unit price (full season price, not the deposit/balance amount) */
  priceCents: number;
}

export type CheckoutPaymentType = "deposit" | "balance" | "full";

interface DataLayerWindow {
  dataLayer?: Array<Record<string, unknown>>;
}

function getDataLayer(): Array<Record<string, unknown>> | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as DataLayerWindow;
  return w.dataLayer ?? null;
}

function pushEvent(event: string, ecommerce: Record<string, unknown>): void {
  const dl = getDataLayer();
  if (!dl) return;
  dl.push({ ecommerce: null });
  dl.push({ event, ecommerce });
}

function itemPayload(item: SeasonItem) {
  return {
    item_id: item.id,
    item_name: item.name,
    item_category: item.category,
    item_category2: item.category2,
    price: item.priceCents / 100,
    quantity: 1,
  };
}

export function trackViewItem(item: SeasonItem): void {
  pushEvent("view_item", {
    currency: "USD",
    value: item.priceCents / 100,
    items: [itemPayload(item)],
  });
}

export function trackBeginCheckout(
  item: SeasonItem,
  valueCents: number,
  coupon?: string,
): void {
  pushEvent("begin_checkout", {
    currency: "USD",
    value: valueCents / 100,
    ...(coupon ? { coupon } : {}),
    items: [itemPayload(item)],
  });
}

export function trackAddPaymentInfo(
  item: SeasonItem,
  valueCents: number,
  paymentType: string,
  coupon?: string,
): void {
  pushEvent("add_payment_info", {
    currency: "USD",
    value: valueCents / 100,
    payment_type: paymentType,
    ...(coupon ? { coupon } : {}),
    items: [itemPayload(item)],
  });
}

export function trackPurchase(
  transactionId: string,
  item: SeasonItem,
  valueCents: number,
  paymentType: CheckoutPaymentType,
  coupon?: string,
): void {
  pushEvent("purchase", {
    transaction_id: transactionId,
    currency: "USD",
    value: valueCents / 100,
    payment_type: paymentType,
    ...(coupon ? { coupon } : {}),
    items: [itemPayload(item)],
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- datalayer
```

Expected: PASS — 6 tests.

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/datalayer.ts tests/unit/datalayer.test.ts
git commit -m "feat(analytics): typed dataLayer wrappers for GA4 ecommerce events"
```

---

## Task 4: GA4 Measurement Protocol server module (TDD)

**Files:**
- Create: `src/lib/analytics/ga4-measurement-protocol.ts`
- Test: `tests/unit/ga4-measurement-protocol.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ga4-measurement-protocol.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendPurchaseEvent } from "@/lib/analytics/ga4-measurement-protocol";

const baseInput = {
  clientId: "1234567890.0987654321",
  transactionId: "pi_test_abc",
  valueCents: 7500,
  currency: "USD" as const,
  items: [
    {
      id: "season-1",
      name: "Summer Soccer - Worthington 2026",
      category: "Soccer",
      priceCents: 25000,
    },
  ],
  paymentType: "deposit" as const,
  coupon: "EARLYBIRD",
};

describe("sendPurchaseEvent", () => {
  beforeEach(() => {
    process.env.GA4_MEASUREMENT_ID = "G-TEST123";
    process.env.GA4_API_SECRET = "secret-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  });

  afterEach(() => {
    delete process.env.GA4_MEASUREMENT_ID;
    delete process.env.GA4_API_SECRET;
    vi.unstubAllGlobals();
  });

  it("POSTs to mp/collect with correctly shaped body", async () => {
    await sendPurchaseEvent(baseInput);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe(
      "https://www.google-analytics.com/mp/collect?measurement_id=G-TEST123&api_secret=secret-test",
    );
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      client_id: "1234567890.0987654321",
      events: [
        {
          name: "purchase",
          params: {
            transaction_id: "pi_test_abc",
            value: 75,
            currency: "USD",
            payment_type: "deposit",
            coupon: "EARLYBIRD",
            items: [
              {
                item_id: "season-1",
                item_name: "Summer Soccer - Worthington 2026",
                item_category: "Soccer",
                price: 250,
                quantity: 1,
              },
            ],
          },
        },
      ],
    });
  });

  it("short-circuits when GA4_MEASUREMENT_ID is unset", async () => {
    delete process.env.GA4_MEASUREMENT_ID;
    await sendPurchaseEvent(baseInput);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("short-circuits when GA4_API_SECRET is unset", async () => {
    delete process.env.GA4_API_SECRET;
    await sendPurchaseEvent(baseInput);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("soft-fails on network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));
    await expect(sendPurchaseEvent(baseInput)).resolves.toBeUndefined();
  });

  it("soft-fails on non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));
    await expect(sendPurchaseEvent(baseInput)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- ga4-measurement-protocol
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/analytics/ga4-measurement-protocol.ts`:

```ts
/**
 * Server-side GA4 Measurement Protocol client.
 *
 * Fires `purchase` events to GA4 directly from the Stripe webhook,
 * recovering conversions lost to ad blockers / iOS Intelligent Tracking
 * Prevention. Uses the same transaction_id as the client-side dataLayer
 * fire so GA4 dedupes within the standard event window.
 *
 * Soft-fails on every error path — never blocks webhook ack.
 *
 * Spec: docs/superpowers/specs/2026-05-03-embedded-stripe-checkout-gtm-design.md §4.4
 */

export interface GA4PurchaseItem {
  /** Maps to GA4 item_id (typically the seasonId) */
  id: string;
  /** Maps to GA4 item_name */
  name: string;
  /** Maps to GA4 item_category */
  category: string;
  /** Unit price (full season price) */
  priceCents: number;
}

export interface SendPurchaseEventInput {
  /** GA4 client_id parsed from the _ga cookie */
  clientId: string;
  /** Stripe PaymentIntent ID — same value used client-side for dedupe */
  transactionId: string;
  /** Amount paid in this charge (deposit OR balance OR full) */
  valueCents: number;
  currency: "USD";
  items: GA4PurchaseItem[];
  paymentType: "deposit" | "balance" | "full";
  coupon?: string;
}

const ENDPOINT = "https://www.google-analytics.com/mp/collect";

export async function sendPurchaseEvent(
  input: SendPurchaseEventInput,
): Promise<void> {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;

  if (!measurementId || !apiSecret) {
    return;
  }

  const url = `${ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = {
    client_id: input.clientId,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: input.transactionId,
          value: input.valueCents / 100,
          currency: input.currency,
          payment_type: input.paymentType,
          ...(input.coupon ? { coupon: input.coupon } : {}),
          items: input.items.map((it) => ({
            item_id: it.id,
            item_name: it.name,
            item_category: it.category,
            price: it.priceCents / 100,
            quantity: 1,
          })),
        },
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(
        `[ga4-mp] non-2xx response: ${res.status} for transaction ${input.transactionId}`,
      );
    }
  } catch (err) {
    console.error("[ga4-mp] send failed:", err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- ga4-measurement-protocol
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/ga4-measurement-protocol.ts tests/unit/ga4-measurement-protocol.test.ts
git commit -m "feat(analytics): server-side GA4 Measurement Protocol purchase fire"
```

---

## Task 5: Switch createCheckoutSession to ui_mode: 'custom'

**Files:**
- Modify: `src/lib/stripe/client.ts:36-98`

- [ ] **Step 1: Update createCheckoutSession**

Replace the body of `createCheckoutSession` in `src/lib/stripe/client.ts` (lines 37-98) with:

```ts
export async function createCheckoutSession({
  registrationId,
  seasonName,
  playerName,
  amountCents,
  customerEmail,
  extraMetadata,
}: {
  registrationId: string;
  seasonName: string;
  playerName: string;
  amountCents: number;
  customerEmail: string;
  extraMetadata?: Record<string, string>;
}): Promise<{ id: string; clientSecret: string } | null> {
  if (!stripe) {
    console.error("Stripe is not configured");
    return null;
  }

  try {
    const session = await stripe.checkout.sessions.create(
      {
        ui_mode: "custom",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: seasonName,
                description: `Registration for ${playerName}`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: customerEmail,
        metadata: {
          registrationId,
          type: "registration_payment",
          ...(extraMetadata ?? {}),
        },
      },
      {
        idempotencyKey: `${registrationId}:checkout:${amountCents}`,
      },
    );

    if (!session.client_secret) {
      console.error("Stripe session returned without client_secret");
      return null;
    }

    return { id: session.id, clientSecret: session.client_secret };
  } catch (error) {
    console.error("Error creating Stripe checkout session:", error);
    throw error;
  }
}
```

Notes:
- `successUrl` / `cancelUrl` params are dropped from the function signature — custom mode handles success client-side via `confirmPayment`
- `payment_method_types: ["card"]` is removed; with `ui_mode: 'custom'`, Stripe enables dynamic payment methods (card, Apple Pay, Google Pay, Link) configured in the Stripe Dashboard
- Idempotency key unchanged — still amount-suffixed so deposit + balance don't collide

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: errors in `create-checkout-for-registration.ts` calling sites (will be fixed in Task 7) and `/api/payments/create-checkout.ts` (Task 8). Zero errors *outside* those files. List the errors and confirm they're confined to the expected files.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stripe/client.ts
git commit -m "feat(stripe): createCheckoutSession uses ui_mode: 'custom' for embedded UI"
```

(Type errors at call sites are intentional — they'll be cleared by Tasks 7-8. The `tsc --noEmit` run in Task 8 will be the gate.)

---

## Task 6: Switch createConnectCheckoutSession to ui_mode: 'custom'

**Files:**
- Modify: `src/lib/stripe/connect.ts:209-282`

- [ ] **Step 1: Update createConnectCheckoutSession**

Replace the body of `createConnectCheckoutSession` (lines 209-282) with:

```ts
export async function createConnectCheckoutSession(
  options: PaymentWithConnectOptions
): Promise<{ id: string; clientSecret: string } | null> {
  if (!stripe) return null;

  const {
    amountCents,
    currency = "usd",
    destinationAccountId,
    applicationFeePercent,
    applicationFeeAmountCents,
    customerEmail,
    customerId,
    metadata = {},
    productName,
    productDescription,
  } = options;

  // Calculate application fee
  let applicationFee = applicationFeeAmountCents;
  if (!applicationFee && applicationFeePercent) {
    applicationFee = Math.round(amountCents * (applicationFeePercent / 100));
  }

  try {
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      ui_mode: "custom",
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: productName,
              description: productDescription,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: customerId ? undefined : customerEmail,
      customer: customerId,
      metadata,
      payment_intent_data: {
        application_fee_amount: applicationFee,
        transfer_data: {
          destination: destinationAccountId,
        },
        metadata,
      },
    };

    const registrationId = metadata.registrationId;
    const idempotencyKey = registrationId
      ? `${registrationId}:connect-checkout:${amountCents}`
      : `${destinationAccountId}:connect-checkout:${amountCents}`;

    const session = await stripe.checkout.sessions.create(sessionConfig, {
      idempotencyKey,
    });

    if (!session.client_secret) {
      console.error("Stripe Connect session returned without client_secret");
      return null;
    }

    return { id: session.id, clientSecret: session.client_secret };
  } catch (error) {
    console.error("Error creating Connect checkout session:", error);
    throw error;
  }
}
```

Also update the `PaymentWithConnectOptions` interface (lines 178-204) to drop `successUrl` and `cancelUrl`:

```ts
interface PaymentWithConnectOptions {
  amountCents: number;
  currency?: string;
  destinationAccountId: string;
  applicationFeePercent?: number;
  applicationFeeAmountCents?: number;
  customerEmail: string;
  customerId?: string;
  metadata?: Record<string, string>;
  productName: string;
  productDescription?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/stripe/connect.ts
git commit -m "feat(stripe): createConnectCheckoutSession uses ui_mode: 'custom'"
```

---

## Task 7: Update create-checkout-for-registration return shape

**Files:**
- Modify: `src/lib/payments/create-checkout-for-registration.ts:38-40, 230-287`

- [ ] **Step 1: Update CheckoutResult type**

In `src/lib/payments/create-checkout-for-registration.ts` lines 38-40, change:

```ts
export type CheckoutResult =
  | { kind: "stripe_session"; clientSecret: string; sessionId: string }
  | { kind: "paid_zero"; registrationId: string };
```

- [ ] **Step 2: Drop URL building (no longer needed)**

Delete lines 229-231 (the `successUrl` / `cancelUrl` construction block):

```ts
// DELETE these three lines:
// 9. Build URLs
const successUrl = `${baseUrl}/dashboard?payment=success&registration=${registrationId}`;
const cancelUrl = `${baseUrl}/register/${season.id}?payment=cancelled`;
```

- [ ] **Step 3: Update both call sites**

Replace the Connect-route block (lines 248-268 in original) with:

```ts
  if (
    paymentConfig?.useConnect &&
    paymentConfig.destinationAccountId
  ) {
    const session = await createConnectCheckoutSession({
      amountCents: amountDue,
      destinationAccountId: paymentConfig.destinationAccountId,
      applicationFeePercent: paymentConfig.applicationFeePercent,
      customerEmail,
      productName: `${program.name} - ${season.name}`,
      productDescription: `Registration for ${familyMember.firstName} ${familyMember.lastName}`,
      metadata: merged,
    });

    if (!session) {
      throw new CheckoutError(500, "Failed to create Connect checkout session");
    }
    return { kind: "stripe_session", clientSecret: session.clientSecret, sessionId: session.id };
  }
```

Replace the platform-direct block (lines 270-286 in original) with:

```ts
  // Platform-direct (HQ, or franchise without a connected account yet)
  const session = await createCheckoutSession({
    registrationId,
    seasonName: `${program.name} - ${season.name}`,
    playerName: `${familyMember.firstName} ${familyMember.lastName}`,
    amountCents: amountDue,
    customerEmail,
    extraMetadata,
  });

  if (!session) {
    throw new CheckoutError(500, "Failed to create checkout session");
  }

  return { kind: "stripe_session", clientSecret: session.clientSecret, sessionId: session.id };
}
```

The `baseUrl` parameter is no longer used inside the function. Either remove it from `CreateCheckoutForRegistrationInput` (and all callers) OR leave it (will be needed in Phase 2 for magic-link URL building). **Decision: leave it.** Add a comment above the input interface: `// baseUrl currently unused in Phase 1 (no redirect URLs); retained for Phase 2 magic-link emails`.

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```

Expected: errors only in `/api/payments/create-checkout.ts` and `/api/registrations/guest-checkout.ts` (will be fixed in Tasks 8-9).

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/create-checkout-for-registration.ts
git commit -m "refactor(payments): CheckoutResult returns clientSecret instead of checkoutUrl"
```

---

## Task 8: Update /api/payments/create-checkout endpoint

**Files:**
- Modify: `src/pages/api/payments/create-checkout.ts`

- [ ] **Step 1: Add _ga cookie + UTM param parsing helper**

At the top of `src/pages/api/payments/create-checkout.ts` (after the imports), add:

```ts
/**
 * Parse the GA4 client_id from the `_ga` cookie. Format is `GA1.1.<client>.<timestamp>`
 * where the client_id GA4 expects is `<client>.<timestamp>`. Returns null if absent
 * or malformed.
 */
function parseGaClientId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)_ga=GA\d\.\d\.([^;]+)/);
  return match?.[1] ?? null;
}

function readQueryOrCookie(url: URL, cookieHeader: string | null, name: string): string | null {
  const fromQuery = url.searchParams.get(name);
  if (fromQuery) return fromQuery;
  if (!cookieHeader) return null;
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
  const m = cookieHeader.match(re);
  return m?.[1] ?? null;
}
```

- [ ] **Step 2: Pass analytics IDs into checkout creation + return new shape**

Replace the body of the `POST` handler (lines 15-135) with:

```ts
export const POST: APIRoute = async ({ request, locals, url }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json();
    const validation = checkoutSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const { registrationId, discountCode } = validation.data;
    const db = getDb();

    // Capture GA4 client_id + ad-platform IDs to pass through Stripe session
    // metadata so the webhook (handle-checkout-complete.ts) can fire a
    // server-side GA4 Measurement Protocol purchase event.
    const cookieHeader = request.headers.get("cookie");
    const gaClientId = parseGaClientId(cookieHeader);
    const gclid = readQueryOrCookie(url, cookieHeader, "gclid");
    const fbclid = readQueryOrCookie(url, cookieHeader, "fbclid");

    const extraMetadata: Record<string, string> = {};
    if (gaClientId) extraMetadata.ga_client_id = gaClientId;
    if (gclid) extraMetadata.gclid = gclid;
    if (fbclid) extraMetadata.fbclid = fbclid;

    const result = await createCheckoutForRegistration({
      db,
      registrationId,
      userId: user.id,
      baseUrl: url.origin,
      discountCode,
      extraMetadata,
    });

    const posthog = getPostHogServer();
    const phSessionId = request.headers.get("X-PostHog-Session-Id") || undefined;

    if (result.kind === "paid_zero") {
      posthog.capture({
        distinctId: user.id,
        event: "checkout_zero_amount",
        properties: { $session_id: phSessionId, registration_id: registrationId, discount_code: discountCode },
      });
      return new Response(
        JSON.stringify({
          success: true,
          message: "Registration complete - no payment required after discount",
          discountApplied: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // kind === "stripe_session"
    posthog.capture({
      distinctId: user.id,
      event: "checkout_initiated",
      properties: {
        $session_id: phSessionId,
        registration_id: registrationId,
        stripe_session_id: result.sessionId,
        discount_code: discountCode,
      },
    });
    return new Response(
      JSON.stringify({
        clientSecret: result.clientSecret,
        sessionId: result.sessionId,
        publishableKey: import.meta.env.STRIPE_PUBLISHABLE_KEY,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    if (error instanceof CheckoutError) {
      return new Response(
        JSON.stringify({
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        }),
        { status: error.status, headers: { "Content-Type": "application/json" } },
      );
    }

    console.error("Error creating checkout session:", error);

    const e = error as { type?: string; message?: string };
    const stripeType =
      typeof e?.type === "string" && e.type.startsWith("Stripe") ? e.type : null;

    if (stripeType === "StripeAuthenticationError") {
      return new Response(
        JSON.stringify({
          error:
            "Payment processing is not configured correctly. Please contact support — your registration is saved and you won't be charged twice when payments come back online.",
          code: "stripe_auth_error",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    if (stripeType) {
      return new Response(
        JSON.stringify({
          error:
            "We couldn't start your payment. Please try again in a moment — your registration is saved.",
          code: "stripe_error",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        error:
          "Something went wrong starting your payment. Your registration is saved; please try again.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: errors only in `guest-checkout.ts` (Task 9). All other files clean.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/payments/create-checkout.ts
git commit -m "feat(api): /payments/create-checkout returns clientSecret + captures _ga cookie"
```

---

## Task 9: Update /api/registrations/guest-checkout endpoint

**Files:**
- Modify: `src/pages/api/registrations/guest-checkout.ts`

- [ ] **Step 1: Read the file to understand current shape**

```bash
sed -n '1,50p' src/pages/api/registrations/guest-checkout.ts
```

The endpoint follows the same `createCheckoutForRegistration` → checkoutUrl pattern. Locate the lines that build/return `checkoutUrl` and the GA-cookie capture (likely none today).

- [ ] **Step 2: Apply the same changes as Task 8**

Mirror Task 8: import the same `parseGaClientId` + `readQueryOrCookie` helpers (extract them into `src/pages/api/payments/_analytics-cookies.ts` if you prefer DRY; otherwise duplicate — they're 10 lines each). Capture the cookies, build `extraMetadata`, return `{ clientSecret, sessionId, publishableKey }` instead of `{ checkoutUrl, sessionId }`.

(Plan keeps this terse because the change is mechanical and identical to Task 8. If extracting helpers, do so at the top of this task.)

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: zero errors across the project.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/registrations/guest-checkout.ts
# also any helper file you extracted
git commit -m "feat(api): guest-checkout returns clientSecret + captures _ga cookie"
```

---

## Task 10: API integration test for create-checkout return shape

**Files:**
- Create: `tests/api/payments-create-checkout.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/api/payments-create-checkout.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import {
  signInAsTestParent,
  createTestSeason,
  createTestRegistration,
  apiPost,
} from "./setup/test-helpers"; // see existing test files for actual helper exports

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:4321";

describe("POST /api/payments/create-checkout", () => {
  let session: string;
  let registrationId: string;

  beforeAll(async () => {
    session = await signInAsTestParent();
    const season = await createTestSeason({ priceCents: 25000 });
    registrationId = await createTestRegistration({
      seasonId: season.id,
      session,
      registrationType: "full",
    });
  });

  it("returns clientSecret + publishableKey (not checkoutUrl)", async () => {
    const res = await apiPost("/api/payments/create-checkout", {
      headers: { cookie: session },
      body: { registrationId },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("clientSecret");
    expect(data.clientSecret).toMatch(/^cs_(test|live)_.*_secret_/);
    expect(data).toHaveProperty("publishableKey");
    expect(data.publishableKey).toMatch(/^pk_(test|live)_/);
    expect(data.sessionId).toMatch(/^cs_(test|live)_/);
    expect(data).not.toHaveProperty("checkoutUrl");
  });

  it("forwards _ga cookie value as ga_client_id metadata on the Stripe session", async () => {
    const gaCookie = "_ga=GA1.1.1234567890.0987654321";
    const res = await apiPost("/api/payments/create-checkout", {
      headers: { cookie: `${session}; ${gaCookie}` },
      body: { registrationId },
    });
    expect(res.status).toBe(200);
    const data = await res.json();

    // Retrieve the session from Stripe and assert metadata
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const sessionObj = await stripe.checkout.sessions.retrieve(data.sessionId);
    expect(sessionObj.metadata?.ga_client_id).toBe("1234567890.0987654321");
  });
});
```

**IMPORTANT:** The exact helper imports (`signInAsTestParent`, `createTestSeason`, `createTestRegistration`, `apiPost`) may differ from existing patterns. Inspect `tests/api/registrations-self.test.ts` and `tests/api/setup/global-setup.ts` first and use the actual helpers in this codebase. Adapt as needed.

- [ ] **Step 2: Start dev server (separate terminal)**

```bash
npm run dev:local
```

- [ ] **Step 3: Run the test**

```bash
TEST_BASE_URL=http://localhost:4321 CRON_SECRET=devsecret npm run test:api -- payments-create-checkout
```

Expected: PASS — 2 tests.

- [ ] **Step 4: Commit**

```bash
git add tests/api/payments-create-checkout.test.ts
git commit -m "test(api): assert create-checkout returns clientSecret + forwards _ga cookie"
```

---

## Task 11: Build EmbeddedPayment component

**Files:**
- Create: `src/components/registration/embedded-payment.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/registration/embedded-payment.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
  trackAddPaymentInfo,
  trackPurchase,
  type SeasonItem,
  type CheckoutPaymentType,
} from "@/lib/analytics/datalayer";

interface EmbeddedPaymentProps {
  clientSecret: string;
  publishableKey: string;
  seasonItem: SeasonItem;
  /** Amount being charged right now (deposit, balance, or full) — cents */
  valueCents: number;
  paymentType: CheckoutPaymentType;
  coupon?: string;
  /** Where Stripe sends the user back after SCA / 3DS (absolute URL) */
  returnUrl: string;
  /** Called after a synchronous (non-redirect) successful confirm */
  onSuccess: (paymentIntentId: string) => void;
  /** Called when user clicks Back to abandon this in-flight session */
  onCancel: () => void;
}

// Cache one Stripe.js promise per publishableKey for the page lifetime.
const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();
function getStripePromise(publishableKey: string): Promise<StripeJs | null> {
  let p = stripePromiseCache.get(publishableKey);
  if (!p) {
    p = loadStripe(publishableKey);
    stripePromiseCache.set(publishableKey, p);
  }
  return p;
}

export function EmbeddedPayment(props: EmbeddedPaymentProps) {
  const stripePromise = useMemo(() => getStripePromise(props.publishableKey), [props.publishableKey]);

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: props.clientSecret,
        appearance: {
          theme: "flat",
          variables: {
            colorPrimary: "#1a1a1a",
            colorBackground: "#fdfaf2",
            colorText: "#1a1a1a",
            colorDanger: "#b91c1c",
            fontFamily: "system-ui, -apple-system, sans-serif",
            borderRadius: "8px",
          },
        },
        loader: "auto",
      }}
    >
      <PaymentForm {...props} />
    </Elements>
  );
}

function PaymentForm({
  seasonItem,
  valueCents,
  paymentType,
  coupon,
  returnUrl,
  onSuccess,
  onCancel,
}: Omit<EmbeddedPaymentProps, "clientSecret" | "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const [isReady, setIsReady] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFiredAddPaymentInfo, setHasFiredAddPaymentInfo] = useState(false);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setIsSubmitting(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Card details are invalid");
      setIsSubmitting(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      setIsSubmitting(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === "succeeded") {
      trackPurchase(paymentIntent.id, seasonItem, valueCents, paymentType, coupon);
      onSuccess(paymentIntent.id);
      return;
    }

    // status: "processing" | "requires_action" — Stripe will have redirected
    // for redirect-required flows because of the return_url; for processing,
    // hand off to the return page so it can poll status.
    if (paymentIntent) {
      window.location.href = `${returnUrl}?payment_intent=${paymentIntent.id}`;
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement
        options={{ layout: "accordion" }}
        onReady={() => setIsReady(true)}
        onChange={(e) => {
          setIsComplete(e.complete);
          if (e.complete && !hasFiredAddPaymentInfo) {
            const methodType = (e.value?.type as string) ?? "card";
            trackAddPaymentInfo(seasonItem, valueCents, methodType, coupon);
            setHasFiredAddPaymentInfo(true);
          }
        }}
      />

      {error && <ErrorBanner message={error} />}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Back
        </Button>
        <Button
          onClick={handlePay}
          disabled={!stripe || !isReady || !isComplete || isSubmitting}
          className="bg-primary hover:bg-primary/90"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing…
            </>
          ) : (
            `Pay $${(valueCents / 100).toFixed(2)}`
          )}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: zero errors. (If `ErrorBanner` import path differs, fix per CLAUDE.md UI feedback section: it lives in `@/components/ui/error-banner`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/registration/embedded-payment.tsx
git commit -m "feat(registration): EmbeddedPayment component (Stripe PaymentElement + dataLayer)"
```

---

## Task 12: Update PaymentStep for 4a/4b sub-states

**Files:**
- Modify: `src/components/registration/payment-step.tsx`

- [ ] **Step 1: Add embedded-payment props + render block**

Update `src/components/registration/payment-step.tsx`. Add to `PaymentStepProps`:

```ts
import { EmbeddedPayment } from "./embedded-payment"
import type { SeasonItem, CheckoutPaymentType } from "@/lib/analytics/datalayer"

export interface PaymentStepProps {
  // ...existing props...

  // Embedded-payment props — when clientSecret is set, renders the
  // payment form below the order summary. When null, only the order
  // configuration UI shows (4a state).
  clientSecret: string | null
  publishableKey: string | null
  seasonItem: SeasonItem | null
  paymentValueCents: number
  checkoutPaymentType: CheckoutPaymentType
  paymentReturnUrl: string
  onPaymentSuccess: (paymentIntentId: string) => void
  onPaymentCancel: () => void
}
```

At the bottom of the returned JSX (after the existing `<OrderSummary />`), add:

```tsx
      {/* Step 4b: Embedded payment (rendered once Continue-to-Payment fires) */}
      {clientSecret && publishableKey && seasonItem && (
        <div className="mt-6 pt-6 border-t border-border">
          <h3 className="text-lg font-semibold text-ink mb-4">Payment Details</h3>
          <EmbeddedPayment
            clientSecret={clientSecret}
            publishableKey={publishableKey}
            seasonItem={seasonItem}
            valueCents={paymentValueCents}
            paymentType={checkoutPaymentType}
            coupon={appliedDiscount?.code}
            returnUrl={paymentReturnUrl}
            onSuccess={onPaymentSuccess}
            onCancel={onPaymentCancel}
          />
        </div>
      )}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: errors at `RegistrationWizard` calling site (Task 13). All other code clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/registration/payment-step.tsx
git commit -m "feat(registration): PaymentStep accepts embedded-payment props"
```

---

## Task 13: Wire EmbeddedPayment into RegistrationWizard

**Files:**
- Modify: `src/components/registration/registration-wizard.tsx`

- [ ] **Step 1: Add new state + helpers**

Inside the `RegistrationWizard` function body (after the existing state hooks ~line 187), add:

```tsx
  // ── Embedded payment state ───────────────────────────────────────────────
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null)
  const [paymentPublishableKey, setPaymentPublishableKey] = useState<string | null>(null)
  const [paymentValueCents, setPaymentValueCents] = useState(0)
  const [paymentTypeForTracking, setPaymentTypeForTracking] = useState<"deposit" | "full">("full")
```

- [ ] **Step 2: Add view_item fire on step 4 mount**

Add a `useEffect`:

```tsx
  // Fire view_item once when entering step 4 (the payment step)
  useEffect(() => {
    if (currentStep === 4 && season) {
      import("@/lib/analytics/datalayer").then(({ trackViewItem }) => {
        trackViewItem({
          id: season.id,
          name: `${season.program.name} - ${season.name}`,
          category: season.sport.name,
          category2: season.location.name,
          priceCents: season.priceCents,
        })
      })
    }
  }, [currentStep, season])
```

(Dynamic import keeps GA tracking out of the initial bundle.)

- [ ] **Step 3: Replace `window.location.href = checkoutUrl` with embedded handoff**

In `handleSubmitRegistration` (around line 555-560), replace the redirect block:

```tsx
        const checkoutData = await checkoutResponse.json()

        // OLD (delete):
        // if (checkoutData.checkoutUrl) {
        //   window.location.href = checkoutData.checkoutUrl
        //   return
        // }

        // NEW: hand off to embedded form rendered inside step 4
        if (checkoutData.clientSecret) {
          const valueCents =
            paymentOption === "deposit" && season!.depositCents
              ? season!.depositCents
              : season!.priceCents
          const finalValueCents = appliedDiscount
            ? valueCents - appliedDiscount.discountAmountCents
            : valueCents

          setPaymentValueCents(finalValueCents)
          setPaymentTypeForTracking(paymentOption === "deposit" ? "deposit" : "full")
          setPaymentPublishableKey(checkoutData.publishableKey)
          setPaymentClientSecret(checkoutData.clientSecret)

          // Fire begin_checkout
          const { trackBeginCheckout } = await import("@/lib/analytics/datalayer")
          trackBeginCheckout(
            {
              id: season!.id,
              name: `${season!.program.name} - ${season!.name}`,
              category: season!.sport.name,
              category2: season!.location.name,
              priceCents: season!.priceCents,
            },
            finalValueCents,
            appliedDiscount?.code,
          )
          return
        }
```

Apply the **same change** to `handleSubmitGuestCheckout` (around line 465-468) and `handleResumePayment` (around line 396-399). Each currently has its own `window.location.href = checkoutUrl` — replace each with the embedded handoff.

- [ ] **Step 4: Add onSuccess + onCancel handlers**

Add helper functions inside the wizard:

```tsx
  const handlePaymentSuccess = (_paymentIntentId: string) => {
    setRegistrationComplete(true)
    setPaymentClientSecret(null)
    if (!hasLinkedTelegram) {
      setShowTelegramStep(true)
    } else {
      setCurrentStep(5)
    }
  }

  const handlePaymentCancel = () => {
    // Discard the in-flight Stripe session — the next Continue-to-Payment
    // creates a fresh one. Orphaned sessions self-expire on Stripe's side.
    setPaymentClientSecret(null)
    setPaymentPublishableKey(null)
    setPaymentValueCents(0)
  }
```

- [ ] **Step 5: Pass new props into PaymentStep**

In the JSX block that renders `<PaymentStep ... />` (around line 944-969), add the new props:

```tsx
          <PaymentStep
            // ...existing props...
            clientSecret={paymentClientSecret}
            publishableKey={paymentPublishableKey}
            seasonItem={
              season
                ? {
                    id: season.id,
                    name: `${season.program.name} - ${season.name}`,
                    category: season.sport.name,
                    category2: season.location.name,
                    priceCents: season.priceCents,
                  }
                : null
            }
            paymentValueCents={paymentValueCents}
            checkoutPaymentType={paymentTypeForTracking}
            paymentReturnUrl={`${window.location.origin}/payment/return`}
            onPaymentSuccess={handlePaymentSuccess}
            onPaymentCancel={handlePaymentCancel}
          />
```

- [ ] **Step 6: Hide the bottom "Complete Registration" button when in 4b state**

In the navigation block (around line 1000-1035), wrap the bottom navigation:

```tsx
      {currentStep < 5 && !showTelegramStep && !paymentClientSecret && (
        // ...existing nav buttons...
      )}
```

When `paymentClientSecret` is set, the embedded form's own Pay/Back buttons take over.

- [ ] **Step 7: Type check + manual smoke**

```bash
npx tsc --noEmit
```

Expected: zero errors.

```bash
npm run dev:local
# In a browser, register for a test season as the test parent.
# Verify: step 4 shows order summary; "Continue to Payment" reveals
# the Stripe form below; entering 4242 4242 4242 4242 and Pay
# transitions to confirmation/Telegram step.
# Verify in browser DevTools: window.dataLayer contains view_item +
# begin_checkout + add_payment_info + purchase events with correct
# ecommerce shape.
```

- [ ] **Step 8: Commit**

```bash
git add src/components/registration/registration-wizard.tsx
git commit -m "feat(registration): wire embedded payment + dataLayer events into wizard"
```

---

## Task 14: Build /payment/return.astro page

**Files:**
- Create: `src/pages/payment/return.astro`

- [ ] **Step 1: Implement the return page**

Create `src/pages/payment/return.astro`:

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
import { stripe } from "@/lib/stripe/client";
import { getDb } from "@/lib/db";
import { registrations, seasons, programs, sports, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// SSR — never prerender (depends on query params + Stripe lookup)

const paymentIntentId = Astro.url.searchParams.get("payment_intent");
const redirectStatus = Astro.url.searchParams.get("redirect_status");

let status: "succeeded" | "processing" | "failed" | "missing" = "missing";
let amountCents = 0;
let registrationId: string | null = null;
let seasonItem: {
  id: string;
  name: string;
  category: string;
  category2: string;
  priceCents: number;
} | null = null;
let paymentTypeForTracking: "deposit" | "balance" | "full" = "full";

if (paymentIntentId && stripe) {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    amountCents = pi.amount;
    registrationId = (pi.metadata?.registrationId as string) ?? null;

    if (pi.status === "succeeded") status = "succeeded";
    else if (pi.status === "processing") status = "processing";
    else if (pi.status === "requires_payment_method") status = "failed";
    else status = "failed";

    if (registrationId) {
      const db = getDb();
      const [row] = await db
        .select({
          regAmountPaidBeforeThis: registrations.amountPaidCents,
          regType: registrations.registrationType,
          seasonId: seasons.id,
          seasonName: seasons.name,
          programName: programs.name,
          sportName: sports.name,
          locationName: locations.name,
          seasonPriceCents: seasons.priceCents,
        })
        .from(registrations)
        .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(sports, eq(programs.sportId, sports.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(eq(registrations.id, registrationId))
        .limit(1);

      if (row) {
        seasonItem = {
          id: row.seasonId,
          name: `${row.programName} - ${row.seasonName}`,
          category: row.sportName,
          category2: row.locationName,
          priceCents: row.seasonPriceCents,
        };
        // Derive payment_type from registration state at time of THIS payment.
        // The webhook may already have updated amountPaidCents; we treat
        // amountPaidCents > pi.amount as "this is a balance" since the prior
        // deposit is already recorded.
        const paidBefore = (row.regAmountPaidBeforeThis ?? 0) - pi.amount;
        if (paidBefore > 0) paymentTypeForTracking = "balance";
        else if (row.regType === "deposit") paymentTypeForTracking = "deposit";
        else paymentTypeForTracking = "full";
      }
    }
  } catch (err) {
    console.error("[/payment/return] retrieve failed:", err);
    status = "failed";
  }
}

// `redirect_status` from Stripe is informational; we trust the PI status above.
const _ = redirectStatus;

const dashboardHref = registrationId
  ? `/dashboard?registered=${registrationId}`
  : "/dashboard";
---

<BaseLayout title="Payment status">
  <main class="mx-auto max-w-xl px-6 py-12">
    {status === "succeeded" && (
      <div class="rounded-xl border border-green-300 bg-green-50 px-6 py-8 text-center">
        <h1 class="text-2xl font-semibold text-ink mb-2">Payment confirmed</h1>
        <p class="text-ink-muted mb-6">
          We've received ${(amountCents / 100).toFixed(2)} for your registration.
        </p>
        <a
          href={dashboardHref}
          class="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Continue to dashboard
        </a>
      </div>
    )}

    {status === "processing" && (
      <div class="rounded-xl border border-amber-300 bg-amber-50 px-6 py-8 text-center">
        <h1 class="text-2xl font-semibold text-ink mb-2">Processing your payment</h1>
        <p class="text-ink-muted mb-6">
          Your bank is confirming the charge. We'll email you when it's complete.
        </p>
        <a
          href={dashboardHref}
          class="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Continue to dashboard
        </a>
      </div>
    )}

    {(status === "failed" || status === "missing") && (
      <div class="rounded-xl border border-red-300 bg-red-50 px-6 py-8 text-center">
        <h1 class="text-2xl font-semibold text-ink mb-2">Payment didn't complete</h1>
        <p class="text-ink-muted mb-6">
          Your registration is still saved. Try again from your dashboard.
        </p>
        <a
          href={dashboardHref}
          class="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Back to dashboard
        </a>
      </div>
    )}
  </main>

  {/* Fire client-side purchase event ONLY when the SCA-redirect path lands here.
      The non-redirect synchronous-success path fires in EmbeddedPayment directly. */}
  {status === "succeeded" && seasonItem && paymentIntentId && (
    <script
      is:inline
      define:vars={{
        transactionId: paymentIntentId,
        seasonItem,
        valueCents: amountCents,
        paymentType: paymentTypeForTracking,
      }}
    >
      try {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ ecommerce: null });
        window.dataLayer.push({
          event: "purchase",
          ecommerce: {
            transaction_id: transactionId,
            currency: "USD",
            value: valueCents / 100,
            payment_type: paymentType,
            items: [
              {
                item_id: seasonItem.id,
                item_name: seasonItem.name,
                item_category: seasonItem.category,
                item_category2: seasonItem.category2,
                price: seasonItem.priceCents / 100,
                quantity: 1,
              },
            ],
          },
        });
      } catch (e) {
        // soft-fail
      }
    </script>
  )}
</BaseLayout>
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: zero errors. (If `sports` or `locations` table imports differ, follow what `handle-checkout-complete.ts` already imports.)

- [ ] **Step 3: Manual verification with 3DS test card**

```bash
# In dev: register, click Continue to Payment, enter Stripe 3DS test card:
#   4000 0025 0000 3155
# Stripe will challenge → complete the challenge → browser returns to
# /payment/return → page should show "Payment confirmed" and the
# dataLayer should contain the purchase event.
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/payment/return.astro
git commit -m "feat(payment): /payment/return handles SCA redirects + fires purchase event"
```

---

## Task 15: Fire server-side GA4 purchase from webhook

**Files:**
- Modify: `src/lib/stripe/handle-checkout-complete.ts`

- [ ] **Step 1: Import the GA4 sender**

At the top of `src/lib/stripe/handle-checkout-complete.ts` (after existing imports):

```ts
import { sendPurchaseEvent } from "@/lib/analytics/ga4-measurement-protocol";
```

- [ ] **Step 2: Add the fire after the email block**

Inside `handleCheckoutComplete`, after the `try { ... } catch` block that handles emails (after line 186 in the original — right before `return { status: "processed", ... }`), add:

```ts
  // Server-side GA4 Measurement Protocol purchase — backup attribution
  // for ad-blocked / ITP-blocked client-side fires. Same transaction_id
  // as the client-side dataLayer push so GA4 dedupes.
  const gaClientId = session.metadata?.ga_client_id;
  if (gaClientId) {
    try {
      // Reuse the [row] JOIN result from the email block above. If the
      // JOIN failed (no row), we don't have item context — skip.
      const [itemRow] = await db
        .select({
          seasonId: seasons.id,
          seasonName: seasons.name,
          programName: programs.name,
          sportName: sports.name,
          seasonPriceCents: seasons.priceCents,
        })
        .from(registrations)
        .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(sports, eq(programs.sportId, sports.id))
        .where(eq(registrations.id, registrationId));

      if (itemRow) {
        // Derive payment_type:
        //   - prior amountPaidCents > 0  → balance (this is the second+ payment)
        //   - else if registrationType === 'deposit' → deposit
        //   - else → full
        let paymentTypeForTracking: "deposit" | "balance" | "full";
        if (registration.amountPaidCents > 0) {
          paymentTypeForTracking = "balance";
        } else if (registration.registrationType === "deposit") {
          paymentTypeForTracking = "deposit";
        } else {
          paymentTypeForTracking = "full";
        }

        sendPurchaseEvent({
          clientId: gaClientId,
          transactionId: session.payment_intent as string,
          valueCents: amountPaid,
          currency: "USD",
          paymentType: paymentTypeForTracking,
          coupon: session.metadata?.discount_code,
          items: [
            {
              id: itemRow.seasonId,
              name: `${itemRow.programName} - ${itemRow.seasonName}`,
              category: itemRow.sportName,
              priceCents: itemRow.seasonPriceCents,
            },
          ],
        }).catch((err) => console.error("[stripe webhook] GA4 MP send failed:", err));
      }
    } catch (err) {
      console.error("[stripe webhook] GA4 item-context JOIN failed:", err);
    }
  }
```

Add `sports` to the existing `import { ... } from "@/lib/db/schema"` line if not already there.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Manual verification**

With dev server + `stripe listen` running (from pre-flight), complete a test purchase. Verify in dev console:

```
[ga4-mp] non-2xx response: ...   ← if your GA4 secret is wrong
```

Or no error logs (success). Then check GA4 DebugView → should see the `purchase` event with the transaction_id matching the Stripe PaymentIntent.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stripe/handle-checkout-complete.ts
git commit -m "feat(webhook): fire GA4 Measurement Protocol purchase event after registration paid"
```

---

## Task 16: Update Playwright E2E for embedded flow

**Files:**
- Modify: existing `tests/e2e/registration-payment.spec.ts` (or whichever spec drives the registration→payment path)

- [ ] **Step 1: Identify the spec**

```bash
ls tests/e2e/ | xargs grep -l "checkout\|payment\|stripe" 2>/dev/null
```

Identify the spec(s) that previously asserted a redirect to `checkout.stripe.com` or similar.

- [ ] **Step 2: Replace redirect assertion with embedded-form drive**

For each affected spec, replace the redirect-assertion block with:

```ts
// 1. Click Continue to Payment to reveal the embedded form
await page.getByRole("button", { name: /continue to payment/i }).click();

// 2. Wait for the Stripe Elements iframe to mount
const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
await stripeFrame.locator("input").first().waitFor({ state: "visible", timeout: 15000 });

// 3. Fill the test card
await stripeFrame.locator('input[name="number"]').fill("4242424242424242");
await stripeFrame.locator('input[name="expiry"]').fill("12 / 34");
await stripeFrame.locator('input[name="cvc"]').fill("123");
const zipInput = stripeFrame.locator('input[name="postalCode"]');
if (await zipInput.count() > 0) {
  await zipInput.fill("43017");
}

// 4. Pay
await page.getByRole("button", { name: /pay \$/i }).click();

// 5. Assert we transition to confirmation (or Telegram step) — NOT a redirect
await expect(page.getByText(/registration complete|connect telegram/i)).toBeVisible({
  timeout: 30000,
});
```

The exact Stripe iframe input selectors may vary by Stripe Elements version; if the above doesn't work, inspect the live page in dev and adapt. The Stripe-recommended selectors live in their [Playwright testing guide](https://docs.stripe.com/testing#test-cards).

- [ ] **Step 3: Run the spec**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- registration-payment
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/
git commit -m "test(e2e): drive embedded Stripe form instead of asserting redirect"
```

---

## Task 17: Pre-push verification + push

- [ ] **Step 1: Run /ship checklist**

```bash
# Type check
npx tsc --noEmit
# Build
npm run build
# Unit + API tests (dev server running)
npm run test:unit
TEST_BASE_URL=http://localhost:4321 CRON_SECRET=devsecret npm run test:api
# E2E
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test
```

All must pass.

- [ ] **Step 2: Verify the spec's verification list**

From spec §10:
- [x] API test: `payments-create-checkout.test.ts` asserts `clientSecret` returned
- [x] API test: `_ga` cookie round-trips through session metadata
- [x] Unit test: `datalayer.test.ts` asserts correct shape + `ecommerce: null` reset
- [x] E2E: drives embedded form
- [x] Manual 3DS test (`4000002500003155`)
- [x] Manual cancel mid-flow → orphaned session, retry creates new session

- [ ] **Step 3: Push**

```bash
git push -u origin <your-feature-branch>
```

Wait for CI green on origin before declaring done. If CI fails for env-var reasons (e.g. `GA4_*` not set in Netlify), confirm those are added to Netlify env vars; the soft-required policy means CI still builds, but server-side fires won't run until the keys are set.

- [ ] **Step 4: Update auto-memory**

After CI green, save a memory note that Phase 1 of embedded checkout shipped, link to the merge commit, and note that Phase 2 (balance pay surfaces + reminders) is the next plan to write.

---

## Self-Review

**1. Spec coverage** — Phase 1 sections:
- §4.1 wizard 4a/4b sub-states → Tasks 12, 13
- §4.2 server-side checkout session changes → Tasks 5, 6, 7, 8, 9
- §4.3 datalayer + EmbeddedPayment + return.astro → Tasks 3, 11, 14
- §4.4 GA4 MP server module → Task 4
- §4.5 webhook fire → Task 15
- §4.6 env vars → Task 2
- §4.7 GTM container config → operator task, called out in plan but not implemented in code (correct — it's a GTM-UI task)
- §7 edge cases → all addressed inline (cancel mid-flow Task 13 step 4; 3DS Task 14 + Task 11 confirmParams; webhook ground truth Task 15)
- §8 file list → matches Phase 1 modify (9) + create (4) exactly
- §10 verification → Task 17

**2. Placeholder scan** — searched for "TBD", "TODO", "implement later":
- One acceptable hedge in Task 16 ("If the above doesn't work, inspect…") — this is reasonable Stripe-Elements selector volatility, not a placeholder
- No bare "implement later" / "TODO" / "TBD"
- Task 9 abbreviates as "mirror Task 8" but explicitly enumerates the changes — acceptable since Task 8 is the canonical pattern and Task 9 is a mechanical clone

**3. Type consistency** — function/property names checked:
- `trackPurchase`, `trackBeginCheckout`, `trackAddPaymentInfo`, `trackViewItem` consistent across Tasks 3, 13, 14
- `clientSecret`, `publishableKey`, `sessionId` consistent in API responses (Tasks 5-9) and component props (Tasks 11-13)
- `SeasonItem` interface consistent: `id`, `name`, `category`, `category2`, `priceCents` (Tasks 3, 11, 13, 14)
- `CheckoutPaymentType = 'deposit' | 'balance' | 'full'` consistent (Tasks 3, 4, 11, 14, 15)
- GA4 MP item shape uses `id`/`name`/`category`/`priceCents` (no `category2`) — distinct from `SeasonItem` because GA4 MP is a separate boundary; intentional, documented in §4.4
