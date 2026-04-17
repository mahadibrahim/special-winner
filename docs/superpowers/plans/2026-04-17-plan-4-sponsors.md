# Plan 4 — Sponsor Plumbing, Admin UI, and Public Rendering

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the sponsor entity, polymorphic placement assignments, and receivables tracking. Ship admin CRUD with two v1-exposed placement types (`jersey_logo`, `website_badge`) and public rendering on website/team pages. Integrate sponsor logo URLs into the batch CSV export.

**Architecture:** New Drizzle schemas `sponsors.ts` covering `sponsors`, `sponsor_assignments`, `sponsor_payments`. Admin UI at `/admin/sponsors` mirroring existing CRUD patterns. Public surfaces (website badge on location/program landing pages; jersey logo on team detail) resolve via a small query helper. Logo upload uses existing Cloudinary integration. Plan 3's CSV export is extended to pull sponsor logos.

**Tech Stack:** Astro 5, React 19, Drizzle, Postgres, Cloudinary (existing), Vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-04-17-merchandise-gear-distribution-design.md` §4.5, §9.

**Prerequisites:** Plans 1 + 3 (for CSV integration). Plan 2 not strictly required, but sponsor tiering/placements reference teams/products which are already in place. Plan 4 can run concurrently with Plan 2 if team structure is established.

---

## File structure

New files:
- `src/lib/db/schema/sponsors.ts`
- `src/pages/api/admin/sponsors.ts` — list + create (uses Cloudinary upload)
- `src/pages/api/admin/sponsors/[id].ts` — detail, update, delete
- `src/pages/api/admin/sponsors/[id]/assignments.ts` — list + create assignments
- `src/pages/api/admin/sponsors/[id]/assignments/[assignmentId].ts` — update, delete
- `src/pages/api/admin/sponsors/[id]/payments.ts` — record payment (list + create)
- `src/pages/api/admin/sponsors/[id]/payments/[paymentId].ts` — delete
- `src/pages/api/admin/sponsors/[id]/logo.ts` — upload endpoint (thin wrapper around existing Cloudinary path)
- `src/pages/api/public/sponsors/by-target.ts` — public GET returning active sponsors for a (targetType, targetId, placementType)
- `src/components/admin/sponsors-list.tsx`
- `src/components/admin/sponsor-detail.tsx`
- `src/components/admin/sponsor-placements-manager.tsx`
- `src/components/admin/sponsor-payments-manager.tsx`
- `src/components/admin/sponsor-logo-uploader.tsx`
- `src/components/public/sponsor-badges.tsx` — renders sponsor list for program/location pages
- `src/components/public/jersey-sponsor.tsx` — renders sponsor on team pages
- `src/lib/sponsors/resolve.ts` — query helpers for active sponsors by target
- `src/pages/admin/sponsors.astro`
- `src/pages/admin/sponsors/[id].astro`
- Tests under `tests/api/admin/sponsors/` and `tests/lib/sponsors/`

Files modified:
- `src/lib/db/schema/index.ts` — export sponsors
- `src/components/admin/admin-layout.tsx` — add Sponsors nav entry
- `src/pages/programs/[slug].astro` (or the program public page) — embed `<SponsorBadges>`
- `src/pages/locations/[slug].astro` (or equivalent location landing page) — embed `<SponsorBadges>`
- Team detail public page (find existing `src/pages/teams/*` or equivalent) — embed `<JerseySponsor>`
- `src/pages/api/admin/gear/batches/[id]/export.ts` (Plan 3) — populate "Sponsor Logo URL" column

---

## Task 1: Schema — sponsors, sponsor_assignments, sponsor_payments

**Files:**
- Create: `src/lib/db/schema/sponsors.ts`
- Modify: `src/lib/db/schema/index.ts`

- [ ] **Step 1: Write schema**

```ts
import {
  pgTable, uuid, varchar, text, boolean, timestamp, integer, jsonb, pgEnum, unique, index, date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const sponsorTargetTypeEnum = pgEnum("sponsor_target_type", [
  "team", "program", "season", "location", "organization", "product",
]);

export const sponsorPlacementTypeEnum = pgEnum("sponsor_placement_type", [
  "jersey_logo", "website_badge", "email_footer",
  "program_brand", "location_brand", "product_logo", "banner",
]);

export const sponsorPaymentMethodEnum = pgEnum("sponsor_payment_method", [
  "check", "ach", "stripe", "other",
]);

export const sponsors = pgTable("sponsors", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  logoUrl: text("logo_url"),
  website: varchar("website", { length: 255 }),
  contactName: varchar("contact_name", { length: 200 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 20 }),
  tier: varchar("tier", { length: 40 }),
  activeStartDate: date("active_start_date"),
  activeEndDate: date("active_end_date"),
  active: boolean("active").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgSlug: unique().on(table.organizationId, table.slug),
  orgActiveIdx: index("idx_sponsors_org_active").on(table.organizationId, table.active),
}));

export const sponsorAssignments = pgTable("sponsor_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sponsorId: uuid("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "cascade" }),
  targetType: sponsorTargetTypeEnum("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  placementType: sponsorPlacementTypeEnum("placement_type").notNull(),
  activeStartDate: date("active_start_date"),
  activeEndDate: date("active_end_date"),
  displayOrder: integer("display_order").default(0).notNull(),
  settings: jsonb("settings").$type<SponsorAssignmentSettings>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  targetPlacementIdx: index("idx_sponsor_assignments_target_placement").on(
    table.targetType, table.targetId, table.placementType,
  ),
  sponsorIdx: index("idx_sponsor_assignments_sponsor").on(table.sponsorId),
}));

export const sponsorPayments = pgTable("sponsor_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  sponsorId: uuid("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "cascade" }),
  sponsorAssignmentId: uuid("sponsor_assignment_id").references(() => sponsorAssignments.id, { onDelete: "set null" }),
  amountCents: integer("amount_cents").notNull(),
  receivedAt: timestamp("received_at").notNull(),
  paymentMethod: sponsorPaymentMethodEnum("payment_method").notNull(),
  reference: varchar("reference", { length: 100 }),
  notes: text("notes"),
  recordedBy: uuid("recorded_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  sponsorIdx: index("idx_sponsor_payments_sponsor").on(table.sponsorId),
  orgIdx: index("idx_sponsor_payments_org").on(table.organizationId),
}));

export interface SponsorAssignmentSettings {
  feeAmountCents?: number;
  feeCadence?: "one_time" | "per_season" | "annual";
  feePeriodStart?: string;
  feePeriodEnd?: string;
  invoicedAt?: string;
  logoVariantKey?: string;
  notes?: string;
}

export const sponsorsRelations = relations(sponsors, ({ one, many }) => ({
  organization: one(organizations, { fields: [sponsors.organizationId], references: [organizations.id] }),
  assignments: many(sponsorAssignments),
  payments: many(sponsorPayments),
}));

export const sponsorAssignmentsRelations = relations(sponsorAssignments, ({ one }) => ({
  sponsor: one(sponsors, { fields: [sponsorAssignments.sponsorId], references: [sponsors.id] }),
}));

export const sponsorPaymentsRelations = relations(sponsorPayments, ({ one }) => ({
  sponsor: one(sponsors, { fields: [sponsorPayments.sponsorId], references: [sponsors.id] }),
  assignment: one(sponsorAssignments, { fields: [sponsorPayments.sponsorAssignmentId], references: [sponsorAssignments.id] }),
  recorder: one(users, { fields: [sponsorPayments.recordedBy], references: [users.id] }),
}));

export type Sponsor = typeof sponsors.$inferSelect;
export type NewSponsor = typeof sponsors.$inferInsert;
export type SponsorAssignment = typeof sponsorAssignments.$inferSelect;
export type NewSponsorAssignment = typeof sponsorAssignments.$inferInsert;
export type SponsorPayment = typeof sponsorPayments.$inferSelect;
export type NewSponsorPayment = typeof sponsorPayments.$inferInsert;
```

- [ ] **Step 2: Export from schema index**

```ts
export * from "./sponsors";
```

- [ ] **Step 3: Migrate**

Run: `npm run db:generate`
Run: `npm run db:push`
Verify with `npm run db:studio`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/sponsors.ts src/lib/db/schema/index.ts src/lib/db/migrations/
git commit -m "feat(sponsors): sponsors, assignments, and payments schema"
```

---

## Task 2: API — sponsors list + create + detail + update + delete

**Files:**
- Create: `src/pages/api/admin/sponsors.ts`
- Create: `src/pages/api/admin/sponsors/[id].ts`
- Create: `tests/api/admin/sponsors/sponsors.test.ts`

Follow the sports.ts CRUD pattern for boilerplate. Use `requireAdminAccess` + `requireOrganizationContext`.

- [ ] **Step 1: Write failing tests**

Required cases (similar to products.test.ts):
- POST creates a sponsor (201)
- Duplicate slug per org → 409
- Missing name → 400
- GET lists sponsors with filter support `?active=true`
- GET /[id] returns sponsor detail including `placements[]` (join on sponsor_assignments) and `payments[]`
- PUT updates sponsor fields
- DELETE removes sponsor (cascade removes assignments + payments)

- [ ] **Step 2: Implement endpoints**

Main list/create at `/api/admin/sponsors` — mirror `src/pages/api/admin/sports.ts` with extra fields.

Detail at `/api/admin/sponsors/[id]`:
- GET returns sponsor plus aggregated placement summary (count by placementType) + payment totals
- PUT updates mutable fields
- DELETE removes

Zod schema:

```ts
const sponsorSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  logoUrl: z.string().url().optional().nullable(),
  website: z.string().url().optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().max(20).optional().nullable(),
  tier: z.string().max(40).optional().nullable(),
  activeStartDate: z.string().date().optional().nullable(),
  activeEndDate: z.string().date().optional().nullable(),
  active: z.boolean().default(true),
  notes: z.string().optional().nullable(),
});
```

- [ ] **Step 3: Run tests — pass**

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/sponsors.ts \
        src/pages/api/admin/sponsors/\[id\].ts \
        tests/api/admin/sponsors/sponsors.test.ts
git commit -m "feat(sponsors): sponsor CRUD API"
```

---

## Task 3: API — sponsor assignments

**Files:**
- Create: `src/pages/api/admin/sponsors/[id]/assignments.ts`
- Create: `src/pages/api/admin/sponsors/[id]/assignments/[assignmentId].ts`
- Create: `tests/api/admin/sponsors/assignments.test.ts`

- [ ] **Step 1: Write failing tests**

Required cases:
- POST create assignment with (targetType='team', targetId=<teamId>, placementType='jersey_logo') — 201
- POST with targetId that doesn't exist in the target table → 400
- POST with (targetType='program', targetId=<programId>, placementType='website_badge') — 201
- POST targetType='location' + placementType='website_badge' — 201
- POST targetType='organization' + placementType='website_badge' — 201 (org-wide sponsors)
- Settings jsonb round-trips (including feeAmountCents, feeCadence, periods)
- GET lists all assignments for a sponsor
- PUT updates activeStart/End, displayOrder, settings
- DELETE removes

Target existence validation: given the targetType + targetId, run a lookup on the correct table (teams, programs, seasons, locations, organizations, products) with the caller's org scoping. 400 if not found or cross-org.

- [ ] **Step 2: Implement**

```ts
// Sketch of target validation
async function validateTarget(orgId: string, targetType: string, targetId: string): Promise<boolean> {
  switch (targetType) {
    case "team":
      return !!(await db
        .select({ id: teams.id })
        .from(teams)
        .innerJoin(seasons, eq(teams.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(and(eq(teams.id, targetId), eq(locations.organizationId, orgId)))).length;
    case "program":
      return !!(await db
        .select({ id: programs.id })
        .from(programs)
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(and(eq(programs.id, targetId), eq(locations.organizationId, orgId)))).length;
    case "season": /* ... */
    case "location":
      return !!(await db.select({ id: locations.id }).from(locations).where(and(eq(locations.id, targetId), eq(locations.organizationId, orgId)))).length;
    case "organization":
      return targetId === orgId;
    case "product":
      return !!(await db.select({ id: products.id }).from(products).where(and(eq(products.id, targetId), eq(products.organizationId, orgId)))).length;
    default: return false;
  }
}
```

Body:
```ts
const assignmentSchema = z.object({
  targetType: z.enum(["team","program","season","location","organization","product"]),
  targetId: z.string().uuid(),
  placementType: z.enum([
    "jersey_logo","website_badge","email_footer",
    "program_brand","location_brand","product_logo","banner",
  ]),
  activeStartDate: z.string().date().optional().nullable(),
  activeEndDate: z.string().date().optional().nullable(),
  displayOrder: z.number().int().default(0),
  settings: z.object({
    feeAmountCents: z.number().int().min(0).optional(),
    feeCadence: z.enum(["one_time","per_season","annual"]).optional(),
    feePeriodStart: z.string().date().optional(),
    feePeriodEnd: z.string().date().optional(),
    invoicedAt: z.string().date().optional(),
    logoVariantKey: z.string().optional(),
    notes: z.string().optional(),
  }).optional().nullable(),
});
```

- [ ] **Step 3: Run tests — pass**

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/sponsors/\[id\]/assignments* \
        tests/api/admin/sponsors/assignments.test.ts
git commit -m "feat(sponsors): sponsor assignments CRUD API"
```

