# Merch Shop (Printful) — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase 1 catalog into a working store — cart → address → live Printful shipping → hosted Stripe Checkout (with tax) → webhook auto-creates the Printful order → confirmation email → thank-you page.

**Architecture:** New org-scoped `merch_orders` / `merch_order_items` tables. A client-side cart posts to a `quote` endpoint (Printful live rate) then a `checkout` endpoint (hosted Stripe Checkout Session, `automatic_tax` on, goods tax code). The existing Stripe webhook pipeline gains a `merch_order` branch whose fulfillment step is a **dispatcher** keyed on `fulfillment_type` — only `printful_pod` is implemented; the other enum values exist for Phase 3.

**Tech Stack:** Astro 5 SSR + React 19 islands, Drizzle/Postgres, Stripe (hosted Checkout Sessions), Printful REST v1, Zod, Vitest, Resend.

## Global Constraints

- **Printful source only.** Every order line is `fulfillment_type = 'printful_pod'` in Phase 2. The webhook fulfillment dispatcher switches on `fulfillment_type`; non-`printful_pod` branches throw `UnsupportedFulfillmentError` (unreachable now — guards Phase 3). Do NOT build self-shipped/pickup/digital or an admin product UI here.
- **Guest-friendly + server-authoritative pricing.** Quote and checkout endpoints allow guests (`upsertGuestUser`), are IP rate-limited (mirror `registration-guest`), Zod-validate input, and **re-price every line from the DB** — never trust client-sent prices.
- **`automatic_tax` is always on**, and every merch line item carries a **tangible-goods tax code** (`txcd_99999999`, "General - Tangible Goods") so merch isn't classified as the account-default service. Requires Stripe Tax + the Ohio registration to be live (owner has completed this).
- **Money-safe fulfillment.** If Printful `createOrder` fails after payment, the order stays `paid` (never lost), the failure is logged with the order id, and it is left for retry. Payment is already captured — never drop or mark it failed silently.
- **Order financials live in `merch_orders`**, not the registration `payments` table.
- **Migrations via `npm run db:generate`** (commit the SQL); never `db:push` to a remote. Apply to staging with `./scripts/with-bws.sh npm run db:migrate`. Enums define **all four** `fulfillment_type` values now to avoid a Phase-3 enum-ALTER.
- **Secrets read `process.env` first** (`process.env.X ?? import.meta.env?.X`).
- **Reuse:** hosted Checkout pattern (`src/lib/dropin/create-checkout.ts`), webhook `dispatch()` + `stripe_events` idempotency (`src/lib/stripe/handle-stripe-event.ts`), `upsertGuestUser` (`@/lib/registrations/upsert-guest-user`), `rateLimit`/`rateLimitedResponse` (`@/lib/auth/rate-limit`), `sendEmail` (`@/lib/email` — already respects the messaging mock/gate), Phase-1 catalog helpers, BaseLayout, `useHydrationBeacon`.
- **Money is integer cents.** `.astro` uses `class`; `.tsx` islands use `className` + `useHydrationBeacon()`.

---

## File Structure

**Create**
- `src/lib/db/schema/merch-orders.ts` — `merch_orders` + `merch_order_items` + enums + types.
- `src/lib/printful/order-mappers.ts` — pure: shipping-request, cheapest-rate pick, Printful order payload.
- `src/lib/merch/cart.ts` — pure cart types + total math (shared by island + server validation).
- `src/lib/merch/quote.ts` — pure quote assembly.
- `src/lib/merch/checkout-line-items.ts` — pure Stripe line-item builder (with tax code).
- `src/lib/merch/fulfillment.ts` — the fulfillment dispatcher + `printful_pod` handler + `UnsupportedFulfillmentError`.
- `src/lib/merch/order-confirmation-email.ts` — builds + sends the confirmation email.
- `src/pages/api/merch/quote.ts`
- `src/pages/api/merch/checkout.ts`
- `src/components/shop/cart-store.ts` — localStorage cart hook.
- `src/components/shop/cart-drawer.tsx` — cart island (badge + drawer).
- `src/pages/shop/checkout.astro` + `src/components/shop/checkout-form.tsx` — address step island.
- `src/pages/shop/order.astro` — thank-you page (by `session_id`).
- Tests under `tests/unit/merch/`, `tests/unit/printful/`, `tests/api/merch/`.

**Modify**
- `src/lib/db/schema/index.ts` — export `merch-orders`.
- `src/lib/printful/client.ts` — add `pfPost`, `calculateShipping`, `createOrder`, `getOrder`.
- `src/lib/printful/types.ts` — add shipping-rate + order response types.
- `src/components/shop/product-detail.tsx` — replace the "ordering opens soon" note with real add-to-cart.
- `src/lib/stripe/handle-stripe-event.ts` — add the `merch_order` branch to `dispatch()`.

---

## Task 1: Orders schema + migration

**Files:**
- Create: `src/lib/db/schema/merch-orders.ts`
- Modify: `src/lib/db/schema/index.ts`
- Generated: `src/lib/db/migrations/NNNN_*.sql`

**Interfaces:**
- Produces: `merchOrders`, `merchOrderItems`, enums `merchFulfillmentTypeEnum`, `merchOrderStatusEnum`; types `MerchOrder`, `NewMerchOrder`, `MerchOrderItem`, `NewMerchOrderItem`; interface `MerchShippingAddress`.

- [ ] **Step 1: Create the schema file**

`src/lib/db/schema/merch-orders.ts`:

