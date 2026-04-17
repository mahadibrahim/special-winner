# Plan 2 — Gear Orders and Registration Flow Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Gear & Merch" step to the registration wizard, create gear_orders + line items at checkout, bundle program + gear into a single Stripe payment intent, and give parents a post-registration entry point to order more gear (ship-to-home).

**Architecture:** New Drizzle schemas (`gear-orders.ts`, `payment-line-items.ts`), sizing jsonb extension on `family_members`, new timestamp column on `seasons`. Registration wizard gets a new React step component. Stripe checkout flow is extended to accept an array of gear line items alongside the program fee. Webhook handler creates `gear_orders` + `gear_order_items` + `payment_line_items` rows on successful payment.

**Tech Stack:** Astro 5, React 19, Drizzle ORM, Postgres, Stripe SDK (existing wiring), Zod, Vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-04-17-merchandise-gear-distribution-design.md` §4.3, §4.4, §4.6, §4.7, §5.

**Prerequisite:** Plan 1 complete (catalog + bindings in place).

---

## Key decisions resolved from spec's open questions

- **Payment line item granularity:** one `payment_line_items` row **per gear line item** (not aggregated). Rationale: enables per-product-category revenue reporting without joins, minimal storage cost at Aspire's scale.
- **Multiple open batches for same location+season:** blocked at batch creation (Plan 3 enforces). Plan 2 assumes at most one open batch per (location, season).
- **Ship-to-home shipping fee:** flat rate per location, stored in `LocationSettings.gearShippingFeeCents` (jsonb extension, no new column). Falls back to org-level `OrganizationSettings.gearShippingFeeCents`, then to zero.

---

## File structure

New files:
- `src/lib/db/schema/gear-orders.ts` — gear_orders, gear_order_items tables + enums + relations
- `src/lib/db/schema/payment-line-items.ts` — payment_line_items table + enum
- `src/components/registration/gear-step.tsx` — wizard step for required + add-on gear selection
- `src/components/registration/shipping-address-form.tsx` — used in post-registration and late-registrant flows
- `src/components/dashboard/order-more-gear-button.tsx` — CTA on parent dashboard per registered kid
- `src/pages/dashboard/gear/order/[registrationId].astro` — post-registration gear ordering page
- `src/pages/api/registration/gear-options.ts` — GET endpoint: for a season, returns active bindings + variants
- `src/pages/api/registration/submit-with-gear.ts` — POST: creates a draft `gear_order`, returns a Stripe payment intent amount breakdown
- `src/pages/api/gear/shipping-quote.ts` — GET: returns shipping fee for a location/org
- `src/pages/api/dashboard/gear/order.ts` — POST: post-registration gear ordering
- `src/lib/gear/pricing.ts` — pure helpers for computing line item totals
- `src/lib/gear/resolve-bindings.ts` — resolves program_gear for a season (season overrides program)
- `tests/api/registration/gear-options.test.ts`
- `tests/api/registration/submit-with-gear.test.ts`
- `tests/api/dashboard/gear-order.test.ts`
- `tests/lib/gear/pricing.test.ts`
- `tests/lib/gear/resolve-bindings.test.ts`

Files modified:
- `src/lib/db/schema/registrations.ts` — add `sizing` jsonb column to `family_members`
- `src/lib/db/schema/programs.ts` — add `gearOrderCutoff` timestamp column to `seasons`
- `src/lib/db/schema/index.ts` — export new modules
- `src/lib/db/schema/organizations.ts` — extend `OrganizationSettings` and `LocationSettings` with `gearShippingFeeCents?: number`
- `src/components/registration/registration-wizard.tsx` (or the existing wizard component) — insert GearStep between waiver and payment
- `src/pages/api/stripe/webhook.ts` or equivalent — extend to read `payment_intent.metadata.lineItems` and persist `payment_line_items` + link `gear_order.paymentId`
- `src/components/dashboard/children-overview.tsx` — add `OrderMoreGearButton` per registered kid

---

## Task 1: Schema — gear_orders + gear_order_items

**Files:**
- Create: `src/lib/db/schema/gear-orders.ts`

- [ ] **Step 1: Write schema**

```ts
import {
  pgTable, uuid, varchar, text, boolean, timestamp, integer, jsonb, pgEnum, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations, locations } from "./organizations";
import { familyMembers, registrations } from "./registrations";
import { productVariants } from "./products";
import { programGear } from "./program-gear";

export const fulfillmentMethodEnum = pgEnum("gear_fulfillment_method", ["pickup", "ship"]);

export const gearOrderStatusEnum = pgEnum("gear_order_status", [
  "pending", "batched", "ordered", "received", "distributed", "shipped", "cancelled",
]);