---

## Task 4: API — sponsor payments

**Files:**
- Create: `src/pages/api/admin/sponsors/[id]/payments.ts`
- Create: `src/pages/api/admin/sponsors/[id]/payments/[paymentId].ts`
- Create: `tests/api/admin/sponsors/payments.test.ts`

- [ ] **Step 1: Write failing tests**

Required cases:
- POST creates a sponsor_payment (201); `recordedBy` auto-set to current user
- amountCents must be positive
- List returns payments for the sponsor, joined with assignment summary
- DELETE removes a specific payment
- Admin-only; 403 for non-admins
- Receivables summary: committed (sum of all assignments' settings.feeAmountCents) vs collected (sum of payments for the sponsor) — returned on sponsor detail GET (Task 2 already includes this; verify test passes with actual data)

- [ ] **Step 2: Implement**

Body:
```ts
const paymentSchema = z.object({
  sponsorAssignmentId: z.string().uuid().optional().nullable(),
  amountCents: z.number().int().min(1),
  receivedAt: z.string().datetime(),
  paymentMethod: z.enum(["check","ach","stripe","other"]),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
});
```

When inserting, set `recordedBy = auth.user.id`.

- [ ] **Step 3: Run tests — pass**

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/sponsors/\[id\]/payments* \
        tests/api/admin/sponsors/payments.test.ts
git commit -m "feat(sponsors): sponsor payments (receivables) API"
```

---

## Task 5: API — logo upload via Cloudinary

**Files:**
- Create: `src/pages/api/admin/sponsors/[id]/logo.ts`
- Create: `tests/api/admin/sponsors/logo.test.ts`

Aspire already has Cloudinary configured (see `BETA_LAUNCH_CHECKLIST.md`, `package.json` dependency). Look for an existing Cloudinary upload helper (search `src/` for `cloudinary`); if one exists, reuse it. If not, create a thin helper at `src/lib/cloudinary/upload.ts` using the `cloudinary` SDK.

- [ ] **Step 1: Write failing tests**

Required cases:
- POST with multipart form containing PNG file → 200, returns `{ logoUrl }`; also updates `sponsors.logoUrl`
- Rejects non-image content type → 400
- Admin auth required

- [ ] **Step 2: Implement**

Accept `multipart/form-data`. Upload stream to Cloudinary under folder `sponsors/<orgId>/<sponsorId>/`. Update `sponsors.logoUrl`. Return the URL.

If no existing Cloudinary helper exists:
```ts
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: import.meta.env.CLOUDINARY_CLOUD_NAME,
  api_key: import.meta.env.CLOUDINARY_API_KEY,
  api_secret: import.meta.env.CLOUDINARY_API_SECRET,
});

