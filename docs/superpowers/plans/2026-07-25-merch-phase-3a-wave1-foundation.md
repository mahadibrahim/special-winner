# Merch Phase 3a — Wave 1: Foundation + Admin Kit CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the merch product model to support non-Printful ("manual") products, add a `merch_team_kits` grouping, and give admins a UI to create a team kit + its products. No customer-facing ordering yet (that's Wave 2).

**Architecture:** Additive schema changes (Printful rows untouched: backfill `source='printful'`, `fulfillment_type='printful_pod'`). A new `merch_team_kits` table owns the team + order window + share token + pickup location; manual products hang off it via `kit_id`. Admin CRUD endpoints + pages follow the existing `discount-codes` / `merch-sync-panel` patterns.

**Tech Stack:** Astro 5 SSR + React 19 islands, Drizzle/Postgres, Zod, Vitest, shadcn/ui (`@/components/ui/*`), sonner toasts.

## Global Constraints

- **Additive only.** Existing `merch_products`/`merch_variants` rows must keep working (the Hoodie flow). New columns get safe defaults; Printful id columns become nullable (multiple NULLs are fine under the existing unique constraints).
- **Migrations via `npm run db:generate`** (commit the SQL); never `db:push` to a remote. Apply to staging with `./scripts/with-bws.sh npm run db:migrate`. The new `merch_product_source` enum is CREATE-TYPE (new type, not an ALTER) so it can live in the same migration as the tables/columns.
- **Tenant-scoped admin.** Every admin endpoint authorizes via `requireOrgAdminAccess(context)` and scopes to `auth.organizationId`. A posted `team_id` must be validated to belong to the org (`requireSameOrgTeam` from `@/lib/auth/require-resource-ownership`).
- **Manual products:** `source='manual'`, `fulfillment_type='pickup'`, `kit_id` set, Printful ids null; variants are admin-entered (size/price), Printful ids null. Money is integer cents.
- **Admin pages** extend `BaseLayout` (`navigation={false} footer={false}`) → `AdminLayout` → a `client:load` island; islands use `className` + `useHydrationBeacon()`.
- **`.astro` uses `class`; `.tsx` uses `className`.**
- **Images (Wave 1):** manual-product images are optional **URL strings** (paste a URL) — no upload pipeline in Wave 1 (R2 upload is a later refinement).

---

## File Structure

**Create**
- `src/lib/db/schema/merch-team-kits.ts` — `merch_team_kits` table + `merch_product_source` enum + types.
- `src/lib/merch/kits.ts` — pure helpers (share-token gen, kit window state) + read helpers (list kits, kit detail).
- `src/pages/api/admin/merch/kits.ts` — kit CRUD (GET/POST/PUT/DELETE).
- `src/pages/api/admin/merch/kit-products.ts` — kit-product CRUD (GET/POST/PUT/DELETE).
- `src/pages/admin/merch/kits.astro` + `src/components/admin/merch-kits-list.tsx` — kits list + create/edit.
- `src/pages/admin/merch/kits/[id].astro` + `src/components/admin/merch-kit-editor.tsx` — kit detail + product editor.
- Tests under `tests/unit/merch/`, `tests/api/admin/`.

**Modify**
- `src/lib/db/schema/merch.ts` — generalize `merchProducts`/`merchVariants` (nullable Printful ids + `source`, `fulfillmentType`, `kitId`, `personalization`).
- `src/lib/db/schema/index.ts` — export the new schema module.
- `src/lib/admin/nav-super-admin.ts` — add "Team kits" under the Money/Shop section.

---

## Task 1: Schema — product generalization + `merch_team_kits`

**Files:**
- Create: `src/lib/db/schema/merch-team-kits.ts`
- Modify: `src/lib/db/schema/merch.ts`, `src/lib/db/schema/index.ts`
- Generated: `src/lib/db/migrations/NNNN_*.sql`

**Interfaces:**
- Produces: `merchProductSourceEnum`, `merchTeamKits` table, types `MerchTeamKit`/`NewMerchTeamKit`, interface `ProductPersonalization`; and the new `merchProducts` columns `source`, `fulfillmentType`, `kitId`, `personalization` (+ nullable Printful ids).

