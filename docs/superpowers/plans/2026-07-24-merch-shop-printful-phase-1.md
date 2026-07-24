# Merch Shop (Printful) — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a browsable, Printful-backed merch catalog — schema, a Printful API client, an admin-triggered sync, and a public storefront (`/shop` grid + `/shop/[slug]` detail). No purchasing (that is Phase 2).

**Architecture:** Products are designed in Printful's dashboard. An admin endpoint pulls Printful "sync products" via the v1 API and upserts them into new org-scoped `merch_products` / `merch_variants` tables. Public SSR pages render the active catalog from the DB. All Printful calls are server-side only.

**Tech Stack:** Astro 5 (SSR pages) + React 19 islands, Drizzle ORM (PostgreSQL), Zod, Vitest (unit + API). Printful REST API v1 (`https://api.printful.com`).

## Global Constraints

- **Phase 1 is catalog-only.** No cart, no checkout, no orders, no Printful order creation. Those tables/endpoints belong to Phase 2 — do not build them here.
- **Org-scoped.** Every merch row carries `organization_id`. Both Aspire and SoccerOne brands share one org; pages read the org from `Astro.locals.organization` (middleware resolves it, falling back to the default org).
- **Migrations via `npm run db:generate`, never `db:push` to a remote.** Review and commit the generated `src/lib/db/migrations/NNNN_*.sql`. Apply to staging with `./scripts/with-bws.sh npm run db:migrate` (bws → staging DB).
- **Secrets read `process.env` first:** `process.env.PRINTFUL_API_KEY ?? import.meta.env.PRINTFUL_API_KEY`. Netlify SSR inlines `import.meta.env` at build time, so a rotated runtime secret only reads reliably via `process.env`.
- **Admin endpoints** authorize with `requireOrgAdminAccess(context)` from `@/lib/auth` and scope all writes to `auth.organizationId`.
- **Pages** extend `@/layouts/BaseLayout.astro`. Interactive islands are `"use client"` and call `useHydrationBeacon()` from `@/lib/hooks/use-hydration-beacon`.
- **UI feedback** uses shared primitives: `EmptyState` (`@/components/ui/empty-state`), `ErrorBanner` (`@/components/ui/error-banner`).
- **Money is integer cents** everywhere.

---

## File Structure

**Create**
- `src/lib/db/schema/merch.ts` — `merch_products` + `merch_variants` tables, relations, inferred types.
- `src/lib/printful/types.ts` — Printful v1 API response shapes (sync product/variant).
- `src/lib/printful/client.ts` — token-auth client: `listStoreProducts`, `getSyncProduct`, `isPrintfulConfigured`.
- `src/lib/merch/map-sync-product.ts` — pure mappers: parse variant options, price→cents, slugify, `mapSyncProductDetail`.
- `src/lib/merch/sync.ts` — `syncMerchCatalog(orgId)` orchestration + pure `dedupeSlugs`.
- `src/lib/merch/catalog.ts` — read helpers + pure `priceRangeCents` / `primaryImageUrl`.
- `src/pages/api/admin/merch/sync.ts` — `POST` admin sync endpoint.
- `src/pages/shop/[slug].astro` — product detail page.
- `src/components/shop/product-detail.tsx` — variant-picker island.
- `tests/unit/merch/map-sync-product.test.ts`
- `tests/unit/merch/sync-slugs.test.ts`
- `tests/unit/merch/catalog-helpers.test.ts`
- `tests/unit/printful/client.test.ts`
- `tests/api/admin/merch-sync.test.ts`

**Modify**
- `src/lib/db/schema/index.ts` — export the new merch schema.
- `src/pages/shop.astro` — replace the "coming soon" placeholder with the SSR grid.
- `.env.example` — document `PRINTFUL_API_KEY` / `PRINTFUL_STORE_ID`.

---

## Task 1: Merch schema + migration

**Files:**
- Create: `src/lib/db/schema/merch.ts`
- Modify: `src/lib/db/schema/index.ts`
- Generated: `src/lib/db/migrations/NNNN_*.sql`

**Interfaces:**
- Produces: tables `merchProducts`, `merchVariants`; types `MerchProduct`, `NewMerchProduct`, `MerchVariant`, `NewMerchVariant`; interface `MerchImage { url: string; alt?: string }`.

- [ ] **Step 1: Create the schema file**

`src/lib/db/schema/merch.ts`:

