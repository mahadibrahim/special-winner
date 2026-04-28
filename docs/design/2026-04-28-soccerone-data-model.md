# SoccerOne Data Model — Rentals & Memberships

**Date:** 2026-04-28  
**Status:** Design sketch — for partnership pitch discussion  
**Author:** Aspire Sports Engineering

---

## Context

This document covers the new tables required to power the SoccerOne feature set demonstrated in the `/soccerone/*` marketing prototype. These features — hourly field rentals and recurring memberships — are not yet in the Aspire Sports schema. They extend the existing org → location → venue hierarchy and integrate with Stripe Connect.

---

## New Tables: Rentals

### `bookable_resources`

Represents a rentable physical resource (a field, court, studio room, etc.) within a venue.

```sql
CREATE TABLE bookable_resources (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,                    -- "Field 1", "Field 2", etc.
  type                  TEXT NOT NULL,                    -- 'field' | 'court' | 'room'
  capacity              INTEGER,                          -- max player count
  hourly_rate_cents     INTEGER NOT NULL,                 -- e.g. 8000 ($80/hr)
  member_rate_cents     INTEGER NOT NULL,                 -- e.g. 7200 ($72/hr for members)
  description           TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `resource_availability`

Per-resource opening hours by day of week. Allows Field 1 to be available 7am–11pm Mon–Fri but only 8am–10pm on Sundays.

```sql
CREATE TABLE resource_availability (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id  UUID NOT NULL REFERENCES bookable_resources(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
  open_time    TIME NOT NULL,    -- e.g. '07:00'
  close_time   TIME NOT NULL,    -- e.g. '23:00'
  UNIQUE (resource_id, day_of_week)
);
```

### `bookings`

One row per hourly (or multi-hour) booking. Uses a Postgres EXCLUDE constraint with `btree_gist` to prevent overlapping bookings at the database level — no application-layer gap-checking required.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE bookings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id           UUID NOT NULL REFERENCES bookable_resources(id),
  user_id               UUID NOT NULL REFERENCES users(id),
  start_at              TIMESTAMPTZ NOT NULL,
  end_at                TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'confirmed', 'cancelled', 'no_show')),
  amount_paid_cents     INTEGER,
  member_discount_pct   INTEGER NOT NULL DEFAULT 0,       -- 0, 10, or 20
  stripe_session_id     TEXT,                             -- Stripe Checkout Session ID
  stripe_payment_intent TEXT,
  add_ons               JSONB NOT NULL DEFAULT '[]',      -- [{id, label, price_cents}]
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at          TIMESTAMPTZ,

  CONSTRAINT no_overlap EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ),
  CONSTRAINT valid_window CHECK (end_at > start_at)
);

CREATE INDEX bookings_resource_start_idx ON bookings (resource_id, start_at);
CREATE INDEX bookings_user_idx           ON bookings (user_id, start_at DESC);
```

**Notes on the EXCLUDE constraint:**  
The `tstzrange(start_at, end_at) WITH &&` predicate means "these two ranges overlap." Combined with `resource_id WITH =`, the constraint prevents any two confirmed bookings on the same field from sharing time — enforced atomically in Postgres, immune to race conditions. The `btree_gist` extension is required because the default GiST index doesn't cover the integer equality operator on `resource_id`.

**Cancellation:** Cancelled bookings are excluded from overlap checks by filtering on `status != 'cancelled'` at the application layer OR by using a partial index strategy (a partial EXCLUDE is not natively supported; the app must set `status = 'cancelled'` and rely on a trigger or application logic to allow re-booking of that window).

---

## New Tables: Memberships

### `membership_tiers`

Defined per organization. Each Aspire franchise (SoccerOne, future partners) can set its own tier structure and pricing.

```sql
CREATE TABLE membership_tiers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,                -- "Day Pass", "Member", "Founder"
  monthly_price_cents       INTEGER,                      -- null if no monthly option
  annual_price_cents        INTEGER,                      -- null if no annual option
  benefits                  JSONB NOT NULL DEFAULT '{}',
  stripe_price_id_monthly   TEXT,                         -- Stripe Price ID for monthly sub
  stripe_price_id_annual    TEXT,                         -- Stripe Price ID for annual sub
  display_order             INTEGER NOT NULL DEFAULT 0,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**`benefits` JSONB shape:**

```json
{
  "rental_discount_pct":       10,
  "priority_league_signup_hrs": 48,
  "free_pickup_per_month":      0,
  "guest_passes_per_month":     0,
  "founder_wall":               false,
  "booking_window_days":        14,
  "members_only_pickup":        true,
  "unlimited_pickup":           false
}
```

All keys are optional — missing keys fall back to 0 / false. Application code reads this object to apply discounts at checkout.

### `memberships`

Tracks an individual user's active subscription. One active membership per user per organization at any time.

```sql
CREATE TABLE memberships (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id),
  tier_id                  UUID NOT NULL REFERENCES membership_tiers(id),
  status                   TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'paused', 'cancelled', 'past_due')),
  billing_interval         TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),
  started_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end       TIMESTAMPTZ,
  paused_at                TIMESTAMPTZ,
  pause_resumes_at         TIMESTAMPTZ,
  cancelled_at             TIMESTAMPTZ,
  stripe_subscription_id   TEXT UNIQUE,
  stripe_customer_id       TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One active membership per user per org (enforced via tier → org)
  CONSTRAINT one_active_per_user UNIQUE (user_id, tier_id)  -- can be relaxed to allow upgrades
);

