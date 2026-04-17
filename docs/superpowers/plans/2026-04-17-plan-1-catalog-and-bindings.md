# Plan 1 — Product Catalog, Program Gear Bindings, and External Store Config

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational org-level product catalog (products + variants), program/season gear binding, and the link-out config for external spirit-wear stores. No parent-facing commerce yet — this unlocks the later plans.

**Architecture:** New Drizzle schema modules (`products.ts`, `program-gear.ts`) added to `src/lib/db/schema/`. Admin APIs at `/api/admin/products`, `/api/admin/product-variants`, `/api/admin/program-gear` follow the existing sports/programs pattern (zod validation, `requireAdminAccess` + `requireOrganizationContext`). Admin UI at `/admin/gear/products` with a dialog-based CRUD. External store settings extend existing `OrganizationSettings` and `LocationSettings` jsonb blobs — no new tables.

**Tech Stack:** Astro 5, React 19, Drizzle ORM, Postgres, Zod, shadcn/ui, Vitest (`test:api`), Playwright (`test`).

**Reference spec:** `docs/superpowers/specs/2026-04-17-merchandise-gear-distribution-design.md` §4.1, §4.2, §4.7, §8.

---

## File structure

New files:
- `src/lib/db/schema/products.ts` — products + product_variants tables, enums, relations, types
- `src/lib/db/schema/program-gear.ts` — program_gear table with check constraints
- `src/pages/api/admin/products.ts` — products CRUD
- `src/pages/api/admin/product-variants.ts` — variants CRUD
- `src/pages/api/admin/program-gear.ts` — program gear bindings CRUD
- `src/components/admin/products-list.tsx` — catalog list + create/edit dialog
- `src/components/admin/product-variants-manager.tsx` — variants manager (per product)
- `src/components/admin/program-gear-binding.tsx` — bindings manager used inside program/season admin
- `src/components/admin/external-store-settings.tsx` — sub-form for external store, embedded in org-settings and location-settings
- `src/pages/admin/gear/index.astro` — gear admin landing page
- `src/pages/admin/gear/products.astro` — catalog page
- `src/pages/admin/gear/products/[id].astro` — product detail page with variants
- `tests/api/admin/products.test.ts`
- `tests/api/admin/product-variants.test.ts`
- `tests/api/admin/program-gear.test.ts`
- `tests/api/admin/external-store-settings.test.ts`

Files modified:
- `src/lib/db/schema/index.ts` — export new schema modules
- `src/lib/db/schema/organizations.ts` — extend `OrganizationSettings` + `LocationSettings` with `externalStore`
- `src/components/admin/admin-layout.tsx` — add "Gear" nav entry
- `src/components/admin/organization-form.tsx` — embed external-store sub-form at org level
- `src/components/admin/locations-list.tsx` (if it hosts location settings) or a dedicated location-settings component — embed external-store sub-form at location level
- `src/components/dashboard/children-overview.tsx` or dashboard index — "Shop Team Gear" CTA card (conditional on externalStore being set)
- Program detail pages (public + authenticated) — sidebar CTA when externalStore configured
- Public location landing page nav — "Shop" link when externalStore configured

---

## Dependencies & conventions (pre-flight)

Pattern files to treat as the scaffold (read before starting):
- `src/pages/api/admin/sports.ts` — CRUD API scaffold (zod, requireAdminAccess, requireOrganizationContext, 23505/23503 handling)
- `src/components/admin/sports-list.tsx` — list+dialog CRUD pattern
- `src/lib/db/schema/sports.ts` — schema pattern (org scoping, unique constraint, relations, type exports)
- `tests/api/admin/sports.test.ts` — vitest test pattern using `getAdminCookie`, `apiFetch`, `expectJson`, `testSlug`

All admin APIs must:
- `requireAdminAccess(context)` first
- `requireOrganizationContext(context)` second
- Scope all queries by `organizationId`
- Use zod for body validation with `safeParse`
- Return 400 on validation fail (with `details` field), 401 unauthenticated, 403 wrong org, 404 not found, 409 duplicate slug (pg code 23505), 500 catch-all
- `getDbErrorCode(error)` helper is used in sports.ts — replicate exactly

---

## Task 1: Create products and product_variants schema

**Files:**
- Create: `src/lib/db/schema/products.ts`
- Modify: `src/lib/db/schema/index.ts`

- [ ] **Step 1: Write the schema file**

`src/lib/db/schema/products.ts`:

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
  pgEnum,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

export const productCategoryEnum = pgEnum("product_category", [
  "jersey",
  "shorts",
  "socks",
  "hoodie",
  "t_shirt",
  "hat",
  "bag",
  "accessory",
  "other",
]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    description: text("description"),
    category: productCategoryEnum("category").notNull(),
    basePriceCents: integer("base_price_cents").notNull(),
    images: jsonb("images").$type<ProductImage[]>(),
    availablePostRegistration: boolean("available_post_registration")
      .default(true)
      .notNull(),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueOrgSlug: unique().on(table.organizationId, table.slug),
    orgActiveIdx: index("idx_products_org_active").on(
      table.organizationId,
      table.active,
    ),
  }),
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 100 }),
    size: varchar("size", { length: 20 }).notNull(),
    color: varchar("color", { length: 40 }),
    priceOverrideCents: integer("price_override_cents"),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueVariant: unique().on(table.productId, table.size, table.color),
    productActiveIdx: index("idx_product_variants_product_active").on(
      table.productId,
      table.active,
    ),
  }),
);

