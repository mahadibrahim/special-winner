# Merch Phase 3c — Self-Shipped + Live Carrier Rates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sell self-shipped products end-to-end — admin creates a self-shipped product with per-variant weight, buyers get a live cheapest Shippo carrier rate at checkout, and the org marks the order shipped with a tracking number.

**Architecture:** A provider-agnostic `src/lib/shipping/` module (`ShippingRateProvider` interface + `ShippoRateProvider`) supplies live rates, mirroring the existing Printful shipping path. `self_shipped` is already seamed into the Phase-3b `fulfillment_type` enum, reprice, cart, and `lineNeedsShipping`; this phase fills in the rate computation, the webhook/admin fulfillment (admin marks shipped + tracking), and the admin product/order UI. Stripe hosted Checkout + Stripe Tax / Astro SSR / Postgres unchanged.

**Tech Stack:** Astro 5 SSR, React 19, Drizzle + Postgres, Stripe hosted Checkout, Shippo REST API, Vitest, Playwright.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-26-merch-phase-3c-self-shipped-live-rates-design.md`. Every task implicitly includes it.
- **Owner decisions (fixed):** provider = **Shippo** (behind a swappable interface); fulfillment = **admin marks shipped + tracking** (no in-app labels); rate = **cheapest, automatic**.
- **Money server-authoritative:** shipping is always re-quoted server-side from the DB parcel + provider; never trust a client rate/weight. Prices from `repriceStoreCartItems`.
- **Key-optional:** without `SHIPPO_API_KEY`, `getShippingProvider().isConfigured()` is false → self-shipped quote/checkout return **503 "Shipping unavailable"**; printful/pickup paths are unaffected. Build + test everything behind the interface now; live Shippo smoke is deferred until the key exists.
- **No enum changes** — `fulfillment_type` already has `self_shipped`, `merch_order_status` already has `shipped`. Migration `0112` is **columns-only**.
- **Multi-tenant:** admin endpoints stay org-scoped via `getStoreById(auth.organizationId, …)` / `requireOrgAdminAccess`; the `source='manual'` guard from 3b stays (self_shipped products are manual).
- **Worktree:** `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/merch-phase3c`, branch `feat/merch-phase3c-selfshipped`. No local `node_modules` — use `npx`. Dev/test DB = staging via bws. **Another session may hold port 4321** — the controller runs the dev server on a free port (e.g. 4331) and points tests at it.
- Amounts integer cents; currency usd; goods tax code `txcd_99999999`.
- Commit after each task; end messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

## File Structure

**New:** `src/lib/shipping/types.ts`, `src/lib/shipping/shippo.ts`, `src/lib/shipping/index.ts`, `src/lib/shipping/rates.ts` (pure `pickCheapestRate` + `parcelForLines`), migration `0112_merch_self_shipped`.
**Modified:** `schema/merch.ts` (variant weight/dims), `schema/merch-orders.ts` (order carrier/tracking); `lib/merch/reprice.ts`; `lib/merch/checkout-store.ts`; `pages/api/merch/quote.ts` + `checkout.ts`; `lib/merch/fulfillment.ts`; `lib/merch/order-confirmation-email.ts`; `pages/api/admin/merch/store-products.ts`; `components/admin/merch-store-editor.tsx`; `pages/api/admin/merch/orders.ts`; `components/admin/merch-store-orders.tsx`.

---

## Slice 1 — Schema + shipping provider

### Task 1.1: variant weight/dims + order tracking columns

**Files:** Modify `src/lib/db/schema/merch.ts`, `src/lib/db/schema/merch-orders.ts`. Test `tests/unit/merch/self-shipped-schema.test.ts`.

**Interfaces produced:** `merchVariants.weightOz`/`lengthIn`/`widthIn`/`heightIn` (integer, nullable); `merchOrders.shippingCarrier`/`shippingService`/`trackingNumber`/`trackingUrl` (varchar, nullable) + `shippedAt` (timestamp, nullable).

- [ ] **Step 1: failing test** — `tests/unit/merch/self-shipped-schema.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { merchVariants } from "@/lib/db/schema/merch";
import { merchOrders } from "@/lib/db/schema/merch-orders";
describe("self-shipped schema (3c)", () => {
  it("variants carry weight + dims", () => {
    for (const c of ["weightOz","lengthIn","widthIn","heightIn"]) expect(Object.keys(merchVariants)).toContain(c);
  });
  it("orders carry carrier + tracking", () => {
    for (const c of ["shippingCarrier","shippingService","trackingNumber","trackingUrl","shippedAt"]) expect(Object.keys(merchOrders)).toContain(c);
  });
});
```

- [ ] **Step 2: run → FAIL** — `npx vitest run tests/unit/merch/self-shipped-schema.test.ts`
- [ ] **Step 3: edit `merch.ts`** — in `merchVariants` columns, after `retailPriceCents`, add:

```ts
    weightOz: integer("weight_oz"),
    lengthIn: integer("length_in"),
    widthIn: integer("width_in"),
    heightIn: integer("height_in"),
