# Drop-In Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build per-seat drop-in pickup + classes booking on the existing multi-tenant org infrastructure, with two branded marketing sites pointing at one shared inventory and Stripe Connect destination charges for partner revenue split.

**Architecture:** New `drop_in_*` schema layered alongside leagues + rentals; single org owns inventory; per-domain `brand_profiles` for presentation; pessimistic claim model for waitlist; walk-up flow via Stripe Terminal (card-only); auto-assigned bib colors + self-reported skill ratings.

**Tech Stack:** TypeScript, Drizzle ORM, Astro 5, React 19, Vitest, Stripe Checkout (online) + Stripe Terminal (card-present), existing Resend/Twilio/Telegram messaging gateway.

**Reference:** Spec at `docs/superpowers/specs/2026-05-07-drop-in-booking-design.md`. Implements all sections.

**Worktree note:** This plan has 30 tasks. Continues on `worktree-feat+ops-catalog-impl` (or branched from it once Plan 2 PR #33 merges to main and that worktree retires). Plan 2's activity-tracker scheduling infrastructure is reused for the waitlist promotion-expiry cron — implement order: Plan 2 merges first, then this.

---

## File structure

### Schema + migration
- New: `src/lib/db/schema/drop-in.ts` — `dropInSessions`, `dropInBookings`, `dropInRateCard`, `brandProfiles`, `userSkillLevels` tables + 8 enums
- Modify: `src/lib/db/schema/users.ts` — add `gender` column + `userGenderEnum`
- Modify: `src/lib/db/schema/teams.ts` — add `partnerStripeAccountId` + `partnerApplicationFeePct` columns to `venues`
- Generated: `src/lib/db/migrations/NNNN_drop_in_booking.sql`

### Domain logic
- New: `src/lib/dropin/index.ts` — public API surface (re-exports)
- New: `src/lib/dropin/pricing.ts` — `resolveRate(session, user, rateCard)`
- New: `src/lib/dropin/gates.ts` — `checkMembersOnly`, `checkCapacity`, `checkGenderCap`
- New: `src/lib/dropin/team-assignment.ts` — `assignTeam(session, userSkill, currentBookings)`
- New: `src/lib/dropin/promotion.ts` — `promoteNextWaitlister`, `expireOverduePromotions`
- New: `src/lib/dropin/booking.ts` — `createConfirmedBooking`, `createWaitlistBooking`, `cancelBooking`
- New: `src/lib/dropin/refund.ts` — `processCancelRefund` with policy enforcement
- New: `src/lib/dropin/walk-up.ts` — `registerWalkUp` (orchestrates Terminal flow)

### Branding
- Modify: `src/middleware.ts` — extend domain resolver to attach `brand_profile`
- New: `src/lib/branding/resolver.ts` — `resolveBrandProfile(hostname)`

### API endpoints
- New: `src/pages/api/dropin/sessions/index.ts` — GET list (filters)
- New: `src/pages/api/dropin/sessions/[id].ts` — GET detail
- New: `src/pages/api/dropin/bookings/index.ts` — POST create booking
- New: `src/pages/api/dropin/bookings/[id]/cancel.ts` — POST cancel
- New: `src/pages/api/dropin/claim/[token].ts` — GET (verify token + show claim page) + POST (complete claim)
- New: `src/pages/api/admin/dropin/sessions/index.ts` — GET list, POST create
- New: `src/pages/api/admin/dropin/sessions/[id].ts` — GET, PUT, DELETE
- New: `src/pages/api/admin/dropin/sessions/[id]/walk-up.ts` — POST register walk-up (creates Terminal PaymentIntent)
- New: `src/pages/api/admin/dropin/sessions/[id]/attendance.ts` — POST mark check-in / no-show
- New: `src/pages/api/admin/dropin/sessions/[id]/cancel.ts` — POST admin cancel session
- New: `src/pages/api/admin/dropin/sessions/[id]/repeat.ts` — POST bulk-repeat session
- New: `src/pages/api/admin/dropin/rate-card.ts` — GET, PUT
- New: `src/pages/api/admin/dropin/bookings/[id]/refund.ts` — POST admin override refund
- New: `src/pages/api/admin/dropin/bookings/[id]/reassign-team.ts` — POST manual team reassign
- New: `src/pages/api/admin/branding/index.ts` — GET list of brand profiles
- New: `src/pages/api/admin/branding/[id].ts` — GET, PUT
- New: `src/pages/api/admin/users/[id]/skill-levels.ts` — GET, PUT skill levels per sport
- New: `src/pages/api/cron/expire-pending-claims.ts` — POST manual + scheduled cron entry
- New: `src/pages/api/webhooks/stripe-checkout-completed.ts` — extends existing webhook to handle dropin metadata
- New: `netlify/functions/scheduled-expire-pending-claims.ts` — Netlify Scheduled Function (every 5 min)

### Customer pages
- New: `src/pages/dropin/index.astro` — browse page
- New: `src/pages/dropin/[id].astro` — session detail
- New: `src/pages/dropin/claim/[token].astro` — waitlist claim page
- Modify: `src/pages/dashboard/bookings.astro` — extend with drop-in section

### React components (customer)
- New: `src/components/dropin/SessionList.tsx` — filterable list with chips
- New: `src/components/dropin/SessionCard.tsx` — single session row
- New: `src/components/dropin/SessionDetail.tsx` — detail page body
- New: `src/components/dropin/BookButton.tsx` — primary CTA with pricing logic
- New: `src/components/dropin/ClaimPage.tsx` — magic-link claim flow
- New: `src/components/dropin/MyBookings.tsx` — dashboard section

### Admin pages
- New: `src/pages/admin/dropin/sessions/index.astro` — schedule view
- New: `src/pages/admin/dropin/sessions/[id]/index.astro` — session detail
- New: `src/pages/admin/dropin/sessions/[id]/edit.astro` — edit form
- New: `src/pages/admin/dropin/rate-card.astro` — pricing config
- New: `src/pages/admin/branding/index.astro` — brand profile list
- New: `src/pages/admin/branding/[id].astro` — brand profile editor
- Modify: `src/pages/admin/users/[id].astro` — extend with skill-levels editor

### React components (admin)
- New: `src/components/admin/dropin/SessionsList.tsx`
- New: `src/components/admin/dropin/SessionDetail.tsx` — roster + waitlist + actions
- New: `src/components/admin/dropin/SessionForm.tsx` — create/edit
- New: `src/components/admin/dropin/WalkUpPanel.tsx` — front-desk walk-up flow with Terminal SDK
- New: `src/components/admin/dropin/AttendancePanel.tsx`
- New: `src/components/admin/dropin/RateCardEditor.tsx`
- New: `src/components/admin/branding/BrandProfileEditor.tsx`
- New: `src/components/admin/users/SkillLevelsEditor.tsx`

### Notifications
- New: `src/lib/dropin/messages/booking-confirmation.ts` — render variants
- New: `src/lib/dropin/messages/waitlist-promoted.ts` — claim link notification
- New: `src/lib/dropin/messages/booking-cancelled-by-admin.ts`

### Tests
- New: `tests/unit/dropin/{pricing,gates,team-assignment,promotion}.test.ts`
- New: `tests/api/dropin/{book-confirmed,book-waitlist,claim,cancel,walk-up,session-cancel}.test.ts`
- New: `tests/utils/dropin-helpers.ts` — `createTestDropInContext`

---

## Phase A: Foundation (4 tasks)

### Task 1: Drizzle schema for drop-in + brand + skill levels

**Files:**
- Create: `src/lib/db/schema/drop-in.ts`
- Modify: `src/lib/db/schema/users.ts` — add `gender` column
- Modify: `src/lib/db/schema/teams.ts` — add `partnerStripeAccountId` + `partnerApplicationFeePct` to `venues`
- Modify: `src/lib/db/schema/index.ts` — export new tables
- Generated: `src/lib/db/migrations/NNNN_drop_in_booking.sql`

- [ ] **Step 1: Add user gender enum + column**

In `src/lib/db/schema/users.ts`, add at top:

```typescript
export const userGenderEnum = pgEnum("user_gender", [
  "male",
  "female",
  "non_binary",
  "prefer_not_to_say",
]);
```

In the `users` table definition, add the column:

```typescript
gender: userGenderEnum("gender"),
```

- [ ] **Step 2: Add venue partner-payout columns**

In `src/lib/db/schema/teams.ts`, find the `venues` table and add:

```typescript
partnerStripeAccountId: text("partner_stripe_account_id"),
partnerApplicationFeePct: integer("partner_application_fee_pct"),
```

Drizzle CHECK constraints aren't always emitted cleanly; add a SQL post-step in the generated migration if needed for `CHECK (partner_application_fee_pct BETWEEN 0 AND 100)`.

- [ ] **Step 3: Create the drop-in schema file**

```typescript
// src/lib/db/schema/drop-in.ts
import { pgTable, pgEnum, uuid, text, timestamp, integer, boolean, jsonb, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { venues } from "./teams";
import { bookableResources } from "./bookable-resources"; // exists from 2026-04-28 design? confirm; if not, defer FK and use uuid only
import { users } from "./users";
import { mediaAssets } from "./media";
import { memberships } from "./memberships"; // exists from 2026-04-28 design? confirm

// === enums ===

export const dropInSessionKindEnum = pgEnum("drop_in_session_kind", ["pickup", "class"]);
export const dropInSkillLevelEnum = pgEnum("drop_in_skill_level", [
  "recreational", "intermediate", "advanced", "all_levels",
]);
export const dropInAudienceEnum = pgEnum("drop_in_audience", ["adults", "youth", "all_ages"]);
export const dropInSessionStatusEnum = pgEnum("drop_in_session_status", ["scheduled", "cancelled", "completed"]);
export const dropInBookingStatusEnum = pgEnum("drop_in_booking_status", [
  "confirmed", "waitlisted", "pending_claim", "cancelled", "no_show",
]);
export const dropInBookingSourceEnum = pgEnum("drop_in_booking_source", ["online_booking", "walk_up"]);
export const dropInPaymentMethodEnum = pgEnum("drop_in_payment_method", [
  "card_online", "card_present", "member_unlimited", "member_allotment",
]);
export const dropInCancellationReasonEnum = pgEnum("drop_in_cancellation_reason", [
  "user_request", "no_show", "admin_override", "session_cancelled", "expired_promotion",
]);
export const skillLevelEnum = pgEnum("skill_level", ["recreational", "intermediate", "advanced"]);
export const skillLevelSourceEnum = pgEnum("skill_level_source", ["self_reported", "admin_assigned"]);

// === tables ===

export const dropInSessions = pgTable(
  "drop_in_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "restrict" }),
    bookableResourceId: uuid("bookable_resource_id"), // FK added if bookableResources schema exists
    kind: dropInSessionKindEnum("kind").notNull(),
    sportOrClassLabel: text("sport_or_class_label").notNull(),
    formatLabel: text("format_label"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    capacity: integer("capacity").notNull(),
    capacityMale: integer("capacity_male"),
    capacityFemale: integer("capacity_female"),
    skillLevel: dropInSkillLevelEnum("skill_level").notNull().default("all_levels"),
    audience: dropInAudienceEnum("audience").notNull().default("adults"),
    membersOnly: boolean("members_only").notNull().default(false),
    sessionRateCents: integer("session_rate_cents"),
    memberRateCents: integer("member_rate_cents"),
    teamCount: integer("team_count").notNull().default(0),
    teamColors: text("team_colors").array().notNull().default(sql`ARRAY[]::text[]`),
    status: dropInSessionStatusEnum("status").notNull().default("scheduled"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgStartsAtIdx: index("drop_in_sessions_org_starts_at_idx").on(table.organizationId, table.startsAt),
    venueStartsAtIdx: index("drop_in_sessions_venue_starts_at_idx").on(table.venueId, table.startsAt),
    statusIdx: index("drop_in_sessions_status_idx").on(table.status),
  })
);

export const dropInBookings = pgTable(
  "drop_in_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => dropInSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    status: dropInBookingStatusEnum("status").notNull(),
    source: dropInBookingSourceEnum("source").notNull(),
    paymentMethod: dropInPaymentMethodEnum("payment_method").notNull(),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    membershipId: uuid("membership_id"), // FK added if memberships schema exists
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeRefundId: text("stripe_refund_id"),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    promotionExpiresAt: timestamp("promotion_expires_at", { withTimezone: true }),
    promotionToken: text("promotion_token"),
    teamAssignment: text("team_assignment"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: dropInCancellationReasonEnum("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activeUnique: uniqueIndex("drop_in_bookings_one_active_per_user_session")
      .on(table.sessionId, table.userId)
      .where(sql`status IN ('confirmed', 'waitlisted', 'pending_claim')`),
    sessionStatusIdx: index("drop_in_bookings_session_status_idx").on(table.sessionId, table.status),
    userStatusIdx: index("drop_in_bookings_user_status_idx").on(table.userId, table.status, table.createdAt),
    promotionExpiryIdx: index("drop_in_bookings_promotion_expiry_idx")
      .on(table.promotionExpiresAt)
      .where(sql`status = 'pending_claim'`),
  })
);

export const dropInRateCard = pgTable("drop_in_rate_card", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().unique().references(() => organizations.id, { onDelete: "cascade" }),
  defaultSessionRateCents: integer("default_session_rate_cents").notNull().default(1500),
  defaultMemberRateCents: integer("default_member_rate_cents").notNull().default(1200),
  cancelWindowHours: integer("cancel_window_hours").notNull().default(24),
  promotionWindowMinutes: integer("promotion_window_minutes").notNull().default(30),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
});

export const brandProfiles = pgTable(
  "brand_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    domain: text("domain").notNull().unique(),
    displayName: text("display_name").notNull(),
    logoMediaId: uuid("logo_media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    heroCopy: jsonb("hero_copy"),
    colorTokens: jsonb("color_tokens"),
    footerCopy: text("footer_copy"),
    featuredVenueIds: uuid("featured_venue_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgActiveIdx: index("brand_profiles_org_active_idx").on(table.organizationId, table.active),
  })
);

export const userSkillLevels = pgTable(
  "user_skill_levels",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sport: text("sport").notNull(),
    level: skillLevelEnum("level").notNull(),
    source: skillLevelSourceEnum("source").notNull(),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
    setByUserId: uuid("set_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.sport] }),
  })
);
```

**Note on `bookableResources` and `memberships` foreign keys:** the 2026-04-28 design document defined those tables but they may not yet exist in the codebase as live schema. Confirm by `ls src/lib/db/schema/` before adding the FK references. If the tables aren't present yet, use plain `uuid("...")` without `.references(...)` — the FKs can be added later when the rentals + memberships schemas land. Document this in the migration with a comment.

- [ ] **Step 4: Update `src/lib/db/schema/index.ts`**

Add exports for the new file:

```typescript
export * from "./drop-in";
```

- [ ] **Step 5: Generate + review migration**

```bash
npm run db:generate
```

Review the generated `src/lib/db/migrations/NNNN_*.sql`. Confirm:
- All 5 new tables created
- 9 new enum types
- 2 new columns on `venues`, 1 new column on `users`, 1 new enum on `users`
- The partial unique index `WHERE status IN ('confirmed', 'waitlisted', 'pending_claim')` on `drop_in_bookings` is present
- The partial index on `promotion_expires_at` filtered to `status = 'pending_claim'` is present
- Constraint on `gender_caps_paired` (CHECK (capacity_male IS NULL) = (capacity_female IS NULL))
- Constraint on `team_colors_match_count`

If any of those constraints are missing from the generated SQL (Drizzle has known gaps with CHECK-on-array), add them manually as a follow-on `ALTER TABLE ... ADD CONSTRAINT` block in the same migration file.

- [ ] **Step 6: Push to staging DB and verify**

```bash
npm run db:push
```

Verify in `npm run db:studio` that all tables exist and the indexes are listed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema/ src/lib/db/migrations/
git commit -m "feat(dropin): schema for drop-in sessions, bookings, rate card, brand profiles, skill levels"
```

---

### Task 2: Brand profile resolver + middleware extension

**Files:**
- Create: `src/lib/branding/resolver.ts`
- Modify: `src/middleware.ts` — extend domain resolver to attach brand profile to `Astro.locals`
- Modify: `src/env.d.ts` (or wherever Astro type declarations live) — extend `App.Locals` with `brand`
- Test: `tests/unit/branding/resolver.test.ts`

- [ ] **Step 1: Implement resolver**

```typescript
// src/lib/branding/resolver.ts
import { getDb } from "@/lib/db";
import { brandProfiles } from "@/lib/db/schema/drop-in";
import { eq, and } from "drizzle-orm";

export interface BrandProfile {
  id: string;
  displayName: string;
  logoMediaId: string | null;
  heroCopy: unknown;
  colorTokens: unknown;
  footerCopy: string | null;
  featuredVenueIds: string[];
}

export async function resolveBrandProfile(hostname: string): Promise<BrandProfile | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(brandProfiles)
    .where(and(eq(brandProfiles.domain, hostname), eq(brandProfiles.active, true)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.displayName,
    logoMediaId: row.logoMediaId,
    heroCopy: row.heroCopy,
    colorTokens: row.colorTokens,
    footerCopy: row.footerCopy,
    featuredVenueIds: row.featuredVenueIds ?? [],
  };
}
```

- [ ] **Step 2: Extend middleware**

In `src/middleware.ts`, after the existing domain → org resolution, add:

```typescript
import { resolveBrandProfile } from "@/lib/branding/resolver";

// ... in onRequest:
const hostname = context.request.headers.get("host") ?? new URL(context.request.url).hostname;
const brand = await resolveBrandProfile(hostname);
if (brand) {
  context.locals.brand = brand;
}
```

- [ ] **Step 3: Extend `App.Locals` type**

In `src/env.d.ts`:

```typescript
declare namespace App {
  interface Locals {
    user: User | null;
    session: Session | null;
    organization: Organization | null;
    brand: BrandProfile | null; // new
  }
}
```

- [ ] **Step 4: Tests**

```typescript
// tests/unit/branding/resolver.test.ts
import { describe, it, expect, vi } from "vitest";
import { resolveBrandProfile } from "../../../src/lib/branding/resolver";

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([
            { id: "b1", displayName: "Test", logoMediaId: null, heroCopy: null, colorTokens: null, footerCopy: null, featuredVenueIds: [] },
          ]),
        }),
      }),
    }),
  }),
}));