```ts
import {
  pgTable, uuid, varchar, integer, jsonb, timestamp, pgEnum, index, unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { merchVariants } from "./merch";

export const merchFulfillmentTypeEnum = pgEnum("merch_fulfillment_type", [
  "printful_pod",
  "self_shipped",
  "pickup",
  "digital",
]);

export const merchOrderStatusEnum = pgEnum("merch_order_status", [
  "pending",
  "paid",
  "submitted",
  "shipped",
  "cancelled",
  "failed",
]);

export interface MerchShippingAddress {
  name: string;
  address1: string;
  address2?: string | null;
  city: string;
  state: string; // 2-letter for US
  zip: string;
  country: string; // ISO-2, e.g. "US"
}

export const merchOrders = pgTable(
  "merch_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    email: varchar("email", { length: 255 }).notNull(),
    status: merchOrderStatusEnum("status").notNull().default("pending"),
    stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    printfulOrderId: varchar("printful_order_id", { length: 64 }),
    shippingAddress: jsonb("shipping_address").$type<MerchShippingAddress>().notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("usd"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqSession: unique("uq_merch_orders_session").on(t.stripeCheckoutSessionId),
    uniqPi: unique("uq_merch_orders_pi").on(t.stripePaymentIntentId),
    orgStatusIdx: index("idx_merch_orders_org_status").on(t.organizationId, t.status),
  }),
);

export const merchOrderItems = pgTable(
  "merch_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => merchOrders.id, { onDelete: "cascade" }),
    merchVariantId: uuid("merch_variant_id")
      .notNull()
      .references(() => merchVariants.id, { onDelete: "restrict" }),
    fulfillmentType: merchFulfillmentTypeEnum("fulfillment_type")
      .notNull()
      .default("printful_pod"),
    // snapshot — survives later catalog edits
    productName: varchar("product_name", { length: 255 }).notNull(),
    variantName: varchar("variant_name", { length: 255 }).notNull(),
    size: varchar("size", { length: 40 }),
    color: varchar("color", { length: 60 }),
    printfulSyncVariantId: varchar("printful_sync_variant_id", { length: 64 }).notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index("idx_merch_order_items_order").on(t.orderId),
  }),
);

export const merchOrdersRelations = relations(merchOrders, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [merchOrders.organizationId],
    references: [organizations.id],
  }),
  items: many(merchOrderItems),
}));

export const merchOrderItemsRelations = relations(merchOrderItems, ({ one }) => ({
  order: one(merchOrders, {
    fields: [merchOrderItems.orderId],
    references: [merchOrders.id],
  }),
  variant: one(merchVariants, {
    fields: [merchOrderItems.merchVariantId],
    references: [merchVariants.id],
  }),
}));

export type MerchOrder = typeof merchOrders.$inferSelect;
export type NewMerchOrder = typeof merchOrders.$inferInsert;
export type MerchOrderItem = typeof merchOrderItems.$inferSelect;
export type NewMerchOrderItem = typeof merchOrderItems.$inferInsert;
```

- [ ] **Step 2: Export from the barrel**

In `src/lib/db/schema/index.ts`, next to the Phase-1 merch export:

```ts
// Merch orders (merch shop Phase 2)
export * from "./merch-orders";
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/NNNN_*.sql` creating the two enums + two tables. Review it — only additive (no drops). Confirm both enums list all four / six values respectively.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit` → zero errors.

- [ ] **Step 5: Apply to staging**

Run: `./scripts/with-bws.sh npm run db:migrate`
Expected: applies the new migration to staging (prior ones skipped). If it errors or applies unrelated migrations, STOP and report.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema/merch-orders.ts src/lib/db/schema/index.ts src/lib/db/migrations
git commit -m "feat(merch): merch_orders + merch_order_items schema"
```

---

## Task 2: Printful client — shipping + order methods

**Files:**
- Modify: `src/lib/printful/types.ts`, `src/lib/printful/client.ts`
- Create: `src/lib/printful/order-mappers.ts`
- Test: `tests/unit/printful/order-mappers.test.ts`

**Interfaces:**
- Consumes: existing `pfGet`, `PrintfulApiError`, `retailPriceToCents` (`@/lib/merch/map-sync-product`).
- Produces:
  - types `PrintfulShippingRate`, `PrintfulOrderResult`, `PrintfulRecipient`
  - client: `calculateShipping(recipient, items): Promise<PrintfulShippingRate[]>`, `createOrder(payload, opts): Promise<PrintfulOrderResult>`, `getOrder(id): Promise<PrintfulOrderResult>`
  - mappers: `toPrintfulRecipient(addr): PrintfulRecipient`, `pickCheapestRate(rates): PrintfulShippingRate | null`, `shippingRateToCents(rate: string): number`, `buildPrintfulOrderItems(items): {sync_variant_id, quantity}[]`

- [ ] **Step 1: Add response types**

Append to `src/lib/printful/types.ts`:

```ts
export interface PrintfulRecipient {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state_code: string;
  country_code: string;
  zip: string;
}

export interface PrintfulShippingRate {
  id: string;          // e.g. "STANDARD"
  name: string;
  rate: string;        // "5.99"
  currency: string;
  minDeliveryDays?: number;
  maxDeliveryDays?: number;
}

export interface PrintfulOrderResult {
  id: number;
  status: string;
  external_id?: string;
}
```

- [ ] **Step 2: Write the failing mapper test**

`tests/unit/printful/order-mappers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  toPrintfulRecipient,
  pickCheapestRate,
  shippingRateToCents,
  buildPrintfulOrderItems,
} from "@/lib/printful/order-mappers";

describe("toPrintfulRecipient", () => {
  it("maps a merch shipping address to Printful's recipient shape", () => {
    expect(
      toPrintfulRecipient({
        name: "Sam Coach", address1: "1 Main St", address2: "Apt 2",
        city: "Powell", state: "OH", zip: "43065", country: "US",
      }),
    ).toEqual({
      name: "Sam Coach", address1: "1 Main St", address2: "Apt 2",
      city: "Powell", state_code: "OH", country_code: "US", zip: "43065",
    });
  });
});

describe("shippingRateToCents", () => {
  it("converts a decimal rate string to cents", () => {
    expect(shippingRateToCents("5.99")).toBe(599);
  });
});

describe("pickCheapestRate", () => {
  it("returns the lowest-rate option", () => {
    const rates = [
      { id: "EXPRESS", name: "Express", rate: "15.00", currency: "USD" },
      { id: "STANDARD", name: "Standard", rate: "5.99", currency: "USD" },
    ];
    expect(pickCheapestRate(rates)?.id).toBe("STANDARD");
  });
  it("returns null for no rates", () => {
    expect(pickCheapestRate([])).toBeNull();
  });
});

describe("buildPrintfulOrderItems", () => {
  it("maps order items to sync_variant_id + quantity", () => {
    expect(
      buildPrintfulOrderItems([
        { printfulSyncVariantId: "501", quantity: 2 },
        { printfulSyncVariantId: "502", quantity: 1 },
      ]),
    ).toEqual([
      { sync_variant_id: 501, quantity: 2 },
      { sync_variant_id: 502, quantity: 1 },
    ]);
  });
});
```

- [ ] **Step 2b: Run it — FAIL**

Run: `npx vitest run tests/unit/printful/order-mappers.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement the mappers**

`src/lib/printful/order-mappers.ts`:

```ts
import type { MerchShippingAddress } from "@/lib/db/schema";
import type { PrintfulRecipient, PrintfulShippingRate } from "./types";
import { retailPriceToCents } from "@/lib/merch/map-sync-product";

