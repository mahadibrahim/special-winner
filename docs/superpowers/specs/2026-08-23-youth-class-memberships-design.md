# Youth Class Memberships — Design

**Date:** 2026-08-23
**Status:** Approved by owner
**Deadline:** Classes begin in ~3 weeks from the date above. Scope decisions below are made against that constraint.

## Overview

Youth classes move to a membership model:

- **$45/year annual membership fee, per child.**
- **Monthly subscription packages, per child:** 4 classes/month, 8 classes/month, unlimited. Tier names are marketing names, set in admin (free text + tagline), not hardcoded.
- **Hybrid attendance:** each child has a recurring weekly **home slot**; home-slot weeks consume the shared monthly class pool. A cancelled/missed week (cancelled before cutoff) frees that credit for a make-up or extra session booked from the schedule.
- **10% sibling discount** on each additional child's monthly package (annual fees stay $45 each). Percentage is admin-configurable in org settings.
- **10% member discount on camps**, applied automatically for children with an active membership, on top of early-bird pricing; a typed discount code replaces rather than stacks with it (larger single discount wins).
- **Free trial class** is the only non-member attendance path — one per child.
- Two signup paths: **trial-led** (trial → convert, trial slot preselected) and **pay-first** (buy package → pick home slot after checkout).

## Architecture: build on the drop-in substrate (Approach A)

The existing drop-in system already provides: session rows with `kind: "class"` and `audience: "youth"` in their enums, per-session capacity, member/public rates, child-attributed bookings (`familyMemberId`), kiosk check-in, waiver gating, and the count-based monthly allotment (`src/lib/memberships/allotment.ts`, `src/lib/dropin/pricing.ts`). The existing membership system provides Stripe subscription checkout, webhook lifecycle sync, tier CRUD, and the benefits JSONB.

We add only what is genuinely new: recurring slot templates, home-slot enrollments, weekly session materialization + auto-booking, a parent-books-child online flow, per-child membership attribution, and the camp discount hook.

Rejected alternatives: a standalone class module (rebuilds booking/capacity/check-in/waivers — does not fit the deadline); extending programs/seasons (the one-registration-per-season constraint and flat block pricing fight the metered model).

## Data model

### Changed tables

- **`memberships`** — add nullable `family_member_id` FK → `family_members` (restrict). Replace the one-active partial unique index with two: unique `(user_id, organization_id, family_member_id)` where status is live and `family_member_id IS NOT NULL`; unique `(user_id, organization_id)` where status is live and `family_member_id IS NULL` (preserves existing SoccerOne adult behavior exactly). Add `fee_next_due_at` timestamp (annual-fee anniversary; null for tiers with no fee).
- **`membership_tiers`** — add `annual_fee_cents` (nullable int; $45 tier fee), `tagline` (nullable text, public pricing cards), `stripe_price_id_fee` (one-time Stripe Price for the fee line item).
- **`drop_in_sessions`** — add nullable `class_slot_template_id` FK.
- **`drop_in_payment_method` enum** — add `trial`. **Enum-add ships as its own migration** (55P04 precedent).
- **`payments`** — add `membership` to the payment-type enum (own migration) and nullable `membership_id` column, so recurring invoices land in the ledger.

### New tables

- **`class_slot_templates`** — `id`, `organization_id`, `location_id`, `name` ("Soccer Skills 6–8"), `min_age`/`max_age`, `weekday`, `start_time`, `duration_mins`, `capacity`, `active`, timestamps.
- **`class_enrollments`** — `id`, `slot_template_id`, `family_member_id`, `membership_id`, `status` (`active`/`ended`), `started_at`, `ended_at`. Unique active per `(slot_template_id, family_member_id)`. Active enrollment count ≤ template capacity, checked transactionally.

### Tier data (entered in admin, not seeded in code)

Three tiers for the Aspire org with owner-chosen marketing names. Benefits keys (no migration needed — `benefitsSchema` is passthrough):

- `classes_per_month: 4` | `classes_per_month: 8` | `unlimited_classes: true`
- `camp_discount_pct: 10` on all three.

The allotment counter (`computeAllotmentRemaining` / `get-active-membership.ts`) is generalized to take a benefit-key pair and a booking filter; the class variant counts `drop_in_bookings` for the child's membership where the session `kind = 'class'`, statuses `confirmed`/`no_show`, within the UTC calendar month. Pickup behavior is unchanged.

## Billing

- **One Stripe subscription per child.** Checkout session in `mode: "subscription"` with two line items: the tier's monthly recurring Price + the $45 fee as a one-time Price on the first invoice (same pattern as drop-league's registration fee). Metadata carries `type: "membership_subscription"` and `family_member_id`; the `checkout.session.completed` handler inserts the per-child membership row and sets `fee_next_due_at = now + 1yr`.
- **Fee anniversary cron** (`/api/cron/membership-annual-fees`): for active memberships with `fee_next_due_at <= now`, create a Stripe invoice item (the fee Price) so it rides the next monthly invoice, then advance `fee_next_due_at` by 1 year. Idempotent per period.
- **Sibling discount:** at subscribe time, if the paying parent already has another active child membership in the org, apply a percent-off Stripe coupon (rate from org settings, default 10) to the new subscription. Policy: evaluated at signup, kept for the life of that subscription; no re-ranking if the full-price sibling later cancels.
- **Ledger:** new `invoice.paid` webhook handler writes a `payments` row (`payment_type: "membership"`, `membership_id`, amount, Stripe ids) for every subscription invoice — first and recurring — so the admin revenue report includes membership revenue. (Today month-2+ subscription revenue is invisible to reporting; this closes that gap before launch.)
- **Past-due:** Stripe dunning as today; webhook flips status. While `past_due`: auto-booking skips the child, dashboard card shows a fix-payment prompt. Recovery via existing `customer.subscription.updated` sync.