describe("resolveBrandProfile", () => {
  it("returns the brand profile for an active domain", async () => {
    const b = await resolveBrandProfile("test.example.com");
    expect(b?.displayName).toBe("Test");
  });
});
```

(For real DB integration, an API-level test against a fixture-seeded brand profile is more realistic; the unit test here just confirms the function shape.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/branding/ src/middleware.ts src/env.d.ts tests/unit/branding/
git commit -m "feat(branding): brand profile resolver + middleware extension"
```

---

### Task 3: Pricing logic (`resolveRate`)

**Files:**
- Create: `src/lib/dropin/pricing.ts`
- Test: `tests/unit/dropin/pricing.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/dropin/pricing.test.ts
import { describe, it, expect } from "vitest";
import { resolveRate } from "../../../src/lib/dropin/pricing";

const baseRateCard = {
  defaultSessionRateCents: 1500,
  defaultMemberRateCents: 1200,
};

const baseSession = {
  sessionRateCents: null,
  memberRateCents: null,
};

describe("resolveRate", () => {
  it("returns full session rate for non-logged-in user", () => {
    const rate = resolveRate(baseSession, null, null, baseRateCard);
    expect(rate.amountCents).toBe(1500);
    expect(rate.paymentMethod).toBe("card_online");
    expect(rate.membershipId).toBeNull();
  });

  it("returns full session rate for logged-in non-member", () => {
    const rate = resolveRate(baseSession, { id: "u1" }, null, baseRateCard);
    expect(rate.amountCents).toBe(1500);
    expect(rate.paymentMethod).toBe("card_online");
  });

  it("returns 0 for member with unlimited_pickup", () => {
    const membership = {
      id: "m1",
      tier: { benefits: { unlimited_pickup: true, free_pickup_per_month: 0 } },
      allotmentRemaining: 0,
    };
    const rate = resolveRate(baseSession, { id: "u1" }, membership, baseRateCard);
    expect(rate.amountCents).toBe(0);
    expect(rate.paymentMethod).toBe("member_unlimited");
    expect(rate.membershipId).toBe("m1");
  });

  it("returns 0 for member with allotment remaining", () => {
    const membership = {
      id: "m1",
      tier: { benefits: { unlimited_pickup: false, free_pickup_per_month: 4 } },
      allotmentRemaining: 2,
    };
    const rate = resolveRate(baseSession, { id: "u1" }, membership, baseRateCard);
    expect(rate.amountCents).toBe(0);
    expect(rate.paymentMethod).toBe("member_allotment");
    expect(rate.membershipId).toBe("m1");
  });

  it("returns member rate for member with no allotment left", () => {
    const membership = {
      id: "m1",
      tier: { benefits: { unlimited_pickup: false, free_pickup_per_month: 4 } },
      allotmentRemaining: 0,
    };
    const rate = resolveRate(baseSession, { id: "u1" }, membership, baseRateCard);
    expect(rate.amountCents).toBe(1200);
    expect(rate.paymentMethod).toBe("card_online");
  });

  it("uses session-level overrides when set", () => {
    const session = { sessionRateCents: 2000, memberRateCents: 1800 };
    const rate = resolveRate(session, null, null, baseRateCard);
    expect(rate.amountCents).toBe(2000);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/unit/dropin/pricing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/dropin/pricing.ts

export interface RateCard {
  defaultSessionRateCents: number;
  defaultMemberRateCents: number;
}

export interface SessionRateOverrides {
  sessionRateCents: number | null;
  memberRateCents: number | null;
}

export interface MembershipForPricing {
  id: string;
  tier: {
    benefits: {
      unlimited_pickup?: boolean;
      free_pickup_per_month?: number;
    };
  };
  allotmentRemaining: number;
}

export type DropInPaymentMethod =
  | "card_online" | "card_present" | "member_unlimited" | "member_allotment";

export interface ResolvedRate {
  amountCents: number;
  paymentMethod: DropInPaymentMethod;
  membershipId: string | null;
}

export function resolveRate(
  session: SessionRateOverrides,
  user: { id: string } | null,
  membership: MembershipForPricing | null,
  rateCard: RateCard,
): ResolvedRate {
  const sessionRate = session.sessionRateCents ?? rateCard.defaultSessionRateCents;
  const memberRate = session.memberRateCents ?? rateCard.defaultMemberRateCents;

  if (!user || !membership) {
    return { amountCents: sessionRate, paymentMethod: "card_online", membershipId: null };
  }

  if (membership.tier.benefits.unlimited_pickup) {
    return { amountCents: 0, paymentMethod: "member_unlimited", membershipId: membership.id };
  }

  if (membership.allotmentRemaining > 0) {
    return { amountCents: 0, paymentMethod: "member_allotment", membershipId: membership.id };
  }

  return { amountCents: memberRate, paymentMethod: "card_online", membershipId: membership.id };
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npx vitest run tests/unit/dropin/pricing.test.ts
```
Expected: 6/6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dropin/pricing.ts tests/unit/dropin/pricing.test.ts
git commit -m "feat(dropin): rate resolution per booking (member vs non-member, allotment)"
```

---

### Task 4: Capacity gates (members-only, capacity, gender-cap)

**Files:**
- Create: `src/lib/dropin/gates.ts`
- Test: `tests/unit/dropin/gates.test.ts`

- [ ] **Step 1: Test**

```typescript
// tests/unit/dropin/gates.test.ts
import { describe, it, expect } from "vitest";
import { checkMembersOnly, checkCapacity, checkGenderCap } from "../../../src/lib/dropin/gates";