export function toPrintfulRecipient(addr: MerchShippingAddress): PrintfulRecipient {
  return {
    name: addr.name,
    address1: addr.address1,
    ...(addr.address2 ? { address2: addr.address2 } : {}),
    city: addr.city,
    state_code: addr.state,
    country_code: addr.country,
    zip: addr.zip,
  };
}

export function shippingRateToCents(rate: string): number {
  return retailPriceToCents(rate); // same decimal-string → cents contract
}

export function pickCheapestRate(
  rates: PrintfulShippingRate[],
): PrintfulShippingRate | null {
  if (rates.length === 0) return null;
  return rates.reduce((cheapest, r) =>
    shippingRateToCents(r.rate) < shippingRateToCents(cheapest.rate) ? r : cheapest,
  );
}

export function buildPrintfulOrderItems(
  items: { printfulSyncVariantId: string; quantity: number }[],
): { sync_variant_id: number; quantity: number }[] {
  return items.map((i) => ({
    sync_variant_id: Number(i.printfulSyncVariantId),
    quantity: i.quantity,
  }));
}
```

- [ ] **Step 3b: Run it — PASS**

Run: `npx vitest run tests/unit/printful/order-mappers.test.ts` → PASS.

- [ ] **Step 4: Add the client methods**

Add a `pfPost` and the three methods to `src/lib/printful/client.ts` (reuse `getApiKey`/`getStoreId`/`PrintfulApiError`):

```ts
import type {
  PrintfulRecipient, PrintfulShippingRate, PrintfulOrderResult,
} from "./types";

async function pfPost<T>(path: string, body: unknown): Promise<PrintfulListResponse<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
  const storeId = getStoreId();
  if (storeId) headers["X-PF-Store-Id"] = storeId;
  const res = await fetch(`${PRINTFUL_API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as PrintfulListResponse<T> | null;
  if (!res.ok || !json) {
    const msg = json?.error?.message ?? res.statusText;
    throw new PrintfulApiError(res.status, `Printful POST ${path} failed: ${msg}`);
  }
  return json;
}

/** Live shipping rates for a recipient + items (catalog variant ids). */
export async function calculateShipping(
  recipient: PrintfulRecipient,
  items: { variant_id: number; quantity: number }[],
): Promise<PrintfulShippingRate[]> {
  const res = await pfPost<PrintfulShippingRate[]>("/shipping/rates", { recipient, items });
  return res.result;
}

/** Create an order. confirm:true submits it for fulfillment; false = draft. */
export async function createOrder(
  payload: {
    recipient: PrintfulRecipient;
    items: { sync_variant_id: number; quantity: number }[];
    shipping?: string;
    external_id?: string;
  },
  opts: { confirm: boolean },
): Promise<PrintfulOrderResult> {
  const res = await pfPost<PrintfulOrderResult>(
    `/orders${opts.confirm ? "?confirm=1" : ""}`,
    payload,
  );
  return res.result;
}

export async function getOrder(id: number | string): Promise<PrintfulOrderResult> {
  const res = await pfGet<PrintfulOrderResult>(`/orders/${id}`);
  return res.result;
}
```

- [ ] **Step 5: Type check + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/lib/printful/types.ts src/lib/printful/client.ts src/lib/printful/order-mappers.ts tests/unit/printful/order-mappers.test.ts
git commit -m "feat(merch): Printful shipping-rate + order-create client methods"
```

---

## Task 3: Cart (client-side) + add-to-cart

**Files:**
- Create: `src/lib/merch/cart.ts`, `src/components/shop/cart-store.ts`, `src/components/shop/cart-drawer.tsx`
- Modify: `src/components/shop/product-detail.tsx`
- Test: `tests/unit/merch/cart.test.ts`

**Interfaces:**
- Produces: `CartItem` type, `cartSubtotalCents(items): number`, `mergeCartItem(items, item): CartItem[]`; a `useCart()` hook (`items`, `add`, `remove`, `setQty`, `clear`, `count`); `<CartDrawer/>` island.

- [ ] **Step 1: Write the failing pure-cart test**

`tests/unit/merch/cart.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cartSubtotalCents, mergeCartItem, type CartItem } from "@/lib/merch/cart";

const base: CartItem = {
  variantId: "v1", productSlug: "hoodie", name: "Hoodie", size: "M", color: null,
  unitPriceCents: 4650, imageUrl: null, printfulSyncVariantId: "501", quantity: 1,
};

describe("cartSubtotalCents", () => {
  it("sums price*qty across lines", () => {
    expect(cartSubtotalCents([{ ...base, quantity: 2 }, { ...base, variantId: "v2", unitPriceCents: 5200, quantity: 1 }])).toBe(4650 * 2 + 5200);
  });
});

describe("mergeCartItem", () => {
  it("adds a new variant", () => {
    expect(mergeCartItem([], base)).toHaveLength(1);
  });
  it("increments quantity for an existing variant", () => {
    const out = mergeCartItem([base], { ...base, quantity: 3 });
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(4);
  });
});
```

- [ ] **Step 2: Run it — FAIL.** `npx vitest run tests/unit/merch/cart.test.ts`

- [ ] **Step 3: Implement pure cart + hook + drawer**

`src/lib/merch/cart.ts`:

```ts
export interface CartItem {
  variantId: string;
  productSlug: string;
  name: string;
  size: string | null;
  color: string | null;
  unitPriceCents: number;
  imageUrl: string | null;
  printfulSyncVariantId: string;
  quantity: number;
}

export function cartSubtotalCents(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
}

export function mergeCartItem(items: CartItem[], item: CartItem): CartItem[] {
  const existing = items.find((i) => i.variantId === item.variantId);
  if (!existing) return [...items, item];
  return items.map((i) =>
    i.variantId === item.variantId ? { ...i, quantity: i.quantity + item.quantity } : i,
  );
}
```

`src/components/shop/cart-store.ts` (localStorage-backed hook):

```ts
"use client";
import { useEffect, useState, useCallback } from "react";
import { type CartItem, mergeCartItem } from "@/lib/merch/cart";

const KEY = "aspire_merch_cart_v1";

