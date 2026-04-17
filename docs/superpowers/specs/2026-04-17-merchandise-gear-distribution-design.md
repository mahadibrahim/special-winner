# Merchandise, Gear Distribution, and Sponsor Plumbing — Design Spec

**Status:** Approved, ready for implementation planning
**Date:** 2026-04-17
**Author:** Brainstormed with Mahad via Claude

## 1. Summary

This spec defines the design for Aspire's first commerce layer: required gear distribution, optional add-on merchandise, an external spirit-wear store link-out, and the data plumbing for sponsors (without building a sponsor CRM).

**Guiding constraint:** Minimize cash outlay for the organization. Parent pays before supplier is paid; no inventory is held; no fulfillment labor is taken on that doesn't pay for itself.

**Framing constraint:** Gear and merchandise are marketing — branded items distributed widely, cheaply, and consistently, with sponsor logos as a native feature. The org treats branded-kids-in-the-field as walking advertising.

## 2. Scope

### In scope

- **Lane A — Required gear** (bundled into program fee): pre-order model with one manufacturer, batch order per location per season, distribute at first practice.
- **Lane B — Optional add-on merchandise** at checkout: bundled into the same batch order; parent checks boxes during registration.
- **Lane C — Standalone spirit-wear store**: link-out to a third-party hosted store (Squadlocker, BSN, Custom Ink). No commerce code in Aspire for v1.
- **Lane D — Sponsor plumbing**: full data model for sponsors and assignments; minimal admin UI exposing two placement types initially; sponsor revenue tracked as a separate stream.
- **Post-registration gear ordering**: parents can order additional gear after registration; defaults to ship-to-home.
- **Late-registrant path**: registrations created after a season's gear order cutoff are forced to ship-to-home.
- **Gear batch lifecycle** for admins: open → submitted → received → closed, with supplier cost capture for margin reporting.
- **Pickup tracking**: order-level pickup confirmation by admin or coach.
- **Gear reminders**: email-only for v1 via the existing email abstraction (`src/lib/email`), triggered by a daily scheduled job. Provider-agnostic — swap from Resend to Mailjet is tracked as a separate effort.

### Out of scope