CREATE INDEX memberships_user_status_idx ON memberships (user_id, status);
```

---

## Stripe Integration

### Rentals — Stripe Checkout (Connect Destination Charge)

1. User selects a time slot and add-ons.
2. Application creates a Stripe Checkout Session:
   ```typescript
   const session = await stripe.checkout.sessions.create({
     mode: "payment",
     payment_method_types: ["card"],
     line_items: [
       { price_data: { currency: "usd", product_data: { name: "Field 1 — 7:00–8:00 PM" }, unit_amount: amountCents }, quantity: 1 },
       // ...add-ons
     ],
     payment_intent_data: {
       application_fee_amount: platformFeeCents,
       transfer_data: { destination: facilityStripeAccountId },
     },
     success_url: `${APP_URL}/dashboard/bookings/{CHECKOUT_SESSION_ID}`,
     cancel_url:  `${APP_URL}/soccerone/rent`,
   });
   ```
3. On `checkout.session.completed` webhook: create the `bookings` row with `status = 'confirmed'`.
4. Member discount applied at session-creation time: `amountCents = memberRateCents + addOnsCents`.

### Memberships — Stripe Subscriptions (Connect)

1. Each `membership_tier` has a `stripe_price_id_monthly` and `stripe_price_id_annual` pointing to Prices on the **platform** Stripe account (with `application_fee_percent` set so the facility receives the net amount).
2. On sign-up: create or retrieve Stripe Customer, then create Subscription:
   ```typescript
   const subscription = await stripe.subscriptions.create({
     customer: stripeCustomerId,
     items: [{ price: tier.stripe_price_id_monthly }],
     application_fee_percent: PLATFORM_FEE_PCT,
     transfer_data: { destination: facilityStripeAccountId },
   });
   ```
3. Webhook `customer.subscription.updated` / `deleted` → sync `memberships.status` and `current_period_end`.
4. At booking-creation time, check `memberships` for an active row for the user + organization, then read `membership_tiers.benefits.rental_discount_pct` to compute member rate.

---

## Multi-Tenant Fit

Every new table hangs off the existing hierarchy:

```
Organization
  └── Location
        └── Venue
              └── bookable_resources  (new)
                    └── resource_availability  (new)
                    └── bookings               (new)
  └── membership_tiers               (new — org level, not venue level)
        └── memberships              (new — per user × tier)
```

`membership_tiers` sits at the org level because a franchise operator wants uniform membership pricing across all their locations (e.g., SoccerOne Powell and SoccerOne Dublin share one tier structure). `bookable_resources` is at the venue level because each physical facility has its own fields.

Existing RLS / tenant-scoping patterns in the Aspire codebase apply: every query on `bookable_resources`, `bookings`, and `membership_tiers` must join back to `organizations` and filter by the current tenant's `organization_id`. The domain resolver already provides `Astro.locals.organization.id` for this purpose.

---

## Out of Scope for v1

- **Season-long block bookings** (weekly recurring slots) — requires a `recurring_bookings` table and a job to materialize individual `bookings` rows.
- **Group split-pay** — Stripe Payment Links with multiple payers; deferred.
- **Recurring rentals** (same slot every week) — application-layer templating, not trivial with the EXCLUDE constraint. Future sprint.
- **Member messaging** — pickup game group chat, field announcement push notifications. Designed in the Telegram integration but not wired to the rental/membership system yet.

---

## Rollout Summary

**Sprint 1 — Marketing site (this PR).** The `/soccerone/*` prototype demonstrates the facility brand, field inventory, membership tiers, and pickup schedule. All data is hardcoded mock data. No new Drizzle schema is introduced; this is a design-and-pitch artifact only.

**Sprint 2 — Rentals.** Introduce `bookable_resources`, `resource_availability`, and `bookings` to the Drizzle schema. Wire up the `FieldCalendar` component to live availability data via a new `/api/public/soccerone/availability` endpoint. Build Stripe Checkout integration for slot payment, and the `POST /api/bookings` + webhook handler. Member discount applied at checkout creation based on `memberships` row lookup.

**Sprint 3 — Memberships.** Introduce `membership_tiers` and `memberships`. Build the Stripe Subscriptions flow via Connect. Expose membership status in `Astro.locals` alongside organization context so any page can gate features (member-only pickup, early league registration) without additional DB queries per request. Provide a self-serve cancellation/pause flow in the parent dashboard.