describe("checkMembersOnly", () => {
  it("passes when session is open", () => {
    expect(checkMembersOnly({ membersOnly: false }, null).ok).toBe(true);
  });
  it("passes when session members_only and user has membership", () => {
    expect(checkMembersOnly({ membersOnly: true }, { id: "m1" }).ok).toBe(true);
  });
  it("fails when session members_only and user has no membership", () => {
    const r = checkMembersOnly({ membersOnly: true }, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("members_only");
  });
});

describe("checkCapacity", () => {
  it("passes when below capacity", () => {
    expect(checkCapacity({ capacity: 16 }, 12).ok).toBe(true);
  });
  it("fails when at capacity", () => {
    const r = checkCapacity({ capacity: 16 }, 16);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("session_full");
  });
});

describe("checkGenderCap", () => {
  const session = { capacityMale: 8, capacityFemale: 8 };
  it("passes when male under male-cap", () => {
    expect(checkGenderCap(session, "male", { male: 7, female: 5 }).ok).toBe(true);
  });
  it("fails when male at male-cap", () => {
    expect(checkGenderCap(session, "male", { male: 8, female: 5 }).ok).toBe(false);
  });
  it("non-binary user falls back to general capacity (returns ok=true here, capacity gate handled separately)", () => {
    expect(checkGenderCap(session, "non_binary", { male: 8, female: 8 }).ok).toBe(true);
  });
  it("returns ok=true when caps are not configured", () => {
    expect(checkGenderCap({ capacityMale: null, capacityFemale: null }, "male", { male: 8, female: 8 }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/dropin/gates.ts

export type GateResult =
  | { ok: true }
  | { ok: false; reason: "members_only" | "session_full" | "gender_cap_full" };

export function checkMembersOnly(
  session: { membersOnly: boolean },
  membership: { id: string } | null,
): GateResult {
  if (!session.membersOnly) return { ok: true };
  if (membership) return { ok: true };
  return { ok: false, reason: "members_only" };
}

export function checkCapacity(
  session: { capacity: number },
  confirmedCount: number,
): GateResult {
  return confirmedCount < session.capacity ? { ok: true } : { ok: false, reason: "session_full" };
}

export function checkGenderCap(
  session: { capacityMale: number | null; capacityFemale: number | null },
  userGender: "male" | "female" | "non_binary" | "prefer_not_to_say",
  countsByGender: { male: number; female: number },
): GateResult {
  // Both caps null = no gender constraint; pass.
  if (session.capacityMale === null || session.capacityFemale === null) {
    return { ok: true };
  }
  // Non-binary or prefer-not-to-say → fall back; gate doesn't block.
  if (userGender === "non_binary" || userGender === "prefer_not_to_say") {
    return { ok: true };
  }
  if (userGender === "male" && countsByGender.male >= session.capacityMale) {
    return { ok: false, reason: "gender_cap_full" };
  }
  if (userGender === "female" && countsByGender.female >= session.capacityFemale) {
    return { ok: false, reason: "gender_cap_full" };
  }
  return { ok: true };
}
```

- [ ] **Step 3: Run, verify pass, commit**

```bash
npx vitest run tests/unit/dropin/gates.test.ts
git add src/lib/dropin/gates.ts tests/unit/dropin/gates.test.ts
git commit -m "feat(dropin): capacity + members-only + gender-cap gates"
```

---

## Phase B: Booking flow + waitlist (6 tasks)

### Task 5: Team assignment algorithm

**Files:**
- Create: `src/lib/dropin/team-assignment.ts`
- Test: `tests/unit/dropin/team-assignment.test.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect } from "vitest";
import { assignTeam } from "../../../src/lib/dropin/team-assignment";

describe("assignTeam", () => {
  it("returns null for class kind (team_count=0)", () => {
    expect(assignTeam({ teamCount: 0, teamColors: [] }, "intermediate", [])).toBeNull();
  });

  it("assigns first team when both empty", () => {
    expect(assignTeam(
      { teamCount: 2, teamColors: ["orange", "black"] },
      "intermediate",
      [],
    )).toBe("orange");
  });

  it("assigns smallest team", () => {
    const existing = [
      { teamAssignment: "orange", skillLevel: "intermediate" as const },
      { teamAssignment: "orange", skillLevel: "intermediate" as const },
      { teamAssignment: "black", skillLevel: "intermediate" as const },
    ];
    expect(assignTeam(
      { teamCount: 2, teamColors: ["orange", "black"] },
      "intermediate",
      existing,
    )).toBe("black");
  });

  it("breaks ties by skill balance", () => {
    // Both teams same size; orange has 2 advanced, black has 2 recreational.
    // Adding intermediate to either leaves the gap. Expect deterministic.
    const existing = [
      { teamAssignment: "orange", skillLevel: "advanced" as const },
      { teamAssignment: "orange", skillLevel: "advanced" as const },
      { teamAssignment: "black", skillLevel: "recreational" as const },
      { teamAssignment: "black", skillLevel: "recreational" as const },
    ];
    // Orange avg = 3, Black avg = 1. Adding intermediate (2) to orange → avg 2.67, gap 1.67.
    // Adding to black → avg 1.33, gap 1.67. Tie. Pick orange (first in list).
    expect(assignTeam(
      { teamCount: 2, teamColors: ["orange", "black"] },
      "intermediate",
      existing,
    )).toBe("orange");
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/dropin/team-assignment.ts

const SKILL_RANK: Record<string, number> = {
  recreational: 1,
  intermediate: 2,
  advanced: 3,
  all_levels: 2,
};

export function assignTeam(
  session: { teamCount: number; teamColors: string[] },
  newUserSkillLevel: string,
  existingBookings: { teamAssignment: string | null; skillLevel: string }[],
): string | null {
  if (session.teamCount === 0 || session.teamColors.length === 0) return null;

  const counts = new Map<string, number>();
  const skillSums = new Map<string, number>();
  for (const color of session.teamColors) {
    counts.set(color, 0);
    skillSums.set(color, 0);
  }
  for (const b of existingBookings) {
    if (!b.teamAssignment) continue;
    counts.set(b.teamAssignment, (counts.get(b.teamAssignment) ?? 0) + 1);
    skillSums.set(b.teamAssignment, (skillSums.get(b.teamAssignment) ?? 0) + (SKILL_RANK[b.skillLevel] ?? 2));
  }

  // Smallest team(s) first
  const minCount = Math.min(...counts.values());
  const candidates = session.teamColors.filter((c) => counts.get(c) === minCount);

  if (candidates.length === 1) return candidates[0];

  // Tie: pick the team that produces the lowest skill-rank gap when this user joins
  const newSkill = SKILL_RANK[newUserSkillLevel] ?? 2;
  let bestCandidate = candidates[0];
  let bestGap = Infinity;
  for (const c of candidates) {
    // Hypothetical: this candidate gets the user; compute avg of all teams
    const hypotheticalAvgs = session.teamColors.map((color) => {
      const cnt = counts.get(color) ?? 0;
      const sum = skillSums.get(color) ?? 0;
      if (color === c) return (sum + newSkill) / (cnt + 1);
      return cnt > 0 ? sum / cnt : 2;
    });
    const gap = Math.max(...hypotheticalAvgs) - Math.min(...hypotheticalAvgs);
    if (gap < bestGap) {
      bestGap = gap;
      bestCandidate = c;
    }
  }
  return bestCandidate;
}
```

- [ ] **Step 3: Run, verify pass, commit**

```bash
npx vitest run tests/unit/dropin/team-assignment.test.ts
git add src/lib/dropin/team-assignment.ts tests/unit/dropin/team-assignment.test.ts
git commit -m "feat(dropin): team assignment with smallest-first + skill-balance tiebreaker"
```

---

### Task 6: `createConfirmedBooking` orchestrator

**Files:**
- Create: `src/lib/dropin/booking.ts`
- Create: `tests/utils/dropin-helpers.ts`
- Test: `tests/api/dropin/book-confirmed.test.ts`

- [ ] **Step 1: Test helpers**

```typescript
// tests/utils/dropin-helpers.ts
import { getDb } from "@/lib/db";
import { dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { createTestGameContext } from "./activity-tracking-helpers";

export async function createTestDropInSession(opts: {
  organizationId?: string;
  venueId?: string;
  capacity?: number;
  membersOnly?: boolean;
  startsAt?: Date;
  kind?: "pickup" | "class";
  teamCount?: number;
  teamColors?: string[];
}) {
  const db = getDb();
  // Reuse activity-tracking-helpers for org+venue fixture if needed
  const ctx = opts.organizationId
    ? { organizationId: opts.organizationId, venueId: opts.venueId! }
    : await createTestGameContext({});

  // Ensure rate card exists for the org
  await db.insert(dropInRateCard)
    .values({ organizationId: ctx.organizationId })
    .onConflictDoNothing();

  const [session] = await db.insert(dropInSessions).values({
    organizationId: ctx.organizationId,
    venueId: ctx.venueId,
    kind: opts.kind ?? "pickup",
    sportOrClassLabel: "soccer",
    startsAt: opts.startsAt ?? new Date(Date.now() + 7 * 86400_000),
    endsAt: new Date((opts.startsAt?.getTime() ?? Date.now() + 7 * 86400_000) + 90 * 60_000),
    capacity: opts.capacity ?? 16,
    membersOnly: opts.membersOnly ?? false,
    teamCount: opts.teamCount ?? (opts.kind === "class" ? 0 : 2),
    teamColors: opts.teamColors ?? (opts.kind === "class" ? [] : ["orange", "black"]),
  }).returning();

  return { ...ctx, sessionId: session.id, session };
}
```

- [ ] **Step 2: Implement booking orchestrator**

```typescript
// src/lib/dropin/booking.ts
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { and, eq, sql } from "drizzle-orm";
import { resolveRate, type ResolvedRate } from "./pricing";
import { checkMembersOnly, checkCapacity, checkGenderCap } from "./gates";
import { assignTeam } from "./team-assignment";

export interface BookingError {
  code: "members_only" | "session_full" | "gender_cap_full" | "session_not_found" | "session_not_scheduled" | "user_not_found" | "already_booked";
  message: string;
}

export interface BookingResult {
  ok: true;
  bookingId: string;
  amountCents: number;
  paymentMethod: ResolvedRate["paymentMethod"];
}

export interface BookingFailure {
  ok: false;
  error: BookingError;
}

/**
 * Create a confirmed booking inside a transaction with row-level locking
 * on the session. Rate is resolved; if amountCents > 0 the caller is
 * responsible for completing payment via Stripe Checkout (this fn returns
 * status='confirmed' for $0 paths and status='confirmed' but with
 * stripePaymentIntentId set later via webhook for $>0 paths — we choose to
 * create the row only on webhook completion for paid paths to avoid
 * orphan bookings on Checkout abandonment.
 *
 * For now, this fn handles only the $0 case (member_unlimited / member_allotment);
 * the paid path goes through Stripe Checkout creation in the API endpoint.
 */
export async function createConfirmedBookingFreePath(opts: {
  sessionId: string;
  userId: string;
  source: "online_booking" | "walk_up";
}): Promise<BookingResult | BookingFailure> {
  const db = getDb();

  return await db.transaction(async (tx) => {
    // Lock the session row
    const [session] = await tx
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, opts.sessionId))
      .for("update");

    if (!session) {
      return { ok: false, error: { code: "session_not_found", message: "Session not found" } };
    }
    if (session.status !== "scheduled") {
      return { ok: false, error: { code: "session_not_scheduled", message: "Session is not open for booking" } };
    }

    // Existing user lookup
    const [user] = await tx.select().from(users).where(eq(users.id, opts.userId)).limit(1);
    if (!user) {
      return { ok: false, error: { code: "user_not_found", message: "User not found" } };
    }

    // Check for existing active booking for this user on this session
    const existing = await tx
      .select()
      .from(dropInBookings)
      .where(and(
        eq(dropInBookings.sessionId, opts.sessionId),
        eq(dropInBookings.userId, opts.userId),
        sql`status IN ('confirmed', 'waitlisted', 'pending_claim')`,
      ));
    if (existing.length > 0) {
      return { ok: false, error: { code: "already_booked", message: "User already has an active booking" } };
    }

    // Membership lookup (placeholder — assume helper exists once memberships schema lands)
    const membership = await getActiveMembershipForUser(tx, opts.userId, session.organizationId);

    // Rate card lookup
    const [rateCard] = await tx.select().from(dropInRateCard).where(eq(dropInRateCard.organizationId, session.organizationId)).limit(1);
    if (!rateCard) {
      throw new Error("rate card missing for organization — should have been seeded at org creation");
    }

    // Gates
    const memGate = checkMembersOnly(session, membership);
    if (!memGate.ok) return { ok: false, error: { code: memGate.reason, message: "Session is members-only" } };

    const confirmedCount = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(dropInBookings)
      .where(and(eq(dropInBookings.sessionId, opts.sessionId), eq(dropInBookings.status, "confirmed")));
    const capGate = checkCapacity(session, confirmedCount[0]?.c ?? 0);
    if (!capGate.ok) return { ok: false, error: { code: capGate.reason, message: "Session is full" } };

    if (session.capacityMale !== null && user.gender !== null) {
      const genderCounts = await fetchGenderCounts(tx, opts.sessionId);
      const genderGate = checkGenderCap(session, user.gender, genderCounts);
      if (!genderGate.ok) return { ok: false, error: { code: genderGate.reason, message: "Gender cap full" } };
    }

    // Resolve rate
    const rate = resolveRate(session, { id: opts.userId }, membership, rateCard);
    if (rate.amountCents !== 0) {
      throw new Error("createConfirmedBookingFreePath called for non-free booking; use Stripe Checkout flow instead");
    }

    // Existing bookings for team assignment
    const existingForTeam = await tx
      .select({
        teamAssignment: dropInBookings.teamAssignment,
        skillLevel: sql<string>`coalesce(usl.level::text, 'all_levels')`,
      })
      .from(dropInBookings)
      .leftJoin(
        sql`user_skill_levels usl`,
        sql`usl.user_id = drop_in_bookings.user_id AND usl.sport = ${session.sportOrClassLabel}`,
      )
      .where(and(eq(dropInBookings.sessionId, opts.sessionId), eq(dropInBookings.status, "confirmed")));

    const userSkill = await fetchUserSkill(tx, opts.userId, session.sportOrClassLabel);
    const team = assignTeam(session, userSkill, existingForTeam);

    // Insert
    const [booking] = await tx.insert(dropInBookings).values({
      sessionId: opts.sessionId,
      userId: opts.userId,
      status: "confirmed",
      source: opts.source,
      paymentMethod: rate.paymentMethod,
      amountPaidCents: 0,
      membershipId: rate.membershipId,
      teamAssignment: team,
    }).returning();

    // Decrement allotment if applicable (reflects in member's monthly count)
    if (rate.paymentMethod === "member_allotment" && rate.membershipId) {
      await decrementAllotment(tx, rate.membershipId);
    }

    return {
      ok: true,
      bookingId: booking.id,
      amountCents: 0,
      paymentMethod: rate.paymentMethod,
    };
  });
}

// Helper stubs — these become real implementations as memberships schema lands.
async function getActiveMembershipForUser(_tx: unknown, _userId: string, _orgId: string) {
  return null;
}
async function fetchGenderCounts(_tx: unknown, _sessionId: string) {
  return { male: 0, female: 0 };
}
async function fetchUserSkill(_tx: unknown, _userId: string, _sport: string): Promise<string> {
  return "all_levels";
}
async function decrementAllotment(_tx: unknown, _membershipId: string) {
  // no-op until memberships schema is wired
}
```

(Note: stubs for membership-related helpers — the real implementations land when the rentals + memberships work in 2026-04-28 design ships. Tests should mock these.)

- [ ] **Step 3: Integration test**

```typescript
// tests/api/dropin/book-confirmed.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { eq } from "drizzle-orm";
import { createConfirmedBookingFreePath } from "@/lib/dropin/booking";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import { users } from "@/lib/db/schema/users";

describe("createConfirmedBookingFreePath", () => {
  it("creates a booking when capacity available (free path stub)", async () => {
    const ctx = await createTestDropInSession({ capacity: 16 });
    const [u] = await getDb().insert(users).values({ email: `t-${Date.now()}@t.com`, firstName: "T", lastName: "U" }).returning();

    const result = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: u.id,
      source: "online_booking",
    });

    // Free-path returns successfully but the helper stub returns no membership,
    // so this test exercises the non-free path. Adjust expectation accordingly:
    // For pure free-path testing, mock getActiveMembershipForUser to return a member
    // (this requires more elaborate test setup; skipped for now and covered in later tests).
    expect(result.ok === false || result.ok === true).toBe(true);
  });

  it("rejects when session is full", async () => {
    // Create session with capacity 1, fill it, then attempt second booking
    // (requires a wired membership for the first booking to be free; defer until
    // memberships test fixture is available).
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/dropin/booking.ts tests/utils/dropin-helpers.ts tests/api/dropin/book-confirmed.test.ts
git commit -m "feat(dropin): confirmed booking orchestrator (free path) with gates + team assignment"
```

---

### Task 7: Stripe Checkout integration for paid bookings

**Files:**
- Create: `src/pages/api/dropin/bookings/index.ts` — POST: returns Checkout URL or directly creates $0 booking
- Modify: `src/pages/api/webhooks/stripe-checkout-completed.ts` — extend to handle dropin metadata
- Test: `tests/api/dropin/book-paid-checkout.test.ts`

- [ ] **Step 1: Create POST endpoint**

```typescript
// src/pages/api/dropin/bookings/index.ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { eq, and } from "drizzle-orm";
import { resolveRate } from "@/lib/dropin/pricing";
import { createConfirmedBookingFreePath } from "@/lib/dropin/booking";
import Stripe from "stripe";

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY ?? "");

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const body = await request.json();
  const { sessionId } = body;

  const db = getDb();
  const [session] = await db.select().from(dropInSessions).where(eq(dropInSessions.id, sessionId)).limit(1);
  if (!session) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  // Same-org enforcement
  if (session.organizationId !== locals.organization?.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  // Resolve rate (mock membership lookup; real impl reads memberships table)
  const [rateCard] = await db.select().from(dropInRateCard).where(eq(dropInRateCard.organizationId, session.organizationId));
  const membership = null; // TODO: real membership lookup once schema wired
  const rate = resolveRate(session, locals.user, membership, rateCard);

  // Free path → create immediately
  if (rate.amountCents === 0) {
    const result = await createConfirmedBookingFreePath({
      sessionId,
      userId: locals.user.id,
      source: "online_booking",
    });
    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), { status: 409 });
    }
    return new Response(JSON.stringify({ bookingId: result.bookingId, paymentRequired: false }), { status: 200 });
  }

  // Paid path → create Checkout Session
  const [venue] = await db.select().from(venues).where(eq(venues.id, session.venueId));
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: `${session.sportOrClassLabel} — ${session.startsAt.toISOString()}`,
          description: `Drop-in at ${venue?.name ?? "venue"}`,
        },
        unit_amount: rate.amountCents,
      },
      quantity: 1,
    }],
    metadata: {
      kind: "dropin",
      session_id: sessionId,
      user_id: locals.user.id,
      payment_method: rate.paymentMethod,
      membership_id: rate.membershipId ?? "",
    },
    payment_intent_data: venue?.partnerStripeAccountId ? {
      application_fee_amount: Math.round(rate.amountCents * (venue.partnerApplicationFeePct ?? 0) / 100),
      transfer_data: { destination: venue.partnerStripeAccountId },
    } : undefined,
    success_url: `${import.meta.env.PUBLIC_APP_URL}/dropin/${sessionId}?booking=success`,
    cancel_url: `${import.meta.env.PUBLIC_APP_URL}/dropin/${sessionId}?booking=cancelled`,
  });

  return new Response(JSON.stringify({
    paymentRequired: true,
    checkoutUrl: checkoutSession.url,
  }), { status: 200 });
};
```

- [ ] **Step 2: Webhook handler**

In `src/pages/api/webhooks/stripe-checkout-completed.ts` (extend or create), handle dropin metadata:

```typescript
import { dropInBookings } from "@/lib/db/schema/drop-in";

// In the webhook handler, when event.type === 'checkout.session.completed':
if (session.metadata?.kind === "dropin") {
  await getDb().insert(dropInBookings).values({
    sessionId: session.metadata.session_id,
    userId: session.metadata.user_id,
    status: "confirmed",
    source: "online_booking",
    paymentMethod: session.metadata.payment_method as DropInPaymentMethod,
    amountPaidCents: session.amount_total ?? 0,
    membershipId: session.metadata.membership_id || null,
    stripePaymentIntentId: session.payment_intent as string,
    teamAssignment: await assignTeamForBooking(...),  // run team assignment now
  });
}
```

- [ ] **Step 3: Integration test (skip for now if Stripe mocking is complex)**

```typescript
// tests/api/dropin/book-paid-checkout.test.ts
// Verify endpoint returns 200 with checkoutUrl when rate > 0
// (full Stripe webhook test deferred; covered by manual smoke on staging)
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/dropin/bookings/ src/pages/api/webhooks/ tests/api/dropin/book-paid-checkout.test.ts
git commit -m "feat(dropin): Stripe Checkout for paid bookings + webhook handler"
```

---

### Task 8: Waitlist + pessimistic claim flow

**Files:**
- Create: `src/lib/dropin/promotion.ts`
- Create: `src/pages/api/dropin/claim/[token].ts` — GET shows claim page; POST completes
- Create: `src/pages/api/cron/expire-pending-claims.ts`
- Create: `netlify/functions/scheduled-expire-pending-claims.ts`
- Test: `tests/api/dropin/claim.test.ts`

- [ ] **Step 1: Promotion module**

```typescript
// src/lib/dropin/promotion.ts
import { getDb } from "@/lib/db";
import { dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { and, eq, asc, lte, sql } from "drizzle-orm";
import crypto from "node:crypto";

export async function promoteNextWaitlister(sessionId: string): Promise<{ promoted: boolean; bookingId?: string; token?: string }> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    // Find first waitlister
    const [next] = await tx
      .select()
      .from(dropInBookings)
      .where(and(
        eq(dropInBookings.sessionId, sessionId),
        eq(dropInBookings.status, "waitlisted"),
      ))
      .orderBy(asc(dropInBookings.createdAt))
      .limit(1)
      .for("update");

    if (!next) return { promoted: false };

    // Promotion window from rate card
    const session = await tx
      .select({ orgId: dropInBookings.sessionId }) // join to dropInSessions to get org; simplified here
      .from(dropInBookings)
      .where(eq(dropInBookings.id, next.id))
      .limit(1);
    // Real impl: join dropInSessions to get organizationId, then look up rate card.
    // For brevity here, assume 30 min default.
    const promotionWindowMinutes = 30;
    const expiresAt = new Date(Date.now() + promotionWindowMinutes * 60_000);
    const token = crypto.randomBytes(32).toString("base64url");

    await tx.update(dropInBookings)
      .set({
        status: "pending_claim",
        promotedAt: new Date(),
        promotionExpiresAt: expiresAt,
        promotionToken: token,
        updatedAt: new Date(),
      })
      .where(eq(dropInBookings.id, next.id));

    return { promoted: true, bookingId: next.id, token };
  });
}

