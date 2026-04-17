# Plan 3 — Gear Batches, Supplier Workflow, and Pickup Tracking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the gear_batches table and admin-facing workflow for the full batch lifecycle (open → submitted → received → closed), supplier CSV export with margin reporting, and a mobile-first pickup confirmation screen accessible to admins and coaches.

**Architecture:** New Drizzle schema `gear-batches.ts`; add FK constraint linking `gear_orders.batchId` → `gear_batches.id`. New admin pages under `/admin/gear/batches`. CSV export is server-rendered via a new endpoint. Pickup tracking is a React component with team filtering. Coach scoping reuses existing `userOrganizationAccess` patterns.

**Tech Stack:** Astro 5, React 19, Drizzle, Postgres, Vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-04-17-merchandise-gear-distribution-design.md` §4.4, §6, §7.

**Prerequisites:** Plans 1 + 2 complete.

---

## File structure

New files:
- `src/lib/db/schema/gear-batches.ts`
- `src/pages/api/admin/gear/batches.ts` — list + create
- `src/pages/api/admin/gear/batches/[id].ts` — detail, update, submit, receive, close
- `src/pages/api/admin/gear/batches/[id]/export.ts` — CSV export
- `src/pages/api/admin/gear/orders/unbatched.ts` — list orders with `batchId=null`
- `src/pages/api/admin/gear/orders/[id]/assign-batch.ts` — PATCH to set batch
- `src/pages/api/admin/gear/orders/[id]/pickup.ts` — PATCH to confirm pickup
- `src/components/admin/gear-batches-list.tsx`
- `src/components/admin/gear-batch-detail.tsx`
- `src/components/admin/gear-batch-distribute.tsx` — pickup screen
- `src/components/admin/gear-unbatched-orders.tsx`
- `src/pages/admin/gear/batches.astro`
- `src/pages/admin/gear/batches/[id].astro`
- `src/pages/admin/gear/batches/[id]/distribute.astro`
- `src/pages/admin/gear/orders.astro` — unbatched orders view
- `src/pages/coach/gear/[teamId].astro` — coach-scoped pickup view
- Tests for each endpoint under `tests/api/admin/gear/`

Files modified:
- `src/lib/db/schema/gear-orders.ts` — add FK constraint on `batchId` (via migration)
- `src/lib/db/schema/index.ts` — export gear-batches
- `src/components/admin/admin-layout.tsx` — add "Batches" sub-link under Gear
- `src/pages/admin/gear/index.astro` — link to batches + unbatched orders

---

## Task 1: Schema — gear_batches

**Files:**
- Create: `src/lib/db/schema/gear-batches.ts`
- Modify: `src/lib/db/schema/index.ts`

- [ ] **Step 1: Write schema**

```ts
import { pgTable, uuid, varchar, text, timestamp, integer, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, locations } from "./organizations";
import { seasons } from "./programs";

export const gearBatchStatusEnum = pgEnum("gear_batch_status", [
  "open", "submitted", "received", "closed", "cancelled",
]);

export const gearBatches = pgTable("gear_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "restrict" }),
  seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  supplierName: varchar("supplier_name", { length: 255 }),
  poReference: varchar("po_reference", { length: 100 }),
  status: gearBatchStatusEnum("status").default("open").notNull(),
  supplierCostCents: integer("supplier_cost_cents"),
  shippingCostCents: integer("shipping_cost_cents"),
  submitDueDate: timestamp("submit_due_date"),
  receivedDueDate: timestamp("received_due_date"),
  distributeDueDate: timestamp("distribute_due_date"),
  submittedAt: timestamp("submitted_at"),
  receivedAt: timestamp("received_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  locationSeasonIdx: index("idx_gear_batches_location_season").on(table.locationId, table.seasonId),
  statusIdx: index("idx_gear_batches_status").on(table.status),
}));

