# Merch Phase 3b — Multi-Store Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make merch **stores** a first-class concept — the existing Printful catalog becomes a "general" store, a "team" store can be shared via an unlisted link and checked out end-to-end via pickup, and the Phase 3a `merch_team_kits` table is absorbed into `merch_stores`.

**Architecture:** A new `merch_stores` entity (scope general|league|team) owns products (`store_id` replaces `kit_id`), storefront routing (`/shop` general, `/shop/[slug]` resolver, `/shop/[store]/[product]`, unlisted `?k=token`), and order provenance (`store_id` on orders). Pickup fulfillment folds into the existing webhook dispatcher. Everything stays on Stripe hosted Checkout + Stripe Tax / Astro SSR / Postgres + Drizzle.

**Tech Stack:** Astro 5 (SSR), React 19 islands, Drizzle ORM + Postgres, Stripe (hosted Checkout Sessions + `automatic_tax`), Printful v1 API, Vitest (unit + API), Playwright (E2E).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-25-merch-phase-3b-multi-store-foundation-design.md`. Every task's requirements implicitly include it.
- **Money is authoritative server-side.** Never trust client prices, window state, or fulfillment type — always reprice/re-check against the DB at quote & checkout.
- **Multi-tenant safety:** every "pick a store" query filters `organization_id` AND an explicit predicate, with deterministic `orderBy`. The general-store lookup MUST filter `scope='general'` + `organization_id`.
- **Migrations:** `db:generate` produces the DDL, but columns that become `NOT NULL` on non-empty tables and the data backfill are **hand-written** into the generated `.sql` (pattern: 0023/0024). Enum `ADD VALUE` ships in its **own** migration file (can't share a tx with usage). Write type/table creation idempotently with `DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$;` and `IF NOT EXISTS`.
- **Amounts** in integer cents; **currency** `"usd"`; **goods tax code** `txcd_99999999` (`MERCH_TAX_CODE`).
- **Per-slice green:** each slice must leave `npx tsc --noEmit` clean and `npx astro build` passing. The destructive kit-drop is deferred to Slice 4 so Slices 1–3 don't strand the kit code.
- **Worktree has no `node_modules`** — run `npx tsc` / `npx astro build` / `npx vitest`, not `./node_modules/.bin/*`. Dev/test DB is **staging** via bws (`DATABASE_URL` = switchyard proxy). API tests need a running dev server.
- **Commit** after each task with the shown message. End commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

## File Structure

**New files:**
- `src/lib/db/schema/merch-stores.ts` — `merch_stores` table, scope/visibility enums, `MerchStore` type. Also re-homes `merchProductSourceEnum` + `ProductPersonalization` + `OrderItemPersonalization` (they outlive the kit table).
- `src/lib/merch/stores.ts` — store resolvers + `storeWindowState` + `generateShareToken` (replaces `src/lib/merch/kits.ts`).
- `src/pages/shop/[store]/[product].astro` — per-store product detail.
- `src/pages/admin/merch/stores.astro`, `src/pages/admin/merch/stores/[id].astro`, `src/pages/admin/merch/stores/[id]/orders.astro` — store admin.
- `src/components/admin/merch-stores-list.tsx`, `src/components/admin/merch-store-editor.tsx`, `src/components/admin/merch-store-orders.tsx` — store admin islands (from the kit equivalents).
- `src/pages/api/admin/merch/stores.ts`, `src/pages/api/admin/merch/store-products.ts`, `src/pages/api/admin/merch/orders.ts` — store admin endpoints.
- Migrations `0110` (stores + columns + backfill), `0111` (order-status enum add), `0112` (drop kits).

**Modified:**
- `src/lib/db/schema/merch.ts` — `kit_id`→`store_id`, per-store slug unique, relations; import enums from `merch-stores.ts`.
- `src/lib/db/schema/merch-orders.ts` — `store_id` on orders, `personalization` + nullable `printful_sync_variant_id` on items, `awaiting_pickup`/`collected` statuses.
- `src/lib/db/schema/index.ts` — export `merch-stores`, drop `merch-team-kits` (Slice 4).
- `src/lib/merch/catalog.ts` — store-scoped list/detail.
- `src/lib/merch/reprice.ts` — store-scoped + manual/pickup lines.
- `src/lib/merch/sync.ts` — set `storeId` = general store; scope deactivation to general store.
- `src/lib/merch/fulfillment.ts` — pickup dispatch branch.
- `src/lib/merch/order-confirmation-email.ts` — pickup email variant.
- `src/lib/merch/cart.ts`, `src/components/shop/cart-store.ts` — store-scoped cart + personalization values.
- `src/pages/shop.astro`, `src/pages/shop/[slug].astro`, `src/pages/shop/checkout.astro` — store-aware storefront.
- `src/pages/api/merch/checkout.ts`, `src/components/shop/checkout-form.tsx`, `src/components/shop/product-detail.tsx` — store-aware + pickup.
- `src/lib/admin/nav-super-admin.ts` — nav entry.

**Deleted (Slice 4):** `src/lib/db/schema/merch-team-kits.ts`, `src/lib/merch/kits.ts`, `src/components/admin/merch-kit-editor.tsx`, `src/components/admin/merch-kits-list.tsx`, `src/pages/admin/merch/kits.astro`, `src/pages/admin/merch/kits/[id].astro`, `src/pages/api/admin/merch/kits.ts`, `src/pages/api/admin/merch/kit-products.ts`, and their tests.

---

## Slice 1 — Schema, store library, sync, migrations

Leaves the tree green: adds `merch_stores` + new columns (kit table/`kit_id` **retained** for now), a full store library, and updates `sync.ts` for the now-required `store_id`. Backfill runs in migration 0110.

### Task 1.1: `merch_stores` schema + re-homed enums/types

**Files:**
- Create: `src/lib/db/schema/merch-stores.ts`
- Modify: `src/lib/db/schema/index.ts` (add `export * from "./merch-stores";`)
- Test: `tests/unit/merch/stores-schema.test.ts`

**Interfaces:**
- Produces: `merchStores` table; `merchStoreScopeEnum` (`general|league|team`), `merchStoreVisibilityEnum` (`public|unlisted`); `merchProductSourceEnum` (`printful|manual`, **moved here** from `merch-team-kits.ts`); types `MerchStore`, `NewMerchStore`, `ProductPersonalization` (`{ name?: boolean; number?: boolean }`), `OrderItemPersonalization` (`{ name?: string; number?: string }`).

- [ ] **Step 1: Write the failing test** — `tests/unit/merch/stores-schema.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { merchStores, merchStoreScopeEnum, merchStoreVisibilityEnum, merchProductSourceEnum } from "@/lib/db/schema/merch-stores";

describe("merch-stores schema", () => {
  it("exposes scope + visibility + source enum values", () => {
    expect(merchStoreScopeEnum.enumValues).toEqual(["general", "league", "team"]);
    expect(merchStoreVisibilityEnum.enumValues).toEqual(["public", "unlisted"]);
    expect(merchProductSourceEnum.enumValues).toEqual(["printful", "manual"]);
  });
  it("defines the merch_stores table with the expected columns", () => {
    const cols = Object.keys(merchStores);
    for (const c of ["id","organizationId","scope","teamId","name","slug","visibility","shareToken","orderOpensAt","orderClosesAt","pickupLocation","active","sortOrder"]) {
      expect(cols).toContain(c);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merch/stores-schema.test.ts`
Expected: FAIL — cannot resolve `@/lib/db/schema/merch-stores`.

- [ ] **Step 3: Write the schema** — `src/lib/db/schema/merch-stores.ts`

```ts
import {
  pgTable, uuid, varchar, text, timestamp, boolean, integer, pgEnum, unique, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { teams } from "./teams";

export const merchStoreScopeEnum = pgEnum("merch_store_scope", ["general", "league", "team"]);
export const merchStoreVisibilityEnum = pgEnum("merch_store_visibility", ["public", "unlisted"]);
// Re-homed from the retired merch_team_kits module (outlives the kit table).
export const merchProductSourceEnum = pgEnum("merch_product_source", ["printful", "manual"]);

/** Product-level config: which personalization fields to collect at checkout. */
export interface ProductPersonalization { name?: boolean; number?: boolean }
/** Order-item snapshot: the personalization *values* the line was ordered with. */
export interface OrderItemPersonalization { name?: string; number?: string }

/**
 * A first-class storefront scoped to the whole org (general), a league (seam
 * only in 3b), or a team. Absorbs the former merch_team_kits: a team store
 * carries the order window, unlisted share token, and pickup location.
 */
export const merchStores = pgTable(
  "merch_stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    scope: merchStoreScopeEnum("scope").notNull(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    description: text("description"),
    visibility: merchStoreVisibilityEnum("visibility").notNull().default("public"),
    shareToken: varchar("share_token", { length: 40 }),
    orderOpensAt: timestamp("order_opens_at"),
    orderClosesAt: timestamp("order_closes_at"),
    pickupLocation: text("pickup_location"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqSlug: unique("uq_merch_stores_org_slug").on(t.organizationId, t.slug),
    uniqToken: unique("uq_merch_stores_token").on(t.shareToken),
    orgScopeIdx: index("idx_merch_stores_org_scope").on(t.organizationId, t.scope),
  }),
);

export const merchStoresRelations = relations(merchStores, ({ one }) => ({
  organization: one(organizations, { fields: [merchStores.organizationId], references: [organizations.id] }),
  team: one(teams, { fields: [merchStores.teamId], references: [teams.id] }),
}));

export type MerchStore = typeof merchStores.$inferSelect;
export type NewMerchStore = typeof merchStores.$inferInsert;
```

Add to `src/lib/db/schema/index.ts` (keep the existing `merch-team-kits` export for now — removed in Slice 4):

```ts
export * from "./merch-stores";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/merch/stores-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema/merch-stores.ts src/lib/db/schema/index.ts tests/unit/merch/stores-schema.test.ts
git commit -m "feat(merch): merch_stores schema + re-homed source enum/personalization types"
```

### Task 1.2: product/order/item schema changes

**Files:**
- Modify: `src/lib/db/schema/merch.ts`, `src/lib/db/schema/merch-orders.ts`
- Test: `tests/unit/merch/orders-schema.test.ts`

**Interfaces:**
- Produces: `merchProducts.storeId`; per-store unique `uq_merch_products_store_slug`; `merchOrders.storeId`; `merchOrderItems.personalization` (jsonb `OrderItemPersonalization`) and nullable `printfulSyncVariantId`; `merchOrderStatusEnum` unchanged in code (values added by migration 0111 — but add `awaiting_pickup`/`collected` to the pgEnum literal now so Drizzle types include them).

- [ ] **Step 1: Write the failing test** — `tests/unit/merch/orders-schema.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { merchOrderStatusEnum } from "@/lib/db/schema/merch-orders";
import { merchProducts } from "@/lib/db/schema/merch";