- [ ] **Step 1: Create the kit table + source enum**

`src/lib/db/schema/merch-team-kits.ts`:

```ts
import {
  pgTable, uuid, varchar, text, timestamp, boolean, pgEnum, unique, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { teams } from "./teams";

export const merchProductSourceEnum = pgEnum("merch_product_source", [
  "printful",
  "manual",
]);

/** Optional per-line personalization a manual product collects at checkout. */
export interface ProductPersonalization {
  name?: boolean;
  number?: boolean;
}

/**
 * A team's kit "campaign": owns the order window, the shareable link, and the
 * pickup location. Manual merch products belong to a kit via `kit_id`.
 */
export const merchTeamKits = pgTable(
  "merch_team_kits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    shareToken: varchar("share_token", { length: 40 }).notNull(),
    orderOpensAt: timestamp("order_opens_at"),
    orderClosesAt: timestamp("order_closes_at"),
    pickupLocation: text("pickup_location"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqToken: unique("uq_merch_team_kits_token").on(t.shareToken),
    orgIdx: index("idx_merch_team_kits_org").on(t.organizationId),
  }),
);

export const merchTeamKitsRelations = relations(merchTeamKits, ({ one }) => ({
  organization: one(organizations, {
    fields: [merchTeamKits.organizationId],
    references: [organizations.id],
  }),
  team: one(teams, { fields: [merchTeamKits.teamId], references: [teams.id] }),
}));

export type MerchTeamKit = typeof merchTeamKits.$inferSelect;
export type NewMerchTeamKit = typeof merchTeamKits.$inferInsert;
```

- [ ] **Step 2: Generalize the product/variant tables**

In `src/lib/db/schema/merch.ts`:
- add imports: `import { merchFulfillmentTypeEnum } from "./merch-orders";` and `import { merchProductSourceEnum, type ProductPersonalization } from "./merch-team-kits";` and `merchTeamKits` for the FK.
- change `printfulSyncProductId` to nullable: drop `.notNull()`.
- add these columns to `merchProducts` (after `printfulSyncProductId`):

```ts
    source: merchProductSourceEnum("source").notNull().default("printful"),
    fulfillmentType: merchFulfillmentTypeEnum("fulfillment_type")
      .notNull()
      .default("printful_pod"),
    kitId: uuid("kit_id").references(() => merchTeamKits.id, { onDelete: "cascade" }),
    personalization: jsonb("personalization").$type<ProductPersonalization>(),
```
- in `merchVariants`, drop `.notNull()` from BOTH `printfulSyncVariantId` and `printfulVariantId`.
- add a relation on `merchProducts` to its kit:

```ts
  kit: one(merchTeamKits, {
    fields: [merchProducts.kitId],
    references: [merchTeamKits.id],
  }),
```
(import `merchTeamKits` at top; add `one` to the relations destructure — it already uses `one`.)

> Note: `uq_merch_products_org_sync` (org, printful_sync_product_id) and `uq_merch_variants_sync` (printful_sync_variant_id) stay — Postgres treats NULLs as distinct, so many manual rows with NULL Printful ids coexist fine.

- [ ] **Step 3: Export from the barrel**

In `src/lib/db/schema/index.ts`, add near the other merch exports:

```ts
// Team kits (merch Phase 3a)
export * from "./merch-team-kits";
```

- [ ] **Step 4: Generate + review the migration**

Run: `npm run db:generate`
Expected: one `NNNN_*.sql` that CREATEs the `merch_product_source` type + `merch_team_kits` table, ALTERs `merch_products` (nullable `printful_sync_product_id`, adds `source`/`fulfillment_type`/`kit_id`/`personalization`), and ALTERs `merch_variants` (nullable Printful ids). Review: additive only, no drops of data.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit` → zero errors.

- [ ] **Step 6: Apply to staging**

Run: `./scripts/with-bws.sh npm run db:migrate`
Expected: applies only the new migration; prior ones skipped. Stop + report if it errors or touches unrelated migrations.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema/merch-team-kits.ts src/lib/db/schema/merch.ts src/lib/db/schema/index.ts src/lib/db/migrations
git commit -m "feat(merch): generalize product model + merch_team_kits (Phase 3a schema)"
```