export async function uploadSponsorLogo(buffer: Buffer, orgId: string, sponsorId: string) {
  return new Promise<string>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: `sponsors/${orgId}/${sponsorId}`, resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result!.secure_url)),
    ).end(buffer);
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/sponsors/\[id\]/logo.ts \
        src/lib/cloudinary/ \
        tests/api/admin/sponsors/logo.test.ts
git commit -m "feat(sponsors): Cloudinary logo upload"
```

---

## Task 6: Sponsor resolver helpers (for public surfaces and CSV)

**Files:**
- Create: `src/lib/sponsors/resolve.ts`
- Create: `tests/lib/sponsors/resolve.test.ts`

- [ ] **Step 1: Write failing tests**

Required cases:
- `getActiveSponsorsForTarget({ targetType, targetId, placementType, asOf: Date })` returns sponsors whose activeStartDate ≤ asOf ≤ activeEndDate AND sponsor.active=true AND assignment.activeStartDate?/EndDate? windows match
- Falls back to sponsor's own active dates when assignment dates are null
- Orders by assignment.displayOrder ASC, then sponsor.name ASC
- `getJerseySponsorForTeam(teamId)` returns the first active team-jersey sponsor (or null)
- `getWebsiteBadgeSponsors({ locationId?, programId?, orgId })` returns a merged list: org-level + location-level (if locationId) + program-level (if programId), deduplicated by sponsor id, honoring displayOrder

- [ ] **Step 2: Implement**

```ts
import { getDb } from "@/lib/db";
import { sponsors, sponsorAssignments } from "@/lib/db/schema";
import { and, eq, or, isNull, sql } from "drizzle-orm";