function read(): CartItem[] {
  if (typeof localStorage === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => { setItems(read()); }, []);
  const persist = useCallback((next: CartItem[]) => {
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("merch-cart-changed"));
  }, []);
  // keep multiple islands in sync
  useEffect(() => {
    const onChange = () => setItems(read());
    window.addEventListener("merch-cart-changed", onChange);
    return () => window.removeEventListener("merch-cart-changed", onChange);
  }, []);

  return {
    items,
    count: items.reduce((n, i) => n + i.quantity, 0),
    add: (item: CartItem) => persist(mergeCartItem(read(), item)),
    setQty: (variantId: string, qty: number) =>
      persist(read().map((i) => (i.variantId === variantId ? { ...i, quantity: qty } : i)).filter((i) => i.quantity > 0)),
    remove: (variantId: string) => persist(read().filter((i) => i.variantId !== variantId)),
    clear: () => persist([]),
  };
}
```

`src/components/shop/cart-drawer.tsx` — a badge + slide-over listing items with qty controls and a "Checkout" link to `/shop/checkout`. Full island:

```tsx
"use client";
import { useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { useCart } from "./cart-store";
import { cartSubtotalCents } from "@/lib/merch/cart";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function CartDrawer() {
  useHydrationBeacon();
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const subtotal = cartSubtotalCents(cart.items);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="relative text-ink" aria-label={`Cart (${cart.count})`}>
        Cart{cart.count > 0 && <span className="ml-1 text-xs bg-ink text-cream rounded-full px-2 py-0.5">{cart.count}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Cart">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-cream w-full max-w-sm h-full p-6 overflow-y-auto">
            <button type="button" onClick={() => setOpen(false)} className="mb-4 text-sm text-ink-muted">Close ✕</button>
            {cart.items.length === 0 ? (
              <p className="text-ink-muted">Your cart is empty.</p>
            ) : (
              <>
                <ul className="space-y-4 list-none p-0 m-0">
                  {cart.items.map((i) => (
                    <li key={i.variantId} className="flex gap-3 items-center">
                      <div className="flex-1">
                        <p className="text-sm text-ink">{i.name}</p>
                        <p className="text-xs text-ink-muted">{[i.color, i.size].filter(Boolean).join(" · ")}</p>
                        <p className="text-xs text-ink-muted">{money(i.unitPriceCents)} × {i.quantity}</p>
                      </div>
                      <input type="number" min={0} value={i.quantity}
                        onChange={(e) => cart.setQty(i.variantId, Number(e.target.value))}
                        className="w-14 border border-ink/30 px-2 py-1 text-sm" aria-label={`Quantity for ${i.name}`} />
                      <button type="button" onClick={() => cart.remove(i.variantId)} className="text-xs text-ink-muted" aria-label={`Remove ${i.name}`}>✕</button>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 border-t border-ink/10 pt-4">
                  <p className="flex justify-between text-sm text-ink"><span>Subtotal</span><span>{money(subtotal)}</span></p>
                  <p className="text-xs text-ink-muted mt-1">Shipping &amp; tax calculated at checkout.</p>
                  <a href="/shop/checkout" className="mt-4 block text-center bg-ink text-cream px-6 py-3 text-sm font-medium uppercase tracking-wide">Checkout</a>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Wire add-to-cart into the product detail island**

In `src/components/shop/product-detail.tsx`: import `useCart` from `./cart-store`, and replace the `<p>Online ordering opens soon.</p>` note with a real button that adds the selected variant. Add near the top of the component: `const cart = useCart(); const [added, setAdded] = useState(false);`. Replace the note with:

```tsx
        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            cart.add({
              variantId: selected.id,
              productSlug: slug,
              name,
              size: selected.size,
              color: selected.color,
              unitPriceCents: selected.retailPriceCents,
              imageUrl: images[0]?.url ?? null,
              printfulSyncVariantId: selected.printfulSyncVariantId,
              quantity: 1,
            });
            setAdded(true);
            setTimeout(() => setAdded(false), 1500);
          }}
          className="mt-8 bg-ink text-cream px-6 py-3 text-sm font-medium uppercase tracking-wide disabled:opacity-50"
        >
          {added ? "Added ✓" : "Add to cart"}
        </button>
```

This requires two new fields on `ProductDetailVariant`: add `printfulSyncVariantId: string` to the `ProductDetailVariant` interface, and pass it from `src/pages/shop/[slug].astro` (`printfulSyncVariantId: v.printfulSyncVariantId`). Add `slug` to `ProductDetailProps` and pass `slug={slug}` from the page. Import `useState` if not already.

- [ ] **Step 5: Render the cart in the shop pages**

In both `src/pages/shop.astro` and `src/pages/shop/[slug].astro`, add the cart island to the header area: `import CartDrawer from "@/components/shop/cart-drawer";` and render `<CartDrawer client:load />` in the page header. (Place it top-right of the `<header>` / near the "Back to shop" link.)

- [ ] **Step 6: Run tests + tsc**

Run: `npx vitest run tests/unit/merch/cart.test.ts` → PASS. `npx tsc --noEmit` → zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/merch/cart.ts src/components/shop/cart-store.ts src/components/shop/cart-drawer.tsx src/components/shop/product-detail.tsx "src/pages/shop/[slug].astro" src/pages/shop.astro tests/unit/merch/cart.test.ts
git commit -m "feat(merch): client-side cart + add-to-cart"
```

---

## Task 4: Quote endpoint (live Printful shipping)

**Files:**
- Create: `src/lib/merch/quote.ts`, `src/pages/api/merch/quote.ts`
- Test: `tests/unit/merch/quote.test.ts`, `tests/api/merch/quote.test.ts`

**Interfaces:**
- Consumes: `getDb`, `merchVariants`/`merchProducts` (`@/lib/db/schema`), `calculateShipping`, `toPrintfulRecipient`, `pickCheapestRate`, `shippingRateToCents`, `isPrintfulConfigured`.
- Produces:
  - pure `assembleQuote(pricedItems, shippingCents): { subtotalCents, shippingCents, totalBeforeTaxCents }`
  - `repriceCartLine(variantRow, qty): { unitPriceCents, ... }` (server-authoritative)
  - `POST /api/merch/quote` → `{ items, subtotalCents, shippingCents, totalBeforeTaxCents, currency }` | 400 | 422 (unshippable) | 503

- [ ] **Step 1: Write the failing pure test**

`tests/unit/merch/quote.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assembleQuote } from "@/lib/merch/quote";

describe("assembleQuote", () => {
  it("sums subtotal and adds shipping", () => {
    const q = assembleQuote(
      [{ unitPriceCents: 4650, quantity: 2 }, { unitPriceCents: 5200, quantity: 1 }],
      599,
    );
    expect(q.subtotalCents).toBe(4650 * 2 + 5200);
    expect(q.shippingCents).toBe(599);
    expect(q.totalBeforeTaxCents).toBe(4650 * 2 + 5200 + 599);
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run tests/unit/merch/quote.test.ts`

- [ ] **Step 3: Implement quote lib**

`src/lib/merch/quote.ts`:

```ts
export interface QuoteLineInput { unitPriceCents: number; quantity: number; }

export function assembleQuote(items: QuoteLineInput[], shippingCents: number) {
  const subtotalCents = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  return { subtotalCents, shippingCents, totalBeforeTaxCents: subtotalCents + shippingCents };
}
```

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Write the endpoint**

`src/pages/api/merch/quote.ts`:

```ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchVariants, merchProducts } from "@/lib/db/schema";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { isPrintfulConfigured, calculateShipping, PrintfulApiError } from "@/lib/printful/client";
import { toPrintfulRecipient, pickCheapestRate, shippingRateToCents } from "@/lib/printful/order-mappers";
import { assembleQuote } from "@/lib/merch/quote";

const schema = z.object({
  address: z.object({
    name: z.string().min(1), address1: z.string().min(1), address2: z.string().optional().nullable(),
    city: z.string().min(1), state: z.string().min(2), zip: z.string().min(3), country: z.string().length(2),
  }),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1),
});

export const POST: APIRoute = async (context) => {
  const ip = context.clientAddress ?? "unknown";
  const limit = rateLimit(`merch-quote:ip:${ip}`, 20, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);
  if (!isPrintfulConfigured()) return new Response(JSON.stringify({ error: "Shop unavailable" }), { status: 503 });

  const org = context.locals.organization;
  if (!org) return new Response(JSON.stringify({ error: "No organization" }), { status: 400 });

  const parsed = schema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid", details: parsed.error.flatten() }), { status: 400 });

  const db = getDb();
  const ids = parsed.data.items.map((i) => i.variantId);
  // server-authoritative re-price: only active variants of active products in this org
  const rows = await db
    .select({
      id: merchVariants.id, printfulVariantId: merchVariants.printfulVariantId,
      printfulSyncVariantId: merchVariants.printfulSyncVariantId,
      retailPriceCents: merchVariants.retailPriceCents,
      productName: merchProducts.name,
    })
    .from(merchVariants)
    .innerJoin(merchProducts, eq(merchVariants.productId, merchProducts.id))
    .where(and(inArray(merchVariants.id, ids), eq(merchVariants.active, true), eq(merchProducts.active, true), eq(merchProducts.organizationId, org.id)));

  if (rows.length !== ids.length) return new Response(JSON.stringify({ error: "Some items are unavailable" }), { status: 422 });

  const byId = new Map(rows.map((r) => [r.id, r]));
  const priced = parsed.data.items.map((i) => {
    const r = byId.get(i.variantId)!;
    return { ...r, quantity: i.quantity, unitPriceCents: r.retailPriceCents };
  });

  try {
    const rates = await calculateShipping(
      toPrintfulRecipient(parsed.data.address),
      priced.map((p) => ({ variant_id: p.printfulVariantId, quantity: p.quantity })),
    );
    const cheapest = pickCheapestRate(rates);
    if (!cheapest) return new Response(JSON.stringify({ error: "We can't ship to that address" }), { status: 422 });
    const shippingCents = shippingRateToCents(cheapest.rate);
    const quote = assembleQuote(priced.map((p) => ({ unitPriceCents: p.unitPriceCents, quantity: p.quantity })), shippingCents);
    return new Response(JSON.stringify({
      ...quote, currency: "usd",
      items: priced.map((p) => ({ variantId: p.id, unitPriceCents: p.unitPriceCents, quantity: p.quantity })),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    if (e instanceof PrintfulApiError) return new Response(JSON.stringify({ error: "Shipping quote failed" }), { status: 502 });
    console.error("merch quote failed", e);
    return new Response(JSON.stringify({ error: "Quote failed" }), { status: 500 });
  }
};
```

- [ ] **Step 6: API contract test**

`tests/api/merch/quote.test.ts`:

```ts
import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("POST /api/merch/quote", () => {
  it("400s on an invalid body", async () => {
    const res = await fetch(`${BASE}/api/merch/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    expect([400, 503]).toContain(res.status); // 503 if Printful unconfigured on this env
  });
});
```

> Full happy-path (real Printful) is controller-verified live, like Phase 1.

- [ ] **Step 7: tsc + commit**

Run: `npx vitest run tests/unit/merch/quote.test.ts` → PASS; `npx tsc --noEmit` → zero errors.

```bash
git add src/lib/merch/quote.ts src/pages/api/merch/quote.ts tests/unit/merch/quote.test.ts tests/api/merch/quote.test.ts
git commit -m "feat(merch): quote endpoint with live Printful shipping"
```

---

## Task 5: Checkout endpoint (Stripe Checkout Session)

**Files:**
- Create: `src/lib/merch/checkout-line-items.ts`, `src/pages/api/merch/checkout.ts`
- Test: `tests/unit/merch/checkout-line-items.test.ts`, `tests/api/merch/checkout.test.ts`

**Interfaces:**
- Consumes: `stripe` (`@/lib/stripe/client`), `getDb`, schema, `upsertGuestUser`, `rateLimit`, the quote pieces from Task 4, `calculateShipping`/`pickCheapestRate`/`toPrintfulRecipient`/`shippingRateToCents`.
- Produces:
  - pure `buildMerchLineItems(items, currency): Stripe.Checkout.SessionCreateParams.LineItem[]` — each with `price_data.product_data.tax_code = "txcd_99999999"`.
  - `POST /api/merch/checkout` → `{ url }` (303-style redirect target) | 400 | 422 | 502/503.

- [ ] **Step 1: Failing test for the line-item builder**

`tests/unit/merch/checkout-line-items.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildMerchLineItems, MERCH_TAX_CODE } from "@/lib/merch/checkout-line-items";

describe("buildMerchLineItems", () => {
  it("builds Stripe line items with the tangible-goods tax code", () => {
    const li = buildMerchLineItems(
      [{ productName: "Hoodie", variantLabel: "Black · M", unitPriceCents: 4650, quantity: 2 }],
      "usd",
    );
    expect(li).toHaveLength(1);
    expect(li[0].quantity).toBe(2);
    expect(li[0].price_data?.unit_amount).toBe(4650);
    expect(li[0].price_data?.currency).toBe("usd");
    expect(li[0].price_data?.product_data?.tax_code).toBe(MERCH_TAX_CODE);
    expect(MERCH_TAX_CODE).toBe("txcd_99999999");
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement the builder**

`src/lib/merch/checkout-line-items.ts`:

```ts
import type Stripe from "stripe";

/** Stripe product tax code for general tangible goods (not the account's
 * "General - Services" default) — classifies merch correctly for Stripe Tax. */
export const MERCH_TAX_CODE = "txcd_99999999";

export interface MerchLineInput {
  productName: string;
  variantLabel: string; // "Black · M" — for the Stripe line description
  unitPriceCents: number;
  quantity: number;
}

export function buildMerchLineItems(
  items: MerchLineInput[],
  currency: string,
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return items.map((i) => ({
    quantity: i.quantity,
    price_data: {
      currency,
      unit_amount: i.unitPriceCents,
      product_data: {
        name: i.variantLabel ? `${i.productName} (${i.variantLabel})` : i.productName,
        tax_code: MERCH_TAX_CODE,
      },
    },
  }));
}
```

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Write the endpoint**

`src/pages/api/merch/checkout.ts` — re-price (same as quote), re-quote shipping, insert order+items, create the Stripe session. Key shape:

```ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchVariants, merchProducts, merchOrders, merchOrderItems } from "@/lib/db/schema";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { stripe } from "@/lib/stripe/client";
import { upsertGuestUser } from "@/lib/registrations/upsert-guest-user";
import { isPrintfulConfigured, calculateShipping, PrintfulApiError } from "@/lib/printful/client";
import { toPrintfulRecipient, pickCheapestRate, shippingRateToCents } from "@/lib/printful/order-mappers";
import { assembleQuote } from "@/lib/merch/quote";
import { buildMerchLineItems } from "@/lib/merch/checkout-line-items";

const schema = z.object({
  email: z.string().email(),
  address: z.object({
    name: z.string().min(1), address1: z.string().min(1), address2: z.string().optional().nullable(),
    city: z.string().min(1), state: z.string().min(2), zip: z.string().min(3), country: z.string().length(2),
  }),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1),
});

export const POST: APIRoute = async (context) => {
  const ip = context.clientAddress ?? "unknown";
  const limit = rateLimit(`merch-checkout:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);
  if (!stripe || !isPrintfulConfigured()) return new Response(JSON.stringify({ error: "Checkout unavailable" }), { status: 503 });

  const org = context.locals.organization;
  if (!org) return new Response(JSON.stringify({ error: "No organization" }), { status: 400 });

  const parsed = schema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid", details: parsed.error.flatten() }), { status: 400 });

  const db = getDb();
  const ids = parsed.data.items.map((i) => i.variantId);
  const rows = await db.select({
      id: merchVariants.id, printfulVariantId: merchVariants.printfulVariantId,
      printfulSyncVariantId: merchVariants.printfulSyncVariantId, variantName: merchVariants.name,
      size: merchVariants.size, color: merchVariants.color, retailPriceCents: merchVariants.retailPriceCents,
      productName: merchProducts.name,
    })
    .from(merchVariants)
    .innerJoin(merchProducts, eq(merchVariants.productId, merchProducts.id))
    .where(and(inArray(merchVariants.id, ids), eq(merchVariants.active, true), eq(merchProducts.active, true), eq(merchProducts.organizationId, org.id)));
  if (rows.length !== ids.length) return new Response(JSON.stringify({ error: "Some items are unavailable" }), { status: 422 });

  const byId = new Map(rows.map((r) => [r.id, r]));
  const priced = parsed.data.items.map((i) => ({ ...byId.get(i.variantId)!, quantity: i.quantity }));

  // live shipping
  let shippingCents: number;
  try {
    const rates = await calculateShipping(toPrintfulRecipient(parsed.data.address), priced.map((p) => ({ variant_id: p.printfulVariantId, quantity: p.quantity })));
    const cheapest = pickCheapestRate(rates);
    if (!cheapest) return new Response(JSON.stringify({ error: "We can't ship to that address" }), { status: 422 });
    shippingCents = shippingRateToCents(cheapest.rate);
  } catch (e) {
    if (e instanceof PrintfulApiError) return new Response(JSON.stringify({ error: "Shipping quote failed" }), { status: 502 });
    throw e;
  }

  const quote = assembleQuote(priced.map((p) => ({ unitPriceCents: p.retailPriceCents, quantity: p.quantity })), shippingCents);

  // guest user + order (pending)
  const [firstName, ...rest] = parsed.data.address.name.trim().split(/\s+/);
  const { userRow } = await upsertGuestUser(db, { email: parsed.data.email, firstName: firstName ?? parsed.data.email, lastName: rest.join(" ") || "-" });

  const [order] = await db.insert(merchOrders).values({
    organizationId: org.id, userId: userRow.id, email: parsed.data.email, status: "pending",
    shippingAddress: parsed.data.address, subtotalCents: quote.subtotalCents, shippingCents, taxCents: 0,
    totalCents: quote.totalBeforeTaxCents, currency: "usd",
  }).returning({ id: merchOrders.id });

  await db.insert(merchOrderItems).values(priced.map((p) => ({
    orderId: order.id, merchVariantId: p.id, fulfillmentType: "printful_pod" as const,
    productName: p.productName, variantName: p.variantName, size: p.size, color: p.color,
    printfulSyncVariantId: p.printfulSyncVariantId, unitPriceCents: p.retailPriceCents, quantity: p.quantity,
  })));

  const appUrl = new URL(context.request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: parsed.data.email,
    line_items: buildMerchLineItems(priced.map((p) => ({
      productName: p.productName, variantLabel: [p.color, p.size].filter(Boolean).join(" · "),
      unitPriceCents: p.retailPriceCents, quantity: p.quantity,
    })), "usd"),
    shipping_options: [{
      shipping_rate_data: { type: "fixed_amount", display_name: "Shipping", fixed_amount: { amount: shippingCents, currency: "usd" } },
    }],
    shipping_address_collection: { allowed_countries: ["US"] },
    automatic_tax: { enabled: true },
    metadata: { type: "merch_order", order_id: order.id, organization_id: org.id },
    success_url: `${appUrl}/shop/order?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/shop/checkout`,
  }, { idempotencyKey: `merch:${order.id}:session` });

  await db.update(merchOrders).set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() }).where(eq(merchOrders.id, order.id));

  return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: { "Content-Type": "application/json" } });
};
```

- [ ] **Step 6: API contract test**

`tests/api/merch/checkout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
describe("POST /api/merch/checkout", () => {
  it("400s (or 503) on an invalid body", async () => {
    const res = await fetch(`${BASE}/api/merch/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    expect([400, 503]).toContain(res.status);
  });
});
```

- [ ] **Step 7: tsc + commit**

`npx vitest run tests/unit/merch/checkout-line-items.test.ts` → PASS; `npx tsc --noEmit` → zero.

```bash
git add src/lib/merch/checkout-line-items.ts src/pages/api/merch/checkout.ts tests/unit/merch/checkout-line-items.test.ts tests/api/merch/checkout.test.ts
git commit -m "feat(merch): checkout endpoint — Stripe session, tax, shipping, order rows"
```

---

## Task 6: Webhook fulfillment (dispatcher → Printful order → email)

**Files:**
- Create: `src/lib/merch/fulfillment.ts`, `src/lib/merch/order-confirmation-email.ts`
- Modify: `src/lib/stripe/handle-stripe-event.ts`
- Test: `tests/unit/merch/fulfillment.test.ts`

**Interfaces:**
- Consumes: `getDb`, schema, `createOrder`, `toPrintfulRecipient`, `buildPrintfulOrderItems`, `sendEmail`.
- Produces:
  - `class UnsupportedFulfillmentError extends Error`
  - `fulfillMerchOrder(orderId): Promise<{ printfulOrderId: string }>` — the dispatcher (only `printful_pod`).
  - `handleMerchOrderCompleted(session): Promise<{ status: string }>` — mark paid, dispatch, email; money-safe.

- [ ] **Step 1: Failing test — dispatcher rejects non-printful lines**

`tests/unit/merch/fulfillment.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assertSupportedFulfillment, UnsupportedFulfillmentError } from "@/lib/merch/fulfillment";

describe("assertSupportedFulfillment", () => {
  it("allows printful_pod", () => {
    expect(() => assertSupportedFulfillment(["printful_pod"])).not.toThrow();
  });
  it("throws on a Phase-3 fulfillment type", () => {
    expect(() => assertSupportedFulfillment(["printful_pod", "pickup"])).toThrow(UnsupportedFulfillmentError);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement fulfillment + email**

`src/lib/merch/fulfillment.ts`:

```ts
import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { merchOrders, merchOrderItems } from "@/lib/db/schema";
import { createOrder } from "@/lib/printful/client";
import { toPrintfulRecipient, buildPrintfulOrderItems } from "@/lib/printful/order-mappers";
import { sendMerchOrderConfirmation } from "./order-confirmation-email";

export class UnsupportedFulfillmentError extends Error {
  constructor(type: string) { super(`Unsupported fulfillment type: ${type}`); this.name = "UnsupportedFulfillmentError"; }
}

/** Phase 2 only fulfills printful_pod. Any other type is a Phase-3 line that
 * must not have reached checkout yet — fail loudly rather than silently drop. */
export function assertSupportedFulfillment(types: string[]): void {
  for (const t of types) if (t !== "printful_pod") throw new UnsupportedFulfillmentError(t);
}

export async function fulfillMerchOrder(orderId: string): Promise<{ printfulOrderId: string }> {
  const db = getDb();
  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) throw new Error(`merch order not found: ${orderId}`);
  const items = await db.select().from(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));
  assertSupportedFulfillment(items.map((i) => i.fulfillmentType));

  const result = await createOrder({
    recipient: toPrintfulRecipient(order.shippingAddress),
    items: buildPrintfulOrderItems(items.map((i) => ({ printfulSyncVariantId: i.printfulSyncVariantId, quantity: i.quantity }))),
    external_id: order.id,
  }, { confirm: true });

  const printfulOrderId = String(result.id);
  await db.update(merchOrders).set({ printfulOrderId, status: "submitted", updatedAt: new Date() }).where(eq(merchOrders.id, orderId));
  return { printfulOrderId };
}

/** Called from the Stripe webhook on checkout.session.completed / merch_order. */
export async function handleMerchOrderCompleted(session: {
  id: string; metadata?: Record<string, string> | null;
  payment_intent?: string | null; amount_total?: number | null;
  total_details?: { amount_tax?: number | null } | null;
}): Promise<{ status: string }> {
  const db = getDb();
  const orderId = session.metadata?.order_id;
  if (!orderId) return { status: "no-order-id" };

  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) return { status: "order-not-found" };
  if (order.status !== "pending") return { status: `already-${order.status}` }; // idempotent

  // 1) mark paid (record Stripe-computed tax + total)
  await db.update(merchOrders).set({
    status: "paid",
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : order.stripePaymentIntentId,
    taxCents: session.total_details?.amount_tax ?? 0,
    totalCents: session.amount_total ?? order.totalCents,
    updatedAt: new Date(),
  }).where(eq(merchOrders.id, orderId));

  // 2) fulfill — money-safe: a failure leaves the order 'paid' for retry, never lost
  try {
    await fulfillMerchOrder(orderId);
  } catch (e) {
    console.error(`[merch] fulfillment failed for paid order ${orderId} — left 'paid' for retry:`, e);
    // intentionally do not rethrow: payment is captured; the order is recorded.
  }

  // 3) confirmation email (sendEmail respects the messaging mock/gate)
  try { await sendMerchOrderConfirmation(orderId); } catch (e) { console.error(`[merch] confirmation email failed for ${orderId}:`, e); }

  return { status: "processed" };
}
```

`src/lib/merch/order-confirmation-email.ts`:

```ts
import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { merchOrders, merchOrderItems } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export async function sendMerchOrderConfirmation(orderId: string): Promise<void> {
  const db = getDb();
  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) return;
  const items = await db.select().from(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));
  const rows = items.map((i) => `<tr><td>${i.productName} ${[i.color, i.size].filter(Boolean).join(" · ")} × ${i.quantity}</td><td align="right">${money(i.unitPriceCents * i.quantity)}</td></tr>`).join("");
  await sendEmail({
    to: order.email,
    subject: "Your Aspire Sports order is confirmed",
    html: `<h1>Thanks for your order!</h1><table>${rows}
      <tr><td>Shipping</td><td align="right">${money(order.shippingCents)}</td></tr>
      <tr><td>Tax</td><td align="right">${money(order.taxCents)}</td></tr>
      <tr><td><strong>Total</strong></td><td align="right"><strong>${money(order.totalCents)}</strong></td></tr>
      </table><p>We'll email tracking when it ships.</p>`,
  });
}
```

- [ ] **Step 4: Run — PASS.** `npx vitest run tests/unit/merch/fulfillment.test.ts`

- [ ] **Step 5: Wire the webhook branch**

In `src/lib/stripe/handle-stripe-event.ts`, in the `case "checkout.session.completed":` block, add a branch alongside the existing `dropin_booking`/`field_rental` ones:

```ts
      } else if (session.metadata?.type === "merch_order") {
        const { handleMerchOrderCompleted } = await import("@/lib/merch/fulfillment");
        const result = await handleMerchOrderCompleted(session as any);
        console.log(`[stripe webhook] checkout.session.completed (merch_order) → ${result.status}`);
```

(Match the file's existing indentation/brace style; keep the dynamic `import()` if the other branches import lazily, otherwise a top import is fine.)

- [ ] **Step 6: tsc + commit**

`npx tsc --noEmit` → zero errors.

```bash
git add src/lib/merch/fulfillment.ts src/lib/merch/order-confirmation-email.ts src/lib/stripe/handle-stripe-event.ts tests/unit/merch/fulfillment.test.ts
git commit -m "feat(merch): webhook fulfillment — Printful order + confirmation email"
```

---

## Task 7: Checkout + thank-you pages

**Files:**
- Create: `src/pages/shop/checkout.astro`, `src/components/shop/checkout-form.tsx`, `src/pages/shop/order.astro`

**Interfaces:**
- Consumes: `useCart`, `useHydrationBeacon`, `stripe` (order page), schema.

- [ ] **Step 1: Address-step island**

`src/components/shop/checkout-form.tsx` — a `"use client"` island (`useHydrationBeacon`) that reads the cart, renders an address form (name, address1, address2, city, state, zip, country=US fixed, email), calls `POST /api/merch/quote` on address blur to show shipping + total, then on submit calls `POST /api/merch/checkout` and does `window.location.href = json.url`. Show `ErrorBanner` on failure; empty-cart → link back to `/shop`. Money helper as elsewhere. (Build the form with controlled inputs; disable submit while a request is in flight.)

- [ ] **Step 2: Checkout page**

`src/pages/shop/checkout.astro`:

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
import CheckoutForm from "@/components/shop/checkout-form";
---
<BaseLayout title="Checkout — Aspire Sports Shop" description="Complete your order.">
  <main id="main-content" class="flex-1 max-w-[720px] mx-auto w-full px-6 py-14">
    <h1 class="font-display text-3xl text-ink mb-8">Checkout</h1>
    <CheckoutForm client:load />
  </main>
</BaseLayout>
```

- [ ] **Step 3: Thank-you page (by session_id)**

`src/pages/shop/order.astro` — read `session_id` from the query, retrieve the Stripe session (`stripe.checkout.sessions.retrieve`), look up the order by `stripeCheckoutSessionId`, and render a confirmation (items, totals, status). 404 if no session_id or no matching order. Extends BaseLayout. Example frontmatter:

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
import { stripe } from "@/lib/stripe/client";
import { getDb } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { merchOrders, merchOrderItems } from "@/lib/db/schema";

const sessionId = Astro.url.searchParams.get("session_id");
const org = Astro.locals.organization;
let order = null, items: any[] = [];
if (sessionId && org && stripe) {
  const [row] = await getDb().select().from(merchOrders)
    .where(and(eq(merchOrders.stripeCheckoutSessionId, sessionId), eq(merchOrders.organizationId, org.id))).limit(1);
  if (row) { order = row; items = await getDb().select().from(merchOrderItems).where(eq(merchOrderItems.orderId, row.id)); }
}
if (!order) return new Response("Not found", { status: 404 });
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
---
<BaseLayout title="Order confirmed — Aspire Sports" description="Your order is confirmed.">
  <main id="main-content" class="flex-1 max-w-[640px] mx-auto w-full px-6 py-14">
    <h1 class="font-display text-3xl text-ink mb-3">Thank you!</h1>
    <p class="text-ink-muted mb-8">Your order is confirmed. A receipt is on its way to {order.email}.</p>
    <ul class="list-none p-0 m-0 divide-y divide-ink/10">
      {items.map((i) => (
        <li class="py-3 flex justify-between text-sm">
          <span>{i.productName} {[i.color, i.size].filter(Boolean).join(" · ")} × {i.quantity}</span>
          <span>{money(i.unitPriceCents * i.quantity)}</span>
        </li>
      ))}
    </ul>
    <div class="mt-4 text-sm text-ink">
      <p class="flex justify-between"><span>Shipping</span><span>{money(order.shippingCents)}</span></p>
      <p class="flex justify-between"><span>Tax</span><span>{money(order.taxCents)}</span></p>
      <p class="flex justify-between font-medium"><span>Total</span><span>{money(order.totalCents)}</span></p>
    </div>
    <a href="/shop" class="mt-8 inline-block text-sm text-ink-muted hover:text-ink">← Back to shop</a>
  </main>
</BaseLayout>
```

- [ ] **Step 4: Clear the cart after redirect**

In `checkout-form.tsx`, the cart is cleared on the order page by adding a tiny inline module script to `order.astro` that removes `aspire_merch_cart_v1` from localStorage (the buyer has landed on the success page):

```astro
<script>localStorage.removeItem("aspire_merch_cart_v1"); window.dispatchEvent(new Event("merch-cart-changed"));</script>
```

- [ ] **Step 5: tsc + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add "src/pages/shop/checkout.astro" src/components/shop/checkout-form.tsx "src/pages/shop/order.astro"
git commit -m "feat(merch): checkout address page + thank-you page"
```

---

## Definition of Done (Phase 2)

- [ ] `db:generate` migration for `merch_orders`/`merch_order_items` committed + applied to staging.
- [ ] `npx vitest run tests/unit/merch tests/unit/printful` — all green.
- [ ] `npx tsc --noEmit` — zero errors; `npx astro build` — succeeds.
- [ ] Controller live pass (real Stripe test mode + Printful + staging): add the Hoodie to cart → `/shop/checkout` → address → Stripe test card → order row goes `pending → paid → submitted`, a Printful **draft/confirmed** order is created, confirmation email is mock-logged (or sent if `MESSAGING_LIVE`), thank-you page renders. Use a Stripe **test** card; if creating real Printful orders is undesirable on staging, verify `createOrder` with `confirm:false` first.
- [ ] Grep `tests/e2e/` for any spec touching `/shop`, `/shop/checkout`, `/shop/order` before merge (Phase-1 lesson: test-full runs post-merge only).

**Owner prerequisites for go-live:** Stripe Tax + Ohio registration active (DONE); `MESSAGING_LIVE=yes` in prod for real emails; run `POST /api/merch/sync` on prod so the catalog exists.

**Out of scope (Phase 3):** non-Printful product sources (self-shipped/pickup/digital) + admin product CRUD + mixed-cart shipping + inventory; the fulfillment dispatcher and `fulfillment_type` enum already accommodate them.
