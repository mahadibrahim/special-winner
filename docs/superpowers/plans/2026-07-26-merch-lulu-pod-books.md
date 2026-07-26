# Merch Lulu POD Print Books Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell printed books end-to-end via Lulu print-on-demand: admin uploads interior+cover PDFs and creates a book product; buyer picks a live-priced shipping level at checkout; payment auto-submits a Lulu print job; a cron polls status and sends the shipped/tracking email.

**Architecture:** New `lulu_pod` fulfillment type mirroring the Printful provider seams. A `src/lib/lulu/` client (OAuth2 client-credentials, `LULU_MOCK=1` mock built in) powers a per-level shipping quote at checkout, print-job submission from the Stripe webhook, and a 30-minute status-poll cron. Books-only carts (lulu + digital lines only). Spec: `docs/superpowers/specs/2026-07-26-merch-lulu-pod-books-design.md`.

**Tech Stack:** Astro 5 API routes, Drizzle/Postgres, Zod, Vitest (unit + API), Playwright, Netlify scheduled functions, Lulu Print API v1.

## Global Constraints

- **Worktree:** ALL work happens in `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/merch-phase3b` on branch `feat/merch-lulu-pod`. Every subagent MUST be given this absolute path and MUST run `git branch --show-current` first and stop if it isn't `feat/merch-lulu-pod`. (Past incident: subagents drift to the main checkout.)
- **Migration:** exactly one new migration file, `0115_merch_lulu_pod.sql`, generated via `npm run db:generate` then hand-made idempotent. The enum `ADD VALUE IF NOT EXISTS 'lulu_pod'` may share the file with the column adds because nothing in the file *uses* the new value (same precedent as `0114_merch_digital.sql`). Never run `npm run db:push`.
- **Mock envs:** unit tests set `process.env.LULU_MOCK = "1"` themselves; API/E2E tests require the dev server started with `LULU_MOCK=1 R2_MOCK=1 CRON_SECRET=<x> E2E_TEST_ENDPOINTS=yes npm run dev:bws` and API tests run with the same `CRON_SECRET` + `TEST_BASE_URL=http://localhost:4321`.
- **Copy rule:** the mixed-cart rejection message is exactly: `Printed books ship separately — please order them on their own.`
- **Shipping levels:** `MAIL`, `PRIORITY_MAIL`, `GROUND`, `EXPEDITED`, `EXPRESS`; buyer-facing labels: Mail, Priority Mail, Ground, Expedited, Express.
- **Typecheck must stay clean:** `npx tsc --noEmit` → zero errors after every task.
- Commit after every green step; message prefix `feat(merch):`, `test(merch):`, or `docs(merch):`.

---

### Task 1: Schema + migration 0115

**Files:**
- Modify: `src/lib/db/schema/merch-orders.ts` (enum at line 10-15; orders table cols after line 52)
- Modify: `src/lib/db/schema/merch.ts` (product cols after line 54)
- Create (generated): `src/lib/db/migrations/0115_merch_lulu_pod.sql`

**Interfaces:**
- Produces: enum value `"lulu_pod"` on `merch_fulfillment_type`; `merchProducts.luluPodPackageId | luluPageCount | luluInteriorAssetKey | luluCoverAssetKey`; `merchOrders.luluPrintJobId | luluShippingLevel`. All nullable.

- [ ] **Step 1: Add `"lulu_pod"` to the enum** in `src/lib/db/schema/merch-orders.ts`:

```ts
export const merchFulfillmentTypeEnum = pgEnum("merch_fulfillment_type", [
  "printful_pod",
  "self_shipped",
  "pickup",
  "digital",
  "lulu_pod",
]);
```

- [ ] **Step 2: Add order columns** in the same file, directly after `printfulOrderId` (line 52):

```ts
    // Lulu POD (merch Lulu phase). luluPrintJobId doubles as the submission
    // idempotency guard and the status-poll key; luluShippingLevel is the
    // buyer-picked level, needed at print-job submission time.
    luluPrintJobId: varchar("lulu_print_job_id", { length: 64 }),
    luluShippingLevel: varchar("lulu_shipping_level", { length: 20 }),
```

- [ ] **Step 3: Add product columns** in `src/lib/db/schema/merch.ts`, directly after `digitalAssetName` (line 54):

```ts
    // Lulu POD print books. Nullable: only set for fulfillmentType "lulu_pod".
    // The two asset keys are R2 objects (print-ready PDFs) uploaded via the
    // admin editor; podPackageId is Lulu's format SKU; pageCount feeds cost calc.
    luluPodPackageId: varchar("lulu_pod_package_id", { length: 32 }),
    luluPageCount: integer("lulu_page_count"),
    luluInteriorAssetKey: varchar("lulu_interior_asset_key", { length: 500 }),
    luluCoverAssetKey: varchar("lulu_cover_asset_key", { length: 500 }),
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate -- --name merch_lulu_pod`
Expected: a new file `src/lib/db/migrations/0115_merch_lulu_pod.sql` (drizzle may add a random suffix name — rename the file to `0115_merch_lulu_pod.sql` and fix the corresponding entry in `src/lib/db/migrations/meta/_journal.json` if you rename).

- [ ] **Step 5: Make the migration idempotent** — edit it to match the 0114 pattern exactly:

```sql
-- Merch Lulu POD: print books fulfilled by Lulu. Idempotent (re-run-safe).
-- The enum ADD VALUE is safe in this file because nothing here uses 'lulu_pod'
-- (columns are plain varchar/integer) — same precedent as 0114.
ALTER TYPE "public"."merch_fulfillment_type" ADD VALUE IF NOT EXISTS 'lulu_pod';--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "lulu_pod_package_id" varchar(32);--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "lulu_page_count" integer;--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "lulu_interior_asset_key" varchar(500);--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "lulu_cover_asset_key" varchar(500);--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "lulu_print_job_id" varchar(64);--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "lulu_shipping_level" varchar(20);
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema/merch-orders.ts src/lib/db/schema/merch.ts src/lib/db/migrations/
git commit -m "feat(merch): lulu_pod fulfillment type + book/order columns (migration 0115)"
```

---

### Task 2: Lulu formats, types, client (mock-first) + env plumbing

**Files:**
- Create: `src/lib/lulu/formats.ts`
- Create: `src/lib/lulu/types.ts`
- Create: `src/lib/lulu/client.ts`
- Test: `tests/unit/lulu/client.test.ts`, `tests/unit/lulu/formats.test.ts`
- Modify: `.env.example` (append), `.github/workflows/ci.yml` (env block near line 51)

**Interfaces:**
- Produces:
  - `formats.ts`: `type LuluFormat = "6x9_bw" | "6x9_color"`; `LULU_FORMATS: Record<LuluFormat, { label: string; podPackageId: string }>`; `podPackageIdForFormat(f: LuluFormat): string`; `isLuluFormat(s: string): s is LuluFormat`
  - `types.ts`: `LULU_SHIPPING_LEVELS` const array; `type LuluShippingLevel`; `LULU_LEVEL_LABELS: Record<LuluShippingLevel, string>`; `interface LuluCostLineItem { podPackageId: string; pageCount: number; quantity: number }`; `interface LuluAddressInput { name: string; street1: string; street2?: string | null; city: string; stateCode: string; postcode: string; countryCode: string; phoneNumber?: string | null }`; `interface LuluPrintJobLineItemInput extends LuluCostLineItem { title: string; interiorUrl: string; coverUrl: string }`; `interface LuluTracking { trackingId: string | null; trackingUrl: string | null; carrier: string | null }`
  - `client.ts`: `isLuluConfigured(): boolean`; `class LuluApiError extends Error { status: number }`; `class LuluNotConfiguredError extends Error`; `calculatePrintJobCost(args: { lineItems: LuluCostLineItem[]; address: LuluAddressInput; level: LuluShippingLevel }): Promise<{ shippingCents: number; printCents: number }>`; `createPrintJob(args: { externalId: string; contactEmail: string; lineItems: LuluPrintJobLineItemInput[]; address: LuluAddressInput; level: LuluShippingLevel }): Promise<{ id: string; status: string }>`; `getPrintJob(id: string): Promise<{ id: string; status: string; tracking: LuluTracking }>`

- [ ] **Step 1: Write the failing tests** — `tests/unit/lulu/formats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LULU_FORMATS, podPackageIdForFormat, isLuluFormat } from "@/lib/lulu/formats";

describe("lulu formats", () => {
  it("maps both curated formats to 6x9 package ids", () => {
    expect(podPackageIdForFormat("6x9_bw")).toBe("0600X0900BWSTDPB060UW444MXX");
    expect(podPackageIdForFormat("6x9_color")).toBe("0600X0900FCSTDPB060UW444MXX");
  });
  it("labels are buyer-readable", () => {
    expect(LULU_FORMATS["6x9_bw"].label).toMatch(/black\s*&\s*white/i);
    expect(LULU_FORMATS["6x9_color"].label).toMatch(/color/i);
  });
  it("isLuluFormat guards unknown strings", () => {
    expect(isLuluFormat("6x9_bw")).toBe(true);
    expect(isLuluFormat("a4_glossy")).toBe(false);
  });
});
```

and `tests/unit/lulu/client.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import {
  isLuluConfigured, calculatePrintJobCost, createPrintJob, getPrintJob,
} from "@/lib/lulu/client";

const address = {
  name: "Test Buyer", street1: "123 Test St", city: "Columbus",
  stateCode: "OH", postcode: "43085", countryCode: "US",
};
const line = { podPackageId: "0600X0900BWSTDPB060UW444MXX", pageCount: 40, quantity: 2 };

describe("lulu client (LULU_MOCK)", () => {
  beforeAll(() => { process.env.LULU_MOCK = "1"; });

  it("isLuluConfigured true under mock", () => {
    expect(isLuluConfigured()).toBe(true);
  });
  it("cost calc returns per-level shipping cents and quantity-scaled print cents", async () => {
    const mail = await calculatePrintJobCost({ lineItems: [line], address, level: "MAIL" });
    const express = await calculatePrintJobCost({ lineItems: [line], address, level: "EXPRESS" });
    expect(mail.shippingCents).toBe(399);
    expect(express.shippingCents).toBe(2499);
    expect(mail.printCents).toBe(700 * 2);
  });
  it("createPrintJob echoes a deterministic mock id", async () => {
    const job = await createPrintJob({
      externalId: "order-1", contactEmail: "b@x.com",
      lineItems: [{ ...line, title: "Guide", interiorUrl: "https://x/i.pdf", coverUrl: "https://x/c.pdf" }],
      address, level: "MAIL",
    });
    expect(job.id).toBe("mock-lulu-order-1");
    expect(job.status).toBe("CREATED");
  });
  it("getPrintJob reports SHIPPED with tracking under mock", async () => {
    const job = await getPrintJob("mock-lulu-order-1");
    expect(job.status).toBe("SHIPPED");
    expect(job.tracking.trackingId).toBe("MOCK-TRACK-123");
    expect(job.tracking.carrier).toBe("USPS");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lulu --config vitest.unit.config.ts` (check the actual unit config filename with `ls vitest*.config.*` and use whatever `npm run test:unit`—see package.json—uses; if a plain `npx vitest run tests/unit/lulu` works for other unit tests, use that).