export interface ResolvedSponsor {
  id: string;
  name: string;
  logoUrl: string | null;
  website: string | null;
  displayOrder: number;
  assignmentId: string;
  settings: any;
}

export async function getActiveSponsorsForTarget(args: {
  targetType: typeof sponsorAssignments.$inferSelect.targetType;
  targetId: string;
  placementType: typeof sponsorAssignments.$inferSelect.placementType;
  asOf?: Date;
}): Promise<ResolvedSponsor[]> {
  const asOf = args.asOf ?? new Date();
  const asOfDate = asOf.toISOString().slice(0, 10);

  const rows = await getDb()
    .select()
    .from(sponsorAssignments)
    .innerJoin(sponsors, eq(sponsorAssignments.sponsorId, sponsors.id))
    .where(and(
      eq(sponsorAssignments.targetType, args.targetType),
      eq(sponsorAssignments.targetId, args.targetId),
      eq(sponsorAssignments.placementType, args.placementType),
      eq(sponsors.active, true),
      or(isNull(sponsorAssignments.activeStartDate), sql`${sponsorAssignments.activeStartDate} <= ${asOfDate}`),
      or(isNull(sponsorAssignments.activeEndDate), sql`${sponsorAssignments.activeEndDate} >= ${asOfDate}`),
      or(isNull(sponsors.activeStartDate), sql`${sponsors.activeStartDate} <= ${asOfDate}`),
      or(isNull(sponsors.activeEndDate), sql`${sponsors.activeEndDate} >= ${asOfDate}`),
    ))
    .orderBy(sponsorAssignments.displayOrder, sponsors.name);

  return rows.map((r) => ({
    id: r.sponsors.id,
    name: r.sponsors.name,
    logoUrl: r.sponsors.logoUrl,
    website: r.sponsors.website,
    displayOrder: r.sponsor_assignments.displayOrder,
    assignmentId: r.sponsor_assignments.id,
    settings: r.sponsor_assignments.settings,
  }));
}