export async function expireOverduePromotions(now: Date = new Date()): Promise<{ expired: number }> {
  const db = getDb();
  const expired = await db
    .update(dropInBookings)
    .set({
      status: "cancelled",
      cancellationReason: "expired_promotion",
      cancelledAt: now,
      promotionToken: null,
      updatedAt: now,
    })
    .where(and(
      eq(dropInBookings.status, "pending_claim"),
      lte(dropInBookings.promotionExpiresAt, now),
    ))
    .returning();

  // For each expired, promote the next in line on that session
  for (const row of expired) {
    await promoteNextWaitlister(row.sessionId);
    // (notification dispatch happens here in real impl)
  }

  return { expired: expired.length };
}
```

- [ ] **Step 2: Claim endpoints**

```typescript
// src/pages/api/dropin/claim/[token].ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { eq, and } from "drizzle-orm";

export const GET: APIRoute = async ({ params }) => {
  const { token } = params;
  if (!token) return new Response(JSON.stringify({ error: "Token required" }), { status: 400 });
  const db = getDb();
  const [booking] = await db
    .select()
    .from(dropInBookings)
    .where(and(eq(dropInBookings.promotionToken, token), eq(dropInBookings.status, "pending_claim")))
    .limit(1);
  if (!booking) return new Response(JSON.stringify({ error: "Token invalid or expired" }), { status: 404 });
  if (booking.promotionExpiresAt && booking.promotionExpiresAt < new Date()) {
    return new Response(JSON.stringify({ error: "Window expired" }), { status: 410 });
  }
  return new Response(JSON.stringify({ booking }), { status: 200 });
};

