# Walk-In Pricing Enforcement — Design

**Date:** 2026-06-18
**Status:** Approved (design)
**Author:** brainstormed with founder

## Goal

Charge a distinct, higher **walk-in** price for drop-in sessions booked in person, and enforce it in software at the two in-person entry points (the self-service kiosk and the staffed venue-manager desk). Today both in-person flows charge the same online session rate — there is no walk-in price in the system. Default walk-in price is **$17** (vs. $15 online / $12 member).

This is the follow-up carved out of the adult/youth sitemap redesign (the pickup page's pricing band currently shows $17 as display copy via `WALK_IN_RATE_CENTS`). Once this ships, that figure becomes real, enforced data.

## Decisions (locked during brainstorm)

- **Kiosk charges the walk-up rate to everyone** — the self-service kiosk does **not** look up membership. Members get their discount only via the staffed venue-manager desk or by booking online. (Simpler kiosk change; the kiosk is quick guest pay.)
- **Per-session override** — a session can override the org's default walk-up rate, mirroring the existing `session_rate_cents` / `member_rate_cents` overrides.
- **$17 is base + card surcharge** at the kiosk — the existing kiosk card surcharge stays on top of the walk-up base, so a kiosk walk-in costs more than booking online (the point of the feature). The staffed terminal flow (card-present, no surcharge today) charges the walk-up base flat — unchanged surcharge behavior.
- **Members keep their rate on every channel that knows them** — online and the staffed desk both honor membership; only the non-member branch gets the walk-up price.

## Data model (additive migration)

- `drop_in_rate_card.default_walk_up_rate_cents` — `integer NOT NULL DEFAULT 1700` (org default, $17).
- `drop_in_sessions.walk_up_rate_cents` — `integer` NULL (per-session override; mirrors `session_rate_cents`).
- Generated via `npm run db:generate`; the generated SQL is made **idempotent** (`ADD COLUMN IF NOT EXISTS`) per the repo's drift-safe migration convention (see `0023`/`0024`). Additive and forward-compatible — no backfill needed; the default covers existing rows. Ships via `migrate-prod.yml` on merge to `main`.

## Pricing logic

### `resolveRate` (`src/lib/dropin/pricing.ts`)

Add an **optional** trailing parameter `source: "online_booking" | "walk_up" = "online_booking"`. `resolveRate` has 8 callers; defaulting to `"online_booking"` means every existing online caller is unchanged — only walk-up callers pass `"walk_up"`.

- Extend `RateCard` with `defaultWalkUpRateCents: number` and `SessionRateOverrides` with `walkUpRateCents: number | null`.
- Compute `walkUpRate = session.walkUpRateCents ?? rateCard.defaultWalkUpRateCents`.
- **Only the no-user / no-membership branch changes:** the amount becomes `source === "walk_up" ? walkUpRate : sessionRate`. Everything else (unlimited tier → free, allotment remaining → free, member-rate fallback) is untouched, so members pay member pricing on every channel.
- `paymentMethod` semantics are unchanged — `resolveRate` keeps returning the same method it does today; the callers set the actual Stripe `payment_method_types`. (The pre-existing card_online-vs-card_present labeling nuance is out of scope.)

### Venue-manager desk (`src/pages/api/admin/dropin/sessions/[id]/walk-up.ts`)

Already calls `resolveRate(session, user, membership, rateCard)` with the real user + membership. Change: pass `source: "walk_up"`. Non-members now pay the walk-up rate; members keep member rate / allotment / unlimited. Surcharge behavior unchanged (no surcharge added today on the card-present terminal charge).

### Kiosk (`src/pages/api/kiosk/[locationSlug]/walkin/start.ts` + `.../walkin/payment.ts`)

Both currently compute the amount directly as `sessionRateCents ?? defaultSessionRateCents`. Replace that computation in **both** files with `resolveRate(session, null, null, rateCard, "walk_up").amountCents` (no membership → always the walk-up rate). Requirements:
- Add `walkUpRateCents` to the session column selection in each file, and ensure the loaded rate card carries `defaultWalkUpRateCents` (it does once the column exists; `select()` / explicit select must include it).
- `start` stores `amountDueCents` and `payment` builds the PaymentIntent from the **same** resolution, so they cannot drift.
- The existing `computeSurchargeCents(amount, "card")` stays on top in `payment.ts` → $17 base + surcharge.

## Admin surfaces

- **Rate card:** add `defaultWalkUpRateCents` to `RateCardPutBody` + `validateRateCardPut` (non-negative finite int, same loop as the other rates) in `src/lib/dropin/validators.ts`; handle it in the `rate-card.ts` PUT updates; add a labeled number input + "$X.XX" helper to `RateCardEditor.tsx` (and the `RateCard` interface there). GET already returns the column via `select()`.
- **Per-session override:** add `walkUpRateCents?: number | null` to the create body (`sessions/index.ts`) and update body (`sessions/[id].ts`), persisting it the same way as `sessionRateCents` (`?? null` on insert; conditional on update). Add a `walkUpRateCents` field to `SessionForm.tsx` next to the existing rate overrides (string state, parsed to number-or-undefined on submit, hydrated from `s.walkUpRateCents` on edit).

## Testing

- **Unit (`tests/unit`)** — `resolveRate` matrix:
  - non-member + `online_booking` (default) → session rate
  - non-member + `walk_up` → walk-up rate
  - member (unlimited / allotment>0 / allotment exhausted) → free / free / member rate, **regardless of `source`**
  - per-session `walkUpRateCents` overrides the org `defaultWalkUpRateCents`
  - omitting `source` behaves as `online_booking` (back-compat)
- **API (`tests/api`)** — rate-card PUT accepts and validates `defaultWalkUpRateCents` (rejects negative); session create persists `walkUpRateCents`.

## Out of scope

- Membership awareness at the kiosk (explicitly decided against).
- Changing the card-present surcharge policy on the staffed terminal flow.
- Reconciling the pre-existing `paymentMethod` card_online/card_present labeling on walk-up bookings.
- A `pending_payment` booking enum value (noted as a separate follow-up in `walkin/start.ts`).

## Success criteria

- A non-member walk-in (kiosk or staffed desk) is charged the walk-up rate (per-session override else org default), not the online rate.
- A member at the staffed desk still pays member rate / allotment / unlimited; online pricing is completely unchanged for all users.
- Admins can set the org default walk-up rate and a per-session override.
- `npm run db:generate` migration is idempotent and additive; `npx tsc --noEmit` clean; unit + API tests green.
- The pickup pricing band's walk-in figure can later be sourced from real data (no longer just `WALK_IN_RATE_CENTS` copy).