export const gearOrders = pgTable("gear_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  familyMemberId: uuid("family_member_id").references(() => familyMembers.id, { onDelete: "set null" }),
  registrationId: uuid("registration_id").references(() => registrations.id, { onDelete: "set null" }),
  fulfillmentMethod: fulfillmentMethodEnum("fulfillment_method").default("pickup").notNull(),
  shippingAddress: jsonb("shipping_address"), // required when fulfillmentMethod='ship'
  status: gearOrderStatusEnum("status").default("pending").notNull(),
  batchId: uuid("batch_id"), // FK added in Plan 3 when gear_batches table exists
  pickupConfirmedAt: timestamp("pickup_confirmed_at"),
  pickupConfirmedBy: uuid("pickup_confirmed_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("idx_gear_orders_org").on(table.organizationId),
  registrationIdx: index("idx_gear_orders_registration").on(table.registrationId),
  statusIdx: index("idx_gear_orders_status").on(table.status),
}));

export const gearOrderItems = pgTable("gear_order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  gearOrderId: uuid("gear_order_id").notNull().references(() => gearOrders.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
  programGearId: uuid("program_gear_id").references(() => programGear.id, { onDelete: "set null" }),
  quantity: integer("quantity").default(1).notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  capturedSize: varchar("captured_size", { length: 20 }).notNull(),
  capturedColor: varchar("captured_color", { length: 40 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orderIdx: index("idx_gear_order_items_order").on(table.gearOrderId),
}));

export const gearOrdersRelations = relations(gearOrders, ({ one, many }) => ({
  organization: one(organizations, { fields: [gearOrders.organizationId], references: [organizations.id] }),
  location: one(locations, { fields: [gearOrders.locationId], references: [locations.id] }),
  user: one(users, { fields: [gearOrders.userId], references: [users.id] }),
  familyMember: one(familyMembers, { fields: [gearOrders.familyMemberId], references: [familyMembers.id] }),
  registration: one(registrations, { fields: [gearOrders.registrationId], references: [registrations.id] }),
  items: many(gearOrderItems),
}));

export const gearOrderItemsRelations = relations(gearOrderItems, ({ one }) => ({
  order: one(gearOrders, { fields: [gearOrderItems.gearOrderId], references: [gearOrders.id] }),
  variant: one(productVariants, { fields: [gearOrderItems.productVariantId], references: [productVariants.id] }),
  programGear: one(programGear, { fields: [gearOrderItems.programGearId], references: [programGear.id] }),
}));

export type GearOrder = typeof gearOrders.$inferSelect;
export type NewGearOrder = typeof gearOrders.$inferInsert;
export type GearOrderItem = typeof gearOrderItems.$inferSelect;
export type NewGearOrderItem = typeof gearOrderItems.$inferInsert;

export interface GearShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  recipientName?: string;
}
```

Note: `batchId` has no FK in this plan because `gear_batches` is created in Plan 3. A migration in Plan 3 will add the FK constraint.

- [ ] **Step 2: Export and migrate**

Append to `src/lib/db/schema/index.ts`:
```ts
export * from "./gear-orders";
```

Run: `npm run db:generate`
Run: `npm run db:push`
Verify with `npm run db:studio`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema/gear-orders.ts src/lib/db/schema/index.ts src/lib/db/migrations/
git commit -m "feat(gear): gear_orders and gear_order_items schema"
```

---

## Task 2: Schema — payment_line_items

**Files:**
- Create: `src/lib/db/schema/payment-line-items.ts`
- Modify: `src/lib/db/schema/index.ts`

- [ ] **Step 1: Write schema**

```ts
import { pgTable, uuid, varchar, integer, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { payments } from "./payments";

export const paymentLineItemTypeEnum = pgEnum("payment_line_item_type", [
  "program_fee",
  "gear_required",
  "gear_addon",
  "shipping",
  "discount",
]);

export const paymentLineItems = pgTable("payment_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  itemType: paymentLineItemTypeEnum("item_type").notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: uuid("reference_id"),
  amountCents: integer("amount_cents").notNull(),
  description: varchar("description", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  paymentIdx: index("idx_payment_line_items_payment").on(table.paymentId),
  typeRefIdx: index("idx_payment_line_items_type_ref").on(table.itemType, table.referenceType, table.referenceId),
}));

export const paymentLineItemsRelations = relations(paymentLineItems, ({ one }) => ({
  payment: one(payments, { fields: [paymentLineItems.paymentId], references: [payments.id] }),
}));

export type PaymentLineItem = typeof paymentLineItems.$inferSelect;
export type NewPaymentLineItem = typeof paymentLineItems.$inferInsert;
```

- [ ] **Step 2: Export and migrate**

Append to schema index:
```ts
export * from "./payment-line-items";
```