export async function getJerseySponsorForTeam(teamId: string): Promise<ResolvedSponsor | null> {
  const list = await getActiveSponsorsForTarget({ targetType: "team", targetId: teamId, placementType: "jersey_logo" });
  return list[0] ?? null;
}

export async function getWebsiteBadgeSponsors(args: { orgId: string; locationId?: string; programId?: string }): Promise<ResolvedSponsor[]> {
  const combos: Array<[string, string]> = [["organization", args.orgId]];
  if (args.locationId) combos.push(["location", args.locationId]);
  if (args.programId) combos.push(["program", args.programId]);

  const nested = await Promise.all(
    combos.map(([type, id]) =>
      getActiveSponsorsForTarget({ targetType: type as any, targetId: id, placementType: "website_badge" }),
    ),
  );
  const flat = nested.flat();
  // Dedupe by sponsor id, keep lowest displayOrder
  const map = new Map<string, ResolvedSponsor>();
  for (const s of flat) {
    const existing = map.get(s.id);
    if (!existing || s.displayOrder < existing.displayOrder) map.set(s.id, s);
  }
  return Array.from(map.values()).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}
```

- [ ] **Step 3: Run tests — pass**

- [ ] **Step 4: Commit**

```bash
git add src/lib/sponsors/ tests/lib/sponsors/
git commit -m "feat(sponsors): active sponsor resolver helpers"
```

---

## Task 7: Admin sponsors list + detail UI

**Files:**
- Create: `src/components/admin/sponsors-list.tsx`
- Create: `src/components/admin/sponsor-detail.tsx`
- Create: `src/components/admin/sponsor-placements-manager.tsx`
- Create: `src/components/admin/sponsor-payments-manager.tsx`
- Create: `src/components/admin/sponsor-logo-uploader.tsx`
- Create: `src/pages/admin/sponsors.astro`
- Create: `src/pages/admin/sponsors/[id].astro`
- Modify: `src/components/admin/admin-layout.tsx` — add "Sponsors" nav

- [ ] **Step 1: Sponsors list component**

`src/components/admin/sponsors-list.tsx` mirrors `sports-list.tsx`. Columns: name, logo thumbnail, tier, status (badge: active/inactive/expiring-soon), placement count, committed fees, collected. "Expiring soon" = `activeEndDate` within 30 days.

- [ ] **Step 2: Sponsor detail page**

`src/components/admin/sponsor-detail.tsx` structured as:
- Header: sponsor name, logo, status
- Tabs: "Info" | "Placements" | "Fees & Payments" | "Notes"
- Info tab: form (basic fields, logo uploader embedded)
- Placements tab: `<SponsorPlacementsManager sponsorId={id} />`
- Fees & Payments tab: `<SponsorPaymentsManager sponsorId={id} />`

- [ ] **Step 3: Placements manager**

`src/components/admin/sponsor-placements-manager.tsx`:
- Fetches assignments
- Table: placement type (badge), target (name + link), active dates, fee, display order, actions
- "Add placement" dialog:
  - Placement type dropdown — **v1 only shows `jersey_logo` and `website_badge`** (hide others in the UI even though API accepts them)
  - Target picker:
    - If `jersey_logo`: search across teams (current + upcoming seasons) — hit a new `/api/admin/sponsors/target-options?targetType=team&placementType=jersey_logo` helper endpoint (or reuse existing teams list)
    - If `website_badge`: tabs for Organization / Location / Program. Pick exactly one
  - Active dates (default to sponsor's active range)
  - Fee commitment: amountCents (as dollars) + cadence dropdown
  - Display order

- [ ] **Step 4: Payments manager**

`src/components/admin/sponsor-payments-manager.tsx`:
- Shows committed (from assignments) vs collected (from payments) at top
- Table of payments
- "Record Payment" dialog: amountCents (as dollars), receivedAt date, paymentMethod dropdown, reference, notes, optional linked assignment

- [ ] **Step 5: Logo uploader**

`src/components/admin/sponsor-logo-uploader.tsx`:
- File input accepting image/*
- On change, POST multipart to `/api/admin/sponsors/[id]/logo`
- Show uploaded logo preview
- Error toast on failure

- [ ] **Step 6: Admin nav**

Add a "Sponsors" entry in `admin-layout.tsx` with an appropriate icon.

- [ ] **Step 7: Pages**

`src/pages/admin/sponsors.astro` renders `<SponsorsList client:load />`.
`src/pages/admin/sponsors/[id].astro` loads sponsor server-side, renders `<SponsorDetail client:load sponsor={sponsor} />`.

- [ ] **Step 8: Smoke test**

Dev:
- Create a sponsor
- Upload a logo
- Add a jersey placement on a team
- Add a website_badge placement on a program
- Record a payment of $500 against a $1000 commitment
- Confirm detail page shows Committed: $1000, Collected: $500, Outstanding: $500

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/sponsor*.tsx \
        src/pages/admin/sponsors/ \
        src/pages/admin/sponsors.astro \
        src/components/admin/admin-layout.tsx
git commit -m "feat(sponsors): admin UI for sponsors, placements, payments"
```