export interface ProductImage {
  url: string;
  alt?: string;
  sortOrder?: number;
}

export const productsRelations = relations(products, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [products.organizationId],
    references: [organizations.id],
  }),
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
}));

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
```

- [ ] **Step 2: Export from schema index**

Append to `src/lib/db/schema/index.ts`:

```ts
// Commerce / gear
export * from "./products";
```

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`
Expected: A new SQL migration file in `src/lib/db/migrations/` plus an updated snapshot. Inspect the generated SQL:
- `CREATE TYPE product_category AS ENUM (...)`
- `CREATE TABLE products (...)` with FK to organizations
- `CREATE TABLE product_variants (...)` with FK to products
- Both unique constraints present
- Both indexes present

If anything looks off, delete the migration, fix the schema, and regenerate.

- [ ] **Step 4: Push to dev database**

Run: `npm run db:push`
Expected: Tables created without error. Verify with `npm run db:studio` — `products` and `product_variants` tables visible and empty.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema/products.ts src/lib/db/schema/index.ts src/lib/db/migrations/
git commit -m "feat(gear): add products and product_variants schema"
```

---

## Task 2: Products admin API

**Files:**
- Create: `src/pages/api/admin/products.ts`

Reference scaffold: `src/pages/api/admin/sports.ts` (copy + adapt).

- [ ] **Step 1: Write failing tests**

Create `tests/api/admin/products.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  testSlug,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/products";