Expected: FAIL — cannot resolve `@/lib/lulu/formats`.

- [ ] **Step 3: Implement** — `src/lib/lulu/formats.ts`:

```ts
/** Curated Lulu formats. Admin picks a format; the pod_package_id is derived
 * here — raw SKUs never cross the API boundary. IDs are Lulu's documented
 * 6×9 (0600X0900) perfect-bound trade paperback on 60# uncoated white with
 * a matte cover; BW = black & white interior, FC = full color. Verify against
 * Lulu's spec generator before go-live (sandbox print-job validation will
 * also reject a bad id). */
export type LuluFormat = "6x9_bw" | "6x9_color";

export const LULU_FORMATS: Record<LuluFormat, { label: string; podPackageId: string }> = {
  "6x9_bw": { label: '6×9" paperback — black & white interior', podPackageId: "0600X0900BWSTDPB060UW444MXX" },
  "6x9_color": { label: '6×9" paperback — color interior', podPackageId: "0600X0900FCSTDPB060UW444MXX" },
};

export function isLuluFormat(s: string): s is LuluFormat {
  return s in LULU_FORMATS;
}

export function podPackageIdForFormat(f: LuluFormat): string {
  return LULU_FORMATS[f].podPackageId;
}
```

`src/lib/lulu/types.ts`:

```ts
export const LULU_SHIPPING_LEVELS = ["MAIL", "PRIORITY_MAIL", "GROUND", "EXPEDITED", "EXPRESS"] as const;
export type LuluShippingLevel = (typeof LULU_SHIPPING_LEVELS)[number];

export const LULU_LEVEL_LABELS: Record<LuluShippingLevel, string> = {
  MAIL: "Mail",
  PRIORITY_MAIL: "Priority Mail",
  GROUND: "Ground",
  EXPEDITED: "Expedited",
  EXPRESS: "Express",
};

export interface LuluCostLineItem {
  podPackageId: string;
  pageCount: number;
  quantity: number;
}

export interface LuluAddressInput {
  name: string;
  street1: string;
  street2?: string | null;
  city: string;
  stateCode: string;
  postcode: string;
  countryCode: string;
  phoneNumber?: string | null;
}

export interface LuluPrintJobLineItemInput extends LuluCostLineItem {
  title: string;
  interiorUrl: string;
  coverUrl: string;
}

export interface LuluTracking {
  trackingId: string | null;
  trackingUrl: string | null;
  carrier: string | null;
}
```

`src/lib/lulu/client.ts`:

```ts
import type {
  LuluCostLineItem, LuluAddressInput, LuluPrintJobLineItemInput,
  LuluShippingLevel, LuluTracking,
} from "./types";

// process.env first — Netlify SSR inlines import.meta.env at build time, so a
// rotated runtime secret only reads reliably via process.env (same as printful/client.ts).
const env = (k: string): string | undefined =>
  process.env[k] ?? (import.meta as any).env?.[k];

const apiBase = (): string => env("LULU_API_BASE") ?? "https://api.lulu.com";
const isMock = (): boolean => env("LULU_MOCK") === "1";

export class LuluNotConfiguredError extends Error {
  constructor() { super("LULU_CLIENT_KEY / LULU_CLIENT_SECRET are not set"); this.name = "LuluNotConfiguredError"; }
}
export class LuluApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "LuluApiError"; }
}

export function isLuluConfigured(): boolean {
  return isMock() || Boolean(env("LULU_CLIENT_KEY") && env("LULU_CLIENT_SECRET"));
}

// ---- OAuth2 client-credentials token, cached until shortly before expiry ----
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const key = env("LULU_CLIENT_KEY");
  const secret = env("LULU_CLIENT_SECRET");
  if (!key || !secret) throw new LuluNotConfiguredError();
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const res = await fetch(`${apiBase()}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !json?.access_token) {
    throw new LuluApiError(res.status, `Lulu token request failed: ${res.statusText}`);
  }
  cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 300) * 1000 };
  return cachedToken.token;
}

async function luluFetch<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || json === null) {
    throw new LuluApiError(res.status, `Lulu ${method} ${path} failed: ${res.statusText}`);
  }
  return json;
}