---

## Task 8: Public rendering — website badges on programs and locations

**Files:**
- Create: `src/components/public/sponsor-badges.tsx`
- Create: `src/pages/api/public/sponsors/by-target.ts`
- Modify: program public page (find existing, e.g., `src/pages/programs/[slug].astro`)
- Modify: location public landing page

- [ ] **Step 1: Public API**

`src/pages/api/public/sponsors/by-target.ts`:
- No auth required (public)
- GET `?orgId=...&locationId=...&programId=...` returns active website_badge sponsors using `getWebsiteBadgeSponsors`
- Limit to orgs publicly resolvable via domain middleware
- Responds with `{ sponsors: [{ id, name, logoUrl, website, displayOrder }] }` (no internal fields leaked)

- [ ] **Step 2: Badge component**

`src/components/public/sponsor-badges.tsx`:
- Props: `{ sponsors: ResolvedSponsor[] }`
- Renders a responsive grid of logo+name tiles
- Each tile links to `sponsor.website` if set (rel="noopener noreferrer" target="_blank")
- Section heading "Our Sponsors"
- Hides section entirely if sponsors array is empty

- [ ] **Step 3: Embed on program public page**

Find the existing program public page file. Load sponsors server-side:

```astro
---
import { getWebsiteBadgeSponsors } from "@/lib/sponsors/resolve";
// ... resolve orgId, programId, locationId from URL/context
const sponsors = await getWebsiteBadgeSponsors({ orgId, locationId, programId });
---
<SponsorBadges sponsors={sponsors} />
```