Run: `npm run db:generate`
Run: `npm run db:push`

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema/payment-line-items.ts src/lib/db/schema/index.ts src/lib/db/migrations/
git commit -m "feat(gear): payment_line_items schema"
```

---

## Task 3: Add sizing column to family_members

**Files:**
- Modify: `src/lib/db/schema/registrations.ts`

- [ ] **Step 1: Extend schema**

Inside the `familyMembers` table definition, add:

```ts
sizing: jsonb("sizing").$type<FamilyMemberSizing>(),
```

Below the table, add:

```ts
export interface FamilyMemberSizing {
  top?: string;
  bottom?: string;
  shoe?: string;
  hat?: string;
}
```

- [ ] **Step 2: Migrate**

Run: `npm run db:generate`
Run: `npm run db:push`

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema/registrations.ts src/lib/db/migrations/
git commit -m "feat(gear): add sizing jsonb to family_members"
```

---

## Task 4: Add gearOrderCutoff to seasons

**Files:**
- Modify: `src/lib/db/schema/programs.ts`

- [ ] **Step 1: Extend schema**

Inside the `seasons` table, add:
```ts
gearOrderCutoff: timestamp("gear_order_cutoff"),
```

- [ ] **Step 2: Migrate**

Run: `npm run db:generate`
Run: `npm run db:push`

- [ ] **Step 3: Extend seasons admin form**

Find the admin form for seasons (`src/components/admin/seasons-list.tsx` based on file listing). Add a date-time picker field labeled "Gear order cutoff (optional)". Wire it into create/update API requests. Store as ISO 8601 string, null when empty.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/programs.ts \
        src/components/admin/seasons-list.tsx \
        src/lib/db/migrations/
git commit -m "feat(gear): add gearOrderCutoff to seasons + admin UI"
```

---

## Task 5: Extend settings interfaces with shipping fee

**Files:**
- Modify: `src/lib/db/schema/organizations.ts`

- [ ] **Step 1: Extend `OrganizationSettings` and `LocationSettings`**

Add to both interfaces:
```ts
gearShippingFeeCents?: number;
```

No migration — jsonb is free-form.

- [ ] **Step 2: Add to org + location admin settings forms**

Reuse or create a small number input labeled "Gear shipping fee ($)" in both org settings and location settings forms, converting cents ↔ dollars on the boundary. Follow the pattern used by `ExternalStoreSettings` (Plan 1, Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema/organizations.ts src/components/admin/
git commit -m "feat(gear): add gearShippingFeeCents to org and location settings"
```

---

## Task 6: Pure helpers — pricing and binding resolution

**Files:**
- Create: `src/lib/gear/pricing.ts`
- Create: `src/lib/gear/resolve-bindings.ts`
- Create: `tests/lib/gear/pricing.test.ts`
- Create: `tests/lib/gear/resolve-bindings.test.ts`

- [ ] **Step 1: Write failing tests for pricing**

`tests/lib/gear/pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeItemPrice, computeOrderTotal } from "@/lib/gear/pricing";

describe("computeItemPrice", () => {
  it("uses binding override when set", () => {
    expect(
      computeItemPrice({ basePriceCents: 2500, variantOverrideCents: null, bindingOverrideCents: 2000 }),
    ).toBe(2000);
  });

  it("falls back to variant override when no binding override", () => {
    expect(
      computeItemPrice({ basePriceCents: 2500, variantOverrideCents: 2200, bindingOverrideCents: null }),
    ).toBe(2200);
  });

  it("falls back to base when no overrides", () => {
    expect(
      computeItemPrice({ basePriceCents: 2500, variantOverrideCents: null, bindingOverrideCents: null }),
    ).toBe(2500);
  });

  it("treats 0 override as valid (free item)", () => {
    expect(
      computeItemPrice({ basePriceCents: 2500, variantOverrideCents: null, bindingOverrideCents: 0 }),
    ).toBe(0);
  });
});

describe("computeOrderTotal", () => {
  it("sums unit price × quantity across items + shipping", () => {
    const total = computeOrderTotal({
      items: [
        { unitPriceCents: 2500, quantity: 1 },
        { unitPriceCents: 1500, quantity: 2 },
      ],
      shippingFeeCents: 500,
    });
    expect(total).toBe(2500 + 3000 + 500);
  });

  it("handles empty items", () => {
    expect(computeOrderTotal({ items: [], shippingFeeCents: 0 })).toBe(0);
  });
});
```

- [ ] **Step 2: Implement pricing helpers**

`src/lib/gear/pricing.ts`:

```ts
export function computeItemPrice(args: {
  basePriceCents: number;
  variantOverrideCents: number | null;
  bindingOverrideCents: number | null;
}): number {
  if (args.bindingOverrideCents !== null && args.bindingOverrideCents !== undefined) {
    return args.bindingOverrideCents;
  }
  if (args.variantOverrideCents !== null && args.variantOverrideCents !== undefined) {
    return args.variantOverrideCents;
  }
  return args.basePriceCents;
}

export function computeOrderTotal(args: {
  items: Array<{ unitPriceCents: number; quantity: number }>;
  shippingFeeCents: number;
}): number {
  const subtotal = args.items.reduce((sum, it) => sum + it.unitPriceCents * it.quantity, 0);
  return subtotal + args.shippingFeeCents;
}
```