---

## Task 2: Kit helpers (pure) + read helpers

**Files:**
- Create: `src/lib/merch/kits.ts`, `tests/unit/merch/kits.test.ts`

**Interfaces:**
- Produces:
  - `generateShareToken(): string` — 32-hex random token (uses `crypto.randomUUID().replace(/-/g,"")`).
  - `kitWindowState(kit, now): "not_open" | "open" | "closed"` — pure, from `orderOpensAt`/`orderClosesAt` (null opens = always-open-start; null closes = never-closes).
  - `listKits(orgId)` / `getKitById(orgId, id)` / `getKitByToken(token)` — DB reads (used by admin + Wave 2).

- [ ] **Step 1: Write the failing pure test**

`tests/unit/merch/kits.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { kitWindowState, generateShareToken } from "@/lib/merch/kits";

const t = (iso: string | null) => (iso ? new Date(iso) : null);

describe("kitWindowState", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  it("open when now is within the window", () => {
    expect(kitWindowState({ orderOpensAt: t("2026-08-01T00:00:00Z"), orderClosesAt: t("2026-08-31T00:00:00Z") }, now)).toBe("open");
  });
  it("not_open before the start", () => {
    expect(kitWindowState({ orderOpensAt: t("2026-09-01T00:00:00Z"), orderClosesAt: null }, now)).toBe("not_open");
  });
  it("closed after the end", () => {
    expect(kitWindowState({ orderOpensAt: null, orderClosesAt: t("2026-08-01T00:00:00Z") }, now)).toBe("closed");
  });
  it("open when both bounds are null", () => {
    expect(kitWindowState({ orderOpensAt: null, orderClosesAt: null }, now)).toBe("open");
  });
});

describe("generateShareToken", () => {
  it("is 32 hex chars", () => {
    expect(generateShareToken()).toMatch(/^[0-9a-f]{32}$/);
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run tests/unit/merch/kits.test.ts`

- [ ] **Step 3: Implement**

`src/lib/merch/kits.ts`:

```ts
import { getDb } from "@/lib/db";
import { and, eq, desc } from "drizzle-orm";
import { merchTeamKits, type MerchTeamKit } from "@/lib/db/schema";

export function generateShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function kitWindowState(
  kit: { orderOpensAt: Date | null; orderClosesAt: Date | null },
  now: Date,
): "not_open" | "open" | "closed" {
  if (kit.orderOpensAt && now < kit.orderOpensAt) return "not_open";
  if (kit.orderClosesAt && now > kit.orderClosesAt) return "closed";
  return "open";
}

export async function listKits(orgId: string): Promise<MerchTeamKit[]> {
  return getDb()
    .select()
    .from(merchTeamKits)
    .where(eq(merchTeamKits.organizationId, orgId))
    .orderBy(desc(merchTeamKits.createdAt));
}

export async function getKitById(orgId: string, id: string): Promise<MerchTeamKit | null> {
  const [row] = await getDb()
    .select()
    .from(merchTeamKits)
    .where(and(eq(merchTeamKits.id, id), eq(merchTeamKits.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function getKitByToken(token: string): Promise<MerchTeamKit | null> {
  const [row] = await getDb()
    .select()
    .from(merchTeamKits)
    .where(eq(merchTeamKits.shareToken, token))
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 4: Run — PASS.** `npx vitest run tests/unit/merch/kits.test.ts`; then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/merch/kits.ts tests/unit/merch/kits.test.ts
git commit -m "feat(merch): kit window-state + share-token + read helpers"
```

---

## Task 3: Kit CRUD endpoint

**Files:**
- Create: `src/pages/api/admin/merch/kits.ts`, `tests/api/admin/merch-kits.test.ts`

**Interfaces:**
- Consumes: `requireOrgAdminAccess`, `requireSameOrgTeam` (`@/lib/auth/require-resource-ownership`), `getDb`, `merchTeamKits`, `listKits`/`getKitById`/`generateShareToken`.
- Produces: `GET` (list kits for the org, with product counts), `POST` (create), `PUT` (update), `DELETE` on `/api/admin/merch/kits`.