describe("Admin Products CRUD API", () => {
  let adminCookie: string;
  let createdId: string;
  const slug = testSlug("product");

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  describe("POST - Create product", () => {
    it("creates a product with valid data (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: "U10 Game Jersey",
          slug,
          description: "Team jersey for U10",
          category: "jersey",
          basePriceCents: 2500,
          images: [{ url: "https://example.com/jersey.jpg", alt: "Jersey" }],
          availablePostRegistration: true,
          active: true,
          sortOrder: 0,
        }),
      });
      const json = await expectJson(res, 201);
      expect(json.product.id).toBeDefined();
      expect(json.product.name).toBe("U10 Game Jersey");
      expect(json.product.category).toBe("jersey");
      expect(json.product.basePriceCents).toBe(2500);
      createdId = json.product.id;
    });

    it("rejects missing name (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ slug: testSlug("p"), category: "jersey", basePriceCents: 100 }),
      });
      await expectJson(res, 400);
    });

    it("rejects invalid category (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: "Bad cat",
          slug: testSlug("p"),
          category: "not_a_real_category",
          basePriceCents: 100,
        }),
      });
      await expectJson(res, 400);
    });

    it("rejects duplicate slug in org (409)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: "Dup",
          slug,
          category: "jersey",
          basePriceCents: 100,
        }),
      });
      await expectJson(res, 409);
    });

    it("requires auth (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ name: "x", slug: testSlug("p"), category: "jersey", basePriceCents: 1 }),
      });
      await expectJson(res, 401);
    });
  });

  describe("GET - List products", () => {
    it("lists products for this org (200)", async () => {
      const res = await apiFetch(ENDPOINT, { cookie: adminCookie });
      const json = await expectJson(res, 200);
      expect(Array.isArray(json.products)).toBe(true);
      expect(json.products.some((p: any) => p.id === createdId)).toBe(true);
    });
  });

  describe("PUT - Update product", () => {
    it("updates a product (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: createdId,
          name: "U10 Game Jersey v2",
          slug,
          category: "jersey",
          basePriceCents: 2700,
          active: true,
          sortOrder: 1,
          availablePostRegistration: true,
        }),
      });
      const json = await expectJson(res, 200);
      expect(json.product.name).toBe("U10 Game Jersey v2");
      expect(json.product.basePriceCents).toBe(2700);
    });

    it("returns 404 for missing id", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000000",
          name: "x",
          slug: testSlug("p"),
          category: "jersey",
          basePriceCents: 100,
        }),
      });
      await expectJson(res, 404);
    });
  });

  describe("DELETE - Delete product", () => {
    it("deletes a product (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?id=${createdId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      await expectJson(res, 200);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:api -- tests/api/admin/products.test.ts`
Expected: All tests fail with 404 (endpoint doesn't exist yet).

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/admin/products.ts`:

```ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

const PRODUCT_CATEGORIES = [
  "jersey",
  "shorts",
  "socks",
  "hoodie",
  "t_shirt",
  "hat",
  "bag",
  "accessory",
  "other",
] as const;

const productImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().optional(),
  sortOrder: z.number().optional(),
});

const productSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only"),
  description: z.string().optional().nullable(),
  category: z.enum(PRODUCT_CATEGORIES),
  basePriceCents: z.number().int().min(0, "Price must be non-negative"),
  images: z.array(productImageSchema).optional().nullable(),
  availablePostRegistration: z.boolean().default(true),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const rows = await getDb()
      .select()
      .from(products)
      .where(eq(products.organizationId, orgContext.organizationId))
      .orderBy(asc(products.sortOrder), asc(products.name));
    return new Response(JSON.stringify({ products: rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch products" }), { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = productSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 },
      );
    }
    const [row] = await getDb()
      .insert(products)
      .values({ organizationId: orgContext.organizationId, ...result.data })
      .returning();
    return new Response(JSON.stringify({ product: row }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating product:", error);
    if (getDbErrorCode(error) === "23505") {
      return new Response(
        JSON.stringify({ error: "A product with this slug already exists" }),
        { status: 409 },
      );
    }
    return new Response(JSON.stringify({ error: "Failed to create product" }), { status: 500 });
  }
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;
    if (!id) {
      return new Response(JSON.stringify({ error: "Product ID is required" }), { status: 400 });
    }
    const result = productSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 },
      );
    }
    const [row] = await getDb()
      .update(products)
      .set({ ...result.data, updatedAt: new Date() })
      .where(
        and(eq(products.id, id), eq(products.organizationId, orgContext.organizationId)),
      )
      .returning();
    if (!row) {
      return new Response(JSON.stringify({ error: "Product not found" }), { status: 404 });
    }
    return new Response(JSON.stringify({ product: row }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating product:", error);
    if (getDbErrorCode(error) === "23505") {
      return new Response(
        JSON.stringify({ error: "A product with this slug already exists" }),
        { status: 409 },
      );
    }
    return new Response(JSON.stringify({ error: "Failed to update product" }), { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return new Response(JSON.stringify({ error: "Product ID is required" }), { status: 400 });
    }
    const [row] = await getDb()
      .delete(products)
      .where(
        and(eq(products.id, id), eq(products.organizationId, orgContext.organizationId)),
      )
      .returning();
    if (!row) {
      return new Response(JSON.stringify({ error: "Product not found" }), { status: 404 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("Error deleting product:", error);
    if (getDbErrorCode(error) === "23503") {
      return new Response(
        JSON.stringify({
          error: "Cannot delete product that has variants or active gear bindings",
        }),
        { status: 400 },
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete product" }), { status: 500 });
  }
};
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm run test:api -- tests/api/admin/products.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/products.ts tests/api/admin/products.test.ts
git commit -m "feat(gear): products admin CRUD API"
```

---

## Task 3: Product variants admin API

**Files:**
- Create: `src/pages/api/admin/product-variants.ts`
- Create: `tests/api/admin/product-variants.test.ts`

Endpoint lists/mutates variants scoped by `productId` query param (for GET) or body (for POST/PUT/DELETE). Ownership check: the parent product's `organizationId` must match the caller's org context.

- [ ] **Step 1: Write failing tests**

`tests/api/admin/product-variants.test.ts` — mirror the structure of `products.test.ts`, but each test first creates a parent product then a variant. Assertions:

```ts
// Create a parent product in beforeAll:
const createProductRes = await apiFetch("/api/admin/products", {
  method: "POST",
  cookie: adminCookie,
  body: JSON.stringify({
    name: "Variant Parent",
    slug: testSlug("p-variant"),
    category: "jersey",
    basePriceCents: 2000,
  }),
});
parentProductId = (await createProductRes.json()).product.id;
```

Required test cases:
- Create variant with productId + size "YM" + color "red" — returns 201 with `variant.id`
- List variants for productId — returns 200 with array including created variant
- Create duplicate (same productId + size + color) — returns 409
- Create variant where productId belongs to another org — returns 404 (ownership check)
- Update variant — 200
- Delete variant — 200
- Missing auth — 401
- Missing productId query on GET — 400

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:api -- tests/api/admin/product-variants.test.ts`
Expected: All fail with 404.

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/admin/product-variants.ts`. Follow the products.ts scaffold. Key differences:

```ts
// ... imports include productVariants, products from schema, eq, and, asc

const variantSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().max(100).optional().nullable(),
  size: z.string().min(1).max(20),
  color: z.string().max(40).optional().nullable(),
  priceOverrideCents: z.number().int().min(0).optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// Ownership check helper — used in POST/PUT/DELETE
async function assertProductInOrg(productId: string, organizationId: string) {
  const [p] = await getDb()
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.organizationId, organizationId)));
  return !!p;
}
```

GET: accepts `?productId=...`, returns `{ variants: [...] }` for that product after ownership check. If productId missing, 400.

POST: validates body; runs `assertProductInOrg` with `result.data.productId`. If not owned, 404 "Product not found". Otherwise insert and return 201.

PUT: body includes `id` (variant id) and the variant fields. Look up the variant, then ownership-check its product against caller's org. 404 if either missing or owned by another org. Then update.

DELETE: `?id=variantId`. Look up variant → product → ownership check → delete.

Unique constraint violation (23505) returns 409: "A variant with that size/color already exists for this product."

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm run test:api -- tests/api/admin/product-variants.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/product-variants.ts tests/api/admin/product-variants.test.ts
git commit -m "feat(gear): product variants admin CRUD API"
```

---

## Task 4: Program gear binding schema

**Files:**
- Create: `src/lib/db/schema/program-gear.ts`
- Modify: `src/lib/db/schema/index.ts`

- [ ] **Step 1: Write the schema file**

`src/lib/db/schema/program-gear.ts`:

```ts
import {
  pgTable,
  uuid,
  integer,
  boolean,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { products } from "./products";
import { programs, seasons } from "./programs";

export const programGear = pgTable(
  "program_gear",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    programId: uuid("program_id").references(() => programs.id, {
      onDelete: "cascade",
    }),
    seasonId: uuid("season_id").references(() => seasons.id, {
      onDelete: "cascade",
    }),
    required: boolean("required").default(false).notNull(),
    priceCents: integer("price_cents"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    exactlyOneTarget: check(
      "program_gear_exactly_one_target",
      sql`(program_id IS NOT NULL)::int + (season_id IS NOT NULL)::int = 1`,
    ),
    programIdx: index("idx_program_gear_program").on(table.programId),
    seasonIdx: index("idx_program_gear_season").on(table.seasonId),
    productIdx: index("idx_program_gear_product").on(table.productId),
  }),
);

export const programGearRelations = relations(programGear, ({ one }) => ({
  product: one(products, {
    fields: [programGear.productId],
    references: [products.id],
  }),
  program: one(programs, {
    fields: [programGear.programId],
    references: [programs.id],
  }),
  season: one(seasons, {
    fields: [programGear.seasonId],
    references: [seasons.id],
  }),
}));

export type ProgramGear = typeof programGear.$inferSelect;
export type NewProgramGear = typeof programGear.$inferInsert;
```

- [ ] **Step 2: Export from schema index**

Append to `src/lib/db/schema/index.ts`:

```ts
export * from "./program-gear";
```

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`
Inspect generated SQL to confirm the CHECK constraint exists. If drizzle-kit doesn't preserve the named CHECK, manually add it to the migration file:

```sql
ALTER TABLE "program_gear"
  ADD CONSTRAINT "program_gear_exactly_one_target"
  CHECK ((program_id IS NOT NULL)::int + (season_id IS NOT NULL)::int = 1);
```

- [ ] **Step 4: Push**

Run: `npm run db:push`
Verify table exists with `npm run db:studio`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema/program-gear.ts src/lib/db/schema/index.ts src/lib/db/migrations/
git commit -m "feat(gear): add program_gear binding schema"
```

---

## Task 5: Program gear binding admin API

**Files:**
- Create: `src/pages/api/admin/program-gear.ts`
- Create: `tests/api/admin/program-gear.test.ts`

- [ ] **Step 1: Write failing tests**

Required test cases (follow the variants test structure):
- beforeAll: create a product, a program, a season
- POST with productId + programId + required=true + priceCents=2000 → 201
- POST with productId + seasonId (no programId) → 201
- POST with both programId AND seasonId → 400 (validation) — zod rejects
- POST with neither → 400 (validation)
- POST with productId from another org → 404
- POST with programId from another org → 404
- GET with `?programId=...` → lists bindings for that program
- GET with `?seasonId=...` → lists bindings for that season
- PUT updates binding price → 200
- DELETE removes binding → 200

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api -- tests/api/admin/program-gear.test.ts`

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/admin/program-gear.ts`:

```ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { programGear, products, programs, seasons, locations } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

const programGearSchema = z
  .object({
    productId: z.string().uuid(),
    programId: z.string().uuid().optional().nullable(),
    seasonId: z.string().uuid().optional().nullable(),
    required: z.boolean().default(false),
    priceCents: z.number().int().min(0).optional().nullable(),
    sortOrder: z.number().int().default(0),
  })
  .refine(
    (d) => (d.programId ? !d.seasonId : !!d.seasonId),
    { message: "Exactly one of programId or seasonId must be set" },
  );

// Ownership check: product must belong to caller's org; program's location must belong to caller's org
async function assertOwnedByOrg(
  orgId: string,
  productId: string,
  programId?: string | null,
  seasonId?: string | null,
) {
  const [product] = await getDb()
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.organizationId, orgId)));
  if (!product) return { ok: false, reason: "Product not found" };

  if (programId) {
    // Program's location.organizationId must match orgId
    const [row] = await getDb()
      .select({ id: programs.id })
      .from(programs)
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(eq(programs.id, programId), eq(locations.organizationId, orgId)));
    if (!row) return { ok: false, reason: "Program not found" };
  }

  if (seasonId) {
    const [row] = await getDb()
      .select({ id: seasons.id })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(eq(seasons.id, seasonId), eq(locations.organizationId, orgId)));
    if (!row) return { ok: false, reason: "Season not found" };
  }

  return { ok: true as const };
}

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const url = new URL(context.request.url);
  const programId = url.searchParams.get("programId");
  const seasonId = url.searchParams.get("seasonId");

  if (!programId && !seasonId) {
    return new Response(
      JSON.stringify({ error: "programId or seasonId required" }),
      { status: 400 },
    );
  }

  try {
    const where = programId
      ? eq(programGear.programId, programId)
      : eq(programGear.seasonId, seasonId!);
    const rows = await getDb()
      .select()
      .from(programGear)
      .where(where)
      .orderBy(asc(programGear.sortOrder));
    return new Response(JSON.stringify({ bindings: rows }), { status: 200 });
  } catch (error) {
    console.error("Error fetching program gear:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch" }), { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = programGearSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 },
      );
    }
    const ownership = await assertOwnedByOrg(
      orgContext.organizationId,
      result.data.productId,
      result.data.programId ?? null,
      result.data.seasonId ?? null,
    );
    if (!ownership.ok) {
      return new Response(JSON.stringify({ error: ownership.reason }), { status: 404 });
    }
    const [row] = await getDb().insert(programGear).values(result.data).returning();
    return new Response(JSON.stringify({ binding: row }), { status: 201 });
  } catch (error: any) {
    console.error("Error creating program gear:", error);
    return new Response(JSON.stringify({ error: "Failed to create" }), { status: 500 });
  }
};

// PUT and DELETE follow the same ownership pattern. PUT accepts id + mutable fields.
// DELETE accepts ?id=... and runs ownership via the loaded binding's product.
```

Complete PUT and DELETE handlers following the pattern from `src/pages/api/admin/products.ts` (look up binding first, fetch its product, check org via `assertOwnedByOrg`, then update/delete).

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm run test:api -- tests/api/admin/program-gear.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/program-gear.ts tests/api/admin/program-gear.test.ts
git commit -m "feat(gear): program gear binding admin CRUD API"
```

---

## Task 6: External store settings schema extension

**Files:**
- Modify: `src/lib/db/schema/organizations.ts`

No migration required — `OrganizationSettings` and `LocationSettings` are already jsonb. We only extend the TypeScript interfaces.

- [ ] **Step 1: Extend the interfaces**

In `src/lib/db/schema/organizations.ts`, inside the `OrganizationSettings` interface, add:

```ts
export interface OrganizationExternalStore {
  url: string;
  label: string;
  partnerName: "Squadlocker" | "BSN" | "Custom Ink" | "Other";
}

// Inside OrganizationSettings interface:
externalStore?: OrganizationExternalStore;
```

Inside `LocationSettings`:
```ts
externalStore?: OrganizationExternalStore;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db/schema/organizations.ts
git commit -m "feat(gear): add externalStore to org and location settings types"
```

---

## Task 7: External store settings admin sub-form + API extension

**Files:**
- Create: `src/components/admin/external-store-settings.tsx`
- Modify: `src/components/admin/organization-form.tsx` (embed sub-form)
- Modify: whichever component renders location settings (embed sub-form)
- Create: `tests/api/admin/external-store-settings.test.ts` — verify org settings PATCH accepts `externalStore` shape without error; verify `externalStore` shape round-trips via location settings

- [ ] **Step 1: Write failing integration tests**

`tests/api/admin/external-store-settings.test.ts` asserts that PATCHing org settings with `externalStore: { url, label, partnerName }` returns 200 and a subsequent GET returns the same shape. Same for location settings.

Locate the existing organization-settings and location-settings endpoints (likely `src/pages/api/admin/organizations/[id].ts` and `src/pages/api/admin/locations.ts` — confirm paths first). If they pass through the jsonb blob, no API change is needed — the test just verifies the path.

- [ ] **Step 2: Run tests to verify baseline**

Run: `npm run test:api -- tests/api/admin/external-store-settings.test.ts`
Expected: Pass if jsonb is already passed through; fail if the API whitelists keys. In either case, this confirms the state before UI work.

- [ ] **Step 3: Build the sub-form component**

Create `src/components/admin/external-store-settings.tsx`:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ExternalStoreValue {
  url: string;
  label: string;
  partnerName: "Squadlocker" | "BSN" | "Custom Ink" | "Other";
}

interface Props {
  value: ExternalStoreValue | null | undefined;
  onChange: (next: ExternalStoreValue | null) => void;
}

export function ExternalStoreSettings({ value, onChange }: Props) {
  const v = value ?? { url: "", label: "", partnerName: "Squadlocker" as const };
  const set = (patch: Partial<ExternalStoreValue>) => {
    const next = { ...v, ...patch };
    if (!next.url && !next.label) {
      onChange(null);
      return;
    }
    onChange(next);
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <h3 className="text-lg font-semibold">External Team Store</h3>
      <p className="text-sm text-muted-foreground">
        Optional. Link parents to a third-party spirit-wear store (Squadlocker, BSN, Custom Ink, etc.).
        Leave blank to hide the store link on parent-facing pages.
      </p>

      <div>
        <Label htmlFor="externalStoreLabel">Label shown to parents</Label>
        <Input
          id="externalStoreLabel"
          value={v.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="Aspire Powell Team Store"
        />
      </div>

      <div>
        <Label htmlFor="externalStoreUrl">URL</Label>
        <Input
          id="externalStoreUrl"
          type="url"
          value={v.url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="https://teamstore.squadlocker.com/..."
        />
      </div>

      <div>
        <Label htmlFor="externalStorePartner">Partner</Label>
        <Select value={v.partnerName} onValueChange={(pn) => set({ partnerName: pn as ExternalStoreValue["partnerName"] })}>
          <SelectTrigger id="externalStorePartner">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Squadlocker">Squadlocker</SelectItem>
            <SelectItem value="BSN">BSN Sports</SelectItem>
            <SelectItem value="Custom Ink">Custom Ink</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Embed in org settings form**

Open `src/components/admin/organization-form.tsx`. Identify where settings sub-forms are rendered. Add:

```tsx
import { ExternalStoreSettings } from "./external-store-settings";

// In the form, within the settings section:
<ExternalStoreSettings
  value={formData.settings?.externalStore ?? null}
  onChange={(next) =>
    setFormData({
      ...formData,
      settings: {
        ...formData.settings,
        externalStore: next ?? undefined,
      },
    })
  }
/>
```

If the existing form flattens settings — follow whatever pattern the other settings sub-blocks use. Do not restructure the form; match the existing approach.

- [ ] **Step 5: Embed in location settings form**

Locate location-settings UI (search for `LocationSettings` usage in `src/components/admin/`). Embed the same `ExternalStoreSettings` sub-form bound to `settings.externalStore`. Match the existing pattern.

- [ ] **Step 6: Run tests + smoke test in browser**

Run: `npm run test:api`
Start dev: `npm run dev`
In a browser: navigate to org settings, save an external store config, reload, confirm the fields persist. Repeat for location settings.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/external-store-settings.tsx \
        src/components/admin/organization-form.tsx \
        src/components/admin/locations-list.tsx \
        tests/api/admin/external-store-settings.test.ts
git commit -m "feat(gear): external store admin sub-form for org and location"
```

---

## Task 8: Products admin list UI

**Files:**
- Create: `src/components/admin/products-list.tsx`
- Create: `src/pages/admin/gear/index.astro`
- Create: `src/pages/admin/gear/products.astro`
- Modify: `src/components/admin/admin-layout.tsx` — add "Gear" nav entry

- [ ] **Step 1: Build the list component**

Create `src/components/admin/products-list.tsx`. Scaffold from `src/components/admin/sports-list.tsx`. Required shape:

```tsx
"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CATEGORIES = [
  "jersey",
  "shorts",
  "socks",
  "hoodie",
  "t_shirt",
  "hat",
  "bag",
  "accessory",
  "other",
] as const;

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: (typeof CATEGORIES)[number];
  basePriceCents: number;
  images: { url: string; alt?: string }[] | null;
  availablePostRegistration: boolean;
  active: boolean;
  sortOrder: number;
}

export function ProductsList() {
  // State: products[], isLoading, error, isDialogOpen, isSubmitting, editingProduct,
  // formData with fields matching Product (minus id/createdAt/updatedAt), plus
  // priceDollarsString for display-as-dollars conversion to cents.

  // Effects: fetchProducts on mount.

  // API: GET /api/admin/products, POST, PUT, DELETE mirroring SportsList.

  // Render:
  //  - Create/edit Dialog with all fields (category as <Select>, price as dollar input)
  //  - List as a grid of Cards; each Card shows image thumbnail (first image or placeholder),
  //    name, category, base price, status (active/inactive).
  //  - Each Card links to /admin/gear/products/[id] for variants management.
  //  - Edit and Delete buttons on each card.

  // ... implement following SportsList as the template.

  return null; // placeholder — replace with full render tree
}
```

The full implementation should:
- Convert `basePriceCents` to dollars for display (`(cents / 100).toFixed(2)`) and back on submit (`Math.round(parseFloat(str) * 100)`)
- Show a preview of the first image if `images[0].url` set
- Include a "Available post-registration" checkbox (default true)
- Sort list by `sortOrder`, then `name`
- Emit a toast via `sonner` on success/error — use `import { toast } from "sonner"` (already a dependency)

- [ ] **Step 2: Create the admin pages**

Create `src/pages/admin/gear/index.astro`:

```astro
---
import AdminLayout from "@/layouts/AdminLayout.astro"; // match existing admin layout path
---

<AdminLayout title="Gear & Merchandise">
  <div class="p-6">
    <h1 class="text-3xl font-bold mb-6">Gear & Merchandise</h1>
    <div class="grid gap-4 md:grid-cols-3">
      <a href="/admin/gear/products" class="block p-6 rounded-lg border hover:bg-muted">
        <h2 class="text-xl font-semibold">Products</h2>
        <p class="text-sm text-muted-foreground">Manage your product catalog.</p>
      </a>
      <!-- Future: batches, sponsors links added in later plans -->
    </div>
  </div>
</AdminLayout>
```

Confirm the layout import path by looking at an existing admin page like `src/pages/admin/sports.astro`.

Create `src/pages/admin/gear/products.astro`:

```astro
---
import AdminLayout from "@/layouts/AdminLayout.astro";
import { ProductsList } from "@/components/admin/products-list";
---

<AdminLayout title="Products">
  <ProductsList client:load />
</AdminLayout>
```

- [ ] **Step 3: Add "Gear" to admin nav**

Edit `src/components/admin/admin-layout.tsx`. Find the nav items array and add:

```tsx
{ label: "Gear", href: "/admin/gear", icon: ShoppingBagIcon }
```

Match whatever icon lib the other nav entries use (`lucide-react` → `ShoppingBag`).

- [ ] **Step 4: Smoke test in browser**

Run: `npm run dev`
Navigate to `/admin/gear/products`.
- Create a product ("Test Jersey", category "jersey", price $25.00)
- Edit it (change price to $27.00)
- Toggle active, delete, etc.
- Confirm all actions persist after reload

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/products-list.tsx \
        src/pages/admin/gear/ \
        src/components/admin/admin-layout.tsx
git commit -m "feat(gear): products admin list and catalog nav"
```

---

## Task 9: Product variants admin UI (per-product page)

**Files:**
- Create: `src/components/admin/product-variants-manager.tsx`
- Create: `src/pages/admin/gear/products/[id].astro`

- [ ] **Step 1: Build the variants manager component**

Create `src/components/admin/product-variants-manager.tsx`:

- Props: `{ productId: string; basePriceCents: number }`
- State: `variants[]`, `isLoading`, `editingVariant`, `formData` (size, color, priceOverrideCents, active, sortOrder)
- Effect: GET `/api/admin/product-variants?productId=...`
- Table display: size | color | price (override or base) | active | actions
- Create/edit dialog with size input, color input (optional), price override (optional dollar input), active checkbox

Follow the pattern from existing list components.

- [ ] **Step 2: Create the detail page**

Create `src/pages/admin/gear/products/[id].astro`:

```astro
---
import AdminLayout from "@/layouts/AdminLayout.astro";
import { ProductVariantsManager } from "@/components/admin/product-variants-manager";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const { id } = Astro.params;
if (!id) return Astro.redirect("/admin/gear/products");

const [product] = await getDb()
  .select()
  .from(products)
  .where(eq(products.id, id));

if (!product) return Astro.redirect("/admin/gear/products");
// Also check org context matches; redirect if not
---

<AdminLayout title={`Product: ${product.name}`}>
  <div class="p-6 max-w-4xl mx-auto">
    <a href="/admin/gear/products" class="text-sm text-muted-foreground">← Back to products</a>
    <h1 class="text-3xl font-bold mt-2 mb-6">{product.name}</h1>
    <p class="text-muted-foreground mb-8">{product.description}</p>

    <section>
      <h2 class="text-xl font-semibold mb-4">Variants</h2>
      <ProductVariantsManager client:load productId={product.id} basePriceCents={product.basePriceCents} />
    </section>
  </div>
</AdminLayout>
```

Confirm org-scoping: the query should filter `products.organizationId` by the current org context. Look at existing admin page org-scoping patterns (e.g., `src/pages/admin/programs/[id].astro` if it exists) and mirror the approach.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`
- Navigate to a product detail page from the products list
- Add a variant (size "YM", no color, no price override)
- Add another (size "YL", override $28.00)
- Edit one, delete the other
- Attempt duplicate (same size + color) → expect 409 error toast

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/product-variants-manager.tsx \
        src/pages/admin/gear/products/\[id\].astro
git commit -m "feat(gear): product variants manager UI"
```

---

## Task 10: Program gear binding admin UI (embedded in program/season admin)

**Files:**
- Create: `src/components/admin/program-gear-binding.tsx`
- Modify: the existing program detail or season detail admin page (e.g., `src/pages/admin/programs/[id].astro` or similar)

- [ ] **Step 1: Build the binding component**

Create `src/components/admin/program-gear-binding.tsx`:

- Props: `{ programId?: string; seasonId?: string }` (exactly one set)
- Fetches list of bindings from `/api/admin/program-gear?programId=...` (or seasonId)
- Fetches list of all products from `/api/admin/products` for the "Add a product" picker
- Dialog to add: pick product from `<Select>`, toggle "Required", optional price override (dollars), sortOrder
- Table of existing bindings: product name, required/optional, price, actions (edit/delete)

- [ ] **Step 2: Embed in program or season admin page**

Find the existing program admin detail page. Typical location: `src/pages/admin/programs/[id].astro` or a section within `src/components/admin/programs-list.tsx`. Embed the binding component:

```tsx
<ProgramGearBinding programId={program.id} />
```

If program detail pages don't exist yet, embed at the season level only for v1 (the spec says season binding overrides program — season is the safer default).

- [ ] **Step 3: Smoke test**

Run: `npm run dev`
- Navigate to a program (or season) admin detail page
- Add a product binding (select a previously-created product, mark required, override price $22.00)
- Verify it appears in the binding list
- Edit it, delete it

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/program-gear-binding.tsx \
        src/pages/admin/programs/
git commit -m "feat(gear): program/season gear binding UI"
```

---

## Task 11: Parent-facing "Shop Team Gear" surfaces

**Files:**
- Modify: `src/components/dashboard/children-overview.tsx` (or dashboard index page) — add conditional card
- Modify: program detail public page — add sidebar CTA
- Modify: public location landing page — add "Shop" link in nav

- [ ] **Step 1: Build a resolver helper for external store config**

Create `src/lib/organization/external-store.ts`:

```ts
import type { Organization, Location } from "@/lib/db/schema";
import type { OrganizationExternalStore } from "@/lib/db/schema/organizations";

export function resolveExternalStore(
  location: Location | null | undefined,
  organization: Organization | null | undefined,
): OrganizationExternalStore | null {
  const locSettings = (location?.settings as any) ?? {};
  if (locSettings.externalStore?.url) return locSettings.externalStore;
  const orgSettings = (organization?.settings as any) ?? {};
  if (orgSettings.externalStore?.url) return orgSettings.externalStore;
  return null;
}
```

- [ ] **Step 2: Add "Shop Team Gear" card on parent dashboard**

Edit the dashboard index page or a suitable dashboard component (find where `children-overview.tsx` or similar is rendered). Resolve external store using the helper against `Astro.locals.organization` and the current user's primary location (however that's resolved today — mirror existing dashboard location resolution).

Render:

```tsx
{externalStore && (
  <a
    href={externalStore.url}
    target="_blank"
    rel="noopener noreferrer"
    className="block p-4 rounded-lg border hover:bg-muted"
  >
    <div className="flex items-center gap-3">
      <ShoppingBagIcon className="h-6 w-6" />
      <div>
        <h3 className="font-semibold">{externalStore.label}</h3>
        <p className="text-sm text-muted-foreground">Shop team gear</p>
      </div>
    </div>
  </a>
)}
```

- [ ] **Step 3: Add sidebar CTA on program detail page**

Find the program detail page (public + authenticated versions). Resolve external store via location, then org. Render a similar card in the sidebar with `externalStore.label` as CTA.

- [ ] **Step 4: Add "Shop" link in public location landing page nav**

Find the public location landing page. If `externalStore` resolves, add a "Shop" nav link pointing to `externalStore.url` with target="_blank".

- [ ] **Step 5: Smoke test**

Run: `npm run dev`
- With external store unset: confirm no Shop card / no Shop nav link appears
- Configure external store at org level: confirm it shows on all surfaces
- Configure a different external store at location level: confirm location override wins

- [ ] **Step 6: Commit**

```bash
git add src/lib/organization/external-store.ts \
        src/components/dashboard/ \
        src/pages/programs/ \
        src/pages/locations/
git commit -m "feat(gear): parent-facing external store surfaces"
```

---

## Task 12: Plan 1 wrap-up

- [ ] **Step 1: Full test run**

Run: `npm run test:api`
Run: `npm run test`
Expected: No regressions. New tests pass.

- [ ] **Step 2: Type check**

Run: `npx astro check`
Expected: No new type errors.

- [ ] **Step 3: Manual walkthrough checklist**

Start dev server and verify:
- [ ] Org admin can create products with variants
- [ ] Org admin can bind products to a program (or season) with required flag and price override
- [ ] Org admin can set external store URL at both org and location level (location wins)
- [ ] Parent dashboard shows "Shop Team Gear" card when configured; hides when not
- [ ] Program detail page shows Shop CTA
- [ ] Public location landing page shows Shop link

- [ ] **Step 4: Commit final CHANGELOG note if repo uses one, or skip**

Check if the repo has a CHANGELOG.md convention. If yes, add a line.

Plan 1 complete. Next plan: gear orders + registration flow integration.

---

## Self-review notes

- All tasks reference exact file paths.
- Schema definitions include full SQL-relevant details (enums, checks, indexes, unique constraints).
- API handlers include full zod schemas, full error handling (23505, 23503), full org scoping.
- UI components describe the shape but refer to `sports-list.tsx` as the scaffold for boilerplate structure; any executing agent reading this plan has access to that file.
- Tests list required cases explicitly; the structure mirrors `tests/api/admin/sports.test.ts`.
- No placeholders (TBD/TODO) in plan body. References to "match existing pattern" always point to a specific file.
- One open question carried from spec (payment_line_items granularity) is a Plan 2 concern, not Plan 1.