- [ ] **Step 3: Run pricing tests — expect pass**

Run: `npm run test:api -- tests/lib/gear/pricing.test.ts`

- [ ] **Step 4: Write failing tests for binding resolution**

`tests/lib/gear/resolve-bindings.test.ts`:

Required cases:
- Returns all `program_gear` rows with `programId` set for the season's program PLUS all rows with `seasonId` set for that specific season
- When both a program-level binding and a season-level binding exist for the same product, the season binding wins (filtered/preferred)
- Returns joined product + active variants per binding
- Filters out bindings where the product is inactive or has no active variants

Mock the database or use a real db in-test setup (check existing test-helpers for which pattern the repo uses; use whichever is standard).

- [ ] **Step 5: Implement binding resolver**

`src/lib/gear/resolve-bindings.ts`:

```ts
import { getDb } from "@/lib/db";
import { programGear, products, productVariants, seasons } from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";

export interface ResolvedBinding {
  bindingId: string;
  programId: string | null;
  seasonId: string | null;
  productId: string;
  productName: string;
  productCategory: string;
  productDescription: string | null;
  productImages: any;
  required: boolean;
  priceCents: number; // base or binding override, not variant
  bindingPriceOverrideCents: number | null;
  basePriceCents: number;
  availablePostRegistration: boolean;
  variants: Array<{
    id: string;
    size: string;
    color: string | null;
    priceOverrideCents: number | null;
    sortOrder: number;
  }>;
}

export async function resolveBindingsForSeason(seasonId: string): Promise<ResolvedBinding[]> {
  const db = getDb();

  const [season] = await db.select({ id: seasons.id, programId: seasons.programId }).from(seasons).where(eq(seasons.id, seasonId));
  if (!season) return [];

  // Fetch all candidate bindings (program-level OR season-level)
  const bindings = await db
    .select()
    .from(programGear)
    .innerJoin(products, eq(products.id, programGear.productId))
    .where(
      and(
        or(eq(programGear.programId, season.programId), eq(programGear.seasonId, season.id)),
        eq(products.active, true),
      ),
    );

  // For each product with both program-level + season-level bindings, prefer season-level
  const byProductId = new Map<string, typeof bindings[number]>();
  for (const row of bindings) {
    const existing = byProductId.get(row.products.id);
    if (!existing || (!existing.program_gear.seasonId && row.program_gear.seasonId)) {
      byProductId.set(row.products.id, row);
    }
  }

  // Fetch variants in one query
  const productIds = Array.from(byProductId.keys());
  const variants = productIds.length
    ? await db.select().from(productVariants).where(and(
        or(...productIds.map((pid) => eq(productVariants.productId, pid))),
        eq(productVariants.active, true),
      ))
    : [];

  const variantsByProduct = new Map<string, typeof variants>();
  for (const v of variants) {
    if (!variantsByProduct.has(v.productId)) variantsByProduct.set(v.productId, []);
    variantsByProduct.get(v.productId)!.push(v);
  }

  return Array.from(byProductId.values())
    .filter((row) => (variantsByProduct.get(row.products.id)?.length ?? 0) > 0)
    .map((row) => ({
      bindingId: row.program_gear.id,
      programId: row.program_gear.programId,
      seasonId: row.program_gear.seasonId,
      productId: row.products.id,
      productName: row.products.name,
      productCategory: row.products.category,
      productDescription: row.products.description,
      productImages: row.products.images,
      required: row.program_gear.required,
      basePriceCents: row.products.basePriceCents,
      bindingPriceOverrideCents: row.program_gear.priceCents,
      priceCents: row.program_gear.priceCents ?? row.products.basePriceCents,
      availablePostRegistration: row.products.availablePostRegistration,
      variants: (variantsByProduct.get(row.products.id) ?? []).map((v) => ({
        id: v.id,
        size: v.size,
        color: v.color,
        priceOverrideCents: v.priceOverrideCents,
        sortOrder: v.sortOrder,
      })),
    }));
}
```

- [ ] **Step 6: Run resolve-bindings tests**

Run: `npm run test:api -- tests/lib/gear/resolve-bindings.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/lib/gear/ tests/lib/gear/
git commit -m "feat(gear): pricing and binding resolution helpers"
```

---

## Task 7: API — gear options for a season

**Files:**
- Create: `src/pages/api/registration/gear-options.ts`
- Create: `tests/api/registration/gear-options.test.ts`

- [ ] **Step 1: Write failing tests**

Required test cases:
- Unauthenticated — 401
- Returns `{ requiredBindings: [...], optionalBindings: [...], shippingFeeCents }` for a season
- Filters by authenticated user's org (cross-tenant protection)
- Returns empty arrays if no bindings

- [ ] **Step 2: Implement endpoint**