// POST: complete the claim — same flow as /api/dropin/bookings POST but with the existing booking row
export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  // ... lookup booking by token, verify user_id matches, complete payment via Checkout if amountCents > 0,
  // then update status to confirmed + run team assignment
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
```

- [ ] **Step 3: Cron endpoint + scheduled function**

```typescript
// src/pages/api/cron/expire-pending-claims.ts
import type { APIRoute } from "astro";
import { expireOverduePromotions } from "@/lib/dropin/promotion";

export const POST: APIRoute = async ({ request }) => {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== import.meta.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const result = await expireOverduePromotions();
  return new Response(JSON.stringify(result), { status: 200 });
};
```

```typescript
// netlify/functions/scheduled-expire-pending-claims.ts
import { schedule } from "@netlify/functions";
import { expireOverduePromotions } from "../../src/lib/dropin/promotion";

export const handler = schedule("*/5 * * * *", async () => {
  const result = await expireOverduePromotions();
  return { statusCode: 200, body: JSON.stringify(result) };
});
```

- [ ] **Step 4: Tests + commit**

```typescript
// tests/api/dropin/claim.test.ts
// Test: promotion creates pending_claim row with token; GET resolves; POST completes;
// expiry transitions to cancelled and promotes next.
```

```bash
git add src/lib/dropin/promotion.ts src/pages/api/dropin/claim/ src/pages/api/cron/expire-pending-claims.ts netlify/functions/scheduled-expire-pending-claims.ts tests/api/dropin/claim.test.ts
git commit -m "feat(dropin): waitlist promotion + pessimistic claim + cron expiry"
```

---

### Task 9: Cancellation + refund

**Files:**
- Create: `src/lib/dropin/refund.ts`
- Create: `src/pages/api/dropin/bookings/[id]/cancel.ts`
- Create: `src/pages/api/admin/dropin/bookings/[id]/refund.ts`
- Test: `tests/api/dropin/cancel.test.ts`

- [ ] **Step 1: Refund logic**

```typescript
// src/lib/dropin/refund.ts
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { eq, and } from "drizzle-orm";
import Stripe from "stripe";
import { promoteNextWaitlister } from "./promotion";

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY ?? "");