```ts
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { productCategoryEnum } from "./products";

export interface MerchImage {
  url: string;
  alt?: string;
}

/**
 * Printful-backed merch catalog. Products are designed in Printful and synced
 * in via the store API; `printful_sync_product_id` is the join key back to
 * Printful. Org-scoped so team-specific stores can be added later without a
 * schema change. Reuses `product_category` enum from products.ts.
 */
export const merchProducts = pgTable(
  "merch_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    printfulSyncProductId: varchar("printful_sync_product_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    description: text("description"),
    category: productCategoryEnum("category").notNull().default("other"),
    // mockup image URLs served by Printful's CDN; null == none yet
    images: jsonb("images").$type<MerchImage[]>(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqSyncProduct: unique("uq_merch_products_org_sync").on(
      t.organizationId,
      t.printfulSyncProductId,
    ),
    uniqSlug: unique("uq_merch_products_org_slug").on(t.organizationId, t.slug),
    orgActiveIdx: index("idx_merch_products_org_active").on(t.organizationId, t.active),
  }),
);

export const merchVariants = pgTable(
  "merch_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => merchProducts.id, { onDelete: "cascade" }),
    printfulSyncVariantId: varchar("printful_sync_variant_id", { length: 64 }).notNull(),
    // Printful catalog variant id — the id Phase 2 passes to shipping-rate and
    // order-create calls. Distinct from the sync-variant id above.
    printfulVariantId: integer("printful_variant_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    size: varchar("size", { length: 40 }),
    color: varchar("color", { length: 60 }),
    sku: varchar("sku", { length: 100 }),
    retailPriceCents: integer("retail_price_cents").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqSyncVariant: unique("uq_merch_variants_sync").on(t.printfulSyncVariantId),
    productActiveIdx: index("idx_merch_variants_product_active").on(t.productId, t.active),
  }),
);

export const merchProductsRelations = relations(merchProducts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [merchProducts.organizationId],
    references: [organizations.id],
  }),
  variants: many(merchVariants),
}));

export const merchVariantsRelations = relations(merchVariants, ({ one }) => ({
  product: one(merchProducts, {
    fields: [merchVariants.productId],
    references: [merchProducts.id],
  }),
}));

export type MerchProduct = typeof merchProducts.$inferSelect;
export type NewMerchProduct = typeof merchProducts.$inferInsert;
export type MerchVariant = typeof merchVariants.$inferSelect;
export type NewMerchVariant = typeof merchVariants.$inferInsert;
```

- [ ] **Step 2: Register the schema in the barrel**

In `src/lib/db/schema/index.ts`, add next to the existing products export:

```ts
// Printful-backed merch catalog (merch shop Phase 1)
export * from "./merch";
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/NNNN_*.sql` creating `merch_products` and `merch_variants` with the two unique constraints and two indexes. Open it and confirm it only creates the two tables (no unexpected drops).

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Apply to staging (for later local testing)**

Run: `./scripts/with-bws.sh npm run db:migrate`
Expected: migration applies to the staging DB (bws → staging). Safe: additive, forward-compatible.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema/merch.ts src/lib/db/schema/index.ts src/lib/db/migrations
git commit -m "feat(merch): merch_products + merch_variants schema"
```

---

## Task 2: Printful API client

**Files:**
- Create: `src/lib/printful/types.ts`
- Create: `src/lib/printful/client.ts`
- Test: `tests/unit/printful/client.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `process.env.PRINTFUL_API_KEY`, optional `process.env.PRINTFUL_STORE_ID`.
- Produces:
  - `listStoreProducts(): Promise<PrintfulSyncProductSummary[]>`
  - `getSyncProduct(syncProductId: number): Promise<PrintfulSyncProductDetail>`
  - `isPrintfulConfigured(): boolean`
  - classes `PrintfulNotConfiguredError`, `PrintfulApiError` (has `.status: number`)
  - types `PrintfulSyncProductSummary`, `PrintfulSyncProductDetail`, `PrintfulSyncVariant`.

- [ ] **Step 1: Create the types file**

`src/lib/printful/types.ts`:

```ts
// Minimal Printful v1 store API shapes — only the fields Phase 1 reads.

export interface PrintfulFile {
  type: string; // "preview" | "default" | ...
  preview_url?: string;
  url?: string | null;
}

export interface PrintfulSyncProductSummary {
  id: number; // sync_product_id
  external_id: string;
  name: string;
  thumbnail_url: string;
  variants: number; // variant count
  synced: number;
}

export interface PrintfulSyncVariant {
  id: number; // sync_variant_id
  external_id: string;
  sync_product_id: number;
  name: string; // e.g. "Unisex Staple Tee / Black / M"
  synced: boolean;
  variant_id: number; // catalog variant id (Phase 2 rates/orders)
  retail_price: string; // "25.00"
  sku: string | null;
  currency: string;
  files?: PrintfulFile[];
}

export interface PrintfulSyncProductDetail {
  sync_product: {
    id: number;
    external_id: string;
    name: string;
    thumbnail_url: string;
  };
  sync_variants: PrintfulSyncVariant[];
}

export interface PrintfulListResponse<T> {
  code: number;
  result: T;
  paging?: { total: number; offset: number; limit: number };
  error?: { reason: string; message: string };
}
```

- [ ] **Step 2: Write the failing test**

`tests/unit/printful/client.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isPrintfulConfigured,
  listStoreProducts,
  PrintfulNotConfiguredError,
} from "@/lib/printful/client";

describe("printful client config guard", () => {
  const original = process.env.PRINTFUL_API_KEY;
  beforeEach(() => {
    delete process.env.PRINTFUL_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.PRINTFUL_API_KEY;
    else process.env.PRINTFUL_API_KEY = original;
  });

  it("reports not configured when the key is absent", () => {
    expect(isPrintfulConfigured()).toBe(false);
  });

  it("throws PrintfulNotConfiguredError before making any network call", async () => {
    await expect(listStoreProducts()).rejects.toBeInstanceOf(
      PrintfulNotConfiguredError,
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/printful/client.test.ts`
Expected: FAIL — cannot import from `@/lib/printful/client` (module not found).

- [ ] **Step 4: Create the client**

`src/lib/printful/client.ts`:

```ts
import type {
  PrintfulListResponse,
  PrintfulSyncProductSummary,
  PrintfulSyncProductDetail,
} from "./types";

const PRINTFUL_API_BASE = "https://api.printful.com";

export class PrintfulNotConfiguredError extends Error {
  constructor() {
    super("PRINTFUL_API_KEY is not set");
    this.name = "PrintfulNotConfiguredError";
  }
}

export class PrintfulApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "PrintfulApiError";
  }
}

// process.env first — Netlify SSR inlines import.meta.env at build time, so a
// rotated runtime secret only reads reliably via process.env.
function getApiKey(): string {
  const key = process.env.PRINTFUL_API_KEY ?? import.meta.env.PRINTFUL_API_KEY;
  if (!key) throw new PrintfulNotConfiguredError();
  return key;
}

function getStoreId(): string | undefined {
  return (
    process.env.PRINTFUL_STORE_ID ?? import.meta.env.PRINTFUL_STORE_ID ?? undefined
  );
}

export function isPrintfulConfigured(): boolean {
  return Boolean(process.env.PRINTFUL_API_KEY ?? import.meta.env.PRINTFUL_API_KEY);
}

async function pfGet<T>(path: string): Promise<PrintfulListResponse<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
  const storeId = getStoreId();
  if (storeId) headers["X-PF-Store-Id"] = storeId;

  const res = await fetch(`${PRINTFUL_API_BASE}${path}`, { headers });
  const json = (await res.json().catch(() => null)) as PrintfulListResponse<T> | null;
  if (!res.ok || !json) {
    const msg = json?.error?.message ?? res.statusText;
    throw new PrintfulApiError(res.status, `Printful GET ${path} failed: ${msg}`);
  }
  return json;
}

/** List every synced product in the store (paginated). */
export async function listStoreProducts(): Promise<PrintfulSyncProductSummary[]> {
  const out: PrintfulSyncProductSummary[] = [];
  const limit = 100;
  let offset = 0;
  for (;;) {
    const page = await pfGet<PrintfulSyncProductSummary[]>(
      `/store/products?offset=${offset}&limit=${limit}`,
    );
    out.push(...page.result);
    const total = page.paging?.total ?? out.length;
    offset += limit;
    if (offset >= total || page.result.length === 0) break;
  }
  return out;
}

/** Fetch one product's full detail (sync_product + sync_variants). */
export async function getSyncProduct(
  syncProductId: number,
): Promise<PrintfulSyncProductDetail> {
  const res = await pfGet<PrintfulSyncProductDetail>(
    `/store/products/${syncProductId}`,
  );
  return res.result;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/printful/client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Document env vars**

Add to `.env.example`:

```
# Printful print-on-demand (merch shop). Store API token from the Printful
# dashboard → Settings → Stores → API. Optional store id for account-level tokens.
PRINTFUL_API_KEY=
PRINTFUL_STORE_ID=
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/printful tests/unit/printful .env.example
git commit -m "feat(merch): Printful v1 store API client + config guard"
```

---

## Task 3: Pure sync mappers (TDD)

**Files:**
- Create: `src/lib/merch/map-sync-product.ts`
- Test: `tests/unit/merch/map-sync-product.test.ts`

**Interfaces:**
- Consumes: `PrintfulSyncProductDetail` from `@/lib/printful/types`.
- Produces:
  - `parseVariantOptions(name: string): { color: string | null; size: string | null }`
  - `retailPriceToCents(price: string): number`
  - `slugifyName(name: string): string`
  - `mapSyncProductDetail(detail: PrintfulSyncProductDetail): MappedMerchProduct`
  - types `MappedMerchProduct { printfulSyncProductId, name, baseSlug, images, variants }`, `MappedMerchVariant { printfulSyncVariantId, printfulVariantId, name, size, color, sku, retailPriceCents }`.

- [ ] **Step 1: Write the failing test**

`tests/unit/merch/map-sync-product.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseVariantOptions,
  retailPriceToCents,
  slugifyName,
  mapSyncProductDetail,
} from "@/lib/merch/map-sync-product";
import type { PrintfulSyncProductDetail } from "@/lib/printful/types";

describe("retailPriceToCents", () => {
  it("converts a decimal string to integer cents", () => {
    expect(retailPriceToCents("25.00")).toBe(2500);
    expect(retailPriceToCents("9.99")).toBe(999);
  });
  it("throws on an unparseable price", () => {
    expect(() => retailPriceToCents("free")).toThrow();
  });
});

describe("slugifyName", () => {
  it("lowercases, hyphenates, strips punctuation", () => {
    expect(slugifyName("Aspire Staple Tee!")).toBe("aspire-staple-tee");
  });
});

describe("parseVariantOptions", () => {
  it("pulls color + size from a 'Name / Color / Size' variant name", () => {
    expect(parseVariantOptions("Unisex Staple Tee / Black / M")).toEqual({
      color: "Black",
      size: "M",
    });
  });
  it("treats a single trailing segment as size when there is no color", () => {
    expect(parseVariantOptions("Snapback / One size")).toEqual({
      color: null,
      size: "One size",
    });
  });
  it("returns nulls when the name has no separators", () => {
    expect(parseVariantOptions("Sticker Pack")).toEqual({ color: null, size: null });
  });
});