export const gearBatchesRelations = relations(gearBatches, ({ one }) => ({
  organization: one(organizations, { fields: [gearBatches.organizationId], references: [organizations.id] }),
  location: one(locations, { fields: [gearBatches.locationId], references: [locations.id] }),
  season: one(seasons, { fields: [gearBatches.seasonId], references: [seasons.id] }),
}));

export type GearBatch = typeof gearBatches.$inferSelect;
export type NewGearBatch = typeof gearBatches.$inferInsert;
```

- [ ] **Step 2: Export and migrate**

Append to schema index:
```ts
export * from "./gear-batches";
```

Run: `npm run db:generate`. Inspect the generated migration. Add a manual SQL addendum in the same migration file to attach the FK constraint from `gear_orders.batch_id` to `gear_batches.id`:

```sql
ALTER TABLE "gear_orders"
  ADD CONSTRAINT "gear_orders_batch_id_gear_batches_id_fk"
  FOREIGN KEY ("batch_id") REFERENCES "gear_batches"("id") ON DELETE SET NULL;
```

Then edit `src/lib/db/schema/gear-orders.ts`: replace the bare `batchId: uuid("batch_id")` with `batchId: uuid("batch_id").references(() => gearBatches.id, { onDelete: "set null" })` and import `gearBatches` at the top. This keeps the application schema in sync with the DB.

Run: `npm run db:push` (or `npm run db:migrate` — use whichever is the repo's standard for applying manual migrations).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema/gear-batches.ts \
        src/lib/db/schema/gear-orders.ts \
        src/lib/db/schema/index.ts \
        src/lib/db/migrations/
git commit -m "feat(gear): gear_batches schema + batch FK on gear_orders"
```

---

## Task 2: API — batches list + create with uniqueness guard

**Files:**
- Create: `src/pages/api/admin/gear/batches.ts`
- Create: `tests/api/admin/gear/batches.test.ts`

Constraint: only one `open` batch per (locationId, seasonId) can exist at a time. Enforced at the application layer (rather than DB partial unique index, because `seasonId` can be null in rare cases).

- [ ] **Step 1: Write failing tests**

Required cases:
- POST creates a batch (201) with status='open'
- POST rejects a second open batch for same location+season (409)
- POST with no seasonId allowed (org-wide misc batch) — same location-only guard still applies
- GET lists batches, filter by status query param, paginated or not (match existing admin list patterns)
- Cross-org ownership rejected

- [ ] **Step 2: Implement endpoint**

Patterns: follow `src/pages/api/admin/sports.ts`. Key differences:
- Validate `locationId` belongs to caller's org
- Before insert, query for `gearBatches` where `(locationId=?, seasonId=?, status='open')`; if found, return 409 "An open batch already exists for this location and season"
- Required fields: `locationId`, `name`. Optional: `seasonId`, `supplierName`, `poReference`, due dates, notes

- [ ] **Step 3: Run tests — pass**

Run: `npm run test:api -- tests/api/admin/gear/batches.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/gear/batches.ts tests/api/admin/gear/batches.test.ts
git commit -m "feat(gear): batches list + create API with open-batch guard"
```

---

## Task 3: API — batch detail + lifecycle transitions

**Files:**
- Create: `src/pages/api/admin/gear/batches/[id].ts`
- Create: `tests/api/admin/gear/batches-detail.test.ts`

- [ ] **Step 1: Write failing tests**

Required cases:
- GET returns batch + aggregated order summary (order count, total units, total revenue, supplier cost, margin)
- PATCH with `{ action: "submit", supplierCostCents, shippingCostCents, poReference, supplierName }` → status=submitted, submittedAt set, child gear_orders.status updated to 'ordered'
- PATCH `{ action: "receive" }` → status=received, receivedAt set, child gear_orders.status='received'
- PATCH `{ action: "close" }` → status=closed (only if all child orders are distributed/shipped/cancelled)
- PATCH `{ action: "close" }` on batch with undistributed orders → 400
- PATCH arbitrary mutable fields (name, notes, due dates) when status='open' → 200
- PATCH mutable fields when status='submitted' → only allowed for certain fields (notes, poReference); 400 otherwise
- Ownership scoping