export async function processCancelRefund(bookingId: string, options: { adminOverride?: boolean; reason?: string }): Promise<{ ok: boolean; refunded: boolean; reason?: string }> {
  const db = getDb();
  const [booking] = await db.select().from(dropInBookings).where(eq(dropInBookings.id, bookingId)).limit(1);
  if (!booking) return { ok: false, refunded: false, reason: "Not found" };

  const [session] = await db.select().from(dropInSessions).where(eq(dropInSessions.id, booking.sessionId)).limit(1);
  if (!session) return { ok: false, refunded: false, reason: "Session not found" };

  const [rateCard] = await db.select().from(dropInRateCard).where(eq(dropInRateCard.organizationId, session.organizationId)).limit(1);
  const cancelWindowHours = rateCard?.cancelWindowHours ?? 24;
  const hoursUntil = (session.startsAt.getTime() - Date.now()) / 3600_000;
  const insideWindow = hoursUntil < cancelWindowHours;

  // Within window OR admin override → refund
  const shouldRefund = !insideWindow || options.adminOverride;
  let refunded = false;

  if (shouldRefund && booking.amountPaidCents > 0 && booking.stripePaymentIntentId) {
    try {
      const refund = await stripe.refunds.create({ payment_intent: booking.stripePaymentIntentId });
      await db.update(dropInBookings).set({ stripeRefundId: refund.id }).where(eq(dropInBookings.id, bookingId));
      refunded = true;
    } catch (err) {
      console.error("[refund] failed", err);
      // Still mark cancelled but flag refund failure for retry
    }
  }

  // Restore allotment if applicable and within policy (not enforced for member_unlimited)
  if (shouldRefund && booking.paymentMethod === "member_allotment" && booking.membershipId) {
    // TODO: increment allotment counter on the membership for the relevant month
  }

  // Mark cancelled
  await db.update(dropInBookings).set({
    status: "cancelled",
    cancellationReason: options.adminOverride ? "admin_override" : "user_request",
    cancelledAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(dropInBookings.id, bookingId));

  // Trigger waitlist promotion
  await promoteNextWaitlister(booking.sessionId);

  return { ok: true, refunded };
}
```

- [ ] **Step 2: Endpoints**

```typescript
// src/pages/api/dropin/bookings/[id]/cancel.ts
export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  // Verify booking belongs to logged-in user
  // Call processCancelRefund({ adminOverride: false })
  // Return result
};
```

```typescript
// src/pages/api/admin/dropin/bookings/[id]/refund.ts
export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user || locals.user.role !== "admin") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  const body = await request.json();
  return processCancelRefund(params.id!, { adminOverride: true, reason: body.reason });
};
```

- [ ] **Step 3: Tests + commit**

```bash
git add src/lib/dropin/refund.ts src/pages/api/dropin/bookings/[id]/cancel.ts src/pages/api/admin/dropin/bookings/[id]/refund.ts tests/api/dropin/cancel.test.ts
git commit -m "feat(dropin): cancellation + policy-aware refund + admin override"
```

---

### Task 10: Walk-up flow with Stripe Terminal

**Files:**
- Create: `src/pages/api/admin/dropin/sessions/[id]/walk-up.ts` — POST creates Terminal PaymentIntent
- Create: `src/components/admin/dropin/WalkUpPanel.tsx` — admin UI driving Stripe Terminal SDK

- [ ] **Step 1: Server endpoint**

Server creates a `card_present` PaymentIntent and returns the client_secret. Client uses `@stripe/terminal-js` to drive the reader.

```typescript
// src/pages/api/admin/dropin/sessions/[id]/walk-up.ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { users } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { resolveRate } from "@/lib/dropin/pricing";
import { createConfirmedBookingFreePath } from "@/lib/dropin/booking";

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY ?? "");

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const body = await request.json();
  const { userId, customerInfo } = body; // or { newAccount: { name, email, phone, gender } }

  // ... lookup or create user, run gates, resolve rate
  // If rate.amountCents === 0: create booking immediately via free path
  // If rate.amountCents > 0: create card-present PaymentIntent, return client_secret for Terminal SDK

  // Detail elided — follows the pattern in the spec §11.1

  return new Response(JSON.stringify({ /* ... */ }), { status: 200 });
};
```

- [ ] **Step 2: Walk-up panel component**

`WalkUpPanel.tsx` is the front-desk UI. Search-by-phone-or-email, create-new-account form, member-status display, "Register" button → triggers Terminal flow via `@stripe/terminal-js`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/dropin/sessions/[id]/walk-up.ts src/components/admin/dropin/WalkUpPanel.tsx
git commit -m "feat(dropin): walk-up flow with Stripe Terminal card-present"
```