describe("mapSyncProductDetail", () => {
  const detail: PrintfulSyncProductDetail = {
    sync_product: {
      id: 111,
      external_id: "ext-1",
      name: "Aspire Staple Tee",
      thumbnail_url: "https://cdn.printful/thumb.png",
    },
    sync_variants: [
      {
        id: 501,
        external_id: "ext-501",
        sync_product_id: 111,
        name: "Aspire Staple Tee / Black / M",
        synced: true,
        variant_id: 4012,
        retail_price: "25.00",
        sku: "TEE-BLK-M",
        currency: "USD",
        files: [{ type: "preview", preview_url: "https://cdn.printful/blk-m.png" }],
      },
      {
        id: 502,
        external_id: "ext-502",
        sync_product_id: 111,
        name: "Aspire Staple Tee / Black / L",
        synced: true,
        variant_id: 4013,
        retail_price: "25.00",
        sku: "TEE-BLK-L",
        currency: "USD",
        files: [{ type: "preview", preview_url: "https://cdn.printful/blk-m.png" }],
      },
    ],
  };

  it("maps product identity, slug, and deduped images", () => {
    const m = mapSyncProductDetail(detail);
    expect(m.printfulSyncProductId).toBe("111");
    expect(m.name).toBe("Aspire Staple Tee");
    expect(m.baseSlug).toBe("aspire-staple-tee");
    // thumbnail + one deduped preview (both variants share the same preview url)
    expect(m.images.map((i) => i.url)).toEqual([
      "https://cdn.printful/thumb.png",
      "https://cdn.printful/blk-m.png",
    ]);
  });

  it("maps each variant with cents, parsed options, and catalog id", () => {
    const m = mapSyncProductDetail(detail);
    expect(m.variants).toHaveLength(2);
    expect(m.variants[0]).toMatchObject({
      printfulSyncVariantId: "501",
      printfulVariantId: 4012,
      size: "M",
      color: "Black",
      sku: "TEE-BLK-M",
      retailPriceCents: 2500,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merch/map-sync-product.test.ts`
Expected: FAIL — module `@/lib/merch/map-sync-product` not found.

- [ ] **Step 3: Implement the mappers**

`src/lib/merch/map-sync-product.ts`:

```ts
import type { PrintfulSyncProductDetail } from "@/lib/printful/types";

export interface MappedMerchVariant {
  printfulSyncVariantId: string;
  printfulVariantId: number;
  name: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  retailPriceCents: number;
}

export interface MappedMerchProduct {
  printfulSyncProductId: string;
  name: string;
  baseSlug: string;
  images: { url: string }[];
  variants: MappedMerchVariant[];
}

export function retailPriceToCents(price: string): number {
  const value = Number.parseFloat(price);
  if (!Number.isFinite(value)) {
    throw new Error(`Unparseable Printful retail_price: ${price}`);
  }
  return Math.round(value * 100);
}

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Printful sync-variant names are formatted "Product / Color / Size" (or
 * "Product / Size" for single-option products). We take the last segment as
 * size and the second-to-last as color. Missing separators → nulls.
 */
export function parseVariantOptions(name: string): {
  color: string | null;
  size: string | null;
} {
  const parts = name.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { color: null, size: null };
  if (parts.length === 2) return { color: null, size: parts[1] };
  return { color: parts[parts.length - 2], size: parts[parts.length - 1] };
}

export function mapSyncProductDetail(
  detail: PrintfulSyncProductDetail,
): MappedMerchProduct {
  const { sync_product, sync_variants } = detail;

  // images: product thumbnail first, then distinct variant previews.
  const urls: string[] = [];
  if (sync_product.thumbnail_url) urls.push(sync_product.thumbnail_url);
  for (const v of sync_variants) {
    const preview = v.files?.find((f) => f.type === "preview")?.preview_url;
    if (preview && !urls.includes(preview)) urls.push(preview);
  }

  const variants: MappedMerchVariant[] = sync_variants.map((v) => {
    const { color, size } = parseVariantOptions(v.name);
    return {
      printfulSyncVariantId: String(v.id),
      printfulVariantId: v.variant_id,
      name: v.name,
      size,
      color,
      sku: v.sku,
      retailPriceCents: retailPriceToCents(v.retail_price),
    };
  });

  return {
    printfulSyncProductId: String(sync_product.id),
    name: sync_product.name,
    baseSlug: slugifyName(sync_product.name),
    images: urls.map((url) => ({ url })),
    variants,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/merch/map-sync-product.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/merch/map-sync-product.ts tests/unit/merch/map-sync-product.test.ts
git commit -m "feat(merch): pure Printful sync-product mappers"
```

---

## Task 4: Catalog sync service

**Files:**
- Create: `src/lib/merch/sync.ts`
- Test: `tests/unit/merch/sync-slugs.test.ts`

**Interfaces:**
- Consumes: `listStoreProducts`, `getSyncProduct` (`@/lib/printful/client`); `mapSyncProductDetail`, `MappedMerchProduct` (`@/lib/merch/map-sync-product`); `getDb` (`@/lib/db`); `merchProducts`, `merchVariants` (`@/lib/db/schema`).
- Produces:
  - `dedupeSlugs(items: { baseSlug: string }[]): string[]` — collision-free slugs, order-preserving.
  - `syncMerchCatalog(orgId: string): Promise<SyncResult>` where `SyncResult = { products: number; variants: number; deactivated: number }`.

- [ ] **Step 1: Write the failing test (pure slug dedupe)**

`tests/unit/merch/sync-slugs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dedupeSlugs } from "@/lib/merch/sync";

describe("dedupeSlugs", () => {
  it("passes distinct slugs through unchanged", () => {
    expect(dedupeSlugs([{ baseSlug: "tee" }, { baseSlug: "hoodie" }])).toEqual([
      "tee",
      "hoodie",
    ]);
  });
  it("suffixes collisions in order", () => {
    expect(
      dedupeSlugs([{ baseSlug: "tee" }, { baseSlug: "tee" }, { baseSlug: "tee" }]),
    ).toEqual(["tee", "tee-2", "tee-3"]);
  });
  it("falls back to 'item' for an empty base slug", () => {
    expect(dedupeSlugs([{ baseSlug: "" }, { baseSlug: "" }])).toEqual([
      "item",
      "item-2",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merch/sync-slugs.test.ts`
Expected: FAIL — `dedupeSlugs` not exported.

- [ ] **Step 3: Implement the sync service**

`src/lib/merch/sync.ts`:

```ts
import { getDb } from "@/lib/db";
import { and, eq, notInArray } from "drizzle-orm";
import { merchProducts, merchVariants } from "@/lib/db/schema";
import { listStoreProducts, getSyncProduct } from "@/lib/printful/client";
import {
  mapSyncProductDetail,
  type MappedMerchProduct,
} from "@/lib/merch/map-sync-product";

export interface SyncResult {
  products: number;
  variants: number;
  deactivated: number;
}

/** Make slugs unique + order-preserving; empty base → "item". */
export function dedupeSlugs(items: { baseSlug: string }[]): string[] {
  const seen = new Map<string, number>();
  return items.map(({ baseSlug }) => {
    const base = baseSlug || "item";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  });
}

/**
 * Pull every synced product from Printful and upsert it (and its variants)
 * into this org's merch catalog. Products no longer present in Printful are
 * deactivated (never deleted — keeps historical order references intact for
 * Phase 2). Idempotent: safe to re-run.
 */
export async function syncMerchCatalog(orgId: string): Promise<SyncResult> {
  const db = getDb();

  const summaries = await listStoreProducts();
  const mapped: MappedMerchProduct[] = [];
  for (const s of summaries) {
    const detail = await getSyncProduct(s.id);
    mapped.push(mapSyncProductDetail(detail));
  }

  const slugs = dedupeSlugs(mapped);
  let variantCount = 0;
  const seenSyncProductIds: string[] = [];

  for (let i = 0; i < mapped.length; i++) {
    const m = mapped[i];
    seenSyncProductIds.push(m.printfulSyncProductId);

    const [product] = await db
      .insert(merchProducts)
      .values({
        organizationId: orgId,
        printfulSyncProductId: m.printfulSyncProductId,
        name: m.name,
        slug: slugs[i],
        images: m.images,
        active: true,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [merchProducts.organizationId, merchProducts.printfulSyncProductId],
        set: {
          name: m.name,
          slug: slugs[i],
          images: m.images,
          active: true,
          syncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning({ id: merchProducts.id });

    const seenSyncVariantIds: string[] = [];
    for (const v of m.variants) {
      seenSyncVariantIds.push(v.printfulSyncVariantId);
      await db
        .insert(merchVariants)
        .values({
          productId: product.id,
          printfulSyncVariantId: v.printfulSyncVariantId,
          printfulVariantId: v.printfulVariantId,
          name: v.name,
          size: v.size,
          color: v.color,
          sku: v.sku,
          retailPriceCents: v.retailPriceCents,
          active: true,
        })
        .onConflictDoUpdate({
          target: merchVariants.printfulSyncVariantId,
          set: {
            productId: product.id,
            printfulVariantId: v.printfulVariantId,
            name: v.name,
            size: v.size,
            color: v.color,
            sku: v.sku,
            retailPriceCents: v.retailPriceCents,
            active: true,
            updatedAt: new Date(),
          },
        });
      variantCount++;
    }

    // deactivate variants that vanished from this product in Printful
    if (seenSyncVariantIds.length > 0) {
      await db
        .update(merchVariants)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(merchVariants.productId, product.id),
            notInArray(merchVariants.printfulSyncVariantId, seenSyncVariantIds),
          ),
        );
    }
  }

  // deactivate products removed from Printful entirely
  let deactivated = 0;
  if (seenSyncProductIds.length > 0) {
    const rows = await db
      .update(merchProducts)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(merchProducts.organizationId, orgId),
          notInArray(merchProducts.printfulSyncProductId, seenSyncProductIds),
        ),
      )
      .returning({ id: merchProducts.id });
    deactivated = rows.length;
  }

  return { products: mapped.length, variants: variantCount, deactivated };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/merch/sync-slugs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/merch/sync.ts tests/unit/merch/sync-slugs.test.ts
git commit -m "feat(merch): idempotent Printful catalog sync service"
```

---

## Task 5: Admin sync endpoint

**Files:**
- Create: `src/pages/api/admin/merch/sync.ts`
- Test: `tests/api/admin/merch-sync.test.ts`

**Interfaces:**
- Consumes: `requireOrgAdminAccess` (`@/lib/auth`); `syncMerchCatalog` (`@/lib/merch/sync`); `isPrintfulConfigured`, `PrintfulApiError` (`@/lib/printful/client`).
- Produces: `POST /api/admin/merch/sync` → `200 { products, variants, deactivated }` | `401` | `503` (not configured) | `502` (Printful error).

- [ ] **Step 1: Write the failing API test (auth contract)**

`tests/api/admin/merch-sync.test.ts`:

```ts
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("POST /api/admin/merch/sync", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await fetch(`${BASE}/api/admin/merch/sync`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Start the dev server (`npm run dev`) in another shell, then:
Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/merch-sync.test.ts`
Expected: FAIL — route does not exist yet (404, not 401).

- [ ] **Step 3: Implement the endpoint**

`src/pages/api/admin/merch/sync.ts`:

```ts
import type { APIRoute } from "astro";
import { requireOrgAdminAccess } from "@/lib/auth";
import { isPrintfulConfigured, PrintfulApiError } from "@/lib/printful/client";
import { syncMerchCatalog } from "@/lib/merch/sync";

/** POST — pull the Printful store catalog into this org's merch tables. */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  if (!isPrintfulConfigured()) {
    return new Response(
      JSON.stringify({ error: "Printful is not configured (PRINTFUL_API_KEY missing)" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const result = await syncMerchCatalog(auth.organizationId);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof PrintfulApiError) {
      console.error("Merch sync — Printful API error:", error.status, error.message);
      return new Response(
        JSON.stringify({ error: "Printful request failed", detail: error.message }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
    console.error("Merch sync failed:", error);
    return new Response(JSON.stringify({ error: "Merch sync failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/merch-sync.test.ts`
Expected: PASS — unauthenticated POST returns 401.

> Note: the full happy-path sync needs a real `PRINTFUL_API_KEY` + admin session and is exercised manually (Step 5), mirroring how Stripe-dependent flows are left out of the CI API suite.

- [ ] **Step 5: Manual end-to-end sync (with a real token)**

With `PRINTFUL_API_KEY` set (via bws or shell) and at least one product published in the Printful dashboard, sign in as an admin and POST to `/api/admin/merch/sync` (browser devtools or curl with the session cookie). Expected: `200 { products: N, variants: M, deactivated: 0 }`, and rows appear in `merch_products` / `merch_variants` on staging.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/admin/merch/sync.ts tests/api/admin/merch-sync.test.ts
git commit -m "feat(merch): admin Printful catalog sync endpoint"
```

---

## Task 6: Catalog read helpers

**Files:**
- Create: `src/lib/merch/catalog.ts`
- Test: `tests/unit/merch/catalog-helpers.test.ts`

**Interfaces:**
- Consumes: `getDb` (`@/lib/db`); `merchProducts`, `merchVariants`, types `MerchProduct`, `MerchVariant`, `MerchImage` (`@/lib/db/schema`).
- Produces:
  - `priceRangeCents(variants: { retailPriceCents: number }[]): { minCents: number; maxCents: number } | null`
  - `primaryImageUrl(images: MerchImage[] | null): string | null`
  - `listActiveMerchProducts(orgId: string): Promise<MerchListItem[]>` where `MerchListItem = { id; name; slug; imageUrl: string | null; fromCents: number | null }`
  - `getMerchProductBySlug(orgId, slug): Promise<{ product: MerchProduct; variants: MerchVariant[] } | null>`

- [ ] **Step 1: Write the failing test (pure helpers)**

`tests/unit/merch/catalog-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { priceRangeCents, primaryImageUrl } from "@/lib/merch/catalog";

describe("priceRangeCents", () => {
  it("returns null for no variants", () => {
    expect(priceRangeCents([])).toBeNull();
  });
  it("returns min and max across variants", () => {
    expect(
      priceRangeCents([
        { retailPriceCents: 2500 },
        { retailPriceCents: 3000 },
        { retailPriceCents: 2000 },
      ]),
    ).toEqual({ minCents: 2000, maxCents: 3000 });
  });
});

describe("primaryImageUrl", () => {
  it("returns the first image url", () => {
    expect(primaryImageUrl([{ url: "a.png" }, { url: "b.png" }])).toBe("a.png");
  });
  it("returns null for null or empty images", () => {
    expect(primaryImageUrl(null)).toBeNull();
    expect(primaryImageUrl([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merch/catalog-helpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers + queries**

`src/lib/merch/catalog.ts`:

```ts
import { getDb } from "@/lib/db";
import { and, asc, eq } from "drizzle-orm";
import {
  merchProducts,
  merchVariants,
  type MerchProduct,
  type MerchVariant,
  type MerchImage,
} from "@/lib/db/schema";

export interface MerchListItem {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  fromCents: number | null;
}

export function priceRangeCents(
  variants: { retailPriceCents: number }[],
): { minCents: number; maxCents: number } | null {
  if (variants.length === 0) return null;
  let min = variants[0].retailPriceCents;
  let max = variants[0].retailPriceCents;
  for (const v of variants) {
    if (v.retailPriceCents < min) min = v.retailPriceCents;
    if (v.retailPriceCents > max) max = v.retailPriceCents;
  }
  return { minCents: min, maxCents: max };
}

export function primaryImageUrl(images: MerchImage[] | null): string | null {
  return images && images.length > 0 ? images[0].url : null;
}

/** Active products for an org, with a cover image + "from" price. */
export async function listActiveMerchProducts(
  orgId: string,
): Promise<MerchListItem[]> {
  const db = getDb();
  const products = await db
    .select()
    .from(merchProducts)
    .where(and(eq(merchProducts.organizationId, orgId), eq(merchProducts.active, true)))
    .orderBy(asc(merchProducts.sortOrder), asc(merchProducts.name));

  const items: MerchListItem[] = [];
  for (const p of products) {
    const variants = await db
      .select({ retailPriceCents: merchVariants.retailPriceCents })
      .from(merchVariants)
      .where(and(eq(merchVariants.productId, p.id), eq(merchVariants.active, true)));
    const range = priceRangeCents(variants);
    items.push({
      id: p.id,
      name: p.name,
      slug: p.slug,
      imageUrl: primaryImageUrl(p.images),
      fromCents: range?.minCents ?? null,
    });
  }
  return items;
}

/** One product (by org + slug) with its active variants; null if missing. */
export async function getMerchProductBySlug(
  orgId: string,
  slug: string,
): Promise<{ product: MerchProduct; variants: MerchVariant[] } | null> {
  const db = getDb();
  const [product] = await db
    .select()
    .from(merchProducts)
    .where(
      and(
        eq(merchProducts.organizationId, orgId),
        eq(merchProducts.slug, slug),
        eq(merchProducts.active, true),
      ),
    )
    .limit(1);
  if (!product) return null;

  const variants = await db
    .select()
    .from(merchVariants)
    .where(and(eq(merchVariants.productId, product.id), eq(merchVariants.active, true)))
    .orderBy(asc(merchVariants.sortOrder), asc(merchVariants.retailPriceCents));

  return { product, variants };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/merch/catalog-helpers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/merch/catalog.ts tests/unit/merch/catalog-helpers.test.ts
git commit -m "feat(merch): catalog read helpers"
```

---

## Task 7: Storefront grid (`/shop`)

**Files:**
- Modify: `src/pages/shop.astro` (replace the placeholder entirely)

**Interfaces:**
- Consumes: `listActiveMerchProducts` (`@/lib/merch/catalog`); `Astro.locals.organization`; `EmptyState` (`@/components/ui/empty-state`).

- [ ] **Step 1: Replace the page**

`src/pages/shop.astro` (full file):

```astro
---
// Aspire merch storefront — Printful-backed catalog (Phase 1: browse only).
// SSR: reads the request org and queries active products. Not prerendered.
import BaseLayout from "@/layouts/BaseLayout.astro";
import EmptyState from "@/components/ui/empty-state";
import { listActiveMerchProducts } from "@/lib/merch/catalog";

const org = Astro.locals.organization;
const products = org ? await listActiveMerchProducts(org.id) : [];

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
---

<BaseLayout
  title="Shop — Aspire Sports"
  description="Aspire Sports gear and merchandise."
>
  <main id="main-content" class="flex-1 max-w-[1080px] mx-auto w-full px-6 py-14">
    <header class="mb-10">
      <h1 class="font-display text-4xl text-ink mb-3">Aspire Sports Shop</h1>
      <p class="text-ink-muted">Gear for players, parents, and fans.</p>
    </header>

    {products.length === 0 ? (
      <EmptyState
        title="No gear yet"
        description="Our shop is being stocked. Check back soon."
      />
    ) : (
      <ul class="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10 list-none p-0 m-0">
        {products.map((p) => (
          <li>
            <a href={`/shop/${p.slug}`} class="group block">
              <div class="aspect-square bg-cream-dark overflow-hidden mb-3">
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    loading="lazy"
                    class="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                  />
                ) : (
                  <div class="w-full h-full grid place-items-center text-ink-muted text-sm">
                    No image
                  </div>
                )}
              </div>
              <h2 class="text-sm font-medium text-ink">{p.name}</h2>
              {p.fromCents !== null && (
                <p class="text-sm text-ink-muted">from {money(p.fromCents)}</p>
              )}
            </a>
          </li>
        ))}
      </ul>
    )}
  </main>
</BaseLayout>
```

> The `prerender = true` and `noindex` from the placeholder are intentionally dropped — the storefront is SSR (per-request org + DB) and should be indexable. Confirm `EmptyState`'s default export/props match `@/components/ui/empty-state` (adjust to named import if that file exports named).

- [ ] **Step 2: Type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds with no "Astro.request.headers on prerendered page" error for `/shop` (it is now SSR).

- [ ] **Step 3: Visual check**

With the dev server running (and, ideally, synced products on staging), open `http://localhost:4321/shop`. Expected: grid of products, or the "No gear yet" empty state if none synced.

- [ ] **Step 4: Commit**

```bash
git add src/pages/shop.astro
git commit -m "feat(merch): SSR storefront grid at /shop"
```

---

## Task 8: Product detail (`/shop/[slug]`) + variant picker island

**Files:**
- Create: `src/pages/shop/[slug].astro`
- Create: `src/components/shop/product-detail.tsx`

**Interfaces:**
- Consumes: `getMerchProductBySlug` (`@/lib/merch/catalog`); `Astro.locals.organization`; `useHydrationBeacon` (`@/lib/hooks/use-hydration-beacon`).
- Produces: `ProductDetail` React island (default export) taking `{ name; description; images; variants }` where `variants: { id; size; color; retailPriceCents }[]`.

- [ ] **Step 1: Create the island**

`src/components/shop/product-detail.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

export interface ProductDetailVariant {
  id: string;
  size: string | null;
  color: string | null;
  retailPriceCents: number;
}

export interface ProductDetailProps {
  name: string;
  description: string | null;
  images: { url: string; alt?: string }[];
  variants: ProductDetailVariant[];
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function ProductDetail({
  name,
  description,
  images,
  variants,
}: ProductDetailProps) {
  useHydrationBeacon();

  const [activeImage, setActiveImage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(
    variants[0]?.id ?? null,
  );

  const selected = useMemo(
    () => variants.find((v) => v.id === selectedId) ?? null,
    [variants, selectedId],
  );

  return (
    <div className="grid md:grid-cols-2 gap-10">
      <div>
        <div className="aspect-square bg-cream-dark overflow-hidden mb-3">
          {images[activeImage] ? (
            <img
              src={images[activeImage].url}
              alt={images[activeImage].alt ?? name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-ink-muted text-sm">
              No image
            </div>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {images.map((img, i) => (
              <button
                key={img.url}
                type="button"
                onClick={() => setActiveImage(i)}
                className={`w-16 h-16 overflow-hidden border ${
                  i === activeImage ? "border-ink" : "border-transparent"
                }`}
              >
                <img
                  src={img.url}
                  alt={img.alt ?? `${name} view ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h1 className="font-display text-3xl text-ink mb-2">{name}</h1>
        {selected && (
          <p className="text-lg text-ink mb-6">{money(selected.retailPriceCents)}</p>
        )}

        {variants.length > 0 && (
          <fieldset className="mb-6 border-0 p-0 m-0">
            <legend className="text-sm font-medium text-ink mb-2">Options</legend>
            <div className="flex gap-2 flex-wrap">
              {variants.map((v) => {
                const label = [v.color, v.size].filter(Boolean).join(" · ") || "Default";
                const isSel = v.id === selectedId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    className={`px-3 py-2 text-sm border ${
                      isSel ? "border-ink bg-ink text-cream" : "border-ink/30 text-ink"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {description && (
          <div className="prose prose-sm text-ink-muted whitespace-pre-line">
            {description}
          </div>
        )}

        {/* Phase 2 adds an Add-to-cart button here. */}
        <p className="mt-8 text-sm text-ink-muted">
          Online ordering opens soon.
        </p>
      </div>
    </div>
  );
}
```

> Note: this island uses `className` (React). The `.astro` grid in Task 7 uses `class` (Astro templates) — that is correct for each context; do not "fix" one to match the other.

- [ ] **Step 2: Create the page**

`src/pages/shop/[slug].astro` (full file):

```astro
---
// Merch product detail — SSR by org + slug. 404s on unknown/inactive slug.
import BaseLayout from "@/layouts/BaseLayout.astro";
import ProductDetail from "@/components/shop/product-detail";
import { getMerchProductBySlug } from "@/lib/merch/catalog";

const { slug } = Astro.params;
const org = Astro.locals.organization;
const data = org && slug ? await getMerchProductBySlug(org.id, slug) : null;

if (!data) {
  return new Response(null, { status: 404 });
}

const { product, variants } = data;
const detailVariants = variants.map((v) => ({
  id: v.id,
  size: v.size,
  color: v.color,
  retailPriceCents: v.retailPriceCents,
}));
---

<BaseLayout title={`${product.name} — Aspire Sports Shop`} description={product.description ?? `${product.name} — Aspire Sports gear.`}>
  <main id="main-content" class="flex-1 max-w-[1080px] mx-auto w-full px-6 py-14">
    <a href="/shop" class="text-sm text-ink-muted hover:text-ink mb-8 inline-block">← Back to shop</a>
    <ProductDetail
      client:load
      name={product.name}
      description={product.description}
      images={product.images ?? []}
      variants={detailVariants}
    />
  </main>
</BaseLayout>
```

- [ ] **Step 3: Type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds.

- [ ] **Step 4: Visual check**

With synced products on staging and the dev server running, open a product from the `/shop` grid. Expected: gallery + option buttons switch the displayed price; unknown slug (`/shop/does-not-exist`) returns 404.

- [ ] **Step 5: Commit**

```bash
git add src/pages/shop/[slug].astro src/components/shop/product-detail.tsx
git commit -m "feat(merch): product detail page + variant-picker island"
```

---

## Definition of Done (Phase 1)

Run the relevant slice of the repo's pre-push checklist before opening the PR:

- [ ] `npm run db:generate` produced and committed the merch migration (Task 1).
- [ ] `npx vitest run tests/unit/merch tests/unit/printful` — all green.
- [ ] `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/merch-sync.test.ts` — 401 contract passes (dev server up).
- [ ] `npx tsc --noEmit` — zero errors.
- [ ] `npm run build` — succeeds; `/shop` and `/shop/[slug]` are SSR (no prerender warning treated as real for them).
- [ ] Manual: with a real `PRINTFUL_API_KEY` + a published Printful product, the admin sync populates the catalog and both pages render it.

**Out of scope (Phase 2, separate plan):** `merch_orders` / `merch_order_items` schema, client-side cart, `/api/merch/quote` + `/api/merch/checkout`, Stripe Checkout Session with live Printful shipping + `automatic_tax`, the `merch_order` webhook branch that auto-creates the Printful order, and order-confirmation email.
```