- [ ] **Step 1: Write the endpoint**

Model on `src/pages/api/admin/discount-codes.ts` (same `requireOrgAdminAccess` guard, Zod validation, 400/404/409 shape). `src/pages/api/admin/merch/kits.ts`:

```ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchTeamKits } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import { requireSameOrgTeam, ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { listKits, generateShareToken } from "@/lib/merch/kits";

const kitSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(255),
  orderOpensAt: z.string().datetime().optional().nullable(),
  orderClosesAt: z.string().datetime().optional().nullable(),
  pickupLocation: z.string().max(2000).optional().nullable(),
  active: z.boolean().default(true),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  return json({ kits: await listKits(auth.organizationId) });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const parsed = kitSchema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
  const owns = await requireSameOrgTeam(auth.organizationId, parsed.data.teamId);
  if (!owns.ok) return ownershipDeniedResponse();
  const [kit] = await getDb().insert(merchTeamKits).values({
    organizationId: auth.organizationId,
    teamId: parsed.data.teamId,
    name: parsed.data.name,
    shareToken: generateShareToken(),
    orderOpensAt: parsed.data.orderOpensAt ? new Date(parsed.data.orderOpensAt) : null,
    orderClosesAt: parsed.data.orderClosesAt ? new Date(parsed.data.orderClosesAt) : null,
    pickupLocation: parsed.data.pickupLocation ?? null,
    active: parsed.data.active,
  }).returning();
  return json({ kit }, 201);
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const body = await context.request.json().catch(() => null);
  const id = body?.id;
  if (!id) return json({ error: "id required" }, 400);
  const parsed = kitSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
  const owns = await requireSameOrgTeam(auth.organizationId, parsed.data.teamId);
  if (!owns.ok) return ownershipDeniedResponse();
  const [kit] = await getDb().update(merchTeamKits).set({
    teamId: parsed.data.teamId,
    name: parsed.data.name,
    orderOpensAt: parsed.data.orderOpensAt ? new Date(parsed.data.orderOpensAt) : null,
    orderClosesAt: parsed.data.orderClosesAt ? new Date(parsed.data.orderClosesAt) : null,
    pickupLocation: parsed.data.pickupLocation ?? null,
    active: parsed.data.active,
    updatedAt: new Date(),
  }).where(and(eq(merchTeamKits.id, id), eq(merchTeamKits.organizationId, auth.organizationId))).returning();
  if (!kit) return json({ error: "Not found" }, 404);
  return json({ kit });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const id = new URL(context.request.url).searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);
  const [row] = await getDb().delete(merchTeamKits)
    .where(and(eq(merchTeamKits.id, id), eq(merchTeamKits.organizationId, auth.organizationId))).returning();
  if (!row) return json({ error: "Not found" }, 404);
  return json({ success: true });
};
```

- [ ] **Step 2: API contract test (auth)**

`tests/api/admin/merch-kits.test.ts`:

```ts
import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
describe("/api/admin/merch/kits", () => {
  it("GET 401 unauth", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/kits`)).status).toBe(401);
  });
  it("POST 401 unauth", async () => {
    expect((await fetch(`${BASE}/api/admin/merch/kits`, { method: "POST" })).status).toBe(401);
  });
});
```

> The authed happy path is controller-verified live (like the merch-sync endpoint). Do NOT run a dev server in the implementer.

- [ ] **Step 3: tsc + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add src/pages/api/admin/merch/kits.ts tests/api/admin/merch-kits.test.ts
git commit -m "feat(merch): admin team-kit CRUD endpoint"
```

---

## Task 4: Kit-product CRUD endpoint

**Files:**
- Create: `src/pages/api/admin/merch/kit-products.ts`, `tests/api/admin/merch-kit-products.test.ts`