- [ ] **Step 4: Embed on location landing page**

Same pattern; orgId + locationId only.

- [ ] **Step 5: Smoke test**

Dev: create a website_badge sponsor at program level, visit program page, confirm logo appears linked to sponsor website. Create another at location level; confirm both appear. Create one at org level; confirm it appears too (deduped if same sponsor).

- [ ] **Step 6: Commit**

```bash
git add src/components/public/sponsor-badges.tsx \
        src/pages/api/public/sponsors/by-target.ts \
        src/pages/programs/ src/pages/locations/
git commit -m "feat(sponsors): website_badge public rendering"
```

---

## Task 9: Public rendering — jersey sponsor on team pages

**Files:**
- Create: `src/components/public/jersey-sponsor.tsx`
- Modify: team detail page (search existing e.g. `src/pages/teams/[id].astro` or wherever team detail renders)

- [ ] **Step 1: Component**

```tsx
interface Props {
  sponsor: { id: string; name: string; logoUrl: string | null; website: string | null } | null;
}
export function JerseySponsor({ sponsor }: Props) {
  if (!sponsor?.logoUrl) return null;
  const content = (
    <div className="flex items-center gap-2 p-2 rounded bg-muted">
      <img src={sponsor.logoUrl} alt={sponsor.name} className="h-8 w-auto" />
      <span className="text-sm">Jersey sponsor: {sponsor.name}</span>
    </div>
  );
  if (sponsor.website) {
    return <a href={sponsor.website} target="_blank" rel="noopener noreferrer">{content}</a>;
  }
  return content;
}
```