```ts
import type { APIRoute } from "astro";
import { resolveBindingsForSeason } from "@/lib/gear/resolve-bindings";
import { getDb } from "@/lib/db";
import { seasons, programs, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const url = new URL(context.request.url);
  const seasonId = url.searchParams.get("seasonId");
  if (!seasonId) {
    return new Response(JSON.stringify({ error: "seasonId required" }), { status: 400 });
  }

  const [row] = await getDb()
    .select({ locationId: programs.locationId, locationSettings: locations.settings, orgId: locations.organizationId })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(seasons.id, seasonId));

  if (!row) {
    return new Response(JSON.stringify({ error: "Season not found" }), { status: 404 });
  }
  if (context.locals.organization && context.locals.organization.id !== row.orgId) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const bindings = await resolveBindingsForSeason(seasonId);
  const shippingFeeCents = (row.locationSettings as any)?.gearShippingFeeCents
    ?? (context.locals.organization?.settings as any)?.gearShippingFeeCents
    ?? 0;

  return new Response(
    JSON.stringify({
      requiredBindings: bindings.filter((b) => b.required),
      optionalBindings: bindings.filter((b) => !b.required),
      shippingFeeCents,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
```

- [ ] **Step 3: Run tests — expect pass**

Run: `npm run test:api -- tests/api/registration/gear-options.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/registration/gear-options.ts tests/api/registration/gear-options.test.ts
git commit -m "feat(gear): gear-options endpoint for registration flow"
```

---

## Task 8: Registration wizard — GearStep component

**Files:**
- Create: `src/components/registration/gear-step.tsx`
- Modify: `src/components/registration/registration-wizard.tsx` (or equivalent file — find existing wizard)

Before starting: locate the existing registration wizard. Search for a file that imports waiver + payment and orchestrates steps. Read it to understand the step interface pattern. Match it.

- [ ] **Step 1: Build GearStep**