```

- [ ] **Step 4: edit `merch-orders.ts`** — in `merchOrders` columns, after `currency`, add:

```ts
    shippingCarrier: varchar("shipping_carrier", { length: 60 }),
    shippingService: varchar("shipping_service", { length: 120 }),
    trackingNumber: varchar("tracking_number", { length: 120 }),
    trackingUrl: varchar("tracking_url", { length: 500 }),
    shippedAt: timestamp("shipped_at"),
```

(`integer`, `varchar`, `timestamp` are already imported in these files.)

- [ ] **Step 5: run → PASS** + `npx tsc --noEmit` (0 errors). **Step 6: commit** `feat(merch): variant weight/dims + order carrier/tracking columns`.

### Task 1.2: migration 0112 (columns-only, idempotent)

**Files:** Create `src/lib/db/migrations/0112_merch_self_shipped.sql` (+ snapshot via generate).

- [ ] **Step 1: generate** — `npx drizzle-kit generate --name merch_self_shipped` (no rename prompt — pure column adds). Keep the generated snapshot + journal entry.
- [ ] **Step 2: make the `.sql` idempotent** — replace each `ADD COLUMN` with `ADD COLUMN IF NOT EXISTS`:

```sql
ALTER TABLE "merch_variants" ADD COLUMN IF NOT EXISTS "weight_oz" integer;--> statement-breakpoint
ALTER TABLE "merch_variants" ADD COLUMN IF NOT EXISTS "length_in" integer;--> statement-breakpoint
ALTER TABLE "merch_variants" ADD COLUMN IF NOT EXISTS "width_in" integer;--> statement-breakpoint
ALTER TABLE "merch_variants" ADD COLUMN IF NOT EXISTS "height_in" integer;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "shipping_carrier" varchar(60);--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "shipping_service" varchar(120);--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "tracking_number" varchar(120);--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "tracking_url" varchar(500);--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "shipped_at" timestamp;
```

- [ ] **Step 3 (controller):** apply to staging (`npm run db:migrate` via bws), verify `db:generate` reports no drift. **Step 4: commit** `feat(merch): migration 0112 — self-shipped weight + tracking columns`.

### Task 1.3: shipping-rate provider module

**Files:** Create `src/lib/shipping/types.ts`, `rates.ts`, `shippo.ts`, `index.ts`. Test `tests/unit/shipping/rates.test.ts`.

**Interfaces produced:** the `ShipAddress`/`Parcel`/`ShippingRate`/`ShippingRateProvider` types (spec §"Shipping-rate provider"); `pickCheapestRate(rates): ShippingRate | null`; `parcelForLines(lines): { ok: true; parcel: Parcel } | { ok: false; missing: string[] }` (sums `weightOz`, uses max dims if any present; fails when any self-shipped line lacks `weightOz`); `getShippingProvider(): ShippingRateProvider`; `class ShippingProviderError extends Error`.

- [ ] **Step 1: failing test** — `tests/unit/shipping/rates.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { pickCheapestRate, parcelForLines } from "@/lib/shipping/rates";
describe("pickCheapestRate", () => {
  it("returns the min-cost rate", () => {
    expect(pickCheapestRate([{carrier:"UPS",service:"G",amountCents:1200},{carrier:"USPS",service:"GA",amountCents:800}])?.amountCents).toBe(800);
  });
  it("null on empty", () => expect(pickCheapestRate([])).toBeNull());
});
describe("parcelForLines", () => {
  const line = (weightOz: number|null, qty=1) => ({ weightOz, lengthIn:null, widthIn:null, heightIn:null, quantity:qty, productName:"P" });
  it("sums weight × qty", () => {
    const r = parcelForLines([line(8,2), line(4,1)]);
    expect(r.ok && r.parcel.weightOz).toBe(20);
  });
  it("fails when a line lacks weight", () => {
    const r = parcelForLines([line(null)]);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: run → FAIL.** **Step 3: implement.**

`types.ts`:
```ts
export interface ShipAddress { name?: string; street1: string; street2?: string|null; city: string; state: string; zip: string; country: string }
export interface Parcel { weightOz: number; lengthIn?: number|null; widthIn?: number|null; heightIn?: number|null }
export interface ShippingRate { carrier: string; service: string; amountCents: number; estDays?: number|null; providerRateId?: string|null }
export interface ShippingRateProvider { isConfigured(): boolean; getRates(from: ShipAddress, to: ShipAddress, parcel: Parcel): Promise<ShippingRate[]>; }
export class ShippingProviderError extends Error { constructor(msg: string){ super(msg); this.name="ShippingProviderError"; } }
```

`rates.ts` (pure):
```ts
import type { Parcel, ShippingRate } from "./types";
export function pickCheapestRate(rates: ShippingRate[]): ShippingRate | null {
  if (rates.length === 0) return null;
  return rates.reduce((a, b) => (b.amountCents < a.amountCents ? b : a));
}
export interface ParcelLine { weightOz: number | null; lengthIn: number|null; widthIn: number|null; heightIn: number|null; quantity: number; productName: string }
export function parcelForLines(lines: ParcelLine[]): { ok: true; parcel: Parcel } | { ok: false; missing: string[] } {
  const missing = lines.filter((l) => l.weightOz == null || l.weightOz <= 0).map((l) => l.productName);
  if (missing.length) return { ok: false, missing };
  const weightOz = lines.reduce((s, l) => s + (l.weightOz as number) * l.quantity, 0);
  const max = (k: "lengthIn"|"widthIn"|"heightIn") => { const v = lines.map((l)=>l[k]).filter((n): n is number => n!=null); return v.length ? Math.max(...v) : null; };
  return { ok: true, parcel: { weightOz, lengthIn: max("lengthIn"), widthIn: max("widthIn"), heightIn: max("heightIn") } };
}
```

`shippo.ts` — `ShippoRateProvider implements ShippingRateProvider`: `isConfigured()` = `!!process.env.SHIPPO_API_KEY`; `getRates` POSTs to `https://api.goshippo.com/shipments/` with `address_from`/`address_to`/`parcels` (weight in `oz`, dims in `in` or a default box), `async: false`, `Authorization: ShippoToken <key>`; maps `response.rates[]` → `ShippingRate` (`amount` USD string → cents via `Math.round(parseFloat(amount)*100)`, `provider`→carrier, `servicelevel.name`→service, `estimated_days`, `object_id`→providerRateId); throws `ShippingProviderError` on non-200/parse failure. (Read `src/lib/printful/client.ts` for the fetch/error-handling idiom to mirror.)

`index.ts`:
```ts
import { ShippoRateProvider } from "./shippo";
import type { ShippingRateProvider } from "./types";
export * from "./types";
export * from "./rates";
let provider: ShippingRateProvider | null = null;
export function getShippingProvider(): ShippingRateProvider { return (provider ??= new ShippoRateProvider()); }
```

- [ ] **Step 4: run → PASS** + `npx tsc --noEmit` 0. **Step 5: commit** `feat(shipping): Shippo rate provider behind a swappable interface`.

---

## Slice 2 — Reprice + checkout self-shipped branch

### Task 2.1: reprice carries weight/dims

**Files:** Modify `src/lib/merch/reprice.ts`. Test extend `tests/unit/merch/reprice.test.ts`.

**Interfaces:** `RepricedLine` + `VariantPriceRow` gain `weightOz`/`lengthIn`/`widthIn`/`heightIn` (`number|null`), selected from `merchVariants`.

- [ ] **Step 1: failing test** — add a case asserting `matchRequestedToRows` carries `weightOz` from the row onto the line. **Step 2: run → FAIL.**
- [ ] **Step 3:** add the four fields to both interfaces, to the `.select({...})` in `repriceStoreCartItems` (`weightOz: merchVariants.weightOz`, etc.), and to the pushed line in `matchRequestedToRows`. **Step 4: run → PASS** + tsc 0. **Step 5: commit** `feat(merch): reprice carries variant weight/dims`.

### Task 2.2: partition includes self_shipped

**Files:** Modify `src/lib/merch/checkout-store.ts`. Test extend `tests/unit/merch/checkout-store.test.ts`.

**Interfaces:** `partitionByFulfillment(lines)` returns `{ printful, selfShipped, pickup }` (was `{ printful, pickup }`). `lineNeedsShipping` unchanged (already printful+self_shipped).

- [ ] **Step 1: failing test** — assert a `self_shipped` line lands in `.selfShipped`. **Step 2: FAIL.**
- [ ] **Step 3:** add `selfShipped: lines.filter((l) => l.fulfillmentType === "self_shipped")`. **Step 4: PASS** — but this changes the return shape; `checkout.ts`/`quote.ts` destructure `{ printful }` today (still valid — extra key is harmless), so tsc stays 0. **Step 5: commit** `fix(merch): partitionByFulfillment buckets self_shipped`.

### Task 2.3: self-shipped shipping in quote + checkout

**Files:** Modify `src/pages/api/merch/quote.ts`, `src/pages/api/merch/checkout.ts`. Test `tests/unit/merch/self-shipped-checkout.test.ts` (pure helper) + the controller-run API test in Slice 4.

**Interfaces:** new pure `computeSelfShippedShipping(...)` is NOT needed — the endpoint calls the provider directly. Add a shared helper `src/lib/merch/self-shipped-shipping.ts`: `resolveSelfShippedRate(orgId, address, selfShippedLines): Promise<{ ok: true; shippingCents: number; carrier: string; service: string } | { ok: false; status: number; error: string }>` so quote + checkout share it.

- [ ] **Step 1: write `src/lib/merch/self-shipped-shipping.ts`** (integration helper — no pure unit test; covered by the API test):

```ts
import { getShippingProvider, pickCheapestRate, parcelForLines, ShippingProviderError, type ParcelLine } from "@/lib/shipping";
import { getOrgOriginAddress } from "@/lib/merch/org-origin";
import type { MerchShippingAddress } from "@/lib/db/schema";

export async function resolveSelfShippedRate(
  orgId: string,
  address: MerchShippingAddress,
  lines: (ParcelLine & {})[],
): Promise<{ ok: true; shippingCents: number; carrier: string; service: string } | { ok: false; status: number; error: string }> {
  const provider = getShippingProvider();
  if (!provider.isConfigured()) return { ok: false, status: 503, error: "Shipping unavailable" };
  const parcel = parcelForLines(lines);
  if (!parcel.ok) return { ok: false, status: 422, error: `Shipping isn't configured for: ${parcel.missing.join(", ")}` };
  const origin = await getOrgOriginAddress(orgId); // {line1,city,state,postal_code,country}
  const from = { street1: origin.line1, city: origin.city, state: origin.state, zip: origin.postal_code, country: origin.country };
  const to = { name: address.name, street1: address.address1, street2: address.address2 ?? null, city: address.city, state: address.state, zip: address.zip, country: address.country };
  try {
    const rates = await provider.getRates(from, to, parcel.parcel);
    const cheapest = pickCheapestRate(rates);
    if (!cheapest) return { ok: false, status: 422, error: "We can't ship to that address" };
    return { ok: true, shippingCents: cheapest.amountCents, carrier: cheapest.carrier, service: cheapest.service };
  } catch (e) {
    if (e instanceof ShippingProviderError) return { ok: false, status: 502, error: "Shipping quote failed" };
    throw e;
  }
}
```

- [ ] **Step 2: edit `checkout.ts`** — after `const { printful } = partitionByFulfillment(priced);` change to `const { printful, selfShipped } = …`. Extend the shipping block: keep the Printful path when `printful.length`; ADD a self-shipped path:

```ts
    let shippingCents = 0;
    let shipCarrier: string | null = null, shipService: string | null = null;
    if (printful.length) { /* existing Printful path → shippingCents += printfulShippingCents */ }
    if (selfShipped.length) {
      if (!parsed.data.address) return json({ error: "Shipping address required" }, 422);
      const r = await resolveSelfShippedRate(org.id, parsed.data.address, selfShipped);
      if (!r.ok) return json({ error: r.error }, r.status);
      shippingCents += r.shippingCents; shipCarrier = r.carrier; shipService = r.service;
    }
```

Persist `shippingCarrier: shipCarrier, shippingService: shipService` on the `merchOrders` insert. (Import `resolveSelfShippedRate`; pass `selfShipped` lines which already carry `weightOz`/dims/`productName`/`quantity`.)

- [ ] **Step 3: edit `quote.ts`** — the same self-shipped branch (no order persistence), returning `shippingCents` (summed printful + self-shipped) in the quote response. Move the `isPrintfulConfigured()` 503 into the printful branch only (already done in 3b); self-shipped uses its own 503 via `resolveSelfShippedRate`.
- [ ] **Step 4:** `npx vitest run tests/unit/merch/` + `npx tsc --noEmit` 0 + `./scripts/with-bws.sh npx astro build`. **Step 5: commit** `feat(merch): self-shipped live-rate shipping in quote + checkout`.

---

## Slice 3 — Fulfillment + tracking email

### Task 3.1: webhook self-shipped branch

**Files:** Modify `src/lib/merch/fulfillment.ts`. Test extend `tests/unit/merch/fulfillment-dispatch.test.ts`.

**Interfaces:** `orderFulfillmentPlan(items)` gains `"self_shipped"` (returned when every item is `self_shipped`); `assertSupportedFulfillment` allows `self_shipped`.

- [ ] **Step 1: failing test** — `orderFulfillmentPlan([{fulfillmentType:"self_shipped"}])` → `"self_shipped"`; mixed self_shipped+printful → `"printful"`. **Step 2: FAIL.**
- [ ] **Step 3:** update `orderFulfillmentPlan` to a 3-way: `if all pickup → "pickup"; if all self_shipped → "self_shipped"; else "printful"` (printful is the catch-all for any shippable/mixed order — its path only submits printful lines). Allow `self_shipped` in `assertSupportedFulfillment`. In `handleMerchOrderCompleted`, add the `self_shipped` branch AFTER mark-paid: **no external call** — leave status `paid`, send `sendMerchOrderConfirmation(orderId)` (the existing "we'll email tracking when it ships" copy fits), return `{ status: "processed-self-shipped" }`. Money-safe + idempotent like the others.
- [ ] **Step 4: PASS** + tsc 0. **Step 5: commit** `feat(merch): webhook self-shipped dispatch (order stays paid for admin fulfillment)`.

### Task 3.2: tracking email

**Files:** Modify `src/lib/merch/order-confirmation-email.ts`. Test `tests/unit/merch/shipped-email.test.ts` (pure body builder).

**Interfaces:** `sendMerchShippedEmail(orderId)` — loads order + items; subject "Your Aspire Sports order has shipped"; shows carrier/service + `tracking_number` + `tracking_url` (linked) + itemized list; uses the existing `sendEmail`/`money` helpers. Factor the row-rendering out of the existing confirmations if convenient; keep it minimal.

- [ ] **Step 1: failing test** — a pure `buildShippedEmailHtml({ trackingNumber, trackingUrl, carrier, service, items, ... })` asserting the tracking number + a linked URL appear. **Step 2: FAIL. Step 3: implement** the builder + `sendMerchShippedEmail`. **Step 4: PASS** + tsc 0. **Step 5: commit** `feat(merch): shipped/tracking email`.

---

## Slice 4 — Admin (self-shipped products + mark-shipped)

### Task 4.1: self-shipped product creation with weight

**Files:** Modify `src/pages/api/admin/merch/store-products.ts`. Test extend `tests/api/admin/merch-store-products.test.ts`.

**Interfaces:** the product schema gains `fulfillmentType: z.enum(["pickup","self_shipped"]).default("pickup")` and per-size `weightOz` (+ optional dims). When `self_shipped`, `weightOz` is required per variant (422 otherwise). The product insert uses the chosen `fulfillmentType`; the variant insert sets `weightOz`/dims. The `source='manual'` guard and tenant isolation stay.

- [ ] **Step 1: failing API test** (controller-run) — create a `self_shipped` product with sizes+weights; assert it persists `fulfillment_type='self_shipped'` and variant `weight_oz`; assert creating self_shipped WITHOUT weight → 422. **Step 2: implement** (extend the zod schema + insert; validate weight-present for self_shipped). **Step 3:** tsc 0. **Step 4: commit** `feat(merch): admin self-shipped product creation with per-variant weight`.

### Task 4.2: mark-shipped transition + UI

**Files:** Modify `src/pages/api/admin/merch/orders.ts`, `src/components/admin/merch-store-orders.tsx`, `src/components/admin/merch-store-editor.tsx` (fulfillment select + weight inputs). Test extend `tests/api/admin/merch-orders.test.ts`.

**Interfaces:** `PATCH /api/admin/merch/orders` gains `{ orderId, status: "shipped", trackingNumber, trackingUrl?, carrier?, service? }` — valid only from `paid`, org-scoped via `getStoreById`; sets `tracking_number`/`tracking_url`/`shipped_at`/status `shipped` (+ carrier/service if provided), then `sendMerchShippedEmail(orderId)`. Reject illegal transitions (e.g. `awaiting_pickup → shipped`, `pending → shipped`) with 409.

- [ ] **Step 1: failing API test** — mark a `paid` self-shipped order shipped with a tracking number → 200, status `shipped`, tracking persisted; illegal source status → 409; tenant isolation → 404. **Step 2: implement** the PATCH branch (mirror the existing `collected` branch's guards). **Step 3: UI:** in `merch-store-orders.tsx`, a "Mark shipped" action for `paid` self-shipped orders that collects a tracking number; in `merch-store-editor.tsx`, the manual-product form gains a `pickup`/`self_shipped` select and, when self_shipped, per-size weight inputs (+ optional dims). CSV export gains carrier/tracking columns. **Step 4:** tsc 0 + `astro build`. **Step 5: commit** `feat(merch): admin mark-shipped + tracking; self-shipped product editor`.

---

## Final verification (controller)

- `npx tsc --noEmit` 0; `npx vitest run tests/unit/` (shipping + merch) green; `./scripts/with-bws.sh npx astro build`.
- Migration 0112 applied + verified on staging; `db:generate` no drift.
- Dev server on a **free port** (4321 may be held by another session); run the merch API tests incl. the new self-shipped product + mark-shipped cases against it. Self-shipped **quote/checkout return 503 without `SHIPPO_API_KEY`** — the API test asserts `[200, 503]` for provider-dependent steps; the mark-shipped transition + product-weight validation don't need the key and assert deterministically.
- **Deferred to when `SHIPPO_API_KEY` exists:** live-rate smoke (real Shippo test key → non-zero rate at quote → checkout Stripe session → webhook leaves order paid → admin mark-shipped → tracking email). Note this in the PR.
- Grep `tests/e2e/` for `/shop` specs before merge (post-merge `test-full`).

## Self-review (coverage vs spec)

Schema (variant weight/dims + order tracking) → 1.1/1.2. Provider interface + Shippo + pickCheapest/parcel → 1.3. Reprice weight → 2.1. Partition self_shipped → 2.2. Quote/checkout self-shipped branch (cheapest, key-optional 503) → 2.3. Webhook self-shipped (stays paid) → 3.1. Tracking email → 3.2. Admin self-shipped product + weight → 4.1. Mark-shipped + UI + CSV → 4.2. Owner `SHIPPO_API_KEY` + non-goals (labels, service-picker, bundles, digital, EasyPost) → carried, not built.