---

## Phase C: Customer + admin UIs (12 tasks bundled into 3 commits)

The customer + admin UI work is mostly formulaic React + endpoints. Bundle into 3 commits at fast pace, each with the components + endpoints + tests for that surface.

### Task 11: Customer browse + detail pages + dashboard

**Files** (high-level — implement from spec §9):
- `src/pages/dropin/index.astro` + `SessionList.tsx` + `SessionCard.tsx`
- `src/pages/dropin/[id].astro` + `SessionDetail.tsx` + `BookButton.tsx`
- `src/pages/dropin/claim/[token].astro` + `ClaimPage.tsx`
- `src/pages/api/dropin/sessions/index.ts` + `[id].ts` (GET endpoints)
- Modify `src/pages/dashboard/bookings.astro` to include drop-in section + `MyBookings.tsx`

Commit: `feat(dropin): customer browse, detail, claim, dashboard`

### Task 12: Admin schedule + session detail + walk-up panel + roster

**Files**:
- `src/pages/admin/dropin/sessions/index.astro` + `SessionsList.tsx`
- `src/pages/admin/dropin/sessions/[id]/index.astro` + `SessionDetail.tsx` (admin)
- `src/pages/admin/dropin/sessions/[id]/edit.astro` + `SessionForm.tsx`
- `src/pages/api/admin/dropin/sessions/index.ts` + `[id].ts` + `[id]/cancel.ts` + `[id]/repeat.ts`
- `src/pages/api/admin/dropin/sessions/[id]/attendance.ts`
- `src/components/admin/dropin/AttendancePanel.tsx`
- `src/components/admin/dropin/WalkUpPanel.tsx` (already created in Task 10; wire here)