**Interfaces:**
- Consumes: `requireOrgAdminAccess`, `getKitById` (to verify the kit is in the org), `getDb`, `merchProducts`/`merchVariants`.
- Produces: `GET ?kitId=` (products + variants for a kit), `POST` (create a manual product + its size variants under a kit), `PUT` (update), `DELETE` on `/api/admin/merch/kit-products`.

- [ ] **Step 1: Write the endpoint**

A manual product is `source='manual'`, `fulfillmentType='pickup'`, `kitId` set, Printful ids null, `personalization` = the config. Sizes come in as an array `[{ size, priceCents, sku? }]` → one `merch_variants` row each (Printful ids null). `src/pages/api/admin/merch/kit-products.ts`:

```ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchProducts, merchVariants } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getKitById } from "@/lib/merch/kits";

const productSchema = z.object({
  kitId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(4000).optional().nullable(),
  category: z.enum(["jersey","shorts","socks","hoodie","t_shirt","hat","bag","accessory","other"]).default("jersey"),
  imageUrl: z.string().url().optional().nullable(),
  priceCents: z.number().int().min(0),
  sizes: z.array(z.string().min(1).max(40)).min(1),
  personalization: z.object({ name: z.boolean().optional(), number: z.boolean().optional() }).optional().nullable(),
  active: z.boolean().default(true),
});

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const slugify = (n: string) => n.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const kitId = new URL(context.request.url).searchParams.get("kitId");
  if (!kitId) return json({ error: "kitId required" }, 400);
  if (!(await getKitById(auth.organizationId, kitId))) return json({ error: "Not found" }, 404);
  const products = await getDb().select().from(merchProducts).where(eq(merchProducts.kitId, kitId));
  const withVariants = await Promise.all(products.map(async (p) => ({
    ...p,
    variants: await getDb().select().from(merchVariants).where(eq(merchVariants.productId, p.id)),
  })));
  return json({ products: withVariants });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const parsed = productSchema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
  const kit = await getKitById(auth.organizationId, parsed.data.kitId);
  if (!kit) return json({ error: "Kit not found" }, 404);
  const db = getDb();
  const d = parsed.data;
  // slug unique per org — suffix the kit id fragment to avoid collisions across kits
  const slug = `${slugify(d.name)}-${parsed.data.kitId.slice(0, 8)}`;
  const [product] = await db.insert(merchProducts).values({
    organizationId: auth.organizationId,
    printfulSyncProductId: null,
    source: "manual",
    fulfillmentType: "pickup",
    kitId: d.kitId,
    name: d.name,
    slug,
    description: d.description ?? null,
    category: d.category,
    images: d.imageUrl ? [{ url: d.imageUrl }] : null,
    personalization: d.personalization ?? null,
    active: d.active,
  }).returning({ id: merchProducts.id });
  await db.insert(merchVariants).values(d.sizes.map((size, i) => ({
    productId: product.id,
    printfulSyncVariantId: null,
    printfulVariantId: null,
    name: `${d.name} / ${size}`,
    size,
    color: null,
    sku: null,
    retailPriceCents: d.priceCents,
    sortOrder: i,
  })));
  return json({ productId: product.id }, 201);
};

// PUT (update product fields + replace its size variants) and DELETE
// (delete product; cascade removes its variants) follow the same guard +
// org/kit-ownership checks. DELETE reads ?id=, verifies the product's kit is
// in the org before deleting.
```