- Inventory / stock counts (we don't stock)
- Shipment tracking, carrier APIs, label printing (v1 ship-to-home is manual; admin pastes tracking into notes)
- Exchanges and returns workflow (admin handles manually; schema leaves hooks for future)
- Sponsor CRM: deal pipeline, renewals, contract uploads, impression tracking, invoicing
- Generic task/reminder system with in-app admin surfaces (recommended as a separate follow-up spec; gear will use email only until then)
- Vector logo file handling (PNG/JPEG only in v1; some suppliers require AI/EPS — admin handles this out-of-band)
- Multi-sponsor-per-team logo layouts
- Email templates for "order more gear" post-registration promotion (note: future enhancement — data model ready)

## 3. Architecture

Four loosely coupled subsystems added to the existing Aspire codebase:

1. **Product Catalog** — org-level `products` and `product_variants`. Feeds both required-gear and optional-merch surfaces.
2. **Program/Season Gear Binding** — attaches products to programs or seasons with per-attachment pricing and required/optional flag.
3. **Gear Orders** — purchase records created alongside registrations or post-registration. Orders roll up into batches for supplier submission.
4. **Sponsors** — sponsors + polymorphic `sponsor_assignments` plus `sponsor_payments` for receivables tracking.

### Integration surface with existing system

- Registration wizard gets a new "Gear & Merch" step when any `program_gear` exists for the season, placed between the waiver step and payment.
- Payment intent at registration bundles program fee + gear line items into a single Stripe charge; backend writes a `payment_line_items` breakdown.
- Sizing lives as jsonb on existing `family_members` rows; auto-fills future purchases.
- New "Order More Gear" entry point on the parent dashboard, scoped per registered kid.
- Per-location `externalStoreUrl` configuration for the Lane C link-out, plumbed into parent and public surfaces.
- Admin section at `/admin/gear/*` for catalog, program bindings, batches, and distribution.
- Admin section at `/admin/sponsors` for sponsor CRUD, placements, and revenue tracking.

## 4. Data model

All tables are new unless noted. All IDs are `uuid` defaulted to `defaultRandom()`. All timestamps are `timestamp` with `defaultNow()`. Standard `createdAt`, `updatedAt` columns on every table unless noted.

### 4.1 Catalog

**`products`** — org-level catalog
```
id, organizationId (fk),
  name varchar(255), slug varchar(100), description text,
  category productCategoryEnum,
  basePriceCents integer,
  images jsonb,                    -- array of { url, alt, sortOrder }
  active boolean default true,
  sortOrder integer default 0,
  timestamps
unique(organizationId, slug)
```

`productCategoryEnum`: `jersey | shorts | socks | hoodie | t_shirt | hat | bag | accessory | other`

**`product_variants`** — size/color combinations of a product
```
id, productId (fk),
  sku varchar(100),
  size varchar(20),               -- 'YS', 'YM', 'YL', 'YXL', 'AS', 'AM', etc.
  color varchar(40),              -- nullable
  priceOverrideCents integer,     -- nullable, overrides product.basePriceCents
  active boolean default true,
  sortOrder integer default 0,
  timestamps
unique(productId, size, color)
```

### 4.2 Program gear binding

**`program_gear`** — attaches a product to a program or season
```
id, productId (fk),
  programId (fk, nullable),
  seasonId (fk, nullable),
  required boolean default false,
  priceCents integer,              -- nullable, overrides product/variant price for this program
  sortOrder integer default 0,
  timestamps
check (program_id IS NOT NULL OR season_id IS NOT NULL)
check (NOT (program_id IS NOT NULL AND season_id IS NOT NULL))
```

Season binding takes precedence when both exist at resolution time (a product is rarely bound to both, but if future admin UI allows it, season wins).

### 4.3 Family member sizing

Add to existing `family_members` table:
```
sizing jsonb,      -- { top?: string, bottom?: string, shoe?: string, hat?: string }
```
Populated on first order, updatable by parent in profile settings or at checkout. Used to pre-fill size selectors in the gear step.

### 4.4 Orders

**`gear_orders`**
```
id, organizationId (fk),
  userId (fk, parent who placed order),
  familyMemberId (fk, nullable),
  registrationId (fk, nullable),
  fulfillmentMethod fulfillmentMethodEnum default 'pickup',
  shippingAddress jsonb,           -- required when fulfillmentMethod='ship'; shape matches existing address pattern
  status gearOrderStatusEnum default 'pending',
  batchId (fk gear_batches, nullable),
  pickupConfirmedAt timestamp,
  pickupConfirmedBy uuid (fk users, nullable),
  notes text,
  timestamps
```

`fulfillmentMethodEnum`: `pickup | ship`
`gearOrderStatusEnum`: `pending | batched | ordered | received | distributed | shipped | cancelled`

**`gear_order_items`** — line items for a gear order
```
id, gearOrderId (fk),
  productVariantId (fk),
  programGearId (fk, nullable),   -- links back to the binding that surfaced this item
  quantity integer default 1,
  unitPriceCents integer,
  capturedSize varchar(20),
  capturedColor varchar(40),
  timestamps
```

Note: `sponsorOffsetCents` explicitly omitted — sponsors do not discount parent cost in this design.

**`gear_batches`**
```
id, organizationId (fk),
  locationId (fk),
  seasonId (fk, nullable),
  name varchar(255),
  supplierName varchar(255),
  poReference varchar(100),
  status gearBatchStatusEnum default 'open',
  supplierCostCents integer,       -- entered at submit
  shippingCostCents integer,       -- entered at submit or received
  submitDueDate timestamp,
  receivedDueDate timestamp,
  distributeDueDate timestamp,
  submittedAt timestamp,
  receivedAt timestamp,
  notes text,
  timestamps
```

`gearBatchStatusEnum`: `open | submitted | received | closed | cancelled`

### 4.5 Sponsors

**`sponsors`**
```
id, organizationId (fk),
  name varchar(255),
  slug varchar(100),
  logoUrl text,                    -- Cloudinary-hosted original
  website varchar(255),
  contactName varchar(200),
  contactEmail varchar(255),
  contactPhone varchar(20),
  tier varchar(40),                -- 'platinum', 'gold', etc. — free-form
  activeStartDate date,
  activeEndDate date,
  active boolean default true,
  notes text,
  timestamps
unique(organizationId, slug)
```

**`sponsor_assignments`** — polymorphic placements
```
id, sponsorId (fk),
  targetType sponsorTargetTypeEnum,
  targetId uuid,                   -- FK enforced at application layer, not DB
  placementType sponsorPlacementTypeEnum,
  activeStartDate date,
  activeEndDate date,
  displayOrder integer default 0,
  settings jsonb,                  -- see below
  timestamps
index(targetType, targetId, placementType)
```

`sponsorTargetTypeEnum`: `team | program | season | location | organization | product`
`sponsorPlacementTypeEnum`: `jersey_logo | website_badge | email_footer | program_brand | location_brand | product_logo | banner`

v1 admin UI surfaces only `jersey_logo` (for teams) and `website_badge` (for programs and locations). Other types are valid in the enum and can be inserted by direct DB access; their public-facing rendering is not built in v1.

**`sponsor_assignments.settings` jsonb shape** (documented, not enforced):
```ts
{
  feeAmountCents?: number;          // sponsor's committed fee for this placement
  feeCadence?: 'one_time' | 'per_season' | 'annual';
  feePeriodStart?: string;          // ISO date
  feePeriodEnd?: string;
  invoicedAt?: string;
  logoVariantKey?: string;          // future: which logo variant to use (dark/light)
  notes?: string;
}
```

**`sponsor_payments`** — actual receipts from sponsors
```
id, organizationId (fk),
  sponsorId (fk),
  sponsorAssignmentId (fk, nullable),
  amountCents integer,
  receivedAt timestamp,
  paymentMethod sponsorPaymentMethodEnum,
  reference varchar(100),          -- check #, ACH confirmation, etc.
  notes text,
  recordedBy uuid (fk users),
  createdAt timestamp
```

`sponsorPaymentMethodEnum`: `check | ach | stripe | other`

### 4.6 Payment line items

**`payment_line_items`** — breaks one Stripe charge into reportable components
```
id, paymentId (fk existing payments table),
  itemType paymentLineItemTypeEnum,
  referenceType varchar(50),        -- 'registration' | 'gear_order'
  referenceId uuid,
  amountCents integer,              -- negative for discount rows
  description varchar(255),
  timestamps
```

`paymentLineItemTypeEnum`: `program_fee | gear_required | gear_addon | shipping | discount`

Note: `sponsor_offset` is deliberately not a line item type. Sponsor money does not flow through parent charges.

### 4.7 Gear order cutoff on seasons

Add to existing `seasons` table:
```
gearOrderCutoff timestamp     -- nullable
```

Registrations created after this timestamp force `fulfillmentMethod='ship'` in the gear step.

## 5. Registration flow

Existing wizard: family member → season details → waiver → payment.

New step: **"Gear & Merch"** inserted after waiver, before payment. Only rendered when at least one `program_gear` row exists for the season (or program-level bindings visible to the season).

### 5.1 Required gear block

- Each required item renders with size auto-filled from `family_members.sizing[category]`
- Size dropdown shows only variants with `active=true` and matching category
- Cannot deselect required items
- Price contributes to running total

### 5.2 Add-on merch block

- Optional items render as product cards (image, name, short description, price)
- Parent adds to order by choosing size (and color if variants exist)
- Multiple quantities allowed (two hoodies, different sizes)
- Add/remove freely; these are optional

### 5.3 Sizing writeback

On successful payment, the backend updates `family_members.sizing` with any sizes chosen at checkout that differ from current. This auto-fills future purchases.

### 5.4 Fulfillment method at registration

- Default: `pickup` (no UI toggle shown)
- Force `ship` when `now() > season.gearOrderCutoff`:
  - Shipping address capture added to the step
  - Shipping fee line item added to the total
  - Show banner: "Registrations after [cutoff date] ship directly to you."

### 5.5 Payment bundling

On "Continue to payment," cart submits to Stripe with a single payment intent for `programFee + requiredGearTotal + addOnMerchTotal + shippingFee?`. On success:
- 1 `registration` row (existing flow)
- 1 `gear_order` row with `fulfillmentMethod='pickup'|'ship'`, `status='pending'`, `registrationId` set
- N `gear_order_items` rows
- 1 `payment` row (existing flow)
- N `payment_line_items` rows: `program_fee`, `gear_required` (one aggregated row or one per item — see implementation plan), `gear_addon`, `shipping` if applicable

If the season has an open batch for the current location, the `gear_order.batchId` is set on creation; `status` moves to `batched`. Otherwise `batchId=null` and status stays `pending` (admin creates a batch and attaches orders, or the order becomes a standalone post-cutoff order).

### 5.6 Post-registration ordering

Entry point: parent dashboard per registered kid — **"Order More Gear"** button.

Flow:
- Show catalog filtered to: that program's `program_gear` bindings + org-level products flagged `availablePostRegistration=true` (new optional boolean on `products`)
- Always ship-to-home (no pickup option after registration flow)
- Shipping address captured on the order (prefill from user's last-used shipping address, stored in `gear_orders.shippingAddress`)
- Shipping fee added as line item
- Creates a standalone `gear_order` with its own payment intent
- Order enters whichever batch admin routes it to, or is placed as a one-off with supplier

### 5.7 Validation rules

- Required gear cannot be skipped (blocks advance to payment)
- Size is required per item
- Shipping address is required when `fulfillmentMethod='ship'`
- If a product has no active variants in the chosen size, show out-of-stock copy with "contact admin" link

## 6. Batch order workflow (admin)

### 6.1 Batch lifecycle

```
  open ──► submitted ──► received ──► closed
     │
     └──► cancelled (rare)
```

- **open**: Admin creates the batch and ties it to a location + season. New pickup-method `gear_orders` created during registration auto-attach if their season matches.
- **submitted**: Admin hits "Submit to supplier." System:
  - Locks all attached orders
  - Records `submittedAt`, `supplierName`, `poReference`, `supplierCostCents`
  - Generates a CSV export grouped by product/variant with quantities
  - Moves all child orders to `status='ordered'`
- **received**: Admin marks received; all child orders move to `status='received'`; `receivedAt` stamped.
- **closed**: Admin closes after all orders are marked distributed, or auto-closes after a configurable window post-receipt.

### 6.2 Admin screens

- `/admin/gear/batches` — all batches for the current location, filterable by season and status
- `/admin/gear/batches/[id]` — detail page showing:
  - Order roster (parent, family member, items, size, status)
  - Supplier summary (aggregated quantities by product variant)
  - Actions: Export CSV, Submit to Supplier, Mark Received, Close Batch
  - Cost summary: total revenue (sum of line items for these orders) − supplier cost − shipping cost = margin
- `/admin/gear/batches/[id]/distribute` — pickup confirmation (see Section 7)

### 6.3 Supplier CSV format

```
Product Name | SKU | Size | Color | Quantity | Unit Cost | Line Total | Sponsor Logo URL | Notes
```

Plus a cover sheet:
- Batch name
- PO reference
- Ship-to address (location's)
- Submitted by (admin name, email)
- Any batch-level notes

### 6.4 Unbatched orders

Any `gear_order` with `batchId=null` shows on an "Unbatched Orders" admin screen. Admin assigns to an open batch or marks as needing one-off supplier placement.

### 6.5 Reporting

Per-batch:
- Revenue (sum of `payment_line_items.amountCents` for `gear_required` + `gear_addon` rows tied to this batch's orders)
- Supplier cost (`supplierCostCents`)
- Shipping cost (`shippingCostCents`)
- Margin = Revenue − Supplier cost − Shipping cost
- Units by product / variant

Per-season rollup: sum across batches.

Per-location season-over-season: trend view (later polish; primitives present).

### 6.6 Refund / cancellation path

- Registration cancelled **before** batch submitted: auto-cancel the `gear_order`, refund the gear portion as part of existing registration refund flow (extend refund logic to sum `payment_line_items` by type)
- Registration cancelled **after** batch submitted: gear order stays; admin manually refunds the gear portion if appropriate, notes action on the `gear_orders.notes` field. The ordered gear either donates to next season's spares or is noted as sunk cost. No automated pathway — admin judgment.

## 7. Pickup tracking

### 7.1 Distribution screen

`/admin/gear/batches/[batchId]/distribute`:
- Table of orders in the batch
- Columns: family member name, parent name, team (if assigned), items + sizes, status, action
- Filter by team (so coach can see only their team's orders)
- Search by name
- Row action: "Mark picked up" (one-click)
  - Sets `pickupConfirmedAt=now()`, `pickupConfirmedBy=currentUserId`
  - Moves `gear_order.status` to `distributed`
- Bulk action: "Confirm entire team picked up" for convenience at practice

### 7.2 Mobile-first

Must be phone-usable; distribution happens at the field. Use shadcn mobile-friendly table patterns already in the admin UI.

### 7.3 Coach access

Coaches already have `coach` role via `userOrganizationAccess`. Coaches can see and confirm pickups for their assigned teams via the same screen, scoped server-side.

### 7.4 Unclaimed gear

Orders in `received` status longer than 14 days after batch `receivedAt` trigger the "unclaimed" reminder email (see Section 10). Admin has a per-row "Reassign / Donate" action that sets `status='cancelled'` with an auto-filled note. Refund is admin's call via existing payment tools.

## 8. External standalone store (Lane C)

No commerce code in Aspire. Configuration-only.

### 8.1 Configuration

Add to `LocationSettings.externalStore?` and `OrganizationSettings.externalStore?` (existing jsonb fields — new shape, no schema migration):
```ts
{
  url: string;
  label: string;            // e.g., "Aspire Powell Team Store"
  partnerName: string;      // 'Squadlocker' | 'BSN' | 'Custom Ink' | 'Other'
}
```

Resolution order: location-level overrides org-level. If neither set, surfaces are hidden.

### 8.2 Parent-facing surfaces

- Parent dashboard: "Shop Team Gear" CTA card using configured label
- Program detail page (public and logged-in): sidebar CTA
- Public location landing page: "Shop" link in primary nav

### 8.3 Admin management

Org settings and location settings admin forms gain an "External Store" section with three fields: URL, Label, Partner Name. Existing forms extended, no new admin screen.

### 8.4 Revenue reconciliation

Deferred. Revenue share from Squadlocker-style partners is reconciled manually against partner reports until volume warrants API integration.

## 9. Sponsors

### 9.1 Admin surface

- `/admin/sponsors` — CRUD list, searchable. Columns: name, tier, active window, placement count, committed fees, status.
- `/admin/sponsors/[id]` — detail page with:
  - Basic info form (name, logo upload via Cloudinary, contact, tier, active window, notes)
  - Placements section — add/edit `sponsor_assignments` rows; v1 UI exposes only `jersey_logo` and `website_badge` placement types
  - Fees & Payments — shows committed (from assignment settings) vs. collected (from `sponsor_payments`); admin can record a new payment
  - Quick links to where the sponsor appears publicly

### 9.2 Placement types in v1 UI

- **`jersey_logo`** — target is a team; parent picker selects from current/upcoming season teams
- **`website_badge`** — target is a program or location; renders on public surfaces

Other enum values (`email_footer`, `program_brand`, `location_brand`, `product_logo`, `banner`) are data-model-ready but not surfaced in the v1 admin UI and have no v1 rendering. They can be inserted via DB for future work without migrations.

### 9.3 Public rendering

- Location landing page: "Our Sponsors" section listing active `website_badge` placements for that location + org-wide sponsors with `website_badge` placement on the org
- Program detail page: same treatment, filtered to sponsors with `website_badge` placement on the program (plus location and org fallbacks as styling allows)
- Team detail page: jersey sponsor logo shown

### 9.4 Sponsor money

Sponsor fees are **org revenue**, not a parent discount. Parent checkout is untouched.

- Commitment: stored in `sponsor_assignments.settings.feeAmountCents` + `feeCadence` + period dates
- Receipt: `sponsor_payments` rows record actual money received, with method/reference/notes
- Reporting: per-season and per-sponsor views show Committed, Collected, Outstanding

No invoicing module in v1 — admin handles invoices out of band and records the result in `sponsor_payments`.

### 9.5 Logo delivery to supplier

Admin-only workflow:
- Sponsor emails the logo to the admin
- Admin uploads to Aspire via existing Cloudinary-backed upload widget on the sponsor form (no new infrastructure)
- Supplier CSV export for batches with jersey sponsors includes a "Sponsor Logo URL" column per relevant line item
- Admin downloads the files or forwards URLs to the supplier manually

Vector (AI/EPS) file handling is deferred; PNG/JPEG only in v1.

## 10. Reminders and notifications

### 10.1 Scope

Email-only via the existing email abstraction in `src/lib/email/`. No in-app notification surface in v1. A generic task/reminder system is deferred to a separate spec.

**Provider note:** the email abstraction currently wraps Resend, but Mailjet is already configured at the business level and a swap is planned. This spec depends only on the abstraction, not on the underlying provider. Provider migration is tracked separately (see Future Work).

### 10.2 Triggers

A Netlify scheduled function runs daily and checks open batches + orders, sending emails to admins with appropriate permissions:

- **Batch `submitDueDate`**: 7 / 3 / 1 days out, plus on-day, plus overdue
- **Batch `receivedDueDate`** (after submit): 3 / 1 days out, plus overdue (warns supplier may be late)
- **Batch `distributeDueDate`** (after received): 3 / 1 days out, plus overdue
- **Unclaimed orders**: orders in `received` status > 14 days after batch `receivedAt` fire a per-batch digest email
- **Sponsor expiry**: active sponsor assignments with `activeEndDate` 30 / 14 / 7 days out fire a digest email

### 10.3 Recipients

All users with `manage_gear` permission (new) at the location level. Uses existing `userOrganizationAccess` with role `owner`, `admin`, or `manager` by default; admins can add `manage_gear` as an override.

### 10.4 Email templates

Existing React Email template infrastructure under `src/lib/email/templates/`. New templates:
- `gear-batch-due` (parameterized by milestone and days-out)
- `gear-orders-unclaimed` (digest)
- `sponsor-expiry-warning` (digest)

Email log entries written to the existing `email_logs` table. Note: `email_logs.resendMessageId` is named after the current provider; future provider migration should either rename it to `providerMessageId` or keep the name as vendor-agnostic legacy. Not a blocker for this spec.

## 11. Permissions

New permission key: `manage_gear`.

- Grants access to `/admin/gear/*`, `/admin/sponsors/*`
- Default: included in `owner`, `admin`, `manager` roles on `userOrganizationAccess`
- Coaches can access the distribution screen for their assigned teams only (scoped server-side without `manage_gear`)

## 12. Future work / follow-up specs

- **Generic task & reminder system** — the actual gap flagged during brainstorming. Admin-facing tasks, due dates, assignees, in-app surfaces, event-driven creation from subsystems (gear, seasons, payments, coaches). Gear email reminders in this spec are a temporary narrow replacement.
- **Post-registration gear email communications** — promo emails for optional add-on merch and season-end memorabilia.
- **Email provider migration (Resend → Mailjet)** — cross-cutting change to `src/lib/email/index.ts` replacing the Resend SDK with Mailjet. Touches the same abstraction used by gear reminders and all other transactional emails (registration confirmation, payment receipts, waitlist promotion, refund notifications). Out of scope for this spec but should land before or alongside gear reminders go live so both get the same mail path.
- **Shipment tracking / carrier integration** — only when ship-to-home volume warrants.
- **Exchange / return workflow** — proper refund and reorder flow for sizing mistakes.
- **Sponsor CRM** — deal pipeline, renewals, contracts, invoicing, impression/click tracking.
- **Vector logo file handling** — AI/EPS per-sponsor variants for supplier requirements.
- **Supplier API integrations** — direct-to-manufacturer order submission once partner is chosen.
- **Post-registration video / face-tagged media product** (separate doc: `docs/VIDEO_MEDIA_STRATEGY.md`) — shares the product-catalog and sponsor-placement infrastructure built here.
- **External-store revenue share ingestion** — pull partner reports or API for true rev-share reporting.

## 13. Open questions carried into the implementation plan

- Exact shape of `payment_line_items` for bundled gear: single aggregated `gear_required` row per order, or one row per item? Reporting wants per-item; simplicity wants aggregated. Resolve during implementation.
- Whether to model `availablePostRegistration` as a boolean on `products` or on `program_gear`. Leaning boolean on `products` with optional override on `program_gear`.
- Concrete schedule/cadence for the daily reminder cron (6am local per-org? single UTC run?). Implementation detail.
- Coach permission scope for pickup confirmation — confirm existing `coach` role has the right shape for `userOrganizationAccess` filtering, or whether a secondary team-assignment table is needed.
- Ship-to-home shipping fee — flat rate per location (configurable) vs. per-product shipping vs. real carrier rates. Recommend flat per-location for v1, stored in `LocationSettings.gearShippingFeeCents`.
- Ambiguity if multiple open batches exist for the same location + season: should registration-time orders attach to the most recent, or should creation of a second open batch be blocked while another is open? Recommend blocking a second open batch to prevent confusion.