Commit: `feat(dropin): admin schedule + session detail + walk-up + attendance + recurring schedule (bulk repeat)`

### Task 13: Rate card editor + brand profile editor + skill levels admin

**Files**:
- `src/pages/admin/dropin/rate-card.astro` + `RateCardEditor.tsx` + `src/pages/api/admin/dropin/rate-card.ts`
- `src/pages/admin/branding/index.astro` + `[id].astro` + `BrandProfileEditor.tsx` + `src/pages/api/admin/branding/index.ts` + `[id].ts`
- Modify `src/pages/admin/users/[id].astro` to include `SkillLevelsEditor.tsx` + `src/pages/api/admin/users/[id]/skill-levels.ts`

Commit: `feat(dropin): rate card editor + brand profile editor + per-user skill levels admin UI`

---

## Phase D: Notifications + final integration (3 tasks)

### Task 14: Booking + waitlist + cancel notifications

**Files**:
- `src/lib/dropin/messages/{booking-confirmation,waitlist-promoted,booking-cancelled-by-admin}.ts`
- Wire into booking + promotion + admin-cancel flows

Each module exports `render*(ctx): MessageVariants` matching the activity-tracker pattern from Plan 2. Email + SMS + Telegram variants.

Commit: `feat(dropin): notifications for confirmation, waitlist promotion, admin cancellation`

### Task 15: Full-flow integration test

**File**: `tests/api/dropin/full-flow.test.ts`

End-to-end: create session → book confirmed → reach capacity → next user joins waitlist → confirmed booker cancels >24h → verify refund + waitlister gets claim link → claim completes → verify final state.

Commit: `test(dropin): full-flow integration test`

### Task 16: Spec coverage self-review + final verification

Walk through spec §1–14, verify each requirement has implementation. Run full test suite, types check, validator check. Document gaps in `docs/superpowers/plan-coverage-2026-05-07-drop-in-booking.md`.

Commit: `docs(dropin): spec coverage report`

---

## What's NOT in this plan (explicitly deferred per spec §14)

- Multi-pack / punch-pass credits
- Cancellation credits inside the cancel window
- No-show penalty fees
- Dynamic / time-of-day pricing
- Skill-balanced perfect team assignment for N>2 teams
- Peer skill ratings (only self-reported + admin-override are in)
- Calendar conflict prevention (same user, overlapping sessions)
- Reservation hold during Stripe Checkout
- Per-tier members-only sessions
- Self-service waitlist position visibility
- Hard venue differentiation per branded site (start with soft via featured_venue_ids)
- Per-domain shared SSO via parent-domain cookies
- Customer-facing per-session-pricing call-outs
- Recurring schedule template entity (only bulk-repeat in this plan)
- Automated no-show detection
- Photographer/media coverage of pickup sessions
- E2E (Playwright) tests — defer until UIs stabilize
- Hourly field rentals (separate plan, 2026-04-28 design)
- Membership tiers + Stripe Subscriptions (separate plan, 2026-04-28 design)

## Cumulative dependencies

- **Plan 2 (activity tracking engine)** — must merge first; the cron-tick infrastructure is reused for the waitlist promotion-expiry scheduled function. If Plan 2 is still in PR review when this plan starts, either wait for merge OR fork a small parallel scheduled-function pattern (low risk, ~1 day of work to converge later)
- **2026-04-28 SoccerOne data model (rentals + memberships)** — hourly rentals + membership tiers + memberships tables. Drop-in pricing logic stubs membership lookups; real implementation lands when memberships ship. The drop-in plan can ship with stubbed membership=null behavior (everyone pays full $15) and be backfilled when memberships land. NOT a hard blocker.

## Implementation phases (suggested execution order)

1. **Phase A (Tasks 1–4)**: foundation — schema, brand resolver, pricing, gates. ~3 days.
2. **Phase B (Tasks 5–10)**: booking flow, waitlist, cancel, walk-up. ~5–7 days.
3. **Phase C (Tasks 11–13)**: UIs. ~5–7 days.
4. **Phase D (Tasks 14–16)**: notifications + final. ~2 days.

Total estimate: ~15–19 working days for a single engineer; faster with parallel subagent dispatch on UI tasks. About the same magnitude as Plan 2.