- [ ] **Step 2: Implement endpoint**

Use a state-machine style handler. A single `action` field in the body determines the transition; absence of `action` is a plain field update.

```ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { gearBatches, gearOrders, locations } from "@/lib/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

// zod schemas for each action:
const submitSchema = z.object({
  action: z.literal("submit"),
  supplierCostCents: z.number().int().min(0),
  shippingCostCents: z.number().int().min(0).optional(),
  supplierName: z.string().min(1),
  poReference: z.string().optional(),
});
const receiveSchema = z.object({ action: z.literal("receive") });
const closeSchema = z.object({ action: z.literal("close") });
const updateSchema = z.object({
  name: z.string().optional(),
  notes: z.string().optional(),
  supplierName: z.string().optional(),
  poReference: z.string().optional(),
  submitDueDate: z.string().datetime().nullable().optional(),
  receivedDueDate: z.string().datetime().nullable().optional(),
  distributeDueDate: z.string().datetime().nullable().optional(),
});

// PATCH: parse action first, route to handler
```

GET: return batch + aggregates:
- `orderCount = count(gear_orders where batchId=...)`
- `unitCount = sum(gear_order_items.quantity) across those orders`
- `revenueCents = sum(payment_line_items.amountCents where itemType in ('gear_required','gear_addon') AND referenceType='gear_order_item' AND referenceId in <items>)`
- `supplierCostCents` + `shippingCostCents` from the batch row itself
- `marginCents = revenueCents - supplierCostCents - shippingCostCents`

For `submit` transition: update `gear_batches.status='submitted'`, `submittedAt=now()`, store costs. Update all `gear_orders where batchId=<id> AND status='batched'` to `status='ordered'`.

For `receive`: similar, move orders from `ordered` → `received`.

For `close`: check all child orders; if any are in `received` (not yet distributed/shipped), return 400.

- [ ] **Step 3: Run tests — pass**

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/gear/batches/\[id\].ts tests/api/admin/gear/batches-detail.test.ts
git commit -m "feat(gear): batch detail + lifecycle transitions API"
```

---

## Task 4: API — supplier CSV export

**Files:**
- Create: `src/pages/api/admin/gear/batches/[id]/export.ts`
- Create: `tests/api/admin/gear/batches-export.test.ts`

- [ ] **Step 1: Write failing tests**

Required cases:
- GET returns text/csv with correct headers
- First rows are a cover block (batch metadata)
- Subsequent rows aggregate by product+variant (not per gear_order_item)
- Each row columns: `Product Name | SKU | Size | Color | Quantity | Unit Cost | Line Total | Sponsor Logo URL | Notes`
- Requires admin auth + ownership

- [ ] **Step 2: Implement endpoint**

Query:
```sql
SELECT
  p.name AS product_name,
  pv.sku,
  goi.captured_size AS size,
  goi.captured_color AS color,
  SUM(goi.quantity) AS qty,
  -- unit_cost not in DB — supplier enters at submit time; use 0 for v1
  MAX(goi.unit_price_cents) AS unit_price_cents
FROM gear_order_items goi
JOIN product_variants pv ON pv.id = goi.product_variant_id
JOIN products p ON p.id = pv.product_id
JOIN gear_orders go ON go.id = goi.gear_order_id
WHERE go.batch_id = $1
GROUP BY p.id, p.name, pv.sku, goi.captured_size, goi.captured_color
ORDER BY p.name, goi.captured_size;
```

Write CSV (use plain string building; no third-party CSV lib required):

```ts
const lines: string[] = [];
lines.push(`Batch:,${batch.name}`);
lines.push(`PO:,${batch.poReference ?? ""}`);
lines.push(`Supplier:,${batch.supplierName ?? ""}`);
lines.push(`Ship to:,${shipToString}`);
lines.push("");
lines.push("Product Name,SKU,Size,Color,Quantity,Unit Price (cents),Line Total (cents),Sponsor Logo URL,Notes");
for (const row of rows) {
  // Sponsor logo URL: Plan 4 populates. For Plan 3 leave empty string.
  const lineTotal = row.unit_price_cents * row.qty;
  lines.push([
    escapeCsv(row.product_name),
    escapeCsv(row.sku ?? ""),
    escapeCsv(row.size),
    escapeCsv(row.color ?? ""),
    row.qty,
    row.unit_price_cents,
    lineTotal,
    "", // sponsor logo URL
    "",
  ].join(","));
}