- [ ] **Step 2: Embed on team page**

Server-side: `const jersey = await getJerseySponsorForTeam(teamId);`
Render: `<JerseySponsor sponsor={jersey} />`

- [ ] **Step 3: Smoke test**

Assign a jersey_logo sponsor to a team, visit team page, confirm logo appears.

- [ ] **Step 4: Commit**

```bash
git add src/components/public/jersey-sponsor.tsx \
        src/pages/teams/
git commit -m "feat(sponsors): jersey sponsor rendering on team pages"
```

---

## Task 10: CSV export — populate Sponsor Logo URL column

**Files:**
- Modify: `src/pages/api/admin/gear/batches/[id]/export.ts` (from Plan 3)
- Modify: `tests/api/admin/gear/batches-export.test.ts`

- [ ] **Step 1: Extend the CSV query**

For each line-item aggregate, look up whether the product's associated team(s) in this batch have an active jersey_logo sponsor. Since line items in a batch may span multiple teams, the "Sponsor Logo URL" should be populated per-team — meaning the CSV needs to expand back to per-order-item rows or carry multiple logos.

**Decision for v1 (simpler):** populate a comma-separated list of unique sponsor logo URLs for teams referenced by orders in this batch for each product row. Admin manually reconciles with the supplier.

Implementation:
```ts
// After aggregating rows, for each row look up teams associated with that product in orders within this batch:
//
// SELECT DISTINCT teams.id, teams.name
// FROM gear_orders go
// JOIN registrations r ON r.id = go.registration_id
// JOIN rosters ro ON ro.registration_id = r.id -- or equivalent — match existing rosters schema
// JOIN teams ON teams.id = ro.team_id
// JOIN gear_order_items goi ON goi.gear_order_id = go.id
// WHERE go.batch_id = $1 AND goi.product_variant_id IN (<row's variants>);
//
// Then for each team, look up active jersey_logo sponsor via getJerseySponsorForTeam.
// Concatenate unique logoUrls into the CSV column.
```

- [ ] **Step 2: Update the export test**

Extend `tests/api/admin/gear/batches-export.test.ts`:
- Create a team, assign a jersey_logo sponsor with known logoUrl
- Create orders in the batch belonging to that team
- Verify CSV row for the jersey product contains the sponsor's logoUrl

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/gear/batches/\[id\]/export.ts \
        tests/api/admin/gear/batches-export.test.ts
git commit -m "feat(sponsors): populate sponsor logo URL in batch CSV"
```

---

## Task 11: Plan 4 wrap-up

- [ ] **Step 1: Full test run**

Run: `npm run test:api`
Run: `npm run test`

- [ ] **Step 2: End-to-end manual walkthrough**

- [ ] Admin creates sponsor "Joe's Pizza," uploads logo
- [ ] Attaches jersey_logo to U10 Red team (Fall 2026)
- [ ] Attaches website_badge to a location
- [ ] Records a $500 payment against the jersey placement
- [ ] Public program page shows the location's website badge
- [ ] Public team page shows Joe's Pizza jersey sponsor
- [ ] Sponsor detail page shows Committed (from placement settings), Collected ($500), Outstanding
- [ ] Gear batch CSV export for a batch containing U10 Red jerseys includes Joe's Pizza logo URL in the jersey row

- [ ] **Step 3: Commit any final tweaks**

Plan 4 complete.

---

## Self-review notes

- Polymorphic `sponsor_assignments` supports all enum values, but admin UI only exposes `jersey_logo` + `website_badge` per v1 scope. Other enum values can be inserted via DB for future use.
- Public API (`/api/public/sponsors/by-target`) is intentionally narrow — returns only display-safe fields.
- Receivables are summed at read time from raw payments + assignment commitments; no denormalized aggregate columns. Fine at v1 volumes.
- Team targeting for CSV export is `DISTINCT teams` per batch — acceptable v1 approximation when one product may serve multiple teams.
- Sponsor money does not affect parent checkout (spec §9.4). No new `payment_line_items` type added.