/** Lulu returns money as decimal strings (e.g. "12.34"). */
function toCents(s: string | number | null | undefined): number {
  if (s == null) return 0;
  const n = typeof s === "number" ? s : parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toLuluAddressPayload(a: LuluAddressInput) {
  return {
    name: a.name,
    street1: a.street1,
    ...(a.street2 ? { street2: a.street2 } : {}),
    city: a.city,
    state_code: a.stateCode,
    postcode: a.postcode,
    country_code: a.countryCode,
    ...(a.phoneNumber ? { phone_number: a.phoneNumber } : {}),
  };
}

// Mock shipping table — keep in sync with tests/unit/lulu/client.test.ts.
const MOCK_SHIPPING_CENTS: Record<LuluShippingLevel, number> = {
  MAIL: 399, PRIORITY_MAIL: 899, GROUND: 599, EXPEDITED: 1299, EXPRESS: 2499,
};
const MOCK_PRINT_CENTS_PER_UNIT = 700;

/** Per-level cost: one POST /print-job-cost-calculations/ call. */
export async function calculatePrintJobCost(args: {
  lineItems: LuluCostLineItem[];
  address: LuluAddressInput;
  level: LuluShippingLevel;
}): Promise<{ shippingCents: number; printCents: number }> {
  if (isMock()) {
    const qty = args.lineItems.reduce((s, l) => s + l.quantity, 0);
    return { shippingCents: MOCK_SHIPPING_CENTS[args.level], printCents: MOCK_PRINT_CENTS_PER_UNIT * qty };
  }
  const res = await luluFetch<{
    line_item_costs?: { total_cost_incl_tax?: string }[] | null;
    shipping_cost?: { total_cost_incl_tax?: string } | null;
  }>("POST", "/print-job-cost-calculations/", {
    line_items: args.lineItems.map((l) => ({
      pod_package_id: l.podPackageId, page_count: l.pageCount, quantity: l.quantity,
    })),
    shipping_address: toLuluAddressPayload(args.address),
    shipping_option: args.level,
  });
  const printCents = (res.line_item_costs ?? []).reduce((s, li) => s + toCents(li.total_cost_incl_tax), 0);
  return { shippingCents: toCents(res.shipping_cost?.total_cost_incl_tax), printCents };
}

/** Create (and pay for, via the Lulu account's stored payment method) a print job. */
export async function createPrintJob(args: {
  externalId: string;
  contactEmail: string;
  lineItems: LuluPrintJobLineItemInput[];
  address: LuluAddressInput;
  level: LuluShippingLevel;
}): Promise<{ id: string; status: string }> {
  if (isMock()) return { id: `mock-lulu-${args.externalId}`, status: "CREATED" };
  const res = await luluFetch<{ id: number | string; status?: { name?: string } }>("POST", "/print-jobs/", {
    contact_email: args.contactEmail,
    external_id: args.externalId,
    line_items: args.lineItems.map((l) => ({
      title: l.title,
      pod_package_id: l.podPackageId,
      page_count: l.pageCount,
      quantity: l.quantity,
      printable_normalization: {
        interior: { source_url: l.interiorUrl },
        cover: { source_url: l.coverUrl },
      },
    })),
    shipping_address: toLuluAddressPayload(args.address),
    shipping_level: args.level,
  });
  return { id: String(res.id), status: res.status?.name ?? "CREATED" };
}

export async function getPrintJob(id: string): Promise<{ id: string; status: string; tracking: LuluTracking }> {
  if (isMock()) {
    return {
      id, status: "SHIPPED",
      tracking: { trackingId: "MOCK-TRACK-123", trackingUrl: "https://tracking.example/MOCK-TRACK-123", carrier: "USPS" },
    };
  }
  const res = await luluFetch<{
    id: number | string;
    status?: { name?: string } | null;
    line_items?: { tracking_id?: string | null; tracking_urls?: string[] | null; carrier_name?: string | null }[] | null;
  }>("GET", `/print-jobs/${id}/`);
  const li = (res.line_items ?? []).find((l) => l.tracking_id) ?? null;
  return {
    id: String(res.id),
    status: res.status?.name ?? "UNKNOWN",
    tracking: {
      trackingId: li?.tracking_id ?? null,
      trackingUrl: li?.tracking_urls?.[0] ?? null,
      carrier: li?.carrier_name ?? null,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: the same vitest command as Step 2.
Expected: PASS (7 tests).

- [ ] **Step 5: Env plumbing.** Append to `.env.example`:

```
# Lulu print-on-demand (merch print books). Sandbox base for staging/local:
# https://api.sandbox.lulu.com — omit LULU_API_BASE for production.
LULU_CLIENT_KEY=
LULU_CLIENT_SECRET=
LULU_API_BASE=
# Business contact phone sent on Lulu shipping addresses (some carriers require it)
LULU_CONTACT_PHONE=
# Set to 1 to use the built-in mock client (CI, local tests)
LULU_MOCK=
```

In `.github/workflows/ci.yml`, add `LULU_MOCK: '1'` in the same env block that sets `R2_MOCK: '1'` (line ~51).

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit` → 0 errors.

```bash
git add src/lib/lulu/ tests/unit/lulu/ .env.example .github/workflows/ci.yml
git commit -m "feat(merch): Lulu client (OAuth2 + cost calc + print jobs) with LULU_MOCK and curated 6x9 formats"
```

---

### Task 3: Cart / reprice / partition plumbing + books-only rule

**Files:**
- Modify: `src/lib/merch/reprice.ts` (type at line 5; interfaces at 7-43; select at 84-108)
- Modify: `src/lib/merch/checkout-store.ts` (whole file is 27 lines)
- Modify: `src/lib/merch/cart.ts` (line 5)
- Test: `tests/unit/merch/checkout-store.test.ts` (append), `tests/unit/merch/reprice.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `MerchFulfillmentType` and `CartFulfillmentType` unions gain `"lulu_pod"`.
  - `RepricedLine` gains `luluPodPackageId: string | null; luluPageCount: number | null` (also on `VariantPriceRow`).
  - `partitionByFulfillment(lines)` return gains `lulu: RepricedLine[]`.
  - `lineNeedsShipping` returns true for `"lulu_pod"`.
  - NEW `cartMixesLuluWithOtherPhysical(lines: Pick<RepricedLine, "fulfillmentType">[]): boolean` — true iff the cart has a lulu line AND any line that is neither `lulu_pod` nor `digital`.

- [ ] **Step 1: Write failing tests.** Append to `tests/unit/merch/checkout-store.test.ts`:

```ts
import { cartMixesLuluWithOtherPhysical } from "@/lib/merch/checkout-store";

describe("cartMixesLuluWithOtherPhysical", () => {
  it("false with no lulu lines", () => {
    expect(cartMixesLuluWithOtherPhysical([{ fulfillmentType: "printful_pod" }])).toBe(false);
  });
  it("false for lulu-only and lulu+digital carts", () => {
    expect(cartMixesLuluWithOtherPhysical([{ fulfillmentType: "lulu_pod" }])).toBe(false);
    expect(cartMixesLuluWithOtherPhysical([{ fulfillmentType: "lulu_pod" }, { fulfillmentType: "digital" }])).toBe(false);
  });
  it("true when lulu mixes with any other physical type", () => {
    for (const other of ["printful_pod", "self_shipped", "pickup"] as const) {
      expect(cartMixesLuluWithOtherPhysical([{ fulfillmentType: "lulu_pod" }, { fulfillmentType: other }])).toBe(true);
    }
  });
});

describe("lulu_pod plumbing", () => {
  it("lulu_pod needs shipping (address required)", () => {
    expect(lineNeedsShipping({ fulfillmentType: "lulu_pod" })).toBe(true);
  });
  it("partition exposes lulu lines", () => {
    const line = { fulfillmentType: "lulu_pod" } as any;
    expect(partitionByFulfillment([line]).lulu).toEqual([line]);
  });
});
```

(Reuse the file's existing imports of `lineNeedsShipping` / `partitionByFulfillment`; add any missing ones.)

- [ ] **Step 2: Run to verify failure** — same unit-test command pattern as Task 2; expect FAIL (`cartMixesLuluWithOtherPhysical` not exported).

- [ ] **Step 3: Implement.**

`src/lib/merch/cart.ts` line 5:

```ts
export type CartFulfillmentType = "printful_pod" | "self_shipped" | "pickup" | "digital" | "lulu_pod";
```

`src/lib/merch/reprice.ts`: extend the type union and both interfaces, and the select:

```ts
export type MerchFulfillmentType = "printful_pod" | "self_shipped" | "pickup" | "digital" | "lulu_pod";
```

Add to `RepricedLine` (after `heightIn`) and to `VariantPriceRow` (after `heightIn`):

```ts
  // Lulu POD book metadata (null for non-book lines) — feeds the Lulu cost calc.
  luluPodPackageId: string | null;
  luluPageCount: number | null;
```

In `matchRequestedToRows`, copy them through: add `luluPodPackageId: r.luluPodPackageId, luluPageCount: r.luluPageCount,` to the pushed line. In `repriceStoreCartItems`'s `.select({...})`, add:

```ts
      luluPodPackageId: merchProducts.luluPodPackageId,
      luluPageCount: merchProducts.luluPageCount,
```

Also check `src/lib/merch/bundle-checkout.ts` — `explodeBundles` builds `RepricedLine`s too; add the two new fields (`luluPodPackageId: null, luluPageCount: null` if bundles never contain books, which is correct for v1) wherever it constructs lines, or extend its select the same way if it reads products. Run tsc to find every constructor the type change breaks and set the fields explicitly.

`src/lib/merch/checkout-store.ts`:

```ts
export function lineNeedsShipping(line: Pick<RepricedLine, "fulfillmentType">): boolean {
  return line.fulfillmentType === "printful_pod" || line.fulfillmentType === "self_shipped" || line.fulfillmentType === "lulu_pod";
}
```

Add `lulu` to the partition:

```ts
export function partitionByFulfillment(lines: RepricedLine[]): {
  printful: RepricedLine[];
  selfShipped: RepricedLine[];
  pickup: RepricedLine[];
  lulu: RepricedLine[];
} {
  return {
    printful: lines.filter((l) => l.fulfillmentType === "printful_pod"),
    selfShipped: lines.filter((l) => l.fulfillmentType === "self_shipped"),
    pickup: lines.filter((l) => l.fulfillmentType === "pickup"),
    lulu: lines.filter((l) => l.fulfillmentType === "lulu_pod"),
  };
}

/** Books-only carts (Lulu v1): a cart with a lulu_pod line may only contain
 * lulu_pod + digital lines. Two providers' shipping quotes + fulfillment
 * submissions in one order is deferred scope — reject the mix at quote AND
 * checkout so the two can never disagree. */
export function cartMixesLuluWithOtherPhysical(lines: Pick<RepricedLine, "fulfillmentType">[]): boolean {
  if (!lines.some((l) => l.fulfillmentType === "lulu_pod")) return false;
  return lines.some((l) => l.fulfillmentType !== "lulu_pod" && l.fulfillmentType !== "digital");
}
```

- [ ] **Step 4: Run tests** → PASS. Run `npx tsc --noEmit` → fix any `RepricedLine` constructors the new fields broke (expected: `bundle-checkout.ts`, possibly test fixtures in `tests/unit/merch/reprice.test.ts` / `checkout-store.test.ts` — set both fields to `null`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/merch/cart.ts src/lib/merch/reprice.ts src/lib/merch/checkout-store.ts src/lib/merch/bundle-checkout.ts tests/unit/merch/
git commit -m "feat(merch): lulu_pod cart plumbing — partition, shipping-need, books-only-cart rule"
```

---

### Task 4: Lulu shipping resolvers (`lulu-shipping.ts`)

**Files:**
- Create: `src/lib/merch/lulu-shipping.ts`
- Test: `tests/unit/merch/lulu-shipping.test.ts`

**Interfaces:**
- Consumes: `calculatePrintJobCost`, `isLuluConfigured`, `LuluApiError` from `@/lib/lulu/client`; `LULU_SHIPPING_LEVELS`, `LULU_LEVEL_LABELS`, types from `@/lib/lulu/types`; `MerchShippingAddress` from `@/lib/db/schema`.
- Produces:
  - `interface LuluShippingOption { level: LuluShippingLevel; label: string; amountCents: number }`
  - `resolveLuluShippingOptions(address: MerchShippingAddress, lines: { luluPodPackageId: string | null; luluPageCount: number | null; quantity: number; productName: string }[]): Promise<{ ok: true; options: LuluShippingOption[] } | { ok: false; status: number; error: string }>` — 503 unconfigured, 422 misconfigured product / unshippable address, options sorted cheapest-first.
  - `pickLuluOption(options: LuluShippingOption[], level?: string | null): LuluShippingOption | null` — named level or cheapest; null if named level absent.
  - `toLuluAddress(a: MerchShippingAddress): LuluAddressInput` (adds `LULU_CONTACT_PHONE` when set).

- [ ] **Step 1: Failing tests** — `tests/unit/merch/lulu-shipping.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { resolveLuluShippingOptions, pickLuluOption } from "@/lib/merch/lulu-shipping";

const address = { name: "B", address1: "1 St", city: "Columbus", state: "OH", zip: "43085", country: "US" };
const bookLine = { luluPodPackageId: "0600X0900BWSTDPB060UW444MXX", luluPageCount: 40, quantity: 1, productName: "Guide" };

describe("resolveLuluShippingOptions (LULU_MOCK)", () => {
  beforeAll(() => { process.env.LULU_MOCK = "1"; });

  it("returns all 5 levels sorted cheapest-first with labels", async () => {
    const r = await resolveLuluShippingOptions(address, [bookLine]);
    if (!r.ok) throw new Error(r.error);
    expect(r.options.map((o) => o.level)).toEqual(["MAIL", "GROUND", "PRIORITY_MAIL", "EXPEDITED", "EXPRESS"]);
    expect(r.options[0]).toEqual({ level: "MAIL", label: "Mail", amountCents: 399 });
  });

  it("422s a book line missing its package id or page count", async () => {
    const r = await resolveLuluShippingOptions(address, [{ ...bookLine, luluPageCount: null }]);
    expect(r).toMatchObject({ ok: false, status: 422 });
  });
});

describe("pickLuluOption", () => {
  const opts = [
    { level: "MAIL" as const, label: "Mail", amountCents: 399 },
    { level: "EXPRESS" as const, label: "Express", amountCents: 2499 },
  ];
  it("defaults to cheapest (first)", () => {
    expect(pickLuluOption(opts, null)?.level).toBe("MAIL");
  });
  it("honors a named level", () => {
    expect(pickLuluOption(opts, "EXPRESS")?.amountCents).toBe(2499);
  });
  it("null for an unavailable level", () => {
    expect(pickLuluOption(opts, "GROUND")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** (module not found).

- [ ] **Step 3: Implement** — `src/lib/merch/lulu-shipping.ts`:

```ts
import {
  calculatePrintJobCost, isLuluConfigured, LuluApiError,
} from "@/lib/lulu/client";
import {
  LULU_SHIPPING_LEVELS, LULU_LEVEL_LABELS,
  type LuluShippingLevel, type LuluAddressInput, type LuluCostLineItem,
} from "@/lib/lulu/types";
import type { MerchShippingAddress } from "@/lib/db/schema";

export interface LuluShippingOption {
  level: LuluShippingLevel;
  label: string;
  amountCents: number;
}

export interface LuluQuoteLine {
  luluPodPackageId: string | null;
  luluPageCount: number | null;
  quantity: number;
  productName: string;
}

export type LuluOptionsResult =
  | { ok: true; options: LuluShippingOption[] }
  | { ok: false; status: number; error: string };

export function toLuluAddress(a: MerchShippingAddress): LuluAddressInput {
  return {
    name: a.name,
    street1: a.address1,
    street2: a.address2 ?? null,
    city: a.city,
    stateCode: a.state,
    postcode: a.zip,
    countryCode: a.country,
    phoneNumber: process.env.LULU_CONTACT_PHONE ?? null,
  };
}

function toCostLineItems(lines: LuluQuoteLine[]): { ok: true; items: LuluCostLineItem[] } | { ok: false; missing: string[] } {
  const missing = lines.filter((l) => !l.luluPodPackageId || !l.luluPageCount || l.luluPageCount <= 0).map((l) => l.productName);
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    items: lines.map((l) => ({
      podPackageId: l.luluPodPackageId as string,
      pageCount: l.luluPageCount as number,
      quantity: l.quantity,
    })),
  };
}

/**
 * Server-authoritative live shipping options for a books-only cart: one Lulu
 * cost-calc call per level (a level Lulu rejects for this destination is
 * skipped, not fatal), sorted cheapest-first. Mirrors resolveSelfShippedRate's
 * posture: unconfigured provider fails closed (503) rather than charging $0.
 */
export async function resolveLuluShippingOptions(
  address: MerchShippingAddress,
  lines: LuluQuoteLine[],
): Promise<LuluOptionsResult> {
  if (!isLuluConfigured()) return { ok: false, status: 503, error: "Shipping unavailable" };

  const cost = toCostLineItems(lines);
  if (!cost.ok) {
    return { ok: false, status: 422, error: `Book printing isn't configured for: ${cost.missing.join(", ")}` };
  }

  const luluAddress = toLuluAddress(address);
  const options: LuluShippingOption[] = [];
  for (const level of LULU_SHIPPING_LEVELS) {
    try {
      const { shippingCents } = await calculatePrintJobCost({ lineItems: cost.items, address: luluAddress, level });
      options.push({ level, label: LULU_LEVEL_LABELS[level], amountCents: shippingCents });
    } catch (e) {
      // Per-level failure = that level isn't offered for this destination.
      // A non-Lulu error is a real bug — rethrow it.
      if (!(e instanceof LuluApiError)) throw e;
    }
  }
  if (options.length === 0) return { ok: false, status: 422, error: "We can't ship to that address" };
  options.sort((a, b) => a.amountCents - b.amountCents);
  return { ok: true, options };
}

/** Named level from the options list, or the cheapest when level is absent.
 * Null when a named level isn't offered — callers 422, never silently
 * substitute (the buyer approved a specific price). */
export function pickLuluOption(options: LuluShippingOption[], level?: string | null): LuluShippingOption | null {
  if (!level) return options[0] ?? null;
  return options.find((o) => o.level === level) ?? null;
}
```

- [ ] **Step 4: Run tests** → PASS. `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/merch/lulu-shipping.ts tests/unit/merch/lulu-shipping.test.ts
git commit -m "feat(merch): live Lulu shipping options resolver (per-level cost calc, cheapest-first)"
```

---

### Task 5: Quote endpoint — books-only gate + shipping options

**Files:**
- Modify: `src/pages/api/merch/quote.ts`
- Test: `tests/api/merch/lulu-quote.test.ts`

**Interfaces:**
- Consumes: `partitionByFulfillment` (now with `.lulu`), `cartMixesLuluWithOtherPhysical`, `resolveLuluShippingOptions`, `pickLuluOption`.
- Produces (request): body gains optional `luluShippingLevel: z.enum(["MAIL","PRIORITY_MAIL","GROUND","EXPEDITED","EXPRESS"]).optional().nullable()`.
- Produces (response): when the cart has lulu lines, the JSON gains `luluShippingOptions: { level, label, amountCents }[]` and `luluShippingLevel: <selected level>`; `shippingCents` reflects the selected (or cheapest) option.

- [ ] **Step 1: Write the failing API test** — `tests/api/merch/lulu-quote.test.ts`. Follow the fixture pattern of `tests/api/merch/digital-download.test.ts` (direct db inserts, `E2E_ORG_ID`, `testSlug`, cleanup in `afterAll`):

```ts
/**
 * Lulu book quote (merch Lulu phase): POST /api/merch/quote for a books cart.
 * Requires the dev server to run with LULU_MOCK=1 (CI sets it; see ci.yml).
 *
 * Covers: a book line + address returns luluShippingOptions (5 mock levels,
 * cheapest MAIL selected by default); luluShippingLevel=EXPRESS re-prices
 * shippingCents; a book mixed with a pickup line 422s with the books-only
 * message; a book line without an address 422s.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchStores, merchProducts, merchVariants } from "@/lib/db/schema";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { apiFetch, expectJson, testSlug } from "../setup/test-helpers";

const address = { name: "Buyer", address1: "1 Test St", city: "Columbus", state: "OH", zip: "43085", country: "US" };

let storeId: string;
let bookVariantId: string;
let pickupVariantId: string;

beforeAll(async () => {
  const db = getDb();
  const [store] = await db.insert(merchStores).values({
    organizationId: E2E_ORG_ID, scope: "general", name: "Lulu Quote Test Store",
    slug: testSlug("lulu-quote"), visibility: "public", active: true,
  }).returning();
  storeId = store.id;

  const [book] = await db.insert(merchProducts).values({
    organizationId: E2E_ORG_ID, storeId, source: "manual", fulfillmentType: "lulu_pod",
    name: "Test Print Guide", slug: testSlug("print-guide"), category: "other",
    luluPodPackageId: "0600X0900BWSTDPB060UW444MXX", luluPageCount: 40,
    luluInteriorAssetKey: `merch-books/${E2E_ORG_ID}/interior.pdf`,
    luluCoverAssetKey: `merch-books/${E2E_ORG_ID}/cover.pdf`,
    active: true,
  }).returning();
  const [bv] = await db.insert(merchVariants).values({
    productId: book.id, name: "Test Print Guide", retailPriceCents: 1500, active: true,
  }).returning();
  bookVariantId = bv.id;

  const [pickup] = await db.insert(merchProducts).values({
    organizationId: E2E_ORG_ID, storeId, source: "manual", fulfillmentType: "pickup",
    name: "Test Tee", slug: testSlug("tee"), category: "t_shirt", active: true,
  }).returning();
  const [pv] = await db.insert(merchVariants).values({
    productId: pickup.id, name: "Test Tee / M", size: "M", retailPriceCents: 900, active: true,
  }).returning();
  pickupVariantId = pv.id;
});

afterAll(async () => {
  await getDb().delete(merchStores).where(eq(merchStores.id, storeId)); // cascades products/variants
});

describe("POST /api/merch/quote — lulu books", () => {
  it("returns live level options, cheapest selected by default", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({ storeId, address, items: [{ variantId: bookVariantId, quantity: 1 }] }),
    });
    const json = await expectJson(res, 200);
    expect(json.luluShippingOptions).toHaveLength(5);
    expect(json.luluShippingOptions[0]).toMatchObject({ level: "MAIL", amountCents: 399 });
    expect(json.luluShippingLevel).toBe("MAIL");
    expect(json.shippingCents).toBe(399);
    expect(json.subtotalCents).toBe(1500);
  });

  it("re-prices for an explicitly selected level", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({
        storeId, address, luluShippingLevel: "EXPRESS",
        items: [{ variantId: bookVariantId, quantity: 1 }],
      }),
    });
    const json = await expectJson(res, 200);
    expect(json.luluShippingLevel).toBe("EXPRESS");
    expect(json.shippingCents).toBe(2499);
  });

  it("422s a book mixed with another physical line", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({
        storeId, address,
        items: [{ variantId: bookVariantId, quantity: 1 }, { variantId: pickupVariantId, quantity: 1 }],
      }),
    });
    const json = await expectJson(res, 422);
    expect(json.error).toBe("Printed books ship separately — please order them on their own.");
  });

  it("422s a book cart without an address", async () => {
    const res = await apiFetch("/api/merch/quote", {
      method: "POST",
      body: JSON.stringify({ storeId, address: null, items: [{ variantId: bookVariantId, quantity: 1 }] }),
    });
    await expectJson(res, 422);
  });
});
```

(If `apiFetch`/`expectJson` signatures differ, mirror exactly how `digital-download.test.ts` and `quote.test.ts` call them.)

- [ ] **Step 2: Run to verify failure** (dev server up with the Global-Constraints env):

Run: `CRON_SECRET=<same> TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/merch/lulu-quote.test.ts --config <the api vitest config used by npm run test:api>`
Expected: FAIL — no `luluShippingOptions` in response; mixed cart currently 200s or 503s.

- [ ] **Step 3: Implement in `src/pages/api/merch/quote.ts`.**

Add imports:

```ts
import { partitionByFulfillment, cartMixesLuluWithOtherPhysical } from "@/lib/merch/checkout-store";
import { resolveLuluShippingOptions, pickLuluOption, type LuluShippingOption } from "@/lib/merch/lulu-shipping";
```

Add to the zod schema (after `bundles`):

```ts
  luluShippingLevel: z.enum(["MAIL", "PRIORITY_MAIL", "GROUND", "EXPEDITED", "EXPRESS"]).optional().nullable(),
```

After `const priced = [...]` / empty-cart check (line ~80) and before the partition:

```ts
  if (cartMixesLuluWithOtherPhysical(priced)) {
    return json({ error: "Printed books ship separately — please order them on their own." }, 422);
  }
```

Change the partition destructure to `const { printful, selfShipped, lulu } = partitionByFulfillment(priced);` and inside the `try`, after the selfShipped block, add:

```ts
    let luluShippingOptions: LuluShippingOption[] | null = null;
    let luluSelectedLevel: string | null = null;
    if (lulu.length) {
      if (!parsed.data.address) return json({ error: "Shipping address required" }, 422);
      const r = await resolveLuluShippingOptions(parsed.data.address, lulu);
      if (!r.ok) return json({ error: r.error }, r.status);
      const selected = pickLuluOption(r.options, parsed.data.luluShippingLevel);
      if (!selected) return json({ error: "That shipping option isn't available for your address" }, 422);
      luluShippingOptions = r.options;
      luluSelectedLevel = selected.level;
      shippingCents += selected.amountCents;
    }
```

And extend the success response object with:

```ts
      ...(luluShippingOptions ? { luluShippingOptions, luluShippingLevel: luluSelectedLevel } : {}),
```

- [ ] **Step 4: Run the test file** → PASS (4 tests). Also run the existing `tests/api/merch/quote.test.ts` to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/merch/quote.ts tests/api/merch/lulu-quote.test.ts
git commit -m "feat(merch): quote returns live Lulu shipping options; books-only cart gate"
```

---

### Task 6: Checkout endpoint — level validation + order persistence

**Files:**
- Modify: `src/pages/api/merch/checkout.ts`
- Test: `tests/api/merch/lulu-checkout.test.ts`

**Interfaces:**
- Consumes: same helpers as Task 5.
- Produces: checkout body gains the same optional `luluShippingLevel`; `merch_orders` rows for book carts carry `luluShippingLevel`; `shippingCents` is the server-re-validated amount for that level. Stripe line items keep `MERCH_TAX_CODE` (books are physical — no change needed; `buildMerchLineItems` already defaults non-digital lines to it).

- [ ] **Step 1: Failing API test** — `tests/api/merch/lulu-checkout.test.ts`. Same fixture block as Task 5's test (copy it — new store slug `lulu-checkout`), plus:

```ts
describe("POST /api/merch/checkout — lulu books", () => {
  it("books-only rule enforced at checkout too", async () => {
    const res = await apiFetch("/api/merch/checkout", {
      method: "POST",
      body: JSON.stringify({
        storeId, email: "buyer@test.aspiresports.com", address,
        items: [{ variantId: bookVariantId, quantity: 1 }, { variantId: pickupVariantId, quantity: 1 }],
      }),
    });
    const json = await expectJson(res, 422);
    expect(json.error).toBe("Printed books ship separately — please order them on their own.");
  });

  it("rejects an unavailable level with 422", async () => {
    const res = await apiFetch("/api/merch/checkout", {
      method: "POST",
      body: JSON.stringify({
        storeId, email: "buyer@test.aspiresports.com", address, luluShippingLevel: "NOT_A_LEVEL",
        items: [{ variantId: bookVariantId, quantity: 1 }],
      }),
    });
    await expectJson(res, 400); // zod enum rejects the shape outright
  });

  it("creates a pending order carrying the picked level and its re-validated price", async () => {
    const res = await apiFetch("/api/merch/checkout", {
      method: "POST",
      body: JSON.stringify({
        storeId, email: "buyer@test.aspiresports.com", address, luluShippingLevel: "EXPRESS",
        items: [{ variantId: bookVariantId, quantity: 1 }],
      }),
    });
    // Stripe must be configured on the dev server for the 200 path; gate like
    // other checkout tests (see tests/api/merch/checkout.test.ts / the
    // itWithStripe pattern from ci-api-tests-have-no-stripe) if CI lacks Stripe.
    const json = await expectJson(res, 200);
    expect(json.url).toContain("stripe");

    const db = getDb();
    const [order] = await db.select().from(merchOrders)
      .where(eq(merchOrders.storeId, storeId)).orderBy(desc(merchOrders.createdAt)).limit(1);
    expect(order.luluShippingLevel).toBe("EXPRESS");
    expect(order.shippingCents).toBe(2499);
    expect(order.status).toBe("pending");
  });
});
```

(Import `merchOrders`, `desc`. Check how `tests/api/merch/checkout.test.ts` gates on Stripe availability and copy that gate for the third test verbatim — CI has no Stripe key.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement in `src/pages/api/merch/checkout.ts`.** Mirror Task 5 exactly:
  - same import additions; same `luluShippingLevel` zod field;
  - same `cartMixesLuluWithOtherPhysical` 422 right after the empty-cart check (line ~105);
  - destructure `lulu` from `partitionByFulfillment`;
  - after the selfShipped block (line ~137) add:

```ts
    let luluLevel: string | null = null;
    if (lulu.length) {
      if (!parsed.data.address) return json({ error: "Shipping address required" }, 422);
      const r = await resolveLuluShippingOptions(parsed.data.address, lulu);
      if (!r.ok) return json({ error: r.error }, r.status);
      const selected = pickLuluOption(r.options, parsed.data.luluShippingLevel);
      if (!selected) return json({ error: "That shipping option isn't available for your address" }, 422);
      luluLevel = selected.level;
      shippingCents += selected.amountCents;
      shipService = selected.label;
    }
```

  - in the `db.insert(merchOrders).values({...})` add `luluShippingLevel: luluLevel,`.

- [ ] **Step 4: Run the new test file + existing `checkout.test.ts`** → PASS / no regressions. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/merch/checkout.ts tests/api/merch/lulu-checkout.test.ts
git commit -m "feat(merch): checkout re-validates the picked Lulu level server-side and stores it on the order"
```

---

### Task 7: Fulfillment — print-job submission on payment

**Files:**
- Create: `src/lib/merch/lulu-fulfillment.ts`
- Modify: `src/lib/merch/fulfillment.ts` (lines 21-23, 47-53, 176+)
- Test: `tests/unit/merch/fulfillment-dispatch.test.ts` (append), `tests/unit/merch/lulu-fulfillment.test.ts`

**Interfaces:**
- Consumes: `createPrintJob` from `@/lib/lulu/client`; `toLuluAddress` from `./lulu-shipping`; `getSignedGetUrl` from `@/lib/storage/r2`; order/product tables.
- Produces:
  - `orderFulfillmentPlan` return type gains `"lulu"`; `assertSupportedFulfillment` accepts `lulu_pod`.
  - `buildLuluPrintJobLines(items: { productName: string; quantity: number; luluPodPackageId: string | null; luluPageCount: number | null; interiorUrl: string; coverUrl: string }[]): LuluPrintJobLineItemInput[]` (pure; throws `Error` on a missing package/pageCount — submission-time misconfig must fail loudly, the catch in `handleMerchOrderCompleted` leaves the order `paid`).
  - `submitLuluOrder(orderId: string): Promise<{ luluPrintJobId: string }>` — idempotent (skips when `luluPrintJobId` already set or status `submitted`/`shipped`), signs both PDFs (72 h TTL), creates the print job with `externalId = orderId` and the order's `luluShippingLevel` (fallback `"MAIL"`), then sets `luluPrintJobId` + status `submitted`.

- [ ] **Step 1: Failing tests.** Append to `tests/unit/merch/fulfillment-dispatch.test.ts`:

```ts
  it("lulu when all physical items are lulu_pod", () => {
    expect(orderFulfillmentPlan([{ fulfillmentType: "lulu_pod" }])).toBe("lulu");
    expect(orderFulfillmentPlan([{ fulfillmentType: "lulu_pod" }, { fulfillmentType: "digital" }])).toBe("lulu");
  });
  it("printful catch-all when lulu is (impossibly) mixed with another physical type", () => {
    expect(orderFulfillmentPlan([{ fulfillmentType: "lulu_pod" }, { fulfillmentType: "printful_pod" }])).toBe("printful");
  });
```

New `tests/unit/merch/lulu-fulfillment.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLuluPrintJobLines } from "@/lib/merch/lulu-fulfillment";

const line = {
  productName: "Guide", quantity: 2,
  luluPodPackageId: "0600X0900BWSTDPB060UW444MXX", luluPageCount: 40,
  interiorUrl: "https://signed/i.pdf", coverUrl: "https://signed/c.pdf",
};

describe("buildLuluPrintJobLines", () => {
  it("maps order lines to print-job line items", () => {
    expect(buildLuluPrintJobLines([line])).toEqual([{
      title: "Guide", quantity: 2,
      podPackageId: "0600X0900BWSTDPB060UW444MXX", pageCount: 40,
      interiorUrl: "https://signed/i.pdf", coverUrl: "https://signed/c.pdf",
    }]);
  });
  it("throws loudly on a line missing book config", () => {
    expect(() => buildLuluPrintJobLines([{ ...line, luluPageCount: null }])).toThrow(/Guide/);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**

In `src/lib/merch/fulfillment.ts`:
- `assertSupportedFulfillment`: add `&& t !== "lulu_pod"` to the condition list.
- `orderFulfillmentPlan`: change signature to `"pickup" | "self_shipped" | "printful" | "lulu"` and add, after the self_shipped check:

```ts
  if (physical.every((i) => i.fulfillmentType === "lulu_pod")) return "lulu";
```

- In `handleMerchOrderCompleted`, after the `self_shipped` branch (line ~191) add:

```ts
  // lulu: submit the print job. Money-safe like the printful path — a failure
  // (Lulu down, PDF rejected) leaves the order 'paid' for admin retry; the
  // payment is captured and the order recorded either way.
  if (plan === "lulu") {
    try {
      await submitLuluOrder(orderId);
    } catch (e) {
      console.error(`[merch] lulu submission failed for paid order ${orderId} — left 'paid' for retry:`, e);
    }
    try { await sendMerchOrderConfirmation(orderId); } catch (e) { console.error(`[merch] confirmation email failed for ${orderId}:`, e); }
    return { status: "processed-lulu" };
  }
```

with `import { submitLuluOrder } from "./lulu-fulfillment";` at the top.

New `src/lib/merch/lulu-fulfillment.ts`:

```ts
import { getDb } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { merchOrders, merchOrderItems, merchVariants, merchProducts } from "@/lib/db/schema";
import { createPrintJob } from "@/lib/lulu/client";
import type { LuluPrintJobLineItemInput, LuluShippingLevel } from "@/lib/lulu/types";
import { toLuluAddress } from "./lulu-shipping";
import { getSignedGetUrl } from "@/lib/storage/r2";

/** Lulu fetches + normalizes the PDFs async and may retry — sign long. */
const BOOK_ASSET_URL_TTL_SECONDS = 72 * 60 * 60;

/** Under LULU_MOCK the print job never leaves the process, so don't require
 * live R2 creds just to mint a URL nobody will fetch. */
async function signBookAssetUrl(key: string): Promise<string> {
  if (process.env.LULU_MOCK === "1" || process.env.R2_MOCK === "1") {
    return `https://mock-r2.local/get/${key}`;
  }
  return getSignedGetUrl(key, { expiresInSeconds: BOOK_ASSET_URL_TTL_SECONDS });
}

/** Pure mapper; throws on a misconfigured line — submission must fail loudly
 * (the webhook's catch leaves the order 'paid' for retry) rather than print
 * a book with missing spec. */
export function buildLuluPrintJobLines(items: {
  productName: string;
  quantity: number;
  luluPodPackageId: string | null;
  luluPageCount: number | null;
  interiorUrl: string;
  coverUrl: string;
}[]): LuluPrintJobLineItemInput[] {
  return items.map((i) => {
    if (!i.luluPodPackageId || !i.luluPageCount || i.luluPageCount <= 0) {
      throw new Error(`lulu order line "${i.productName}" is missing its package id or page count`);
    }
    return {
      title: i.productName,
      podPackageId: i.luluPodPackageId,
      pageCount: i.luluPageCount,
      quantity: i.quantity,
      interiorUrl: i.interiorUrl,
      coverUrl: i.coverUrl,
    };
  });
}

export async function submitLuluOrder(orderId: string): Promise<{ luluPrintJobId: string }> {
  const db = getDb();
  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) throw new Error(`merch order not found: ${orderId}`);

  // Idempotency: never re-submit (mirrors fulfillMerchOrder's Printful guard).
  if (order.luluPrintJobId || order.status === "submitted" || order.status === "shipped") {
    return { luluPrintJobId: order.luluPrintJobId ?? "" };
  }

  const rows = await db
    .select({
      productName: merchOrderItems.productName,
      quantity: merchOrderItems.quantity,
      luluPodPackageId: merchProducts.luluPodPackageId,
      luluPageCount: merchProducts.luluPageCount,
      luluInteriorAssetKey: merchProducts.luluInteriorAssetKey,
      luluCoverAssetKey: merchProducts.luluCoverAssetKey,
    })
    .from(merchOrderItems)
    .innerJoin(merchVariants, eq(merchOrderItems.merchVariantId, merchVariants.id))
    .innerJoin(merchProducts, eq(merchVariants.productId, merchProducts.id))
    .where(and(eq(merchOrderItems.orderId, orderId), eq(merchOrderItems.fulfillmentType, "lulu_pod")));
  if (rows.length === 0) throw new Error(`merch order ${orderId} has no lulu_pod lines to submit`);

  const withUrls = await Promise.all(rows.map(async (r) => {
    if (!r.luluInteriorAssetKey || !r.luluCoverAssetKey) {
      throw new Error(`lulu order line "${r.productName}" is missing its interior/cover PDF`);
    }
    return {
      productName: r.productName,
      quantity: r.quantity,
      luluPodPackageId: r.luluPodPackageId,
      luluPageCount: r.luluPageCount,
      interiorUrl: await signBookAssetUrl(r.luluInteriorAssetKey),
      coverUrl: await signBookAssetUrl(r.luluCoverAssetKey),
    };
  }));

  const job = await createPrintJob({
    externalId: order.id,
    contactEmail: order.email,
    lineItems: buildLuluPrintJobLines(withUrls),
    address: toLuluAddress(order.shippingAddress),
    level: (order.luluShippingLevel ?? "MAIL") as LuluShippingLevel,
  });

  await db.update(merchOrders)
    .set({ luluPrintJobId: job.id, status: "submitted", updatedAt: new Date() })
    .where(eq(merchOrders.id, orderId));
  return { luluPrintJobId: job.id };
}
```

- [ ] **Step 4: Run tests** (both unit files) → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/merch/fulfillment.ts src/lib/merch/lulu-fulfillment.ts tests/unit/merch/
git commit -m "feat(merch): auto-submit Lulu print jobs on payment (idempotent, money-safe)"
```

---

### Task 8: Status cron — poll print jobs → shipped email

**Files:**
- Create: `src/lib/merch/lulu-status.ts`
- Create: `src/pages/api/cron/poll-lulu-jobs.ts`
- Create: `netlify/functions/scheduled-poll-lulu-jobs.ts`
- Test: `tests/unit/merch/lulu-status.test.ts`, `tests/api/cron/poll-lulu-jobs.test.ts`

**Interfaces:**
- Consumes: `getPrintJob` from `@/lib/lulu/client`; `sendMerchShippedEmail` from `./order-confirmation-email`.
- Produces:
  - `actionForLuluStatus(statusName: string): "ship" | "fail" | "wait"`
  - `pollLuluJobs(): Promise<{ checked: number; shipped: number; failed: number }>`
  - `POST /api/cron/poll-lulu-jobs` gated by `x-cron-secret`; Netlify schedule `*/30 * * * *`.

- [ ] **Step 1: Failing unit test** — `tests/unit/merch/lulu-status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { actionForLuluStatus } from "@/lib/merch/lulu-status";

describe("actionForLuluStatus", () => {
  it("ships on SHIPPED", () => expect(actionForLuluStatus("SHIPPED")).toBe("ship"));
  it("fails on REJECTED and CANCELED", () => {
    expect(actionForLuluStatus("REJECTED")).toBe("fail");
    expect(actionForLuluStatus("CANCELED")).toBe("fail");
  });
  it("waits on every in-flight status", () => {
    for (const s of ["CREATED", "UNPAID", "PAYMENT_IN_PROGRESS", "PRODUCTION_DELAYED", "PRODUCTION_READY", "IN_PRODUCTION", "UNKNOWN"]) {
      expect(actionForLuluStatus(s)).toBe("wait");
    }
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**

`src/lib/merch/lulu-status.ts`:

```ts
import { getDb } from "@/lib/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { merchOrders } from "@/lib/db/schema";
import { getPrintJob } from "@/lib/lulu/client";
import { sendMerchShippedEmail } from "./order-confirmation-email";

export type LuluJobAction = "ship" | "fail" | "wait";

/** SHIPPED is terminal-success; REJECTED/CANCELED terminal-failure (surface
 * as a 'failed' order in admin — refund is a manual action in v1); everything
 * else is in-flight, poll again next tick. Unknown statuses wait (never fail
 * an order on a status we don't recognize). */
export function actionForLuluStatus(statusName: string): LuluJobAction {
  if (statusName === "SHIPPED") return "ship";
  if (statusName === "REJECTED" || statusName === "CANCELED") return "fail";
  return "wait";
}

/** Poll every submitted Lulu order's print job. Volume is low (books); no
 * batching. A single job's failure is logged and skipped — one bad job must
 * not starve the rest of the sweep. */
export async function pollLuluJobs(): Promise<{ checked: number; shipped: number; failed: number }> {
  const db = getDb();
  const open = await db.select().from(merchOrders)
    .where(and(eq(merchOrders.status, "submitted"), isNotNull(merchOrders.luluPrintJobId)));

  let shipped = 0, failed = 0;
  for (const order of open) {
    try {
      const job = await getPrintJob(order.luluPrintJobId as string);
      const action = actionForLuluStatus(job.status);
      if (action === "ship") {
        await db.update(merchOrders).set({
          status: "shipped",
          shippingCarrier: job.tracking.carrier?.slice(0, 60) ?? order.shippingCarrier,
          trackingNumber: job.tracking.trackingId?.slice(0, 120) ?? null,
          trackingUrl: job.tracking.trackingUrl?.slice(0, 500) ?? null,
          shippedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(merchOrders.id, order.id));
        try { await sendMerchShippedEmail(order.id); } catch (e) { console.error(`[merch] lulu shipped email failed for ${order.id}:`, e); }
        shipped++;
      } else if (action === "fail") {
        await db.update(merchOrders).set({ status: "failed", updatedAt: new Date() }).where(eq(merchOrders.id, order.id));
        console.error(`[merch] lulu print job ${order.luluPrintJobId} for order ${order.id} ended ${job.status} — order marked failed`);
        failed++;
      }
    } catch (e) {
      console.error(`[merch] lulu status poll failed for order ${order.id}:`, e);
    }
  }
  return { checked: open.length, shipped, failed };
}
```

`src/pages/api/cron/poll-lulu-jobs.ts` — copy `src/pages/api/cron/cleanup-self-service-tokens.ts` **verbatim structure** (same auth block, `warmDbConnection`, `captureServerException` with `component: "cron/poll-lulu-jobs"`, GET describes usage), with the work call replaced by:

```ts
    const result = await pollLuluJobs();
    console.info(`[cron] Lulu job poll: checked=${result.checked} shipped=${result.shipped} failed=${result.failed} in ${elapsedMs}ms`);
```

`netlify/functions/scheduled-poll-lulu-jobs.ts` — copy `netlify/functions/scheduled-cleanup-self-service-tokens.ts` verbatim, with `ROUTE = "/api/cron/poll-lulu-jobs"`, log prefix `[scheduled-poll-lulu-jobs]`, and schedule `"*/30 * * * *"`.

- [ ] **Step 4: API test** — `tests/api/cron/poll-lulu-jobs.test.ts` (mirror however the existing cron API tests authenticate — look at `tests/api/cron/` for the pattern; if none exists, model on how other tests send `x-cron-secret` with `process.env.CRON_SECRET`):

```ts
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("POST /api/cron/poll-lulu-jobs", () => {
  it("401 without the cron secret", async () => {
    const res = await fetch(`${BASE}/api/cron/poll-lulu-jobs`, { method: "POST" });
    expect(res.status).toBe(401);
  });
  it("200 with the secret and reports counts", async () => {
    const res = await fetch(`${BASE}/api/cron/poll-lulu-jobs`, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("checked");
    expect(json).toHaveProperty("shipped");
  });
});
```

- [ ] **Step 5: Run all new tests** → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/merch/lulu-status.ts src/pages/api/cron/poll-lulu-jobs.ts netlify/functions/scheduled-poll-lulu-jobs.ts tests/
git commit -m "feat(merch): 30-min Lulu print-job status cron — tracking + shipped email, failed on reject"
```

---

### Task 9: Admin endpoints — book uploads, product CRUD, cost preview

**Files:**
- Modify: `src/pages/api/admin/merch/digital-asset-url.ts`
- Modify: `src/pages/api/admin/merch/store-products.ts`
- Create: `src/pages/api/admin/merch/lulu-cost-preview.ts`
- Test: `tests/api/admin/merch-lulu-products.test.ts`

**Interfaces:**
- Consumes: `podPackageIdForFormat`, `isLuluFormat` from `@/lib/lulu/formats`; `calculatePrintJobCost`, `isLuluConfigured` from `@/lib/lulu/client`.
- Produces:
  - `digital-asset-url` body gains `kind: z.enum(["digital", "book"]).default("digital")` — `book` keys are `merch-books/<orgId>/<uuid>-<name>` and only `application/pdf` is allowed.
  - `store-products` accepts `fulfillmentType: "lulu_pod"` with `luluFormat` (`"6x9_bw" | "6x9_color"`), `luluPageCount` (int 2–800), `luluInteriorAssetKey`, `luluCoverAssetKey`; creates one variant at `priceCents` (like digital); persists `luluPodPackageId` derived from the format. 422s: missing any of the four; keys outside `merch-books/<orgId>/`.
  - `POST /api/admin/merch/lulu-cost-preview` `{ luluFormat, pageCount, quantity? }` → `{ printCents, mailShippingCents }` (503 when Lulu unconfigured).

- [ ] **Step 1: Failing API test** — `tests/api/admin/merch-lulu-products.test.ts`. Mirror the admin-auth pattern (`getAdminCookie`) from existing `tests/api/admin/` merch tests; create a store via direct db insert (as in Task 5's fixture) then:

```ts
const bookBody = (storeId: string, over: Record<string, unknown> = {}) => ({
  storeId, name: "Print Guide", category: "other", priceCents: 1500,
  fulfillmentType: "lulu_pod", sizes: [],
  luluFormat: "6x9_bw", luluPageCount: 40,
  luluInteriorAssetKey: `merch-books/${E2E_ORG_ID}/i.pdf`,
  luluCoverAssetKey: `merch-books/${E2E_ORG_ID}/c.pdf`,
  ...over,
});

describe("admin lulu_pod products", () => {
  it("creates a book product with one variant and a derived package id", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "POST", headers: { cookie: adminCookie }, body: JSON.stringify(bookBody(storeId)),
    });
    const { productId } = await expectJson(res, 201);
    const [p] = await getDb().select().from(merchProducts).where(eq(merchProducts.id, productId));
    expect(p.luluPodPackageId).toBe("0600X0900BWSTDPB060UW444MXX");
    expect(p.luluPageCount).toBe(40);
    const variants = await getDb().select().from(merchVariants).where(eq(merchVariants.productId, productId));
    expect(variants).toHaveLength(1);
    expect(variants[0].retailPriceCents).toBe(1500);
  });

  it("422s a book missing any lulu field", async () => {
    for (const missing of ["luluFormat", "luluPageCount", "luluInteriorAssetKey", "luluCoverAssetKey"]) {
      const res = await apiFetch("/api/admin/merch/store-products", {
        method: "POST", headers: { cookie: adminCookie },
        body: JSON.stringify(bookBody(storeId, { [missing]: undefined })),
      });
      expect(res.status, `missing ${missing}`).toBe(422);
    }
  });

  it("422s asset keys outside the org's book namespace", async () => {
    const res = await apiFetch("/api/admin/merch/store-products", {
      method: "POST", headers: { cookie: adminCookie },
      body: JSON.stringify(bookBody(storeId, { luluInteriorAssetKey: "merch-books/other-org/i.pdf" })),
    });
    await expectJson(res, 422);
  });

  it("book upload URLs are minted under merch-books/ and PDF-only", async () => {
    const ok = await apiFetch("/api/admin/merch/digital-asset-url", {
      method: "POST", headers: { cookie: adminCookie },
      body: JSON.stringify({ filename: "interior.pdf", contentType: "application/pdf", kind: "book" }),
    });
    const { key } = await expectJson(ok, 200);
    expect(key).toMatch(new RegExp(`^merch-books/${E2E_ORG_ID}/`));

    const bad = await apiFetch("/api/admin/merch/digital-asset-url", {
      method: "POST", headers: { cookie: adminCookie },
      body: JSON.stringify({ filename: "cover.png", contentType: "image/png", kind: "book" }),
    });
    expect(bad.status).toBe(400);
  });

  it("cost preview returns mock print + Mail shipping costs", async () => {
    const res = await apiFetch("/api/admin/merch/lulu-cost-preview", {
      method: "POST", headers: { cookie: adminCookie },
      body: JSON.stringify({ luluFormat: "6x9_bw", pageCount: 40 }),
    });
    const json = await expectJson(res, 200);
    expect(json.printCents).toBe(700);
    expect(json.mailShippingCents).toBe(399);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**

`digital-asset-url.ts`: add `kind: z.enum(["digital", "book"]).default("digital")` to `bodySchema`; after the content-type check add:

```ts
  if (parsed.data.kind === "book" && contentType !== "application/pdf") {
    return json({ error: "Book files must be PDFs" }, 400);
  }
```

and build the key with a kind-dependent prefix:

```ts
  const prefix = parsed.data.kind === "book" ? "merch-books" : "merch-digital";
  const key = `${prefix}/${auth.organizationId}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`;
```

`store-products.ts`:
- `fulfillmentType: z.enum(["pickup", "self_shipped", "digital", "lulu_pod"]).default("pickup")`.
- Add fields to `productSchema`:

```ts
  luluFormat: z.enum(["6x9_bw", "6x9_color"]).optional(),
  luluPageCount: z.number().int().min(2).max(800).optional(),
  luluInteriorAssetKey: z.string().min(1).max(500).optional(),
  luluCoverAssetKey: z.string().min(1).max(500).optional(),
```

- In the `superRefine`, exempt books from sizes: `if (d.fulfillmentType !== "digital" && d.fulfillmentType !== "lulu_pod" && d.sizes.length === 0) { ... }`.
- Widen the `fulfillmentType` parameter type on `missingSelfShippedWeights`, `missingDigitalAsset`, and `digitalAssetKeyOutsideOrg` to include `"lulu_pod"` (tsc will point at each).
- Add helpers (below `digitalAssetKeyOutsideOrg`):

```ts
/** A lulu_pod product needs its full print spec — format, page count, and
 * both uploaded PDFs. 422 (not 400) to match the other business-rule checks. */
function missingLuluFields(d: { fulfillmentType: string; luluFormat?: string; luluPageCount?: number; luluInteriorAssetKey?: string; luluCoverAssetKey?: string }): boolean {
  return d.fulfillmentType === "lulu_pod" &&
    !(d.luluFormat && d.luluPageCount && d.luluInteriorAssetKey && d.luluCoverAssetKey);
}

/** Same cross-org R2-key leak guard as digitalAssetKeyOutsideOrg, for the
 * merch-books/ namespace (both interior and cover). */
function luluAssetKeyOutsideOrg(d: { fulfillmentType: string; luluInteriorAssetKey?: string; luluCoverAssetKey?: string }, organizationId: string): boolean {
  if (d.fulfillmentType !== "lulu_pod") return false;
  const prefix = `merch-books/${organizationId}/`;
  return [d.luluInteriorAssetKey, d.luluCoverAssetKey].some((k) => k != null && !k.startsWith(prefix));
}
```

- In POST and PUT, after the digital checks:

```ts
    if (missingLuluFields(d)) {
      return json({ error: "a book needs a format, page count, and both PDFs (interior + cover)" }, 422);
    }
    if (luluAssetKeyOutsideOrg(d, auth.organizationId)) {
      return json({ error: "Invalid book file." }, 422);
    }
```

- In `buildVariantRows`, treat `lulu_pod` like `digital` (change the first condition to `if (d.fulfillmentType === "digital" || d.fulfillmentType === "lulu_pod")`).
- In the POST insert values (and PUT update set), add:

```ts
        luluPodPackageId: d.fulfillmentType === "lulu_pod" && d.luluFormat ? podPackageIdForFormat(d.luluFormat) : null,
        luluPageCount: d.fulfillmentType === "lulu_pod" ? d.luluPageCount ?? null : null,
        luluInteriorAssetKey: d.fulfillmentType === "lulu_pod" ? d.luluInteriorAssetKey ?? null : null,
        luluCoverAssetKey: d.fulfillmentType === "lulu_pod" ? d.luluCoverAssetKey ?? null : null,
```

with `import { podPackageIdForFormat } from "@/lib/lulu/formats";`.

New `src/pages/api/admin/merch/lulu-cost-preview.ts`:

```ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import { podPackageIdForFormat } from "@/lib/lulu/formats";
import { calculatePrintJobCost, isLuluConfigured, LuluApiError } from "@/lib/lulu/client";

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const schema = z.object({
  luluFormat: z.enum(["6x9_bw", "6x9_color"]),
  pageCount: z.number().int().min(2).max(800),
  quantity: z.number().int().min(1).max(100).default(1),
});

/** Fixed US reference address — the preview informs retail pricing, it is
 * never charged to anyone. */
const REFERENCE_ADDRESS = {
  name: "Cost Preview", street1: "100 E Broad St", city: "Columbus",
  stateCode: "OH", postcode: "43215", countryCode: "US",
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  if (!isLuluConfigured()) return json({ error: "Lulu isn't configured" }, 503);

  const parsed = schema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);

  try {
    const { printCents, shippingCents } = await calculatePrintJobCost({
      lineItems: [{
        podPackageId: podPackageIdForFormat(parsed.data.luluFormat),
        pageCount: parsed.data.pageCount,
        quantity: parsed.data.quantity,
      }],
      address: REFERENCE_ADDRESS,
      level: "MAIL",
    });
    return json({ printCents, mailShippingCents: shippingCents });
  } catch (e) {
    if (e instanceof LuluApiError) return json({ error: "Cost preview failed" }, 502);
    throw e;
  }
};
```

- [ ] **Step 4: Run the test file** → PASS. Also run existing `tests/api/admin/` merch product tests for regressions. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/merch/ tests/api/admin/merch-lulu-products.test.ts
git commit -m "feat(merch): admin book products — PDF uploads (merch-books ns), lulu fields, print-cost preview"
```

---

### Task 10: Admin editor UI — book product form

**Files:**
- Modify: `src/components/admin/merch-store-editor.tsx` (867 lines; anchors below)

**Interfaces:**
- Consumes: Task 9's endpoints. Produces: UI only — no new exports.

This is a UI-integration task: extend the existing form state + digital-upload machinery by direct analogy. tsc + manual dev-server verification; the E2E in Task 11 covers the storefront side.

- [ ] **Step 1: Extend types + state.**
  - The `FulfillmentType` union (grep `type FulfillmentType` in the file) gains `"lulu_pod"`.
  - The product-list interface (line ~83) and form-state interface (line ~117): add `luluFormat: "6x9_bw" | "6x9_color"; luluPageCount: string; luluInteriorAssetKey: string | null; luluInteriorAssetName: string | null; luluCoverAssetKey: string | null; luluCoverAssetName: string | null;` (page count as string — it's an `<input>`; parse on submit).
  - Empty-form defaults (line ~138): `luluFormat: "6x9_bw", luluPageCount: "", luluInteriorAssetKey: null, luluInteriorAssetName: null, luluCoverAssetKey: null, luluCoverAssetName: null`.
  - Edit-hydration (line ~220): map from the product row (`product.luluPageCount != null ? String(product.luluPageCount) : ""`, keys/names straight through; derive `luluFormat` from `product.luluPodPackageId === "0600X0900FCSTDPB060UW444MXX" ? "6x9_color" : "6x9_bw"`). Note: `luluInteriorAssetName`/`luluCoverAssetName` are display-only client state (the schema stores keys only) — on edit, show the key's basename.

- [ ] **Step 2: Generalize the upload handler.** The digital upload handler (line ~275) POSTs `/api/admin/merch/digital-asset-url`. Refactor it to `uploadAsset(file: File, kind: "digital" | "book")` that includes `kind` in the presign body and returns `{ key, name: file.name }`; keep the digital call sites working, and add two book call sites (interior, cover) that store into the corresponding state fields. Book inputs use `accept="application/pdf"`.

- [ ] **Step 3: Render the book section.** In the fulfillment `<select>` (line ~636) add `<option value="lulu_pod">Book — printed & shipped by Lulu</option>`. Beside the existing `formData.fulfillmentType === "digital" ? (...)` branch (line ~654), add a `lulu_pod` branch rendering:
  - format `<select>` over `LULU_FORMATS` (import from `@/lib/lulu/formats`; render `label`),
  - page-count `<input type="number" min={2} max={800}>`,
  - two upload fields labeled "Interior PDF" and "Cover PDF" showing the uploaded filename once set,
  - a "Check print cost" button — disabled until format + page count are set — that POSTs `/api/admin/merch/lulu-cost-preview` and renders `Print cost: $X.XX · Mail shipping: $Y.YY` (or the endpoint's error) in muted text next to the price input.
  - Sizes UI hidden for `lulu_pod` (same condition that hides it for digital).

- [ ] **Step 4: Submit + validation.** In the submit handler (line ~310): when `lulu_pod`, client-side check all four fields (set the form error `"A book needs a format, page count, and both PDFs."` if missing — mirror the digital check at line ~316) and include in the POST/PUT body: `luluFormat`, `luluPageCount: parseInt(formData.luluPageCount, 10)`, `luluInteriorAssetKey`, `luluCoverAssetKey`. Update the submit-disabled condition (line ~847) to also disable while a book is missing its uploads.

- [ ] **Step 5: Verify.**

Run: `npx tsc --noEmit` → 0 errors. Then with the dev server up (Global-Constraints env), sign in as `admin@test.aspiresports.com` / `TestAdmin123!`, open `/admin/merch/stores`, open a store's product editor, and create a book product end-to-end (uploads are mocked under `R2_MOCK`; cost preview returns the mock $7.00/$3.99). Confirm the product saves and lists.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/merch-store-editor.tsx
git commit -m "feat(merch): admin book product form — format, page count, interior/cover PDF uploads, cost preview"
```

---

### Task 11: Storefront checkout UI — shipping-level picker + seed fixture + E2E

**Files:**
- Modify: `src/components/shop/checkout-form.tsx`
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts`
- Test: `tests/e2e/merch-book-checkout.spec.ts`

**Interfaces:**
- Consumes: quote/checkout `luluShippingLevel` contract from Tasks 5–6.
- Produces: seed exports `E2E_MERCH_BOOK_STORE_SLUG = "e2e-book-store"` and a book product ("E2E Print Guide", $15.00) in that public general-scope store.

- [ ] **Step 1: Checkout form.** In `src/components/shop/checkout-form.tsx`:
  - Extend `QuoteResult` (line ~19):

```ts
interface LuluShippingOption { level: string; label: string; amountCents: number }
interface QuoteResult {
  subtotalCents: number;
  shippingCents: number;
  totalBeforeTaxCents: number;
  currency: string;
  store?: QuoteStoreInfo | null;
  luluShippingOptions?: LuluShippingOption[] | null;
  luluShippingLevel?: string | null;
}
```

  - Add state `const [luluLevel, setLuluLevel] = useState<string | null>(null);` and reset it in `updateField`'s quote-clearing path is NOT needed (level survives address edits; the server re-validates).
  - In `fetchQuote`, include the level in the body (`luluShippingLevel: overrideLevel ?? luluLevel`) — change the signature to `fetchQuote(address, overrideLevel?: string | null)` — and on success sync state from the server: `if (json.luluShippingLevel) setLuluLevel(json.luluShippingLevel);`.
  - In `handleSubmit`'s checkout body add `luluShippingLevel: luluLevel,`.
  - Render the picker between the address section and the totals block (after line ~365), only when `quote?.luluShippingOptions?.length`:

```tsx
      {quote?.luluShippingOptions && quote.luluShippingOptions.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg text-ink">Shipping speed</h2>
          <div role="radiogroup" aria-label="Shipping speed" className="space-y-1">
            {quote.luluShippingOptions.map((o) => (
              <label key={o.level} className="flex items-center justify-between gap-3 border border-ink/20 px-3 py-2 text-sm text-ink cursor-pointer">
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="lulu-shipping-level"
                    value={o.level}
                    checked={(luluLevel ?? quote.luluShippingLevel) === o.level}
                    onChange={() => {
                      setLuluLevel(o.level);
                      void fetchQuote(buildAddress(), o.level);
                    }}
                  />
                  {o.label}
                </span>
                <span>{money(o.amountCents)}</span>
              </label>
            ))}
          </div>
        </section>
      )}
```

- [ ] **Step 2: Seed fixture.** In `src/lib/db/seeds/seed-e2e-tests.ts`, next to `E2E_MERCH_UNLISTED_STORE_SLUG` export `export const E2E_MERCH_BOOK_STORE_SLUG = "e2e-book-store";` and add `seedMerchBookFixture(db, orgId, teamId)` modeled line-for-line on `seedMerchUnlistedStoreFixture` (line 1203). Store shape: first check the scope constraints in `src/lib/db/schema/merch-stores.ts` — if `general` scope is unique per org (it likely is; the org already has a real general store), create the fixture as a **team-scoped, public** store (`scope: "team"`, reusing the `teamId` the unlisted fixture receives, `visibility: "public"`, no shareToken); otherwise `scope: "general"` is fine. Name "E2E Book Store", slug `E2E_MERCH_BOOK_STORE_SLUG`. Product: name "E2E Print Guide", slug `e2e-book-store-guide`, `source: "manual"`, `fulfillmentType: "lulu_pod"`, `luluPodPackageId: "0600X0900BWSTDPB060UW444MXX"`, `luluPageCount: 40`, `luluInteriorAssetKey: \`merch-books/${orgId}/e2e-interior.pdf\``, `luluCoverAssetKey: \`merch-books/${orgId}/e2e-cover.pdf\``, one variant at `retailPriceCents: 1500`. Idempotent lookups by slug, same as the pattern. Call it right after `seedMerchUnlistedStoreFixture` and re-run `npm run db:seed:e2e` to verify it seeds cleanly twice.

- [ ] **Step 3: E2E spec** — `tests/e2e/merch-book-checkout.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { E2E_MERCH_BOOK_STORE_SLUG } from "@/lib/db/seeds/seed-e2e-tests";
import { waitForHydration } from "../utils/test-helpers";

/**
 * Lulu book storefront flow (merch Lulu phase). Requires the dev server to
 * run with LULU_MOCK=1 (mock levels: MAIL $3.99 … EXPRESS $24.99).
 * Stops before Stripe — payment + fulfillment are covered by API tests.
 * NOTE: runs post-merge only (test-full); run locally before merging.
 */
test.describe("Merch book checkout", () => {
  test("add book → address → live level picker reprices shipping", async ({ page }) => {
    await page.goto(`/shop/${E2E_MERCH_BOOK_STORE_SLUG}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await page.getByText("E2E Print Guide").first().click();
    await page.getByRole("button", { name: /add to cart/i }).click();
    await page.goto("/shop/checkout", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await page.getByLabel("Email").fill("book-buyer@test.aspiresports.com");
    await page.getByLabel("Full name").fill("Book Buyer");
    await page.getByLabel("Address").fill("123 Test St");
    await page.getByLabel("City").fill("Columbus");
    await page.getByLabel("State").fill("OH");
    await page.getByLabel("ZIP code").fill("43085");
    await page.getByRole("button", { name: /get shipping total/i }).click();

    const picker = page.getByRole("radiogroup", { name: "Shipping speed" });
    await expect(picker).toBeVisible();
    await expect(picker.getByText("Mail")).toBeVisible();
    await expect(page.getByText("$3.99")).toBeVisible(); // default = cheapest

    await picker.getByText("Express").click();
    await expect(page.getByText("$24.99").first()).toBeVisible(); // repriced total row
  });
});
```

(Adjust selectors to the real product-detail/cart-drawer markup — open the seeded store in a browser first; e.g. the add-to-cart flow may go through the cart drawer before `/shop/checkout`. Keep `waitForHydration` before every click and use element clicks only.)

- [ ] **Step 4: Run** `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- merch-book-checkout` → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/shop/checkout-form.tsx src/lib/db/seeds/seed-e2e-tests.ts tests/e2e/merch-book-checkout.spec.ts
git commit -m "feat(merch): buyer-facing Lulu shipping-level picker + book e2e fixture and spec"
```

---

### Task 12: Full verification, docs, PR

**Files:**
- Modify: `docs/superpowers/specs/2026-07-26-merch-lulu-pod-books-design.md` (only if implementation deviated — record deviations)

- [ ] **Step 1: Full local gate** (pre-push checklist, dev server up with Global-Constraints env):

```bash
npm run db:seed:e2e
CRON_SECRET=<same-as-dev-server> TEST_BASE_URL=http://localhost:4321 npm run test:api
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test
npm run build
npx tsc --noEmit
```

Expected: all green (known pre-existing staging-data failures per `staging-db-preexisting-test-failures` memory are acceptable if file-overlap-free with this branch).

- [ ] **Step 2: Grep for silently-affected E2E** — `grep -rl "shop\|merch" tests/e2e/` and confirm `merch-stores.spec.ts` / `merch-bundles.spec.ts` still pass locally (they run post-merge only).

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/merch-lulu-pod
gh pr create --title "Merch — Lulu POD print books" --body "$(cat <<'EOF'
## Summary
- New `lulu_pod` fulfillment type: printed books fulfilled by Lulu print-on-demand (second external provider after Printful)
- Live per-level shipping quote at checkout with a buyer-facing speed picker (Mail/Ground/…/Express), server-re-validated
- Books-only carts (lulu + digital lines only) enforced at quote and checkout
- Payment auto-submits the Lulu print job (signed R2 PDF URLs, idempotent, money-safe); 30-min cron polls status → tracking + shipped email; REJECTED/CANCELED → order `failed`
- Admin: book product form (curated 6×9 formats, page count, interior/cover PDF uploads under `merch-books/`, live print-cost preview)
- `LULU_MOCK=1` mock client for CI/local; migration 0115

## Go-live (owner)
- Bitwarden + Netlify: `LULU_CLIENT_KEY`, `LULU_CLIENT_SECRET`, `LULU_CONTACT_PHONE` (+ `LULU_API_BASE=https://api.sandbox.lulu.com` on staging only)
- Lulu account needs a stored payment method (Lulu charges print cost per job)
- Validate a sandbox print job on staging, then order ONE real proof copy before publishing the book store (also the Chromium-vs-WeasyPrint quality verdict)

Spec: docs/superpowers/specs/2026-07-26-merch-lulu-pod-books-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for CI green on origin** before declaring done (per CLAUDE.md: a push isn't done until CI passes).