return new Response(lines.join("\n"), {
  status: 200,
  headers: {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="batch-${batch.id}.csv"`,
  },
});
```

Include a small `escapeCsv` helper that wraps fields containing `,` `"` or `\n` in double quotes and escapes inner quotes.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/gear/batches/\[id\]/export.ts \
        tests/api/admin/gear/batches-export.test.ts
git commit -m "feat(gear): supplier CSV export for batches"
```

---

## Task 5: API — unbatched orders + assignment

**Files:**
- Create: `src/pages/api/admin/gear/orders/unbatched.ts`
- Create: `src/pages/api/admin/gear/orders/[id]/assign-batch.ts`
- Create: `tests/api/admin/gear/unbatched.test.ts`

- [ ] **Step 1: Write failing tests**

Required cases:
- GET `/api/admin/gear/orders/unbatched` returns gear_orders with `batchId IS NULL` AND `status='pending'` for caller's org, with parent/kid names joined
- PATCH assigns a batch — sets `batchId`, `status='batched'`
- Cannot assign to a batch in `submitted` or later status
- Ownership checks

- [ ] **Step 2: Implement**

Unbatched list endpoint joins gear_orders → registrations → family_members for display. Supports optional `?locationId=...` filter.

Assign-batch endpoint: body is `{ batchId: string }`. Validates batch is `open` and belongs to caller's org. Updates gear_order: `batchId`, `status='batched'`. Returns the updated row.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/gear/orders/ \
        tests/api/admin/gear/unbatched.test.ts
git commit -m "feat(gear): unbatched orders list + batch assignment API"
```

---

## Task 6: API — pickup confirmation

**Files:**
- Create: `src/pages/api/admin/gear/orders/[id]/pickup.ts`
- Create: `tests/api/admin/gear/pickup.test.ts`

- [ ] **Step 1: Write failing tests**

Required cases:
- PATCH with `{ confirmed: true }` → sets `pickupConfirmedAt=now()`, `pickupConfirmedBy=currentUserId`, `status='distributed'`
- PATCH with `{ confirmed: false }` → clears timestamps, reverts status to `received`
- Admin can confirm any order in their org
- Coach with a matching team assignment can confirm orders for their team only
- Unauthorized user (e.g., parent) — 403
- Cannot confirm pickup on an order whose batch hasn't been received yet — 400

- [ ] **Step 2: Implement**

The handler needs a "can the caller confirm this order?" helper. The coach scope requires joining:
- gear_order → registration → family_member
- family_member → current team assignment (via existing rosters/teams tables)
- coach → teams coached (via `userOrganizationAccess` with role='coach')

Look at existing coach-scoped endpoints (e.g., `src/pages/api/coach/*`) to see how teams-I-coach queries are built; mirror the approach exactly.

Sketch:
```ts
async function canConfirm(orderId: string, user: { id: string; }, org: { id: string }): Promise<boolean> {
  // Full admin path (faster): check userOrganizationAccess role admin/manager/owner
  if (await isAdminForOrg(user.id, org.id)) return true;
  // Coach path: find the order's family member's team, check if user coaches it
  const team = await getFamilyMemberCurrentTeamForOrder(orderId);
  if (!team) return false;
  return await userCoachesTeam(user.id, team.id);
}
```

Implement each helper using existing schema patterns — do not invent new tables.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/gear/orders/\[id\]/pickup.ts \
        tests/api/admin/gear/pickup.test.ts
git commit -m "feat(gear): pickup confirmation API with admin + coach scoping"
```

---

## Task 7: Admin batches list UI

**Files:**
- Create: `src/components/admin/gear-batches-list.tsx`
- Create: `src/pages/admin/gear/batches.astro`
- Modify: `src/pages/admin/gear/index.astro` — add link
- Modify: `src/components/admin/admin-layout.tsx` — add "Batches" sub-nav or keep single "Gear" top-nav

- [ ] **Step 1: Build the list component**

`src/components/admin/gear-batches-list.tsx`:

- Fetches `GET /api/admin/gear/batches?status=...`
- Table columns: Name, Location, Season, Status (badge), Order Count, Revenue, Supplier Cost, Margin, Due dates
- Filter by status (tabs or dropdown)
- Click-through to `/admin/gear/batches/[id]`
- "Create New Batch" button → dialog capturing name, locationId, seasonId, supplierName?, poReference?, due dates

Use shadcn Card/Table/Badge components following the pattern in `src/components/admin/programs-list.tsx` or similar.

- [ ] **Step 2: Smoke test**

Run: `npm run dev`
- Navigate to `/admin/gear/batches`
- Create a batch
- Confirm it appears with status='open'
- Attempt to create a second open batch for same location/season → 409 toast

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/gear-batches-list.tsx \
        src/pages/admin/gear/batches.astro \
        src/pages/admin/gear/index.astro \
        src/components/admin/admin-layout.tsx
git commit -m "feat(gear): admin batches list UI"
```

---

## Task 8: Admin batch detail UI

**Files:**
- Create: `src/components/admin/gear-batch-detail.tsx`
- Create: `src/pages/admin/gear/batches/[id].astro`

- [ ] **Step 1: Build detail component**

`src/components/admin/gear-batch-detail.tsx`:

Three sections:
1. **Batch info** — name, status (badge), supplier, PO, notes, due dates (editable when `status='open'`)
2. **Order roster** — table of all orders in batch: family member name, parent name, items (product + size + qty), status. Filterable by team. Includes link to distribute view.
3. **Supplier summary** — aggregated units by product/variant. Same data as the CSV export query. Plus supplier cost / shipping cost / revenue / margin display.
4. **Actions row** — buttons: Export CSV, Submit to Supplier (dialog captures supplierCost, shippingCost, supplier, PO), Mark Received, Close Batch, Cancel Batch

Match state machine rules:
- Submit button enabled only when `status='open'`
- Mark Received only when `status='submitted'`
- Close only when `status='received'` AND all child orders distributed/shipped/cancelled
- Edit fields only in `open` (most) or `submitted` (notes/poRef only)

CSV export = `window.location.href = '/api/admin/gear/batches/[id]/export'` (or use anchor with download attribute).

- [ ] **Step 2: Smoke test**

Dev. Create a batch, register a family with required gear (triggers gear_order auto-attach to batch if Plan 2 registration flow did this). Confirm batch detail shows the order. Submit to supplier with mocked costs. Confirm orders advance to 'ordered'. Download CSV; inspect contents.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/gear-batch-detail.tsx \
        src/pages/admin/gear/batches/\[id\].astro
git commit -m "feat(gear): admin batch detail UI with lifecycle actions"
```

---

## Task 9: Pickup confirmation UI (mobile-first)

**Files:**
- Create: `src/components/admin/gear-batch-distribute.tsx`
- Create: `src/pages/admin/gear/batches/[id]/distribute.astro`
- Create: `src/pages/coach/gear/[teamId].astro` — coach-scoped view

- [ ] **Step 1: Build the component**

`src/components/admin/gear-batch-distribute.tsx`:

- Props: `{ batchId: string; scope?: { teamId?: string } }` — when `scope.teamId` set, filter to that team only (coach usage)
- Fetch orders for the batch (admin) or the team (coach)
- Columns: family member name, parent name, team, items + sizes, status
- Per-row "Mark picked up" button calling `PATCH /api/admin/gear/orders/[id]/pickup`
- Bulk action: "Confirm entire team" — calls pickup for every row where `status='received'` in the filtered view
- Search input + team filter dropdown (admin only)
- Mobile layout: stack rows as cards with large tap targets; use shadcn patterns

- [ ] **Step 2: Wire admin page**

`src/pages/admin/gear/batches/[id]/distribute.astro`:
```astro
---
import AdminLayout from "@/layouts/AdminLayout.astro";
import { GearBatchDistribute } from "@/components/admin/gear-batch-distribute";
const { id } = Astro.params;
---
<AdminLayout title="Distribute Gear">
  <GearBatchDistribute client:load batchId={id} />
</AdminLayout>
```

- [ ] **Step 3: Wire coach page**

`src/pages/coach/gear/[teamId].astro`:

Server-side: load team, verify current user coaches it (mirror existing coach page patterns). Resolve the active batch for that team's location+season.

```astro
---
// (Full auth + team resolution following src/pages/coach/* patterns)
import { GearBatchDistribute } from "@/components/admin/gear-batch-distribute";
---
<Layout>
  <GearBatchDistribute client:load batchId={activeBatch.id} scope={{ teamId }} />
</Layout>
```

If no active batch for this team: render "No gear to distribute right now."

- [ ] **Step 4: Smoke test — phone viewport**

Dev. Chrome devtools → mobile viewport.
- As admin: `/admin/gear/batches/[id]/distribute` — tap to confirm an order, verify UI updates
- As coach (use a coach account): `/coach/gear/[teamId]` — confirm only own team's orders visible, confirm pickup works

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/gear-batch-distribute.tsx \
        src/pages/admin/gear/batches/\[id\]/distribute.astro \
        src/pages/coach/gear/\[teamId\].astro
git commit -m "feat(gear): mobile-first pickup confirmation for admins and coaches"
```

---

## Task 10: Unbatched orders admin UI

**Files:**
- Create: `src/components/admin/gear-unbatched-orders.tsx`
- Create: `src/pages/admin/gear/orders.astro`

- [ ] **Step 1: Build the component**

List all unbatched orders with ship-to-home indicator (late/supplemental) or pickup intent. For each row, a "Assign to batch" action dropdown listing open batches for that order's location+season, plus an option to "Create new batch."

- [ ] **Step 2: Smoke test**

Dev. Create an order without an open batch (e.g., register after closing the open batch for that season). Confirm it shows on `/admin/gear/orders`. Assign to a newly-created batch.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/gear-unbatched-orders.tsx \
        src/pages/admin/gear/orders.astro
git commit -m "feat(gear): unbatched orders admin view"
```

---

## Task 11: Plan 3 wrap-up

- [ ] **Step 1: Full test run**

Run: `npm run test:api`
Run: `npm run test`

- [ ] **Step 2: End-to-end manual walkthrough**

- [ ] Admin creates a batch for U10 Soccer Powell (status=open)
- [ ] Parent registers child with required jersey → gear_order auto-attaches to batch (status=batched)
- [ ] Admin submits batch → enters supplier cost → orders → status=ordered
- [ ] Export CSV → verify columns and totals
- [ ] Admin marks received → orders → status=received
- [ ] At distribute page (mobile viewport), tap to confirm pickup → orders → status=distributed
- [ ] Coach views `/coach/gear/[teamId]` → sees only their team's rows
- [ ] Close batch → status=closed
- [ ] Margin displayed correctly = revenue − supplier cost − shipping

- [ ] **Step 3: Commit any tweaks**

Plan 3 complete.

---

## Self-review notes

- `gear_orders.batchId` FK is added in Task 1 step 2 — must happen before any PATCH that sets `batchId` (order of Plan 2 task 9 → Plan 3 Task 1 must be respected in execution).
- Open-batch uniqueness enforced at application layer (Task 2) because seasonId is nullable.
- State machine transitions are explicit; invalid transitions return 400.
- Coach scoping reuses existing patterns; implementation must look at `src/pages/api/coach/*` before writing new logic.
- CSV export leaves "Sponsor Logo URL" column empty in Plan 3; Plan 4 populates it when sponsors exist.