Implement `PUT` and `DELETE` to the same standard (auth guard, verify the product's `kitId` resolves to a kit in `auth.organizationId` before mutating; PUT re-writes the variants for the changed size set). Keep the slug stable on update unless the name changes.

- [ ] **Step 2: API contract test** (`tests/api/admin/merch-kit-products.test.ts`) — GET + POST 401 unauth (mirror Task 3's test).

- [ ] **Step 3: tsc + commit**

```bash
git add src/pages/api/admin/merch/kit-products.ts tests/api/admin/merch-kit-products.test.ts
git commit -m "feat(merch): admin kit-product CRUD (manual products under a kit)"
```

---

## Task 5: Admin UI — kits list + kit editor

**Files:**
- Create: `src/pages/admin/merch/kits.astro`, `src/components/admin/merch-kits-list.tsx`, `src/pages/admin/merch/kits/[id].astro`, `src/components/admin/merch-kit-editor.tsx`
- Modify: `src/lib/admin/nav-super-admin.ts`

**Interfaces:**
- Consumes: the kits + kit-products endpoints (Tasks 3–4); `AdminLayout`; shadcn `Button`/`Card`/`Input`/`Label`/`Dialog`/`Badge`; `toast`; `useHydrationBeacon`.

- [ ] **Step 1: Nav entry**

In `src/lib/admin/nav-super-admin.ts`, in the "Money" section after the "Shop" item added earlier, add `{ name: "Team kits", href: "/admin/merch/kits", icon: Shirt }` (add `Shirt` to the lucide import).

- [ ] **Step 2: Kits list page + island**

`src/pages/admin/merch/kits.astro` — mirror `src/pages/admin/merch.astro` (BaseLayout + AdminLayout `currentPath="/admin/merch/kits"` + `<MerchKitsList client:load />`).

`src/components/admin/merch-kits-list.tsx` — a `"use client"` island (`useHydrationBeacon`) that:
- `GET /api/admin/merch/kits` → lists kits (name, team, window, active, **copyable share link** `/kit/<shareToken>`).
- "New kit" → a dialog form: team picker (fetch the org's teams — reuse the existing admin teams source, e.g. `GET /api/admin/teams`; if none exists, note it for the controller), name, `orderOpensAt`/`orderClosesAt` (datetime inputs), pickup location → `POST`.
- Edit / delete each kit (`PUT`/`DELETE`), toasts on success/error.
- Each kit links to `/admin/merch/kits/<id>` (the editor).
Build to this contract with shadcn components + `className` throughout; match `merch-sync-panel.tsx` / `discount-codes-list.tsx` styling.

- [ ] **Step 3: Kit editor page + island**

`src/pages/admin/merch/kits/[id].astro` — passes the `id` param to `<MerchKitEditor kitId={id} client:load />`.

`src/components/admin/merch-kit-editor.tsx` — an island that:
- `GET /api/admin/merch/kit-products?kitId=<id>` → lists the kit's products (name, price, sizes, personalization badges).
- "Add product" → form: name, category, image URL (optional), price, **sizes** (multi-add chips), **personalization** toggles (Name / Number) → `POST /api/admin/merch/kit-products`.
- Edit/delete products (`PUT`/`DELETE`), toasts.
Same styling/contract rules as Step 2.

- [ ] **Step 4: tsc + commit**

Run: `npx tsc --noEmit` → zero errors. (Live render is controller-verified.)

```bash
git add src/pages/admin/merch/kits.astro src/components/admin/merch-kits-list.tsx "src/pages/admin/merch/kits/[id].astro" src/components/admin/merch-kit-editor.tsx src/lib/admin/nav-super-admin.ts
git commit -m "feat(merch): admin team-kit management UI (list + product editor)"
```

---

## Definition of Done (Wave 1)

- [ ] Migration generated + committed + applied to staging (Task 1).
- [ ] `npx vitest run tests/unit/merch/kits.test.ts` green; `tests/api/admin/merch-kits*.test.ts` 401 contracts green (controller pass, dev server up).
- [ ] `npx tsc --noEmit` zero errors; `npx astro build` succeeds.
- [ ] **Controller live pass** (dev server, signed in as admin): create a kit → copy share link; add a jersey product (sizes S–XL, personalization Name+Number, $45); confirm the manual product + variants persist (`source='manual'`, `fulfillment_type='pickup'`, `kit_id` set). Verify the Hoodie/Printful flow is unaffected.
- [ ] Grep `tests/e2e/` for specs touching `/admin/merch` or the merch schema before merge.

**Next — Wave 2 (own plan):** `/kit/[token]` ordering page + window gating + personalization capture; pickup checkout (address-skip, Ohio-location tax, fulfillment-type partition) + personalization persist/validate; webhook `pickup` branch + pickup email + `awaiting_pickup`/`collected` statuses (schema: `merch_order_items.personalization` + nullable sync id + enum-value migration); admin order aggregation + CSV + mark-collected.