`src/components/registration/gear-step.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export interface ResolvedBinding {
  bindingId: string;
  productId: string;
  productName: string;
  productCategory: string;
  productDescription: string | null;
  productImages: any;
  required: boolean;
  priceCents: number;
  variants: Array<{
    id: string;
    size: string;
    color: string | null;
    priceOverrideCents: number | null;
    sortOrder: number;
  }>;
}

export interface GearStepValue {
  items: Array<{
    productVariantId: string;
    programGearId: string;
    quantity: number;
    unitPriceCents: number;
    capturedSize: string;
    capturedColor: string | null;
    category: "required" | "optional";
  }>;
}

interface Props {
  seasonId: string;
  familyMemberId: string;
  familyMemberSizing: { top?: string; bottom?: string; shoe?: string; hat?: string } | null | undefined;
  pastCutoff: boolean; // forces ship-to-home + shipping fee
  value: GearStepValue;
  onChange: (v: GearStepValue) => void;
  onNext: () => void;
  onBack: () => void;
}

// Map product category → sizing key for autofill
function categoryToSizingKey(cat: string): keyof NonNullable<Props["familyMemberSizing"]> | null {
  if (cat === "jersey" || cat === "t_shirt" || cat === "hoodie") return "top";
  if (cat === "shorts") return "bottom";
  if (cat === "hat") return "hat";
  return null;
}

export function GearStep({ seasonId, familyMemberSizing, value, onChange, onNext, onBack, pastCutoff }: Props) {
  const [required, setRequired] = useState<ResolvedBinding[]>([]);
  const [optional, setOptional] = useState<ResolvedBinding[]>([]);
  const [shippingFeeCents, setShippingFeeCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/registration/gear-options?seasonId=${seasonId}`);
        if (!res.ok) throw new Error("Failed to load gear");
        const data = await res.json();
        setRequired(data.requiredBindings);
        setOptional(data.optionalBindings);
        setShippingFeeCents(data.shippingFeeCents);
      } catch (e) {
        setError("Failed to load gear options");
      } finally {
        setLoading(false);
      }
    })();
  }, [seasonId]);

  // Auto-pick default size per required binding on load
  useEffect(() => {
    if (loading || required.length === 0) return;
    if (value.items.length > 0) return; // already selected
    const newItems: GearStepValue["items"] = [];
    for (const b of required) {
      const key = categoryToSizingKey(b.productCategory);
      const savedSize = key ? familyMemberSizing?.[key] : undefined;
      const defaultVariant =
        (savedSize && b.variants.find((v) => v.size === savedSize)) ||
        b.variants[0];
      if (!defaultVariant) continue;
      newItems.push({
        productVariantId: defaultVariant.id,
        programGearId: b.bindingId,
        quantity: 1,
        unitPriceCents: defaultVariant.priceOverrideCents ?? b.priceCents,
        capturedSize: defaultVariant.size,
        capturedColor: defaultVariant.color,
        category: "required",
      });
    }
    onChange({ items: newItems });
  }, [loading, required, familyMemberSizing]);

  const total = useMemo(() => {
    const subtotal = value.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
    const shipping = pastCutoff ? shippingFeeCents : 0;
    return subtotal + shipping;
  }, [value.items, pastCutoff, shippingFeeCents]);

  const canContinue = required.every((b) =>
    value.items.some((i) => i.programGearId === b.bindingId && i.quantity > 0),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (error) return <p className="text-destructive">{error}</p>;
  if (required.length === 0 && optional.length === 0) {
    // Skip the step entirely — parent handles this decision
    onNext();
    return null;
  }

  // Render: required block, optional block, total line, shipping notice (if pastCutoff),
  // Back + Continue buttons. Each item row has product name, size selector,
  // (for optional) add-to-cart toggle, price display.
  // Use onChange(...) to update the value object when the parent changes size.

  return (
    <div className="space-y-6">
      {/* Required */}
      {required.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Required Gear</CardTitle></CardHeader>
          <CardContent>
            {required.map((b) => {
              const item = value.items.find((i) => i.programGearId === b.bindingId);
              return (
                <div key={b.bindingId} className="flex items-center justify-between py-3 border-b last:border-b-0">
                  <div>
                    <div className="font-medium">{b.productName}</div>
                    <div className="text-sm text-muted-foreground">
                      ${((item?.unitPriceCents ?? b.priceCents) / 100).toFixed(2)}
                    </div>
                  </div>
                  <div className="w-32">
                    <Label className="sr-only">Size</Label>
                    <Select
                      value={item?.productVariantId ?? ""}
                      onValueChange={(variantId) => {
                        const v = b.variants.find((x) => x.id === variantId);
                        if (!v) return;
                        const next = {
                          items: value.items.filter((i) => i.programGearId !== b.bindingId),
                        };
                        next.items.push({
                          productVariantId: v.id,
                          programGearId: b.bindingId,
                          quantity: 1,
                          unitPriceCents: v.priceOverrideCents ?? b.priceCents,
                          capturedSize: v.size,
                          capturedColor: v.color,
                          category: "required",
                        });
                        onChange(next);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Size" /></SelectTrigger>
                      <SelectContent>
                        {b.variants.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.size}{v.color ? ` / ${v.color}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Optional */}
      {optional.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Add More Gear</CardTitle>
          </CardHeader>
          <CardContent>
            {/* For each optional binding, render product card with size picker + Add button.
                Multiple quantities allowed: clicking Add with the same size increments quantity. */}
            {/* Implement following the Required pattern above but with an explicit Add button. */}
          </CardContent>
        </Card>
      )}

      {pastCutoff && shippingFeeCents > 0 && (
        <p className="text-sm text-muted-foreground">
          Registration is after the gear cutoff — items will ship to your address.
          Shipping fee: ${(shippingFeeCents / 100).toFixed(2)}.
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">Total: ${(total / 100).toFixed(2)}</span>
        <div className="space-x-2">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={onNext} disabled={!canContinue}>Continue to Payment</Button>
        </div>
      </div>
    </div>
  );
}
```

Complete the optional gear block following the required pattern. For optional items, the shape of the state entry uses `category: "optional"` and supports multiple quantity increments.

- [ ] **Step 2: Integrate into wizard**

Open the registration wizard component. Insert GearStep after the waiver step. The wizard needs to:
- Detect if the season has any bindings (via `/api/registration/gear-options` — or check a `hasGear` field returned from earlier step data)
- If no bindings: skip the step entirely
- If bindings exist: render GearStep; advance only when `canContinue` is true
- Detect late-registrant condition: compare `now()` against `season.gearOrderCutoff`; pass `pastCutoff=true` when past

Pass `familyMember.sizing` from the step prior.

- [ ] **Step 3: Smoke test**

Dev server. Register a child for a season with required gear bindings:
- Confirm Gear step appears
- Confirm required item size auto-fills from family_member.sizing (seed a sizing value into the DB for testing)
- Confirm required item cannot be removed
- Confirm optional items can be added with quantities
- Confirm total updates live
- Confirm Continue is disabled if a required item has no size selected

- [ ] **Step 4: Commit**

```bash
git add src/components/registration/gear-step.tsx \
        src/components/registration/registration-wizard.tsx
git commit -m "feat(gear): registration wizard gear step"
```

---

## Task 9: Stripe payment intent — bundling gear into single charge

**Files:**
- Create: `src/pages/api/registration/submit-with-gear.ts`
- Modify: the existing Stripe checkout creation endpoint (find by searching for `paymentIntents.create` or `checkout.sessions.create`)
- Modify: the Stripe webhook handler (`src/pages/api/stripe/webhook.ts` or similar) to persist `gear_orders` + `gear_order_items` + `payment_line_items` on `payment_intent.succeeded`

The current payment flow (from `BETA_LAUNCH_CHECKLIST.md`) creates a payment intent for the program fee. We need it to also accept gear items.

- [ ] **Step 1: Design the submission contract**

Endpoint body shape for `/api/registration/submit-with-gear` (or the existing registration submission endpoint extended):

```ts
{
  seasonId: string;
  familyMemberId: string;
  waiverSignedBy: string;
  gear: {
    items: GearStepValue["items"]; // from the wizard
    fulfillmentMethod: "pickup" | "ship";
    shippingAddress?: GearShippingAddress;
  };
}
```

Server responsibilities:
1. Validate season, family member, etc. (existing logic)
2. Resolve gear bindings + variants server-side (don't trust client prices)
3. Recompute every `unitPriceCents` from the DB (binding override → variant override → product base)
4. Recompute shipping fee if `fulfillmentMethod='ship'`
5. Sum totals; create Stripe payment intent with metadata:

```ts
{
  registrationDraftId: string; // the in-progress registration row
  lineItems: JSON.stringify([
    { type: "program_fee", amountCents: 15000, description: "Fall 2026 Season Fee" },
    { type: "gear_required", amountCents: 2500, refType: "gear_order_item_draft", refId: "<draftId>", description: "U10 Jersey YM" },
    { type: "shipping", amountCents: 500 },
  ])
}
```

- [ ] **Step 2: Write submission endpoint (or extension)**

Create `src/pages/api/registration/submit-with-gear.ts`:

- Validate body with zod
- Open a DB transaction
- Create `registration` row with `status='pending', paymentStatus='unpaid'`
- Create `gear_order` row with `status='pending', registrationId=<new>, fulfillmentMethod, shippingAddress`
- Create `gear_order_items` rows using server-resolved prices
- Sum all amounts; create Stripe payment intent with metadata including the line-item breakdown and IDs
- Return `{ clientSecret, paymentIntentId }`
- If any step fails, roll back the transaction

- [ ] **Step 3: Extend the webhook handler**

Find the Stripe webhook handler (search for `payment_intent.succeeded` case). On success:
- Extract metadata.lineItems (JSON-parse)
- Create `payment` row (existing behavior)
- Create one `payment_line_items` row per parsed line item, with `itemType`, `referenceType`, `referenceId`, `amountCents`, `description`
- For `gear_required` / `gear_addon` line items, set `referenceType='gear_order_item'` and `referenceId=<gearOrderItemId>` (the IDs were committed in step 2)
- Update the corresponding `gear_order.status`: if there's an open batch for its season+location, set `batchId` + `status='batched'`; otherwise leave `status='pending'`
- Update `family_members.sizing` with the captured sizes (merge with existing: `{...existing, top: newTop}`)

- [ ] **Step 4: Write integration tests**

`tests/api/registration/submit-with-gear.test.ts`:

Required cases:
- Valid submission with required gear → creates registration + gear_order + gear_order_items; returns clientSecret
- Price tampering — client submits $0 item; server recomputes and total reflects true price
- Missing shipping address when `fulfillmentMethod='ship'` — 400
- Late registrant (past cutoff) — shipping fee added automatically
- After Stripe webhook fires, `payment_line_items` created and `family_members.sizing` updated

Use Stripe's test mode utilities. If the repo has a stripe mocking pattern, follow it.

- [ ] **Step 5: Run tests + manual Stripe test card flow**

Run: `npm run test:api -- tests/api/registration/submit-with-gear.test.ts`
Start dev + stripe CLI webhook forwarding per `BETA_LAUNCH_CHECKLIST.md`.
Register with test card `4242 4242 4242 4242`; verify:
- `payments` row created
- `payment_line_items` rows exist with correct types
- `gear_orders.status` is `batched` if open batch exists, else `pending`
- `family_members.sizing` has the chosen sizes

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/registration/submit-with-gear.ts \
        src/pages/api/stripe/webhook.ts \
        tests/api/registration/submit-with-gear.test.ts
git commit -m "feat(gear): bundle gear into registration Stripe payment intent"
```

---

## Task 10: Post-registration "Order More Gear" flow

**Files:**
- Create: `src/components/dashboard/order-more-gear-button.tsx`
- Create: `src/pages/dashboard/gear/order/[registrationId].astro`
- Create: `src/pages/api/dashboard/gear/order.ts`
- Create: `tests/api/dashboard/gear-order.test.ts`
- Modify: dashboard components to surface the button

- [ ] **Step 1: Write failing tests**

Required cases:
- Authenticated parent can POST a new gear order for their own registration — 201
- Other parent cannot order against someone else's registration — 403
- Ship-to-home is forced (fulfillmentMethod='ship'); response includes clientSecret for a new payment intent
- Shipping address is required — 400 if missing
- Only products with `availablePostRegistration=true` or matching the program's bindings are accepted

- [ ] **Step 2: Implement the API**

`src/pages/api/dashboard/gear/order.ts`:

- Auth: require `context.locals.user`
- Ownership: registration must belong to the current user (`registration.registeredByUserId === user.id` or family_member parent relation)
- Build catalog: union of program_gear for the registration's season + org-level products with `availablePostRegistration=true`
- Validate each submitted item: variant active, product in allowed set, captured size matches variant
- Server-resolve prices + shipping
- Create gear_order with `fulfillmentMethod='ship'`, `status='pending'`, `batchId=null`, `registrationId=<existing>`
- Create gear_order_items
- Create a Stripe payment intent with `lineItems` metadata (gear_addon / shipping types)
- Return `{ clientSecret }`

Webhook reuses the existing `payment_line_items` creation logic from Task 9.

- [ ] **Step 3: Build the button component**

`src/components/dashboard/order-more-gear-button.tsx`: a `<Button>` that navigates to `/dashboard/gear/order/[registrationId]`.

- [ ] **Step 4: Build the ordering page**

`src/pages/dashboard/gear/order/[registrationId].astro`:
- Server-side: load registration (via db, ownership-scoped), season, location, external store config
- Pass props to a React component that:
  - Fetches catalog via API
  - Renders product cards with size picker
  - Captures shipping address (prefill from last order's address if any)
  - Shows subtotal + shipping + total
  - On submit, posts to `/api/dashboard/gear/order`, initiates Stripe confirmation flow

Use the existing payment confirmation UI (look at how the registration wizard handles Stripe confirmation today — reuse that component).

- [ ] **Step 5: Surface the button in parent dashboard**

Edit the component that renders per-kid sections in the dashboard (look for a card/list of registered children or registrations). Add the `OrderMoreGearButton` on each registered kid who has a `confirmed` registration.

- [ ] **Step 6: Smoke test**

Dev. Log in as a parent with a registered kid. Click "Order More Gear". Add a hoodie, enter shipping address, pay with test card. Confirm:
- New `gear_order` row with `fulfillmentMethod='ship'`, `registrationId=<reg>`
- New `payment` row
- `payment_line_items` with `gear_addon` + `shipping` types

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/order-more-gear-button.tsx \
        src/pages/dashboard/gear/ \
        src/pages/api/dashboard/gear/ \
        tests/api/dashboard/gear-order.test.ts
git commit -m "feat(gear): parent-facing order more gear flow"
```

---

## Task 11: Refund flow — extend to refund gear portion on cancellation

**Files:**
- Modify: existing refund endpoint (find via `src/pages/api/admin/refunds/` listing)

When a registration is cancelled and refunded before the batch is submitted (per spec §6.6), the gear portion must also be refunded and the `gear_order` cancelled.

- [ ] **Step 1: Identify existing refund logic**

Read `src/pages/api/admin/refunds/` files to find the refund handler. Note: the gear_orders table was created in this plan; existing refund logic has no knowledge of it.

- [ ] **Step 2: Extend refund handler**

When processing a registration refund:
- Look up `gear_orders` where `registrationId = <id>`
- If `gear_order.status in ('pending', 'batched')` (not yet ordered with supplier):
  - Sum its `gear_order_items.unitPriceCents * quantity` + any `shipping` line items
  - Refund that amount via Stripe alongside the program fee portion
  - Set `gear_order.status = 'cancelled'` with a note
- If `gear_order.status in ('ordered', 'received', 'distributed', 'shipped')`:
  - Do NOT auto-refund gear
  - Leave `gear_order` as-is; admin manually refunds + notes

- [ ] **Step 3: Write tests**

Extend the refund test file with two new cases:
- Cancel before batch submitted → gear auto-refunded; `gear_order.status='cancelled'`
- Cancel after batch submitted → gear NOT refunded automatically; admin sees flag

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/refunds/ tests/api/admin/refunds.test.ts
git commit -m "feat(gear): refund gear portion when cancelling pre-batch"
```

---

## Task 12: Plan 2 wrap-up

- [ ] **Step 1: Full test run**

Run: `npm run test:api`
Run: `npm run test`

- [ ] **Step 2: Manual end-to-end test**

- [ ] Register a child for a season with required gear → confirm registration + gear_order + payment_line_items
- [ ] Re-open parent dashboard → sizing auto-fills on a second kid registration
- [ ] Past-cutoff registration → shipping address captured, shipping fee added
- [ ] Click "Order More Gear" for an existing kid → ship-to-home flow
- [ ] Cancel a registration before batch submitted → gear refunded, gear_order cancelled

- [ ] **Step 3: Commit any final tweaks**

Plan 2 complete.

---

## Self-review notes

- All schema additions include necessary indexes (gear_orders lookup by registration_id, status).
- `batchId` column is created FK-less; Plan 3 adds the FK constraint when `gear_batches` exists. Noted as a cross-plan handoff.
- Price computation is server-side only — no client-side price submission is trusted.
- Sizing auto-fill uses a category→sizing-key map, explicitly mapped in code.
- Post-registration flow always ships (never pickup) per spec.
- Webhook handler updates both `payment_line_items` and `family_members.sizing` atomically per event.
- One design concern carried forward: if multiple open batches exist for same location+season, Task 9 step 3 currently picks "any." Plan 3 blocks creation of duplicate open batches, so this becomes safe.