describe("merch order/product schema (3b)", () => {
  it("order status enum includes pickup states", () => {
    expect(merchOrderStatusEnum.enumValues).toEqual(
      ["pending","paid","submitted","shipped","cancelled","failed","awaiting_pickup","collected"],
    );
  });
  it("products carry store_id", () => {
    expect(Object.keys(merchProducts)).toContain("storeId");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merch/orders-schema.test.ts`
Expected: FAIL — enum lacks `awaiting_pickup`; `storeId` missing.

- [ ] **Step 3: Edit `merch.ts`**

Replace the kit import + `kitId` column + `kit` relation, and swap the slug unique:

```ts
// top: replace the merch-team-kits import with:
import { merchProductSourceEnum, merchStores, type ProductPersonalization } from "./merch-stores";
```

```ts
// in the columns block: replace the kitId line with storeId.
// NOTE: declared notNull to reflect the final schema; migration 0110 adds it
// nullable, backfills, then SET NOT NULL.
storeId: uuid("store_id").notNull().references(() => merchStores.id, { onDelete: "cascade" }),
```

```ts
// in the table extras: replace uniqSlug + orgActiveIdx
uniqSlug: unique("uq_merch_products_store_slug").on(t.storeId, t.slug),
storeActiveIdx: index("idx_merch_products_store_active").on(t.storeId, t.active),
```

```ts
// relations: replace the `kit` relation with `store`
store: one(merchStores, { fields: [merchProducts.storeId], references: [merchStores.id] }),
```

(Leave `uq_merch_products_org_sync` — the sync upsert target — unchanged.)

- [ ] **Step 4: Edit `merch-orders.ts`**

```ts
// extend the status enum:
export const merchOrderStatusEnum = pgEnum("merch_order_status", [
  "pending","paid","submitted","shipped","cancelled","failed","awaiting_pickup","collected",
]);
```

```ts
// import the personalization type + stores table at top:
import { merchStores, type OrderItemPersonalization } from "./merch-stores";
```

```ts
// merchOrders columns — add after organizationId:
storeId: uuid("store_id").notNull().references(() => merchStores.id, { onDelete: "restrict" }),
```

```ts
// merchOrderItems columns — make sync id nullable + add personalization:
printfulSyncVariantId: varchar("printful_sync_variant_id", { length: 64 }), // nullable: manual/pickup lines have none
personalization: jsonb("personalization").$type<OrderItemPersonalization>(),
```

Add a `store` relation to `merchOrdersRelations` (`one(merchStores, ...)`). Ensure `jsonb` is imported.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/merch/orders-schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema/merch.ts src/lib/db/schema/merch-orders.ts tests/unit/merch/orders-schema.test.ts
git commit -m "feat(merch): store_id on products/orders, order-item personalization + pickup statuses"
```

### Task 1.3: store library (`stores.ts`)

**Files:**
- Create: `src/lib/merch/stores.ts`
- Test: `tests/unit/merch/stores.test.ts`

**Interfaces:**
- Produces:
  - `storeWindowState(store: { orderOpensAt: Date|null; orderClosesAt: Date|null }, now: Date): "not_open"|"open"|"closed"`
  - `generateShareToken(): string`
  - `getGeneralStore(orgId): Promise<MerchStore|null>`; `ensureGeneralStore(orgId, orgName): Promise<MerchStore>`
  - `getStoreBySlug(orgId, slug): Promise<MerchStore|null>`; `getStoreByToken(token): Promise<MerchStore|null>`
  - `listStores(orgId): Promise<MerchStore[]>`; `getStoreById(orgId, id): Promise<MerchStore|null>`
  - `isStoreShoppable(store, now): boolean` (active && visible-appropriately && window open)

- [ ] **Step 1: Write the failing test** — `tests/unit/merch/stores.test.ts` (pure fns only; DB fns covered by API tests)

```ts
import { describe, it, expect } from "vitest";
import { storeWindowState, generateShareToken, isStoreShoppable } from "@/lib/merch/stores";

const t = (iso: string) => new Date(iso);

describe("storeWindowState", () => {
  const now = t("2026-08-01T12:00:00Z");
  it("open when no window set", () => {
    expect(storeWindowState({ orderOpensAt: null, orderClosesAt: null }, now)).toBe("open");
  });
  it("not_open before open", () => {
    expect(storeWindowState({ orderOpensAt: t("2026-08-02T00:00:00Z"), orderClosesAt: null }, now)).toBe("not_open");
  });
  it("closed after close", () => {
    expect(storeWindowState({ orderOpensAt: null, orderClosesAt: t("2026-07-31T00:00:00Z") }, now)).toBe("closed");
  });
  it("open inside window", () => {
    expect(storeWindowState({ orderOpensAt: t("2026-07-01T00:00:00Z"), orderClosesAt: t("2026-08-31T00:00:00Z") }, now)).toBe("open");
  });
});

describe("generateShareToken", () => {
  it("is 32 hex chars, unique-ish", () => {
    const a = generateShareToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(generateShareToken());
  });
});

describe("isStoreShoppable", () => {
  const base = { active: true, orderOpensAt: null, orderClosesAt: null } as const;
  const now = t("2026-08-01T12:00:00Z");
  it("false when inactive", () => { expect(isStoreShoppable({ ...base, active: false }, now)).toBe(false); });
  it("false when closed", () => { expect(isStoreShoppable({ ...base, orderClosesAt: t("2026-07-01T00:00:00Z") }, now)).toBe(false); });
  it("true when active + open", () => { expect(isStoreShoppable(base, now)).toBe(true); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merch/stores.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `src/lib/merch/stores.ts`**

```ts
import { getDb } from "@/lib/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { merchStores, type MerchStore } from "@/lib/db/schema";

export const GENERAL_STORE_SLUG = "general";

export function generateShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function storeWindowState(
  store: { orderOpensAt: Date | null; orderClosesAt: Date | null },
  now: Date,
): "not_open" | "open" | "closed" {
  if (store.orderOpensAt && now < store.orderOpensAt) return "not_open";
  if (store.orderClosesAt && now > store.orderClosesAt) return "closed";
  return "open";
}

export function isStoreShoppable(
  store: { active: boolean; orderOpensAt: Date | null; orderClosesAt: Date | null },
  now: Date,
): boolean {
  return store.active && storeWindowState(store, now) === "open";
}

/** The org's single general storefront (scope='general'). Deterministic order. */
export async function getGeneralStore(orgId: string): Promise<MerchStore | null> {
  const [row] = await getDb().select().from(merchStores)
    .where(and(eq(merchStores.organizationId, orgId), eq(merchStores.scope, "general")))
    .orderBy(asc(merchStores.createdAt)).limit(1);
  return row ?? null;
}

/** Get-or-create the org's general store (used by first-time Printful sync). */
export async function ensureGeneralStore(orgId: string, orgName: string): Promise<MerchStore> {
  const existing = await getGeneralStore(orgId);
  if (existing) return existing;
  const [row] = await getDb().insert(merchStores).values({
    organizationId: orgId, scope: "general", name: `${orgName} Shop`,
    slug: GENERAL_STORE_SLUG, visibility: "public",
  }).returning();
  return row;
}

export async function getStoreBySlug(orgId: string, slug: string): Promise<MerchStore | null> {
  const [row] = await getDb().select().from(merchStores)
    .where(and(eq(merchStores.organizationId, orgId), eq(merchStores.slug, slug)))
    .orderBy(asc(merchStores.createdAt)).limit(1);
  return row ?? null;
}

export async function getStoreByToken(token: string): Promise<MerchStore | null> {
  const [row] = await getDb().select().from(merchStores)
    .where(eq(merchStores.shareToken, token)).limit(1);
  return row ?? null;
}

export async function listStores(orgId: string): Promise<MerchStore[]> {
  return getDb().select().from(merchStores)
    .where(eq(merchStores.organizationId, orgId))
    .orderBy(asc(merchStores.sortOrder), desc(merchStores.createdAt));
}

export async function getStoreById(orgId: string, id: string): Promise<MerchStore | null> {
  const [row] = await getDb().select().from(merchStores)
    .where(and(eq(merchStores.id, id), eq(merchStores.organizationId, orgId))).limit(1);
  return row ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/merch/stores.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/merch/stores.ts tests/unit/merch/stores.test.ts
git commit -m "feat(merch): store resolvers + window/shoppable helpers"
```

### Task 1.4: point `sync.ts` at the general store

**Files:**
- Modify: `src/lib/merch/sync.ts`
- Test: `tests/unit/merch/sync-dedupe.test.ts` (existing `dedupeSlugs` test still passes; add a guard test that `syncMerchCatalog` requires an org name param).

**Interfaces:**
- Consumes: `ensureGeneralStore(orgId, orgName)` from Task 1.3.
- Produces: `syncMerchCatalog(orgId: string, orgName: string)` — now sets `storeId` on every upserted product and scopes deactivation to the general store.

- [ ] **Step 1: Write the failing test** — append to (or create) `tests/unit/merch/sync-signature.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { syncMerchCatalog } from "@/lib/merch/sync";

describe("syncMerchCatalog signature", () => {
  it("requires an org name (arity 2)", () => {
    expect(syncMerchCatalog.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merch/sync-signature.test.ts`
Expected: FAIL — current arity is 1.

- [ ] **Step 3: Edit `sync.ts`**

- Import `ensureGeneralStore`: `import { ensureGeneralStore } from "@/lib/merch/stores";`
- Change signature to `export async function syncMerchCatalog(orgId: string, orgName: string): Promise<SyncResult>`.
- After `const db = getDb();`, add: `const store = await ensureGeneralStore(orgId, orgName);`
- In the product `.insert(...).values({...})`, add `storeId: store.id,`. (The `onConflictDoUpdate.set` need not set `storeId` — a synced product never changes stores.)
- In the final "deactivate products removed from Printful" query, add `eq(merchProducts.storeId, store.id)` to the `and(...)` so it only touches the general store's Printful rows (manual rows in other stores are already excluded by the null-sync-id `notInArray`, but this makes it explicit and store-safe).

- [ ] **Step 4: Update the sync endpoint caller**

In `src/pages/api/admin/merch/sync.ts`, the POST handler calls `syncMerchCatalog(auth.organizationId)`. Change to pass the org name: fetch it from `context.locals.organization?.name ?? "Aspire Sports"` and pass as the 2nd arg. (Confirm the exact variable by reading the file; the org is on `context.locals.organization`.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/unit/merch/ && npx tsc --noEmit`
Expected: PASS, zero TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/merch/sync.ts src/pages/api/admin/merch/sync.ts tests/unit/merch/sync-signature.test.ts
git commit -m "feat(merch): sync writes products into the org general store"
```

### Task 1.5: migration 0110 — stores table, columns, backfill

**Files:**
- Create: `src/lib/db/migrations/0110_merch_stores.sql` (+ Drizzle meta snapshot via `db:generate`)

**Process:** run `npm run db:generate` to produce the DDL + snapshot from the updated schema, then **hand-edit** the generated `.sql` so the two new `NOT NULL` FK columns are added nullable, backfilled, then constrained — and append the data backfill. The generated snapshot (meta/*.json) reflects the final schema and is committed as-is.

- [ ] **Step 1: Generate the skeleton**

Run: `npm run db:generate`
This creates `src/lib/db/migrations/0110_*.sql` + `meta/0110_snapshot.json`. Rename the `.sql` to `0110_merch_stores.sql` if you prefer (keep the number).

- [ ] **Step 2: Replace the `.sql` body with the ordered, idempotent migration**

```sql
-- Enums (idempotent) ---------------------------------------------------------
DO $$ BEGIN CREATE TYPE "merch_store_scope" AS ENUM ('general','league','team'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "merch_store_visibility" AS ENUM ('public','unlisted'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- merch_stores ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "merch_stores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "scope" "merch_store_scope" NOT NULL,
  "team_id" uuid,
  "name" varchar(255) NOT NULL,
  "slug" varchar(140) NOT NULL,
  "description" text,
  "visibility" "merch_store_visibility" DEFAULT 'public' NOT NULL,
  "share_token" varchar(40),
  "order_opens_at" timestamp,
  "order_closes_at" timestamp,
  "pickup_location" text,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "uq_merch_stores_org_slug" UNIQUE("organization_id","slug"),
  CONSTRAINT "uq_merch_stores_token" UNIQUE("share_token")
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_stores" ADD CONSTRAINT "merch_stores_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_stores" ADD CONSTRAINT "merch_stores_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_merch_stores_org_scope" ON "merch_stores" ("organization_id","scope");--> statement-breakpoint
-- one general store per org
CREATE UNIQUE INDEX IF NOT EXISTS "uq_merch_stores_one_general" ON "merch_stores" ("organization_id") WHERE "scope" = 'general';--> statement-breakpoint

-- new columns (nullable first) -----------------------------------------------
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "store_id" uuid;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "store_id" uuid;--> statement-breakpoint
ALTER TABLE "merch_order_items" ADD COLUMN IF NOT EXISTS "personalization" jsonb;--> statement-breakpoint
ALTER TABLE "merch_order_items" ALTER COLUMN "printful_sync_variant_id" DROP NOT NULL;--> statement-breakpoint

-- backfill: one general store per org that has products --------------------------
INSERT INTO "merch_stores" ("organization_id","scope","name","slug","visibility")
SELECT o."id", 'general',
       COALESCE(o."name",'Aspire Sports') || ' Shop', 'general', 'public'
FROM "organizations" o
WHERE EXISTS (
  SELECT 1 FROM "merch_products" p
  WHERE p."organization_id" = o."id" AND p."kit_id" IS NULL
)
AND NOT EXISTS (
  SELECT 1 FROM "merch_stores" s WHERE s."organization_id" = o."id" AND s."scope" = 'general'
);--> statement-breakpoint
-- general products -> their org's general store
UPDATE "merch_products" p
SET "store_id" = s."id"
FROM "merch_stores" s
WHERE p."kit_id" IS NULL AND s."organization_id" = p."organization_id" AND s."scope" = 'general';--> statement-breakpoint

-- backfill: each existing kit becomes a team store ---------------------------
INSERT INTO "merch_stores" ("id","organization_id","scope","team_id","name","slug","visibility","share_token","order_opens_at","order_closes_at","pickup_location","active","created_at","updated_at")
SELECT gen_random_uuid(), k."organization_id", 'team', k."team_id", k."name",
       'team-' || left(k."id"::text, 8), 'unlisted', k."share_token",
       k."order_opens_at", k."order_closes_at", k."pickup_location", k."active",
       k."created_at", k."updated_at"
FROM "merch_team_kits" k;--> statement-breakpoint
-- map: kit -> new team store (join on share_token, which is globally unique)
UPDATE "merch_products" p
SET "store_id" = s."id"
FROM "merch_team_kits" k
JOIN "merch_stores" s ON s."share_token" = k."share_token" AND s."scope" = 'team'
WHERE p."kit_id" = k."id";--> statement-breakpoint

-- backfill order provenance: existing merch orders are all general-store ------
UPDATE "merch_orders" ord
SET "store_id" = s."id"
FROM "merch_stores" s
WHERE ord."store_id" IS NULL AND s."organization_id" = ord."organization_id" AND s."scope" = 'general';--> statement-breakpoint

-- constrain + index ----------------------------------------------------------
ALTER TABLE "merch_products" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "merch_orders" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_products" ADD CONSTRAINT "merch_products_store_id_merch_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."merch_stores"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_store_id_merch_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."merch_stores"("id") ON DELETE restrict; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
-- swap product slug uniqueness org -> store
ALTER TABLE "merch_products" DROP CONSTRAINT IF EXISTS "uq_merch_products_org_slug";--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_products" ADD CONSTRAINT "uq_merch_products_store_slug" UNIQUE("store_id","slug"); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_merch_products_store_active" ON "merch_products" ("store_id","active");--> statement-breakpoint
DROP INDEX IF EXISTS "idx_merch_products_org_active";
```

> **Migration order note:** `store_id SET NOT NULL` runs *after* both backfills. If any org somehow has a product with `kit_id IS NULL` but no general store row (shouldn't happen — the INSERT covers exactly that set), the `SET NOT NULL` would fail loudly rather than silently mis-scope. That is the desired safety behavior.

- [ ] **Step 3: Apply to staging + verify**

Run (from a bws shell): `npm run db:migrate`
Then verify with `npm run db:studio` (or a quick query) that: every `merch_products.store_id` is non-null; the Hoodie sits in a `general` store; any pre-existing kit is now a `team` store with its products repointed.

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npx astro build`
Expected: zero TS errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/migrations/0110_merch_stores.sql src/lib/db/migrations/meta/
git commit -m "feat(merch): migration 0110 — merch_stores + store_id backfill"
```

---

## Slice 2 — Storefront: store-scoped catalog, routing, cart

Leaves the tree green: changes `catalog.ts` signatures and updates **all** callers together (`shop.astro`, `[slug].astro`, new `[store]/[product].astro`, `product-detail.tsx`, cart).

### Task 2.1: store-scope the catalog layer

**Files:**
- Modify: `src/lib/merch/catalog.ts`
- Test: `tests/unit/merch/catalog-pure.test.ts` (the pure helpers `priceRangeCents`/`primaryImageUrl` keep their existing tests; add none new — DB fns are exercised by E2E/API).

**Interfaces:**
- Produces: `listActiveMerchProducts(storeId: string)`, `getMerchProductBySlug(storeId: string, slug: string)` — both now filter by `merchProducts.storeId` instead of `organizationId`.

- [ ] **Step 1: Edit `catalog.ts`** — change both functions' scoping:

In `listActiveMerchProducts`, rename the param to `storeId` and change the `where` to `and(eq(merchProducts.storeId, storeId), eq(merchProducts.active, true))`. In `getMerchProductBySlug`, rename `orgId`→`storeId` and change the product `where` to `and(eq(merchProducts.storeId, storeId), eq(merchProducts.slug, slug), eq(merchProducts.active, true))`. Signatures/return types otherwise unchanged.

- [ ] **Step 2: Typecheck (expected to fail at callers)**

Run: `npx tsc --noEmit`
Expected: FAIL at `shop.astro` / `[slug].astro` (they pass `org.id`). Fixed in 2.2–2.3.

- [ ] **Step 3: Commit (WIP allowed — callers fixed next tasks in same slice)**

```bash
git add src/lib/merch/catalog.ts
git commit -m "refactor(merch): catalog list/detail scoped by store_id"
```

### Task 2.2: general storefront + `/shop/[slug]` resolver

**Files:**
- Modify: `src/pages/shop.astro`, `src/pages/shop/[slug].astro`
- Create: `src/pages/shop/[store]/[product].astro`

**Interfaces:**
- Consumes: `getGeneralStore`, `getStoreBySlug`, `getStoreByToken`, `storeWindowState` (Slice 1); `listActiveMerchProducts(storeId)`, `getMerchProductBySlug(storeId, slug)` (2.1).

- [ ] **Step 1: `shop.astro` — general store grid**

Replace the products query:

```astro
import { getGeneralStore } from "@/lib/merch/stores";
import { listActiveMerchProducts } from "@/lib/merch/catalog";
// ...
const org = Astro.locals.organization;
const store = org ? await getGeneralStore(org.id) : null;
const products = store ? await listActiveMerchProducts(store.id) : [];
```

Product links become `/shop/${store!.slug}/${p.slug}` (i.e. `/shop/general/<slug>`). Keep the rest of the markup.

- [ ] **Step 2: `[slug].astro` — store-or-legacy resolver**

Replace the whole frontmatter with a resolver that (a) renders a store grid if `slug` is a store, else (b) 301s a legacy general-product slug to its canonical `/shop/general/<slug>`, else 404. Unlisted stores require `?k=token` and set `noindex`.

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
import { EmptyState } from "@/components/ui/empty-state";
import CartDrawer from "@/components/shop/cart-drawer";
import { getStoreBySlug, storeWindowState } from "@/lib/merch/stores";
import { listActiveMerchProducts, getMerchProductBySlug } from "@/lib/merch/catalog";
import { getGeneralStore } from "@/lib/merch/stores";

const { slug } = Astro.params;
const org = Astro.locals.organization;
if (!org || !slug) return new Response("Not found", { status: 404 });

const store = await getStoreBySlug(org.id, slug);

// (a) legacy general-product slug -> canonical store-scoped URL
if (!store) {
  const general = await getGeneralStore(org.id);
  if (general && await getMerchProductBySlug(general.id, slug)) {
    return Astro.redirect(`/shop/${general.slug}/${slug}`, 301);
  }
  return new Response("Not found", { status: 404 });
}

// (b) unlisted gate
const token = Astro.url.searchParams.get("k");
if (store.visibility === "unlisted" && store.shareToken !== token) {
  return new Response("Not found", { status: 404 });
}

const products = store.active ? await listActiveMerchProducts(store.id) : [];
const windowState = storeWindowState(store, new Date());
const noindex = store.visibility === "unlisted";
const tokenQS = store.visibility === "unlisted" ? `?k=${store.shareToken}` : "";
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
---
<BaseLayout title={`${store.name} — Aspire Sports`} description={store.description ?? `${store.name} store.`} noindex={noindex}>
  <main id="main-content" class="flex-1 max-w-[1080px] mx-auto w-full px-6 py-14">
    <header class="mb-10 flex items-start justify-between gap-6">
      <div>
        <h1 class="font-display text-4xl text-ink mb-3">{store.name}</h1>
        {store.description && <p class="text-ink-muted">{store.description}</p>}
        {windowState === "not_open" && <p class="text-ink-muted mt-2">Ordering hasn't opened yet.</p>}
        {windowState === "closed" && <p class="text-ink-muted mt-2">Ordering has closed.</p>}
        {store.scope === "team" && store.pickupLocation && (
          <p class="text-ink-muted mt-2 text-sm">Pickup: {store.pickupLocation}</p>
        )}
      </div>
      <CartDrawer client:load />
    </header>
    {products.length === 0 ? (
      <EmptyState title="No items yet" description="Check back soon." />
    ) : (
      <ul class="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10 list-none p-0 m-0">
        {products.map((p) => (
          <li>
            <a href={`/shop/${store.slug}/${p.slug}${tokenQS}`} class="group block">
              <div class="aspect-square bg-cream-dark overflow-hidden mb-3">
                {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" class="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" />
                  : <div class="w-full h-full grid place-items-center text-ink-muted text-sm">No image</div>}
              </div>
              <h2 class="text-sm font-medium text-ink">{p.name}</h2>
              {p.fromCents !== null && <p class="text-sm text-ink-muted">from {money(p.fromCents)}</p>}
            </a>
          </li>
        ))}
      </ul>
    )}
  </main>
</BaseLayout>
```

> **`noindex` prop:** confirm `BaseLayout.astro` accepts a `noindex` prop; if not, add one that renders `<meta name="robots" content="noindex" />` in `<head>`. (Grep `noindex` in `BaseLayout.astro`; several pages already noindex, so the prop likely exists — reuse it.)

- [ ] **Step 3: `[store]/[product].astro` — per-store product detail**

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
import ProductDetail from "@/components/shop/product-detail";
import CartDrawer from "@/components/shop/cart-drawer";
import { getStoreBySlug, storeWindowState } from "@/lib/merch/stores";
import { getMerchProductBySlug } from "@/lib/merch/catalog";

const { store: storeSlug, product: productSlug } = Astro.params;
const org = Astro.locals.organization;
if (!org || !storeSlug || !productSlug) return new Response("Not found", { status: 404 });

const store = await getStoreBySlug(org.id, storeSlug);
if (!store) return new Response("Not found", { status: 404 });

const token = Astro.url.searchParams.get("k");
if (store.visibility === "unlisted" && store.shareToken !== token) return new Response("Not found", { status: 404 });

const data = await getMerchProductBySlug(store.id, productSlug);
if (!data) return new Response("Not found", { status: 404 });

const { product, variants } = data;
const shoppable = store.active && storeWindowState(store, new Date()) === "open";
const noindex = store.visibility === "unlisted";
const tokenQS = store.visibility === "unlisted" ? `?k=${store.shareToken}` : "";
const detailVariants = variants.map((v) => ({
  id: v.id, size: v.size, color: v.color, retailPriceCents: v.retailPriceCents,
  printfulSyncVariantId: v.printfulSyncVariantId,
}));
---
<BaseLayout title={`${product.name} — ${store.name}`} description={product.description ?? `${product.name}.`} noindex={noindex}>
  <main id="main-content" class="flex-1 max-w-[1080px] mx-auto w-full px-6 py-14">
    <header class="flex items-center justify-between mb-8">
      <a href={`/shop/${store.slug}${tokenQS}`} class="text-sm text-ink-muted hover:text-ink inline-block">← Back to {store.name}</a>
      <CartDrawer client:load />
    </header>
    <ProductDetail client:load
      name={product.name} description={product.description} images={product.images ?? []}
      variants={detailVariants} slug={product.slug}
      storeId={store.id} storeSlug={store.slug} shoppable={shoppable}
      fulfillmentType={product.fulfillmentType}
      personalization={product.personalization ?? null} shareToken={store.visibility === "unlisted" ? store.shareToken : null} />
  </main>
</BaseLayout>
```

- [ ] **Step 4: Delete the old `src/pages/shop/[slug].astro` product-detail behavior** — it's fully replaced by the resolver in Step 2 (the product page now lives at `[store]/[product].astro`). Ensure no other route still points at `/shop/<slug>` for products (the resolver 301 covers external/legacy links).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL only at `product-detail.tsx` (new props) — fixed in 2.3.

### Task 2.3: `product-detail.tsx` + store-scoped cart

**Files:**
- Modify: `src/components/shop/product-detail.tsx`, `src/lib/merch/cart.ts`, `src/components/shop/cart-store.ts`
- Test: `tests/unit/merch/cart.test.ts`

**Interfaces:**
- Produces: `CartItem` gains `storeId: string`, `storeSlug: string`, optional `personalization?: OrderItemPersonalization`, optional `lineId?: string`. `mergeCartItem` merges by `variantId` **only when** neither line is personalized; personalized lines never merge (each is its own line, keyed by `lineId`). New `cartStoreId(items): string | null` returns the single store the cart belongs to (or null if empty).

- [ ] **Step 1: Write the failing test** — `tests/unit/merch/cart.test.ts` (extend existing)

```ts
import { describe, it, expect } from "vitest";
import { mergeCartItem, cartStoreId, type CartItem } from "@/lib/merch/cart";

const base: CartItem = {
  variantId: "v1", productSlug: "tee", name: "Tee", size: "M", color: null,
  unitPriceCents: 2500, imageUrl: null, printfulSyncVariantId: null,
  storeId: "s1", storeSlug: "general", quantity: 1,
};

describe("mergeCartItem (store-aware, personalization-aware)", () => {
  it("merges quantities for identical non-personalized variant", () => {
    const out = mergeCartItem([base], { ...base, quantity: 2 });
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(3);
  });
  it("keeps personalized lines separate", () => {
    const a: CartItem = { ...base, lineId: "l1", personalization: { name: "A", number: "7" } };
    const b: CartItem = { ...base, lineId: "l2", personalization: { name: "B", number: "9" } };
    const out = mergeCartItem([a], b);
    expect(out).toHaveLength(2);
  });
});

describe("cartStoreId", () => {
  it("returns null for empty", () => expect(cartStoreId([])).toBeNull());
  it("returns the store id for a single-store cart", () => expect(cartStoreId([base])).toBe("s1"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merch/cart.test.ts`
Expected: FAIL — new fields/fn absent.

- [ ] **Step 3: Edit `cart.ts`**

```ts
import type { OrderItemPersonalization } from "@/lib/db/schema";

// Local union (Slice 2 predates reprice.ts's export in Slice 3). Keep in sync
// with merchFulfillmentTypeEnum; reprice.ts re-declares the same `MerchFulfillmentType`.
export type CartFulfillmentType = "printful_pod" | "self_shipped" | "pickup" | "digital";

export interface CartItem {
  variantId: string;
  productSlug: string;
  name: string;
  size: string | null;
  color: string | null;
  unitPriceCents: number;
  imageUrl: string | null;
  printfulSyncVariantId: string | null;
  storeId: string;
  storeSlug: string;
  fulfillmentType: CartFulfillmentType; // from the product; drives pickup-only checkout
  personalization?: OrderItemPersonalization;
  lineId?: string; // set for personalized lines so they never merge
  quantity: number;
}

export function cartSubtotalCents(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
}

export function cartStoreId(items: CartItem[]): string | null {
  return items.length ? items[0].storeId : null;
}

export function mergeCartItem(items: CartItem[], item: CartItem): CartItem[] {
  // Personalized lines are always distinct (keyed by lineId).
  if (item.personalization && (item.personalization.name || item.personalization.number)) {
    return [...items, item];
  }
  const existing = items.find((i) => i.variantId === item.variantId && !i.lineId);
  if (!existing) return [...items, item];
  return items.map((i) =>
    i.variantId === item.variantId && !i.lineId ? { ...i, quantity: i.quantity + item.quantity } : i,
  );
}
```

- [ ] **Step 4: Edit `cart-store.ts`** — the `add` action must enforce a single-store cart. Change `add` to: if the cart is non-empty and its `storeId` differs from the new item's, replace the cart (start fresh with the new store's item) rather than mixing. Implementation:

```ts
add: (item: CartItem) => {
  const current = read();
  const sameStore = current.length === 0 || current[0].storeId === item.storeId;
  persist(sameStore ? mergeCartItem(current, item) : [item]);
},
```

(Optionally surface a toast "Started a new cart for <store>" — wire via the existing sonner `toast` if the drawer imports it; not required for green.)

- [ ] **Step 5: Edit `product-detail.tsx`** — accept new props `storeId`, `storeSlug`, `shoppable`, `fulfillmentType`, `personalization`, `shareToken`, and when building the `CartItem` for `add()`, include `storeId`, `storeSlug`, `fulfillmentType`, and (if `personalization` requests fields) render name/number inputs and attach `personalization` + a `lineId` (`crypto.randomUUID()`). Disable the add-to-cart button when `!shoppable`. Read the current file to match its structure; keep existing variant-select UX. The `printfulSyncVariantId` prop on variants is now `string | null`.

- [ ] **Step 6: Run tests + typecheck + build**

Run: `npx vitest run tests/unit/merch/ && npx tsc --noEmit && npx astro build`
Expected: PASS; zero TS errors; build OK.

- [ ] **Step 7: Commit**

```bash
git add src/pages/shop.astro src/pages/shop/\[slug\].astro "src/pages/shop/[store]/[product].astro" src/components/shop/product-detail.tsx src/lib/merch/cart.ts src/components/shop/cart-store.ts tests/unit/merch/cart.test.ts
git commit -m "feat(merch): multi-store storefront routing + store-scoped cart"
```

### Task 2.4: E2E — unlisted store gating

**Files:**
- Create/Modify: `tests/e2e/merch-stores.spec.ts`
- Verify: `tests/e2e/landing-pages.spec.ts` still asserts `/shop` is indexable (grep it; do not break the post-merge `test-full` spec).

- [ ] **Step 1: Write the E2E** (uses e2e-seeded org). Assert: `/shop` renders the general grid (200, indexable). An unlisted team store 404s without `?k=` and renders with `?k=<token>` + emits `noindex`. Seed a team store in `seed-e2e-tests.ts` if none exists (mirror the existing merch fixture pattern). Use `waitForHydration(page)` before interactions.

```ts
import { test, expect } from "@playwright/test";

test("general shop is indexable", async ({ page }) => {
  await page.goto("/shop", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toBeVisible();
  const robots = await page.locator('meta[name="robots"]').count();
  expect(robots).toBe(0); // general store is indexable
});
// Unlisted-store cases require a seeded team store + token; add once the seed exposes one.
```

- [ ] **Step 2: Run**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/merch-stores.spec.ts`
Expected: PASS (dev server running).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/merch-stores.spec.ts src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "test(merch): storefront store-gating e2e"
```

---

## Slice 3 — Pickup checkout end-to-end

Adds the pickup path: reprice broadened, store-aware checkout endpoint, `awaiting_pickup`/`collected` enum values (migration 0111), webhook pickup branch, pickup email. Leaves the tree green.

### Task 3.1: broaden `reprice.ts` (store-scoped + manual/pickup)

**Files:**
- Modify: `src/lib/merch/reprice.ts`
- Test: `tests/unit/merch/reprice.test.ts` (extend existing `matchRequestedToRows` tests)

**Interfaces:**
- Produces: `RepricedLine` gains `fulfillmentType: "printful_pod"|"self_shipped"|"pickup"|"digital"`, `personalizationConfig: ProductPersonalization | null`, and `printfulVariantId: number | null` + `printfulSyncVariantId: string | null` (nullable for manual lines). New `repriceStoreCartItems(storeId, items): Promise<{ok:true;lines:RepricedLine[]}|{ok:false}>` — fetches active variants of active products **in that store**, no `source` filter. `matchRequestedToRows` updated to carry the new fields.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { matchRequestedToRows, type VariantPriceRow } from "@/lib/merch/reprice";

const row: VariantPriceRow = {
  id: "v1", printfulVariantId: null, printfulSyncVariantId: null,
  variantName: "Jersey / M", size: "M", color: null, retailPriceCents: 4500,
  productName: "Home Jersey", fulfillmentType: "pickup", personalizationConfig: { name: true, number: true },
};

describe("matchRequestedToRows (pickup/manual)", () => {
  it("prices a pickup line with null printful ids", () => {
    const out = matchRequestedToRows([{ variantId: "v1", quantity: 1 }], [row]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.lines[0].fulfillmentType).toBe("pickup");
      expect(out.lines[0].printfulVariantId).toBeNull();
      expect(out.lines[0].unitPriceCents).toBe(4500);
      expect(out.lines[0].personalizationConfig).toEqual({ name: true, number: true });
    }
  });
  it("fails when a requested variant is missing", () => {
    expect(matchRequestedToRows([{ variantId: "nope", quantity: 1 }], [row]).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merch/reprice.test.ts`
Expected: FAIL — `fulfillmentType`/`personalizationConfig` not on the type; nullable ids rejected.

- [ ] **Step 3: Rewrite `reprice.ts`**

```ts
import { getDb } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import { merchVariants, merchProducts, type ProductPersonalization } from "@/lib/db/schema";

export type MerchFulfillmentType = "printful_pod" | "self_shipped" | "pickup" | "digital";

export interface RepricedLine {
  variantId: string;
  fulfillmentType: MerchFulfillmentType;
  printfulVariantId: number | null;
  printfulSyncVariantId: string | null;
  productName: string;
  variantName: string;
  size: string | null;
  color: string | null;
  unitPriceCents: number;
  personalizationConfig: ProductPersonalization | null;
  quantity: number;
}

export interface VariantPriceRow {
  id: string;
  printfulVariantId: number | null;
  printfulSyncVariantId: string | null;
  variantName: string;
  size: string | null;
  color: string | null;
  retailPriceCents: number;
  productName: string;
  fulfillmentType: MerchFulfillmentType;
  personalizationConfig: ProductPersonalization | null;
}

/** Pure: match requested (variantId, quantity) items to fetched rows. Dedup-safe. */
export function matchRequestedToRows(
  items: { variantId: string; quantity: number }[],
  rows: VariantPriceRow[],
): { ok: true; lines: RepricedLine[] } | { ok: false } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines: RepricedLine[] = [];
  for (const it of items) {
    const r = byId.get(it.variantId);
    if (!r) return { ok: false };
    lines.push({
      variantId: r.id,
      fulfillmentType: r.fulfillmentType,
      printfulVariantId: r.printfulVariantId,
      printfulSyncVariantId: r.printfulSyncVariantId,
      productName: r.productName,
      variantName: r.variantName,
      size: r.size,
      color: r.color,
      unitPriceCents: r.retailPriceCents,
      personalizationConfig: r.personalizationConfig,
      quantity: it.quantity,
    });
  }
  return { ok: true, lines };
}

/** Server-authoritative reprice of items within a single store. No source filter —
 * printful and manual/pickup lines both price from merch_variants. */
export async function repriceStoreCartItems(
  storeId: string,
  items: { variantId: string; quantity: number }[],
): Promise<{ ok: true; lines: RepricedLine[] } | { ok: false }> {
  const ids = [...new Set(items.map((i) => i.variantId))];
  if (ids.length === 0) return { ok: false };
  const rows = await getDb()
    .select({
      id: merchVariants.id,
      printfulVariantId: merchVariants.printfulVariantId,
      printfulSyncVariantId: merchVariants.printfulSyncVariantId,
      variantName: merchVariants.name,
      size: merchVariants.size,
      color: merchVariants.color,
      retailPriceCents: merchVariants.retailPriceCents,
      productName: merchProducts.name,
      fulfillmentType: merchProducts.fulfillmentType,
      personalizationConfig: merchProducts.personalization,
    })
    .from(merchVariants)
    .innerJoin(merchProducts, eq(merchVariants.productId, merchProducts.id))
    .where(and(
      inArray(merchVariants.id, ids),
      eq(merchVariants.active, true),
      eq(merchProducts.active, true),
      eq(merchProducts.storeId, storeId),
    ));
  return matchRequestedToRows(items, rows as VariantPriceRow[]);
}
```

> The old `repriceCartItems(orgId, items)` is replaced by `repriceStoreCartItems(storeId, items)`. The only caller is `checkout.ts` (Task 3.2).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/merch/reprice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/merch/reprice.ts tests/unit/merch/reprice.test.ts
git commit -m "feat(merch): store-scoped reprice covering manual/pickup lines"
```

### Task 3.2: migration 0111 — order-status enum values

**Files:**
- Create: `src/lib/db/migrations/0111_merch_pickup_status.sql`

- [ ] **Step 1: Generate + verify**

Run `npm run db:generate`. It should emit `ALTER TYPE "merch_order_status" ADD VALUE ...` for the two new values (already present in the schema pgEnum from Task 1.2). If generate folded them into 0110's snapshot instead, hand-write this file:

```sql
ALTER TYPE "merch_order_status" ADD VALUE IF NOT EXISTS 'awaiting_pickup';--> statement-breakpoint
ALTER TYPE "merch_order_status" ADD VALUE IF NOT EXISTS 'collected';
```

- [ ] **Step 2: Migrate staging**

Run: `npm run db:migrate`
Expected: applies cleanly (own migration — no same-tx usage).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/migrations/0111_merch_pickup_status.sql src/lib/db/migrations/meta/
git commit -m "feat(merch): migration 0111 — awaiting_pickup/collected order statuses"
```

### Task 3.3: store-aware checkout endpoint (Printful + pickup branches)

> **Dependency:** implement **Task 3.4 (org-origin helper) FIRST** — this task imports `getOrgOriginAddress` from it. If executing strictly in order, do 3.4 before 3.3.

**Files:**
- Modify: `src/pages/api/merch/checkout.ts`
- Create: `src/lib/merch/checkout-store.ts` (helpers: partition lines, resolve pickup tax address)
- Test: `tests/unit/merch/checkout-store.test.ts`

**Interfaces:**
- Consumes: `getStoreById`? no — the storefront is public, so resolve by **org + storeId** via a new `getStoreForCheckout(orgId, storeId)` (reuse `getStoreById`), `isStoreShoppable`, `repriceStoreCartItems`.
- Produces: `partitionByFulfillment(lines): { printful: RepricedLine[]; pickup: RepricedLine[] }`; `lineNeedsShipping(line): boolean` (true for `printful_pod`/`self_shipped`). Checkout request schema gains `storeId` and per-item optional `personalization`; `address` becomes optional (required iff any line needs shipping).

- [ ] **Step 1: Write the failing unit test** — `tests/unit/merch/checkout-store.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { partitionByFulfillment, lineNeedsShipping } from "@/lib/merch/checkout-store";
import type { RepricedLine } from "@/lib/merch/reprice";

const line = (ft: RepricedLine["fulfillmentType"]): RepricedLine => ({
  variantId: "v", fulfillmentType: ft, printfulVariantId: null, printfulSyncVariantId: null,
  productName: "P", variantName: "V", size: null, color: null, unitPriceCents: 1000,
  personalizationConfig: null, quantity: 1,
});

describe("checkout-store partition", () => {
  it("splits printful vs pickup", () => {
    const { printful, pickup } = partitionByFulfillment([line("printful_pod"), line("pickup")]);
    expect(printful).toHaveLength(1);
    expect(pickup).toHaveLength(1);
  });
  it("lineNeedsShipping true for printful/self_shipped only", () => {
    expect(lineNeedsShipping(line("printful_pod"))).toBe(true);
    expect(lineNeedsShipping(line("self_shipped"))).toBe(true);
    expect(lineNeedsShipping(line("pickup"))).toBe(false);
    expect(lineNeedsShipping(line("digital"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merch/checkout-store.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `src/lib/merch/checkout-store.ts`**

```ts
import type { RepricedLine } from "./reprice";

export function lineNeedsShipping(line: Pick<RepricedLine, "fulfillmentType">): boolean {
  return line.fulfillmentType === "printful_pod" || line.fulfillmentType === "self_shipped";
}

export function partitionByFulfillment(lines: RepricedLine[]): {
  printful: RepricedLine[]; pickup: RepricedLine[];
} {
  return {
    printful: lines.filter((l) => l.fulfillmentType === "printful_pod"),
    pickup: lines.filter((l) => l.fulfillmentType === "pickup"),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/merch/checkout-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `checkout.ts`** to be store-aware with a pickup branch.

Key changes (full handler; keep rate-limit + `stripe` guard, drop the hard `isPrintfulConfigured` gate to the printful branch only):

```ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchOrders, merchOrderItems } from "@/lib/db/schema";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { stripe } from "@/lib/stripe/client";
import { upsertGuestUser } from "@/lib/registrations/upsert-guest-user";
import { isPrintfulConfigured, calculateShipping, PrintfulApiError } from "@/lib/printful/client";
import { toPrintfulRecipient, pickCheapestRate, shippingRateToCents } from "@/lib/printful/order-mappers";
import { assembleQuote } from "@/lib/merch/quote";
import { repriceStoreCartItems } from "@/lib/merch/reprice";
import { buildMerchLineItems } from "@/lib/merch/checkout-line-items";
import { partitionByFulfillment, lineNeedsShipping } from "@/lib/merch/checkout-store";
import { getStoreById, isStoreShoppable } from "@/lib/merch/stores";
import { getOrgOriginAddress } from "@/lib/merch/org-origin"; // Task 3.4

const addressSchema = z.object({
  name: z.string().trim().min(1), address1: z.string().min(1), address2: z.string().optional().nullable(),
  city: z.string().min(1), state: z.string().min(2), zip: z.string().min(3), country: z.string().length(2),
});
const schema = z.object({
  storeId: z.string().uuid(),
  email: z.string().email(),
  address: addressSchema.optional().nullable(),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().min(1).max(50),
    personalization: z.object({ name: z.string().max(40).optional(), number: z.string().max(10).optional() }).optional().nullable(),
  })).min(1),
});

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async (context) => {
  const ip = context.clientAddress ?? "unknown";
  const limit = rateLimit(`merch-checkout:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);
  if (!stripe) return json({ error: "Checkout unavailable" }, 503);

  const org = context.locals.organization;
  if (!org) return json({ error: "No organization" }, 400);

  const parsed = schema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);

  const store = await getStoreById(org.id, parsed.data.storeId);
  if (!store) return json({ error: "Store not found" }, 404);
  if (!isStoreShoppable(store, new Date())) return json({ error: "This store isn't accepting orders right now" }, 422);

  const db = getDb();
  const repriced = await repriceStoreCartItems(store.id, parsed.data.items);
  if (!repriced.ok) return json({ error: "Some items are unavailable" }, 422);
  const priced = repriced.lines;
  const { printful, pickup } = partitionByFulfillment(priced);
  const needsShipping = priced.some(lineNeedsShipping);

  // required personalization present?
  for (let i = 0; i < priced.length; i++) {
    const cfg = priced[i].personalizationConfig;
    const val = parsed.data.items[i]?.personalization ?? null;
    if (cfg?.name && !val?.name) return json({ error: "Name required for a personalized item" }, 422);
    if (cfg?.number && !val?.number) return json({ error: "Number required for a personalized item" }, 422);
  }

  try {
    // ---- shipping (printful only) ----
    let shippingCents = 0;
    if (needsShipping) {
      if (!isPrintfulConfigured()) return json({ error: "Shipping unavailable" }, 503);
      if (!parsed.data.address) return json({ error: "Shipping address required" }, 422);
      const rates = await calculateShipping(
        toPrintfulRecipient(parsed.data.address),
        printful.map((p) => ({ variant_id: p.printfulVariantId!, quantity: p.quantity })),
      );
      const cheapest = pickCheapestRate(rates);
      if (!cheapest) return json({ error: "We can't ship to that address" }, 422);
      shippingCents = shippingRateToCents(cheapest.rate);
    }

    const quote = assembleQuote(priced.map((p) => ({ unitPriceCents: p.unitPriceCents, quantity: p.quantity })), shippingCents);
    const isPickupOnly = pickup.length === priced.length;

    // guest user
    const nameForUser = parsed.data.address?.name ?? parsed.data.email;
    const [firstName, ...rest] = nameForUser.trim().split(/\s+/);
    const { userRow } = await upsertGuestUser(db, { email: parsed.data.email, firstName: firstName ?? parsed.data.email, lastName: rest.join(" ") || "-" });

    // order (pending). shippingAddress: real address if shipping, else the store pickup marker.
    const shippingAddress = parsed.data.address ?? {
      name: nameForUser, address1: store.pickupLocation ?? "Pickup", city: "-", state: "-", zip: "-", country: "US",
    };
    const [order] = await db.insert(merchOrders).values({
      organizationId: org.id, storeId: store.id, userId: userRow.id, email: parsed.data.email, status: "pending",
      shippingAddress, subtotalCents: quote.subtotalCents, shippingCents, taxCents: 0,
      totalCents: quote.totalBeforeTaxCents, currency: "usd",
    }).returning({ id: merchOrders.id });

    await db.insert(merchOrderItems).values(priced.map((p, i) => ({
      orderId: order.id, merchVariantId: p.variantId, fulfillmentType: p.fulfillmentType,
      productName: p.productName, variantName: p.variantName, size: p.size, color: p.color,
      printfulSyncVariantId: p.printfulSyncVariantId,
      personalization: parsed.data.items[i]?.personalization ?? null,
      unitPriceCents: p.unitPriceCents, quantity: p.quantity,
    })));

    // Stripe customer — address drives Stripe Tax. Shipping order: buyer address.
    // Pickup order: org origin (Ohio) so tax computes at the pickup jurisdiction.
    const taxAddr = parsed.data.address
      ? { line1: parsed.data.address.address1, line2: parsed.data.address.address2 ?? undefined, city: parsed.data.address.city, state: parsed.data.address.state, postal_code: parsed.data.address.zip, country: parsed.data.address.country }
      : await getOrgOriginAddress(org.id);
    const customer = await stripe.customers.create({
      email: parsed.data.email, name: nameForUser, address: taxAddr,
      ...(parsed.data.address ? { shipping: { name: nameForUser, address: taxAddr } } : {}),
    });

    const appUrl = new URL(context.request.url).origin;
    const backPath = `/shop/${store.slug}${store.visibility === "unlisted" ? `?k=${store.shareToken}` : ""}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment", payment_method_types: ["card"], customer: customer.id,
      line_items: buildMerchLineItems(priced.map((p) => ({
        productName: p.productName, variantLabel: [p.color, p.size].filter(Boolean).join(" · "),
        unitPriceCents: p.unitPriceCents, quantity: p.quantity,
      })), "usd"),
      ...(needsShipping ? { shipping_options: [{ shipping_rate_data: { type: "fixed_amount", display_name: "Shipping", fixed_amount: { amount: shippingCents, currency: "usd" } } }] } : {}),
      automatic_tax: { enabled: true },
      metadata: { type: "merch_order", order_id: order.id, organization_id: org.id },
      success_url: `${appUrl}/shop/order?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}${backPath}`,
    }, { idempotencyKey: `merch:${order.id}:session` });

    await db.update(merchOrders).set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() }).where(eq(merchOrders.id, order.id));
    return json({ url: session.url }, 200);
  } catch (e) {
    if (e instanceof PrintfulApiError) return json({ error: "Shipping quote failed" }, 502);
    console.error("merch checkout failed", e);
    return json({ error: "We couldn't start checkout. Please try again." }, 500);
  }
};
```

> Note: the reprice/items index alignment (`parsed.data.items[i]`) relies on `repriceStoreCartItems` preserving request order — it does (`matchRequestedToRows` iterates `items` in order). Keep that invariant.

- [ ] **Step 6: Update `checkout-form.tsx`** — read the cart's `storeId` (via `cartStoreId`) and post it. Derive `pickupOnly = items.length > 0 && items.every((i) => i.fulfillmentType === "pickup")` from the cart items' `fulfillmentType` (set at add-to-cart in 2.3). When `pickupOnly`, hide the address form and show the pickup location + window; otherwise keep the existing Printful address form. Pass each line's stored `personalization` in `items[].personalization`. Read the file and adapt; keep the Printful path unchanged for the general store.

- [ ] **Step 7: Typecheck + unit**

Run: `npx vitest run tests/unit/merch/ && npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/pages/api/merch/checkout.ts src/lib/merch/checkout-store.ts src/components/shop/checkout-form.tsx tests/unit/merch/checkout-store.test.ts
git commit -m "feat(merch): store-aware checkout with pickup branch (no shipping, origin tax)"
```

### Task 3.4: org origin address helper (pickup tax)

**Files:**
- Create: `src/lib/merch/org-origin.ts`
- Test: `tests/unit/merch/org-origin.test.ts`

**Interfaces:**
- Produces: `getOrgOriginAddress(orgId): Promise<{ line1: string; city: string; state: string; postal_code: string; country: string }>` — the org's primary `locations` row mapped to a Stripe address; falls back to a configured Ohio default if none. Used so Stripe Tax computes pickup (Ohio) tax with no ship-to address.

- [ ] **Step 1: Write the failing test** — cover the pure mapper `locationToStripeAddress(loc)`:

```ts
import { describe, it, expect } from "vitest";
import { locationToStripeAddress } from "@/lib/merch/org-origin";

describe("locationToStripeAddress", () => {
  it("maps a location row to a Stripe address", () => {
    expect(locationToStripeAddress({ address: "1 Main St", city: "Powell", state: "OH", zip: "43065" }))
      .toEqual({ line1: "1 Main St", city: "Powell", state: "OH", postal_code: "43065", country: "US" });
  });
  it("falls back to Ohio when fields missing", () => {
    const a = locationToStripeAddress(null);
    expect(a.state).toBe("OH");
    expect(a.country).toBe("US");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merch/org-origin.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `org-origin.ts`** (read `schema/organizations.ts` `locations` columns first to match field names — `address`, `city`, `state`, `zip`/`postalCode`):

```ts
import { getDb } from "@/lib/db";
import { and, asc, eq } from "drizzle-orm";
import { locations } from "@/lib/db/schema/organizations";

export interface StripeAddr { line1: string; city: string; state: string; postal_code: string; country: string }
const OHIO_FALLBACK: StripeAddr = { line1: "—", city: "Columbus", state: "OH", postal_code: "43215", country: "US" };

export function locationToStripeAddress(
  loc: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null } | null,
): StripeAddr {
  if (!loc || !loc.state) return OHIO_FALLBACK;
  return {
    line1: loc.address ?? "—", city: loc.city ?? OHIO_FALLBACK.city,
    state: loc.state, postal_code: loc.zip ?? OHIO_FALLBACK.postal_code, country: "US",
  };
}

export async function getOrgOriginAddress(orgId: string): Promise<StripeAddr> {
  const [loc] = await getDb().select().from(locations)
    .where(eq(locations.organizationId, orgId))
    .orderBy(asc(locations.createdAt)).limit(1);
  return locationToStripeAddress(loc ?? null);
}
```

> Adjust column names (`zip` vs `postalCode`, `address` vs `addressLine1`) to the actual `locations` schema.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/merch/org-origin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/merch/org-origin.ts tests/unit/merch/org-origin.test.ts
git commit -m "feat(merch): org origin address for pickup-order Stripe Tax"
```

### Task 3.5: webhook pickup branch + pickup email

**Files:**
- Modify: `src/lib/merch/fulfillment.ts`, `src/lib/merch/order-confirmation-email.ts`
- Test: `tests/unit/merch/fulfillment-dispatch.test.ts`

**Interfaces:**
- Produces: `orderFulfillmentPlan(items): "pickup" | "printful"` (pure — "pickup" iff every item is `pickup`); `handleMerchOrderCompleted` routes pickup orders to `awaiting_pickup` + `sendMerchPickupConfirmation`, printful orders to the existing `fulfillMerchOrder` + `sendMerchOrderConfirmation`.
- `sendMerchPickupConfirmation(orderId)` — email with pickup location + window + itemized list incl. personalization; no tracking copy.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { orderFulfillmentPlan } from "@/lib/merch/fulfillment";

describe("orderFulfillmentPlan", () => {
  it("pickup when all items are pickup", () => {
    expect(orderFulfillmentPlan([{ fulfillmentType: "pickup" }, { fulfillmentType: "pickup" }])).toBe("pickup");
  });
  it("printful when any item ships", () => {
    expect(orderFulfillmentPlan([{ fulfillmentType: "pickup" }, { fulfillmentType: "printful_pod" }])).toBe("printful");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merch/fulfillment-dispatch.test.ts`
Expected: FAIL — fn not exported.

- [ ] **Step 3: Edit `fulfillment.ts`**

Add the pure planner and route in `handleMerchOrderCompleted`:

```ts
export function orderFulfillmentPlan(items: { fulfillmentType: string }[]): "pickup" | "printful" {
  return items.length > 0 && items.every((i) => i.fulfillmentType === "pickup") ? "pickup" : "printful";
}
```

Update `assertSupportedFulfillment` to also allow `"pickup"` (so a pickup order never throws): `if (t !== "printful_pod" && t !== "pickup") throw ...`.

In `handleMerchOrderCompleted`, after step (1) "mark paid", replace steps (2)+(3) with a dispatch:

```ts
  const itemsForPlan = await db.select({ fulfillmentType: merchOrderItems.fulfillmentType })
    .from(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));
  const plan = orderFulfillmentPlan(itemsForPlan);

  if (plan === "pickup") {
    await db.update(merchOrders).set({ status: "awaiting_pickup", updatedAt: new Date() }).where(eq(merchOrders.id, orderId));
    try { await sendMerchPickupConfirmation(orderId); } catch (e) { console.error(`[merch] pickup email failed for ${orderId}:`, e); }
    return { status: "processed-pickup" };
  }

  // printful path (money-safe): failure leaves 'paid' for retry
  try { await fulfillMerchOrder(orderId); } catch (e) { console.error(`[merch] fulfillment failed for paid order ${orderId} — left 'paid' for retry:`, e); }
  try { await sendMerchOrderConfirmation(orderId); } catch (e) { console.error(`[merch] confirmation email failed for ${orderId}:`, e); }
  return { status: "processed" };
```

Import `sendMerchPickupConfirmation` and `merchOrderItems` (already imported).

- [ ] **Step 4: Add `sendMerchPickupConfirmation` to `order-confirmation-email.ts`**

```ts
import { merchStores } from "@/lib/db/schema";
// ...
export async function sendMerchPickupConfirmation(orderId: string): Promise<void> {
  const db = getDb();
  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) return;
  const [store] = await db.select().from(merchStores).where(eq(merchStores.id, order.storeId)).limit(1);
  const items = await db.select().from(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));
  const rows = items.map((i) => {
    const pers = i.personalization ? ` — ${[i.personalization.name, i.personalization.number].filter(Boolean).join(" #")}` : "";
    return `<tr><td>${i.productName} ${[i.color, i.size].filter(Boolean).join(" · ")}${pers} × ${i.quantity}</td><td align="right">${money(i.unitPriceCents * i.quantity)}</td></tr>`;
  }).join("");
  const when = store?.orderClosesAt ? `<p>Pickup after ordering closes on ${store.orderClosesAt.toLocaleDateString()}.</p>` : "";
  const where = store?.pickupLocation ? `<p><strong>Pickup location:</strong> ${store.pickupLocation}</p>` : "";
  const result = await sendEmail({
    to: order.email,
    subject: "Your Aspire Sports order is confirmed (pickup)",
    html: `<h1>Thanks for your order!</h1><table>${rows}
      <tr><td>Tax</td><td align="right">${money(order.taxCents)}</td></tr>
      <tr><td><strong>Total</strong></td><td align="right"><strong>${money(order.totalCents)}</strong></td></tr>
      </table>${where}${when}<p>We'll let you know when it's ready to collect.</p>`,
  });
  if (!result.success) console.error(`[merch] pickup email not sent for ${orderId}:`, result.error);
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/unit/merch/ && npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/merch/fulfillment.ts src/lib/merch/order-confirmation-email.ts tests/unit/merch/fulfillment-dispatch.test.ts
git commit -m "feat(merch): webhook pickup dispatch + pickup confirmation email"
```

### Task 3.6: API test — pickup checkout

**Files:**
- Create: `tests/api/merch/pickup-checkout.test.ts`

- [ ] **Step 1: Write the API test** (mirror the Phase-2 quote/checkout API test style; guard Stripe-dependent assertions with the repo's `itWithStripe` gate — see the `ci-api-tests-have-no-stripe` memory). Assert: POST `/api/merch/checkout` with a pickup store's items + no address returns a Stripe session URL (or 503 on CI-no-Stripe); `shippingCents` persisted 0; missing required personalization → 422; a closed-window store → 422.

- [ ] **Step 2: Run against the running dev server**

Run: `CRON_SECRET=<dev-secret> TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/merch/pickup-checkout.test.ts`
Expected: PASS (or Stripe-gated skips on CI).

- [ ] **Step 3: Commit**

```bash
git add tests/api/merch/pickup-checkout.test.ts
git commit -m "test(merch): pickup checkout API"
```

---

## Slice 4 — Store admin + order management; retire kits

Replaces the kit admin with store admin, adds order aggregation/CSV/mark-collected, updates nav, and **drops** `merch_team_kits`/`kit_id` (migration 0112) now that no code references them.

### Task 4.1: store CRUD endpoint

**Files:**
- Create: `src/pages/api/admin/merch/stores.ts`
- Test: `tests/api/admin/merch-stores.test.ts`

**Interfaces:**
- Consumes: `requireOrgAdminAccess`, `requireSameOrgTeam`/`ownershipDeniedResponse`, `listStores`, `getStoreById`, `generateShareToken`.
- Produces: GET (list org stores), POST (create — scope, name, slug, visibility, team (scope=team), window, pickup, description), PUT (update by id), DELETE (by id — **blocked if the store has orders**, else cascade). Mirrors `api/admin/merch/kits.ts` structure (org-scoped, transactional, `json` helper).

- [ ] **Step 1: Write the failing API test** — `tests/api/admin/merch-stores.test.ts`

Cover: unauth → 401/403; create general/team store; team store auto-generates a `shareToken` when `visibility=unlisted`; tenant isolation (can't touch another org's store → 404); DELETE a store **with orders** → 409 with a "deactivate instead" message; DELETE an empty store → 200. Follow the auth/setup pattern in `tests/api/admin/merch-kits.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `CRON_SECRET=<s> TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/merch-stores.test.ts`
Expected: FAIL — endpoint missing.

- [ ] **Step 3: Write `stores.ts`** modeled on `kits.ts`, with:
  - `storeSchema`: `{ scope: enum[general,league,team], name, slug?, description?, visibility: enum[public,unlisted].default('public'), teamId?: uuid, orderOpensAt?, orderClosesAt?, pickupLocation?, active }`. Server derives `slug` from name if absent (slugify + uniqueness check via `getStoreBySlug`); server generates `shareToken` when `visibility==='unlisted'` (and clears it when public).
  - Validate `scope==='team' ⇒ teamId` present and `requireSameOrgTeam(...)`; reject `scope==='team'` without team; reject a second `scope==='general'` store (check `getGeneralStore`).
  - DELETE: count `merchOrders` where `storeId=id`; if `>0` → `json({ error: "This store has orders — deactivate it instead." }, 409)`; else delete (cascades products/variants).
  - Datetime handling: accept ISO strings; store as `Date`. (The admin UI sends local-derived ISO — see 4.3 gotcha.)

- [ ] **Step 4: Run test to verify it passes**

Run: `CRON_SECRET=<s> TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/merch-stores.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/merch/stores.ts tests/api/admin/merch-stores.test.ts
git commit -m "feat(merch): admin store CRUD (delete blocked when store has orders)"
```

### Task 4.2: store-products endpoint (from kit-products)

**Files:**
- Create: `src/pages/api/admin/merch/store-products.ts`
- Test: `tests/api/admin/merch-store-products.test.ts`

**Interfaces:**
- Produces: GET `?storeId=`, POST/PUT/DELETE for manual products within a store. Same shape as `kit-products.ts` with `kitId`→`storeId`, `getKitById`→`getStoreById`, and the product insert sets `storeId` (not `kitId`), `source: "manual"`, `fulfillmentType: "pickup"`. Slug: `${slugify(name)}-${storeId.slice(0,8)}` (now unique per store, but the suffix keeps cross-store safety and matches the existing pattern).

- [ ] **Step 1: Write the failing API test** — mirror `merch-kit-products.test.ts` (create a manual product with sizes + personalization under a store; tenant isolation; update replaces variants; delete cascades).

- [ ] **Step 2: Run to verify it fails**

Run: `CRON_SECRET=<s> TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/merch-store-products.test.ts`
Expected: FAIL.

- [ ] **Step 3: Copy `kit-products.ts` → `store-products.ts`** and apply the rename deltas above. Fix the `existing.kitId` guards to `existing.storeId`, and the tenant check to `getStoreById(auth.organizationId, existing.storeId)`.

- [ ] **Step 4: Run to verify it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/merch/store-products.ts tests/api/admin/merch-store-products.test.ts
git commit -m "feat(merch): admin manual-product CRUD scoped to a store"
```

### Task 4.3: store admin UI (list + editor)

**Files:**
- Create: `src/pages/admin/merch/stores.astro`, `src/pages/admin/merch/stores/[id].astro`
- Create: `src/components/admin/merch-stores-list.tsx`, `src/components/admin/merch-store-editor.tsx`
- Modify: `src/pages/admin/merch.astro` (link to stores), `src/lib/admin/nav-super-admin.ts`

- [ ] **Step 1: Build `merch-stores-list.tsx`** from `merch-kits-list.tsx` — list stores (name, scope badge, visibility, product count, share link for unlisted), "New store" form (scope select; team picker shown when scope=team; window; pickup; visibility). Fetch teams via the **org-admin join** approach used in `kits.astro`'s data (NOT `/api/admin/teams` — it's `requireSuperAdminAccess` and 403s org admins; carry the Wave 1 workaround). POST to `/api/admin/merch/stores`.

- [ ] **Step 2: Build `merch-store-editor.tsx`** from `merch-kit-editor.tsx` — takes `storeId`, loads the store + its manual products via `/api/admin/merch/store-products?storeId=`, add/edit jerseys w/ sizes + name/number personalization. **Datetime gotcha:** window `datetime-local` inputs must use local getters (`getFullYear`/`getMonth`/…), NOT `toISOString()` (UTC corrupts the window). Convert local input → ISO only at submit.

- [ ] **Step 3: Build the Astro pages** `stores.astro` (renders `MerchStoresList client:load`) and `stores/[id].astro` (renders `MerchStoreEditor client:load storeId={id}`), mirroring `kits.astro`/`kits/[id].astro`. These are under `/admin/**` → SSR, middleware-guarded (no prerender).

- [ ] **Step 4: Update nav** — in `src/lib/admin/nav-super-admin.ts`, change the "Team kits" entry to point at stores:

```ts
{ name: "Stores", href: "/admin/merch/stores", icon: Store },
```

(Keep the existing "Shop" → `/admin/merch` sync entry, or fold it into the stores page — minimal: keep both.) Remove the now-defunct `Shirt` import if unused.

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npx astro build`
Expected: zero errors; build OK.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/merch/stores.astro "src/pages/admin/merch/stores/[id].astro" src/components/admin/merch-stores-list.tsx src/components/admin/merch-store-editor.tsx src/pages/admin/merch.astro src/lib/admin/nav-super-admin.ts
git commit -m "feat(merch): admin store list + editor UI"
```

### Task 4.4: order aggregation, CSV, mark-collected

**Files:**
- Create: `src/pages/api/admin/merch/orders.ts`, `src/pages/admin/merch/stores/[id]/orders.astro`, `src/components/admin/merch-store-orders.tsx`
- Create: `src/lib/merch/order-csv.ts`
- Test: `tests/unit/merch/order-csv.test.ts`, `tests/api/admin/merch-orders.test.ts`

**Interfaces:**
- Produces: `buildOrdersCsv(rows): string` (pure — headers: email, product, size, name, number, qty, status); GET `/api/admin/merch/orders?storeId=` (org-scoped list of orders+items for a store); PATCH `/api/admin/merch/orders` `{ orderId, status: "collected" }` (only `awaiting_pickup → collected`, org-scoped).

- [ ] **Step 1: Write the failing unit test** — `tests/unit/merch/order-csv.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildOrdersCsv } from "@/lib/merch/order-csv";

describe("buildOrdersCsv", () => {
  it("emits a header + one row per item with personalization", () => {
    const csv = buildOrdersCsv([
      { email: "a@x.com", productName: "Jersey", size: "M", personalization: { name: "Lee", number: "10" }, quantity: 1, status: "awaiting_pickup" },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("email,product,size,name,number,quantity,status");
    expect(lines[1]).toContain("a@x.com");
    expect(lines[1]).toContain("Lee");
    expect(lines[1]).toContain("10");
  });
  it("escapes commas/quotes", () => {
    const csv = buildOrdersCsv([{ email: "b@x.com", productName: "Tee, Big", size: null, personalization: null, quantity: 2, status: "collected" }]);
    expect(csv).toContain('"Tee, Big"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/merch/order-csv.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `order-csv.ts`**

```ts
export interface CsvRow {
  email: string; productName: string; size: string | null;
  personalization: { name?: string; number?: string } | null;
  quantity: number; status: string;
}
const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function buildOrdersCsv(rows: CsvRow[]): string {
  const header = "email,product,size,name,number,quantity,status";
  const body = rows.map((r) => [
    r.email, r.productName, r.size ?? "",
    r.personalization?.name ?? "", r.personalization?.number ?? "",
    String(r.quantity), r.status,
  ].map(esc).join(",")).join("\n");
  return `${header}\n${body}\n`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/merch/order-csv.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `/api/admin/merch/orders.ts`** — GET lists orders (join items) for `storeId` (org-scoped via `getStoreById`); PATCH validates `getStoreById` ownership, loads the order, checks `order.storeId===storeId` and `order.status==='awaiting_pickup'`, updates to `collected`. Use `requireOrgAdminAccess`. Write `tests/api/admin/merch-orders.test.ts` covering the mark-collected transition + tenant isolation + illegal transition (paid → collected rejected).

- [ ] **Step 6: Build the admin orders page + island** — `merch-store-orders.tsx` lists orders for a store with a "Download CSV" button (fetch GET, build CSV client-side via `buildOrdersCsv`, trigger a Blob download) and a "Mark collected" action per `awaiting_pickup` order (PATCH). `stores/[id]/orders.astro` renders it. Add a link from the store editor.

- [ ] **Step 7: Run tests + typecheck + build**

Run: `npx vitest run tests/unit/merch/order-csv.test.ts && CRON_SECRET=<s> TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/merch-orders.test.ts && npx tsc --noEmit && npx astro build`
Expected: PASS; zero errors; build OK.

- [ ] **Step 8: Commit**

```bash
git add src/pages/api/admin/merch/orders.ts "src/pages/admin/merch/stores/[id]/orders.astro" src/components/admin/merch-store-orders.tsx src/lib/merch/order-csv.ts tests/unit/merch/order-csv.test.ts tests/api/admin/merch-orders.test.ts
git commit -m "feat(merch): store order aggregation, CSV export, mark-collected"
```

### Task 4.5: retire kits — delete code + migration 0112

**Files:**
- Delete: `src/lib/db/schema/merch-team-kits.ts`, `src/lib/merch/kits.ts`, `src/components/admin/merch-kit-editor.tsx`, `src/components/admin/merch-kits-list.tsx`, `src/pages/admin/merch/kits.astro`, `src/pages/admin/merch/kits/[id].astro`, `src/pages/api/admin/merch/kits.ts`, `src/pages/api/admin/merch/kit-products.ts`, `tests/api/admin/merch-kits.test.ts`, `tests/api/admin/merch-kit-products.test.ts`, `tests/unit/merch/kits.test.ts`
- Modify: `src/lib/db/schema/index.ts` (drop the `merch-team-kits` export), `src/lib/db/schema/merch.ts` (remove any residual kit import if still present)
- Create: `src/lib/db/migrations/0112_drop_merch_team_kits.sql`

**Precondition:** grep confirms no remaining references (they were all rewritten in Slices 1–4).

- [ ] **Step 1: Delete the files**

```bash
git rm src/lib/db/schema/merch-team-kits.ts src/lib/merch/kits.ts \
  src/components/admin/merch-kit-editor.tsx src/components/admin/merch-kits-list.tsx \
  src/pages/admin/merch/kits.astro "src/pages/admin/merch/kits/[id].astro" \
  src/pages/api/admin/merch/kits.ts src/pages/api/admin/merch/kit-products.ts \
  tests/api/admin/merch-kits.test.ts tests/api/admin/merch-kit-products.test.ts \
  tests/unit/merch/kits.test.ts
```

- [ ] **Step 2: Drop the `merch-team-kits` export** from `src/lib/db/schema/index.ts`. Confirm `merch.ts` no longer imports from `./merch-team-kits` (Task 1.2 already switched it to `./merch-stores`).

- [ ] **Step 3: Verify zero references**

Run: `git grep -n "merchTeamKits\|merch-team-kits\|kitId\|getKitById\|/merch/kits" src/ tests/`
Expected: **no output** (empty).

- [ ] **Step 4: Write migration 0112** — `src/lib/db/migrations/0112_drop_merch_team_kits.sql`

```sql
ALTER TABLE "merch_products" DROP COLUMN IF EXISTS "kit_id";--> statement-breakpoint
DROP TABLE IF EXISTS "merch_team_kits";
```

Run `npm run db:generate` afterward to refresh the snapshot to match (or hand-verify the snapshot no longer lists the table/column). Apply: `npm run db:migrate`.

- [ ] **Step 5: Typecheck + build + full unit run**

Run: `npx tsc --noEmit && npx astro build && npx vitest run tests/unit/merch/`
Expected: zero errors; build OK; all unit green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(merch): retire merch_team_kits — absorbed into merch_stores (migration 0112)"
```

---

## Final verification (pre-push checklist)

Run the full pre-push sequence from CLAUDE.md (schema + new endpoints + storefront routing warrant it):

- [ ] `npm run db:generate` — confirm no *uncommitted* schema drift (0110–0112 already committed; generate should report "no changes").
- [ ] `npm run db:seed:e2e` — re-seed (idempotent); ensure the seed includes a team store fixture for the E2E.
- [ ] `CRON_SECRET=<s> TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/merch tests/api/admin/merch-stores.test.ts tests/api/admin/merch-store-products.test.ts tests/api/admin/merch-orders.test.ts` — API green (Stripe-gated skips OK on CI).
- [ ] `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/merch-stores.spec.ts tests/e2e/landing-pages.spec.ts` — storefront + the post-merge noindex spec.
- [ ] `npx astro build` — SSR/prerender clean.
- [ ] `npx tsc --noEmit` — zero errors.
- [ ] **Grep guard:** `git grep -n "/shop/" tests/e2e/` — confirm no post-merge-only spec asserts an old `/shop/<product-slug>` product URL that the resolver now 301s.
- [ ] Manual live smoke on staging: create a team store in admin → open the share link (`?k=`) in a private window → add a personalized jersey → pickup checkout (test card via `stripe listen` forwarding per the memory's gotchas) → webhook flips order to `awaiting_pickup` → pickup email → admin CSV + mark-collected. (This is the only path not covered by automated tests end-to-end.)
- [ ] Open PR; wait for CI green on origin before declaring done.

## Self-Review notes (coverage vs spec)

- Data model (stores + product/order/item changes + enums) → Slice 1. ✓
- Routing (`/shop`, `[slug]` resolver + 301, `[store]/[product]`, unlisted `?k=` + noindex) → Slice 2. ✓
- Store-scoped cart → Task 2.3. ✓
- Pickup checkout (address-skip, Ohio-origin tax, personalization capture, reprice broadening, webhook branch, pickup email) → Slice 3. ✓
- Admin (store CRUD, manual products, order aggregation/CSV/mark-collected, delete-vs-deactivate, nav, team-picker + datetime gotchas) → Slice 4. ✓
- Migration & cutover (0110 backfill, 0111 enum, 0112 drop) → 1.5 / 3.2 / 4.5. ✓
- `league` = enum seam only (no storefront/admin) → carried; scope enum includes it, no league UI. ✓
- Non-goals (self-shipped/live-rates, bundles, digital, league storefront, cross-store cart) → not planned. ✓