## Session materialization & consumption

- **Weekly cron** materializes the coming week's `drop_in_sessions` rows from active templates (`kind: "class"`, `audience: "youth"`, capacity/time from template, `class_slot_template_id` set), then auto-books each active enrollment into its home-slot session as a `member_allotment` booking — while the child has allotment remaining (unlimited always books).
- **Five-week months:** a 4-class package auto-books only while credits remain; the extra week is skipped by default and manually bookable at the member per-class session rate (existing `resolveRate` exhaustion path).
- **Cancel before cutoff (24h default):** booking cancelled → credit freed (count-based, so this is automatic). Inside the cutoff: booking stays counted. No-shows stay counted (existing statuses).
- **Make-up/extra booking:** parent books any eligible session (age range, capacity, allotment or member rate) from the dashboard or schedule.
- **Capacity races:** booking/enrollment inserts re-check capacity in a transaction with the relevant row locked — same pattern and same documented over-grant caveat as drop-in today (`allotment.ts:16-22`); acceptable at launch scale.

## Booking & signup UX

- **Public `/youth/classes`:** live schedule browser (filter sport/age/location) sourced from slot templates with spots-left; per-slot CTAs **Book a free trial** and **Join**; tier pricing cards (marketing name, tagline, price, package) replace the current figure-free placeholders. Youth emerald design system.
- **Trial-led:** slot card → auth (existing) → pick/add child (DOB validated against slot age range) → confirm → `trial` booking into the next materialized session, capacity-checked, one per child (code-enforced), confirmation email via Resend. Convert CTA (dashboard + follow-up email): tier picker with trial slot preselected as home slot → subscription checkout → webhook activates membership → enrollment created.
- **Pay-first:** pricing card → tier → pick/add child → Stripe checkout (fee + first month, sibling coupon auto-applied) → post-checkout "pick your home slot" step (age-filtered, live capacity) → enrollment. Bailing before slot selection leaves the membership active; the dashboard card shows a "Choose a home slot" prompt.
- **Parent dashboard, per child:** tier name, classes remaining this month (∞ for unlimited), home slot, next session, renewal date. Actions: book make-up/extra, cancel upcoming booking (cutoff rules above), change home slot (end + create enrollment, capacity-checked), cancel membership (existing cancel-at-period-end; already-booked sessions in the paid period stay valid; enrollment ends at period end). Pause is not in the parent UI for v1.
- **Waivers:** existing drop-in waiver gating — once per child at first booking of any kind.

## Member camp discount

In `src/lib/payments/create-checkout-for-registration.ts` (program row already in scope): if `program.programType === 'camp'`, look up an active membership **for the registered child** (`family_member_id` match — a sibling without their own membership gets no discount), read `camp_discount_pct`, apply to the early-bird-adjusted amount. If a typed code is present, apply the **single larger** discount, never both. Record in payment/session metadata (`member_discount_pct`, `member_discount_cents`); render as its own order-summary line ("Member discount −10%"). Guest checkout unaffected.

## Admin

- **`/admin/classes`:** slot template CRUD (name, location, age range, weekday/time, duration, capacity, active) + per-slot roster (enrolled children, this week's bookings incl. trials). Check-in remains on the existing kiosk.
- **Tier form:** extended with `annual_fee_cents`, `tagline`, and the class benefit fields; Stripe object management follows the existing create/archive/replace flow, extended to the one-time fee Price.
- **Org settings:** `sibling_discount_pct` (default 10).
- **Revenue report:** includes `payment_type = 'membership'` rows.

## Edge cases

- **Age-out:** age validated at enrollment/booking time only; no mid-enrollment eviction in v1.
- **Template deactivated / time changed:** future unmaterialized weeks follow the template; enrolled families are notified (email) and can change home slot. Materialized sessions with bookings are cancelled by admin explicitly, refunding credits automatically (count-based).
- **Trial for an already-member child:** blocked.
- **Cross-brand:** tiers, templates, and discounts are all org-scoped; SoccerOne memberships are untouched by the index split.

## Testing

- **Unit:** generalized allotment math (per-child, per-kind, calendar-month boundary), sibling-coupon eligibility, camp-discount larger-of selection, five-week-month auto-booking, fee-anniversary idempotency.
- **API:** subscribe → webhook → membership + enrollment lifecycle; trial one-per-child; booking cancel before/after cutoff frees/keeps credit; camp checkout with/without child membership and with a competing code; `invoice.paid` ledger write. Stripe-dependent fixtures use the `itWithStripe` gate for CI.
- **E2E (Playwright):** trial-led signup and pay-first signup happy paths; `waitForHydration` + click-driven interactions per repo convention. Note post-merge-only full runs: grep `tests/e2e/` for affected surfaces before merge.
- **Browser verification (owner requirement):** every phase is verified visually in a real browser as built — both signup flows, dashboard cards, admin surfaces, both brands where shared components are touched — and refined until the experience is high quality, not merely test-green. Tests and `tsc` alone do not close a phase.

## Out of scope (v1)

- Parent-facing pause UI (admin/Stripe only).
- Annual-interval package pricing (packages are monthly-only; the annual component is the $45 fee).
- Automatic sibling-discount re-ranking on cancellation.
- Mid-enrollment age eviction.
- Waitlists for full slots.
- Migrating existing seasons-based class content/SEO pages beyond the schedule/pricing sections described above.
